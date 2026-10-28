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
