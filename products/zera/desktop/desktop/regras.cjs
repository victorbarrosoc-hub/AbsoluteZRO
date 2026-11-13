// ZERA · regras puras (sem Electron), testadas em test/regras.test.mjs.
//
// - O que nunca vai para o Lixo (sistema, raiz do disco, a pasta da pessoa inteira).
// - Quais discos aparecem e como varrer cada um (no Mac, o "/" mais o volume de dados por trás dele).
// - Como o vigia junta as mudanças em pastas para revarrer só o trecho.
// - Conferência do que chega da interface (ids, caminhos).

'use strict'

const path = require('node:path')

/** Caminhos do sistema: nada aqui dentro (nem eles mesmos) vai para o Lixo pelo ZERA. */
const SISTEMA = {
  darwin: ['/System', '/usr', '/bin', '/sbin', '/etc', '/var', '/private', '/dev', '/cores', '/opt', '/Library/Apple'],
  linux: ['/usr', '/bin', '/sbin', '/lib', '/lib64', '/etc', '/var', '/dev', '/proc', '/sys', '/run', '/boot', '/opt', '/snap'],
  win32: ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\ProgramData\\Microsoft', 'C:\\Recovery', 'C:\\System Volume Information', 'C:\\$Recycle.Bin'],
}

/** Pastas que podem ser abertas e ter coisas tiradas de dentro, mas nunca inteiras. */
function pastasInteirasProibidas(plataforma, home) {
  const p = plataforma === 'win32' ? path.win32 : path.posix
  const base = ['Desktop', 'Documents', 'Downloads', 'Movies', 'Music', 'Pictures', 'Videos', 'Library', 'AppData', 'Applications']
  const lista = base.map((x) => p.join(home, x))
  lista.push(home)
  if (plataforma === 'darwin') lista.push('/Applications', '/Library', '/Users', '/Volumes')
  if (plataforma === 'linux') lista.push('/home', '/media', '/mnt', '/root')
  if (plataforma === 'win32') lista.push('C:\\Users', 'C:\\ProgramData')
  return lista
}

function mod(plataforma) {
  return plataforma === 'win32' ? path.win32 : path.posix
}

function igual(a, b, plataforma) {
  return plataforma === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

/** `filho` está dentro de `pai` (ou é ele)? */
function dentro(filho, pai, plataforma) {
  const p = mod(plataforma)
  const rel = p.relative(pai, filho)
  if (rel === '') return true
  if (plataforma === 'win32' && pai.toLowerCase() !== filho.slice(0, pai.length).toLowerCase()) return false
  return !rel.startsWith('..') && !p.isAbsolute(rel)
}

/** Normaliza e tira a barra do fim, menos na raiz do volume ("/", "C:\\"). */
function limpo(c, plataforma) {
  const p = mod(plataforma)
  const n = p.normalize(c)
  return p.parse(n).root === n ? n : n.replace(/[\\/]+$/, '')
}

function raizDoVolume(c, plataforma) {
  if (plataforma === 'win32') return /^[a-zA-Z]:\\?$/.test(c)
  return c === '/' || /^\/Volumes\/[^/]+\/?$/.test(c) || /^\/(media|mnt)\/[^/]+(\/[^/]+)?\/?$/.test(c)
}

/**
 * Pode ir para o Lixo? Devolve `null` (pode) ou o motivo em poucas palavras (aparece na prévia).
 * `raiz` é a pasta varrida: nada fora dela entra.
 */
function motivoParaNaoTirar(caminho, { plataforma, home, raiz }) {
  const p = mod(plataforma)
  if (typeof caminho !== 'string' || !p.isAbsolute(caminho)) return 'Caminho inválido'
  const c = limpo(caminho, plataforma)
  if (raiz && !dentro(c, raiz, plataforma)) return 'Fora da pasta varrida'
  if (raiz && igual(c, limpo(raiz, plataforma), plataforma)) return 'É a pasta varrida inteira'
  if (raizDoVolume(c, plataforma)) return 'É o disco inteiro'
  for (const s of SISTEMA[plataforma] || []) {
    if (dentro(c, s, plataforma)) return 'Arquivo do sistema'
  }
  for (const x of pastasInteirasProibidas(plataforma, home)) {
    if (igual(c, x, plataforma)) return 'Pasta essencial'
  }
  return null
}

/** Itens na nuvem (iCloud Drive, OneDrive, Dropbox…): ir para o Lixo tira de todos os aparelhos. */
function naNuvem(caminho) {
  return /[\\/](Library[\\/]Mobile Documents|Library[\\/]CloudStorage|iCloud Drive|OneDrive[^\\/]*|Dropbox|Google Drive)([\\/]|$)/i.test(caminho)
}

/** Tira da lista o que já está dentro de outro item da lista (ir para o Lixo leva junto). */
function semAninhados(itens, plataforma) {
  const ordenados = [...itens].sort((a, b) => a.c.length - b.c.length)
  const fica = []
  for (const it of ordenados) {
    if (!fica.some((f) => dentro(it.c, f.c, plataforma))) fica.push(it)
  }
  return fica
}

/** Como varrer cada raiz: volumes extras aceitos e caminhos fora. */
function opcoesDeVarredura(raiz, plataforma) {
  if (plataforma === 'darwin' && raiz === '/') {
    // No macOS, o "/" é o volume do sistema (só leitura); os dados da pessoa ficam no volume Data, ligado ao "/" por
    // firmlinks (/Users, /Applications…). Aceita os dois volumes e pula o caminho direto do Data para não contar duas
    // vezes.
    return { volumes: ['/System/Volumes/Data'], excluir: ['/System/Volumes/Data'] }
  }
  return { volumes: [], excluir: [] }
}

/**
 * Discos para a tela inicial, a partir do que o sistema mostra. `ler` é injetado (fs no app, falso nos testes):
 * `ler.listar(dir) → [{nome, symlink, alvo}]`, `ler.espaco(caminho) → {total, livre} | null`, `ler.existe(c)`, `ler.dispositivo(c) → número | null`.
 */
function discos(plataforma, ler) {
  const lista = []
  const devs = new Set()
  const add = (caminho, nome, principal) => {
    const e = ler.espaco(caminho)
    if (!e || !e.total) return
    if (lista.some((d) => d.caminho === caminho)) return
    // o mesmo volume montado em outro lugar (bind mount, atalho) aparece uma vez só
    const dev = ler.dispositivo ? ler.dispositivo(caminho) : null
    if (dev !== null && devs.has(dev)) return
    if (dev !== null) devs.add(dev)
    lista.push({ caminho, nome, principal, total: e.total, livre: e.livre, usado: Math.max(0, e.total - e.livre) })
  }
  if (plataforma === 'darwin') {
    const vols = ler.listar('/Volumes')
    const doSistema = vols.find((v) => v.symlink && v.alvo === '/')
    add('/', doSistema ? doSistema.nome : 'Macintosh HD', true)
    for (const v of vols) {
      if (v.symlink || v.nome.startsWith('.')) continue
      add('/Volumes/' + v.nome, v.nome, false)
    }
  } else if (plataforma === 'win32') {
    for (const letra of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
      const c = letra + ':\\'
      if (ler.existe(c)) add(c, 'Disco ' + letra + ':', letra === 'C')
    }
  } else {
    add('/', 'Este computador', true)
    for (const base of ['/media', '/mnt']) {
      for (const v of ler.listar(base)) {
        if (v.symlink) continue
        const c = base + '/' + v.nome
        // /media/<pessoa>/<disco>
        const dentroDele = base === '/media' ? ler.listar(c).filter((x) => !x.symlink) : []
        if (dentroDele.length) for (const d of dentroDele) add(c + '/' + d.nome, d.nome, false)
        else add(c, v.nome, false)
      }
    }
  }
  return lista
}

/**
 * Vigia: junta os caminhos que mudaram nas pastas a revarrer. Fica com as pastas (o pai de cada arquivo mudado) e
 * tira as que já estão dentro de outra da lista. Ignora o que está em `ignorar` (a pasta de dados do próprio ZERA).
 */
function pastasParaRevarrer(mudados, { raiz, plataforma, ignorar = [] }) {
  const p = mod(plataforma)
  const pastas = new Set()
  for (const m of mudados) {
    const abs = p.isAbsolute(m) ? m : p.join(raiz, m)
    if (ignorar.some((i) => dentro(abs, i, plataforma))) continue
    if (!dentro(abs, raiz, plataforma)) continue
    pastas.add(igual(abs, raiz, plataforma) ? raiz : p.dirname(abs))
  }
  const ordenadas = [...pastas].sort((a, b) => a.length - b.length)
  const fica = []
  for (const c of ordenadas) if (!fica.some((f) => dentro(c, f, plataforma))) fica.push(c)
  // mudança demais de uma vez: melhor revarrer a raiz
  return fica.length > 300 ? [raiz] : fica
}

/** Lista de ids vinda da interface: só inteiros, sem repetir, no máximo `max`. */
function ids(v, max = 20000) {
  if (!Array.isArray(v)) return []
  const s = new Set()
  for (const x of v) {
    if (Number.isInteger(x) && x >= 0 && x < 2 ** 32) s.add(x)
    if (s.size >= max) break
  }
  return [...s]
}

module.exports = {
  motivoParaNaoTirar,
  naNuvem,
  semAninhados,
  opcoesDeVarredura,
  discos,
  pastasParaRevarrer,
  ids,
  dentro,
}
