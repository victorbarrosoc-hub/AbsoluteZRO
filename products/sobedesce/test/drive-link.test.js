// Link profundo da aba Drive do celular (/app/#drive/<id>, web/public/app/lib/drive-link.js): lê só ids do Drive no
// hash e monta a trilha da pasta (Meu Drive, Drive compartilhado, Compartilhados comigo). Sem acesso: null.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alvoDoLink, linkDoHash, lugarDaPasta } from '../web/public/app/lib/drive-link.js'

const PASTA = 'application/vnd.google-apps.folder'

test('linkDoHash: #drive (pasta), #arquivo (abrir) e #baixar, só com id do Drive', () => {
  assert.deepEqual(linkDoHash('#drive/1AbC_d-9'), { tipo: 'pasta', id: '1AbC_d-9' })
  assert.deepEqual(linkDoHash('#arquivo/1AbC_d-9'), { tipo: 'abrir', id: '1AbC_d-9' })
  assert.deepEqual(linkDoHash('#baixar/1AbC_d-9'), { tipo: 'baixar', id: '1AbC_d-9' })
  // "Escolher do Drive" do app de computador (Drive híbrido): o id é o da conta Google no site.
  assert.deepEqual(linkDoHash('#escolher/Ab_c-9'), { tipo: 'escolher', id: 'Ab_c-9' })
  for (const ruim of ['#escolher', '#escolher/', '#escolher/a/b', '#escolher/a b', '#Escolher/x']) assert.equal(linkDoHash(ruim), null)
  const ruins = ['', '#drive', '#drive/', '#drive/a/b', '#drive/a b', '#drive/x?y', '#referencias', '#arquivo', '#arquivo/', '#baixar/a/b', '#baixar/a b', '#baixar/x?y', '#Baixar/x', '#abrir/x', 'baixar/x', '#baixar/' + 'a'.repeat(201), null, undefined]
  for (const ruim of ruins) assert.equal(linkDoHash(ruim), null)
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

test('alvoDoLink: arquivo abre na pasta dele; pasta só a pasta; nada abre: null', async () => {
  const d = drive()
  const deps = { ...d, arquivo: d.meta }
  const a = await alvoDoLink({ tipo: 'baixar', id: 'video' }, deps)
  assert.equal(a.arquivo.id, 'video')
  assert.equal(a.lugar.scope, 'mine')
  assert.deepEqual(
    a.lugar.path.map((p) => p.id),
    ['proj', 'clipe'],
  )
  const p = await alvoDoLink({ tipo: 'abrir', id: 'clipe' }, deps)
  assert.equal(p.arquivo, null)
  assert.equal(p.lugar.path.at(-1).id, 'clipe')
  assert.equal((await alvoDoLink({ tipo: 'pasta', id: 'entregas' }, deps)).lugar.scope, 'drives')
  for (const id of ['naoExiste', 'lixo', '']) assert.equal(await alvoDoLink({ tipo: 'abrir', id }, deps), null)
  assert.equal(await alvoDoLink({ tipo: 'pasta', id: 'video' }, deps), null)
  // Arquivo cuja pasta a conta não enxerga: abre só a prévia (lugar null).
  const solto = await alvoDoLink({ tipo: 'abrir', id: 'x' }, { ...deps, arquivo: async () => ({ id: 'x', name: 'x.mov', mimeType: 'video/quicktime', parents: ['naoVejo'] }) })
  assert.equal(solto.lugar, null)
  assert.equal(solto.arquivo.id, 'x')
})
