// Sonoplasta: o que buscar para cada momento da linha e como a busca em português vira termo do banco de sons livres
// (catalogado em inglês), e o link da pasta do banco da própria pessoa no Drive. As regras moram no preset versionado (presets/sonoplasta.v1.json), nunca aqui: este módulo só
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
    origem:
      s.origem === 'zro'
        ? // os sons originais da Absolute ZRO: licença da plataforma, sem crédito no vídeo
          { tipo: 'zro', id: s.id, titulo: s.titulo, fonte: 'Absolute ZRO' }
        : s.origem === 'banco'
        ? // o banco da pessoa no Drive: a licença é dela (sem crédito); a conta Google serve para descer de novo
          { tipo: 'banco', id: s.id, titulo: s.titulo, fonte: 'Meu banco no Drive', ...(s.conta ? { conta: s.conta } : {}) }
        : { tipo: s.origem, id: s.id, titulo: s.titulo, autor: s.autor || null, licenca: s.licenca, licencaUrl: s.licencaUrl || null, url: s.pagina || null, fonte: s.fonte || null },
  }
}

const ID_DRIVE = /^[A-Za-z0-9_-]{10,200}$/

/**
 * O id da pasta do banco a partir do que a pessoa colou: link de pasta do Google Drive (…/folders/<id>, com ou sem
 * /u/0/ e ?usp=…), link antigo (…/open?id=<id>), link do SOBEDESCE (…/app/#drive/<id>) ou o próprio id. Outra coisa: null.
 */
export function pastaDoLink(texto) {
  const t = String(texto || '').trim()
  if (ID_DRIVE.test(t)) return t
  let u
  try {
    u = new URL(t)
  } catch {
    return null
  }
  if (u.protocol !== 'https:') return null
  if (u.hostname === 'drive.google.com') {
    const m = /\/folders\/([A-Za-z0-9_-]{10,200})(?:\/|$)/.exec(u.pathname)
    if (m) return m[1]
    const id = u.pathname === '/open' ? u.searchParams.get('id') : null
    return id && ID_DRIVE.test(id) ? id : null
  }
  const m = /^#drive\/([A-Za-z0-9_-]{10,200})$/.exec(u.hash)
  return u.pathname === '/app/' && m ? m[1] : null
}

/**
 * Os sons da Absolute ZRO que aparecem: os da categoria escolhida (null = todas) e, com `q`, os que têm todas as palavras
 * no nome ou na categoria, sem ligar para acento — em português ou no termo do preset ("impacto" também acha "impact").
 */
export function filtrarZro(catalogo, { categoria = null, q = '' } = {}, preset = null) {
  const sons = (catalogo?.sons || []).filter((s) => !categoria || s.categoria === categoria)
  const texto = semAcento(String(q).replace(/\s+/g, ' ').trim())
  if (!texto) return sons
  const formas = [...new Set([texto, semAcento(termoDeBusca(texto, preset))])].map((t) => t.split(' ').filter(Boolean))
  return sons.filter((s) => {
    const alvo = semAcento(`${s.titulo} ${s.categoria}`)
    return formas.some((palavras) => palavras.every((p) => alvo.includes(p)))
  })
}

/** Uma versão de um som da Absolute ZRO como resultado para ouvir e colocar (o id é o da versão). */
export function versaoZro(som, versao) {
  const v = som.versoes.find((x) => x.id === versao) || som.versoes[0]
  return { id: v.id, origem: 'zro', titulo: som.versoes.length > 1 ? `${som.titulo} ${v.versao}` : som.titulo, formato: v.formato || 'mp3', duracao: v.duracao, bytes: v.bytes }
}
