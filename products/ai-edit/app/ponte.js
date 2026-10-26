// O que muda entre o app de desktop e o navegador: de onde vem o arquivo, para onde vai a exportação e de onde vêm os
// modelos. No desktop (desktop/preload.cjs expõe window.aiEditDesktop) a mídia é lida no lugar, pelo caminho, e a
// exportação vai para uma pasta; no navegador, blob: e download.

const D = globalThis.aiEditDesktop || null

export const desktop = Boolean(D?.isDesktop)
export const plataforma = D?.platform || (/Mac/.test(navigator.platform) ? 'darwin' : /Win/.test(navigator.platform) ? 'win32' : 'linux')

/** Caminho completo de um arquivo escolhido ou arrastado (só no desktop). */
export const caminhoDe = (arquivo) => (D ? D.caminhoDe(arquivo) : null)

/** Entrada de mídia a partir de um File: no desktop lida pelo caminho (sem copiar para a memória). */
export async function entradaDe(arquivo) {
  const caminho = caminhoDe(arquivo)
  if (caminho) {
    await D.permitir([caminho])
    return { url: urlDoCaminho(caminho), nome: arquivo.name, caminho, tamanho: arquivo.size }
  }
  return { arquivo, nome: arquivo.name, caminho: null, tamanho: arquivo.size, blob: URL.createObjectURL(arquivo) }
}

export const urlDoCaminho = (caminho) => `${location.origin}/__midia?c=${encodeURIComponent(caminho)}`

/** URL que o <video> toca; null quando a mídia ainda não foi escolhida de novo (projeto reaberto no navegador) */
export const urlTocavel = (e) => (e ? e.url || e.blob : null)

/** Entrada a partir de um caminho (SOBEDESCE, projeto reaberto no desktop). */
export async function entradaDoCaminho(caminho, nome) {
  await D.permitir([caminho])
  return { url: urlDoCaminho(caminho), nome, caminho, tamanho: null }
}

/** Pasta de um projeto do SOBEDESCE → cartões conferidos (desktop/sobedesce.cjs). null se cancelou. */
export const escolherSobedesce = () => (D ? D.sobedesce() : Promise.resolve(null))

/** Onde os modelos de transcrição são baixados: o protocolo do app guarda no disco; no navegador, o padrão. */
export const remotoModelos = () => (desktop ? `${location.origin}/__hf/` : null)

/** Grava os arquivos da exportação. Desktop: escolhe a pasta e grava; navegador: um .zip. Devolve onde ficou. */
export async function gravarPacote(nomeBase, arquivos, zipar) {
  if (D) {
    const pasta = await D.escolherPasta(`${nomeBase}`)
    if (!pasta) return null
    for (const a of arquivos) await D.gravar(pasta, a.name, typeof a.data === 'string' ? new TextEncoder().encode(a.data) : a.data)
    return { pasta }
  }
  baixar(new Blob([zipar(arquivos)], { type: 'application/zip' }), `${nomeBase}.zip`)
  return { pasta: null }
}

/**
 * Destino do vídeo final como WritableStream de pedaços { type: 'write', data, position } (o StreamTarget do
 * Mediabunny). Desktop: arquivo escolhido no diálogo; Chrome/Edge: o seletor de arquivos; senão null (vai para a
 * memória e baixa no fim).
 */
export async function destinoDoVideo(nome) {
  if (D) {
    const caminho = await D.escolherArquivo(nome)
    if (!caminho) return { cancelado: true }
    const id = await D.arquivo.abrir(caminho)
    const fluxo = new WritableStream({
      write: (c) => D.arquivo.escrever(id, c.position, c.data),
      close: () => D.arquivo.fechar(id),
      abort: () => D.arquivo.fechar(id, true),
    })
    return { fluxo, caminho }
  }
  if (globalThis.showSaveFilePicker) {
    try {
      const h = await showSaveFilePicker({ suggestedName: nome, types: [{ description: 'Vídeo', accept: { 'video/mp4': ['.mp4'] } }] })
      return { fluxo: await h.createWritable(), caminho: h.name }
    } catch (e) {
      if (e?.name === 'AbortError') return { cancelado: true }
    }
  }
  return { fluxo: null, caminho: nome }
}

export function baixar(blob, nome) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nome
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
}

/** Salvar o projeto (.zroedit). */
export async function salvarProjeto(texto, nome) {
  if (D) return D.salvarProjeto(texto, nome)
  baixar(new Blob([texto], { type: 'application/json' }), nome)
  return nome
}

export const abrirPasta = (caminho) => D?.mostrarNaPasta(caminho)
