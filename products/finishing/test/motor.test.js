// O motor profissional: tela separada do look (cena.js), película por densidade (pelicula.js), controle de qualidade
// de todos os looks (qc.js) e o pacote (pacote.js). Estes testes são a barra: um look que reprova não sai.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { criarTela, curvaDeTom, diParaLinear, linearParaDi } from '../src/cor/cena.js'
import { aplicarTetra, assar } from '../src/cor/cube.js'
import { GRUPOS, NEUTRO, criarMotor } from '../src/cor/pelicula.js'
import { avaliarLook } from '../src/cor/qc.js'
import { escreverClf, montarPacote, offsetDaCorrecao, slugPack } from '../src/cor/pacote.js'
import { crc32 } from '../src/imagem/zip.js'
import { COPIAS, criarCopia } from '../src/cor/copia.js'

test('tela: cinza 18% vai a 10 nits no SDR e 14,5 no HDR 1000; curva de tom com inversa exata', () => {
  const sdr = criarTela('rec709')
  assert.ok(Math.abs(sdr.aplicar([0.18, 0.18, 0.18])[0] - 0.1 ** (1 / 2.4)) < 1e-3)
  const t = curvaDeTom(1000)
  assert.ok(Math.abs(t.ida(0.18) - 0.145) < 0.002, String(t.ida(0.18)))
  for (const x of [0.001, 0.18, 2, 40]) assert.ok(Math.abs(curvaDeTom(100).volta(curvaDeTom(100).ida(x)) - x) / x < 1e-6)
  // a rampa de cinza sobe sempre e fica neutra
  let antes = -1
  for (let s = -10; s <= 10; s += 0.25) {
    const x = 0.18 * 2 ** s
    const o = sdr.aplicar([x, x, x])
    assert.ok(o[0] >= antes && Math.max(...o) - Math.min(...o) < 1e-9)
    antes = o[0]
  }
})

test('tela: um still Rec.709 vai até a cena e volta igual (o Lab trabalha stills sem perder nada)', () => {
  const sdr = criarTela('rec709')
  let pior = 0
  for (let i = 0; i < 3000; i++) {
    const c = [((i * 37) % 97) / 100, ((i * 53) % 89) / 95, ((i * 71) % 83) / 90].map((v) => Math.min(0.97, v))
    const de = sdr.aplicar(sdr.inverter(...c))
    pior = Math.max(pior, ...de.map((v, j) => Math.abs(v - c[j])))
  }
  assert.ok(pior < 1e-4, `pior ${pior}`)
})

test('tela: azul e vermelho fora do Rec.709 (gamut largo) saem com cor, sem canal negativo e sem preto', () => {
  const sdr = criarTela('rec709')
  for (const x of [
    [0, 0, 1],
    [2, 0.01, 0.01],
    [0, 1.5, 0],
    [0.02, 0.01, 4],
  ]) {
    const o = sdr.aplicar(x)
    assert.ok(o.every((v) => v >= 0 && v <= 1) && Math.max(...o) > 0.3, `${x} → ${o}`)
  }
})

test('película: o perfil neutro não muda nada dentro do Rec.2020 (o motor parte do zero, sem curva escondida)', () => {
  const m = criarMotor(NEUTRO)
  for (const x of [
    [0.18, 0.18, 0.18],
    [0.1, 0.2, 0.3],
    [1.2, 0.9, 0.6],
    [12, 9, 7],
    [0.004, 0.003, 0.005],
  ])
    assert.ok(
      m.emCena(x).every((v, i) => Math.abs(v - x[i]) <= 1e-6 * Math.max(1, x[i])),
      `${x} → ${m.emCena(x)}`,
    )
  // fora do Rec.2020 a cor entra em curva suave (como o compressor de gamut do ACES), sem canal negativo
  const fora = m.emCena([0.001, 0.4, 2.5])
  assert.ok(fora.every((v) => v >= 0))
})

test('controle de qualidade: os 20 looks passam em tudo (cinza, monotonia, degrau, pele, preto, branco, gamut, LUT)', () => {
  assert.equal(GRUPOS.flatMap((g) => g.looks).length, 20)
  for (const g of GRUPOS)
    for (const p of g.looks) {
      const r = avaliarLook(criarMotor(p), { veu: p.veu > 0, pb: !!p.pb, tingeMax: p.tingeMax })
      const falhas = r.verificacoes.filter((v) => !v.ok).map((v) => `${v.nome} ${v.valor}/${v.limite} ${v.detalhe}`)
      assert.deepEqual(falhas, [], p.id)
    }
})

test('cópia de cinema: cinza no lugar e neutro, contraste de projeção, preto da densidade máxima e branco da base', () => {
  const sdr = criarTela('rec709')
  for (const c of COPIAS) {
    const copia = criarCopia(c.id)
    // a cópia de laboratório põe o cinza 18% na densidade 1,0 acima da base: 10% do branco, como a tela da Revela
    const cinza = copia.tela([0.18, 0.18, 0.18])
    assert.ok(cinza.every((v) => Math.abs(v - 0.0985) < 1e-6), `${c.id} cinza ${cinza}`)
    // contraste do sistema no cinza: 1,8 (log da tela por log da cena), com negativos de gama 0,5 a 0,7, como os reais
    const y = (s) => copia.tela([0.18 * 10 ** s, 0.18 * 10 ** s, 0.18 * 10 ** s])[1]
    const gama = (Math.log10(y(0.01)) - Math.log10(y(-0.01))) / 0.02
    assert.ok(Math.abs(gama - 1.8) < 0.03, `${c.id} gama ${gama}`)
    for (const g of copia.gamaNegativo) assert.ok(g > 0.45 && g < 0.75, `${c.id} negativo ${g}`)
    // preto: a densidade máxima da ficha; branco: a base, logo abaixo do pico
    assert.ok(y(-3) < 10 ** -(c.curvas[1].dmax - c.curvas[1].dmin - 1) * 0.11)
    assert.ok(y(3) > 0.95 && y(3) < 0.985)
    // e o motor inteiro devolve na tela o que a cópia daria
    const tela = sdr.aplicar(copia.emCena([0.5, 0.3, 0.2]))
    const esperado = copia.tela([0.5, 0.3, 0.2]).map((v) => Math.max(0, v) ** (1 / 2.4))
    assert.ok(tela.every((v, i) => Math.abs(v - esperado[i]) < 2e-3), `${c.id} ${tela} × ${esperado}`)
  }
})

test('controle de qualidade: pega um look quebrado (degrau na curva e cinza tingido)', () => {
  const quebrado = {
    emCena: (x) => {
      const y = x.map((v) => (v > 0.5 ? v * 1.6 : v)) // degrau na luz
      return [y[0] * 1.3, y[1], y[2] * 0.7] // cinza laranja
    },
  }
  const r = avaliarLook(quebrado)
  assert.equal(r.ok, false)
  const falhou = r.verificacoes.filter((v) => !v.ok).map((v) => v.id)
  assert.ok(falhou.includes('neutro') && falhou.includes('suavidade'), falhou.join())
})

test('LUT: tetraédrica reproduz a identidade exata e o LMT bate com a conta', () => {
  const id = assar((r, g, b) => [r, g, b], 17)
  for (const c of [
    [0.13, 0.77, 0.41],
    [0.5, 0.5, 0.5],
    [0.99, 0.01, 0.6],
  ])
    assert.ok(aplicarTetra(id, ...c).every((v, i) => Math.abs(v - c[i]) < 1e-6))
  const m = criarMotor(GRUPOS[1].looks[1])
  const lut = assar((r, g, b) => m.emDi(r, g, b), 65)
  const di = [0.41, 0.36, 0.3]
  const exato = m.emDi(...di)
  assert.ok(aplicarTetra(lut, ...di).every((v, i) => Math.abs(v - exato[i]) < 2e-3))
  assert.ok(Math.abs(linearParaDi(diParaLinear(0.42)) - 0.42) < 1e-12)
})

test('pacote: nomes no padrão ARRI, CLF com azul mais rápido, CDL da correção, zip íntegro e QC aprovado', () => {
  assert.equal(slugPack('Noite quente à beira-mar!'), 'NOITE-QUENTE-A-BEIRA-MAR')
  const p = montarPacote({ nome: 'Noite quente', base: 'negativo-500t', entrada: 'sony-slog3-cine', correcao: { exposicao: 0.5, ganhos: null }, ajustes: { calor: 30 } })
  const nomes = p.arquivos.map((a) => a.nome.split('/')[1])
  for (const n of [
    'REVELA_NOITE-QUENTE_DWG-DI-to-DWG-DI_v1_65.cube',
    'REVELA_NOITE-QUENTE_DWG-DI-to-DWG-DI_v1_33.cube',
    'REVELA_NOITE-QUENTE_DWG-DI-to-DWG-DI_v1_65.clf',
    'REVELA_NOITE-QUENTE_ACEScct-AP1-to-ACEScct-AP1_v1_65.cube',
    'REVELA_NOITE-QUENTE_SLog3-SGamut3Cine-to-Gamma24_Rec709-D65_v1_33.cube',
    'REVELA_NOITE-QUENTE_Gamma24_Rec709-to-Gamma24_Rec709_v1_33.cube',
    'REVELA_NOITE-QUENTE_correcao_DWG-DI.cdl',
    'REVELA_NOITE-QUENTE.revela',
    'CONTROLE-DE-QUALIDADE.txt',
    'LEIA-ME.txt',
  ])
    assert.ok(nomes.includes(n), n)
  assert.equal(p.qc.ok, true)
  assert.match(p.arquivos.find((a) => a.nome.endsWith('.cdl')).dados, /<Offset>0\.0354\d+ 0\.0354\d+ 0\.0354\d+<\/Offset>/)
  // +0,5 stop no cinza, em DI (o log do DI tem o deslocamento 0,0075: perto de 0,5 × 0,0733)
  assert.ok(Math.abs(offsetDaCorrecao({ exposicao: 0.5 })[1] - (linearParaDi(0.18 * 2 ** 0.5) - linearParaDi(0.18))) < 1e-9)
  // zip: assinatura, número de arquivos no diretório central e CRC do primeiro arquivo
  const z = p.zip
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength)
  assert.equal(dv.getUint32(0, true), 0x04034b50)
  assert.equal(dv.getUint16(z.length - 22 + 10, true), p.arquivos.length)
  assert.equal(dv.getUint32(14, true), crc32(new TextEncoder().encode(p.arquivos[0].dados)))
  // CLF: a segunda linha do array é r=0, g=0, b=1 (azul varia mais rápido)
  const lut = assar((r, g, b) => [r, g, b], 17)
  const clf = escreverClf(lut, { id: 't', descricao: 'd', entrada: 'e', saida: 's' })
  const linhas = clf.split('<Array dim="17 17 17 3">\n')[1].split('\n')
  assert.equal(linhas[1], '0.000000 0.000000 0.062500')
})
