# ClaireSolver — Update Log

## 2026-10-28 — Step 3: Worksheet Upload & Smart Question Slicer

### Files created
- `ai-engine/slicer.py` — FastAPI router for `/slice-worksheet/`
  - Converts PDF (PyMuPDF 2× DPI), DOCX (embedded images), images (EXIF-corrected), WebM (mid-frame via ffmpeg) into PIL images
  - Calls `gemini-2.5-flash` with structured outputs (Pydantic schema) to detect questions with `[ymin, xmin, ymax, xmax]` bounding boxes on 0–1000 scale
  - Crops each question with 15% padding, returns base64-encoded PNGs
- `server/routes/notebookUpload.js` — Express route `POST /api/notebooks/upload`
  - Multer memory storage, 25 MB limit, validates file type + paperStyle
  - Forwards file to ai-engine slicer, uploads cropped PNGs to Firebase Cloud Storage
  - Creates multi-page notebook in RTDB (1 question per page), returns `{ notebookId }`
- `client/src/components/UploadWorksheetModal.jsx` — React modal
  - Drag & drop zone, file type/size validation, paper style selector (Grid/Ruled/Blank)
  - Calls authenticated upload endpoint, navigates to notebook on completion

### Files modified
- `ai-engine/main.py` — mounted slicer router at `/slice-worksheet`
- `server/index.js` — imported and mounted `notebookUploadRouter` at `/api/notebooks/upload`
- `server/.env.example` — added `FIREBASE_DATABASE_URL`, `FIREBASE_STORAGE_BUCKET`
- `client/src/pages/DashboardPage.jsx` — replaced bare file input with `UploadWorksheetModal`, added import + state

## 2026-10-28 — Step 4: Multi-Page Notebook Workspace

### Files created
- `client/src/components/NotebookPage.jsx` — A4-proportioned page card with locked Pinned Question Header (displaying `questionImageUrl` above problem statement) and `react-sketch-canvas` canvas with CSS patterns for `grid`, `ruled`, or `blank` paper styles; 800ms debounced auto-save of strokes to Firebase RTDB.
- `client/src/components/FloatingDock.jsx` — Glassmorphic bottom dock with Pen (with stroke width slider), Eraser, ✨ Ask Marker (highlighter), Undo/Redo, and "+ Extend Page" buttons.
- `client/src/components/NotebookWorkspace.jsx` — Multi-page workspace container with sticky top bar (title, language selector for `en-IN`, `hi-IN`, `gu-IN`, mic indicator, PDF export via `html2canvas` and `jspdf`), vertically stacked page canvas list, and active page context tracking.

### Files modified
- `client/src/pages/NotebookPage.jsx` — Updated to render `<NotebookWorkspace />` once loaded from RTDB.
- `memory.md` — Marked Step 4 as complete.

## 2026-10-29 — Step 5: "Ask Marker" Trigger & Canvas Context Harvester

### Files created
- `client/src/lib/boundingBox.js` — Bounding box math helper computing raw and 20% padded coordinates `(minX, minY, maxX, maxY)` from stroke points, with canvas clamping and header bounding box helper.
- `client/src/lib/harvestCanvasContext.js` — Utility capturing high-res 2x DPI canvas contexts (`fullPagePng` of the entire page and `croppedTargetPng` of the selection or pinned header).
- `client/src/components/MarkerActionPopover.jsx` — Compact floating glassmorphic popover with 4 quick action buttons (`Solve Step-by-Step`, `Check My Mistake`, `Give Hint`, `Plot Graph`), inline question input, and harvesting progress indicator.

### Files modified
- `client/src/components/NotebookPage.jsx` — Wired pointer stroke completion for marker tool to calculate bounding box, immediately undo temporary stroke from canvas, trigger shimmer selection highlight, and support question header click selection.
- `client/src/components/NotebookWorkspace.jsx` — Integrated selection state, mounted `MarkerActionPopover`, wired action execution to `harvestCanvasContext`, and emitted `claire:summon` custom event for Step 6 WebSocket tutor.
- `memory.md` — Updated current state with Step 5.

