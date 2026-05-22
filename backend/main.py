"""
GitHub Codebase Chatbot — FastAPI Backend
==========================================
Wraps the RAG pipeline and exposes REST + SSE endpoints for the Next.js frontend.
"""

import os
import re
import asyncio
import getpass
from pathlib import Path
from typing import Optional, AsyncGenerator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

from langchain_community.document_loaders import GithubFileLoader
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
    file_count: int = 0
    chunk_count: int = 0
    indexing: bool = False
    error: Optional[str] = None
    file_list: list[str] = []

session = Session()

# ── Language map & filters ────────────────────────────────────────────────────
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
}
EXCLUDED_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv",
    "dist", "build", ".next", ".nuxt", "coverage",
}

def should_include(file_path: str) -> bool:
    p = Path(file_path)
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

# Safe loader
class SafeGithubFileLoader(GithubFileLoader):
    def get_file_content_by_path(self, path):
        try:
            return super().get_file_content_by_path(path)
        except UnicodeDecodeError:
            return None

    def lazy_load(self):
        for doc in super().lazy_load():
            if doc.page_content is not None:
                yield doc

def format_docs(docs):
    formatted = []
    for doc in docs:
        source = doc.metadata.get("source", "unknown")
        formatted.append(f"--- File: {source} ---\n{doc.page_content}")
    return "\n\n".join(formatted)

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
    session.indexing = True

    asyncio.create_task(_run_indexing(repo, req.branch, github_token))
    return {"message": f"Indexing started for {repo}@{req.branch}"}

async def _run_indexing(repo: str, branch: str, token: str):
    """Background task: load → split → embed → store."""
    try:
        loop = asyncio.get_event_loop()
        docs = await loop.run_in_executor(None, _load_docs, repo, branch, token)
        session.file_count = len(docs)
        session.file_list = list({d.metadata.get("source", "") for d in docs})

        chunks = await loop.run_in_executor(None, _split_docs, docs)
        session.chunk_count = len(chunks)

        db = await loop.run_in_executor(None, _build_index, chunks)
        retriever = db.as_retriever(search_type="mmr", search_kwargs={"k": 6, "fetch_k": 20})

        model = ChatGoogleGenerativeAI(model="gemini-flash-latest", temperature=0.2)
        template = """You are a helpful assistant that answers questions about a GitHub codebase.
Use ONLY the following code context retrieved from the repository to answer the question.
If you don't know the answer or the context doesn't contain enough information, say "I cannot find the answer in the codebase."
Do not make up information. When referencing code, mention the file name.

Context:
{context}

Question: {question}

Helpful Answer:"""
        prompt = ChatPromptTemplate.from_template(template)
        session.rag_chain = (
            {"context": retriever | format_docs, "question": RunnablePassthrough()}
            | prompt | model | StrOutputParser()
        )
        session.error = None
    except Exception as e:
        session.error = str(e)
        session.rag_chain = None
    finally:
        session.indexing = False

def _load_docs(repo, branch, token):
    loader = SafeGithubFileLoader(
        repo=repo, branch=branch, access_token=token,
        github_api_url="https://api.github.com", file_filter=should_include,
    )
    return loader.load()

def _split_docs(docs):
    default_splitter = RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=200)
    all_chunks = []
    for doc in docs:
        ext = Path(doc.metadata.get("source", "")).suffix.lower()
        lang = EXTENSION_LANGUAGE_MAP.get(ext)
        splitter = (
            RecursiveCharacterTextSplitter.from_language(language=lang, chunk_size=1500, chunk_overlap=200)
            if lang else default_splitter
        )
        all_chunks.extend(splitter.split_documents([doc]))
    return all_chunks

def _build_index(chunks):
    embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")
    BATCH = 100
    db = None
    for i in range(0, len(chunks), BATCH):
        batch = chunks[i: i + BATCH]
        if db is None:
            db = FAISS.from_documents(batch, embeddings)
        else:
            db.add_documents(batch)
    return db

@app.post("/chat")
async def chat(req: ChatRequest):
    """Stream the RAG answer as SSE."""
    if not session.rag_chain:
        raise HTTPException(status_code=400, detail="No repo indexed yet. Call /index first.")

    async def token_stream() -> AsyncGenerator[str, None]:
        try:
            loop = asyncio.get_event_loop()
            answer = await loop.run_in_executor(None, session.rag_chain.invoke, req.question)
            # Stream word by word for effect
            words = answer.split(" ")
            for i, word in enumerate(words):
                chunk = word if i == len(words) - 1 else word + " "
                yield f"data: {chunk}\n\n"
                await asyncio.sleep(0.02)
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
    session.file_count = 0
    session.chunk_count = 0
    session.error = None
    session.file_list = []
    session.indexing = False
    return {"message": "Session cleared."}
