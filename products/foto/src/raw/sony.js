// Sony "sem perdas" nos tamanhos M e S (ARW de ILCE-1, 7M4, 7RV, 9III…): o arquivo NÃO traz o mosaico. A câmera já
// fez o demosaico e grava a imagem em YCbCr 4:2:0, em blocos de 512×512 de JPEG sem perdas de 16 bits. É o modo que
// muito fotógrafo de evento usa (arquivo menor, cartão que dura o show inteiro), então precisa abrir de verdade.
//
// O que o arquivo diz (diretório da imagem principal, dentro do SubIFD do IFD0):
//   Compression 7 (JPEG), PhotometricInterpretation 6 (YCbCr), SamplesPerPixel 3, BitsPerSample 15
//   YCbCrCoefficients 0,299 / 0,587 / 0,114 (BT.601), YCbCrSubSampling 2 2, YCbCrPositioning 2 (croma no mesmo lugar
//   da primeira luma do bloco 2×2), ReferenceBlackWhite 0 16383 16384 16384 16384 16384 (luma 0..16383, croma
//   centrado em 16384, na mesma escala da luma)
//   0x7000 SonyRawFileType (4 = sem perdas), 0x7038 SonyRawImageSize, 0x7310 BlackLevel, 0x7313 WB_RGGBLevels,
//   DefaultCropOrigin/Size (as mesmas tags do DNG) — nomes da tabela pública do ExifTool (Sony SubIFD).
//
// A conta (TIFF 6.0, seção 21, "YCbCr Images"): R = Y + (2 − 2·Lr)·Cr, B = Y + (2 − 2·Lb)·Cb,
// G = (Y − Lr·R − Lb·B) / Lg. O resultado é o RGB DA CÂMERA, linear, JÁ COM O EQUILÍBRIO DE BRANCO como fotografado
// (a câmera equilibra antes de converter para YCbCr: um objeto cinza sai com R ≈ G ≈ B, e não com o verde dominando
// como no mosaico). Por isso o Negativo sai com `wb.aplicado` (contrato em negativo.js): quem revela não multiplica
// de novo, mas usa os multiplicadores para achar a luz da foto.
//
// O JPEG sem perdas aqui tem amostragem 2×2 na luma (T.81, H.1: cada MCU leva 4 amostras de Y, 1 de Cb e 1 de Cr,
// cada componente previsto no seu próprio plano). Medido nos arquivos reais e conferido amostra a amostra contra o
// LibRaw 0.22.1 (que também abre o formato): a primeira coluna de cada linha de MCU prevê pela amostra do mesmo lugar
// na linha de MCU de cima (y − v), e não pela linha logo acima; as demais seguem o T.81. Com a regra do T.81 pura a
// imagem ganha degraus de duas em duas linhas.
//
// O croma vai para o tamanho cheio em bilinear, com a amostra no lugar da primeira luma (YCbCrPositioning = 2). O
// LibRaw repete o croma (vizinho mais próximo); a diferença só aparece em borda de cor.
//
// Nada de código de terceiros: as contas vêm do TIFF 6.0 e do T.81; os nomes das tags, do ExifTool.

import { criarFonte, abrirTiff, lerIfd, numeros, numero } from './exif.js'
import { ErroRaw } from './erro.js'
import { tabelaHuffman } from './dng.js'

const T = {
  subIfds: 0x014a,
  largura: 0x0100,
  altura: 0x0101,
  bits: 0x0102,
  compressao: 0x0103,
  foto: 0x0106,
  fabricante: 0x010f,
  amostras: 0x0115,
  larguraDoBloco: 0x0142,
  alturaDoBloco: 0x0143,
  blocos: 0x0144,
  tamanhoDosBlocos: 0x0145,
  coeficientes: 0x0211,
  subamostragem: 0x0212,
  posicao: 0x0213,
  referencia: 0x0214,
  recorteOrigem: 0xc61f,
  recorteTamanho: 0xc620,
  tipoSony: 0x7000,
  tamanhoSony: 0x7038,
  pretoSony: 0x7310,
  brancoSony: 0x7313,
}

const YCBCR = 6
const JPEG = 7

/** O diretório da imagem YCbCr da Sony, ou null se o arquivo não for esse formato. Não decodifica nada. */
function acharDiretorio(u8) {
  if (u8.length < 16 || !((u8[0] === 0x49 && u8[1] === 0x49) || (u8[0] === 0x4d && u8[1] === 0x4d))) return null
  let tiff
  try {
    tiff = abrirTiff(criarFonte(u8), 0)
  } catch {
    return null
  }
  if (!tiff || tiff.magia !== 42) return null
  const um = (tags, tag) => numero(tiff, tags.get(tag))
  const vistos = new Set()
  const fila = [tiff.primeiro]
  let sony = false
  while (fila.length && vistos.size < 32) {
    const d = fila.shift()
    if (!d || vistos.has(d)) continue
    vistos.add(d)
    let ifd
    try {
      ifd = lerIfd(tiff, d)
    } catch {
      continue
    }
    const t = ifd.tags
    if (t.has(T.fabricante) && /^sony/i.test(tiff.fonte.ascii(t.get(T.fabricante).onde, Math.min(16, t.get(T.fabricante).n)))) sony = true
    if (um(t, T.foto) === YCBCR && um(t, T.compressao) === JPEG && t.has(T.tipoSony) && t.has(T.blocos)) return sony ? { tiff, tags: t, um } : null
    try {
      for (const s of numeros(tiff, t.get(T.subIfds), 8)) fila.push(s)
    } catch {
      // SubIFD ilegível: segue
    }
    if (ifd.proximo) fila.push(ifd.proximo)
  }
  return null
}

/** True quando o arquivo é um ARW da Sony já sem mosaico (YCbCr, tamanhos M e S do modo sem perdas). */
export const ehSonySemMosaico = (bytes) => acharDiretorio(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)) !== null

// JPEG sem perdas com amostragem (T.81 anexo H, processo SOF3, Huffman), escrevendo cada componente no seu plano.
// `planos[c] = { dados: Uint16Array, largura, altura, x0, y0 }`: o bloco começa em (x0, y0) do plano, em amostras do
// componente; o que cai fora do plano é lido e descartado (o arquivo enche o último bloco até 512).
function decodificarBloco(u8, inicio, fim, planos) {
  const erro = (m) => new ErroRaw('corrompido', `ARW: bloco de JPEG sem perdas inválido (${m}).`)
  const u16 = (p) => (u8[p] << 8) | u8[p + 1]
  if (fim - inicio < 4 || u16(inicio) !== 0xffd8) throw erro('sem o marcador de início')
  let p = inicio + 2
  const huff = []
  let comps = null
  let bitsDaAmostra = 0
  let colunas = 0
  let linhas = 0
  let preditor = 1
  let pt = 0
  for (;;) {
    if (p + 4 > fim) throw erro('cabeçalho truncado')
    const m = u16(p)
    const tam = u16(p + 2)
    const s = p + 4
    if (m === 0xffc3) {
      bitsDaAmostra = u8[s]
      linhas = u16(s + 1)
      colunas = u16(s + 3)
      comps = []
      for (let i = 0; i < u8[s + 5]; i++) comps.push({ id: u8[s + 6 + 3 * i], h: u8[s + 7 + 3 * i] >> 4, v: u8[s + 7 + 3 * i] & 15 })
    } else if (m === 0xffc4) {
      for (let q = s; q + 17 <= p + 2 + tam; ) {
        let total = 0
        for (let i = 0; i < 16; i++) total += u8[q + 1 + i]
        huff[u8[q] & 15] = tabelaHuffman(u8, q + 1, total)
        q += 17 + total
      }
    } else if (m === 0xffdd) {
      if (u16(s) !== 0) throw new ErroRaw('sem-suporte', 'ARW com intervalo de reinício no JPEG sem perdas: formato ainda não visto.')
    } else if (m === 0xffda) {
      if (!comps) throw erro('varredura antes do quadro')
      const n = u8[s]
      if (n !== comps.length) throw new ErroRaw('sem-suporte', 'ARW com o JPEG sem perdas em mais de uma varredura.')
      for (let i = 0; i < n; i++) {
        const c = comps.find((k) => k.id === u8[s + 1 + 2 * i])
        if (!c) throw erro('componente desconhecido')
        c.lut = huff[u8[s + 2 + 2 * i] >> 4]
        if (!c.lut) throw erro('componente sem tabela')
      }
      preditor = u8[s + 1 + 2 * n]
      pt = u8[s + 3 + 2 * n] & 15
      p += 2 + tam
      break
    } else if ((m & 0xfff0) === 0xffc0 && m !== 0xffc4 && m !== 0xffc8 && m !== 0xffcc) {
      throw new ErroRaw('sem-suporte', `ARW com JPEG de processo SOF${m & 15} no lugar do JPEG sem perdas.`)
    } else if ((m & 0xff00) !== 0xff00) throw erro('marcador fora do lugar')
    p += 2 + tam
  }
  if (comps.length !== planos.length) throw erro('número de componentes')
  if (preditor < 1 || preditor > 7) throw erro(`preditor ${preditor}`)
  const hMax = Math.max(...comps.map((c) => c.h))
  const vMax = Math.max(...comps.map((c) => c.v))
  const mx = Math.ceil(colunas / hMax)
  const my = Math.ceil(linhas / vMax)
  // plano local do bloco, por componente (Int32 para o preditor somar sem estourar)
  for (const c of comps) {
    c.w = mx * c.h
    c.alt = my * c.v
    c.d = new Uint16Array(c.w * c.alt)
  }
  const inicial = 1 << (bitsDaAmostra - pt - 1)
  // Laço quente: tudo em variáveis locais, sem função interna (o leitor de bits numa função à parte obriga o motor do
  // JavaScript a guardar `bits`, `nbits` e `p` fora dos registradores: o dobro do tempo).
  let bits = 0
  let nbits = 0
  const nc = comps.length
  for (let j = 0; j < my; j++) {
    for (let i = 0; i < mx; i++) {
      const borda = j === 0 || i === 0 || preditor !== 1
      for (let k = 0; k < nc; k++) {
        const c = comps[k]
        const d = c.d
        const w = c.w
        const lut = c.lut
        const ch = c.h
        const cv = c.v
        for (let sv = 0; sv < cv; sv++) {
          const y = j * cv + sv
          const linha = y * w
          for (let sh = 0; sh < ch; sh++) {
            const x = i * ch + sh
            let px
            if (!borda) px = d[linha + x - 1]
            else if (y === 0) px = x === 0 ? inicial : d[x - 1]
            else if (x === 0) px = d[(sv === 0 ? y - cv : y - 1) * w] // a regra da primeira coluna (ver o cabeçalho)
            else if (preditor === 1) px = d[linha + x - 1]
            else {
              const ra = d[linha + x - 1]
              const rb = d[linha - w + x]
              const rc = d[linha - w + x - 1]
              px = preditor === 2 ? rb : preditor === 3 ? rc : preditor === 4 ? ra + rb - rc : preditor === 5 ? ra + ((rb - rc) >> 1) : preditor === 6 ? rb + ((ra - rc) >> 1) : (ra + rb) >> 1
            }
            // garante 16 bits no acumulador; FF 00 é o byte FF e qualquer outro marcador encerra os dados (entra zero)
            while (nbits <= 16) {
              let b = p < fim ? u8[p++] : 0
              if (b === 0xff) {
                if (u8[p] === 0) p++
                else {
                  p--
                  b = 0
                }
              }
              bits = ((bits << 8) | b) >>> 0
              nbits += 8
            }
            const e = lut[(bits >>> (nbits - 16)) & 0xffff]
            if (e === 0) throw erro('código de Huffman desconhecido')
            nbits -= e >> 8
            const tamanho = e & 255
            let dif = 0
            if (tamanho === 16) dif = 32768
            else if (tamanho > 0) {
              while (nbits <= 16) {
                let b = p < fim ? u8[p++] : 0
                if (b === 0xff) {
                  if (u8[p] === 0) p++
                  else {
                    p--
                    b = 0
                  }
                }
                bits = ((bits << 8) | b) >>> 0
                nbits += 8
              }
              dif = (bits >>> (nbits - tamanho)) & ((1 << tamanho) - 1)
              nbits -= tamanho
              if (dif < 1 << (tamanho - 1)) dif -= (1 << tamanho) - 1
            }
            d[linha + x] = px + dif
          }
        }
      }
    }
  }
  // para o plano da imagem, cortando o que sobra do bloco
  for (let k = 0; k < comps.length; k++) {
    const c = comps[k]
    const destino = planos[k]
    const largura = Math.min(c.w, destino.largura - destino.x0)
    const altura = Math.min(c.alt, destino.altura - destino.y0)
    for (let y = 0; y < altura; y++) {
      const linha = c.d.subarray(y * c.w, y * c.w + largura)
      if (pt) for (let x = 0; x < largura; x++) destino.dados[(destino.y0 + y) * destino.largura + destino.x0 + x] = linha[x] << pt
      else destino.dados.set(linha, (destino.y0 + y) * destino.largura + destino.x0)
    }
  }
  return { hMax, vMax, comps: comps.map((c) => ({ h: c.h, v: c.v })), colunas, linhas }
}

/**
 * ARW da Sony já sem mosaico → a parte do Negativo que vem do arquivo: { sensor: { largura, altura, amostras: 3,
 * dados: Uint16Array RGB }, area, recorte?, preto, branco, wb: { comoFotografado, aplicado: true } }. A cor (matriz da
 * câmera) não está no arquivo: vem do LibRaw (libraw.js), que tem a tabela das câmeras.
 * null quando o arquivo não é esse formato; `ErroRaw` quando é e não abre.
 */
export function lerSonySemMosaico(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const dir = acharDiretorio(u8)
  if (!dir) return null
  const { tiff, tags, um } = dir
  const lista = (tag, n = 16) => (tags.has(tag) ? numeros(tiff, tags.get(tag), n) : null)
  const larguraCheia = um(tags, T.largura)
  const alturaCheia = um(tags, T.altura)
  if ((um(tags, T.amostras) ?? 1) !== 3) throw new ErroRaw('sem-suporte', 'ARW em YCbCr sem as três amostras por pixel.')
  const sub = lista(T.subamostragem, 2) ?? [2, 1]
  const coef = lista(T.coeficientes, 3) ?? [0.299, 0.587, 0.114]
  const ref = lista(T.referencia, 6) ?? [0, 16383, 16384, 16384, 16384, 16384]
  if (!coef.every((v) => v > 0 && v < 1)) throw new ErroRaw('corrompido', 'ARW com coeficientes de YCbCr inválidos.')
  // o tamanho útil (sem o enchimento dos blocos) e o recorte da câmera
  const util = lista(T.tamanhoSony, 2) ?? [larguraCheia, alturaCheia]
  const largura = Math.min(util[0], larguraCheia)
  const altura = Math.min(util[1], alturaCheia)
  const lb = um(tags, T.larguraDoBloco)
  const ab = um(tags, T.alturaDoBloco)
  const posicoes = lista(T.blocos, 1 << 16) ?? []
  const tamanhos = lista(T.tamanhoDosBlocos, 1 << 16) ?? []
  if (!(largura > 0 && altura > 0 && lb > 0 && ab > 0) || posicoes.length === 0 || tamanhos.length < posicoes.length)
    throw new ErroRaw('corrompido', 'ARW sem a posição da imagem.')
  const porLinha = Math.ceil(larguraCheia / lb)
  if (posicoes.length < porLinha * Math.ceil(altura / ab)) throw new ErroRaw('corrompido', 'ARW com menos blocos que a imagem pede.')

  // planos: luma no tamanho cheio, croma no tamanho da subamostragem
  const [sh, sv] = sub
  const lc = Math.ceil(largura / sh)
  const ac = Math.ceil(altura / sv)
  const Y = { dados: new Uint16Array(largura * altura), largura, altura }
  const Cb = { dados: new Uint16Array(lc * ac), largura: lc, altura: ac }
  const Cr = { dados: new Uint16Array(lc * ac), largura: lc, altura: ac }
  for (let i = 0; i < posicoes.length; i++) {
    const x0 = (i % porLinha) * lb
    const y0 = Math.floor(i / porLinha) * ab
    if (x0 >= largura || y0 >= altura) continue
    if (posicoes[i] + tamanhos[i] > u8.length) throw new ErroRaw('corrompido', 'ARW truncado: a imagem passa do fim do arquivo.')
    const r = decodificarBloco(u8, posicoes[i], posicoes[i] + tamanhos[i], [
      { ...Y, x0, y0 },
      { ...Cb, x0: x0 / sh, y0: y0 / sv },
      { ...Cr, x0: x0 / sh, y0: y0 / sv },
    ])
    if (r.hMax !== sh || r.vMax !== sv || r.comps[1].h !== 1 || r.comps[1].v !== 1 || r.comps[2].h !== 1 || r.comps[2].v !== 1)
      throw new ErroRaw('sem-suporte', 'ARW com amostragem de croma diferente da que o arquivo declara.')
  }

  // YCbCr → RGB da câmera (TIFF 6.0, seção 21). Croma centrado em ref[2] e ref[4], na escala da luma (ref[1] − ref[0]
  // é a mesma faixa); a luma começa em ref[0].
  const [lr, lg, lbl] = coef
  const kr = 2 - 2 * lr
  const kb = 2 - 2 * lbl
  const meioCb = ref[2]
  const meioCr = ref[4]
  const pe = ref[0]
  const dados = new Uint16Array(largura * altura * 3)
  // para cada coluna: as duas colunas de croma e o peso (bilinear, amostra no lugar da primeira luma do bloco)
  const cx0 = new Int32Array(largura)
  const cx1 = new Int32Array(largura)
  const tx = new Float32Array(largura)
  for (let x = 0; x < largura; x++) {
    const f = x / sh
    cx0[x] = Math.min(f | 0, lc - 1)
    cx1[x] = Math.min(cx0[x] + 1, lc - 1)
    tx[x] = f - (f | 0)
  }
  // o croma da linha, já interpolado na vertical (na resolução do croma) e sem o centro
  const cbl = new Float32Array(lc)
  const crl = new Float32Array(lc)
  const igl = 1 / lg
  for (let y = 0; y < altura; y++) {
    const f = y / sv
    const y0 = Math.min(f | 0, ac - 1)
    const y1 = Math.min(y0 + 1, ac - 1)
    const ty = f - (f | 0)
    const a = y0 * lc
    const b = y1 * lc
    for (let i = 0; i < lc; i++) {
      cbl[i] = Cb.dados[a + i] + (Cb.dados[b + i] - Cb.dados[a + i]) * ty - meioCb
      crl[i] = Cr.dados[a + i] + (Cr.dados[b + i] - Cr.dados[a + i]) * ty - meioCr
    }
    const ly = y * largura
    for (let x = 0, o = ly * 3; x < largura; x++, o += 3) {
      const i0 = cx0[x]
      const i1 = cx1[x]
      const t = tx[x]
      const cb = cbl[i0] + (cbl[i1] - cbl[i0]) * t
      const cr = crl[i0] + (crl[i1] - crl[i0]) * t
      const l = Y.dados[ly + x] - pe
      const r = l + kr * cr
      const bb = l + kb * cb
      const g = (l - lr * r - lbl * bb) * igl
      dados[o] = r <= 0 ? 0 : r >= 65535 ? 65535 : (r + 0.5) | 0
      dados[o + 1] = g <= 0 ? 0 : g >= 65535 ? 65535 : (g + 0.5) | 0
      dados[o + 2] = bb <= 0 ? 0 : bb >= 65535 ? 65535 : (bb + 0.5) | 0
    }
  }

  // Preto e branco do dado: medidos nos 21 arquivos reais (ILCE-7M4, tamanho M). O fundo do histograma dos três canais
  // assenta em ~1024 = 2 × BlackLevel (0x7310, que vale 512 na escala de 14 bits do mosaico) — é também o preto que o
  // LibRaw usa para este formato. As altas luzes empilham em 18878 nos três canais (a câmera corta o RGB já equilibrado
  // num teto só), = 1024 + 1,125 × (16383 − 512): a escala do YCbCr é 9/8 da faixa de 14 bits. O que passa disso é a
  // interpolação do croma na borda do corte. latitude.js confere o empilhamento em cada foto.
  const pretoTag = lista(T.pretoSony, 4)
  const pretoMosaico = pretoTag ? (pretoTag[0] + pretoTag[1] + pretoTag[2] + pretoTag[3]) / 4 : 512
  const pretoDado = 2 * pretoMosaico
  const brancoDado = Math.floor(pretoDado + 1.125 * (16383 - pretoMosaico))
  const wb = lista(T.brancoSony, 4)
  const origem = lista(T.recorteOrigem, 2)
  const tamanho = lista(T.recorteTamanho, 2)
  const n = {
    sensor: { largura, altura, amostras: 3, dados },
    area: { x: 0, y: 0, largura, altura },
    preto: { porCanal: [pretoDado, pretoDado, pretoDado] },
    branco: { declarado: [brancoDado, brancoDado, brancoDado] },
    wb: wb && wb.every((v) => v > 0) ? { comoFotografado: [wb[0] / wb[1], 1, wb[3] / wb[1]], aplicado: true } : {},
    subamostragem: sub,
  }
  if (origem && tamanho && origem[0] + tamanho[0] <= largura && origem[1] + tamanho[1] <= altura && tamanho[0] > 0 && tamanho[1] > 0)
    n.recorte = { x: origem[0], y: origem[1], largura: tamanho[0], altura: tamanho[1] }
  return n
}
