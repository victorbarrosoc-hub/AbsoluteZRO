// Leitura de RAW pelo LibRaw (WASM, @colorhythm/libraw-wasm): o decodificador de sensor para os formatos de
// fabricante (CR2, CR3, NEF, ARW, RAF, RW2, ORF, PEF…). Daqui sai o Negativo: o mosaico exato e o que o arquivo
// DECLARA. Nada é medido aqui (isso é latitude.js) e nada é revelado (isso é o motor).
//
// A classe LibRaw chega de fora, já inicializada (`await LibRaw.initialize(...)`): em Node vem de node_modules, no
// navegador de /vendor. Este arquivo não importa o pacote, por isso roda igual nos dois.
//
// O que NÃO se usa do pacote, de propósito: `getMakernotes()` (devolve lixo: os campos da Canon vêm com valores
// impossíveis) e a leitura do `libraw_data_t` inteiro (posições geradas sem alinhamento). Só os acessores numéricos
// diretos e três estruturas pequenas conferidas (imgother, lensinfo, iparams), sempre com o valor validado.
//
// Para DNG, a cor vem do leitor próprio (dng.js): o LibRaw desta compilação não expõe os dois iluminantes, a
// ForwardMatrix, a BaselineExposure nem o NoiseProfile, e para alguns celulares devolve a matriz zerada.

import { criarNegativo } from './negativo.js'
import { ErroRaw, lerDng, lerTagsDng, pretoDoPadrao } from './dng.js'
import { lerExif, lerCamera, criarFonte } from './exif.js'
import { extrairPrevia, cabecalhoJpeg } from './previa.js'

export { ErroRaw }

const mdc = (a, b) => (b ? mdc(b, a % b) : a)
const mmc = (a, b) => (a / mdc(a, b)) * b

// LibRaw: flip 0 = como está, 3 = 180°, 5 = 90° anti-horário, 6 = 90° horário → orientação EXIF 1, 3, 8, 6
const ORIENTACAO_DO_FLIP = { 3: 3, 5: 8, 6: 6 }

// Qualidade do demosaico do LibRaw (user_qual). Bayer: 2 = PPG (rápido), 11 = DHT (o melhor do pacote em detalhe
// fino). X-Trans: qualquer valor ≤ 2 dá Markesteijn de 1 passada, acima disso 3 passadas.
const QUALIDADES = { rapida: 2, alta: 11 }

function exato(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  // open() copia o ArrayBuffer INTEIRO: uma vista de um buffer maior precisa virar um buffer do tamanho certo
  return u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength ? u8 : u8.slice()
}

const extensao = (nome) => (/\.([a-z0-9]+)$/i.exec(nome || '') || [])[1]?.toLowerCase() || ''

function erroDoLibRaw(erro, nome) {
  if (erro instanceof ErroRaw) return erro
  const quem = nome ? `${nome}: ` : ''
  const codigo = erro && erro.code
  // códigos de libraw_const.h: −2 formato não reconhecido, −4 pedido fora de ordem, −6 sem suporte, −100.. erros fatais
  if (codigo === -2) return new ErroRaw('nao-e-raw', `${quem}não é um RAW que o leitor reconheça.`)
  if (codigo === -6 || codigo === -5) return new ErroRaw('sem-suporte', `${quem}formato de RAW sem suporte nesta versão do leitor.`)
  return new ErroRaw('corrompido', `${quem}o leitor de RAW não conseguiu abrir (${(erro && erro.message) || erro}).`)
}

/** Texto vindo de estrutura C: só vale se for legível. */
const textoLimpo = (s) => (typeof s === 'string' && /^[\x20-\x7e]{1,128}$/.test(s.trim()) && /[a-z0-9]/i.test(s) ? s.trim() : '')

/**
 * Leitor de RAW sobre a classe `LibRaw` já inicializada.
 *   ler(bytes, { nome })            → Promise<Negativo>
 *   revelarLinear(bytes, opcoes)    → Promise<{ largura, altura, dados: Float32Array, … }>  (reserva: X-Trans e exportação)
 * Cada chamada cria e libera a sua instância: nada fica aberto entre uma foto e outra.
 */
export function criarLeitor(LibRaw) {
  if (!LibRaw || typeof LibRaw !== 'function') throw new Error('criarLeitor: passe a classe LibRaw de @colorhythm/libraw-wasm já inicializada')

  async function comArquivo(bytes, nome, fazer) {
    const u8 = exato(bytes)
    if (u8.length >= 3 && u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) {
      throw new ErroRaw(
        'nao-e-raw',
        `${nome ? `${nome} ` : 'O arquivo '}é um JPEG${/\.(jpe?g)$/i.test(nome || '') ? '' : ' com nome de RAW'}: não tem o dado do sensor.`,
      )
    }
    const lr = new LibRaw()
    try {
      await lr.waitUntilReady()
      lr.open(u8.buffer)
      return await fazer(lr, u8)
    } catch (erro) {
      throw erroDoLibRaw(erro, nome)
    } finally {
      lr.dispose() // libera a cópia do arquivo e o mosaico dentro do WASM, com ou sem erro
    }
  }

  /** CFA relativo à área ativa, pelo que o LibRaw responde em COLOR(linha, coluna). */
  function lerCfa(lr) {
    const filtros = lr.getFilters() >>> 0
    if (lr.getColors() !== 3 || filtros === 0 || filtros === 1)
      throw new ErroRaw('sem-suporte', 'Sensor sem mosaico de três cores (monocromático, Foveon ou de quatro cores).')
    const lado = filtros === 9 ? 6 : 2
    const letra = [0, 1, 2, 3].map((i) => String.fromCharCode(lr.getCdesc(i)))
    const cor = (l, c) => {
      const k = 'RGB'.indexOf(letra[lr.color(l, c)])
      if (k < 0) throw new ErroRaw('sem-suporte', 'Sensor com filtro que não é vermelho, verde e azul.')
      return k
    }
    const padrao = new Uint8Array(lado * lado)
    const indice = new Uint8Array(lado * lado) // 0..3 do LibRaw (o segundo verde tem preto próprio)
    for (let l = 0; l < lado; l++) {
      for (let c = 0; c < lado; c++) {
        padrao[l * lado + c] = cor(l, c)
        indice[l * lado + c] = lr.color(l, c)
      }
    }
    // o campo `filters` do LibRaw descreve 8 linhas × 2 colunas: confere que o Bayer se repete mesmo de 2 em 2
    if (lado === 2)
      for (let l = 2; l < 8; l++)
        for (let c = 0; c < 2; c++) if (cor(l, c) !== padrao[(l % 2) * 2 + c]) throw new ErroRaw('sem-suporte', 'Mosaico que não se repete de 2 em 2.')
    return { cfa: { tipo: lado === 6 ? 'xtrans' : 'bayer', lado, padrao }, indice }
  }

  /**
   * Preto na convenção do LibRaw (libraw_colordata_t): black + cblack[cor] + cblack[6 + (l mod cblack[4])·cblack[5] +
   * (c mod cblack[5])], com (l, c) contados da área ativa. Vale depois do unpack (a Canon mede o preto ao desempacotar).
   */
  function lerPreto(lr, cfa, indice, area) {
    const base = lr.getBlack()
    const porCor = [0, 1, 2, 3].map((i) => lr.getCblack(i))
    const pl = lr.getCblack(4)
    const pc = lr.getCblack(5)
    const repetido = pl > 0 && pc > 0 && pl * pc <= 4096
    const padrao = repetido ? Array.from({ length: pl * pc }, (_, i) => lr.getCblack(6 + i)) : null
    const lado = cfa.lado
    const mod = (a, n) => ((a % n) + n) % n
    return pretoDoPadrao({
      linhas: mmc(lado, repetido ? pl : 1),
      colunas: mmc(lado, repetido ? pc : 1),
      cfa,
      area,
      valor: (la, ca) => base + porCor[indice[mod(la, lado) * lado + mod(ca, lado)]] + (repetido ? padrao[mod(la, pl) * pc + mod(ca, pc)] : 0),
    })
  }

  /** O que só o LibRaw sabe e o EXIF próprio não achou (ISO de fabricante, lente por tabela). */
  function completarExif(lr, exif) {
    try {
      const o = lr.getImgOther()
      if (exif.iso === undefined && o.iso_speed > 0 && o.iso_speed < 1e7) exif.iso = Math.round(o.iso_speed)
      if (exif.tempo === undefined && o.shutter > 0 && o.shutter < 1e5) exif.tempo = o.shutter
      if (exif.abertura === undefined && o.aperture > 0 && o.aperture < 1000) exif.abertura = Math.round(o.aperture * 100) / 100
      if (exif.focal === undefined && o.focal_len > 0 && o.focal_len < 1e5) exif.focal = Math.round(o.focal_len * 100) / 100
      const t = Number(o.timestamp)
      // o LibRaw monta o carimbo com a hora local da câmera como se fosse UTC: ler em UTC devolve o relógio da câmera
      if (exif.data === undefined && t > 86400 && t < 4e9) exif.data = new Date(t * 1000).toISOString().slice(0, 19)
    } catch {
      // estrutura ilegível: fica só o que o EXIF próprio leu
    }
    if (exif.lente === undefined) {
      try {
        const l = lr.getLensInfo()
        const nome = textoLimpo(l.Lens) || textoLimpo(l.makernotes && l.makernotes.Lens)
        if (nome) exif.lente = nome
      } catch {
        // idem
      }
    }
    const flip = ORIENTACAO_DO_FLIP[lr.getFlip()]
    if (exif.orientacao === 1 && flip) exif.orientacao = flip
    return exif
  }

  function previaDe(lr, u8) {
    const propria = extrairPrevia(u8)
    if (propria && propria.jpeg) return { jpeg: propria.jpeg.slice(), largura: propria.largura, altura: propria.altura }
    try {
      lr.unpackThumb()
      const t = lr.dcrawMakeMemThumb()
      if (t.type_ !== 'LIBRAW_IMAGE_JPEG' || !t.data || t.data.length < 4) return null
      const cab = cabecalhoJpeg(criarFonte(t.data), 0)
      return cab ? { jpeg: t.data, largura: cab.largura, altura: cab.altura } : { jpeg: t.data }
    } catch {
      return null // arquivo sem miniatura: o negativo sai sem prévia
    }
  }

  async function ler(bytes, { nome } = {}) {
    const u8 = exato(bytes)
    let dng = null
    try {
      dng = lerTagsDng(u8)
    } catch {
      dng = null // não é DNG: segue só com o LibRaw
    }
    if (dng && dng.linear) return lerDng(u8, { nome }) // lança o motivo certo (LinearRaw / lossy DNG): não há mosaico
    try {
      return await comArquivo(u8, nome, (lr) => {
        lr.unpack()
        const dados = lr.getRawImage()
        if (!dados) throw new ErroRaw('sem-suporte', `${nome ? `${nome}: ` : ''}o arquivo não traz mosaico (sRAW, Foveon ou imagem já revelada).`)
        const largura = lr.getRawWidth()
        const altura = lr.getRawHeight()
        let area = { x: lr.getLeftMargin(), y: lr.getTopMargin(), largura: lr.getActiveWidth(), altura: lr.getActiveHeight() }
        const lido = lerCfa(lr)
        let cfa = lido.cfa
        let preto = lerPreto(lr, cfa, lido.indice, area)

        // Branco declarado: `maximum` é o teto do formato; `linear_max` é o que o fabricante grava como fim do trecho
        // linear (0 quando o arquivo não traz). Vale o menor. O que o sensor realmente entrega é medido em latitude.js.
        const maximo = lr.getColorMaximum()
        const linear = [0, 1, 2, 3].map((i) => lr.getLinearMax(i))
        const teto = (...indices) => Math.min(maximo, ...indices.map((i) => linear[i]).filter((v) => v > 0))
        let branco = { declarado: [teto(0), teto(1, 3), teto(2)], maximo }
        // DNG: a descrição do mosaico vem das tags (preto racional, área ativa e CFA da especificação), desde que
        // seja o mesmo mosaico que o LibRaw desempacotou
        const m = dng && dng.mosaico
        if (m && m.largura === largura && m.altura === altura) {
          area = m.area
          cfa = m.cfa
          preto = m.preto
          branco = { ...m.branco, maximo }
        }

        const cam = [0, 1, 2].map((i) => lr.getCamMul(i))
        const wb = cam.every((v) => v > 0 && Number.isFinite(v)) ? { comoFotografado: [cam[0] / cam[1], 1, cam[2] / cam[1]] } : {}

        let cor
        if (dng && dng.cor.matrizes.length) cor = dng.cor
        else {
          // cam_xyz do LibRaw: uma matriz só, XYZ (D65) → câmera, linha a linha
          const m = []
          for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m.push(lr.getCamXyz(i, j))
          if (!m.some((v) => v !== 0) || !m.every(Number.isFinite))
            throw new ErroRaw('sem-suporte', `${nome ? `${nome}: ` : ''}câmera sem matriz de cor conhecida pelo leitor.`)
          cor = { origem: 'libraw', matrizes: [{ kelvin: 6500, xyzParaCamera: m }] }
        }

        const camera = lerCamera(u8)
        let marca = camera
        if (!camera.fabricante && !camera.modelo) {
          try {
            const ip = lr.getIParams()
            marca = { fabricante: textoLimpo(ip.make), modelo: textoLimpo(ip.model) }
          } catch {
            marca = camera
          }
        }
        const n = {
          tipo: 'raw',
          formato: extensao(nome) || (dng ? 'dng' : ''),
          fabricante: marca.fabricante,
          modelo: marca.modelo,
          exif: completarExif(lr, lerExif(u8)),
          sensor: { largura, altura, dados },
          area,
          cfa,
          preto,
          branco,
          wb: dng && dng.wb.comoFotografado ? dng.wb : wb,
          cor,
          exposicaoBase: dng ? dng.exposicaoBase : 0,
        }
        if (dng && dng.perfilRuido) n.perfilRuido = dng.perfilRuido
        if (dng && dng.recorte) n.recorte = dng.recorte
        if (dng && dng.opcodes) n.opcodes = dng.opcodes
        const previa = previaDe(lr, u8)
        if (previa) n.previa = previa
        if (nome) n.nome = nome
        return criarNegativo(n)
      })
    } catch (erro) {
      // DNG que o LibRaw desta compilação não abre: tenta o leitor próprio antes de desistir
      if (dng) {
        try {
          return lerDng(u8, { nome })
        } catch (proprio) {
          throw proprio instanceof ErroRaw && proprio.codigo === 'sem-suporte' ? proprio : erro // o motivo mais específico
        }
      }
      throw erro
    }
  }

  /**
   * Caminho de reserva: o demosaico do próprio LibRaw, para X-Trans e para o que o motor não cobre.
   * Sai em ESPAÇO DE CÂMERA, linear, sem matriz, sem curva, sem brilho automático e sem equilíbrio de branco:
   * 1,0 = (branco.maximo − preto) do arquivo, com o preto já subtraído.
   *
   * opcoes:
   *   qualidade  'rapida' | 'alta' (padrão) | número do LibRaw (0 linear, 1 VNG, 2 PPG, 3 AHD, 4 DCB, 11 DHT, 12 AAHD)
   *   metade     true = metade da resolução, sem interpolar (half_size do LibRaw). Vale também para X-Trans, e é o
   *              que o torna usável: 26 MP em ~2,5 s, contra ~15 s do Markesteijn de 1 passada em WASM de uma thread
   *   wb         'camera' (padrão) | 'nenhum' | [r, g, b]: equilíbrio usado SÓ POR DENTRO do demosaico. Os algoritmos
   *              direcionais comparam canais e erram a direção com o verde dominando; por isso o LibRaw equilibra,
   *              interpola, e aqui os multiplicadores são desfeitos na saída. O resultado é o mesmo espaço de câmera
   *              sem equilíbrio; muda só a qualidade da interpolação.
   *
   * Devolve { largura, altura, dados: Float32Array (RGB entrelaçado), orientacao, wbNoDemosaico, maximo, girada }.
   * O LibRaw desta compilação já entrega a imagem GIRADA conforme a câmera (não há como desligar): por isso
   * `orientacao` volta 1 e `girada` diz a orientação EXIF que já foi aplicada.
   */
  async function revelarLinear(bytes, { nome, qualidade = 'alta', metade = false, wb = 'camera' } = {}) {
    return comArquivo(bytes, nome, (lr) => {
      lr.unpack()
      const cam = [0, 1, 2].map((i) => lr.getCamMul(i))
      let mul = [1, 1, 1]
      if (Array.isArray(wb) && wb.length === 3 && wb.every((v) => v > 0)) mul = [wb[0] / wb[1], 1, wb[2] / wb[1]]
      else if (wb === 'camera' && cam.every((v) => v > 0 && Number.isFinite(v))) mul = [cam[0] / cam[1], 1, cam[2] / cam[1]]
      const girada = ORIENTACAO_DO_FLIP[lr.getFlip()] || 1
      const maximo = lr.getColorMaximum()

      lr.setDemosaic(typeof qualidade === 'number' ? qualidade : (QUALIDADES[qualidade] ?? QUALIDADES.alta))
      lr.setHalfSize(metade ? 1 : 0)
      lr.setUseCameraWb(0)
      ;[mul[0], mul[1], mul[2], mul[1]].forEach((v, i) => lr.setUserMul(i, v))
      lr.setOutputColor(0) // 0 = cor crua da câmera, sem matriz
      lr.setOutputBps(16)
      lr.setGamma(0, 1) // curva de saída linear (expoente 1, inclinação 1)
      lr.setGamma(1, 1)
      lr.setNoAutoBright(1)
      lr.setBright(1)
      lr.setHighlight(1) // 1 = não cortar: o canal de maior multiplicador é o que chega a 65535 no branco
      lr.setAdjustMaximumThr(0) // não reajustar o branco pelo que a foto tem
      lr.setFbddNoiserd(0)
      lr.dcrawProcess()
      const img = lr.dcrawMakeMemImage()
      if (img.colors !== 3 || img.bits !== 16) throw new ErroRaw('sem-suporte', 'O demosaico de reserva não devolveu RGB de 16 bits.')
      const px = new Uint16Array(img.data.buffer, img.data.byteOffset, (img.width * img.height * 3) | 0)
      // LibRaw (scale_colors, modo de altas luzes ≥ 1): saída = (cru − preto) · mul[c] / max(mul) · 65535 / (maximo − preto).
      // Desfazer o multiplicador deixa (cru − preto) / (maximo − preto) em cada canal.
      const maior = Math.max(...mul)
      const k = mul.map((v) => maior / v / 65535)
      const dados = new Float32Array(px.length)
      for (let i = 0; i < px.length; i += 3) {
        dados[i] = px[i] * k[0]
        dados[i + 1] = px[i + 1] * k[1]
        dados[i + 2] = px[i + 2] * k[2]
      }
      return { largura: img.width, altura: img.height, dados, orientacao: 1, girada, wbNoDemosaico: mul, maximo }
    })
  }

  return { ler, revelarLinear }
}

let padrao = null

/** Guarda a classe LibRaw para `abrirRaw` (a tela chama uma vez, depois de inicializar o WASM). */
export function usarLibRaw(LibRaw) {
  padrao = criarLeitor(LibRaw)
  return padrao
}

/** `abrirRaw(bytes, { nome }) → Promise<Negativo>` do contrato: usa o leitor passado ou o de `usarLibRaw`. */
export async function abrirRaw(bytes, { nome, leitor } = {}) {
  const l = leitor || padrao
  if (!l) throw new Error('abrirRaw: chame usarLibRaw(LibRaw) antes, ou passe { leitor }')
  return l.ler(bytes, { nome })
}
