// QR Code próprio, sem dependência: o endereço da galeria do cliente e do evento vira um SVG que a câmera do celular
// lê. Só o que o link precisa: modo byte (UTF-8), correção de erro M (15%), versões 1 a 10 (até 213 bytes; o endereço
// tem ~75).
//
// ISO/IEC 18004:2015: 7.4.5 (modo byte), 7.4.10 (terminador e preenchimento 0xEC 0x11), 7.5 (Reed-Solomon em GF(256)
// com o polinômio 0x11D), 7.6 (blocos intercalados), 7.7 (padrões de função), 7.7.3 (colocação em zigue-zague),
// 7.8 (as oito máscaras e a penalidade N1–N4), 7.9 (formato: BCH(15,5), máscara 0x5412) e 7.10 (versão: BCH(18,6)).
// A colocação segue a mesma ordem do gerador de Kazuhiko Arase (MIT, o que o RADION usa em products/radio): o teste
// confere módulo a módulo contra ele.

const MODO_BYTE = 0b0100
// nível M: [palavras de correção por bloco, [blocos, dados por bloco], ...] por versão (tabela 9 da norma)
const BLOCOS_M = [
  null,
  [10, [1, 16]],
  [16, [1, 28]],
  [26, [1, 44]],
  [18, [2, 32]],
  [24, [2, 43]],
  [16, [4, 27]],
  [18, [4, 31]],
  [22, [2, 38], [2, 39]],
  [22, [3, 36], [2, 37]],
  [26, [4, 43], [1, 44]],
]
const ALINHAMENTO = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]]
export const VERSAO_MAXIMA = BLOCOS_M.length - 1

// ─────────── GF(256) e Reed-Solomon ───────────

const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x
  LOG[x] = i
  x <<= 1
  if (x & 0x100) x ^= 0x11d
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
const vezes = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0)

function gerador(grau) {
  let g = [1]
  for (let i = 0; i < grau; i++) {
    const novo = new Array(g.length + 1).fill(0)
    for (let j = 0; j < g.length; j++) {
      novo[j] ^= g[j]
      novo[j + 1] ^= vezes(g[j], EXP[i])
    }
    g = novo
  }
  return g
}

function correcao(dados, grau) {
  const g = gerador(grau)
  const resto = [...dados, ...new Array(grau).fill(0)]
  for (let i = 0; i < dados.length; i++) {
    const c = resto[i]
    if (!c) continue
    for (let j = 0; j < g.length; j++) resto[i + j] ^= vezes(g[j], c)
  }
  return resto.slice(dados.length)
}

// ─────────── dados ───────────

const capacidade = (v) => BLOCOS_M[v].slice(1).reduce((s, [n, k]) => s + n * k, 0)
const bitsDaContagem = (v) => (v < 10 ? 8 : 16)

/** A menor versão que comporta `n` bytes no nível M, ou null. */
export function versaoPara(n) {
  for (let v = 1; v <= VERSAO_MAXIMA; v++) if (4 + bitsDaContagem(v) + 8 * n <= capacidade(v) * 8) return v
  return null
}

function palavras(bytes, v) {
  const total = capacidade(v)
  const bits = []
  const por = (valor, n) => {
    for (let i = n - 1; i >= 0; i--) bits.push((valor >>> i) & 1)
  }
  por(MODO_BYTE, 4)
  por(bytes.length, bitsDaContagem(v))
  for (const b of bytes) por(b, 8)
  if (bits.length + 4 <= total * 8) por(0, 4)
  while (bits.length % 8) bits.push(0)
  const dados = []
  for (let i = 0; i < bits.length; i += 8) dados.push(bits.slice(i, i + 8).reduce((s, b) => (s << 1) | b, 0))
  for (let p = 0; dados.length < total; p++) dados.push(p % 2 ? 0x11 : 0xec)
  // blocos, correção e intercalação
  const [ec, ...grupos] = BLOCOS_M[v]
  const blocos = []
  let q = 0
  for (const [n, k] of grupos) {
    for (let i = 0; i < n; i++) {
      const parte = dados.slice(q, q + k)
      q += k
      blocos.push({ dados: parte, ec: correcao(parte, ec) })
    }
  }
  const saida = []
  const maior = Math.max(...blocos.map((b) => b.dados.length))
  for (let i = 0; i < maior; i++) for (const b of blocos) if (i < b.dados.length) saida.push(b.dados[i])
  for (let i = 0; i < ec; i++) for (const b of blocos) saida.push(b.ec[i])
  return saida
}

// ─────────── a matriz ───────────

const MASCARAS = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i * j) % 3) + ((i + j) % 2)) % 2 === 0,
]

function bch(valor, gerador, grau) {
  let d = valor << grau
  const topo = (x) => 31 - Math.clz32(x)
  while (d && topo(d) >= grau) d ^= gerador << (topo(d) - grau)
  return (valor << grau) | d
}
// nível M = 00
const formato = (mascara) => bch((0b00 << 3) | mascara, 0x537, 10) ^ 0x5412
const versaoBits = (v) => bch(v, 0x1f25, 12)

function montar(v, dados, mascara) {
  const n = v * 4 + 17
  const m = Array.from({ length: n }, () => new Array(n).fill(null))
  const localizador = (linha, coluna) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        if (linha + r < 0 || linha + r >= n || coluna + c < 0 || coluna + c >= n) continue
        const borda = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6))
        const miolo = r >= 2 && r <= 4 && c >= 2 && c <= 4
        m[linha + r][coluna + c] = borda || miolo
      }
    }
  }
  localizador(0, 0)
  localizador(n - 7, 0)
  localizador(0, n - 7)
  for (const r of ALINHAMENTO[v]) {
    for (const c of ALINHAMENTO[v]) {
      if (m[r][c] !== null) continue
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) m[r + dr][c + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1
    }
  }
  for (let i = 8; i < n - 8; i++) {
    if (m[i][6] === null) m[i][6] = i % 2 === 0
    if (m[6][i] === null) m[6][i] = i % 2 === 0
  }
  const f = formato(mascara)
  for (let i = 0; i < 15; i++) {
    const escuro = ((f >> i) & 1) === 1
    if (i < 6) m[i][8] = escuro
    else if (i < 8) m[i + 1][8] = escuro
    else m[n - 15 + i][8] = escuro
    if (i < 8) m[8][n - i - 1] = escuro
    else if (i < 9) m[8][15 - i] = escuro
    else m[8][14 - i] = escuro
  }
  m[n - 8][8] = true
  if (v >= 7) {
    const b = versaoBits(v)
    for (let i = 0; i < 18; i++) {
      const escuro = ((b >> i) & 1) === 1
      m[Math.floor(i / 3)][(i % 3) + n - 11] = escuro
      m[(i % 3) + n - 11][Math.floor(i / 3)] = escuro
    }
  }
  // zigue-zague de baixo para cima, duas colunas por vez, pulando a coluna 6 (tempo)
  const mascarar = MASCARAS[mascara]
  let sobe = -1
  let linha = n - 1
  let bit = 7
  let byte = 0
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--
    for (;;) {
      for (let c = 0; c < 2; c++) {
        if (m[linha][col - c] !== null) continue
        let escuro = byte < dados.length && ((dados[byte] >>> bit) & 1) === 1
        if (mascarar(linha, col - c)) escuro = !escuro
        m[linha][col - c] = escuro
        if (--bit < 0) {
          byte++
          bit = 7
        }
      }
      linha += sobe
      if (linha < 0 || linha >= n) {
        linha -= sobe
        sobe = -sobe
        break
      }
    }
  }
  return m
}

/** Penalidade da norma (7.8.3): N1 corridas, N2 blocos 2×2, N3 o padrão do localizador, N4 equilíbrio. */
export function penalidade(m) {
  const n = m.length
  let p = 0
  const corrida = (ler) => {
    for (let a = 0; a < n; a++) {
      let atual = ler(a, 0)
      let tam = 1
      for (let b = 1; b <= n; b++) {
        const v = b < n ? ler(a, b) : !atual
        if (v === atual) tam++
        else {
          if (tam >= 5) p += 3 + (tam - 5)
          atual = v
          tam = 1
        }
      }
    }
  }
  corrida((a, b) => m[a][b])
  corrida((a, b) => m[b][a])
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) p += 3
  const padrao = [true, false, true, true, true, false, true]
  const casa = (ler, a, b) => padrao.every((v, k) => ler(a, b + k) === v)
  const claro = (ler, a, de, ate) => {
    for (let k = de; k < ate; k++) if (k >= 0 && k < n && ler(a, k)) return false
    return true
  }
  for (const ler of [(a, b) => m[a][b], (a, b) => m[b][a]]) {
    for (let a = 0; a < n; a++) {
      for (let b = 0; b + 7 <= n; b++) {
        if (!casa(ler, a, b)) continue
        if (claro(ler, a, b - 4, b) || claro(ler, a, b + 7, b + 11)) p += 40
      }
    }
  }
  let escuros = 0
  for (const linha of m) for (const v of linha) if (v) escuros++
  p += 10 * Math.floor(Math.abs((escuros * 100) / (n * n) - 50) / 5)
  return p
}

/**
 * A matriz do QR de um texto: { versao, mascara, tamanho, modulos: boolean[][] } (true = escuro). `mascara` (0–7)
 * força uma; sem ela, vale a de menor penalidade. Texto grande demais para a versão 10 lança.
 */
export function qrMatriz(texto, { mascara = null } = {}) {
  const bytes = new TextEncoder().encode(String(texto))
  const v = versaoPara(bytes.length)
  if (!v) throw new Error(`QR: ${bytes.length} bytes não cabem na versão ${VERSAO_MAXIMA}`)
  const dados = palavras(bytes, v)
  if (mascara !== null) return { versao: v, mascara, tamanho: v * 4 + 17, modulos: montar(v, dados, mascara) }
  let melhor = null
  for (let k = 0; k < 8; k++) {
    const modulos = montar(v, dados, k)
    const p = penalidade(modulos)
    if (!melhor || p < melhor.p) melhor = { p, versao: v, mascara: k, tamanho: v * 4 + 17, modulos }
  }
  return { versao: melhor.versao, mascara: melhor.mascara, tamanho: melhor.tamanho, modulos: melhor.modulos }
}

/** O QR como texto SVG: preto no branco (o que a câmera lê melhor, nos dois temas), com a margem de 4 módulos. */
export function qrSvg(texto, { rotulo = 'QR do endereço' } = {}) {
  const { tamanho: n, modulos } = qrMatriz(texto)
  const q = 4
  let d = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (modulos[r][c]) d += `M${c + q} ${r + q}h1v1h-1z`
  const lado = n + 2 * q
  const abre = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges" role="img" aria-label="${rotulo}">`
  return `${abre}<rect width="${lado}" height="${lado}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
}
