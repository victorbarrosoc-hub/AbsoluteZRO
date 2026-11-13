// Importar do Lightroom (src/estilo/lightroom-ler.js e lrtemplate.js) e exportar para ele (lightroom-escrever.js).
// Os arquivos de teste são escritos aqui; os do titular, quando estão na máquina, servem de aceitação.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

import { CONTROLES, neutro, normalizar } from '../src/motor/ajustes.js'
import { revelar } from '../src/motor/revelar.js'
import { CINZA } from '../src/motor/tela.js'
import {
  BLACKS,
  ErroLightroom,
  chavesCrsDoXmp,
  converterChaves,
  importarLightroom,
  matizDoMisturador,
  vinhetaEmEv,
  xmpDoJpeg,
} from '../src/estilo/lightroom-ler.js'
import { analisarLua, lerLrtemplate } from '../src/estilo/lrtemplate.js'
import { escreverXmp, matizParaAdobe, nomeDoArquivoXmp, pretosParaAdobe, vinhetaParaAdobe } from '../src/estilo/lightroom-escrever.js'
import { estilosDaCasa } from '../src/estilo/biblioteca.js'
import { qc } from '../src/estilo/qc.js'
import { caminhoDoTitular, lerDoTitular, precisaDoTitular } from './apoio-estilo.js'

const NS = 'xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"'
const envelope = (corpo) => `<x:xmpmeta ${NS}>${corpo}</rdf:RDF></x:xmpmeta>`

test('XMP: chaves como atributos e como elementos dão o mesmo resultado; Seq, Alt e entidades', () => {
  const atributos = envelope(
    `<rdf:Description rdf:about="" xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/" crs:PresetType="Normal" crs:Contrast2012="+40" crs:Saturation="-5" crs:ConvertToGrayscale="False">
      <crs:Name><rdf:Alt><rdf:li xml:lang="x-default">Meu &amp; seu</rdf:li></rdf:Alt></crs:Name>
      <crs:ToneCurvePV2012><rdf:Seq><rdf:li>0, 10</rdf:li><rdf:li>255, 250</rdf:li></rdf:Seq></crs:ToneCurvePV2012>
    </rdf:Description>`,
  )
  const elementos = envelope(
    `<rdf:Description rdf:about="" xmlns:camera="http://ns.adobe.com/camera-raw-settings/1.0/">
      <camera:PresetType>Normal</camera:PresetType><camera:Contrast2012>+40</camera:Contrast2012><camera:Saturation>-5</camera:Saturation>
      <camera:ConvertToGrayscale>False</camera:ConvertToGrayscale>
      <camera:Name><rdf:Alt><rdf:li xml:lang="x-default">Meu &amp; seu</rdf:li></rdf:Alt></camera:Name>
      <camera:ToneCurvePV2012><rdf:Seq><rdf:li>0, 10</rdf:li><rdf:li>255, 250</rdf:li></rdf:Seq></camera:ToneCurvePV2012>
    </rdf:Description>`,
  )
  const a = chavesCrsDoXmp(atributos)
  assert.deepEqual(chavesCrsDoXmp(elementos), a)
  assert.equal(a.Name, 'Meu & seu')
  assert.deepEqual(a.ToneCurvePV2012, ['0, 10', '255, 250'])
  const r = importarLightroom(atributos, { agora: '2026-11-13T00:00:00.000Z' })
  assert.equal(r.predefinicao.nome, 'Meu & seu')
  assert.equal(r.predefinicao.ajustes.luz.contraste, 40)
  assert.equal(r.predefinicao.ajustes.cor.saturacao, -5)
  assert.deepEqual(r.predefinicao.ajustes.curva.pontos.luz, [
    [0, 10 / 255],
    [1, 250 / 255],
  ])
  assert.equal(r.relatorio.desconhecidas.length, 0)
  assert.equal(r.predefinicao.origem.tipo, 'lightroom')
})

test('XMP: recusa o que não é seguro ou não é predefinição, com frase em português', () => {
  const casos = [
    ['<!DOCTYPE x [<!ENTITY a "b">]><x/>', 'xml-inseguro'],
    [envelope('<rdf:Description rdf:about="">'), 'xml'],
    [envelope('<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" dc:format="image/jpeg"/>'), 'sem-crs'],
    [envelope('<rdf:Description rdf:about="" xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/" crs:PresetType="Look" crs:Name="Perfil"/>'), 'e-perfil'],
    ['texto qualquer', 'nao-reconhecido'],
  ]
  for (const [texto, codigo] of casos) {
    assert.throws(
      () => importarLightroom(texto),
      (e) => e instanceof ErroLightroom && e.codigo === codigo && /[a-zà-ú]/.test(e.message),
      codigo,
    )
  }
  assert.throws(
    () => importarLightroom(new Uint8Array(0)),
    (e) => e.codigo === 'vazio',
  )
})

test('JPEG: o XMP do APP1 (principal e estendido) é lido sem tocar na imagem', () => {
  const xmp = envelope(
    '<rdf:Description rdf:about="" xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/" crs:Exposure2012="+0.50" crs:Vibrance="+12" crs:WhiteBalance="Custom" crs:Temperature="5200" crs:Tint="+4"/>',
  )
  const extra = envelope('<rdf:Description rdf:about="" xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/" crs:Clarity2012="+9"/>')
  const enc = new TextEncoder()
  const segmento = (marca, corpo) => {
    const n = corpo.length + 2
    return [0xff, marca, n >> 8, n & 255, ...corpo]
  }
  const cab = enc.encode('http://ns.adobe.com/xap/1.0/\0')
  const cabExt = enc.encode('http://ns.adobe.com/xmp/extension/\0')
  const guid = enc.encode('0123456789ABCDEF0123456789ABCDEF')
  const ext = enc.encode(extra)
  const total = [ext.length >>> 24, (ext.length >> 16) & 255, (ext.length >> 8) & 255, ext.length & 255]
  const metade = Math.floor(ext.length / 2)
  const pedaco = (de, ate) => segmento(0xe1, [...cabExt, ...guid, ...total, de >>> 24, (de >> 16) & 255, (de >> 8) & 255, de & 255, ...ext.subarray(de, ate)])
  const jpeg = Uint8Array.from([
    0xff,
    0xd8,
    ...segmento(0xe0, [...enc.encode('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...segmento(0xe1, [...cab, ...enc.encode(xmp)]),
    ...pedaco(metade, ext.length),
    ...pedaco(0, metade),
    0xff,
    0xda,
    0,
    2,
    0xff,
    0xd9,
  ])
  const { principal, estendido } = xmpDoJpeg(jpeg)
  assert.ok(principal.includes('Vibrance'))
  assert.equal(estendido, extra)
  const r = importarLightroom(jpeg)
  // num JPEG os ajustes são daquela foto: exposição e branco vão para `daFoto`, não para o estilo
  assert.equal(r.daFoto.exposicao, 0.5)
  assert.deepEqual(r.daFoto.branco, { temperatura: 5200, tinta: 4 })
  assert.equal(r.predefinicao.ajustes.luz.exposicao, undefined)
  assert.equal(r.predefinicao.ajustes.cor.vibracao, 12)
  assert.equal(r.predefinicao.ajustes.presenca.clareza, 9)
  assert.throws(
    () => importarLightroom(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])),
    (e) => e.codigo === 'sem-xmp',
  )
})

test('conversão: classes e razões; processo antigo como aproximado; máscaras e recorte ignorados com aviso', () => {
  const { ajustes, relatorio } = converterChaves({
    ProcessVersion: '5.0',
    Exposure: '+0.5',
    Brightness: '+60',
    Contrast: '+35',
    HighlightRecovery: '20',
    FillLight: '10',
    Shadows: '5',
    HasCrop: 'True',
    CropTop: '0.1',
    PaintBasedCorrections: [{ What: 'x' }],
    LensProfileEnable: '1',
    Algo: '1',
  })
  const classe = (chave) => relatorio.itens.find((i) => i.chave === chave)?.classe
  assert.equal(classe('Contrast'), 'aproximado')
  assert.equal(ajustes.luz.contraste, 10)
  assert.equal(ajustes.luz.altas, -20)
  assert.equal(ajustes.luz.sombras, 10)
  assert.equal(classe('HasCrop'), 'ignorado')
  assert.equal(classe('PaintBasedCorrections'), 'ignorado')
  assert.deepEqual(relatorio.desconhecidas, ['Algo'])
  assert.ok(relatorio.avisos.some((a) => a.includes('processo antigo')))
  assert.ok(relatorio.avisos.some((a) => a.includes('recorte')))
  assert.ok(relatorio.avisos.some((a) => a.includes('ajustes locais')))
  assert.ok(relatorio.avisos.some((a) => a.includes('lente')))
  for (const item of relatorio.itens) assert.ok(item.razao && item.razao.length > 3, item.chave)
})

test('HSL: as 8 faixas da Adobe batem com as nossas (Aqua = ciano, Purple = roxo) e o matiz é monótono', () => {
  const { ajustes } = converterChaves({ SaturationAdjustmentAqua: '-20', SaturationAdjustmentPurple: '+30', LuminanceAdjustmentMagenta: '-10' })
  assert.deepEqual(ajustes.misturador.saturacao, [0, 0, 0, 0, -20, 0, 30, 0])
  assert.deepEqual(ajustes.misturador.luz, [0, 0, 0, 0, 0, 0, 0, -10])
  for (let k = 0; k < 8; k++) {
    let antes = -Infinity
    for (let v = -100; v <= 100; v += 10) {
      const m = matizDoMisturador(k, v)
      assert.ok(m >= antes, `faixa ${k} em ${v}`)
      antes = m
    }
    assert.equal(matizDoMisturador(k, 0), 0)
  }
})

test('Blacks2012: a tabela BLACKS é o melhor par (pretos, sombras) do nosso motor para o nível de preto publicado', () => {
  // refaz a calibração do cabeçalho de lightroom-ler.js: a rampa de cinza (−8 a +3,5 EV) com o preto subtraído na luz
  // linear (branco em 1) contra a rampa revelada com o par da tabela; o par da tabela tem de ser o melhor da vizinhança
  const N = 257
  const rampa = (f) => {
    const d = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) d.fill(f(CINZA * 2 ** (-8 + (11.5 * i) / (N - 1))), i * 3, i * 3 + 3)
    return {
      imagem: { largura: N, altura: 1, dados: d },
      latitude: null,
      branco: { kelvin: 6504, tinta: 0 },
      origem: 'imagem',
      exposicaoBase: 0,
      orientacao: 1,
      reduzir: 1,
    }
  }
  const base = rampa((v) => v)
  const codigos = (b, a) => revelar(b, a, { semLocal: true }).dados
  const rms = (x, y) => {
    let s = 0
    for (let i = 0; i < N; i++) s += ((x[i * 3] - y[i * 3]) * 255) ** 2
    return Math.sqrt(s / N)
  }
  // darktable, src/develop/lightroom.c: −100 → +0,020; −50 → +0,005; +50 → −0,005; +100 → −0,010; ±25 = meio caminho
  const niveis = { '-100': 0.02, '-50': 0.005, '-25': 0.0025, 25: -0.0025, 50: -0.005, 100: -0.01 }
  for (const [slider, b] of Object.entries(niveis)) {
    const alvo = codigos(
      rampa((v) => (v - b) / (1 - b)),
      neutro(),
    )
    const [, pretos, sombras] = BLACKS.find((l) => l[0] === Number(slider))
    const erro = (p, s) => {
      const a = neutro()
      a.luz.pretos = Math.max(-100, Math.min(100, p))
      a.luz.sombras = Math.max(-100, Math.min(100, s))
      return rms(codigos(base, a), alvo)
    }
    const daTabela = erro(pretos, sombras)
    assert.ok(daTabela < 3, `${slider}: ${daTabela.toFixed(2)} códigos`)
    for (const [dp, ds] of [
      [5, 0],
      [-5, 0],
      [0, 3],
      [0, -3],
    ]) {
      if (Math.abs(pretos + dp) > 100) continue
      assert.ok(daTabela <= erro(pretos + dp, sombras + ds) + 0.02, `${slider}: (${pretos + dp}, ${sombras + ds}) é melhor`)
    }
  }
})

test('.lrtemplate: só literais (tabela, string, número, booleano); código é recusado', () => {
  const texto = `-- comentário
s = {
  id = "ABC", internalName = "Quente", title = "Quente", type = "Develop",
  value = { settings = { Contrast2012 = 15, Vibrance = -8.5, ConvertToGrayscale = false,
    ToneCurvePV2012 = { 0, 0, 64, 50, 255, 255, }, Name = [[nome
longo]], Esc = "a\\"b\\065" }, uuid = "U1" },
  version = 0,
}`
  const { chaves, meta } = lerLrtemplate(texto)
  assert.equal(meta.nome, 'Quente')
  assert.equal(chaves.Contrast2012, 15)
  assert.equal(chaves.ConvertToGrayscale, false)
  assert.deepEqual(chaves.ToneCurvePV2012, [
    [0, 0],
    [64, 50],
    [255, 255],
  ])
  assert.equal(chaves.Esc, 'a"bA')
  const r = importarLightroom(texto)
  assert.equal(r.predefinicao.ajustes.luz.contraste, 15)
  assert.equal(r.predefinicao.ajustes.cor.vibracao, -8) // −8,5 arredonda para cima, como Math.round
  for (const mau of ['s = { a = os.execute("rm") }', 's = { a = 1 + 2 }', 's = { a = function() end }', 's = { a = "x" .. "y" }']) {
    assert.throws(
      () => analisarLua(mau),
      (e) => e.codigo === 'lua',
      mau,
    )
  }
  assert.throws(
    () => lerLrtemplate('s = { type = "Export", value = {} }'),
    (e) => e.codigo === 'nao-e-revelacao',
  )
  assert.equal(analisarLua('s = { __proto__ = { x = 1 } }').s.x, undefined)
})

test('exportar .xmp: ida e volta pelos estilos da casa devolve os mesmos controles (±1 onde há tabela)', () => {
  const ler1 = (o, c) => c.split('.').reduce((x, k) => x?.[k], o)
  const fora = /^(branco|luz\.exposicao|tela|look|intensidade|efeitos\.desbotar)/
  for (const p of estilosDaCasa()) {
    const { xmp, relatorio } = escreverXmp(p)
    const volta = importarLightroom(xmp)
    assert.equal(volta.relatorio.desconhecidas.length, 0)
    assert.equal(volta.predefinicao.nome, p.nome)
    const a = normalizar(p.ajustes)
    const b = normalizar(volta.predefinicao.ajustes)
    for (const c of Object.keys(CONTROLES)) {
      if (fora.test(c)) continue
      // pretos e vinheta passam por tabela e por inteiro da Adobe: ±1
      const folga = /^(luz\.pretos|luz\.sombras|efeitos\.vinheta)$/.test(c) ? 1 : 0
      assert.ok(Math.abs(ler1(a, c) - ler1(b, c)) <= folga, `${p.nome}: ${c} ${ler1(a, c)} → ${ler1(b, c)}`)
    }
    for (const k of ['matiz', 'saturacao', 'luz'])
      a.misturador[k].forEach((v, i) => assert.ok(Math.abs(v - b.misturador[k][i]) <= 1, `${p.nome}: misturador.${k}.${i}`))
    for (const z of ['sombras', 'meios', 'altas', 'global']) {
      assert.equal(b.tonalizacao[z].saturacao, a.tonalizacao[z].saturacao, `${p.nome}: ${z}`)
      if (a.tonalizacao[z].saturacao) assert.equal(b.tonalizacao[z].matiz, a.tonalizacao[z].matiz)
    }
    assert.deepEqual(b.pb, a.pb)
    for (const canal of ['luz', 'r', 'g', 'b']) {
      a.curva.pontos[canal].forEach(([x, y], i) => {
        assert.ok(Math.abs(x - b.curva.pontos[canal][i][0]) <= 0.5 / 255 && Math.abs(y - b.curva.pontos[canal][i][1]) <= 0.5 / 255)
      })
    }
    // o que não cabe no .xmp é dito
    if (a.efeitos.desbotar) assert.ok(relatorio.deFora.some((d) => d.caminho === 'efeitos.desbotar'))
    if (a.tela.contraste) assert.ok(relatorio.deFora.some((d) => d.caminho === 'tela.contraste'))
  }
})

test('exportar .xmp: inversas das contas e o arquivo bem formado', () => {
  // cada linha da tabela volta para o mesmo Blacks2012 (onde a tabela não satura em ±100) e sem sombra sobrando
  for (const [b, p, s] of BLACKS) {
    const ida = pretosParaAdobe(p, s)
    if (Math.abs(p) < 100) assert.ok(Math.abs(ida.blacks - b) <= 1, `Blacks ${b} → ${ida.blacks}`)
    assert.ok(Math.abs(ida.shadows) <= 1 || Math.abs(p) === 100, `Blacks ${b}: sobrou ${ida.shadows} de sombras`)
  }
  for (let k = 0; k < 8; k++)
    for (const v of [-80, -20, 15, 60]) assert.equal(matizDoMisturador(k, matizParaAdobe(k, matizDoMisturador(k, v))), matizDoMisturador(k, v))
  for (const v of [-100, -40, 30]) {
    const a = vinhetaParaAdobe(v)
    assert.ok(Math.abs((100 * vinhetaEmEv(a)) / 2 - v) <= 2, `vinheta ${v} → ${a}`)
  }
  const { xmp } = escreverXmp({ ...estilosDaCasa()[0], nome: 'Aspas "e" <sinais> & tal' })
  assert.equal(chavesCrsDoXmp(xmp).Name, 'Aspas "e" <sinais> & tal')
  assert.equal(nomeDoArquivoXmp({ nome: 'a/b:c' }), 'a b c.xmp')
  // predefinição que leva o branco exporta o branco
  const fria = escreverXmp({
    ...estilosDaCasa()[0],
    levar: ['branco'],
    ajustes: { ...estilosDaCasa()[0].ajustes, branco: { modo: 'manual', temperatura: 4300, tinta: -6 } },
  })
  assert.equal(fria.chaves.WhiteBalance, 'Custom')
  assert.equal(fria.chaves.Temperature, '4300')
})

// ─────────── aceitação com os arquivos do titular (fora do git) ───────────

const STAGE = 'predefinicoes/Stage Contrast - Sony RAW.xmp'

test('titular: "Stage Contrast" importa com todas as chaves classificadas e passa no qc', async (t) => {
  if (!precisaDoTitular(t, STAGE)) return
  const r = importarLightroom(await lerDoTitular(STAGE))
  assert.deepEqual(r.relatorio.desconhecidas, [])
  const chaves = chavesCrsDoXmp(new TextDecoder().decode(await lerDoTitular(STAGE)))
  for (const chave of Object.keys(chaves))
    assert.ok(
      r.relatorio.itens.some((i) => i.chave === chave),
      chave,
    )
  const { exato, aproximado, ignorado } = r.relatorio.resumo
  assert.equal(exato + aproximado + ignorado, r.relatorio.itens.length)
  assert.equal(r.predefinicao.nome, 'Stage Contrast - Sony RAW')
  const controle = qc(r.predefinicao)
  assert.ok(controle.aprovado, controle.problemas.map((p) => p.codigo).join(', '))
  t.diagnostic(`Stage Contrast: ${exato} exato, ${aproximado} aproximado, ${ignorado} ignorado`)
})

test('titular: os .lrtemplate importam, sem chave desconhecida', async (t) => {
  const pasta = 'predefinicoes'
  if (!precisaDoTitular(t, pasta)) return
  const arquivos = readdirSync(caminhoDoTitular(pasta)).filter((f) => f.endsWith('.lrtemplate'))
  if (!arquivos.length) return t.skip('sem .lrtemplate na pasta do titular')
  for (const [k, f] of arquivos.entries()) {
    const r = importarLightroom(await lerDoTitular(`${pasta}/${f}`))
    assert.deepEqual(r.relatorio.desconhecidas, [], f)
    assert.ok(r.relatorio.itens.length > 20, f)
    t.diagnostic(
      `${f.replace(/-ADOBEDOWNLOAD.*$/, '')}: ${JSON.stringify(r.relatorio.resumo)}; qc ${qc(r.predefinicao).aprovado ? 'aprovado' : qc(r.predefinicao).problemas.map((p) => p.codigo)}`,
    )
  }
})

test('titular: os JPEG finais do Lightroom têm o XMP lido, com as chaves do inventário classificadas', async (t) => {
  const pasta = 'ensaio-lr/final'
  if (!precisaDoTitular(t, pasta) || !precisaDoTitular(t, 'INVENTARIO.json')) return
  const arquivos = readdirSync(caminhoDoTitular(pasta)).filter((f) => /\.jpe?g$/i.test(f))
  const vistas = new Set()
  const resumo = { exato: 0, aproximado: 0, ignorado: 0 }
  for (const f of arquivos) {
    const r = importarLightroom(await lerDoTitular(`${pasta}/${f}`))
    assert.deepEqual(r.relatorio.desconhecidas, [], f)
    for (const i of r.relatorio.itens) vistas.add(i.chave.split('.')[0])
    for (const k of Object.keys(resumo)) resumo[k] += r.relatorio.resumo[k]
  }
  const inventario = JSON.parse(await readFile(caminhoDoTitular('INVENTARIO.json'), 'utf8'))
  const doInventario = Object.keys(inventario.resumoCrs?.ensaioLr?.chaves ?? {}).map((c) => c.replace(/ \([a-z]+\)$/, ''))
  for (const chave of doInventario) assert.ok(vistas.has(chave), `${chave} não foi classificada`)
  t.diagnostic(`${arquivos.length} JPEG: ${JSON.stringify(resumo)}; ${doInventario.length} chaves do inventário classificadas`)
})
