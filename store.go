package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var dataDir = "data"

func init() {
	if d := os.Getenv("DATA_DIR"); d != "" {
		dataDir = d
	}
}

type config struct {
	SQIP string `json:"sq_ip"`
}

func configPath() string { return filepath.Join(dataDir, "config.json") }
func showsDir() string   { return filepath.Join(dataDir, "shows") }

func ensureDataDir() error {
	if err := os.MkdirAll(showsDir(), 0755); err != nil {
		return err
	}
	return nil
}

func LoadConfig() (string, error) {
	if err := ensureDataDir(); err != nil {
		return "", err
	}
	b, err := os.ReadFile(configPath())
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	var c config
	if err := json.Unmarshal(b, &c); err != nil {
		return "", err
	}
	return strings.TrimSpace(c.SQIP), nil
}

func SaveConfig(sqip string) error {
	if err := ensureDataDir(); err != nil {
		return err
	}
	c := config{SQIP: strings.TrimSpace(sqip)}
	b, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(configPath(), b, 0644)
}

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
