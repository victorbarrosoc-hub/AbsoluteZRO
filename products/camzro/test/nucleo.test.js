// O núcleo do CAMZRO: as contas que a câmera usa, conferidas contra valores conhecidos (normas e manuais).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import * as exp from '../app/nucleo/exposicao.js'
import * as tc from '../app/nucleo/timecode.js'
import * as cor from '../app/nucleo/cor.js'
import * as arm from '../app/nucleo/armazenamento.js'
import * as cl from '../app/nucleo/claquete.js'
import * as lut from '../app/nucleo/lut.js'
import * as au from '../app/nucleo/audio.js'
import * as meta from '../app/nucleo/metadados.js'
import * as rel from '../app/nucleo/relogio.js'
import * as ctl from '../app/nucleo/controles.js'
import * as lk from '../app/nucleo/looks.js'
import * as gu from '../app/nucleo/guias.js'

const perto = (a, b, tol = 1e-6, msg) => assert.ok(Math.abs(a - b) <= tol, msg || `${a} ≠ ${b} (±${tol})`)

test('regra dos 180°: 24 fps → 1/48 s; 25 fps → 1/50 s; volta para o ângulo', () => {
  perto(exp.anguloParaTempo(180, 24), 1 / 48)
  perto(exp.anguloParaTempo(180, 25), 1 / 50)
  perto(exp.anguloParaTempo(90, 60), 1 / 240)
  perto(exp.tempoParaAngulo(1 / 50, 25), 180)
  perto(exp.tempoParaAngulo(1 / 60, 24), 144)
  assert.equal(exp.fracao(1 / 48), '1/48')
  assert.equal(exp.fracao(1 / 2000), '1/2000')
  assert.equal(exp.anguloTexto(172.8), '172,8°')
  assert.equal(exp.anguloTexto(180), '180°')
  assert.throws(() => exp.anguloParaTempo(0, 24), RangeError)
})

test('anti-flicker: 24 fps em 50 Hz pede 172,8°; em 60 Hz, 144°; 25 fps em 50 Hz é cadência segura', () => {
  const a50 = exp.antiFlicker(50, 24)
  assert.deepEqual(
    a50.seguros.map((s) => Math.round(s.angulo * 10) / 10),
    [86.4, 172.8, 259.2, 345.6],
  )
  assert.equal(a50.cadenciaSegura, false)
  const a60 = exp.antiFlicker(60, 24)
  assert.deepEqual(
    a60.seguros.map((s) => Math.round(s.angulo)),
    [72, 144, 216, 288, 360],
  )
  assert.equal(exp.antiFlicker(50, 25).cadenciaSegura, true)
  assert.equal(exp.antiFlicker(60, 30).cadenciaSegura, true)
  // pediu 180° (1/48) a 24 fps na rede de 50 Hz: o seguro mais perto é 1/50 (172,8°)
  const t = exp.tempoSemFlicker(1 / 48, 50, 24)
  perto(t.tempo, 1 / 50)
  assert.equal(t.texto, '1/50')
  // 1/48 a 24 fps em 60 Hz → 1/40
  perto(exp.tempoSemFlicker(1 / 48, 60, 24).tempo, 1 / 40) // 216°: mais perto em stops que 1/60 (144°)
  assert.throws(() => exp.antiFlicker(55, 24), RangeError)
})

test('EV100 e ND: f/1,8 1/50 ISO 100; ND 0,9 = 3 stops; ND8 = 3 stops', () => {
  perto(exp.ev100(1, 1, 100), 0)
  perto(exp.ev100(16, 1 / 100, 100), Math.log2(25600), 1e-9) // regra do sol de 16
  perto(exp.ev100(2, 1, 200), 1, 1e-9)
  perto(exp.stopsDaDensidade(0.9), 2.99, 0.01)
  perto(exp.stopsDoFator(8), 3)
  assert.equal(exp.ndDeStops(3).fator, 8)
  assert.equal(exp.ndDeStops(3).densidade, 0.9)
  perto(exp.stopsEntre({ tempo: 1 / 100, iso: 100 }, { tempo: 1 / 50, iso: 100 }), 1)
})

test('ND necessário: o automático achou 1/1600 a ISO 50; quero 1/48 a ISO 50 → 5 stops (ND 1,5)', () => {
  const r = exp.ndNecessario({ tempo: 1 / 1600, iso: 50 }, { tempo: 1 / 48, iso: 50 })
  perto(r.stops, Math.log2(1600 / 48), 1e-9)
  assert.equal(r.nd, 1.5)
  perto(r.ajusteIso, -(Math.log2(1600 / 48) - exp.stopsDaDensidade(1.5)), 1e-9)
  // já está escuro: não pede ND e sobe o ISO
  const escuro = exp.ndNecessario({ tempo: 1 / 30, iso: 800 }, { tempo: 1 / 48, iso: 400 })
  assert.equal(escuro.nd, null)
  assert.ok(escuro.ajusteIso > 0)
  assert.equal(exp.stopsTexto(1), '+1 stop')
  assert.equal(exp.stopsTexto(-2.04), '−2 stops')
})

test('cadências exatas e câmera lenta', () => {
  perto(exp.cadencia('23.976').fps, 23.976023976, 1e-8)
  perto(exp.cadencia('29.97').fps, 29.97002997, 1e-8)
  assert.equal(exp.cadencia('nada'), null)
  assert.equal(exp.camaraLenta(60, 24).fator, 2.5)
  assert.equal(exp.camaraLenta(120, 24).porcentagem, 20)
})

test('timecode NDF: 24 fps, ida e volta', () => {
  assert.equal(tc.formatar(0, 24), '00:00:00:00')
  assert.equal(tc.formatar(24 * 3600 + 1, 24), '01:00:00:01')
  assert.equal(tc.formatar(23, 24000 / 1001), '00:00:00:23')
  for (const q of [0, 1, 23, 24, 86399, 1_234_567]) assert.equal(tc.ler(tc.formatar(q, 25), 25).quadro, q)
  assert.equal(tc.formatar(-1, 24), '23:59:59:23') // dá a volta no dia
  assert.equal(tc.ler('25:00:00:00', 24), null)
  assert.equal(tc.ler('00:00:00:24', 24), null)
})

test('timecode drop-frame 29,97: pula ;00 e ;01 a cada minuto, menos de 10 em 10', () => {
  const fps = 30000 / 1001
  assert.equal(tc.formatar(1799, fps, true), '00:00:59;29')
  assert.equal(tc.formatar(1800, fps, true), '00:01:00;02')
  assert.equal(tc.formatar(17982, fps, true), '00:10:00;00')
  assert.equal(tc.formatar(17981, fps, true), '00:09:59;29')
  // 1 hora DF = 107892 quadros (3600 × 29,97 arredondado)
  assert.equal(tc.formatar(107892, fps, true), '01:00:00;00')
  assert.equal(tc.quadrosPorDia(fps, true), 2589408)
  // ida e volta em todos os quadros de 11 minutos
  for (let q = 0; q < 19800; q++) {
    const t = tc.formatar(q, fps, true)
    assert.equal(tc.ler(t, fps).quadro, q, t)
  }
  // o rótulo pulado vira o primeiro que existe
  assert.equal(tc.ler('00:01:00;00', fps).quadro, tc.ler('00:01:00;02', fps).quadro)
  assert.throws(() => tc.formatar(10, 24, true), RangeError)
})

test('timecode drop-frame 59,94: pula 4 rótulos', () => {
  const fps = 60000 / 1001
  assert.equal(tc.formatar(3599, fps, true), '00:00:59;59')
  assert.equal(tc.formatar(3600, fps, true), '00:01:00;04')
  assert.equal(tc.formatar(35964, fps, true), '00:10:00;00')
  for (let q = 0; q < 40000; q += 7) assert.equal(tc.ler(tc.formatar(q, fps, true), fps).quadro, q)
})

test('timecode da hora do dia acompanha o relógio', () => {
  // 13:45:10,500 UTC num fuso de −180 min (Brasília) → 10:45:10:12 a 25 fps
  const ms = Date.UTC(2026, 10, 9, 13, 45, 10, 500)
  assert.equal(tc.formatar(tc.horaDoDia(ms, 25, false, -180), 25), '10:45:10:12')
  assert.equal(tc.formatar(tc.horaDoDia(ms, 30000 / 1001, true, 0), 30000 / 1001, true), '13:45:10;15')
  assert.equal(tc.duracaoTexto(3723), '1:02:03')
  assert.equal(tc.duracaoTexto(65), '1:05')
  assert.equal(tc.fim(10, 5, 24), 15)
})

test('luma Rec.709 e IRE', () => {
  perto(cor.luma(1, 1, 1), 1, 1e-12)
  perto(cor.luma(1, 0, 0), 0.2126)
  perto(cor.irePorCodigo(235, 'legal'), 100)
  perto(cor.irePorCodigo(16, 'legal'), 0)
  perto(cor.irePorCodigo(255), 100)
})

test('falsa cor ARRI: cinza 18% em verde, pele em rosa, estouro em vermelho', () => {
  assert.equal(cor.falsaCor(40).nome, 'Cinza 18%')
  assert.equal(cor.falsaCor(54).nome, 'Pele (+1 stop)')
  assert.equal(cor.falsaCor(99.5).nome, 'Estourado')
  assert.equal(cor.falsaCor(100).nome, 'Estourado')
  assert.equal(cor.falsaCor(1).nome, 'Preto cortado')
  assert.equal(cor.falsaCor(70), null)
  assert.equal(cor.falsaCor(60, 'simples').nome, 'Pele')
  assert.equal(cor.falsaCor(45, 'simples').nome, 'Cinza 18%')
  const v = cor.faixasParaShader('arri')
  assert.equal(v.length, 40)
  perto(v[5 * 2], 0.38, 1e-6) // terceira faixa começa em 38 IRE
})

test('zebra acima e em faixa', () => {
  assert.equal(cor.zebra(96, { nivel: 95 }), true)
  assert.equal(cor.zebra(94, { nivel: 95 }), false)
  assert.equal(cor.zebra(67, { modo: 'faixa', nivel: 70 }), true)
  assert.equal(cor.zebra(76, { modo: 'faixa', nivel: 70 }), false)
})

test('vectorscope: alvos das barras a 75% nos ângulos de referência', () => {
  const a = Object.fromEntries(cor.alvosVectorscope(0.75).map((x) => [x.nome, x]))
  // vermelho fica no quadrante +Cr/−Cb, azul no +Cb; complementares opostos
  assert.ok(a.R.cr > 0 && a.R.cb < 0)
  assert.ok(a.B.cb > 0)
  perto(a.R.angulo - a.Cy.angulo, 180, 1e-6)
  perto(Math.abs(a.B.angulo - a.Yl.angulo), 180, 1e-6)
  // raio do vermelho a 75%: hipot((−0,2126×0,75)/1,8556, (0,75 − 0,2126×0,75)/1,5748)
  perto(a.R.raio, Math.hypot((-0.2126 * 0.75) / 1.8556, (0.75 * 0.7874) / 1.5748), 1e-9)
  const branco = cor.cbcr(1, 1, 1)
  perto(branco.cb, 0, 1e-12)
  perto(branco.cr, 0, 1e-12)
})

test('histograma, forma de onda e nitidez', () => {
  const px = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255, 128, 128, 128, 255])
  const h = cor.histograma(px)
  assert.equal(h.n, 4)
  assert.equal(h.y[0], 1)
  assert.equal(h.y[255], 1)
  assert.equal(h.y[128], 2)
  perto(h.cortadoEmCima, 25)
  perto(h.cortadoEmbaixo, 25)
  const w = cor.formaDeOnda(px, 2, 2, { colunas: 2 })
  assert.equal(w.grade[0 * 256 + 0], 1)
  assert.equal(w.grade[0 * 256 + 128], 1)
  assert.equal(w.grade[1 * 256 + 255], 1)
  const p = cor.formaDeOnda(px, 2, 2, { colunas: 6, modo: 'parade' })
  assert.equal(p.colunas, 6)
  // imagem com borda (em foco) tem mais nitidez que a mesma imagem borrada
  const N = 16
  const nitida = new Float32Array(N * N).map((_, i) => (i % N < N / 2 ? 0 : 255))
  const borrada = new Float32Array(N * N).map((_, i) => ((i % N) / (N - 1)) * 255)
  assert.ok(cor.nitidez(nitida, N, N) > cor.nitidez(borrada, N, N) * 5)
})

test('Kelvin de uma cor neutra (McCamy): branco D65 ≈ 6500 K', () => {
  const k = cor.kelvinDeRgb(1, 1, 1)
  assert.ok(k > 6400 && k < 6600, String(k))
  assert.ok(cor.kelvinDeRgb(1, 0.75, 0.5) < 4000)
})

test('armazenamento: 50 Mb/s por 60 s ≈ 379 MB; 10 GB livres cabem ~26 min', () => {
  const b = arm.bytesDe(60, 50e6)
  perto(b, (50e6 * 60 * 1.01) / 8)
  perto(arm.segundosQueCabem(b, 50e6), 60, 1e-6)
  assert.equal(arm.bitrateAudio({ codec: 'pcm-s24', taxa: 48000, canais: 2 }), 2_304_000)
  assert.equal(arm.bitrateAudio({ codec: 'aac', bitrate: 256000 }), 256000)
  assert.equal(arm.bytesTexto(4_200_000_000), '4,2 GB')
  assert.equal(arm.bytesTexto(820_000_000), '820 MB')
  assert.equal(arm.tempoTexto(4320), '1 h 12 min')
  assert.equal(arm.tempoTexto(45), '45 s')
  assert.equal(arm.bitrateTexto(50e6), '50 Mb/s')
  assert.equal(arm.bitrateSugerido({ largura: 3840, altura: 2160, fps: 30, codec: 'hevc', nivel: 'padrao' }), 50e6)
  assert.equal(arm.nivelDoEspaco(60), 'acabando')
  assert.equal(arm.nivelDoEspaco(300), 'pouco')
  assert.equal(arm.nivelDoEspaco(3600), 'ok')
})

test('claquete: nome no padrão de cinema, take sobe, plano e cena viram', () => {
  const d = new Date(2026, 10, 9)
  const nome = cl.nomeDoClipe({ camera: 'a', rolo: 1, clipe: 7, data: d, aparelho: 'k3f2' })
  assert.equal(nome, 'A001C007_261109_K3F2')
  assert.deepEqual(cl.lerNome(`${nome}.mov`), { camera: 'A', rolo: 1, clipe: 7, data: '261109', aparelho: 'K3F2' })
  assert.equal(cl.lerNome('IMG_0001.MOV'), null)
  assert.equal(cl.proximoPlano('A'), 'B')
  assert.equal(cl.proximoPlano('Z'), 'AA')
  assert.equal(cl.proximoPlano('3'), '4')
  assert.equal(cl.proximaCena('12'), '13')
  assert.equal(cl.proximaCena('12A'), '12B')
  let c = { ...cl.CLAQUETE_INICIAL, cena: '12', plano: 'B', take: 3 }
  c = cl.depoisDeGravar(c)
  assert.equal(c.take, 4)
  assert.equal(cl.novoPlano(c).take, 1)
  assert.equal(cl.novoPlano(c).plano, 'C')
  assert.deepEqual([cl.novaCena(c).cena, cl.novaCena(c).plano, cl.novaCena(c).take], ['13', 'A', 1])
  assert.equal(cl.novoRolo(c).rolo, 2)
  assert.equal(cl.novoRolo(c).clipe, 1)
  assert.equal(cl.marcaCurta(c), '12B-4')
  assert.equal(cl.campo('a\tb"c/d\n', 24), 'a b c d')
  const id = cl.idDoAparelho()
  assert.match(id, /^[2-9A-HJKMNP-Z]{4}$/)
})

test('LUT .cube: lê, aplica trilinear e confere erros', () => {
  const id = lut.escreverCube({ tamanho: 5, funcao: (c) => c })
  const l = lut.lerCube(id)
  assert.equal(l.tipo, '3d')
  assert.equal(l.tamanho, 5)
  for (const c of [
    [0.1, 0.5, 0.9],
    [0.33, 0.66, 0.99],
  ])
    lut.aplicar(l, c).forEach((v, k) => perto(v, c[k], 1e-6))
  // inverte: 1 − c
  const inv = lut.lerCube(lut.escreverCube({ tamanho: 9, funcao: (c) => c.map((v) => 1 - v) }))
  lut.aplicar(inv, [0.2, 0.4, 0.6]).forEach((v, k) => perto(v, [0.8, 0.6, 0.4][k], 1e-6))
  // 1D vira 3D
  const um = lut.lerCube('LUT_1D_SIZE 2\n0 0 0\n1 1 1\n')
  assert.equal(um.tipo, '1d')
  const tres = lut.para3d(um, 5)
  assert.equal(tres.dados.length, 125 * 3)
  const tex = lut.paraTextura(l)
  assert.equal(tex.rgba.length, 125 * 4)
  assert.throws(() => lut.lerCube('LUT_3D_SIZE 2\n0 0 0\n'), lut.ErroLut)
  assert.throws(() => lut.lerCube('0 0 0'), lut.ErroLut)
  assert.throws(() => lut.lerCube('LUT_3D_SIZE 99'), lut.ErroLut)
  assert.throws(() => lut.lerCube('LUT_3D_SIZE 2\nDOMAIN_MIN 1 1 1\nDOMAIN_MAX 0 0 0\n' + '0 0 0\n'.repeat(8)), lut.ErroLut)
  assert.equal(lut.lerCube(`TITLE "Meu look"\n# comentário\n${id.split('\n').slice(1).join('\n')}`).titulo, 'Meu look')
})

test('filtro K a 48 kHz bate com os coeficientes publicados na BS.1770', () => {
  const [p, h] = au.filtroK(48000)
  perto(p.b[0], 1.53512485958697, 1e-8)
  perto(p.b[1], -2.69169618940638, 1e-8)
  perto(p.b[2], 1.19839281085285, 1e-8)
  perto(p.a[1], -1.69065929318241, 1e-8)
  perto(p.a[2], 0.73248077421585, 1e-8)
  perto(h.a[1], -1.99004745483398, 1e-8)
  perto(h.a[2], 0.99007225036621, 1e-8)
})

test('medidor: seno de 1 kHz a −20 dBFS dá pico −20 e loudness perto de −20 LUFS (estéreo, ≈ −17)', () => {
  const fs = 48000
  const m = au.criarMedidor({ fs, canais: 2 })
  const amp = au.ampDe(-20)
  for (let bloco = 0; bloco < 400; bloco++) {
    const x = new Float32Array(128)
    for (let i = 0; i < 128; i++) x[i] = amp * Math.sin((2 * Math.PI * 1000 * (bloco * 128 + i)) / fs)
    m.processar([x, x])
  }
  const l = m.leitura()
  perto(l.pico[0], -20, 0.05)
  perto(l.rms[0], -23.01, 0.3) // RMS de seno = pico − 3,01 dB (o bloco de 128 não fecha ciclos inteiros)
  // BS.1770: seno de 1 kHz a 0 dBFS em um canal = −3,01 LUFS; em dois canais soma 3 dB; −20 dBFS → ≈ −20 LUFS
  perto(l.lufs, -20, 0.3)
  assert.equal(au.faixaDoNivel(-3), 'alto')
  assert.equal(au.faixaDoNivel(-10), 'bom')
  assert.equal(au.posicaoNoMedidor(-20), 0.35)
  assert.equal(au.posicaoNoMedidor(0), 1)
  // a assinatura do bip do TPeasy, que o Synquei acha: 1 kHz, 160 ms, 0,25 de pico, cai ~13 dB em 30 ms
  const b = au.bip()
  assert.equal(b.length, 7680)
  assert.equal(b[0], 0)
  perto(Math.max(...b.subarray(0, 48)), 0.25, 0.01)
  const picoDe = (a, z) => Math.max(...b.subarray(Math.round(a * 48), Math.round(z * 48)))
  const queda = au.dbfs(picoDe(30, 31)) - au.dbfs(picoDe(0, 1))
  assert.ok(queda < -11 && queda > -14, String(queda))
})

test('sidecar, CSV do DaVinci, ALE e relatório', () => {
  const claquete = { ...cl.CLAQUETE_INICIAL, projeto: 'Curta', cena: '12', plano: 'B', take: 3 }
  const s = meta.sidecar({
    arquivo: 'A001C007_261109_K3F2.mov',
    nome: 'A001C007_261109_K3F2',
    inicioMs: Date.UTC(2026, 10, 9, 13, 0, 0),
    duracao: 10,
    quadros: 240,
    fps: 24,
    tcInicio: 24 * 3600,
    claquete,
    bom: true,
    notas: 'Foco, "atenção"',
    video: { codec: 'avc', largura: 3840, altura: 2160, bitrate: 100e6, quadroChave: 1, perdidos: 0, motor: 'webcodecs' },
    audio: { codec: 'pcm-s24', taxa: 48000, canais: 2 },
    aparelho: 'K3F2',
    camera: { iso: 400, angulo: 172.8, kelvin: 5600, lente: '26 mm' },
  })
  assert.deepEqual(meta.conferirSidecar(s), [])
  assert.equal(s.timecode.inicio, '01:00:00:00')
  assert.equal(s.timecode.fim, '01:00:10:00')
  assert.equal(s.claquete.rolo, 'A001')
  const csv = meta.csvResolve([s])
  const [cab, linha] = csv.trim().split('\r\n')
  assert.equal(cab.split(',')[0], 'File Name')
  assert.match(linha, /^A001C007_261109_K3F2\.mov,12,B,3,1,A,A,A001,26 mm,400,"172,8°",5600,24,"Foco, atenção","Bom take, CAMZRO",Curta$/) // aspas saem da nota; a vírgula pede aspas no CSV
  const a = meta.ale([s])
  assert.match(a, /^Heading\nFIELD_DELIM\tTABS/)
  assert.match(a, /\nData\nA001C007_261109_K3F2\tVA1A2\t01:00:00:00\t01:00:10:00\tA001\t/)
  const r = meta.relatorioHtml([s])
  assert.match(r, /1 clipes · 1 bons/)
  assert.ok(!r.includes('"atenção"'))
  assert.deepEqual(meta.conferirSidecar({ formato: 'x' }).includes('formato'), true)
})

test('relógio do set: Cristian com a amostra de menor atraso', () => {
  // relógio do aparelho 250 ms atrasado; atrasos de rede diferentes
  const amostras = [
    { t0: 1000, t1: 1100, servidor: 1300 },
    { t0: 2000, t1: 2010, servidor: 2255 },
    { t0: 3000, t1: 3400, servidor: 3450 },
  ]
  const r = rel.combinar(amostras)
  perto(r.diferenca, 250)
  perto(r.incerteza, 5)
  assert.equal(rel.qualidade(r, 24), 'quadro')
  assert.equal(rel.qualidade(null, 24), 'sem')
  assert.equal(rel.combinar([{ t0: 10, t1: 5, servidor: 0 }]), null)
})

test('controles: só o que a câmera aceita, nas unidades certas', () => {
  const caps = {
    exposureMode: ['continuous', 'manual'],
    exposureTime: { min: 1, max: 3333, step: 1 },
    iso: { min: 50, max: 3200, step: 1 },
    whiteBalanceMode: ['continuous', 'manual'],
    colorTemperature: { min: 2850, max: 7000, step: 50 },
    focusMode: ['continuous', 'manual'],
    focusDistance: { min: 0.1, max: 10, step: 0.01 },
    zoom: { min: 1, max: 8, step: 0.1 },
    torch: true,
  }
  const c = ctl.lerCapacidades(caps, { facingMode: 'environment' })
  assert.equal(c.exposicaoManual, true)
  perto(c.tempo.max, 0.3333)
  const r = ctl.restricoes(c, { exposicao: 'manual', tempo: 1 / 48, iso: 400, balanco: 'manual', kelvin: 5612, foco: 'manual', distancia: 2.345, zoom: 2.04, tocha: false })
  assert.equal(r.exposureMode, 'manual')
  perto(r.exposureTime, 208, 1e-9) // 1/48 s = 208,33 × 100 µs, no passo de 1
  assert.equal(r.colorTemperature, 5600)
  perto(r.focusDistance, 2.35, 1e-9)
  perto(r.zoom, 2, 1e-9)
  assert.equal(r.torch, false)
  // câmera sem nada manual (Safari no iPhone): não manda restrição nenhuma de exposição
  const nada = ctl.lerCapacidades({}, {})
  assert.equal(nada.algumManual, false)
  assert.deepEqual(ctl.restricoes(nada, { exposicao: 'manual', tempo: 1 / 48 }), {})
  assert.deepEqual(ctl.isosDaCamera({ min: 50, max: 400 }), [50, 64, 80, 100, 125, 160, 200, 250, 320, 400])
  const p = ctl.toqueNoQuadro(50, 50, { largura: 100, altura: 100 }, { largura: 16, altura: 9 })
  perto(p.x, 0.5)
  perto(p.y, 0.5)
  assert.equal(ctl.toqueNoQuadro(50, 5, { largura: 100, altura: 100 }, { largura: 16, altura: 9 }), null)
})

test('Neutro ZRO: nitidez no mínimo, contraste e saturação a um terço do padrão; Padrão volta; sem controle, nada', () => {
  // webcam UVC típica: 0–255, abre em 128 (contraste e saturação) e 64 (nitidez)
  const caps = { contrast: { min: 0, max: 255, step: 1 }, saturation: { min: 0, max: 255, step: 1 }, sharpness: { min: 0, max: 255, step: 1 } }
  const c = ctl.lerCapacidades(caps, { contrast: 128, saturation: 128, sharpness: 64 })
  assert.equal(c.neutro, true)
  assert.deepEqual(ctl.imagemNeutra(c), { contrast: 43, saturation: 43, sharpness: 0 })
  assert.deepEqual(ctl.restricoes(c, { perfil: 'neutro' }), { contrast: 43, saturation: 43, sharpness: 0 })
  assert.deepEqual(ctl.restricoes(c, { perfil: 'padrao' }), { contrast: 128, saturation: 128, sharpness: 64 })
  // sem o valor de abertura: um terço entre o mínimo e o meio da faixa, no passo da câmera
  const s = ctl.lerCapacidades({ contrast: { min: -10, max: 10, step: 2 } }, {})
  assert.deepEqual(ctl.imagemNeutra(s), { contrast: -6 }) // -10 + (0 - -10)/3 = -6,67 → passo de 2 → -6
  assert.deepEqual(ctl.restricoes(s, { perfil: 'padrao' }), {}) // não sabe para onde voltar: não mexe
  // só saturação não é perfil plano; nada de controle = nada na tela nem na track (iPhone)
  assert.equal(ctl.lerCapacidades({ saturation: { min: 0, max: 100, step: 1 } }, {}).neutro, false)
  assert.equal(ctl.lerCapacidades({}, {}).neutro, false)
  assert.deepEqual(ctl.restricoes(ctl.lerCapacidades({}, {}), { perfil: 'neutro' }), {})
  // vai na ficha e no CSV do DaVinci
  const sc = meta.sidecar({ arquivo: 'a.mov', nome: 'a', inicioMs: 0, duracao: 1, quadros: 24, fps: 24, tcInicio: 0, claquete: cl.CLAQUETE_INICIAL, video: {}, camera: { perfil: 'neutro-zro' } })
  assert.equal(sc.camera.perfil_imagem, 'neutro-zro')
  assert.match(meta.csvResolve([sc]), /Neutro ZRO, CAMZRO/)
  assert.equal(meta.sidecar({ arquivo: 'b.mov', nome: 'b', inicioMs: 0, duracao: 1, quadros: 24, fps: 24, tcInicio: 0, claquete: cl.CLAQUETE_INICIAL, video: {} }).camera.perfil_imagem, 'padrao')
})

test('guias: 2,39 dentro de 16:9 e 9:16 dentro de 16:9; anamórfico 1,33× em 16:9 ≈ 2,37', () => {
  const g = gu.guia(2.39, 1920, 1080)
  assert.equal(g.largura, 1)
  perto(g.altura, 16 / 9 / 2.39, 1e-9)
  perto(g.y, (1 - g.altura) / 2, 1e-12)
  const v = gu.guia(9 / 16, 1920, 1080)
  assert.equal(v.altura, 1)
  perto(v.largura, 9 / 16 / (16 / 9), 1e-9)
  perto(gu.proporcaoDesanamorfizada(1920, 1080, 1.33), 2.3644, 1e-3)
  const caixa = gu.caixaDaPrevia(1920, 1080, 2, 1000, 1000)
  perto(caixa.largura / caixa.altura, (16 / 9) * 2, 1e-9)
  const seg = gu.areaSegura(0.9)
  perto(seg.x, 0.05, 1e-12)
  perto(seg.altura, 0.9, 1e-12)
  assert.equal(gu.nivel(0, 1).nivelado, true)
  perto(Math.abs(gu.nivel(1, 1).graus), 45, 1e-9)
})

test('prioridade de exposição: stops até o alvo, passo de 1/3 e limites', () => {
  // cinza exato: nada muda; escuro: abre no máximo 1/3; claro: fecha
  assert.equal(exp.stopsParaAlvo(0.42), 0)
  perto(exp.stopsParaAlvo(0.1), 1 / 3)
  perto(exp.stopsParaAlvo(0.9), -1 / 3)
  // dentro de 1/3: o valor exato (2,2 × log2(alvo/medido))
  perto(exp.stopsParaAlvo(0.4), 2.2 * Math.log2(0.42 / 0.4), 1e-9)
  // EV +1 sobe o alvo em 2^(1/2,2)
  perto(exp.stopsParaAlvo(0.42 * 2 ** (1 / 2.2), { ev: 1 }), 0, 1e-9)
  const faixas = { iso: { min: 50, max: 3200 }, tempo: { min: 1 / 8000, max: 1 / 2 }, fps: 24 }
  const o = exp.aplicarStops({ iso: 100, tempo: 1 / 48 }, 1, 'obturador', faixas)
  assert.equal(o.iso, 200)
  assert.equal(o.tempo, 1 / 48)
  assert.equal(exp.aplicarStops({ iso: 50, tempo: 1 / 48 }, -1, 'obturador', faixas).limite, 'luz-demais')
  const i = exp.aplicarStops({ iso: 400, tempo: 1 / 48 }, 1, 'iso', faixas)
  perto(i.tempo, 1 / 24) // não passa do tempo do quadro
  assert.equal(exp.aplicarStops({ iso: 400, tempo: 1 / 30 }, 1, 'iso', faixas).limite, 'falta-luz')
  // luma média com peso no centro
  const px = new Uint8ClampedArray(4 * 4 * 4).fill(255)
  perto(cor.lumaMedia(px, 4, 4), 1, 1e-9)
})

test('roteiro do Maestro vira a decupagem da claquete', async () => {
  const { readFile } = await import('node:fs/promises')
  const mae = await import('../app/nucleo/maestro.js')
  const exemplo = await readFile(new URL('../../../docs/integration-contracts/exemplos/maestro.roteiro.v1.json', import.meta.url), 'utf8')
  const r = mae.lerRoteiro(exemplo)
  assert.equal(r.titulo, 'Café Aurora')
  assert.equal(r.versao, 3)
  const c1 = r.cenas[0]
  assert.equal(c1.numero, 1)
  assert.ok(c1.planos.length >= 1)
  assert.equal(c1.planos[0].letra, 'A')
  assert.match(c1.planos[0].descricao, /GPG/)
  assert.match(c1.planos[0].descricao, /drone subindo/)
  // anda pela lista: último plano da cena 1 → primeiro da próxima cena com planos
  const ultimo = c1.planos[c1.planos.length - 1].letra
  const prox = mae.seguinte(r, { cena: '1', plano: ultimo })
  const proxCena = r.cenas.slice(1).find((c) => c.planos.length)
  assert.deepEqual(prox, proxCena ? { cena: String(proxCena.numero), plano: 'A' } : null)
  const elo = mae.eloDoClipe(r, { cena: '1', plano: 'A' })
  assert.equal(elo.contrato, 'maestro.roteiro/1')
  assert.equal(elo.plano_id, c1.planos[0].id)
  assert.throws(() => mae.lerRoteiro('{"contract":"outra/1"}'), mae.ErroRoteiro)
  assert.throws(() => mae.lerRoteiro('não é json'), mae.ErroRoteiro)
})

test('Looks ZRO: saída em 0–1, tom monótono, P&B neutro, Bleach tira cor, .cube de 33 pontos lido de volta', () => {
  assert.equal(lk.LOOKS.length, 8)
  assert.equal(new Set(lk.IDS).size, lk.IDS.length)
  // a curva em S não inverte o tom para |k| ≤ 1 e prende as pontas
  for (const k of [-1, -0.5, 0, 0.35, 1]) {
    perto(lk.curva(0, k), 0)
    perto(lk.curva(1, k), 1)
    for (let x = 0; x < 1; x += 0.01) assert.ok(lk.curva(x + 0.01, k) >= lk.curva(x, k) - 1e-12)
  }
  const cores = []
  for (const r of [0, 0.25, 0.5, 0.75, 1]) for (const g of [0, 0.5, 1]) for (const b of [0, 0.5, 1]) cores.push([r, g, b])
  for (const { id } of lk.LOOKS) {
    for (const c of cores) for (const v of lk.aplicarLook(id, c)) assert.ok(v >= 0 && v <= 1, `${id} fora de 0–1`)
    // rampa de cinza: a luma de saída nunca desce
    let antes = -1
    for (let x = 0; x <= 1.0001; x += 0.05) {
      const l = lk.luma(lk.aplicarLook(id, [x, x, x]))
      assert.ok(l >= antes - 1e-9, `${id}: tom invertido em ${x.toFixed(2)}`)
      antes = l
    }
  }
  // P&B: sem cor; filtro vermelho: o vermelho puro sai mais claro que o azul puro
  const [r, g, b] = lk.aplicarLook('pb', [0.8, 0.3, 0.2])
  assert.ok(r === g && g === b)
  assert.ok(lk.aplicarLook('pb', [1, 0, 0])[0] > lk.aplicarLook('pb', [0, 0, 1])[0])
  // Bleach: menos croma que a entrada (distância à luma)
  const croma = (c) => Math.max(...c) - Math.min(...c)
  assert.ok(croma(lk.aplicarLook('bleach', [0.7, 0.4, 0.3])) < croma([0.7, 0.4, 0.3]))
  // o .cube: 33 pontos, título com o nome, e a LUT lida de volta dá a mesma cor nos nós
  const texto = lk.cubeDoLook('tungstenio')
  const l = lut.lerCube(texto)
  assert.equal(l.tamanho, 33)
  assert.equal(l.titulo, 'ZRO · Tungstênio 500')
  const esperado = lk.aplicarLook('tungstenio', [0.5, 0.25, 0.75])
  lut.aplicar(l, [0.5, 0.25, 0.75]).forEach((v, i) => perto(v, esperado[i], 1e-5))
  assert.equal(lk.cubeDoLook('nada'), null)
  // o nome da LUT vai nas palavras-chave do CSV do DaVinci
  const sc = meta.sidecar({ arquivo: 'c.mov', nome: 'c', inicioMs: 0, duracao: 1, quadros: 24, fps: 24, tcInicio: 0, claquete: cl.CLAQUETE_INICIAL, video: {}, camera: { lut: 'ZRO · Bleach' } })
  assert.match(meta.csvResolve([sc]), /LUT: ZRO · Bleach, CAMZRO/)
})
