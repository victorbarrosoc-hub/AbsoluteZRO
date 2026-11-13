// ZERA · regras puras: o que nunca vai para o Lixo, discos, vigia e o que chega da tela.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const r = require('../desktop/regras.cjs')

const mac = { plataforma: 'darwin', home: '/Users/ana', raiz: '/' }
const win = { plataforma: 'win32', home: 'C:\\Users\\ana', raiz: 'C:\\' }

test('nunca tira o sistema, o disco, a pasta da pessoa ou o que está fora da varredura', () => {
  assert.equal(r.motivoParaNaoTirar('/', mac), 'É a pasta varrida inteira')
  assert.equal(r.motivoParaNaoTirar('/', { ...mac, raiz: null }), 'É o disco inteiro')
  assert.equal(r.motivoParaNaoTirar('/System/Library/Fonts', mac), 'Arquivo do sistema')
  assert.equal(r.motivoParaNaoTirar('/usr/local/bin/x', mac), 'Arquivo do sistema')
  assert.equal(r.motivoParaNaoTirar('/private/var/vm/swapfile0', mac), 'Arquivo do sistema')
  assert.equal(r.motivoParaNaoTirar('/Users/ana', mac), 'Pasta essencial')
  assert.equal(r.motivoParaNaoTirar('/Users/ana/Library', mac), 'Pasta essencial')
  assert.equal(r.motivoParaNaoTirar('/Users/ana/Movies', mac), 'Pasta essencial')
  assert.equal(r.motivoParaNaoTirar('/Applications', mac), 'Pasta essencial')
  assert.equal(r.motivoParaNaoTirar('/Volumes/SSD', mac), 'É o disco inteiro')
  assert.equal(r.motivoParaNaoTirar('relativo/x', mac), 'Caminho inválido')
  // pode: o que está dentro das pastas da pessoa
  assert.equal(r.motivoParaNaoTirar('/Users/ana/Library/Caches/com.app', mac), null)
  assert.equal(r.motivoParaNaoTirar('/Users/ana/Movies/Projeto/bruto.mov', mac), null)
  assert.equal(r.motivoParaNaoTirar('/Applications/App Velho.app', mac), null)
  // fora da pasta varrida
  assert.equal(r.motivoParaNaoTirar('/Users/ana/Downloads/x.dmg', { ...mac, raiz: '/Users/ana/Movies' }), 'Fora da pasta varrida')
  assert.equal(r.motivoParaNaoTirar('/Users/ana/Movies', { ...mac, raiz: '/Users/ana/Movies' }), 'É a pasta varrida inteira')
  // truque de caminho
  assert.equal(r.motivoParaNaoTirar('/Users/ana/Movies/../../../System', mac), 'Arquivo do sistema')
  assert.equal(r.motivoParaNaoTirar('/Users/ana/Movies/../Library', mac), 'Pasta essencial')
})

test('Windows: maiúsculas não enganam', () => {
  assert.equal(r.motivoParaNaoTirar('c:\\windows\\system32\\x.dll', win), 'Arquivo do sistema')
  assert.equal(r.motivoParaNaoTirar('C:\\Program Files\\App', win), 'Arquivo do sistema')
  assert.equal(r.motivoParaNaoTirar('C:\\Users\\ana\\AppData', win), 'Pasta essencial')
  assert.equal(r.motivoParaNaoTirar('C:\\Users\\ana\\AppData\\Local\\Temp\\x', win), null)
  assert.equal(r.motivoParaNaoTirar('D:\\', { ...win, raiz: 'D:\\' }), 'É a pasta varrida inteira')
  assert.equal(r.motivoParaNaoTirar('D:\\Projetos\\a.mov', win), 'Fora da pasta varrida')
})

test('nuvem e itens dentro de outros', () => {
  assert.equal(r.naNuvem('/Users/ana/Library/Mobile Documents/com~apple~CloudDocs/a.mov'), true)
  assert.equal(r.naNuvem('/Users/ana/Library/CloudStorage/GoogleDrive-x/a.mov'), true)
  assert.equal(r.naNuvem('C:\\Users\\ana\\OneDrive - Empresa\\a.mov'), true)
  assert.equal(r.naNuvem('/Users/ana/Movies/a.mov'), false)
  const itens = [{ c: '/a/b/c' }, { c: '/a/b' }, { c: '/a/bc' }, { c: '/x' }]
  assert.deepEqual(
    r.semAninhados(itens, 'darwin').map((i) => i.c),
    ['/x', '/a/b', '/a/bc'],
  )
})

test('no Mac, o "/" aceita o volume de dados e pula o caminho direto dele', () => {
  assert.deepEqual(r.opcoesDeVarredura('/', 'darwin'), { volumes: ['/System/Volumes/Data'], excluir: ['/System/Volumes/Data'] })
  assert.deepEqual(r.opcoesDeVarredura('/Volumes/SSD', 'darwin'), { volumes: [], excluir: [] })
  assert.deepEqual(r.opcoesDeVarredura('/', 'linux'), { volumes: [], excluir: [] })
})

test('discos: o do sistema primeiro, sem repetir o mesmo volume', () => {
  const ler = {
    listar: (d) =>
      d === '/Volumes'
        ? [
            { nome: 'Macintosh HD', symlink: true, alvo: '/' },
            { nome: 'SSD Projetos', symlink: false },
            { nome: '.timemachine', symlink: false },
            { nome: 'Espelho', symlink: false },
          ]
        : [],
    espaco: () => ({ total: 1000, livre: 100 }),
    existe: () => true,
    dispositivo: (c) => (c === '/Volumes/Espelho' ? 2 : c === '/' ? 1 : 2),
  }
  const d = r.discos('darwin', ler)
  assert.deepEqual(
    d.map((x) => [x.caminho, x.nome, x.principal, x.usado]),
    [
      ['/', 'Macintosh HD', true, 900],
      ['/Volumes/SSD Projetos', 'SSD Projetos', false, 900],
    ],
  )
  const w = r.discos('win32', { ...ler, existe: (c) => c === 'C:\\' || c === 'E:\\', dispositivo: (c) => c })
  assert.deepEqual(
    w.map((x) => [x.caminho, x.nome, x.principal]),
    [
      ['C:\\', 'Disco C:', true],
      ['E:\\', 'Disco E:', false],
    ],
  )
})

test('vigia: pastas dos arquivos mudados, sem repetir as de dentro, sem a pasta do próprio ZERA', () => {
  const op = { raiz: '/Users/ana', plataforma: 'darwin', ignorar: ['/Users/ana/Library/Application Support/ZERA'] }
  assert.deepEqual(
    r.pastasParaRevarrer(
      ['Movies/a.mov', 'Movies/Proj/b.mov', '/Users/ana/Downloads/c.dmg', 'Library/Application Support/ZERA/varreduras/x.bin', '/fora/d'],
      op,
    ),
    ['/Users/ana/Movies', '/Users/ana/Downloads'],
  )
  const muitos = Array.from({ length: 400 }, (_, i) => `p${i}/x`)
  assert.deepEqual(r.pastasParaRevarrer(muitos, op), ['/Users/ana'])
})

test('ids da tela: só inteiros válidos, sem repetir, com limite', () => {
  assert.deepEqual(r.ids([1, 2, 2, -1, 1.5, '3', null, 2 ** 32, 7]), [1, 2, 7])
  assert.deepEqual(r.ids('x'), [])
  assert.equal(r.ids(Array.from({ length: 50 }, (_, i) => i), 10).length, 10)
})
