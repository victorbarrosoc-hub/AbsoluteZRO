// Bandeja do sistema (Windows), barra de menus (Mac) e área de notificação (Linux): o que dá para testar sem Electron.
// O main.js cria o Tray, liga os eventos da janela e chama estas funções para decidir o que fazer.
//
// Pedido de um cliente no Windows: minimizar manda o SOBEDESCE para a bandeja, não para a barra de tarefas.
//  - Minimizar: com "Minimizar para a bandeja" ligado (padrão no Windows, desligado no Mac e no Linux), a janela some
//    da barra de tarefas e fica só o ícone perto do relógio. Clique (ou clique duplo) no ícone traz de volta.
//  - Fechar no X: igual a antes (sem transferência andando, o app fecha). Com transferência andando e a bandeja
//    ligada, a janela vai para a bandeja em vez de perguntar "Sair?", para nada parar sem querer. Com a bandeja
//    desligada continua a pergunta de antes (as transferências pausam e continuam na próxima abertura).
//  - Mac: fechar a janela nunca fecha o app (padrão do macOS, o Dock continua); o ícone na barra de menus é só atalho.
import fs from 'node:fs'
import path from 'node:path'

const ARQUIVO = 'bandeja.json'

/** "Minimizar para a bandeja" vem ligado só no Windows (no Mac o Dock já faz esse papel). */
export function padraoMinimizar(plataforma) {
  return plataforma === 'win32'
}

/** O valor que vale: o escolhido nos Ajustes ou, sem escolha, o padrão do sistema. */
export function minimizarLigado(prefs, plataforma) {
  return typeof prefs?.minimizar === 'boolean' ? prefs.minimizar : padraoMinimizar(plataforma)
}

/**
 * O que fazer quando a pessoa minimiza a janela.
 * @returns {'bandeja'|'normal'} bandeja = esconde a janela e tira da barra de tarefas
 */
export function acaoAoMinimizar({ plataforma, minimizar, temBandeja }) {
  if (!temBandeja) return 'normal'
  return minimizar ?? padraoMinimizar(plataforma) ? 'bandeja' : 'normal'
}

/**
 * O que fazer quando a pessoa fecha a janela (X, Alt+F4).
 * @returns {'fechar'|'bandeja'|'perguntar'} fechar = deixa fechar (no Windows/Linux isso encerra o app; no Mac só a
 *   janela); bandeja = esconde na bandeja e as transferências seguem; perguntar = o diálogo "Sair do SOBEDESCE?"
 */
export function acaoAoFechar({ plataforma, minimizar, temBandeja, transferencias = 0, saindo = false, confirmado = false }) {
  if (saindo || plataforma === 'darwin') return 'fechar'
  if (!(transferencias > 0)) return 'fechar'
  if (temBandeja && (minimizar ?? padraoMinimizar(plataforma))) return 'bandeja'
  return confirmado ? 'fechar' : 'perguntar'
}

/** A linha de estado do menu da bandeja. */
export function textoTransferencias(n) {
  const v = Math.max(0, Number(n) || 0)
  if (!v) return 'Nenhuma transferência agora'
  return v === 1 ? '1 transferência em andamento' : `${v} transferências em andamento`
}

/** Dica ao parar o ponteiro no ícone. */
export function dicaBandeja(n) {
  return Number(n) > 0 ? `SOBEDESCE · ${textoTransferencias(n)}` : 'SOBEDESCE'
}

/** Menu da bandeja como lista (o main.js monta o Menu do Electron e liga cada `acao`). */
export function modeloMenuBandeja(transferencias) {
  return [
    { tipo: 'item', acao: 'abrir', rotulo: 'Abrir SOBEDESCE' },
    { tipo: 'separador' },
    { tipo: 'item', rotulo: textoTransferencias(transferencias), ativo: false },
    { tipo: 'separador' },
    { tipo: 'item', acao: 'sair', rotulo: 'Sair' },
  ]
}

/** Arquivo do ícone para cada sistema (desktop/bandeja/, gerado por scripts/bandeja-icones.mjs). */
export function iconeBandeja(plataforma) {
  if (plataforma === 'darwin') return { arquivo: 'bandejaTemplate.png', template: true }
  if (plataforma === 'win32') return { arquivo: 'bandeja.ico', template: false }
  return { arquivo: 'bandeja.png', template: false }
}

/** O aviso "continua aqui na bandeja" sai uma vez só, e só quando a janela de fato foi para a bandeja. */
export function deveAvisar(prefs) {
  return !prefs?.avisou
}

export const AVISO_BANDEJA = { titulo: 'SOBEDESCE', texto: 'O SOBEDESCE continua aqui na bandeja.' }

/** Lê <userData>/bandeja.json ({ minimizar?: boolean, avisou?: boolean }); qualquer coisa estranha vira {}. */
export function lerPrefs(userData) {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(userData, ARQUIVO), 'utf8'))
    const out = {}
    if (typeof p?.minimizar === 'boolean') out.minimizar = p.minimizar
    if (p?.avisou === true) out.avisou = true
    return out
  } catch {
    return {}
  }
}

/** Junta `mudanca` ao que está gravado e grava. Devolve o novo objeto (ou o antigo, se não deu para gravar). */
export function gravarPrefs(userData, mudanca) {
  const atual = { ...lerPrefs(userData), ...mudanca }
  try {
    fs.mkdirSync(userData, { recursive: true })
    fs.writeFileSync(path.join(userData, ARQUIVO), JSON.stringify(atual))
  } catch {
    // sem gravar: vale até fechar o app
  }
  return atual
}
