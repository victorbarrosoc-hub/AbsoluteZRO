'use client'
/**
 * Aprender conversando (Laboratório da Z, ADR 0033 § Aprender conversando): o cartão pequeno que aparece quando a Z
 * reconhece uma correção ("Aprender: … · Guardar · Ajustar · Ignorar") e a seção Aprendizados do Configurar. Nada é
 * guardado sem o titular: o toque em Guardar (ou "pode guardar" na conversa, decidido no servidor).
 */
import { useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import type { ZAprendizado, ZAprendizadoTipo, ZProposta } from '@zro/core'
import { api } from '@/lib/ia/lab/cliente'
import { Icon } from '../../icons'
import { Folha } from '../custos/folha'

export type EstadoDoCartao = 'pendente' | 'ajustando' | 'guardando' | 'guardado' | 'ignorado' | 'erro'
export type Cartao = { proposta: ZProposta; estado: EstadoDoCartao; erro?: string; substituido?: string | null; repetido?: boolean }
export type Guardado = { aprendizado: ZAprendizado; repetido: boolean; substituido: { id: string; texto: string } | null }

/** As seções, na ordem do Configurar (cada tipo mora numa). Espelha Z_APRENDIZADO_SECOES do core. */
export const SECOES: { tipo: ZAprendizadoTipo; nome: string }[] = [
  { tipo: 'tom', nome: 'Personalidade' },
  { tipo: 'regra', nome: 'Regras' },
  { tipo: 'plataforma', nome: 'Por plataforma' },
  { tipo: 'fato', nome: 'Conhecimento' },
  { tipo: 'pronuncia', nome: 'Pronúncia' },
]

const DATA = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** O toque em Guardar: manda a proposta (e o texto ajustado, se houver) com a confirmação explícita. */
export const guardarProposta = (proposta: ZProposta, texto?: string) =>
  api<Guardado>('/aprendizados', { method: 'POST', json: { proposta, confirmar: true, pela: 'toque', ...(texto ? { texto } : {}) } })

export function CartaoDeAprender({
  cartao,
  onGuardar,
  onIgnorar,
  onAjustar,
  compacto,
}: {
  cartao: Cartao
  onGuardar: (texto?: string) => void
  onIgnorar: () => void
  onAjustar: (ajustando: boolean) => void
  compacto?: boolean
}) {
  const { proposta: p, estado } = cartao
  const [texto, setTexto] = useState(p.texto)
  if (estado === 'ignorado') return null
  const guardado = estado === 'guardado'
  return (
    <div
      className="zl-aprender"
      data-estado={estado}
      data-compacto={compacto ? '' : undefined}
      role="group"
      aria-label={guardado ? 'Aprendizado guardado' : 'A Z quer aprender'}
      title={p.gatilho ? `Você disse: “${p.gatilho}”` : undefined}
      style={{ '--i': 0 } as CSSProperties}
    >
      <span className="zl-aprender__selo">
        <Icon name={guardado ? 'check' : 'sparkle'} size={14} />
        {guardado ? (cartao.repetido ? 'Já sabia' : 'Aprendi') : 'Aprender'}
      </span>
      {estado === 'ajustando' ? (
        <form
          className="zl-aprender__ajuste"
          onSubmit={(e) => {
            e.preventDefault()
            onGuardar(texto.trim() !== p.texto ? texto.trim() : undefined)
          }}
        >
          <label className="zro-sr-only" htmlFor={`zl-aj-${p.id}`}>
            Ajustar o aprendizado
          </label>
          <textarea
            id={`zl-aj-${p.id}`}
            className="zro-input zl-aprender__campo"
            rows={2}
            maxLength={240}
            value={texto}
            autoFocus
            onChange={(e) => setTexto(e.target.value)}
          />
          <span className="zl-aprender__acoes">
            <button type="submit" className="glass-btn glass-btn--ink zl-aprender__guardar" disabled={texto.trim().length < 3}>
              Guardar
            </button>
            <button type="button" className="zl-aprender__link" onClick={() => (setTexto(p.texto), onAjustar(false))}>
              Cancelar
            </button>
          </span>
        </form>
      ) : (
        <p className="zl-aprender__texto">{guardado || estado === 'guardando' ? texto : p.texto}</p>
      )}
      {p.conflito && !guardado && estado !== 'ajustando' && (
        <p className="zl-aprender__conflito" title="Se guardar, este fica no lugar do antigo">
          Isso contradiz: “{p.conflito.texto}”
        </p>
      )}
      {guardado && cartao.substituido && <p className="zl-aprender__conflito">No lugar de “{cartao.substituido}”</p>}
      {estado === 'erro' && cartao.erro && (
        <p className="zl-aprender__erro" role="alert">
          {cartao.erro}
        </p>
      )}
      {(estado === 'pendente' || estado === 'erro' || estado === 'guardando') && (
        <span className="zl-aprender__acoes">
          <button
            type="button"
            className="glass-btn glass-btn--ink zl-aprender__guardar"
            disabled={estado === 'guardando'}
            aria-busy={estado === 'guardando'}
            onClick={() => onGuardar()}
          >
            {estado === 'guardando' ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" className="zl-aprender__link" onClick={() => onAjustar(true)} disabled={estado === 'guardando'}>
            Ajustar
          </button>
          <button type="button" className="zl-aprender__link" onClick={onIgnorar} disabled={estado === 'guardando'}>
            Ignorar
          </button>
        </span>
      )}
      {guardado && !compacto && (
        <Link className="zl-aprender__link" href="/admin/laboratorio/configurar#aprendizados">
          No rascunho
        </Link>
      )}
    </div>
  )
}

// ───────────── Configurar › Aprendizados ─────────────

export function Aprendizados({
  lista,
  conflitos,
  apps,
  onMudou,
  onErro,
  abrirFolha,
  fecharFolha,
}: {
  lista: ZAprendizado[]
  conflitos: Record<string, string>
  apps: { id: string; nome: string }[]
  onMudou: (lista: ZAprendizado[], conflitos: Record<string, string>) => void
  onErro: (m: string) => void
  abrirFolha: (f: ReactNode) => void
  fecharFolha: () => void
}) {
  const nomeApp = (id: string | null) => apps.find((a) => a.id === id)?.nome ?? id ?? ''
  if (!lista.length)
    return (
      <p className="adm-empty">
        <Icon name="sparkle" size={16} /> Corrija a Z no Testar. Ela propõe, você guarda.
      </p>
    )
  return (
    <div className="zl-aprendidos">
      {SECOES.map((s) => {
        const itens = lista.filter((a) => a.tipo === s.tipo)
        if (!itens.length) return null
        return (
          <section key={s.tipo} className="zl-aprendidos__secao" aria-label={s.nome}>
            <p className="zl-aprendidos__titulo">{s.nome}</p>
            <ul className="zl-aprendidos__lista">
              {itens.map((a, i) => (
                <li key={a.id} style={{ '--i': i } as CSSProperties}>
                  <span className="zl-aprendidos__texto">
                    <strong>{a.texto}</strong>
                    <span className="adm-hint" title={a.origem.frase ? `Você disse: “${a.origem.frase}”` : undefined}>
                      {a.plataforma ? `${nomeApp(a.plataforma)} · ` : ''}
                      Aprendido nesta conversa{a.origem.voz ? ' por voz' : ''} · {DATA.format(new Date(a.origem.em))}
                    </span>
                    {a.origem.frase && <q className="zl-aprendidos__frase">{a.origem.frase}</q>}
                    {conflitos[a.id] && <span className="zl-aprender__conflito">Isso contradiz: “{conflitos[a.id]}”</span>}
                  </span>
                  <span className="zl-aprendidos__acoes">
                    <button
                      type="button"
                      className="cst-link"
                      onClick={() =>
                        abrirFolha(
                          <EditarAprendizado
                            a={a}
                            apps={apps}
                            onFechar={fecharFolha}
                            onSalvo={(novo, c) => {
                              onMudou(
                                lista.map((x) => (x.id === novo.id ? novo : x)),
                                c,
                              )
                              fecharFolha()
                            }}
                          />,
                        )
                      }
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="cst-link"
                      onClick={async () => {
                        if (!confirm(`Esquecer “${a.texto}”? As versões salvas continuam iguais.`)) return
                        try {
                          const r = await api<{ conflitos: Record<string, string> }>(`/aprendizados/${a.id}`, { method: 'DELETE' })
                          onMudou(
                            lista.filter((x) => x.id !== a.id),
                            r.conflitos,
                          )
                        } catch (e) {
                          onErro((e as Error).message)
                        }
                      }}
                    >
                      Remover
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function EditarAprendizado({
  a,
  apps,
  onFechar,
  onSalvo,
}: {
  a: ZAprendizado
  apps: { id: string; nome: string }[]
  onFechar: () => void
  onSalvo: (a: ZAprendizado, conflitos: Record<string, string>) => void
}) {
  const [texto, setTexto] = useState(a.texto)
  const [tipo, setTipo] = useState<ZAprendizadoTipo>(a.tipo)
  const [plataforma, setPlataforma] = useState(a.plataforma ?? apps.find((x) => x.id !== 'hub')?.id ?? '')
  const [exemplo, setExemplo] = useState(a.exemplo ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [indo, setIndo] = useState(false)
  return (
    <Folha titulo="Aprendizado" onFechar={onFechar}>
      <form
        className="zro-form cst-form"
        onSubmit={async (e) => {
          e.preventDefault()
          setIndo(true)
          setErro(null)
          try {
            const r = await api<{ aprendizado: ZAprendizado; conflitos: Record<string, string> }>(`/aprendizados/${a.id}`, {
              method: 'PATCH',
              json: { texto, tipo, plataforma: tipo === 'plataforma' ? plataforma : null, exemplo: exemplo.trim() || null },
            })
            onSalvo(r.aprendizado, r.conflitos)
          } catch (err) {
            setErro((err as Error).message)
          } finally {
            setIndo(false)
          }
        }}
      >
        <div className="zro-field">
          <label className="zro-field__label" htmlFor="zl-ap-texto">
            O que ela aprendeu
          </label>
          <textarea id="zl-ap-texto" className="zro-input zl-texto" rows={3} maxLength={240} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        <fieldset className="zl-aprendidos__mover">
          <legend className="zro-field__label">Mover para</legend>
          <div className="zl-opcoes zl-opcoes--linha" role="radiogroup" aria-label="Seção">
            {SECOES.map((s) => (
              <button key={s.tipo} type="button" role="radio" aria-checked={tipo === s.tipo} onClick={() => setTipo(s.tipo)}>
                {s.nome}
              </button>
            ))}
          </div>
        </fieldset>
        {tipo === 'plataforma' && (
          <label className="zl-sel" title="Só nesta plataforma">
            <span className="zro-sr-only">Plataforma</span>
            <select value={plataforma} onChange={(e) => setPlataforma(e.target.value)}>
              {apps
                .filter((x) => x.id !== 'hub')
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nome}
                  </option>
                ))}
            </select>
          </label>
        )}
        <div className="zro-field">
          <label className="zro-field__label" htmlFor="zl-ap-exemplo">
            Exemplo
          </label>
          <input id="zl-ap-exemplo" className="zro-input" maxLength={240} value={exemplo} placeholder="Opcional" onChange={(e) => setExemplo(e.target.value)} />
        </div>
        {a.origem.frase && (
          <p className="adm-hint">
            Você disse: <q>{a.origem.frase}</q>
          </p>
        )}
        <div className="cst-form__fim">
          <button type="submit" className="glass-btn glass-btn--ink cst-btn" disabled={indo || texto.trim().length < 3} aria-busy={indo}>
            {indo ? 'Salvando…' : 'Salvar'}
          </button>
          {erro && (
            <p className="zro-field__error" role="alert">
              {erro}
            </p>
          )}
        </div>
      </form>
    </Folha>
  )
}
