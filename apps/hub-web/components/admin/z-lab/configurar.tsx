'use client'
/**
 * Configurar a Z (Laboratório da Z, ADR 0033). Tudo aqui mexe no rascunho, que só o laboratório usa. "Salvar versão"
 * congela o rascunho num número com nota; "Restaurar" traz uma versão de volta; "Publicar para os clientes" fica
 * desligado até a trava `publicar_config` ser ligada (com confirmação e auditoria).
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ZConfig, ZConhecimento, ZRecurso, ZVersao } from '@zro/core'
import { api, usd } from '@/lib/ia/lab/cliente'
import type { LabEstado } from '@/lib/ia/lab/estado'
import { Icon } from '../../icons'
import { Folha } from '../custos/folha'
import { Teto } from './teto'
import { VozDaZ } from './vozes'

const DATA = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function Cartao({ id, titulo, aside, children }: { id: string; titulo: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="adm-card zl-cartao" id={id} aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`}>
        {titulo}
        {aside && <span className="adm-card__aside">{aside}</span>}
      </h2>
      {children}
    </section>
  )
}

function Deslizar({
  id,
  rotulo,
  esquerda,
  direita,
  valor,
  min = 0,
  max = 100,
  passo = 1,
  onChange,
}: {
  id: string
  rotulo: string
  esquerda: string
  direita: string
  valor: number
  min?: number
  max?: number
  passo?: number
  onChange: (n: number) => void
}) {
  return (
    <div className="zl-deslizar">
      <label htmlFor={id} className="zro-sr-only">
        {rotulo}
      </label>
      <span>{esquerda}</span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={passo}
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={`${rotulo}: ${valor}`}
      />
      <span>{direita}</span>
    </div>
  )
}

export function LabConfigurar({ estado }: { estado: LabEstado }) {
  const router = useRouter()
  const { catalogo } = estado
  const [cfg, setCfg] = useState<ZConfig>(estado.rascunho)
  const [salvo, setSalvo] = useState<ZConfig>(estado.rascunho)
  const [versoes, setVersoes] = useState<ZVersao[]>(estado.versoes)
  const [conhecimento, setConhecimento] = useState<ZConhecimento[]>(estado.conhecimento)
  const [recursos, setRecursos] = useState<ZRecurso[]>(estado.recursos)
  const [publicada, setPublicada] = useState(estado.publicada)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [folha, setFolha] = useState<ReactNode>(null)

  const sujo = !igual(cfg, salvo)
  const mudar = <K extends keyof ZConfig>(k: K, v: ZConfig[K]) => setCfg((c) => ({ ...c, [k]: v }))
  const publicarLigado = recursos.find((r) => r.recurso === 'publicar_config')?.ligado ?? false

  async function salvarRascunho(): Promise<boolean> {
    setSalvando(true)
    setMsg(null)
    try {
      const r = await api<{ rascunho: ZConfig }>('/rascunho', { method: 'PUT', json: cfg })
      setCfg(r.rascunho)
      setSalvo(r.rascunho)
      setMsg({ tom: 'ok', texto: 'Rascunho salvo. O Testar já usa.' })
      return true
    } catch (e) {
      setMsg({ tom: 'erro', texto: (e as Error).message })
      return false
    } finally {
      setSalvando(false)
    }
  }

  const fecharFolha = () => setFolha(null)

  function abrirSalvarVersao() {
    setFolha(
      <SalvarVersao
        cfg={cfg}
        proximo={(versoes[0]?.numero ?? 0) + 1}
        onFechar={fecharFolha}
        onSalva={(v) => (setVersoes((vs) => [v, ...vs]), setSalvo(cfg), setMsg({ tom: 'ok', texto: `Versão ${v.numero} salva.` }))}
      />,
    )
  }

  async function restaurar(n: number) {
    try {
      const r = await api<{ rascunho: ZConfig }>(`/versoes/${n}/restaurar`, { method: 'POST', json: {} })
      setCfg(r.rascunho)
      setSalvo(r.rascunho)
      setMsg({ tom: 'ok', texto: `Versão ${n} voltou para o rascunho.` })
      fecharFolha()
    } catch (e) {
      setMsg({ tom: 'erro', texto: (e as Error).message })
    }
  }

  async function verDiferencas(n: number) {
    try {
      const r = await api<{ config: ZConfig }>(`/versoes/${n}`)
      setFolha(<Diferencas numero={n} versao={r.config} rascunho={cfg} catalogo={catalogo} onFechar={fecharFolha} onRestaurar={() => void restaurar(n)} />)
    } catch (e) {
      setMsg({ tom: 'erro', texto: (e as Error).message })
    }
  }

  return (
    <div className="zl-config">
      <div className="adm-grid">
        <Cartao id="personalidade" titulo="Personalidade">
          <div className="zro-field">
            <label className="zro-field__label" htmlFor="zl-identidade">
              Quem a Z é
            </label>
            <textarea
              id="zl-identidade"
              className="zro-input zl-texto"
              rows={7}
              value={cfg.identidade}
              maxLength={4000}
              onChange={(e) => mudar('identidade', e.target.value)}
            />
          </div>
          <Deslizar
            id="zl-formal"
            rotulo="Tom"
            esquerda="Próxima"
            direita="Formal"
            valor={cfg.tom.formalidade}
            onChange={(n) => mudar('tom', { ...cfg.tom, formalidade: n })}
          />
          <Deslizar
            id="zl-detalhe"
            rotulo="Tamanho"
            esquerda="Curta"
            direita="Detalhada"
            valor={cfg.tom.detalhe}
            onChange={(n) => mudar('tom', { ...cfg.tom, detalhe: n })}
          />
          {(!igual(cfg.tom, catalogo.tomPadrao) || cfg.identidade !== catalogo.padrao.identidade) && (
            <button
              type="button"
              className="cst-link"
              onClick={() => setCfg((c) => ({ ...c, tom: { ...catalogo.tomPadrao }, identidade: catalogo.padrao.identidade }))}
            >
              Voltar ao padrão
            </button>
          )}
        </Cartao>

        <Cartao id="regras" titulo="Regras e limites">
          <textarea
            aria-label="Regras e limites"
            className="zro-input zl-texto"
            rows={9}
            value={cfg.regras}
            maxLength={4000}
            onChange={(e) => mudar('regras', e.target.value)}
          />
        </Cartao>
      </div>

      <Cartao id="plataformas" titulo="Em cada plataforma" aside={`${Object.values(cfg.apps).filter(Boolean).length} com instrução`}>
        <div className="zl-apps">
          {catalogo.apps.map((a) => {
            const v = (cfg.apps as Record<string, string | undefined>)[a.id] ?? ''
            return (
              <details key={a.id} className="zl-app" open={!!v}>
                <summary>
                  <span>{a.nome}</span>
                  {v && <span className="zl-ponto" aria-label="com instrução" />}
                </summary>
                <textarea
                  aria-label={`Instrução no ${a.nome}`}
                  className="zro-input zl-texto"
                  rows={3}
                  maxLength={1500}
                  placeholder="Só nesta plataforma"
                  value={v}
                  onChange={(e) => mudar('apps', { ...cfg.apps, [a.id]: e.target.value || undefined } as ZConfig['apps'])}
                />
              </details>
            )
          })}
        </div>
      </Cartao>

      <Cartao id="conhecimento" titulo="O que ela consulta" aside={`${cfg.conhecimento.length} ativos`}>
        {conhecimento.length ? (
          <ul className="zl-lista">
            {conhecimento.map((k) => (
              <li key={k.id}>
                <label className="zl-check">
                  <input
                    type="checkbox"
                    checked={cfg.conhecimento.includes(k.id)}
                    onChange={(e) => mudar('conhecimento', e.target.checked ? [...cfg.conhecimento, k.id] : cfg.conhecimento.filter((x) => x !== k.id))}
                  />
                  <span>{k.titulo}</span>
                </label>
                <span className="adm-hint">{k.caracteres.toLocaleString('pt-BR')} caracteres</span>
                <button
                  type="button"
                  className="cst-link"
                  onClick={async () => {
                    try {
                      await api(`/conhecimento/${k.id}`, { method: 'DELETE' })
                      setConhecimento((ks) => ks.filter((x) => x.id !== k.id))
                      setCfg((c) => ({ ...c, conhecimento: c.conhecimento.filter((x) => x !== k.id) }))
                      setSalvo((c) => ({ ...c, conhecimento: c.conhecimento.filter((x) => x !== k.id) }))
                    } catch (e) {
                      setMsg({ tom: 'erro', texto: (e as Error).message })
                    }
                  }}
                >
                  Arquivar
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="adm-empty">FAQ, planos, preços, manual: textos que a Z pode citar.</p>
        )}
        <button
          type="button"
          className="glass-btn cst-btn"
          onClick={() =>
            setFolha(
              <NovoTexto
                max={catalogo.conhecimentoMax}
                onFechar={fecharFolha}
                onCriado={(k) => {
                  setConhecimento((ks) => [k, ...ks])
                  setCfg((c) => ({ ...c, conhecimento: [...c.conhecimento, k.id] }))
                  fecharFolha()
                }}
              />,
            )
          }
        >
          <Icon name="plus" />
          Adicionar texto
        </button>
      </Cartao>

      <VozDaZ
        cfg={cfg}
        catalogo={catalogo}
        vozLigada={estado.chaves.voz}
        nomeChave={estado.nomesDasChaves.voz}
        onChange={(voz) => mudar('voz', voz)}
        abrirFolha={setFolha}
        fecharFolha={fecharFolha}
      />

      <div className="adm-grid">
        <Cartao id="modelo" titulo="Modelo">
          <div className="zl-opcoes" role="radiogroup" aria-label="Modelo do Claude">
            {catalogo.modelos.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={cfg.modelo.id === m.id}
                onClick={() => mudar('modelo', { ...cfg.modelo, id: m.id as ZConfig['modelo']['id'] })}
              >
                <strong>{m.nome}</strong>
                <span>{m.nota}</span>
              </button>
            ))}
          </div>
          <div className="zl-opcoes zl-opcoes--linha" role="radiogroup" aria-label="Tamanho máximo da resposta">
            {catalogo.respostas.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={cfg.modelo.resposta === r.id}
                onClick={() => mudar('modelo', { ...cfg.modelo, resposta: r.id as ZConfig['modelo']['resposta'] })}
              >
                {r.nome}
              </button>
            ))}
          </div>
        </Cartao>

        <Cartao id="teto" titulo="Gasto do laboratório" aside="por dia">
          <Teto gasto={estado.gasto} />
          <p className="adm-hint" title="Escuta ao vivo, voz Flash e quatro respostas por minuto">
            Voz: ~{usd(catalogo.minutoDeVoz.padrao)}/min com o modelo de hoje, ~{usd(catalogo.minutoDeVoz.rapido)}/min com o mais rápido.
          </p>
        </Cartao>
      </div>

      <Cartao id="versoes" titulo="Versões" aside={publicada ? `Clientes: versão ${publicada.numero}` : 'Clientes: padrão de hoje'}>
        {versoes.length ? (
          <ol className="zl-versoes">
            {versoes.map((v, i) => (
              <li key={v.id} style={{ '--i': i } as CSSProperties}>
                <span className="zl-versoes__n">{v.numero}</span>
                <span className="zl-versoes__nota">
                  <strong>{v.nota}</strong>
                  <span className="adm-hint">{DATA.format(new Date(v.criadaEm))}</span>
                </span>
                {v.numero === publicada?.numero && <span className="zl-selo">Publicada</span>}
                <span className="zl-versoes__acoes">
                  <button type="button" className="cst-link" onClick={() => void verDiferencas(v.numero)}>
                    Diferenças
                  </button>
                  <Link className="cst-link" href={`/admin/laboratorio?comparar=${v.numero}`}>
                    Comparar
                  </Link>
                  <button
                    type="button"
                    className="cst-link"
                    disabled={!publicarLigado}
                    title={publicarLigado ? 'Publicar para os clientes' : 'Desligado até liberar "Publicar a configuração"'}
                    onClick={() =>
                      setFolha(
                        <Publicar
                          numero={v.numero}
                          onFechar={fecharFolha}
                          onFeito={() => {
                            setPublicada({ numero: v.numero, em: new Date().toISOString() })
                            setVersoes((vs) => vs.map((x) => ({ ...x, publicada: x.numero === v.numero })))
                            fecharFolha()
                          }}
                        />,
                      )
                    }
                  >
                    Publicar
                  </button>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="adm-empty">Nenhuma versão ainda.</p>
        )}
        {publicada && (
          <button
            type="button"
            className="cst-link"
            onClick={async () => {
              if (!confirm('Voltar os clientes para o padrão de hoje?')) return
              try {
                await api('/publicacao/padrao', { method: 'POST', json: { confirmar: 'padrao' } })
                setPublicada(null)
                setVersoes((vs) => vs.map((x) => ({ ...x, publicada: false })))
              } catch (e) {
                setMsg({ tom: 'erro', texto: (e as Error).message })
              }
            }}
          >
            Voltar os clientes ao padrão
          </button>
        )}
      </Cartao>

      <Cartao id="liberacao" titulo="Para os clientes" aside="tudo desligado até você ligar">
        <ul className="zl-recursos">
          {recursos.map((r) => (
            <li key={r.recurso}>
              <span className="zl-recursos__nome">
                <strong>{catalogo.recursos.find((x) => x.id === r.recurso)?.nome ?? r.recurso}</strong>
                <span className="adm-hint">
                  {r.ligado
                    ? r.planos.length
                      ? r.planos.map((p) => estado.planos.find((x) => x.code === p)?.name ?? p).join(', ')
                      : 'Ligado, sem plano'
                    : 'Desligado'}
                </span>
              </span>
              <span className="zl-interruptor" data-ligado={r.ligado ? '' : undefined} aria-hidden="true" />
              <button
                type="button"
                className="cst-link"
                onClick={() =>
                  setFolha(
                    <MudarRecurso
                      recurso={r}
                      nome={catalogo.recursos.find((x) => x.id === r.recurso)?.nome ?? r.recurso}
                      planos={estado.planos}
                      onFechar={fecharFolha}
                      onFeito={(novo) => {
                        setRecursos((rs) => rs.map((x) => (x.recurso === novo.recurso ? novo : x)))
                        fecharFolha()
                        router.refresh()
                      }}
                    />,
                  )
                }
              >
                Mudar
              </button>
            </li>
          ))}
        </ul>
      </Cartao>

      <div className="zl-salvar" data-sujo={sujo ? '' : undefined}>
        {msg && (
          <p className={msg.tom === 'erro' ? 'zro-field__error' : 'zl-salvar__ok'} role={msg.tom === 'erro' ? 'alert' : 'status'}>
            {msg.texto}
          </p>
        )}
        {sujo && !msg && <span className="adm-hint">Alterações não salvas</span>}
        {sujo && (
          <button type="button" className="cst-link" onClick={() => setCfg(salvo)}>
            Desfazer
          </button>
        )}
        <button type="button" className="glass-btn cst-btn" onClick={abrirSalvarVersao}>
          Salvar versão
        </button>
        <button
          type="button"
          className="glass-btn glass-btn--ink cst-btn"
          disabled={!sujo || salvando}
          aria-busy={salvando}
          onClick={() => void salvarRascunho()}
        >
          {salvando ? 'Salvando…' : 'Salvar rascunho'}
        </button>
      </div>
      {folha}
    </div>
  )
}

function SalvarVersao({ cfg, proximo, onFechar, onSalva }: { cfg: ZConfig; proximo: number; onFechar: () => void; onSalva: (v: ZVersao) => void }) {
  const [nota, setNota] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [indo, setIndo] = useState(false)
  return (
    <Folha titulo={`Versão ${proximo}`} onFechar={onFechar}>
      <form
        className="zro-form cst-form"
        onSubmit={async (e) => {
          e.preventDefault()
          setIndo(true)
          setErro(null)
          try {
            const r = await api<{ versao: ZVersao }>('/versoes', { method: 'POST', json: { nota, rascunho: cfg } })
            onSalva(r.versao)
            onFechar()
          } catch (err) {
            setErro((err as Error).message)
          } finally {
            setIndo(false)
          }
        }}
      >
        <div className="zro-field">
          <label className="zro-field__label" htmlFor="zl-nota">
            O que mudou
          </label>
          <input
            id="zl-nota"
            className="zro-input"
            value={nota}
            maxLength={300}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Voz mais calma, saudação nova"
            autoFocus
          />
        </div>
        <p className="adm-hint">Fica guardada como está. Os clientes não veem.</p>
        <div className="cst-form__fim">
          <button type="submit" className="glass-btn glass-btn--ink cst-btn" disabled={indo || !nota.trim()} aria-busy={indo}>
            {indo ? 'Salvando…' : 'Salvar versão'}
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

function NovoTexto({ max, onFechar, onCriado }: { max: number; onFechar: () => void; onCriado: (k: ZConhecimento) => void }) {
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [indo, setIndo] = useState(false)
  return (
    <Folha titulo="Texto de referência" onFechar={onFechar}>
      <form
        className="zro-form cst-form"
        onSubmit={async (e) => {
          e.preventDefault()
          setIndo(true)
          setErro(null)
          try {
            const r = await api<{ texto: ZConhecimento }>('/conhecimento', { method: 'POST', json: { titulo, texto } })
            onCriado(r.texto)
          } catch (err) {
            setErro((err as Error).message)
          } finally {
            setIndo(false)
          }
        }}
      >
        <div className="zro-field">
          <label className="zro-field__label" htmlFor="zl-k-titulo">
            Título
          </label>
          <input
            id="zl-k-titulo"
            className="zro-input"
            value={titulo}
            maxLength={120}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Planos e preços"
          />
        </div>
        <div className="zro-field">
          <label className="zro-field__label" htmlFor="zl-k-texto">
            Texto
          </label>
          <textarea id="zl-k-texto" className="zro-input zl-texto" rows={10} value={texto} maxLength={max} onChange={(e) => setTexto(e.target.value)} />
          <span className="adm-hint">
            {texto.length.toLocaleString('pt-BR')} de {max.toLocaleString('pt-BR')} ·{' '}
            <label className="cst-link">
              carregar .txt ou .md
              <input
                type="file"
                hidden
                accept=".txt,.md,.csv,text/plain,text/markdown"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  if (f.size > max * 4) return setErro('Arquivo grande demais.')
                  setTexto((await f.text()).slice(0, max))
                  if (!titulo) setTitulo(f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 120))
                }}
              />
            </label>
          </span>
        </div>
        <div className="cst-form__fim">
          <button type="submit" className="glass-btn glass-btn--ink cst-btn" disabled={indo || !titulo.trim() || !texto.trim()} aria-busy={indo}>
            {indo ? 'Salvando…' : 'Adicionar'}
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

function Publicar({ numero, onFechar, onFeito }: { numero: number; onFechar: () => void; onFeito: () => void }) {
  const [ok, setOk] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  return (
    <Folha titulo={`Publicar a versão ${numero}`} onFechar={onFechar}>
      <p>Todos os clientes passam a falar com esta Z.</p>
      <label className="zl-check">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span>Confirmo. Fica na auditoria.</span>
      </label>
      <div className="cst-form__fim">
        <button
          type="button"
          className="glass-btn glass-btn--ink cst-btn"
          disabled={!ok}
          onClick={async () => {
            try {
              await api(`/versoes/${numero}/publicar`, { method: 'POST', json: { confirmar: 'publicar' } })
              onFeito()
            } catch (e) {
              setErro((e as Error).message)
            }
          }}
        >
          Publicar para os clientes
        </button>
        {erro && (
          <p className="zro-field__error" role="alert">
            {erro}
          </p>
        )}
      </div>
    </Folha>
  )
}

function MudarRecurso({
  recurso,
  nome,
  planos,
  onFechar,
  onFeito,
}: {
  recurso: ZRecurso
  nome: string
  planos: { code: string; name: string }[]
  onFechar: () => void
  onFeito: (r: ZRecurso) => void
}) {
  const [ligado, setLigado] = useState(recurso.ligado)
  const [escolhidos, setEscolhidos] = useState<string[]>(recurso.planos)
  const [ok, setOk] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const global = recurso.recurso === 'publicar_config'
  return (
    <Folha titulo={nome} onFechar={onFechar}>
      <label className="zl-check">
        <input type="checkbox" checked={ligado} onChange={(e) => setLigado(e.target.checked)} />
        <span>{global ? 'Deixar publicar versões para os clientes' : 'Ligar para os clientes'}</span>
      </label>
      {!global && (
        <fieldset className="zl-planos" disabled={!ligado}>
          <legend className="zro-field__label">Planos</legend>
          {planos.map((p) => (
            <label key={p.code} className="zl-check">
              <input
                type="checkbox"
                checked={escolhidos.includes(p.code)}
                onChange={(e) => setEscolhidos((s) => (e.target.checked ? [...s, p.code] : s.filter((x) => x !== p.code)))}
              />
              <span>{p.name}</span>
            </label>
          ))}
        </fieldset>
      )}
      <label className="zl-check zl-check--forte">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span>Confirmo. Fica na auditoria.</span>
      </label>
      <div className="cst-form__fim">
        <button
          type="button"
          className="glass-btn glass-btn--ink cst-btn"
          disabled={!ok}
          onClick={async () => {
            try {
              const r = await api<{ recurso: ZRecurso }>(`/recursos/${recurso.recurso}`, {
                method: 'PUT',
                json: { ligado, planos: ligado && !global ? escolhidos : [], confirmar: true },
              })
              onFeito(r.recurso)
            } catch (e) {
              setErro((e as Error).message)
            }
          }}
        >
          Salvar
        </button>
        {erro && (
          <p className="zro-field__error" role="alert">
            {erro}
          </p>
        )}
      </div>
    </Folha>
  )
}

/** Lado a lado: a versão salva e o rascunho, só os campos que mudaram. */
function Diferencas({
  numero,
  versao,
  rascunho,
  catalogo,
  onFechar,
  onRestaurar,
}: {
  numero: number
  versao: ZConfig
  rascunho: ZConfig
  catalogo: LabEstado['catalogo']
  onFechar: () => void
  onRestaurar: () => void
}) {
  const linhas = useMemo(() => {
    const nomeModelo = (id: string) => catalogo.modelos.find((m) => m.id === id)?.nome ?? id
    const campos: { nome: string; a: string; b: string }[] = [
      { nome: 'Quem a Z é', a: versao.identidade, b: rascunho.identidade },
      { nome: 'Regras', a: versao.regras, b: rascunho.regras },
      {
        nome: 'Tom',
        a: `formal ${versao.tom.formalidade} · detalhe ${versao.tom.detalhe}`,
        b: `formal ${rascunho.tom.formalidade} · detalhe ${rascunho.tom.detalhe}`,
      },
      {
        nome: 'Modelo',
        a: `${nomeModelo(versao.modelo.id)} · ${versao.modelo.resposta}`,
        b: `${nomeModelo(rascunho.modelo.id)} · ${rascunho.modelo.resposta}`,
      },
      {
        nome: 'Voz',
        a: `${versao.voz.nome ?? 'sem voz'} · ${versao.voz.modelo} · ${versao.voz.velocidade}x`,
        b: `${rascunho.voz.nome ?? 'sem voz'} · ${rascunho.voz.modelo} · ${rascunho.voz.velocidade}x`,
      },
      { nome: 'Saudação', a: versao.voz.saudacao, b: rascunho.voz.saudacao },
      { nome: 'Textos ativos', a: String(versao.conhecimento.length), b: String(rascunho.conhecimento.length) },
      ...catalogo.apps.map((app) => ({
        nome: app.nome,
        a: (versao.apps as Record<string, string | undefined>)[app.id] ?? '',
        b: (rascunho.apps as Record<string, string | undefined>)[app.id] ?? '',
      })),
    ]
    return campos.filter((c) => c.a !== c.b)
  }, [versao, rascunho, catalogo])
  return (
    <Folha titulo={`Versão ${numero} × rascunho`} onFechar={onFechar}>
      {linhas.length ? (
        <dl className="zl-dif">
          <div className="zl-dif__cab" aria-hidden="true">
            <span />
            <span>Versão {numero}</span>
            <span>Rascunho</span>
          </div>
          {linhas.map((l) => (
            <div key={l.nome} className="zl-dif__linha">
              <dt>{l.nome}</dt>
              <dd>{l.a || '—'}</dd>
              <dd>{l.b || '—'}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="adm-empty">Iguais.</p>
      )}
      <div className="cst-form__fim">
        <button type="button" className="glass-btn cst-btn" onClick={onRestaurar}>
          Restaurar a versão {numero}
        </button>
      </div>
    </Folha>
  )
}
