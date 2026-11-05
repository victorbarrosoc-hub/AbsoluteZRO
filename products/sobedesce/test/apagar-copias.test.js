// "Copiar de um link" com prazo para apagar (src/google/apagar-copias.js): a marca só na raiz da cópia, o que venceu
// vai para a lixeira (nunca apaga de vez, nunca o que não tem a marca) e espera se tem transferência andando.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as motor from '../src/google/apagar-copias.js'
import { copiarPlano } from '../src/google/copiar.js'
import { CopyJobs } from '../src/server/copiar.js'

const AGORA = Date.parse('2026-11-05T12:00:00Z')

test('prazos, marca e "venceu"', () => {
  for (const m of [motor]) {
    assert.deepEqual(m.PRAZOS.map((p) => p.id), ['nao', '24h', '48h', '7d', '15d', '30d'])
    assert.deepEqual(m.marcaApagar('nao', AGORA), {})
    assert.deepEqual(m.marcaApagar('qualquer', AGORA), {}, 'desconhecido = não apagar')
    assert.deepEqual(m.marcaApagar('24h', AGORA), { sdApagar: '1', sdApagarEm: '2026-11-06T12:00:00.000Z' })
    assert.equal(m.apagarEm('30d', AGORA), '2026-12-05T12:00:00.000Z')
    assert.equal(m.venceu({ sdApagar: '1', sdApagarEm: '2026-11-05T11:59:59.000Z' }, AGORA), true)
    assert.equal(m.venceu({ sdApagar: '1', sdApagarEm: '2026-11-05T12:00:01.000Z' }, AGORA), false)
    assert.equal(m.venceu({ sdApagarEm: '2026-01-01T00:00:00.000Z' }, AGORA), false, 'sem a marca não apaga')
    assert.equal(m.venceu({ sdApagar: '1', sdApagarEm: 'lixo' }, AGORA), false)
    assert.equal(m.venceu(null, AGORA), false)
  }
})

/** Drive falso: guarda os pedidos. */
function driveFalso({ arquivos = [] } = {}) {
  const pedidos = []
  const lixeira = []
  let n = 0
  return {
    pedidos,
    lixeira,
    async api(metodo, caminho, o = {}) {
      pedidos.push({ metodo, caminho, body: o.body, query: o.query })
      if (metodo === 'POST' && caminho === 'files') return { id: `pasta${++n}` }
      if (metodo === 'POST' && caminho.endsWith('/copy')) return { id: `copia${++n}`, name: o.body.name, mimeType: 'video/mp4', size: '10' }
      if (metodo === 'GET' && caminho === 'files') return { files: arquivos }
      throw new Error(`pedido inesperado ${metodo} ${caminho}`)
    },
    async trash(id) {
      lixeira.push(id)
      return { id, trashed: true }
    },
  }
}

test('copiar com prazo: a marca vai só na raiz (pasta nova ou arquivo avulso)', async () => {
  const marca = motor.marcaApagar('7d', AGORA)
  const pasta = driveFalso()
  const planoPasta = {
    root: { id: 'r', name: 'Diária', folder: true },
    folders: [{ id: 'sub', name: 'Cam A', parent: 'r' }],
    files: [{ id: 'f1', name: 'C0001.MP4', parent: 'sub', canCopy: true, size: 10 }],
  }
  await copiarPlano(pasta, planoPasta, { id: 'dest' }, { marca })
  const pastas = pasta.pedidos.filter((p) => p.metodo === 'POST' && p.caminho === 'files')
  assert.deepEqual(pastas[0].body.appProperties, { sobedesce: 'pasta', ...marca }, 'a raiz leva a marca e o prazo')
  assert.deepEqual(pastas[1].body.appProperties, { sobedesce: 'pasta' }, 'a subpasta não (vai junto com a raiz)')
  assert.equal(pasta.pedidos.find((p) => p.caminho.endsWith('/copy')).body.appProperties, undefined)

  const avulso = driveFalso()
  await copiarPlano(avulso, { root: { id: 'f', name: 'final.mov', folder: false }, folders: [], files: [{ id: 'f', name: 'final.mov', canCopy: true, size: 10 }] }, { id: 'dest' }, { marca })
  assert.deepEqual(avulso.pedidos.find((p) => p.caminho.endsWith('/copy')).body.appProperties, marca)

  const semPrazo = driveFalso()
  await copiarPlano(semPrazo, planoPasta, { id: 'dest' }, { marca: motor.marcaApagar('nao') })
  assert.deepEqual(semPrazo.pedidos.find((p) => p.caminho === 'files').body.appProperties, { sobedesce: 'pasta' })
})

test('limpar: só o que tem a marca e venceu vai para a lixeira; erro num item não para os outros', async () => {
  const drive = driveFalso({
    arquivos: [
      { id: 'venceu', name: 'Diária 01', appProperties: { sdApagar: '1', sdApagarEm: '2026-11-04T12:00:00.000Z' } },
      { id: 'ainda', name: 'Diária 02', appProperties: { sdApagar: '1', sdApagarEm: '2026-11-20T12:00:00.000Z' } },
      { id: 'sem-marca', name: 'Outro', appProperties: { sdApagarEm: '2026-01-01T00:00:00.000Z' } },
      { id: 'falha', name: 'Diária 03', appProperties: { sdApagar: '1', sdApagarEm: '2026-11-01T00:00:00.000Z' } },
    ],
  })
  const trash = drive.trash
  drive.trash = async (id) => {
    if (id === 'falha') throw new Error('Sua conta não pode mover este arquivo para a lixeira.')
    return trash(id)
  }
  const r = await motor.limparVencidas(drive, { agora: AGORA })
  assert.deepEqual(drive.lixeira, ['venceu'])
  assert.deepEqual(r.apagadas.map((x) => x.id), ['venceu'])
  assert.deepEqual(r.erros.map((x) => x.id), ['falha'])
  assert.equal(drive.pedidos[0].query.q, motor.CONSULTA)
})

test('limpeza do app: espera com transferência andando; roda em cada conta e avisa a tela', async () => {
  const drive = driveFalso({ arquivos: [{ id: 'x', name: 'Show', appProperties: { sdApagar: '1', sdApagarEm: '2026-11-01T00:00:00.000Z' } }] })
  const enviados = []
  let ativas = 1
  const ctx = {
    manager: { driveFor: () => drive, activeCount: () => ativas },
    auth: { listAccounts: () => [{ id: 'acc1' }] },
    hub: { send: (ev, d) => enviados.push([ev, d]) },
    log: () => {},
  }
  const jobs = new CopyJobs(ctx, { HttpProblem: Error, baixar: async () => ({}) })
  assert.equal((await jobs.limparVencidas({ agora: AGORA })).adiado, true)
  assert.deepEqual(drive.lixeira, [], 'baixando: não apaga agora')
  ativas = 0
  const r = await jobs.limparVencidas({ agora: AGORA })
  assert.deepEqual(r.apagadas.map((x) => [x.id, x.accountId]), [['x', 'acc1']])
  assert.deepEqual(enviados, [['copias-apagadas', { n: 1, nomes: ['Show'] }]])
  jobs.close()
})
