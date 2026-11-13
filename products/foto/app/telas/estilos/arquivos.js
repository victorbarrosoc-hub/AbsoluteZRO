// Entrar e sair da biblioteca por arquivo: importar o que a pessoa solta (.xmp, .lrtemplate, JPEG do Lightroom com XMP
// embutido, .cube, .zropreset, .zropack) e exportar (.zropreset, .zropack, .xmp do Lightroom, .cube assada).
// Tudo no aparelho: nada sobe.

import { FAMILIA_IMPORTADAS, exportar as exportarBiblioteca } from '../../../src/estilo/biblioteca.js'
import { lerCube, escreverCube } from '../../../src/estilo/cube.js'
import { importarLightroom } from '../../../src/estilo/lightroom-ler.js'
import { escreverXmp, nomeDoArquivoXmp } from '../../../src/estilo/lightroom-escrever.js'
import { assar, compactar } from '../../../src/estilo/look.js'
import { criarPredefinicao, lerPacote, serializar, serializarPacote, oQueMexe, EXTENSAO, EXTENSAO_PACOTE } from '../../../src/estilo/predefinicao.js'
import { qc } from '../../../src/estilo/qc.js'

export const ACEITA_IMPORTAR = '.xmp,.lrtemplate,.cube,.zropreset,.zropack,.jpg,.jpeg,application/json,image/jpeg'
export const ACEITA_REFERENCIA = 'image/jpeg,image/png,.jpg,.jpeg,.png'
const PRESET = /\.(xmp|lrtemplate|cube|zropreset|zropack)$/i

const extensao = (nome) => (/\.([^.]+)$/.exec(nome || '')?.[1] || '').toLowerCase()
const semExtensao = (nome) => String(nome || '').replace(/\.[^.]+$/, '')

/** É arquivo de estilo (não foto)? Pelo nome; o JPEG fica de fora (pode ser referência ou XMP embutido). */
export const eArquivoDeEstilo = (arquivo) => PRESET.test(arquivo.name || '')
export const eImagem = (arquivo) => /^image\/(jpeg|png)$/.test(arquivo.type) || /\.(jpe?g|png)$/i.test(arquivo.name || '')

/** O JPEG traz ajustes do Lightroom (XMP com `crs:`)? Lê só os primeiros 256 KB. */
export async function temXmpDoLightroom(arquivo) {
  if (!/jpe?g$/i.test(arquivo.name || '') && arquivo.type !== 'image/jpeg') return false
  const bytes = new Uint8Array(await arquivo.slice(0, 256 * 1024).arrayBuffer())
  const texto = new TextDecoder('latin1').decode(bytes)
  return /camera-raw-settings/.test(texto)
}

/**
 * Lê um arquivo e devolve o que entra na biblioteca:
 * { arquivo, tipo: 'lightroom' | 'cube' | 'nosso', predefinicoes: [p], relatorio?, qc?, avisos: [texto], erros: [texto] }.
 * Nunca lança: o que não deu vira `erros`.
 */
export async function lerParaImportar(arquivo) {
  const nome = semExtensao(arquivo.name)
  const ext = extensao(arquivo.name)
  const saida = { arquivo: arquivo.name, tipo: 'lightroom', predefinicoes: [], avisos: [], erros: [] }
  try {
    const bytes = new Uint8Array(await arquivo.arrayBuffer())
    if (ext === 'cube') {
      saida.tipo = 'cube'
      const lut = lerCube(bytes)
      const { look, cortados } = compactar(lut, lut.titulo || nome)
      const p = criarPredefinicao({
        nome: lut.titulo || nome,
        familia: FAMILIA_IMPORTADAS,
        descricao: `LUT ${lut.lado}³ importada.`,
        ajustes: { look: { quantidade: 100 } },
        look,
        origem: { tipo: 'manual' },
      })
      saida.predefinicoes.push(p)
      saida.lut = { lado: lut.lado }
      saida.avisos.push(...(lut.avisos || []))
      if (cortados) saida.avisos.push(`${cortados.toLocaleString('pt-BR')} pontos da LUT saíam de 0 a 1 e foram presos.`)
      saida.qc = qc(p)
    } else if (ext === 'zropreset' || ext === 'zropack' || ext === 'json') {
      saida.tipo = 'nosso'
      const pacote = lerPacote(bytes)
      saida.predefinicoes.push(...pacote.predefinicoes)
      saida.erros.push(...pacote.erros.map((e) => `${e.nome || `Item ${e.indice + 1}`}: ${e.mensagem}`))
    } else {
      // o nome que o arquivo traz vale; o do arquivo é só a reserva
      const r = importarLightroom(bytes)
      const p = r.predefinicao.nome === 'Importada do Lightroom' && nome ? criarPredefinicao({ ...r.predefinicao, id: undefined, nome }) : r.predefinicao
      saida.predefinicoes.push(p)
      saida.relatorio = r.relatorio
      saida.avisos.push(...(r.relatorio.avisos || []))
      saida.qc = qc(p)
    }
  } catch (e) {
    saida.erros.push(e?.message || 'Não deu para ler este arquivo.')
  }
  return saida
}

// ─────────── sair ───────────

const nomeSeguro = (t, padrao = 'estilo') =>
  String(t || padrao)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || padrao

/** Baixa um arquivo gerado aqui (blob: na mesma origem). */
export function baixar(conteudo, nome, tipo = 'application/octet-stream') {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

const ROTULO = {
  presenca: 'presença',
  detalhe: 'detalhe',
  efeitos: 'efeitos',
}
const legivel = (caminho) => {
  const [grupo, nome] = caminho.split('.')
  const mapa = {
    textura: 'textura',
    clareza: 'clareza',
    neblina: 'neblina',
    nitidez: 'nitidez',
    ruidoLuz: 'ruído',
    ruidoCor: 'ruído de cor',
    grao: 'grão',
    graoTamanho: 'grão',
    graoAspereza: 'grão',
    vinheta: 'vinheta',
    vinhetaMeio: 'vinheta',
    vinhetaSuavidade: 'vinheta',
    look: 'LUT',
  }
  return mapa[nome] || mapa[grupo] || ROTULO[grupo] || nome || grupo
}
const juntar = (lista) => [...new Set(lista)].join(', ')

/** `.zropreset`: o arquivo inteiro, sem perda. */
export function exportarZropreset(p) {
  baixar(serializar(p), `${nomeSeguro(p.nome)}${EXTENSAO}`, 'application/json')
  return { aviso: `${p.nome}${EXTENSAO} baixado.` }
}

/** `.zropack`: várias numa coleção (por padrão, todas as da pessoa). */
export function exportarPacote(estado, { ids = null, nome = 'Meus estilos' } = {}) {
  const pacote = exportarBiblioteca(estado, { ids, nome })
  if (!pacote.predefinicoes.length) return { aviso: 'Nenhum estilo seu para exportar ainda.' }
  baixar(serializarPacote(pacote), `${nomeSeguro(nome)}${EXTENSAO_PACOTE}`, 'application/json')
  const n = pacote.predefinicoes.length
  return { aviso: `${n} ${n === 1 ? 'estilo exportado' : 'estilos exportados'}.` }
}

/** `.xmp` do Lightroom, com o que ficou de fora dito no aviso. */
export function exportarXmp(p) {
  const r = escreverXmp(p)
  baixar(r.xmp, nomeDoArquivoXmp(p), 'application/rdf+xml')
  const fora = juntar(r.relatorio.deFora.map((d) => legivel(d.caminho)))
  return { aviso: fora ? `Para o Lightroom. Ficou de fora: ${fora}.` : 'Para o Lightroom, completo.', deFora: r.relatorio.deFora }
}

/** `.cube`: o estilo assado numa LUT 33³ (o que depende de vizinhança não cabe e é dito). */
export function exportarCube(p) {
  const { lut, deFora } = assar(p, { lado: 33 })
  baixar(escreverCube({ ...lut, titulo: p.nome }), `${nomeSeguro(p.nome)}.cube`, 'text/plain')
  const fora = juntar(deFora.map(legivel))
  return { aviso: fora ? `LUT 33³. Não cabe numa LUT: ${fora}.` : 'LUT 33³ baixada.', deFora }
}

export { oQueMexe }
