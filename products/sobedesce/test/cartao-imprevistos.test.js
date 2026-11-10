// Imprevistos do cartão (09/11/2026): gravação interrompida (MP4/MOV sem índice ou cortado, JPEG sem o fim), os
// proxies da câmera e os restos do sistema que ficam no cartão sem segurar o "pode formatar". src/backup/imprevistos.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { deixaNoCartao, gravacaoInterrompida, procurarInterrompidas } from '../src/backup/imprevistos.js'
import { BackupService } from '../src/backup/servico.js'

const tmp = (p = 'sobedesce-imp-') => fs.mkdtempSync(path.join(os.tmpdir(), p))
const sem = { setActive() {} }

/** Bloco MP4: tamanho (32 bits) + tipo + conteúdo. `tamanho` força o campo (0 = até o fim). */
function bloco(tipo, conteudo = Buffer.alloc(0), tamanho) {
  const b = Buffer.alloc(8)
  b.writeUInt32BE(tamanho ?? 8 + conteudo.length, 0)
  b.write(tipo, 4, 'latin1')
  return Buffer.concat([b, conteudo])
}
const ftyp = () => bloco('ftyp', Buffer.from('XAVC\u0000\u0000\u0000\u0000XAVCmp42', 'latin1'))
const inteiro = () => Buffer.concat([ftyp(), bloco('mdat', Buffer.alloc(4096, 7)), bloco('moov', Buffer.alloc(64, 1))])
const semIndice = () => Buffer.concat([ftyp(), bloco('mdat', Buffer.alloc(4096, 7), 0)]) // a câmera não fechou o arquivo
const cortado = () => Buffer.concat([ftyp(), bloco('moov', Buffer.alloc(64, 1)), bloco('mdat', Buffer.alloc(100, 7), 9000)])
const jpeg = (fim = true) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 3), fim ? Buffer.from([0xff, 0xd9, 0, 0]) : Buffer.alloc(0)])

function escrever(raiz, rel, conteudo) {
  const f = path.join(raiz, ...rel.split('/'))
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, conteudo)
  return f
}

test('gravação interrompida: MP4 sem índice ou cortado e JPEG sem o fim; o inteiro, o vazio e o formato estranho', async () => {
  const d = tmp()
  assert.equal(await gravacaoInterrompida(escrever(d, 'a.MP4', inteiro())), null)
  assert.equal(await gravacaoInterrompida(escrever(d, 'b.MP4', semIndice())), 'sem-indice')
  assert.equal(await gravacaoInterrompida(escrever(d, 'c.MOV', cortado())), 'cortado')
  assert.equal(await gravacaoInterrompida(escrever(d, 'd.mp4', Buffer.alloc(0))), 'vazio')
  assert.equal(await gravacaoInterrompida(escrever(d, 'e.MP4', Buffer.alloc(3000, 1))), null, 'não parece QuickTime: não acusa')
  assert.equal(await gravacaoInterrompida(escrever(d, 'f.JPG', jpeg(true))), null)
  assert.equal(await gravacaoInterrompida(escrever(d, 'g.JPG', jpeg(false))), 'cortado')
  assert.equal(await gravacaoInterrompida(escrever(d, 'h.ARW', Buffer.alloc(10))), null, 'RAW: não confere')
  assert.equal(await gravacaoInterrompida(path.join(d, 'nao-existe.MP4')), null)
  assert.deepEqual(await procurarInterrompidas(d, ['a.MP4', 'b.MP4', 'g.JPG', 'h.ARW']), ['b.MP4', 'g.JPG'])
})

test('o que fica no cartão: proxies (LRV, LRF, THM) e restos do sistema; o material bruto e o XML da câmera vão', () => {
  for (const r of ['DCIM/100GOPRO/GL010001.LRV', 'DCIM/100MEDIA/DJI_0001.LRF', 'DCIM/100GOPRO/GX010001.THM', 'PRIVATE/._C0001.MP4', '.DS_Store', 'DCIM/Thumbs.db']) assert.ok(deixaNoCartao(r), r)
  for (const r of ['DCIM/100GOPRO/GX010001.MP4', 'PRIVATE/M4ROOT/CLIP/C0001M01.XML', 'DCIM/100CANON/IMG_0001.CR3', 'A001_C001.braw']) assert.ok(!deixaNoCartao(r), r)
})

test('descarga: gravação interrompida avisa (confira antes de formatar) e os proxies ficam no cartão sem segurar o "pode formatar"', async () => {
  const card = tmp('sobedesce-cartao-')
  escrever(card, 'DCIM/100GOPRO/GX010001.MP4', inteiro())
  escrever(card, 'DCIM/100GOPRO/GX010002.MP4', semIndice())
  escrever(card, 'DCIM/100GOPRO/GL010001.LRV', Buffer.alloc(500, 2))
  escrever(card, 'DCIM/100GOPRO/GX010001.THM', Buffer.alloc(50, 2))
  escrever(card, 'DCIM/._GX010001.MP4', Buffer.alloc(10, 2))
  const hd = tmp('sobedesce-hd-')
  const discos = [{ caminho: card, nome: 'GOPRO', id: 'uuid:GP', capacidade: 1 }]
  const avisos = []
  const ejetados = []
  const svc = new BackupService({ arquivo: path.join(tmp(), 'backup.json'), listar: async () => discos, vigiaMs: 0, keepAwake: sem, avisar: (ev, d) => avisos.push([ev, d]), ejetar: async (c) => (ejetados.push(c), true) })
  await svc.init()
  await svc.criarProjeto({ nome: 'Clipe', destinos: [hd], ejetar: true, midia: 'videos' })
  await svc.ligar(true)
  await svc.varrer()
  await svc.responder({ caminho: card, nome: 'Theo', camera: 'GoPro' })
  const t0 = Date.now()
  while ((svc.rodando || svc.fila.length) && Date.now() - t0 < 15_000) await new Promise((ok) => setTimeout(ok, 20))
  const v = svc.view()
  assert.equal(v.ultimo.resultado, 'ok')
  assert.equal(v.ultimo.parcial, false, 'o que ficou no cartão de propósito não conta como "ficou de fora"')
  assert.equal(v.ultimo.deixados, 2, 'LRV e THM (os ._ a leitura do cartão já pula)')
  assert.deepEqual(v.ultimo.listaSuspeitos, ['DCIM/100GOPRO/GX010002.MP4'])
  const pasta = path.join(hd, 'Clipe', 'Diária 01', 'Cenas', 'Theo - GoPro', 'Cartão 01', 'DCIM')
  assert.deepEqual(fs.readdirSync(path.join(pasta, '100GOPRO')).sort(), ['GX010001.MP4', 'GX010002.MP4'], 'o interrompido também foi copiado (igual ao do cartão)')
  assert.ok(!fs.existsSync(path.join(pasta, '._GX010001.MP4')))
  const feito = avisos.findLast(([ev]) => ev === 'backup-feito')[1]
  assert.equal(feito.suspeitos, 1)
  assert.deepEqual(ejetados, [card], 'tudo copiado: ejeta (o aviso diz para conferir antes de formatar)')
  await svc.close()
})

// ───── prévia do cartão (antes de copiar) ─────

/** Um JPEG mínimo válido com `n` bytes de dados de imagem (sem FF no meio). */
function jpegMinimo(n, cor = 0x11) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00])
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00])
  // dados com marcadores de reinício e FF 00 no meio: não podem ser lidos como fim
  const dados = Buffer.alloc(n, cor)
  dados[10] = 0xff
  dados[11] = 0x00
  dados[20] = 0xff
  dados[21] = 0xd3
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sos, dados, Buffer.from([0xff, 0xd9])])
}

test('RAW: pega a maior prévia JPEG embutida (a miniatura pequena fica de lado); sem prévia, null', async () => {
  const { maiorJpeg, jpegDoRaw, ehRaw } = await import('../src/media/raw-jpeg.js')
  const pequena = jpegMinimo(9000, 0x22)
  const grande = jpegMinimo(60_000, 0x33)
  const raw = Buffer.concat([Buffer.from('II*\u0000', 'latin1'), Buffer.alloc(300, 0), pequena, Buffer.alloc(500, 0x44), grande, Buffer.alloc(2000, 0x55)])
  const achado = maiorJpeg(raw)
  assert.equal(achado.length, grande.length)
  assert.ok(achado.equals(grande))
  const d = tmp()
  assert.ok((await jpegDoRaw(escrever(d, 'DSC0001.ARW', raw))).equals(grande))
  assert.equal(await jpegDoRaw(escrever(d, 'SEM.NEF', Buffer.alloc(5000, 0x10))), null)
  assert.ok(ehRaw('A/B/IMG_0001.CR3') && ehRaw('x.nef') && !ehRaw('x.jpg') && !ehRaw('x.mp4'))
})

test('prévia do cartão: fotos e vídeos do mais novo para o mais antigo, sem proxies; disco que não está plugado: 404', async () => {
  const card = tmp('sobedesce-cartao-')
  const velho = escrever(card, 'DCIM/100MSDCF/DSC0001.ARW', Buffer.alloc(100, 1))
  fs.utimesSync(velho, new Date(2026, 10, 1), new Date(2026, 10, 1))
  escrever(card, 'PRIVATE/M4ROOT/CLIP/C0001.MP4', inteiro())
  escrever(card, 'PRIVATE/M4ROOT/CLIP/C0001M01.XML', '<x/>')
  escrever(card, 'DCIM/100GOPRO/GL010001.LRV', Buffer.alloc(10, 2))
  const discos = [{ caminho: card, nome: 'SD A7', id: 'uuid:PV', capacidade: 1 }]
  const svc = new BackupService({ arquivo: path.join(tmp(), 'backup.json'), listar: async () => discos, vigiaMs: 0, keepAwake: sem, ejetar: async () => true })
  await svc.init()
  await svc.criarProjeto({ nome: 'Ensaio', destinos: [tmp('sobedesce-hd-')] })
  await svc.varrer()
  const p = await svc.previa(card)
  assert.equal(p.total, 2)
  assert.equal(p.videos, 1)
  assert.equal(p.fotos, 1)
  assert.deepEqual(p.itens.map((x) => [x.rel, x.tipo]), [['PRIVATE/M4ROOT/CLIP/C0001.MP4', 'videos'], ['DCIM/100MSDCF/DSC0001.ARW', 'fotos']])
  assert.equal(p.itens[1].caminho, velho)
  await assert.rejects(svc.previa('/nao/existe'), (err) => err.status === 404)
  await svc.close()
})
