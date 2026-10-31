'use client'
/**
 * Testar a Z nova (Laboratório da Z, ADR 0033): conversa por texto com ditado e anexos, conversa por voz (ModoVoz) e
 * comparação lado a lado (rascunho × versão publicada ou padrão). Nada da conversa fica guardado: o navegador manda o
 * histórico a cada turno; anexos de imagem e PDF somem dos arquivos da Anthropic quando a conversa recomeça.
 * Aprender conversando: no rascunho, a Z reconhece correções e mostra o cartão "Aprender"; só o "Guardar" (toque, ou
 * "pode guardar" dito ou escrito) leva ao rascunho, e o próximo turno já usa.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { ZConfig, ZLabAnexo, ZProposta } from '@zro/core'
import { api, conversar, ErroDoLab, usd, type EventoDeAprender, type UsoDoTurno } from '@/lib/ia/lab/cliente'
import type { LabEstado } from '@/lib/ia/lab/estado'
import { Icon } from '../../icons'
import { CartaoDeAprender, guardarProposta, type Cartao } from './aprender'
import { PalcoZ, Z } from '../../ia/simbolo-z'
import { TextoIa } from '../../ia/texto-ia'
import { Compositor, type AnexoPronto } from './compositor'
import { ModoVoz, type Perguntar } from './modo-voz'
import { Teto } from './teto'

export type Versao = 'rascunho' | 'padrao' | number
type Coluna = 'a' | 'b'
type Resposta = {
  texto: string
  estado: 'pensando' | 'escrevendo' | 'pronta' | 'erro' | 'interrompida'
  lendo?: string
  uso?: UsoDoTurno
  primeiroToken?: number
  total?: number
}
type Turno = {
  id: string
  pergunta: { texto: string; anexos: ZLabAnexo[]; vista: { nome: string; tipo: string }[]; porVoz?: boolean }
  a: Resposta
  b?: Resposta
  /** Cartões de aprendizado que a resposta da coluna A propôs. */
  cartoes?: Cartao[]
}

const MAX_MENSAGENS = 40
const MAX_PENDENTES = 5

/** Cartões esperando o titular (os mais novos no fim): vão em cada turno para ele poder confirmar falando. */
function pendentesDe(turnos: Turno[]): ZProposta[] {
  return turnos
    .flatMap((t) => t.cartoes ?? [])
    .filter((c) => c.estado === 'pendente' || c.estado === 'erro' || c.estado === 'ajustando')
    .map((c) => c.proposta)
    .slice(-MAX_PENDENTES)
}

/** O histórico que vai para a Z de uma coluna: perguntas e as respostas daquela coluna (as que chegaram a ter texto). */
function historicoDe(turnos: Turno[], col: Coluna) {
  const h: { papel: 'user' | 'assistant'; texto: string; anexos?: ZLabAnexo[] }[] = []
  for (const t of turnos) {
    h.push({ papel: 'user', texto: t.pergunta.texto, ...(t.pergunta.anexos.length ? { anexos: t.pergunta.anexos } : {}) })
    const r = t[col]
    if (r?.texto.trim() && r.estado !== 'erro') h.push({ papel: 'assistant', texto: r.texto })
  }
  let corte = h.slice(-MAX_MENSAGENS)
  while (corte.length && corte[0]!.papel !== 'user') corte = corte.slice(1)
  return corte
}

const nomeDaVersao = (v: Versao, publicada: number | null) =>
  v === 'rascunho' ? 'Rascunho' : v === 'padrao' ? 'Padrão de hoje' : `Versão ${v}${publicada === v ? ' · publicada' : ''}`

export function LabTestar({ estado, compararCom }: { estado: LabEstado; compararCom: number | null }) {
  const { catalogo } = estado
  const publicada = estado.publicada?.numero ?? null
  const [versao, setVersao] = useState<Versao>('rascunho')
  const [alvo, setAlvo] = useState<Versao>(compararCom ?? publicada ?? 'padrao')
  const [comparar, setComparar] = useState(compararCom != null)
  const [modelo, setModelo] = useState('')
  const [plataforma, setPlataforma] = useState('hub')
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [voz, setVoz] = useState(false)
  const [gasto, setGasto] = useState(estado.gasto)
  const [configs, setConfigs] = useState<Record<string, ZConfig>>({ rascunho: estado.rascunho, padrao: catalogo.padrao })
  const arquivos = useRef<Set<string>>(new Set())
  const parar = useRef<AbortController | null>(null)
  const fim = useRef<HTMLDivElement>(null)
  const turnosRef = useRef(turnos)
  turnosRef.current = turnos

  const semTeto = gasto.teto == null
  const configA = configs[String(versao)] ?? null

  // A configuração de uma versão (voz e modelo do teste) vem do servidor na primeira vez.
  useEffect(() => {
    for (const v of [versao, alvo]) {
      if (typeof v !== 'number' || configs[String(v)]) continue
      void api<{ config: ZConfig }>(`/versoes/${v}`)
        .then((r) => setConfigs((c) => ({ ...c, [String(v)]: r.config })))
        .catch(() => undefined)
    }
  }, [versao, alvo, configs])

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [turnos])

  const atualizar = useCallback((id: string, col: Coluna, f: (r: Resposta) => Resposta) => {
    setTurnos((ts) => ts.map((t) => (t.id === id ? { ...t, [col]: f(t[col] ?? { texto: '', estado: 'pensando' }) } : t)))
  }, [])

  const somarGasto = useCallback((custo: number) => setGasto((g) => ({ ...g, hoje: g.hoje + custo, mes: g.mes + custo })), [])

  /** Muda um cartão, onde quer que ele esteja na conversa. */
  const mudarCartao = useCallback((id: string, f: (c: Cartao) => Cartao) => {
    setTurnos((ts) =>
      ts.map((t) => (t.cartoes?.some((c) => c.proposta.id === id) ? { ...t, cartoes: t.cartoes.map((c) => (c.proposta.id === id ? f(c) : c)) } : t)),
    )
  }, [])

  const aoAprender = useCallback(
    (turnoId: string, e: EventoDeAprender) => {
      if (e.acao === 'proposto')
        setTurnos((ts) => ts.map((t) => (t.id === turnoId ? { ...t, cartoes: [...(t.cartoes ?? []), { proposta: e.proposta, estado: 'pendente' }] } : t)))
      else if (e.acao === 'salvo')
        mudarCartao(e.proposta, (c) => ({ ...c, estado: 'guardado', repetido: e.repetido, substituido: e.substituido?.texto ?? null, erro: undefined }))
      else if (e.acao === 'ignorado') mudarCartao(e.proposta, (c) => ({ ...c, estado: 'ignorado' }))
      else if (e.acao === 'recusado' && e.proposta) mudarCartao(e.proposta, (c) => ({ ...c, estado: 'erro', erro: e.motivo }))
      else if (e.acao === 'recusado') setAviso(e.motivo)
      else if (e.acao === 'repetido')
        setTurnos((ts) =>
          ts.map((t) =>
            t.id === turnoId
              ? {
                  ...t,
                  cartoes: [
                    ...(t.cartoes ?? []),
                    {
                      proposta: { id: crypto.randomUUID(), tipo: 'regra', texto: e.texto, plataforma: null, exemplo: null, gatilho: '' },
                      estado: 'guardado',
                      repetido: true,
                    },
                  ],
                }
              : t,
          ),
        )
    },
    [mudarCartao],
  )

  /** O toque em Guardar (com o texto ajustado, se mudou). */
  const guardarCartao = useCallback(
    async (c: Cartao, texto?: string) => {
      mudarCartao(c.proposta.id, (x) => ({ ...x, estado: 'guardando', erro: undefined }))
      try {
        const r = await guardarProposta(c.proposta, texto)
        mudarCartao(c.proposta.id, (x) => ({
          ...x,
          proposta: { ...x.proposta, texto: r.aprendizado.texto },
          estado: 'guardado',
          repetido: r.repetido,
          substituido: r.substituido?.texto ?? null,
        }))
      } catch (err) {
        mudarCartao(c.proposta.id, (x) => ({ ...x, estado: 'erro', erro: err instanceof ErroDoLab ? err.message : 'Não deu para guardar agora.' }))
      }
    },
    [mudarCartao],
  )
  const acoesDoCartao = (c: Cartao) => ({
    onGuardar: (texto?: string) => void guardarCartao(c, texto),
    onIgnorar: () => mudarCartao(c.proposta.id, (x) => ({ ...x, estado: 'ignorado' })),
    onAjustar: (sim: boolean) => mudarCartao(c.proposta.id, (x) => ({ ...x, estado: sim ? 'ajustando' : 'pendente' })),
  })

  /** Um turno numa coluna, em streaming. `aoTexto` recebe cada pedaço (a voz fala enquanto chega). */
  const responderColuna = useCallback(
    async (
      id: string,
      col: Coluna,
      v: Versao,
      historico: ReturnType<typeof historicoDe>,
      opcoes: { porVoz?: boolean; modelo?: string; signal: AbortSignal; aoTexto?: (t: string) => void; aoPrimeiroToken?: () => void },
    ) => {
      const t0 = performance.now()
      let primeiro = true
      let texto = ''
      // Aprender só no rascunho e só na coluna principal (a comparação não propõe nada).
      const aprender = v === 'rascunho' && col === 'a'
      try {
        await conversar(
          {
            versao: v,
            modelo: opcoes.modelo || modelo || null,
            plataforma,
            voz: !!opcoes.porVoz,
            historico,
            ...(aprender ? { aprender: true, pendentes: pendentesDe(turnosRef.current) } : {}),
          },
          (e) => {
            if (e.tipo === 'aprendizado') {
              if (aprender) aoAprender(id, e)
            } else if (e.tipo === 'texto') {
              texto += e.t
              if (primeiro) {
                primeiro = false
                opcoes.aoPrimeiroToken?.()
                atualizar(id, col, (r) => ({ ...r, primeiroToken: performance.now() - t0 }))
              }
              opcoes.aoTexto?.(e.t)
              atualizar(id, col, (r) => ({ ...r, texto: r.texto + e.t, estado: 'escrevendo', lendo: undefined }))
            } else if (e.tipo === 'lendo') atualizar(id, col, (r) => ({ ...r, lendo: e.rotulo ?? `Lendo ${e.o_que}…` }))
            else if (e.tipo === 'fim') {
              somarGasto(e.uso.custoUsd)
              atualizar(id, col, (r) => ({ ...r, estado: 'pronta', uso: e.uso, total: performance.now() - t0 }))
            } else if (e.tipo === 'erro') atualizar(id, col, (r) => ({ ...r, estado: r.texto ? 'interrompida' : 'erro', texto: r.texto || e.mensagem }))
          },
          opcoes.signal,
        )
      } catch (err) {
        if (opcoes.signal.aborted) atualizar(id, col, (r) => ({ ...r, estado: 'interrompida' }))
        else {
          const m = err instanceof ErroDoLab ? err.message : 'A Z não respondeu. Tente de novo.'
          atualizar(id, col, (r) => ({ ...r, estado: 'erro', texto: r.texto || m }))
          if (err instanceof ErroDoLab && (err.codigo === 'quota_exceeded' || err.codigo === 'quota_not_configured')) setAviso(m)
        }
      }
      return texto
    },
    [aoAprender, atualizar, modelo, plataforma, somarGasto],
  )

  const enviar = useCallback(
    async (texto: string, anexos: AnexoPronto[]) => {
      if (ocupado) return
      setAviso(null)
      const id = crypto.randomUUID()
      const pergunta = { texto, anexos: anexos.flatMap((a) => a.anexos), vista: anexos.map((a) => ({ nome: a.nome, tipo: a.tipo })) }
      anexos.forEach((a) => a.arquivos.forEach((f) => arquivos.current.add(f)))
      const novo: Turno = { id, pergunta, a: { texto: '', estado: 'pensando' }, ...(comparar ? { b: { texto: '', estado: 'pensando' } } : {}) }
      const lista = [...turnosRef.current, novo]
      setTurnos(lista)
      setOcupado(true)
      const ctrl = new AbortController()
      parar.current = ctrl
      await Promise.all([
        responderColuna(id, 'a', versao, historicoDe(lista, 'a'), { signal: ctrl.signal }),
        ...(comparar ? [responderColuna(id, 'b', alvo, historicoDe(lista, 'b'), { signal: ctrl.signal })] : []),
      ])
      setOcupado(false)
    },
    [ocupado, comparar, versao, alvo, responderColuna],
  )

  /** A conversa por voz usa a mesma conversa (coluna A), com a resposta pensada para ser falada. */
  const perguntarPorVoz: Perguntar = useCallback(
    async (texto, o) => {
      const id = crypto.randomUUID()
      const lista = [...turnosRef.current, { id, pergunta: { texto, anexos: [], vista: [], porVoz: true }, a: { texto: '', estado: 'pensando' as const } }]
      setTurnos(lista)
      return responderColuna(id, 'a', versao, historicoDe(lista, 'a'), {
        porVoz: true,
        modelo: o.modelo,
        signal: o.signal,
        aoTexto: o.aoTexto,
        aoPrimeiroToken: o.aoPrimeiroToken,
      })
    },
    [responderColuna, versao],
  )

  const recomecar = () => {
    parar.current?.abort()
    setTurnos([])
    setAviso(null)
    // Imagens e PDFs saem dos arquivos da Anthropic agora (de qualquer jeito somem em 24 h).
    for (const f of arquivos.current) void api(`/anexos/${f}`, { method: 'DELETE' }).catch(() => undefined)
    arquivos.current.clear()
  }

  // Na voz, o cartão mais novo da conversa por voz (some quando ignorado).
  const cartaoDaVoz = useMemo(() => {
    const ultimo = [...turnos].reverse().find((t) => t.pergunta.porVoz && t.cartoes?.length)
    return ultimo?.cartoes?.filter((c) => c.estado !== 'ignorado').at(-1) ?? null
  }, [turnos])

  const opcoesVersao = useMemo<Versao[]>(() => ['rascunho', ...estado.versoes.map((v) => v.numero), 'padrao'], [estado.versoes])
  const vazio = turnos.length === 0

  return (
    <div className="zl-testar" data-comparar={comparar ? '' : undefined}>
      <div className="zl-barra" role="toolbar" aria-label="Como testar">
        <label className="zl-sel" title="Qual configuração da Z responde">
          <span className="zro-sr-only">Versão</span>
          <select value={String(versao)} onChange={(e) => setVersao(lerVersao(e.target.value))}>
            {opcoesVersao.map((v) => (
              <option key={String(v)} value={String(v)}>
                {nomeDaVersao(v, publicada)}
              </option>
            ))}
          </select>
        </label>
        <label className="zl-sel" title="Modelo do Claude neste teste">
          <span className="zro-sr-only">Modelo</span>
          <select value={modelo} onChange={(e) => setModelo(e.target.value)}>
            <option value="">Modelo da versão</option>
            {catalogo.modelos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome} · {m.nota}
              </option>
            ))}
          </select>
        </label>
        <label className="zl-sel" title="De qual plataforma a pessoa fala">
          <span className="zro-sr-only">Plataforma</span>
          <select value={plataforma} onChange={(e) => setPlataforma(e.target.value)}>
            {catalogo.apps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="zl-chip" aria-pressed={comparar} onClick={() => setComparar((c) => !c)} title="Mesma pergunta para duas versões">
          <Icon name="swap" size={16} />
          Comparar
        </button>
        {comparar && (
          <label className="zl-sel" title="Comparar com">
            <span className="zro-sr-only">Comparar com</span>
            <select value={String(alvo)} onChange={(e) => setAlvo(lerVersao(e.target.value))}>
              {opcoesVersao.map((v) => (
                <option key={String(v)} value={String(v)}>
                  {nomeDaVersao(v, publicada)}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="zl-barra__fim">
          <Teto gasto={gasto} compacto />
          {!vazio && (
            <button type="button" className="zl-chip" onClick={recomecar}>
              Nova conversa
            </button>
          )}
        </span>
      </div>

      {aviso && (
        <p className="zl-aviso" role="alert">
          {aviso}
        </p>
      )}

      {vazio ? (
        <section className="zl-inicio" aria-label="Começar">
          <PalcoZ cena={semTeto ? 'calma' : 'pronta'} className="zl-inicio__palco">
            <Z movimento={semTeto ? 'parada' : 'pronta'} tamanho={150} vento />
          </PalcoZ>
          <h2 className="zl-inicio__titulo">
            <span className="zl-head__fino">Oi, eu sou a </span>Z.
          </h2>
          <button
            type="button"
            className="glass-btn glass-btn--ink zl-inicio__voz"
            disabled={!estado.chaves.voz || semTeto}
            title={
              !estado.chaves.voz ? `Conecte a chave da ElevenLabs (${estado.nomesDasChaves.voz})` : semTeto ? 'Defina o teto de hoje' : 'Conversar por voz'
            }
            onClick={() => setVoz(true)}
          >
            <Icon name="wave" />
            Conversar por voz
          </button>
          {!estado.chaves.voz && (
            <p className="adm-hint">
              Voz desligada: falta <code>{estado.nomesDasChaves.voz}</code>.
            </p>
          )}
          {semTeto && <Teto gasto={gasto} onMudou={(teto) => setGasto((g) => ({ ...g, teto }))} />}
        </section>
      ) : (
        <ol className="zl-conversa" aria-live="polite">
          {turnos.map((t) => (
            <li key={t.id} className="zl-turno">
              <div className="zl-msg zl-msg--eu">
                {t.pergunta.vista.length > 0 && (
                  <ul className="zl-msg__anexos" aria-label="Anexos">
                    {t.pergunta.vista.map((a, i) => (
                      <li key={i} className="zl-anexo" data-tipo={a.tipo}>
                        <Icon name={a.tipo === 'imagem' ? 'camera' : a.tipo === 'audio' || a.tipo === 'video' ? 'wave' : 'files'} size={14} />
                        {a.nome}
                      </li>
                    ))}
                  </ul>
                )}
                {t.pergunta.texto && <p>{t.pergunta.texto}</p>}
                {t.pergunta.porVoz && (
                  <span className="zl-msg__voz" title="Falado">
                    <Icon name="mic" size={12} />
                  </span>
                )}
              </div>
              <div className="zl-respostas">
                <RespostaVista r={t.a} rotulo={comparar || t.b ? nomeDaVersao(versao, publicada) : null} />
                {t.b && <RespostaVista r={t.b} rotulo={nomeDaVersao(alvo, publicada)} />}
              </div>
              {t.cartoes?.map((c) => (
                <CartaoDeAprender key={c.proposta.id} cartao={c} {...acoesDoCartao(c)} />
              ))}
            </li>
          ))}
          <div ref={fim} />
        </ol>
      )}

      <Compositor
        desligado={semTeto}
        ocupado={ocupado}
        vozLigada={estado.chaves.voz}
        nomeChaveVoz={estado.nomesDasChaves.voz}
        onEnviar={enviar}
        onParar={() => parar.current?.abort()}
        onVoz={() => setVoz(true)}
        onAviso={setAviso}
        onArquivo={(f) => arquivos.current.add(f)}
      />

      {voz && configA && (
        <ModoVoz
          config={configA}
          catalogo={catalogo}
          modeloDoTeste={modelo}
          perguntar={perguntarPorVoz}
          onGasto={somarGasto}
          onFechar={() => setVoz(false)}
          cartao={cartaoDaVoz ? <CartaoDeAprender cartao={cartaoDaVoz} compacto {...acoesDoCartao(cartaoDaVoz)} /> : null}
        />
      )}
    </div>
  )
}

function lerVersao(v: string): Versao {
  return v === 'rascunho' || v === 'padrao' ? v : Number(v)
}

const ms = (n?: number) => (n == null ? null : n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(1).replace('.', ',')} s`)

function RespostaVista({ r, rotulo }: { r: Resposta; rotulo: string | null }) {
  return (
    <article className="zl-msg zl-msg--z" data-estado={r.estado} style={{ '--i': 0 } as CSSProperties}>
      {rotulo && <span className="zl-msg__rotulo">{rotulo}</span>}
      {r.estado === 'pensando' && !r.texto ? (
        <span className="zl-pensando" role="status">
          <Z movimento="pensando" tamanho={22} />
          {r.lendo ?? 'Pensando…'}
        </span>
      ) : (
        <TextoIa texto={r.texto} />
      )}
      {r.lendo && r.texto && <span className="zl-pensando">{r.lendo}</span>}
      {(r.uso || r.primeiroToken != null) && (
        <p className="zl-msg__meta">
          {r.primeiroToken != null && <span title="Até a primeira palavra">1ª palavra {ms(r.primeiroToken)}</span>}
          {r.uso && (
            <span
              title={`${r.uso.entrada.toLocaleString('pt-BR')} entrada · ${r.uso.cache.toLocaleString('pt-BR')} cache · ${r.uso.saida.toLocaleString('pt-BR')} saída`}
            >
              {usd(r.uso.custoUsd)}
            </span>
          )}
          {r.estado === 'interrompida' && <span>interrompida</span>}
        </p>
      )}
    </article>
  )
}
