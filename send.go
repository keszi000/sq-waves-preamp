package main

import (
	"fmt"
	"net"
)

func sendToSQ(addr string, payload []byte) error {
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
