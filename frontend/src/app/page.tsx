'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowRight, Github, Zap, Code2, Brain, Layers, Terminal, CheckCircle2, Loader2 } from 'lucide-react'
import Navbar from '@/components/Navbar'
import { indexRepo, getStatus, StatusResponse } from '@/lib/api'

const FEATURES = [
  { icon: Github, title: 'Any GitHub Repo', desc: 'Public or private. Paste the URL or owner/repo format — we handle the rest.' },
  { icon: Brain, title: 'RAG-Powered AI', desc: 'Retrieval-Augmented Generation finds the most relevant code before answering.' },
  { icon: Code2, title: 'Language-Aware', desc: 'Python, JS, Java, Go, Rust and 14 more — split by syntax, not character count.' },
  { icon: Layers, title: 'Semantic Search', desc: 'FAISS vector index with MMR retrieval for diverse, relevant context every time.' },
]

const STEPS = [
  { n: '01', title: 'Enter repo URL', desc: 'Paste any GitHub repo URL. We normalize it automatically.' },
  { n: '02', title: 'Auto-indexing', desc: 'Files are fetched via API, split by language, and embedded into a vector store.' },
  { n: '03', title: 'Start chatting', desc: 'Ask anything — architecture, logic, bugs, how a function works.' },
]

export default function HomePage() {
  const [repo, setRepo] = useState('')
  const [branch, setBranch] = useState('main')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    getStatus().then(setStatus).catch(() => {})
    const id = setInterval(() => getStatus().then(setStatus).catch(() => {}), 3000)
    return () => clearInterval(id)
  }, [])

  const handleIndex = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!repo.trim()) return
    setLoading(true)
    setError('')
    setSuccess(false)
    try {
      await indexRepo(repo.trim(), branch.trim() || 'main')
      setSuccess(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const isIndexing = status?.indexing
  const isIndexed = status?.indexed

  return (
    <div className="noise min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        {/* Grid bg */}
        <div className="absolute inset-0 grid-bg opacity-30" />
        {/* Radial glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-[var(--accent)] opacity-[0.04] blur-[100px] rounded-full pointer-events-none" />

        <div className="relative max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="fade-up fade-up-1 inline-flex items-center gap-2 border border-[var(--accent)] bg-[var(--accent-dim)] rounded-full px-4 py-1 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
            <span className="text-[var(--accent)] text-xs font-mono tracking-widest uppercase">Powered by Gemini + FAISS</span>
          </div>

          <h1 className="fade-up fade-up-2 font-display text-5xl md:text-7xl font-bold leading-[1.05] mb-6 tracking-tight">
            Chat with any
            <br />
            <span className="text-[var(--accent)] text-glow">GitHub codebase</span>
          </h1>

          <p className="fade-up fade-up-3 text-[var(--muted)] text-lg max-w-xl mx-auto mb-12 leading-relaxed">
            Point CodeLens at any repository. It reads, indexes, and answers your questions about the code — no cloning required.
          </p>

          {/* Repo form */}
          <form onSubmit={handleIndex} className="fade-up fade-up-4 max-w-2xl mx-auto">
            <div className="flex flex-col sm:flex-row gap-3 p-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
              <div className="flex-1 flex items-center gap-2 px-3">
                <Github size={16} className="text-[var(--muted)] shrink-0" />
                <input
                  type="text"
                  value={repo}
                  onChange={e => setRepo(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  className="w-full bg-transparent text-sm font-mono text-[var(--text)] placeholder:text-[var(--muted)] outline-none"
                  disabled={isIndexing || loading}
                />
              </div>
              <div className="flex items-center gap-2 px-3 border-t sm:border-t-0 sm:border-l border-[var(--border)] pt-3 sm:pt-0">
                <Terminal size={14} className="text-[var(--muted)] shrink-0" />
                <input
                  type="text"
                  value={branch}
                  onChange={e => setBranch(e.target.value)}
                  placeholder="main"
                  className="w-24 bg-transparent text-sm font-mono text-[var(--text)] placeholder:text-[var(--muted)] outline-none"
                  disabled={isIndexing || loading}
                />
              </div>
              <button
                type="submit"
                disabled={isIndexing || loading || !repo.trim()}
                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[var(--accent)] text-black font-mono text-sm font-bold rounded-lg hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {(loading || isIndexing) ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                {isIndexing ? 'Indexing…' : 'Index Repo'}
              </button>
            </div>

            {error && (
              <p className="mt-3 text-[var(--error)] text-xs font-mono text-left px-2">{error}</p>
            )}
            {(success || isIndexing) && (
              <p className="mt-3 text-[var(--success)] text-xs font-mono text-left px-2 flex items-center gap-1.5">
                {isIndexing
                  ? <><Loader2 size={12} className="animate-spin" /> Indexing in progress — you can start chatting once complete</>
                  : <><CheckCircle2 size={12} /> Indexing started! Go to Chat when ready.</>
                }
              </p>
            )}
          </form>

          {/* Current session pill */}
          {isIndexed && status?.repo && (
            <div className="fade-up fade-up-5 mt-6 inline-flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-full px-4 py-2">
              <CheckCircle2 size={14} className="text-[var(--success)]" />
              <span className="text-xs font-mono text-[var(--muted)]">Indexed:</span>
              <span className="text-xs font-mono text-[var(--text)]">{status.repo}</span>
              <span className="text-xs font-mono text-[var(--muted)]">·</span>
              <span className="text-xs font-mono text-[var(--accent)]">{status.file_count} files · {status.chunk_count} chunks</span>
              <Link href="/chat" className="ml-1 flex items-center gap-1 text-xs font-mono text-[var(--accent)] hover:underline">
                Chat now <ArrowRight size={11} />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="px-6 pb-24 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map(({ icon: Icon, title, desc }, i) => (
            <div
              key={title}
              className="fade-up p-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--accent)] hover:bg-[var(--accent-dim)] transition-all group"
              style={{ animationDelay: `${0.1 * i}s` }}
            >
              <div className="w-10 h-10 rounded-lg border border-[var(--border)] group-hover:border-[var(--accent)] flex items-center justify-center mb-4 transition-colors">
                <Icon size={18} className="text-[var(--muted)] group-hover:text-[var(--accent)] transition-colors" />
              </div>
              <h3 className="font-display font-bold text-sm mb-2 group-hover:text-[var(--accent)] transition-colors">{title}</h3>
              <p className="text-[var(--muted)] text-xs leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 pb-32 max-w-3xl mx-auto text-center">
        <p className="text-[var(--accent)] font-mono text-xs tracking-widest uppercase mb-3">How it works</p>
        <h2 className="font-display text-3xl font-bold mb-12">Three steps to insight</h2>
        <div className="space-y-4">
          {STEPS.map(({ n, title, desc }) => (
            <div key={n} className="flex items-start gap-5 text-left p-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--border-bright)] transition-colors">
              <span className="font-display text-3xl font-bold text-[var(--border-bright)] leading-none shrink-0">{n}</span>
              <div>
                <h4 className="font-display font-bold text-base mb-1">{title}</h4>
                <p className="text-[var(--muted)] text-sm">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <Link
          href="/chat"
          className="mt-10 inline-flex items-center gap-2 px-8 py-3.5 bg-[var(--accent)] text-black font-mono font-bold text-sm rounded-lg hover:opacity-90 active:scale-95 transition-all"
        >
          Open Chat <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  )
}
