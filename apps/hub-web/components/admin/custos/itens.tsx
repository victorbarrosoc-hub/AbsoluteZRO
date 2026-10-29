'use client'
/**
 * Lista de custos (/admin/custos): filtros por estado e categoria, grupos por estado e a folha de editar/criar/apagar.
 * Tudo grava por Server Action (admin, sistema, auditoria); a página se redesenha sozinha depois de salvar.
 */
import { useActionState, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import type { Custo } from '@zro/core'
import type { FormState } from '@/components/action-form'
import { apagarCustoAction, salvarCustoAction } from '@/lib/actions/custos'
import { Icon } from '../../icons'
import { Folha } from './folha'

export type ItemVista = Custo & { valorTexto: string; mesTexto: string | null }
type Opcoes = Record<string, string>

const ESTADO_GRUPO: Record<string, string> = { ativo: 'Ativos', previsto: 'Previstos', futuro: 'Futuros', pausado: 'Pausados' }

export function CustosItens({
  itens,
  categorias,
  estados,
  periodicidades,
  produtos,
  hoje,
}: {
  itens: ItemVista[]
  categorias: Opcoes
  estados: Opcoes
  periodicidades: Opcoes
  produtos: { id: string; name: string }[]
  hoje: string
}) {
  const [estado, setEstado] = useState('todos')
  const [categoria, setCategoria] = useState('todas')
  const [aberto, setAberto] = useState<ItemVista | 'novo' | null>(null)
  const filtrados = useMemo(
    () => itens.filter((c) => (estado === 'todos' || c.estado === estado) && (categoria === 'todas' || c.categoria === categoria)),
    [itens, estado, categoria],
  )
  const grupos = Object.keys(ESTADO_GRUPO)
    .map((e) => ({ estado: e, itens: filtrados.filter((c) => c.estado === e) }))
    .filter((g) => g.itens.length)
  const usadas = Object.entries(categorias).filter(([k]) => itens.some((c) => c.categoria === k))

  return (
    <section className="adm-card cst-itens" aria-labelledby="itens" id="lista">
      <div className="cst-itens__topo">
        <h2 id="itens">Itens</h2>
        <div className="cst-itens__acoes">
          <a className="glass-btn cst-btn" href="/admin/custos/csv" download>
            <Icon name="download" />
            <span>CSV</span>
          </a>
          <button type="button" className="glass-btn glass-btn--ink cst-btn" onClick={() => setAberto('novo')}>
            <Icon name="plus" />
            <span>Novo item</span>
          </button>
        </div>
      </div>

      {itens.length > 0 && (
        <div className="cst-filtros">
          <div className="cst-chips" role="group" aria-label="Estado">
            {['todos', ...Object.keys(estados).filter((e) => e === estado || itens.some((c) => c.estado === e))].map((e) => (
              <button key={e} type="button" className="cst-chip" aria-pressed={estado === e} onClick={() => setEstado(e)}>
                {e === 'todos' ? 'Todos' : ESTADO_GRUPO[e]}
                <span className="cst-chip__n">{e === 'todos' ? itens.length : itens.filter((c) => c.estado === e).length}</span>
              </button>
            ))}
          </div>
          <label className="cst-select">
            <span className="zro-sr-only">Categoria</span>
            <select className="zro-select" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="todas">Todas as categorias</option>
              {usadas.map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {!itens.length ? (
        <div className="cst-vazio">
          <strong>Nenhum custo ainda</strong>
          <span>Comece pelo que você já paga todo mês.</span>
        </div>
      ) : !grupos.length ? (
        <p className="adm-empty">Nada com esse filtro.</p>
      ) : (
        grupos.map((g) => (
          <div key={g.estado} className="cst-grupo">
            <h3 className="adm-sub">
              {ESTADO_GRUPO[g.estado]} <span className="cst-grupo__n">{g.itens.length}</span>
            </h3>
            <ul className="cst-lista">
              {g.itens.map((c) => (
                <li key={c.id}>
                  <button type="button" className="cst-linha" onClick={() => setAberto(c)}>
                    <span className="zro-sr-only">Editar </span>
                    <span className={`cst-linha__cor cst-cat--${c.categoria}`} aria-hidden="true" />
                    <span className="cst-linha__nome">
                      <strong>{c.fornecedor}</strong>
                      <span>
                        {c.item}
                        {c.plano ? ` · ${c.plano}` : ''}
                      </span>
                      {c.gatilho && c.estado !== 'ativo' && <span className="cst-linha__gatilho">{c.gatilho}</span>}
                    </span>
                    <span className="cst-linha__valor">
                      <strong>{c.valorTexto}</strong>
                      {c.mesTexto && <span>{c.mesTexto}</span>}
                    </span>
                    <span className="cst-linha__tags">
                      {c.aConferir && <span className="adm-chip adm-chip--warn">a conferir</span>}
                      {(c.cobraUso || c.periodicidade === 'por_uso') && <span className="adm-chip">+ uso</span>}
                    </span>
                    <Icon name="chevron" className="cst-linha__seta" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {aberto && (
        <FolhaCusto
          key={aberto === 'novo' ? 'novo' : aberto.id}
          custo={aberto === 'novo' ? null : aberto}
          categorias={categorias}
          estados={estados}
          periodicidades={periodicidades}
          produtos={produtos}
          hoje={hoje}
          onFechar={() => setAberto(null)}
        />
      )}
    </section>
  )
}

function Enviar({ rotulo, variante = 'ink' }: { rotulo: string; variante?: 'ink' | 'perigo' }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      className={variante === 'ink' ? 'glass-btn glass-btn--ink cst-btn' : 'zro-btn zro-btn--danger'}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? 'Salvando…' : rotulo}
    </button>
  )
}

function Erro({ state }: { state: FormState }) {
  return state?.error ? (
    <p className="zro-field__error" role="alert">
      {state.error}
    </p>
  ) : null
}

const numero = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','))

function FolhaCusto({
  custo,
  categorias,
  estados,
  periodicidades,
  produtos,
  hoje,
  onFechar,
}: {
  custo: ItemVista | null
  categorias: Opcoes
  estados: Opcoes
  periodicidades: Opcoes
  produtos: { id: string; name: string }[]
  hoje: string
  onFechar: () => void
}) {
  const [state, action] = useActionState(salvarCustoAction, null)
  const [apagado, apagar] = useActionState(apagarCustoAction, null)
  const [periodicidade, setPeriodicidade] = useState<string>(custo?.periodicidade ?? 'mensal')
  const [estado, setEstado] = useState<string>(custo?.estado ?? 'ativo')
  const [conferido, setConferido] = useState(custo?.conferidoEm ?? '')
  const [confirmar, setConfirmar] = useState(false)
  useEffect(() => {
    if (state?.ok || apagado?.ok) onFechar()
  }, [state, apagado, onFechar])
  const id = custo?.id ?? 'novo'
  const f = (k: string) => `cst-${k}-${id}`

  return (
    <Folha titulo={custo ? `${custo.fornecedor} · ${custo.item}` : 'Novo item'} onFechar={onFechar}>
      <form action={action} className="zro-form cst-form">
        {custo && <input type="hidden" name="id" value={custo.id} />}
        <div className="zro-form-row">
          <Campo id={f('fornecedor')} rotulo="Fornecedor">
            <input className="zro-input" id={f('fornecedor')} name="fornecedor" defaultValue={custo?.fornecedor} required maxLength={80} autoComplete="off" />
          </Campo>
          <Campo id={f('item')} rotulo="Item">
            <input className="zro-input" id={f('item')} name="item" defaultValue={custo?.item} required maxLength={120} autoComplete="off" />
          </Campo>
        </div>
        <div className="zro-form-row">
          <Campo id={f('valor')} rotulo="Valor">
            <input className="zro-input" id={f('valor')} name="valor" inputMode="decimal" defaultValue={numero(custo?.valor ?? 0)} autoComplete="off" />
          </Campo>
          <Campo id={f('moeda')} rotulo="Moeda">
            <select className="zro-select" id={f('moeda')} name="moeda" defaultValue={custo?.moeda ?? 'USD'}>
              <option value="USD">US$</option>
              <option value="BRL">R$</option>
            </select>
          </Campo>
          <Campo id={f('periodicidade')} rotulo="Cobrança">
            <select
              className="zro-select"
              id={f('periodicidade')}
              name="periodicidade"
              value={periodicidade}
              onChange={(e) => setPeriodicidade(e.target.value)}
            >
              {Object.entries(periodicidades).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <div className="zro-form-row">
          <Campo id={f('estado')} rotulo="Estado">
            <select className="zro-select" id={f('estado')} name="estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
              {Object.entries(estados).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id={f('categoria')} rotulo="Categoria">
            <select className="zro-select" id={f('categoria')} name="categoria" defaultValue={custo?.categoria ?? 'outros'}>
              {Object.entries(categorias).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        {estado !== 'ativo' && (
          <div className="zro-form-row">
            <Campo id={f('gatilho')} rotulo="Gatilho">
              <input className="zro-input" id={f('gatilho')} name="gatilho" defaultValue={custo?.gatilho ?? ''} maxLength={200} placeholder="Quando…" />
            </Campo>
            <Campo id={f('comeca')} rotulo="Mês estimado">
              <input className="zro-input" id={f('comeca')} name="comecaEm" type="date" defaultValue={custo?.comecaEm ?? ''} />
            </Campo>
          </div>
        )}
        <label className="switch-row">
          <input
            className="switch"
            type="checkbox"
            name="aConferir"
            defaultChecked={custo?.aConferir ?? false}
            onChange={(e) => {
              if (!e.target.checked) setConferido(hoje)
            }}
          />
          A conferir
        </label>

        <details className="disclosure cst-mais" open={!custo}>
          <summary>Mais detalhes</summary>
          <div className="zro-form cst-mais__corpo">
            <div className="zro-form-row">
              <Campo id={f('plano')} rotulo="Plano">
                <input className="zro-input" id={f('plano')} name="plano" defaultValue={custo?.plano ?? ''} maxLength={80} autoComplete="off" />
              </Campo>
              <Campo id={f('conferido')} rotulo="Conferido em">
                <input
                  className="zro-input"
                  id={f('conferido')}
                  name="conferidoEm"
                  type="date"
                  value={conferido}
                  onChange={(e) => setConferido(e.target.value)}
                />
              </Campo>
            </div>
            {estado === 'ativo' && (
              <div className="zro-form-row">
                <Campo id={f('comeca')} rotulo="Começou em">
                  <input className="zro-input" id={f('comeca')} name="comecaEm" type="date" defaultValue={custo?.comecaEm ?? ''} />
                </Campo>
                <Campo id={f('termina')} rotulo="Termina em">
                  <input className="zro-input" id={f('termina')} name="terminaEm" type="date" defaultValue={custo?.terminaEm ?? ''} />
                </Campo>
              </div>
            )}
            {estado !== 'ativo' && <input type="hidden" name="terminaEm" value={custo?.terminaEm ?? ''} />}
            {periodicidade === 'mensal' && (
              <>
                <label className="switch-row">
                  <input className="switch" type="checkbox" name="cobraUso" defaultChecked={custo?.cobraUso ?? false} />
                  Cobra uso além do fixo
                </label>
                <Campo id={f('anual')} rotulo="Preço no anual" dica="Se o fornecedor oferece. Mesma moeda.">
                  <input
                    className="zro-input"
                    id={f('anual')}
                    name="valorAnual"
                    inputMode="decimal"
                    defaultValue={numero(custo?.valorAnual)}
                    autoComplete="off"
                  />
                </Campo>
              </>
            )}
            <Campo id={f('teto')} rotulo="Teto de gasto por mês" dica="O limite configurado no fornecedor.">
              <input className="zro-input" id={f('teto')} name="tetoMensal" inputMode="decimal" defaultValue={numero(custo?.tetoMensal)} autoComplete="off" />
            </Campo>
            <fieldset className="cst-apps">
              <legend className="zro-field__label">Apps</legend>
              <div className="cst-chips">
                {produtos.map((p) => (
                  <label key={p.id} className="cst-chip cst-chip--check">
                    <input type="checkbox" name="produtos" value={p.id} defaultChecked={custo?.produtos.includes(p.id)} />
                    {p.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <Campo id={f('link')} rotulo="Link">
              <input className="zro-input" id={f('link')} name="link" type="url" defaultValue={custo?.link ?? ''} placeholder="https://" autoComplete="off" />
            </Campo>
            <Campo id={f('obs')} rotulo="Observação">
              <textarea className="zro-textarea" id={f('obs')} name="observacao" defaultValue={custo?.observacao ?? ''} maxLength={1000} rows={3} />
            </Campo>
          </div>
        </details>

        <div className="cst-form__fim">
          <Enviar rotulo={custo ? 'Salvar' : 'Criar'} />
          <Erro state={state} />
        </div>
      </form>

      {custo && (
        <form action={apagar} className="cst-apagar">
          <input type="hidden" name="id" value={custo.id} />
          {confirmar ? (
            <>
              <span>Apagar este item de vez?</span>
              <div className="row">
                <button type="button" className="zro-btn zro-btn--ghost" onClick={() => setConfirmar(false)}>
                  Manter
                </button>
                <Enviar rotulo="Apagar" variante="perigo" />
              </div>
            </>
          ) : (
            <button type="button" className="cst-apagar__abrir" onClick={() => setConfirmar(true)}>
              Apagar item…
            </button>
          )}
          <Erro state={apagado} />
        </form>
      )}
    </Folha>
  )
}

function Campo({ id, rotulo, dica, children }: { id: string; rotulo: string; dica?: string; children: ReactNode }) {
  return (
    <div className="zro-field">
      <label className="zro-field__label" htmlFor={id}>
        {rotulo}
      </label>
      {children}
      {dica && <p className="zro-field__hint">{dica}</p>}
    </div>
  )
}
