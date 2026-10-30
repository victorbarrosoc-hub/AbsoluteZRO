/**
 * Áudio do Laboratório da Z no navegador (ADR 0033): microfone em PCM 16 kHz (o formato que o Scribe lê mais rápido),
 * fala da Z em PCM 24 kHz tocada pedaço a pedaço (começa no primeiro), áudio de anexos (áudio e vídeo) convertido aqui
 * mesmo e quadros-chave de vídeo. Nada disso grava no aparelho nem no HUB.
 *
 * As funções puras (reamostrar, converter, cortar) não usam o DOM e têm teste.
 */

export const TAXA_ESCUTA = 16_000
export const TAXA_FALA = 24_000
/** Bytes por segundo do PCM 16 bits mono a 16 kHz. */
export const BYTES_POR_SEGUNDO = TAXA_ESCUTA * 2
/** Cada pedaço enviado à transcrição: abaixo do limite do servidor (3,8 MB ≈ 118 s). */
export const PEDACO_SEGUNDOS = 100

/** Reamostragem contínua (linear), pedaço a pedaço, sem estalo entre um pedaço e outro. */
export class Reamostrador {
  private pos = 0
  private ultimo = 0
  constructor(
    private readonly de: number,
    private readonly para: number,
  ) {}
  empurrar(entrada: Float32Array): Float32Array {
    if (this.de === this.para) return entrada.slice()
    const passo = this.de / this.para
    const saida: number[] = []
    // `pos` é relativo ao começo deste pedaço; entre -1 e 0, interpola com a última amostra do pedaço anterior.
    while (Math.floor(this.pos) + 1 < entrada.length) {
      const i = Math.floor(this.pos)
      const f = this.pos - i
      const a = i < 0 ? this.ultimo : entrada[i]!
      const b = entrada[i + 1]!
      saida.push(a + (b - a) * f)
      this.pos += passo
    }
    this.pos -= entrada.length
    if (entrada.length) this.ultimo = entrada[entrada.length - 1]!
    return Float32Array.from(saida)
  }
}

export function reamostrar(entrada: Float32Array, de: number, para: number): Float32Array {
  return new Reamostrador(de, para).empurrar(entrada)
}

export function paraInt16(f: Float32Array): Int16Array {
  const out = new Int16Array(f.length)
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]!))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

/** PCM 16 bits little-endian (o formato do Scribe e da fala). */
export function bytesDoPcm(pcm: Int16Array): Uint8Array {
  const out = new Uint8Array(pcm.length * 2)
  const dv = new DataView(out.buffer)
  for (let i = 0; i < pcm.length; i++) dv.setInt16(i * 2, pcm[i]!, true)
  return out
}

export function juntar(partes: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of partes) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** Corta PCM 16 kHz em pedaços de até `segundos`, sempre em número par de bytes. */
export function pedacosDoPcm(pcm: Uint8Array, segundos = PEDACO_SEGUNDOS): Uint8Array[] {
  const tam = Math.max(2, Math.floor((segundos * BYTES_POR_SEGUNDO) / 2) * 2)
  const out: Uint8Array[] = []
  for (let i = 0; i < pcm.length; i += tam) out.push(pcm.subarray(i, Math.min(pcm.length, i + tam)))
  return out
}

export function base64(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Energia de um pedaço (0 a 1), para o anel de nível do microfone. */
export function nivelDe(f: Float32Array): number {
  let s = 0
  for (let i = 0; i < f.length; i++) s += f[i]! * f[i]!
  return Math.min(1, Math.sqrt(s / Math.max(1, f.length)) * 4)
}

// ───────────── microfone ─────────────

const PROCESSADOR = `class ZroMic extends AudioWorkletProcessor {
  process(inputs) { const c = inputs[0] && inputs[0][0]; if (c) this.port.postMessage(c.slice(0)); return true }
}
registerProcessor('zro-mic', ZroMic)`

/**
 * O microfone em PCM 16 kHz, com cancelamento de eco (a fala da Z no alto-falante não vira fala da pessoa). `aoAudio`
 * recebe cada pedaço; `aoNivel`, a energia para o desenho.
 */
export class Microfone {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private no: AudioWorkletNode | null = null
  constructor(
    private readonly aoAudio: (pcm: Int16Array) => void,
    private readonly aoNivel?: (n: number) => void,
  ) {}

  async abrir(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    })
    const ctx = new AudioContext()
    this.ctx = ctx
    const url = URL.createObjectURL(new Blob([PROCESSADOR], { type: 'application/javascript' }))
    try {
      await ctx.audioWorklet.addModule(url)
    } finally {
      URL.revokeObjectURL(url)
    }
    const fonte = ctx.createMediaStreamSource(this.stream)
    const no = new AudioWorkletNode(ctx, 'zro-mic')
    const mudo = ctx.createGain()
    mudo.gain.value = 0
    const r = new Reamostrador(ctx.sampleRate, TAXA_ESCUTA)
    no.port.onmessage = (e: MessageEvent<Float32Array>) => {
      this.aoNivel?.(nivelDe(e.data))
      this.aoAudio(paraInt16(r.empurrar(e.data)))
    }
    fonte.connect(no)
    no.connect(mudo).connect(ctx.destination)
    this.no = no
  }

  fechar(): void {
    this.no?.port.close()
    this.no?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.ctx?.close().catch(() => undefined)
    this.no = null
    this.stream = null
    this.ctx = null
  }
}

/** Grava enquanto aberto e devolve tudo em PCM 16 kHz (ditado e "segure para falar"). */
export class Gravador {
  private partes: Uint8Array[] = []
  private mic: Microfone
  inicio = 0
  constructor(aoNivel?: (n: number) => void) {
    this.mic = new Microfone((pcm) => this.partes.push(bytesDoPcm(pcm)), aoNivel)
  }
  async abrir() {
    this.partes = []
    await this.mic.abrir()
    this.inicio = performance.now()
  }
  fechar(): Uint8Array {
    this.mic.fechar()
    const pcm = juntar(this.partes)
    this.partes = []
    return pcm
  }
  cancelar() {
    this.mic.fechar()
    this.partes = []
  }
}

// ───────────── fala da Z ─────────────

/** Toca PCM 16 bits mono em fila, sem esperar o fim da resposta. `parar()` corta na hora (quando a pessoa interrompe). */
export class Tocador {
  private ctx: AudioContext | null = null
  private proximo = 0
  private sobra: number | null = null
  private fontes = new Set<AudioBufferSourceNode>()
  private ouvintes = new Set<() => void>()

  constructor(private readonly taxa = TAXA_FALA) {}

  /** Chamar num toque da pessoa (o navegador só deixa tocar depois de um gesto). */
  async destravar(): Promise<void> {
    if (!this.ctx) this.ctx = new AudioContext()
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }

  get falando(): boolean {
    return !!this.ctx && this.fontes.size > 0
  }

  /** Um pedaço de PCM (bytes). Um byte sobrando fica para o próximo pedaço. */
  tocar(bytes: Uint8Array): void {
    const ctx = this.ctx
    if (!ctx || !bytes.length) return
    let dados = bytes
    if (this.sobra != null) {
      dados = new Uint8Array(bytes.length + 1)
      dados[0] = this.sobra
      dados.set(bytes, 1)
      this.sobra = null
    }
    if (dados.length % 2) {
      this.sobra = dados[dados.length - 1]!
      dados = dados.subarray(0, dados.length - 1)
    }
    if (!dados.length) return
    const n = dados.length / 2
    const buf = ctx.createBuffer(1, n, this.taxa)
    const canal = buf.getChannelData(0)
    const dv = new DataView(dados.buffer, dados.byteOffset, dados.byteLength)
    for (let i = 0; i < n; i++) canal[i] = dv.getInt16(i * 2, true) / 0x8000
    const fonte = ctx.createBufferSource()
    fonte.buffer = buf
    fonte.connect(ctx.destination)
    const quando = Math.max(ctx.currentTime + 0.03, this.proximo)
    fonte.start(quando)
    this.proximo = quando + buf.duration
    this.fontes.add(fonte)
    fonte.onended = () => {
      this.fontes.delete(fonte)
      if (!this.fontes.size) this.ouvintes.forEach((f) => f())
    }
  }

  /** Quando a fila esvaziar (a Z terminou de falar). */
  aoTerminar(f: () => void): () => void {
    this.ouvintes.add(f)
    return () => this.ouvintes.delete(f)
  }

  parar(): void {
    for (const f of this.fontes) {
      f.onended = null
      try {
        f.stop()
      } catch {
        /* já parou */
      }
    }
    this.fontes.clear()
    this.sobra = null
    this.proximo = 0
  }

  fechar(): void {
    this.parar()
    void this.ctx?.close().catch(() => undefined)
    this.ctx = null
  }
}

// ───────────── escuta ao vivo (Scribe v2 Realtime) ─────────────

export type EventosDaEscuta = {
  parcial: (t: string) => void
  final: (t: string) => void
  erro: (mensagem: string) => void
  fechou: () => void
}

/**
 * Escuta "mãos livres": WebSocket direto com a ElevenLabs, com o token de uso único que o HUB pediu (a chave nunca vem
 * para o navegador). A própria ElevenLabs detecta o fim da fala (VAD) e manda o trecho fechado.
 */
export class EscutaAoVivo {
  private ws: WebSocket | null = null
  private fila: Int16Array[] = []
  private amostras = 0
  inicio = 0

  constructor(
    private readonly cfg: { url: string; token: string; silencio?: number },
    private readonly ev: EventosDaEscuta,
  ) {}

  abrir(): Promise<void> {
    const q = new URLSearchParams({
      model_id: 'scribe_v2_realtime',
      token: this.cfg.token,
      audio_format: 'pcm_16000',
      language_code: 'pt',
      commit_strategy: 'vad',
      vad_silence_threshold_secs: String(this.cfg.silencio ?? 0.7),
    })
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${this.cfg.url}?${q}`)
      this.ws = ws
      let aberta = false
      ws.onopen = () => {
        aberta = true
        this.inicio = performance.now()
        resolve()
      }
      ws.onerror = () => {
        if (!aberta) reject(new Error('Não deu para abrir a escuta agora.'))
        else this.ev.erro('A escuta caiu. Tente de novo.')
      }
      ws.onclose = () => this.ev.fechou()
      ws.onmessage = (e) => {
        let m: { message_type?: string; text?: string; error?: string }
        try {
          m = JSON.parse(String(e.data))
        } catch {
          return
        }
        if (m.message_type === 'partial_transcript') this.ev.parcial(m.text ?? '')
        else if (m.message_type === 'committed_transcript') {
          if (m.text?.trim()) this.ev.final(m.text.trim())
        } else if (m.error) this.ev.erro(m.message_type === 'quota_exceeded' ? 'A cota da ElevenLabs acabou.' : 'A escuta teve um problema. Tente de novo.')
      }
    })
  }

  /** Junta ~100 ms antes de mandar (menos mensagens, mesma latência percebida). */
  enviar(pcm: Int16Array): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.fila.push(pcm)
    this.amostras += pcm.length
    if (this.amostras < TAXA_ESCUTA / 10) return
    const tudo = new Int16Array(this.amostras)
    let o = 0
    for (const p of this.fila) {
      tudo.set(p, o)
      o += p.length
    }
    this.fila = []
    this.amostras = 0
    this.ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: base64(bytesDoPcm(tudo)), commit: false, sample_rate: TAXA_ESCUTA }))
  }

  /** Segundos com a escuta aberta (o que a ElevenLabs cobra). */
  segundos(): number {
    return this.inicio ? (performance.now() - this.inicio) / 1000 : 0
  }

  fechar(): void {
    const ws = this.ws
    this.ws = null
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close()
  }
}

// ───────────── anexos de áudio e vídeo ─────────────

/** Áudio de um arquivo de áudio ou vídeo, decodificado no navegador e convertido para PCM 16 kHz mono. */
export async function audioDoArquivo(arquivo: File, maxSegundos: number): Promise<{ pcm: Uint8Array; segundos: number }> {
  const ctx = new AudioContext()
  let audio: AudioBuffer
  try {
    audio = await ctx.decodeAudioData(await arquivo.arrayBuffer())
  } catch {
    throw new Error('Não consegui ler o som deste arquivo. Tente MP3, M4A, WAV, MP4 ou MOV.')
  } finally {
    void ctx.close().catch(() => undefined)
  }
  if (audio.duration > maxSegundos) throw new Error(`Arquivo longo demais (até ${Math.round(maxSegundos / 60)} min).`)
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(audio.duration * TAXA_ESCUTA)), TAXA_ESCUTA)
  const fonte = off.createBufferSource()
  fonte.buffer = audio
  fonte.connect(off.destination)
  fonte.start()
  const r = await off.startRendering()
  return { pcm: bytesDoPcm(paraInt16(r.getChannelData(0))), segundos: audio.duration }
}

/** Quadros-chave de um vídeo (JPEG, lado maior até 1.024 px), espalhados pela duração. */
export async function quadrosDoVideo(arquivo: File, n = 4): Promise<Blob[]> {
  const url = URL.createObjectURL(arquivo)
  const v = document.createElement('video')
  v.muted = true
  v.playsInline = true
  v.preload = 'auto'
  v.src = url
  const esperar = (ev: string) =>
    new Promise<void>((ok, falhou) => {
      const t = setTimeout(() => falhou(new Error('tempo')), 8000)
      v.addEventListener(ev, () => (clearTimeout(t), ok()), { once: true })
      v.addEventListener('error', () => (clearTimeout(t), falhou(new Error('video'))), { once: true })
    })
  try {
    await esperar('loadeddata')
    const dur = Number.isFinite(v.duration) ? v.duration : 0
    if (!dur || !v.videoWidth) return []
    const escala = Math.min(1, 1024 / Math.max(v.videoWidth, v.videoHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(v.videoWidth * escala)
    c.height = Math.round(v.videoHeight * escala)
    const g = c.getContext('2d')!
    const out: Blob[] = []
    for (let i = 0; i < n; i++) {
      v.currentTime = (dur * (i + 0.5)) / n
      await esperar('seeked')
      g.drawImage(v, 0, 0, c.width, c.height)
      const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.82))
      if (b) out.push(b)
    }
    return out
  } catch {
    return []
  } finally {
    URL.revokeObjectURL(url)
    v.removeAttribute('src')
  }
}
