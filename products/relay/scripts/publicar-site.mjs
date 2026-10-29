// Monta publico/ (o outputDirectory da Vercel): só o que o site serve. Fica de fora o que é de desenvolvimento
// (scripts, testes, node_modules, docs, laboratório). O site é estático e sem build: copia como está.
//
// Fechado por padrão (lançamento junto com o Maestro, decisão do titular; gate da ADR 0023): sem RELEASE=released no
// projeto Vercel, publico/ leva só a página "Em breve" (em todas as rotas do site) e a marca. Nenhum arquivo do
// conversor fica no ar. Abrir = RELEASE=released no projeto `relay` + deploy novo.

import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const raiz = fileURLToPath(new URL('..', import.meta.url))
export const PUBLICO = ['index.html', 'converter.html', 'qualidade.html', 'manifest.webmanifest', 'app', 'src', 'vendor', 'marca', 'fontes']
/** Fechado: só o que a página "Em breve" usa. */
export const FECHADO = ['app/relay.css', 'app/tema.js', 'marca/relay-icone.svg', 'marca/app', 'marca/og.png', 'fontes']
export const ROTAS_DO_SITE = ['index.html', 'converter.html', 'qualidade.html', 'marca/index.html', '404.html']

const semOcultos = (f) => !/(^|\/)\.[^/]+$/.test(f) && !f.endsWith('.md')

export function publicar({ saida = join(raiz, 'publico'), aberto = process.env.RELEASE === 'released' } = {}) {
  rmSync(saida, { recursive: true, force: true })
  mkdirSync(saida)
  if (aberto) {
    for (const p of PUBLICO) cpSync(join(raiz, p), join(saida, p), { recursive: true, filter: semOcultos })
  } else {
    for (const p of FECHADO) cpSync(join(raiz, p), join(saida, p), { recursive: true, filter: semOcultos })
    const pagina = readFileSync(join(raiz, 'em-breve.html'))
    for (const r of ROTAS_DO_SITE) {
      mkdirSync(join(saida, r, '..'), { recursive: true })
      writeFileSync(join(saida, r), pagina)
    }
  }
  return aberto
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const aberto = publicar()
  console.log(aberto ? `publico/ aberto: ${PUBLICO.join(', ')}` : 'publico/ fechado: só "Em breve" (RELEASE=released abre)')
}
