#!/usr/bin/env node
// Gera o par "Preparar no Synquei" com o código REAL dos dois apps:
//  - tests/fixtures/sobedesce/drive-descargas.jsonl: a linha v2 (download do Drive) que o SOBEDESCE grava
//    (products/sobedesce/src/engine/manifesto.js), depois de uma linha v1 de cartão (o mesmo arquivo nos dois casos);
//  - tests/fixtures/sobedesce/drive-preparos.jsonl: o recibo synquei.preparo/1 que o Synquei grava
//    (products/synquei/desktop/manifesto-drive.cjs, linhaRecibo): recebido → preparando → com pendências.
// Lote fictício numa pasta temporária; o `caminho` do destino vira um caminho de exemplo. Nada de dado pessoal.
//
//   node scripts/fixtures/generate-sobedesce-drive.mjs
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { manifestoDoLote } = await import(path.join(RAIZ, 'products/sobedesce/src/engine/manifesto.js'))
const { linhaRecibo } = createRequire(import.meta.url)(path.join(RAIZ, 'products/synquei/desktop/manifesto-drive.cjs'))

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-drive-'))
const PASTA = 'Gravação 28-10 · Ação'
const OP = 'bFixtureDrive01'
const arquivos = [
  { rel: 'Câmera A/C0001.MP4', conteudo: 'video camera a', md5: true },
  { rel: 'Câmera B/A001_C002.MOV', conteudo: 'video camera b', md5: true },
  { rel: 'Som/ZOOM0001.WAV', conteudo: 'audio do gravador', md5: true },
  { rel: 'Roteiro.docx', conteudo: 'roteiro exportado do Docs', md5: false },
]
const records = arquivos.map((a, i) => {
  const relPath = `${PASTA}/${a.rel}`
  const abs = path.join(tmp, ...relPath.split('/'))
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, a.conteudo)
  const hex = crypto.createHash('md5').update(a.conteudo).digest('hex')
  return {
    id: `t${i}`,
    type: 'download',
    batchId: OP,
    status: 'completed',
    name: relPath.split('/').pop(),
    relPath,
    size: a.md5 ? Buffer.byteLength(a.conteudo) : null,
    source: { fileId: `arquivoFixture0${i + 1}`, md5: a.md5 ? hex : null },
    dest: { path: abs },
    verify: a.md5 ? { state: 'ok', expected: hex, actual: hex } : null,
  }
})
const m = await manifestoDoLote({
  batch: { id: OP, origem: { pastaId: 'pastaFixtureDrive01', pasta: PASTA } },
  records,
  agora: new Date('2026-10-28T12:00:00Z'),
  versao: '0.1.0+1234',
})
fs.rmSync(tmp, { recursive: true, force: true })
if (!m.ok) throw new Error(m.motivo)
const linha = { ...m.linha, destino: { ...m.linha.destino, caminho: `/Volumes/SSD/Downloads/${PASTA}` } }
const v1 = fs.readFileSync(path.join(RAIZ, 'tests/fixtures/sobedesce/unica-descargas.jsonl'), 'utf8').trim().split('\n')[0]
fs.writeFileSync(path.join(RAIZ, 'tests/fixtures/sobedesce/drive-descargas.jsonl'), `${v1}\n${JSON.stringify(linha)}\n`)

const base = { op: OP, versao: '1.0.0+1001' }
const recibos = [
  linhaRecibo({ ...base, estado: 'recebido', agora: new Date('2026-10-28T12:01:00Z') }),
  linhaRecibo({ ...base, estado: 'preparando', agora: new Date('2026-10-28T12:01:01Z') }),
  linhaRecibo({
    ...base,
    estado: 'com_pendencias',
    agora: new Date('2026-10-28T12:03:00Z'),
    resultado: { organizados: 3, sincronizados: 3, ignorados: 1, pendentes: 1, revisar: 1 },
    exemplos: { revisar: ['Câmera B/A001_C002.MOV'] },
  }),
]
fs.writeFileSync(path.join(RAIZ, 'tests/fixtures/sobedesce/drive-preparos.jsonl'), recibos.map((r) => JSON.stringify(r)).join('\n') + '\n')
console.log('fixtures: tests/fixtures/sobedesce/drive-descargas.jsonl e drive-preparos.jsonl')
