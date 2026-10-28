// Link profundo da aba Drive do celular (/app/#drive/<id>, web/public/app/lib/drive-link.js): lê só ids do Drive no
// hash e monta a trilha da pasta (Meu Drive, Drive compartilhado, Compartilhados comigo). Sem acesso: null.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lugarDaPasta, pastaDoHash } from '../web/public/app/lib/drive-link.js'

const PASTA = 'application/vnd.google-apps.folder'

test('pastaDoHash aceita só #drive/<id do Drive>', () => {
  assert.equal(pastaDoHash('#drive/1AbC_d-9'), '1AbC_d-9')
  for (const ruim of ['', '#drive', '#drive/', '#drive/a/b', '#drive/a b', '#referencias', '#drive/x?y', null, undefined]) assert.equal(pastaDoHash(ruim), null)
})

/** Um Drive pequeno: Meu Drive (raiz) › Projetos › Clipe; Drive de equipe › Entregas; Comigo › Cliente › Brutos. */
function drive() {
  const itens = {
    raiz: { id: 'raiz', name: 'Meu Drive', mimeType: PASTA, parents: [] },
    proj: { id: 'proj', name: 'Projetos', mimeType: PASTA, parents: ['raiz'] },
    clipe: { id: 'clipe', name: 'Clipe', mimeType: PASTA, parents: ['proj'], capabilities: { canAddChildren: true } },
    equipe: { id: 'equipe', name: 'Equipe', mimeType: PASTA, driveId: 'equipe' },
    entregas: { id: 'entregas', name: 'Entregas', mimeType: PASTA, parents: ['equipe'], driveId: 'equipe' },
    cliente: { id: 'cliente', name: 'Cliente', mimeType: PASTA, parents: ['naoVejo'], capabilities: { canAddChildren: false } },
    brutos: { id: 'brutos', name: 'Brutos', mimeType: PASTA, parents: ['cliente'], capabilities: { canAddChildren: false } },
    video: { id: 'video', name: 'a.mov', mimeType: 'video/quicktime', parents: ['clipe'] },
    lixo: { id: 'lixo', name: 'Velha', mimeType: PASTA, parents: ['raiz'], trashed: true },
  }
  const meta = async (id) => itens[id] || null
  // O folderPath de lib/drive.js, simplificado (mesmo formato de saída).
  const caminho = async (f) => {
    const chain = [{ id: f.id, name: f.name }]
    let p = f.parents?.[0]
    for (;;) {
      if (p === 'raiz') return { path: [{ id: 'root', name: 'Meu Drive' }, ...chain] }
      if (f.driveId && p === f.driveId) return { path: [{ id: f.driveId, name: itens[f.driveId].name }, ...chain] }
      const m = itens[p]
      if (!m) return { path: chain }
      chain.unshift({ id: m.id, name: m.name })
      p = m.parents?.[0]
    }
  }
  return { meta, caminho, raiz: async () => 'raiz' }
}

test('pasta do Meu Drive: a trilha desde a raiz', async () => {
  const l = await lugarDaPasta('clipe', drive())
  assert.equal(l.scope, 'mine')
  assert.deepEqual(
    l.path.map((p) => p.name),
    ['Projetos', 'Clipe'],
  )
  assert.equal(l.path.at(-1).canAdd, true)
  assert.deepEqual(await lugarDaPasta('raiz', drive()), { scope: 'mine', path: [] })
  assert.deepEqual(await lugarDaPasta('root', drive()), { scope: 'mine', path: [] })
})

test('Drive compartilhado: o Drive abre a trilha (e a própria raiz dele)', async () => {
  const l = await lugarDaPasta('entregas', drive())
  assert.equal(l.scope, 'drives')
  assert.deepEqual(
    l.path.map((p) => p.id),
    ['equipe', 'entregas'],
  )
  assert.deepEqual((await lugarDaPasta('equipe', drive())).path.map((p) => p.id), ['equipe'])
})

test('compartilhada comigo: começa na primeira pasta que a conta enxerga', async () => {
  const l = await lugarDaPasta('brutos', drive())
  assert.equal(l.scope, 'shared')
  assert.deepEqual(
    l.path.map((p) => p.name),
    ['Cliente', 'Brutos'],
  )
  assert.equal(l.path.at(-1).canAdd, false)
})

test('sem acesso, inexistente, na lixeira ou arquivo: null', async () => {
  for (const id of ['naoExiste', 'video', 'lixo', '']) assert.equal(await lugarDaPasta(id, drive()), null)
})
