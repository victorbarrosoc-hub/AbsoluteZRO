// .cube 3D: ler e escrever a LUT de troca do mercado (Adobe/Iridas, a que o Resolve e o Lightroom exportam).
//
// Formato (Adobe, "Cube LUT Specification 1.0", 2013): texto, uma instrução por linha.
//   TITLE "nome"            opcional
//   LUT_3D_SIZE N           N pontos por lado (N³ linhas de dados)
//   DOMAIN_MIN r g b        padrão 0 0 0
//   DOMAIN_MAX r g b        padrão 1 1 1
//   # comentário
//   r g b                   N³ linhas em ponto flutuante; o VERMELHO varia mais rápido, depois o verde, depois o azul
//
// O dialeto do Resolve troca DOMAIN_* por LUT_3D_INPUT_RANGE min max (um número para os três canais); é aceito.
// O que não é lido é recusado com frase clara (`ErroCube.codigo`): LUT só 1D, lado fora de 2..65, arquivo incompleto
// ou com linha que não é número. A LUT 1D + 3D no mesmo arquivo (shaper) também é recusada: não aplicamos shaper.
//
// O arquivo não diz em que codificação a entrada está. LUT de foto supõe o código da tela (sRGB); é assim que o look
// entra no motor (look.js). LUT feita para log de vídeo vai dar errado, e não há como saber pelo arquivo: quem importa
// avisa a pessoa.

export const LADO_MIN = 2
export const LADO_MAX = 65
// 65³ linhas de até ~40 caracteres: acima disto não é uma .cube que a gente leia
const TAMANHO_MAX = 24 * 1024 * 1024

export class ErroCube extends Error {
  constructor(codigo, mensagem) {
    super(mensagem)
    this.name = 'ErroCube'
    this.codigo = codigo
  }
}

const erro = (codigo, mensagem) => new ErroCube(codigo, mensagem)

/**
 * Lê uma .cube 3D (texto ou bytes). Devolve { titulo, lado, dominio: { min: [r, g, b], max: [r, g, b] },
 * dados: Float32Array (lado³ · 3; índice = ((b·lado + g)·lado + r)·3), avisos: [frases] }.
 * Lança `ErroCube`: `vazia`, `grande`, `so-1d`, `com-shaper`, `sem-tamanho`, `lado`, `linha`, `incompleta`, `dominio`.
 */
export function lerCube(entrada) {
  let texto = entrada
  if (texto instanceof Uint8Array || texto instanceof ArrayBuffer) {
    if (texto.byteLength > TAMANHO_MAX) throw erro('grande', 'Esta LUT é grande demais (o limite é 65 pontos por lado).')
    texto = new TextDecoder('utf-8').decode(texto)
  }
  if (typeof texto !== 'string' || !texto.trim()) throw erro('vazia', 'O arquivo .cube está vazio.')
  if (texto.length > TAMANHO_MAX) throw erro('grande', 'Esta LUT é grande demais (o limite é 65 pontos por lado).')
  let titulo = ''
  let lado = 0
  let lado1d = 0
  const min = [0, 0, 0]
  const max = [1, 1, 1]
  const avisos = []
  let dados = null
  let escritos = 0
  let numeroDaLinha = 0
  let inicio = 0
  const fim = texto.length
  while (inicio < fim) {
    let quebra = texto.indexOf('\n', inicio)
    if (quebra < 0) quebra = fim
    const linha = texto.slice(inicio, quebra).trim()
    inicio = quebra + 1
    numeroDaLinha++
    if (!linha || linha[0] === '#') continue
    const c = linha.charCodeAt(0)
    // linha de dados: começa com dígito, sinal ou ponto
    if ((c >= 48 && c <= 57) || c === 45 || c === 43 || c === 46) {
      if (!lado) {
        if (lado1d) throw erro('so-1d', 'Esta é uma LUT 1D. Só a .cube 3D é lida.')
        throw erro('sem-tamanho', 'A .cube não diz o tamanho (falta LUT_3D_SIZE antes dos números).')
      }
      if (lado1d) throw erro('com-shaper', 'Esta .cube traz uma LUT 1D junto da 3D (shaper). Esse tipo não é lido.')
      const partes = linha.split(/\s+/)
      const r = Number(partes[0])
      const g = Number(partes[1])
      const b = Number(partes[2])
      if (partes.length < 3 || !Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
        throw erro('linha', `A linha ${numeroDaLinha} da .cube não tem três números.`)
      }
      if (escritos >= dados.length) throw erro('incompleta', `A .cube tem mais linhas do que o tamanho ${lado} pede.`)
      dados[escritos++] = r
      dados[escritos++] = g
      dados[escritos++] = b
      continue
    }
    const espaco = linha.search(/\s/)
    const chave = (espaco < 0 ? linha : linha.slice(0, espaco)).toUpperCase()
    const resto = espaco < 0 ? '' : linha.slice(espaco).trim()
    if (chave === 'TITLE') titulo = resto.replace(/^"|"$/g, '').slice(0, 120)
    else if (chave === 'LUT_3D_SIZE') {
      lado = Number(resto)
      if (!Number.isInteger(lado) || lado < LADO_MIN || lado > LADO_MAX) {
        throw erro('lado', `Tamanho de LUT não aceito: ${resto || 'vazio'}. Lemos de ${LADO_MIN} a ${LADO_MAX} pontos por lado.`)
      }
      dados = new Float32Array(lado * lado * lado * 3)
    } else if (chave === 'LUT_1D_SIZE') lado1d = Number(resto) || 1
    else if (chave === 'DOMAIN_MIN' || chave === 'DOMAIN_MAX') {
      const v = resto.split(/\s+/).map(Number)
      if (v.length < 3 || v.some((x) => !Number.isFinite(x))) throw erro('dominio', `${chave} precisa de três números.`)
      for (let i = 0; i < 3; i++) (chave === 'DOMAIN_MIN' ? min : max)[i] = v[i]
    } else if (chave === 'LUT_3D_INPUT_RANGE') {
      const v = resto.split(/\s+/).map(Number)
      if (v.length < 2 || v.some((x) => !Number.isFinite(x))) throw erro('dominio', 'LUT_3D_INPUT_RANGE precisa de dois números.')
      min.fill(v[0])
      max.fill(v[1])
    } else if (chave === 'LUT_1D_INPUT_RANGE') {
      // só faz sentido com a 1D, que já é recusada adiante
    } else avisos.push(`Instrução ignorada na linha ${numeroDaLinha}: ${chave.slice(0, 40)}.`)
  }
  if (!lado) {
    if (lado1d) throw erro('so-1d', 'Esta é uma LUT 1D. Só a .cube 3D é lida.')
    throw erro('sem-tamanho', 'A .cube não diz o tamanho (falta LUT_3D_SIZE).')
  }
  if (escritos !== dados.length) throw erro('incompleta', `A .cube está incompleta: ${escritos / 3} de ${lado ** 3} linhas.`)
  for (let i = 0; i < 3; i++) if (!(max[i] > min[i])) throw erro('dominio', 'DOMAIN_MAX precisa ser maior que DOMAIN_MIN.')
  return { titulo, lado, dominio: { min, max }, dados, avisos }
}

const formatar = (v, casas) => {
  const t = v.toFixed(casas)
  return t === `-${(0).toFixed(casas)}` ? (0).toFixed(casas) : t
}

/**
 * Escreve uma .cube 3D. `lut`: { lado, dados (lado³ · 3, vermelho mais rápido), titulo?, dominio? }. `casas`: casas
 * decimais (6 = passo menor que 16 bits). DOMAIN_* só sai quando não é o padrão 0..1 (há leitor que tropeça nele).
 */
export function escreverCube(lut, { casas = 6, titulo = lut.titulo ?? '' } = {}) {
  const { lado, dados } = lut
  if (!Number.isInteger(lado) || lado < LADO_MIN || lado > LADO_MAX) throw erro('lado', `Tamanho de LUT não aceito: ${lado}.`)
  if (!dados || dados.length !== lado * lado * lado * 3) throw erro('incompleta', 'Os dados da LUT não batem com o tamanho.')
  const linhas = []
  const limpo = String(titulo).replace(/["\r\n]/g, ' ').trim().slice(0, 120)
  if (limpo) linhas.push(`TITLE "${limpo}"`)
  linhas.push(`LUT_3D_SIZE ${lado}`)
  const min = lut.dominio?.min ?? [0, 0, 0]
  const max = lut.dominio?.max ?? [1, 1, 1]
  if (min.some((v) => v !== 0) || max.some((v) => v !== 1)) {
    linhas.push(`DOMAIN_MIN ${min.map((v) => formatar(v, casas)).join(' ')}`)
    linhas.push(`DOMAIN_MAX ${max.map((v) => formatar(v, casas)).join(' ')}`)
  }
  for (let i = 0; i < dados.length; i += 3) linhas.push(`${formatar(dados[i], casas)} ${formatar(dados[i + 1], casas)} ${formatar(dados[i + 2], casas)}`)
  return `${linhas.join('\n')}\n`
}
