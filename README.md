# SQ Preamp manager

Control your **Allen & Heath SQ** mixer’s preamps (phantom power, pad, gain) from your computer — without touching the mixer. Useful when the SQ is used as tie-lines for recording (e.g. USB, or with LV1 / Waves I/O): set and recall preamp settings from this app.

---

## What it does

- **Channels** — Add as many channels as you need. For each channel you choose:
  - **Local** preamp (inputs 1–16, talkback 17, or stereo line 18–21)
  - **S-Link** preamp (1–40)
- **Controls per channel** — Phantom (on/off), Pad (on/off), Gain (0–60 dB). Stereo line inputs (18–21) have no preamp controls.
- **Sync all** — Sends the current channel settings to the mixer in one go. Use after loading a show or changing many channels.
- **Shows** — Save the current channel list and settings under a name. Load a show to restore it, then optionally sync to the mixer. You can overwrite existing shows or create new ones.
- **Show manager** — List all saved shows, export one to a JSON file, import a JSON file as a new show, or delete a show. The current show can be changed or cleared.
- **Config** — Set the mixer’s **IP address** and (if needed) the folder where shows and state are stored. You can reset the app state (clear all channels) from Config.

---

## Getting started

1. **Download** the release for your system (Windows or macOS) from the [Releases](https://github.com/keszi000/sq-waves-preamp/releases) page and unzip.
2. **Windows:** Run `sqapi.exe`.  
   **macOS:** Put `config.json` and the `data` folder (if you have them) in the same folder as **SQ Preamp manager.app**, then double‑click the app.  
   If macOS says the app *"is damaged"*, it’s Gatekeeper blocking an unsigned download. In Terminal, run:  
   `xattr -cr "SQ Preamp manager.app"`  
   (from the folder that contains the app). Then open the app again.  
   If you see *"application is not supported on this Mac"*, you’re likely on an **Intel Mac** and the release build may be Apple Silicon only. Build the app on your Mac from source: clone the repo, install [Go](https://go.dev/dl/) and Xcode Command Line Tools, then run `./build/build-mac.sh` in the repo — the resulting .app will run on your Mac.
3. Open **Config**, enter your SQ mixer’s **IP address**, and save.
4. Add channels (Edit → + New channel), set bus and preamp per channel, then use Phantom / Pad / Gain. Save your layout as a **show** and use **Sync all** to send it to the mixer.

Your settings and shows are stored on your computer in the app folder (or the data folder you set in Config).
