// Tamanho, posição e zoom da janela, lembrados entre aberturas (janela.json na pasta de dados do app).
// Sem Electron aqui: o main.cjs passa as telas (screen.getAllDisplays) e os testes passam telas falsas.

const fs = require('node:fs')
const path = require('node:path')

const ARQUIVO = 'janela.json'
const PADRAO = { width: 1360, height: 880 }
const MINIMO = { width: 960, height: 620 }
const ZOOM = { min: -3, max: 4 }

const numero = (v) => (Number.isFinite(v) ? Math.round(v) : null)

/**
 * Confere o estado salvo contra as telas de agora. A janela volta onde estava só se o título dela ainda cai numa
 * tela ligada (monitor externo desconectado = janela centralizada na tela principal, no tamanho que cabe).
 */
function estadoValido(salvo, telas) {
  const s = salvo && typeof salvo === 'object' ? salvo : {}
  const areas = (telas || []).map((t) => t && t.workArea).filter(Boolean)
  const principal = areas[0] || { x: 0, y: 0, width: PADRAO.width, height: PADRAO.height }
  const zoom = Number.isFinite(s.zoom) ? Math.min(ZOOM.max, Math.max(ZOOM.min, Math.round(s.zoom * 2) / 2)) : 0
  let width = numero(s.width) || PADRAO.width
  let height = numero(s.height) || PADRAO.height
  width = Math.max(MINIMO.width, Math.min(width, principal.width || width))
  height = Math.max(MINIMO.height, Math.min(height, principal.height || height))
  const x = numero(s.x)
  const y = numero(s.y)
  const out = { width, height, maximizada: !!s.maximizada, telaCheia: !!s.telaCheia, zoom }
  if (x != null && y != null) {
    // o pedaço de cima da janela (onde fica o título) precisa estar dentro de alguma tela
    const titulo = { x: x + 40, y: y + 10 }
    const visivel = areas.some((a) => titulo.x >= a.x && titulo.x < a.x + a.width - 40 && titulo.y >= a.y && titulo.y < a.y + a.height - 40)
    if (visivel) Object.assign(out, { x, y })
  }
  return out
}

function ler(pasta) {
  try {
    return JSON.parse(fs.readFileSync(path.join(pasta, ARQUIVO), 'utf8'))
  } catch {
    return null
  }
}

function gravar(pasta, estado) {
  try {
    fs.mkdirSync(pasta, { recursive: true })
    const tmp = path.join(pasta, `${ARQUIVO}.tmp`)
    fs.writeFileSync(tmp, JSON.stringify(estado))
    fs.renameSync(tmp, path.join(pasta, ARQUIVO))
  } catch {
    // sem disco ou sem permissão: a janela só não lembra o tamanho
  }
}

module.exports = { ARQUIVO, PADRAO, MINIMO, ZOOM, estadoValido, ler, gravar }
