#!/usr/bin/env node
// Gera o comprovante de entrega (sobedesce.entrega/1) com o código REAL do SOBEDESCE (products/sobedesce/src/engine/entrega.js)
// a partir de um lote de envio fictício já concluído e conferido pelo MD5. Nada de dado pessoal: nomes e ids inventados.
//
//   node scripts/fixtures/generate-sobedesce-entrega.mjs
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { comprovanteDeEntrega } = await import(path.join(RAIZ, 'products/sobedesce/src/engine/entrega.js'))

const md5 = (t) => crypto.createHash('md5').update(t).digest('hex')
const arquivo = (rel, conteudo, n) => ({
  type: 'upload',
  batchId: 'bTesteEntrega01',
  status: 'completed',
  name: rel.split('/').pop(),
  relPath: `Filme X · Entregas/${rel}`,
  size: Buffer.byteLength(conteudo),
  target: {
    rootId: 'root',
    relDir: ['Filme X · Entregas', ...rel.split('/').slice(0, -1)].join('/'),
    parentId: 'pastaTesteEntrega01',
    fileId: `arquivoTeste0${n}`,
  },
  verify: { state: 'ok', expected: md5(conteudo), actual: md5(conteudo) },
})
const records = [
  arquivo('Filme X · YouTube.mp4', 'video youtube', 1),
  arquivo('Filme X · Reels.mp4', 'video reels', 2),
  arquivo('Legendas/Filme X.srt', '1\n00:00:01,000 --> 00:00:02,000\nOi\n', 3),
]
const entrega = comprovanteDeEntrega({
  records,
  pastaId: 'pastaTesteEntrega01',
  id: 'ent-bTesteEntrega01',
  agora: new Date('2026-10-26T12:00:00Z'),
  origem: 'revela',
})
fs.writeFileSync(path.join(RAIZ, 'tests/fixtures/sobedesce/entrega.json'), JSON.stringify(entrega, null, 2) + '\n')
console.log('fixture: tests/fixtures/sobedesce/entrega.json')
