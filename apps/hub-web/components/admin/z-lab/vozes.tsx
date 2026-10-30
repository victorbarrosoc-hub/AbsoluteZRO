'use client'
/**
 * A voz da Z (Configurar do Laboratório da Z). A Z é uma mulher: a lista já abre filtrada nas vozes femininas em
 * português do Brasil da conta da ElevenLabs. Se nenhuma servir, o Voice Design cria uma a partir de uma descrição
 * (editável); a amostra escolhida só vai para a conta depois da confirmação.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ZConfig } from '@zro/core'
import { Tocador } from '@/lib/ia/lab/audio'
import { api, ErroDoLab, falar } from '@/lib/ia/lab/cliente'
import type { LabCatalogo } from '@/lib/ia/lab/estado'
import { Icon } from '../../icons'
import { Folha } from '../custos/folha'

type Voz = { id: string; nome: string; categoria: string | null; previa: string | null; rotulos: string[]; feminina: boolean; ptBr: boolean }
type Amostra = { id: string; audio: string; mime: string; segundos: number }

export function VozDaZ({
  cfg,
  catalogo,
  vozLigada,
  nomeChave,
  onChange,
  abrirFolha,
  fecharFolha,
}: {
  cfg: ZConfig
  catalogo: LabCatalogo
  vozLigada: boolean
  nomeChave: string
  onChange: (v: ZConfig['voz']) => void
  abrirFolha: (n: ReactNode) => void
  fecharFolha: () => void
}) {
  const v = cfg.voz
  const [ouvindo, setOuvindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const tocador = useRef<Tocador | null>(null)
  useEffect(() => () => tocador.current?.fechar(), [])
  const escolher = (voz: { id: string; nome: string }) => {
    onChange({ ...v, id: voz.id, nome: voz.nome })
    fecharFolha()
  }

  async function ouvirSaudacao() {
    if (!v.id || !v.saudacao.trim()) return
    setErro(null)
    setOuvindo(true)
    try {
      tocador.current ??= new Tocador()
      await tocador.current.destravar()
      tocador.current.parar()
      const leitor = await falar({
        texto: v.saudacao.trim(),
        voz: v.id,
        modelo: v.modelo,
        velocidade: v.velocidade,
        estabilidade: v.estabilidade,
        chave: crypto.randomUUID(),
      })
      for (;;) {
        const { value, done } = await leitor.read()
        if (done) break
        tocador.current.tocar(value)
      }
    } catch (e) {
      setErro(e instanceof ErroDoLab ? e.message : 'A voz não respondeu agora.')
    } finally {
      setOuvindo(false)
    }
  }

  return (
    <section className="adm-card zl-cartao" id="voz" aria-labelledby="voz-t">
      <h2 id="voz-t">
        Voz
        <span className="adm-card__aside">{v.nome ?? 'nenhuma escolhida'}</span>
      </h2>
      {!vozLigada ? (
        <p className="adm-empty">
          Conecte a chave da ElevenLabs: <code>{nomeChave}</code>.
        </p>
      ) : (
        <>
          <div className="zl-voz-escolha">
            <span className="zl-voz-escolha__icone" aria-hidden="true">
              <Icon name="wave" size={22} />
            </span>
            <strong>{v.nome ?? 'Escolha a voz da Z'}</strong>
            <span className="zl-voz-escolha__acoes">
              <button
                type="button"
                className="glass-btn cst-btn"
                onClick={() => abrirFolha(<EscolherVoz atual={v.id} onFechar={fecharFolha} onEscolher={escolher} />)}
              >
                Escolher
              </button>
              <button
                type="button"
                className="glass-btn cst-btn"
                onClick={() => abrirFolha(<CriarVoz descricao={catalogo.vozDescricao} texto={catalogo.vozTexto} onFechar={fecharFolha} onCriada={escolher} />)}
              >
                <Icon name="sparkle" />
                Criar uma voz
              </button>
            </span>
          </div>
          <div className="zl-opcoes zl-opcoes--linha" role="radiogroup" aria-label="Modelo de voz">
            {catalogo.vozModelos.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={v.modelo === m.id}
                title={m.nota}
                onClick={() => onChange({ ...v, modelo: m.id as ZConfig['voz']['modelo'] })}
              >
                {m.nome}
              </button>
            ))}
          </div>
          <div className="zl-deslizar">
            <label htmlFor="zl-velocidade" className="zro-sr-only">
              Ritmo
            </label>
            <span>Calma</span>
            <input
              id="zl-velocidade"
              type="range"
              min={0.7}
              max={1.2}
              step={0.05}
              value={v.velocidade}
              onChange={(e) => onChange({ ...v, velocidade: Number(e.target.value) })}
            />
            <span>Rápida</span>
          </div>
          <div className="zl-deslizar">
            <label htmlFor="zl-estabilidade" className="zro-sr-only">
              Expressão
            </label>
            <span>Expressiva</span>
            <input
              id="zl-estabilidade"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={v.estabilidade}
              onChange={(e) => onChange({ ...v, estabilidade: Number(e.target.value) })}
            />
            <span>Estável</span>
          </div>
          <div className="zro-field">
            <label className="zro-field__label" htmlFor="zl-saudacao">
              Saudação
            </label>
            <div className="zl-teto__campos">
              <input id="zl-saudacao" className="zro-input" value={v.saudacao} maxLength={300} onChange={(e) => onChange({ ...v, saudacao: e.target.value })} />
              <button
                type="button"
                className="glass-btn cst-btn"
                disabled={!v.id || ouvindo}
                aria-busy={ouvindo}
                onClick={() => void ouvirSaudacao()}
                title="Ouvir com esta voz"
              >
                <Icon name="play" />
                Ouvir
              </button>
            </div>
          </div>
          {erro && (
            <p className="zro-field__error" role="alert">
              {erro}
            </p>
          )}
        </>
      )}
    </section>
  )
}

function EscolherVoz({ atual, onFechar, onEscolher }: { atual: string | null; onFechar: () => void; onEscolher: (v: Voz) => void }) {
  const [vozes, setVozes] = useState<Voz[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [filtro, setFiltro] = useState(true)
  const audio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => {
    api<{ vozes: Voz[] }>('/vozes')
      .then((r) => setVozes(r.vozes))
      .catch((e) => setErro((e as Error).message))
    return () => audio.current?.pause()
  }, [])
  const lista = (vozes ?? []).filter((v) => !filtro || (v.feminina && v.ptBr))
  const ouvir = (url: string) => {
    audio.current?.pause()
    audio.current = new Audio(url)
    void audio.current.play().catch(() => undefined)
  }
  return (
    <Folha titulo="Voz da Z" onFechar={onFechar}>
      <label className="zl-check">
        <input type="checkbox" checked={filtro} onChange={(e) => setFiltro(e.target.checked)} />
        <span>Só femininas em português do Brasil</span>
      </label>
      {erro ? (
        <p className="zro-field__error" role="alert">
          {erro}
        </p>
      ) : !vozes ? (
        <p className="adm-empty" role="status">
          Buscando as vozes da conta…
        </p>
      ) : lista.length ? (
        <ul className="zl-vozes">
          {lista.map((v) => (
            <li key={v.id} data-atual={v.id === atual ? '' : undefined}>
              <button type="button" className="zl-botao" aria-label={`Ouvir ${v.nome}`} disabled={!v.previa} onClick={() => v.previa && ouvir(v.previa)}>
                <Icon name="play" size={16} />
              </button>
              <span className="zl-vozes__nome">
                <strong>{v.nome}</strong>
                <span className="adm-hint">{v.rotulos.join(' · ') || v.categoria}</span>
              </span>
              <button type="button" className="glass-btn cst-btn" onClick={() => onEscolher(v)}>
                {v.id === atual ? 'Escolhida' : 'Usar'}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="adm-empty">Nenhuma voz feminina em português na conta. Crie uma com o Voice Design.</p>
      )}
    </Folha>
  )
}

function CriarVoz({
  descricao: d0,
  texto: t0,
  onFechar,
  onCriada,
}: {
  descricao: string
  texto: string
  onFechar: () => void
  onCriada: (v: { id: string; nome: string }) => void
}) {
  const [descricao, setDescricao] = useState(d0)
  const [texto, setTexto] = useState(t0)
  const [amostras, setAmostras] = useState<Amostra[] | null>(null)
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const [nome, setNome] = useState('Z')
  const [ok, setOk] = useState(false)
  const [indo, setIndo] = useState<'gerando' | 'salvando' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => audio.current?.pause(), [])

  async function gerar() {
    setIndo('gerando')
    setErro(null)
    try {
      const r = await api<{ amostras: Amostra[] }>('/vozes/design', { method: 'POST', json: { descricao, texto, chave: crypto.randomUUID() } })
      setAmostras(r.amostras)
      setEscolhida(r.amostras[0]?.id ?? null)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setIndo(null)
    }
  }

  async function salvar() {
    if (!escolhida) return
    setIndo('salvando')
    setErro(null)
    try {
      const r = await api<{ voz: { id: string; nome: string } }>('/vozes', { method: 'POST', json: { amostra: escolhida, nome, descricao, confirmar: true } })
      onCriada(r.voz)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setIndo(null)
    }
  }

  return (
    <Folha titulo="Criar uma voz" onFechar={onFechar}>
      <div className="zro-field">
        <label className="zro-field__label" htmlFor="zl-desc">
          Como ela soa
        </label>
        <textarea id="zl-desc" className="zro-input zl-texto" rows={3} maxLength={1000} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </div>
      <details className="zl-app">
        <summary>Texto das amostras</summary>
        <textarea
          aria-label="Texto das amostras"
          className="zro-input zl-texto"
          rows={4}
          maxLength={1000}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      </details>
      <button
        type="button"
        className="glass-btn cst-btn"
        disabled={!!indo || descricao.trim().length < 10 || texto.trim().length < 100}
        aria-busy={indo === 'gerando'}
        onClick={() => void gerar()}
      >
        <Icon name="sparkle" />
        {indo === 'gerando' ? 'Gerando…' : amostras ? 'Gerar de novo' : 'Gerar 3 amostras'}
      </button>
      {amostras && (
        <>
          <ul className="zl-vozes" role="radiogroup" aria-label="Amostras">
            {amostras.map((a, i) => (
              <li key={a.id} data-atual={a.id === escolhida ? '' : undefined}>
                <button
                  type="button"
                  className="zl-botao"
                  aria-label={`Ouvir a amostra ${i + 1}`}
                  onClick={() => {
                    audio.current?.pause()
                    audio.current = new Audio(`data:${a.mime};base64,${a.audio}`)
                    void audio.current.play().catch(() => undefined)
                  }}
                >
                  <Icon name="play" size={16} />
                </button>
                <span className="zl-vozes__nome">
                  <strong>Amostra {i + 1}</strong>
                  <span className="adm-hint">{a.segundos ? `${Math.round(a.segundos)} s` : ''}</span>
                </span>
                <button type="button" role="radio" aria-checked={a.id === escolhida} className="glass-btn cst-btn" onClick={() => setEscolhida(a.id)}>
                  {a.id === escolhida ? 'Escolhida' : 'Escolher'}
                </button>
              </li>
            ))}
          </ul>
          <div className="zro-field">
            <label className="zro-field__label" htmlFor="zl-nome-voz">
              Nome na conta
            </label>
            <input id="zl-nome-voz" className="zro-input" value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} />
          </div>
          <label className="zl-check zl-check--forte">
            <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
            <span>Salvar na minha conta da ElevenLabs</span>
          </label>
          <div className="cst-form__fim">
            <button
              type="button"
              className="glass-btn glass-btn--ink cst-btn"
              disabled={!ok || !escolhida || !nome.trim() || !!indo}
              aria-busy={indo === 'salvando'}
              onClick={() => void salvar()}
            >
              {indo === 'salvando' ? 'Salvando…' : 'Salvar e usar'}
            </button>
          </div>
        </>
      )}
      {erro && (
        <p className="zro-field__error" role="alert">
          {erro}
        </p>
      )}
    </Folha>
  )
}
