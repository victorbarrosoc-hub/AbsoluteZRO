// Monta publico/ para a Vercel (aeon.absolutezro.com). Fechado ao público (api/_release.js, o padrão): só o site
// institucional (página inicial, entrar, "Em desenvolvimento", site/, marca/, vendor/ e os módulos que desenham a
// marca em src/); o editor (app/, o resto de src/, presets/) fica fora do estático e só sai pela função api/app.js para
// a conta liberada; instalar.sh e instalar.ps1 viram um recado (sem download). Com RELEASE=released, tudo como antes e a
// página inicial do lançamento: os trechos marcados com <!-- lancamento:X --> no index.html trocam pelas peças de
// lancamento/pagina.html (Baixar no topo, a seção #baixar no lugar de "Em desenvolvimento", a Z "No AEON", Quanto custa).
// Só arquivos de site: nada de desktop/, testes, scripts ou node_modules. Rode depois do npm run vendor.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HUB_INICIO, desktopAberto, release } from '../api/_release.js'

/** O site institucional (vale fechado e aberto). vendor/ é só biblioteca de terceiros, fonte, tokens e a Z. */
export const SITE = ['index.html', 'entrar.html', 'em-desenvolvimento.html', 'site', 'marca', 'vendor']
/** Os módulos com que o site desenha a marca (src/marca.js e o que ele importa). Nada do editor. */
export const MARCA = ['src/produto.js', 'src/marca.js', 'src/letras.js', 'src/familia.js']
/** Só com RELEASE=released: o editor no navegador e os instaladores pelo Terminal. */
export const ABERTO = ['instalar.sh', 'instalar.ps1', 'app', 'src', 'presets']

/** O que `curl … | bash` e `irm … | iex` recebem enquanto fechado: um recado, sem download e sem instalar nada. */
export const RECADO = {
  'instalar.sh': `#!/bin/sh\n# AEON (by Absolute ZRO): em desenvolvimento. Este comando ainda não instala nada.\nprintf '%s\\n' 'O AEON está em desenvolvimento. Ele chega com a sua conta Absolute ZRO.' 'Volte ao HUB: ${HUB_INICIO}' >&2\nexit 1\n`,
  'instalar.ps1': `# AEON (by Absolute ZRO): em desenvolvimento. Este comando ainda não instala nada.\nWrite-Host 'O AEON está em desenvolvimento. Ele chega com a sua conta Absolute ZRO.'\nWrite-Host 'Volte ao HUB: ${HUB_INICIO}'\n`,
}

/**
 * As peças do lançamento: { nome: html } de cada <template data-parte="nome">. Uma peça com data-quando="web" vale só
 * com o app de computador fechado; data-quando="computador", só com ele aberto; sem data-quando, nos dois.
 */
export function pecasDoLancamento(fonte, { computador = false } = {}) {
  const pecas = {}
  for (const m of fonte.matchAll(/<template data-parte="([a-z-]+)"(?: data-quando="(web|computador)")?>([\s\S]*?)<\/template>/g)) {
    const [, nome, quando, html] = m
    if (!quando || quando === (computador ? 'computador' : 'web')) pecas[nome] = html
  }
  return pecas
}

/** A página inicial aberta: cada trecho marcado vira a peça do mesmo nome (falta de um lado ou do outro é erro). */
export function paginaAberta(html, pecas) {
  const usadas = new Set()
  const saida = html.replace(/<!-- lancamento:([a-z-]+) -->([\s\S]*?)<!-- \/lancamento:\1 -->/g, (_, nome) => {
    if (!(nome in pecas)) throw new Error(`lancamento/pagina.html não tem a peça "${nome}"`)
    usadas.add(nome)
    return pecas[nome]
  })
  const sobra = Object.keys(pecas).filter((n) => !usadas.has(n))
  if (sobra.length) throw new Error(`peças sem lugar no index.html: ${sobra.join(', ')}`)
  if (/lancamento:/.test(saida)) throw new Error('marca de lançamento sem fechamento no index.html')
  return saida
}

/** Aberto só na web (o app de computador ainda não): os comandos do Terminal mandam para o navegador. */
export const RECADO_WEB = {
  'instalar.sh': `#!/bin/sh\n# AEON (by Absolute ZRO): o app de computador chega em breve. Este comando ainda não instala nada.\nprintf '%s\\n' 'O app de computador do AEON chega em breve.' 'Use no navegador (Chrome ou Edge): https://aeon.absolutezro.com/app/' >&2\nexit 1\n`,
  'instalar.ps1': `# AEON (by Absolute ZRO): o app de computador chega em breve. Este comando ainda não instala nada.\nWrite-Host 'O app de computador do AEON chega em breve.'\nWrite-Host 'Use no navegador (Chrome ou Edge): https://aeon.absolutezro.com/app/'\n`,
}

export const itens = (estado = release()) => (estado === 'released' ? [...SITE, ...ABERTO] : [...SITE, ...MARCA])

/** Copia os itens do estado para `saida` (apagada antes). Devolve o estado e a lista. */
export function publicar({ raiz = new URL('..', import.meta.url), saida = new URL('publico/', raiz), estado = release(), computador = desktopAberto() } = {}) {
  if (!existsSync(new URL('vendor/mediabunny.min.mjs', raiz))) throw new Error('vendor/ vazio: rode npm run vendor antes')
  rmSync(saida, { recursive: true, force: true })
  mkdirSync(saida, { recursive: true })
  const lista = itens(estado)
  for (const i of lista) {
    const de = new URL(i, raiz)
    const para = new URL(i, saida)
    if (statSync(de).isFile()) mkdirSync(dirname(fileURLToPath(para)), { recursive: true })
    cpSync(de, para, { recursive: true })
  }
  if (estado !== 'released') for (const [nome, texto] of Object.entries(RECADO)) writeFileSync(new URL(nome, saida), texto)
  else {
    const pecas = pecasDoLancamento(readFileSync(new URL('lancamento/pagina.html', raiz), 'utf8'), { computador })
    writeFileSync(new URL('index.html', saida), paginaAberta(readFileSync(new URL('index.html', raiz), 'utf8'), pecas))
    // só na web: os comandos do Terminal mandam para o navegador (sem instalar nada)
    if (!computador) for (const [nome, texto] of Object.entries(RECADO_WEB)) writeFileSync(new URL(nome, saida), texto)
  }
  return { estado, computador, itens: lista }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const r = publicar()
  console.log(`publico/ pronto (${r.estado}${r.estado === 'released' ? (r.computador ? ', com o app de computador' : ', só na web') : ''}):`, r.itens.join(', '))
}
