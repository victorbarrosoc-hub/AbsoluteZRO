// CAMZRO · o "cartão" da câmera: os clipes ficam no armazenamento do site (OPFS), no próprio aparelho. Nada sobe
// para servidor nenhum. Daqui saem para o rolo de fotos, para uma pasta (descarga conferida) ou para outro app.
//
// clipes/<nome>.gravando.mp4  enquanto grava (MP4 fragmentado: sobrevive a queda)
// clipes/<nome>.mov|.mp4      depois de fechado
// clipes/<nome>.json          o sidecar (camzro.clip/1)

const PASTA = 'clipes'
let raizPromessa = null
const raiz = () => (raizPromessa ||= navigator.storage.getDirectory().then((r) => r.getDirectoryHandle(PASTA, { create: true })))

export const temArmazem = () => typeof navigator !== 'undefined' && Boolean(navigator.storage?.getDirectory)

/** Pede ao navegador para não apagar os clipes quando faltar espaço (Chrome e Safari respeitam). */
export async function persistir() {
  try {
    if (await navigator.storage.persisted?.()) return true
    return Boolean(await navigator.storage.persist?.())
  } catch {
    return false
  }
}

/** { livre, usado, quota } em bytes (o que o navegador deixa este site usar). */
export async function espaco() {
  try {
    const e = await navigator.storage.estimate()
    return { livre: Math.max(0, (e.quota || 0) - (e.usage || 0)), usado: e.usage || 0, quota: e.quota || 0 }
  } catch {
    return { livre: 0, usado: 0, quota: 0 }
  }
}

/** Fila do escritor em bytes (o tamanho de cada pedaço é o dos dados). */
export const FILA = { highWaterMark: 64 * 1024 * 1024, size: (c) => c?.data?.byteLength || 1 }

let trabalhador = null
let proximoId = 1
const espera = new Map()
function worker() {
  if (trabalhador) return trabalhador
  trabalhador = new Worker(new URL('./escritor.worker.js', import.meta.url), { type: 'module' })
  trabalhador.onmessage = ({ data }) => {
    const p = espera.get(data.id)
    if (!p) return
    espera.delete(data.id)
    if (data.ok) p.resolve(data)
    else p.reject(new Error(data.erro))
  }
  trabalhador.onerror = (e) => {
    for (const p of espera.values()) p.reject(new Error(e.message || 'escritor caiu'))
    espera.clear()
    trabalhador = null
  }
  return trabalhador
}
const pedir = (m, transferir) =>
  new Promise((resolve, reject) => {
    const id = proximoId++
    espera.set(id, { resolve, reject })
    worker().postMessage({ ...m, id }, transferir || [])
  })

/**
 * Abre um arquivo para gravar. Devolve { writable (para o StreamTarget do Mediabunny), anexar(blob) (MediaRecorder),
 * fechar(), protegido }. protegido = grava no lugar (sobrevive a queda). Sem acesso síncrono (navegador antigo), cai
 * no createWritable, que só confirma no fim: a tela avisa.
 */
export async function abrirParaGravar(nome) {
  let protegido = true
  try {
    await pedir({ tipo: 'abrir', caminho: [PASTA, nome] })
  } catch (e) {
    if (!/sem-acesso-sincrono/.test(e.message)) throw e
    protegido = false
  }
  let fim = 0
  if (protegido) {
    const escrever = (pos, dados) => {
      // sempre uma cópia: o buffer de quem chamou (o Mediabunny) não pode sumir dele na transferência
      const copia = dados.slice().buffer
      fim = Math.max(fim, pos + dados.byteLength)
      return pedir({ tipo: 'escrever', pos, dados: copia }, [copia])
    }
    return {
      protegido,
      // fila de até 64 MB: o worker grava bem mais rápido que o vídeo chega, e o Mediabunny não pode esperar a
      // contrapressão no meio de um fragmento (intercalaria as escritas)
      writable: new WritableStream({ write: (c) => escrever(c.position, c.data) }, FILA),
      anexar: async (blob) => escrever(fim, new Uint8Array(await blob.arrayBuffer())),
      descarregar: () => pedir({ tipo: 'descarregar' }),
      fechar: async () => (await pedir({ tipo: 'fechar' })).tamanho,
    }
  }
  const h = await (await raiz()).getFileHandle(nome, { create: true })
  const w = await h.createWritable()
  return {
    protegido,
    writable: new WritableStream({ write: (c) => w.write({ type: 'write', position: c.position, data: c.data }) }, FILA),
    anexar: async (blob) => {
      await w.write({ type: 'write', position: fim, data: blob })
      fim += blob.size
    },
    descarregar: async () => {},
    fechar: async () => {
      await w.close()
      return (await h.getFile()).size
    },
  }
}

/** Um arquivo novo para escrever de uma vez (o fechamento em MOV, o sidecar). */
export async function escritorSimples(nome) {
  const h = await (await raiz()).getFileHandle(nome, { create: true })
  return h.createWritable()
}

export async function salvarJson(nome, obj) {
  const w = await escritorSimples(nome)
  await w.write(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }))
  await w.close()
}

export async function lerJson(nome) {
  try {
    const f = await (await (await raiz()).getFileHandle(nome)).getFile()
    return JSON.parse(await f.text())
  } catch {
    return null
  }
}

export async function arquivo(nome) {
  return (await (await raiz()).getFileHandle(nome)).getFile()
}

export async function apagar(nome) {
  try {
    await (await raiz()).removeEntry(nome)
    return true
  } catch {
    return false
  }
}

const VIDEO = /\.(mov|mp4|webm)$/i

/** Os clipes do aparelho: [{ nome, arquivo, tamanho, modificado, gravando, sidecar }], do mais novo ao mais velho. */
export async function listar() {
  const dir = await raiz()
  const arquivos = new Map()
  const sidecars = new Map()
  for await (const [nome, h] of dir.entries()) {
    if (h.kind !== 'file') continue
    if (nome.endsWith('.json')) sidecars.set(nome.slice(0, -5), h)
    else if (VIDEO.test(nome)) arquivos.set(nome, h)
  }
  const lista = []
  for (const [nome, h] of arquivos) {
    const f = await h.getFile()
    const base = nome.replace(/\.gravando(?=\.)/, '').replace(VIDEO, '')
    const sc = sidecars.get(base)
    let sidecar = null
    if (sc) {
      try {
        sidecar = JSON.parse(await (await sc.getFile()).text())
      } catch {
        sidecar = null
      }
    }
    lista.push({ nome: base, arquivo: nome, tamanho: f.size, modificado: f.lastModified, gravando: /\.gravando\./.test(nome), sidecar })
  }
  return lista.sort((a, b) => b.modificado - a.modificado)
}
