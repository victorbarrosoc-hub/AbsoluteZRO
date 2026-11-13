// O que a lupa desenha por cima da foto e o que ela escreve ao lado, a partir do que a análise guardou no catálogo.
// Geometria pura, sem DOM: tudo em FRAÇÃO do quadro (0 a 1, origem no canto de cima à esquerda), para a lupa
// multiplicar pelo tamanho em que a foto aparece, qualquer que seja ele. Nenhuma frase é escrita aqui: todas vêm de
// src/decupagem/textos.js.
//
//   sobreposicao(foto) → {
//     quadro: { largura, altura }                  px da prévia que foi medida (a proporção da foto)
//     rostos: [{ x, y, largura, altura,             a caixa do rosto
//                estado: 'abertos' | 'sorrindo' | 'parcial' | 'fechados' | 'semLeitura' | 'duvidoso',
//                rotulo, principal, chave, cortado,
//                olhos: [{ x, y }, { x, y }] | null }]   o centro de cada olho
//     nitidez: { colunas, linhas, celulas: [{ x, y, largura, altura, valor: 0..1, nivel: 'alta' | 'media' | 'baixa' }] } | null
//     tremido: { x1, y1, x2, y2, angulo, comprimento, forte, rotulo } | null   a direção do rastro, no centro do quadro
//   }
//   resumoDaFoto(foto) → as frases prontas da ficha da foto (ver abaixo)

import { valoresDoMapa } from './compacto.js'
import { ANALISE, BALDE_DA_FOTO, CENAS, CONFIANCAS, EMPATE, GRUPOS, NO_GRUPO, OLHOS } from '../../src/decupagem/textos.js'

const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const limitar = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v)

/** O quadro em px da prévia medida (é a régua de tudo o que a análise guardou). */
export function quadroDe(foto) {
  const m = foto?.medidas
  const largura = numero(m?.largura)
  const altura = numero(m?.altura)
  return largura && altura ? { largura, altura } : null
}

/** O estado que a lupa mostra para um rosto (o que não foi lido aparece como tal). */
export function estadoDoRosto(rosto) {
  if (rosto?.duvidoso) return 'duvidoso'
  return rosto?.olhos ?? 'semLeitura'
}

function rostosDe(foto, q) {
  if (!Array.isArray(foto?.rostos)) return []
  return foto.rostos
    .filter((r) => r?.caixa && r.caixa.largura > 0 && r.caixa.altura > 0)
    .map((r) => {
      const c = r.caixa
      const estado = estadoDoRosto(r)
      const olhos = Array.isArray(r.pontos) && r.pontos.length === 2 && r.pontos.every((p) => numero(p?.x) != null && numero(p?.y) != null) ? r.pontos : null
      return {
        x: c.x / q.largura,
        y: c.y / q.altura,
        largura: c.largura / q.largura,
        altura: c.altura / q.altura,
        estado,
        rotulo: OLHOS[estado],
        principal: r.principal === true,
        chave: r.chave === true,
        cortado: r.cortado === true,
        olhos: olhos ? olhos.map((p) => ({ x: p.x / q.largura, y: p.y / q.altura })) : null,
      }
    })
}

/**
 * O mapa de nitidez em blocos (o de medir(): blocos de 32 px a partir do pixel 1, por causa da borda do Sobel).
 * `valor` é o contraste de borda do bloco sobre o percentil 95 da foto (o que é nítido nesta foto fica perto de 1);
 * `nivel` corta em 2/3 e 1/3 disso.
 */
function nitidezDe(foto, q) {
  const mapa = foto?.medidas?.nitidez?.mapa
  const valores = valoresDoMapa(mapa)
  if (!valores || !mapa.colunas || !mapa.linhas) return null
  const ordenados = Float32Array.from(valores).sort()
  const topo = ordenados[Math.min(ordenados.length - 1, Math.floor(0.95 * (ordenados.length - 1)))]
  if (!(topo > 0)) return null
  const b = mapa.bloco
  const celulas = []
  for (let l = 0; l < mapa.linhas; l++) {
    for (let c = 0; c < mapa.colunas; c++) {
      const valor = limitar(valores[l * mapa.colunas + c] / topo)
      celulas.push({
        x: (1 + c * b) / q.largura,
        y: (1 + l * b) / q.altura,
        largura: b / q.largura,
        altura: b / q.altura,
        valor: Math.round(valor * 1000) / 1000,
        nivel: valor >= 2 / 3 ? 'alta' : valor >= 1 / 3 ? 'media' : 'baixa',
      })
    }
  }
  return { colunas: mapa.colunas, linhas: mapa.linhas, celulas }
}

/**
 * A direção do tremido: um segmento no centro do quadro, do comprimento do rastro (px da prévia) e no ângulo que o
 * cepstro mediu (0° = horizontal, crescendo no sentido horário da tela, como em medidas.js).
 */
function tremidoDe(foto, q) {
  const b = foto?.medidas?.borrao
  if (b?.tipo !== 'movimento' || numero(b.comprimento) == null || numero(b.angulo) == null) return null
  const t = (b.angulo * Math.PI) / 180
  const dx = (Math.cos(t) * b.comprimento) / 2
  const dy = (Math.sin(t) * b.comprimento) / 2
  const cx = q.largura / 2
  const cy = q.altura / 2
  return {
    x1: (cx - dx) / q.largura,
    y1: (cy - dy) / q.altura,
    x2: (cx + dx) / q.largura,
    y2: (cy + dy) / q.altura,
    angulo: b.angulo,
    comprimento: b.comprimento,
    forte: b.grau === 'forte',
    rotulo: ANALISE.tremido(b.comprimento),
  }
}

/** A sobreposição inteira da lupa. Foto ainda não medida: null. */
export function sobreposicao(foto) {
  const q = quadroDe(foto)
  if (!q) return null
  return { quadro: q, rostos: rostosDe(foto, q), nitidez: nitidezDe(foto, q), tremido: tremidoDe(foto, q) }
}

/**
 * As frases prontas da ficha da foto:
 *   { analisada, nota, estrelas, balde: { id, texto } | null, motivos: [frases], confianca: { id, texto } | null,
 *     incertezas: [frases], dicas: [frases], cena: { id, texto, porque } | null,
 *     grupo: { tipo, texto, papel: 'escolhida' | 'equivalente' | 'reserva', frase, empate } | null,
 *     rostos: [{ estado, texto }], raw: frase | null, aviso: frase | null }
 * Sem nota ainda: `analisada: false` e o aviso de que está na fila.
 */
export function resumoDaFoto(foto) {
  const m = foto?.magnitude
  const cena = foto?.cena && CENAS[foto.cena] ? { id: foto.cena, texto: CENAS[foto.cena], porque: foto.analise?.cena?.porque ?? null } : null
  const e = foto?.escolha
  let grupo = null
  if (e && e.tamanho >= 2) {
    const papel = e.escolhida ? 'escolhida' : e.equivalente ? 'equivalente' : 'reserva'
    grupo = {
      tipo: e.tipo,
      texto: GRUPOS[e.tipo] ?? null,
      papel,
      frase: NO_GRUPO[papel](e.tamanho),
      empate: e.escolhida && e.equivalentes > 1 ? [EMPATE.equivalentes(e.equivalentes), e.desempate && EMPATE[e.desempate] ? EMPATE[e.desempate]() : null].filter(Boolean) : [],
    }
  }
  const rostos = Array.isArray(foto?.rostos) ? foto.rostos.map((r) => ({ estado: estadoDoRosto(r), texto: OLHOS[estadoDoRosto(r)] })) : []
  const raw = foto?.analise?.raw === 'lido' ? ANALISE.rawLido() : foto?.analise?.raw?.erro ? ANALISE.rawNaoAbriu() : null
  if (!m) {
    return {
      analisada: false,
      nota: null,
      estrelas: null,
      balde: null,
      motivos: [],
      confianca: null,
      incertezas: [],
      dicas: [],
      cena,
      grupo,
      rostos,
      raw,
      aviso: foto?.semPrevia ? ANALISE.semPrevia() : ANALISE.naFila(),
    }
  }
  return {
    analisada: true,
    nota: m.total,
    estrelas: m.estrelas,
    balde: m.balde ? { id: m.balde, texto: BALDE_DA_FOTO[m.balde] } : null,
    motivos: [...(m.motivos ?? [])],
    confianca: m.confianca ? { id: m.confianca, texto: CONFIANCAS[m.confianca] } : null,
    incertezas: [...(m.incertezas ?? [])],
    dicas: [...(m.dicas ?? [])],
    cena,
    grupo,
    rostos,
    raw,
    aviso: null,
  }
}
