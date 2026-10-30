// Claude e ElevenLabs falsos para o e2e do Laboratório da Z (ADR 0033): nenhuma chamada sai da máquina. Um servidor só,
// em 127.0.0.1, com dois prefixos: /anthropic (Messages em streaming SSE e Files) e /eleven (vozes, fala em PCM,
// transcrição, token da escuta, Voice Design e a escuta ao vivo por WebSocket, com o aperto de mão feito aqui mesmo).
import { createHash } from 'node:crypto'
import http from 'node:http'
import type { Duplex } from 'node:stream'

export type Registro = { caminho: string; corpo: unknown }
/** O que a ElevenLabs falsa recusa (401, como a de produção com a chave restrita): o token da escuta ao vivo e a transcrição. */
export type Recusa = 'token' | 'transcricao'

/** A recusa no formato da ElevenLabs (`detail` com status e mensagem que nomeia a permissão). */
const recusa = (permissao: string) => ({
  detail: { status: 'missing_permissions', message: `The API key you used is missing the permission ${permissao} to execute this operation.` },
})

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

/** A resposta da Z falsa diz o que recebeu: personalidade nova ou de hoje, voz, anexos. */
function respostaDaZ(corpo: {
  system?: { text: string }[]
  messages?: { role: string; content: string | { type: string; title?: string; text?: string }[] }[]
}): string {
  const sistema = (corpo.system ?? []).map((s) => s.text).join('\n')
  const msgs = corpo.messages ?? []
  const falada = msgs.some((m) => m.role === 'system' && typeof m.content === 'string' && m.content.includes('falada em voz alta'))
  const ultima = [...msgs].reverse().find((m) => m.role === 'user')
  const blocos = Array.isArray(ultima?.content) ? ultima.content : []
  const partes: string[] = [sistema.includes('Você é uma mulher') ? 'Oi! Estou pronta.' : 'Oi, aqui é a Z de hoje.']
  if (falada) partes.push('Pode falar comigo.')
  for (const b of blocos) {
    if (b.type === 'document') partes.push(`Li o anexo: ${b.title ?? 'sem título'}.`)
    if (b.type === 'image') partes.push('Vi a imagem.')
  }
  if (!falada) partes.push('Em que posso ajudar hoje?')
  return partes.join(' ')
}

function sse(res: http.ServerResponse, modelo: string, texto: string) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const ev = (tipo: string, dados: object) => res.write(`event: ${tipo}\ndata: ${JSON.stringify({ type: tipo, ...dados })}\n\n`)
  ev('message_start', {
    message: {
      id: 'msg_e2e',
      type: 'message',
      role: 'assistant',
      model: modelo,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1200, output_tokens: 1, cache_read_input_tokens: 8000, cache_creation_input_tokens: 0 },
    },
  })
  ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
  for (const pedaco of texto.match(/.{1,12}/gs) ?? []) ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: pedaco } })
  ev('content_block_stop', { index: 0 })
  ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 40 } })
  ev('message_stop', {})
  res.end()
}

/** 0,4 s de um tom suave em PCM 16 bits mono 24 kHz, em três pedaços. */
function fala(res: http.ServerResponse) {
  const n = 24_000 * 0.4
  const b = Buffer.alloc(n * 2)
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((i / 24_000) * 2 * Math.PI * 440) * 2000), i * 2)
  res.writeHead(200, { 'content-type': 'audio/pcm' })
  const terco = Math.floor(n / 3) * 2
  res.write(b.subarray(0, terco))
  setTimeout(() => res.write(b.subarray(terco, terco * 2)), 30)
  setTimeout(() => res.end(b.subarray(terco * 2)), 60)
}

// ───── WebSocket mínimo (só o que a escuta usa: texto, fechar) ─────
function quadro(texto: string): Buffer {
  const p = Buffer.from(texto)
  const cab = p.length < 126 ? Buffer.from([0x81, p.length]) : Buffer.from([0x81, 126, p.length >> 8, p.length & 255])
  return Buffer.concat([cab, p])
}

function escuta(socket: Duplex, registro: Registro[]) {
  let resto = Buffer.alloc(0)
  let pedacos = 0
  let disse = false
  socket.write(quadro(JSON.stringify({ message_type: 'session_started', session_id: 'e2e', config: {} })))
  socket.on('data', (d: Buffer) => {
    resto = Buffer.concat([resto, d])
    for (;;) {
      if (resto.length < 2) return
      const op = resto[0]! & 0x0f
      let len = resto[1]! & 0x7f
      let o = 2
      if (len === 126) {
        if (resto.length < 4) return
        len = resto.readUInt16BE(2)
        o = 4
      } else if (len === 127) {
        if (resto.length < 10) return
        len = Number(resto.readBigUInt64BE(2))
        o = 10
      }
      if (resto.length < o + 4 + len) return
      const mascara = resto.subarray(o, o + 4)
      const p = Buffer.from(resto.subarray(o + 4, o + 4 + len))
      for (let i = 0; i < p.length; i++) p[i]! ^= mascara[i % 4]!
      resto = resto.subarray(o + 4 + len)
      if (op === 8) return socket.end(Buffer.from([0x88, 0]))
      if (op !== 1) continue
      const m = JSON.parse(p.toString()) as { message_type?: string; audio_base_64?: string }
      if (m.message_type !== 'input_audio_chunk' || !m.audio_base_64) continue
      pedacos++
      if (pedacos === 6) socket.write(quadro(JSON.stringify({ message_type: 'partial_transcript', text: 'Oi Z' })))
      if (pedacos === 12 && !disse) {
        disse = true
        registro.push({ caminho: 'ws:committed', corpo: null })
        socket.write(quadro(JSON.stringify({ message_type: 'committed_transcript', text: 'Oi Z, tudo bem?' })))
      }
    }
  })
  socket.on('error', () => undefined)
}

export function servidorFalso(porta: number) {
  const registro: Registro[] = []
  const recusas = new Set<Recusa>()
  let arquivo = 0
  const servidor = http.createServer((req, res) => {
    const partes: Buffer[] = []
    req.on('data', (c: Buffer) => partes.push(c))
    req.on('end', () => {
      const bruto = Buffer.concat(partes)
      const url = new URL(req.url ?? '/', 'http://falso')
      const caminho = url.pathname
      let corpo: unknown = null
      if ((req.headers['content-type'] ?? '').includes('json') && bruto.length) corpo = JSON.parse(bruto.toString())
      registro.push({ caminho: `${req.method} ${caminho}`, corpo })
      const json = (status: number, d: unknown) => (res.writeHead(status, { 'content-type': 'application/json' }), res.end(JSON.stringify(d)))

      // ── Claude ──
      if (caminho === '/anthropic/v1/messages' && req.method === 'POST') {
        const c = corpo as { model: string; stream?: boolean }
        return sse(res, c.model, respostaDaZ(corpo as never))
      }
      if (caminho === '/anthropic/v1/files' && req.method === 'POST') {
        arquivo++
        return json(200, {
          id: `file_e2e${String(arquivo).padStart(6, '0')}`,
          type: 'file',
          filename: 'anexo',
          mime_type: 'application/octet-stream',
          size_bytes: bruto.length,
          created_at: new Date().toISOString(),
          downloadable: false,
        })
      }
      if (caminho.startsWith('/anthropic/v1/files/') && req.method === 'DELETE') return json(200, { id: caminho.split('/').pop(), type: 'file_deleted' })

      // ── ElevenLabs ──
      if (req.headers['xi-api-key'] !== 'chave-falsa-elevenlabs-e2e' && caminho.startsWith('/eleven/')) return json(401, { detail: 'chave' })
      if (caminho === '/eleven/v2/voices')
        return json(200, {
          voices: [
            { voice_id: 'vozClaraE2E01', name: 'Clara', category: 'premade', preview_url: null, labels: { gender: 'female', accent: 'brazilian', age: 'young' } },
            { voice_id: 'vozJohnE2E001', name: 'John', category: 'premade', preview_url: null, labels: { gender: 'male', accent: 'american' } },
          ],
          has_more: false,
          next_page_token: null,
        })
      if (/^\/eleven\/v1\/text-to-speech\/[A-Za-z0-9]+\/stream$/.test(caminho)) return fala(res)
      if (caminho === '/eleven/v1/speech-to-text') {
        if (recusas.has('transcricao')) return json(401, recusa('speech_to_text'))
        const ditado = bruto.toString('latin1').includes('name="language_code"')
        return json(200, { text: ditado ? 'Me conta uma novidade.' : 'Transcrição do vídeo de teste.', language_code: 'pt' })
      }
      if (caminho === '/eleven/v1/single-use-token/realtime_scribe')
        return recusas.has('token') ? json(401, { detail: { status: 'invalid_api_key', message: 'Invalid API key' } }) : json(200, { token: 'sutkn_e2e' })
      if (caminho === '/eleven/v1/text-to-voice/design')
        return json(200, {
          previews: [1, 2, 3].map((i) => ({ generated_voice_id: `gerada_e2e_${i}`, audio_base_64: 'SUQzBAAAAAAA', media_type: 'audio/mpeg', duration_secs: 4 })),
          text: (corpo as { text?: string })?.text ?? '',
        })
      if (caminho === '/eleven/v1/text-to-voice') return json(200, { voice_id: 'vozNovaE2E0001', name: (corpo as { voice_name?: string })?.voice_name ?? 'Z' })
      json(404, { erro: caminho })
    })
  })
  const abertos = new Set<Duplex>()
  servidor.on('upgrade', (req, socket) => {
    abertos.add(socket)
    socket.on('close', () => abertos.delete(socket))
    const url = new URL(req.url ?? '/', 'http://falso')
    if (url.pathname !== '/eleven/v1/speech-to-text/realtime' || url.searchParams.get('token') !== 'sutkn_e2e') return socket.destroy()
    registro.push({ caminho: 'ws:abriu', corpo: Object.fromEntries(url.searchParams) })
    const aceite = createHash('sha1')
      .update(`${req.headers['sec-websocket-key']}${GUID}`)
      .digest('base64')
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${aceite}\r\n\r\n`)
    escuta(socket, registro)
  })
  return {
    registro,
    /** Liga ou desliga uma recusa (vale para os próximos pedidos). */
    recusar: (o_que: Recusa, ligado = true) => void (ligado ? recusas.add(o_que) : recusas.delete(o_que)),
    abrir: () => new Promise<void>((ok) => servidor.listen(porta, '127.0.0.1', ok)),
    fechar: () =>
      new Promise<void>((ok) => {
        for (const s of abertos) s.destroy()
        servidor.closeAllConnections()
        servidor.close(() => ok())
      }),
  }
}
