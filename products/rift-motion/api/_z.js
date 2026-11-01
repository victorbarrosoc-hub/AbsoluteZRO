// A Z no Rift — por ora só para quem está em RIFT_Z_LIBERADOS (lista de subs da Absolute ZRO, separada por vírgula;
// decisão do titular, 01/11/2026: a Z entra nas plataformas só na fase 2). É a Z do HUB (caminho A, pedido do
// titular): o Rift não guarda chave do Claude; pede em /api/v1/ia/rift com a credencial do cliente rift-web. Sem o
// login configurado ou sem teto por dia (RIFT_Z_LIMITE_DIA), ela fica desligada e diz isso; nunca finge responder.
export const zLiberado = (sub) =>
  typeof sub === 'string' &&
  !!sub &&
  String(process.env.RIFT_Z_LIBERADOS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(sub)
export const zLimiteDia = () => {
  const n = Number(process.env.RIFT_Z_LIMITE_DIA)
  return Number.isInteger(n) && n > 0 ? n : 0
}
export const Z_MODELO = 'z-do-hub'
