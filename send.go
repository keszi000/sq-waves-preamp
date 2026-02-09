package main

import (
	"fmt"
	"log"
	"net"
	"time"
)

// LogTXPreamp writes one human-readable line per command sent to the mixer.
func LogTXPreamp(bus string, preampId int, kind, value string) {
	busLabel := "local"
	if bus == "slink" {
		busLabel = "S-Link"
	}
	log.Printf("sqapi: TX %s preamp %d %s %s", busLabel, preampId, kind, value)
}

const sqTimeout = 3 * time.Second

func sendToSQ(addr string, payload []byte) error {
	conn, err := net.DialTimeout("tcp", addr, sqTimeout)
	if err != nil {
		return fmt.Errorf("dial %s: %w", addr, err)
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(sqTimeout))
	_, err = conn.Write(payload)
	if err != nil {
		return fmt.Errorf("write: %w", err)
	}
	return nil
}
