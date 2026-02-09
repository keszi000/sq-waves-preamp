# Build scripts

Run from the **repo root** (parent of `build/`).

- **build-mac.sh** — Builds the binary and creates *SQ Preamp manager.app* (no Terminal when double-clicked). Optional icon from `static/icon.svg` via `make-icns.sh`.
- **make-icns.sh** — Converts `static/icon.svg` to `AppIcon.icns` (macOS only; uses `qlmanage`, `sips`, `iconutil`). Called by `build-mac.sh`.
- **build-windows.sh** — Builds `sqapi.exe` with GUI subsystem (no console window). Use Git Bash or WSL on Windows.

GitHub Actions: see `.github/workflows/release.yml`. Push a tag like `v0.1` to build and publish release assets for Windows and macOS.
