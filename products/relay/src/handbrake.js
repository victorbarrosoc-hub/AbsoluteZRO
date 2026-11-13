// Presets do HandBrake (.json exportado em "Presets → Exportar") viram fichas do Relay ("Meus"), para a pessoa trazer
// o padrão que já usa. Puro e testável. O que o Relay não faz (legendas, capítulos, filtros que ele não tem) não some
// calado: volta em `deixados`, por preset, para a tela dizer.
//
// Mapa (chaves do HandBrake 1.x, VersionMajor ≥ 40):
//  - FileFormat av_mp4/av_mkv/av_webm → MP4 (o Relay só sai em MP4 com vídeo; MKV e WebM viram aviso)
//  - VideoEncoder x264/vt_h264/nvenc_h264/qsv_h264… → H.264; x265*/vt_h265/nvenc_h265… → HEVC
//  - VideoQualityType 2 → qualidade constante (RF = VideoQualitySlider); 1 → bitrate médio (VideoAvgBitrate kbps)
//  - VideoFramerate + VideoFramerateMode: cfr → exata; pfr → no máximo; vfr/auto → como a origem
//  - PictureWidth/PictureHeight (teto) → lado menor; sem teto (0) → tamanho original
//  - PictureCropMode 3 (manual) → recorte; PictureRotate → giro e espelho
//  - AudioList[0] → AAC (bitrate, canais, taxa, ganho); lista vazia → sem áudio
//  - VideoPreset/VideoTune/VideoProfile, desentrelaçar, ruído e nitidez → grupo "No computador"

import { OPCOES } from './personalizado.js'

const VELOCIDADE = { ultrafast: 'veryfast', superfast: 'veryfast', veryfast: 'veryfast', faster: 'fast', fast: 'fast', medium: 'medium', slow: 'slow', slower: 'slower', veryslow: 'veryslow', placebo: 'veryslow' }
const FORCA = { ultralight: 1, light: 1, medium: 2, strong: 3, stronger: 3, verystrong: 3 }
const ligado = (f) => f && f !== 'off'

/** É um arquivo de presets do HandBrake? */
export const ehHandBrake = (dados) => Array.isArray(dados?.PresetList)

/** Todos os presets da lista, abrindo as pastas (Folder + ChildrenArray). */
function achatar(lista, saida = []) {
  for (const p of lista ?? []) {
    if (!p || typeof p !== 'object') continue
    if (p.Folder) achatar(p.ChildrenArray, saida)
    else saida.push(p)
  }
  return saida
}

const maisPerto = (valor, opcoes) => opcoes.reduce((a, b) => (Math.abs(b - valor) < Math.abs(a - valor) ? b : a))

/** Um preset do HandBrake → { ficha, deixados } (ficha no formato de especificacaoDe). */
export function fichaDoHandBrake(h) {
  const deixados = []
  const nome = String(h.PresetName ?? '').trim() || 'HandBrake'

  // contêiner
  if (h.FileFormat && h.FileFormat !== 'av_mp4') deixados.push(`sai em MP4 (no HandBrake era ${h.FileFormat === 'av_mkv' ? 'MKV' : h.FileFormat === 'av_webm' ? 'WebM' : h.FileFormat})`)

  // codificador
  const enc = String(h.VideoEncoder ?? 'x264').toLowerCase()
  const hevc = /265|hevc/.test(enc)
  if (!/264|265|hevc|avc/.test(enc)) deixados.push(`codificador ${h.VideoEncoder} trocado por H.264`)
  if (/10bit|12bit|_10|_12/.test(enc)) deixados.push('sai em 8 bits')

  // qualidade
  const ficha = { nome, base: null, formato: 'mp4', codec: hevc ? 'hevc' : 'avc', tamanho: 'lado', lado: null, gop: 2 }
  if (Number(h.VideoQualityType) === 1) {
    ficha.qualidade = 'bitrate'
    ficha.kbps = Number(h.VideoAvgBitrate) || 6000
  } else {
    ficha.qualidade = 'rf'
    ficha.rf = Math.round(Number(h.VideoQualitySlider ?? 22))
    // o navegador não tem RF: lá vale o bitrate da tabela; o RF vale no computador (Máxima qualidade)
    deixados.push(`RF ${ficha.rf} só no computador (no navegador, bitrate da tabela)`)
    if (!/^x26[45]/.test(enc)) deixados.push('o RF do codificador de placa vira o do x264/x265')
  }

  // cadência
  const fps = Number(h.VideoFramerate)
  if (Number.isFinite(fps) && fps > 0 && h.VideoFramerateMode !== 'vfr') {
    const opcoes = OPCOES.fps.filter(Boolean)
    const alvo = opcoes.includes(fps) ? fps : maisPerto(fps, opcoes)
    if (alvo !== fps) deixados.push(`${String(fps).replace('.', ',')} fps virou ${String(alvo).replace('.', ',')} fps`)
    ficha.fps = alvo
    ficha.fpsModo = h.VideoFramerateMode === 'pfr' ? 'pico' : 'constante'
  } else {
    ficha.fps = null
    ficha.fpsModo = 'pico'
  }

  // tamanho: largura/altura no HandBrake são teto; sem teto, o original
  const w = Number(h.PictureWidth) || 0
  const a = Number(h.PictureHeight) || 0
  if (w && a && h.PictureKeepRatio === false) Object.assign(ficha, { tamanho: 'tela', largura: w, altura: a, encaixe: 'fill' })
  else if (w || a) {
    const menor = w && a ? Math.min(w, a) : w || a
    const lados = OPCOES.lado.filter(Boolean)
    ficha.lado = lados.find((l) => l <= menor) ?? lados.at(-1)
    if (ficha.lado !== menor) deixados.push(`teto de ${menor}p virou ${ficha.lado}p`)
  }
  if (Number(h.PictureCropMode) === 3) ficha.recorte = { cima: Number(h.PictureTopCrop) || 0, baixo: Number(h.PictureBottomCrop) || 0, esquerda: Number(h.PictureLeftCrop) || 0, direita: Number(h.PictureRightCrop) || 0 }
  else if (h.PictureAutoCrop || Number(h.PictureCropMode) === 0 || Number(h.PictureCropMode) === 1) deixados.push('recorte automático das faixas pretas')
  const giro = /angle=(\d+)/.exec(h.PictureRotate ?? '')
  ficha.giro = giro ? Number(giro[1]) % 360 : 0
  ficha.espelhar = /hflip=1/.test(h.PictureRotate ?? '')
  if (ligado(h.PicturePadMode) && h.PicturePadMode !== 'none') deixados.push('bordas (pad)')

  // áudio: o Relay sai com uma faixa
  const faixa = Array.isArray(h.AudioList) ? h.AudioList[0] : null
  if (!faixa || faixa.AudioEncoder === 'none') ficha.audio = 'nenhum'
  else {
    ficha.audio = 'aac'
    const kbps = Number(faixa.AudioBitrate) || 256
    ficha.audioKbps = OPCOES.kbpsAac.includes(kbps) ? kbps : maisPerto(kbps, OPCOES.kbpsAac)
    const mix = String(faixa.AudioMixdown ?? 'stereo')
    ficha.canais = mix === 'mono' || mix === 'left_only' || mix === 'right_only' ? 1 : 2
    if (!['stereo', 'mono', 'dpl1', 'dpl2', 'left_only', 'right_only'].includes(mix)) deixados.push(`som ${mix} vira estéreo`)
    const taxa = { 44.1: 44100, 48: 48000 }[faixa.AudioSamplerate]
    ficha.taxa = taxa ?? null
    if (faixa.AudioSamplerate && faixa.AudioSamplerate !== 'auto' && !taxa) deixados.push(`taxa de ${faixa.AudioSamplerate} kHz fica 48 kHz`)
    ficha.ganho = Number(faixa.AudioTrackGainSlider) || 0
    if (/copy|passthru/.test(String(faixa.AudioEncoder))) deixados.push('o áudio é recodificado em AAC (sem cópia direta)')
    if (h.AudioList.length > 1) deixados.push(`${h.AudioList.length - 1} faixa${h.AudioList.length > 2 ? 's' : ''} de áudio extra`)
    if (Number(faixa.AudioTrackDRCSlider)) deixados.push('compressão de faixa dinâmica (DRC)')
  }

  // no computador (x264/x265)
  ficha.computador = {
    velocidade: VELOCIDADE[h.VideoPreset] ?? 'slow',
    ajuste: ['film', 'grain', 'animation'].includes(h.VideoTune) ? h.VideoTune : null,
    perfil: ['high', 'main', 'baseline'].includes(h.VideoProfile) ? h.VideoProfile : null,
    desentrelacar: ligado(h.PictureDeinterlaceFilter),
    ruido: ligado(h.PictureDenoiseFilter) ? (FORCA[h.PictureDenoisePreset] ?? 2) : 0,
    nitidez: ligado(h.PictureSharpenFilter) ? Math.min(2, FORCA[h.PictureSharpenPreset] ?? 1) : 0,
    loudness: null,
  }
  if (h.VideoTune && !ficha.computador.ajuste) deixados.push(`ajuste "${h.VideoTune}"`)
  if (h.VideoProfile && h.VideoProfile !== 'auto' && !ficha.computador.perfil) deixados.push(`perfil ${h.VideoProfile}`)

  // o que o Relay não tem
  for (const [chave, nomeFiltro] of [['PictureDeblockPreset', 'deblock'], ['PictureChromaSmoothPreset', 'suavizar croma'], ['PictureColorspacePreset', 'espaço de cor'], ['PictureCombDetectPreset', 'detectar entrelaçado'], ['PictureDetelecine', 'detelecine']])
    if (ligado(h[chave])) deixados.push(nomeFiltro)
  if (h.VideoGrayScale) deixados.push('preto e branco')
  if (h.SubtitleTrackSelectionBehavior && h.SubtitleTrackSelectionBehavior !== 'none') deixados.push('legendas')
  if (h.ChapterMarkers) deixados.push('marcadores de capítulo')
  if (String(h.VideoOptionExtra ?? '').trim() || String(h.x264Option ?? '').trim()) deixados.push('opções extras do codificador')

  return { ficha, deixados }
}

/** Arquivo do HandBrake → { fichas, deixados: { [nome]: [...] } }. */
export function doHandBrake(dados) {
  if (!ehHandBrake(dados)) throw new Error('Este arquivo não é uma lista de presets do HandBrake.')
  const fichas = []
  const deixados = {}
  for (const h of achatar(dados.PresetList).slice(0, 100)) {
    const r = fichaDoHandBrake(h)
    fichas.push(r.ficha)
    if (r.deixados.length) deixados[r.ficha.nome] = r.deixados
  }
  return { fichas, deixados }
}
