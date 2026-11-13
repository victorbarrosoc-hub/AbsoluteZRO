// As cópias em vendor/ batem com os pacotes (npm run vendor): ninguém edita biblioteca à mão. Confere também as
// licenças (LibRaw: LGPL-2.1 eleita, versão e fonte registrados), que nenhum import de pacote sobrou (a CSP não aceita
// import map), que as cópias funcionam no Node, e os modelos de visão: modelos.json com endereço oficial de versão
// fixa, sha256 dos arquivos de .modelos/ e o download que só guarda o que confere.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NOME } from '../app/nome.js'
import { baixar, confere, modelos, PASTA, situacao } from '../scripts/modelos.mjs'
import { arquivosDoVendor, conteudo, itens, leiame, versao, versaoDoLibRaw } from '../scripts/vendor.mjs'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const EXIGIR = process.env.FOTO_EXIGIR === '1'
const ler = (p) => readFileSync(join(RAIZ, p))
const sha256 = (b) => createHash('sha256').update(b).digest('hex')

test('vendor/ igual a node_modules (com os imports trocados), sem arquivo a mais nem a menos', async () => {
  for (const i of itens()) {
    assert.ok(existsSync(join(RAIZ, 'vendor', i.para)), `falta vendor/${i.para}: rode npm run vendor`)
    assert.ok(ler(`vendor/${i.para}`).equals(conteudo(i)), `vendor/${i.para} difere de node_modules/${i.de}: rode npm run vendor`)
  }
  assert.deepEqual(arquivosDoVendor(), [...itens().map((i) => i.para), 'README.md'].sort())
  assert.equal(ler('vendor/README.md').toString('utf8'), await leiame(), 'vendor/README.md desatualizado: rode npm run vendor')
  // o WebAssembly do LibRaw é o do pacote, byte a byte (LGPL: sem alteração, separado e substituível)
  assert.ok(ler('vendor/libraw/libraw.wasm').equals(ler('node_modules/@colorhythm/libraw-wasm/dist/libraw.wasm')))
  assert.deepEqual([...ler('vendor/libraw/libraw.wasm').subarray(0, 4)], [0x00, 0x61, 0x73, 0x6d])
})

test('licenças junto das cópias; LibRaw com a licença eleita, a versão e o endereço do fonte', async () => {
  const licencas = {
    'vendor/libraw/LICENSE-libraw-wasm.txt': /MIT License/,
    'vendor/libraw/LibRaw/COPYRIGHT': /LibRaw LLC[\s\S]*GNU LESSER GENERAL PUBLIC LICENSE version 2\.1[\s\S]*COMMON DEVELOPMENT AND DISTRIBUTION LICENSE/,
    'vendor/libraw/LibRaw/LICENSE.LGPL': /GNU LESSER GENERAL PUBLIC LICENSE\s+Version 2\.1, February 1999/,
    'vendor/libraw/LibRaw/LICENSE.CDDL': /COMMON DEVELOPMENT AND DISTRIBUTION LICENSE \(CDDL\)\s+Version 1\.0/,
    'vendor/typed-cstruct/LICENSE': /MIT License/,
    'vendor/preact/LICENSE': /MIT License[\s\S]*Jason Miller/,
    'vendor/htm/LICENSE': /Apache License\s+Version 2\.0, January 2004/,
  }
  for (const [arquivo, texto] of Object.entries(licencas)) assert.match(ler(arquivo).toString('utf8'), texto, arquivo)
  const libraw = await versaoDoLibRaw()
  assert.match(libraw, /^\d+\.\d+\.\d+/)
  const l = ler('vendor/README.md').toString('utf8')
  assert.match(l, /\*\*Licença eleita:\*\* GNU LGPL 2\.1/)
  assert.ok(l.includes(`LibRaw ${libraw}`))
  assert.ok(l.includes(`@colorhythm/libraw-wasm ${versao('@colorhythm/libraw-wasm')}`))
  assert.match(l, /https:\/\/github\.com\/LibRaw\/LibRaw/)
  assert.match(l, /https:\/\/github\.com\/colorhythm\/libraw-wasm/)
  assert.ok(l.includes(sha256(ler('vendor/libraw/libraw.wasm'))))
  for (const p of ['typed-cstruct', 'preact', 'htm', '@mediapipe/tasks-vision']) assert.ok(l.includes(versao(p)), p)
  // versões fixas no package.json (sem ^): a cópia versionada é a de uma versão exata
  const pacote = JSON.parse(ler('package.json'))
  const fixas = { ...pacote.dependencies, ...pacote.devDependencies }
  for (const p of ['@colorhythm/libraw-wasm', 'preact', 'htm', '@mediapipe/tasks-vision']) {
    assert.match(fixas[p], /^\d+\.\d+\.\d+$/, p)
    assert.equal(fixas[p], versao(p), p)
  }
  // esta pasta vai para o site estático de um app fechado: sem o nome do produto
  for (const f of arquivosDoVendor()) assert.ok(!ler(`vendor/${f}`).toString('latin1').toLowerCase().includes(NOME.toLowerCase()), f)
})

test('nenhum import de pacote sobrou: tudo por caminho relativo (a CSP não aceita import map)', () => {
  const scripts = arquivosDoVendor().filter((f) => /\.m?js$/.test(f))
  assert.ok(scripts.length >= 12)
  for (const f of scripts) {
    const texto = ler(`vendor/${f}`).toString('utf8')
    const estaticos = [...texto.matchAll(/(?:^|[;\s}])(?:import|export)\b[^'"()]*?\bfrom\s*["']([^"']+)["']/g), ...texto.matchAll(/(?:^|[;\s}])import\s*["']([^"']+)["']/g)].map((m) => m[1])
    for (const alvo of estaticos) {
      assert.match(alvo, /^\.{1,2}\//, `${f} importa "${alvo}"`)
      // e o arquivo importado existe dentro de vendor/
      const base = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : ''
      assert.ok(existsSync(join(RAIZ, 'vendor', base, alvo)), `${f} importa ${alvo}, que não está em vendor/`)
    }
    assert.doesNotMatch(texto, /sourceMappingURL=/, f)
  }
  // os imports que a cópia troca estão mesmo trocados
  assert.match(ler('vendor/libraw/index.js').toString('utf8'), /from "\.\.\/typed-cstruct\/index\.js"/)
  assert.match(ler('vendor/preact/hooks.mjs').toString('utf8'), /from"\.\/preact\.mjs"/)
  assert.match(ler('vendor/htm/preact.mjs').toString('utf8'), /from"\.\.\/preact\/preact\.mjs".*from"\.\/htm\.mjs"/)
})

test('as cópias funcionam no Node: LibRaw instancia e o htm monta árvore do Preact', async () => {
  const { LibRaw } = await import('../vendor/libraw/index.js')
  const lr = new LibRaw()
  await lr.waitUntilReady()
  assert.equal(String(LibRaw.version()), await versaoDoLibRaw())
  // um arquivo que não é RAW dá o erro do LibRaw (o binário respondeu de verdade), não um erro de carga
  assert.throws(() => lr.open(new Uint8Array(4096).buffer), (e) => e.name === 'LibRawError' || /LibRaw|format|unsupported/i.test(String(e?.message)))
  const { html } = await import('../vendor/htm/preact.mjs')
  const { useState } = await import('../vendor/preact/hooks.mjs')
  const arvore = html`<p class="a">oi ${1 + 1}</p>`
  assert.equal(arvore.type, 'p')
  assert.equal(arvore.props.class, 'a')
  assert.deepEqual(arvore.props.children, ['oi ', 2])
  assert.equal(typeof useState, 'function')
})

test('o MediaPipe fica fora do git e vem de dependencies (o build da Vercel roda com --omit=dev)', () => {
  assert.ok(!existsSync(join(RAIZ, 'vendor/mediapipe')))
  const pacote = JSON.parse(ler('package.json'))
  assert.ok(pacote.dependencies['@mediapipe/tasks-vision'])
  assert.ok(!pacote.devDependencies?.['@mediapipe/tasks-vision'])
  // as bibliotecas versionadas em vendor/ não precisam existir no build: ficam em devDependencies
  for (const p of ['@colorhythm/libraw-wasm', 'preact', 'htm']) assert.ok(pacote.devDependencies[p], p)
  // .modelos/ e publico/ também não entram no git
  const ignorados = ler('.gitignore').toString('utf8').split('\n')
  for (const linha of ['node_modules/', 'publico/', '.modelos/', '.amostras/']) assert.ok(ignorados.includes(linha), linha)
})

test('modelos.json: quatro modelos, endereço oficial com versão fixa, sha256 e tamanho', () => {
  const lista = modelos()
  assert.deepEqual(lista.map((m) => m.arquivo).sort(), ['blaze_face_full_range.tflite', 'efficientdet_lite0_int8.tflite', 'efficientnet_lite0_int8.tflite', 'face_landmarker.task'])
  assert.deepEqual([...new Set(lista.map((m) => m.camada))].sort(), ['cena', 'objetos', 'rostos'])
  for (const m of lista) {
    assert.match(m.url, /^https:\/\/storage\.googleapis\.com\/mediapipe-models\/[a-z_]+\/[a-z0-9_]+\/(float16|int8)\/1\/[a-z0-9_]+\.(tflite|task)$/, m.arquivo)
    assert.doesNotMatch(m.url, /latest/)
    assert.match(m.sha256, /^[0-9a-f]{64}$/)
    assert.ok(m.tamanho > 500_000 && m.tamanho < 10_000_000)
    assert.equal(m.licenca, 'Apache-2.0')
  }
  assert.equal(new Set(lista.map((m) => m.sha256)).size, 4)
  // lista torta é recusada antes de baixar qualquer coisa
  const pasta = mkdtempSync(join(tmpdir(), 'foto-lista-'))
  try {
    const gravar = (m) => {
      writeFileSync(join(pasta, 'm.json'), JSON.stringify({ modelos: [{ ...lista[0], ...m }] }))
      return join(pasta, 'm.json')
    }
    assert.throws(() => modelos(gravar({ url: lista[0].url.replace('/1/', '/latest/') })), /versão fixa/)
    assert.throws(() => modelos(gravar({ url: 'https://exemplo.com/1/modelo.tflite' })), /versão fixa/)
    assert.throws(() => modelos(gravar({ arquivo: '../fora.tflite' })), /nome inválido/)
    assert.throws(() => modelos(gravar({ sha256: 'abc' })), /sha256/)
    assert.equal(modelos(gravar({})).length, 1)
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
})

const presentes = existsSync(PASTA) ? modelos().filter((m) => existsSync(join(PASTA, m.arquivo))) : []
const semModelos = presentes.length ? false : 'sem .modelos/ (rode npm run modelos)'

test('os modelos são exigidos no CI', { skip: !EXIGIR }, () => {
  assert.deepEqual(
    situacao()
      .filter((m) => !m.pronto)
      .map((m) => m.arquivo),
    [],
    'FOTO_EXIGIR=1 e faltam modelos em .modelos/: rode node scripts/modelos.mjs',
  )
})

test('.modelos/: cada arquivo presente tem o tamanho e o sha256 de modelos.json', { skip: semModelos }, () => {
  for (const m of presentes) {
    const bytes = readFileSync(join(PASTA, m.arquivo))
    assert.equal(bytes.length, m.tamanho, m.arquivo)
    assert.equal(sha256(bytes), m.sha256, m.arquivo)
    assert.equal(confere(m), true)
  }
  // nada em .modelos/ além do que a lista conhece (arquivo solto não vai para o site)
  const conhecidos = new Set(modelos().map((m) => m.arquivo))
  for (const f of readdirSync(PASTA)) assert.ok(conhecidos.has(f), `.modelos/${f} não está em modelos.json`)
})

test('baixar: guarda só o que confere, troca arquivo errado e nunca lança por causa da rede', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'foto-modelos-'))
  try {
    const bom = Buffer.from('modelo de mentira, mas com o sha256 certo')
    const outro = Buffer.from('segundo modelo de mentira')
    const lista = [
      { arquivo: 'bom.tflite', camada: 'rostos', url: 'https://storage.googleapis.com/mediapipe-models/a/b/float16/1/bom.tflite', tamanho: bom.length, sha256: sha256(bom) },
      { arquivo: 'trocado.tflite', camada: 'objetos', url: 'https://storage.googleapis.com/mediapipe-models/a/b/int8/1/trocado.tflite', tamanho: outro.length, sha256: sha256(outro) },
      { arquivo: 'sumiu.task', camada: 'cena', url: 'https://storage.googleapis.com/mediapipe-models/a/b/int8/1/sumiu.task', tamanho: 10, sha256: 'a'.repeat(64) },
      { arquivo: 'fora.task', camada: 'cena', url: 'https://storage.googleapis.com/mediapipe-models/a/b/int8/1/fora.task', tamanho: 10, sha256: 'b'.repeat(64) },
    ]
    const pedidos = []
    const buscar = async (url) => {
      pedidos.push(url)
      if (url.endsWith('/bom.tflite')) return new Response(bom)
      // mesmo tamanho, conteúdo trocado no caminho: o sha256 pega
      if (url.endsWith('/trocado.tflite')) return new Response(Buffer.from(outro).reverse())
      if (url.endsWith('/sumiu.task')) return new Response('não achei', { status: 404 })
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } })
    }
    const avisos = []
    const r = await baixar({ pasta, lista, buscar, log: (t) => avisos.push(t) })
    assert.deepEqual(r.prontos, ['bom.tflite'])
    assert.deepEqual(
      r.faltando.map((f) => [f.arquivo, f.camada, f.motivo]),
      [
        ['trocado.tflite', 'objetos', 'sha256 não confere'],
        ['sumiu.task', 'cena', 'HTTP 404'],
        ['fora.task', 'cena', 'ENOTFOUND'],
      ],
    )
    assert.deepEqual(readdirSync(pasta), ['bom.tflite'])
    assert.equal(avisos.length, 4)
    // de novo: o que já está certo não é pedido outra vez
    pedidos.length = 0
    await baixar({ pasta, lista, buscar })
    assert.ok(!pedidos.some((u) => u.endsWith('/bom.tflite')))
    // arquivo presente e errado (corrompido, cortado) é trocado pelo certo
    writeFileSync(join(pasta, 'bom.tflite'), 'cortado')
    assert.equal(confere(lista[0], pasta), false)
    assert.deepEqual((await baixar({ pasta, lista: [lista[0]], buscar })).prontos, ['bom.tflite'])
    assert.ok(readFileSync(join(pasta, 'bom.tflite')).equals(bom))
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
})

test('publicar sem os modelos e sem rede: o build não cai, avisa e a lista diz o que faltou', async () => {
  const saida = mkdtempSync(join(tmpdir(), 'foto-publico-sem-'))
  const vazia = mkdtempSync(join(tmpdir(), 'foto-modelos-vazia-'))
  try {
    const { publicar } = await import('../publicar.mjs')
    const avisos = []
    const r = await publicar({
      saida,
      modelosEm: vazia,
      buscar: async () => {
        throw new TypeError('fetch failed')
      },
      log: (t) => avisos.push(t),
    })
    assert.deepEqual(r.modelos.prontos, [])
    assert.equal(r.modelos.faltando.length, 4)
    assert.deepEqual(readdirSync(join(saida, 'modelos')), [])
    const lista = JSON.parse(readFileSync(join(saida, 'modelos.json'), 'utf8'))
    assert.deepEqual(
      lista.modelos.map((m) => m.pronto),
      [false, false, false, false],
    )
    assert.equal(avisos.filter((a) => /aparece como indisponível/.test(a)).length, 4)
    // o resto do site saiu inteiro
    for (const f of ['404.html', 'robots.txt', 'fontes/figtree-latin-wght-normal.woff2', 'vendor/libraw/libraw.wasm']) assert.ok(existsSync(join(saida, f)), f)
  } finally {
    rmSync(saida, { recursive: true, force: true })
    rmSync(vazia, { recursive: true, force: true })
  }
})
