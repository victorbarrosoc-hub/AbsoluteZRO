'use client'
/**
 * Conversa por voz com a Z, no jeito da voz do ChatGPT (Laboratório da Z, ADR 0033).
 *
 * - Mãos livres: o microfone fica aberto numa escuta ao vivo (Scribe v2 Realtime, VAD da própria ElevenLabs). Quando a
 *   pessoa termina de falar, o trecho fechado vai para a Z. Falou por cima da Z, ela para na hora (barge-in).
 *   Se a ElevenLabs recusar a escuta ao vivo (token ou WebSocket), segue por frase sem erro: o VAD daqui corta cada frase
 *   (~700 ms de silêncio) e o HUB transcreve com o Scribe v2. Uma nota calma avisa; o custo e o teto seguem valendo.
 * - Segure para falar: grava enquanto o botão está apertado e transcreve ao soltar (Scribe v2, mais barato).
 * - A resposta chega em streaming; cada frase fechada já vira voz (ElevenLabs, PCM em streaming) enquanto o resto ainda
 *   está sendo escrito. Legenda ao vivo e o tempo de cada etapa: escuta, primeira palavra e primeira voz.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ZConfig } from '@zro/core'
import { EscutaAoVivo, EscutaPorFrase, Gravador, Microfone, pedacosDoPcm, Tocador } from '@/lib/ia/lab/audio'
import { api, ErroDoLab, falar, transcrever } from '@/lib/ia/lab/cliente'
import type { LabCatalogo } from '@/lib/ia/lab/estado'
import { Frases } from '@/lib/ia/lab/frases'
import { Icon } from '../../icons'
import { PalcoZ, Z, type CenaZ } from '../../ia/simbolo-z'

export type Perguntar = (
  texto: string,
  o: { modelo?: string; signal: AbortSignal; aoTexto: (t: string) => void; aoPrimeiroToken: () => void },
) => Promise<string>

type Fase = 'abrindo' | 'ouvindo' | 'transcrevendo' | 'pensando' | 'falando' | 'pronta' | 'erro'
type Modo = 'livre' | 'segurar'
type Voz = { id: string; nome: string; feminina: boolean; ptBr: boolean }
type Latencias = { escuta?: number; token?: number; voz?: number }

const CENA: Record<Fase, CenaZ> = {
  abrindo: 'calma',
  ouvindo: 'ouvindo',
  transcrevendo: 'pensando',
  pensando: 'pensando',
  falando: 'respondendo',
  pronta: 'pronta',
  erro: 'calma',
}
const ROTULO: Record<Fase, string> = {
  abrindo: 'Abrindo…',
  ouvindo: 'Ouvindo',
  transcrevendo: 'Entendendo…',
  pensando: 'Pensando…',
  falando: 'Falando',
  pronta: 'Pronta',
  erro: 'Parou',
}
/** Escuta ao vivo: no máximo 15 min por sessão (o token da ElevenLabs vale isso). */
const ESCUTA_MAX_MS = 15 * 60_000
/** Abaixo disso, a frase dita por cima da Z é eco do alto-falante, não pergunta. */
const MIN_POR_CIMA = 6
export const NOTA_POR_FRASE = 'Escuta ao vivo indisponível: usando transcrição por frase'

type Escuta = { tipo: 'vivo'; e: EscutaAoVivo; mic: Microfone; sessao: string } | { tipo: 'frase'; f: EscutaPorFrase }

const ms = (n?: number) => (n == null ? '—' : n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(1).replace('.', ',')} s`)

export function ModoVoz({
  config,
  catalogo,
  modeloDoTeste,
  perguntar,
  onGasto,
  onFechar,
  cartao,
}: {
  config: ZConfig
  catalogo: LabCatalogo
  modeloDoTeste: string
  perguntar: Perguntar
  onGasto: (usd: number) => void
  onFechar: () => void
  /** O cartão "Aprender" da conversa por voz (confirma tocando ou dizendo "pode guardar"). */
  cartao?: ReactNode
}) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const [fase, setFase] = useState<Fase>('abrindo')
  const [modo, setModo] = useState<Modo>('livre')
  const [modelo, setModelo] = useState(modeloDoTeste || config.modelo.id)
  const [voz, setVoz] = useState<Voz | null>(config.voz.id ? { id: config.voz.id, nome: config.voz.nome ?? 'Voz escolhida', feminina: true, ptBr: true } : null)
  const [ouvido, setOuvido] = useState('')
  const [falado, setFalado] = useState('')
  const [lat, setLat] = useState<Latencias>({})
  const [nivel, setNivel] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [mudo, setMudo] = useState(false)
  const [porFrase, setPorFrase] = useState(false)

  const tocador = useRef<Tocador | null>(null)
  const escuta = useRef<Escuta | null>(null)
  /** A escuta ao vivo foi recusada nesta conversa: não pede de novo, vai direto por frase. */
  const semAoVivo = useRef(false)
  const gravador = useRef<Gravador | null>(null)
  const atual = useRef<AbortController | null>(null)
  const faseRef = useRef<Fase>('abrindo')
  const modoRef = useRef<Modo>('livre')
  const mudoRef = useRef(false)
  const ultimoParcial = useRef(0)
  const anterior = useRef('')
  const vozRef = useRef(voz)
  const modeloRef = useRef(modelo)
  vozRef.current = voz
  modeloRef.current = modelo
  mudoRef.current = mudo

  const mudarFase = useCallback((f: Fase) => {
    faseRef.current = f
    setFase(f)
  }, [])
  const emEscuta = useCallback(() => mudarFase(modoRef.current === 'livre' ? 'ouvindo' : 'pronta'), [mudarFase])

  /** A pessoa falou por cima: a Z para de falar e de escrever na hora. */
  const interromper = useCallback(() => {
    atual.current?.abort()
    atual.current = null
    tocador.current?.parar()
  }, [])

  /** Uma frase em voz, tocando enquanto chega. Devolve quando o áudio terminou de chegar. */
  const falarFrase = useCallback(
    async (texto: string, signal: AbortSignal, t0: number, primeira: { feita: boolean }) => {
      const v = vozRef.current
      if (!v || signal.aborted) return
      const leitor = await falar(
        {
          texto,
          voz: v.id,
          modelo: config.voz.modelo,
          velocidade: config.voz.velocidade,
          estabilidade: config.voz.estabilidade,
          anterior: anterior.current.slice(-500) || null,
          chave: crypto.randomUUID(),
        },
        signal,
      )
      anterior.current = `${anterior.current} ${texto}`.trim()
      onGasto((texto.length / 1000) * (catalogo.vozModelos.find((m) => m.id === config.voz.modelo)?.usdPorMilCaracteres ?? 0.08))
      for (;;) {
        const { value, done } = await leitor.read()
        if (done || signal.aborted) break
        if (!primeira.feita) {
          primeira.feita = true
          setLat((l) => ({ ...l, voz: performance.now() - t0 }))
          mudarFase('falando')
        }
        tocador.current?.tocar(value)
      }
    },
    [catalogo.vozModelos, config.voz, mudarFase, onGasto],
  )

  /** Um turno por voz: pergunta → Z em streaming → frases em voz. */
  const responder = useCallback(
    async (texto: string) => {
      interromper()
      const ctrl = new AbortController()
      atual.current = ctrl
      setOuvido(texto)
      setFalado('')
      setErro(null)
      mudarFase('pensando')
      anterior.current = ''
      const t0 = performance.now()
      const frases = new Frases()
      const primeira = { feita: false }
      let fila = Promise.resolve()
      const enfileirar = (f: string) => {
        fila = fila
          .then(() => falarFrase(f, ctrl.signal, t0, primeira))
          .catch((err) => {
            if (!ctrl.signal.aborted) setErro(err instanceof ErroDoLab ? err.message : 'A voz falhou agora.')
          })
      }
      try {
        await perguntar(texto, {
          modelo: modeloRef.current,
          signal: ctrl.signal,
          aoPrimeiroToken: () => setLat((l) => ({ ...l, token: performance.now() - t0 })),
          aoTexto: (pedaco) => {
            setFalado((s) => s + pedaco)
            for (const f of frases.empurrar(pedaco)) enfileirar(f)
          },
        })
        if (ctrl.signal.aborted) return
        for (const f of frases.fechar()) enfileirar(f)
        await fila
      } catch {
        if (!ctrl.signal.aborted) setErro('A Z não respondeu agora.')
      }
      if (ctrl.signal.aborted || atual.current !== ctrl) return
      // Espera o alto-falante esvaziar antes de voltar a ouvir.
      if (tocador.current?.falando) await new Promise<void>((ok) => tocador.current!.aoTerminar(ok))
      if (atual.current === ctrl) {
        atual.current = null
        emEscuta()
      }
    },
    [emEscuta, falarFrase, interromper, mudarFase, perguntar],
  )
  const responderRef = useRef(responder)
  responderRef.current = responder

  // ───── mãos livres: escuta ao vivo ─────
  const fecharEscuta = useCallback(() => {
    const s = escuta.current
    if (!s) return
    escuta.current = null
    setNivel(0)
    if (s.tipo === 'frase') return s.f.fechar()
    const segundos = s.e.segundos()
    s.mic.fechar()
    s.e.fechar()
    void api('/escuta/fim', { method: 'POST', json: { sessao: s.sessao, segundos } }).catch(() => undefined)
  }, [])

  /** Uma frase fechada pelo VAD daqui: o HUB transcreve (Scribe v2) e a Z responde. */
  const ouvirFrase = useCallback(
    async (pcm: Uint8Array, fimDaFala: number) => {
      const f = faseRef.current
      const porCima = f === 'falando' || f === 'pensando'
      if (!porCima) mudarFase('transcrevendo')
      try {
        const r = await transcrever([pcm], { idioma: 'pt' })
        onGasto(r.custoUsd)
        if (escuta.current?.tipo !== 'frase') return
        // Por cima da Z, trecho curtinho é eco: não vira pergunta (como na escuta ao vivo).
        if (!r.texto || (porCima && r.texto.length < MIN_POR_CIMA)) {
          if (faseRef.current === 'transcrevendo') emEscuta()
          return
        }
        setLat({ escuta: performance.now() - fimDaFala })
        void responderRef.current(r.texto)
      } catch (err) {
        if (escuta.current?.tipo !== 'frase') return
        setErro(err instanceof ErroDoLab ? err.message : 'Não deu para entender agora.')
        if (faseRef.current === 'transcrevendo') emEscuta()
      }
    },
    [emEscuta, mudarFase, onGasto],
  )

  const abrirPorFrase = useCallback(async () => {
    semAoVivo.current = true
    setPorFrase(true)
    const f = new EscutaPorFrase({
      frase: ({ pcm, silencioMs, fechouEm }) => void ouvirFrase(pcm, fechouEm - silencioMs),
      nivel: (n) => setNivel(n),
    })
    f.mudo = mudoRef.current
    await f.abrir()
    escuta.current = { tipo: 'frase', f }
  }, [ouvirFrase])

  const abrirEscuta = useCallback(async () => {
    if (escuta.current) return
    if (semAoVivo.current) return abrirPorFrase()
    const r = await api<{ aoVivo: false } | { aoVivo: true; token: string; sessao: string; url: string }>('/escuta', { method: 'POST', json: {} })
    if (!r.aoVivo) return abrirPorFrase()
    const e = new EscutaAoVivo(
      { url: r.url, token: r.token },
      {
        parcial: (t) => {
          ultimoParcial.current = performance.now()
          setOuvido(t)
          // Falou por cima (e não é eco): para a Z.
          const f = faseRef.current
          if ((f === 'falando' || f === 'pensando') && t.trim().length >= 6) {
            interromper()
            mudarFase('ouvindo')
          }
        },
        final: (t) => {
          // Trecho curtinho enquanto a Z fala costuma ser eco do alto-falante: não vira pergunta.
          if ((faseRef.current === 'falando' || faseRef.current === 'pensando') && t.length < 6) return
          setLat({ escuta: ultimoParcial.current ? performance.now() - ultimoParcial.current : undefined })
          void responderRef.current(t)
        },
        erro: (m) => setErro(m),
        fechou: () => {
          if (escuta.current?.tipo === 'vivo' && escuta.current.e === e) fecharEscuta()
        },
      },
    )
    try {
      await e.abrir()
    } catch {
      // O WebSocket não abriu (token recusado na conexão, rede): fecha a sessão sem custo e segue por frase.
      void api('/escuta/fim', { method: 'POST', json: { sessao: r.sessao, segundos: 0 } }).catch(() => undefined)
      return abrirPorFrase()
    }
    const mic = new Microfone(
      (pcm) => {
        if (!mudoRef.current) e.enviar(pcm)
      },
      (n) => setNivel(n),
    )
    try {
      await mic.abrir()
    } catch (err) {
      e.fechar()
      throw err
    }
    escuta.current = { tipo: 'vivo', e, mic, sessao: r.sessao }
  }, [abrirPorFrase, fecharEscuta, interromper, mudarFase])

  // Abre: destrava o som, diz a saudação e começa a ouvir.
  useEffect(() => {
    const d = dialogo.current
    if (d && !d.open) {
      d.showModal()
      // O foco vai para o microfone (a ação principal), não para o seletor de modelo com o anel de foco.
      d.querySelector<HTMLElement>('.zl-voz__falar')?.focus()
    }
    tocador.current = new Tocador()
    let vivo = true
    ;(async () => {
      try {
        await tocador.current!.destravar()
        if (!vozRef.current) {
          const { vozes } = await api<{ vozes: Voz[] }>('/vozes')
          const escolhida = vozes.find((v) => v.feminina && v.ptBr) ?? vozes.find((v) => v.feminina) ?? vozes[0] ?? null
          if (!escolhida) throw new ErroDoLab('Nenhuma voz na conta da ElevenLabs. Crie uma no Configurar.', null, 404)
          if (vivo) setVoz(escolhida)
          vozRef.current = escolhida
        }
        if (!vivo) return
        const ctrl = new AbortController()
        atual.current = ctrl
        const saudacao = config.voz.saudacao.trim()
        if (saudacao) {
          setFalado(saudacao)
          await falarFrase(saudacao, ctrl.signal, performance.now(), { feita: false })
        }
        if (!vivo) return
        await abrirEscuta()
        if (!vivo) return fecharEscuta()
        if (tocador.current?.falando) await new Promise<void>((ok) => tocador.current!.aoTerminar(ok))
        if (atual.current === ctrl) atual.current = null
        if (vivo && faseRef.current !== 'pensando') emEscuta()
      } catch (err) {
        if (!vivo) return
        setErro(err instanceof ErroDoLab ? err.message : 'O microfone não abriu. Confira a permissão do navegador.')
        mudarFase('erro')
      }
    })()
    const limite = setTimeout(() => {
      // Só a escuta ao vivo tem sessão de 15 min; por frase, cada frase é um pedido.
      if (escuta.current?.tipo !== 'vivo') return
      fecharEscuta()
      setErro('A escuta fecha sozinha depois de 15 minutos. Abra de novo para continuar.')
      mudarFase('pronta')
    }, ESCUTA_MAX_MS)
    return () => {
      vivo = false
      clearTimeout(limite)
      atual.current?.abort()
      fecharEscuta()
      gravador.current?.cancelar()
      tocador.current?.fechar()
      tocador.current = null
    }
    // Só ao abrir: a voz e a saudação são as da versão em teste naquele momento.
  }, [])

  async function trocarModo(m: Modo) {
    if (m === modo) return
    modoRef.current = m
    setModo(m)
    setErro(null)
    interromper()
    if (m === 'segurar') {
      fecharEscuta()
      mudarFase('pronta')
    } else {
      try {
        await abrirEscuta()
        mudarFase('ouvindo')
      } catch (err) {
        setErro(err instanceof ErroDoLab ? err.message : 'O microfone não abriu.')
        mudarFase('erro')
      }
    }
  }

  // ───── segure para falar ─────
  async function apertar() {
    if (gravador.current) return
    interromper()
    setErro(null)
    const g = new Gravador((n) => setNivel(n))
    gravador.current = g
    try {
      await g.abrir()
      mudarFase('ouvindo')
      setOuvido('')
    } catch {
      gravador.current = null
      setErro('O microfone não abriu. Confira a permissão do navegador.')
      mudarFase('erro')
    }
  }
  async function soltar() {
    const g = gravador.current
    if (!g) return
    gravador.current = null
    const pcm = g.fechar()
    setNivel(0)
    if (pcm.length < 6400) return mudarFase('pronta')
    mudarFase('transcrevendo')
    const t0 = performance.now()
    try {
      const r = await transcrever(pedacosDoPcm(pcm), { idioma: 'pt' })
      onGasto(r.custoUsd)
      setLat({ escuta: performance.now() - t0 })
      if (!r.texto) {
        setErro('Não ouvi nada. Tente de novo.')
        return mudarFase('pronta')
      }
      await responder(r.texto)
    } catch (err) {
      setErro(err instanceof ErroDoLab ? err.message : 'Não deu para entender agora.')
      mudarFase('pronta')
    }
  }

  const fechar = () => dialogo.current?.close()
  const legenda = falado
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .slice(-2)
    .join(' ')

  return (
    <dialog
      ref={dialogo}
      className="zl-voz"
      aria-label="Conversa por voz com a Z"
      onClose={onFechar}
      data-fase={fase}
      style={{ ['--nivel' as string]: String(nivel) }}
    >
      <div className="zl-voz__topo">
        <label className="zl-sel zl-sel--vidro" title="Modelo do Claude na voz">
          <span className="zro-sr-only">Modelo</span>
          <select value={modelo} onChange={(e) => setModelo(e.target.value)}>
            {catalogo.modelos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome} · {m.nota}
              </option>
            ))}
          </select>
        </label>
        {voz && (
          <span className="zl-voz__nome" title={`${voz.nome} · troque a voz no Configurar`}>
            {voz.nome}
          </span>
        )}
        <button type="button" className="zl-voz__fechar" aria-label="Encerrar a conversa por voz" onClick={fechar}>
          <Icon name="plus" />
        </button>
      </div>

      <div className="zl-voz__centro">
        <PalcoZ cena={CENA[fase]} className="zl-voz__palco">
          <Z movimento={fase === 'pensando' || fase === 'transcrevendo' ? 'pensando' : fase === 'abrindo' ? 'parada' : 'pronta'} tamanho={190} vento />
        </PalcoZ>
        <p className="zl-voz__fase" role="status">
          {ROTULO[fase]}
        </p>
        {porFrase && modo === 'livre' && (
          <p className="zl-voz__nota" title="A ElevenLabs recusou a escuta ao vivo. Cada frase é transcrita quando você faz uma pausa.">
            {NOTA_POR_FRASE}
          </p>
        )}
      </div>

      <div className="zl-voz__legendas" aria-live="polite">
        {ouvido && <p className="zl-voz__ouvido">{ouvido}</p>}
        {legenda && <p className="zl-voz__falado">{legenda}</p>}
        {erro && (
          <p className="zl-voz__erro" role="alert">
            {erro}
          </p>
        )}
        {cartao}
      </div>

      <dl className="zl-voz__tempos" aria-label="Tempo de cada etapa">
        <div>
          <dt>Escuta</dt>
          <dd>{ms(lat.escuta)}</dd>
        </div>
        <div>
          <dt>1ª palavra</dt>
          <dd>{ms(lat.token)}</dd>
        </div>
        <div>
          <dt>1ª voz</dt>
          <dd>{ms(lat.voz)}</dd>
        </div>
      </dl>

      <div className="zl-voz__controles">
        <div className="zl-voz__modos" role="radiogroup" aria-label="Como falar">
          <button type="button" role="radio" aria-checked={modo === 'livre'} onClick={() => void trocarModo('livre')}>
            Mãos livres
          </button>
          <button type="button" role="radio" aria-checked={modo === 'segurar'} onClick={() => void trocarModo('segurar')}>
            Segure para falar
          </button>
        </div>
        {modo === 'segurar' ? (
          <button
            type="button"
            className="zl-voz__falar"
            data-ouvindo={fase === 'ouvindo' ? '' : undefined}
            aria-label="Segure para falar"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              void apertar()
            }}
            onPointerUp={() => void soltar()}
            onPointerCancel={() => void soltar()}
            onKeyDown={(e) => {
              if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
                e.preventDefault()
                void apertar()
              }
            }}
            onKeyUp={(e) => {
              if (e.key === ' ' || e.key === 'Enter') void soltar()
            }}
          >
            <Icon name="mic" size={28} />
          </button>
        ) : (
          <button
            type="button"
            className="zl-voz__falar"
            aria-pressed={mudo}
            aria-label={mudo ? 'Ligar o microfone' : 'Silenciar o microfone'}
            data-mudo={mudo ? '' : undefined}
            onClick={() => {
              if (fase === 'falando' || fase === 'pensando') interromper()
              const m = !mudo
              setMudo(m)
              if (escuta.current?.tipo === 'frase') escuta.current.f.mudo = m
            }}
          >
            <Icon name={mudo ? 'stop' : 'mic'} size={28} />
          </button>
        )}
        <button type="button" className="glass-btn cst-btn zl-voz__encerrar" onClick={fechar}>
          Encerrar
        </button>
      </div>
    </dialog>
  )
}
