// A Z no Rift — por ora só para quem está em RIFT_Z_LIBERADOS (lista de subs da Absolute ZRO, separada por vírgula;
// decisão do titular, 01/11/2026: a Z entra nas plataformas só na fase 2). Sem ANTHROPIC_API_KEY ou sem teto por dia
// (RIFT_Z_LIMITE_DIA), ela fica desligada e diz isso; nunca finge responder.
export const zLiberado = (sub) =>
  typeof sub === 'string' &&
  !!sub &&
  String(process.env.RIFT_Z_LIBERADOS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(sub)
export const zChave = () => (process.env.ANTHROPIC_API_KEY || '').trim()
export const zLimiteDia = () => {
  const n = Number(process.env.RIFT_Z_LIMITE_DIA)
  return Number.isInteger(n) && n > 0 ? n : 0
}
export const Z_MODELO = 'claude-opus-5-5'
