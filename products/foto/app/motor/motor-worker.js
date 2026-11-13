// Worker da revelação (módulo). Abre o arquivo pela porta única (src/abrir.js), guarda as bases e faz o que é pesado
// fora da tela: a prévia embutida (instantânea), a base reduzida, a base cheia (demosaico 'qualidade') em janelas para o
// zoom de 100%, o automático, a prévia em JS quando não há placa de vídeo e a exportação em resolução cheia.
//
// Mensagens: { id, tipo, dados } → { id, ok: true, resultado } | { id, ok: false, erro: { nome, mensagem, codigo } };
// { id, progresso } no meio do caminho; { cancelar: id } pede para parar. Erro de leitura chega com o `codigo` do
// ErroRaw ('nao-e-raw', 'sem-suporte', 'corrompido') e a mensagem pronta para a tela.
//
// Memória: as últimas FOTOS fotos (bytes do arquivo e base reduzida) e UMA base cheia (a de 24 MP em Float32 ocupa
// ~290 MB). Abrir de novo uma foto guardada não relê o arquivo.

import { abrirFoto, abrirImagem } from '../../src/abrir.js'
import { lerExif } from '../../src/raw/exif.js'
import { criarLeitor } from '../../src/raw/libraw.js'
import { extrairPrevia, extrairPreviaDe } from '../../src/raw/previa.js'
import { normalizar } from '../../src/motor/ajustes.js'
import { autoBranco, autoExposicao } from '../../src/motor/auto.js'
import { histogramaDaCena, histogramaDaTela } from '../../src/motor/histograma.js'
import { geometria, revelar } from '../../src/motor/revelar.js'
import { paraBytes } from '../../src/motor/tela.js'
import { redimensionar } from '../../src/exportar/redimensionar.js'

export const FOTOS = 3
const LADO_JS = 800

const TRANSFERIR = Symbol('transferir')
const comTransferencia = (resultado, lista) => ({ [TRANSFERIR]: lista, resultado })

// ─────────── LibRaw (carrega uma vez, na primeira foto que precisa) ───────────

let leitorPromessa = null
function leitor() {
  leitorPromessa ??= import('../../vendor/libraw/index.js')
    .then(async ({ LibRaw }) => {
      await LibRaw.initialize()
      return criarLeitor(LibRaw)
    })
    .catch(() => null)
  return leitorPromessa
}

// ─────────── fotos guardadas ───────────

const fotos = new Map() // id → { bytes, nome, niveis: Map(chave → Promise<aberta>), ultimaTela }

function guardar(id, foto) {
  fotos.delete(id)
  fotos.set(id, foto)
  while (fotos.size > FOTOS) fotos.delete(fotos.keys().next().value)
}

function fotoDe(id) {
  const f = fotos.get(id)
  if (!f) throw Object.assign(new Error('A foto não está mais aberta.'), { codigo: 'fechada' })
  fotos.delete(id)
  fotos.set(id, f)
  return f
}

// Média de blocos k × k em luz linear: a base fica menor e `reduzir` acompanha (local.js usa para a escala).
function reduzirBase(base, k) {
  if (k <= 1) return base
  const { largura, altura, dados } = base.imagem
  const l = Math.max(1, Math.floor(largura / k))
  const a = Math.max(1, Math.floor(altura / k))
  const saida = new Float32Array(l * a * 3)
  const inv = 1 / (k * k)
  for (let y = 0; y < a; y++) {
    for (let x = 0; x < l; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let j = 0; j < k; j++) {
        let i = ((y * k + j) * largura + x * k) * 3
        for (let q = 0; q < k; q++, i += 3) {
          r += dados[i]
          g += dados[i + 1]
          b += dados[i + 2]
        }
      }
      const o = (y * l + x) * 3
      saida[o] = r * inv
      saida[o + 1] = g * inv
      saida[o + 2] = b * inv
    }
  }
  return { ...base, imagem: { largura: l, altura: a, dados: saida }, reduzir: (base.reduzir ?? 1) * k }
}

// Foto pronta que o leitor próprio não decodifica (PNG, HEIC, WebP, JPEG progressivo): o navegador decodifica aqui
// mesmo, no worker (createImageBitmap + OffscreenCanvas), e entra por abrirImagem.
async function decodificarNoNavegador(bytes, exif) {
  const bitmap = await createImageBitmap(new Blob([bytes]), { colorSpaceConversion: 'none', imageOrientation: 'none' })
  const tela = new OffscreenCanvas(bitmap.width, bitmap.height)
  const c = tela.getContext('2d', { colorSpace: 'srgb' })
  c.drawImage(bitmap, 0, 0)
  const { data } = c.getImageData(0, 0, bitmap.width, bitmap.height)
  bitmap.close()
  return abrirImagem({ largura: tela.width, altura: tela.height, dados: data, canais: 4, espaco: 'srgb', exif })
}

async function abrirNivel(foto, reduzir, demosaico) {
  try {
    const aberta = await abrirFoto(foto.bytes, { nome: foto.nome, leitor: await leitor(), demosaico, reduzir })
    // JPEG reduzido por abrirFoto chega com base.reduzir = 1 (baseDeImagem não sabe da redução); a escala da
    // vizinhança (local.js) depende dele, então vale o que foi pedido
    if (aberta.origem === 'imagem' && (aberta.base.reduzir ?? 1) !== reduzir) aberta.base.reduzir = reduzir
    return aberta
  } catch (erro) {
    if (!erro?.decodificarNaTela) throw erro
    const aberta = await decodificarNoNavegador(foto.bytes, lerExifSeguro(foto.bytes))
    if (reduzir > 1) aberta.base = reduzirBase(aberta.base, reduzir)
    return aberta
  }
}

/** A base de um nível: 'reduzida' (a da abertura), 'cheia' (reduzir 1, demosaico 'qualidade') ou um reduzir para exportar. */
function nivel(foto, chave) {
  if (!foto.niveis.has(chave)) {
    if (chave === 'cheia') {
      // uma base cheia por vez, de todas as fotos
      for (const outra of fotos.values()) if (outra !== foto) outra.niveis.delete('cheia')
      foto.niveis.set(chave, abrirNivel(foto, 1, 'qualidade'))
    } else if (chave.startsWith('r')) foto.niveis.set(chave, abrirNivel(foto, Number(chave.slice(1)), 'qualidade'))
    const p = foto.niveis.get(chave)
    p.catch(() => foto.niveis.delete(chave))
  }
  return foto.niveis.get(chave)
}

function lerExifSeguro(bytes) {
  try {
    return lerExif(bytes) || { orientacao: 1 }
  } catch {
    return { orientacao: 1 }
  }
}

// a prévia de um arquivo já lido inteiro: a JPEG embutida, ou o próprio arquivo quando ele é JPEG
function mandarPrevia(bytes, progresso) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return progresso({ etapa: 'previa', jpeg: bytes.slice() })
  try {
    const jpeg = extrairPrevia(bytes)?.jpeg
    if (jpeg) progresso({ etapa: 'previa', jpeg: jpeg.slice() })
  } catch {
    // sem prévia
  }
}

const semDados = (base) => ({ ...base, imagem: { largura: base.imagem.largura, altura: base.imagem.altura } })

// ─────────── tarefas ───────────

const TAREFAS = {
  /**
   * { id, arquivo?: File, bytes?: ArrayBuffer, nome, visor } → progresso { etapa: 'previa', jpeg, exif } (quando há
   * prévia embutida) e depois { base, latitude, exif, camera, avisos, origem, reduzir }. `visor`: o lado maior da tela
   * em pixels; a base reduzida é a menor (reduzir 4, 2 ou 1) que ainda cobre 2/3 dele.
   */
  async abrir({ id, arquivo, bytes, nome, visor = 1600 }, { progresso }) {
    let foto = fotos.get(id)
    if (!foto) {
      // 1. a prévia primeiro, lendo só o começo do arquivo (a JPEG embutida costuma morar nos primeiros 512 KB): a
      //    pessoa vê a foto antes de o arquivo inteiro ser lido
      if (arquivo) {
        const cabeca = new Uint8Array(await arquivo.slice(0, 3).arrayBuffer())
        if (cabeca[0] === 0xff && cabeca[1] === 0xd8) progresso({ etapa: 'previa', jpeg: arquivo })
        else {
          try {
            const ler = async (inicio, fim) => new Uint8Array(await arquivo.slice(inicio, fim).arrayBuffer())
            const p = await extrairPreviaDe(ler, arquivo.size)
            if (p?.jpeg) progresso({ etapa: 'previa', jpeg: p.jpeg.slice() })
          } catch {
            // sem prévia embutida legível: a base reduzida é a primeira imagem
          }
        }
      }
      const u8 = arquivo ? new Uint8Array(await arquivo.arrayBuffer()) : new Uint8Array(bytes)
      foto = { bytes: u8, nome: nome ?? arquivo?.name ?? '', niveis: new Map(), ultimaTela: null }
      guardar(id, foto)
      if (!arquivo) mandarPrevia(foto.bytes, progresso)
    } else {
      fotoDe(id)
      mandarPrevia(foto.bytes, progresso)
    }
    // 2. a base reduzida
    let reduzir = 4
    let aberta = null
    if (!foto.niveis.has('reduzida')) {
      for (;;) {
        aberta = await abrirNivel(foto, reduzir, 'rapido')
        const lado = Math.max(aberta.base.imagem.largura, aberta.base.imagem.altura)
        if (reduzir === 1 || lado >= (visor * 2) / 3) break
        reduzir /= 2
      }
      foto.niveis.set('reduzida', Promise.resolve(aberta))
    } else aberta = await foto.niveis.get('reduzida')
    // a cópia vai para a tela (a placa sobe dela); a original fica para o automático e o modo sem placa
    const base = { ...aberta.base, imagem: { ...aberta.base.imagem, dados: aberta.base.imagem.dados.slice() } }
    return comTransferencia(
      { base, latitude: aberta.latitude, exif: aberta.exif, camera: aberta.camera, avisos: aberta.avisos, origem: aberta.origem, reduzir: aberta.base.reduzir },
      [base.imagem.dados.buffer],
    )
  },

  /** { id } → os metadados da base cheia (sem os dados): prepara a base cheia se ainda não existe. */
  async cheia({ id }) {
    const aberta = await nivel(fotoDe(id), 'cheia')
    return { base: semDados(aberta.base), avisos: aberta.avisos }
  },

  /** { id, x, y, largura, altura } → um pedaço da base cheia: { janela, dados } (Float32Array RGB, transferido). */
  async janela({ id, x, y, largura, altura }) {
    const { base } = await nivel(fotoDe(id), 'cheia')
    const W = base.imagem.largura
    const H = base.imagem.altura
    const x0 = Math.max(0, Math.min(W - 1, Math.floor(x)))
    const y0 = Math.max(0, Math.min(H - 1, Math.floor(y)))
    const l = Math.max(1, Math.min(W - x0, Math.ceil(largura)))
    const a = Math.max(1, Math.min(H - y0, Math.ceil(altura)))
    const dados = new Float32Array(l * a * 3)
    for (let j = 0; j < a; j++) dados.set(base.imagem.dados.subarray(((y0 + j) * W + x0) * 3, ((y0 + j) * W + x0 + l) * 3), j * l * 3)
    return comTransferencia({ janela: { x: x0, y: y0, largura: l, altura: a }, dados }, [dados.buffer])
  },

  /**
   * Prévia em JS (sem placa de vídeo): { id, ajustes, tela, semente, nivel: 'menor' | 'cheia', regiao?, lado? } →
   * { largura, altura, rgba } (Uint8ClampedArray, transferido). 'menor' é a reduzida levada a até `lado` px (800).
   */
  async revelar({ id, ajustes, tela = 'srgb', semente = 1, nivel: qual = 'menor', regiao = null, lado = LADO_JS }) {
    const foto = fotoDe(id)
    let base
    if (qual === 'cheia') base = (await nivel(foto, 'cheia')).base
    else {
      const red = (await foto.niveis.get('reduzida')).base
      const k = Math.max(1, Math.ceil(Math.max(red.imagem.largura, red.imagem.altura) / lado))
      if (!foto.menor || foto.menor.k !== k || foto.menor.de !== red) foto.menor = { k, de: red, base: reduzirBase(red, k) }
      base = foto.menor.base
    }
    const imagem = revelar(base, ajustes, { tela, semente, regiao: regiao ?? undefined })
    foto.ultimaTela = { imagem, espaco: tela, ev: normalizar(ajustes).luz.exposicao + (base.exposicaoBase ?? 0), base }
    const rgba = paraBytes(imagem, { bits: 8 })
    return comTransferencia({ largura: imagem.largura, altura: imagem.altura, rgba, quadro: imagem.quadro, reduzir: base.reduzir }, [rgba.buffer])
  },

  /** Histogramas da última prévia em JS: { tela, cena }. */
  async histograma({ id }) {
    const foto = fotoDe(id)
    const u = foto.ultimaTela
    if (!u) throw new Error('histograma: nada revelado ainda')
    const tela = histogramaDaTela(u.imagem, { espaco: u.espaco, passo: Math.max(1, Math.round(Math.sqrt((u.imagem.largura * u.imagem.altura) / 65536))) })
    const passoCena = Math.max(1, Math.round(Math.sqrt((u.base.imagem.largura * u.base.imagem.altura) / 65536)))
    const cena = histogramaDaCena(u.base.imagem, { ev: u.ev, passo: passoCena })
    return { tela: { ...tela, percentil: undefined }, cena: { ...cena, percentil: undefined } }
  },

  /** Exposição e branco automáticos, medidos na base reduzida: { exposicao, branco, porque }. */
  async auto({ id }) {
    const { base } = await fotoDe(id).niveis.get('reduzida')
    const e = autoExposicao(base)
    const b = autoBranco(base)
    return {
      exposicao: e.exposicao,
      branco: { temperatura: b.temperatura, tinta: b.tinta, mudou: b.mudou, confianca: b.confianca },
      porque: [...e.porque, ...(Array.isArray(b.porque) ? b.porque : [b.porque])].filter(Boolean),
    }
  },

  /**
   * Exportação em JS: { id, ajustes, tela, bits, lado, semente } → { largura, altura, dados, espaco } em faixas, com
   * progresso (0..1) e cancelável. `lado`: o lado maior pedido (a base sai do nível de redução que ainda o cobre e a
   * imagem é reduzida em luz linear por src/exportar/redimensionar.js).
   */
  async exportar({ id, ajustes, tela = 'srgb', bits = 8, lado = null, semente = 1 }, { cancelado, progresso }) {
    const foto = fotoDe(id)
    const cheia = (await nivel(foto, 'cheia')).base
    const a = normalizar(ajustes)
    const quadro = geometria(cheia, a)
    let base = cheia
    if (lado) {
      const maior = Math.max(quadro.largura, quadro.altura)
      for (const r of [4, 2]) {
        if (maior / r >= lado) {
          base = (await nivel(foto, `r${r}`)).base
          break
        }
      }
    }
    if (cancelado()) return null
    const { largura, altura } = geometria(base, a)
    // faixas de ~1/8 da altura (a vizinhança mede a foto inteira de novo em cada chamada: faixa demais custa)
    const passo = Math.max(64, Math.ceil(altura / 8))
    const flutuante = lado ? new Float32Array(largura * altura * 3) : null
    const canais = bits === 8 ? 4 : 3
    const dados = flutuante ? null : bits === 8 ? new Uint8ClampedArray(largura * altura * 4) : new Uint16Array(largura * altura * 3)
    for (let y = 0; y < altura; y += passo) {
      // devolve a vez entre faixas: é aí que o pedido de cancelar chega
      await new Promise((ok) => setTimeout(ok, 0))
      if (cancelado()) return null
      const linhas = Math.min(passo, altura - y)
      const faixa = revelar(base, a, { tela, semente, regiao: { x: 0, y, largura, altura: linhas } })
      if (flutuante) flutuante.set(faixa.dados, y * largura * 3)
      else dados.set(paraBytes(faixa, { bits, deslocamento: y * largura }), y * largura * canais)
      progresso((y + linhas) / altura)
    }
    if (!flutuante) return comTransferencia({ largura, altura, dados, espaco: tela }, [dados.buffer])
    const menor = redimensionar({ largura, altura, dados: flutuante }, { tipo: 'lado', px: lado }, { espaco: tela })
    const saida = paraBytes(menor, { bits })
    return comTransferencia({ largura: menor.largura, altura: menor.altura, dados: saida, espaco: tela }, [saida.buffer])
  },

  /** Esquece a foto (e a base cheia dela). */
  async fechar({ id }) {
    fotos.delete(id)
    return true
  },
}

// ─────────── o laço de mensagens ───────────

const cancelados = new Set()
self.onmessage = async (e) => {
  const m = e.data
  if (m?.cancelar != null) {
    cancelados.add(m.cancelar)
    return
  }
  const { id, tipo, dados } = m
  try {
    const f = TAREFAS[tipo]
    if (!f) throw new Error(`tarefa desconhecida: ${tipo}`)
    const r = await f(dados, {
      cancelado: () => cancelados.has(id),
      progresso: (p) => self.postMessage({ id, progresso: p }),
    })
    if (r && r[TRANSFERIR]) self.postMessage({ id, ok: true, resultado: r.resultado }, r[TRANSFERIR])
    else self.postMessage({ id, ok: true, resultado: r })
  } catch (erro) {
    self.postMessage({ id, ok: false, erro: { nome: erro?.name || 'Error', mensagem: String(erro?.message ?? erro), codigo: erro?.codigo ?? null } })
  } finally {
    cancelados.delete(id)
  }
}
