package main

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type ChannelState struct {
	ID        int     `json:"id"`
	Name      string  `json:"name"`
	PreampBus string  `json:"preampBus"`
	PreampId  int     `json:"preampId"`
	Phantom   bool    `json:"phantom"`
	Pad       bool    `json:"pad"`
	Gain      float64 `json:"gain"`
}

// stateFile is the persisted format (state.json). Backward compatible: LoadState also accepts legacy array-only JSON.
type stateFile struct {
	Channels    []ChannelState `json:"channels"`
	CurrentShow string         `json:"current_show"`
}

var (
	stateMu         sync.RWMutex
	stateChans      []ChannelState
	stateCurrentShow string
)

func statePath() string { return filepath.Join(dataDir, "state.json") }

func LoadState() error {
	stateMu.Lock()
	defer stateMu.Unlock()
	if err := ensureDataDir(); err != nil {
		return err
	}
	b, err := os.ReadFile(statePath())
	if err != nil {
		if os.IsNotExist(err) {
			stateChans = nil
			stateCurrentShow = ""
			return nil
		}
		return err
	}
	var file stateFile
	if err := json.Unmarshal(b, &file); err != nil {
		var list []ChannelState
		if err2 := json.Unmarshal(b, &list); err2 != nil {
			return err
		}
		stateChans = list
		stateCurrentShow = ""
		return nil
	}
	stateChans = file.Channels
	if stateChans == nil {
		stateChans = []ChannelState{}
	}
	stateCurrentShow = file.CurrentShow
	return nil
}

const saveStateRetries = 3
const saveStateBackoff = 50 * time.Millisecond

func saveStateLocked() error {
	if err := ensureDataDir(); err != nil {
		return err
	}
	file := stateFile{Channels: stateChans, CurrentShow: stateCurrentShow}
	b, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	path := statePath()
	for attempt := 0; attempt < saveStateRetries; attempt++ {
		if err := os.WriteFile(path, b, 0644); err == nil {
			return nil
		} else if attempt == saveStateRetries-1 {
			log.Printf("sqapi: save state failed after %d attempts: %v", saveStateRetries, err)
			return err
		}
		time.Sleep(saveStateBackoff)
	}
	return nil
}

func GetState() []ChannelState {
	stateMu.RLock()
	defer stateMu.RUnlock()
	if len(stateChans) == 0 {
		return nil
	}
	out := make([]ChannelState, len(stateChans))
	copy(out, stateChans)
	return out
}

func SetState(channels []ChannelState) error {
	stateMu.Lock()
	defer stateMu.Unlock()
	stateChans = channels
	return saveStateLocked()
}

// ResetState clears state.json: empty channel list and current show. Used by config "Reset state".
func ResetState() error {
	stateMu.Lock()
	defer stateMu.Unlock()
	stateChans = []ChannelState{}
	stateCurrentShow = ""
	return saveStateLocked()
}

func GetCurrentShow() string {
	stateMu.RLock()
	defer stateMu.RUnlock()
	return stateCurrentShow
}

func SetCurrentShow(show string) error {
	stateMu.Lock()
	defer stateMu.Unlock()
	stateCurrentShow = show
	return saveStateLocked()
}

func UpdatePhantom(bus string, preampId int, on bool) {
	stateMu.Lock()
	defer stateMu.Unlock()
	for i := range stateChans {
		if stateChans[i].PreampBus == bus && stateChans[i].PreampId == preampId {
			stateChans[i].Phantom = on
		}
	}
	_ = saveStateLocked()
}

func UpdatePad(bus string, preampId int, on bool) {
	stateMu.Lock()
	defer stateMu.Unlock()
	for i := range stateChans {
		if stateChans[i].PreampBus == bus && stateChans[i].PreampId == preampId {
			stateChans[i].Pad = on
		}
	}
	_ = saveStateLocked()
}

func UpdateGain(bus string, preampId int, db float64) {
	stateMu.Lock()
	defer stateMu.Unlock()
	for i := range stateChans {
		if stateChans[i].PreampBus == bus && stateChans[i].PreampId == preampId {
			stateChans[i].Gain = db
		}
	}
	_ = saveStateLocked()
}
