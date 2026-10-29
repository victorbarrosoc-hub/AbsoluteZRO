// Monta publico/ (o outputDirectory da Vercel): só o que o site serve. Fica de fora o que é de desenvolvimento
// (scripts, testes, node_modules, docs, laboratório). O site é estático e sem build: copia como está.

import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const raiz = fileURLToPath(new URL('..', import.meta.url))
const saida = join(raiz, 'publico')
export const PUBLICO = ['index.html', 'converter.html', 'qualidade.html', 'manifest.webmanifest', 'app', 'src', 'vendor', 'marca', 'fontes']

rmSync(saida, { recursive: true, force: true })
mkdirSync(saida)
for (const p of PUBLICO) cpSync(join(raiz, p), join(saida, p), { recursive: true, filter: (f) => !/(^|\/)\.[^/]+$/.test(f) && !f.endsWith('.md') })
console.log(`publico/ montado: ${PUBLICO.join(', ')}`)
