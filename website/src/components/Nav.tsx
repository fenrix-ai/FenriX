import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Logo } from './Logo'

const links = [
  { href: '#work', label: 'Work' },
  { href: '#about', label: 'About' },
  { href: '#team', label: 'Team' },
  { href: '#contact', label: 'Contact' }
]

export function Nav() {
  const [open, setOpen] = useState(false)
  return (
    <header className="fixed top-0 inset-x-0 z-40 backdrop-blur-md bg-bg/75 border-b border-white/5">
      <nav className="container-page flex items-center justify-between h-16">
        <a href="#top" className="flex items-center gap-2 font-display font-bold text-lg tracking-tightish">
          <Logo size={28} eyeAnimated={false} />
          <span>Fenri<span className="text-cyan">X</span></span>
        </a>
        <ul className="hidden md:flex items-center gap-8 text-sm text-ink-dim">
          {links.map(l => (
            <li key={l.href}>
              <a href={l.href} className="hover:text-ink transition-colors">{l.label}</a>
            </li>
          ))}
        </ul>
        <a
          href="#contact"
          className="hidden md:inline-flex items-center px-4 py-2 text-sm font-medium rounded-md bg-cyan text-bg hover:bg-cyan-soft transition-colors"
        >
          Get in touch
        </a>
        <button
          className="md:hidden p-2 text-ink"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>
      {open && (
        <ul className="md:hidden border-t border-white/5 py-4 px-6 space-y-3">
          {links.map(l => (
            <li key={l.href}>
              <a href={l.href} onClick={() => setOpen(false)} className="block py-1 text-ink-dim hover:text-ink">{l.label}</a>
            </li>
          ))}
          <li>
            <a href="#contact" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm font-medium rounded-md bg-cyan text-bg text-center">
              Get in touch
            </a>
          </li>
        </ul>
      )}
    </header>
  )
}
