package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
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

var (
	stateMu    sync.RWMutex
	stateChans []ChannelState
)

func statePath() string { return filepath.Join(dataDir, "state.json") }

func ensureStateFile() error {
	if err := ensureDataDir(); err != nil {
		return err
	}
	return nil
}

func LoadState() error {
	stateMu.Lock()
	defer stateMu.Unlock()
	if err := ensureStateFile(); err != nil {
		return err
	}
	b, err := os.ReadFile(statePath())
	if err != nil {
		if os.IsNotExist(err) {
			stateChans = nil
			return nil
		}
		return err
	}
	var list []ChannelState
	if err := json.Unmarshal(b, &list); err != nil {
		return err
	}
	stateChans = list
	return nil
}

func saveStateLocked() error {
	if err := ensureStateFile(); err != nil {
		return err
	}
	b, err := json.MarshalIndent(stateChans, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(statePath(), b, 0644)
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

func nextStateID() int {
	max := 0
	for _, c := range stateChans {
		if c.ID > max {
			max = c.ID
		}
	}
	return max + 1
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
