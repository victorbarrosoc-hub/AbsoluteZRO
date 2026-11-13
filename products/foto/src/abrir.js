// A porta única para abrir uma foto: as telas e os workers chamam daqui, e nunca os leitores direto. Junta o que está
// espalhado em src/raw e src/motor na ordem certa e devolve o que a tela precisa, com avisos curtos em português.
//
//   abrirFoto(bytes, { nome, leitor, demosaico = 'rapido', reduzir = 1 })
//     → Promise<{ base, latitude, exif, camera, previa, avisos: [texto], origem: 'raw' | 'imagem' }>
//   abrirImagem({ largura, altura, dados, canais, espaco, exif }) → o mesmo formato, para foto já decodificada pela tela
//
// RAW, nesta ordem:
//   1. ler: DNG pelo leitor próprio (dng.js; sem WASM), o resto pelo LibRaw (`leitor` = criarLeitor(LibRaw), injetado);
//      Sony "sem perdas" M e S e DNG LinearRaw chegam já sem mosaico (cfa 'linear')
//   2. opcodes do DNG que são ganho (GainMap, FixVignetteRadial) aplicados no mosaico, com o preto já tirado
//   3. o zero da exposição (BaselineExposure + a referência de base.js + o número do fabricante, fora do DNG) no
//      negativo; a Latitude medida no dado parte dele e vai ao prepararBase (preto, saturação, modelo de ruído)
//   4. base: demosaico próprio; X-Trans em 'qualidade' usa o Markesteijn do LibRaw (revelarLinear) e segue pelo mesmo
//      caminho de imagem sem mosaico (altas luzes, matriz)
//   5. DefaultCrop do arquivo; a orientação fica em base.orientacao (revelar.js gira)
//   6. conferência: imagem toda preta ou toda branca depois de abrir é ErroRaw, nunca uma foto vazia na tela
//
// JPEG comum entra pelo decodificador próprio (src/raw/jpeg.js) com o espaço de cor do perfil ICC embutido. PNG, HEIC,
// WebP e JPEG progressivo: a tela decodifica (createImageBitmap) e chama abrirImagem; abrirFoto recusa com
// `erro.decodificarNaTela = true`.

import { ErroRaw } from './raw/erro.js'
import { lerDng } from './raw/dng.js'
import { decodificarJpeg } from './raw/jpeg.js'
import { lerExif, lerCamera } from './raw/exif.js'
import { extrairPrevia } from './raw/previa.js'
import { medirLatitude } from './raw/latitude.js'
import { aplicarOpcodes, funcaoDoMapa } from './raw/opcodes.js'
import { criarNegativo, pretoEm } from './raw/negativo.js'
import { prepararBase, baseDeImagem, exposicaoDaCamera } from './motor/base.js'
import { luminancia } from './motor/cor/espacos.js'

export { ErroRaw }

const comoBytes = (b) => (b instanceof Uint8Array ? b : new Uint8Array(b))

// ─────────── o que é o arquivo ───────────

function tipoDoArquivo(u8) {
  if (u8.length < 12) return null
  if (u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return 'jpeg'
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return 'png'
  if (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 && u8[8] === 0x57 && u8[9] === 0x45) return 'webp'
  if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) return 'gif'
  const ftyp = String.fromCharCode(u8[4], u8[5], u8[6], u8[7])
  const marca = String.fromCharCode(u8[8], u8[9], u8[10], u8[11])
  if (ftyp === 'ftyp' && /^(heic|heix|hevc|mif1|msf1|avif)$/.test(marca)) return 'heif'
  return 'raw'
}

// DNG: o TIFF com DNGVersion (0xC612) no IFD0. Só olha o primeiro diretório.
function ehDng(u8) {
  const le = u8[0] === 0x49 && u8[1] === 0x49
  if (!(le || (u8[0] === 0x4d && u8[1] === 0x4d))) return false
  const u16 = (p) => (le ? u8[p] | (u8[p + 1] << 8) : (u8[p] << 8) | u8[p + 1])
  const u32 = (p) => (le ? (u8[p] | (u8[p + 1] << 8) | (u8[p + 2] << 16) | (u8[p + 3] << 24)) >>> 0 : ((u8[p] << 24) | (u8[p + 1] << 16) | (u8[p + 2] << 8) | u8[p + 3]) >>> 0)
  if (u16(2) !== 42) return false
  const ifd = u32(4)
  if (ifd + 2 > u8.length) return false
  const n = u16(ifd)
  for (let i = 0; i < n && ifd + 2 + i * 12 + 2 <= u8.length; i++) if (u16(ifd + 2 + i * 12) === 0xc612) return true
  return false
}

// Espaço de cor de um JPEG pelo perfil ICC embutido (APP2 "ICC_PROFILE"): a descrição do perfil diz qual é. Sem perfil,
// sRGB (é o que a especificação do EXIF manda supor). Só os três que o motor conhece; o resto vira sRGB com aviso.
function espacoDoJpeg(u8) {
  let p = 2
  let perfil = ''
  while (p + 4 < u8.length && u8[p] === 0xff) {
    const m = u8[p + 1]
    if (m === 0xda || m === 0xd9) break
    const tam = (u8[p + 2] << 8) | u8[p + 3]
    if (m === 0xe2 && tam > 16 && String.fromCharCode(...u8.subarray(p + 4, p + 15)) === 'ICC_PROFILE') {
      // basta o texto: a descrição ('desc' ou 'mluc') mora no primeiro pedaço; procura os nomes conhecidos
      const pedaco = u8.subarray(p + 18, Math.min(u8.length, p + 2 + tam))
      let s = ''
      for (let i = 0; i < pedaco.length; i++) {
        const c = pedaco[i]
        if (c >= 32 && c < 127) s += String.fromCharCode(c)
      }
      perfil += s
    }
    p += 2 + tam
  }
  if (!perfil) return { espaco: 'srgb', perfil: null }
  if (/Display P3|DCI-?P3|P3 D65/i.test(perfil)) return { espaco: 'p3', perfil: 'Display P3' }
  if (/Adobe RGB|AdobeRGB|Compatible with Adobe RGB/i.test(perfil)) return { espaco: 'adobe', perfil: 'Adobe RGB' }
  if (/sRGB|IEC ?61966/i.test(perfil)) return { espaco: 'srgb', perfil: 'sRGB' }
  return { espaco: 'srgb', perfil: 'desconhecido' }
}

// ─────────── opcodes ───────────

const NOME_DO_OPCODE = {
  WarpRectilinear: 'distorção da lente',
  WarpRectilinear2: 'distorção da lente',
  WarpFisheye: 'distorção da lente',
  FixBadPixelsConstant: 'pixels defeituosos',
  FixBadPixelsList: 'pixels defeituosos',
  GainMap: 'mapa de ganho',
  FixVignetteRadial: 'vinheta',
}

// GainMap e FixVignetteRadial no mosaico, com o preto tirado (DNG 1.4, cap. 7: a lista 2 entra no mosaico já
// linearizado; a vinheta radial só depende da posição, então vale igual no mosaico mesmo vindo na lista 3). A lista 1
// (dado cru) também é aplicada aqui: os dois opcodes são ganho, e ganho sobre o dado sem o preto é a mesma conta.
// O resultado volta para o Uint16 do Negativo (arredondado: o ruído é de vários DN).
function aplicarOpcodesNoNegativo(n) {
  const listas = n.opcodes || {}
  const lista = [...(listas.lista1 || []), ...(listas.lista2 || []), ...(listas.lista3 || [])]
  if (!lista.length) return { aplicados: [], naoAplicados: [] }
  if (n.cfa.tipo === 'linear') return aplicarMapasNoLinear(n, lista)
  const { largura, altura, dados } = n.sensor
  const area = n.area
  const mos = new Float32Array(largura * altura)
  // preto por sensel só na área ativa (fora dela os opcodes não mexem)
  const pretos = new Float32Array(largura * altura)
  for (let y = area.y; y < area.y + area.altura; y++) {
    for (let x = area.x; x < area.x + area.largura; x++) {
      const i = y * largura + x
      const p = pretoEm(n, y, x)
      pretos[i] = p
      mos[i] = dados[i] - p
    }
  }
  const r = aplicarOpcodes(mos, { largura, altura, area }, lista, { destino: mos })
  if (r.aplicados.length) {
    for (let y = area.y; y < area.y + area.altura; y++) {
      for (let x = area.x; x < area.x + area.largura; x++) {
        const i = y * largura + x
        const v = Math.round(mos[i] + pretos[i])
        dados[i] = v < 0 ? 0 : v > 65535 ? 65535 : v
      }
    }
  }
  return r
}

// Imagem sem mosaico: o MapPolynomial da lista 2 (o "DNG com perdas" guarda 8 bits e manda a curva que os devolve ao
// linear, um mapa por plano). A conta vale sobre o valor normalizado (preto → 0, branco → 1), como a lista 2 pede; o
// resultado volta em 16 bits lineares (preto 0, branco 65535). Mapa que não cobre a imagem inteira, com passo, fica de
// fora e é avisado.
function aplicarMapasNoLinear(n, lista) {
  const { area } = n
  const inteiro = (op) =>
    op.id === 8 && op.aplicavel && op.passoLinha === 1 && op.passoColuna === 1 && op.area.topo <= 0 && op.area.esquerda <= 0 &&
    op.area.base >= area.altura && op.area.direita >= area.largura
  const mapas = lista.filter(inteiro)
  const naoAplicados = lista.filter((op) => !inteiro(op)).map((op) => ({ nome: op.nome, motivo: 'imagem sem mosaico', opcional: op.opcional }))
  if (!mapas.length) return { aplicados: [], naoAplicados }
  const preto = n.preto.porCanal
  const branco = n.branco.declarado
  const dados = n.sensor.dados
  let maior = 0
  for (let i = 0; i < dados.length; i++) if (dados[i] > maior) maior = dados[i]
  const luts = [0, 1, 2].map((c) => {
    const f = mapas.filter((op) => c >= op.plano && c < op.plano + op.planos).map(funcaoDoMapa)
    const lut = new Uint16Array(maior + 1)
    for (let v = 0; v <= maior; v++) {
      let x = (v - preto[c]) / (branco[c] - preto[c])
      x = x < 0 ? 0 : x > 1 ? 1 : x
      for (const g of f) x = g(x)
      lut[v] = Math.round(x * 65535)
    }
    return lut
  })
  for (let i = 0; i < dados.length; i += 3) {
    dados[i] = luts[0][dados[i]]
    dados[i + 1] = luts[1][dados[i + 1]]
    dados[i + 2] = luts[2][dados[i + 2]]
  }
  n.preto = { porCanal: [0, 0, 0] }
  n.branco = { ...n.branco, declarado: [65535, 65535, 65535] }
  return { aplicados: mapas.map((op) => op.nome), naoAplicados }
}

// ─────────── X-Trans pelo LibRaw ───────────

// O demosaico do LibRaw (Markesteijn no X-Trans) devolve RGB de câmera, linear, sem branco, com 1,0 = (máximo − preto)
// do LibRaw e já girado. Vira um Negativo sem mosaico na mesma escala de DN do original, e segue pelo motor como
// qualquer imagem sem mosaico: a Latitude medida no mosaico continua valendo (mesmo preto, mesma saturação).
function negativoDoDemosaico(n, r) {
  const preto = n.preto.porCanal
  const escala = [0, 1, 2].map((c) => r.maximo - preto[c])
  const dados = new Uint16Array(r.largura * r.altura * 3)
  const d = r.dados
  for (let i = 0; i < d.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      const v = Math.round(preto[c] + d[i + c] * escala[c])
      dados[i + c] = v < 0 ? 0 : v > 65535 ? 65535 : v
    }
  }
  return criarNegativo({
    ...n,
    sensor: { largura: r.largura, altura: r.altura, amostras: 3, dados },
    area: { x: 0, y: 0, largura: r.largura, altura: r.altura },
    cfa: { tipo: 'linear' },
    preto: { porCanal: preto.slice() },
    exif: { ...n.exif, orientacao: 1 }, // o LibRaw já girou
    recorte: undefined,
    opcodes: undefined,
  })
}

// ─────────── recorte e conferência ───────────

// DefaultCrop do arquivo (conta do canto da área ativa), na escala da redução.
function recortar(base, recorte, reduzir) {
  if (!recorte) return false
  const { largura, altura, dados } = base.imagem
  const x0 = Math.floor(recorte.x / reduzir)
  const y0 = Math.floor(recorte.y / reduzir)
  const l = Math.min(largura - x0, Math.floor(recorte.largura / reduzir))
  const a = Math.min(altura - y0, Math.floor(recorte.altura / reduzir))
  if (!(l > 0 && a > 0) || (l === largura && a === altura)) return false
  const saida = new Float32Array(l * a * 3)
  for (let y = 0; y < a; y++) saida.set(dados.subarray(((y0 + y) * largura + x0) * 3, ((y0 + y) * largura + x0 + l) * 3), y * l * 3)
  base.imagem = { largura: l, altura: a, dados: saida }
  return true
}

/**
 * Falha nunca é silenciosa: uma imagem que abriu toda preta, toda branca ou com número inválido é erro de leitura (formato
 * entendido errado, arquivo corrompido), não foto. Mede a luminância numa amostra de até ~64 mil pixels.
 */
export function conferirBase(base, { nome } = {}) {
  const { dados, largura, altura } = base.imagem
  const [kr, kg, kb] = luminancia('rec2020')
  const n = largura * altura
  const passo = Math.max(1, Math.floor(n / 65536))
  const valores = []
  for (let p = 0; p < n; p += passo) {
    const i = p * 3
    const y = kr * dados[i] + kg * dados[i + 1] + kb * dados[i + 2]
    if (!Number.isFinite(y)) throw new ErroRaw('corrompido', `${nome ? `${nome}: ` : ''}a leitura produziu números inválidos.`)
    valores.push(y)
  }
  valores.sort((a, b) => a - b)
  const em = (q) => valores[Math.min(valores.length - 1, Math.floor(q * valores.length))]
  const p999 = em(0.999)
  const p01 = em(0.01)
  const quem = nome ? `${nome}: ` : ''
  if (!(p999 > 1e-4)) throw new ErroRaw('corrompido', `${quem}a imagem saiu toda preta ao abrir. O arquivo pode estar corrompido ou num formato que o leitor entende errado.`)
  // toda branca: até a parte mais escura está acima da saturação (nada de cena, só teto)
  if (p01 > 0.95 && em(0.5) - p01 < 0.02 * em(0.5)) throw new ErroRaw('corrompido', `${quem}a imagem saiu toda branca ao abrir. O arquivo pode estar corrompido.`)
  return { p01, p50: em(0.5), p999 }
}

// ─────────── avisos ───────────

const juntar = (lista) => [...new Set(lista)].join(', ')

function avisosDoNegativo(n, opcodes, extra) {
  const avisos = []
  if (n.cor?.generica) avisos.push('Câmera ainda sem perfil de cor no leitor: cores aproximadas.')
  const faltam = opcodes.naoAplicados.filter((o) => !o.opcional || /Warp/.test(o.nome))
  if (faltam.length) avisos.push(`Correção do arquivo ainda não aplicada: ${juntar(faltam.map((o) => NOME_DO_OPCODE[o.nome] || o.nome))}.`)
  avisos.push(...extra)
  return avisos
}

// ─────────── as portas ───────────

/**
 * Abre um arquivo de foto. `bytes`: Uint8Array ou ArrayBuffer do arquivo inteiro. `leitor`: o de criarLeitor(LibRaw)
 * (src/raw/libraw.js); sem ele só abrem DNG e JPEG. `demosaico`: 'rapido' | 'qualidade'. `reduzir`: 1, 2 ou 4.
 * Lança ErroRaw (`codigo`: 'nao-e-raw' | 'sem-suporte' | 'corrompido') com a mensagem pronta para a tela.
 */
export async function abrirFoto(bytes, { nome, leitor, demosaico = 'rapido', reduzir = 1 } = {}) {
  if (![1, 2, 4].includes(reduzir)) throw new Error('abrirFoto: reduzir precisa ser 1, 2 ou 4')
  if (demosaico !== 'rapido' && demosaico !== 'qualidade') throw new Error("abrirFoto: demosaico precisa ser 'rapido' ou 'qualidade'")
  const u8 = comoBytes(bytes)
  const tipo = tipoDoArquivo(u8)
  if (!tipo) throw new ErroRaw('corrompido', `${nome ? `${nome}: ` : ''}arquivo vazio ou curto demais.`)
  if (tipo === 'jpeg') return abrirJpeg(u8, { nome, reduzir })
  if (tipo !== 'raw') {
    const e = new ErroRaw('nao-e-raw', `${nome ? `${nome}: ` : ''}imagem ${tipo.toUpperCase()}: abre como foto pronta.`)
    e.decodificarNaTela = true
    throw e
  }

  // 1. ler
  let n
  const dng = ehDng(u8)
  if (dng) {
    try {
      n = lerDng(u8, { nome })
    } catch (erro) {
      // o leitor próprio não cobre (Deflate, mosaico com perdas…): o LibRaw tenta, e o motivo mais claro fica
      if (!(erro instanceof ErroRaw) || erro.codigo !== 'sem-suporte' || !leitor) throw erro
      try {
        n = await leitor.ler(u8, { nome, matrizGenerica: true })
      } catch {
        throw erro
      }
    }
  } else {
    if (!leitor) throw new ErroRaw('sem-suporte', `${nome ? `${nome}: ` : ''}o leitor de RAW não carregou. Sem ele, só DNG e JPEG abrem.`)
    n = await leitor.ler(u8, { nome, matrizGenerica: true })
  }

  // 2. opcodes (ganho no mosaico)
  const opcodes = aplicarOpcodesNoNegativo(n)

  // 3. o zero da exposição (onde a câmera pôs o cinza medido; ver base.js) e a Latitude, que conta as margens a
  // partir dele: a base e o branco da tela partem do mesmo cinza
  n.exposicaoBase = exposicaoDaCamera(n, { dng })
  const latitude = medirLatitude(n)

  // 4. base
  const extra = []
  let base
  let recorte = n.recorte
  if (n.cfa.tipo === 'xtrans' && demosaico === 'qualidade' && leitor) {
    // o Markesteijn do LibRaw; com redução, a metade da resolução sem interpolar (half_size) e o resto agrupado
    const metade = reduzir > 1
    const r = await leitor.revelarLinear(u8, { nome, qualidade: 'alta', metade })
    const lin = negativoDoDemosaico(n, r)
    base = prepararBase(lin, { reduzir: metade ? reduzir / 2 : 1, latitude })
    base.orientacao = 1
    base.demosaico = 'qualidade'
    recorte = null
  } else {
    base = prepararBase(n, { demosaico, reduzir, latitude })
    if (n.cfa.tipo === 'xtrans' && reduzir === 1) extra.push('X-Trans: prévia com demosaico simples; a exportação usa o completo.')
  }

  // 5. recorte do arquivo
  recortar(base, recorte, reduzir)

  // 6. conferência
  conferirBase(base, { nome })

  let previa = n.previa || null
  if (!previa) {
    const p = extrairPrevia(u8)
    if (p && p.jpeg) previa = { jpeg: p.jpeg, largura: p.largura, altura: p.altura }
  }
  return {
    base,
    latitude,
    exif: n.exif || {},
    camera: { fabricante: n.fabricante || '', modelo: n.modelo || '' },
    previa,
    avisos: avisosDoNegativo(n, opcodes, extra),
    origem: 'raw',
  }
}

function abrirJpeg(u8, { nome, reduzir }) {
  let img
  try {
    img = decodificarJpeg(u8)
  } catch (erro) {
    // JPEG progressivo e afins: o navegador abre; a tela decodifica e chama abrirImagem
    if (erro instanceof ErroRaw && erro.codigo === 'sem-suporte') erro.decodificarNaTela = true
    throw erro
  }
  const exif = lerExif(u8)
  const cor = espacoDoJpeg(u8)
  const camera = lerCamera(u8)
  let { largura, altura, dados } = img
  let canais = 3
  if (img.canais === 1) {
    const rgb = new Uint8Array(largura * altura * 3)
    for (let i = 0; i < largura * altura; i++) rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = dados[i]
    dados = rgb
  }
  if (reduzir > 1) {
    const r = reduzirBytes(dados, largura, altura, canais, reduzir)
    ;({ largura, altura, dados } = r)
    canais = 3
  }
  const aberta = abrirImagem({ largura, altura, dados, canais, espaco: cor.espaco, exif })
  // a base saiu de bytes já reduzidos: baseDeImagem não sabe disso e diria reduzir 1. A escala da vizinhança (clareza,
  // neblina, grão em local.js) é medida na foto cheia, então a base precisa contar a redução de verdade
  aberta.base.reduzir = reduzir
  if (cor.perfil === 'desconhecido') aberta.avisos.push('Perfil de cor do JPEG desconhecido: aberto como sRGB.')
  if (/\.(dng|arw|cr[23w]|nef|nrw|raf|rw2|orf|pef|srw|3fr|iiq|x3f)$/i.test(nome || '')) aberta.avisos.push('Arquivo com nome de RAW que é um JPEG: aberto como foto pronta.')
  aberta.camera = camera
  conferirBase(aberta.base, { nome })
  return aberta
}

// Média de blocos em bytes (só para a prévia de um JPEG grande): rápida e sem passar pela luz linear — a diferença
// para a média em luz linear é pequena na escala de uma prévia.
function reduzirBytes(dados, largura, altura, canais, fator) {
  const l = Math.floor(largura / fator)
  const a = Math.floor(altura / fator)
  const saida = new Uint8Array(l * a * 3)
  const k = 1 / (fator * fator)
  for (let y = 0; y < a; y++) {
    for (let x = 0; x < l; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let j = 0; j < fator; j++) {
        let i = ((y * fator + j) * largura + x * fator) * canais
        for (let q = 0; q < fator; q++, i += canais) {
          r += dados[i]
          g += dados[i + 1]
          b += dados[i + 2]
        }
      }
      const o = (y * l + x) * 3
      saida[o] = Math.round(r * k)
      saida[o + 1] = Math.round(g * k)
      saida[o + 2] = Math.round(b * k)
    }
  }
  return { largura: l, altura: a, dados: saida }
}

/**
 * Foto que já chega decodificada (a tela usou createImageBitmap, ou veio de outro programa). `dados`: Uint8Array,
 * Uint8ClampedArray ou Uint16Array; `canais` 3 ou 4; `espaco`: 'srgb' | 'p3' | 'adobe' | 'rec2020'; `exif`: o de
 * lerExif (dele sai a orientação). Devolve o mesmo formato de abrirFoto, com `latitude: null` (não há dado de sensor).
 */
export function abrirImagem({ largura, altura, dados, canais = 4, espaco = 'srgb', exif = {} }) {
  const base = baseDeImagem({ largura, altura, dados, canais, espaco, orientacao: exif?.orientacao ?? 1 })
  return {
    base,
    latitude: null,
    exif: exif || {},
    camera: { fabricante: '', modelo: '' },
    previa: null,
    avisos: [],
    origem: 'imagem',
  }
}
