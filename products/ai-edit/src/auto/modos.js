// Edição automática: os modos (Clipe, Aftermovie, Conteúdo…) e o preset de cada um. Os critérios editoriais moram em
// presets/<modo>.v<N>.json (versão publicada não muda); aqui só se confere a forma e se completa o que faltar, como
// src/preset.js faz com o de fala. Cada modo diz o que pede (música? fala?) e o que faz; a tela só mostra o que já
// funciona de verdade.

import { PADRAO_NOTA } from '../musica/nota.js'
import { PADRAO_SECOES } from '../musica/estrutura.js'

export const MODOS = Object.freeze([
  { id: 'clipe', nome: 'Clipe', dica: 'Clipe, DVD e EP: a música manda e a performance fica em sincronia', preset: 'clipe.v1.json', motor: 'musica', icone: 'i-nota' },
  { id: 'aftermovie', nome: 'Aftermovie', dica: 'Festa e evento na batida, com o melhor guardado para o drop', preset: 'aftermovie.v1.json', motor: 'musica', icone: 'i-festa' },
  { id: 'conteudo', nome: 'Conteúdo', dica: 'Fala: corta silêncio e respiro, zoom na fala e legenda', preset: 'fala.v1.json', motor: 'fala', icone: 'i-fala' },
])
export const modoPorId = (id) => MODOS.find((m) => m.id === id) || null

const TIPOS_PARTE = ['intro', 'verso', 'pre', 'refrao', 'ponte', 'final']

const num = (v, min, max, d) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : d)

/** Preset de um modo de música lido do arquivo → completo e dentro dos limites. */
export function prepararModo(bruto = {}) {
  const r = bruto.ritmo || {}
  const b = bruto.broll || {}
  const s = bruto.sincronia || {}
  const n = bruto.nota || {}
  const rep = bruto.repeticao || {}
  const z = bruto.zoom_na_batida || {}
  const bpp = {}
  for (const t of TIPOS_PARTE) bpp[t] = Math.round(num(r.batidas_por_plano?.[t], 1, 64, t === 'refrao' || t === 'pre' ? 4 : 8))
  const pesos = n.pesos || {}
  return {
    preset: typeof bruto.preset === 'string' ? bruto.preset : 'clipe',
    version: Number.isInteger(bruto.version) ? bruto.version : 1,
    so_broll: bruto.so_broll === true,
    sincronia: { confianca_min: num(s.confianca_min, 0, 1, 0.3), destaque_min: num(s.destaque_min, 1, 50, 6), sobreposicao_min_s: num(s.sobreposicao_min_s, 1, 60, 4), busca_fina_ms: num(s.busca_fina_ms, 0, 200, 40) },
    analise: { amostras_por_s: num(bruto.analise?.amostras_por_s, 0.5, 8, 2), largura: Math.round(num(bruto.analise?.largura, 32, 320, 96)), altura: Math.round(num(bruto.analise?.altura, 18, 180, 54)) },
    nota: {
      pesos: { nitidez: num(pesos.nitidez, 0, 1, PADRAO_NOTA.pesos.nitidez), luz: num(pesos.luz, 0, 1, PADRAO_NOTA.pesos.luz), firmeza: num(pesos.firmeza, 0, 1, PADRAO_NOTA.pesos.firmeza) },
      luz_ideal: Array.isArray(n.luz_ideal) && n.luz_ideal.length === 2 && n.luz_ideal[0] < n.luz_ideal[1] ? [num(n.luz_ideal[0], 0, 1, 0.3), num(n.luz_ideal[1], 0, 1, 0.7)] : [...PADRAO_NOTA.luz_ideal],
      estouro_max: num(n.estouro_max, 0, 1, PADRAO_NOTA.estouro_max),
      movimento_max: num(n.movimento_max, 0.01, 1, PADRAO_NOTA.movimento_max),
      movimento_bom: n.movimento_bom == null ? null : num(n.movimento_bom, 0.005, 1, null),
    },
    ritmo: {
      batidas_por_plano: bpp,
      multiplicador: { calmo: num(r.multiplicador?.calmo, 0.25, 8, 2), normal: num(r.multiplicador?.normal, 0.25, 8, 1), rapido: num(r.multiplicador?.rapido, 0.125, 8, 0.5) },
      min_batidas: Math.round(num(r.min_batidas, 1, 16, 2)),
      min_s: num(r.min_s, 0.1, 10, 0.4),
      variacao: num(r.variacao, 0, 1, 0.2),
      por_energia: r.por_energia == null ? null : num(r.por_energia, 1, 30, null),
    },
    broll: { parte: { nenhum: 0, pouco: num(b.parte?.pouco, 0, 1, 0.15), muito: num(b.parte?.muito, 0, 1, 0.35) }, no_refrao: num(b.no_refrao, 0, 2, 0.5), nunca_seguido: b.nunca_seguido !== false },
    repeticao: { mesma_tomada: num(rep.mesma_tomada, 0, 5, 0.6), uso: num(rep.uso, 0, 5, 0.4) },
    secoes: { ...PADRAO_SECOES, ...Object.fromEntries(Object.entries(bruto.secoes || {}).filter(([k, v]) => k in PADRAO_SECOES && typeof v === 'number' && Number.isFinite(v))) },
    zoom_na_batida: { escala: num(z.escala, 1, 1.5, 1.08), batidas: num(z.batidas, 0.25, 8, 1), partes: Array.isArray(z.partes) ? z.partes.filter((t) => TIPOS_PARTE.includes(t)) : ['refrao'], foco: { x: num(z.foco?.x, 0, 1, 0.5), y: num(z.foco?.y, 0, 1, 0.45) } },
    cores_partes: { intro: 'areia', verso: 'azul', pre: 'menta', refrao: 'rosa', ponte: 'roxo', final: 'areia', ...(bruto.cores_partes || {}) },
  }
}
