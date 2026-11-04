// Backup Automático: fotos e vídeos (Cenas / Fotos), "Escolher o que passar", excluir o projeto, limpar o histórico,
// ejetar com motivo e o Synquei opcional (docs/BACKUP-AUTOMATICO.md). Cópia de verdade em pastas temporárias.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BackupService, RESUMO_ARQUIVO, RESUMO_PASTA } from '../src/backup/servico.js'
import { levas, limparEscolha, secaoSugerida, tipoDe } from '../src/backup/midia.js'
import { ejetar, quemSegura } from '../src/backup/volumes.js'

const tmp = (p = 'sobedesce-fv-') => fs.mkdtempSync(path.join(os.tmpdir(), p))
const sem = { setActive() {} }

function escrever(raiz, rel, conteudo) {
  const f = path.join(raiz, ...rel.split('/'))
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, conteudo)
}

/** Cartão de câmera híbrida: vídeo (PRIVATE), foto JPG + RAW (DCIM) e o índice. */
function cartaoMisto() {
  const raiz = tmp('sobedesce-misto-')
  escrever(raiz, 'PRIVATE/M4ROOT/CLIP/C0001.MP4', Buffer.alloc(4000, 1))
  escrever(raiz, 'PRIVATE/M4ROOT/CLIP/C0001M01.XML', '<x/>')
  escrever(raiz, 'DCIM/100MSDCF/DSC00001.JPG', Buffer.alloc(900, 2))
  escrever(raiz, 'DCIM/100MSDCF/DSC00001.ARW', Buffer.alloc(1800, 3))
  escrever(raiz, 'DCIM/101MSDCF/DSC00002.JPG', Buffer.alloc(950, 4))
  return raiz
}

function cartaoSoFotos() {
  const raiz = tmp('sobedesce-fotos-')
  escrever(raiz, 'DCIM/100CANON/IMG_0001.CR3', Buffer.alloc(1500, 5))
  escrever(raiz, 'DCIM/100CANON/IMG_0002.CR3', Buffer.alloc(1600, 6))
  return raiz
}

async function esperar(fn, ms = 15_000) {
  const t0 = Date.now()
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('demorou demais')
    await new Promise((r) => setTimeout(r, 20))
  }
}

function montar({ ejetarFn } = {}) {
  const discos = []
  const svc = new BackupService({ arquivo: path.join(tmp(), 'backup.json'), listar: async () => discos.map((d) => ({ ...d })), vigiaMs: 0, keepAwake: sem, ejetar: ejetarFn || (async () => true) })
  const ocioso = () => esperar(() => !svc.rodando && !svc.fila.length)
  return { svc, discos, ocioso }
}

const existe = (...p) => fs.existsSync(path.join(...p))
const linhas = (hd, projeto) => fs.readFileSync(path.join(hd, projeto, RESUMO_PASTA, RESUMO_ARQUIVO), 'utf8').trim().split('\n').map((l) => JSON.parse(l))

test('tipo pela extensão; sugestão de pasta pelo que o cartão tem; escolha limpa', () => {
  assert.equal(tipoDe('PRIVATE/M4ROOT/CLIP/C0001.MP4'), 'videos')
  assert.equal(tipoDe('A001/clip.BRAW'), 'videos')
  assert.equal(tipoDe('DCIM/100/DSC1.ARW'), 'fotos')
  assert.equal(tipoDe('DCIM/100/IMG.HEIC'), 'fotos')
  assert.equal(tipoDe('PRIVATE/M4ROOT/MEDIAPRO.XML'), 'outros')
  const c = (v, f) => ({ tipos: { videos: { arquivos: v }, fotos: { arquivos: f }, outros: { arquivos: 1 } } })
  assert.equal(secaoSugerida(c(0, 5)), 'fotos')
  assert.equal(secaoSugerida(c(3, 0)), 'cenas')
  assert.equal(secaoSugerida(c(3, 5)), 'separar')
  assert.equal(secaoSugerida(c(3, 5), 'videos'), 'cenas')
  assert.equal(limparEscolha({ tipos: [] }), null)
  assert.deepEqual(limparEscolha({ tipos: ['fotos', 'x'], pastas: ['../fora', '/abs', 'DCIM/100MSDCF'] }), { tipos: ['fotos'], pastas: ['DCIM/100MSDCF'] })
  assert.equal(levas({}).tudo, true)
  assert.equal(levas({ midia: 'videos' }).tudo, false)
  assert.deepEqual(levas({ secao: 'separar' }).levas.map((l) => l.pasta), ['Cenas', 'Fotos'])
})

test('os dois: cartão misto separa vídeo em Cenas e foto em Fotos (mesmo Cartão NN); pode formatar', async () => {
  const { svc, discos, ocioso } = montar()
  await svc.init()
  const hd = tmp('sobedesce-hd-')
  await svc.criarProjeto({ nome: 'Casamento', destinos: [hd], midia: 'tudo' })
  const card = cartaoMisto()
  discos.push({ caminho: card, nome: 'SD A7IV', id: 'uuid:MISTO' })
  await svc.varrer()
  const pedido = svc.view().pedidos[0]
  assert.equal(pedido.secaoSugerida, 'separar')
  assert.equal(pedido.conteudo.videos.arquivos, 1)
  assert.equal(pedido.conteudo.fotos.arquivos, 3)
  await svc.responder({ caminho: card, nome: 'Ana', camera: 'A7 IV', secao: 'separar' })
  await ocioso()
  const v = svc.view()
  assert.equal(v.ultimo.resultado, 'ok')
  assert.equal(v.ultimo.parcial, false, 'tudo do cartão foi: pode formatar')
  assert.deepEqual(v.ultimo.secoes, ['cenas', 'fotos'])
  const d1 = path.join(hd, 'Casamento', 'Diária 01')
  assert.ok(existe(d1, 'Cenas', 'Ana - A7 IV', 'Cartão 01', 'PRIVATE/M4ROOT/CLIP/C0001.MP4'))
  assert.ok(existe(d1, 'Cenas', 'Ana - A7 IV', 'Cartão 01', 'PRIVATE/M4ROOT/CLIP/C0001M01.XML'), 'o resto da estrutura vai com o vídeo')
  assert.ok(!existe(d1, 'Cenas', 'Ana - A7 IV', 'Cartão 01', 'DCIM'), 'foto não vai para Cenas')
  assert.ok(existe(d1, 'Fotos', 'Ana - A7 IV', 'Cartão 01', 'DCIM/100MSDCF/DSC00001.ARW'))
  assert.ok(!existe(d1, 'Fotos', 'Ana - A7 IV', 'Cartão 01', 'PRIVATE'))
  const ls = linhas(hd, 'Casamento')
  assert.deepEqual(ls.map((l) => [l.secao, l.cartao.pasta]), [['cenas', 'Diária 01/Cenas/Ana - A7 IV/Cartão 01'], ['fotos', 'Diária 01/Fotos/Ana - A7 IV/Cartão 01']])
  assert.equal(v.projeto.donos[0].secao, 'separar')
  await svc.close()
})

test('só fotos no cartão: vai para Fotos, sem criar uma Cenas vazia', async () => {
  const { svc, discos, ocioso } = montar()
  await svc.init()
  const hd = tmp('sobedesce-hd-')
  await svc.criarProjeto({ nome: 'Ensaio', destinos: [hd] })
  const card = cartaoSoFotos()
  discos.push({ caminho: card, nome: 'CANON', id: 'uuid:FOTOS' })
  await svc.varrer()
  assert.equal(svc.view().pedidos[0].secaoSugerida, 'fotos')
  await svc.responder({ caminho: card, nome: 'Bia', camera: 'R6', secao: 'separar' })
  await ocioso()
  const d1 = path.join(hd, 'Ensaio', 'Diária 01')
  assert.ok(existe(d1, 'Fotos', 'Bia - R6', 'Cartão 01', 'DCIM/100CANON/IMG_0002.CR3'))
  assert.ok(!existe(d1, 'Cenas'), 'sem pasta Cenas vazia')
  assert.equal(svc.view().ultimo.parcial, false)
  await svc.close()
})

test('projeto só de vídeos: as fotos ficam no cartão e o fim não diz "pode formatar"', async () => {
  const { svc, discos, ocioso } = montar()
  await svc.init()
  const hd = tmp('sobedesce-hd-')
  await svc.criarProjeto({ nome: 'Clipe', destinos: [hd], midia: 'videos', ejetar: true })
  const card = cartaoMisto()
  discos.push({ caminho: card, nome: 'SD', id: 'uuid:V' })
  await svc.varrer()
  await svc.responder({ caminho: card, nome: 'Leo', camera: 'FX3' })
  await ocioso()
  const v = svc.view()
  const d1 = path.join(hd, 'Clipe', 'Diária 01')
  assert.ok(existe(d1, 'Cenas', 'Leo - FX3', 'Cartão 01', 'PRIVATE/M4ROOT/CLIP/C0001.MP4'))
  assert.ok(!existe(d1, 'Fotos'))
  assert.ok(!existe(d1, 'Cenas', 'Leo - FX3', 'Cartão 01', 'DCIM'))
  assert.equal(v.ultimo.resultado, 'ok')
  assert.equal(v.ultimo.parcial, true)
  assert.equal(v.volumes[0].parcial, true)
  assert.equal(v.volumes[0].estado, 'ok', 'parcial não ejeta sozinho')
  await svc.close()
})

test('"Escolher o que passar": só os tipos e as pastas marcadas, desta vez; o conteúdo lista o cartão', async () => {
  const { svc, discos, ocioso } = montar()
  await svc.init()
  const hd = tmp('sobedesce-hd-')
  await svc.criarProjeto({ nome: 'Doc', destinos: [hd] })
  const card = cartaoMisto()
  discos.push({ caminho: card, nome: 'SD', id: 'uuid:E' })
  await svc.varrer()
  const c = await svc.conteudo(card)
  assert.equal(c.tipos.fotos.arquivos, 3)
  assert.deepEqual(c.pastas.map((p) => p.pasta), ['DCIM/100MSDCF', 'DCIM/101MSDCF', 'PRIVATE/M4ROOT/CLIP'])
  // Escolha feita na pergunta: só as fotos da pasta 100MSDCF.
  await svc.responder({ caminho: card, nome: 'Ana', camera: 'A7 IV', secao: 'separar', escolha: { tipos: ['fotos'], pastas: ['DCIM/100MSDCF'] } })
  await ocioso()
  const d1 = path.join(hd, 'Doc', 'Diária 01')
  assert.ok(existe(d1, 'Fotos', 'Ana - A7 IV', 'Cartão 01', 'DCIM/100MSDCF/DSC00001.JPG'))
  assert.ok(!existe(d1, 'Fotos', 'Ana - A7 IV', 'Cartão 01', 'DCIM/101MSDCF'))
  assert.ok(!existe(d1, 'Cenas'))
  assert.equal(svc.view().ultimo.parcial, true)
  // A escolha valia só daquela vez: "Escolher…" de novo, agora o resto (vídeos e a outra pasta).
  await svc.escolher(card, { tipos: ['videos', 'fotos', 'outros'] })
  await ocioso()
  assert.ok(existe(d1, 'Cenas', 'Ana - A7 IV', 'Cartão 01', 'PRIVATE/M4ROOT/CLIP/C0001.MP4'))
  assert.ok(existe(d1, 'Fotos', 'Ana - A7 IV', 'Cartão 01', 'DCIM/101MSDCF/DSC00002.JPG'))
  assert.equal(svc.view().ultimo.parcial, false)
  await assert.rejects(svc.escolher(card, { tipos: [] }), (e) => e.status === 400)
  await svc.close()
})

test('excluir o projeto com um cartão passando: para, some da lista e o cartão não volta a passar', async () => {
  const { svc, discos } = montar()
  await svc.init()
  const hd = tmp('sobedesce-hd-')
  const v0 = await svc.criarProjeto({ nome: 'Teste', destinos: [hd] })
  const card = cartaoMisto()
  discos.push({ caminho: card, nome: 'SD', id: 'uuid:X' })
  await svc.varrer()
  await svc.responder({ caminho: card, nome: 'Ana', camera: 'FX30' })
  const v = await svc.apagarProjeto(v0.atual)
  assert.equal(v.projeto, null)
  assert.equal(v.projetos.length, 0)
  assert.equal(v.ligado, false)
  assert.equal(svc.rodando, false)
  await svc.varrer() // espetado de novo: sem projeto, nada passa
  assert.equal(svc.view().fila.length, 0)
  assert.equal(svc.view().pedidos.length, 0)
  await assert.rejects(svc.apagarProjeto('nao-existe'), (e) => e.status === 404)
  await svc.close()
})

test('limpar o histórico: a lista some; o total do projeto, a numeração e o resumo ficam', async () => {
  const { svc, discos, ocioso } = montar()
  await svc.init()
  const hd = tmp('sobedesce-hd-')
  await svc.criarProjeto({ nome: 'Show', destinos: [hd] })
  const card = cartaoSoFotos()
  discos.push({ caminho: card, nome: 'SD', id: 'uuid:H' })
  await svc.varrer()
  await svc.responder({ caminho: card, nome: 'Ana', camera: 'R6' })
  await ocioso()
  const antes = svc.view().projeto.total
  const v = await svc.limparHistorico()
  assert.equal(v.projeto.historico.length, 0)
  assert.equal(v.ultimo, null)
  assert.deepEqual(v.projeto.total, antes)
  assert.equal(linhas(hd, 'Show').length, 1, 'o descargas.jsonl do Synquei/HUB não muda')
  assert.equal(v.projeto.donos[0].cartoes, 1, 'a numeração dos cartões continua')
  await svc.close()
})

test('Synquei opcional: criar e editar guardam a escolha', async () => {
  const { svc } = montar()
  await svc.init()
  const hd = tmp('sobedesce-hd-')
  let v = await svc.criarProjeto({ nome: 'Sem Synquei', destinos: [hd], synquei: false })
  assert.equal(v.projeto.synquei, false)
  v = await svc.editarProjeto(v.atual, { synquei: true, midia: 'fotos' })
  assert.equal(v.projeto.synquei, true)
  assert.equal(v.projeto.midia, 'fotos')
  await svc.close()
})

test('ejetar no Mac: o eject recusado tenta desmontar só o volume; recusado de novo, diz quem segura', async () => {
  const chamadas = []
  const ok = await ejetar('/Volumes/Data', { platform: 'darwin', exec: async (cmd, args) => (chamadas.push(args[0]), { ok: args[0] === 'unmount', saida: '' }) })
  assert.deepEqual(ok, { ok: true, quem: null })
  assert.deepEqual(chamadas, ['eject', 'unmount'])
  const nao = await ejetar('/Volumes/Data', { platform: 'darwin', exec: async () => ({ ok: false, saida: 'Volume Data on disk4s2 failed to unmount: dissented by PID 912 (/Applications/DaVinci Resolve.app/Contents/MacOS/Resolve)' }) })
  assert.deepEqual(nao, { ok: false, quem: 'DaVinci Resolve' })
  assert.match(quemSegura('dissented by PID 77 (/System/Library/Frameworks/CoreServices.framework/Frameworks/Metadata.framework/Versions/A/Support/mds_stores)'), /Spotlight/)
  assert.equal(quemSegura('falhou'), null)

  const { svc, discos } = montar({ ejetarFn: async () => ({ ok: false, quem: 'DaVinci Resolve' }) })
  await svc.init()
  await svc.criarProjeto({ nome: 'E', destinos: [tmp()] })
  await svc.ligar(false)
  const card = cartaoSoFotos()
  discos.push({ caminho: card, nome: 'SD', id: 'uuid:J' })
  await svc.varrer()
  await assert.rejects(svc.ejetar(card), /DaVinci Resolve está usando o disco/)
  await svc.close()
})
