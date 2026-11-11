// Central de apps: catálogo, escolha do arquivo, download conferido, instalação no Mac e no Windows (simulados).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ReadableStream } from 'node:stream/web'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  Central,
  validarCatalogo,
  arquivoPara,
  temAtualizacao,
  lerBuildInstalado,
  lerRegistro,
  caminhoDoComando,
  baixar,
  urlDoDock,
  itemDoDock,
  estaNoDock,
  caminhosDoDock,
} = require('../desktop/central.cjs')

const HUB = 'https://absolutezro.com'
const conteudo = Buffer.from('instalador de teste '.repeat(500))
const sha = createHash('sha256').update(conteudo).digest('hex')

const catalogo = {
  versao: 1,
  apps: [
    {
      id: 'synquei',
      nome: 'Synquei',
      mac: {
        bundle: 'Synquei.app',
        arquivos: [{ arquivo: 'Synquei-1.2.0-b40-mac-universal.dmg', sha256: sha, tamanho: conteudo.length, versao: '1.2.0', build: 40, arch: 'universal' }],
      },
      windows: {
        exe: 'Synquei.exe',
        nomeNoSistema: 'Synquei',
        arquivo: { arquivo: 'Synquei-1.2.0-b40-windows-setup.exe', sha256: sha, tamanho: conteudo.length, versao: '1.2.0', build: 40, arch: 'x64' },
      },
    },
    {
      id: 'nossom',
      nome: 'NOSSOM',
      mac: {
        bundle: 'NOSSOM.app',
        arquivos: [
          { arquivo: 'NOSSOM-0.2.2-mac-arm64.dmg', sha256: sha, tamanho: 1, versao: '0.2.2', build: null, arch: 'arm64' },
          { arquivo: 'NOSSOM-0.2.2-mac-x64.dmg', sha256: sha, tamanho: 1, versao: '0.2.2', build: null, arch: 'x64' },
        ],
      },
      windows: null,
    },
  ],
}

function resposta(buf, url = 'https://objects.githubusercontent.com/x') {
  return {
    ok: true,
    url,
    headers: new Headers({ 'content-length': String(buf.length) }),
    body: new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(buf.subarray(0, 1000)))
        c.enqueue(new Uint8Array(buf.subarray(1000)))
        c.close()
      },
    }),
    json: async () => JSON.parse(buf.toString()),
  }
}

/**
 * Um app.asar de verdade, no formato do @electron/asar (o mesmo do electron-builder): UInt32 4 · UInt32 tamanho do
 * cabeçalho · pickle do cabeçalho (UInt32 tamanho · UInt32 tamanho do texto · JSON, alinhado em 4) · conteúdo.
 * `arquivos`: { 'desktop/build-info.json': '…' }; `fora`: caminhos marcados "unpacked" (ficam em app.asar.unpacked).
 */
function asarCom(arquivos, fora = []) {
  const raiz = { files: {} }
  const partes = []
  let offset = 0
  for (const [nome, texto] of Object.entries(arquivos)) {
    const buf = Buffer.from(texto)
    const caminho = nome.split('/')
    let no = raiz
    for (const p of caminho.slice(0, -1)) no = no.files[p] ??= { files: {} }
    if (fora.includes(nome)) no.files[caminho.at(-1)] = { size: buf.length, unpacked: true }
    else {
      no.files[caminho.at(-1)] = { size: buf.length, offset: String(offset) }
      partes.push(buf)
      offset += buf.length
    }
  }
  const json = Buffer.from(JSON.stringify(raiz))
  const alinhado = Math.ceil(json.length / 4) * 4
  const cab = Buffer.alloc(8 + alinhado)
  cab.writeUInt32LE(4 + alinhado, 0)
  cab.writeUInt32LE(json.length, 4)
  json.copy(cab, 8)
  const topo = Buffer.alloc(8)
  topo.writeUInt32LE(4, 0)
  topo.writeUInt32LE(cab.length, 4)
  return Buffer.concat([topo, cab, ...partes])
}

/**
 * O `fs` como o processo principal do Electron o vê: o app.asar é lido como uma pasta. O `rm` recursivo de um .app
 * entra no app.asar, não apaga o que "está dentro" e falha com ENOTEMPTY (conferido no Electron 44.5.1 de verdade; o
 * `original-fs` e o `process.noAsar` apagam). Com isso a troca de um app já instalado falhava na 1.4.0.
 *
 * E o cache: o Electron abre cada .asar uma vez e guarda pelo caminho, para sempre. Trocar o pacote (renomear o .app e
 * apagar o antigo) não invalida: ler o build-info.json "de dentro" continua devolvendo o app antigo até o processo
 * reiniciar (também conferido no Electron 44.5.1: build 1100 → troca para 1119 → o fs lê 1100; o original-fs, 1119).
 */
function fsDoElectron() {
  const cache = new Map()
  const dentroDoAsar = (p) => {
    const m = /^(.*?\.asar)(?:[\\/](.*))?$/.exec(String(p))
    if (!m) return null
    if (!cache.has(m[1])) {
      try {
        const b = fs.readFileSync(m[1])
        cache.set(m[1], { b, tam: b.readUInt32LE(4), cab: JSON.parse(b.toString('utf8', 16, 16 + b.readUInt32LE(12))) })
      } catch {
        return null // não é um .asar (ou não existe): responde o fs comum
      }
    }
    const a = cache.get(m[1])
    let no = a.cab
    for (const parte of (m[2] || '').split(/[\\/]/).filter(Boolean)) no = no && no.files ? no.files[parte] : undefined
    return { a, no }
  }
  const semArquivo = (p) => Object.assign(new Error(`ENOENT: no such file or directory, open '${p}'`), { code: 'ENOENT' })
  const leituras = {
    readFileSync: (p, o) => {
      const d = dentroDoAsar(p)
      if (!d) return fs.readFileSync(p, o)
      if (!d.no || d.no.files) throw semArquivo(p)
      const ini = 8 + d.a.tam + Number(d.no.offset)
      const buf = d.a.b.subarray(ini, ini + d.no.size)
      return o ? buf.toString(typeof o === 'string' ? o : o.encoding) : buf
    },
    existsSync: (p) => {
      const d = dentroDoAsar(p)
      return d ? !!d.no : fs.existsSync(p)
    },
    statSync: (p, o) => {
      const d = dentroDoAsar(p)
      if (!d) return fs.statSync(p, o)
      if (!d.no) throw semArquivo(p)
      return { isDirectory: () => !!d.no.files, isFile: () => !d.no.files }
    },
  }
  const temAsar = (p) => {
    try {
      if (!fs.lstatSync(p).isDirectory()) return p.endsWith('.asar')
      return fs.readdirSync(p).some((n) => temAsar(path.join(p, n)))
    } catch {
      return false
    }
  }
  const rm = async (p, o) => {
    if (o && o.recursive && temAsar(p)) {
      const e = new Error(`ENOTEMPTY: directory not empty, rmdir '${path.join(p, 'Contents', 'Resources')}'`)
      e.code = 'ENOTEMPTY'
      throw e
    }
    return fs.promises.rm(p, o)
  }
  return { ...fs, ...leituras, promises: { ...fs.promises, rm } }
}

/** Um .app no formato do electron-builder (Info.plist e app.asar com o desktop/build-info.json do build). */
function criarBundle(caminho, build = 39) {
  fs.mkdirSync(path.join(caminho, 'Contents', 'Resources'), { recursive: true })
  fs.writeFileSync(path.join(caminho, 'Contents', 'Info.plist'), 'plist')
  const info = JSON.stringify({ build, commit: 'abc1234' })
  fs.writeFileSync(
    path.join(caminho, 'Contents', 'Resources', 'app.asar'),
    asarCom({ 'package.json': '{"name":"x"}', 'desktop/main.cjs': '// app', 'desktop/build-info.json': info }),
  )
}

const buildDoBundle = (caminho) => lerBuildInstalado(fs, path.join(caminho, 'Contents', 'Resources', 'app.asar'))

/** `meusApps`: o que /api/v1/desktop/meus-apps responde (objeto, 401 sem sessão ou 404 no HUB antigo). */

function ambiente({ plataforma, arch = 'arm64', arquivo = conteudo, execRespostas = {}, meusApps = catalogo, electron = false, atalhos = false }) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'zro-central-'))
  const chamadas = []
  const avisos = []
  const pastasMac = [path.join(raiz, 'Applications'), path.join(raiz, 'home', 'Applications')]
  fs.mkdirSync(pastasMac[0], { recursive: true })
  const deps = {
    hub: HUB,
    esperar: async () => {},
    dockReinicioMs: 30,
    plataforma,
    arch,
    home: path.join(raiz, 'home'),
    temp: path.join(raiz, 'tmp'),
    registro: path.join(raiz, 'dados', 'central.json'),
    pastasMac,
    // electron: o fs com o app.asar lido como pasta (como no main.cjs) e o original-fs para os pacotes .app
    fs: electron ? fsDoElectron() : fs,
    ...(electron ? { fsApps: fs } : {}),
    ...(atalhos
      ? {
          pastasAtalho: { areaDeTrabalho: path.join(raiz, 'Desktop'), menuIniciar: path.join(raiz, 'Programs') },
          criarAtalho: (lnk, opcoes) => {
            chamadas.push(['atalho', lnk, opcoes])
            fs.mkdirSync(path.dirname(lnk), { recursive: true })
            fs.writeFileSync(lnk, JSON.stringify(opcoes))
            return true
          },
        }
      : {}),
    fetch: async (url) => {
      chamadas.push(['fetch', url])
      if (url.endsWith('/api/v1/desktop/meus-apps'))
        return typeof meusApps === 'number' ? { ok: false, status: meusApps, json: async () => ({}) } : resposta(Buffer.from(JSON.stringify(meusApps)))
      if (url.endsWith('/api/v1/desktop/apps')) return resposta(Buffer.from(JSON.stringify(catalogo)))
      return resposta(arquivo)
    },
    exec: async (cmd, args) => {
      chamadas.push([cmd, ...args])
      if (cmd === 'hdiutil' && args[0] === 'attach') {
        const ponto = args[args.indexOf('-mountpoint') + 1]
        criarBundle(path.join(ponto, 'Synquei.app'), 40)
      }
      if (cmd === 'ditto') fs.cpSync(args[0], args[1], { recursive: true })
      const r = execRespostas[cmd]
      if (typeof r === 'function') return r(args)
      if (r instanceof Error) throw r
      if (r !== undefined) return { stdout: r }
      if (cmd === 'pgrep' || cmd === 'reg' || cmd === 'plutil') throw new Error('sem resultado')
      return { stdout: '' }
    },
    abrirCaminho: async (p) => (chamadas.push(['abrir', p]), ''),
    lixeira: async (p) => (chamadas.push(['lixeira', p]), fs.rmSync(p, { recursive: true, force: true })),
    avisar: (ev) => avisos.push(ev),
  }
  return { central: new Central(deps), chamadas, avisos, raiz, pastasMac }
}

test('catálogo: descarta nomes de arquivo, bundles e hashes fora do formato', () => {
  const ruim = {
    apps: [
      { id: '../x', nome: 'X' },
      {
        id: 'ok',
        nome: 'Ok',
        mac: { bundle: '../../Evil.app', arquivos: [] },
        windows: { exe: 'a.exe', nomeNoSistema: 'Ok', arquivo: { arquivo: '../a.exe', sha256: sha, versao: '1.0.0', arch: 'x64' } },
      },
    ],
  }
  const v = validarCatalogo(ruim)
  assert.equal(v.length, 1)
  assert.equal(v[0].mac, null)
  assert.equal(v[0].windows, null)
  assert.equal(validarCatalogo(catalogo).length, 2)
})

test('arquivo certo para o computador e regra de atualização', () => {
  const [synquei, nossom] = validarCatalogo(catalogo)
  assert.equal(arquivoPara(nossom, 'mac', 'x64').arquivo, 'NOSSOM-0.2.2-mac-x64.dmg')
  assert.equal(arquivoPara(nossom, 'mac', 'arm64').arquivo, 'NOSSOM-0.2.2-mac-arm64.dmg')
  assert.equal(arquivoPara(synquei, 'mac', 'arm64').arch, 'universal')
  assert.equal(arquivoPara(nossom, 'windows', 'x64'), null)
  const disp = { versao: '1.2.0', build: 40 }
  assert.equal(temAtualizacao({ versao: '1.1.9' }, null, disp), true)
  assert.equal(temAtualizacao({ versao: '1.2.0' }, { build: 39 }, disp), true)
  assert.equal(temAtualizacao({ versao: '1.2.0' }, { build: 40 }, disp), false)
  assert.equal(temAtualizacao({ versao: '1.2.0' }, null, disp), false)
  assert.equal(temAtualizacao({ versao: '1.3.0' }, null, disp), false)
  assert.equal(temAtualizacao(null, null, disp), false)
})

test('build do app instalado (o build-info.json dentro dele): instalado por outro caminho também atualiza', () => {
  // SOBEDESCE 0.1.0 b1034 instalado pelo Terminal (sem registro da central) e o catálogo com o b1042
  const disp = { versao: '0.1.0', build: 1042 }
  assert.equal(temAtualizacao({ versao: '0.1.0', build: 1034 }, null, disp), true)
  assert.equal(temAtualizacao({ versao: '0.1.0', build: 1042 }, null, disp), false)
  // o build do próprio app vale mais que o registro (o app pode ter se atualizado sozinho antes)
  assert.equal(temAtualizacao({ versao: '0.1.0', build: 1042 }, { build: 1034 }, disp), false)
  assert.equal(temAtualizacao({ versao: '0.1.0', build: null }, { build: 1034 }, disp), true)

  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'central-build-'))
  const sobedesce = path.join(raiz, 'SOBEDESCE.app', 'Contents', 'Resources', 'app.asar')
  fs.mkdirSync(path.join(sobedesce, 'src'), { recursive: true })
  fs.writeFileSync(path.join(sobedesce, 'src', 'build-info.json'), JSON.stringify({ build: 1034, commit: 'e79ff63' }))
  assert.equal(lerBuildInstalado(fs, sobedesce), 1034)
  const synquei = path.join(raiz, 'Synquei.app', 'Contents', 'Resources', 'app.asar')
  fs.mkdirSync(path.join(synquei, 'desktop'), { recursive: true })
  fs.writeFileSync(path.join(synquei, 'desktop', 'build-info.json'), JSON.stringify({ build: 1038 }))
  assert.equal(lerBuildInstalado(fs, synquei), 1038)
  const dev = path.join(raiz, 'Dev.app', 'Contents', 'Resources', 'app.asar')
  fs.mkdirSync(path.join(dev, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dev, 'src', 'build-info.json'), JSON.stringify({ build: 0 }))
  assert.equal(lerBuildInstalado(fs, dev), null, 'versão de desenvolvimento não tem build')
  assert.equal(lerBuildInstalado(fs, path.join(raiz, 'nada')), null)
})

test('build do app instalado: lê o app.asar de verdade (sem o suporte a .asar do Electron), unpacked e lixo', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'central-asar-'))
  const gravar = (nome, buf) => (fs.writeFileSync(path.join(raiz, nome), buf), path.join(raiz, nome))
  // SOBEDESCE: src/build-info.json (scripts/build-info.mjs), com os nós de integridade que o electron-builder grava
  const sobedesce = gravar('sobedesce.asar', asarCom({ 'src/main.js': 'x'.repeat(5000), 'src/build-info.json': '{\n "build": 1119,\n "commit": "0d78c0c"\n}' }))
  assert.equal(lerBuildInstalado(fs, sobedesce), 1119)
  // Relay, Maestro, TPeasy, Carro do Freela e Synquei: desktop/build-info.json
  assert.equal(lerBuildInstalado(fs, gravar('relay.asar', asarCom({ 'desktop/build-info.json': '{"build":2008}' }))), 2008)
  // fora do pacote (asarUnpack): app.asar.unpacked ao lado
  const solto = gravar('solto.asar', asarCom({ 'desktop/build-info.json': '' }, ['desktop/build-info.json']))
  fs.mkdirSync(path.join(raiz, 'solto.asar.unpacked', 'desktop'), { recursive: true })
  fs.writeFileSync(path.join(raiz, 'solto.asar.unpacked', 'desktop', 'build-info.json'), '{"build":77}')
  assert.equal(lerBuildInstalado(fs, solto), 77)
  assert.equal(lerBuildInstalado(fs, gravar('dev.asar', asarCom({ 'desktop/build-info.json': '{"build":0}' }))), null)
  assert.equal(lerBuildInstalado(fs, gravar('sem.asar', asarCom({ 'desktop/main.cjs': '//' }))), null)
  assert.equal(lerBuildInstalado(fs, gravar('lixo.asar', Buffer.from('asar b39'))), null)
  assert.equal(lerBuildInstalado(fs, gravar('vazio.asar', Buffer.alloc(0))), null)
  const enorme = Buffer.alloc(16)
  enorme.writeUInt32LE(4, 0)
  enorme.writeUInt32LE(0xfffffff0, 4)
  assert.equal(lerBuildInstalado(fs, gravar('enorme.asar', enorme)), null)
})

test('Mac (1.4.5): depois de instalar, o cartão mostra o build novo e para de oferecer Atualizar (cache de .asar do Electron)', async () => {
  // "Já instalei 3 vezes e nunca fica atualizado": a central lia o build-info.json pelo fs do Electron, que guarda cada
  // app.asar aberto pelo caminho. Depois da troca do pacote, continuava lendo o app antigo: mesma versão, build menor
  // → "Atualizar" e "0.3.10 disponível" para o que acabou de ser instalado, até a central reiniciar.
  const { central, pastasMac } = ambiente({ plataforma: 'mac', electron: true, execRespostas: { plutil: '1.2.0\n' } })
  const final = path.join(pastasMac[0], 'Synquei.app')
  criarBundle(final, 39)
  const antes = (await central.listar()).find((s) => s.id === 'synquei')
  assert.deepEqual(antes.instalado, { versao: '1.2.0', build: 39 })
  assert.equal(antes.atualizar, true)
  const asar = path.join(final, 'Contents', 'Resources', 'app.asar')
  assert.equal(lerBuildInstalado(central.d.fs, asar), 39, 'a leitura da 1.4.4 (fs do Electron) abre e guarda o app.asar')
  await central.instalar('synquei')
  const depois = (await central.listar()).find((s) => s.id === 'synquei')
  assert.deepEqual(depois.instalado, { versao: '1.2.0', build: 40 })
  assert.equal(depois.atualizar, false)
  // o fs do Electron (o que a 1.4.4 usava aqui) ainda vê o app antigo: é o defeito que a leitura sem cache evita
  assert.equal(lerBuildInstalado(central.d.fs, asar), 39)
  // o app se atualizou por fora (sem a central e sem registro novo): a próxima leitura já vê
  criarBundle(path.join(pastasMac[0], '.troca.app'), 41)
  fs.rmSync(final, { recursive: true })
  fs.renameSync(path.join(pastasMac[0], '.troca.app'), final)
  assert.equal((await central.listar()).find((s) => s.id === 'synquei').instalado.build, 41)
})

test('main.cjs (1.4.5): a página e a agenda leem a mesma lista e relêem ao voltar o foco', () => {
  const main = fs.readFileSync(new URL('../desktop/main.cjs', import.meta.url), 'utf8')
  assert.match(main, /agenda\.sincronizar\(lista\)/)
  assert.match(main, /win\.on\('focus', relerAoFocar\)/)
  assert.match(main, /fase: 'reler'/)
  const central = fs.readFileSync(new URL('../desktop/central.cjs', import.meta.url), 'utf8')
  assert.doesNotMatch(central, /lerBuildInstalado\(this\.d\.fs/, 'o build instalado nunca pelo fs com cache de .asar')
})

test('registro do Windows: acha a entrada do app e o desinstalador', () => {
  const saida = [
    'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\abc',
    '    DisplayName    REG_SZ    Synquei 1.2.0',
    '    DisplayVersion    REG_SZ    1.2.0',
    '    InstallLocation    REG_SZ    C:\\Users\\v\\AppData\\Local\\Programs\\synquei',
    '    UninstallString    REG_SZ    "C:\\Users\\v\\AppData\\Local\\Programs\\synquei\\Uninstall Synquei.exe" /currentuser',
    '',
    'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\def',
    '    DisplayName    REG_SZ    SynqueiPlus 9',
  ].join('\r\n')
  const e = lerRegistro(saida, 'Synquei')
  assert.equal(e.length, 1)
  assert.equal(e[0].DisplayVersion, '1.2.0')
  assert.equal(caminhoDoComando(e[0].UninstallString), 'C:\\Users\\v\\AppData\\Local\\Programs\\synquei\\Uninstall Synquei.exe')
})

test('download: confere o SHA-256; arquivo diferente é apagado e nada é instalado', async () => {
  const { raiz } = ambiente({ plataforma: 'mac' })
  const deps = { fs, fetch: async () => resposta(conteudo) }
  const ok = await baixar({ url: 'https://x', destino: path.join(raiz, 'a.dmg'), sha256: sha, tamanho: conteudo.length, deps })
  assert.equal(fs.readFileSync(ok).length, conteudo.length)
  await assert.rejects(baixar({ url: 'https://x', destino: path.join(raiz, 'b.dmg'), sha256: 'f'.repeat(64), tamanho: conteudo.length, deps }), /não confere/)
  assert.equal(fs.existsSync(path.join(raiz, 'b.dmg')), false)
  assert.equal(fs.existsSync(path.join(raiz, 'b.dmg.parte')), false)
  await assert.rejects(
    baixar({ url: 'http://x', destino: path.join(raiz, 'c.dmg'), sha256: sha, deps: { fs, fetch: async () => resposta(conteudo, 'http://x') } }),
    /recusado/,
  )
})

test('download: maior que o catálogo para no meio; redirecionamento recusado e queda de rede não deixam pedaço no disco', async () => {
  const { raiz } = ambiente({ plataforma: 'mac' })
  const grande = Buffer.concat([conteudo, conteudo])
  await assert.rejects(
    baixar({ url: 'https://x', destino: path.join(raiz, 'g.dmg'), sha256: sha, tamanho: conteudo.length, deps: { fs, fetch: async () => resposta(grande) } }),
    (e) => e.codigo === 'conferencia',
  )
  assert.equal(fs.existsSync(path.join(raiz, 'g.dmg.parte')), false)
  // fetchDeDownload (download.cjs) recusa um salto fora da regra: a mensagem chega como está
  const recusa = Object.assign(new Error('Endereço de download recusado.'), { recusado: true })
  await assert.rejects(
    baixar({
      url: 'https://x',
      destino: path.join(raiz, 'r.dmg'),
      sha256: sha,
      deps: { fs, fetch: async () => resposta(conteudo), fetchDeDownload: async () => Promise.reject(recusa) },
    }),
    (e) => e.codigo === 'download' && /recusado/.test(e.message),
  )
  // a rede cai no meio do arquivo: a mensagem de sempre (a causa vai para o log)
  const quebrado = { ok: true, url: 'https://x', headers: { get: () => null }, body: new ReadableStream({ pull: (c) => c.error(new Error('rede caiu')) }) }
  await assert.rejects(
    baixar({ url: 'https://x', destino: path.join(raiz, 'q.dmg'), sha256: sha, deps: { fs, fetch: async () => quebrado } }),
    (e) => e.codigo === 'download' && /Não deu para baixar/.test(e.message),
  )
  assert.equal(fs.existsSync(path.join(raiz, 'q.dmg.parte')), false)
})

test('Mac: monta o .dmg, copia o app sem pedir senha, tira a quarentena e desmonta', async () => {
  const { central, chamadas, avisos, pastasMac } = ambiente({ plataforma: 'mac' })
  await central.instalar('synquei')
  const app = path.join(pastasMac[0], 'Synquei.app')
  assert.ok(fs.existsSync(path.join(app, 'Contents', 'Info.plist')))
  const cmds = chamadas.map((c) => c[0])
  assert.deepEqual(
    cmds.filter((c) => c !== 'fetch' && c !== 'plutil' && c !== 'pgrep'),
    ['hdiutil', 'ditto', 'xattr', 'hdiutil'],
  )
  // o espelho primeiro (ADR 0043): o HUB manda para São Paulo quando o arquivo está lá
  assert.ok(chamadas.some((c) => c[0] === 'fetch' && c[1] === `${HUB}/baixar/app/synquei/Synquei-1.2.0-b40-mac-universal.dmg?origem=espelho`))
  assert.deepEqual(
    avisos.map((a) => a.fase).filter((f, i, l) => l.indexOf(f) === i),
    ['baixando', 'instalando', 'pronto'],
  )
  const reg = JSON.parse(fs.readFileSync(central.d.registro, 'utf8'))
  assert.equal(reg.synquei.build, 40)
  // depois de instalado: abrir e remover (lixeira)
  await central.abrir('synquei')
  assert.ok(chamadas.some((c) => c[0] === 'abrir' && c[1] === app))
  await central.remover('synquei')
  assert.equal(fs.existsSync(app), false)
})

test('Mac: sem permissão em /Applications, instala em ~/Applications', async () => {
  const { central, pastasMac } = ambiente({ plataforma: 'mac' })
  fs.rmSync(pastasMac[0], { recursive: true })
  await central.instalar('synquei')
  assert.ok(fs.existsSync(path.join(pastasMac[1], 'Synquei.app')))
})

test('Mac: atualiza o app já instalado (com app.asar) no fs do Electron e não deixa o antigo para trás', async () => {
  // 1.4.0: depois de trocar, o rm recursivo do .zro-antigo passava pelo fs do Electron e falhava (ENOTEMPTY no
  // app.asar) → "Não deu para instalar. Tente de novo."; o .zro-antigo ficava e travava toda troca seguinte. Só falhava
  // com o app já no Mac (SOBEDESCE, Synquei e Relay, instalados antes da central); instalar do zero passava.
  const { central, pastasMac, avisos } = ambiente({ plataforma: 'mac', electron: true })
  const final = path.join(pastasMac[0], 'Synquei.app')
  criarBundle(final, 39)
  await central.instalar('synquei')
  assert.equal(buildDoBundle(final), 40)
  assert.deepEqual(
    fs.readdirSync(pastasMac[0]).filter((n) => n.includes('zro-')),
    [],
    'nem .zro-novo nem .zro-antigo ficam na pasta de apps',
  )
  assert.equal(avisos.at(-1).fase, 'pronto')
  assert.equal(JSON.parse(fs.readFileSync(central.d.registro, 'utf8')).synquei.build, 40)
})

test('Mac: sem o original-fs (como na 1.4.0), a mesma troca falhava com "Não deu para instalar"', async () => {
  const { central, pastasMac } = ambiente({ plataforma: 'mac', electron: true })
  delete central.d.fsApps
  criarBundle(path.join(pastasMac[0], 'Synquei.app'), 39)
  criarBundle(path.join(pastasMac[0], '.Synquei.app.zro-antigo'), 38)
  await assert.rejects(central.instalar('synquei'), /Não deu para instalar\. Tente de novo\./)
})

test('Mac: sobra .zro-antigo de uma troca que parou no meio (1.4.0) não trava a próxima', async () => {
  const { central, pastasMac } = ambiente({ plataforma: 'mac', electron: true })
  const final = path.join(pastasMac[0], 'Synquei.app')
  criarBundle(final, 40)
  criarBundle(path.join(pastasMac[0], '.Synquei.app.zro-antigo'), 39)
  criarBundle(path.join(pastasMac[0], '.Synquei.app.zro-novo'), 40)
  await central.instalar('synquei')
  assert.ok(fs.existsSync(path.join(final, 'Contents', 'Info.plist')))
  assert.deepEqual(
    fs.readdirSync(pastasMac[0]).filter((n) => n.includes('zro-')),
    [],
  )
})

test('Mac: não deu para pôr o novo no lugar: o app antigo volta inteiro', async () => {
  const { central, pastasMac } = ambiente({ plataforma: 'mac', electron: true })
  const final = path.join(pastasMac[0], 'Synquei.app')
  criarBundle(final, 39)
  const renomear = fs.promises.rename
  central.d.fsApps = {
    ...fs,
    promises: {
      ...fs.promises,
      rename: async (de, para) => {
        if (de.endsWith('.zro-novo')) throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })
        return renomear(de, para)
      },
    },
  }
  await assert.rejects(central.instalar('synquei'), /Não deu para instalar/)
  assert.equal(buildDoBundle(final), 39)
  assert.deepEqual(
    fs.readdirSync(pastasMac[0]).filter((n) => n.includes('zro-')),
    [],
  )
})

test('main.cjs: os pacotes .app passam pelo original-fs (sem o app.asar lido como pasta)', () => {
  const main = fs.readFileSync(new URL('../desktop/main.cjs', import.meta.url), 'utf8')
  assert.match(main, /fsApps:\s*require\('original-fs'\)/)
})

test('Dock: endereço e item no formato das preferências do Dock; reconhece o app que já está lá', () => {
  assert.equal(urlDoDock('/Applications/Carro do Freela.app'), 'file:///Applications/Carro%20do%20Freela.app/')
  const item = itemDoDock('/Users/a&b/Applications/Relay.app')
  assert.match(item, /<key>_CFURLString<\/key><string>file:\/\/\/Users\/a&amp;b\/Applications\/Relay\.app\/<\/string>/)
  assert.match(item, /<key>tile-type<\/key><string>file-tile<\/string>/)
  const dock = '(\n {\n "tile-data" = {\n "file-data" = {\n "_CFURLString" = "file:///Applications/Relay.app/";\n "_CFURLStringType" = 15;\n };\n };\n }\n)'
  assert.equal(estaNoDock(dock, '/Applications/Relay.app'), true)
  assert.equal(estaNoDock(dock, '/Applications/Synquei.app'), false)
  assert.equal(estaNoDock('', '/Applications/Relay.app'), false)
})

const itemSaida = (url) =>
  ` {\n "tile-data" = {\n "file-data" = {\n "_CFURLString" = "${url}";\n "_CFURLStringType" = 15;\n };\n };\n "tile-type" = "file-tile";\n }`
const saidaDock = (...urls) => `(\n${urls.map(itemSaida).join(',\n')}\n)`
const instaladosFalsos = (central, pastas) => {
  central.detectar = async (app) => ({ caminho: path.join(pastas[0], app.mac.bundle), versao: '1.0.0' })
}
const dorme = (ms) => new Promise((r) => setTimeout(r, ms))

test('Dock: compara caminho decodificado e normalizado, nunca por pedaço de texto', () => {
  const dock = saidaDock('file:///Applications/Carro%20do%20Freela.app/', 'file:///Applications/Old/Synquei.app/', 'file:///Applications/Synquei.app.bak/')
  assert.deepEqual(caminhosDoDock(dock), ['/Applications/Carro do Freela.app', '/Applications/Old/Synquei.app', '/Applications/Synquei.app.bak'])
  assert.equal(estaNoDock(dock, '/Applications/Carro do Freela.app'), true)
  assert.equal(estaNoDock(dock, '/Applications/Carro do Freela.app/'), true, 'barra final não conta')
  assert.equal(estaNoDock(dock, '/Applications/Synquei.app'), false, 'mesmo nome em outra pasta ou nome parcial não é "já está"')
  assert.equal(estaNoDock(dock, '/Users/x/Applications/Carro do Freela.app'), false)
  assert.equal(estaNoDock(dock, '/applications/carro do freela.app'), false)
  assert.equal(estaNoDock(dock, '/applications/carro do freela.app', true), true, 'disco que ignora maiúsculas')
  assert.equal(estaNoDock(saidaDock('file://localhost/Applications/Relay.app/'), '/Applications/Relay.app'), true)
  assert.equal(estaNoDock('"_CFURLString" = "file:///Applications/Relay.app/" ;', '/Applications/Relay.app'), true)
})

test('Mac: "Manter no Dock" só com o toque, acrescenta ao Dock e reinicia; já no Dock, não repete', async () => {
  let dock = '(\n)'
  const { central, chamadas, pastasMac } = ambiente({
    plataforma: 'mac',
    execRespostas: {
      defaults: (args) => {
        if (args[0] === 'write') dock = `( { "tile-data" = { "file-data" = { "_CFURLString" = "${urlDoDock(path.join(pastasMac[0], 'Synquei.app'))}"; }; }; } )`
        return { stdout: dock }
      },
    },
  })
  await central.instalar('synquei')
  assert.equal(
    chamadas.some((c) => c[0] === 'defaults' && c[1] === 'write'),
    false,
    'instalar não mexe no Dock',
  )
  let s = (await central.listar()).find((x) => x.id === 'synquei')
  assert.deepEqual(s.atalho, { tipo: 'dock', feito: false })
  assert.equal((await central.listar()).find((x) => x.id === 'nossom').atalho, null, 'sem app instalado, sem atalho')
  assert.deepEqual(await central.criarAtalho('synquei'), { tipo: 'dock', feito: true })
  const escrita = chamadas.find((c) => c[0] === 'defaults' && c[1] === 'write')
  assert.deepEqual(escrita.slice(1, 5), ['write', 'com.apple.dock', 'persistent-apps', '-array-add'])
  assert.equal(escrita[5], itemDoDock(path.join(pastasMac[0], 'Synquei.app')))
  await dorme(80)
  assert.ok(chamadas.some((c) => c[0] === 'killall' && c[1] === 'Dock'))
  s = (await central.listar()).find((x) => x.id === 'synquei')
  assert.deepEqual(s.atalho, { tipo: 'dock', feito: true })
  await central.criarAtalho('synquei')
  assert.equal(chamadas.filter((c) => c[0] === 'defaults' && c[1] === 'write').length, 1, 'já no Dock: não acrescenta de novo')
  await dorme(80)
  assert.equal(chamadas.filter((c) => c[0] === 'killall').length, 1)
})

test('Mac: app não instalado: erro; Dock que recusa a gravação: erro claro depois de 3 tentativas, sem killall', async () => {
  const { central, chamadas } = ambiente({
    plataforma: 'mac',
    execRespostas: { defaults: (args) => (args[0] === 'write' ? Promise.reject(new Error('x')) : { stdout: '' }) },
  })
  await assert.rejects(central.criarAtalho('synquei'), /não está instalado/)
  await central.instalar('synquei')
  await assert.rejects(central.criarAtalho('synquei'), /Não deu para pôr o Synquei no Dock/)
  assert.equal(chamadas.filter((c) => c[0] === 'defaults' && c[1] === 'write').length, 3)
  await dorme(80)
  assert.equal(
    chamadas.some((c) => c[0] === 'killall'),
    false,
    'sem gravação confirmada, não reinicia o Dock',
  )
})

// Dock falso: guarda a lista; `engolir` = quantas gravações "somem" (o write devolve sem erro, mas a leitura não traz o item)
function dockFalso({ engolir = 0, inicial = [], atraso = 0 } = {}) {
  const estado = { itens: [...inicial], gravacoes: 0, emGravacao: 0, maxSimultaneas: 0 }
  const exec = async (args) => {
    if (args[0] === 'write') {
      estado.emGravacao++
      estado.maxSimultaneas = Math.max(estado.maxSimultaneas, estado.emGravacao)
      if (atraso) await dorme(atraso)
      estado.gravacoes++
      if (estado.gravacoes > engolir) estado.itens.push(args[4].match(/<string>(file:[^<]+)<\/string>/)[1])
      estado.emGravacao--
      return { stdout: '' }
    }
    return { stdout: estado.itens.length ? saidaDock(...estado.itens) : '(\n)' }
  }
  return { estado, exec }
}

test('Mac: a primeira gravação some, a segunda entra: confirma relendo o Dock e reinicia uma vez', async () => {
  const dock = dockFalso({ engolir: 1 })
  const { central, chamadas } = ambiente({ plataforma: 'mac', execRespostas: { defaults: dock.exec } })
  await central.instalar('synquei')
  assert.deepEqual(await central.criarAtalho('synquei'), { tipo: 'dock', feito: true })
  assert.equal(dock.estado.gravacoes, 2)
  assert.equal(dock.estado.itens.length, 1)
  await dorme(80)
  assert.equal(chamadas.filter((c) => c[0] === 'killall').length, 1)
  assert.equal((await central.listar()).find((x) => x.id === 'synquei').atalho.feito, true)
})

test('Mac: gravação que nunca entra mostra erro (nunca "feito") e a lista continua dizendo que não está no Dock', async () => {
  const dock = dockFalso({ engolir: 99 })
  const { central } = ambiente({ plataforma: 'mac', execRespostas: { defaults: dock.exec } })
  await central.instalar('synquei')
  await assert.rejects(central.criarAtalho('synquei'), /Não deu para pôr o Synquei no Dock/)
  assert.equal(dock.estado.gravacoes, 3)
  assert.equal((await central.listar()).find((x) => x.id === 'synquei').atalho.feito, false)
})

test('Mac: duas chamadas ao mesmo tempo entram na fila (um app por vez) e o Dock reinicia uma vez só', async () => {
  const dock = dockFalso({ atraso: 20 })
  const { central, chamadas, pastasMac } = ambiente({ plataforma: 'mac', execRespostas: { defaults: dock.exec } })
  await central.carregarCatalogo()
  instaladosFalsos(central, pastasMac)
  const r = await Promise.all([central.criarAtalho('synquei'), central.criarAtalho('nossom')])
  assert.deepEqual(r, [
    { tipo: 'dock', feito: true },
    { tipo: 'dock', feito: true },
  ])
  assert.equal(dock.estado.maxSimultaneas, 1, 'nunca duas gravações ao mesmo tempo')
  assert.equal(dock.estado.itens.length, 2)
  await dorme(120)
  assert.equal(chamadas.filter((c) => c[0] === 'killall').length, 1, 'um killall Dock para o lote')
})

test('Mac: um erro na fila não trava o app seguinte', async () => {
  const dock = dockFalso({ engolir: 3 })
  const { central, pastasMac } = ambiente({ plataforma: 'mac', execRespostas: { defaults: dock.exec } })
  await central.carregarCatalogo()
  instaladosFalsos(central, pastasMac)
  const r = await Promise.allSettled([central.criarAtalho('synquei'), central.criarAtalho('nossom')])
  assert.equal(r[0].status, 'rejected')
  assert.equal(r[1].status, 'fulfilled')
})

test('Mac: caminho com espaço (Carro do Freela.app) entra e é reconhecido; item antigo quebrado não conta como "já está"', async () => {
  const antigo = 'file:///Users/velho/Applications/Carro%20do%20Freela.app/'
  const dock = dockFalso({ inicial: [antigo] })
  const { central, pastasMac } = ambiente({
    plataforma: 'mac',
    meusApps: { apps: catalogo.apps.map((a) => (a.id === 'nossom' ? { ...a, nome: 'Carro do Freela', mac: { ...a.mac, bundle: 'Carro do Freela.app' } } : a)) },
    execRespostas: { defaults: dock.exec },
  })
  await central.carregarCatalogo()
  const app = central.app('nossom')
  const caminho = path.join(pastasMac[0], 'Carro do Freela.app')
  central.detectar = async () => ({ caminho, versao: '1.0.0' })
  assert.equal((await central.listar()).find((x) => x.id === 'nossom').atalho.feito, false, 'só o item antigo, de outro caminho')
  assert.deepEqual(await central.criarAtalho(app.id), { tipo: 'dock', feito: true })
  assert.equal(dock.estado.gravacoes, 1, 'o antigo não impediu a gravação')
  assert.ok(dock.estado.itens.includes(urlDoDock(caminho)))
  assert.match(dock.estado.itens[1], /Carro%20do%20Freela\.app\/$/)
  assert.equal((await central.listar()).find((x) => x.id === 'nossom').atalho.feito, true)
  await central.criarAtalho(app.id)
  assert.equal(dock.estado.gravacoes, 1, 'já com o mesmo caminho: não repete')
})

test('Windows: "Criar atalho" na Área de Trabalho e no Menu Iniciar (sem fingir que fixa na barra de tarefas)', async () => {
  const reg = [
    'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\abc',
    '    DisplayName    REG_SZ    Synquei 1.2.0',
    '    DisplayVersion    REG_SZ    1.2.0',
    '    InstallLocation    REG_SZ    C:\\Programas\\synquei',
  ].join('\r\n')
  const { central, chamadas, raiz } = ambiente({ plataforma: 'windows', atalhos: true, execRespostas: { reg } })
  let s = (await central.listar()).find((x) => x.id === 'synquei')
  assert.deepEqual(s.atalho, { tipo: 'atalho', feito: false })
  // o instalador já criou o do Menu Iniciar: fica como está
  fs.mkdirSync(path.join(raiz, 'Programs'), { recursive: true })
  fs.writeFileSync(path.join(raiz, 'Programs', 'Synquei.lnk'), 'do instalador')
  assert.deepEqual(await central.criarAtalho('synquei'), { tipo: 'atalho', feito: true })
  const criados = chamadas.filter((c) => c[0] === 'atalho')
  assert.equal(criados.length, 1)
  assert.equal(path.basename(criados[0][1]), 'Synquei.lnk')
  assert.equal(path.dirname(criados[0][1]), path.join(raiz, 'Desktop'))
  assert.deepEqual(criados[0][2], {
    target: 'C:\\Programas\\synquei\\Synquei.exe',
    description: 'Synquei',
    icon: 'C:\\Programas\\synquei\\Synquei.exe',
    iconIndex: 0,
  })
  assert.equal(fs.readFileSync(path.join(raiz, 'Programs', 'Synquei.lnk'), 'utf8'), 'do instalador')
  s = (await central.listar()).find((x) => x.id === 'synquei')
  assert.deepEqual(s.atalho, { tipo: 'atalho', feito: true })
  // sem a ponte do shell: nada de atalho
  const semPonte = ambiente({ plataforma: 'windows', execRespostas: { reg } })
  assert.equal((await semPonte.central.listar()).find((x) => x.id === 'synquei').atalho, null)
  await assert.rejects(semPonte.central.criarAtalho('synquei'), /Atalho indisponível/)
})

test('Windows: instalador em silêncio, para o usuário atual; atualizar com o app aberto pede para fechar', async () => {
  const reg = [
    'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\abc',
    '    DisplayName    REG_SZ    Synquei 1.1.0',
    '    DisplayVersion    REG_SZ    1.1.0',
    '    InstallLocation    REG_SZ    C:\\Programas\\synquei',
    '    UninstallString    REG_SZ    "C:\\Programas\\synquei\\Uninstall Synquei.exe" /currentuser',
  ].join('\r\n')
  const aberto = ambiente({ plataforma: 'windows', execRespostas: { reg, tasklist: '"Synquei.exe","123","Console"' } })
  const lista = await aberto.central.listar()
  const s = lista.find((x) => x.id === 'synquei')
  assert.deepEqual([s.instalado.versao, s.atualizar], ['1.1.0', true])
  assert.equal(lista.find((x) => x.id === 'nossom').disponivel, null)
  await assert.rejects(aberto.central.instalar('synquei'), /Feche o Synquei/)

  const fechado = ambiente({ plataforma: 'windows', execRespostas: { reg, tasklist: 'INFO: nenhuma tarefa' } })
  await fechado.central.instalar('synquei')
  const setup = fechado.chamadas.find((c) => String(c[0]).endsWith('Synquei-1.2.0-b40-windows-setup.exe'))
  assert.deepEqual(setup.slice(1), ['/S', '/currentuser'])
  await fechado.central.abrir('synquei')
  assert.ok(fechado.chamadas.some((c) => c[0] === 'abrir' && c[1] === 'C:\\Programas\\synquei\\Synquei.exe'))
  await fechado.central.remover('synquei')
  assert.ok(fechado.chamadas.some((c) => c[0] === 'C:\\Programas\\synquei\\Uninstall Synquei.exe' && c[1] === '/S'))
})

test('ferramenta fora do catálogo ou sem instalador para o sistema: erro claro', async () => {
  const { central } = ambiente({ plataforma: 'windows' })
  await assert.rejects(central.instalar('nossom'), /ainda não tem instalador para este computador/)
  await assert.rejects(central.instalar('outra'), /não encontrada/)
})

test('segundo plano: prebaixar confere sem avisar a página; instalar depois reaproveita o arquivo conferido', async () => {
  const { central, chamadas, avisos } = ambiente({ plataforma: 'mac' })
  const downloads = () => chamadas.filter((c) => c[0] === 'fetch' && c[1].includes('/baixar/app/')).length
  assert.deepEqual(await central.prebaixar('synquei'), { versao: '1.2.0', build: 40 })
  assert.equal(downloads(), 1)
  assert.deepEqual(avisos, [], 'o download em segundo plano não mexe na página')
  await central.prebaixar('synquei')
  assert.equal(downloads(), 1, 'arquivo já conferido não baixa de novo')
  await central.instalar('synquei')
  assert.equal(downloads(), 1, 'instalar usa o arquivo já baixado')
  assert.deepEqual(
    avisos.map((a) => a.fase),
    ['instalando', 'pronto'],
  )
})

test('segundo plano: arquivo baixado que foi mexido no disco é baixado de novo', async () => {
  const { central, chamadas, raiz } = ambiente({ plataforma: 'mac' })
  await central.prebaixar('synquei')
  const arquivo = path.join(raiz, 'tmp', 'absolute-zro-central', 'synquei', 'Synquei-1.2.0-b40-mac-universal.dmg')
  const bytes = fs.readFileSync(arquivo)
  bytes[0] ^= 1
  fs.writeFileSync(arquivo, bytes)
  await central.instalar('synquei')
  assert.equal(chamadas.filter((c) => c[0] === 'fetch' && c[1].includes('/baixar/app/')).length, 2)
})

test('gerenciável: Mac em pasta gravável; Windows só instalação do usuário (HKCU)', async () => {
  const mac = ambiente({ plataforma: 'mac' })
  await mac.central.instalar('synquei')
  const s = (await mac.central.listar()).find((x) => x.id === 'synquei')
  assert.equal(s.gerenciavel, true)
  assert.equal(mac.central.gerenciavel({ caminho: '/Volumes/Synquei/Synquei.app' }), false)
  assert.equal(mac.central.gerenciavel({ caminho: '/private/var/folders/x/AppTranslocation/y/Synquei.app' }), false)
  assert.equal(mac.central.gerenciavel(null), false)
  const win = ambiente({ plataforma: 'windows' })
  assert.equal(win.central.gerenciavel({ caminho: 'C:\\x\\Synquei.exe', escopo: 'HKCU' }), true)
  assert.equal(win.central.gerenciavel({ caminho: 'C:\\x\\Synquei.exe', escopo: 'HKLM' }), false)
})

test('aberto e fechar: pede para sair do jeito educado (sem forçar)', async () => {
  const mac = ambiente({ plataforma: 'mac', execRespostas: { pgrep: '123' } })
  await mac.central.carregarCatalogo()
  assert.equal(await mac.central.aberto('synquei'), false, 'não instalado = não está aberto')
  await mac.central.fechar('synquei')
  assert.deepEqual(
    mac.chamadas.find((c) => c[0] === 'osascript'),
    ['osascript', '-e', 'quit app "Synquei"'],
  )
  const reg = ['HKEY_CURRENT_USER\\Software\\x', '    DisplayName    REG_SZ    Synquei 1.1.0', '    InstallLocation    REG_SZ    C:\\P\\synquei'].join('\r\n')
  const win = ambiente({ plataforma: 'windows', execRespostas: { reg, tasklist: '"Synquei.exe","1","Console"' } })
  assert.equal(await win.central.aberto('synquei'), true)
  await win.central.fechar('synquei')
  const kill = win.chamadas.find((c) => c[0] === 'taskkill')
  assert.deepEqual(kill, ['taskkill', '/IM', 'Synquei.exe'])
  assert.equal(kill.includes('/F'), false)
})

// Central única (ADR 0036): os apps da conta, pelo plano.
test('meus apps: o que o plano não inclui vem bloqueado (sem arquivo), não instala e o que está no computador fica', async () => {
  const comBloqueado = {
    ...catalogo,
    versao: 2,
    bloqueados: [
      {
        id: 'maestro',
        nome: 'Maestro',
        plano: 'Absolute ZRO Completo',
        mac: { bundle: 'Maestro.app' },
        windows: { exe: 'Maestro.exe', nomeNoSistema: 'Maestro' },
      },
    ],
  }
  const { central, chamadas, pastasMac } = ambiente({ plataforma: 'mac', meusApps: comBloqueado })
  fs.mkdirSync(path.join(pastasMac[0], 'Maestro.app', 'Contents'), { recursive: true })
  fs.writeFileSync(path.join(pastasMac[0], 'Maestro.app', 'Contents', 'Info.plist'), 'plist')
  const lista = await central.listar()
  const m = lista.find((s) => s.id === 'maestro')
  assert.deepEqual(m.bloqueado, { plano: 'Absolute ZRO Completo' })
  assert.equal(m.disponivel, null)
  assert.equal(m.atualizar, false)
  assert.ok(m.instalado, 'continua instalado')
  assert.equal(lista.find((s) => s.id === 'synquei').bloqueado, null)
  await assert.rejects(central.instalar('maestro'), (e) => e.codigo === 'plano')
  await assert.rejects(central.prebaixar('maestro'), (e) => e.codigo === 'plano')
  assert.ok(fs.existsSync(path.join(pastasMac[0], 'Maestro.app')), 'nada é apagado')
  assert.equal(chamadas.filter((c) => c[0] === 'fetch' && c[1].includes('/baixar/app/maestro')).length, 0)
  assert.ok(chamadas.some((c) => c[0] === 'fetch' && c[1] === `${HUB}/api/v1/desktop/meus-apps`))
  assert.ok(!chamadas.some((c) => c[0] === 'fetch' && c[1] === `${HUB}/api/v1/desktop/apps`))
})

test('meus apps: sem sessão (401) a central pede para entrar e não lista nada; HUB antigo (404) usa o catálogo de antes', async () => {
  const sem = ambiente({ plataforma: 'mac', meusApps: 401 })
  await assert.rejects(sem.central.carregarCatalogo(), (e) => e.codigo === 'login')
  assert.equal(sem.central.semLogin, true)
  assert.deepEqual(sem.central.catalogo, [])
  const antigo = ambiente({ plataforma: 'mac', meusApps: 404 })
  assert.deepEqual(
    (await antigo.central.carregarCatalogo()).map((a) => a.id),
    ['synquei', 'nossom'],
  )
  assert.equal(antigo.central.semLogin, false)
})
