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
const { Central, validarCatalogo, arquivoPara, temAtualizacao, lerBuildInstalado, lerRegistro, caminhoDoComando, baixar } = require('../desktop/central.cjs')

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

function ambiente({ plataforma, arch = 'arm64', arquivo = conteudo, execRespostas = {} }) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'zro-central-'))
  const chamadas = []
  const avisos = []
  const pastasMac = [path.join(raiz, 'Applications'), path.join(raiz, 'home', 'Applications')]
  fs.mkdirSync(pastasMac[0], { recursive: true })
  const deps = {
    hub: HUB,
    plataforma,
    arch,
    home: path.join(raiz, 'home'),
    temp: path.join(raiz, 'tmp'),
    registro: path.join(raiz, 'dados', 'central.json'),
    pastasMac,
    fs,
    fetch: async (url) => {
      chamadas.push(['fetch', url])
      if (url.endsWith('/api/v1/desktop/apps')) return resposta(Buffer.from(JSON.stringify(catalogo)))
      return resposta(arquivo)
    },
    exec: async (cmd, args) => {
      chamadas.push([cmd, ...args])
      if (cmd === 'hdiutil' && args[0] === 'attach') {
        const ponto = args[args.indexOf('-mountpoint') + 1]
        fs.mkdirSync(path.join(ponto, 'Synquei.app', 'Contents'), { recursive: true })
        fs.writeFileSync(path.join(ponto, 'Synquei.app', 'Contents', 'Info.plist'), 'plist')
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
  assert.ok(chamadas.some((c) => c[0] === 'fetch' && c[1] === `${HUB}/baixar/app/synquei/Synquei-1.2.0-b40-mac-universal.dmg`))
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
