package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// syncStatus holds progress and result of the background sync.
var (
	syncMu         sync.Mutex
	syncStatus     string      // "idle" | "running"
	syncCurrent    int         // 0-based index of current channel
	syncTotal      int         // total channels
	syncLastResult *syncResult // set when status becomes "idle"
)

type syncResult struct {
	Synced int    `json:"synced,omitempty"`
	Error  string `json:"error,omitempty"`
}

func handleGetConfig(c *gin.Context) {
	sqip, dataDirOut, err := LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"sq_ip": sqip, "data_dir": dataDirOut})
}

func handlePostConfig(c *gin.Context) {
	var body struct {
		SQIP    string `json:"sq_ip"`
		DataDir string `json:"data_dir"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	dir := strings.TrimSpace(body.DataDir)
	if err := SaveConfig(strings.TrimSpace(body.SQIP), dir); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// Reload state from (possibly new) data dir
	if err := LoadState(); err != nil {
		log.Printf("sqapi: reload state after config save: %v", err)
	}
	c.JSON(http.StatusOK, gin.H{"sq_ip": strings.TrimSpace(body.SQIP), "data_dir": GetDataDir()})
}

func handleGetState(c *gin.Context) {
	sqip, _, _ := LoadConfig()
	channels := GetState()
	currentShow := GetCurrentShow()
	c.JSON(http.StatusOK, gin.H{"channels": channels, "sq_ip": sqip, "current_show": currentShow, "line_preamp_ids": localLinePreampIDs})
}

func handlePostState(c *gin.Context) {
	var body struct {
		Channels    []ChannelState `json:"channels"`
		SqIP        string         `json:"sq_ip"`
		CurrentShow *string        `json:"current_show"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.Channels == nil {
		body.Channels = []ChannelState{}
	}
	channels, err := normalizeAndValidateChannels(body.Channels)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.CurrentShow != nil {
		if err := SetCurrentShow(*body.CurrentShow); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	if err := SetState(channels); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if body.SqIP != "" {
		_ = SaveConfig(strings.TrimSpace(body.SqIP), "")
	}
	c.JSON(http.StatusOK, gin.H{"channels": GetState(), "current_show": GetCurrentShow(), "line_preamp_ids": localLinePreampIDs})
}

func handleResetState(c *gin.Context) {
	if err := ResetState(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"channels": []ChannelState{}, "current_show": ""})
}

// handlePostSync starts syncing the full backend state to the mixer in the background; returns 202 immediately.
func handlePostSync(getAddr func(*gin.Context) (string, bool)) gin.HandlerFunc {
	return func(c *gin.Context) {
		addr, ok := getAddr(c)
		if !ok {
			return
		}
		channels := GetState()
		syncMu.Lock()
		if syncStatus == "running" {
			syncMu.Unlock()
			c.JSON(http.StatusConflict, gin.H{"error": "sync already in progress"})
			return
		}
		syncTotal = 0
		for _, ch := range channels {
			if ch.PreampBus == "local" && isLocalLinePreamp(ch.PreampId) {
				// left is line; only count right if stereo and not line
				if ch.PreampIdR != 0 && !isLocalLinePreamp(ch.PreampIdR) {
					syncTotal++
				}
				continue
			}
			syncTotal++
			if ch.PreampIdR != 0 {
				if ch.PreampBus != "local" || !isLocalLinePreamp(ch.PreampIdR) {
					syncTotal++
				}
			}
		}
		syncStatus = "running"
		syncCurrent = 0
		syncLastResult = nil
		syncMu.Unlock()

		go runSyncInBackground(addr, channels)
		c.JSON(http.StatusAccepted, gin.H{"started": true})
	}
}

func runSyncInBackground(addr string, channels []ChannelState) {
	defer func() {
		syncMu.Lock()
		syncStatus = "idle"
		syncMu.Unlock()
	}()

	sent := 0
	for _, ch := range channels {
		bus := ch.PreampBus
		if bus != "local" && bus != "slink" {
			bus = "local"
		}
		// Collect preamp IDs to send (1 or 2 for stereo); skip local line
		ids := []int{ch.PreampId}
		if ch.PreampIdR != 0 && ch.PreampIdR != ch.PreampId {
			ids = append(ids, ch.PreampIdR)
		}
		for _, id := range ids {
			if bus == "local" && isLocalLinePreamp(id) {
				continue
			}
			syncMu.Lock()
			syncCurrent = sent
			syncMu.Unlock()

			var phantomPkt, padPkt, gainPkt []byte
			if bus == "slink" {
				phantomPkt = buildPhantomSLink(id, ch.Phantom)
				padPkt = buildPadSLink(id, ch.Pad)
				gainPkt = buildGainSLink(id, ch.Gain)
			} else {
				phantomPkt = buildPhantom(id, ch.Phantom)
				padPkt = buildPad(id, ch.Pad)
				gainPkt = buildGain(id, ch.Gain)
			}
			if err := sendToSQ(addr, phantomPkt); err != nil {
				setSyncResultError(err.Error())
				return
			}
			LogTXPreamp(bus, id, "phantom", boolToOnOff(ch.Phantom))
			if err := sendToSQ(addr, padPkt); err != nil {
				setSyncResultError(err.Error())
				return
			}
			LogTXPreamp(bus, id, "pad", boolToOnOff(ch.Pad))
			if err := sendToSQ(addr, gainPkt); err != nil {
				setSyncResultError(err.Error())
				return
			}
			LogTXPreamp(bus, id, "gain", fmt.Sprintf("%.0f dB", ch.Gain))
			time.Sleep(40 * time.Millisecond)
			sent++
		}
	}

	syncMu.Lock()
	syncLastResult = &syncResult{Synced: sent}
	syncMu.Unlock()
}

func setSyncResultError(msg string) {
	syncMu.Lock()
	syncLastResult = &syncResult{Error: msg}
	syncMu.Unlock()
}

func boolToOnOff(on bool) string {
	if on {
		return "on"
	}
	return "off"
}

func handleGetSyncStatus(c *gin.Context) {
	syncMu.Lock()
	defer syncMu.Unlock()
	out := gin.H{"status": syncStatus, "current": syncCurrent, "total": syncTotal}
	if syncLastResult != nil {
		out["last_result"] = syncLastResult
	}
	c.JSON(http.StatusOK, out)
}

func handleGetShows(c *gin.Context) {
	names, err := ListShows()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"shows": names})
}

func handleGetShow(c *gin.Context) {
	b, err := GetShow(c.Param("name"))
	if err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "show not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Data(http.StatusOK, "application/json", b)
}

func handlePostShow(c *gin.Context) {
	var body struct {
		Name       string        `json:"name"`
		Channels   []interface{} `json:"channels"`
		SqIP       string        `json:"sq_ip"`
		SetCurrent *bool         `json:"set_current"` // if false, do not set as current show (e.g. import from file)
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	name := sanitizeShowName(body.Name)
	if name == "" {
		name = "show"
	}
	// Persist under sanitized name so client-supplied name cannot affect stored filename.
	body.Name = name
	b, _ := json.MarshalIndent(body, "", "  ")
	if err := SaveShow(name, b); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if body.SetCurrent == nil || *body.SetCurrent {
		_ = SetCurrentShow(name)
	}
	c.JSON(http.StatusOK, gin.H{"name": name})
}

func handleDeleteShow(c *gin.Context) {
	name := c.Param("name")
	if err := DeleteShow(name); err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "show not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if GetCurrentShow() == name {
		_ = SetCurrentShow("")
	}
	c.Status(http.StatusNoContent)
}

// Local preamp 18–21 are stereo line inputs (ST1 L, ST1 R, ST2 L, ST2 R): no phantom/pad/gain, never send to SQ.
var localLinePreampIDs = []int{18, 19, 20, 21}

func isLocalLinePreamp(preampId int) bool {
	for _, id := range localLinePreampIDs {
		if id == preampId {
			return true
		}
	}
	return false
}

func makeGetAddr(sqPort string) func(*gin.Context) (string, bool) {
	return func(c *gin.Context) (string, bool) {
		ip, _, _ := LoadConfig()
		if ip == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "SQ IP not set: save on the frontend"})
			return "", false
		}
		return strings.TrimSpace(ip) + ":" + sqPort, true
	}
}

// runPreampBool sends a single phantom or pad command to the mixer (one packet), then updates backend state only.
func runPreampBool(c *gin.Context, getAddr func(*gin.Context) (string, bool), bus string, parseID func(*gin.Context, string) (int, bool), buildFn func(int, bool) []byte, key string) {
	preamp, ok := parseID(c, c.Param("id"))
	if !ok {
		return
	}
	if bus == "local" && isLocalLinePreamp(preamp) {
		on := c.Query("on") == "true" || c.Query("on") == "1"
		c.JSON(http.StatusOK, gin.H{"preamp": preamp, key: on})
		return
	}
	addr, ok := getAddr(c)
	if !ok {
		return
	}
	on := c.Query("on") == "true" || c.Query("on") == "1"
	if err := sendToSQ(addr, buildFn(preamp, on)); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	val := "off"
	if on {
		val = "on"
	}
	LogTXPreamp(bus, preamp, key, val)
	if key == "phantom" {
		UpdatePhantom(bus, preamp, on)
	} else {
		UpdatePad(bus, preamp, on)
	}
	c.JSON(http.StatusOK, gin.H{"preamp": preamp, key: on})
}

// runPreampGain sends a single gain command to the mixer (one packet), then updates backend state only.
func runPreampGain(c *gin.Context, getAddr func(*gin.Context) (string, bool), bus string, parseID func(*gin.Context, string) (int, bool), buildFn func(int, float64) []byte) {
	preamp, ok := parseID(c, c.Param("id"))
	if !ok {
		return
	}
	if bus == "local" && isLocalLinePreamp(preamp) {
		c.JSON(http.StatusOK, gin.H{"preamp": preamp, "gain_db": 0})
		return
	}
	addr, ok := getAddr(c)
	if !ok {
		return
	}
	db, ok := parseGainDB(c)
	if !ok {
		return
	}
	if err := sendToSQ(addr, buildFn(preamp, db)); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	LogTXPreamp(bus, preamp, "gain", fmt.Sprintf("%.0f dB", db))
	UpdateGain(bus, preamp, db)
	c.JSON(http.StatusOK, gin.H{"preamp": preamp, "gain_db": db})
}

func parseLocalPreampID(c *gin.Context, id string) (int, bool) {
	n, err := strconv.Atoi(id)
	if err != nil || n < 1 || n > 21 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "local preamp must be 1–17 (input/talkback) or 18–21 (stereo line)"})
		return 0, false
	}
	return n, true
}

func parseSLinkPreampID(c *gin.Context, id string) (int, bool) {
	n, err := strconv.Atoi(id)
	if err != nil || n < 1 || n > 40 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "S-Link preamp must be 1–40"})
		return 0, false
	}
	return n, true
}

func parseGainDB(c *gin.Context) (float64, bool) {
	var body struct {
		DB float64 `json:"db"`
	}
	if c.ContentType() == "application/json" {
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json, need {\"db\": 0..60}"})
			return 0, false
		}
	} else {
		dbStr := c.PostForm("db")
		if dbStr == "" {
			dbStr = c.Query("db")
		}
		if dbStr == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing db (0..60), query ?db=12 or JSON {\"db\": 12}"})
			return 0, false
		}
		var err error
		body.DB, err = strconv.ParseFloat(dbStr, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "db must be number 0..60"})
			return 0, false
		}
	}
	if body.DB < 0 || body.DB > 60 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "db must be 0..60"})
		return 0, false
	}
	return body.DB, true
}

func normalizeAndValidateChannels(in []ChannelState) ([]ChannelState, error) {
	if len(in) == 0 {
		return in, nil
	}
	out := make([]ChannelState, len(in))
	copy(out, in)
	for i := range out {
		c := &out[i]
		if c.PreampBus == "" {
			c.PreampBus = "local"
		}
		switch c.PreampBus {
		case "local":
			if c.PreampId < 1 || c.PreampId > 21 {
				return nil, fmt.Errorf("channel %d: local preampId must be 1-21", c.ID)
			}
			if c.PreampIdR != 0 && (c.PreampIdR < 1 || c.PreampIdR > 21) {
				return nil, fmt.Errorf("channel %d: local preampIdR must be 1-21", c.ID)
			}
		case "slink":
			if c.PreampId < 1 || c.PreampId > 40 {
				return nil, fmt.Errorf("channel %d: slink preampId must be 1-40", c.ID)
			}
			if c.PreampIdR != 0 && (c.PreampIdR < 1 || c.PreampIdR > 40) {
				return nil, fmt.Errorf("channel %d: slink preampIdR must be 1-40", c.ID)
			}
		default:
			return nil, fmt.Errorf("channel %d: invalid preampBus %q (expected local or slink)", c.ID, c.PreampBus)
		}
	}
	return out, nil
}
