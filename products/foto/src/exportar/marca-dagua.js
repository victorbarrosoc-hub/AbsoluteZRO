// Marca-d'água gravada nos pixels: é o que protege a prova que vai para o cliente (um metadado some com um clique;
// o pixel não). Função pura: entra a imagem, entra uma MÁSCARA alfa já desenhada por quem chama (o texto ou o logo
// vira máscara na tela, com canvas; aqui não há fonte nem DOM) e sai uma imagem nova.
//
// Tudo é proporcional à foto, para a marca ficar igual numa prova de 2048 px e num arquivo de 24 MP:
//   tamanho   fração da LARGURA da foto que a marca ocupa (a altura segue a proporção da máscara)
//   margem    fração do LADO MENOR da foto entre a marca e a borda
//   opacidade 0..1
// A mistura é a composição "sobre" de Porter e Duff (1984) com a cor da marca: saída = foto·(1 − α) + cor·α, com
// α = máscara × opacidade, feita sobre a imagem de tela (0..1, com a curva), como qualquer editor faz.

import { reamostrar } from './redimensionar.js'

export const POSICOES = ['inferior-direito', 'inferior-esquerdo', 'superior-direito', 'superior-esquerdo', 'centro', 'diagonal']

const limitar = (v, min, max) => (v < min ? min : v > max ? max : v)

/**
 * Onde a marca cai e com que tamanho, em pixels da foto: { largura, altura, x, y } (x, y = canto de cima à esquerda;
 * em 'diagonal' é o tamanho de cada repetição, e x, y não são usados).
 */
export function encaixarMarca(imagem, mascara, { posicao = 'inferior-direito', tamanho = 0.25, margem = 0.03 } = {}) {
  const pos = posicao === 'canto' ? 'inferior-direito' : posicao
  if (!POSICOES.includes(pos)) throw new Error(`Marca-d'água: posição desconhecida: ${posicao}`)
  const borda = Math.round(limitar(margem, 0, 0.45) * Math.min(imagem.largura, imagem.altura))
  const cabeL = Math.max(1, imagem.largura - 2 * borda)
  const cabeA = Math.max(1, imagem.altura - 2 * borda)
  // a largura pedida, encolhida se a marca não couber dentro das margens
  let largura = limitar(tamanho, 0.01, 1) * imagem.largura
  let altura = (largura * mascara.altura) / mascara.largura
  const aperto = Math.min(1, cabeL / largura, cabeA / altura)
  largura = Math.max(1, Math.round(largura * aperto))
  altura = Math.max(1, Math.round(altura * aperto))
  let x = Math.round((imagem.largura - largura) / 2)
  let y = Math.round((imagem.altura - altura) / 2)
  if (pos.endsWith('direito')) x = imagem.largura - borda - largura
  if (pos.endsWith('esquerdo')) x = borda
  if (pos.startsWith('inferior')) y = imagem.altura - borda - altura
  if (pos.startsWith('superior')) y = borda
  return { posicao: pos, largura, altura, x, y }
}

/**
 * Grava a marca-d'água.
 *   imagem     { largura, altura, dados: Float32Array RGB } de tela (0..1)
 *   mascara    { largura, altura, dados: Float32Array } alfa de 0 a 1, um valor por pixel, em qualquer resolução
 *   posicao    'inferior-direito' (padrão; 'canto' é o mesmo) | 'inferior-esquerdo' | 'superior-direito' |
 *              'superior-esquerdo' | 'centro' | 'diagonal' (repetida pela foto toda, inclinada na diagonal dela)
 *   opacidade  0..1 (padrão 0,5)       tamanho, margem   frações, como acima
 *   cor        [r, g, b] de 0 a 1 no espaço da imagem (padrão branco)
 *   espaco     só em 'diagonal': vão entre repetições, em fração da largura da marca (padrão 0,5)
 * Devolve uma imagem nova; a entrada não é tocada.
 */
export function aplicarMarcaDagua(imagem, mascara, opcoes = {}) {
  const { opacidade = 0.5, cor = [1, 1, 1], espaco = 0.5 } = opcoes
  if (!(mascara?.dados instanceof Float32Array) || mascara.dados.length !== mascara.largura * mascara.altura) {
    throw new Error("Marca-d'água: a máscara precisa ser Float32Array com largura × altura valores")
  }
  const { largura: L, altura: A, dados } = imagem
  const saida = Float32Array.from(dados)
  const forca = limitar(opacidade, 0, 1)
  if (forca === 0) return { largura: L, altura: A, dados: saida }
  const lugar = encaixarMarca(imagem, mascara, opcoes)
  // a máscara no tamanho em que vai ser gravada (área na redução grande: é uma forma, não uma foto)
  const m =
    lugar.largura === mascara.largura && lugar.altura === mascara.altura
      ? mascara.dados
      : reamostrar(mascara.dados, mascara.largura, mascara.altura, 1, lugar.largura, lugar.altura, { metodo: 'auto' })
  const [cr, cg, cb] = cor
  const misturar = (i, alfa) => {
    const a = limitar(alfa, 0, 1) * forca
    if (a <= 0) return
    saida[i] += (cr - saida[i]) * a
    saida[i + 1] += (cg - saida[i + 1]) * a
    saida[i + 2] += (cb - saida[i + 2]) * a
  }

  if (lugar.posicao !== 'diagonal') {
    for (let y = 0; y < lugar.altura; y++) {
      const yy = lugar.y + y
      if (yy < 0 || yy >= A) continue
      for (let x = 0; x < lugar.largura; x++) {
        const xx = lugar.x + x
        if (xx < 0 || xx >= L) continue
        misturar((yy * L + xx) * 3, m[y * lugar.largura + x])
      }
    }
    return { largura: L, altura: A, dados: saida }
  }

  // Repetida em diagonal: a marca sobe da esquerda para a direita com a inclinação da diagonal da foto. Para cada
  // pixel, gira-se a posição para o sistema da marca (u ao longo do texto, v atravessado), dobra-se no período e
  // lê-se a máscara com interpolação bilinear. Linhas alternadas andam meio período, como tijolos.
  const angulo = -Math.atan2(A, L)
  const cos = Math.cos(angulo)
  const sen = Math.sin(angulo)
  const vao = Math.max(0, espaco) * lugar.largura
  const periodoU = lugar.largura + vao
  const periodoV = lugar.altura + vao
  const lw = lugar.largura
  const lh = lugar.altura
  const ler = (xi, yi) => (xi < 0 || yi < 0 || xi >= lw || yi >= lh ? 0 : m[yi * lw + xi])
  for (let y = 0; y < A; y++) {
    const dy = y + 0.5 - A / 2
    for (let x = 0; x < L; x++) {
      const dx = x + 0.5 - L / 2
      // rotação inversa: do pixel para as coordenadas da marca, com uma repetição centrada no meio da foto
      const u0 = dx * cos + dy * sen + lw / 2
      const v0 = -dx * sen + dy * cos + lh / 2
      const fileira = Math.floor(v0 / periodoV)
      const v = v0 - fileira * periodoV
      if (v >= lh) continue
      const ud = u0 + (fileira & 1 ? periodoU / 2 : 0)
      const u = ud - Math.floor(ud / periodoU) * periodoU
      if (u >= lw) continue
      // bilinear, com as amostras no centro de cada pixel da máscara
      const fu = u - 0.5
      const fv = v - 0.5
      const x0 = Math.floor(fu)
      const y0 = Math.floor(fv)
      const tx = fu - x0
      const ty = fv - y0
      const alfa = (ler(x0, y0) * (1 - tx) + ler(x0 + 1, y0) * tx) * (1 - ty) + (ler(x0, y0 + 1) * (1 - tx) + ler(x0 + 1, y0 + 1) * tx) * ty
      misturar((y * L + x) * 3, alfa)
    }
  }
  return { largura: L, altura: A, dados: saida }
}
