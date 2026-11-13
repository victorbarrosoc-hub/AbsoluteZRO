// Bloco EXIF mínimo e válido para o arquivo exportado, montado a partir do exif do contrato (src/raw/negativo.js):
// câmera, lente, ISO, tempo, abertura, focal e data. Sem miniatura, sem marcas do fabricante, sem número de série.
// Local (GPS) só entra se quem chama entregar o local E pedir todos os metadados: por padrão o arquivo não diz onde
// a foto foi feita.
//
// Especificação: EXIF 2.32 (CIPA DC-008-2019).
//   4.6.2  estrutura: cabeçalho TIFF, diretório principal (0th IFD), ExifIFD (tag 8769h) e GPS (tag 8825h)
//   4.6.4  tags do diretório principal        4.6.5  tags do ExifIFD        4.6.6  tags de GPS
//   4.6.8  o que é obrigatório num JPEG: XResolution, YResolution, ResolutionUnit, YCbCrPositioning, ExifVersion,
//          ComponentsConfiguration, FlashpixVersion, ColorSpace, PixelXDimension, PixelYDimension
// A orientação sai sempre 1: a exportação entrega os pixels já de pé, e deixar a orientação da câmera faria o leitor
// girar de novo.
//
// Texto: o EXIF 2.32 pede ASCII de 7 bits. Nome com acento vai em UTF-8, que é o que as ferramentas de fato escrevem e
// leem (e o que o EXIF 3.0 oficializou); o autor e os direitos com a grafia certa vão também no XMP.

import { METADADOS } from './fila.js'
import { TIPO, montarBlocoTiff } from './tiff.js'

export { METADADOS }

const E = (tag, tipo, valores) => ({ tag, tipo, valores })
const finito = (v) => typeof v === 'number' && Number.isFinite(v)
const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * Número positivo → fração [numerador, denominador] por frações contínuas, com denominador de até um milhão.
 * 1/250 s sai [1, 250]; f/2,8 sai [14, 5]; 2,5 s sai [5, 2].
 */
export function racional(valor, maximo = 1000000) {
  if (!finito(valor) || valor < 0) throw new Error('racional: o valor precisa ser um número não negativo')
  let h0 = 0
  let h1 = 1
  let k0 = 1
  let k1 = 0
  let x = valor
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(x)
    const h2 = a * h1 + h0
    const k2 = a * k1 + k0
    if (k2 > maximo || h2 > 0xffffffff) break
    h0 = h1
    h1 = h2
    k0 = k1
    k1 = k2
    const resto = x - a
    if (resto < 1e-10 || Math.abs(h1 / k1 - valor) <= valor * 1e-9) break
    x = 1 / resto
  }
  return [h1, k1]
}

// 'AAAA-MM-DDTHH:MM:SS' (contrato) → 'AAAA:MM:DD HH:MM:SS' (EXIF, 4.6.4)
function dataExif(data) {
  const m = /^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d):(\d\d)/.exec(typeof data === 'string' ? data : '')
  return m ? `${m[1]}:${m[2]}:${m[3]} ${m[4]}:${m[5]}:${m[6]}` : null
}

// Fração do segundo (0 ≤ x < 1) → os dígitos depois da vírgula, até milésimos, sem zeros à direita ('37' = 0,37 s)
function subsegundo(fracao) {
  if (!finito(fracao) || fracao < 0 || fracao >= 1) return null
  const mil = Math.min(999, Math.round(fracao * 1000))
  return String(mil).padStart(3, '0').replace(/0+$/, '') || '0'
}

// Graus decimais → [graus, minutos, segundos] em racionais; segundos com quatro casas (cerca de 3 mm no chão)
function grausMinutosSegundos(graus) {
  const g = Math.abs(graus)
  let inteiro = Math.floor(g)
  let minutos = Math.floor((g - inteiro) * 60)
  let segundos = Math.round(((g - inteiro) * 60 - minutos) * 60 * 10000)
  if (segundos >= 600000) {
    segundos -= 600000
    minutos += 1
  }
  if (minutos >= 60) {
    minutos -= 60
    inteiro += 1
  }
  return [
    [inteiro, 1],
    [minutos, 1],
    [segundos, 10000],
  ]
}

function gps(local) {
  if (!local || !finito(local.latitude) || !finito(local.longitude)) return null
  if (Math.abs(local.latitude) > 90 || Math.abs(local.longitude) > 180) return null
  const entradas = [
    E(0x0000, TIPO.BYTE, [2, 3, 0, 0]), // GPSVersionID 2.3
    E(0x0001, TIPO.ASCII, local.latitude < 0 ? 'S' : 'N'),
    E(0x0002, TIPO.RACIONAL, grausMinutosSegundos(local.latitude)),
    E(0x0003, TIPO.ASCII, local.longitude < 0 ? 'W' : 'E'),
    E(0x0004, TIPO.RACIONAL, grausMinutosSegundos(local.longitude)),
  ]
  if (finito(local.altitude)) {
    entradas.push(E(0x0005, TIPO.BYTE, [local.altitude < 0 ? 1 : 0])) // 0 = acima do nível do mar
    entradas.push(E(0x0006, TIPO.RACIONAL, [Math.round(Math.abs(local.altitude) * 100), 100]))
  }
  return { entradas }
}

/**
 * O EXIF como diretório (o formato de src/exportar/tiff.js), ou null quando não há o que gravar.
 *
 * dados    o exif do contrato mais a câmera: { fabricante?, modelo?, data?, subsegundo?, iso?, tempo?, abertura?,
 *          focal?, lente? }. `orientacao` é ignorada: sai sempre 1.
 * opcoes   metadados   'todos' | 'sem-local' (padrão) | 'so-direitos' | 'nenhum'
 *          software    nome do programa que exportou (quem chama lê de app/nome.js; aqui nenhum nome é escrito à mão)
 *          autor, direitos   opcionais
 *          local       { latitude, longitude, altitude? } em graus decimais e metros; só é gravado com 'todos'
 *          formato     'jpeg' (padrão) | 'tiff' | 'png' | 'webp': as tags que só valem para JPEG saem nos outros
 *          espaco      'srgb' grava ColorSpace = 1; qualquer outro (ou nenhum), 65535 "não calibrado": vale o perfil ICC
 *          largura, altura   tamanho do arquivo exportado (PixelXDimension, PixelYDimension)
 *          quando      'AAAA-MM-DDTHH:MM:SS' da exportação (DateTime); sem ele a tag não é escrita
 */
export function camposExif(dados = {}, opcoes = {}) {
  const { metadados = 'sem-local', software, autor, direitos, local, formato = 'jpeg', espaco, largura, altura, quando } = opcoes
  if (!METADADOS.includes(metadados)) throw new Error(`EXIF: política de metadados desconhecida: ${metadados}`)
  if (metadados === 'nenhum') return null
  const d = dados && typeof dados === 'object' ? dados : {}
  const tudo = metadados !== 'so-direitos'
  const jpeg = formato === 'jpeg'

  const principal = []
  const exif = []
  if (texto(autor)) principal.push(E(0x013b, TIPO.ASCII, texto(autor)))
  if (texto(direitos)) principal.push(E(0x8298, TIPO.ASCII, texto(direitos)))
  if (!tudo && principal.length === 0) return null

  if (tudo) {
    if (texto(d.fabricante)) principal.push(E(0x010f, TIPO.ASCII, texto(d.fabricante)))
    if (texto(d.modelo)) principal.push(E(0x0110, TIPO.ASCII, texto(d.modelo)))
    if (texto(software)) principal.push(E(0x0131, TIPO.ASCII, texto(software)))
    if (dataExif(quando)) principal.push(E(0x0132, TIPO.ASCII, dataExif(quando)))

    if (finito(d.tempo) && d.tempo > 0) exif.push(E(0x829a, TIPO.RACIONAL, racional(d.tempo)))
    if (finito(d.abertura) && d.abertura > 0) exif.push(E(0x829d, TIPO.RACIONAL, racional(d.abertura)))
    if (finito(d.iso) && d.iso > 0) {
      const iso = Math.round(d.iso)
      // o campo curto vai até 65535; acima disso o valor de verdade mora em ISOSpeed (4.6.5, SensitivityType = 3)
      exif.push(E(0x8827, TIPO.SHORT, Math.min(iso, 65535)))
      if (iso >= 65535) {
        exif.push(E(0x8830, TIPO.SHORT, 3))
        exif.push(E(0x8833, TIPO.LONG, iso))
      }
    }
    const captura = dataExif(d.data)
    if (captura) {
      exif.push(E(0x9003, TIPO.ASCII, captura))
      exif.push(E(0x9004, TIPO.ASCII, captura))
      const sub = subsegundo(d.subsegundo)
      if (sub) exif.push(E(0x9291, TIPO.ASCII, sub))
    }
    if (finito(d.focal) && d.focal > 0) exif.push(E(0x920a, TIPO.RACIONAL, racional(d.focal)))
    if (texto(d.lente)) exif.push(E(0xa434, TIPO.ASCII, texto(d.lente)))
  }

  // o esqueleto que todo leitor espera
  principal.push(E(0x0112, TIPO.SHORT, 1))
  principal.push(E(0x011a, TIPO.RACIONAL, [72, 1])) // 72 por polegada é o valor da norma para "resolução desconhecida"
  principal.push(E(0x011b, TIPO.RACIONAL, [72, 1]))
  principal.push(E(0x0128, TIPO.SHORT, 2))
  if (jpeg) principal.push(E(0x0213, TIPO.SHORT, 1)) // YCbCrPositioning: croma centrada, como no JFIF
  exif.push(E(0x9000, TIPO.INDEFINIDO, [0x30, 0x32, 0x33, 0x32])) // ExifVersion '0232'
  if (jpeg) exif.push(E(0x9101, TIPO.INDEFINIDO, [1, 2, 3, 0])) // ComponentsConfiguration: Y, Cb, Cr
  exif.push(E(0xa000, TIPO.INDEFINIDO, [0x30, 0x31, 0x30, 0x30])) // FlashpixVersion '0100'
  exif.push(E(0xa001, TIPO.SHORT, espaco === 'srgb' ? 1 : 0xffff))
  if (Number.isInteger(largura) && largura > 0) exif.push(E(0xa002, TIPO.LONG, largura))
  if (Number.isInteger(altura) && altura > 0) exif.push(E(0xa003, TIPO.LONG, altura))

  principal.push({ tag: 0x8769, filho: { entradas: exif } })
  if (metadados === 'todos') {
    const onde = gps(local)
    if (onde) principal.push({ tag: 0x8825, filho: onde })
  }
  return { entradas: principal }
}

/**
 * O bloco EXIF pronto (um TIFF de ordem pequena, sem o prefixo 'Exif\0\0'): é o que `embutirNoJpeg`, `escreverPng` e
 * `escreverTiff` recebem em `exif`. null quando a política é 'nenhum' ou não há nada a dizer.
 */
export function montarExif(dados, opcoes) {
  const diretorio = camposExif(dados, opcoes)
  return diretorio ? montarBlocoTiff(diretorio) : null
}
