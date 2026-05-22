const BASE = '/api'

export interface StatusResponse {
  indexed: boolean
  indexing: boolean
  repo: string | null
  branch: string | null
  file_count: number
  chunk_count: number
  error: string | null
  file_list: string[]
}

export async function getStatus(): Promise<StatusResponse> {
  const res = await fetch(`${BASE}/status`)
  if (!res.ok) throw new Error('Failed to fetch status')
  return res.json()
}

export async function indexRepo(repo: string, branch: string): Promise<void> {
  const res = await fetch(`${BASE}/index`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo, branch }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Failed to start indexing')
  }
}

export async function clearSession(): Promise<void> {
  await fetch(`${BASE}/session`, { method: 'DELETE' })
}

export async function streamChat(
  question: string,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void
): Promise<void> {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  })

  if (!res.ok) {
    const err = await res.json()
    onError(err.detail || 'Chat request failed')
    return
  }

  const reader = res.body?.getReader()
  const decoder = new TextDecoder()
  if (!reader) { onError('No stream'); return }

  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const token = line.slice(6)
        if (token === '[DONE]') { onDone(); return }
        onToken(token)
      }
    }
  }
  onDone()
}
