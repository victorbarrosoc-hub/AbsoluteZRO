// EXIF escrito (relido pelo leitor da biblioteca, src/raw/exif.js) e XMP: o arquivo ao lado do RAW no formato do
// Lightroom Classic e do Capture One, a leitura do que já existe e a atualização que não destrói nada.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { lerCamera, lerExif } from '../src/raw/exif.js'
import { METADADOS, camposExif, montarExif, racional } from '../src/exportar/exif-escrever.js'
import { codificarJpeg, embutirNoJpeg } from '../src/exportar/jpeg.js'
import { lerBlocoTiff, valorDe } from '../src/exportar/tiff.js'
import { CORES, NAMESPACE_DOS_AJUSTES, ROTULOS, atualizarSidecarXmp, corDoRotulo, lerSidecarXmp, pacoteXmp, rotuloDe, sidecarXmp } from '../src/exportar/xmp.js'
import { abrirChromium, semChromium } from './apoio-exportar.js'

const CONTRATO = {
  fabricante: 'Fabricante de Teste',
  modelo: 'Modelo Z 9',
  data: '2026-09-17T18:45:03',
  subsegundo: 0.37,
  iso: 6400,
  tempo: 1 / 250,
  abertura: 2.8,
  focal: 35,
  lente: 'Lente 24-70mm f/2.8',
  orientacao: 6, // a câmera estava de lado; a exportação entrega de pé
}
const OPCOES = { software: 'Programa de teste 1.0', autor: 'Autora de Teste', direitos: '(c) 2026 Autora de Teste', largura: 4000, altura: 6000, espaco: 'p3', quando: '2026-11-13T10:00:00' }
const LOCAL = { latitude: -23.550519, longitude: -46.633308, altitude: 760.5 }

const noJpeg = (exif) => embutirNoJpeg(codificarJpeg({ largura: 8, altura: 8, rgb8: new Uint8Array(192).fill(90) }), { exif })
const tagsDe = (diretorio) => diretorio.entradas.map((e) => e.tag)

test('EXIF: o bloco escrito é relido pelo leitor da biblioteca, campo a campo, com a orientação normalizada', () => {
  const bloco = montarExif(CONTRATO, OPCOES)
  assert.deepEqual(Array.from(bloco.subarray(0, 8)), [0x49, 0x49, 42, 0, 8, 0, 0, 0], 'bloco TIFF de ordem pequena')
  const jpeg = noJpeg(bloco)
  assert.deepEqual(lerExif(jpeg), {
    orientacao: 1,
    tempo: 1 / 250,
    abertura: 2.8,
    iso: 6400,
    focal: 35,
    lente: 'Lente 24-70mm f/2.8',
    data: '2026-09-17T18:45:03',
    subsegundo: 0.37,
  })
  assert.deepEqual(lerCamera(jpeg), { fabricante: 'Fabricante de Teste', modelo: 'Modelo Z 9' })
  // o bloco sozinho (como vai no eXIf do PNG) também é lido
  assert.equal(lerExif(bloco).iso, 6400)
})

test('EXIF: estrutura válida (EXIF 2.32) — tags obrigatórias do JPEG, tipos e ordem', () => {
  const { diretorio } = lerBlocoTiff(montarExif(CONTRATO, OPCOES))
  const exif = diretorio.filhos[0x8769]
  for (const d of [diretorio, exif]) assert.deepEqual(tagsDe(d), [...tagsDe(d)].sort((a, b) => a - b), 'tags em ordem crescente')
  // diretório principal
  assert.equal(valorDe(diretorio, 0x0112), 1, 'Orientation = 1')
  assert.deepEqual(valorDe(diretorio, 0x011a), [72, 1])
  assert.deepEqual(valorDe(diretorio, 0x011b), [72, 1])
  assert.equal(valorDe(diretorio, 0x0128), 2)
  assert.equal(valorDe(diretorio, 0x0213), 1, 'YCbCrPositioning centrada')
  assert.equal(valorDe(diretorio, 0x0131), 'Programa de teste 1.0')
  assert.equal(valorDe(diretorio, 0x0132), '2026:11:13 10:00:00')
  assert.equal(valorDe(diretorio, 0x013b), 'Autora de Teste')
  assert.equal(valorDe(diretorio, 0x8298), '(c) 2026 Autora de Teste')
  // ExifIFD
  assert.deepEqual(valorDe(exif, 0x829a), [1, 250])
  assert.deepEqual(valorDe(exif, 0x829d), [14, 5])
  assert.equal(valorDe(exif, 0x8827), 6400)
  assert.equal(String.fromCharCode(...valorDe(exif, 0x9000)), '0232')
  assert.equal(valorDe(exif, 0x9003), '2026:09:17 18:45:03')
  assert.equal(valorDe(exif, 0x9004), '2026:09:17 18:45:03')
  assert.deepEqual(Array.from(valorDe(exif, 0x9101)), [1, 2, 3, 0])
  assert.deepEqual(valorDe(exif, 0x920a), [35, 1])
  assert.equal(valorDe(exif, 0x9291), '37')
  assert.equal(String.fromCharCode(...valorDe(exif, 0xa000)), '0100')
  assert.equal(valorDe(exif, 0xa001), 0xffff, 'Display P3 não é sRGB: "não calibrado", vale o perfil ICC')
  assert.equal(valorDe(exif, 0xa002), 4000)
  assert.equal(valorDe(exif, 0xa003), 6000)
  assert.equal(valorDe(exif, 0xa434), 'Lente 24-70mm f/2.8')
  // nada de miniatura (segundo diretório), marcas do fabricante ou número de série
  assert.equal(diretorio.proximo, 0)
  for (const tag of [0x927c, 0xa431, 0xa435, 0x9286]) assert.equal(valorDe(exif, tag), undefined)
  // sRGB grava ColorSpace = 1; TIFF e PNG não levam as tags que só valem para JPEG
  assert.equal(valorDe(lerBlocoTiff(montarExif(CONTRATO, { ...OPCOES, espaco: 'srgb' })).diretorio.filhos[0x8769], 0xa001), 1)
  const tiff = lerBlocoTiff(montarExif(CONTRATO, { ...OPCOES, formato: 'tiff' })).diretorio
  assert.equal(valorDe(tiff, 0x0213), undefined)
  assert.equal(valorDe(tiff.filhos[0x8769], 0x9101), undefined)
})

test('EXIF: sem GPS por padrão; o local só entra com "todos" e com o local entregue', () => {
  for (const metadados of [undefined, 'sem-local', 'so-direitos']) {
    const { diretorio } = lerBlocoTiff(montarExif(CONTRATO, { ...OPCOES, metadados, local: LOCAL }))
    assert.equal(valorDe(diretorio, 0x8825), undefined, `${metadados}: sem ponteiro de GPS`)
    assert.equal(diretorio.filhos[0x8825], undefined)
  }
  assert.equal(lerBlocoTiff(montarExif(CONTRATO, { ...OPCOES, metadados: 'todos' })).diretorio.filhos[0x8825], undefined, '"todos" sem local não inventa GPS')

  const gps = lerBlocoTiff(montarExif(CONTRATO, { ...OPCOES, metadados: 'todos', local: LOCAL })).diretorio.filhos[0x8825]
  assert.ok(gps, 'GPS presente')
  assert.deepEqual(Array.from(valorDe(gps, 0)), [2, 3, 0, 0])
  assert.equal(valorDe(gps, 1), 'S')
  assert.equal(valorDe(gps, 3), 'W')
  const graus = (tag) => valorDe(gps, tag, { todos: true }).reduce((s, [n, d], i) => s + n / d / 60 ** i, 0)
  assert.ok(Math.abs(graus(2) - 23.550519) < 1e-7, `latitude ${graus(2)}`)
  assert.ok(Math.abs(graus(4) - 46.633308) < 1e-7, `longitude ${graus(4)}`)
  assert.deepEqual(Array.from(valorDe(gps, 5)), [0])
  assert.deepEqual(valorDe(gps, 6), [76050, 100])
  // norte e leste, e local inválido é ignorado
  const ne = lerBlocoTiff(montarExif({}, { metadados: 'todos', local: { latitude: 59.999999999, longitude: 10.75 } })).diretorio.filhos[0x8825]
  assert.equal(valorDe(ne, 1), 'N')
  assert.equal(valorDe(ne, 3), 'E')
  assert.deepEqual(valorDe(ne, 2, { todos: true }), [[60, 1], [0, 1], [0, 10000]], 'o arredondamento dos segundos passa para minutos e graus')
  assert.equal(lerBlocoTiff(montarExif({}, { metadados: 'todos', local: { latitude: 120, longitude: 0 } })).diretorio.filhos[0x8825], undefined)
})

test('EXIF: políticas de metadados — só direitos, nenhum, e o programa só quando vem de fora', () => {
  assert.deepEqual(METADADOS, ['todos', 'sem-local', 'so-direitos', 'nenhum'])
  assert.equal(montarExif(CONTRATO, { ...OPCOES, metadados: 'nenhum' }), null)
  assert.equal(camposExif(CONTRATO, { metadados: 'nenhum' }), null)
  assert.throws(() => montarExif(CONTRATO, { metadados: 'tudo' }), /desconhecida/)

  const { diretorio } = lerBlocoTiff(montarExif(CONTRATO, { ...OPCOES, metadados: 'so-direitos', local: LOCAL }))
  assert.equal(valorDe(diretorio, 0x013b), 'Autora de Teste')
  assert.equal(valorDe(diretorio, 0x8298), '(c) 2026 Autora de Teste')
  // nada de câmera, programa, datas ou exposição
  for (const tag of [0x010f, 0x0110, 0x0131, 0x0132]) assert.equal(valorDe(diretorio, tag), undefined, `tag ${tag.toString(16)}`)
  for (const tag of [0x829a, 0x829d, 0x8827, 0x9003, 0x9004, 0x920a, 0x9291, 0xa434]) assert.equal(valorDe(diretorio.filhos[0x8769], tag), undefined)
  assert.deepEqual(lerExif(noJpeg(montarExif(CONTRATO, { ...OPCOES, metadados: 'so-direitos' }))), { orientacao: 1 })
  // "só direitos" sem autor nem direitos: não há o que gravar
  assert.equal(montarExif(CONTRATO, { metadados: 'so-direitos' }), null)

  // o nome do programa não mora neste módulo: sem `software`, não há tag Software
  const semPrograma = lerBlocoTiff(montarExif(CONTRATO, {})).diretorio
  assert.equal(valorDe(semPrograma, 0x0131), undefined)
  assert.equal(valorDe(semPrograma, 0x0132), undefined, 'sem `quando`, sem DateTime')
  assert.equal(valorDe(semPrograma, 0x013b), undefined)
})

test('EXIF: campos ausentes não viram tag; ISO alto, tempos longos e texto com acento', () => {
  // exif vazio: só o esqueleto
  const vazio = lerBlocoTiff(montarExif({}, {})).diretorio
  assert.deepEqual(tagsDe(vazio), [0x0112, 0x011a, 0x011b, 0x0128, 0x0213, 0x8769])
  assert.deepEqual(tagsDe(vazio.filhos[0x8769]), [0x9000, 0x9101, 0xa000, 0xa001])
  assert.deepEqual(lerExif(noJpeg(montarExif({}, {}))), { orientacao: 1 })
  // valores inválidos são ignorados, não gravados como zero
  const torto = lerExif(noJpeg(montarExif({ iso: NaN, tempo: -1, abertura: 0, focal: 'x', data: 'ontem', lente: '   ', subsegundo: 2 }, {})))
  assert.deepEqual(torto, { orientacao: 1 })

  // ISO acima de 65535: o campo curto satura e o valor de verdade vai em ISOSpeed, que o leitor prefere
  const alto = montarExif({ iso: 204800 }, {})
  const exif = lerBlocoTiff(alto).diretorio.filhos[0x8769]
  assert.equal(valorDe(exif, 0x8827), 65535)
  assert.equal(valorDe(exif, 0x8830), 3)
  assert.equal(valorDe(exif, 0x8833), 204800)
  assert.equal(lerExif(noJpeg(alto)).iso, 204800)

  for (const tempo of [30, 2.5, 1 / 3, 1 / 8000, 0.3, 1 / 60]) {
    const lido = lerExif(noJpeg(montarExif({ tempo }, {}))).tempo
    assert.ok(Math.abs(lido - tempo) <= tempo * 1e-6, `tempo ${tempo} → ${lido}`)
  }
  assert.deepEqual(racional(1 / 250), [1, 250])
  assert.deepEqual(racional(2.5), [5, 2])
  assert.deepEqual(racional(30), [30, 1])
  assert.deepEqual(racional(0), [0, 1])
  assert.deepEqual(racional(1.4), [7, 5])
  const [n, d] = racional(Math.PI)
  assert.ok(d <= 1000000 && Math.abs(n / d - Math.PI) < 1e-9)
  assert.throws(() => racional(-1))

  // subsegundo: até milésimos, sem zeros à direita
  const sub = (v) => valorDe(lerBlocoTiff(montarExif({ data: '2026-01-01T00:00:00', subsegundo: v }, {})).diretorio.filhos[0x8769], 0x9291)
  assert.equal(sub(0.5), '5')
  assert.equal(sub(0.05), '05')
  assert.equal(sub(0.123456), '123')
  assert.equal(sub(0), '0')
  assert.equal(sub(0.9999), '999')

  // acento vai em UTF-8 e volta inteiro
  const acento = lerBlocoTiff(montarExif({}, { autor: 'João Conceição', direitos: '© João' })).diretorio
  assert.equal(valorDe(acento, 0x013b), 'João Conceição')
  assert.equal(valorDe(acento, 0x8298), '© João')
})

// ─────────── XMP ───────────

test('XMP: arquivo ao lado do RAW no formato do Lightroom — Rating 0..5, Label no idioma, pick 1 / 0 / −1', () => {
  const xmp = sidecarXmp({ estrelas: 3, cor: 'vermelho', marca: 'escolhida' })
  assert.match(xmp, /^<x:xmpmeta xmlns:x="adobe:ns:meta\/">/)
  assert.match(xmp, /<rdf:RDF xmlns:rdf="http:\/\/www\.w3\.org\/1999\/02\/22-rdf-syntax-ns#">/)
  assert.match(xmp, /<rdf:Description rdf:about=""/)
  assert.match(xmp, /xmlns:xmp="http:\/\/ns\.adobe\.com\/xap\/1\.0\/"/)
  assert.match(xmp, /xmlns:xmpDM="http:\/\/ns\.adobe\.com\/xmp\/1\.0\/DynamicMedia\/"/)
  assert.match(xmp, /xmp:Rating="3"/)
  assert.match(xmp, /xmp:Label="Vermelho"/)
  assert.match(xmp, /xmpDM:pick="1"/)
  assert.match(xmp, /xmpDM:good="true"/)
  assert.ok(!xmp.includes('<?xpacket'), 'arquivo solto não leva invólucro de pacote')
  assert.match(sidecarXmp({ estrelas: 3, cor: 'vermelho', idioma: 'en' }), /xmp:Label="Red"/)
  assert.match(sidecarXmp({ marca: 'rejeitada' }), /xmpDM:pick="-1"/)
  assert.match(sidecarXmp({ marca: 'rejeitada' }), /xmpDM:good="false"/)
  assert.match(sidecarXmp({ marca: null }), /xmpDM:pick="0"/)
  assert.ok(!sidecarXmp({ marca: null }).includes('xmpDM:good'))
  // só entra o que foi passado
  const soNota = sidecarXmp({ estrelas: 0 })
  assert.match(soNota, /xmp:Rating="0"/)
  assert.ok(!soNota.includes('Label') && !soNota.includes('pick') && !soNota.includes('xmpDM'))
  assert.throws(() => sidecarXmp({ cor: 'laranja' }), /cor desconhecida/)
  assert.throws(() => sidecarXmp({ cor: 'azul', idioma: 'fr' }), /idioma/)
})

test('XMP: tabela de etiquetas em português e inglês, nos dois sentidos', () => {
  assert.deepEqual(CORES, ['vermelho', 'amarelo', 'verde', 'azul', 'roxo'])
  assert.deepEqual(Object.values(ROTULOS.pt), ['Vermelho', 'Amarelo', 'Verde', 'Azul', 'Roxo'])
  assert.deepEqual(Object.values(ROTULOS.en), ['Red', 'Yellow', 'Green', 'Blue', 'Purple'])
  for (const idioma of ['pt', 'en']) {
    for (const cor of CORES) assert.deepEqual(corDoRotulo(rotuloDe(cor, idioma)), { cor, idioma })
  }
  assert.deepEqual(corDoRotulo('  red '), { cor: 'vermelho', idioma: 'en' })
  assert.equal(corDoRotulo('Para revisar'), null)
  assert.equal(corDoRotulo(''), null)
})

test('XMP: nunca Rating = −1, em nenhuma combinação de estrelas, cor e marca', () => {
  for (const estrelas of [0, 1, 2, 3, 4, 5, -1, -5, 9, 2.6, 'x', null, undefined]) {
    for (const cor of [null, ...CORES]) {
      for (const marca of ['escolhida', 'rejeitada', null]) {
        for (const texto of [sidecarXmp({ estrelas, cor, marca }), pacoteXmp({ estrelas, cor, marca }), atualizarSidecarXmp('', { estrelas, cor, marca })]) {
          const nota = /xmp:Rating="([^"]*)"/.exec(texto)?.[1]
          if (estrelas === null || estrelas === undefined) assert.equal(nota, undefined)
          else assert.ok(['0', '1', '2', '3', '4', '5'].includes(nota), `Rating="${nota}" para estrelas ${estrelas}`)
          assert.ok(!/Rating="-/.test(texto))
          // a rejeição vai na bandeira, e a nota da foto rejeitada continua sendo a nota
          assert.equal(/xmpDM:pick="([^"]*)"/.exec(texto)[1], marca === 'escolhida' ? '1' : marca === 'rejeitada' ? '-1' : '0')
        }
      }
    }
  }
})

test('XMP: o que se escreve se lê de volta, em todas as combinações', () => {
  for (const estrelas of [0, 1, 2, 3, 4, 5]) {
    for (const cor of [null, ...CORES]) {
      for (const marca of ['escolhida', 'rejeitada', null]) {
        for (const idioma of ['pt', 'en']) {
          const lido = lerSidecarXmp(sidecarXmp({ estrelas, cor, marca, idioma }))
          assert.equal(lido.estrelas, estrelas)
          assert.equal(lido.cor, cor)
          assert.equal(lido.marca, marca)
          assert.deepEqual(lido.tem, { estrelas: true, cor: cor !== null, marca: true })
          assert.equal(lido.rotulo, cor ? ROTULOS[idioma][cor] : null)
        }
      }
    }
  }
  // ajustes do motor em JSON, com caracteres que o XML precisa escapar
  const ajustes = { versao: 1, luz: { exposicao: 0.35, contraste: -12 }, nota: 'a "b" <c> & \'d\' é\nlinha', lista: [1, 2, 3] }
  const xmp = sidecarXmp({ estrelas: 2, ajustes })
  assert.ok(xmp.includes(`xmlns:zrofoto="${NAMESPACE_DOS_AJUSTES}"`))
  assert.deepEqual(lerSidecarXmp(xmp).ajustes, ajustes)
  assert.equal(lerSidecarXmp(sidecarXmp({ estrelas: 2 })).ajustes, null)
  // autor, direitos e programa no pacote embutido
  const pacote = pacoteXmp({ estrelas: 5, autor: 'João & Maria', direitos: '© 2026 <João>', software: 'Programa "X"' })
  assert.match(pacote, /^<\?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"\?>\n<x:xmpmeta/)
  assert.match(pacote, /<\?xpacket end="r"\?>$/)
  assert.match(pacote, /<dc:creator><rdf:Seq><rdf:li>João &amp; Maria<\/rdf:li><\/rdf:Seq><\/dc:creator>/)
  assert.match(pacote, /<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">© 2026 &lt;João&gt;<\/rdf:li><\/rdf:Alt><\/dc:rights>/)
  assert.match(pacote, /xmp:CreatorTool="Programa &quot;X&quot;"/)
  assert.equal(lerSidecarXmp(pacote).estrelas, 5)
})

// Um .xmp como o Lightroom Classic grava ao lado do RAW: ajustes do Camera Raw, palavras-chave, histórico.
const DO_LIGHTROOM = `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        ">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
    xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"
    xmlns:stEvt="http://ns.adobe.com/xap/1.0/sType/ResourceEvent#"
   xmp:Rating="2"
   xmp:Label="Yellow"
   xmp:ModifyDate="2026-03-01T10:00:00-03:00"
   crs:Version="16.2"
   crs:Exposure2012="+0.35"
   crs:Contrast2012="-12"
   crs:HasSettings="True">
   <dc:subject>
    <rdf:Bag>
     <rdf:li>casamento</rdf:li>
     <rdf:li>família &amp; amigos</rdf:li>
    </rdf:Bag>
   </dc:subject>
   <xmpMM:History>
    <rdf:Seq>
     <rdf:li stEvt:action="saved" stEvt:when="2026-03-01T10:00:00-03:00"/>
    </rdf:Seq>
   </xmpMM:History>
   <crs:ToneCurvePV2012>
    <rdf:Seq>
     <rdf:li>0, 0</rdf:li>
     <rdf:li>255, 255</rdf:li>
    </rdf:Seq>
   </crs:ToneCurvePV2012>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
`

test('XMP: lê as decisões que já existem — Lightroom, forma de elemento, outro prefixo, Bridge e Capture One', () => {
  assert.deepEqual(lerSidecarXmp(DO_LIGHTROOM), {
    estrelas: 2,
    cor: 'amarelo',
    rotulo: 'Yellow',
    marca: null,
    tem: { estrelas: true, cor: true, marca: false },
    ajustes: null,
  })
  // propriedades como elementos, com outro prefixo para o mesmo namespace e invólucro de pacote
  const elementos = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><r:RDF xmlns:r="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<r:Description r:about="" xmlns:xap="http://ns.adobe.com/xap/1.0/" xmlns:dm="http://ns.adobe.com/xmp/1.0/DynamicMedia/">
 <!-- comentário com <xap:Rating>5</xap:Rating> que não vale -->
 <xap:Rating>4</xap:Rating>
 <xap:Label>Roxo</xap:Label>
 <dm:pick> -1 </dm:pick>
</r:Description></r:RDF></x:xmpmeta>
<?xpacket end="w"?>`
  const lido = lerSidecarXmp(elementos)
  assert.equal(lido.estrelas, 4)
  assert.equal(lido.cor, 'roxo')
  assert.equal(lido.marca, 'rejeitada')
  // Bridge: Rating = −1 quer dizer rejeitada (e a nota é zero); com pick presente, vale o pick
  const bridge = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmp:Rating="-1"/></rdf:RDF></x:xmpmeta>'
  assert.deepEqual(lerSidecarXmp(bridge), { estrelas: 0, cor: null, rotulo: null, marca: 'rejeitada', tem: { estrelas: true, cor: false, marca: true }, ajustes: null })
  const comPick = bridge.replace('xmp:Rating="-1"', 'xmp:Rating="-1" xmlns:xmpDM="http://ns.adobe.com/xmp/1.0/DynamicMedia/" xmpDM:pick="0"')
  assert.equal(lerSidecarXmp(comPick).marca, null)
  // etiqueta de texto livre: a cor não é nossa, mas o texto fica registrado
  const livre = bridge.replace('xmp:Rating="-1"', 'xmp:Rating="3.0" xmp:Label="Para revisar"')
  assert.deepEqual([lerSidecarXmp(livre).estrelas, lerSidecarXmp(livre).cor, lerSidecarXmp(livre).rotulo], [3, null, 'Para revisar'])
  // só xmpDM:good = true (sem pick): escolhida
  const bom = bridge.replace('xmp:Rating="-1"', 'xmlns:xmpDM="http://ns.adobe.com/xmp/1.0/DynamicMedia/" xmpDM:good="True"')
  assert.equal(lerSidecarXmp(bom).marca, 'escolhida')
  // prefixo certo com namespace errado não é a propriedade
  const impostor = bridge.replace('http://ns.adobe.com/xap/1.0/', 'http://exemplo.invalid/outro/')
  assert.equal(lerSidecarXmp(impostor).estrelas, null)
  // o que não é XMP devolve null, sem lançar
  for (const lixo of ['', '   ', 'isto não é xml', '<a><b></a>', '<x:xmpmeta xmlns:x="adobe:ns:meta/"></x:xmpmeta>', null, 42, '<rdf:RDF><rdf:Description'])
    assert.equal(lerSidecarXmp(lixo), null, String(lixo))
})

test('XMP: atualizar preserva, caractere por caractere, tudo o que não foi pedido para mudar', () => {
  const novo = atualizarSidecarXmp(DO_LIGHTROOM, { estrelas: 5 })
  assert.equal(novo, DO_LIGHTROOM.replace('xmp:Rating="2"', 'xmp:Rating="5"'))
  // sem mudanças (ou com o mesmo valor), o arquivo é o mesmo
  assert.equal(atualizarSidecarXmp(DO_LIGHTROOM, {}), DO_LIGHTROOM)
  assert.equal(atualizarSidecarXmp(DO_LIGHTROOM, { estrelas: 2 }), DO_LIGHTROOM)

  // várias mudanças: nota, cor (no idioma que o arquivo já usava), marca e os nossos ajustes
  const ajustes = { versao: 1, luz: { exposicao: -0.5 } }
  const completo = atualizarSidecarXmp(DO_LIGHTROOM, { estrelas: 4, cor: 'azul', marca: 'escolhida', ajustes })
  assert.deepEqual(lerSidecarXmp(completo), { estrelas: 4, cor: 'azul', rotulo: 'Blue', marca: 'escolhida', tem: { estrelas: true, cor: true, marca: true }, ajustes })
  // tudo o que era do Lightroom continua lá, na mesma ordem
  for (const trecho of [
    'x:xmptk="Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        "',
    'crs:Exposure2012="+0.35"',
    'crs:Contrast2012="-12"',
    'xmp:ModifyDate="2026-03-01T10:00:00-03:00"',
    '<rdf:li>família &amp; amigos</rdf:li>',
    '<rdf:li stEvt:action="saved" stEvt:when="2026-03-01T10:00:00-03:00"/>',
    '<rdf:li>255, 255</rdf:li>',
  ]) {
    assert.ok(completo.includes(trecho), trecho)
  }
  // tirando o que entrou, volta-se ao original com as duas trocas de valor
  const semNovos = completo
    .replace(/\n\s*xmlns:xmpDM="[^"]*"/, '')
    .replace(/\n\s*xmlns:zrofoto="[^"]*"/, '')
    .replace(/\n\s*xmpDM:pick="1"/, '')
    .replace(/\n\s*xmpDM:good="true"/, '')
    .replace(/\n\s*<zrofoto:Ajustes>[^<]*<\/zrofoto:Ajustes>/, '')
  assert.equal(semNovos, DO_LIGHTROOM.replace('xmp:Rating="2"', 'xmp:Rating="4"').replace('xmp:Label="Yellow"', 'xmp:Label="Blue"'))
  // o namespace novo é declarado uma vez só
  assert.equal(completo.split('xmlns:xmpDM=').length, 2)
  assert.equal(completo.split('xmlns:zrofoto=').length, 2)

  // atualizar de novo troca no lugar (nada duplica) e tirar devolve o arquivo ao que era
  const outra = atualizarSidecarXmp(completo, { estrelas: 1, marca: 'rejeitada', ajustes: { versao: 1 } })
  assert.equal(outra.split('xmpDM:pick=').length, 2)
  assert.equal(outra.split('Ajustes>').length, 3)
  assert.deepEqual([lerSidecarXmp(outra).estrelas, lerSidecarXmp(outra).marca, lerSidecarXmp(outra).ajustes], [1, 'rejeitada', { versao: 1 }])
  assert.match(outra, /xmpDM:good="false"/)
  const semCor = atualizarSidecarXmp(outra, { cor: null, marca: null, ajustes: null })
  assert.deepEqual(lerSidecarXmp(semCor), { estrelas: 1, cor: null, rotulo: null, marca: null, tem: { estrelas: true, cor: false, marca: true }, ajustes: null })
  assert.ok(!semCor.includes('xmp:Label') && !semCor.includes('xmpDM:good') && !semCor.includes('Ajustes'))
  assert.ok(semCor.includes('crs:Exposure2012="+0.35"'))
})

test('XMP: atualizar em formas variadas — elemento, descrição fechada em si, sem descrição, idioma, Rating −1', () => {
  // propriedade como elemento: troca o conteúdo; tirar leva o elemento inteiro
  const elementos = '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">\n  <xmp:Rating>1</xmp:Rating>\n  <xmp:Label>Verde</xmp:Label>\n  <xmp:Nickname>apelido</xmp:Nickname>\n </rdf:Description>\n</rdf:RDF>\n</x:xmpmeta>'
  assert.equal(atualizarSidecarXmp(elementos, { estrelas: 3 }), elementos.replace('<xmp:Rating>1<', '<xmp:Rating>3<'))
  assert.equal(atualizarSidecarXmp(elementos, { cor: null }), elementos.replace('\n  <xmp:Label>Verde</xmp:Label>', ''))
  // idioma automático: o arquivo usava português, continua em português; pedindo inglês, vai em inglês
  assert.match(atualizarSidecarXmp(elementos, { cor: 'roxo' }), /<xmp:Label>Roxo<\/xmp:Label>/)
  assert.match(atualizarSidecarXmp(elementos, { cor: 'roxo' }, { idioma: 'en' }), /<xmp:Label>Purple<\/xmp:Label>/)
  assert.match(atualizarSidecarXmp(DO_LIGHTROOM, { cor: 'roxo' }, { idioma: 'pt' }), /xmp:Label="Roxo"/)

  // descrição fechada em si mesma, sem o namespace xmp declarado
  const fechada = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/" crs:Exposure2012="+1.00"/></rdf:RDF></x:xmpmeta>'
  const aberta = atualizarSidecarXmp(fechada, { estrelas: 5, marca: 'escolhida', ajustes: { a: 1 } })
  assert.deepEqual(lerSidecarXmp(aberta), { estrelas: 5, cor: null, rotulo: null, marca: 'escolhida', tem: { estrelas: true, cor: false, marca: true }, ajustes: { a: 1 } })
  assert.ok(aberta.includes('crs:Exposure2012="+1.00"'))
  assert.ok(aberta.includes('</rdf:Description>'))
  // só atributos novos numa descrição fechada: continua fechada
  assert.match(atualizarSidecarXmp(fechada, { estrelas: 2 }), /crs:Exposure2012="\+1\.00" xmlns:xmp="http:\/\/ns\.adobe\.com\/xap\/1\.0\/" xmp:Rating="2"\/>/)

  // rdf:RDF vazio (sem nenhuma descrição): ganha uma
  for (const vazio of [
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"></rdf:RDF></x:xmpmeta>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></x:xmpmeta>',
  ]) {
    const lido = lerSidecarXmp(atualizarSidecarXmp(vazio, { estrelas: 3, cor: 'verde', ajustes: { b: 2 } }))
    assert.deepEqual([lido.estrelas, lido.cor, lido.ajustes], [3, 'verde', { b: 2 }])
  }

  // prefixo "xmp" já usado para outra coisa: a propriedade nova ganha outro prefixo, com o namespace certo
  const ocupado = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:xmp="http://exemplo.invalid/outro/" xmp:Coisa="1"/></rdf:RDF></x:xmpmeta>'
  const desviado = atualizarSidecarXmp(ocupado, { estrelas: 4 })
  assert.equal(lerSidecarXmp(desviado).estrelas, 4)
  assert.ok(desviado.includes('xmp:Coisa="1"') && desviado.includes('xmlns:xmp1="http://ns.adobe.com/xap/1.0/"') && desviado.includes('xmp1:Rating="4"'))

  // Bridge: Rating = −1. Mexer só na cor não toca na nota; tirar a rejeição zera a nota; rejeitar de novo usa a bandeira
  const bridge = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmp:Rating="-1"/></rdf:RDF></x:xmpmeta>'
  assert.ok(atualizarSidecarXmp(bridge, { cor: 'azul' }).includes('xmp:Rating="-1"'), 'o que a pessoa tinha fica')
  const liberada = atualizarSidecarXmp(bridge, { marca: null })
  assert.ok(liberada.includes('xmp:Rating="0"') && liberada.includes('xmpDM:pick="0"'))
  assert.equal(lerSidecarXmp(liberada).marca, null)
  const comNota = atualizarSidecarXmp(bridge, { marca: 'rejeitada', estrelas: 2 })
  assert.ok(comNota.includes('xmp:Rating="2"') && comNota.includes('xmpDM:pick="-1"'))

  // sem arquivo antigo: nasce um novo; arquivo antigo estragado: lança, para ninguém gravar por cima
  assert.equal(atualizarSidecarXmp('', { estrelas: 3, cor: 'verde' }), sidecarXmp({ estrelas: 3, cor: 'verde' }))
  assert.equal(atualizarSidecarXmp(null, { estrelas: 3 }, { idioma: 'en' }), sidecarXmp({ estrelas: 3 }))
  assert.throws(() => atualizarSidecarXmp('<x:xmpmeta><rdf:RDF>', { estrelas: 1 }), /XMP/)
  assert.throws(() => atualizarSidecarXmp('texto qualquer', { estrelas: 1 }), /rdf:RDF/)
  assert.throws(() => atualizarSidecarXmp(DO_LIGHTROOM, { cor: 'laranja' }), /cor desconhecida/)
})

test('Chromium: o XML que escrevemos e atualizamos é bem formado e um leitor de XML de verdade acha as propriedades', { skip: semChromium, timeout: 240000 }, async () => {
  const ajustes = { nota: 'a "b" <c> & \'d\'', luz: { exposicao: 1 } }
  const textos = {
    novo: sidecarXmp({ estrelas: 3, cor: 'verde', marca: 'rejeitada', ajustes, autor: 'João & Maria', direitos: '© <2026>', software: 'X "Y"' }),
    pacote: pacoteXmp({ estrelas: 1, cor: 'azul', idioma: 'en', marca: 'escolhida' }),
    atualizado: atualizarSidecarXmp(DO_LIGHTROOM, { estrelas: 4, cor: 'roxo', marca: 'escolhida', ajustes }),
    retirado: atualizarSidecarXmp(atualizarSidecarXmp(DO_LIGHTROOM, { marca: 'escolhida', ajustes }), { cor: null, marca: null, ajustes: null }),
  }
  const navegador = await abrirChromium()
  try {
    const pagina = await navegador.newPage()
    await pagina.goto('about:blank')
    const lidos = await pagina.evaluate(
      ({ textos, ns }) => {
        const saida = {}
        for (const [nome, texto] of Object.entries(textos)) {
          const doc = new DOMParser().parseFromString(texto, 'application/xml')
          const erro = doc.getElementsByTagName('parsererror')[0]
          const d = doc.getElementsByTagNameNS('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'Description')[0]
          saida[nome] = {
            erro: erro ? erro.textContent : null,
            raiz: doc.documentElement.namespaceURI + doc.documentElement.localName,
            nota: d?.getAttributeNS('http://ns.adobe.com/xap/1.0/', 'Rating'),
            rotulo: d?.getAttributeNS('http://ns.adobe.com/xap/1.0/', 'Label'),
            pick: d?.getAttributeNS('http://ns.adobe.com/xmp/1.0/DynamicMedia/', 'pick'),
            ajustes: doc.getElementsByTagNameNS(ns, 'Ajustes')[0]?.textContent ?? null,
            autor: doc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'creator')[0]?.textContent ?? null,
            assuntos: Array.from(doc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'subject')[0]?.getElementsByTagName('rdf:li') ?? [], (li) => li.textContent),
          }
        }
        return saida
      },
      { textos, ns: NAMESPACE_DOS_AJUSTES },
    )
    for (const [nome, lido] of Object.entries(lidos)) {
      assert.equal(lido.erro, null, `${nome}: XML mal formado`)
      assert.equal(lido.raiz, 'adobe:ns:meta/xmpmeta')
    }
    assert.deepEqual([lidos.novo.nota, lidos.novo.rotulo, lidos.novo.pick, lidos.novo.autor], ['3', 'Verde', '-1', 'João & Maria'])
    assert.deepEqual(JSON.parse(lidos.novo.ajustes), ajustes)
    assert.deepEqual([lidos.pacote.nota, lidos.pacote.rotulo, lidos.pacote.pick], ['1', 'Blue', '1'])
    assert.deepEqual([lidos.atualizado.nota, lidos.atualizado.rotulo, lidos.atualizado.pick], ['4', 'Purple', '1'])
    assert.deepEqual(JSON.parse(lidos.atualizado.ajustes), ajustes)
    assert.deepEqual(lidos.atualizado.assuntos, ['casamento', 'família & amigos'])
    assert.deepEqual([lidos.retirado.nota, lidos.retirado.rotulo, lidos.retirado.pick, lidos.retirado.ajustes], ['2', null, '0', null])
    assert.deepEqual(lidos.retirado.assuntos, ['casamento', 'família & amigos'])
  } finally {
    await navegador.close()
  }
})
