// Perfis do Lightroom (src/estilo/perfil-adobe.js, src/estilo/inflar.js e a importação em lightroom-ler.js): a tabela
// embutida (crs:Table_<MD5>) decodificada e reconstruída a partir do TEXTO, e a aproximação nossa dos perfis padrão da
// Adobe pelo nome. A prova do formato num arquivo real de terceiros (sem licença para ir ao git) roda quando ele está
// em .amostras/perfis/ (fora do git; ver o relatório da importação).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { inflar, inflarCru } from '../src/estilo/inflar.js'
import { deBase85, lerTabela, md5, paraBase85, PERFIS_ADOBE, perfilAdobe, tabelaParaLut } from '../src/estilo/perfil-adobe.js'
import { ErroLightroom, importarLightroom } from '../src/estilo/lightroom-ler.js'
import { aplicarLut, descompactar } from '../src/estilo/look.js'
import { precisaDoTitular, lerDoTitular } from './apoio-estilo.js'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// O fluxo de uma tabela RGB 3D, escrito pelo formato (docs/estudo/predefinicoes.md, 3.2): u32 tipo, versão, dimensões,
// divisões; deltas u16 sobre a rampa neutra, vermelho por fora; primárias, gama, gamut; f64 mínimo e máximo.
function fluxoRgb(divisoes, funcao, { primarias = 0, gama = 1, gamut = 0 } = {}) {
  const nos = divisoes ** 3
  const b = Buffer.alloc(16 + nos * 6 + 12 + 16)
  let p = 0
  for (const v of [1, 1, 3, divisoes]) p = b.writeUInt32LE(v, p)
  const nop = Array.from({ length: divisoes }, (_, i) => Math.floor((i * 0xffff + (divisoes >> 1)) / (divisoes - 1)))
  const saida = [0, 0, 0]
  for (let r = 0; r < divisoes; r++)
    for (let g = 0; g < divisoes; g++)
      for (let bl = 0; bl < divisoes; bl++) {
        funcao(nop[r] / 65535, nop[g] / 65535, nop[bl] / 65535, saida)
        const alvo = saida.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 65535))
        const base = [nop[r], nop[g], nop[bl]]
        for (let c = 0; c < 3; c++) p = b.writeUInt16LE((alvo[c] - base[c]) & 0xffff, p)
      }
  for (const v of [primarias, gama, gamut]) p = b.writeUInt32LE(v, p)
  p = b.writeDoubleLE(1, p)
  b.writeDoubleLE(1, p)
  return new Uint8Array(b)
}

// fluxo → texto do atributo: tamanho (u32 LE) + zlib (o do Node, um compactador independente) em base85 da Adobe
function textoDaTabela(fluxo) {
  const z = deflateSync(Buffer.from(fluxo), { level: 9 })
  const bytes = new Uint8Array(4 + z.length)
  new DataView(bytes.buffer).setUint32(0, fluxo.length, true)
  bytes.set(z, 4)
  return paraBase85(bytes)
}

const perfilXmp = (atributos) => `<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
   crs:PresetType="Look" crs:Name="Perfil de teste" crs:Version="15.0" crs:ProcessVersion="11.0" ${atributos}/>
 </rdf:RDF>
</x:xmpmeta>`

test('base85 da Adobe: vetores do formato, ida e volta, grupo final curto', () => {
  // o primeiro dígito é o menos significativo: 1 = "1" seguido de quatro "0"; 85 = "01"…; 0xFFFFFFFF em 5 dígitos
  assert.deepEqual([...deBase85('10000')], [1, 0, 0, 0])
  assert.deepEqual([...deBase85('01000')], [85, 0, 0, 0])
  assert.deepEqual([...deBase85(paraBase85(new Uint8Array([255, 255, 255, 255])))], [255, 255, 255, 255])
  // grupo final de k dígitos rende k − 1 bytes; caractere fora do alfabeto (espaço, quebra) é ignorado
  assert.deepEqual([...deBase85('10')], [1])
  assert.deepEqual([...deBase85('1 0\n000')], [1, 0, 0, 0])
  const acaso = Uint8Array.from({ length: 1003 }, (_, i) => (i * 131 + 7) & 255)
  assert.deepEqual([...deBase85(paraBase85(acaso))], [...acaso])
})

test('MD5: vetores da RFC 1321', () => {
  const t = (s) => md5(new TextEncoder().encode(s))
  assert.equal(t(''), 'D41D8CD98F00B204E9800998ECF8427E')
  assert.equal(t('abc'), '900150983CD24FB0D6963F7D28E17F72')
  assert.equal(t('message digest'), 'F96B697D7CB7938D525A2F31AAF161D0')
  assert.equal(t('12345678901234567890123456789012345678901234567890123456789012345678901234567890'), '57EDF4A22BE3C955AC49DA2E2107B67A')
})

test('zlib: o nosso descompactador devolve o que o do Node compactou (guardado, fixo, dinâmico)', () => {
  for (const n of [0, 1, 300, 70000]) {
    const dados = Uint8Array.from({ length: n }, (_, i) => (i * 7 + ((i >> 5) % 13) * (i % 3)) & 255)
    for (const nivel of [0, 1, 6, 9]) assert.deepEqual([...inflar(new Uint8Array(deflateSync(Buffer.from(dados), { level: nivel })))], [...dados], `${n} ${nivel}`)
  }
  assert.throws(() => inflar(new Uint8Array([0x78, 0x9c, 1, 2, 3, 4])))
  assert.equal(inflarCru(new Uint8Array([3, 0])).length, 0)
})

test('tabela RGB: reconstruída a partir do texto, com o MD5 do digest, e aplicada como look exato', () => {
  // a função conhecida: troca de canais (r, g, b) → (g, b, r) e escurece o azul pela metade. É afim por partes de
  // grau 1, então a interpolação tetraédrica a reproduz sem erro nos nós e entre eles
  const funcao = (r, g, b, s) => {
    s[0] = g
    s[1] = b
    s[2] = 0.5 * r
    return s
  }
  const fluxo = fluxoRgb(9, funcao)
  const digest = md5(fluxo)
  const texto = textoDaTabela(fluxo)
  const tabela = lerTabela(texto, digest)
  assert.equal(tabela.confere, true)
  assert.equal(tabela.tipo, 'rgb')
  assert.equal(tabela.divisoes, 9)
  assert.equal(tabela.primarias, 'srgb')
  assert.equal(tabela.gama, 'srgb')
  // a importação: perfil (.xmp com PresetType="Look") → predefinição com o look
  const r = importarLightroom(perfilXmp(`crs:RGBTable="${digest}" crs:Table_${digest}="${texto}"`))
  const item = r.relatorio.itens.find((i) => i.chave === 'RGBTable')
  assert.equal(item.classe, 'exato', item.razao)
  assert.equal(r.relatorio.itens.find((i) => i.chave === `Table_${digest}`).classe, 'exato')
  assert.ok(r.predefinicao.look, 'sem look')
  const f = aplicarLut(descompactar(r.predefinicao.look))
  const s = [0, 0, 0]
  const e = [0, 0, 0]
  let pior = 0
  for (let k = 0; k < 500; k++) {
    const c = [(k * 0.618) % 1, (k * 0.414) % 1, (k * 0.732) % 1]
    f(c[0], c[1], c[2], s)
    funcao(c[0], c[1], c[2], e)
    pior = Math.max(pior, ...s.map((x, j) => Math.abs(x - e[j])))
  }
  // limite escrito: 1/255 (medido: o arredondamento de 16 bits da tabela e do look, ~2e-5)
  assert.ok(pior < 1 / 255, `pior ${pior}`)
  // a mesma tabela com o digest trocado não entra (e o perfil, sem mais nada, é recusado dizendo por quê)
  assert.throws(
    () => importarLightroom(perfilXmp(`crs:RGBTable="${'0'.repeat(32)}" crs:Table_${'0'.repeat(32)}="${texto}"`)),
    (e) => e instanceof ErroLightroom && e.codigo === 'e-perfil' && /MD5/.test(e.message),
  )
})

test('tabela RGB em P3 com gama 2,2: a conversão de primárias e de gama não desvia o cinza', () => {
  // identidade numa tabela em P3 e gama 2,2: a ida e a volta pelas primárias e pela gama dão a identidade de novo
  const fluxo = fluxoRgb(17, (r, g, b, s) => ((s[0] = r), (s[1] = g), (s[2] = b), s), { primarias: 3, gama: 3 })
  const t = lerTabela(textoDaTabela(fluxo), md5(fluxo))
  const { lut } = tabelaParaLut(t)
  const f = aplicarLut(lut)
  const s = [0, 0, 0]
  let pior = 0
  for (let v = 0; v <= 1; v += 0.05) {
    f(v, v, v, s)
    pior = Math.max(pior, ...s.map((x) => Math.abs(x - v)))
  }
  assert.ok(pior < 2 / 255, `pior ${pior}`)
})

test('perfis padrão da Adobe pelo nome: aproximação nossa, dita como aproximada', () => {
  assert.equal(perfilAdobe(' adobe  vivid '), 'Adobe Vivid')
  assert.equal(perfilAdobe('Adobe Standard Linear'), null)
  for (const nome of ['Adobe Color', 'Adobe Standard', 'Adobe Portrait', 'Adobe Landscape', 'Adobe Vivid', 'Adobe Neutral', 'Adobe Monochrome']) {
    assert.ok(PERFIS_ADOBE[nome], nome)
  }
  const sidecar = (perfil) => `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/" crs:Version="15.0" crs:ProcessVersion="11.0"
   crs:CameraProfile="${perfil}" crs:Contrast2012="+10"/></rdf:RDF></x:xmpmeta>`
  const vivido = importarLightroom(sidecar('Adobe Vivid'))
  const item = vivido.relatorio.itens.find((i) => i.chave === 'CameraProfile')
  assert.equal(item.classe, 'aproximado')
  assert.match(item.razao, /aproximação|direção/)
  assert.match(item.razao, /\.cube|referência/)
  // o que o arquivo trouxe fica; o perfil soma o dele onde o arquivo não mexeu
  assert.equal(vivido.predefinicao.ajustes.luz.contraste, 10)
  assert.ok(vivido.predefinicao.ajustes.cor.vibracao > 0)
  const mono = importarLightroom(sidecar('Adobe Monochrome'))
  assert.equal(mono.predefinicao.ajustes.pb.ativo, true)
  const cor = importarLightroom(sidecar('Adobe Color'))
  assert.equal(cor.predefinicao.ajustes.curva.pontos.luz.length, 7)
  // Adobe Standard: a base; nada muda
  const padrao = importarLightroom(sidecar('Adobe Standard'))
  assert.equal(padrao.relatorio.itens.find((i) => i.chave === 'CameraProfile').classe, 'ignorado')
  // perfil que não traz nada que dê para ler continua recusado, com o que fazer
  assert.throws(
    () => importarLightroom(perfilXmp('crs:RGBTable="0123456789ABCDEF0123456789ABCDEF"')),
    (e) => e instanceof ErroLightroom && e.codigo === 'e-perfil' && /\.cube/.test(e.message),
  )
})

test('perfil real de terceiros (fora do git): o MD5 do fluxo decodificado é o digest do arquivo', (t) => {
  const arquivo = path.join(raiz, '.amostras', 'perfis', 'Astia.xmp')
  if (!existsSync(arquivo)) return t.skip('sem .amostras/perfis/Astia.xmp (perfil de terceiros, sem licença para o git)')
  const r = importarLightroom(readFileSync(arquivo, 'utf8'))
  const tabela = r.relatorio.itens.find((i) => /^Table_/.test(i.chave))
  assert.equal(tabela.classe, 'exato', tabela.razao)
  assert.match(tabela.razao, /MD5 confere/)
  assert.ok(r.predefinicao.look)
  assert.equal(r.relatorio.itens.find((i) => i.chave === 'RGBTable').classe, 'aproximado') // base "Adobe Standard Linear"
})

test('titular: o "Adobe Color" dos JPEG do ensaio sai como aproximação, com a curva real', async (t) => {
  const relativo = 'ensaio-lr/final/exp-003.jpg'
  if (!precisaDoTitular(t, relativo)) return
  const r = importarLightroom(await lerDoTitular(relativo))
  const item = r.relatorio.itens.find((i) => i.chave === 'Look.Parameters.LookTable')
  assert.equal(item.classe, 'aproximado')
  assert.match(item.razao, /Adobe Color/)
  assert.equal(r.predefinicao.ajustes.curva.pontos.luz.length, 7)
})
