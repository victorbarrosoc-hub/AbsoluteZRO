// EXIF em JS puro, sem WASM: é o que a decupagem usa para ordenar, agrupar rajadas e mostrar a ficha da foto sem
// revelar nada. Vale para RAW de base TIFF (DNG, CR2, NEF, ARW, RW2, ORF, PEF…), CR3 (ISO BMFF), RAF, JPEG e TIFF.
//
// Este arquivo também guarda a leitura de estrutura que dng.js e previa.js reaproveitam: a Fonte (bytes com
// buracos, para ler só um pedaço de arquivos grandes), o diretório TIFF (IFD) e as caixas do CR3.
//
// Formatos (só fatos de especificação, nada de código de terceiros):
//   TIFF 6.0 (cabeçalho, IFD, tipos) · EXIF 2.32 / CIPA DC-008 (tags) · TIFF/EP ISO 12234-2 (as mesmas tags no IFD0)
//   ISO/IEC 14496-12 (caixas do CR3) · cabeçalho do RAF e marcas dos fabricantes conforme a tabela pública do ExifTool
//
// exif devolvido (contrato em negativo.js): só aparece o campo que o arquivo traz.
//   data         'AAAA-MM-DDTHH:MM:SS', hora local da câmera, sem fuso (DateTimeOriginal)
//   subsegundo   fração do segundo, 0 ≤ x < 1 (SubSecTimeOriginal '37' → 0,37): é o que separa quadros de uma rajada
//   iso, tempo (s), abertura (f/), focal (mm), lente (texto), orientacao (1..8; 1 quando o arquivo não diz)

const TAMANHO_DO_TIPO = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4, 0, 0, 8, 8, 8]

/** O pedaço pedido ainda não foi lido do arquivo (leitura parcial). Quem chamou decide se busca mais. */
export class Falta extends Error {
  constructor(inicio, fim) {
    super(`faltam os bytes ${inicio}–${fim} do arquivo`)
    this.name = 'Falta'
    this.inicio = inicio
    this.fim = fim
  }
}

/**
 * Bytes de um arquivo que pode estar só parcialmente na memória: o começo (`bytes`) e, se houver, outros trechos
 * (`{ inicio, dados }`). Ler fora do que foi carregado lança `Falta`; ler fora do arquivo lança RangeError.
 */
export class Fonte {
  constructor(bytes, { total, trechos = [] } = {}) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    this.partes = [{ inicio: 0, dados: u8 }, ...trechos.map((t) => ({ inicio: t.inicio, dados: t.dados }))].map((p) => ({
      inicio: p.inicio,
      fim: p.inicio + p.dados.length,
      dados: p.dados,
      vista: new DataView(p.dados.buffer, p.dados.byteOffset, p.dados.byteLength)
    }))
    this.total = Math.max(total ?? 0, ...this.partes.map((p) => p.fim))
    this.completa = u8.length >= this.total
    this.atual = this.partes[0]
  }

  parte(pos, n) {
    const a = this.atual
    if (pos >= a.inicio && pos + n <= a.fim) return a
    for (const p of this.partes) if (pos >= p.inicio && pos + n <= p.fim) return (this.atual = p)
    if (!(pos >= 0) || pos + n > this.total) throw new RangeError(`leitura fora do arquivo (${pos} + ${n} de ${this.total})`)
    throw new Falta(pos, pos + n)
  }

  tem(inicio, fim) {
    return this.partes.some((p) => inicio >= p.inicio && fim <= p.fim)
  }

  u8(pos) {
    const p = this.parte(pos, 1)
    return p.dados[pos - p.inicio]
  }

  u16(pos, le) {
    const p = this.parte(pos, 2)
    return p.vista.getUint16(pos - p.inicio, le)
  }

  u32(pos, le) {
    const p = this.parte(pos, 4)
    return p.vista.getUint32(pos - p.inicio, le)
  }

  i32(pos, le) {
    const p = this.parte(pos, 4)
    return p.vista.getInt32(pos - p.inicio, le)
  }

  f32(pos, le) {
    const p = this.parte(pos, 4)
    return p.vista.getFloat32(pos - p.inicio, le)
  }

  f64(pos, le) {
    const p = this.parte(pos, 8)
    return p.vista.getFloat64(pos - p.inicio, le)
  }

  /** Inteiro de 64 bits como número (os arquivos de foto ficam muito abaixo de 2^53). */
  u64(pos, le) {
    const a = this.u32(pos, le)
    const b = this.u32(pos + 4, le)
    return le ? b * 4294967296 + a : a * 4294967296 + b
  }

  /** Vista (sem cópia) do trecho [inicio, fim). */
  fatia(inicio, fim) {
    const p = this.parte(inicio, fim - inicio)
    return p.dados.subarray(inicio - p.inicio, fim - p.inicio)
  }

  /** Texto ASCII de `n` bytes (para na primeira marca de fim). */
  ascii(pos, n) {
    const b = this.fatia(pos, pos + n)
    let s = ''
    for (let i = 0; i < n && b[i] !== 0; i++) s += String.fromCharCode(b[i])
    return s
  }
}

export function criarFonte(bytes, opcoes) {
  return bytes instanceof Fonte ? bytes : new Fonte(bytes, opcoes)
}

/** Roda `f`; devolve `undefined` se o trecho for inválido ou não estiver carregado (campo opcional que não veio). */
function tentar(f) {
  try {
    return f()
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------------------------------- recipiente

/** 'tiff' | 'jpeg' | 'raf' | 'bmff' | null, pelos primeiros bytes. */
export function reconhecer(fonte) {
  if (fonte.total < 12) return null
  const a = fonte.u8(0)
  const b = fonte.u8(1)
  if (a === 0xff && b === 0xd8 && fonte.u8(2) === 0xff) return 'jpeg'
  if ((a === 0x49 && b === 0x49) || (a === 0x4d && b === 0x4d)) return abrirTiff(fonte, 0) ? 'tiff' : null
  if (fonte.ascii(0, 15) === 'FUJIFILMCCD-RAW') return 'raf'
  if (fonte.ascii(4, 4) === 'ftyp') return 'bmff'
  return null
}

// ---------------------------------------------------------------------------------------------------------- TIFF

// Números mágicos depois da ordem dos bytes: 42 é o TIFF; a Panasonic (RW2) usa 0x55 e a Olympus (ORF) 'RO' e 'RS'.
const MAGIAS = new Set([42, 0x55, 0x4f52, 0x5352])

/** Cabeçalho TIFF em `base` (0 no arquivo; outro valor para blocos TIFF embutidos). null se não for. */
export function abrirTiff(fonte, base = 0) {
  const ordem = fonte.u16(base, false)
  if (ordem !== 0x4949 && ordem !== 0x4d4d) return null
  const le = ordem === 0x4949
  const magia = fonte.u16(base + 2, le)
  if (!MAGIAS.has(magia)) return null
  return { fonte, base, le, magia, primeiro: fonte.u32(base + 4, le) }
}

/** Diretório em `deslocamento` (contado de `tiff.base`): { tags: Map(tag → entrada), proximo }. */
export function lerIfd(tiff, deslocamento) {
  const { fonte, base, le } = tiff
  const pos = base + deslocamento
  const n = fonte.u16(pos, le)
  if (n === 0 || n > 4000) throw new RangeError('diretório TIFF inválido')
  fonte.parte(pos, 2 + n * 12) // o diretório inteiro de uma vez: uma falta só, em vez de uma por entrada
  const tags = new Map()
  for (let i = 0; i < n; i++) {
    const e = pos + 2 + i * 12
    const tipo = fonte.u16(e + 2, le)
    const qtd = fonte.u32(e + 4, le)
    const tam = (TAMANHO_DO_TIPO[tipo] || 1) * qtd
    const entrada = { tag: fonte.u16(e, le), tipo, n: qtd, tam, onde: tam <= 4 ? e + 8 : base + fonte.u32(e + 8, le) }
    if (!tags.has(entrada.tag)) tags.set(entrada.tag, entrada)
  }
  let proximo = 0
  try {
    proximo = fonte.u32(pos + 2 + n * 12, le)
  } catch (erro) {
    if (erro instanceof Falta) throw erro
  }
  return { tags, proximo, pos }
}

/** Valores numéricos de uma entrada (racional vira divisão; denominador zero vira NaN). */
export function numeros(tiff, entrada, limite = 65536) {
  if (!entrada) return []
  const { fonte, le } = tiff
  const t = entrada.tipo
  const passo = TAMANHO_DO_TIPO[t] || 1
  const n = Math.min(entrada.n, limite)
  if (n > 1) fonte.parte(entrada.onde, n * passo)
  const v = new Array(n)
  for (let k = 0; k < n; k++) {
    const q = entrada.onde + k * passo
    if (t === 3) v[k] = fonte.u16(q, le)
    else if (t === 4 || t === 13) v[k] = fonte.u32(q, le)
    else if (t === 5) v[k] = fonte.u32(q, le) / fonte.u32(q + 4, le)
    else if (t === 10) v[k] = fonte.i32(q, le) / fonte.i32(q + 4, le)
    else if (t === 9) v[k] = fonte.i32(q, le)
    else if (t === 8) v[k] = (fonte.u16(q, le) << 16) >> 16
    else if (t === 6) v[k] = (fonte.u8(q) << 24) >> 24
    else if (t === 11) v[k] = fonte.f32(q, le)
    else if (t === 12) v[k] = fonte.f64(q, le)
    else if (t === 16 || t === 18) v[k] = fonte.u64(q, le)
    else v[k] = fonte.u8(q)
  }
  return v
}

export function numero(tiff, entrada, i = 0) {
  if (!entrada || i >= entrada.n) return undefined
  return numeros(tiff, { ...entrada, onde: entrada.onde + i * (TAMANHO_DO_TIPO[entrada.tipo] || 1), n: 1 }, 1)[0]
}

export function texto(tiff, entrada) {
  if (!entrada || entrada.n === 0) return ''
  return tiff.fonte.ascii(entrada.onde, Math.min(entrada.n, 1024)).trim()
}

// ------------------------------------------------------------------------------------------------- CR3 (ISO BMFF)

// Caixa `uuid` da Canon dentro de `moov` (CMT1..4 = blocos TIFF com IFD0, Exif, marcas do fabricante e GPS; THMB =
// miniatura) e a caixa `uuid` da prévia (PRVW). Identificadores públicos do formato CR3.
const UUID_CANON = '85c0b687820f11e08111f4ce462b6a48'
const UUID_PREVIA = 'eaf42b5e1c984b88b9fbb7dc406e4d16'

/** Caixas de [inicio, fim): { tipo, inicio (do conteúdo), fim, caixa (do cabeçalho) }. Para na primeira inválida. */
export function* caixas(fonte, inicio, fim) {
  let p = inicio
  while (p + 8 <= fim) {
    let tam = fonte.u32(p, false)
    const tipo = fonte.ascii(p + 4, 4)
    let cabecalho = 8
    if (tam === 1) {
      tam = fonte.u64(p + 8, false)
      cabecalho = 16
    } else if (tam === 0) tam = fim - p
    if (tam < cabecalho || p + tam > fim) return
    yield { tipo, inicio: p + cabecalho, fim: p + tam, caixa: p }
    p += tam
  }
}

const hex = (fonte, pos, n) => Array.from(fonte.fatia(pos, pos + n), (b) => b.toString(16).padStart(2, '0')).join('')

/**
 * O que interessa de um CR3: blocos TIFF de metadados, miniatura, prévia e as trilhas com a posição da amostra.
 * { cmt1?, cmt2?, cmt3?, thmb?, prvw?, trilhas: [{ jpeg, largura, altura, inicio, tamanho }], falta? } (posições no
 * arquivo). `falta` aparece na leitura parcial, quando as caixas depois de `moov` ainda não foram carregadas.
 */
export function lerCr3(fonte) {
  const e = { trilhas: [] }
  try {
    for (const c of caixas(fonte, 0, fonte.total)) {
      if (c.tipo === 'moov') {
        fonte.parte(c.inicio, c.fim - c.inicio) // tudo o que decide a leitura mora aqui: pede de uma vez
        for (const m of caixas(fonte, c.inicio, c.fim)) {
          if (m.tipo === 'uuid' && hex(fonte, m.inicio, 16) === UUID_CANON) {
            for (const x of caixas(fonte, m.inicio + 16, m.fim)) {
              if (x.tipo === 'CMT1') e.cmt1 = x
              else if (x.tipo === 'CMT2') e.cmt2 = x
              else if (x.tipo === 'CMT3') e.cmt3 = x
              else if (x.tipo === 'THMB') e.thmb = x
            }
          } else if (m.tipo === 'trak') {
            const t = tentar(() => trilha(fonte, m))
            if (t) e.trilhas.push(t)
          }
        }
        e.moov = true
      } else if (c.tipo === 'uuid' && c.fim - c.inicio > 24 && hex(fonte, c.inicio, 16) === UUID_PREVIA) {
        // uuid → 8 bytes (versão e contagem) → caixa PRVW
        for (const x of caixas(fonte, c.inicio + 24, c.fim)) if (x.tipo === 'PRVW') e.prvw = x
      } else if (c.tipo === 'mdat') break
    }
  } catch (erro) {
    // com os metadados já lidos, o que falta é só a prévia: quem precisa dela olha `falta`
    if (!(erro instanceof Falta) || !e.moov) throw erro
    e.falta = erro
  }
  return e
}

function trilha(fonte, trak) {
  const filha = (pai, tipo) => {
    for (const c of caixas(fonte, pai.inicio, pai.fim)) if (c.tipo === tipo) return c
    throw new RangeError(`CR3 sem a caixa ${tipo}`)
  }
  const stbl = filha(filha(filha(trak, 'mdia'), 'minf'), 'stbl')
  const stsd = filha(stbl, 'stsd')
  const t = { jpeg: false, largura: 0, altura: 0, inicio: 0, tamanho: 0 }
  // stsd: versão (4) + contagem (4) + entrada de vídeo (ISO 14496-12 §12.1.3): largura e altura a 32 bytes da entrada
  const entrada = stsd.inicio + 8
  t.largura = fonte.u16(entrada + 32, false)
  t.altura = fonte.u16(entrada + 34, false)
  // as caixas filhas vêm depois dos 86 bytes da entrada; a Canon põe mais 4 bytes antes delas
  for (const salto of [90, 86]) for (const c of caixas(fonte, entrada + salto, stsd.fim)) if (c.tipo === 'JPEG') t.jpeg = true
  const stsz = filha(stbl, 'stsz')
  t.tamanho = fonte.u32(stsz.inicio + 4, false) || fonte.u32(stsz.inicio + 12, false)
  const co64 = tentar(() => filha(stbl, 'co64'))
  t.inicio = co64 ? fonte.u64(co64.inicio + 8, false) : fonte.u32(filha(stbl, 'stco').inicio + 8, false)
  return t
}

// ---------------------------------------------------------------------------------------------------------- JPEG

/** Posição do bloco TIFF do EXIF (APP1 'Exif\0\0') num JPEG que começa em `inicio`, ou -1. */
export function exifDoJpeg(fonte, inicio = 0, limite = fonte.total) {
  let p = inicio + 2
  while (p + 4 <= limite) {
    if (fonte.u8(p) !== 0xff) return -1
    const m = fonte.u8(p + 1)
    if (m === 0xff) {
      p++
      continue
    }
    if (m === 0xda || m === 0xd9) return -1
    const tam = fonte.u16(p + 2, false)
    if (m === 0xe1 && tam >= 16 && fonte.ascii(p + 4, 4) === 'Exif') return p + 10
    p += 2 + tam
  }
  return -1
}

// ---------------------------------------------------------------------------------------------------------- EXIF

const finito = (v) => typeof v === 'number' && Number.isFinite(v)

function dataDe(s) {
  const m = /^(\d{4})[:-](\d\d)[:-](\d\d)[ T](\d\d):(\d\d):(\d\d)/.exec(s || '')
  if (!m || m[1] === '0000' || m[2] === '00') return undefined
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`
}

const curto = (v) => String(Math.round(v * 10) / 10)

/** Texto de lente a partir de [focal mínima, focal máxima, abertura na mínima, abertura na máxima]. */
function lenteDe(v) {
  if (!v || v.length < 2 || !(v[0] > 0)) return undefined
  const [f1, f2, a1, a2] = v
  let s = f2 > f1 ? `${curto(f1)}-${curto(f2)}mm` : `${curto(f1)}mm`
  if (a1 > 0) s += a2 > a1 ? ` f/${curto(a1)}-${curto(a2)}` : ` f/${curto(a1)}`
  return s
}

/** Tags de exposição: moram no IFD Exif e, em TIFF/EP (NEF, DNG antigo), também no IFD0. Só preenche o que falta. */
function exposicao(tiff, tags, exif, bruto) {
  const num = (tag, i) => tentar(() => numero(tiff, tags.get(tag), i))
  const txt = (tag) => tentar(() => texto(tiff, tags.get(tag)))
  bruto.original ??= dataDe(txt(0x9003))
  bruto.digitalizada ??= dataDe(txt(0x9004))
  bruto.subOriginal ??= txt(0x9291) || undefined
  bruto.sub ??= txt(0x9290) || undefined
  if (exif.tempo === undefined) {
    const t = num(0x829a)
    const apex = num(0x9201)
    if (t > 0 && finito(t)) exif.tempo = t
    else if (finito(apex) && tags.has(0x9201)) exif.tempo = 2 ** -apex // APEX: Tv = −log2(t) (EXIF 2.32, anexo C)
  }
  if (exif.abertura === undefined) {
    const f = num(0x829d)
    const apex = num(0x9202)
    if (f > 0 && finito(f)) exif.abertura = f
    else if (apex > 0 && finito(apex)) exif.abertura = Math.SQRT2 ** apex // APEX: Av = 2·log2(N)
  }
  if (exif.iso === undefined) {
    // 65535 no campo curto significa "não coube": o valor real fica em ISOSpeed ou RecommendedExposureIndex
    const candidatos = [num(0x8827), num(0x8833), num(0x8832), num(0x8831)]
    const iso = candidatos.find((v) => v > 0 && v !== 65535 && finito(v))
    if (iso) exif.iso = iso
  }
  if (exif.focal === undefined) {
    const f = num(0x920a)
    if (f > 0 && finito(f)) exif.focal = f
  }
  if (exif.lente === undefined) {
    const nome = txt(0xa434)
    if (nome && /[a-z0-9]/i.test(nome)) exif.lente = nome // a Sony grava '----' quando não reconhece a lente
    else bruto.especificacao ??= tentar(() => numeros(tiff, tags.get(0xa432), 4))
  }
}

/** Marcas do fabricante: só o que falta no EXIF comum (nome da lente na Canon, ISO e lente na Nikon). */
function fabricante(tiff, entrada, exif, bruto) {
  const { fonte } = tiff
  const cabeca = fonte.ascii(entrada.onde, 8)
  if (cabeca.startsWith('Nikon')) {
    // 'Nikon\0' + versão (4 bytes) + bloco TIFF próprio: as posições contam a partir dele
    const mn = abrirTiff(fonte, entrada.onde + 10)
    if (!mn) return
    const { tags } = lerIfd(mn, mn.primeiro)
    if (exif.iso === undefined) {
      const iso = tentar(() => numero(mn, tags.get(0x0002), 1))
      if (iso > 0) exif.iso = iso
    }
    bruto.especificacao ??= tentar(() => numeros(mn, tags.get(0x0084), 4))
    return
  }
  if (/^canon/i.test(bruto.fabricante || '')) {
    // Canon: diretório puro, com posições contadas do bloco TIFF que o contém
    const { tags } = lerIfd(tiff, entrada.onde - tiff.base)
    const nome = tentar(() => texto(tiff, tags.get(0x0095)))
    if (nome && exif.lente === undefined) exif.lente = nome
  }
}

function deTiff(tiff, saida, { ifd0 = tiff.primeiro } = {}) {
  const { exif, bruto } = saida
  const d0 = tentar(() => lerIfd(tiff, ifd0))
  if (!d0) return
  const tags = d0.tags
  bruto.fabricante ??= tentar(() => texto(tiff, tags.get(0x010f))) || undefined
  bruto.modelo ??= tentar(() => texto(tiff, tags.get(0x0110)) || texto(tiff, tags.get(0xc614))) || undefined
  const o = tentar(() => numero(tiff, tags.get(0x0112)))
  if (o >= 1 && o <= 8 && exif.orientacao === undefined) exif.orientacao = o
  bruto.modificada ??= dataDe(tentar(() => texto(tiff, tags.get(0x0132))))
  const exifIfd = tentar(() => numero(tiff, tags.get(0x8769)))
  if (exifIfd) deExif(tiff, exifIfd, saida)
  exposicao(tiff, tags, exif, bruto)
  if (exif.iso === undefined && tiff.magia === 0x55) {
    const iso = tentar(() => numero(tiff, tags.get(0x0017))) // RW2 guarda o ISO no IFD0
    if (iso > 0) exif.iso = iso
  }
  bruto.especificacao ??= tentar(() => (tags.has(0xc630) ? numeros(tiff, tags.get(0xc630), 4) : undefined)) // LensInfo do DNG
}

function deExif(tiff, deslocamento, saida) {
  const d = tentar(() => lerIfd(tiff, deslocamento))
  if (!d) return
  exposicao(tiff, d.tags, saida.exif, saida.bruto)
  const mn = d.tags.get(0x927c)
  if (mn && mn.n > 12) tentar(() => fabricante(tiff, mn, saida.exif, saida.bruto))
}

function deJpeg(fonte, inicio, saida) {
  const pos = tentar(() => exifDoJpeg(fonte, inicio))
  if (!(pos > 0)) return
  const tiff = tentar(() => abrirTiff(fonte, pos))
  if (tiff) deTiff(tiff, saida)
}

function deCr3(fonte, saida) {
  const e = tentar(() => lerCr3(fonte))
  if (!e) return
  const bloco = (c) => (c ? tentar(() => abrirTiff(fonte, c.inicio)) : null)
  const t1 = bloco(e.cmt1)
  if (t1) deTiff(t1, saida)
  const t2 = bloco(e.cmt2)
  if (t2) deExif(t2, t2.primeiro, saida)
  const t3 = bloco(e.cmt3)
  if (t3 && saida.exif.lente === undefined) {
    const nome = tentar(() => texto(t3, lerIfd(t3, t3.primeiro).tags.get(0x0095)))
    if (nome) saida.exif.lente = nome
  }
}

function ler(bytes, opcoes) {
  const saida = { exif: {}, bruto: {} }
  const fonte = criarFonte(bytes, opcoes)
  const tipo = tentar(() => reconhecer(fonte))
  if (tipo === 'tiff') {
    deTiff(abrirTiff(fonte, 0), saida)
    // RW2 de câmera recente deixa quase tudo no JPEG embutido (JpgFromRaw, tag 0x2E): completa por ele
    if (saida.exif.tempo === undefined || saida.bruto.original === undefined) {
      tentar(() => {
        const t = abrirTiff(fonte, 0)
        const jpg = lerIfd(t, t.primeiro).tags.get(0x002e)
        if (jpg) deJpeg(fonte, jpg.onde, saida)
      })
    }
  } else if (tipo === 'jpeg') deJpeg(fonte, 0, saida)
  else if (tipo === 'raf') {
    // RAF: 'FUJIFILMCCD-RAW ' + versão + modelo; a posição do JPEG embutido (que leva o EXIF) fica em 84, big-endian
    saida.bruto.fabricante = 'FUJIFILM'
    saida.bruto.modelo = tentar(() => fonte.ascii(28, 32).trim()) || undefined
    const jpeg = tentar(() => fonte.u32(84, false))
    if (jpeg) deJpeg(fonte, jpeg, saida)
  } else if (tipo === 'bmff') deCr3(fonte, saida)

  const { exif, bruto } = saida
  const data = bruto.original || bruto.digitalizada || bruto.modificada
  if (data) exif.data = data
  const sub = bruto.original ? bruto.subOriginal : bruto.sub
  if (data && sub && /^\d+$/.test(sub.trim())) exif.subsegundo = Number(`0.${sub.trim()}`)
  if (exif.lente === undefined) {
    const lente = lenteDe(bruto.especificacao)
    if (lente) exif.lente = lente
  }
  exif.orientacao ??= 1
  return saida
}

/**
 * EXIF do contrato a partir dos bytes do arquivo (ou só do começo dele: o que não estiver carregado fica de fora).
 * Nunca lança: arquivo estranho devolve `{ orientacao: 1 }`.
 */
export function lerExif(bytes, opcoes) {
  return ler(bytes, opcoes).exif
}

/** { fabricante, modelo } como o arquivo escreve ('' quando não há). */
export function lerCamera(bytes, opcoes) {
  const { bruto } = ler(bytes, opcoes)
  return { fabricante: bruto.fabricante || '', modelo: bruto.modelo || '' }
}
