// Revela · Autopilot do Lab. Quando o frame chega, ele responde duas perguntas que a pessoa não deveria ter que saber:
//   1. o frame já está tratado (Rec.709) ou ainda é o log da câmera?
//   2. se é log, de qual câmera?
//
// A primeira sai da própria imagem: o log tem o preto levantado, o branco baixo e pouca cor (`pareceLog`). A segunda não
// dá para ler nos pixels com segurança (S-Log3, LogC3, F-Log e D-Log põem o preto quase no mesmo código), então o
// Autopilot só afirma a câmera quando tem uma pista de verdade: o nome do arquivo (`A001_slog3.jpg`), o fabricante
// gravado no EXIF do still ou a última câmera que a pessoa escolheu aqui. Sem pista, ele diz que parece log e pede a
// câmera: não chuta.

import { ENTRADAS } from './espacos.js'

const limitar = (v, a, b) => Math.min(b, Math.max(a, v))
/** 0 abaixo de `a`, 1 acima de `b`, reta no meio. */
const rampa = (v, a, b) => limitar((v - a) / (b - a), 0, 1)

/**
 * Preto, branco e cor do frame, no código (0–1). `pixels`: Float32Array RGB. Preto e branco são os percentis 1 e 99 da
 * luma; `croma` é a média de (máx − mín) dos canais, uma saturação simples que não depende do espaço de cor.
 */
export function lerEstatisticas(pixels, passo = 5) {
  const lumas = []
  let croma = 0
  for (let i = 0; i + 2 < pixels.length; i += 3 * passo) {
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    lumas.push(0.2126 * r + 0.7152 * g + 0.0722 * b)
    croma += Math.max(r, g, b) - Math.min(r, g, b)
  }
  if (!lumas.length) return { preto: 0, branco: 1, croma: 0, n: 0 }
  lumas.sort((x, y) => x - y)
  const em = (p) => lumas[Math.min(lumas.length - 1, Math.floor(lumas.length * p))]
  return { preto: em(0.01), branco: em(0.99), croma: croma / lumas.length, n: lumas.length }
}

/**
 * O frame parece log de câmera? Três sinais, cada um de 0 a 1: preto levantado (o log guarda o preto perto de 9% do
 * código; um still tratado desce a 0–3%), branco baixo (o log raramente passa de 70%; o still chega perto de 100%) e
 * pouca cor (o gamut largo da câmera, visto sem conversão, é quase cinza). É log quando os três concordam: um só não
 * basta (um grade com véu levanta o preto; preto e branco não tem cor; neblina tem o branco baixo).
 */
export function pareceLog(pixels) {
  const e = lerEstatisticas(pixels)
  if (e.n < 50) return { log: false, confianca: 0, ...e }
  const preto = rampa(e.preto, 0.035, 0.085)
  const branco = 1 - rampa(e.branco, 0.72, 0.9)
  const cor = 1 - rampa(e.croma, 0.09, 0.14)
  const confianca = (preto + branco + cor) / 3
  // sem preto levantado não é log, por mais lavado que o frame seja (vestido branco, céu nublado)
  return { log: preto > 0.4 && confianca >= 0.7, confianca, ...e }
}

// pistas no nome do arquivo, da mais específica para a mais vaga
const NOMES = [
  [/s-?log ?3.*cine|sgamut3\.?cine|sg3c/i, 'sony-slog3-cine'],
  [/s-?log ?3/i, 'sony-slog3-cine'],
  [/s-?log ?2/i, 'sony-slog2'],
  [/log ?c ?4|awg ?4|alexa ?35/i, 'arri-logc4'],
  [/log ?c ?3|log ?c(?![a-z0-9])|awg ?3|alexa/i, 'arri-logc3'],
  [/c-?log ?3|canon ?log ?3/i, 'canon-clog3'],
  [/c-?log ?2|canon ?log ?2/i, 'canon-clog2'],
  [/c-?log|canon ?log/i, 'canon-clog'],
  [/v-?log/i, 'panasonic-vlog'],
  [/f-?log ?2/i, 'fuji-flog2'],
  [/f-?log/i, 'fuji-flog'],
  [/n-?log/i, 'nikon-nlog'],
  [/d-?log|^dji_/i, 'dji-dlog'],
  [/log ?3 ?g ?10|rwg|redwide/i, 'red-log3g10'],
  [/bmd|braw|blackmagic|gen ?5/i, 'bmd-gen5'],
  [/acescct/i, 'acescct'],
  [/davinci ?intermediate|\bdwg\b|\bdi\b/i, 'davinci'],
]

/** Câmera pelo nome do arquivo (`A001C003_slog3.jpg` → sony-slog3-cine), ou null. */
export function pistaDoNome(nome = '') {
  const limpo = String(nome).replace(/[_.]+/g, ' ')
  for (const [padrao, id] of NOMES) if (padrao.test(limpo) || padrao.test(nome)) return id
  return null
}

// o log que cada fabricante grava hoje por padrão, para quando o EXIF só diz a marca
const FABRICANTES = [
  [/sony/i, 'sony-slog3-cine'],
  [/arri/i, 'arri-logc3'],
  [/canon/i, 'canon-clog3'],
  [/panasonic|lumix/i, 'panasonic-vlog'],
  [/fuji/i, 'fuji-flog2'],
  [/nikon/i, 'nikon-nlog'],
  [/dji|hasselblad/i, 'dji-dlog'],
  [/blackmagic/i, 'bmd-gen5'],
  [/\bred\b/i, 'red-log3g10'],
]

/** Câmera pelo fabricante do EXIF ('SONY', 'Canon'…), ou null. */
export function pistaDoFabricante(fabricante = '') {
  for (const [padrao, id] of FABRICANTES) if (padrao.test(fabricante)) return id
  return null
}

/**
 * Fabricante gravado no EXIF de um JPEG (tag 0x010F, Make), ou ''. Lê só o começo do arquivo: o EXIF vem no primeiro
 * segmento APP1. Qualquer coisa fora do esperado devolve '' (still exportado do editor não tem EXIF de câmera).
 */
export function lerFabricante(buffer) {
  try {
    const v = new DataView(buffer)
    if (v.byteLength < 12 || v.getUint16(0) !== 0xffd8) return ''
    let p = 2
    while (p + 4 <= v.byteLength) {
      const marca = v.getUint16(p)
      const tamanho = v.getUint16(p + 2)
      if (marca === 0xffe1 && v.getUint32(p + 4) === 0x45786966) {
        const tiff = p + 10
        const le = v.getUint16(tiff) === 0x4949
        const ifd = tiff + v.getUint32(tiff + 4, le)
        const entradas = v.getUint16(ifd, le)
        for (let i = 0; i < entradas; i++) {
          const e = ifd + 2 + i * 12
          if (v.getUint16(e, le) !== 0x010f) continue
          const n = v.getUint32(e + 4, le)
          const onde = n <= 4 ? e + 8 : tiff + v.getUint32(e + 8, le)
          let texto = ''
          for (let k = 0; k < n && k < 64; k++) {
            const c = v.getUint8(onde + k)
            if (!c) break
            texto += String.fromCharCode(c)
          }
          return texto.trim()
        }
        return ''
      }
      // só os segmentos de cabeçalho: a imagem em si começa no SOS (0xFFDA)
      if (marca === 0xffda || (marca & 0xff00) !== 0xff00) return ''
      p += 2 + tamanho
    }
  } catch {
    // arquivo cortado ou EXIF torto: sem pista
  }
  return ''
}

const nomeDe = (id) => ENTRADAS.find((e) => e.id === id)?.nome ?? ''

/**
 * A decisão do Autopilot. `pixels` (Float32Array RGB no código), `nome` do arquivo, `fabricante` do EXIF e `ultima`
 * (a última câmera que a pessoa escolheu). Devolve:
 *   - `entrada`: 'still' ou o id da câmera; null quando parece log mas não há pista (a pessoa escolhe);
 *   - `log`: se o frame parece log; `pista`: 'nome' | 'exif' | 'ultima' | null;
 *   - `frase`: o que mostrar, curto.
 */
export function autopilot({ pixels, nome = '', fabricante = '', ultima = '' } = {}) {
  const leitura = pareceLog(pixels)
  if (!leitura.log) return { entrada: 'still', log: false, pista: null, confianca: leitura.confianca, frase: 'Frame já tratado (Rec.709)' }
  const doNome = pistaDoNome(nome)
  if (doNome) return { entrada: doNome, log: true, pista: 'nome', confianca: leitura.confianca, frase: `${nomeDe(doNome)} · pelo nome do arquivo` }
  const doExif = pistaDoFabricante(fabricante)
  if (doExif) return { entrada: doExif, log: true, pista: 'exif', confianca: leitura.confianca, frase: `${nomeDe(doExif)} · pela câmera do arquivo` }
  if (ultima && ENTRADAS.some((e) => e.id === ultima)) return { entrada: ultima, log: true, pista: 'ultima', confianca: leitura.confianca, frase: `${nomeDe(ultima)} · a sua última câmera` }
  return { entrada: null, log: true, pista: null, confianca: leitura.confianca, frase: 'Parece log. Qual é a câmera?' }
}
