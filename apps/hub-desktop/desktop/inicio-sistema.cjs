// Abrir com o computador e preferências do app em segundo plano (pedido do titular, 28/10/2026).
//
// - Na primeira execução do app instalado, "Abrir com o computador" fica ligado (a central precisa estar no ar para
//   manter os apps em dia). A pessoa desliga na bandeja, no menu do app ou na tela de boas-vindas; a escolha fica em
//   preferencias.json e vale daí em diante.
// - Aberto pelo sistema, o app começa escondido, só com o ícone na barra de menus/bandeja. Windows: o registro de
//   início passa `--escondido`. Mac: o sistema avisa que foi aberto no login (wasOpenedAtLogin).
// - Só o app instalado se registra (no `npm run desktop` o registro apontaria para o Electron de desenvolvimento).
//
// Sem Electron aqui: o main.cjs passa a pasta de dados, o fs e o que o sistema respondeu.

const path = require('node:path')

const ARQUIVO = 'preferencias.json'
const ESCONDIDO = '--escondido'

function lerPreferencias(fs, pasta) {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(pasta, ARQUIVO), 'utf8'))
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {}
  } catch {
    return {}
  }
}

function gravarPreferencias(fs, pasta, mudancas) {
  const prefs = { ...lerPreferencias(fs, pasta), ...mudancas }
  try {
    fs.mkdirSync(pasta, { recursive: true })
    fs.writeFileSync(path.join(pasta, ARQUIVO), JSON.stringify(prefs, null, 2))
  } catch {
    // sem disco: vale só até fechar
  }
  return prefs
}

/** Abrir com o computador? Sem escolha gravada (primeira execução) = ligado. */
function abrirComSistema(prefs) {
  return typeof (prefs && prefs.abrirComSistema) === 'boolean' ? prefs.abrirComSistema : true
}

/** O sistema tem a opção (e o app pode se registrar)? */
function suportado({ plataforma, empacotado }) {
  return !!empacotado && (plataforma === 'mac' || plataforma === 'windows')
}

/** Parâmetros de app.setLoginItemSettings para ligar ou desligar. */
function opcoesDeLogin({ plataforma, ligado, exe }) {
  if (plataforma === 'windows') return { openAtLogin: !!ligado, path: exe, args: ligado ? [ESCONDIDO] : [] }
  if (plataforma === 'mac') return { openAtLogin: !!ligado }
  return null
}

/**
 * O que vale ao abrir o app. Primeira execução (nada gravado): liga e registra. Depois, o sistema manda: se a pessoa
 * desligou (ou ligou) nos Ajustes do Mac ou no Gerenciador de Tarefas do Windows, o app segue essa escolha e não
 * registra de novo. `sistema` = o que o sistema diz (true/false) ou null quando não dá para saber.
 * @returns {{ ligado: boolean, registrar: boolean, gravar: boolean }}
 */
function estadoNaAbertura({ prefs, sistema }) {
  if (typeof (prefs && prefs.abrirComSistema) !== 'boolean') return { ligado: true, registrar: true, gravar: true }
  if (typeof sistema !== 'boolean' || sistema === prefs.abrirComSistema) return { ligado: prefs.abrirComSistema, registrar: false, gravar: false }
  return { ligado: sistema, registrar: false, gravar: true }
}

/** Começar escondido, só com o ícone? (aberto pelo sistema ao ligar o computador) */
function iniciarEscondido({ argv = [], plataforma, abertoNoLogin = false }) {
  if (argv.includes(ESCONDIDO)) return true
  return plataforma === 'mac' && !!abertoNoLogin
}

module.exports = { ARQUIVO, ESCONDIDO, lerPreferencias, gravarPreferencias, abrirComSistema, suportado, opcoesDeLogin, estadoNaAbertura, iniciarEscondido }
