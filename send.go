package main

import (
	"encoding/hex"
	"fmt"
	"log"
	"net"
	"os"
)

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
