package main

import (
	"math"
)

// SQ preamp TCP 51326: F7 0C 0C [subtype] [ch0] 01 [v1] [v2]
// ch0: 0-based SQ index. Local preamp 1–16 → 0–15, 17 (talkback) → 58.
// subtype 0x0C=gain, 0x0D=phantom, 0x0E=pad.

const (
	gainRaw0dB  uint16 = 0x0080
	gainRaw60dB uint16 = 0x00BC
)

// localPreampToSQCh: local preamp 1–16 → 0–15, 17 (talkback) → 58.
func localPreampToSQCh(localPreamp int) byte {
	if localPreamp == 17 {
		return 58
	}
	return byte(localPreamp - 1)
}

func buildPhantom(localPreamp int, on bool) []byte {
	ch0 := localPreampToSQCh(localPreamp)
	v := byte(0)
	if on {
		v = 1
	}
	return []byte{0xF7, 0x0C, 0x0C, 0x0D, ch0, 0x01, v, 0x00}
}

func buildPad(localPreamp int, on bool) []byte {
	ch0 := localPreampToSQCh(localPreamp)
	v := byte(0)
	if on {
		v = 1
	}
	return []byte{0xF7, 0x0C, 0x0C, 0x0E, ch0, 0x01, v, 0x00}
}

func buildGain(localPreamp int, dB float64) []byte {
	if dB < 0 {
		dB = 0
	}
	if dB > 60 {
		dB = 60
	}
	raw := float64(gainRaw0dB) + (dB/60)*float64(int(gainRaw60dB)-int(gainRaw0dB))
	v := uint16(math.Round(raw))
	if v < gainRaw0dB {
		v = gainRaw0dB
	}
	if v > gainRaw60dB {
		v = gainRaw60dB
	}
	ch0 := localPreampToSQCh(localPreamp)
	return []byte{0xF7, 0x0C, 0x0C, 0x0C, ch0, 0x01, byte(v>>8), byte(v)}
}
