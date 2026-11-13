// A prévia JPEG que a câmera grava dentro do RAW, em JS puro e sem revelar nada: é o que deixa a decupagem instantânea
// (o truque do Photo Mechanic). Em vez de varrer o arquivo atrás de FF D8, segue a estrutura de cada formato até a
// posição e o tamanho exatos de cada JPEG; por isso funciona lendo só o começo de um arquivo de 50 MB e, quando a
// prévia mora mais adiante, sabe dizer exatamente qual pedaço ainda precisa.
//
// Onde cada formato guarda a prévia (verificado em arquivos reais; fatos de formato, nenhum código de terceiros):
//   DNG       IFD0 e SubIFDs com NewSubFileType = 1, Compression = 7 e uma tira só
//   CR2       IFD0 (tira JPEG do tamanho quase inteiro) e IFD1 (miniatura); o IFD do sensor é JPEG lossless e fica de fora
//   NEF       SubIFDs com JPEGInterchangeFormat; a menor fica nas marcas do fabricante (PreviewIFD, tag 0x0011)
//   ARW, PEF  IFD0 e os diretórios seguintes da cadeia, com JPEGInterchangeFormat
//   RW2       tag 0x002E (JpgFromRaw) no IFD0
//   ORF       marcas do fabricante da Olympus: CameraSettings (0x2020) → PreviewImageStart/Length (0x0101/0x0102)
//   RAF       posição e tamanho no cabeçalho (bytes 84 e 88, big-endian)
//   CR3       caixas THMB (160 px) e PRVW (1620 px) e a primeira trilha de `mdat` (JPEG do tamanho inteiro)
//
// "Decodificável" = JPEG que o navegador abre: processo 0, 1 ou 2 (ITU-T T.81), 8 bits, 1 ou 3 componentes. O JPEG
// lossless (SOF3) do sensor nunca é prévia.

import { criarFonte, Falta, reconhecer, abrirTiff, lerIfd, numeros, numero, lerCr3 } from './exif.js'

const MENOR_NA_VARREDURA = 8 * 1024 // abaixo disso, o que a varredura acha é miniatura de 160 px ou coincidência

/**
 * Cabeçalho do JPEG que começa em `inicio`: { processo, bits, largura, altura, canais }, ou null se não for JPEG.
 * Anda de segmento em segmento (FF xx + tamanho) até o quadro (SOFn), sem tocar nos dados da imagem.
 */
export function cabecalhoJpeg(fonte, inicio, fim = fonte.total) {
  if (fim - inicio < 4 || fonte.u8(inicio) !== 0xff || fonte.u8(inicio + 1) !== 0xd8) return null
  let p = inicio + 2
  while (p + 4 <= fim) {
    if (fonte.u8(p) !== 0xff) return null
    const m = fonte.u8(p + 1)
    if (m === 0xff) {
      p++ // preenchimento permitido antes de qualquer marcador
      continue
    }
    if (m === 0xd9 || m === 0xda || m === 0x00 || (m >= 0xd0 && m <= 0xd7)) return null // acabou sem quadro
    const tam = fonte.u16(p + 2, false)
    if (tam < 2) return null
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      if (tam < 8) return null
      return {
        processo: m - 0xc0,
        bits: fonte.u8(p + 4),
        altura: fonte.u16(p + 5, false),
        largura: fonte.u16(p + 7, false),
        canais: fonte.u8(p + 9),
      }
    }
    p += 2 + tam
  }
  return null
}

const decodificavel = (c) => !!c && c.processo <= 2 && c.bits === 8 && (c.canais === 1 || c.canais === 3) && c.largura > 0 && c.altura > 0

// ---------------------------------------------------------------------------------------------------- candidatas

function doDiretorio(tiff, d, lista) {
  const g = (tag) => d.tags.get(tag)
  const um = (tag) => (g(tag) ? numero(tiff, g(tag)) : undefined)
  const largura = um(0x0100)
  const altura = um(0x0101)
  const medidas = largura > 0 && altura > 0 ? { largura, altura } : {}
  if (g(0x0201) && g(0x0202)) {
    const inicio = um(0x0201)
    const tamanho = um(0x0202)
    if (inicio > 0 && tamanho > 0) lista.push({ inicio: tiff.base + inicio, tamanho, ...medidas })
    return
  }
  const compressao = um(0x0103)
  const foto = um(0x0106)
  // tira única em JPEG (6 = JPEG antigo do TIFF 6.0, 7 = JPEG da nota técnica 2). Fora: o mosaico do sensor (CFA,
  // LinearRaw, fatias do CR2) e a "tira JPEG" do CR2 que na verdade é RGB sem compressão (tamanho = l × a × amostras)
  if ((compressao !== 6 && compressao !== 7) || !g(0x0111) || g(0x0111).n !== 1 || !g(0x0117)) return
  if (foto === 32803 || foto === 34892 || g(0xc640) || g(0x828e)) return
  const inicio = um(0x0111)
  const tamanho = um(0x0117)
  if (!(inicio > 0 && tamanho > 0) || inicio === 0xffffffff) return
  if (largura * altura * (um(0x0115) || 3) === tamanho) return
  lista.push({ inicio: tiff.base + inicio, tamanho, ...medidas })
}

function doFabricante(tiff, entrada, lista) {
  const { fonte } = tiff
  const cabeca = fonte.ascii(entrada.onde, 8)
  if (cabeca.startsWith('Nikon')) {
    const mn = abrirTiff(fonte, entrada.onde + 10)
    const previa = mn && lerIfd(mn, mn.primeiro).tags.get(0x0011)
    if (previa) doDiretorio(mn, lerIfd(mn, numero(mn, previa)), lista)
  } else if (cabeca === 'OLYMPUS') {
    // 'OLYMPUS\0' + ordem dos bytes + versão; o diretório começa em +12 e tudo conta do começo das marcas
    const mn = { fonte, base: entrada.onde, le: fonte.u16(entrada.onde + 8, false) === 0x4949, magia: 42 }
    const ajustes = lerIfd(mn, 12).tags.get(0x2020)
    if (!ajustes) return
    const d = lerIfd(mn, ajustes.tipo === 13 || ajustes.tipo === 4 ? numero(mn, ajustes) : ajustes.onde - mn.base)
    const inicio = numero(mn, d.tags.get(0x0101))
    const tamanho = numero(mn, d.tags.get(0x0102))
    if (inicio > 0 && tamanho > 0) lista.push({ inicio: mn.base + inicio, tamanho })
  }
}

function candidatasTiff(fonte) {
  const tiff = abrirTiff(fonte, 0)
  const lista = []
  const vistos = new Set()
  // Diretório quebrado é ignorado; pedaço ainda não carregado (Falta) sobe, para quem chamou buscar e tentar de novo
  const opcional = (f) => {
    try {
      f()
    } catch (erro) {
      if (erro instanceof Falta) throw erro
    }
  }
  const visitar = (deslocamento, fundo) => {
    while (deslocamento && fundo < 4 && !vistos.has(deslocamento) && vistos.size < 64) {
      vistos.add(deslocamento)
      let d
      try {
        d = lerIfd(tiff, deslocamento)
      } catch (erro) {
        if (erro instanceof Falta) throw erro
        return
      }
      opcional(() => doDiretorio(tiff, d, lista))
      const rw2 = tiff.magia === 0x55 && d.tags.get(0x002e)
      if (rw2 && rw2.n > 4) lista.push({ inicio: rw2.onde, tamanho: rw2.n })
      opcional(() => {
        for (const sub of numeros(tiff, d.tags.get(0x014a), 16)) visitar(sub, fundo + 1)
      })
      opcional(() => {
        const exif = numero(tiff, d.tags.get(0x8769))
        const marcas = exif && lerIfd(tiff, exif).tags.get(0x927c)
        if (marcas && marcas.n > 16) doFabricante(tiff, marcas, lista)
      })
      deslocamento = d.proximo
    }
  }
  let falta = null
  try {
    visitar(tiff.primeiro, 0)
  } catch (erro) {
    if (!(erro instanceof Falta)) throw erro
    falta = erro // o que já foi achado continua valendo; quem chamou decide se busca o resto
  }
  return { lista, falta }
}

function candidatasCr3(fonte) {
  const e = lerCr3(fonte)
  const lista = []
  // THMB e PRVW: 16 bytes de cabeçalho (versão, medidas e tamanho do JPEG) e o JPEG até o fim da caixa
  for (const c of [e.thmb, e.prvw]) if (c && c.fim - c.inicio > 20) lista.push({ inicio: c.inicio + 16, tamanho: c.fim - c.inicio - 16 })
  for (const t of e.trilhas) {
    if (t.jpeg && t.tamanho > 0)
      lista.push({ inicio: t.inicio, tamanho: t.tamanho, ...(t.largura && t.altura ? { largura: t.largura, altura: t.altura } : {}) })
  }
  return { lista, falta: e.falta || null }
}

function candidatas(fonte) {
  const tipo = reconhecer(fonte)
  if (tipo === 'tiff') return candidatasTiff(fonte)
  if (tipo === 'bmff') return candidatasCr3(fonte)
  if (tipo === 'raf') return { lista: [{ inicio: fonte.u32(84, false), tamanho: fonte.u32(88, false) }], falta: null }
  return { lista: [], falta: null }
}

/**
 * Último recurso, só com o arquivo inteiro na memória e nenhuma prévia achada pela estrutura (formato que este leitor
 * não conhece): procura FF D8 FF, confere o cabeçalho e anda até o FF D9 que fecha.
 */
function varrer(fonte) {
  const b = fonte.partes[0].dados
  const n = b.length
  let melhor = null
  for (let i = 0; i + 4 < n; i++) {
    if (b[i] !== 0xff || b[i + 1] !== 0xd8 || b[i + 2] !== 0xff) continue
    const cab = cabecalhoJpeg(fonte, i, n)
    if (!decodificavel(cab)) continue
    const fim = fimDoJpeg(b, i + 2)
    if (fim < 0) continue
    if (fim - i >= MENOR_NA_VARREDURA && (!melhor || fim - i > melhor.tamanho))
      melhor = { inicio: i, tamanho: fim - i, largura: cab.largura, altura: cab.altura }
    i = fim - 1
  }
  return melhor
}

/** Posição logo depois do FF D9 do JPEG cujo primeiro segmento está em `p`, ou -1 (T.81 B.1.1: FF 00 e FF D0–D7 são dado). */
function fimDoJpeg(b, p) {
  const n = b.length
  while (p + 4 <= n) {
    if (b[p] !== 0xff) return -1
    const m = b[p + 1]
    if (m === 0xff) {
      p++
      continue
    }
    if (m === 0xd9) return p + 2
    p += 2 + ((b[p + 2] << 8) | b[p + 3])
    if (m !== 0xda) continue
    while (p + 1 < n && !(b[p] === 0xff && b[p + 1] !== 0x00 && !(b[p + 1] >= 0xd0 && b[p + 1] <= 0xd7))) p++
  }
  return -1
}

// ------------------------------------------------------------------------------------------------------- escolha

/** Tira o enchimento depois do FF D9 (o RW2 arredonda o tamanho declarado para blocos de 512 bytes). */
function aparar(jpeg) {
  const n = jpeg.length
  for (let i = n - 2, limite = Math.max(2, n - 65536); i >= limite; i--)
    if (jpeg[i] === 0xff && jpeg[i + 1] === 0xd9) return i + 2 === n ? jpeg : jpeg.subarray(0, i + 2)
  return jpeg
}

const area = (c) => (c.largura || 0) * (c.altura || 0)

/**
 * Confere cada candidata no que já está carregado e ordena da maior para a menor: { lista, falta }. `falta` é o
 * pedaço da ESTRUTURA (diretório, caixa) que ainda não foi lido; enquanto existir, a lista pode estar incompleta.
 */
function conferidas(fonte) {
  const lista = []
  const vistas = new Set()
  const achadas = candidatas(fonte)
  for (const c of achadas.lista) {
    const fim = c.inicio + c.tamanho
    if (!(c.inicio > 0) || fim > fonte.total || vistas.has(c.inicio)) continue
    vistas.add(c.inicio)
    let cab
    try {
      cab = cabecalhoJpeg(fonte, c.inicio, fim)
    } catch (erro) {
      if (!(erro instanceof Falta)) continue
      lista.push({ ...c, conferida: false }) // o cabeçalho ainda não foi lido: fica com as medidas que o diretório deu
      continue
    }
    if (decodificavel(cab)) lista.push({ inicio: c.inicio, tamanho: c.tamanho, largura: cab.largura, altura: cab.altura, conferida: true })
  }
  // maior primeiro: pela área quando as duas são conhecidas, senão pelo tamanho em bytes (é o que sempre se sabe)
  lista.sort((a, b) => (area(a) && area(b) ? area(b) - area(a) : 0) || b.tamanho - a.tamanho)
  return { lista, falta: achadas.falta }
}

/**
 * Todas as JPEG embutidas, da maior para a menor: [{ inicio, tamanho, largura?, altura?, conferida }]. `conferida`
 * é falso quando o cabeçalho do JPEG ainda não foi carregado (leitura parcial). Arquivo sem prévia devolve [].
 */
export function listarPrevias(bytes, opcoes) {
  try {
    return conferidas(criarFonte(bytes, opcoes)).lista
  } catch {
    return []
  }
}

/**
 * A MAIOR JPEG embutida decodificável: { jpeg, largura, altura }, ou null quando não há.
 *
 * `jpeg` é uma vista sobre `bytes` (sem cópia): copie se for guardar o resultado e soltar o arquivo.
 *
 * Leitura parcial: passe só o começo do arquivo e `total` (o tamanho inteiro). Se a prévia não coube no que foi
 * lido, volta `{ jpeg: null, precisa: { inicio, fim }, largura?, altura? }`: leia esse pedaço e chame de novo com
 * `trechos: [{ inicio, dados }]` (ou use `extrairPreviaDe`, que faz isso sozinho).
 *
 * `lado`: em vez da maior, a MENOR prévia cujo lado maior tem pelo menos esse tanto de pixels (a decupagem pede
 * 1024: decodificar 1620 px é bem mais rápido que 6000 px). Sem nenhuma desse tamanho, devolve a maior.
 */
export function extrairPrevia(bytes, { total, trechos, lado } = {}) {
  const fonte = criarFonte(bytes, { total, trechos })
  // falta um pedaço da ESTRUTURA: pede com folga, para não voltar aqui a cada diretório
  const pedir = (falta) => ({ jpeg: null, precisa: { inicio: falta.inicio, fim: Math.min(fonte.total, Math.max(falta.fim, falta.inicio + 65536)) } })
  try {
    const achadas = conferidas(fonte)
    const falta = achadas.falta
    let lista = achadas.lista
    if (lado > 0) {
      const servem = lista.filter((c) => Math.max(c.largura || 0, c.altura || 0) >= lado).reverse() // da menor para a maior
      // já tem na mão uma que serve: não precisa ler o resto do arquivo para saber se existe outra
      const pronta = servem.find((c) => c.conferida && fonte.tem(c.inicio, c.inicio + c.tamanho))
      if (pronta) return { jpeg: aparar(fonte.fatia(pronta.inicio, pronta.inicio + pronta.tamanho)), largura: pronta.largura, altura: pronta.altura }
      lista = [...servem, ...lista.filter((c) => !servem.includes(c))]
    }
    if (falta) return pedir(falta)
    for (const c of lista) {
      const fim = c.inicio + c.tamanho
      if (!fonte.tem(c.inicio, fim)) {
        return { jpeg: null, precisa: { inicio: c.inicio, fim }, ...(area(c) ? { largura: c.largura, altura: c.altura } : {}) }
      }
      // carregada por inteiro, a candidata já foi conferida (as que não eram JPEG decodificável saíram da lista)
      return { jpeg: aparar(fonte.fatia(c.inicio, fim)), largura: c.largura, altura: c.altura }
    }
    if (fonte.completa && reconhecer(fonte) !== 'jpeg') {
      const achada = varrer(fonte)
      if (achada) return { jpeg: fonte.fatia(achada.inicio, achada.inicio + achada.tamanho), largura: achada.largura, altura: achada.altura }
    }
    return null
  } catch (erro) {
    return erro instanceof Falta ? pedir(erro) : null
  }
}

/**
 * A prévia de um arquivo que ainda está no disco: `ler(inicio, fim) → Promise<Uint8Array>` (na tela,
 * `(a, b) => arquivo.slice(a, b).arrayBuffer().then((x) => new Uint8Array(x))`). Lê o começo (`cabeca` bytes) e só
 * busca mais se a prévia morar adiante. Devolve { jpeg, largura, altura, lidos } ou null.
 */
export async function extrairPreviaDe(ler, total, { cabeca = 512 * 1024, lado, voltas = 6 } = {}) {
  const inicio = await ler(0, Math.min(total, cabeca))
  const trechos = []
  let lidos = inicio.length
  for (let i = 0; i < voltas; i++) {
    const r = extrairPrevia(inicio, { total, trechos, lado })
    if (!r) return null
    if (r.jpeg) return { ...r, lidos }
    const dados = await ler(r.precisa.inicio, r.precisa.fim)
    if (!dados || dados.length < r.precisa.fim - r.precisa.inicio) return null
    trechos.push({ inicio: r.precisa.inicio, dados })
    lidos += dados.length
  }
  return null
}
