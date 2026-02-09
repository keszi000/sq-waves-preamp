#!/usr/bin/env bash
# Build sqapi for Windows (GUI subsystem, no console window).
# Run from repo root. Produces sqapi.exe.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
echo "Building Windows GUI binary..."
CGO_ENABLED=1 go build -ldflags "-H windowsgui" -o sqapi.exe .
echo "Created sqapi.exe"
