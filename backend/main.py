"""
GitHub Codebase Chatbot — FastAPI Backend
==========================================
Wraps the RAG pipeline and exposes REST + SSE endpoints for the Next.js frontend.
"""

import os
import re
import asyncio
import json
import pickle
import shutil
import time
import random
from pathlib import Path
from typing import Optional, AsyncGenerator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

from langchain_core.documents import Document
import urllib.request
import zipfile
import io
from langchain_text_splitters import RecursiveCharacterTextSplitter, Language
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_community.vectorstores import FAISS
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

load_dotenv()

app = FastAPI(title="GitHub Chatbot API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global state (single active session) ─────────────────────────────────────
class Session:
    repo: Optional[str] = None
    branch: Optional[str] = None
    rag_chain = None
    vector_db = None          # Keep FAISS db for direct file lookups
    all_chunks: list = []     # Keep all chunks for file-specific queries
    file_count: int = 0
    chunk_count: int = 0
    indexing: bool = False
    error: Optional[str] = None
    file_list: list[str] = []
    chat_history: list[dict] = []

session = Session()

# Language map & filters
EXTENSION_LANGUAGE_MAP = {
    ".py": Language.PYTHON, ".js": Language.JS, ".jsx": Language.JS,
    ".ts": Language.JS, ".tsx": Language.JS, ".java": Language.JAVA,
    ".cpp": Language.CPP, ".cc": Language.CPP, ".c": Language.C,
    ".go": Language.GO, ".rb": Language.RUBY, ".rs": Language.RUST,
    ".scala": Language.SCALA, ".swift": Language.SWIFT, ".kt": Language.KOTLIN,
    ".md": Language.MARKDOWN, ".html": Language.HTML, ".sol": Language.SOL,
}
EXCLUDED_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
    ".pdf", ".zip", ".tar", ".gz", ".exe", ".bin", ".whl", ".lock", ".sum", ".mod",
    ".woff", ".woff2", ".ttf", ".eot", ".mp3", ".mp4", ".wav", ".avi",
    ".pyc", ".pyo", ".so", ".dll", ".dylib", ".map",
}
EXCLUDED_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv",
    "dist", "build", ".next", ".nuxt", "coverage",
    ".cache", ".output", "vendor", "target", "out",
}
EXCLUDED_FILENAMES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "composer.lock",
    "Pipfile.lock", "poetry.lock", "Gemfile.lock", "Cargo.lock",
    ".DS_Store", "Thumbs.db",
}
MAX_FILE_SIZE = 50_000  # Skip files > 50KB (likely auto-generated)

def should_include(file_path: str) -> bool:
    p = Path(file_path)
    if p.name in EXCLUDED_FILENAMES:
        return False
    for part in p.parts:
        if part in EXCLUDED_DIRS:
            return False
    return p.suffix.lower() not in EXCLUDED_EXTENSIONS

def normalize_repo(raw: str) -> Optional[str]:
    raw = raw.strip().rstrip("/")
    m = re.match(r"(?:https?://)?github\.com/([^/\s]+)/([^/\s]+?)(?:\.git)?(?:/.*)?$", raw, re.IGNORECASE)
    if m:
        return f"{m.group(1)}/{m.group(2)}"
    if re.match(r"^[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+$", raw):
        return raw
    return None


def format_docs(docs):
    formatted = []
    for doc in docs:
        source = doc.metadata.get("source", "unknown")
        formatted.append(f"--- File: {source} ---\n{doc.page_content}")
    
    # Inject codebase directory structure and file list metadata to answer structural questions
    if session.file_list:
        file_list_str = "\n".join(f"- {f}" for f in session.file_list)
        metadata_context = f"""--- Codebase File List & Metadata ---
Repository: {session.repo}
Branch: {session.branch}
Total Files: {session.file_count}
Indexed Chunks: {session.chunk_count}

All files in the repository:
{file_list_str}
--------------------------------------"""
        formatted.append(metadata_context)
        
    return "\n\n".join(formatted)

def _extract_mentioned_files(question: str) -> list[str]:
    """Detect filenames mentioned in the user's question."""
    mentioned = []
    q_lower = question.lower()
    for f in session.file_list:
        fname = f.split("/")[-1].lower()  # just the filename
        # Check if the filename appears in the question
        if fname in q_lower or f.lower() in q_lower:
            mentioned.append(f)
    return mentioned

def _get_file_chunks(filenames: list[str]) -> str:
    """Get all chunks from specific files directly."""
    file_chunks = []
    for chunk in session.all_chunks:
        source = chunk.metadata.get("source", "")
        if source in filenames:
            file_chunks.append(f"--- File: {source} ---\n{chunk.page_content}")
    return "\n\n".join(file_chunks)

def _smart_context(question: str) -> str:
    """Hybrid context: direct file lookup + semantic search."""
    parts = []
    
    # Check if user is asking about specific files
    mentioned_files = _extract_mentioned_files(question)
    if mentioned_files:
        file_content = _get_file_chunks(mentioned_files)
        if file_content:
            parts.append(f"=== DIRECTLY REQUESTED FILE CONTENT ===\n{file_content}")
    
    # Also get semantic search results
    if session.vector_db:
        retriever = session.vector_db.as_retriever(search_type="mmr", search_kwargs={"k": 6, "fetch_k": 20})
        semantic_docs = retriever.invoke(question)
        semantic_context = format_docs(semantic_docs)
        if semantic_context:
            parts.append(f"=== SEMANTICALLY RELEVANT CONTEXT ===\n{semantic_context}")
    
    return "\n\n".join(parts) if parts else "No relevant context found."

def format_chat_history() -> str:
    if not session.chat_history:
        return "No previous conversation history."
    formatted = []
    for msg in session.chat_history:
        role = "User" if msg["role"] == "user" else "Assistant"
        formatted.append(f"{role}: {msg['content']}")
    return "\n".join(formatted)

# Pydantic models
class IndexRequest(BaseModel):
    repo: str
    branch: str = "main"

class ChatRequest(BaseModel):
    question: str

class StatusResponse(BaseModel):
    indexed: bool
    indexing: bool
    repo: Optional[str]
    branch: Optional[str]
    file_count: int
    chunk_count: int
    error: Optional[str]
    file_list: list[str]

# Routes
@app.get("/")
def root():
    return {"status": "GitHub Chatbot API is running"}

@app.get("/status", response_model=StatusResponse)
def get_status():
    return StatusResponse(
        indexed=session.rag_chain is not None,
        indexing=session.indexing,
        repo=session.repo,
        branch=session.branch,
        file_count=session.file_count,
        chunk_count=session.chunk_count,
        error=session.error,
        file_list=session.file_list,
    )

@app.post("/index")
async def index_repo(req: IndexRequest):
    """Kick off background indexing of a GitHub repo."""
    if session.indexing:
        raise HTTPException(status_code=409, detail="Indexing already in progress.")

    repo = normalize_repo(req.repo)
    if not repo:
        raise HTTPException(status_code=400, detail="Invalid repo format. Use owner/repo or full GitHub URL.")

    github_token = os.getenv("GITHUB_PERSONAL_ACCESS_TOKEN", "")
    if not github_token:
        raise HTTPException(status_code=500, detail="GITHUB_PERSONAL_ACCESS_TOKEN not set in .env")

    # Reset session
    session.repo = repo
    session.branch = req.branch
    session.rag_chain = None
    session.file_count = 0
    session.chunk_count = 0
    session.error = None
    session.file_list = []
    session.chat_history = []
    session.indexing = True

    asyncio.create_task(_run_indexing(repo, req.branch, github_token))
    return {"message": f"Indexing started for {repo}@{req.branch}"}

def _get_latest_commit_sha(repo: str, branch: str, token: str) -> Optional[str]:
    """Fetch latest commit SHA of the branch from GitHub API."""
    url = f"https://api.github.com/repos/{repo}/branches/{branch}"
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"token {token}")
    req.add_header("User-Agent", "GitHub-Chatbot-Loader")
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode("utf-8"))
            return data["commit"]["sha"]
    except Exception as e:
        print(f"[Warning] Failed to fetch commit SHA for {repo}@{branch}: {e}")
        return None

def _load_cache_metadata(metadata_file: Path) -> dict:
    with open(metadata_file, "rb") as f:
        return pickle.load(f)

def _load_faiss_db(cache_dir: Path, embeddings):
    return FAISS.load_local(str(cache_dir), embeddings, allow_dangerous_deserialization=True)

def _save_cache(repo: str, branch: str, sha: str, db, metadata: dict):
    cache_base = Path("cache")
    repo_prefix = f"{repo.replace('/', '_')}_{branch}_"
    if cache_base.exists():
        for item in cache_base.iterdir():
            if item.is_dir() and item.name.startswith(repo_prefix):
                try:
                    shutil.rmtree(item)
                    print(f"[Cache] Removed old cache: {item.name}")
                except Exception as cleanup_err:
                    print(f"[Cache] Failed to remove old cache {item.name}: {cleanup_err}")
                    
    cache_dir = cache_base / f"{repo_prefix}{sha}"
    cache_dir.mkdir(parents=True, exist_ok=True)
    db.save_local(str(cache_dir))
    
    metadata_file = cache_dir / "metadata.pkl"
    with open(metadata_file, "wb") as f:
        pickle.dump(metadata, f)
    print(f"[Cache] Saved index and metadata to {cache_dir}")

async def _run_indexing(repo: str, branch: str, token: str):
    """Background task: load → split → embed → store."""
    try:
        loop = asyncio.get_event_loop()
        
        # 1. Fetch latest SHA to check cache
        sha = await loop.run_in_executor(None, _get_latest_commit_sha, repo, branch, token)
        
        cache_loaded = False
        if sha:
            cache_dir = Path("cache") / f"{repo.replace('/', '_')}_{branch}_{sha}"
            metadata_file = cache_dir / "metadata.pkl"
            if cache_dir.exists() and metadata_file.exists():
                try:
                    print(f"[Cache] Loading cached index for {repo}@{branch} (SHA: {sha})")
                    meta = await loop.run_in_executor(None, _load_cache_metadata, metadata_file)
                    
                    embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")
                    db = await loop.run_in_executor(None, _load_faiss_db, cache_dir, embeddings)
                    
                    session.file_count = meta["file_count"]
                    session.file_list = meta["file_list"]
                    session.chunk_count = meta["chunk_count"]
                    session.all_chunks = meta["all_chunks"]
                    session.vector_db = db
                    cache_loaded = True
                except Exception as cache_err:
                    print(f"[Cache] Failed to load cache: {cache_err}. Falling back to fresh indexing.")
        
        if not cache_loaded:
            # Load documents
            docs = await loop.run_in_executor(None, _load_docs, repo, branch, token)
            session.file_count = len(docs)
            session.file_list = list({d.metadata.get("source", "") for d in docs})

            chunks = await loop.run_in_executor(None, _split_docs, docs)
            session.chunk_count = len(chunks)

            db = await loop.run_in_executor(None, _build_index, chunks)
            session.vector_db = db
            session.all_chunks = chunks
            
            # Save cache if SHA is available
            if sha:
                try:
                    await loop.run_in_executor(None, _save_cache, repo, branch, sha, db, {
                        "file_count": session.file_count,
                        "file_list": session.file_list,
                        "chunk_count": session.chunk_count,
                        "all_chunks": session.all_chunks
                    })
                except Exception as cache_err:
                    print(f"[Cache] Failed to save cache: {cache_err}")

        model = ChatGoogleGenerativeAI(model="gemini-flash-latest", temperature=0.2)
        template = """You are a helpful assistant that answers questions about a GitHub codebase.
Use the following retrieved code context and the conversation history to answer the question.
When the user asks about a specific file, show the COMPLETE code from that file — do not summarize or skip parts.
If you don't know the answer or the context doesn't contain enough information, say "I cannot find the answer in the codebase."
Do not make up information. When referencing code, mention the file name.

Context:
{context}

Conversation History:
{chat_history}

Question: {question}

Helpful Answer:"""
        prompt = ChatPromptTemplate.from_template(template)
        session.rag_chain = (
            {
                "context": lambda x: _smart_context(x),
                "chat_history": lambda x: format_chat_history(),
                "question": RunnablePassthrough()
            }
            | prompt | model | StrOutputParser()
        )
        session.error = None
    except Exception as e:
        session.error = str(e)
        session.rag_chain = None
    finally:
        session.indexing = False

def _load_docs(repo, branch, token):
    docs = []
    url = f"https://api.github.com/repos/{repo}/zipball/{branch}"
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"token {token}")
    req.add_header("User-Agent", "GitHub-Chatbot-Loader")
    
    try:
        with urllib.request.urlopen(req) as response:
            zip_data = response.read()
    except Exception as e:
        raise Exception(f"Failed to download repository zipball: {str(e)}")

    try:
        with zipfile.ZipFile(io.BytesIO(zip_data)) as z:
            for member in z.infolist():
                if member.is_dir():
                    continue
                
                # Skip oversized files (likely auto-generated)
                if member.file_size > MAX_FILE_SIZE:
                    continue
                
                parts = Path(member.filename).parts
                if len(parts) <= 1:
                    continue
                
                # Reconstruct relative path inside repo (skip the top-level repo folder)
                relative_path = "/".join(parts[1:])
                
                if should_include(relative_path):
                    try:
                        content_bytes = z.read(member)
                        content = content_bytes.decode("utf-8")
                        docs.append(Document(
                            page_content=content,
                            metadata={"source": relative_path}
                        ))
                    except UnicodeDecodeError:
                        continue
    except Exception as e:
        raise Exception(f"Failed to extract files from zipball: {str(e)}")
        
    return docs

def _split_docs(docs):
    default_splitter = RecursiveCharacterTextSplitter(chunk_size=2500, chunk_overlap=200)
    all_chunks = []
    for doc in docs:
        ext = Path(doc.metadata.get("source", "")).suffix.lower()
        lang = EXTENSION_LANGUAGE_MAP.get(ext)
        splitter = (
            RecursiveCharacterTextSplitter.from_language(language=lang, chunk_size=2500, chunk_overlap=200)
            if lang else default_splitter
        )
        all_chunks.extend(splitter.split_documents([doc]))
    return all_chunks

def _build_index(chunks):
    embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")
    BATCH = 100  # Max batch size for Gemini embedding API
    MAX_RETRIES = 5
    total_batches = (len(chunks) + BATCH - 1) // BATCH
    db = None
    
    # We want to maintain at least 4.5 seconds between the start of embedding requests
    last_request_time = 0.0
    
    for i in range(0, len(chunks), BATCH):
        batch_num = i // BATCH + 1
        batch = chunks[i: i + BATCH]
        
        # Enforce rate-limiting (max 15 RPM -> 1 request per 4 seconds, using 4.5s buffer)
        elapsed = time.time() - last_request_time
        MIN_INTERVAL = 4.5
        if elapsed < MIN_INTERVAL and i > 0:
            sleep_time = MIN_INTERVAL - elapsed
            print(f"[Rate limit] Throttling: sleeping for {sleep_time:.2f}s to respect 15 RPM quota...")
            time.sleep(sleep_time)
            
        last_request_time = time.time()
        print(f"[Embedding] Batch {batch_num}/{total_batches} ({len(batch)} chunks)")
        
        for attempt in range(MAX_RETRIES):
            try:
                if db is None:
                    db = FAISS.from_documents(batch, embeddings)
                else:
                    db.add_documents(batch)
                break  # Success, move to next batch
            except Exception as e:
                error_str = str(e)
                if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                    # Exponential backoff with jitter: 5s, 10s, 20s, 40s, 80s
                    jitter = random.uniform(0.5, 1.5)
                    wait_time = ((2 ** attempt) * 5) * jitter
                    print(f"[Rate limit] Batch {batch_num}: retrying in {wait_time:.2f}s (attempt {attempt + 1}/{MAX_RETRIES}) due to 429")
                    time.sleep(wait_time)
                    if attempt == MAX_RETRIES - 1:
                        raise Exception(f"Rate limit exceeded after {MAX_RETRIES} retries. Try again later or use a paid API key.")
                else:
                    raise
    return db

@app.post("/chat")
async def chat(req: ChatRequest):
    """Stream the RAG answer as SSE."""
    if not session.rag_chain:
        raise HTTPException(status_code=400, detail="No repo indexed yet. Call /index first.")

    async def token_stream() -> AsyncGenerator[str, None]:
        try:
            full_response = []
            async for chunk in session.rag_chain.astream(req.question):
                full_response.append(chunk)
                yield f"data: {chunk}\n\n"
            
            # Save conversation history after a successful generation
            answer = "".join(full_response)
            session.chat_history.append({"role": "user", "content": req.question})
            session.chat_history.append({"role": "assistant", "content": answer})
            
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: Error: {str(e)}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(token_stream(), media_type="text/event-stream")

@app.delete("/session")
def clear_session():
    session.repo = None
    session.branch = None
    session.rag_chain = None
    session.vector_db = None
    session.all_chunks = []
    session.file_count = 0
    session.chunk_count = 0
    session.error = None
    session.file_list = []
    session.chat_history = []
    session.indexing = False
    return {"message": "Session cleared."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
