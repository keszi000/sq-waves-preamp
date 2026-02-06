package main

import "math"

// Packet format (TCP 51326): F7 0C 0C [subtype] [ch] [block] [v1] [v2]
// Only these ranges are sent to the mixer: local 1–16 + 17 (talkback), S-Link 1–40, gain 0–60.

const (
	gainRaw0dB  uint16 = 0x0080
	gainRaw60dB uint16 = 0x00BC
)

const (
	blockLocal     = 0x01
	blockSLink     = 0x02
	subtypeGain    = 0x0C
	subtypePhantom = 0x0D
	subtypePad     = 0x0E
)

const (
	localPreampMin, localPreampMax = 1, 17   // 1–16 input, 17 talkback
	slinkPreampMin, slinkPreampMax  = 1, 40
	gainDBMin, gainDBMax            = 0, 60
)

func clampLocal(id int) int {
	if id < localPreampMin {
		return localPreampMin
	}
	if id > localPreampMax {
		return localPreampMax
	}
	return id
}

func clampSLink(id int) int {
	if id < slinkPreampMin {
		return slinkPreampMin
	}
	if id > slinkPreampMax {
		return slinkPreampMax
	}
	return id
}

func localPreampToCh(localPreamp int) byte {
	id := clampLocal(localPreamp)
	if id == 17 {
		return 58 // talkback
	}
	return byte(id - 1)
}

func slinkPreampToCh(slinkPreamp int) byte {
	return byte(clampSLink(slinkPreamp) - 1)
}

func buildPhantomCh(ch byte, block byte, on bool) []byte {
	v := byte(0)
	if on {
		v = 1
	}
	return []byte{0xF7, 0x0C, 0x0C, subtypePhantom, ch, block, v, 0x00}
}

func buildPadCh(ch byte, block byte, on bool) []byte {
	v := byte(0)
	if on {
		v = 1
	}
	return []byte{0xF7, 0x0C, 0x0C, subtypePad, ch, block, v, 0x00}
}

func buildGainCh(ch byte, block byte, dB float64) []byte {
	if dB < gainDBMin {
		dB = gainDBMin
	}
	if dB > gainDBMax {
		dB = gainDBMax
	}
	raw := float64(gainRaw0dB) + (dB/60)*float64(int(gainRaw60dB)-int(gainRaw0dB))
	v := uint16(math.Round(raw))
	if v < gainRaw0dB {
		v = gainRaw0dB
	}
	if v > gainRaw60dB {
		v = gainRaw60dB
	}
	return []byte{0xF7, 0x0C, 0x0C, subtypeGain, ch, block, byte(v>>8), byte(v)}
}

func buildPhantom(localPreamp int, on bool) []byte {
	return buildPhantomCh(localPreampToCh(localPreamp), blockLocal, on)
}

func buildPad(localPreamp int, on bool) []byte {
	return buildPadCh(localPreampToCh(localPreamp), blockLocal, on)
}

func buildGain(localPreamp int, dB float64) []byte {
	return buildGainCh(localPreampToCh(localPreamp), blockLocal, dB)
}

// S-Link preamps 1–40
func buildPhantomSLink(slinkPreamp int, on bool) []byte {
	return buildPhantomCh(slinkPreampToCh(slinkPreamp), blockSLink, on)
}

func buildPadSLink(slinkPreamp int, on bool) []byte {
	return buildPadCh(slinkPreampToCh(slinkPreamp), blockSLink, on)
}

func buildGainSLink(slinkPreamp int, dB float64) []byte {
	return buildGainCh(slinkPreampToCh(slinkPreamp), blockSLink, dB)
}
