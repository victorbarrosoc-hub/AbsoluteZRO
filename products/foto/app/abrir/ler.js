// Ler o que a pessoa abriu: uma pasta (showDirectoryPicker, com as subpastas), arquivos escolhidos (o caminho do
// Safari, do Firefox e do celular) ou o que foi solto na janela. Sai sempre a mesma lista:
//   [{ nome, caminho, tamanho, arquivo: File }]
// só com o que é foto (src/biblioteca/arquivos.js). Nada é movido, renomeado nem apagado: é só leitura.

import { formatoDe } from '../../src/biblioteca/arquivos.js'

const FUNDO = 8 // subpastas, no máximo
const LOTE = 48

/** O navegador abre pasta com permissão que dá para lembrar? (Chrome e Edge no computador) */
export const temPasta = () => typeof globalThis.showDirectoryPicker === 'function'

const entrada = (arquivo, caminho) => ({ nome: arquivo.name, caminho: caminho || arquivo.webkitRelativePath || arquivo.name, tamanho: arquivo.size, arquivo })

/** As fotos de uma pasta (FileSystemDirectoryHandle), com as subpastas. `aoAchar(n)` avisa a contagem enquanto lê. */
export async function dePasta(pasta, { aoAchar } = {}) {
  const achados = []
  async function andar(dir, prefixo, nivel) {
    for await (const [nome, h] of dir.entries()) {
      if (nome.startsWith('.')) continue
      if (h.kind === 'directory') {
        if (nivel < FUNDO) await andar(h, `${prefixo}${nome}/`, nivel + 1)
      } else if (formatoDe(nome)) {
        achados.push({ handle: h, caminho: `${prefixo}${nome}` })
        if (achados.length % 200 === 0) aoAchar?.(achados.length)
      }
    }
  }
  await andar(pasta, '', 0)
  aoAchar?.(achados.length)
  const saida = []
  for (let i = 0; i < achados.length; i += LOTE) {
    const lote = await Promise.all(
      achados.slice(i, i + LOTE).map((a) =>
        a.handle.getFile().then(
          (f) => entrada(f, a.caminho),
          () => null, // arquivo que sumiu ou sem permissão: fica de fora
        ),
      ),
    )
    for (const e of lote) if (e) saida.push(e)
  }
  return saida
}

/** Os arquivos de um <input type="file" multiple> (ou webkitdirectory). */
export function deArquivos(arquivos) {
  return [...arquivos].filter((f) => formatoDe(f.name)).map((f) => entrada(f))
}

function lerEntradaAntiga(e, prefixo, nivel, saida) {
  if (e.isFile) {
    if (!formatoDe(e.name)) return Promise.resolve()
    return new Promise((ok) =>
      e.file(
        (f) => (saida.push(entrada(f, `${prefixo}${e.name}`)), ok()),
        () => ok(),
      ),
    )
  }
  if (!e.isDirectory || nivel >= FUNDO || e.name.startsWith('.')) return Promise.resolve()
  const leitor = e.createReader()
  return new Promise((ok) => {
    const filhos = []
    const mais = () =>
      leitor.readEntries(
        (lote) => {
          if (lote.length) {
            filhos.push(...lote)
            mais()
          } else Promise.all(filhos.map((f) => lerEntradaAntiga(f, `${prefixo}${e.name}/`, nivel + 1, saida))).then(ok)
        },
        () => ok(),
      )
    mais()
  })
}

/**
 * O que foi solto na janela (DataTransfer). Chame DENTRO do evento `drop`: os itens só existem ali.
 * Devolve { entradas, pasta, nome }: `pasta` é o handle quando soltaram uma pasta só e o navegador deixa lembrar.
 */
export async function deSolta(transferencia) {
  const itens = [...(transferencia.items || [])].filter((i) => i.kind === 'file')
  // tudo o que depende do evento é pedido agora, antes do primeiro await
  const handles = itens.map((i) => (typeof i.getAsFileSystemHandle === 'function' ? i.getAsFileSystemHandle().catch(() => null) : null))
  const antigas = itens.map((i) => (typeof i.webkitGetAsEntry === 'function' ? i.webkitGetAsEntry() : null))
  const soltos = [...(transferencia.files || [])]

  const resolvidos = await Promise.all(handles)
  if (resolvidos.length && resolvidos.every(Boolean)) {
    const pastas = resolvidos.filter((h) => h.kind === 'directory')
    const entradas = []
    for (const h of resolvidos) {
      if (h.kind === 'directory') for (const e of await dePasta(h)) entradas.push(pastas.length > 1 ? { ...e, caminho: `${h.name}/${e.caminho}` } : e)
      else if (formatoDe(h.name))
        await h.getFile().then(
          (f) => entradas.push(entrada(f)),
          () => {},
        )
    }
    const unica = pastas.length === 1 && resolvidos.length === 1 ? pastas[0] : null
    return { entradas, pasta: unica, nome: unica?.name ?? null }
  }
  if (antigas.some(Boolean)) {
    const entradas = []
    await Promise.all(antigas.filter(Boolean).map((e) => lerEntradaAntiga(e, '', 0, entradas)))
    const pastas = antigas.filter((e) => e?.isDirectory)
    return { entradas, pasta: null, nome: pastas.length === 1 && antigas.length === 1 ? pastas[0].name : null }
  }
  return { entradas: deArquivos(soltos), pasta: null, nome: null }
}

/** A pasta que os arquivos têm em comum (pelo caminho relativo), ou null. Serve de nome do trabalho. */
export function pastaComum(entradas) {
  let comum = null
  for (const e of entradas) {
    const partes = e.caminho.split('/')
    if (partes.length < 2) return null
    if (comum === null) comum = partes[0]
    else if (comum !== partes[0]) return null
  }
  return comum
}
