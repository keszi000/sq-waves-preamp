# sqapi

Web UI + HTTP API to control Allen & Heath SQ mixer preamps (phantom, pad, gain) over TCP.

**What is this?** The project’s goal: when you use the SQ mixer only as tie-lines (device-to-device patch) for preamps — e.g. for USB recording, or LV1 with Waves I/O, etc. — you can control the preamps directly with this, without touching anything on the mixer.

**Run:**

```bash
go run .
```

Open the app in the browser. Enter the mixer IP, add channels, assign each to a Local (1–17) or S-Link (1–40) preamp, set phantom/pad/gain. **Sync all** sends current state to the mixer.

**Saving:** Save/Load show to server (list + overwrite or new). Show manager: export/import JSON file. SQ IP is stored in the show.

**API (local preamp 1–17):**

- `POST /preamp/local/:id/phantom?on=true|false`
- `POST /preamp/local/:id/pad?on=true|false`
- `POST /preamp/local/:id/gain` — body `{"db": 0..60}` or `?db=12`

**S-Link** (preamp 1–40): same endpoints with `/preamp/slink/:id/phantom`, `pad`, `gain` (ch0 range 16–55).

**Env:** `SQ_IP`, `SQ_PORT` (default 51326), `PORT` (default 8080), `DATA_DIR` (default `./data` for config and shows).
