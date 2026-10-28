# AI Math Homework Notebook

Three independently run services for the Gnani.ai Internship Challenge.

## Structure

```text
client/                         React + Vite frontend (port 5173)
  src/
    App.jsx                     Auth-protected React Router v6 routes
    main.jsx                    Browser entrypoint
    index.css                   Tailwind CSS entrypoint
    config/firebase.js          Firebase Auth, RTDB, and Storage clients
    pages/                      Login, dashboard, and notebook screens
    store/useNotebookStore.js   Realtime notebook actions and upload state
  .env.example                  Firebase web config and service URLs
server/                         Express app backend (port 5000)
  index.js                      Health, verified session, and streaming AI proxy
  firebaseAdmin.js              Firebase ID token verification
  .env.example                  CORS, AI URL, Firebase Admin credentials
ai-engine/                      FastAPI AI/speech backend (port 8000)
  main.py                       Health endpoint and tutor WebSocket placeholder
  requirements.txt              Python dependencies
  .env.example                  Gemini, TypeSafe, and Gnani keys
database.rules.json             Per-user RTDB access and notebook validation
storage.rules                   Per-user worksheet and question-image access
firebase.json                   Firebase CLI rules configuration
```

## Install dependencies in this starter (PowerShell)

Use Node.js 20.19+ or 22.12+ and Python 3.10+. Run these commands from the repository root to install this checked-out starter:

```powershell
Set-Location .\client
npm install
Set-Location ..\server
npm install
Set-Location ..\ai-engine
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
Set-Location ..
```

## Bootstrap the same layout from scratch

Use these commands in a new, empty repository before copying in the source files above:

```powershell
npm create vite@latest client -- --template react
Set-Location .\client
npm install
npm install react-router-dom@6 zustand react-sketch-canvas katex mafs jspdf html2canvas firebase
npm install -D tailwindcss @tailwindcss/vite
Set-Location ..

New-Item -ItemType Directory -Force server, ai-engine | Out-Null
Set-Location .\server
npm init -y
npm install express cors dotenv multer firebase-admin
npm pkg set type=module "scripts.start=node index.js" "scripts.dev=node --watch index.js"
Set-Location ..\ai-engine
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install fastapi "uvicorn[standard]" websockets python-multipart python-dotenv PyMuPDF python-docx Pillow ffmpeg-python google-genai sympy typesafe-sdk "gnani-vachana>=0.8.1"
Set-Location ..
```

If PowerShell blocks virtual environment activation, allow scripts for the current terminal with `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`, then activate again.

## Configure and run

Copy each `.env.example` to `.env` in its own service directory and fill in the values:

```powershell
Copy-Item client\.env.example client\.env
Copy-Item server\.env.example server\.env
Copy-Item ai-engine\.env.example ai-engine\.env
```

Keep Gemini, TypeSafe, Gnani, and Firebase Admin credentials out of the client. The `VITE_FIREBASE_*` values are Firebase's browser configuration; Vite embeds `VITE_*` variables in the client bundle.

In the Firebase console, enable Google and Email/Password under Authentication sign-in providers, create a Realtime Database and a Storage bucket, then copy their web app values into `client/.env`. Put the service account values in `server/.env`. Sign in to Firebase CLI and select your project before deploying the included owner-only rules:

```powershell
npx firebase-tools login
npx firebase-tools use --add
npx firebase-tools deploy --only database,storage
```

The canonical notebook schema is `notebooks/{userId}/{notebookId}`. `pageOrder` keeps the `pages` map ordered independently of key sorting; `sourceWorksheet` stores the uploaded original separately from any cropped question image.

```text
notebooks/{userId}/{notebookId}
  metadata: { title, createdAt, updatedAt, paperStyle: "grid"|"ruled"|"blank", preferredLanguage: "en-IN"|"hi-IN"|"gu-IN" }
  pageOrder: ["page_1", "page_1b", "page_2"]
  pages:
    page_1:
      pageNumberLabel: "Page 1"
      questionImageUrl: "<cropped image download URL>"
      questionSummary: "..."
      userStrokes: "[]"  # JSON string from react-sketch-canvas
      aiSteps: [{ step_number, canvas_latex, tts_speech, margin_note, graph_action }]

notebookIndex/{userId}/{notebookId}
  title, createdAt, updatedAt, paperStyle, preferredLanguage, pageCount
```

The dashboard listens to the compact `notebookIndex` projection, while opening a notebook subscribes to its full path. This avoids loading every stroke and solved step just to render the notebook list. RTDB stores arrays as numeric-key children; the client normalizes missing/serialized `aiSteps` and `pageOrder` to arrays.

The Zustand store exposes `loadNotebook(id)` as a realtime subscription, `savePageStrokes(notebookId, pageId, strokes)`, `appendAiStep(notebookId, pageId, step)`, and `insertContinuationPage(notebookId, afterPageId, pageDraft)`. `uploadWorksheet(file)` stores the original PDF/image, and `uploadQuestionImage(notebookId, pageId, croppedImage)` stores an already-cropped image and writes its download URL to `questionImageUrl`.

For custom backend calls, `authenticatedFetch(path, options)` in `client/src/lib/api.js` adds the current Firebase ID token. The Express backend verifies it on `/api/auth/session` and `/api/ai/*`.

Open three terminals at the repository root:

```powershell
# Terminal 1
Set-Location .\client
npm run dev
```

```powershell
# Terminal 2
Set-Location .\server
npm run dev
```

```powershell
# Terminal 3
Set-Location .\ai-engine
.\.venv\Scripts\Activate.ps1
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The tutor WebSocket currently acknowledges received messages; the AI and speech provider pipelines are not wired into this Step 1 skeleton yet.

