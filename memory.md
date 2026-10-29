# ClaireSolver — Memory

## Architecture
Three-service monorepo: **client** (React/Vite/Tailwind/Zustand), **server** (Express/Firebase Admin), **ai-engine** (FastAPI/Gemini).

## Firebase Schema
- `notebooks/{uid}/{notebookId}` → `{ metadata, pages, pageOrder, sourceWorksheet }`
- `notebookIndex/{uid}/{notebookId}` → lightweight index for dashboard listing
- Storage: `worksheets/{uid}/{notebookId}/{file}`, `question-images/{uid}/{notebookId}/{pageId}/{file}`

## Key Data Flows
1. **New blank notebook**: Client → Firebase RTDB directly (Zustand `createNotebook`)
2. **Worksheet upload (Step 3)**: Client → `POST /api/notebooks/upload` (Express + multer) → `POST /slice-worksheet/` (FastAPI slicer) → Gemini vision structured output → crop → base64 PNGs back → Express uploads to Cloud Storage → writes notebook to RTDB → returns `{ notebookId }` → client navigates to `/notebook/:id`

## Env Vars
- **server**: `FIREBASE_DATABASE_URL`, `FIREBASE_STORAGE_BUCKET` (added in Step 3)
- **ai-engine**: `GEMINI_API_KEY`, `GEMINI_MODEL`

## Current State
- Steps 1–2: Auth, dashboard, notebook CRUD — complete
- Step 3: Worksheet upload + smart question slicer — **complete**
- Step 4: Multi-page notebook workspace — **complete**
- Step 5: "Ask Marker" trigger & canvas context harvester — **complete**
- Step 6: System 2 vision & math reasoning engine (Gemini 2.5 Flash + SymPy) + streaming WebSocket — **complete**
- Step 7: Ghost Pen line-by-line step renderer & inline interactive Mafs graph spawner — **complete**
- Step 8: Hands-free voice & System 1 gatekeeper pipeline (Gnani Prisma STT + Laya + Gnani Timbre TTS) — **complete**
- Step 9: Homework-ready multi-page A4 PDF exporter (clean submission & revision guide modes) — **complete**
- Step 10: Y2K retro-computing UI design system integration across student workspace — **complete**
- Step 11: Real physical notebook baseline alignment & human handwriting ink system — **complete**
  - Page Geometry: 32px cyan-blue horizontal rules (`#b9d5f0`), 72px left vertical red margin line (`rgba(244, 63, 94, 0.5)`).
  - Student Writing: Interactive line editor (`StudentHandwritingLine.jsx`) allowing typing/writing directly on 32px ruled lines in natural handwriting ink (`Caveat` / `Kalam` font, midnight ink `#0F172A`) with inline KaTeX math compilation (`$...$`).
  - AI Solution Steps: Stripped artificial card boxes/borders/gradients from `GhostPenStep.jsx`. Steps inscribe directly onto notebook lines in educator blue ink (`#1e40af`), step numbers `(1)` in the 72px margin column, math equations resting flush on 32px lines, and teacher annotations in red ink (`#e11d48`).
  - Floating Dock: Added `✍️ Write (Ink)` tool alongside `✎ Draw`, `⌫ Eraser`, and `✨ Ask Marker`.
  - PDF Export: Clean submission mode preserves human handwriting while stripping teacher coaching chips and buttons.
  - Design tokens: Classic chassis putty gray (`#D4D0C8`), cobalt titlebar gradient (`#000080` to `#1084D0`), CRT scanline overlay, desktop dither (`#008080`), 3D bevel outset/inset borders.
  - Fonts: `Bricolage Grotesque`, `Space Mono`, `Caveat`, `Kalam`.
  - Upgraded pages & dialogs:
    - Setup Wizard v2.5 (`LoginPage.jsx`): Scanline left banner, wireframe torus math illustration, SoundBlaster audio meter, demo mode.
    - System Explorer (`DashboardPage.jsx`): Start menu, breadcrumbs, live clock, language pills, physical spiral-bound lined/grid exercise books with holographic badges, Winamp-style audio dock.
    - Flatbed Scanner Bay (`UploadWorksheetModal.jsx`): Green laser scanline effect, ROI bounding box badges.
    - Print Spooler (`ExportPdfModal.jsx`): Windows 98 Print Spooler dialog, 2-page A4 spread preview, segmented LED progress bar.
    - Control Panel (`SettingsControlPanelModal.jsx`): AI Tutor Properties & Voice Config with tabs for General, Speech & Voice (VU meter, Gnani Prisma STT, Gnani Timbre TTS), Gatekeeper (Laya System 1 vs System 2), and Inks & Paper.
    - Floating Dock (`FloatingDock.jsx`) & Canvas (`NotebookPage.jsx`, `NotebookWorkspace.jsx`): G3 tactile beveled toolbox, ruled cyan margin paper, binder punch artifacts, yellow problem tape headers.
- System 1 Gatekeeper: Powered by **Laya** (Open-source via `LAYA_BASE_URL`, default `http://localhost:8001/v1`), with zero-latency **built-in rule fallback**.
- Demo / Offline Mode: Enabled across `client` so all notebook features (canvas, Ask Marker, Ghost Pen, Mafs graphs, PDF export) are fully testable in the browser even prior to entering Firebase credentials.

  - `client`: `npm install` and `npm run build` (Vite 8 + Tailwind 4) verified cleanly (exit 0).
  - `server`: `npm install` and Node.js syntax checks verified cleanly.
  - `ai-engine`: `pip install -r requirements.txt` installed in base Anaconda Python (`Python 3.14.6`), all modules (`fastapi`, `uvicorn`, `websockets`, `pymupdf`, `python-docx`, `Pillow`, `ffmpeg-python`, `google-genai`, `sympy`, `typesafe-sdk`, `gnani-vachana` / `gnani.stt`, `gnani.tts`) tested and importing with 100% success.

