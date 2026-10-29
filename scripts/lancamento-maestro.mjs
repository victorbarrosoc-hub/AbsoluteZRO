#!/usr/bin/env node
// Lançamento do Maestro em Beta grátis (ADR 0027, docs/operations/lancamento-maestro.md): as chaves que ficam no código
// dos apps (listas fixas da família e a vitrine do Maestro). O HUB não está aqui: ele lê o gate do banco (migration
// 0027) e mostra o Maestro sozinho. Uso:
//   node scripts/lancamento-maestro.mjs              mostra o estado de cada chave (não muda nada)
//   node scripts/lancamento-maestro.mjs --abrir      liga todas (lançamento)
//   node scripts/lancamento-maestro.mjs --fechar     desliga todas (reversão)
// Duas formas de chave:
//   - JS/TS: `const MAESTRO_NA_FAMILIA = false` (ou `export const MAESTRO_LANCADO = false;` no Maestro);
//   - HTML: o link fica comentado `<!--maestro-familia … maestro-familia-->` e, aberto,
//     `<!--maestro-familia-->…<!--/maestro-familia-->`.
// Arquivo sem a chave esperada faz o comando falhar sem mudar nada (nenhuma lista fica pela metade).
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Cada chave: arquivo, tipo e quantos blocos HTML o arquivo tem. */
export const CHAVES = [
  { arquivo: 'products/maestro/src/lib/site.ts', tipo: 'js', nome: 'MAESTRO_LANCADO', o_que: 'Maestro: página inicial em Beta grátis' },
  { arquivo: 'products/sobedesce/public/components/sidebar.js', tipo: 'js', nome: 'MAESTRO_NA_FAMILIA', o_que: 'SOBEDESCE (computador): família' },
  {
    arquivo: 'products/sobedesce/web/public/app/components/settings.js',
    tipo: 'js',
    nome: 'MAESTRO_NA_FAMILIA',
    o_que: 'SOBEDESCE (celular): Ajustes › família',
  },
  { arquivo: 'products/synquei/app/index.html', tipo: 'html', blocos: 1, o_que: 'Synquei: família no menu' },
  { arquivo: 'products/tpeasy/app/index.html', tipo: 'html', blocos: 1, o_que: 'TPeasy: família em Ajustes' },
  { arquivo: 'products/nossom/components/family-nav.tsx', tipo: 'js', nome: 'MAESTRO_NA_FAMILIA', o_que: 'NOSSOM: família no menu do estúdio' },
  { arquivo: 'products/ai-edit/src/familia.js', tipo: 'js', nome: 'MAESTRO_NA_FAMILIA', o_que: 'AEON: família (app e site)' },
  { arquivo: 'products/finishing/app/menu.js', tipo: 'js', nome: 'MAESTRO_NA_FAMILIA', o_que: 'Revela: família no menu' },
  { arquivo: 'products/finishing/index.html', tipo: 'html', blocos: 1, o_que: 'Revela: família na página inicial' },
  { arquivo: 'products/finishing/entrar.html', tipo: 'html', blocos: 1, o_que: 'Revela: família no Entrar' },
  { arquivo: 'products/carro-do-freela/src/template.html', tipo: 'html', blocos: 2, o_que: 'Carro do Freela: família (lateral e gaveta)' },
]

const reJs = (nome) => new RegExp(`^((?:export )?const ${nome} = )(true|false)(;?)$`, 'm')
const ABERTO = /<!--maestro-familia-->([\s\S]*?)<!--\/maestro-familia-->/g
const FECHADO = /<!--maestro-familia ([\s\S]*?) maestro-familia-->/g

/** Estado de um texto: true (aberto), false (fechado) ou um erro em texto. */
export function estado(chave, texto) {
  if (chave.tipo === 'js') {
    const m = reJs(chave.nome).exec(texto)
    return m ? m[2] === 'true' : `sem "const ${chave.nome} = true|false"`
  }
  const a = [...texto.matchAll(ABERTO)].length
  const f = [...texto.matchAll(FECHADO)].length
  if (a + f !== chave.blocos) return `esperava ${chave.blocos} bloco(s) maestro-familia, achei ${a + f}`
  if (a && f) return 'blocos misturados (abertos e fechados)'
  return a > 0
}

/** O texto com a chave virada para `abrir` (puro; o teste usa). */
export function virar(chave, texto, abrir) {
  if (chave.tipo === 'js') return texto.replace(reJs(chave.nome), `$1${abrir}$3`)
  return abrir
    ? texto.replace(FECHADO, (_, x) => `<!--maestro-familia-->${x}<!--/maestro-familia-->`)
    : texto.replace(ABERTO, (_, x) => `<!--maestro-familia ${x} maestro-familia-->`)
}

function principal(args) {
  const abrir = args.includes('--abrir')
  const fechar = args.includes('--fechar')
  if (abrir && fechar) throw new Error('Escolha --abrir ou --fechar.')
  const lidos = CHAVES.map((c) => ({ c, texto: readFileSync(path.join(RAIZ, c.arquivo), 'utf8') }))
  const erros = lidos.map(({ c, texto }) => [c, estado(c, texto)]).filter(([, e]) => typeof e === 'string')
  if (erros.length) {
    for (const [c, e] of erros) console.error(`✗ ${c.arquivo}: ${e}`)
    process.exitCode = 1
    return
  }
  for (const { c, texto } of lidos) {
    let agora = estado(c, texto)
    if (abrir || fechar) {
      const novo = virar(c, texto, abrir)
      if (novo !== texto) writeFileSync(path.join(RAIZ, c.arquivo), novo)
      agora = estado(c, novo)
    }
    console.log(`${agora ? '● aberto ' : '○ fechado'}  ${c.o_que}  (${c.arquivo})`)
  }
  if (abrir || fechar) console.log('\nRode os testes de cada produto e publique cada app (cada um no projeto Vercel dele).')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal(process.argv.slice(2))
