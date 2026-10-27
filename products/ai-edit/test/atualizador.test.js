// "Atualizar" pelo próprio app (desktop/atualizador.cjs) com peças falsas, no molde do SOBEDESCE: o versao.json do
// Release (o mesmo endereço do instalar.sh), desenvolvimento sem pergunta, download com progresso e SHA-256, hash
// diferente, sem hash, app fora de Aplicativos, marca de troca que falhou, os scripts de troca (o do Mac roda de
// verdade aqui, com atalhos falsos de xattr/open) e o que a pílula da barra mostra (app/atualizacao.js).
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import fss from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { after, before, test } from 'node:test'
import { PRODUTO } from '../src/produto.js'
import { aviso } from '../app/atualizacao.js'

const A = createRequire(import.meta.url)('../desktop/atualizador.cjs')
const { Atualizador, RELEASE_URL, BAIXAR_URL, MARCA, lerBuildInfo, lerVersao, baixarPara, pacoteMac, comandoDaTroca, ehScriptDaTroca, scriptMac, scriptWin, shAspas, psAspas } = A

const BYTES = Buffer.from(`instalador falso do ${PRODUTO.nome} `.repeat(4000))
const SHA = crypto.createHash('sha256').update(BYTES).digest('hex')
const DMG = `${PRODUTO.arquivo}-mac-universal.dmg`
const EXE = `${PRODUTO.arquivo}-windows-setup.exe`
const versaoJson = (build, extra = {}) => ({ build, commit: 'abc123def456', data: '2026-10-27T12:00:00.000Z', mac: DMG, windows: EXE, sha256Mac: SHA, sha256Windows: SHA, ...extra })

let dir
before(async () => {
  dir = await fs.mkdtemp(path.join(tmpdir(), 'aeon-atualizar-'))
})
after(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

/** fetch falso: o versao.json e o instalador do Release (bytes = o que o "GitHub" manda). */
function releaseFalso({ versao = versaoJson(42), bytes = BYTES } = {}) {
  const pedidos = []
  const fn = async (url, op = {}) => {
    pedidos.push({ url, redirect: op.redirect })
    if (url.endsWith('/versao.json')) return versao instanceof Error ? Promise.reject(versao) : Response.json(typeof versao === 'function' ? versao() : versao)
    if (url.endsWith(DMG) || url.endsWith(EXE)) return new Response(bytes, { headers: { 'content-length': String(bytes.length) } })
    return new Response('não achei', { status: 404 })
  }
  fn.pedidos = pedidos
  return fn
}

/**
 * Atualizador do Mac com tudo falso: o "Aplicativos" é uma pasta temporária, o hdiutil "monta" criando um AEON.app, o
 * ditto copia de verdade.
 */
async function noMac(nome, { fetch = releaseFalso(), podeGravar = () => true, exe, build = 41, ...extra } = {}) {
  const raiz = path.join(dir, nome)
  const apps = path.join(raiz, 'Applications')
  const tmpRoot = path.join(raiz, 'tmp')
  const pastaDados = path.join(raiz, 'dados')
  await fs.mkdir(path.join(apps, `${PRODUTO.nome}.app`, 'Contents', 'MacOS'), { recursive: true })
  await fs.writeFile(path.join(apps, `${PRODUTO.nome}.app`, 'Contents', 'versao.txt'), 'antiga')
  await fs.mkdir(tmpRoot, { recursive: true })
  await fs.mkdir(pastaDados, { recursive: true })
  if (extra.marca) await fs.writeFile(path.join(pastaDados, MARCA), extra.marca)
  const comandos = []
  const entregas = []
  const rodar = async (cmd, args) => {
    comandos.push([cmd, ...args])
    if (cmd === 'hdiutil' && args[0] === 'attach') {
      const m = args[args.indexOf('-mountpoint') + 1]
      await fs.mkdir(path.join(m, `${PRODUTO.nome}.app`, 'Contents'), { recursive: true })
      await fs.writeFile(path.join(m, `${PRODUTO.nome}.app`, 'Contents', 'versao.txt'), 'nova')
    }
    if (cmd === 'ditto') await fs.cp(args[0], args[1], { recursive: true })
    if (cmd === '/bin/rm') await fs.rm(args[1], { recursive: true, force: true })
    return ''
  }
  const up = new Atualizador({
    plataforma: 'darwin',
    exe: exe || path.join(apps, `${PRODUTO.nome}.app`, 'Contents', 'MacOS', PRODUTO.nome),
    pid: 4242,
    pastaDados,
    tmpRoot,
    build,
    fetch,
    rodar,
    podeGravar,
    entregar: async (job) => entregas.push(job),
    progressoMs: 0,
  })
  return { up, comandos, entregas, apps, tmpRoot, pastaDados, fetch }
}

const fases = (up) => {
  const vistas = []
  up.on('mudou', (st) => {
    if (vistas.at(-1) !== st.fase) vistas.push(st.fase)
  })
  return vistas
}

test('o Release é o mesmo dos instaladores e o versao.json do CI vira versão', () => {
  const sh = fss.readFileSync(new URL('../instalar.sh', import.meta.url), 'utf8')
  assert.ok(sh.includes(RELEASE_URL), 'mesmo endereço do instalar.sh')
  assert.equal(RELEASE_URL, `https://github.com/${PRODUTO.repositorio}/releases/download/${PRODUTO.release}`)
  assert.equal(BAIXAR_URL, `${PRODUTO.site}/#baixar`)
  const v = lerVersao(versaoJson(42, { sha256Mac: SHA.toUpperCase() }))
  assert.equal(v.build, 42)
  assert.equal(v.sha256.mac, SHA)
  assert.equal(v.arquivo.mac, DMG)
  assert.equal(v.arquivo.windows, EXE)
  assert.equal(lerVersao({ build: 0 }), null, 'build 0 não é versão')
  assert.equal(lerVersao(null), null)
  assert.equal(lerVersao(versaoJson(3, { mac: '../../x.dmg' })).arquivo.mac, null, 'nome de arquivo estranho não vira caminho')
  assert.equal(lerVersao(versaoJson(3, { sha256Windows: 'abc' })).sha256.windows, null)
})

test('lerBuildInfo: sem arquivo ou estragado = desenvolvimento (build 0)', async () => {
  assert.equal(lerBuildInfo(path.join(dir, 'nao-existe.json')).build, 0)
  const f = path.join(dir, 'build-info.json')
  await fs.writeFile(f, '{"build": 37, "commit": "ABCDEF123456789", "data": "2026-10-27T10:00:00Z"}')
  assert.deepEqual(lerBuildInfo(f), { build: 37, commit: 'abcdef123456', data: '2026-10-27T10:00:00.000Z' })
  await fs.writeFile(f, 'lixo')
  assert.equal(lerBuildInfo(f).build, 0)
})

test('desenvolvimento (build 0) nunca pergunta ao Release; build mais novo acende o aviso', async () => {
  const fetch = releaseFalso()
  const dev = new Atualizador({ plataforma: 'darwin', build: 0, fetch })
  assert.equal(dev.ligado, false)
  await dev.verificar()
  dev.iniciar()
  assert.equal(dev.relogio, null)
  assert.equal(fetch.pedidos.length, 0)
  assert.equal(dev.estado().nova, false)

  const { up } = await noMac('aviso', { fetch })
  let st = await up.verificar()
  assert.equal(fetch.pedidos[0].url, `${RELEASE_URL}/versao.json`)
  assert.equal(st.nova, true)
  assert.equal(st.podeAtualizar, true)
  assert.deepEqual(st.ultima, { build: 42, data: '2026-10-27T12:00:00.000Z' })
  st = up.depois()
  assert.equal(st.nova, false, '"Depois" esconde este build')
})

test('mesma versão ou Release fora do ar: nada de aviso, e nada lança', async () => {
  const { up } = await noMac('mesma', { fetch: releaseFalso({ versao: versaoJson(41) }) })
  assert.equal((await up.verificar()).nova, false)
  const { up: fora } = await noMac('fora', { fetch: releaseFalso({ versao: new Error('sem internet') }) })
  const st = await fora.verificar()
  assert.equal(st.nova, false)
  assert.equal(st.fase, null)
})

test('iniciar: confere ~10 s depois de abrir e de novo a cada intervalo', async () => {
  const fetch = releaseFalso()
  const up = new Atualizador({ plataforma: 'darwin', build: 41, fetch, primeiraMs: 5, aCadaMs: 10 })
  up.iniciar()
  await new Promise((r) => setTimeout(r, 60))
  up.parar()
  assert.ok(fetch.pedidos.length >= 2, `conferiu ${fetch.pedidos.length} vezes`)
})

test('pacoteMac, comandoDaTroca e aspas dos scripts', () => {
  assert.equal(pacoteMac(`/Applications/${PRODUTO.nome}.app/Contents/MacOS/${PRODUTO.nome}`), `/Applications/${PRODUTO.nome}.app`)
  assert.equal(pacoteMac('/usr/local/bin/node'), null)
  assert.deepEqual(comandoDaTroca('darwin', '/tmp/x/trocar.sh'), { cmd: '/bin/sh', args: ['/tmp/x/trocar.sh'] })
  const w = comandoDaTroca('win32', 'C:\\t\\trocar.ps1')
  assert.equal(w.cmd, 'powershell.exe')
  assert.deepEqual(w.args.slice(-2), ['-File', 'C:\\t\\trocar.ps1'])
  assert.equal(comandoDaTroca('linux', '/tmp/x'), null)
  assert.equal(shAspas(`a'b c`), `'a'\\''b c'`)
  assert.equal(psAspas(`a'b`), `'a''b'`)
})

test('ehScriptDaTroca: só o trocar.sh/.ps1 de uma pasta de atualização dentro da pasta temporária', async () => {
  const tmpRoot = path.join(dir, 'troca-tmp')
  const ok = path.join(tmpRoot, `${PRODUTO.esquema}-atualizacao-abc`)
  await fs.mkdir(ok, { recursive: true })
  await fs.writeFile(path.join(ok, 'trocar.sh'), '#!/bin/sh\n')
  await fs.writeFile(path.join(ok, 'outro.sh'), '#!/bin/sh\n')
  const fora = path.join(dir, 'troca-fora', `${PRODUTO.esquema}-atualizacao-x`)
  await fs.mkdir(fora, { recursive: true })
  await fs.writeFile(path.join(fora, 'trocar.sh'), '#!/bin/sh\n')
  assert.equal(ehScriptDaTroca(path.join(ok, 'trocar.sh'), tmpRoot), true)
  assert.equal(ehScriptDaTroca(path.join(ok, 'outro.sh'), tmpRoot), false)
  assert.equal(ehScriptDaTroca(path.join(fora, 'trocar.sh'), tmpRoot), false)
  assert.equal(ehScriptDaTroca(path.join(ok, '..', '..', 'troca-fora', `${PRODUTO.esquema}-atualizacao-x`, 'trocar.sh'), tmpRoot), false)
  assert.equal(ehScriptDaTroca('trocar.sh', tmpRoot), false)
  assert.equal(ehScriptDaTroca(42, tmpRoot), false)
})

test('baixarPara: progresso e SHA-256; incompleto e parado falham', async () => {
  const f = path.join(dir, 'baixado.dmg')
  const andou = []
  const sha = await baixarPara(`https://x/${DMG}`, f, { fetch: releaseFalso(), aoAndar: (r, t) => andou.push([r, t]) })
  assert.equal(sha, SHA)
  assert.deepEqual(await fs.readFile(f), BYTES)
  assert.deepEqual(andou.at(-1), [BYTES.length, BYTES.length])
  assert.ok(andou.every(([r], i) => i === 0 || r >= andou[i - 1][0]), 'o progresso só anda para a frente')
  await assert.rejects(baixarPara('https://x/nada', path.join(dir, 'nada.dmg'), { fetch: releaseFalso() }), /404/)
  const curto = async () => new Response(BYTES.subarray(0, 100), { headers: { 'content-length': String(BYTES.length) } })
  await assert.rejects(baixarPara('https://x/a.dmg', path.join(dir, 'curto.dmg'), { fetch: curto }), /incompleto/)
  const parado = async (_u, { signal }) =>
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(10))
          signal.addEventListener('abort', () => c.error(signal.reason))
        },
      }),
      { headers: { 'content-length': '100' } },
    )
  await assert.rejects(baixarPara('https://x/a.dmg', path.join(dir, 'parado.dmg'), { fetch: parado, paradoMs: 30 }), /parou de andar/)
})

test('Mac: Atualizar baixa do Release, confere, monta, copia o app novo ao lado, desmonta e entrega o script', async () => {
  const { up, comandos, entregas, apps, tmpRoot, fetch } = await noMac('mac-ok')
  await up.verificar()
  const vistas = fases(up)
  const st = await up.atualizar()
  assert.equal(st.fase, 'reiniciando')
  assert.deepEqual(vistas, ['baixando', 'conferindo', 'preparando', 'reiniciando'])
  assert.ok(fetch.pedidos.some((p) => p.url === `${RELEASE_URL}/${DMG}` && p.redirect === 'follow'), 'baixa o .dmg do Release')
  assert.equal(st.recebido, BYTES.length)

  const novo = path.join(apps, `.${PRODUTO.nome}-atualizacao.app`)
  assert.deepEqual(
    comandos.map((c) => c.slice(0, 2).join(' ')),
    ['hdiutil attach', '/bin/rm -rf', `ditto ${comandos[2][1]}`, 'hdiutil detach', 'xattr -cr'],
  )
  assert.ok(comandos[0].includes('-nobrowse') && comandos[0].includes('-readonly'))
  assert.equal(comandos[2][2], novo)
  assert.equal(comandos[4][2], novo)
  assert.equal(await fs.readFile(path.join(novo, 'Contents', 'versao.txt'), 'utf8'), 'nova')
  assert.equal(await fs.readFile(path.join(apps, `${PRODUTO.nome}.app`, 'Contents', 'versao.txt'), 'utf8'), 'antiga', 'o app aberto só é trocado depois de fechar')

  assert.equal(entregas.length, 1)
  const script = entregas[0].script
  assert.ok(ehScriptDaTroca(script, tmpRoot), 'o processo principal aceita o script')
  const texto = await fs.readFile(script, 'utf8')
  assert.match(texto, /PID=4242/)
  assert.match(texto, /open "\$APP"/)
  assert.equal(spawnSync('sh', ['-n', script]).status, 0, 'sh -n')
})

test('Mac: arquivo que não bate com o SHA-256 não troca nada e apaga o que baixou', async () => {
  const { up, entregas, apps, tmpRoot } = await noMac('mac-hash', { fetch: releaseFalso({ bytes: Buffer.from('outro arquivo') }) })
  await up.verificar()
  const st = await up.atualizar()
  assert.equal(st.fase, 'erro')
  assert.match(st.erro, /SHA-256/)
  assert.equal(entregas.length, 0)
  assert.deepEqual(await fs.readdir(tmpRoot), [], 'a pasta temporária foi apagada')
  assert.equal(fss.existsSync(path.join(apps, `.${PRODUTO.nome}-atualizacao.app`)), false)
  assert.equal(aviso(st).acao, 'atualizar', 'pode tentar de novo')
})

test('sem SHA-256 publicado, sem permissão ou fora de Aplicativos: só o Baixar', async () => {
  const { up } = await noMac('sem-hash', { fetch: releaseFalso({ versao: versaoJson(42, { sha256Mac: null }) }) })
  let st = await up.verificar()
  assert.equal(st.nova, true)
  assert.equal(st.podeAtualizar, false)
  assert.equal(aviso(st).acao, 'baixar')
  st = await up.atualizar()
  assert.equal(st.fase, 'erro')

  const { up: semPermissao } = await noMac('sem-permissao', { podeGravar: () => false })
  assert.match(semPermissao.motivo, /permissão/)
  assert.equal((await semPermissao.verificar()).podeAtualizar, false)

  const { up: transl } = await noMac('transl', { exe: `/private/var/folders/x/AppTranslocation/ABC/d/${PRODUTO.nome}.app/Contents/MacOS/${PRODUTO.nome}` })
  assert.match(transl.motivo, /Aplicativos/)
  const { up: volume } = await noMac('volume', { exe: `/Volumes/${PRODUTO.nome}/${PRODUTO.nome}.app/Contents/MacOS/${PRODUTO.nome}` })
  assert.match(volume.motivo, /instalador/)
  const linux = new Atualizador({ plataforma: 'linux', build: 41, exe: '/x', pid: 1, entregar: async () => {} })
  assert.equal(linux.ligado, false)
})

test('a troca anterior falhou (marca do script): o aviso diz o que houve e aquele build só pelo Baixar', async () => {
  const { up, pastaDados } = await noMac('marca', { marca: '\uFEFF{"build":42,"motivo":"O macOS não deixou trocar o app."}' })
  assert.equal(fss.existsSync(path.join(pastaDados, MARCA)), false, 'a marca é lida uma vez')
  let st = up.estado()
  assert.equal(st.fase, 'erro')
  assert.match(st.erro, /não terminou.*macOS/)
  st = await up.verificar()
  assert.equal(st.podeAtualizar, false, 'build 42 bloqueado')
  assert.equal(aviso(st).acao, 'baixar')
  const { up: maisNovo } = await noMac('marca-nova', { marca: '{"build":42,"motivo":"x"}', fetch: releaseFalso({ versao: versaoJson(43) }) })
  assert.equal((await maisNovo.verificar()).podeAtualizar, true, 'um build mais novo volta a se instalar sozinho')
})

test('entrega que falha (projeto não salvo, exportação andando) vira erro e não troca', async () => {
  const { up } = await noMac('entrega')
  up.entregar = async () => {
    throw new Error('Termine a exportação antes de atualizar. Nada foi trocado.')
  }
  await up.verificar()
  const st = await up.atualizar()
  assert.equal(st.fase, 'erro')
  assert.match(st.erro, /exportação/)
})

test('Windows: baixa o instalador e entrega o script que roda o NSIS em silêncio', async () => {
  const raiz = path.join(dir, 'win')
  const tmpRoot = path.join(raiz, 'tmp')
  await fs.mkdir(tmpRoot, { recursive: true })
  const entregas = []
  const up = new Atualizador({ plataforma: 'win32', exe: `C:\\Users\\Zé\\AppData\\Local\\Programs\\${PRODUTO.nome}\\${PRODUTO.nome}.exe`, pid: 77, pastaDados: raiz, tmpRoot, build: 41, fetch: releaseFalso(), podeGravar: () => true, entregar: async (j) => entregas.push(j), progressoMs: 0 })
  await up.verificar()
  const st = await up.atualizar()
  assert.equal(st.fase, 'reiniciando')
  const texto = await fs.readFile(entregas[0].script, 'utf8')
  assert.equal(texto.charCodeAt(0), 0xfeff, 'BOM para o PowerShell 5')
  assert.match(texto, /'\/S', '--updated', '--force-run'/)
  assert.ok(texto.includes(`Get-Process -Name '${PRODUTO.nome}'`))
  assert.ok(texto.includes(`$exe = 'C:\\Users\\Zé\\AppData`))
  assert.equal(await fs.readFile(path.join(path.dirname(entregas[0].script), 'instalador.exe')).then((b) => b.equals(BYTES)), true)
  const w = scriptWin({ pid: 1, setup: "C:\\T\\it's\\setup.exe", exe: 'C:\\x.exe', marca: 'C:\\m.json', tmp: 'C:\\T', build: 9 })
  assert.ok(w.includes(`$setup = 'C:\\T\\it''s\\setup.exe'`))
})

test('progresso: no máximo um aviso a cada intervalo', async () => {
  let t = 0
  const { up } = await noMac('progresso')
  up.progressoMs = 1000
  up.agora = () => t
  let n = 0
  up.on('mudou', () => n++)
  up.baixar = async (_u, arquivo, aoAndar) => {
    for (let i = 1; i <= 50; i++) {
      t += 10
      aoAndar(i * 100, 5000)
    }
    await fs.writeFile(arquivo, BYTES)
    return SHA
  }
  await up.verificar()
  n = 0
  await up.atualizar()
  // baixando + 500 ms de download (no máximo 1 aviso de progresso) + conferindo/preparando/reiniciando + verificar
  assert.ok(n <= 7, `${n} avisos`)
})

test('Mac: o script de troca de verdade (troca e abre; se falhar, o antigo volta e fica a marca)', { skip: process.platform === 'win32' }, async () => {
  const raiz = path.join(dir, 'troca')
  const atalhos = path.join(raiz, 'bin')
  await fs.mkdir(atalhos, { recursive: true })
  const abriu = path.join(raiz, 'abriu.txt')
  await fs.writeFile(path.join(atalhos, 'open'), `#!/bin/sh\nprintf '%s' "$1" > ${shAspas(abriu)}\n`, { mode: 0o755 })
  await fs.writeFile(path.join(atalhos, 'xattr'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })

  async function cenario(nome, { comNovo = true } = {}) {
    const base = path.join(raiz, nome)
    const app = path.join(base, "Apps d'Zé", `${PRODUTO.nome}.app`)
    const novo = path.join(base, "Apps d'Zé", `.${PRODUTO.nome}-atualizacao.app`)
    const velho = path.join(base, "Apps d'Zé", `.${PRODUTO.nome}-antigo.app`)
    const tmp = path.join(base, 'tmp')
    const marca = path.join(base, MARCA)
    await fs.mkdir(app, { recursive: true })
    await fs.writeFile(path.join(app, 'v'), 'antiga')
    if (comNovo) {
      await fs.mkdir(novo, { recursive: true })
      await fs.writeFile(path.join(novo, 'v'), 'nova')
    }
    await fs.mkdir(tmp, { recursive: true })
    // o "app aberto": um processo que fecha logo; o script espera ele sair
    const falso = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 300)'])
    const script = path.join(tmp, 'trocar.sh')
    await fs.writeFile(script, scriptMac({ pid: falso.pid, app, novo, velho, marca, tmp, build: 42 }))
    const t0 = Date.now()
    const sh = spawn('/bin/sh', [script], { env: { ...process.env, PATH: `${atalhos}:${process.env.PATH}` }, stdio: 'ignore' })
    const code = await new Promise((r) => sh.on('exit', r))
    assert.ok(Date.now() - t0 >= 200, 'só trocou depois do app fechar')
    return { code, app, novo, velho, tmp, marca }
  }

  const ok = await cenario('ok')
  assert.equal(await fs.readFile(path.join(ok.app, 'v'), 'utf8'), 'nova')
  assert.equal(fss.existsSync(ok.novo), false)
  assert.equal(fss.existsSync(ok.velho), false)
  assert.equal(fss.existsSync(ok.tmp), false, 'a pasta temporária foi apagada')
  assert.equal(fss.existsSync(ok.marca), false)
  assert.equal(await fs.readFile(abriu, 'utf8'), ok.app, 'abre o app de novo')

  await fs.rm(abriu, { force: true })
  const falhou = await cenario('falhou', { comNovo: false })
  assert.equal(await fs.readFile(path.join(falhou.app, 'v'), 'utf8'), 'antiga', 'o app antigo voltou')
  const m = JSON.parse(await fs.readFile(falhou.marca, 'utf8'))
  assert.equal(m.build, 42)
  assert.match(m.motivo, /macOS/)
  assert.equal(await fs.readFile(abriu, 'utf8'), falhou.app, 'abre o app antigo de novo')
})

test('a pílula da barra: Versão nova → Atualizar; andamento medido; erro com Tentar de novo ou Baixar', () => {
  assert.equal(aviso(null).visivel, false)
  assert.equal(aviso({ nova: false }).visivel, false)
  const base = { nova: true, podeAtualizar: true, ultima: { build: 42 }, fase: null, recebido: 0, total: 0 }
  let a = aviso(base)
  assert.deepEqual([a.texto, a.acao, a.rotulo, a.depois], ['Versão nova', 'atualizar', 'Atualizar', true])
  assert.match(a.dica, /Build 42.*abre de novo/)
  a = aviso({ ...base, fase: 'baixando', recebido: 21 * 1024 * 1024, total: 50 * 1024 * 1024 })
  assert.equal(a.texto, 'Baixando 42%')
  assert.equal(a.acao, null, 'sem botão enquanto baixa')
  assert.equal(a.fracao, 0.42)
  a = aviso({ ...base, fase: 'baixando', recebido: 3 * 1024 * 1024, total: 0 })
  assert.equal(a.texto, 'Baixando 3 MB')
  assert.equal(a.fracao, null, 'sem tamanho, sem barra (nada de barra andando sozinha)')
  assert.equal(aviso({ ...base, fase: 'reiniciando' }).texto, 'Reabrindo…')
  a = aviso({ ...base, podeAtualizar: false, motivo: 'Sem permissão para trocar o app nesta pasta.' })
  assert.equal(a.acao, 'baixar')
  assert.match(a.dica, /permissão/)
  a = aviso({ ...base, fase: 'erro', erro: 'O download não terminou.' })
  assert.deepEqual([a.texto, a.rotulo], ['Não atualizou', 'Tentar de novo'])
})
