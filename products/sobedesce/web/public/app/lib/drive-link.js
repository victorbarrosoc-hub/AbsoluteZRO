// Link profundo da aba Drive: /app/#drive/<id da pasta> abre a aba já dentro da pasta, com a trilha montada pelos
// pais (Meu Drive, Drive compartilhado ou Compartilhados comigo). É o link que a Z manda ("Abrir a pasta no
// SOBEDESCE", web/src/lib/zro/drive-da-z.ts → linkNoSobedesce). Sem dependência do navegador: os testes rodam em Node.

const HASH = /^#drive\/([A-Za-z0-9_-]{1,200})$/

/** O id da pasta em "#drive/<id>" (null para qualquer outra coisa). */
export function pastaDoHash(hash) {
  const m = HASH.exec(String(hash || ''))
  return m ? m[1] : null
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
