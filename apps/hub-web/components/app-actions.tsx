'use client'
/**
 * Central de apps dentro do app Absolute ZRO para computador: Instalar, Abrir, Atualizar e Remover cada ferramenta,
 * com progresso. Só aparece quando a página roda no app (window.zroDesktop.apps, ponte do preload); no navegador não
 * renderiza nada e a página mostra o download do Absolute ZRO e, recolhido, o download direto.
 */
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Icon } from './icons'

export type Situacao = {
  id: string
  nome: string
  disponivel: { versao: string; build: number | null; tamanho: number } | null
  instalado: { versao: string | null } | null
  atualizar: boolean
  ocupado: boolean
  /**
   * App 1.3+: atualização em segundo plano ('ao-fechar' = instala quando a ferramenta fechar). 1.4+: 'disponivel' =
   * versão nova avisada, esperando a pessoa tocar em Atualizar (o padrão; "Atualizar sozinho" fica nos Ajustes).
   */
  atualizacao?: { fase: string; versao: string } | null
  /** App 1.4+: o plano da conta não inclui o app (a central não atualiza; nada é apagado). */
  bloqueado?: { plano: string | null } | null
}
type Progresso = {
  id: string
  fase: 'baixando' | 'instalando' | 'pronto' | 'erro' | 'removendo' | 'removido' | 'agendado'
  recebido?: number
  total?: number
  mensagem?: string
}
type Resposta<T> = { ok: boolean; dados?: T; erro?: string }
export type AppsApi = {
  versao: number
  listar: () => Promise<Resposta<Situacao[]>>
  instalar: (id: string) => Promise<Resposta<boolean | 'ao-fechar'>>
  /** App 1.3+: pede para a ferramenta sair, instala e abre de novo. */
  reiniciarEAtualizar?: (id: string) => Promise<Resposta<boolean>>
  /** App 1.4+: atualizar pela central (com progresso e SHA-256; aberta, atualiza ao fechar). */
  atualizar?: (id: string) => Promise<Resposta<unknown>>
  atualizarTudo?: () => Promise<Resposta<unknown>>
  /** App 1.4+: Ajustes deste computador ("Atualizar sozinho" por app, padrão desligado). */
  ajustes?: () => Promise<Resposta<{ atualizarSozinho: Record<string, boolean>; abrirComSistema: boolean | null }>>
  definirAtualizarSozinho?: (id: string, ligado: boolean) => Promise<Resposta<boolean>>
  definirAbrirComSistema?: (ligado: boolean) => Promise<Resposta<boolean>>
  abrir: (id: string) => Promise<Resposta<boolean>>
  remover: (id: string) => Promise<Resposta<boolean>>
  cancelar: (id: string) => Promise<{ ok: boolean }>
  aoProgresso: (fn: (ev: Progresso) => void) => () => void
}

declare global {
  interface Window {
    zroDesktop?: { isDesktop: boolean; plataforma: string; apps?: AppsApi }
  }
}

// Uma lista para a página toda (cada cartão lê dela); refeita quando algo termina.
let lista: Promise<Resposta<Situacao[]>> | null = null
const ouvintes = new Set<() => void>()
function listar(api: AppsApi, nova = false) {
  if (!lista || nova) lista = api.listar()
  return lista
}
function atualizarTodos(api: AppsApi) {
  listar(api, true)
  ouvintes.forEach((f) => f())
}

const mb = (b: number) => (b > 0 ? `${Math.round(b / 1_048_576)} MB` : '')

/** Deep link absolutezro://apps/<id>?acao=…: traz o cartão do app para a vista (sem mexer no foco do leitor de tela). */
export function DestaqueDoApp({ id }: { id: string }) {
  useEffect(() => {
    const el = document.getElementById(`app-${id}`)
    if (!el) return
    const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    requestAnimationFrame(() => el.scrollIntoView({ block: 'center', behavior: reduzir ? 'auto' : 'smooth' }))
  }, [id])
  return null
}

/**
 * `web`: endereço do app no navegador, oferecido quando a ferramenta ainda não tem versão para este computador.
 * `bloqueio`: o plano não inclui o app (decidido no servidor): "Incluso no plano X · Ver planos", sem instalar nem
 * atualizar; o que já está no computador fica. `oferta`: veio do deep link (?acao=atualizar|instalar): a ação já vem
 * em destaque, mas só acontece com o toque da pessoa.
 */
export function AppActions({
  id,
  nome,
  liberado,
  web,
  bloqueio,
  oferta,
}: {
  id: string
  nome: string
  liberado: boolean
  web?: string | null
  bloqueio?: { plano: string | null }
  oferta?: 'atualizar' | 'instalar'
}) {
  const [api, setApi] = useState<AppsApi | null>(null)
  const [s, setS] = useState<Situacao | null>(null)
  const [prog, setProg] = useState<Progresso | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    const a = typeof window !== 'undefined' ? window.zroDesktop?.apps : undefined
    if (!a) return
    // marca a página como "dentro do app" (o preload também marca; aqui não depende do momento da hidratação)
    document.documentElement.classList.add('zro-desktop')
    setApi(a)
    let vivo = true
    const ler = () =>
      listar(a).then((r) => {
        if (!vivo) return
        if (r.ok) setS(r.dados?.find((x) => x.id === id) ?? null)
        else setErro(r.erro ?? 'Não deu para ler os apps deste computador.')
      })
    ler()
    ouvintes.add(ler)
    const off = a.aoProgresso((ev) => {
      if (ev.id !== id) return
      setProg(ev)
      if (ev.fase === 'erro') setErro(ev.mensagem ?? 'Algo deu errado.')
      if (ev.fase === 'pronto' || ev.fase === 'removido' || ev.fase === 'agendado') {
        setProg(null)
        atualizarTodos(a)
      }
    })
    return () => {
      vivo = false
      ouvintes.delete(ler)
      off()
    }
  }, [id])

  if (!api) return null

  async function agir(acao: 'instalar' | 'atualizar' | 'abrir' | 'remover' | 'reiniciarEAtualizar') {
    if (!api) return
    if (acao === 'remover' && !window.confirm(`Remover o ${nome} deste computador? Seus arquivos de trabalho não são apagados.`)) return
    setErro(null)
    // central 1.3 não tem `atualizar`: atualizar é instalar por cima
    const fn = acao === 'atualizar' ? (api.atualizar ?? api.instalar) : api[acao]
    if (!fn) return
    const r = await fn(id)
    if (acao === 'reiniciarEAtualizar' || acao === 'atualizar') atualizarTodos(api)
    if (!r.ok) {
      setErro(r.erro ?? 'Algo deu errado.')
      setProg(null)
    }
  }

  const fase = prog?.fase
  const pct = fase === 'baixando' && prog?.total ? Math.min(100, Math.round(((prog.recebido ?? 0) / prog.total) * 100)) : null
  const plano = bloqueio ? bloqueio.plano : (s?.bloqueado?.plano ?? null)
  const bloqueado = !!bloqueio || !!s?.bloqueado
  const destacar = (a: 'atualizar' | 'instalar') => oferta === a

  let corpo
  if (!s && !bloqueado) corpo = <span className="zro-faint">Conferindo este computador…</span>
  else if (fase === 'baixando')
    corpo = (
      <>
        <span
          className="app-actions__bar"
          role="progressbar"
          aria-label={`Baixando ${nome}`}
          aria-valuenow={pct ?? undefined}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${pct ?? 4}%` }} />
        </span>
        <span className="app-actions__pct">{pct != null ? `${pct}%` : 'Baixando…'}</span>
        <button type="button" className="zro-btn zro-btn--ghost zro-btn--small" onClick={() => api.cancelar(id)}>
          Cancelar
        </button>
      </>
    )
  else if (fase === 'instalando' || fase === 'removendo') corpo = <span className="zro-mute">{fase === 'instalando' ? 'Instalando…' : 'Removendo…'}</span>
  else if (bloqueado)
    corpo = (
      <>
        <span className="app-actions__plano" title={s?.instalado ? `O ${nome} continua neste computador, sem atualizar.` : undefined}>
          <Icon name="lock" size={14} />
          {plano ? `Incluso no plano ${plano}` : 'Fora do seu plano'}
        </span>
        <a className="glass-btn glass-btn--small" href="https://absolutezro.com/planos" target="_blank" rel="noopener noreferrer">
          Ver planos
        </a>
      </>
    )
  else if (!s) corpo = <span className="zro-faint">Conferindo este computador…</span>
  else if (!s.disponivel && !s.instalado)
    corpo = web ? (
      <a className="zro-btn zro-btn--primary zro-btn--small" href={web} target="_blank" rel="noopener noreferrer">
        Abrir na web
        <span className="zro-sr-only"> {nome} (abre no navegador)</span>
      </a>
    ) : (
      <span className="zro-faint">Ainda sem versão para este computador.</span>
    )
  else if (!liberado && !s.instalado)
    corpo = (
      <Link className="zro-btn zro-btn--small" href="/planos">
        Ver planos
      </Link>
    )
  else if (s.instalado)
    corpo = (
      <>
        <button
          type="button"
          className={`zro-btn zro-btn--small${destacar('atualizar') && s.atualizar ? '' : ' zro-btn--primary'}`}
          onClick={() => agir('abrir')}
        >
          Abrir
        </button>
        {s.atualizar && liberado && s.atualizacao?.fase === 'ao-fechar' && api.reiniciarEAtualizar ? (
          <button
            type="button"
            className="zro-btn zro-btn--small"
            onClick={() => agir('reiniciarEAtualizar')}
            title={`Versão ${s.atualizacao.versao} pronta: atualiza quando o ${nome} fechar`}
          >
            Reiniciar e atualizar
          </button>
        ) : (
          s.atualizar &&
          liberado && (
            <button
              type="button"
              className={`zro-btn zro-btn--small${destacar('atualizar') ? ' zro-btn--primary' : ''}`}
              autoFocus={destacar('atualizar')}
              onClick={() => agir('atualizar')}
              title={`Versão ${s.disponivel?.versao}`}
            >
              <Icon name="download" size={14} />
              Atualizar
            </button>
          )
        )}
        <button type="button" className="zro-btn zro-btn--ghost zro-btn--small" onClick={() => agir('remover')}>
          Remover
        </button>
        <span className="zro-faint app-actions__meta">
          {s.atualizacao?.fase === 'ao-fechar'
            ? 'Atualiza ao fechar'
            : s.atualizar && s.disponivel
              ? `${s.disponivel.versao} disponível`
              : s.instalado.versao
                ? `v${s.instalado.versao}`
                : 'Instalado'}
        </span>
      </>
    )
  else
    corpo = (
      <>
        <button type="button" className="zro-btn zro-btn--primary zro-btn--small" autoFocus={destacar('instalar')} onClick={() => agir('instalar')}>
          <Icon name="download" size={14} />
          Instalar
        </button>
        <span className="zro-faint app-actions__meta">
          v{s.disponivel!.versao} {mb(s.disponivel!.tamanho)}
        </span>
      </>
    )

  return (
    <div className="app-actions" aria-live="polite">
      <div className="app-actions__row">{corpo}</div>
      {erro && (
        <p className="zro-field__error app-actions__erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  )
}
