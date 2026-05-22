'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Github, Zap, MessageSquare, FileSearch, Info } from 'lucide-react'
import clsx from 'clsx'

const links = [
  { href: '/', label: 'Home', icon: Zap },
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/docs', label: 'Files', icon: FileSearch },
  { href: '/about', label: 'About', icon: Info },
]

export default function Navbar() {
  const path = usePathname()

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded border border-[var(--accent)] flex items-center justify-center group-hover:bg-[var(--accent-dim)] transition-colors">
            <Zap size={14} className="text-[var(--accent)]" />
          </div>
          <span className="font-display font-bold text-sm tracking-widest uppercase text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
            CodeLens
          </span>
        </Link>

        {/* Links */}
        <div className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = path === href
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono tracking-wide transition-all',
                  active
                    ? 'text-[var(--accent)] bg-[var(--accent-dim)]'
                    : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
                )}
              >
                <Icon size={13} />
                {label}
              </Link>
            )
          })}
        </div>

        {/* GitHub link */}
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
        >
          <Github size={18} />
        </a>
      </div>
    </nav>
  )
}
