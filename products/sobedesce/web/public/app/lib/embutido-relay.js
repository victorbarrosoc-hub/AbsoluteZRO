// O Sobedesce dentro do Relay, no modo escolher (/app/?no=relay&modo=escolher; protocolo em
// products/relay/src/drive.js e docs/integration-contracts/relay.md, "Escolher no Drive"). O Relay manda um
// MessagePort; por ele chegam:
//   { pedido, tipo: 'ler', id, de, ate }  → um pedaço do arquivo do Drive (Range, com o token daqui). O token nunca sai.
//   { pedido, tipo: 'enviar', nome, mime, dados: Blob, pasta } → o resultado entra na fila de envios de sempre, na
//     pasta do original; o estado volta pelo mesmo canal até 'enviado' (o Drive confirmou o tamanho; MD5 não, então não
//     se diz "conferido") ou 'erro'.
// Carregado só quando o Relay abre o canal (lib/embutido.js).
import { ENDPOINTS } from './config.js'
import { getToken, invalidate } from './auth.js'
import { fetchComToken } from './relay.js'
import { engine } from './uploader.js'

const LER_MAX = 32 * 1024 * 1024
const ID = /^[A-Za-z0-9_-]{10,120}$/
const buscar = fetchComToken({ token: getToken, invalidar: invalidate })

async function ler({ id, de, ate }) {
  if (!ID.test(String(id)) || !Number.isSafeInteger(de) || !Number.isSafeInteger(ate) || de < 0 || ate <= de || ate - de > LER_MAX) throw new Error('Pedido de leitura inválido.')
  const res = await buscar(`${ENDPOINTS.api}/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, { headers: { Range: `bytes=${de}-${ate - 1}` } })
  if (!res.ok) throw new Error(res.status === 404 ? 'O arquivo não está mais no Drive.' : 'O Drive não entregou o arquivo.')
  const b = await res.arrayBuffer()
  if (b.byteLength !== ate - de) throw new Error('O Drive entregou um pedaço de tamanho diferente.')
  return b
}

let envios = 0
function enviar(porta, { nome, mime, dados, pasta }) {
  if (!(dados instanceof Blob) || typeof nome !== 'string' || !nome.trim() || !ID.test(String(pasta))) throw new Error('Envio inválido.')
  const file = new File([dados], nome.trim().slice(0, 255), { type: typeof mime === 'string' ? mime : dados.type, lastModified: Date.now() })
  engine.addFiles([file], { id: pasta, name: 'a pasta do original', driveId: null })
  const envio = `relay-${++envios}`
  let ultimo = null
  const olhar = () => {
    const it = engine.items.find((x) => x.file === file)
    if (!it) return
    const estado = it.status === 'done' ? 'enviado' : it.status === 'failed' ? 'erro' : 'enviando'
    if (estado === ultimo) return
    ultimo = estado
    porta.postMessage({ tipo: 'envio', envio, estado, ...(estado === 'erro' ? { erro: String(it.error?.message || it.error || 'O envio parou.') } : {}) })
    if (estado !== 'enviando') parar()
  }
  const parar = engine.subscribe(olhar)
  setTimeout(olhar, 0)
  return envio
}

/** Atende os pedidos do Relay por este canal. */
export function atender(porta) {
  porta.onmessage = async ({ data: d }) => {
    if (!d || typeof d !== 'object' || !Number.isSafeInteger(d.pedido)) return
    try {
      if (d.tipo === 'ler') {
        const dados = await ler(d)
        porta.postMessage({ pedido: d.pedido, ok: true, dados }, [dados])
      } else if (d.tipo === 'enviar') porta.postMessage({ pedido: d.pedido, ok: true, envio: enviar(porta, d) })
      else porta.postMessage({ pedido: d.pedido, ok: false, erro: 'Pedido desconhecido.' })
    } catch (err) {
      porta.postMessage({ pedido: d.pedido, ok: false, erro: err?.message || 'Não deu agora.' })
    }
  }
}
