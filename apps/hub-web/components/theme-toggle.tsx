'use client'
/**
 * Seletor claro/escuro. Troca na hora (atributo no <html> + cookie), sem recarregar a página.
 * Sem JavaScript, o mesmo formulário grava o tema pelo servidor (themeAction).
 */
import { useEffect, useState, type MouseEvent } from 'react'
import { themeAction } from '@/lib/actions/auth'
import { Icon } from './icons'
import { BackPath } from './nav'

type Theme = 'light' | 'dark'

const current = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null)
  useEffect(() => setTheme(current()), [])

  function choose(next: Theme, e: MouseEvent) {
    e.preventDefault()
    const root = document.documentElement
    root.classList.add('theme-switching')
    root.dataset.theme = next
    document.cookie = `zro_theme=${next}; path=/; max-age=31536000; samesite=lax`
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#f4f4f6' : '#0e0e10')
    setTheme(next)
    window.setTimeout(() => root.classList.remove('theme-switching'), 400)
  }

  return (
    <form action={themeAction} className="theme-toggle" data-theme-value={theme ?? undefined} aria-label="Tema">
      <BackPath />
      <span className="theme-toggle__thumb" aria-hidden="true" />
      <button type="submit" name="theme" value="light" aria-pressed={theme === 'light'} title="Tema claro" onClick={(e) => choose('light', e)}>
        <Icon name="sun" size={16} />
        <span className="zro-sr-only">Tema claro</span>
      </button>
      <button type="submit" name="theme" value="dark" aria-pressed={theme === 'dark'} title="Tema escuro" onClick={(e) => choose('dark', e)}>
        <Icon name="moon" size={16} />
        <span className="zro-sr-only">Tema escuro</span>
      </button>
    </form>
  )
}
