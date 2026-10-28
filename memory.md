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
- Steps 5+: Tutor WebSocket, AI solver, voice — not started

