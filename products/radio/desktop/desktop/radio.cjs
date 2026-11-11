// O que o RADION para computador faz de próprio, sem importar o Electron (os testes em test/ usam node --test): o estado
// que a página conta (conferido campo a campo), o que a barra de menus e o ícone mostram, os atalhos de falar e o
// tamanho do modo compacto. O main.cjs liga isso ao Tray, ao globalShortcut, ao Dock e ao powerSaveBlocker.

const MODOS = new Set(['mudo', 'aberto', 'ptt'])

/** Texto curto e limpo (sem controle nem bidi), ou null. */
function texto(v, max) {
  if (typeof v !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, '').trim().slice(0, max)
  return s || null
}

/** O estado que a página manda, conferido: o que não for do formato vira o padrão (rádio desligado). */
function limparEstado(e) {
  const o = e && typeof e === 'object' ? e : {}
  const maos = Number(o.maos)
  return {
    diaria: texto(o.diaria, 60),
    canal: texto(o.canal, 40),
    modo: MODOS.has(o.modo) ? o.modo : 'mudo',
    calado: o.calado === true,
    maos: Number.isInteger(maos) && maos > 0 ? Math.min(maos, 99) : 0,
    ligado: o.ligado === true,
  }
}

const ESTADO_INICIAL = limparEstado({})

/** O que aparece ao lado do ícone na barra de menus do Mac: o canal, com um ponto quando o microfone está aberto. */
function tituloDaBarra(e) {
  if (!e.ligado || !e.canal) return ''
  if (e.calado) return 'Silenciado'
  return e.modo === 'mudo' ? e.canal : `● ${e.canal}`
}

/** A dica do ícone (Windows e Mac). */
function dicaDaBandeja(e) {
  if (!e.ligado) return e.diaria ? `RADION · ${e.diaria}` : 'RADION'
  const partes = [e.diaria || 'RADION']
  if (e.calado) partes.push('silenciado')
  else partes.push(e.modo === 'mudo' ? `falar para ${e.canal || 'Geral'}` : `falando para ${e.canal || 'Geral'}`)
  if (e.maos) partes.push(e.maos === 1 ? '1 pediu a palavra' : `${e.maos} pediram a palavra`)
  return partes.join(' · ')
}

/** O selo do ícone no Dock: quantos pediram a palavra; silenciado, um ponto. */
function seloDoDock(e) {
  if (!e.ligado) return ''
  if (e.maos) return String(e.maos)
  return e.calado ? '•' : ''
}

/** Atalhos de falar, em ordem: o primeiro que o sistema deixar registrar vale (outro app pode já usar). */
const ATALHOS = ['CommandOrControl+Shift+Space', 'Alt+Shift+Space', 'CommandOrControl+Alt+Space']

/** O atalho como a pessoa lê no Mac (⌘⇧Espaço) ou no Windows (Ctrl+Shift+Espaço). */
function rotuloDoAtalho(acelerador, mac) {
  if (!acelerador) return null
  const partes = acelerador.split('+')
  const nome = {
    CommandOrControl: mac ? '⌘' : 'Ctrl',
    Alt: mac ? '⌥' : 'Alt',
    Shift: mac ? '⇧' : 'Shift',
    Space: 'Espaço',
  }
  const p = partes.map((x) => nome[x] || x)
  return mac ? p.join('') : p.join('+')
}

/** O modo compacto: uma janelinha por cima das outras, com o canal, quem fala e o botão de falar. */
const COMPACTO = { width: 380, height: 136, minWidth: 320, minHeight: 120 }

module.exports = { limparEstado, ESTADO_INICIAL, tituloDaBarra, dicaDaBandeja, seloDoDock, ATALHOS, rotuloDoAtalho, COMPACTO }
