// "Gravar estrelas no Lightroom": um .xmp ao lado de cada RAW com as decisões (estrelas, cor e a bandeira), no formato
// que o Lightroom Classic lê (src/exportar/xmp.js). A foto nunca é tocada: só o .xmp é criado ou atualizado, e o .xmp
// que já existia é atualizado sem perder nada do que estava nele (ajustes do Camera Raw, palavras-chave, o que for).
//
// Dois caminhos:
//   pasta  o trabalho foi aberto por "Abrir pasta": com a permissão de escrita (pedida no clique, mode readwrite), o
//          .xmp vai para a pasta de cada RAW
//   .zip   sem pasta (fotos escolhidas, celular, navegador sem a API): um .zip com os .xmp nos caminhos das fotos, para a
//          pessoa soltar ao lado dos RAW
// Só RAW: o Lightroom lê o .xmp ao lado de CR2, CR3, NEF, ARW, RAF, RW2, ORF, PEF. JPEG e DNG guardam as decisões dentro
// do próprio arquivo, que a gente não muda; ficam de fora e a tela diz quantas.

import { atualizarSidecarXmp, sidecarXmp } from '../../../src/exportar/xmp.js'
import { guardar } from '../../abrir/guardar.js'
import { montarZip } from './zip.js'

const COM_SIDECAR = new Set(['cr2', 'cr3', 'nef', 'nrw', 'arw', 'pef', 'rw2', 'orf', 'raf'])

const semExtensao = (nome) => nome.replace(/\.[^.]+$/, '')
/** O caminho do .xmp de uma foto: a mesma pasta, o mesmo nome, extensão .xmp (como o Lightroom faz). */
export const caminhoDoXmp = (foto) => {
  const partes = String(foto.caminho || foto.nome).split('/')
  partes[partes.length - 1] = `${semExtensao(partes.at(-1))}.xmp`
  return partes.join('/')
}
const decidida = (f) => f.marca != null || f.estrelas > 0 || f.cor != null
const decisoes = (f) => ({ estrelas: f.estrelas || 0, cor: f.cor ?? null, marca: f.marca ?? null })

/** O que vai ser gravado: { fotos (RAW com decisão), fora (decididas que não levam .xmp), semDecisao (RAW sem nada) }. */
export function planoDeGravar(catalogo) {
  const fotos = []
  let fora = 0
  let semDecisao = 0
  for (const f of catalogo.fotos()) {
    const leva = f.tipo === 'raw' && COM_SIDECAR.has(f.formato)
    if (!decidida(f)) {
      if (leva) semDecisao++
      continue
    }
    if (leva) fotos.push(f)
    else fora++
  }
  return { fotos, fora, semDecisao }
}

/** A pasta do trabalho, se ele veio de "Abrir pasta" e o navegador guardou o acesso. */
export async function pastaDoTrabalho(loja) {
  const t = loja.trabalho()
  if (!t || t.origem !== 'pasta' || typeof globalThis.showDirectoryPicker !== 'function') return null
  const pasta = await guardar.pasta(t.id).catch(() => null)
  return pasta?.requestPermission ? pasta : null
}

async function pastaDe(raiz, caminho) {
  let dir = raiz
  const partes = caminho.split('/')
  for (const p of partes.slice(0, -1)) dir = await dir.getDirectoryHandle(p)
  return { dir, nome: partes.at(-1) }
}

/**
 * Grava na pasta. Pede a permissão de escrita (chame dentro de um clique). Devolve { novos, atualizados, falhas } ou
 * null quando a permissão não veio.
 */
export async function gravarNaPasta(pasta, fotos, { idioma = 'auto', aoProgredir } = {}) {
  let permissao = await pasta.queryPermission({ mode: 'readwrite' }).catch(() => 'denied')
  if (permissao !== 'granted') permissao = await pasta.requestPermission({ mode: 'readwrite' }).catch(() => 'denied')
  if (permissao !== 'granted') return null
  const r = { novos: 0, atualizados: 0, falhas: [] }
  let feitas = 0
  for (const f of fotos) {
    try {
      const { dir, nome } = await pastaDe(pasta, caminhoDoXmp(f))
      let antigo = null
      try {
        antigo = await (await (await dir.getFileHandle(nome)).getFile()).text()
      } catch {
        antigo = null // ainda não existe
      }
      // .xmp que não é XMP válido: atualizarSidecarXmp lança e o arquivo da pessoa fica como estava
      const texto = atualizarSidecarXmp(antigo, decisoes(f), { idioma })
      const arquivo = await dir.getFileHandle(nome, { create: true })
      const escrita = await arquivo.createWritable({ keepExistingData: false })
      await escrita.write(texto)
      await escrita.close()
      if (antigo) r.atualizados++
      else r.novos++
    } catch (e) {
      r.falhas.push({ nome: f.nome, motivo: String(e?.message ?? e).slice(0, 120) })
    }
    aoProgredir?.(++feitas, fotos.length)
  }
  return r
}

/** O .zip com um .xmp por foto, nos caminhos delas. Devolve { blob, quantos }. */
export function zipDosXmp(fotos, { idioma = 'pt' } = {}) {
  const arquivos = fotos.map((f) => ({ caminho: caminhoDoXmp(f), dados: sidecarXmp({ ...decisoes(f), idioma }) }))
  return { blob: new Blob([montarZip(arquivos)], { type: 'application/zip' }), quantos: arquivos.length }
}

/** Entrega um Blob para a pessoa salvar. */
export function baixar(blob, nome) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.hidden = true
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
