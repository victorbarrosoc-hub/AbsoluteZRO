// Instalado pela central do Absolute ZRO (ADR 0018, adendo de 28/10/2026): quem atualiza o app é a central, não o
// próprio SOBEDESCE, para não haver duas atualizações disputando o mesmo app.
//
// A central (apps/hub-desktop/desktop/gerenciados.cjs) grava em <dados do sistema>/Absolute ZRO/apps-gerenciados.json
// a lista dos apps que ela mantém em dia e renova `visto` a cada conferência. Vale enquanto ela der sinal de vida
// (até 14 dias): se o Absolute ZRO sair do computador, o SOBEDESCE volta a se atualizar sozinho.
import fs from 'node:fs'
import path from 'node:path'

export const ID = 'sobedesce'
const VALIDADE_DIAS = 14

/** Caminho do arquivo da central a partir da pasta de dados do sistema (app.getPath('appData')). */
export function arquivoDaCentral(appData) {
  return appData ? path.join(appData, 'Absolute ZRO', 'apps-gerenciados.json') : ''
}

/** O mesmo `eGerenciado` da central: o app está na lista e a central conferiu nos últimos 14 dias. */
export function eGerenciado(json, id = ID, agora = Date.now()) {
  if (!json || typeof json !== 'object' || json.versao !== 1 || !json.apps || typeof json.apps !== 'object') return false
  if (!Object.prototype.hasOwnProperty.call(json.apps, id)) return false
  const visto = Date.parse(json.visto)
  if (!Number.isFinite(visto)) return false
  return agora - visto <= VALIDADE_DIAS * 86_400_000 && visto - agora <= 86_400_000
}

/** Lê o arquivo agora (a central pode ter começado a cuidar do app com ele aberto). Sem arquivo = false. */
export function lerGerenciado(arquivo, id = ID, agora = Date.now()) {
  if (!arquivo) return false
  try {
    return eGerenciado(JSON.parse(fs.readFileSync(arquivo, 'utf8')), id, agora)
  } catch {
    return false
  }
}
