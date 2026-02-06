package main

import (
	"bytes"
	"testing"
)

func TestPacketFormat(t *testing.T) {
	// Header: F7 0C 0C
	header := []byte{0xF7, 0x0C, 0x0C}
	if got := buildPhantom(1, true)[:3]; !bytes.Equal(got, header) {
		t.Errorf("buildPhantom header = % X, want % X", got, header)
	}
}

func TestLocalBlock(t *testing.T) {
	// Local uses block 0x01; Ch1 = ch 0
	got := buildPhantom(1, true)
	if len(got) != 8 {
		t.Fatalf("len = %d, want 8", len(got))
	}
	if got[5] != 0x01 {
		t.Errorf("local block = %02X, want 01", got[5])
	}
	if got[4] != 0 {
		t.Errorf("Ch1 ch = %d, want 0", got[4])
	}
}

func TestSLinkBlock(t *testing.T) {
	// S-Link uses block 0x02; S-Link 1 = ch 0
	got := buildPhantomSLink(1, true)
	if len(got) != 8 {
		t.Fatalf("len = %d, want 8", len(got))
	}
	if got[5] != 0x02 {
		t.Errorf("slink block = %02X, want 02", got[5])
	}
	if got[4] != 0 {
		t.Errorf("S-Link 1 ch = %d, want 0", got[4])
	}
}

func TestPhantomOnOff(t *testing.T) {
	on := buildPhantom(1, true)
	off := buildPhantom(1, false)
	if on[6] != 1 || off[6] != 0 {
		t.Errorf("phantom value: on=%d off=%d", on[6], off[6])
	}
}

func TestPadOnOff(t *testing.T) {
	on := buildPad(1, true)
	off := buildPad(1, false)
	if on[6] != 1 || off[6] != 0 {
		t.Errorf("pad value: on=%d off=%d", on[6], off[6])
	}
}

func TestGainRange(t *testing.T) {
	// 0 dB and 60 dB should produce different raw values
	low := buildGain(1, 0)
	high := buildGain(1, 60)
	vLow := uint16(low[6])<<8 | uint16(low[7])
	vHigh := uint16(high[6])<<8 | uint16(high[7])
	if vLow >= vHigh {
		t.Errorf("gain raw: 0dB=%04X 60dB=%04X", vLow, vHigh)
	}
}

func TestLocalChMapping(t *testing.T) {
	// Ch2 = ch 1
	p := buildPhantom(2, true)
	if p[4] != 1 {
		t.Errorf("local preamp 2 ch = %d, want 1", p[4])
	}
	// Talkback (17) = ch 58
	g := buildGain(17, 12)
	if g[4] != 58 {
		t.Errorf("local preamp 17 ch = %d, want 58", g[4])
	}
}

func TestSLinkChMapping(t *testing.T) {
	// S-Link 1 = ch 0, S-Link 40 = ch 39
	p1 := buildPhantomSLink(1, true)
	if p1[4] != 0 {
		t.Errorf("slink 1 ch = %d, want 0", p1[4])
	}
	p40 := buildPhantomSLink(40, true)
	if p40[4] != 39 {
		t.Errorf("slink 40 ch = %d, want 39", p40[4])
	}
}

func TestClampOutOfRange(t *testing.T) {
	// Only valid ranges go to the mixer; out-of-range is clamped
	p := buildPhantom(0, true)   // below min → clamp to 1
	if p[4] != 0 {
		t.Errorf("local 0 clamped: ch = %d, want 0", p[4])
	}
	p = buildPhantom(99, true)   // above max → clamp to 17 (talkback = ch 58)
	if p[4] != 58 {
		t.Errorf("local 99 clamped: ch = %d, want 58", p[4])
	}
	p = buildPhantomSLink(0, true)
	if p[4] != 0 {
		t.Errorf("slink 0 clamped: ch = %d, want 0", p[4])
	}
	p = buildPhantomSLink(99, true)
	if p[4] != 39 {
		t.Errorf("slink 99 clamped: ch = %d, want 39", p[4])
	}
	g := buildGain(1, -10)
	v := uint16(g[6])<<8 | uint16(g[7])
	if v != gainRaw0dB {
		t.Errorf("gain -10 clamped: raw = %04X, want %04X", v, gainRaw0dB)
	}
	g = buildGain(1, 100)
	v = uint16(g[6])<<8 | uint16(g[7])
	if v != gainRaw60dB {
		t.Errorf("gain 100 clamped: raw = %04X, want %04X", v, gainRaw60dB)
	}
}
