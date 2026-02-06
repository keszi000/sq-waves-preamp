package main

import (
	"encoding/json"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

func handleGetConfig(c *gin.Context) {
	sqip, err := LoadConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"sq_ip": sqip})
}

func handlePostConfig(c *gin.Context) {
	var body struct {
		SQIP string `json:"sq_ip"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := SaveConfig(body.SQIP); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"sq_ip": strings.TrimSpace(body.SQIP)})
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
		Name  string        `json:"name"`
		Cubes []interface{} `json:"cubes"`
		SqIP  string        `json:"sq_ip"`
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
	c.JSON(http.StatusOK, gin.H{"name": name})
}

func makeGetAddr(sqPort string) func(*gin.Context) (string, bool) {
	defaultSQIP := os.Getenv("SQ_IP")
	return func(c *gin.Context) (string, bool) {
		ip, _ := LoadConfig()
		if ip == "" {
			ip = defaultSQIP
		}
		if ip == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "SQ IP nincs beállítva: állítsd SQ_IP env-et vagy mentsd a frontenden"})
			return "", false
		}
		return strings.TrimSpace(ip) + ":" + sqPort, true
	}
}

func runPreampBool(c *gin.Context, getAddr func(*gin.Context) (string, bool), parseID func(*gin.Context, string) (int, bool), buildFn func(int, bool) []byte, key string) {
	addr, ok := getAddr(c)
	if !ok {
		return
	}
	preamp, ok := parseID(c, c.Param("id"))
	if !ok {
		return
	}
	on := c.Query("on") == "true" || c.Query("on") == "1"
	if err := sendToSQ(addr, buildFn(preamp, on)); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"preamp": preamp, key: on})
}

func runPreampGain(c *gin.Context, getAddr func(*gin.Context) (string, bool), parseID func(*gin.Context, string) (int, bool), buildFn func(int, float64) []byte) {
	addr, ok := getAddr(c)
	if !ok {
		return
	}
	preamp, ok := parseID(c, c.Param("id"))
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
	c.JSON(http.StatusOK, gin.H{"preamp": preamp, "gain_db": db})
}

func parseLocalPreampID(c *gin.Context, id string) (int, bool) {
	n, err := strconv.Atoi(id)
	if err != nil || n < 1 || n > 17 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "local preamp must be 1–16 (input) or 17 (talkback)"})
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
