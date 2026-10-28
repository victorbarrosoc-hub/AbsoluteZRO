// Download do Drive vindo do SOBEDESCE ("Preparar no Synquei", desktop/manifesto-drive.cjs e desktop/organizador.cjs):
// a linha v2 conferida à risca, a pasta única por operação, ausentes/movidos/alterados, o recibo de volta, repetir sem
// duplicar, retomar, disco desconectado e manifesto adulterado. Pastas temporárias, nada de Electron.
// Quando o SOBEDESCE está no monorepo, a linha vem do código real dele (products/sobedesce/src/engine/manifesto.js).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, mkdirSync, appendFileSync, existsSync, readFileSync, rmSync, renameSync, truncateSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resumoPreparo } from '../app/js/preparo.js'

const require = createRequire(import.meta.url)
const { Organizador, IGNORAR } = require('../desktop/organizador.cjs')
const { validarLinhaDrive, conferirArquivos, linhaRecibo } = require('../desktop/manifesto-drive.cjs')

const sobedesce = new URL('../../sobedesce/src/engine/manifesto.js', import.meta.url)
const temSobedesce = existsSync(sobedesce)
const md5 = (n) => n.toString(16).padStart(32, '0')
const OP = 'bLoteDrive01'

function arquivo(raiz, rel, conteudo = 'x') {
  const abs = join(raiz, ...rel.split('/'))
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, conteudo)
  return abs
}

/** A linha v2 como o SOBEDESCE grava (pelo código dele quando dá; senão, à mão no mesmo formato). */
function linhaV2(arquivos, o = {}) {
  const lista = arquivos.map((a, i) => ({ rel: a.rel, nome: a.rel.split('/').pop(), size: a.size, file_id: `arquivoDrive${i + 1}`, md5: a.semMd5 ? null : md5(i + 1), conferido: !a.semMd5 }))
  const conferidos = lista.filter((a) => a.conferido).length
  return {
    v: 2,
    app: 'sobedesce',
    app_versao: '0.1.0+77',
    tipo: 'drive.download',
    op: OP,
    project_id: null,
    quando: '2026-10-28T12:00:00.000Z',
    origem: { tipo: 'drive', pasta_id: 'pastaDrive01', pasta: 'Gravação' },
    destino: { pasta: 'Gravação', caminho: '/Volumes/SSD/Gravação' },
    estado: conferidos === lista.length ? 'conferido' : 'parcial',
    verificacao: { algoritmo: 'md5', total: lista.length, conferidos, sem_conferencia: lista.length - conferidos, tamanho: true },
    bytes: lista.reduce((s, a) => s + a.size, 0),
    arquivos: lista,
    ...o,
  }
}

function montar(nome = 'Gravação · São João') {
  const tmp = mkdtempSync(join(tmpdir(), 'sq-drive-'))
  const raiz = join(tmp, 'Downloads', nome)
  mkdirSync(raiz, { recursive: true })
  const org = new Organizador({ stateDir: join(tmp, 'dados'), intervaloMs: 20, versao: '1.0.0+1001' })
  const eventos = []
  org.on('cartao', (e) => eventos.push(e))
  const resumo = join(raiz, '.sobedesce', 'descargas.jsonl')
  const escrever = (l) => {
    mkdirSync(join(raiz, '.sobedesce'), { recursive: true })
    appendFileSync(resumo, JSON.stringify(l) + '\n')
  }
  const recibos = () => (existsSync(join(raiz, 'Synquei', 'preparos.jsonl')) ? readFileSync(join(raiz, 'Synquei', 'preparos.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [])
  return { tmp, raiz, org, eventos, escrever, recibos, resumo }
}

test('contrato: a linha do SOBEDESCE real passa; o recibo do Synquei passa no leitor do SOBEDESCE', { skip: !temSobedesce && 'SOBEDESCE fora do monorepo' }, async () => {
  const { manifestoDoLote, lerLinhaRecibo } = await import(sobedesce.href)
  const { raiz } = montar()
  const base = join(raiz, '..')
  const recs = ['Gravação/Câmera A/C0001.MP4', 'Gravação/Som/ZOOM 0001.WAV'].map((relPath, i) => {
    const abs = arquivo(base, relPath, 'x'.repeat(10 + i))
    return { id: `t${i}`, type: 'download', status: 'completed', relPath, size: 10 + i, source: { fileId: `arq${i}` }, dest: { path: abs }, verify: { state: 'ok', actual: md5(i + 1) } }
  })
  const m = await manifestoDoLote({ batch: { id: OP, origem: { pastaId: 'p1', pasta: 'Gravação' } }, records: recs })
  assert.equal(m.ok, true, m.motivo)
  const v = validarLinhaDrive(JSON.parse(JSON.stringify(m.linha)))
  assert.equal(v.ok, true, v.erro)
  const r = linhaRecibo({ op: OP, estado: 'com_pendencias', versao: '1.0.0+1001', resultado: { organizados: 1, revisar: 1, pendentes: 1 }, exemplos: { revisar: ['Câmera A/C0001.MP4'] } })
  const lido = lerLinhaRecibo(JSON.parse(JSON.stringify(r)))
  assert.equal(lido.estado, 'com_pendencias')
  assert.deepEqual(lido.exemplos.revisar, ['Câmera A/C0001.MP4'])
})

test('manifesto inválido ou adulterado é recusado com o motivo', () => {
  const ok = linhaV2([{ rel: 'A/C0001.MP4', size: 5 }, { rel: 'Roteiro.docx', size: 3, semMd5: true }])
  assert.equal(validarLinhaDrive(ok).ok, true)
  const ruins = {
    'campo a mais': { ...ok, token: 'ya29.x' },
    'outra versão': { ...ok, v: 3 },
    'op estranho': { ...ok, op: '../x' },
    'project_id que não é uuid': { ...ok, project_id: 'p1' },
    'data inválida': { ...ok, quando: 'ontem' },
    'origem com e-mail': { ...ok, origem: { ...ok.origem, conta: 'a@b.c' } },
    'destino com barra': { ...ok, destino: { pasta: '../x' } },
    'contagem mentindo': { ...ok, verificacao: { ...ok.verificacao, conferidos: 2 } },
    'estado mentindo': { ...ok, estado: 'conferido' },
    'bytes mentindo': { ...ok, bytes: 1 },
    'sem arquivos': { ...ok, arquivos: [] },
  }
  const arq = (o) => ({ ...ok, arquivos: [{ ...ok.arquivos[0], ...o }, ok.arquivos[1]] })
  Object.assign(ruins, {
    '..': arq({ rel: '../../etc/passwd', nome: 'passwd' }),
    absoluto: arq({ rel: '/etc/passwd', nome: 'passwd' }),
    'letra de unidade': arq({ rel: 'C:/x.mov', nome: 'x.mov' }),
    'barra invertida': arq({ rel: 'A\\x.mov', nome: 'A\\x.mov' }),
    NUL: arq({ rel: 'A/x\u0000.mov', nome: 'x\u0000.mov' }),
    'segmento vazio': arq({ rel: 'A//C0001.MP4' }),
    'pela metade': arq({ rel: 'A/C0001.MP4.sobedesce-part', nome: 'C0001.MP4.sobedesce-part' }),
    'nome diferente do caminho': arq({ nome: 'outro.mp4' }),
    'conferido sem md5': arq({ md5: null }),
    'md5 sem conferência': { ...ok, arquivos: [ok.arquivos[0], { ...ok.arquivos[1], md5: md5(9) }] },
    'tamanho negativo': arq({ size: -1 }),
    repetido: { ...ok, arquivos: [ok.arquivos[0], ok.arquivos[0]], verificacao: { ...ok.verificacao, conferidos: 2, sem_conferencia: 0 }, estado: 'conferido', bytes: 10 },
  })
  for (const [nome, l] of Object.entries(ruins)) assert.equal(validarLinhaDrive(l).ok, false, nome)
  assert.equal(validarLinhaDrive(null).ok, false)
  assert.equal(validarLinhaDrive([]).ok, false)
  // limite: 50.001 arquivos não passam; 50.000 passam (e rápido)
  const muitos = (n) => linhaV2(Array.from({ length: n }, (_, i) => ({ rel: `P${i % 50}/C${i}.MP4`, size: 1 })))
  const t0 = Date.now()
  assert.equal(validarLinhaDrive(muitos(50_000)).ok, true)
  assert.ok(Date.now() - t0 < 3000, 'validar 50.000 arquivos leva menos de 3 s')
  assert.equal(validarLinhaDrive(muitos(50_001)).ok, false)
})

test('pasta única: o link com op vira uma operação; arquivo baixando não entra; recibo "recebido"', async () => {
  const { raiz, org, eventos, escrever, recibos } = montar()
  arquivo(raiz, 'Câmera A/C0001.MP4', 'video')
  arquivo(raiz, 'Som/ZOOM0001.WAV', 'audio1')
  arquivo(raiz, 'Som/ZOOM0002.WAV.sobedesce-part', 'pela metade')
  assert.ok(IGNORAR.test('Som/ZOOM0002.WAV.sobedesce-part'))
  await assert.rejects(org.adicionar(raiz, { op: OP }), /Não achei esse download/)
  escrever(linhaV2([{ rel: 'Câmera A/C0001.MP4', size: 5 }, { rel: 'Som/ZOOM0001.WAV', size: 6 }]))
  await assert.rejects(org.adicionar(raiz, { op: 'outroLote01' }), /Não achei esse download/)
  await assert.rejects(org.adicionar(raiz, { op: '../x' }), /não é válido/)
  const p = await org.adicionar(raiz, { op: OP })
  await org.verificar()
  assert.equal(eventos.length, 1)
  const e = eventos[0]
  assert.equal(e.modo, 'drive')
  assert.equal(e.op, OP)
  assert.equal(e.id, `drive:${OP}`)
  assert.equal(e.projetoNome, 'Gravação')
  assert.equal(e.diaria.n, `op:${OP}`)
  assert.deepEqual(e.arquivos.map((a) => a.rel), ['Câmera A/C0001.MP4', 'Som/ZOOM0001.WAV'])
  assert.ok(e.arquivos.every((a) => a.abs.startsWith(raiz)))
  const [r] = recibos()
  assert.equal(r.formato, 'synquei.preparo/1')
  assert.equal(r.op, OP)
  assert.equal(r.estado, 'recebido')
  assert.equal(r.app_versao, '1.0.0+1001')
  // os originais ficam onde estão; só as pastas de trabalho em volta
  assert.ok(existsSync(join(raiz, 'Câmera A', 'C0001.MP4')))
  for (const d of ['Assets', 'Exports', join('Synquei', 'Sequências')]) assert.ok(existsSync(join(raiz, d)), d)
  // a mesma linha na próxima passada: nada novo
  await org.verificar()
  assert.equal(eventos.length, 1)
  const st = org.estado().find((x) => x.id === p.id)
  assert.equal(st.cartoes[0].modo, 'drive')
})

test('ausentes, movidos e alterados vão para o recibo (nunca somem em silêncio); acentos NFC × NFD', async () => {
  const { raiz, org, eventos, escrever, recibos } = montar()
  arquivo(raiz, 'A/certo.mov', '12345')
  arquivo(raiz, 'A/maior.mov', '123456789') // manifesto diz 5
  arquivo(raiz, 'Outra pasta/movido.wav', 'abc') // manifesto diz B/movido.wav
  arquivo(raiz, 'A/baixando.mov', '12345')
  arquivo(raiz, 'A/baixando.mov.sobedesce-part', '1')
  arquivo(raiz, 'Ação/Câmera'.normalize('NFD') + '/clipe.mov', '1234') // o disco do Mac guardou em NFD
  escrever(
    linhaV2([
      { rel: 'A/certo.mov', size: 5 },
      { rel: 'A/maior.mov', size: 5 },
      { rel: 'B/movido.wav', size: 3 },
      { rel: 'A/baixando.mov', size: 5 },
      { rel: 'A/sumiu.mov', size: 7 },
      { rel: 'Ação/Câmera/clipe.mov', size: 4 },
    ]),
  )
  await org.adicionar(raiz, { op: OP })
  await org.verificar()
  const e = eventos[0]
  assert.deepEqual(e.arquivos.map((a) => a.rel).sort(), ['A/certo.mov', 'Ação/Câmera'.normalize('NFD') + '/clipe.mov', 'Outra pasta/movido.wav'].sort())
  assert.deepEqual(e.conferencia, { ausentes: ['A/sumiu.mov'], alterados: ['A/maior.mov', 'A/baixando.mov'], movidos: ['B/movido.wav → Outra pasta/movido.wav'] })
  const r = recibos()[0]
  assert.deepEqual(r.resultado, { organizados: 0, sincronizados: 0, ignorados: 0, pendentes: 3, ausentes: 1, alterados: 2, movidos: 1, revisar: 0 })
  assert.deepEqual(r.exemplos, { ausentes: ['A/sumiu.mov'], alterados: ['A/maior.mov', 'A/baixando.mov'], movidos: ['B/movido.wav'], revisar: [] })
  // a página terminou: "preparado" com pendência no disco vira "com pendências"
  const fim = await org.recibo(e.pastaId, OP, { estado: 'preparado', resultado: { organizados: 3, sincronizados: 2, ignorados: 0, revisar: 0 } })
  assert.equal(fim.estado, 'com_pendencias')
  assert.equal(fim.resultado.pendentes, 3)
})

test('dois arquivos iguais em outro lugar: não dá para saber qual é, fica ausente', async () => {
  const { raiz } = montar()
  arquivo(raiz, 'X/clipe.mov', '123')
  arquivo(raiz, 'Y/clipe.mov', '123')
  const c = await conferirArquivos(raiz, linhaV2([{ rel: 'Z/clipe.mov', size: 3 }]))
  assert.deepEqual(c.ausentes, ['Z/clipe.mov'])
  assert.deepEqual(c.movidos, [])
})

test('repetir o mesmo op não duplica: preparado → recibo "repetido"; mudou na pasta → volta para a fila; retomada', async () => {
  const { raiz, org, eventos, escrever, recibos } = montar()
  arquivo(raiz, 'A/1.mov', '11111')
  arquivo(raiz, 'A/2.mov', '22222')
  escrever(linhaV2([{ rel: 'A/1.mov', size: 5 }, { rel: 'A/2.mov', size: 5 }]))
  const p = await org.adicionar(raiz, { op: OP })
  await org.verificar()
  assert.equal(eventos.length, 1)
  // o app fechou no meio: outro Organizador devolve a operação pendente
  const org2 = new Organizador({ stateDir: org.stateDir, versao: '1.0.0+1001' })
  const ev2 = []
  org2.on('cartao', (x) => ev2.push(x))
  const pend = await org2.pendentes(p.id)
  assert.equal(pend.length, 1)
  assert.equal(pend[0].op, OP)
  assert.equal(pend[0].arquivos.length, 2)
  // terminou
  await org2.recibo(p.id, OP, { estado: 'preparado', resultado: { organizados: 2, sincronizados: 2, ignorados: 0, revisar: 0 } })
  await org2.marcar(p.id, `drive:${OP}`, 'pronto')
  assert.equal((await org2.pendentes(p.id)).length, 0)
  const n = recibos().length
  // o mesmo link outra vez: nada de evento novo, um recibo "repetido" com o mesmo resultado
  assert.equal(await org2.pedirDeNovo(p.id, OP), 'repetido')
  assert.equal(ev2.length, 0)
  const rep = recibos().at(-1)
  assert.equal(recibos().length, n + 1)
  assert.equal(rep.repetido, true)
  assert.equal(rep.estado, 'preparado')
  assert.equal(rep.resultado.organizados, 2)
  // a mesma pasta outra vez no Organizar: continua uma pasta só
  await org2.adicionar(raiz, { op: OP })
  assert.equal(org2.estado().length, 1)
  // um arquivo sumiu depois: o pedido volta como evento (a página não repete clipe nem projeto) e o recibo conta
  rmSync(join(raiz, 'A', '2.mov'))
  assert.equal(await org2.pedirDeNovo(p.id, OP), 'de-novo')
  assert.equal(ev2.length, 1)
  assert.deepEqual(ev2[0].conferencia.ausentes, ['A/2.mov'])
  assert.deepEqual(ev2[0].arquivos.map((a) => a.rel), ['A/1.mov'])
})

test('baixou de novo (linha nova do mesmo op): processa outra vez, ainda uma operação só', async () => {
  const { raiz, org, eventos, escrever } = montar()
  arquivo(raiz, 'A/1.mov', '11111')
  escrever(linhaV2([{ rel: 'A/1.mov', size: 5 }]))
  await org.adicionar(raiz, { op: OP })
  await org.verificar()
  arquivo(raiz, 'A/2.mov', '22')
  escrever(linhaV2([{ rel: 'A/1.mov', size: 5 }, { rel: 'A/2.mov', size: 2 }], { quando: '2026-10-28T13:00:00.000Z' }))
  await org.verificar()
  assert.equal(eventos.length, 2)
  assert.equal(eventos[1].arquivos.length, 2)
  assert.equal(org.estado()[0].cartoes.length, 1)
})

test('manifesto adulterado na pasta: nada é processado e o recibo diz o porquê', async () => {
  const { raiz, org, eventos, escrever, recibos, resumo } = montar()
  arquivo(raiz, 'A/1.mov', '11111')
  escrever(linhaV2([{ rel: '../../fora.txt', size: 5 }]))
  await assert.rejects(org.adicionar(raiz, { op: OP }), /estragado/)
  // ligada à mão (sem op): a linha ruim é pulada, com recibo de erro; linha pela metade e lixo também
  appendFileSync(resumo, 'lixo\n{"v":2,"op":"bLoteDrive01"')
  await org.adicionar(raiz)
  await org.verificar()
  assert.equal(eventos.length, 0)
  const r = recibos()
  assert.equal(r.length, 1)
  assert.equal(r[0].estado, 'erro')
  assert.match(r[0].erro, /recusado: caminho inválido/)
})

test('nenhum arquivo na pasta (apagados ou ainda baixando): erro no recibo, nada para a página', async () => {
  const { raiz, org, eventos, escrever, recibos } = montar()
  arquivo(raiz, 'A/1.mov.sobedesce-part', '1')
  escrever(linhaV2([{ rel: 'A/1.mov', size: 5 }]))
  await org.adicionar(raiz, { op: OP })
  await org.verificar()
  assert.equal(eventos.length, 0)
  assert.equal(recibos()[0].estado, 'erro')
  assert.equal(org.estado()[0].cartoes[0].estado, 'erro')
})

test('disco desconectado: a pasta some, nada quebra nem é marcado pronto; voltou, segue', async () => {
  const { raiz, org, eventos, escrever } = montar()
  arquivo(raiz, 'A/1.mov', '11111')
  escrever(linhaV2([{ rel: 'A/1.mov', size: 5 }]))
  const p = await org.adicionar(raiz)
  renameSync(raiz, raiz + '-fora')
  await org.verificar()
  assert.equal(eventos.length, 0)
  assert.deepEqual(await org.pendentes(p.id), [])
  await assert.rejects(org.adicionar(raiz, { op: OP }), /não existe/)
  renameSync(raiz + '-fora', raiz)
  await org.verificar()
  assert.equal(eventos.length, 1)
})

test('cartões (v1) e download do Drive (v2) no mesmo resumo: o fluxo dos cartões continua igual', async () => {
  const { raiz, org, eventos, escrever } = montar()
  const pasta = 'Diária 01/Cenas/Ana - A7S/Cartão 01'
  arquivo(raiz, `${pasta}/C0001.MP4`, 'v')
  arquivo(raiz, 'Drive/x.wav', '123')
  escrever({ v: 1, app: 'sobedesce', resultado: 'ok', id: 'c1', quando: '2026-10-28T10:00:00Z', diaria: { n: 1, nome: 'Diária 01' }, dono: { nome: 'Ana', camera: 'A7S', pasta: 'Ana - A7S' }, cartao: { n: 1, pasta }, arquivos: [{ rel: 'C0001.MP4' }] })
  escrever(linhaV2([{ rel: 'Drive/x.wav', size: 3 }]))
  await org.adicionar(raiz)
  await org.verificar()
  assert.deepEqual(eventos.map((e) => e.modo || 'cartao'), ['cartao', 'drive'])
  assert.equal(eventos[0].diaria.n, 1)
  assert.equal(eventos[0].dono.camera, 'A7S')
})

test('centenas de GB (arquivos esparsos): tamanho acima de 4 GB conferido sem ler os bytes', async () => {
  const { raiz, org, eventos, escrever } = montar()
  const GB = 1024 ** 3
  const arqs = []
  for (let i = 0; i < 80; i++) {
    const rel = `Câmera ${i % 4}/A${String(i).padStart(3, '0')}.braw`
    const abs = arquivo(raiz, rel, '')
    truncateSync(abs, 4 * GB + i) // ~320 GB declarados, quase nada no disco
    arqs.push({ rel, size: 4 * GB + i })
  }
  escrever(linhaV2(arqs))
  const t0 = Date.now()
  await org.adicionar(raiz, { op: OP })
  await org.verificar()
  assert.ok(Date.now() - t0 < 5000)
  assert.equal(eventos[0].arquivos.length, 80)
  assert.ok(eventos[0].arquivos.reduce((s, a) => s + a.size, 0) > 300 * GB)
})

test('sem permissão de leitura: recusa com explicação', { skip: process.getuid && process.getuid() === 0 && 'root ignora permissão' }, async () => {
  const { raiz, org, escrever } = montar()
  arquivo(raiz, 'A/1.mov', '11111')
  escrever(linhaV2([{ rel: 'A/1.mov', size: 5 }]))
  chmodSync(raiz, 0o300)
  try {
    await assert.rejects(org.adicionar(raiz, { op: OP }), /permissão/)
  } finally {
    chmodSync(raiz, 0o755)
  }
  chmodSync(join(raiz, 'A', '1.mov'), 0o000)
  try {
    const c = await conferirArquivos(raiz, linhaV2([{ rel: 'A/1.mov', size: 5 }]))
    assert.deepEqual(c.ausentes, ['A/1.mov'])
  } finally {
    chmodSync(join(raiz, 'A', '1.mov'), 0o644)
  }
})

test('recibo: só estados e op do contrato; listas cortadas em 30 e só caminhos relativos', () => {
  assert.throws(() => linhaRecibo({ op: '../x', estado: 'preparado' }), /op/)
  assert.throws(() => linhaRecibo({ op: OP, estado: 'feito' }), /estado/)
  const r = linhaRecibo({ op: OP, estado: 'com_pendencias', versao: '1', resultado: { organizados: 2, revisar: -1, pendentes: 'x' }, exemplos: { ausentes: Array.from({ length: 50 }, (_, i) => `a/${i}.mov`), alterados: ['/etc/passwd', '../x', 'ok.mov'] }, erro: 'e'.repeat(500), projectId: 'nao-uuid' })
  assert.deepEqual(Object.keys(r), ['formato', 'op', 'app_versao', 'quando', 'project_id', 'estado', 'resultado', 'exemplos', 'erro'])
  assert.equal(r.project_id, null)
  assert.equal(r.resultado.revisar, 0)
  assert.equal(r.resultado.pendentes, 0)
  assert.equal(r.exemplos.ausentes.length, 30)
  assert.deepEqual(r.exemplos.alterados, ['ok.mov'])
  assert.equal(r.erro.length, 300)
})

test('resumo da página: organizados, sincronizados, sincronia ambígua para revisar e ignorados (vários formatos)', () => {
  const ev = { arquivos: ['A/C0001.MP4', 'A/C0002.MOV', 'Som/Z.WAV', 'Som/Z2.BWF', 'A/clip.mxf', 'Notas.txt', 'A/quebrado.mov'].map((rel) => ({ rel })) }
  const clip = (relPath, o = {}) => ({ relPath, status: 'ready', sync: { conf: 0.9, method: 'audio' }, ...o })
  const p = {
    result: {},
    clips: [
      clip('A/C0001.MP4'),
      clip('A/C0002.MOV', { sync: { conf: 0.3, method: 'audio' } }), // ambígua
      clip('Som/Z.WAV', { sync: { conf: 0.2, method: 'manual' } }), // ajustada à mão: não precisa revisar
      clip('Som/Z2.BWF', { sync: null }),
      clip('A/clip.mxf'),
      clip('A/quebrado.mov', { status: 'error', sync: null }),
      clip('Outro projeto/x.mov'),
    ],
    ignored: [{ relPath: 'Notas.txt' }, { relPath: 'Outro/y.txt' }],
  }
  const r = resumoPreparo(p, ev)
  assert.deepEqual(r.resultado, { organizados: 5, sincronizados: 4, ignorados: 2, revisar: 1 })
  assert.equal(r.estado, 'com_pendencias')
  assert.deepEqual(r.exemplos.revisar, ['A/C0002.MOV'])
  // sem sincronia ainda (nada de áudio): organizado, nada sincronizado, nada para revisar
  assert.deepEqual(resumoPreparo({ ...p, result: null }, ev).resultado, { organizados: 5, sincronizados: 0, ignorados: 2, revisar: 0 })
  assert.equal(resumoPreparo({ ...p, result: null }, ev).estado, 'preparado')
})
