// Plano de conversão do Relay: decide tamanho, cadência, bitrate e áudio de um arquivo para um preset. Puro e
// testável; quem executa é app/motor.js (navegador, Mediabunny + WebCodecs) ou src/ffmpeg.js (computador, x264).
//
// Onde a qualidade se decide (e o que um conversor comum erra):
//  - Tamanho: pelo lado menor (vertical 1080×1920 já é 1080p), sem ampliar (salvo pedido do preset), dimensões pares.
//  - Cadência: acima do teto, divide por inteiro (60 → 30, 50 → 25, 59,94 → 29,97) em vez de cair em 30 cravado, que
//    soluça a cada poucos quadros.
//  - Bitrate: a tabela do preset pelo lado menor, ajustada pela área real do quadro (4:5 tem menos pixels que 16:9).
//  - Tamanho máximo: escolhe a maior resolução que ainda fica com bits por pixel suficientes, em vez de esmagar 4K em
//    10 MB.
//  - Cor: SDR sai marcado BT.709 nos três campos (H.273 1-1-1); HDR e gamut largo viram aviso, nunca silêncio.

import { preset as acharPreset } from './presets.js'

/** Lados menores que o Relay usa ao escolher resolução sozinho (tamanho máximo). */
export const ESCADA = [2160, 1440, 1080, 720, 540, 480, 360]

/** Resoluções que a pessoa pode pedir nos presets sem tela fixa. */
export const RESOLUCOES = [
  { id: 'original', nome: 'Original' },
  { id: 2160, nome: '4K' },
  { id: 1440, nome: '1440p' },
  { id: 1080, nome: '1080p' },
  { id: 720, nome: '720p' },
]

/** Abaixo disso (bits por pixel por quadro, H.264), a imagem desmancha: o tamanho máximo baixa a resolução antes. */
export const BPP_MINIMO = { avc: 0.075, hevc: 0.05 }

/** Margem do tamanho máximo: contêiner (~1%) e o desvio dos codificadores de bitrate (os de hardware passam do alvo). */
export const MARGEM_TAMANHO = 0.92

const par = (n) => Math.max(2, Math.round(n / 2) * 2)
const ehVertical = (l, a) => a > l

/**
 * Cadência de saída: a do arquivo, ou a maior divisão inteira dela que cabe no teto. 24 e 23,976 (e 30 e 29,97, 60 e
 * 59,94) contam como a mesma: sem a folga de 0,2%, 24 fps num teto de 23,976 cairia para 12.
 */
export function cadencia(fps, fpsMax) {
  const cabe = (x) => x <= fpsMax * 1.002 + 0.01
  if (!fps || !fpsMax || cabe(fps)) return { fps: fps || null, dividiu: 1 }
  for (let d = 2; d <= 8; d++) if (cabe(fps / d)) return { fps: Math.round((fps / d) * 1000) / 1000, dividiu: d }
  return { fps: fpsMax, dividiu: null }
}

/** kbit/s da tabela para um quadro: a faixa do lado menor (a de cima mais próxima), ajustada pela área real. */
export function bitrateTabela(tabela, largura, altura, fps) {
  if (!tabela) return null
  const lado = Math.min(largura, altura)
  const faixas = Object.keys(tabela)
    .map(Number)
    .sort((a, b) => a - b)
  const faixa = faixas.find((f) => f >= lado - 8) ?? faixas[faixas.length - 1]
  const base = tabela[faixa][fps > 31 ? 1 : 0]
  const areaFaixa = (faixa * faixa * 16) / 9
  return Math.round(base * Math.pow((largura * altura) / areaFaixa, 0.85))
}

/** Lado maior para um lado menor, mantendo a proporção do arquivo. */
function escalarPeloMenor(largura, altura, lado) {
  const menor = Math.min(largura, altura)
  const k = lado / menor
  return { largura: par(largura * k), altura: par(altura * k) }
}

/**
 * `origem`: { largura, altura (as da tela, já com rotação e pixel não quadrado), fps, duracao (s), temVideo,
 *   temAudio, canais, taxa, cor: { primaries, transfer, matrix, fullRange } | null, codec }
 * `opcoes`: { resolucao: 'original' | número (lado menor), preencher: bool (tela fixa: corta em vez de faixas),
 *   tamanhoMB: número (presets ajustáveis), motor: 'navegador' | 'computador' }
 */
export function planejar(origem, p, opcoes = {}) {
  const preset = typeof p === 'string' ? acharPreset(p) : p
  if (!preset) throw new Error('Preset desconhecido.')
  const avisos = []
  const motor = opcoes.motor ?? 'navegador'
  const tamanhoMax = preset.ajustavel && opcoes.tamanhoMB ? opcoes.tamanhoMB * 1e6 : (preset.tamanhoMax ?? null)

  // ─── trecho ───
  const t = preset.trecho ?? null
  const inicio = t?.inicio ?? 0
  if (t && origem.duracao && inicio >= origem.duracao) throw Object.assign(new Error(`O trecho começa em ${fmtTempo(inicio)}, depois do fim do arquivo.`), { codigo: 'trecho' })
  const fimTrecho = t?.fim != null ? (origem.duracao ? Math.min(t.fim, origem.duracao) : t.fim) : (origem.duracao ?? 0)
  // interpretar (conformar): todos os quadros, tocados na cadência nova; a duração muda junto
  const conforme = preset.video?.fpsConforme && origem.temVideo !== false ? conformacao(origem.fps, preset.video.fpsConforme) : null
  const duracao = Math.max(0, (fimTrecho || 0) - inicio) * (conforme?.fator ?? 1)
  const trecho = t ? { inicio: inicio || null, fim: t.fim != null ? fimTrecho : null } : null

  // ─── só no computador ───
  const comp = preset.computador ?? null
  const soComputador = comp ? ROTULOS_COMPUTADOR.filter(([k, , padrao]) => comp[k] != null && comp[k] !== padrao).map(([, nome]) => nome) : []
  if (motor === 'navegador' && soComputador.length) avisos.push(`${primeiraMaiuscula(lista(soComputador))}: só na Máxima qualidade (app do computador).`)

  // ─── áudio ───
  let audio = null
  if (origem.temAudio && preset.audio && !preset.semAudio) {
    const a = preset.audio
    const canais = Math.min(origem.canais || 2, a.canais ?? (a.codec === 'mp3' ? 2 : origem.canais || 2))
    let taxa = a.taxa ?? origem.taxa ?? 48000
    if (a.codec === 'mp3' && ![32000, 44100, 48000].includes(taxa)) taxa = taxa > 44100 ? 48000 : 44100
    if ((a.codec === 'aac' || a.codec === 'mp3') && taxa > 48000) taxa = 48000
    audio = { codec: a.codec, bitrate: a.kbps ? a.kbps * 1000 : null, taxa, canais }
    if (conforme && conforme.fator !== 1) audio.conforme = conforme.fator
    if (a.ganho) audio.ganho = a.ganho
    if (comp?.loudness && motor === 'computador') audio.loudness = comp.loudness
  } else if (!preset.video) {
    throw Object.assign(new Error('Este arquivo não tem áudio.'), { codigo: 'sem-audio' })
  }

  const extras = { trecho, computador: comp, receitaCor: preset.video ? (preset.cor ?? null) : null }
  if (!preset.video) {
    const bytes = audio.bitrate ? (audio.bitrate * duracao) / 8 : duracao * audio.taxa * audio.canais * 3
    return { preset: preset.id, formato: preset.formato, video: null, audio, tamanhoEstimado: Math.round(bytes), avisos, motor, ...extras }
  }
  if (origem.temVideo === false || !origem.largura) throw Object.assign(new Error('Este arquivo não tem vídeo.'), { codigo: 'sem-video' })

  if (conforme && conforme.fator !== 1) {
    const vel = `${fmtPct(100 / conforme.fator)} da velocidade`
    if (!conforme.somAcompanha && audio) {
      audio = null
      avisos.push(`${fmtFps(conforme.de)} → ${fmtFps(conforme.para)} fps com todos os quadros: ${vel}. O som fica de fora (não acompanha a câmera lenta).`)
    } else avisos.push(`${fmtFps(conforme.de)} → ${fmtFps(conforme.para)} fps com todos os quadros: ${vel}${audio ? ', e o som acompanha' : ''}.`)
  }

  // ─── giro e recorte: a imagem que entra na escala ───
  const v = preset.video
  const giro = v.giro ?? 0
  let ow = giro % 180 ? origem.altura : origem.largura
  let oh = giro % 180 ? origem.largura : origem.altura
  if (v.recorte) {
    ow -= v.recorte.esquerda + v.recorte.direita
    oh -= v.recorte.cima + v.recorte.baixo
    if (ow < 16 || oh < 16) throw Object.assign(new Error('O recorte come a imagem inteira.'), { codigo: 'recorte' })
  }

  // ─── cadência ───
  let cad
  if (conforme) cad = { fps: conforme.para, dividiu: 1 }
  else if (v.fpsExato) {
    cad = { fps: v.fpsExato, dividiu: 1 }
    if (origem.fps && Math.abs(origem.fps - v.fpsExato) > 0.01)
      avisos.push(`${fmtFps(origem.fps)} fps → ${fmtFps(v.fpsExato)} fps exatos: o Relay repete ou descarta quadros, e o movimento pode soluçar.`)
  } else {
    cad = cadencia(origem.fps, tamanhoMax ? Math.min(v.fpsMax, 30) : v.fpsMax)
    if (cad.dividiu > 1) avisos.push(`${fmtFps(origem.fps)} fps → ${fmtFps(cad.fps)} fps, um quadro a cada ${cad.dividiu}: o movimento fica igual.`)
    else if (cad.dividiu === null) avisos.push(`${fmtFps(origem.fps)} fps → ${fmtFps(cad.fps)} fps.`)
  }
  const fps = cad.fps || 30

  // ─── tamanho do quadro ───
  let largura
  let altura
  let encaixe = null // null = escala direta; 'contain' (faixas), 'cover' (corta) ou 'fill' (estica) numa tela fixa
  let imagem = null // o tamanho da imagem dentro da tela fixa
  const menorOrigem = Math.min(ow, oh)

  if (v.quadro) {
    largura = v.quadro.largura
    altura = v.quadro.altura
    const mesmaForma = Math.abs(ow / oh - largura / altura) < 0.01
    encaixe = mesmaForma ? null : (v.encaixe ?? (opcoes.preencher ? 'cover' : 'contain'))
    if (encaixe === 'contain') {
      const k = Math.min(largura / ow, altura / oh)
      imagem = { largura: par(ow * k), altura: par(oh * k) }
      if (ehVertical(largura, altura) && !ehVertical(ow, oh)) avisos.push('Vídeo deitado numa tela em pé: sai com faixas. "Preencher" corta as laterais.')
      else avisos.push('Proporção diferente da tela: sai com faixas. "Preencher" corta as sobras.')
    } else if (encaixe === 'cover') avisos.push('Preenchendo a tela: as sobras da imagem são cortadas.')
    else if (encaixe === 'fill') avisos.push('Proporção diferente da tela: a imagem é esticada.')
    const k = encaixe === 'contain' ? Math.min(largura / ow, altura / oh) : Math.max(largura / ow, altura / oh)
    if (k > 1.05) avisos.push(`Imagem ampliada (${Math.round(k * 100)}%): o arquivo é menor que ${largura}×${altura}.`)
  } else {
    let lado = v.ladoMenor ?? menorOrigem
    if (opcoes.resolucao && opcoes.resolucao !== 'original' && !preset.tamanhoMax) lado = Number(opcoes.resolucao)
    if (lado > menorOrigem && !v.ampliar) {
      if (opcoes.resolucao && opcoes.resolucao !== 'original') avisos.push(`O arquivo tem ${menorOrigem}p: não amplio para ${lado}p.`)
      lado = menorOrigem
    }
    if (v.ampliar && lado > menorOrigem) {
      if (menorOrigem < 1080) avisos.push(`Ampliar ${menorOrigem}p para ${lado}p não cria detalhe; o truque vale para 1080p.`)
      else avisos.push(`${menorOrigem}p ampliado para ${lado}p com Lanczos.`)
    }
    ;({ largura, altura } = escalarPeloMenor(ow, oh, lado))
  }

  // ─── bitrate ───
  let bitrate
  let modo = 'variavel'
  if (tamanhoMax) {
    if (!duracao) throw Object.assign(new Error('Sem a duração não dá para calcular o tamanho.'), { codigo: 'sem-duracao' })
    const totalKbps = (tamanhoMax * 8 * MARGEM_TAMANHO) / duracao / 1000
    if (audio) {
      // áudio proporcional ao orçamento: não gasta 128k de som num vídeo de 300k
      const kbpsAudio = Math.min(audio.bitrate / 1000, Math.max(48, Math.round(totalKbps * 0.12)))
      audio = { ...audio, bitrate: kbpsAudio * 1000 }
    }
    const kbpsVideo = totalKbps - (audio ? audio.bitrate / 1000 : 0)
    if (kbpsVideo < 80) throw Object.assign(new Error(`Longo demais para caber em ${mb(tamanhoMax)}: ficaria sem imagem.`), { codigo: 'nao-cabe' })
    // a maior resolução com bits por pixel suficientes
    const teto = Math.min(v.ladoMenor ?? menorOrigem, menorOrigem)
    const degraus = ESCADA.filter((l) => l <= teto)
    if (!degraus.length || degraus[0] !== teto) degraus.unshift(teto)
    let escolhido = degraus[degraus.length - 1]
    for (const l of degraus) {
      const d = escalarPeloMenor(ow, oh, l)
      if ((kbpsVideo * 1000) / (d.largura * d.altura * fps) >= BPP_MINIMO[v.codec]) {
        escolhido = l
        break
      }
    }
    if (!v.quadro) ({ largura, altura } = escalarPeloMenor(ow, oh, escolhido))
    if (escolhido < teto && !v.quadro) avisos.push(`Para caber em ${mb(tamanhoMax)}, sai em ${escolhido}p: mais nítido que ${teto}p espremido.`)
    const bpp = (kbpsVideo * 1000) / (largura * altura * fps)
    if (bpp < BPP_MINIMO[v.codec]) avisos.push(`Pouco espaço para ${fmtDuracao(duracao)}: a imagem vai perder detalhe.`)
    bitrate = Math.round(kbpsVideo * 1000)
    modo = 'constante'
  } else if (v.bitrateFixo) {
    bitrate = v.bitrateFixo * 1000 // preset da pessoa: o número que ela escolheu, sem ajuste pela área
    if (v.cbr) modo = 'constante'
  } else {
    bitrate = bitrateTabela(v.kbps, largura, altura, fps) * 1000
  }

  // ─── cor ───
  const cor = origem.cor
  const receitaCor = extras.receitaCor
  if (receitaCor?.entrada) {
    if (cor && (cor.transfer === 'pq' || cor.transfer === 'hlg')) avisos.push('Arquivo marcado HDR com conversão de log: confira se a entrada certa é mesmo o log da câmera.')
  } else if (cor && (cor.transfer === 'pq' || cor.transfer === 'hlg'))
    avisos.push('Arquivo HDR: sai em SDR sem conversão de tom, com as cores lavadas. Faça a versão SDR no editor.')
  else if (cor?.primaries && !['bt709', 'bt470bg', 'smpte170m'].includes(cor.primaries)) avisos.push(`Cor em ${cor.primaries}, não Rec.709: confira depois.`)

  const bytes = ((bitrate + (audio?.bitrate ?? 0)) * duracao) / 8
  return {
    entrada: corDeEntrada(origem),
    preset: preset.id,
    formato: preset.formato,
    motor,
    video: {
      codec: v.codec,
      largura,
      altura,
      encaixe,
      imagem,
      giro,
      espelhar: Boolean(v.espelhar),
      recorte: v.recorte ?? null,
      fps: conforme ? null : v.fpsExato ? v.fpsExato : cad.dividiu === 1 ? null : fps, // null = a cadência do arquivo
      fpsSaida: fps,
      fpsModo: conforme ? 'conformar' : v.fpsExato ? 'constante' : 'pico',
      conforme, // { de, para, fator }: o motor multiplica o tempo de cada quadro pelo fator
      bitrate,
      modo,
      fixo: Boolean(v.bitrateFixo),
      cbr: Boolean(v.cbr && !tamanhoMax),
      rf: Boolean(v.rf),
      gop: v.gop,
      crf: v.crf,
      teto: v.teto ?? null,
    },
    audio,
    cor: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false },
    tamanhoMax,
    tamanhoEstimado: Math.round(tamanhoMax ? Math.min(bytes, tamanhoMax) : bytes),
    avisos,
    ...extras,
  }
}

/** Até 5% de diferença (24 ↔ 23,976, 25 ↔ 24, 30 ↔ 29,97), o som acompanha a velocidade nova (o tom muda junto, como
 * no cinema e na TV); mais que isso é câmera lenta ou acelerado, e o som sai. */
export const CONFORME_SOM = 0.05

/** 40%, 99,9%, 104,2%. */
export const fmtPct = (x) => `${Number.isInteger(Math.round(x * 10) / 10) ? Math.round(x) : (Math.round(x * 10) / 10).toString().replace('.', ',')}%`

/** Interpretar `de` fps como `para` fps: { de, para, fator (duração nova ÷ antiga), somAcompanha }. */
export function conformacao(de, para) {
  if (!de) throw Object.assign(new Error('Sem a cadência do arquivo não dá para interpretar.'), { codigo: 'conformar' })
  const fator = Math.abs(de - para) < 0.001 ? 1 : de / para
  return { de, para, fator, somAcompanha: Math.abs(fator - 1) <= CONFORME_SOM }
}

/** [chave, nome, padrão] das opções que só o computador faz (o x264 e os filtros do ffmpeg). */
const ROTULOS_COMPUTADOR = [
  ['velocidade', 'velocidade do x264', 'slow'],
  ['ajuste', 'ajuste do x264', null],
  ['perfil', 'perfil', null],
  ['desentrelacar', 'desentrelaçar', false],
  ['ruido', 'redução de ruído', 0],
  ['nitidez', 'nitidez', 0],
  ['loudness', 'volume normalizado', null],
]
const lista = (itens) => (itens.length < 2 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`)
const primeiraMaiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1)

const MATRIZES = { bt709: 'bt709', smpte170m: 'bt601', bt470bg: 'bt601', bt601: 'bt601', 'bt2020-ncl': 'bt2020', bt2020nc: 'bt2020', bt2020: 'bt2020', smpte240m: 'smpte240m' }

/**
 * A matriz e a faixa do arquivo de entrada, para converter sem desvio (o ffmpeg, sem isso, supõe BT.601 e escurece o
 * HD). Sem marca: BT.709 para HD e BT.601 para SD, o mesmo palpite do ffmpeg.
 */
export function corDeEntrada(origem) {
  const marcada = MATRIZES[origem.cor?.matrix]
  const hd = Math.max(origem.largura ?? 0, origem.altura ?? 0) >= 1280 || Math.min(origem.largura ?? 0, origem.altura ?? 0) >= 720
  return { matriz: marcada ?? (hd ? 'bt709' : 'bt601'), faixa: origem.cor?.fullRange ? 'pc' : 'tv' }
}

const NOME_CODEC = { avc: 'H.264 High', hevc: 'HEVC Main', aac: 'AAC-LC', mp3: 'MP3 (LAME)', 'pcm-s24': 'PCM 24 bits', 'pcm-s16': 'PCM 16 bits' }
const CONTEINER = { mp4: 'MP4 (início rápido)', m4a: 'M4A', mp3: 'MP3', wav: 'WAV' }

/**
 * A ficha técnica do que vai sair, em linhas [rótulo, valor] (a tela mostra recolhida). `motor`: o que roda a
 * conversão muda o controle de bitrate e o que entra do computador.
 */
export function fichaTecnica(plano, motor = plano.motor ?? 'navegador') {
  const linhas = [['Contêiner', CONTEINER[plano.formato] ?? plano.formato]]
  const v = plano.video
  const c = plano.computador
  const noComputador = motor === 'computador'
  if (plano.trecho) linhas.push(['Trecho', `${fmtTempo(plano.trecho.inicio ?? 0)} → ${plano.trecho.fim != null ? fmtTempo(plano.trecho.fim) : 'o fim'}`])
  if (v) {
    const perfil = noComputador && c?.perfil && v.codec === 'avc' ? `H.264 ${c.perfil[0].toUpperCase()}${c.perfil.slice(1)}` : null
    linhas.push(['Vídeo', perfil ?? NOME_CODEC[v.codec] ?? v.codec])
    linhas.push(['Tamanho', `${v.largura}×${v.altura}${v.encaixe === 'contain' ? ' (com faixas)' : v.encaixe === 'cover' ? ' (preenchendo)' : v.encaixe === 'fill' ? ' (esticado)' : ''}`])
    if (v.recorte) linhas.push(['Recorte', Object.entries(v.recorte).filter(([, n]) => n).map(([lado, n]) => `${lado} ${n}`).join(' · ') + ' px'])
    if (v.giro || v.espelhar) linhas.push(['Giro', [v.giro ? `${v.giro}°` : null, v.espelhar ? 'espelhado' : null].filter(Boolean).join(' · ')])
    linhas.push(['Cadência', v.conforme ? `${fmtFps(v.conforme.para)} fps interpretados (todos os quadros, ${fmtPct(100 / v.conforme.fator)} da velocidade)` : v.fps ? `${String(v.fps).replace('.', ',')} fps${v.fpsModo === 'constante' ? ' exatos' : ''}` : 'a do arquivo'])
    const mbps = (v.bitrate / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
    if (noComputador && !plano.tamanhoMax && !v.fixo) linhas.push(['Qualidade', `constante (x264 RF ${v.crf})${v.teto ? `, até ${(v.bitrate * v.teto * 1e-6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} Mbit/s` : ''}`])
    else if (noComputador && v.cbr) linhas.push(['Bitrate', `${mbps} Mbit/s constante (CBR)`])
    else if (noComputador) linhas.push(['Bitrate', `${mbps} Mbit/s médio, 2 passadas`])
    else linhas.push(['Bitrate', `${mbps} Mbit/s ${v.modo === 'constante' ? 'constante' : 'variável'}${v.rf ? ` (RF ${v.crf} no computador)` : ''}`])
    linhas.push(['Quadro-chave', `a cada ${String(v.gop).replace('.', ',')} s`])
    if (noComputador && c) {
      const x264 = [NOME_VELOCIDADE[c.velocidade] ?? null, c.ajuste ? NOME_AJUSTE[c.ajuste] : null].filter(Boolean)
      if (x264.length) linhas.push([v.codec === 'hevc' ? 'x265' : 'x264', x264.join(' · ')])
      const filtros = [c.desentrelacar ? 'desentrelaçar' : null, c.ruido ? `ruído ${['', 'leve', 'médio', 'forte'][c.ruido]}` : null, c.nitidez ? `nitidez ${['', 'leve', 'média'][c.nitidez]}` : null].filter(Boolean)
      if (filtros.length) linhas.push(['Filtros', filtros.join(' · ')])
    }
    const r = plano.receitaCor
    linhas.push(['Cor', r ? `${[r.entrada ? `${r.entradaNome ?? r.entrada} → Rec.709` : null, r.look ? `look ${r.look.nome}${r.look.sobre === 'log' ? ' sobre o log' : ''}` : null].filter(Boolean).join(' · ')}, sai 1-1-1` : 'Rec.709 SDR, faixa de TV (H.273 1-1-1)'])
    linhas.push(['Redução', 'Lanczos-3'])
  }
  const a = plano.audio
  linhas.push(['Áudio', a ? [NOME_CODEC[a.codec] ?? a.codec, a.bitrate ? `${Math.round(a.bitrate / 1000)} kbit/s` : null, a.taxa ? `${(a.taxa / 1000).toLocaleString('pt-BR')} kHz` : null, a.canais === 1 ? 'mono' : a.canais === 2 ? 'estéreo' : a.canais ? `${a.canais} canais` : null, a.ganho ? `${a.ganho > 0 ? '+' : ''}${String(a.ganho).replace('.', ',')} dB` : null].filter(Boolean).join(' · ') : 'sem áudio'])
  if (a?.loudness) linhas.push(['Volume', `${a.loudness} LUFS (EBU R128)`])
  if (!noComputador && c) {
    const so = ROTULOS_COMPUTADOR.filter(([k, , padrao]) => c[k] != null && c[k] !== padrao).map(([, nome]) => nome)
    if (so.length) linhas.push(['Só no computador', lista(so)])
  }
  if (plano.tamanhoMax) linhas.push(['Limite', `${Math.round(plano.tamanhoMax / 1e6)} MB`])
  return linhas
}

const NOME_VELOCIDADE = { veryslow: 'muito lenta', slower: 'mais lenta', slow: 'lenta', medium: 'média', fast: 'rápida', faster: 'mais rápida', veryfast: 'muito rápida' }
const NOME_AJUSTE = { film: 'filme', grain: 'granulação', animation: 'animação' }

/** Extensão do arquivo de saída. */
export const extensao = (formato) => ({ mp4: 'mp4', mp3: 'mp3', wav: 'wav', m4a: 'm4a' })[formato] ?? 'mp4'

/** "filme-master.mov" + YouTube 1080p → "filme-master (YouTube 1080p).mp4". */
export function nomeSaida(nome, p) {
  const preset = typeof p === 'string' ? acharPreset(p) : p
  const base = String(nome).replace(/\.[^./]+$/, '') || 'video'
  return `${base} (${preset.nome.replace(/[\\/:*?"<>|]/g, '')}).${extensao(preset.formato)}`
}

const fmt = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const fmtFps = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const mb = (b) => `${Math.round(b / 1e6)} MB`

/** 65,5 → "1:05,5"; 3725 → "1:02:05". */
export function fmtTempo(s) {
  const inteiro = Math.floor(s)
  const resto = Math.round((s - inteiro) * 10) / 10
  const h = Math.floor(inteiro / 3600)
  const m = Math.floor((inteiro % 3600) / 60)
  const seg = String(inteiro % 60).padStart(2, '0') + (resto ? `,${String(resto).slice(2)}` : '')
  return h ? `${h}:${String(m).padStart(2, '0')}:${seg}` : `${m}:${seg}`
}

export function fmtDuracao(s) {
  const t = Math.round(s)
  const m = Math.floor(t / 60)
  return m ? `${m} min ${String(t % 60).padStart(2, '0')} s` : `${t} s`
}

/** "1,2 GB", "350 MB", "820 KB". */
export function tamanhoLegivel(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: bytes < 1e7 ? 1 : 0 })} MB`
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`
}

/** Acima disso, sem gravar direto numa pasta, o celular pode não ter memória para montar o arquivo. */
export const LIMITE_MEMORIA = 1.5e9
