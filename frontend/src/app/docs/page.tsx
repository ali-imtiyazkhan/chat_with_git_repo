'use client'
import { useState, useEffect } from 'react'
import { FileText, Folder, Search, RefreshCw, AlertCircle, FileCode, FileJson, Globe, Braces } from 'lucide-react'
import Navbar from '@/components/Navbar'
import { getStatus, StatusResponse } from '@/lib/api'
import Link from 'next/link'

const EXT_ICON: Record<string, React.ReactNode> = {
  '.py':   <FileCode size={14} className="text-[#3b82f6]" />,
  '.js':   <Braces size={14} className="text-[#eab308]" />,
  '.ts':   <Braces size={14} className="text-[#3b82f6]" />,
  '.jsx':  <Braces size={14} className="text-[#22d3ee]" />,
  '.tsx':  <Braces size={14} className="text-[#22d3ee]" />,
  '.json': <FileJson size={14} className="text-[#f97316]" />,
  '.html': <Globe size={14} className="text-[#ef4444]" />,
  '.md':   <FileText size={14} className="text-[#a3a3a3]" />,
  '.css':  <FileText size={14} className="text-[#ec4899]" />,
}

function getIcon(path: string) {
  const ext = '.' + path.split('.').pop()
  return EXT_ICON[ext] ?? <FileText size={14} className="text-[var(--muted)]" />
}

function groupByDir(files: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {}
  for (const f of files) {
    const parts = f.split('/')
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '(root)'
    if (!groups[dir]) groups[dir] = []
    groups[dir].push(f)
  }
  return groups
}

export default function DocsPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    try { setStatus(await getStatus()) } catch {}
    setLoading(false)
  }

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 4000)
    return () => clearInterval(id)
  }, [])

  const files = status?.file_list ?? []
  const filtered = search ? files.filter(f => f.toLowerCase().includes(search.toLowerCase())) : files
  const grouped = groupByDir(filtered)
  const dirs = Object.keys(grouped).sort()

  // Language breakdown
  const extCounts: Record<string, number> = {}
  for (const f of files) {
    const ext = f.includes('.') ? '.' + f.split('.').pop()! : 'other'
    extCounts[ext] = (extCounts[ext] ?? 0) + 1
  }
  const topExts = Object.entries(extCounts).sort((a, b) => b[1] - a[1]).slice(0, 6)

  return (
    <div className="noise min-h-screen">
      <Navbar />

      <div className="pt-24 pb-16 px-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <p className="text-[var(--accent)] font-mono text-xs tracking-widest uppercase mb-2">Repository Explorer</p>
            <h1 className="font-display text-3xl font-bold">
              {status?.repo ?? 'No repo loaded'}
            </h1>
            {status?.branch && (
              <p className="text-[var(--muted)] text-sm font-mono mt-1">branch: {status.branch}</p>
            )}
          </div>
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 text-xs font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors mt-2"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* Stats row */}
        {status?.indexed && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            {[
              { label: 'Files Indexed', value: status.file_count },
              { label: 'Vector Chunks', value: status.chunk_count },
              { label: 'Directories', value: dirs.length },
              { label: 'File Types', value: Object.keys(extCounts).length },
            ].map(({ label, value }) => (
              <div key={label} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                <p className="text-[var(--muted)] text-xs font-mono mb-1">{label}</p>
                <p className="font-display text-2xl font-bold text-[var(--accent)]">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Language breakdown */}
        {topExts.length > 0 && (
          <div className="mb-8 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
            <p className="text-xs font-mono text-[var(--muted)] mb-3 uppercase tracking-widest">Language Breakdown</p>
            <div className="flex flex-wrap gap-2">
              {topExts.map(([ext, count]) => (
                <div key={ext} className="flex items-center gap-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-full px-3 py-1">
                  {getIcon(`file${ext}`)}
                  <span className="text-xs font-mono text-[var(--text)]">{ext}</span>
                  <span className="text-xs font-mono text-[var(--accent)]">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!status?.indexed && !status?.indexing && (
          <div className="text-center py-20 border border-[var(--border)] rounded-2xl bg-[var(--surface)]">
            <AlertCircle size={32} className="text-[var(--muted)] mx-auto mb-4" />
            <p className="font-display text-lg font-bold mb-2">No repository loaded</p>
            <p className="text-[var(--muted)] text-sm mb-6">Go to the home page to index a GitHub repository first.</p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] text-black font-mono text-sm font-bold rounded-lg hover:opacity-90 transition-all"
            >
              Go to Home
            </Link>
          </div>
        )}

        {status?.indexing && (
          <div className="text-center py-20 border border-[var(--border)] rounded-2xl bg-[var(--surface)]">
            <div className="w-12 h-12 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="font-display text-lg font-bold mb-2">Indexing in progress…</p>
            <p className="text-[var(--muted)] text-sm">Files will appear here once indexing is complete.</p>
          </div>
        )}

        {status?.indexed && files.length > 0 && (
          <>
            {/* Search */}
            <div className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-2.5 mb-6 focus-within:border-[var(--accent)] transition-colors">
              <Search size={14} className="text-[var(--muted)]" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${files.length} files…`}
                className="flex-1 bg-transparent text-sm font-mono text-[var(--text)] placeholder:text-[var(--muted)] outline-none"
              />
              {search && (
                <span className="text-xs font-mono text-[var(--accent)]">{filtered.length} results</span>
              )}
            </div>

            {/* File tree */}
            <div className="space-y-3">
              {dirs.map(dir => (
                <div key={dir} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
                  {/* Directory header */}
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-2)]">
                    <Folder size={13} className="text-[var(--accent)]" />
                    <span className="text-xs font-mono text-[var(--muted)]">{dir}</span>
                    <span className="ml-auto text-xs font-mono text-[var(--border-bright)]">{grouped[dir].length}</span>
                  </div>
                  {/* Files */}
                  <div className="divide-y divide-[var(--border)]">
                    {grouped[dir].map(file => {
                      const name = file.split('/').pop() ?? file
                      return (
                        <div
                          key={file}
                          className="flex items-center gap-2.5 px-4 py-2 hover:bg-[var(--surface-2)] transition-colors"
                        >
                          {getIcon(file)}
                          <span className="text-xs font-mono text-[var(--text)] truncate">{name}</span>
                          <span className="ml-auto text-[10px] font-mono text-[var(--muted)] shrink-0">
                            {file.includes('.') ? '.' + file.split('.').pop() : '—'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
