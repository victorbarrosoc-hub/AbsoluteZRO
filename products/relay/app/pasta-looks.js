// Relay · os looks (.cube) numa pasta do computador, para o SOBEDESCE levar ao Drive (pedido do titular, 30/10/2026):
// a pessoa escolhe a pasta uma vez ("Absolute ZRO/Looks do Relay"); o Relay grava nela os looks que só existem aqui e
// traz os .cube que só existem lá (vindos do Drive pelo SOBEDESCE, ou postos à mão). O link sobedesce://looks abre o
// SOBEDESCE comparando essa pasta com a do Drive. Nada vai para servidor nenhum.
//
// Nunca grava por cima nem apaga: mesmo nome com conteúdo diferente fica como está e a tela avisa. Só Chrome e Edge no
// computador (File System Access); no resto, a tela diz isso.

export const LINK_SOBEDESCE = 'sobedesce://looks'
export const LINK_TROCAR = 'sobedesce://looks?trocar=1'
const TAMANHO_MAX = 64 * 1024 * 1024

/** O navegador grava numa pasta escolhida? */
export const temPasta = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'

/** Nome de arquivo do look: o nome dele, sem o que o sistema recusa. */
export const arquivoDoLook = (nome) =>
  `${
    String(nome)
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'Look'
  }.cube`

/** Escolhe a pasta (gesto da pessoa) e guarda. */
export async function escolherPasta(Looks) {
  const handle = await window.showDirectoryPicker({ id: 'relay-looks', mode: 'readwrite', startIn: 'documents' })
  await Looks.guardarPasta(handle)
  return handle
}

/** A pasta guardada, com permissão de escrita (pede só se `pedir`, que precisa de um gesto da pessoa). */
export async function pastaLiberada(Looks, { pedir = false } = {}) {
  const handle = await Looks.pasta()
  if (!handle) return null
  const op = { mode: 'readwrite' }
  if (typeof handle.queryPermission !== 'function') return handle // pasta do próprio navegador (sem pedido)
  if ((await handle.queryPermission(op)) === 'granted') return handle
  if (pedir && (await handle.requestPermission?.(op)) === 'granted') return handle
  return null
}

const mesmoTexto = (a, b) => a.replace(/\r\n/g, '\n').trim() === b.replace(/\r\n/g, '\n').trim()

/**
 * Leva para a pasta os looks que não estão lá e traz da pasta os .cube que não estão aqui.
 * `Looks`: app/looks.js (listar, ler, guardar). `pasta`: um diretório (values, getFileHandle).
 * Devolve { levados, trazidos, iguais, conflitos: [nomes], recusados: [nomes] }.
 */
export async function sincronizar(Looks, pasta) {
  const r = { levados: 0, trazidos: 0, iguais: 0, conflitos: [], recusados: [] }
  const naPasta = new Map()
  for await (const e of pasta.values()) if (e.kind === 'file' && /\.cube$/i.test(e.name)) naPasta.set(e.name.toLowerCase(), e)
  const aqui = await Looks.listar()
  const nomesAqui = new Map()
  for (const l of aqui) {
    const arquivo = arquivoDoLook(l.nome)
    const texto = await Looks.ler(l.id)
    nomesAqui.set(arquivo.toLowerCase(), texto)
    const la = naPasta.get(arquivo.toLowerCase())
    if (la) {
      const f = await la.getFile()
      if (mesmoTexto(await f.text(), texto)) r.iguais++
      else r.conflitos.push(arquivo)
      continue
    }
    const h = await pasta.getFileHandle(arquivo, { create: true })
    const w = await h.createWritable()
    await w.write(texto)
    await w.close()
    r.levados++
  }
  for (const [chave, e] of naPasta) {
    if (nomesAqui.has(chave)) continue
    const f = await e.getFile()
    if (f.size > TAMANHO_MAX) {
      r.recusados.push(e.name)
      continue
    }
    try {
      await Looks.guardar(e.name, await f.text())
      r.trazidos++
    } catch {
      r.recusados.push(e.name) // não é um .cube 3D
    }
  }
  return r
}

/** Uma linha curta do que aconteceu. */
export function resumo(r) {
  const partes = []
  if (r.levados) partes.push(`${r.levados} ${r.levados === 1 ? 'levado' : 'levados'} para a pasta`)
  if (r.trazidos) partes.push(`${r.trazidos} ${r.trazidos === 1 ? 'trazido' : 'trazidos'} da pasta`)
  if (!partes.length) partes.push('Tudo igual na pasta')
  if (r.conflitos.length) partes.push(`${r.conflitos.length} com o mesmo nome e conteúdo diferente (ficaram como estão)`)
  if (r.recusados.length) partes.push(`${r.recusados.length} ${r.recusados.length === 1 ? 'arquivo não é' : 'arquivos não são'} look`)
  return `${partes.join(' · ')}.`
}
