package main

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

const defaultDataDir = "data"

var dataDir = defaultDataDir

type config struct {
	SQIP    string `json:"sq_ip"`
	DataDir string `json:"data_dir"`
}

// configPath returns the fixed config file path (independent of dataDir).
func configPath() string { return "config.json" }
func showsDir() string   { return filepath.Join(dataDir, "shows") }

func ensureDataDir() error {
	if err := os.MkdirAll(showsDir(), 0755); err != nil {
		return err
	}
	return nil
}

func LoadConfig() (sqip string, dataDirOut string, err error) {
	cfgPath := configPath()
	b, err := os.ReadFile(cfgPath)
	if err != nil {
		if os.IsNotExist(err) {
			// Migrate from legacy data/config.json if present
			legacy := filepath.Join(defaultDataDir, "config.json")
			if leg, e := os.ReadFile(legacy); e == nil {
				var c config
				if json.Unmarshal(leg, &c) == nil {
					dataDir = defaultDataDir
					_ = writeConfigLocked(strings.TrimSpace(c.SQIP), defaultDataDir)
					return strings.TrimSpace(c.SQIP), defaultDataDir, nil
				}
			}
			dataDir = defaultDataDir
			_ = writeConfigLocked("", defaultDataDir)
			return "", defaultDataDir, nil
		}
		return "", "", err
	}
	var c config
	if err := json.Unmarshal(b, &c); err != nil {
		return "", "", err
	}
	dataDir = strings.TrimSpace(c.DataDir)
	if dataDir == "" {
		dataDir = defaultDataDir
	}
	return strings.TrimSpace(c.SQIP), dataDir, nil
}

func writeConfigLocked(sqip, dir string) error {
	if dir == "" {
		dir = defaultDataDir
	}
	c := config{SQIP: strings.TrimSpace(sqip), DataDir: dir}
	b, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(configPath(), b, 0644)
}

func SaveConfig(sqip, dir string) error {
	if dir != "" {
		dataDir = dir
	}
	if err := writeConfigLocked(sqip, dataDir); err != nil {
		return err
	}
	if sqip != "" {
		log.Printf("sqapi: SQ IP %s", sqip)
	} else {
		log.Printf("sqapi: SQ IP (not set)")
	}
	return nil
}

func GetDataDir() string { return dataDir }

var safeNameRe = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

func sanitizeShowName(name string) string {
	s := strings.TrimSpace(name)
	if s == "" {
		return "show"
	}
	s = regexp.MustCompile(`[^a-zA-Z0-9_-]`).ReplaceAllString(s, "_")
	if len(s) > 64 {
		s = s[:64]
	}
	return s
}

func ListShows() ([]string, error) {
	if err := ensureDataDir(); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(showsDir())
	if err != nil {
		return nil, err
	}
	var names []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if strings.HasSuffix(e.Name(), ".json") {
			names = append(names, strings.TrimSuffix(e.Name(), ".json"))
		}
	}
	return names, nil
}

func GetShow(name string) ([]byte, error) {
	if !safeNameRe.MatchString(name) {
		return nil, os.ErrNotExist
	}
	return os.ReadFile(filepath.Join(showsDir(), name+".json"))
}

func SaveShow(name string, body []byte) error {
	if err := ensureDataDir(); err != nil {
		return err
	}
	name = sanitizeShowName(name)
	if name == "" {
		name = "show"
	}
	return os.WriteFile(filepath.Join(showsDir(), name+".json"), body, 0644)
}

func DeleteShow(name string) error {
	if !safeNameRe.MatchString(name) {
		return os.ErrNotExist
	}
	return os.Remove(filepath.Join(showsDir(), name+".json"))
}
