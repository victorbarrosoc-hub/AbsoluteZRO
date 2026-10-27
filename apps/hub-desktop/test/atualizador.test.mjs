// "Atualizar" pelo app (desktop/atualizador.cjs): baixa, confere o SHA-256, prepara a troca e entrega ao main, sem
// Electron e sem rodar nada no sistema (download, comandos e entrega são falsos).
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { Atualizador, ehScriptDaTroca, macBundle, scriptMac, comandoDaTroca, MARCA } = require('../desktop/atualizador.cjs')

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'zro-atualiza-'))
const conteudo = Buffer.from('instalador falso')
const sha = crypto.createHash('sha256').update(conteudo).digest('hex')

function montar({ platform = 'darwin', baixar, run } = {}) {
  const raiz = tmp()
  const apps = path.join(raiz, 'Applications')
  fs.mkdirSync(path.join(apps, 'Absolute ZRO.app/Contents/MacOS'), { recursive: true })
  const pasta = path.join(raiz, 'dados')
  fs.mkdirSync(pasta)
  const tmpRoot = path.join(raiz, 'tmp')
  fs.mkdirSync(tmpRoot)
  const comandos = []
  const entregas = []
  const a = new Atualizador({
    platform,
    appExe: platform === 'darwin' ? path.join(apps, 'Absolute ZRO.app/Contents/MacOS/Absolute ZRO') : path.join(raiz, 'Absolute ZRO.exe'),
    appPid: 4242,
    pasta,
    tmpRoot,
    entregar: async (job) => entregas.push(job),
    baixar:
      baixar ||
      (async (_url, arquivo, aoProgresso) => {
        fs.writeFileSync(arquivo, conteudo)
        aoProgresso(conteudo.length, conteudo.length)
        return sha
      }),
    run:
      run ||
      (async (cmd, args) => {
        comandos.push([cmd, ...args])
        // hdiutil attach: a montagem passa a ter o app dentro
        if (cmd === 'hdiutil' && args[0] === 'attach') fs.mkdirSync(path.join(args[args.indexOf('-mountpoint') + 1], 'Absolute ZRO.app'), { recursive: true })
        return ''
      }),
    canWrite: () => true,
    progressoMs: 0,
  })
  return { a, comandos, entregas, pasta, tmpRoot }
}

test('acha o .app a partir do executável e monta o comando da troca', () => {
  assert.equal(macBundle('/Applications/Absolute ZRO.app/Contents/MacOS/Absolute ZRO'), '/Applications/Absolute ZRO.app')
  assert.equal(macBundle('/usr/bin/node'), null)
  assert.deepEqual(comandoDaTroca('darwin', '/tmp/x/trocar.sh'), { cmd: '/bin/sh', args: ['/tmp/x/trocar.sh'] })
  assert.equal(comandoDaTroca('linux', '/tmp/x/trocar.sh'), null)
})

test('sem app instalado (desenvolvimento) não se atualiza', () => {
  const a = new Atualizador({ platform: 'darwin' })
  assert.equal(a.disponivel, false)
  assert.equal(a.podeInstalar(99), false)
  const disco = new Atualizador({
    platform: 'darwin',
    appExe: '/Volumes/Absolute ZRO/Absolute ZRO.app/Contents/MacOS/Absolute ZRO',
    appPid: 1,
    entregar: () => {},
    canWrite: () => true,
  })
  assert.match(disco.motivo, /disco de instalação/)
})

test('Mac: baixa, confere, copia ao lado do app, tira a quarentena e entrega o script', async () => {
  const { a, comandos, entregas, tmpRoot } = montar()
  const fases = []
  a.on('mudou', (st) => fases.push(st.fase))
  const st = await a.instalar({ build: 20, url: 'https://absolutezro.com/baixar/hub/mac?build=20', sha256: sha })
  assert.equal(st.fase, 'reiniciando')
  assert.deepEqual([...new Set(fases)], ['baixando', 'conferindo', 'preparando', 'reiniciando'])
  assert.ok(comandos.some((c) => c[0] === 'ditto' && c[2].endsWith('.Absolute ZRO-atualizacao.app')))
  assert.ok(comandos.some((c) => c[0] === 'xattr' && c[1] === '-cr'))
  assert.ok(comandos.some((c) => c[0] === 'hdiutil' && c[1] === 'detach'))
  assert.equal(entregas.length, 1)
  assert.ok(ehScriptDaTroca(entregas[0].script, tmpRoot))
  const script = fs.readFileSync(entregas[0].script, 'utf8')
  assert.match(script, /PID=4242/)
  assert.match(script, /open "\$APP"/)
})

test('arquivo que não bate com o SHA-256 não é instalado', async () => {
  const { a, entregas } = montar()
  const st = await a.instalar({ build: 21, url: 'u', sha256: 'f'.repeat(64) })
  assert.equal(st.fase, 'erro')
  assert.match(st.erro, /sendo publicada/)
  assert.equal(entregas.length, 0)
})

test('saiu um build novo no meio: se a conferência nova bate, instala ele', async () => {
  const { a, entregas } = montar()
  const st = await a.instalar({ build: 21, url: 'u', sha256: 'f'.repeat(64), recheck: async () => ({ build: 22, sha256: sha }) })
  assert.equal(st.fase, 'reiniciando')
  assert.equal(st.build, 22)
  assert.equal(entregas.length, 1)
})

test('sem SHA-256 publicado ou com download falhando: erro, nada entregue', async () => {
  const sem = montar()
  assert.equal((await sem.a.instalar({ build: 23, url: 'u', sha256: null })).fase, 'erro')
  const rede = montar({
    baixar: async () => {
      throw new Error('ECONNRESET')
    },
  })
  const st = await rede.a.instalar({ build: 23, url: 'u', sha256: sha })
  assert.equal(st.fase, 'erro')
  assert.match(st.erro, /internet/)
  assert.equal(rede.entregas.length, 0)
})

test('troca anterior que falhou desliga o Atualizar daquele build', () => {
  const { pasta } = montar()
  fs.writeFileSync(path.join(pasta, MARCA), JSON.stringify({ build: 30, motivo: 'O macOS não deixou trocar o app.' }))
  const a = new Atualizador({
    platform: 'darwin',
    appExe: '/Applications/Absolute ZRO.app/Contents/MacOS/Absolute ZRO',
    appPid: 1,
    pasta,
    entregar: () => {},
    canWrite: () => true,
  })
  assert.equal(a.podeInstalar(30), false)
  assert.equal(a.podeInstalar(31), true)
  assert.match(a.falhaAnterior, /não deixou/)
  assert.equal(fs.existsSync(path.join(pasta, MARCA)), false)
})

test('Windows: roda o instalador em silêncio depois que o app fecha', async () => {
  const { a, entregas } = montar({ platform: 'win32' })
  const st = await a.instalar({ build: 24, url: 'u', sha256: sha })
  assert.equal(st.fase, 'reiniciando')
  const script = fs.readFileSync(entregas[0].script, 'utf8')
  assert.match(script, /'\/S', '--updated', '--force-run'/)
  assert.match(script, /Wait-Process -Id \$appPid/)
})

test('script do Mac põe aspas em caminhos com espaço e apóstrofo', () => {
  const s = scriptMac({ pid: 1, app: "/Applications/O'App.app", novo: '/a b', velho: '/c', marca: '/m', tmp: '/t', build: 1 })
  assert.match(s, /APP='\/Applications\/O'\\''App\.app'/)
})
