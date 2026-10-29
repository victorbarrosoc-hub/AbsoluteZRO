// Monta publico/ para a Vercel (aeon.absolutezro.com). Fechado ao público (api/_release.js, o padrão): só o site
// institucional (página inicial, entrar, "Em desenvolvimento", site/, marca/, vendor/ e os módulos que desenham a
// marca em src/); o editor (app/, o resto de src/, presets/) fica fora do estático e só sai pela função api/app.js para
// a conta liberada; instalar.sh e instalar.ps1 viram um recado (sem download). Com RELEASE=released, tudo como antes.
// Só arquivos de site: nada de desktop/, testes, scripts ou node_modules. Rode depois do npm run vendor.
import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HUB_INICIO, release } from '../api/_release.js'

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

export const itens = (estado = release()) => (estado === 'released' ? [...SITE, ...ABERTO] : [...SITE, ...MARCA])

/** Copia os itens do estado para `saida` (apagada antes). Devolve o estado e a lista. */
export function publicar({ raiz = new URL('..', import.meta.url), saida = new URL('publico/', raiz), estado = release() } = {}) {
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
  return { estado, itens: lista }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const r = publicar()
  console.log(`publico/ pronto (${r.estado}):`, r.itens.join(', '))
}
