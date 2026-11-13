// Apoio dos testes de src/abrir.js e de src/raw/sony.js: o ARW da Sony "sem perdas" M/S fabricado (YCbCr 4:2:0 em
// blocos de JPEG sem perdas de 16 bits), com codificador próprio e independente do decodificador testado.

import { montarTiff, juntar } from './apoio-raw.js'

/**
 * JPEG sem perdas de um bloco com a luma amostrada 2×2 (MCU = 4 Y + Cb + Cr), preditor 1, 16 bits. A primeira coluna
 * segue a regra que os arquivos reais da Sony usam (prevê pela amostra da linha de MCU de cima). Tabela de Huffman fixa:
 * categorias 0 a 15 com 5 bits e a 16 com 6 (como no apoio de raw).
 * `Y` tem colunas × linhas; `Cb` e `Cr`, (colunas/2) × (linhas/2). Tudo Uint16.
 */
export function codificarBloco420({ Y, Cb, Cr, colunas, linhas }) {
  const saida = []
  const u16 = (x) => saida.push(x >> 8, x & 255)
  saida.push(0xff, 0xd8, 0xff, 0xc3)
  u16(17)
  saida.push(16)
  u16(linhas)
  u16(colunas)
  saida.push(3, 1, 0x22, 0, 2, 0x11, 0, 3, 0x11, 0)
  for (const classe of [0, 1]) {
    saida.push(0xff, 0xc4)
    u16(2 + 1 + 16 + 17)
    saida.push(classe, 0, 0, 0, 0, 16, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
    for (let s = 0; s <= 16; s++) saida.push(s)
  }
  saida.push(0xff, 0xda)
  u16(12)
  saida.push(3, 1, 0x00, 2, 0x10, 3, 0x10, 1, 0, 0)
  let acumulado = 0
  let quantos = 0
  const bitsFora = (valor, n) => {
    for (let i = n - 1; i >= 0; i--) {
      acumulado = (acumulado << 1) | ((valor >> i) & 1)
      if (++quantos === 8) {
        saida.push(acumulado)
        if (acumulado === 0xff) saida.push(0)
        acumulado = 0
        quantos = 0
      }
    }
  }
  const diferenca = (v, px) => {
    let d = (v - px) & 0xffff
    if (d > 32768) d -= 65536
    if (d === 0) bitsFora(0, 5)
    else if (d === 32768) bitsFora(32, 6)
    else {
      const s = 32 - Math.clz32(Math.abs(d))
      bitsFora(s, 5)
      bitsFora(d > 0 ? d : d + (1 << s) - 1, s)
    }
  }
  const comps = [
    { d: Y, w: colunas, h: 2, v: 2 },
    { d: Cb, w: colunas / 2, h: 1, v: 1 },
    { d: Cr, w: colunas / 2, h: 1, v: 1 },
  ]
  for (let j = 0; j < linhas / 2; j++) {
    for (let i = 0; i < colunas / 2; i++) {
      for (const c of comps) {
        for (let sv = 0; sv < c.v; sv++) {
          for (let sh = 0; sh < c.h; sh++) {
            const x = i * c.h + sh
            const y = j * c.v + sv
            let px
            if (y === 0) px = x === 0 ? 32768 : c.d[x - 1]
            else if (x === 0) px = c.d[(sv === 0 ? y - c.v : y - 1) * c.w]
            else px = c.d[y * c.w + x - 1]
            diferenca(c.d[y * c.w + x], px)
          }
        }
      }
    }
  }
  while (quantos !== 0) bitsFora(1, 1)
  saida.push(0xff, 0xd9)
  return Uint8Array.from(saida)
}

/**
 * ARW "sem perdas" tamanho M fabricado a partir de um RGB de câmera JÁ EQUILIBRADO (Uint16, 3 por pixel, com o preto
 * do dado em 1024). Converte para YCbCr BT.601 com o croma tomado no lugar da primeira luma de cada bloco 2×2
 * (YCbCrPositioning = 2), corta em blocos de `bloco` × `bloco` (enchendo a borda com a última linha/coluna) e monta o
 * TIFF com as tags que o leitor usa. Devolve { bytes, Y, Cb, Cr }.
 */
export function fabricarArwSemMosaico({ largura, altura, rgb, bloco = 64, orientacao = 1, recorte = { x: 2, y: 2, largura: largura - 4, altura: altura - 4 }, wb = [2340, 1024, 1024, 1648] }) {
  const lc = Math.ceil(largura / 2)
  const ac = Math.ceil(altura / 2)
  const Y = new Uint16Array(largura * altura)
  const Cb = new Uint16Array(lc * ac)
  const Cr = new Uint16Array(lc * ac)
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const o = (y * largura + x) * 3
      const yy = 0.299 * rgb[o] + 0.587 * rgb[o + 1] + 0.114 * rgb[o + 2]
      Y[y * largura + x] = Math.round(yy)
      if (!(x & 1) && !(y & 1)) {
        Cb[(y >> 1) * lc + (x >> 1)] = Math.round((rgb[o + 2] - yy) / 1.772 + 16384)
        Cr[(y >> 1) * lc + (x >> 1)] = Math.round((rgb[o] - yy) / 1.402 + 16384)
      }
    }
  }
  const porLinha = Math.ceil(largura / bloco)
  const porColuna = Math.ceil(altura / bloco)
  const blocos = []
  const meio = bloco / 2
  for (let by = 0; by < porColuna; by++) {
    for (let bx = 0; bx < porLinha; bx++) {
      const y0 = by * bloco
      const x0 = bx * bloco
      const bY = new Uint16Array(bloco * bloco)
      const bCb = new Uint16Array(meio * meio)
      const bCr = new Uint16Array(meio * meio)
      for (let y = 0; y < bloco; y++)
        for (let x = 0; x < bloco; x++) bY[y * bloco + x] = Y[Math.min(altura - 1, y0 + y) * largura + Math.min(largura - 1, x0 + x)]
      for (let y = 0; y < meio; y++) {
        for (let x = 0; x < meio; x++) {
          const i = Math.min(ac - 1, y0 / 2 + y) * lc + Math.min(lc - 1, x0 / 2 + x)
          bCb[y * meio + x] = Cb[i]
          bCr[y * meio + x] = Cr[i]
        }
      }
      blocos.push(codificarBloco420({ Y: bY, Cb: bCb, Cr: bCr, colunas: bloco, linhas: bloco }))
    }
  }
  const dado = juntar(blocos)
  const posicoes = []
  let p = 0
  for (const b of blocos) {
    posicoes.push(p)
    p += b.length
  }
  const larguraCheia = porLinha * bloco
  const alturaCheia = porColuna * bloco
  const { bytes, pos } = montarTiff({
    blocos: [
      {
        nome: 'ifd0',
        ifd: [
          [0x00fe, 4, 1],
          [0x010f, 2, 'SONY'],
          [0x0110, 2, 'ILCE-7M4'],
          [0x0112, 3, orientacao],
          [0x014a, 4, { pos: 'cru' }],
        ],
      },
      {
        nome: 'cru',
        ifd: [
          [0x00fe, 4, 0],
          [0x0100, 3, larguraCheia],
          [0x0101, 3, alturaCheia],
          [0x0102, 3, [15, 15, 15]],
          [0x0103, 3, 7],
          [0x0106, 3, 6],
          [0x0115, 3, 3],
          [0x011c, 3, 1],
          [0x0142, 3, bloco],
          [0x0143, 3, bloco],
          [0x0144, 4, posicoes.map(() => 0)], // posições reais escritas abaixo (dependem de onde o dado cai)
          [0x0145, 4, blocos.map((b) => b.length)],
          [0x0211, 5, [[299, 1000], [587, 1000], [114, 1000]]],
          [0x0212, 3, [2, 2]],
          [0x0213, 3, 2],
          [0x0214, 5, [[0, 1], [16383, 1], [16384, 1], [16384, 1], [16384, 1], [16384, 1]]],
          [0x7000, 3, 4],
          [0x7038, 4, [largura, altura]],
          [0x7310, 3, [512, 512, 512, 512]],
          [0x7313, 3, wb], // no arquivo é SSHORT (8); o montador de teste só escreve SHORT, e os valores são positivos
          [0xc61f, 4, [recorte.x, recorte.y]],
          [0xc620, 4, [recorte.largura, recorte.altura]],
        ],
      },
      { nome: 'dado', bytes: dado },
    ],
  })
  // posições dos blocos: o montador grava a lista fora do diretório; acha a entrada 0x0144 e corrige
  const v = new DataView(bytes.buffer)
  const base = pos.cru
  const n = v.getUint16(base, true)
  for (let i = 0; i < n; i++) {
    const e = base + 2 + i * 12
    if (v.getUint16(e, true) !== 0x0144) continue
    const onde = posicoes.length > 1 ? v.getUint32(e + 8, true) : e + 8
    posicoes.forEach((q, k) => v.setUint32(onde + k * 4, pos.dado + q, true))
  }
  return { bytes, Y, Cb, Cr }
}
