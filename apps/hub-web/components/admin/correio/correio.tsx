'use client'
/**
 * Correio do console (ADR 0034): lista à esquerda e leitura à direita no computador; no iPhone, lista → mensagem.
 * Tudo vem das rotas /api/v1/admin/correio (o servidor confere papel e caixa em cada pedido). O HTML chega limpo e com
 * CSP própria; aqui ele só entra num iframe sandbox sem scripts e sem a origem do HUB.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Icon } from '../../icons'

type Caixa = { id: string; endereco: string; nome: string }
type Endereco = { nome: string; endereco: string }
type Resumo = { uid: number; de: Endereco; assunto: string; data: string | null; lida: boolean; tamanho: number }
type Anexo = { indice: number; nome: string; tipo: string; tamanho: number }
type Aberta = {
  uid: number
  de: Endereco[]
  para: Endereco[]
  cc: Endereco[]
  replyTo: Endereco[]
  assunto: string
  data: string | null
  documento: string | null
  imagensBloqueadas: number
  texto: string
  anexos: Anexo[]
}

class ErroDaApi extends Error {}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  let r: Response
  try {
    r = await fetch(url, { ...init, headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}) } })
  } catch {
    throw new ErroDaApi('Sem conexão. Tente de novo.')
  }
  const corpo = (await r.json().catch(() => null)) as ({ message?: string } & T) | null
  if (!r.ok) throw new ErroDaApi(corpo?.message || 'Algo deu errado. Tente de novo.')
  return corpo as T
}

const nomeDe = (e: Endereco | undefined) => (e ? e.nome || e.endereco : 'Sem remetente')

function quando(iso: string | null, longo = false): string {
  if (!iso) return ''
  const d = new Date(iso)
  const hoje = new Date()
  if (longo) return d.toLocaleString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === hoje.toDateString()) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const ontem = new Date(hoje)
  ontem.setDate(hoje.getDate() - 1)
  if (d.toDateString() === ontem.toDateString()) return 'Ontem'
  return d.toLocaleDateString(
    'pt-BR',
    d.getFullYear() === hoje.getFullYear() ? { day: 'numeric', month: 'short' } : { day: '2-digit', month: '2-digit', year: '2-digit' },
  )
}

const tamanho = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`)

const lista = (es: Endereco[]) => es.map((e) => (e.nome ? `${e.nome} <${e.endereco}>` : e.endereco)).join(', ')

type Vista = { tipo: 'nada' } | { tipo: 'mensagem'; uid: number } | { tipo: 'escrever' }

export function Correio({ caixas, inicial }: { caixas: Caixa[]; inicial: string }) {
  const [caixaId, setCaixaId] = useState(inicial)
  const caixa = caixas.find((c) => c.id === caixaId) ?? caixas[0]!
  const [mensagens, setMensagens] = useState<Resumo[] | null>(null)
  const [erroLista, setErroLista] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [vista, setVista] = useState<Vista>({ tipo: 'nada' })
  const [aviso, setAviso] = useState<string | null>(null)

  const carregar = useCallback(async (id: string) => {
    setCarregando(true)
    setErroLista(null)
    try {
      const r = await pedir<{ mensagens: Resumo[] }>(`/api/v1/admin/correio/${id}/mensagens`)
      setMensagens(r.mensagens)
    } catch (e) {
      setErroLista((e as Error).message)
      setMensagens(null)
    } finally {
      setCarregando(false)
    }
  }, [])

  // Só carrega: mexer no endereço (history) aqui faria o Next remontar a tela. O ?caixa= vale na entrada.
  useEffect(() => {
    void carregar(caixaId)
  }, [caixaId, carregar])

  const trocarCaixa = (id: string) => {
    if (id === caixaId) return
    setMensagens(null)
    setVista({ tipo: 'nada' })
    setCaixaId(id)
  }

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 4000)
    return () => clearTimeout(t)
  }, [aviso])

  const abrir = (uid: number) => {
    setVista({ tipo: 'mensagem', uid })
    setMensagens((ms) => ms?.map((m) => (m.uid === uid ? { ...m, lida: true } : m)) ?? ms)
  }

  const naLeitura = vista.tipo !== 'nada'

  return (
    <div className="cor" data-vista={naLeitura ? 'leitura' : 'lista'}>
      <section className="cor-lista" aria-label={`Caixa ${caixa.endereco}`}>
        <header className="cor-lista__topo">
          <div className="cor-lista__titulo">
            <h1>Correio</h1>
            <button type="button" className="cor-icone" onClick={() => void carregar(caixaId)} disabled={carregando} aria-label="Atualizar" title="Atualizar">
              <Icon name="cycle" />
            </button>
            <button type="button" className="glass-btn glass-btn--ink cor-btn" onClick={() => setVista({ tipo: 'escrever' })}>
              Escrever
            </button>
          </div>
          {caixas.length > 1 ? (
            <div className="cor-caixas" role="tablist" aria-label="Caixas">
              {caixas.map((c) => (
                <button key={c.id} type="button" role="tab" aria-selected={c.id === caixaId} title={c.endereco} onClick={() => trocarCaixa(c.id)}>
                  {c.nome}
                </button>
              ))}
            </div>
          ) : (
            <p className="cor-lista__endereco">{caixa.endereco}</p>
          )}
        </header>

        {erroLista ? (
          <div className="cor-erro" role="alert">
            <p>{erroLista}</p>
            <button type="button" className="glass-btn cor-btn" onClick={() => void carregar(caixaId)}>
              Tentar de novo
            </button>
          </div>
        ) : mensagens == null ? (
          <ul className="cor-itens" aria-busy="true" aria-label="Carregando">
            {Array.from({ length: 7 }, (_, i) => (
              <li key={i} className="cor-item cor-item--esqueleto" aria-hidden="true">
                <span />
                <span />
              </li>
            ))}
          </ul>
        ) : mensagens.length === 0 ? (
          <div className="cor-vazio">
            <Icon name="mail" />
            <p>Nada por aqui.</p>
          </div>
        ) : (
          <ul className="cor-itens">
            {mensagens.map((m) => (
              <li key={m.uid}>
                <button
                  type="button"
                  className={`cor-item${m.lida ? '' : ' cor-item--nova'}`}
                  aria-current={vista.tipo === 'mensagem' && vista.uid === m.uid ? 'true' : undefined}
                  onClick={() => abrir(m.uid)}
                >
                  <span className="cor-item__linha">
                    <span className="cor-item__de">
                      {!m.lida && <span className="cor-ponto" role="img" aria-label="Não lida" />}
                      {nomeDe(m.de)}
                    </span>
                    <time className="cor-item__data" dateTime={m.data ?? undefined}>
                      {quando(m.data)}
                    </time>
                  </span>
                  <span className="cor-item__assunto">{m.assunto || '(sem assunto)'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cor-leitura" aria-label="Leitura">
        {vista.tipo === 'mensagem' ? (
          <Leitura key={`${caixaId}:${vista.uid}`} caixa={caixa} uid={vista.uid} voltar={() => setVista({ tipo: 'nada' })} enviado={(t) => setAviso(t)} />
        ) : vista.tipo === 'escrever' ? (
          <Escrever
            caixas={caixas}
            inicial={caixa.id}
            voltar={() => setVista({ tipo: 'nada' })}
            enviado={(t) => {
              setAviso(t)
              setVista({ tipo: 'nada' })
            }}
          />
        ) : (
          <div className="cor-vazio cor-vazio--leitura">
            <Icon name="mail" />
            <p>Escolha uma mensagem.</p>
          </div>
        )}
      </section>

      <p className="cor-aviso" role="status" data-aberto={aviso ? '' : undefined}>
        {aviso}
      </p>
    </div>
  )
}

function Leitura({ caixa, uid, voltar, enviado }: { caixa: Caixa; uid: number; voltar: () => void; enviado: (t: string) => void }) {
  const [m, setM] = useState<Aberta | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [imagens, setImagens] = useState(false)
  const [texto, setTexto] = useState(false)
  const [respondendo, setRespondendo] = useState<false | 'um' | 'todos'>(false)

  useEffect(() => {
    let vivo = true
    setErro(null)
    pedir<{ mensagem: Aberta }>(`/api/v1/admin/correio/${caixa.id}/mensagens/${uid}${imagens ? '?imagens=1' : ''}`)
      .then((r) => vivo && setM(r.mensagem))
      .catch((e: Error) => vivo && setErro(e.message))
    return () => {
      vivo = false
    }
  }, [caixa.id, uid, imagens])

  const outros = m ? [...m.para, ...m.cc].filter((e) => e.endereco !== caixa.endereco).length : 0

  return (
    <article className="cor-msg" aria-busy={!m && !erro}>
      <button type="button" className="cor-voltar" onClick={voltar}>
        <Icon name="chevron" />
        <span>{caixa.nome}</span>
      </button>
      {erro ? (
        <div className="cor-erro" role="alert">
          <p>{erro}</p>
        </div>
      ) : !m ? (
        <div className="cor-msg__esqueleto" aria-label="Carregando">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <>
          <header className="cor-msg__topo">
            <h2>{m.assunto || '(sem assunto)'}</h2>
            <div className="cor-msg__quem">
              <span className="cor-avatar" aria-hidden="true">
                {nomeDe(m.de[0]).slice(0, 1).toUpperCase()}
              </span>
              <span className="cor-msg__de">
                <strong>{nomeDe(m.de[0])}</strong>
                <span title={`Para: ${lista(m.para)}${m.cc.length ? `\nCc: ${lista(m.cc)}` : ''}`}>{m.de[0]?.endereco}</span>
              </span>
              <time dateTime={m.data ?? undefined}>{quando(m.data, true)}</time>
            </div>
            <div className="cor-msg__acoes">
              <button type="button" className="glass-btn glass-btn--ink cor-btn" onClick={() => setRespondendo('um')}>
                Responder
              </button>
              {outros > 0 && (
                <button type="button" className="glass-btn cor-btn" onClick={() => setRespondendo('todos')}>
                  Responder a todos
                </button>
              )}
              {m.documento && (
                <button type="button" className="cor-link" aria-pressed={texto} onClick={() => setTexto((t) => !t)}>
                  {texto ? 'Ver formatado' : 'Ver texto'}
                </button>
              )}
              {m.documento && !texto && m.imagensBloqueadas > 0 && !imagens && (
                <button
                  type="button"
                  className="cor-link"
                  onClick={() => setImagens(true)}
                  title="Imagens de fora ficam bloqueadas para ninguém saber que você abriu."
                >
                  Mostrar imagens
                </button>
              )}
            </div>
          </header>

          {respondendo && (
            <Responder
              caixa={caixa}
              uid={m.uid}
              para={m.replyTo.length ? m.replyTo : m.de}
              todos={respondendo === 'todos'}
              cancelar={() => setRespondendo(false)}
              enviado={(t) => {
                setRespondendo(false)
                enviado(t)
              }}
            />
          )}

          {m.documento && !texto ? (
            <iframe
              className="cor-msg__corpo"
              title={`Mensagem: ${m.assunto || 'sem assunto'}`}
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              srcDoc={m.documento}
            />
          ) : (
            <pre className="cor-msg__texto">{m.texto || '(mensagem sem texto)'}</pre>
          )}

          {m.anexos.length > 0 && (
            <ul className="cor-anexos" aria-label="Anexos">
              {m.anexos.map((a) => (
                <li key={a.indice}>
                  <a href={`/api/v1/admin/correio/${caixa.id}/mensagens/${m.uid}/anexos/${a.indice}`} download={a.nome} title={a.tipo}>
                    <Icon name="clip" />
                    <span>{a.nome}</span>
                    <small>{tamanho(a.tamanho)}</small>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </article>
  )
}

function mensagemDeEnvio(r: { copiaEmEnviadas: boolean }) {
  return r.copiaEmEnviadas ? 'Enviado.' : 'Enviado. A cópia em Enviadas não foi gravada.'
}

function Responder({
  caixa,
  uid,
  para,
  todos,
  cancelar,
  enviado,
}: {
  caixa: Caixa
  uid: number
  para: Endereco[]
  todos: boolean
  cancelar: () => void
  enviado: (t: string) => void
}) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  useEffect(() => campo.current?.focus(), [])

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const texto = String(new FormData(e.currentTarget).get('texto') ?? '')
    setEnviando(true)
    setErro(null)
    try {
      const r = await pedir<{ copiaEmEnviadas: boolean }>(`/api/v1/admin/correio/${caixa.id}/enviar`, {
        method: 'POST',
        body: JSON.stringify({ responderA: uid, texto, todos }),
      })
      enviado(mensagemDeEnvio(r))
    } catch (x) {
      setErro((x as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="cor-compor cor-compor--resposta" onSubmit={enviar}>
      <p className="cor-compor__rota">
        <span>De {caixa.endereco}</span>
        <span title={lista(para)}>
          Para {nomeDe(para[0])}
          {todos ? ' e todos' : ''}
        </span>
      </p>
      <label className="cor-oculto" htmlFor="cor-resposta">
        Resposta
      </label>
      <textarea id="cor-resposta" ref={campo} name="texto" rows={6} required maxLength={100_000} />
      <div className="cor-compor__fim">
        {erro && (
          <p className="cor-compor__erro" role="alert">
            {erro}
          </p>
        )}
        <button type="button" className="cor-link" onClick={cancelar}>
          Cancelar
        </button>
        <button type="submit" className="glass-btn glass-btn--ink cor-btn" disabled={enviando} aria-busy={enviando}>
          <Icon name="send" />
          {enviando ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
    </form>
  )
}

function Escrever({ caixas, inicial, voltar, enviado }: { caixas: Caixa[]; inicial: string; voltar: () => void; enviado: (t: string) => void }) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [comCc, setComCc] = useState(false)

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const de = String(fd.get('de') ?? inicial)
    setEnviando(true)
    setErro(null)
    try {
      const r = await pedir<{ copiaEmEnviadas: boolean }>(`/api/v1/admin/correio/${de}/enviar`, {
        method: 'POST',
        body: JSON.stringify({ para: fd.get('para'), cc: fd.get('cc') ?? '', assunto: fd.get('assunto'), texto: fd.get('texto') }),
      })
      enviado(mensagemDeEnvio(r))
    } catch (x) {
      setErro((x as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="cor-compor" onSubmit={enviar} aria-labelledby="cor-escrever">
      <button type="button" className="cor-voltar" onClick={voltar}>
        <Icon name="chevron" />
        <span>Caixa</span>
      </button>
      <h2 id="cor-escrever">Nova mensagem</h2>
      <div className="cor-campo">
        <label htmlFor="cor-de">De</label>
        {caixas.length > 1 ? (
          <select id="cor-de" name="de" defaultValue={inicial}>
            {caixas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.endereco}
              </option>
            ))}
          </select>
        ) : (
          <>
            <input type="hidden" name="de" value={caixas[0]!.id} />
            <span id="cor-de">{caixas[0]!.endereco}</span>
          </>
        )}
      </div>
      <div className="cor-campo">
        <label htmlFor="cor-para">Para</label>
        <input id="cor-para" name="para" type="text" inputMode="email" autoComplete="off" required />
        {!comCc && (
          <button type="button" className="cor-link" onClick={() => setComCc(true)}>
            Cc
          </button>
        )}
      </div>
      {comCc && (
        <div className="cor-campo">
          <label htmlFor="cor-cc">Cc</label>
          <input id="cor-cc" name="cc" type="text" inputMode="email" autoComplete="off" />
        </div>
      )}
      <div className="cor-campo">
        <label htmlFor="cor-assunto">Assunto</label>
        <input id="cor-assunto" name="assunto" type="text" maxLength={300} />
      </div>
      <label className="cor-oculto" htmlFor="cor-texto">
        Mensagem
      </label>
      <textarea id="cor-texto" name="texto" rows={12} required maxLength={100_000} />
      <div className="cor-compor__fim">
        {erro && (
          <p className="cor-compor__erro" role="alert">
            {erro}
          </p>
        )}
        <button type="submit" className="glass-btn glass-btn--ink cor-btn" disabled={enviando} aria-busy={enviando}>
          <Icon name="send" />
          {enviando ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
    </form>
  )
}
