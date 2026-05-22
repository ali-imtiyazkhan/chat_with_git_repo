# 🔍 CodeLens — GitHub Codebase Chatbot

A full-stack RAG application: chat with any GitHub repository using Gemini Flash + FAISS, served by a FastAPI backend and a Next.js frontend.

```
┌─────────────────────────────────────────────┐
│              Next.js Frontend               │
│  Home · Chat · Files Explorer · About       │
└───────────────┬─────────────────────────────┘
                │ HTTP + SSE  (via next.config rewrites)
┌───────────────▼─────────────────────────────┐
│              FastAPI Backend                │
│  /index  /chat (SSE)  /status  /session     │
└───────────────┬─────────────────────────────┘
                │
┌───────────────▼─────────────────────────────┐
│           RAG Pipeline                      │
│  GithubFileLoader → Splitter → FAISS        │
│  → Gemini Flash (streaming)                 │
└─────────────────────────────────────────────┘
```

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Home | `/` | Enter a GitHub repo URL, kick off indexing |
| Chat | `/chat` | Streaming Q&A with the codebase |
| Files | `/docs` | Browse indexed files and language stats |
| About | `/about` | Architecture, tech stack, setup guide |

## Setup

### 1. Environment

Create `backend/.env`:
```env
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GOOGLE_API_KEY=AIzaSy_xxxxxxxxxxxxxxxxxxxx
```

### 2. Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev        # runs on http://localhost:3000
```

### 4. Use it

1. Open http://localhost:3000
2. Paste any GitHub repo URL on the Home page
3. Wait for indexing to complete (check the status bar)
4. Go to **Chat** and start asking questions

## GitHub PAT Scopes

- Public repos: `public_repo`
- Private repos: `repo` (full access)

Create one at: https://github.com/settings/tokens
