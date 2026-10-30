// Monta publico/ (o outputDirectory da Vercel): só o que o site serve. Fica de fora o que é de desenvolvimento
// (scripts, testes, node_modules, docs, laboratório). O site é estático e sem build: copia como está.
//
// Fechado por padrão (lançamento junto com o Maestro, decisão do titular; gate da ADR 0023): sem RELEASE=released no
// projeto Vercel, publico/ leva só a página "Em breve" (em todas as rotas do site) e a marca. Nenhum arquivo do
// conversor fica no ar. Abrir = RELEASE=released no projeto `relay` + deploy novo.
//
// Prévias da Vercel (VERCEL_ENV=preview, protegidas pelo login da Vercel): o site inteiro e o laboratório de aparelhos
// (/laboratorio, interno), para medir em Mac, iPhone e Windows de verdade. A produção nunca leva o laboratório.
//
// Recursos de outra plataforma (app/recursos.js): a cor da Revela aparece nas prévias e, na produção, só com
// REVELA=released (quando a Revela estiver no ar).

import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const raiz = fileURLToPath(new URL('..', import.meta.url))
export const PUBLICO = ['index.html', 'converter.html', 'painel.html', 'manifest.webmanifest', 'app', 'src', 'vendor', 'marca', 'fontes']
/** Fechado: só o que a página "Em breve" usa. */
export const FECHADO = ['app/relay.css', 'app/tema.js', 'marca/relay-icone.svg', 'marca/app', 'marca/og.png', 'fontes']
/** Só nas prévias: o laboratório de aparelhos e o que ele carrega a mais. */
export const LABORATORIO = ['laboratorio.html']
const SO_NA_PREVIA = /laboratorio|src\/(cenas|ssim)\.js$/
export const ROTAS_DO_SITE = ['index.html', 'converter.html', 'painel.html', 'qualidade.html', 'marca/index.html', 'laboratorio.html', '404.html']

const semOcultos = (f) => !/(^|\/)\.[^/]+$/.test(f) && !f.endsWith('.md')

export function publicar({ saida = join(raiz, 'publico'), previa = process.env.VERCEL_ENV === 'preview', aberto = process.env.RELEASE === 'released' || previa, revela = process.env.REVELA === 'released' || previa } = {}) {
  rmSync(saida, { recursive: true, force: true })
  mkdirSync(saida)
  if (aberto) {
    for (const p of PUBLICO) cpSync(join(raiz, p), join(saida, p), { recursive: true, filter: (f) => semOcultos(f) && (previa || !SO_NA_PREVIA.test(f)) })
    if (previa) for (const p of LABORATORIO) cpSync(join(raiz, p), join(saida, p))
    writeFileSync(join(saida, 'app/recursos.js'), `// Gerado por scripts/publicar-site.mjs\nexport const RECURSOS = ${JSON.stringify({ revela })}\n`)
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
  console.log(aberto ? `publico/ aberto${process.env.VERCEL_ENV === 'preview' ? ' (prévia, com o laboratório)' : ''}: ${PUBLICO.join(', ')}` : 'publico/ fechado: só "Em breve" (RELEASE=released abre)')
}
