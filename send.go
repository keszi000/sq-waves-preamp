package main

import (
	"encoding/hex"
	"fmt"
	"log"
	"net"
	"os"
)

// LogTXPreamp writes one human-readable line per command sent to the mixer.
func LogTXPreamp(bus string, preampId int, kind, value string) {
	busLabel := "local"
	if bus == "slink" {
		busLabel = "S-Link"
	}
	log.Printf("sqapi: TX %s preamp %d %s %s", busLabel, preampId, kind, value)
}

func sendToSQ(addr string, payload []byte) error {
	if os.Getenv("SQ_DEBUG") == "1" {
		log.Printf("sqapi: TX %s %s", addr, hex.EncodeToString(payload))
	}
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		return fmt.Errorf("dial %s: %w", addr, err)
	}
	defer conn.Close()
	_, err = conn.Write(payload)
	if err != nil {
		return fmt.Errorf("write: %w", err)
	}
	return nil
}
