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
