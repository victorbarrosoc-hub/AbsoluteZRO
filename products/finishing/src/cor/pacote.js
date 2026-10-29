// Revela · o pacote de um look, como um pack profissional: cada arquivo diz no nome de onde vem e para onde vai (no
// padrão de nomes da ARRI), e o leia-me diz a ordem. O look em si é um LMT na luz da cena (log → log): vale para
// qualquer câmera e para SDR e HDR; a correção do frame vai à parte, em CDL (antes do look, como pede a Netflix); e as
// LUTs com tela embutida (monitor do set, edição direta em Rec.709) vêm prontas, mas são só para isso.
//
//   CDL (correção do frame)  →  LMT (o look)  →  tela (Rec.709, P3 PQ, Rec.2020 PQ: a do projeto)

import { assar, escreverCube } from './cube.js'
import { ENTRADAS } from './espacos.js'
import { criarTela, deTrabalho, linearParaDi, paraTrabalho } from './cena.js'
import { criarLab, escreverReceita, paraCena } from './lab.js'
import { copiaDe } from './copia.js'
import { NEUTRO, criarMotor } from './pelicula.js'
import { avaliarLook, relatorioEmTexto } from './qc.js'
import { criarZip } from '../imagem/zip.js'

const VERSAO = 'v1'
const ACESCCT = { curva: 'acescct', gamut: 'ap1' }

/** Nome de arquivo seguro, em maiúsculas sem acento, como nos packs (REVELA_NOITE-QUENTE_…). */
export function slugPack(nome) {
  return (
    String(nome || 'Look')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toUpperCase()
      .slice(0, 32) || 'LOOK'
  )
}

const SIGLA_CAMERA = {
  'sony-slog3-cine': 'SLog3-SGamut3Cine',
  'sony-slog3': 'SLog3-SGamut3',
  'sony-slog2': 'SLog2-SGamut3',
  'arri-logc3': 'LogC3-AWG3',
  'arri-logc4': 'LogC4-AWG4',
  'canon-clog3': 'CLog3-CinemaGamut',
  'canon-clog2': 'CLog2-CinemaGamut',
  'canon-clog': 'CLog-Rec709',
  'panasonic-vlog': 'VLog-VGamut',
  'bmd-gen5': 'BMDFilmGen5-BMDWG',
  'fuji-flog2': 'FLog2-FGamut',
  'fuji-flog': 'FLog-FGamut',
  'nikon-nlog': 'NLog-Rec2020',
  'dji-dlog': 'DLog-DGamut',
  'red-log3g10': 'Log3G10-RWG',
  davinci: 'DWG-DI',
  acescct: 'ACEScct-AP1',
}

/** CLF (Common LUT Format, o que a Netflix usa no AMF) com a LUT 3D: azul varia mais rápido, ao contrário do .cube. */
export function escreverClf(lut, { id, descricao, entrada, saida }) {
  const n = lut.tamanho
  const d = lut.dados
  const linhas = []
  for (let ri = 0; ri < n; ri++)
    for (let gi = 0; gi < n; gi++)
      for (let bi = 0; bi < n; bi++) {
        const i = ((bi * n + gi) * n + ri) * 3
        linhas.push(`${d[i].toFixed(6)} ${d[i + 1].toFixed(6)} ${d[i + 2].toFixed(6)}`)
      }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<?xml version="1.0" encoding="UTF-8"?>
<ProcessList compCLFversion="3" id="${esc(id)}">
  <Description>${esc(descricao)}</Description>
  <InputDescriptor>${esc(entrada)}</InputDescriptor>
  <OutputDescriptor>${esc(saida)}</OutputDescriptor>
  <LUT3D id="look" inBitDepth="32f" outBitDepth="32f" interpolation="tetrahedral">
    <Array dim="${n} ${n} ${n} 3">
${linhas.join('\n')}
    </Array>
  </LUT3D>
</ProcessList>
`
}

/** ASC CDL (.cdl) com a correção do frame em DaVinci Intermediate: exposição e branco viram offset (exato no cinza). */
export function escreverCdl({ id, descricao, offset }) {
  const f = (v) => v.toFixed(6)
  return `<?xml version="1.0" encoding="UTF-8"?>
<ColorDecisionList xmlns="urn:ASC:CDL:v1.01">
  <ColorDecision>
    <ColorCorrection id="${id}">
      <Description>${descricao}</Description>
      <InputDescription>DaVinci Intermediate / DaVinci Wide Gamut</InputDescription>
      <ViewingDescription>Revela LMT + output transform do projeto</ViewingDescription>
      <SOPNode>
        <Slope>1.000000 1.000000 1.000000</Slope>
        <Offset>${offset.map(f).join(' ')}</Offset>
        <Power>1.000000 1.000000 1.000000</Power>
      </SOPNode>
      <SatNode>
        <Saturation>1.000000</Saturation>
      </SatNode>
    </ColorCorrection>
  </ColorDecision>
</ColorDecisionList>
`
}

/** A correção do frame (exposição e branco automáticos) como offsets em DI: o ganho na cena é soma em log. */
export function offsetDaCorrecao(correcao) {
  if (!correcao) return [0, 0, 0]
  const primaria = criarMotor(NEUTRO, { exposicao: correcao.exposicao ?? 0, ganhosLms: correcao.ganhos ?? null })
  const cinza = primaria.emCena([0.18, 0.18, 0.18])
  return cinza.map((v) => linearParaDi(v) - linearParaDi(0.18))
}

/**
 * Monta o pacote de uma receita do Lab. `opcoes`: { camera (id de câmera para a LUT do monitor; padrão a entrada do
 * frame, se for câmera), qc (true: roda o controle de qualidade e põe o relatório) }.
 * Devolve { pasta, arquivos: [{ nome, dados }], qc, zip: Uint8Array }.
 */
export function montarPacote(receita, opcoes = {}) {
  const nome = slugPack(receita.nome)
  const pasta = `REVELA_${nome}`
  const prefixo = `${pasta}/REVELA_${nome}`
  // o look sem a correção do frame (ela vai no CDL), com os ajustes da pessoa e a intensidade
  const look = criarLab({ ...receita, correcao: null })
  const tudo = criarLab(receita)
  const sdr = criarTela('rec709')
  const arquivos = []
  const coment = (de, para) => [
    `Revela · ${receita.nome || 'Meu look'} (base ${tudo.perfil.nome})`,
    `Entrada: ${de}`,
    `Saída: ${para}`,
    'Faixa: full (0–1). Interpolação: tetraédrica.',
  ]

  // 1. LMT em DaVinci Wide Gamut / Intermediate (o principal)
  for (const n of [65, 33]) {
    const lut = assar(look.emDi, n)
    arquivos.push({
      nome: `${prefixo}_DWG-DI-to-DWG-DI_${VERSAO}_${n}.cube`,
      dados: escreverCube(lut, `REVELA ${nome} LMT DWG-DI`, coment('DaVinci Wide Gamut / Intermediate', 'DaVinci Wide Gamut / Intermediate (sem tela)')),
    })
    if (n === 65)
      arquivos.push({
        nome: `${prefixo}_DWG-DI-to-DWG-DI_${VERSAO}_${n}.clf`,
        dados: escreverClf(lut, {
          id: `revela-${nome.toLowerCase()}-lmt`,
          descricao: `Revela · ${receita.nome || 'Meu look'} · LMT (look na luz da cena)`,
          entrada: 'DaVinci Intermediate / DaVinci Wide Gamut',
          saida: 'DaVinci Intermediate / DaVinci Wide Gamut',
        }),
      })
  }

  // 2. LMT em ACEScct / AP1 (projetos ACES)
  const deAces = paraTrabalho(ACESCCT)
  const paraAces = deTrabalho(ACESCCT)
  arquivos.push({
    nome: `${prefixo}_ACEScct-AP1-to-ACEScct-AP1_${VERSAO}_65.cube`,
    dados: escreverCube(
      assar((r, g, b) => paraAces(look.emCena(deAces(r, g, b))), 65),
      `REVELA ${nome} LMT ACEScct`,
      coment('ACEScct / AP1', 'ACEScct / AP1 (sem output transform)'),
    ),
  })

  // 3. LUT do monitor (câmera → Rec.709), com a correção do frame e a tela: para o set e para dailies
  const camera = opcoes.camera ?? (receita.entrada && receita.entrada !== 'still' ? receita.entrada : 'arri-logc4')
  const cam = ENTRADAS.find((e) => e.id === camera)
  if (cam) {
    const ida = paraTrabalho(cam)
    arquivos.push({
      nome: `${prefixo}_${SIGLA_CAMERA[camera] ?? camera}-to-Gamma24_Rec709-D65_${VERSAO}_33.cube`,
      dados: escreverCube(
        assar((r, g, b) => sdr.aplicar(tudo.emCena(ida(r, g, b))), 33),
        `REVELA ${nome} ${cam.nome} to Rec709`,
        coment(cam.nome, 'Rec.709 Gama 2.4 (BT.1886), 100 nits'),
      ),
    })
  }

  // 4. LUT Rec.709 → Rec.709 (material já tratado: Premiere, Final Cut, CapCut), com a correção do frame
  const doStill = paraCena('still')
  const rec709 = assar((r, g, b) => sdr.aplicar(tudo.emCena(doStill(r, g, b))), 33)
  arquivos.push({
    nome: `${prefixo}_Gamma24_Rec709-to-Gamma24_Rec709_${VERSAO}_33.cube`,
    dados: escreverCube(rec709, `REVELA ${nome} Rec709`, coment('Rec.709 Gama 2.4 (material já tratado)', 'Rec.709 Gama 2.4')),
  })

  // 5. a correção do frame em CDL (antes do LMT) e a receita para reabrir no Lab
  const offset = offsetDaCorrecao(receita.correcao)
  arquivos.push({
    nome: `${prefixo}_correcao_DWG-DI.cdl`,
    dados: escreverCdl({
      id: `revela_${nome.toLowerCase()}`,
      descricao: 'Revela: correção do frame (exposição e branco) em DaVinci Intermediate; aplicar antes do LMT',
      offset,
    }),
  })
  arquivos.push({ nome: `${prefixo}.revela`, dados: escreverReceita(receita) })

  // 6. controle de qualidade do look (o LMT) e leia-me
  let qc = null
  if (opcoes.qc !== false) {
    qc = avaliarLook(look.motor, { veu: (receita.ajustes?.desbotar ?? 0) > 0 || look.perfil.veu > 0, pb: !!look.perfil.pb, tingeMax: look.perfil.tingeMax })
    arquivos.push({ nome: `${pasta}/CONTROLE-DE-QUALIDADE.txt`, dados: relatorioEmTexto(receita.nome || 'Meu look', qc) })
  }
  arquivos.push({ nome: `${pasta}/LEIA-ME.txt`, dados: leiaMe(nome, receita, cam, qc, look.motor.copia) })
  return { pasta, arquivos, qc, zip: criarZip(arquivos) }
}

function leiaMe(nome, receita, cam, qc, copia) {
  const c = copia ? copiaDe(copia) : null
  return `REVELA · ${receita.nome || 'Meu look'}
Feito no Revela Lab (revela.absolutezro.com). Look na luz da cena, separado da tela.

ORDEM
  correção do frame (CDL)  →  look (LMT)  →  saída do projeto (Rec.709, P3-D65 PQ, Rec.2020 PQ)

ARQUIVOS
  REVELA_${nome}_DWG-DI-to-DWG-DI_${VERSAO}_65.cube
    O look. DaVinci Resolve com gerenciamento de cor: timeline em DaVinci Wide Gamut / Intermediate; ponha a LUT
    num nó depois da correção. A saída (Rec.709 Gama 2.4 ou HDR) é a do projeto: o mesmo look serve para SDR e HDR.
    Também em 33 pontos e em CLF (o formato que a Netflix usa no AMF).
  REVELA_${nome}_ACEScct-AP1-to-ACEScct-AP1_${VERSAO}_65.cube
    O mesmo look para projetos ACES (ACEScct), antes do output transform.
  REVELA_${nome}_${cam ? SIGLA_CAMERA[cam.id] ?? cam.id : 'CAMERA'}-to-Gamma24_Rec709-D65_${VERSAO}_33.cube
    Para o monitor do set e dailies: do log da câmera (${cam?.nome ?? '—'}) até Rec.709, com a correção do frame e o
    look. Não use na finalização (a tela está embutida).
  REVELA_${nome}_Gamma24_Rec709-to-Gamma24_Rec709_${VERSAO}_33.cube
    Para material já em Rec.709 (Premiere, Final Cut, CapCut). Aproximação: o caminho certo é o LMT.
  REVELA_${nome}_correcao_DWG-DI.cdl
    A correção do frame (exposição e branco) em ASC CDL, para aplicar antes do look.
  REVELA_${nome}.revela
    A receita, para reabrir e ajustar no Revela Lab.

${
    c
      ? `CÓPIA DE CINEMA
  O look inclui a cópia ${c.id} (curvas de ${c.ficha}; a Revela não tem vínculo com o fabricante). A cópia foi
  desenhada para a tela SDR: no HDR o look funciona, mas o branco da cópia fica no SDR.

`
      : ''
  }FAIXA E INTERPOLAÇÃO
  Todas as LUTs são full range (0–1). Use interpolação tetraédrica (Resolve: Project Settings → Color Management →
  3D Lookup Table Interpolation → Tetrahedral).

CONTROLE DE QUALIDADE
  ${qc ? (qc.ok ? 'Aprovado em todas as verificações (detalhes em CONTROLE-DE-QUALIDADE.txt).' : 'Reprovado em alguma verificação: veja CONTROLE-DE-QUALIDADE.txt antes de usar.') : 'Não rodado.'}

O que uma LUT não leva: grão, halation e bloom são efeitos de espaço (dependem dos vizinhos do pixel) e ficam fora
de qualquer LUT. No Resolve, use os efeitos nativos depois do look.
`
}

