// Links profundos da aba Drive: os botões Abrir e Baixar que a Z mostra (web/src/lib/zro/drive-da-z.ts →
// linkNoSobedesce). Com o app fechado ou aberto (hashchange); o # some do endereço depois.
//   /app/#drive/<id da pasta>   abre a aba já dentro da pasta, com a trilha montada pelos pais (Meu Drive, Drive
//                               compartilhado ou Compartilhados comigo).
//   /app/#arquivo/<id>          abre a pasta do arquivo (o primeiro pai) e o arquivo na prévia.
//   /app/#baixar/<id>           o mesmo, e aperta o Baixar da prévia (arquivo grande pede confirmação, como sempre).
//   /app/#escolher/<id da conta> "Escolher do Drive" do app de computador (modo Arquivos escolhidos): usa aquele Drive
//                               da conta, abre Liberados e o Google Picker. O que for escolhido fica liberado também
//                               para o computador (o mesmo projeto Google). O id é o da conta Google no site, não do Drive.
// Sem dependência do navegador: os testes rodam em Node.

const HASH = /^#(drive|arquivo|baixar|escolher)\/([A-Za-z0-9_-]{1,200})$/
const TIPOS = { drive: 'pasta', arquivo: 'abrir', baixar: 'baixar', escolher: 'escolher' }

/** O link em "#drive/<id>", "#arquivo/<id>", "#baixar/<id>" ou "#escolher/<conta>": { tipo, id } (null para o resto). */
export function linkDoHash(hash) {
  const m = HASH.exec(String(hash || ''))
  return m ? { tipo: TIPOS[m[1]], id: m[2] } : null
}

const PASTA = 'application/vnd.google-apps.folder'

/**
 * Onde a pasta fica, no formato da aba Drive: { scope: 'mine'|'drives'|'shared', path: [{ id, name, driveId, canAdd }] }.
 * `meta(id)`: { id, name, mimeType, parents, driveId, trashed, capabilities } ou null (sem acesso, não existe).
 * `caminho(f)`: o folderPath de lib/drive.js (sobe pelos pais). `raiz()`: o id do Meu Drive.
 * Devolve null quando a pasta não abre (sem acesso, apagada ou não é pasta).
 */
export async function lugarDaPasta(id, { meta, caminho, raiz }) {
  if (!id) return null
  const minha = await raiz().catch(() => null)
  if (id === 'root' || id === minha) return { scope: 'mine', path: [] }
  const f = await meta(id)
  if (!f || f.trashed === true || f.mimeType !== PASTA) return null
  const driveId = f.driveId || null
  const canAdd = f.capabilities?.canAddChildren !== false
  // A raiz de um Drive compartilhado (o id da pasta é o do Drive).
  if (driveId && f.id === driveId) return { scope: 'drives', path: [{ id: driveId, name: f.name, driveId: null, canAdd }] }
  const { path } = await caminho(f)
  const trilha = path.map((p, i) => ({ id: p.id, name: p.name, driveId, canAdd: i === path.length - 1 ? canAdd : undefined }))
  if (trilha[0]?.id === 'root') return { scope: 'mine', path: trilha.slice(1) }
  if (driveId && trilha[0]?.id === driveId) return { scope: 'drives', path: trilha.map((p, i) => (i === 0 ? { ...p, driveId: null } : p)) }
  return { scope: 'shared', path: trilha }
}

/**
 * O que um link abre: { lugar, arquivo } (lugar no formato de lugarDaPasta, ou null quando a pasta do arquivo não
 * abre: a prévia sai em Compartilhados comigo). `arquivo(id)`: os dados do arquivo (com parents e trashed) ou null.
 * Link de arquivo que é pasta abre a pasta. Devolve null quando nada abre (sem acesso, apagado, na lixeira).
 */
export async function alvoDoLink(link, { arquivo, ...deps }) {
  if (!link?.id) return null
  if (link.tipo === 'pasta') {
    const lugar = await lugarDaPasta(link.id, deps)
    return lugar ? { lugar, arquivo: null } : null
  }
  const f = await arquivo(link.id)
  if (!f || f.trashed === true) return null
  if (f.mimeType === PASTA) {
    const lugar = await lugarDaPasta(f.id, deps)
    return lugar ? { lugar, arquivo: null } : null
  }
  const pai = Array.isArray(f.parents) ? f.parents[0] : null
  const lugar = pai ? await lugarDaPasta(pai, deps).catch(() => null) : null
  return { lugar, arquivo: f }
}
