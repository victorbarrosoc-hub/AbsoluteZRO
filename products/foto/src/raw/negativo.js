// O "negativo": o que sai de um arquivo RAW antes de qualquer conta de cor. É o contrato entre quem lê o arquivo
// (src/raw) e quem revela (src/motor). Nada aqui é arredondado nem cortado: o mosaico é o dado exato do sensor.
//
// Campos (todos obrigatórios, salvo os marcados com ?):
//   tipo            'raw'
//   formato         extensão em minúsculas, sem ponto ('cr3', 'dng', 'arw'…)
//   fabricante, modelo   texto do arquivo ('' se não houver)
//   exif            { data?, subsegundo?, iso?, tempo?, abertura?, focal?, lente?, orientacao }
//                     data = 'AAAA-MM-DDTHH:MM:SS' (hora local da câmera, sem fuso); tempo em segundos;
//                     orientacao = 1..8 (EXIF; 1 = como está)
//   sensor          { largura, altura, dados: Uint16Array }   mosaico inteiro, com as margens mascaradas
//   area            { x, y, largura, altura }                 área ativa dentro do sensor
//   cfa             { tipo: 'bayer' | 'xtrans', lado: 2 | 6, padrao: Uint8Array(lado·lado) }
//                     padrao[l·lado + c] = 0 R, 1 G, 2 B, com (l, c) contados a partir do canto da ÁREA ATIVA
//   preto           { porCanal: [r, g, b], padrao?: { linhas, colunas, valores: Float32Array } }
//                     preto de um sensel = porCanal[cor] + padrao[(l mod linhas)·colunas + (c mod colunas)],
//                     com (l, c) em coordenadas do SENSOR (o padrão repetido nasce no canto do sensor)
//   branco          { declarado: [r, g, b] }    nível de saturação que o arquivo declara, por canal (em DN)
//   wb              { comoFotografado?: [r, g, b] }           multiplicadores com G = 1
//   cor             { origem: 'dng' | 'libraw', matrizes: [{ kelvin, xyzParaCamera: number[9], cameraParaXyzD50?: number[9] }] }
//                     uma ou duas matrizes (dois iluminantes no DNG); linha a linha (m[0..2] = primeira linha)
//                     neutroComoFotografado?: [r, g, b] (AsShotNeutral do DNG)
//   exposicaoBase   EV que o fabricante pede somar (BaselineExposure do DNG; 0 quando não há)
//   perfilRuido?    [{ escala, deslocamento }] por canal (NoiseProfile do DNG, em sinal normalizado 0..1)
//   previa?         { jpeg: Uint8Array, largura?, altura? }   a maior JPEG embutida
//
// Opcionais que os leitores acrescentam quando o arquivo traz (nada disso é exigido por criarNegativo):
//   exif.subsegundo é a fração do segundo (0 ≤ x < 1)
//   branco.maximo   teto do formato segundo o LibRaw (o `declarado` já é o menor entre ele e o fim do trecho linear)
//   recorte?        { x, y, largura, altura }   DefaultCrop do DNG, contado do canto da área ativa
//   opcodes?        { lista1?, lista2?, lista3? }   OpcodeList do DNG já lidas (src/raw/opcodes.js)
//   cor.matrizes[].cameraParaXyzD50 é a ForwardMatrix do DNG (vale para a câmera já equilibrada, neutro = 1,1,1);
//   cor.matrizes[].calibracao? = AnalogBalance · CameraCalibration quando não é a identidade (xyzParaCamera já a inclui)
//
// Motivo dos nomes: quem lê o código de revelação precisa saber de onde cada número veio (declarado pelo arquivo
// versus medido). O que é MEDIDO fica em src/raw/latitude.js, nunca aqui.

export const R = 0
export const G = 1
export const B = 2

const obrigatorio = (cond, msg) => {
  if (!cond) throw new Error(`Negativo inválido: ${msg}`)
}

/** Confere e devolve o negativo (o mesmo objeto). Lança com a razão se algo essencial falta ou não bate. */
export function criarNegativo(n) {
  obrigatorio(n && n.tipo === 'raw', 'tipo')
  obrigatorio(n.sensor && n.sensor.dados instanceof Uint16Array, 'sensor.dados precisa ser Uint16Array')
  obrigatorio(n.sensor.dados.length === n.sensor.largura * n.sensor.altura, 'sensor: tamanho não bate com largura × altura')
  const a = n.area
  obrigatorio(a && a.x >= 0 && a.y >= 0 && a.largura > 0 && a.altura > 0, 'area')
  obrigatorio(a.x + a.largura <= n.sensor.largura && a.y + a.altura <= n.sensor.altura, 'area fora do sensor')
  obrigatorio(n.cfa && (n.cfa.tipo === 'bayer' || n.cfa.tipo === 'xtrans'), 'cfa.tipo')
  obrigatorio(n.cfa.lado === (n.cfa.tipo === 'bayer' ? 2 : 6), 'cfa.lado')
  obrigatorio(n.cfa.padrao instanceof Uint8Array && n.cfa.padrao.length === n.cfa.lado * n.cfa.lado, 'cfa.padrao')
  obrigatorio(n.cfa.padrao.every((v) => v === R || v === G || v === B), 'cfa.padrao só aceita 0, 1 e 2')
  obrigatorio(Array.isArray(n.preto?.porCanal) && n.preto.porCanal.length === 3, 'preto.porCanal')
  if (n.preto.padrao) {
    const p = n.preto.padrao
    obrigatorio(p.valores instanceof Float32Array && p.valores.length === p.linhas * p.colunas, 'preto.padrao')
  }
  obrigatorio(Array.isArray(n.branco?.declarado) && n.branco.declarado.length === 3, 'branco.declarado')
  for (let c = 0; c < 3; c++) obrigatorio(n.branco.declarado[c] > n.preto.porCanal[c], 'branco precisa ficar acima do preto')
  obrigatorio(n.cor && Array.isArray(n.cor.matrizes) && n.cor.matrizes.length >= 1 && n.cor.matrizes.length <= 2, 'cor.matrizes')
  for (const m of n.cor.matrizes) {
    obrigatorio(m.kelvin > 1000 && m.kelvin < 30000, 'cor.matrizes[].kelvin')
    obrigatorio(Array.isArray(m.xyzParaCamera) && m.xyzParaCamera.length === 9, 'cor.matrizes[].xyzParaCamera')
  }
  n.formato ??= ''
  n.fabricante ??= ''
  n.modelo ??= ''
  n.exif ??= {}
  n.exif.orientacao ??= 1
  n.wb ??= {}
  n.exposicaoBase ??= 0
  return n
}

/** Cor do filtro (0 R, 1 G, 2 B) do sensel na linha e coluna do SENSOR. */
export function corEm(n, linha, coluna) {
  const lado = n.cfa.lado
  const l = (((linha - n.area.y) % lado) + lado) % lado
  const c = (((coluna - n.area.x) % lado) + lado) % lado
  return n.cfa.padrao[l * lado + c]
}

/** Nível de preto (em DN, pode ser fracionário) do sensel na linha e coluna do SENSOR. */
export function pretoEm(n, linha, coluna) {
  const base = n.preto.porCanal[corEm(n, linha, coluna)]
  const p = n.preto.padrao
  return p ? base + p.valores[(linha % p.linhas) * p.colunas + (coluna % p.colunas)] : base
}
