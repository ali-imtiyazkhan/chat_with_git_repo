'use client'
import Navbar from '@/components/Navbar'
import { Github, Zap, ExternalLink } from 'lucide-react'

const STACK = [
  { name: 'Next.js 14', role: 'Frontend framework', href: 'https://nextjs.org', color: '#ffffff' },
  { name: 'FastAPI', role: 'Python backend + SSE streaming', href: 'https://fastapi.tiangolo.com', color: '#009688' },
  { name: 'LangChain', role: 'RAG orchestration', href: 'https://langchain.com', color: '#1c7ef5' },
  { name: 'Gemini Flash', role: 'LLM for question answering', href: 'https://ai.google.dev', color: '#4285f4' },
  { name: 'Google Embeddings', role: 'Vector embedding model', href: 'https://ai.google.dev', color: '#34a853' },
  { name: 'FAISS', role: 'In-memory vector store', href: 'https://github.com/facebookresearch/faiss', color: '#0668e1' },
  { name: 'PyGitHub', role: 'GitHub API client', href: 'https://pygithub.readthedocs.io', color: '#6e40c9' },
  { name: 'Tailwind CSS', role: 'Styling', href: 'https://tailwindcss.com', color: '#38bdf8' },
]

const ARCHITECTURE = [
  { step: '1', title: 'Document Loading', detail: 'SafeGithubFileLoader fetches all non-binary files via the GitHub Trees API using a PAT. Binary and excluded files are skipped gracefully.' },
  { step: '2', title: 'Language-Aware Splitting', detail: 'RecursiveCharacterTextSplitter.from_language() splits code along syntactic boundaries — functions and classes — preserving structure.' },
  { step: '3', title: 'Embedding', detail: 'Google\'s gemini-embedding-001 model creates dense vector representations of each chunk, batched to avoid rate limits.' },
  { step: '4', title: 'FAISS Indexing', detail: 'Chunks are stored in an in-memory FAISS index. MMR (Maximal Marginal Relevance) retrieval fetches 6 diverse chunks per query.' },
  { step: '5', title: 'RAG Chain', detail: 'A LangChain LCEL chain composes retrieval → prompt formatting → Gemini Flash → output parsing into a single invokable pipeline.' },
  { step: '6', title: 'Streaming Response', detail: 'FastAPI streams the LLM response word-by-word using Server-Sent Events (SSE). The Next.js frontend renders tokens as they arrive.' },
]

export default function AboutPage() {
  return (
    <div className="noise min-h-screen">
      <Navbar />

      <div className="pt-24 pb-20 px-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-14 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl border border-[var(--accent)] bg-[var(--accent-dim)] mb-6">
            <Zap size={28} className="text-[var(--accent)]" />
          </div>
          <h1 className="font-display text-4xl font-bold mb-3">About CodeLens</h1>
          <p className="text-[var(--muted)] text-base max-w-xl mx-auto leading-relaxed">
            A full-stack RAG application that lets you have a natural conversation with any GitHub repository — without cloning it locally.
          </p>
        </div>

        {/* Architecture */}
        <section className="mb-14">
          <p className="text-[var(--accent)] font-mono text-xs tracking-widest uppercase mb-3">How it works</p>
          <h2 className="font-display text-2xl font-bold mb-6">Architecture</h2>
          <div className="space-y-3">
            {ARCHITECTURE.map(({ step, title, detail }) => (
              <div key={step} className="flex gap-5 p-5 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--border-bright)] transition-colors">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent-dim)] border border-[var(--accent)] shrink-0 text-[var(--accent)] font-mono text-xs font-bold">
                  {step}
                </div>
                <div>
                  <h3 className="font-display font-bold text-sm mb-1">{title}</h3>
                  <p className="text-[var(--muted)] text-xs leading-relaxed">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Tech stack */}
        <section className="mb-14">
          <p className="text-[var(--accent)] font-mono text-xs tracking-widest uppercase mb-3">Built with</p>
          <h2 className="font-display text-2xl font-bold mb-6">Tech Stack</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {STACK.map(({ name, role, href, color }) => (
              <a
                key={name}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--border-bright)] transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                  <div>
                    <p className="font-mono text-sm font-bold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">{name}</p>
                    <p className="text-[var(--muted)] text-xs">{role}</p>
                  </div>
                </div>
                <ExternalLink size={12} className="text-[var(--muted)] group-hover:text-[var(--accent)] transition-colors" />
              </a>
            ))}
          </div>
        </section>

        {/* Setup */}
        <section className="p-6 bg-[var(--surface)] border border-[var(--border)] rounded-2xl">
          <p className="text-[var(--accent)] font-mono text-xs tracking-widest uppercase mb-3">Quick Setup</p>
          <h2 className="font-display text-xl font-bold mb-4">Get running in 3 commands</h2>
          <div className="space-y-3">
            {[
              { label: 'Backend', cmd: 'cd backend && pip install -r requirements.txt && uvicorn main:app --reload' },
              { label: 'Frontend', cmd: 'cd frontend && npm install && npm run dev' },
              { label: '.env', cmd: 'GITHUB_PERSONAL_ACCESS_TOKEN=...\nGOOGLE_API_KEY=...' },
            ].map(({ label, cmd }) => (
              <div key={label} className="code-block">
                <p className="text-[var(--muted)] text-[10px] font-mono uppercase tracking-widest mb-2">{label}</p>
                <pre className="text-[var(--accent)] text-xs whitespace-pre-wrap">{cmd}</pre>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
