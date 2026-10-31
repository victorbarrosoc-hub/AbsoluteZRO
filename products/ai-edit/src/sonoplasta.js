// Sonoplasta: o que buscar para cada momento da linha e como a busca em português vira termo do banco de sons livres
// (catalogado em inglês). As regras moram no preset versionado (presets/sonoplasta.v1.json), nunca aqui: este módulo só
// lê o preset. Puro, sem rede: a busca e o arquivo vêm da Absolute ZRO (app/sons.js).

const semAcento = (t) =>
  String(t)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * Texto da pessoa → termo de busca: troca as palavras e expressões que o preset conhece (sem ligar para acento e
 * maiúscula, a mais longa primeiro) e deixa o resto como está ("impacto grave" → "impact grave").
 */
export function termoDeBusca(texto, preset) {
  let t = ` ${semAcento(String(texto).replace(/\s+/g, ' ').trim())} `
  const termos = Object.entries(preset?.termos || {}).sort((a, b) => b[0].length - a[0].length)
  for (const [pt, en] of termos) t = t.split(` ${semAcento(pt)} `).join(` ${en} `)
  return t.trim().slice(0, 80)
}

/** O que buscar num momento (corte, marcador…): { busca, rotulo, porque }. Momento que o preset não conhece: null. */
export function sugestaoDoMomento(momento, preset) {
  const m = preset?.momentos?.[momento?.tipo]
  return m ? { busca: m.busca, rotulo: m.rotulo, porque: m.por_que } : null
}

/** Id estável do som no projeto: o mesmo som do banco entra uma vez e serve a vários efeitos. */
export const idDoSomBuscado = (s) => `${s.origem}:${s.id}`

/**
 * O som encontrado como som do projeto (adicionarSom de src/efeitos.js): nome de arquivo com a extensão, duração medida
 * e a origem completa para os créditos (título, autor, licença, página).
 */
export function somDoBanco(s, { duracao, taxa, canais }) {
  const ext = /^[a-z0-9]{2,5}$/i.test(s.formato || '') ? s.formato.toLowerCase() : 'mp3'
  const nome = `${String(s.titulo || 'som').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim().slice(0, 70) || 'som'}.${ext}`
  return {
    id: idDoSomBuscado(s),
    nome,
    duracao,
    taxa,
    canais,
    origem: { tipo: s.origem, id: s.id, titulo: s.titulo, autor: s.autor || null, licenca: s.licenca, licencaUrl: s.licencaUrl || null, url: s.pagina || null, fonte: s.fonte || null },
  }
}
