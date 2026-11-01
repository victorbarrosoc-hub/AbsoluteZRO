// Os menus do app (Arquivo, Editar, Camada, Reproduzir, IA, Ajuda) mandam comandos para a página do Rift pelo evento
// rift:comando. Este teste confere o contrato dos dois lados: todo comando do menu tem quem trate na página
// (prototipo.html), e a página não espera comando que o menu não manda.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const main = fs.readFileSync(path.join(RAIZ, 'desktop/main.cjs'), 'utf8')
const pagina = fs.readFileSync(path.join(RAIZ, '../prototipo.html'), 'utf8')

const doMenu = new Set([...main.matchAll(/(?:cmd|so)\((?:'[^']*', '[^']*', )?'([a-z0-9-]+)'\)/g)].map((m) => m[1]))
const naPagina = new Set([
  ...[...pagina.matchAll(/case '([a-z0-9-]+)':/g)].map((m) => m[1]),
  ...[...pagina.matchAll(/n === '([a-z0-9-]+)'/g)].map((m) => m[1]),
])

test('cada comando dos menus tem quem trate na página', () => {
  assert.ok(doMenu.size >= 18, `poucos comandos lidos do main.cjs: ${[...doMenu]}`)
  const sem = [...doMenu].filter((n) => !naPagina.has(n))
  assert.deepEqual(sem, [], `sem tratamento na página: ${sem}`)
})

test('menus de programa: Camada, Reproduzir e IA; desfazer vai para a cena, não só para o texto', () => {
  for (const m of ["label: 'Camada'", "label: 'Reproduzir'", "label: 'IA'"]) assert.ok(main.includes(m), m)
  assert.ok(!main.includes("role: 'undo'") && !main.includes("role: 'redo'"))
  // teclas sozinhas aparecem no menu sem roubar a digitação
  assert.match(main, /registerAccelerator: false/)
})

test('a página só fala com o app pela ponte, e o app só aceita a página do Rift', () => {
  assert.match(pagina, /window\.riftDesktop\?\.isDesktop === true/)
  assert.match(main, /ipcMain\.on\('rift:progresso'[\s\S]*?daView\(e\)[\s\S]*?ehDoApp/)
  assert.match(main, /ipcMain\.on\('rift:avisar'[\s\S]*?daView\(e\)[\s\S]*?ehDoApp/)
})
