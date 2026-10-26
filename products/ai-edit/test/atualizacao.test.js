// Atualização sozinha do app de computador (desktop/atualizacao.cjs), com o sistema trocado por funções falsas:
// versão nova baixa e fica pronta; SHA-256 que não bate não instala; mesma versão não baixa; app fora de Aplicativos
// não tenta; a troca grava o script certo (reabrir ou não) e a marca de falha trava a mesma versão.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

const { Atualizador, pacoteMac, scriptMac, scriptWin } = createRequire(import.meta.url)('../desktop/atualizacao.cjs')

const raiz = mkdtempSync(join(tmpdir(), 'aeon-atualizacao-teste-'))
after(() => rmSync(raiz, { recursive: true, force: true }))

const CONTEUDO = Buffer.from('instalador de mentira')
const SHA = createHash('sha256').update(CONTEUDO).digest('hex')
const versao = (build, extra = {}) => ({ build, mac: 'AEON-mac-universal.dmg', windows: 'AEON-windows-setup.exe', sha256Mac: SHA, sha256Windows: SHA, ...extra })

function falso({ plataforma = 'darwin', buildAtual = 8, v = versao(9), exe = '/Applications/AEON.app/Contents/MacOS/AEON', podeGravar = () => true } = {}) {
  const tmpRaiz = mkdtempSync(join(raiz, 't-'))
  const pastaDados = mkdtempSync(join(raiz, 'd-'))
  const comandos = []
  const soltos = []
  const baixados = []
  const a = new Atualizador({
    nome: 'AEON',
    buildAtual,
    plataforma,
    exe,
    pid: 4242,
    pastaDados,
    tmpRaiz,
    release: 'https://exemplo.test/rel',
    buscarVersao: async () => v,
    baixar: async (url, arquivo) => {
      baixados.push(url)
      writeFileSync(arquivo, CONTEUDO)
      return SHA
    },
    rodar: async (cmd, args) => {
      comandos.push([cmd, ...args])
      // o "hdiutil attach" põe o app no ponto de montagem
      if (cmd === 'hdiutil' && args[0] === 'attach') mkdirSync(join(args[args.indexOf('-mountpoint') + 1], 'AEON.app'), { recursive: true })
      return ''
    },
    podeGravar,
    soltar: (p, script) => soltos.push({ p, script }),
  })
  return { a, comandos, soltos, baixados, pastaDados }
}

test('versão nova no Mac: baixa, confere, copia o app ao lado do atual e fica pronta', async () => {
  const { a, comandos, baixados } = falso()
  const fases = []
  a.on('mudou', (st) => fases.push(st.fase))
  const st = await a.verificar()
  assert.equal(st.fase, 'pronto')
  assert.equal(st.build, 9)
  assert.deepEqual(baixados, ['https://exemplo.test/rel/AEON-mac-universal.dmg'])
  assert.ok(fases.includes('baixando'))
  const ditto = comandos.find((c) => c[0] === 'ditto')
  assert.equal(ditto[2], '/Applications/.AEON-atualizacao.app')
  assert.ok(comandos.some((c) => c[0] === 'hdiutil' && c[1] === 'detach'))
  assert.ok(comandos.some((c) => c[0] === 'xattr' && c[2] === '/Applications/.AEON-atualizacao.app'))
})

test('mesma versão, versão sem instalador desta plataforma ou SHA-256 inválido: não baixa nada', async () => {
  for (const v of [versao(8), versao(9, { mac: null, sha256Mac: null }), versao(9, { sha256Mac: 'x' })]) {
    const { a, baixados } = falso({ v })
    const st = await a.verificar()
    assert.equal(st.fase, null)
    assert.deepEqual(baixados, [])
  }
})

test('SHA-256 que não bate: não instala e volta ao normal (tenta na próxima volta)', async () => {
  const { a } = falso({ v: versao(9, { sha256Mac: 'a'.repeat(64) }) })
  const st = await a.verificar()
  assert.equal(st.fase, null)
  assert.equal(a.pronto, null)
})

test('sem internet: fica quieto', async () => {
  const { a } = falso()
  a.buscarVersao = async () => {
    throw new Error('offline')
  }
  assert.equal((await a.verificar()).fase, null)
})

test('desligado fora de Aplicativos, sem permissão, em desenvolvimento ou no Linux', () => {
  assert.match(falso({ exe: '/private/var/folders/x/AppTranslocation/abc/d/AEON.app/Contents/MacOS/AEON' }).a.motivo, /Aplicativos/)
  assert.match(falso({ exe: '/Volumes/AEON/AEON.app/Contents/MacOS/AEON' }).a.motivo, /Aplicativos/)
  assert.match(falso({ podeGravar: () => false }).a.motivo, /permissão/)
  assert.match(falso({ buildAtual: 0 }).a.motivo, /desenvolvimento/)
  assert.match(falso({ plataforma: 'linux' }).a.motivo, /sistema/)
  assert.equal(pacoteMac('/Applications/AEON.app/Contents/MacOS/AEON'), '/Applications/AEON.app')
})

test('trocar: grava o script do Mac (reabre só no Reiniciar) e solta; depois disso não troca duas vezes', async () => {
  const { a, soltos } = falso()
  await a.verificar()
  assert.equal(a.trocar({ reabrir: true }), true)
  assert.equal(soltos.length, 1)
  const s = readFileSync(soltos[0].script, 'utf8')
  assert.match(s, /PID=4242/)
  assert.match(s, /APP='\/Applications\/AEON.app'/)
  assert.match(s, /open "\$APP"/)
  assert.equal(a.status().fase, 'reiniciando')
  assert.equal(a.trocar({ reabrir: true }), false)
  assert.doesNotMatch(scriptMac({ pid: 1, app: '/A.app', novo: '/.n', velho: '/.v', marca: '/m', tmp: '/t', build: 9, reabrir: false }), /open "\$APP"/)
})

test('Windows: guarda o instalador e o script roda em silêncio; reabre só no Reiniciar', async () => {
  const { a, soltos, comandos } = falso({ plataforma: 'win32', exe: 'C:\\Users\\lia\\AppData\\Local\\Programs\\AEON\\AEON.exe' })
  assert.equal((await a.verificar()).fase, 'pronto')
  assert.equal(comandos.length, 0)
  a.trocar({ reabrir: false })
  const s = readFileSync(soltos[0].script, 'utf8')
  assert.match(s, /'\/S', '--updated'/)
  assert.doesNotMatch(s, /Start-Process -FilePath \$exe/)
  assert.match(scriptWin({ pid: 1, setup: 'C:\\s.exe', exe: 'C:\\a.exe', marca: 'C:\\m', tmp: 'C:\\t', build: 9, reabrir: true, nome: 'AEON' }), /Start-Process -FilePath \$exe/)
})

test('a troca anterior falhou: avisa uma vez e não tenta a mesma versão de novo', async () => {
  const { pastaDados } = falso()
  writeFileSync(join(pastaDados, 'atualizacao-falhou.json'), JSON.stringify({ build: 9, motivo: 'O macOS não deixou trocar o app.' }))
  const b = new Atualizador({ buildAtual: 8, plataforma: 'darwin', exe: '/Applications/AEON.app/Contents/MacOS/AEON', pid: 1, pastaDados, podeGravar: () => true, buscarVersao: async () => versao(9), baixar: async () => assert.fail('não devia baixar') })
  assert.equal(b.status().fase, 'erro')
  assert.match(b.status().erro, /não deixou trocar/)
  assert.equal(existsSync(join(pastaDados, 'atualizacao-falhou.json')), false)
  await b.verificar()
})
