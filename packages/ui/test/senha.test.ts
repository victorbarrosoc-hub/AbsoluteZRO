// Campo de senha com o olho (src/senha.tsx): o botão nunca envia o form e o input mantém o autocomplete.
// Renderiza com o React que o Next do HUB embute (o mesmo das páginas); o react solto na raiz tem outra versão.
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
import { CampoSenha, OlhoSenha, ROTULO_MOSTRAR, ROTULO_OCULTAR } from '../src/senha'

vi.mock('react', () => import('next/dist/compiled/react' + ''))
vi.mock('react/jsx-runtime', () => import('next/dist/compiled/react/jsx-runtime' + ''))
vi.mock('react/jsx-dev-runtime', () => import('next/dist/compiled/react/jsx-dev-runtime' + ''))

const exigir = createRequire(import.meta.url)
const { createElement } = exigir('next/dist/compiled/react') as typeof import('react')
const { renderToStaticMarkup } = exigir('next/dist/compiled/react-dom/server.node') as typeof import('react-dom/server')

const html = (props: Parameters<typeof CampoSenha>[0]) => renderToStaticMarkup(createElement(CampoSenha, props))

describe('CampoSenha', () => {
  it('começa escondida, com o olho como botão comum dentro da caixa', () => {
    const h = html({ id: 'cur', name: 'current', autoComplete: 'current-password', className: 'zro-input', required: true })
    expect(h).toMatch(/^<span class="zro-senha">/)
    expect(h).toContain('type="password"')
    expect(h).toContain('autoComplete="current-password"')
    expect(h).toContain('name="current"')
    expect(h).toContain('class="zro-input"')
    expect(h).toMatch(/<button type="button" class="zro-senha__olho"/)
    expect(h).toContain(`aria-label="${ROTULO_MOSTRAR}"`)
    expect(h).toContain('aria-pressed="false"')
    expect(h).toContain('aria-controls="cur"')
    expect(h).not.toContain('type="submit"')
  })

  it('mantém new-password e desliga corretor e maiúscula automática', () => {
    const h = html({ id: 'nxt', autoComplete: 'new-password', minLength: 8 })
    expect(h).toContain('autoComplete="new-password"')
    expect(h).toContain('minLength="8"')
    expect(h).toContain('spellCheck="false"')
    expect(h).toContain('autoCapitalize="none"')
  })

  it('caixa extra e campo desabilitado desabilitam o olho junto', () => {
    const h = html({ id: 's', caixa: 'conversa__senha', disabled: true })
    expect(h).toContain('class="zro-senha conversa__senha"')
    expect(h.match(/disabled=""/g)).toHaveLength(2)
  })

  it('ícones em currentColor, escondidos do leitor de tela', () => {
    const aberto = renderToStaticMarkup(createElement(OlhoSenha, { aberto: true }))
    const riscado = renderToStaticMarkup(createElement(OlhoSenha, { aberto: false }))
    for (const s of [aberto, riscado]) {
      expect(s).toContain('stroke="currentColor"')
      expect(s).toContain('aria-hidden="true"')
    }
    expect(aberto).toContain('<circle')
    expect(riscado).toContain('M3 3l18 18')
    expect(ROTULO_OCULTAR).toBe('Ocultar senha')
  })
})
