// "Converter com o Relay" no celular: o arquivo do Drive vira a versão de um destino do Relay NO PRÓPRIO APARELHO, e o
// arquivo novo sobe na mesma pasta pela fila de envios de sempre. Quem decide e converte é o motor do Relay
// (./relay/, cópia de products/relay conferida por test/relay.test.js): o mesmo do site relay.absolutezro.com, com a
// redução em Lanczos, a cor certa do ProRes e o AAC em WASM onde o aparelho não tem. O arquivo é lido do Drive aos
// pedaços (pedidos com Range, o token em cada um). Nada passa por servidor. Montado na memória: acima de ~1,5 GB, o
// computador é o lugar.
import { PRESETS } from '../relay/src/presets.js'
import { LIMITE_MEMORIA, nomeSaida, planejar, tamanhoLegivel } from '../relay/src/plano.js'

export { LIMITE_MEMORIA, planejar, tamanhoLegivel }
/** Os destinos do celular: todos os do Relay, menos o de tamanho escolhido na hora. */
export const DESTINOS_RELAY = PRESETS.filter((p) => !p.ajustavel)
export const NOMES_CODEC = { avc: 'H.264', hevc: 'HEVC', aac: 'AAC', mp3: 'MP3', opus: 'Opus', 'pcm-s24': 'PCM', 'pcm-s16': 'PCM' }

let motor = null
/** O motor (≈ 1 MB) só carrega quando alguém converte. */
function carregar() {
  motor ??= import('../relay/app/motor.js').catch((err) => {
    motor = null
    throw err
  })
  return motor
}

/** fetch com o token do Drive em cada pedido; 401 pede outro token e tenta de novo uma vez (conversão longa). */
export function fetchComToken({ token, invalidar }) {
  return async (input, init = {}) => {
    for (let tentativa = 0; ; tentativa++) {
      const t = await token()
      const headers = new Headers(init.headers || undefined)
      headers.set('Authorization', `Bearer ${t}`)
      const res = await fetch(input, { ...init, headers, credentials: 'omit', referrerPolicy: 'no-referrer' })
      if (res.status === 401 && tentativa === 0) {
        invalidar?.(t)
        continue
      }
      return res
    }
  }
}

/**
 * Converte no aparelho. Devolve { file, avisos, codecs: 'H.264 + AAC', tamanhoEstimado }.
 * @param {object} o
 * @param {string} o.url endereço do conteúdo (Drive: files/<id>?alt=media)
 * @param {string} o.nome nome do original ("Master.mov" → "Master (YouTube 1080p).mp4")
 * @param {string} o.destino id do preset do Relay
 * @param {() => Promise<string>} o.token token do Drive (válido)
 * @param {(token: string) => void} [o.invalidar] o Drive recusou este token
 * @param {(fase: 'carregando'|'lendo'|'convertendo', frac?: number, plano?: object) => void} [o.onFase]
 */
export async function converterNoAparelho({ url, nome, destino, token, invalidar, signal, onFase }) {
  const p = DESTINOS_RELAY.find((x) => x.id === destino)
  if (!p) throw new Error('Destino desconhecido.')
  onFase?.('carregando')
  const m = await carregar()
  if (signal?.aborted) throw new DOMException('Parado', 'AbortError')
  const arquivo = { nome, fonte: (MB) => new MB.UrlSource(url, { fetchFn: fetchComToken({ token, invalidar }), parallelism: 2 }) }
  onFase?.('lendo')
  const info = await m.lerArquivo(arquivo)
  let plano = null
  try {
    const r = await m.converterArquivo(arquivo, p, {
      info,
      sinal: signal,
      aoComecar: () => {
        plano = planejar(info, p)
        onFase?.('convertendo', 0, plano)
      },
      aoProgredir: (f) => onFase?.('convertendo', f, plano),
    })
    const tipo = { mp4: 'video/mp4', m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav' }[r.plano.formato]
    const file = new File([r.blob], nomeSaida(nome, p), { type: tipo, lastModified: Date.now() })
    const codecs = [r.codecVideo && NOMES_CODEC[r.codecVideo], r.codecAudio && NOMES_CODEC[r.codecAudio]].filter(Boolean).join(' + ')
    return { file, avisos: r.avisos, codecs, tamanhoEstimado: r.plano.tamanhoEstimado }
  } catch (err) {
    if (err instanceof m.MB.ConversionCanceledError || signal?.aborted) throw new DOMException('Parado', 'AbortError')
    throw err
  }
}
