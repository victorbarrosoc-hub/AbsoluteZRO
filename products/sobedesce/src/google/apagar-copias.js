// "Copiar de um link" com prazo (titular, 05/11/2026): a pessoa pode só querer passar o material para o próprio Drive
// para baixar mais rápido. Na cópia ela escolhe "Não apagar" ou apagar em 24 h, 48 h, 7 dias, 15 dias ou 1 mês.
//
// A cópia leva a marca na raiz (a pasta nova ou o arquivo copiado), em appProperties (só o projeto Google do SOBEDESCE
// lê e grava): `sdApagar: '1'` e `sdApagarEm: <ISO>`. Quem apaga é o próprio app, quando abre (e a cada poucas horas
// aberto): procura o que ele marcou, e o que venceu vai para a LIXEIRA do Google (recuperável por 30 dias). Nunca
// apaga de vez, nunca mexe no que não tem a marca e espera se houver transferência andando (pode estar baixando
// justamente da cópia). Sem servidor: se ninguém abrir o app, a cópia espera a próxima abertura.
// O celular (web/public/app) ganha as mesmas regras no lote de sexta.

const HORA = 60 * 60 * 1000
const DIA = 24 * HORA

/** Os prazos, na ordem da tela. `ms: null` = não apagar. */
export const PRAZOS = Object.freeze([
  { id: 'nao', rotulo: 'Não apagar', ms: null },
  { id: '24h', rotulo: '24 horas', ms: DIA },
  { id: '48h', rotulo: '48 horas', ms: 2 * DIA },
  { id: '7d', rotulo: '7 dias', ms: 7 * DIA },
  { id: '15d', rotulo: '15 dias', ms: 15 * DIA },
  { id: '30d', rotulo: '1 mês', ms: 30 * DIA },
])

export const CHAVE = 'sdApagar'
export const CHAVE_EM = 'sdApagarEm'
const PAGINA = 200
const LIMITE = 500

/** O prazo pelo id (desconhecido ou vazio: "Não apagar"). */
export function prazoDe(id) {
  return PRAZOS.find((p) => p.id === id) || PRAZOS[0]
}

/** Quando apagar ({ em: ISO } ou null para "Não apagar"). */
export function apagarEm(id, agora = Date.now()) {
  const p = prazoDe(id)
  return p.ms ? new Date(agora + p.ms).toISOString() : null
}

/** As appProperties da raiz da cópia (vazio para "Não apagar"). */
export function marcaApagar(id, agora = Date.now()) {
  const em = apagarEm(id, agora)
  return em ? { [CHAVE]: '1', [CHAVE_EM]: em } : {}
}

/** Venceu? Só com a marca certa e uma data válida no passado. */
export function venceu(appProperties, agora = Date.now()) {
  if (!appProperties || appProperties[CHAVE] !== '1') return false
  const t = Date.parse(appProperties[CHAVE_EM] || '')
  return Number.isFinite(t) && t <= agora
}

export const CONSULTA = `appProperties has { key='${CHAVE}' and value='1' } and trashed = false`

/**
 * Procura as cópias marcadas e manda para a lixeira as que venceram. `drive.api(method, path, o)` e `drive.trash(id)`
 * (src/google/drive.js). Devolve { apagadas: [{ id, name }], erros: [{ id, name, erro }] }. Nunca lança por um item;
 * erro de rede/conta sobe (quem chama tenta na próxima vez).
 */
export async function limparVencidas(drive, { agora = Date.now(), signal } = {}) {
  const achados = []
  let pageToken
  do {
    const r = await drive.api('GET', 'files', {
      query: { q: CONSULTA, fields: 'nextPageToken,files(id,name,appProperties)', pageSize: PAGINA, includeItemsFromAllDrives: 'true', supportsAllDrives: 'true', pageToken },
      signal,
    })
    for (const f of r.files || []) achados.push(f)
    pageToken = r.nextPageToken
  } while (pageToken && achados.length < LIMITE)
  const apagadas = []
  const erros = []
  for (const f of achados) {
    if (!venceu(f.appProperties, agora)) continue
    try {
      await drive.trash(f.id, { signal })
      apagadas.push({ id: f.id, name: f.name })
    } catch (err) {
      if (signal?.aborted) throw err
      erros.push({ id: f.id, name: f.name, erro: err?.message || 'erro' })
    }
  }
  return { apagadas, erros }
}
