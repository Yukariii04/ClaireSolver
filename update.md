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

## 2026-10-29 — Step 6: System 2 Vision & Math Reasoning Engine (Gemini 2.5 Flash + SymPy)

### Files created
- `ai-engine/solver.py` — Math reasoning engine integrating Gemini 2.5 Flash (with Pro fallback) and deterministic SymPy tool verification (`solve`, `integrate`, `diff`, `simplify`, `factor`, `limit`, `matrix`, `evalf`) with strictly typed Pydantic `TutorSolutionResponse` output (`detected_problem_latex`, `student_mistake_note`, `steps` with `canvas_latex`, `margin_note`, phonetic `tts_speech`, and `graph_action`).

### Files modified
- `ai-engine/main.py` — Connected `solve_math_problem` to `/ws/tutor` WebSocket, implementing real-time step streaming (`status`, `problem_detected`, `step`, and `complete` events) plus direct HTTP `/solve` POST endpoint.
- `memory.md` — Marked Step 6 as complete.

---

## Step 7 : Ghost Pen line-by-line step renderer & inline interactive Mafs graph spawner

### What was done
1. **Zustand Step Playback Queue Controller (`useStepPlaybackQueue.js`)**:
   - Manages sequential AI derivation playback state (`idle`, `playing`, `paused`, `completed`).
   - Co-ordinates simultaneous Ghost Pen ink reveal and speech synthesis pacing, pausing for 400ms between derivation lines before auto-advancing.
   - Automatically commits solved steps to Firebase RTDB via `useNotebookStore.getState().appendAiStep(...)`.
   - Supports mid-solution student interruptions (`interruptAndAskWhy`) emitting `'claire:ask_why'` events.
2. **Ghost Pen Step Component (`GhostPenStep.jsx`)**:
   - Renders step LaTeX math in distinct deep indigo ink via KaTeX (`output: htmlAndMathml`).
   - Smooth left-to-right CSS `clip-path` stroke reveal synced with step duration and speech pacing.
   - Animated pen nib cursor (`✍️`) tracking the live reveal boundary.
   - Margin note styled with handwritten font (`Caveat` cursive) tilted like authentic teacher pencil notes.
   - Interactive floating `[⏸ Pause / Ask Why]` chip for instant mid-solution clarification.
3. **Inline Interactive 2D Graph Widget (`InlineNotebookGraph.jsx`)**:
   - Powered by `mafs` (`Mafs`, `Coordinates.Cartesian`, `Plot.OfX`, `Point`).
   - Built-in math expression compiler translating string formulas (trig, powers, exp, logs, polynomials) to safe JavaScript functions.
   - Highlights roots, critical extrema, and intercepts with labeled coordinate chips.
   - Glassmorphic card design seamlessly integrated into the notebook page.
4. **Workspace & Page Integration (`NotebookPage.jsx`, `NotebookWorkspace.jsx`, `index.css`)**:
   - Mounted `GhostPenStep` layer inside `NotebookPage` with pointer-event pass-through for drawing ink.
   - Added student mistake diagnostic banner when `student_mistake_note` is detected.
   - Connected `NotebookWorkspace` to streaming `/ws/tutor` WebSocket with resilient HTTP `/solve` fallback.
   - Built the `[⏸ Ask Why]` interruption modal with targeted question submission.
   - Imported `Caveat`, `Kalam`, `katex.min.css`, and `mafs/core.css` in `index.css`.

### Files created
- `client/src/store/useStepPlaybackQueue.js`
- `client/src/components/GhostPenStep.jsx`
- `client/src/components/InlineNotebookGraph.jsx`

### Files modified
- `client/src/components/NotebookPage.jsx`
- `client/src/components/NotebookWorkspace.jsx`
- `client/src/index.css`
- `memory.md`

---

## Step 8 : Hands-free voice & System 1 gatekeeper pipeline (Gnani Prisma STT + TypeSafe Jev + Gnani Timbre TTS)

### What was done
1. **Ears ONLY — Gnani Prisma v2.5 STT Streaming Client (`ai-engine/prisma_stt.py`)**:
   - Streams 16kHz 16-bit mono linear PCM audio chunks (1024 bytes per frame) from React microphone WebSocket to Gnani Prisma.
   - Multilingual support for Indian languages (`en-IN`, `hi-IN` Hinglish, `gu-IN`).
   - Mathematical vocabulary boosting (`bias_list=["integral", "derivative", "theta", "cosine", "sine", "matrix", "quadratic", "factor", "limit", "minus"]`, `bias_score=1.5`).
   - Seamless local fallback session for offline development without crashes.
2. **System 1 Gatekeeper ONLY — TypeSafe Jev (`ai-engine/jev_gatekeeper.py`)**:
   - Zero LLM semantic router for fast sub-50ms gating decisions via typed questions (`Noul`, `Choice`).
   - Evaluates contextual state: `{"utterance": transcript, "is_student_writing": is_pen_moving, "is_tutor_currently_explaining": is_ai_speaking}`.
   - Strictly enforced routing policy:
     - `is_ai_speaking` and `is_interrupting_tutor.noul >= 0.70` → `PAUSE_TUTOR`.
     - `is_calling_tutor.noul >= 0.75` → `TRIGGER_GEMINI` with `requested_mode` (`step_by_step`, `check_mistake`, `give_hint`, `plot_graph`).
     - `noul < 0.75` → `IGNORE` (silent notebook preservation during muttering or scratch calculations).
3. **Voice Output ONLY — Gnani Timbre v2.5 / v3.0 TTS (`ai-engine/timbre_tts.py`)**:
   - Synthesizes high-fidelity pedagogical speech using Indian educator voice (`voice="Nalini"`, `model="timbre-v2.5"`).
   - Generates 24kHz linear PCM mono in WAV format; returns base64 payload streamed directly alongside step JSON.
   - Built-in in-memory fallback generator ensuring uninterrupted offline derivation pacing.
4. **FastAPI Voice WebSocket & React Microphone Hook (`ai-engine/main.py`, `client/src/hooks/useVoiceTutor.js`, `client/src/components/NotebookWorkspace.jsx`)**:
   - Mounted `/ws/voice` endpoint forwarding raw PCM stream to Prisma and streaming gatekeeper decisions.
   - React hook captures mic audio via `AudioContext` and `ScriptProcessorNode` (Float32 to Int16 PCM conversion).
   - Auto-triggers `harvestCanvasContext` on `TRIGGER_GEMINI` and immediately pauses ghost pen on `PAUSE_TUTOR`.
   - Connected `useStepPlaybackQueue` to play synthesized Gnani Timbre WAV audio in lockstep with KaTeX reveal.
   - Added interactive hands-free Voice indicator pill in workspace top bar with live Jev evaluation status.

### Files created
- `ai-engine/prisma_stt.py`
- `ai-engine/jev_gatekeeper.py`
- `ai-engine/timbre_tts.py`
- `client/src/hooks/useVoiceTutor.js`

### Files modified
- `ai-engine/main.py`
- `client/src/components/NotebookWorkspace.jsx`
- `client/src/store/useStepPlaybackQueue.js`
- `memory.md`

---

## Step 9 : Homework-ready multi-page A4 PDF exporter (clean submission & revision guide modes)

### What was done
1. **Multi-Page A4 PDF Exporter (`client/src/utils/exportNotebookToPdf.js`)**:
   - Iterates sequentially through all `<NotebookPage />` elements in the active workspace.
   - Dynamically injects style overrides before canvas capture:
     - "Clean Submission Mode": hides temporary margin callouts and tutor coaching chips, and unifies Ghost Pen math ink with the student's dark blue-black ink (`#1a1a2e`).
     - "Revision / Study Guide Mode": preserves distinct AI tutor indigo ink, cursive margin hints, and mistake check callouts.
     - "Clean White Paper" vs. "Keep Grid/Ruled Lines" paper background options.
   - Captures each page at 2x resolution (`scale: 2`, `useCORS: true`) ensuring crisp rendering for Firebase question images, handwritten strokes, KaTeX math symbols, and Mafs graphs.
   - Appends pages onto a standard A4 sheet (`210mm x 297mm`) in `jsPDF` and triggers client download (`{notebookTitle}_Submission.pdf` or `{notebookTitle}_StudyGuide.pdf`).
2. **Export PDF Modal (`client/src/components/ExportPdfModal.jsx`)**:
   - Glassmorphic modal providing preset and background customization controls.
   - Displays detected page count and animated progress bar (`Rendering Page X of Y...`) during export.
3. **Workspace Integration (`client/src/components/NotebookWorkspace.jsx`)**:
   - Replaced old naive PDF export with `<ExportPdfModal />`.

### Files created
- `client/src/utils/exportNotebookToPdf.js`
- `client/src/components/ExportPdfModal.jsx`

### Files modified
- `client/src/components/NotebookWorkspace.jsx`
- `memory.md`

---

## 2026-10-29 — Laya Integration & Frontend White-Screen Resolution

### What was done
1. **Frontend White-Screen Fix**:
   - Diagnosed root cause: `client/src/config/firebase.js` was throwing an unhandled top-level exception at bundle import time when Firebase web environment variables were absent or placeholder.
   - Refactored `client/src/config/firebase.js` to avoid crashing top-level evaluation; exported `isFirebaseConfigured` and `missingFirebaseConfig` with graceful mock handles.
   - Updated `client/src/auth/AuthProvider.jsx` and `client/src/pages/LoginPage.jsx` to support seamless Local Demo Mode (`demo-student`).
   - Extended `client/src/store/useNotebookStore.js` and `client/src/components/NotebookWorkspace.jsx` with local in-memory fallback state so the notebook canvas, Ask Marker, Ghost Pen, graphs, and PDF export can be tested without live cloud credentials.
   - Added `FirebaseStatusBanner` to `client/src/App.jsx` informing the developer when running in local demo mode.
2. **Laya System 1 Gatekeeper Integration**:
   - Enhanced `ai-engine/jev_gatekeeper.py` to support **Laya** via `LAYA_BASE_URL` (defaulting to `http://localhost:8001/v1`), leveraging the `TypeSafeClient` wire protocol compatibility.
   - Preserved fallback hierarchy: Laya / TypeSafe Cloud -> In-memory rule engine (zero latency, zero cost).
   - Added `LAYA_BASE_URL` configuration to `ai-engine/.env` and `ai-engine/.env.example`.

---

## 2026-10-29 — STEP 10: Y2K Retro-Computing UI Design System Integration

### What was done
1. **Design System & Visual Tokens (`client/src/index.css`)**:
   - Integrated full Y2K cyber-retro design system tokens matching MotionArray asset #1431247 (*19 Y2K Old Computer Vector Elements*).
   - Loaded fonts: `Bricolage Grotesque`, `Space Mono`, `Caveat`, `Kalam`.
   - Added authentic retro utilities: `.bg-desktop-dither`, `.bg-desktop-crt`, `.scanlines-overlay`, `.bevel-outset` / `.bevel-raised`, `.bevel-inset` / `.bevel-sunken`, `.bevel-button`, `.window-outer-chassis`, `.win-checkbox`, `.ruled-paper`, `.cyan-grid-paper`, and animated `.eq-bar`.
2. **Setup Wizard Authentication (`client/src/pages/LoginPage.jsx`)**:
   - Redesigned into the complete Windows 98 Setup Wizard v2.5 dialog chassis.
   - Features CRT scanline left banner, wireframe torus math illustration, SoundBlaster audio level indicator, and beveled inputs.
   - Retained 100% of Firebase authentication features (`createUserWithEmailAndPassword`, `signInWithEmailAndPassword`, `signInWithPopup`, and instant local demo mode).
3. **Student Workspace System Explorer (`client/src/pages/DashboardPage.jsx`)**:
   - Restyled into the classic System Explorer window with cobalt gradient titlebar, live clock, language selector, Start menu flyout, and breadcrumbs.
   - Bento grid renders physical spiral-bound exercise books (ruled paper and cyan grid) with holographic subject badges.
   - Added floating bottom Winamp-style audio tutor dock with animated VU equalizer bars.
4. **Universal Question Slicer Modal (`client/src/components/UploadWorksheetModal.jsx`)**:
   - Transformed into the flatbed scanner bay aesthetic with green laser scanline animation and TWAIN_32 status inset.
5. **Print Spooler PDF Export Dialog (`client/src/components/ExportPdfModal.jsx`)**:
   - Restyled into the Windows 98 Print Spooler dialog with 2-page A4 spread preview and segmented LED progress bar.
6. **AI Tutor Properties & Voice Config Control Panel (`client/src/components/SettingsControlPanelModal.jsx`)**:
   - Built a comprehensive Windows 98/2000 property sheet with 4 tabbed panels:
     - *General*: Syllabus / exam target (CBSE, JEE, Undergrad), primary language, autosave intervals.
     - *Speech & Voice*: Gnani Prisma STT, Gnani Timbre TTS, segmented LED VU meter, speech rate/pitch sliders, and test audio playback.
     - *Gatekeeper*: Laya micro-classifier vs local heuristic router, SymPy algebraic verification toggle.
     - *Inks & Paper*: Paper rule style preview (ruled, cyan grid, plain), student ink tint, AI ghost pen tint, pen stroke width.
   - Accessible via Start Menu, Dashboard Winamp dock ("Config"), and Notebook Workspace header ("Settings").
7. **Floating Dock & Notebook Workspace Canvas (`client/src/components/FloatingDock.jsx`, `NotebookPage.jsx`, `NotebookWorkspace.jsx`)**:
   - Restyled the floating dock into an Apple iMac G3 translucent beveled chassis.
   - Upgraded notebook paper pages with cyan rule margins, spiral-binder hole punch artifacts, and yellow problem tape headers.
   - Converted all unescaped arrows in JSX text to unicode `→` for clean compilation.

### Files created
- `client/src/components/SettingsControlPanelModal.jsx`

### Files modified
- `client/src/index.css`
- `client/src/pages/LoginPage.jsx`
- `client/src/pages/DashboardPage.jsx`
- `client/src/components/UploadWorksheetModal.jsx`
- `client/src/components/ExportPdfModal.jsx`
- `client/src/components/FloatingDock.jsx`
- `client/src/components/NotebookPage.jsx`
- `client/src/components/NotebookWorkspace.jsx`
- `memory.md`
- `update.md`

---

## 2026-10-29 — STEP 11: Real Physical Notebook Baseline Alignment & Human Handwriting Ink System

### What was done
1. **Physical Exercise Book Geometry (`client/src/index.css`, `client/src/components/NotebookPage.jsx`)**:
   - Upgraded ruled paper background to authentic 32px horizontal cyan-blue lines (`#b9d5f0`) combined with a classic 72px left vertical red margin line (`rgba(244, 63, 94, 0.5)`).
   - Added classes `.handwriting-ink-student` (`#0F172A`), `.handwriting-ink-ai` (`#1e40af`), and `.handwriting-margin-note` (`#e11d48`) with `Caveat` and `Kalam` typography.
   - Locked KaTeX display math baselines to the 32px paper lines (`.notebook-math-row .katex-display`).
2. **Student Handwritten Line Editor (`client/src/components/StudentHandwritingLine.jsx`, `client/src/store/useNotebookStore.js`)**:
   - Created `StudentHandwritingLine` component allowing students to type math and text directly on the 32px ruled lines.
   - Text automatically renders in realistic cursive student ink (`Caveat` / `Kalam`) and parses inline `$math$` via KaTeX.
   - Keyboard navigation: `Enter` drops to the next 32px line; `Backspace` on empty line deletes it and returns focus to previous.
   - Added `savePageStudentLines` to `useNotebookStore` with debounced auto-saving and Firebase synchronization.
3. **Ghost Pen Physical Ink Inscription (`client/src/components/GhostPenStep.jsx`)**:
   - Completely stripped artificial card boxes, borders, gradient backgrounds, and shadows from AI solution steps.
   - Inscribes steps directly onto the ruled lines:
     - Step number `(1)` in the 72px left margin column in educator blue ink.
     - Mathematical derivation equations and explanations flush on 32px ruled lines with animated left-to-right ink reveal and glowing pen nib cursor `✍️`.
     - Teacher annotations written in red margin ink (`#e11d48`).
4. **Dock & Export Integration (`client/src/components/FloatingDock.jsx`, `client/src/utils/exportNotebookToPdf.js`)**:
   - Added `✍️ Write` tool to the floating dock alongside `✎ Draw`, `⌫ Eraser`, and `✨ Ask Marker`.
   - Updated PDF exporter so clean submission mode preserves human student handwriting while hiding coaching chips and buttons.







