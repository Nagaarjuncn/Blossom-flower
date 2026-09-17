# 🌸 Gesture Flower — Full Stack Interactive Garden

A full-stack web application combining real-time camera computer vision with Google MediaPipe Hands tracking, organic CSS 3D & canvas blooming flower animations, procedural Web Audio effects, and local REST API persistence for saving flower blossoms to your personal garden.

---

## 🌟 Features

- **Live MediaPipe Hand Tracking**: Runs high-performance hand landmark detection in real time in your browser.
- **Natural Depth-Invariant Gesture Recognition**:
  1. **Raise Hand** → Sprout a botanical green bud 🌱
  2. **Pinch Right Thumb + Index** → Transform bud into a vibrant rose flower 🌸
  3. **Close Left Hand (Fist)** ➔ Flower glows with radiant luminescence & twinkling diamond stars 💎✨ (or pinch left) → Blossom flower to radiant full bloom with sparkling orbital particles ✨
- **Full-Stack Localhost Server**:
  - `GET /api/status` — Server health & telemetry
  - `GET /api/garden` — Fetch saved blossoms
  - `POST /api/garden` — Save blossom snapshots with gesture telemetry
  - `DELETE /api/garden/:id` — Delete saved blossom records
  - `GET /api/settings` & `POST /api/settings` — Persistent customization (pinch sensitivity, lerp speed, visualization mode)
- **Garden Gallery**: Save snapshots of your bloomed flowers into your persistent local garden!
- **Procedural Audio Synthesizer**: Delightful, organic chimes and chords created dynamically with the Web Audio API (zero audio file dependencies).
- **Dual Visual Modes**: Hand-anchored petals following your wrist + Grand Centerpiece botanical flower.

---

## 🚀 How to Run on Localhost

Modern web browsers require a secure context (`http://localhost` or `https`) to access webcam video streams.

### Option 1: 1-Click Batch File (Recommended)
Simply double-click `start.bat` in this folder. It will start the server and automatically launch `http://localhost:3000` in your default browser!

### Option 2: Node.js
```bash
node server.js
```
Then open: **[http://localhost:3000](http://localhost:3000)**

### Option 3: PowerShell (Zero dependencies)
```powershell
powershell -ExecutionPolicy Bypass -File server.ps1
```

---

## 📁 Project Structure

```
blossom-flower/
├── public/
│   ├── index.html       # Merged interactive UI, HUD telemetry, and modals
│   ├── style.css        # Premium dark botanical glassmorphic design system
│   ├── script.js        # MediaPipe gesture tracking, canvas animations, API sync
│   └── sound.js         # Procedural Web Audio synthesizer engine
├── server.js            # Node.js Express/HTTP backend server with REST APIs
├── server.ps1           # Windows native zero-dependency HTTP server fallback
├── package.json         # Project metadata and dependencies
├── data/
│   ├── garden.json      # Persistent storage of saved bloomed flowers
│   └── settings.json    # User configuration preferences
├── start.bat            # 1-Click Windows desktop launcher
└── README.md            # Documentation
```

---

## 🖐️ Gesture Instructions

| Step | Action | Visual Result | Audio |
| :--- | :--- | :--- | :--- |
| **1** | **Raise Hand** | Green botanical bud sprouts | Warm harmonic chime |
| **2** | **Hold Right Pinch** (Thumb + Index) | Bud blooms into opening flower | Rising two-note chord |
| **3** | **Close Left Hand** (Fist / Pinch) | Flower illuminates with radiant glow & twinkling diamond stars ✨💎 | Crystalline diamond arpeggio |
| **↩️** | **Release Fingers** (Unpinch) | Gracefully returns back to bud stage | Soft acoustic tick |
| **★** | **Save to Garden** | Captures snapshot into your persistent collection | Confirmation chime |
