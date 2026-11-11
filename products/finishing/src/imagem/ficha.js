// Revela · ficha de apresentação. O quadro já com o look, as cores dominantes marcadas no próprio quadro, os créditos
// e a técnica (cópia, negativo, look, câmera, formato, textura) numa ficha pronta para o portfólio ou para mandar ao
// cliente. Sai em PNG, quadrada (rede social) ou panorâmica (apresentação).
//
// Três partes, para dar para testar sem navegador:
//   paletaDominante  os pixels → as cores que mandam no quadro e onde cada uma está
//   montarFicha      os dados → onde vai cada coisa (só geometria e texto)
//   desenharFicha    a geometria → o canvas

import { codigoParaOklab, oklabParaCodigo } from '../cor/oklab.js'

const limitar = (v, a, b) => Math.min(b, Math.max(a, v))
const hex = (rgb) => `#${rgb.map((v) => Math.round(limitar(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`.toUpperCase()

/**
 * As `n` cores dominantes de um quadro. `data`: RGBA 8 bits (ImageData.data), `w` × `h`. Agrupa uma amostra do quadro
 * em Oklab (k-médias; os centros começam nos pontos mais distantes entre si, então o resultado é sempre o mesmo) e
 * devolve, da mais escura para a mais clara: { rgb, hex, x, y, peso }, com x e y (0–1) do ponto do quadro mais
 * parecido com a cor e `peso` a fração do quadro que ela ocupa. Cores quase iguais se juntam: podem voltar menos de `n`.
 */
export function paletaDominante(data, w, h, n = 5) {
  const passo = Math.max(1, Math.round(Math.max(w, h) / 64))
  const pontos = []
  for (let y = Math.floor(passo / 2); y < h; y += passo)
    for (let x = Math.floor(passo / 2); x < w; x += passo) {
      const i = (y * w + x) * 4
      pontos.push({ lab: codigoParaOklab(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255), x: (x + 0.5) / w, y: (y + 0.5) / h })
    }
  if (!pontos.length) return []
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  // a cor pesa mais que a luz: senão a paleta vira uma escada de cinzas
  const pesar = (lab) => [lab[0] * 0.6, lab[1] * 1.6, lab[2] * 1.6]
  for (const p of pontos) p.v = pesar(p.lab)

  // centros: o ponto mais perto da média e, depois, sempre o mais distante dos já escolhidos
  const media = [0, 1, 2].map((c) => pontos.reduce((s, p) => s + p.v[c], 0) / pontos.length)
  let primeiro = pontos[0]
  for (const p of pontos) if (d2(p.v, media) < d2(primeiro.v, media)) primeiro = p
  const centros = [primeiro.v.slice()]
  const perto = pontos.map((p) => d2(p.v, centros[0]))
  while (centros.length < Math.min(n, pontos.length)) {
    let longe = 0
    for (let i = 1; i < pontos.length; i++) if (perto[i] > perto[longe]) longe = i
    if (perto[longe] <= 1e-9) break
    centros.push(pontos[longe].v.slice())
    for (let i = 0; i < pontos.length; i++) perto[i] = Math.min(perto[i], d2(pontos[i].v, centros.at(-1)))
  }

  const dono = new Int32Array(pontos.length)
  for (let volta = 0; volta < 10; volta++) {
    const soma = centros.map(() => [0, 0, 0, 0])
    for (let i = 0; i < pontos.length; i++) {
      let k = 0
      for (let c = 1; c < centros.length; c++) if (d2(pontos[i].v, centros[c]) < d2(pontos[i].v, centros[k])) k = c
      dono[i] = k
      const s = soma[k]
      s[0] += pontos[i].v[0]
      s[1] += pontos[i].v[1]
      s[2] += pontos[i].v[2]
      s[3]++
    }
    for (let c = 0; c < centros.length; c++) if (soma[c][3]) centros[c] = [soma[c][0] / soma[c][3], soma[c][1] / soma[c][3], soma[c][2] / soma[c][3]]
  }

  const grupos = centros.map((v, c) => {
    let n = 0
    let exemplo = null
    for (let i = 0; i < pontos.length; i++) {
      if (dono[i] !== c) continue
      n++
      if (!exemplo || d2(pontos[i].v, v) < d2(exemplo.v, v)) exemplo = pontos[i]
    }
    return { v, n, exemplo }
  })
  // junta cores quase iguais (a maior fica) e tira o que é resto (menos de 1,5% do quadro)
  const fica = []
  for (const g of grupos.filter((g) => g.exemplo && g.n / pontos.length >= 0.015).sort((a, b) => b.n - a.n)) {
    const igual = fica.find((f) => d2(f.v, g.v) < 0.0009)
    if (igual) igual.n += g.n
    else fica.push({ ...g })
  }
  return fica
    .map((g) => {
      const lab = [g.v[0] / 0.6, g.v[1] / 1.6, g.v[2] / 1.6]
      const rgb = oklabParaCodigo(...lab).map((v) => Math.round(limitar(v, 0, 1) * 255))
      return { rgb, hex: hex(rgb), x: g.exemplo.x, y: g.exemplo.y, peso: g.n / pontos.length, L: lab[0] }
    })
    .sort((a, b) => a.L - b.L)
    .map(({ L, ...cor }) => cor)
}

export const FORMATOS_FICHA = [
  { id: 'quadrada', nome: 'Quadrada', w: 2160, h: 2160 },
  { id: 'panoramica', nome: 'Panorâmica', w: 2560, h: 1440 },
]

const TEMAS = {
  claro: { fundo: '#f5f5f7', papel: '#ffffff', texto: '#1d1d1f', mudo: '#86868b', linha: 'rgba(0,0,0,0.12)' },
  escuro: { fundo: '#0e0e10', papel: '#161619', texto: '#f5f5f7', mudo: '#8e8e93', linha: 'rgba(255,255,255,0.14)' },
}

const texto = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()

/**
 * Onde vai cada coisa na ficha. `dados`: { titulo, creditos: { direcao, fotografia, cor, ano }, tecnica: { copia,
 * negativo, look, camera, formato, textura }, paleta, proporcao (largura ÷ altura do quadro), formato, tema }.
 * Crédito vazio não ocupa lugar. Devolve { w, h, tema, titulo, marca, creditos[], imagem, pontos[], amostras[],
 * tecnica[] }: retângulos em pixels e os textos, sem tocar em canvas.
 */
export function montarFicha(dados = {}) {
  const formato = FORMATOS_FICHA.find((f) => f.id === dados.formato) ?? FORMATOS_FICHA[0]
  const tema = TEMAS[dados.tema] ?? TEMAS.claro
  const { w, h } = formato
  const proporcao = limitar(Number(dados.proporcao) || 16 / 9, 0.4, 3)
  const paleta = (dados.paleta ?? []).slice(0, 6)
  const c = dados.creditos ?? {}
  const t = dados.tecnica ?? {}
  const creditos = [
    ['Direção', c.direcao],
    ['Fotografia', c.fotografia],
    ['Cor', c.cor],
    ['Ano', c.ano],
  ]
    .map(([rotulo, valor]) => ({ rotulo, valor: texto(valor) }))
    .filter((x) => x.valor)
  const tecnica = [
    ['Cópia', t.copia],
    ['Negativo', t.negativo],
    ['Look', t.look],
    ['Câmera', t.camera],
    ['Formato', t.formato],
    ['Textura', t.textura],
  ]
    .map(([rotulo, valor]) => ({ rotulo, valor: texto(valor) }))
    .filter((x) => x.valor)
  const titulo = texto(dados.titulo) || 'Sem título'
  const m = Math.round(w * 0.045) // margem
  // altura de uma linha de células: a panorâmica empilha tudo numa coluna estreita e pede linhas mais altas
  const linha = Math.round(h * (formato.id === 'panoramica' ? 0.064 : 0.052))
  const cabeca = Math.round(h * 0.07)
  const faixa = Math.round(h * 0.03) // amostras da paleta
  const celulas = (itens, x, y, largura, colunas) =>
    itens.map((item, i) => {
      const lw = largura / colunas
      return { ...item, x: Math.round(x + (i % colunas) * lw), y: y + Math.floor(i / colunas) * linha, w: Math.round(lw), h: linha }
    })

  if (formato.id === 'panoramica') {
    // o quadro à esquerda, tudo o que é texto numa coluna à direita
    const coluna = Math.round(w * 0.27)
    const area = { x: m, y: m, w: w - 3 * m - coluna, h: h - 2 * m - faixa - Math.round(m * 0.4) }
    const iw = Math.min(area.w, area.h * proporcao)
    const ih = iw / proporcao
    const imagem = { x: Math.round(area.x + (area.w - iw) / 2), y: Math.round(area.y + (area.h - ih) / 2), w: Math.round(iw), h: Math.round(ih) }
    const cx = w - m - coluna
    const blocoCreditos = celulas(creditos, cx, m + cabeca + Math.round(m * 0.5), coluna, 1)
    const fimCreditos = m + cabeca + Math.round(m * 0.5) + creditos.length * linha
    const blocoTecnica = celulas(tecnica, cx, h - m - tecnica.length * linha, coluna, 1)
    return {
      w,
      h,
      tema,
      titulo: { texto: titulo, x: cx, y: m, w: coluna - cabeca, h: cabeca },
      marca: { x: w - m - Math.round(cabeca * 0.62), y: m + Math.round(cabeca * 0.19), w: Math.round(cabeca * 0.62), h: Math.round(cabeca * 0.62) },
      creditos: blocoCreditos,
      fimCreditos,
      imagem,
      pontos: paleta.map((p) => ({ x: Math.round(imagem.x + p.x * imagem.w), y: Math.round(imagem.y + p.y * imagem.h), r: Math.round(w * 0.007), cor: p.hex })),
      amostras: paleta.map((p, i) => ({ x: Math.round(imagem.x + (i * imagem.w) / paleta.length), y: imagem.y + imagem.h + Math.round(m * 0.4), w: Math.ceil(imagem.w / paleta.length), h: faixa, cor: p.hex })),
      tecnica: blocoTecnica,
    }
  }

  // quadrada: título, créditos, o quadro, a paleta e a técnica, de cima para baixo, centrados na altura
  const largura = w - 2 * m
  const colunasTec = 3
  const linhasTec = Math.ceil(tecnica.length / colunasTec)
  const fixo = cabeca + (creditos.length ? linha : 0) + faixa + linhasTec * linha
  const ih = Math.min(largura / proporcao, h - 2 * m - fixo)
  const iw = ih * proporcao
  const total = fixo + ih
  let y = Math.round((h - total) / 2)
  const saida = { w, h, tema }
  saida.titulo = { texto: titulo, x: m, y, w: largura - cabeca, h: cabeca }
  saida.marca = { x: w - m - Math.round(cabeca * 0.62), y: y + Math.round(cabeca * 0.19), w: Math.round(cabeca * 0.62), h: Math.round(cabeca * 0.62) }
  y += cabeca
  saida.creditos = celulas(creditos, m, y, largura, Math.max(1, creditos.length))
  if (creditos.length) y += linha
  saida.fimCreditos = y
  saida.imagem = { x: Math.round(m + (largura - iw) / 2), y, w: Math.round(iw), h: Math.round(ih) }
  y += Math.round(ih)
  saida.pontos = paleta.map((p) => ({ x: Math.round(saida.imagem.x + p.x * saida.imagem.w), y: Math.round(saida.imagem.y + p.y * saida.imagem.h), r: Math.round(w * 0.008), cor: p.hex }))
  saida.amostras = paleta.map((p, i) => ({ x: Math.round(m + (i * largura) / paleta.length), y, w: Math.ceil(largura / paleta.length), h: faixa, cor: p.hex }))
  y += faixa
  saida.tecnica = celulas(tecnica, m, y, largura, colunasTec)
  return saida
}

const FONTE = "'Figtree Variable', 'Inter Variable', -apple-system, system-ui, sans-serif"

/** Escreve `valor` em até `largura` px: diminui a letra até caber e, no limite, corta com reticências. */
function escrever(ctx, valor, x, y, largura, tamanho, peso) {
  let t = tamanho
  ctx.font = `${peso} ${t}px ${FONTE}`
  while (ctx.measureText(valor).width > largura && t > tamanho * 0.6) {
    t -= 1
    ctx.font = `${peso} ${t}px ${FONTE}`
  }
  let s = valor
  while (s.length > 1 && ctx.measureText(s).width > largura) s = `${s.slice(0, -2).trimEnd()}…`
  ctx.fillText(s, x, y)
}

function celula(ctx, c, tema, escala) {
  // a letra acompanha a altura da célula: rótulo pequeno em cima, valor embaixo, sem um encostar no outro
  const dentro = Math.round(c.h * 0.125)
  ctx.fillStyle = tema.mudo
  ctx.font = `600 ${Math.round(c.h * 0.152)}px ${FONTE}`
  ctx.fillText(c.rotulo.toUpperCase(), c.x + dentro, c.y + Math.round(c.h * 0.36))
  ctx.fillStyle = tema.texto
  escrever(ctx, c.valor, c.x + dentro, c.y + Math.round(c.h * 0.78), c.w - 2 * dentro, Math.round(c.h * 0.27), 600)
  ctx.strokeStyle = tema.linha
  ctx.lineWidth = Math.max(1, Math.round(1.5 * escala))
  ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w, c.h)
}

/**
 * Pinta a ficha num contexto 2D. `plano` é o que `montarFicha` devolveu; `imagem` é o quadro (canvas, ImageBitmap…)
 * e `marca`, se vier, o símbolo da Revela. O canvas precisa ter plano.w × plano.h.
 */
export function desenharFicha(ctx, plano, { imagem, marca } = {}) {
  const { tema } = plano
  const escala = plano.w / 2160
  ctx.save()
  ctx.fillStyle = tema.fundo
  ctx.fillRect(0, 0, plano.w, plano.h)
  ctx.textBaseline = 'alphabetic'
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'

  // título: caixa alta, pesado, como a claquete
  ctx.fillStyle = tema.texto
  escrever(ctx, plano.titulo.texto.toUpperCase(), plano.titulo.x, plano.titulo.y + Math.round(plano.titulo.h * 0.68), plano.titulo.w, Math.round(plano.titulo.h * 0.5), 800)
  if (marca) ctx.drawImage(marca, plano.marca.x, plano.marca.y, plano.marca.w, plano.marca.h)

  for (const c of plano.creditos) celula(ctx, c, tema, escala)

  const q = plano.imagem
  if (imagem) ctx.drawImage(imagem, q.x, q.y, q.w, q.h)
  else {
    ctx.fillStyle = tema.papel
    ctx.fillRect(q.x, q.y, q.w, q.h)
  }

  // onde está cada cor: um anel claro com a cor dentro
  for (const p of plano.pontos) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    ctx.fillStyle = p.cor
    ctx.fill()
    ctx.lineWidth = Math.max(2, Math.round(p.r * 0.28))
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r + ctx.lineWidth / 2 + 0.5, 0, Math.PI * 2)
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.stroke()
  }
  for (const a of plano.amostras) {
    ctx.fillStyle = a.cor
    ctx.fillRect(a.x, a.y, a.w, a.h)
  }
  for (const c of plano.tecnica) celula(ctx, c, tema, escala)
  ctx.restore()
}
