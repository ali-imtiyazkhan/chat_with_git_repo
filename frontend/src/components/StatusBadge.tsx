'use client'
import { useEffect, useState } from 'react'
import { getStatus, StatusResponse } from '@/lib/api'
import { Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react'

export default function StatusBadge() {
  const [status, setStatus] = useState<StatusResponse | null>(null)

  useEffect(() => {
    const poll = async () => {
      try { setStatus(await getStatus()) } catch {}
    }
    poll()
    const id = setInterval(poll, 3000)
    return () => clearInterval(id)
  }, [])

  if (!status) return null

  if (status.indexing) return (
    <div className="flex items-center gap-1.5 text-[var(--warning)] text-xs font-mono">
      <Loader2 size={12} className="animate-spin" />
      <span>Indexing...</span>
    </div>
  )

  if (status.error) return (
    <div className="flex items-center gap-1.5 text-[var(--error)] text-xs font-mono">
      <AlertCircle size={12} />
      <span>Error</span>
    </div>
  )

  if (status.indexed) return (
    <div className="flex items-center gap-1.5 text-[var(--success)] text-xs font-mono">
      <CheckCircle2 size={12} />
      <span className="truncate max-w-[120px]">{status.repo}</span>
    </div>
  )

  return (
    <div className="flex items-center gap-1.5 text-[var(--muted)] text-xs font-mono">
      <Clock size={12} />
      <span>No repo loaded</span>
    </div>
  )
}
