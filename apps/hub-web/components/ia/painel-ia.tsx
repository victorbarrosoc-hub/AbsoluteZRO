'use client'
/**
 * O painel da IA do ecossistema, a mesma em todas as plataformas: saudação com o orbe, sugestões, o campo de conversa e
 * "Conversas" (uma gaveta com as conversas de cada plataforma, cada grupo recolhível). No HUB aparecem todas; o app de
 * cada plataforma mostra as dele. Fala com /api/v1/ia (streaming NDJSON). Sem IA ligada ou sem crédito, diz isso.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react'
import { ProductMark, ZroSymbol } from '@zro/ui'
import { Icon } from '../icons'
import { Orbe, type OrbeEstado } from './orbe'
import { TextoIa } from './texto-ia'

export type IaPlataforma = { id: string; nome: string; cor: CSSProperties }
type Conversa = { id: string; titulo: string; produto: string | null; produtoNome: string | null; atualizada: string }
type Mensagem = { id: string; papel: 'user' | 'assistant'; texto: string; erro?: boolean }
type Creditos = { usados: number; limite: number | null; renova_em: string } | null

const QUANDO = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })
const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

function quando(iso: string) {
  const d = new Date(iso)
  return new Date().toDateString() === d.toDateString() ? HORA.format(d) : QUANDO.format(d)
}

export function PainelIa({
  nome,
  saudacao,
  ligada,
  creditos: creditosIniciais,
  plataformas,
  sugestoes,
  apoio,
}: {
  nome: string
  saudacao: string
  ligada: boolean
  creditos: Creditos
  /** Plataformas na ordem do ciclo (para agrupar as conversas). */
  plataformas: IaPlataforma[]
  sugestoes: string[]
  apoio: string
}) {
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [ativa, setAtiva] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [lendo, setLendo] = useState<string | null>(null)
  const [foco, setFoco] = useState(false)
  const [gaveta, setGaveta] = useState(false)
  const [creditos, setCreditos] = useState<Creditos>(creditosIniciais)
  const [aviso, setAviso] = useState<string | null>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const fim = useRef<HTMLDivElement>(null)
  const parar = useRef<AbortController | null>(null)

  const semCredito = !!creditos && (creditos.limite === null || creditos.usados >= creditos.limite)
  const podeEscrever = ligada && !semCredito

  const carregarConversas = useCallback(async () => {
    const r = await fetch('/api/v1/ia/conversas', { cache: 'no-store' }).catch(() => null)
    if (r?.ok) setConversas(((await r.json()) as { conversas: Conversa[] }).conversas)
  }, [])

  useEffect(() => {
    void carregarConversas()
  }, [carregarConversas])

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [mensagens, lendo])

  // Esc fecha a gaveta
  useEffect(() => {
    if (!gaveta) return
    const k = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setGaveta(false)
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [gaveta])

  const novaConversa = () => {
    parar.current?.abort()
    setAtiva(null)
    setMensagens([])
    setAviso(null)
    setGaveta(false)
    requestAnimationFrame(() => campo.current?.focus())
  }

  const abrir = async (id: string) => {
    setGaveta(false)
    setAviso(null)
    const r = await fetch(`/api/v1/ia/conversas/${id}`, { cache: 'no-store' }).catch(() => null)
    if (!r?.ok) return setAviso('Não deu para abrir essa conversa.')
    const d = (await r.json()) as { mensagens: Mensagem[] }
    setAtiva(id)
    setMensagens(d.mensagens)
  }

  const apagar = async (id: string) => {
    const r = await fetch(`/api/v1/ia/conversas/${id}`, { method: 'DELETE' }).catch(() => null)
    if (r?.ok || r?.status === 404) {
      setConversas((cs) => cs.filter((c) => c.id !== id))
      if (ativa === id) novaConversa()
    }
  }

  const enviar = async (pergunta: string) => {
    const t = pergunta.trim()
    if (!t || pensando || !podeEscrever) return
    setTexto('')
    setAviso(null)
    setPensando(true)
    const local = `local-${Date.now()}`
    setMensagens((m) => [...m, { id: `${local}-p`, papel: 'user', texto: t }, { id: `${local}-r`, papel: 'assistant', texto: '' }])
    const ctrl = new AbortController()
    parar.current = ctrl
    const escrever = (f: (s: string) => string, erro = false) =>
      setMensagens((m) => m.map((x) => (x.id === `${local}-r` ? { ...x, texto: f(x.texto), erro: erro || x.erro } : x)))
    try {
      const r = await fetch('/api/v1/ia/mensagens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversa: ativa, texto: t }),
        signal: ctrl.signal,
      })
      if (!r.ok || !r.body) {
        const e = (await r.json().catch(() => null)) as { message?: string } | null
        escrever(() => e?.message ?? 'A IA não respondeu. Tente de novo.', true)
        return
      }
      const leitor = r.body.getReader()
      const dec = new TextDecoder()
      let resto = ''
      for (;;) {
        const { value, done } = await leitor.read()
        if (done) break
        resto += dec.decode(value, { stream: true })
        let n: number
        while ((n = resto.indexOf('\n')) >= 0) {
          const linha = resto.slice(0, n).trim()
          resto = resto.slice(n + 1)
          if (!linha) continue
          const ev = JSON.parse(linha) as { tipo: string; id?: string; titulo?: string; t?: string; o_que?: string; mensagem?: string; creditos?: number }
          if (ev.tipo === 'conversa' && ev.id) {
            setAtiva(ev.id)
          } else if (ev.tipo === 'lendo') {
            setLendo(`Lendo ${ev.o_que ?? 'seus dados'}…`)
          } else if (ev.tipo === 'texto' && ev.t) {
            setLendo(null)
            escrever((s) => s + ev.t)
          } else if (ev.tipo === 'fim') {
            if (ev.creditos) setCreditos((c) => (c ? { ...c, usados: c.usados + (ev.creditos ?? 0) } : c))
          } else if (ev.tipo === 'erro') {
            escrever((s) => (s ? `${s}\n\n${ev.mensagem}` : (ev.mensagem ?? '')), true)
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') escrever((s) => s || 'Sem conexão com a IA agora.', true)
    } finally {
      setPensando(false)
      setLendo(null)
      parar.current = null
      void carregarConversas()
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void enviar(texto)
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void enviar(texto)
    }
  }

  const estado: OrbeEstado = !ligada ? 'desligada' : pensando ? 'pensando' : foco || texto ? 'ouvindo' : 'pronta'
  const emConversa = mensagens.length > 0

  // grupos da gaveta: HUB primeiro, depois cada plataforma na ordem do ciclo
  const grupos = [
    { id: null as string | null, nome: 'HUB', cor: {} as CSSProperties },
    ...plataformas.map((p) => ({ id: p.id as string | null, nome: p.nome, cor: p.cor })),
  ]
    .map((g) => ({ ...g, itens: conversas.filter((c) => c.produto === g.id) }))
    .filter((g) => g.itens.length > 0)

  return (
    <div className="ia" data-conversa={emConversa ? 'sim' : undefined}>
      <div className="ia__barra">
        <button type="button" className="ia-pilula" onClick={() => setGaveta(true)} aria-expanded={gaveta} aria-controls="ia-gaveta">
          <Icon name="script" size={15} />
          Conversas
          {conversas.length > 0 && <span className="ia-pilula__n">{conversas.length}</span>}
        </button>
        {emConversa && (
          <button type="button" className="ia-pilula" onClick={novaConversa}>
            <Icon name="plus" size={15} />
            Nova conversa
          </button>
        )}
      </div>

      <div className="ia__corpo">
        {!emConversa ? (
          <div className="ia-inicio">
            <Orbe estado={estado} />
            <p className="ia-inicio__estado" aria-live="polite">
              <i /> {ligada ? (foco || texto ? 'ouvindo' : 'IA da Absolute ZRO') : 'ainda não ligada'}
            </p>
            <h1 className="ia-inicio__titulo">
              <span>{saudacao},</span> <strong>{nome}.</strong>
            </h1>
            <p className="ia-inicio__apoio">{ligada ? apoio : 'A IA do ecossistema chega em breve, a mesma em todas as plataformas.'}</p>
          </div>
        ) : (
          <div className="ia-conversa" aria-live="polite">
            {mensagens.map((m) =>
              m.papel === 'user' ? (
                <p key={m.id} className="ia-msg ia-msg--eu">
                  {m.texto}
                </p>
              ) : (
                <div key={m.id} className={`ia-msg ia-msg--ia${m.erro ? ' ia-msg--erro' : ''}`}>
                  {m.texto ? (
                    <TextoIa texto={m.texto} />
                  ) : (
                    <span className="ia-pensando">
                      <Orbe estado="pensando" tamanho={22} />
                      {lendo ?? 'Pensando…'}
                    </span>
                  )}
                </div>
              ),
            )}
            <div ref={fim} />
          </div>
        )}
      </div>

      <div className="ia__base">
        {!emConversa && podeEscrever && sugestoes.length > 0 && (
          <ul className="ia-sugestoes" aria-label="Sugestões">
            {sugestoes.map((s, i) => (
              <li key={s} style={{ ['--i' as string]: i }}>
                <button type="button" onClick={() => void enviar(s)}>
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="ia-campo" onSubmit={onSubmit} data-desligado={podeEscrever ? undefined : 'sim'}>
          <label htmlFor="ia-texto" className="zro-sr-only">
            Mensagem para a IA
          </label>
          <textarea
            id="ia-texto"
            ref={campo}
            rows={1}
            value={texto}
            maxLength={8000}
            placeholder={
              !ligada ? 'A IA ainda não foi ligada' : semCredito ? 'Os créditos de IA deste mês acabaram' : emConversa ? 'Continue…' : 'Pergunte ou peça algo…'
            }
            disabled={!podeEscrever}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={onKey}
            onFocus={() => setFoco(true)}
            onBlur={() => setFoco(false)}
          />
          {pensando ? (
            <button type="button" className="ia-campo__enviar" onClick={() => parar.current?.abort()} aria-label="Parar a resposta" title="Parar">
              <span className="ia-campo__parar" aria-hidden="true" />
            </button>
          ) : (
            <button type="submit" className="ia-campo__enviar" disabled={!texto.trim() || !podeEscrever} aria-label="Enviar">
              <Icon name="arrow" size={16} style={{ rotate: '-90deg' }} />
            </button>
          )}
        </form>
        <p className="ia-rodape">
          <span className="ia-rodape__ponto" data-ligada={ligada ? 'sim' : undefined} aria-hidden="true" />
          {ligada ? 'IA ligada' : 'IA desligada'}
          <span aria-hidden="true">·</span>
          {aviso ??
            (creditos?.limite != null
              ? `${Math.max(0, creditos.limite - creditos.usados).toLocaleString('pt-BR')} créditos de IA no mês`
              : emConversa
                ? 'Outro assunto: nova conversa'
                : 'Você confere antes de qualquer ação')}
        </p>
      </div>

      {/* gaveta das conversas, separadas por plataforma */}
      <div className="ia-gaveta" id="ia-gaveta" data-aberta={gaveta ? 'sim' : undefined} aria-hidden={!gaveta}>
        <button type="button" className="ia-gaveta__veu" aria-label="Fechar conversas" tabIndex={-1} onClick={() => setGaveta(false)} />
        <aside className="ia-gaveta__painel" aria-label="Conversas">
          <div className="ia-gaveta__topo">
            <p className="ia-gaveta__titulo">Conversas</p>
            <button type="button" className="ia-gaveta__fechar" onClick={() => setGaveta(false)} aria-label="Fechar" tabIndex={gaveta ? 0 : -1}>
              ✕
            </button>
          </div>
          <button type="button" className="ia-gaveta__nova" onClick={novaConversa} tabIndex={gaveta ? 0 : -1}>
            <Icon name="plus" size={15} />
            Nova conversa
          </button>
          {grupos.length === 0 && <p className="ia-gaveta__vazio">As conversas de todas as plataformas aparecem aqui.</p>}
          {grupos.map((g) => (
            <details key={g.id ?? 'hub'} className="ia-grupo" open style={g.cor}>
              <summary tabIndex={gaveta ? 0 : -1}>
                {g.id ? <ProductMark productId={g.id} name={g.nome} size={22} /> : <ZroSymbol size={20} />}
                <span>{g.nome}</span>
                <span className="ia-grupo__n">{g.itens.length}</span>
                <Icon name="chevron" size={14} className="ia-grupo__seta" />
              </summary>
              <ul>
                {g.itens.map((c) => (
                  <li key={c.id} data-ativa={c.id === ativa ? 'sim' : undefined}>
                    <button type="button" className="ia-grupo__abrir" onClick={() => void abrir(c.id)} tabIndex={gaveta ? 0 : -1}>
                      <span>{c.titulo}</span>
                      <time dateTime={c.atualizada}>{quando(c.atualizada)}</time>
                    </button>
                    <button
                      type="button"
                      className="ia-grupo__apagar"
                      onClick={() => void apagar(c.id)}
                      aria-label={`Apagar a conversa ${c.titulo}`}
                      title="Apagar"
                      tabIndex={gaveta ? 0 : -1}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </aside>
      </div>
    </div>
  )
}
