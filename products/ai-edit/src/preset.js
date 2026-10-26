// Presets de linguagem: arquivos versionados em presets/ (nunca prompt escondido no código). Aqui só se confere a
// forma e se completa o que faltar com o preset "fala" v1.

const PADRAO = {
  cortes: { silencio_min_s: 0.45, folga_s: 0.12, respiro_min_s: 0.18, respiro_max_s: 1.2, margem_palavra_s: 0.06, sobra_min_s: 0.08 },
  zoom: { escala: 1.12, enfase: 1.22, frase_min_s: 1.2, max_s: 8, pausa_frase_s: 0.6, foco: { x: 0.5, y: 0.42 } },
  legenda: { estilo: 'destaque', max_palavras: 4, max_caracteres: 24, max_s: 2.4, pausa_quebra_s: 0.35, posicao_y: 0.8, caixa_alta: false },
}

const num = (v, min, max, d) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : d)

/** Preset lido de presets/<nome>.v<N>.json → preset completo e com valores dentro dos limites. */
export function prepararPreset(bruto = {}) {
  const c = { ...PADRAO.cortes, ...(bruto.cortes || {}) }
  const z = { ...PADRAO.zoom, ...(bruto.zoom || {}) }
  const l = { ...PADRAO.legenda, ...(bruto.legenda || {}) }
  return {
    preset: typeof bruto.preset === 'string' ? bruto.preset : 'fala',
    version: Number.isInteger(bruto.version) ? bruto.version : 1,
    cortes: {
      silencio_min_s: num(c.silencio_min_s, 0.15, 5, 0.45),
      folga_s: num(c.folga_s, 0, 1, 0.12),
      respiro_min_s: num(c.respiro_min_s, 0.05, 2, 0.18),
      respiro_max_s: num(c.respiro_max_s, 0.1, 5, 1.2),
      margem_palavra_s: num(c.margem_palavra_s, 0, 0.5, 0.06),
      sobra_min_s: num(c.sobra_min_s, 0, 1, 0.08),
    },
    zoom: {
      escala: num(z.escala, 1, 2, 1.12),
      enfase: num(z.enfase, 1, 2.5, 1.22),
      frase_min_s: num(z.frase_min_s, 0.2, 10, 1.2),
      max_s: num(z.max_s, 0.5, 60, 8),
      pausa_frase_s: num(z.pausa_frase_s, 0.1, 5, 0.6),
      foco: { x: num(z.foco?.x, 0, 1, 0.5), y: num(z.foco?.y, 0, 1, 0.42) },
    },
    legenda: {
      estilo: ['destaque', 'limpa', 'pop'].includes(l.estilo) ? l.estilo : 'destaque',
      max_palavras: Math.round(num(l.max_palavras, 1, 12, 4)),
      max_caracteres: Math.round(num(l.max_caracteres, 8, 80, 24)),
      max_s: num(l.max_s, 0.5, 10, 2.4),
      pausa_quebra_s: num(l.pausa_quebra_s, 0.05, 3, 0.35),
      posicao_y: num(l.posicao_y, 0.1, 0.95, 0.8),
      caixa_alta: l.caixa_alta === true,
    },
  }
}
