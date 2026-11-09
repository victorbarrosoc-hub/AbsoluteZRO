// CAMZRO · controles da câmera. Conta pura: traduz o que o navegador diz que a câmera aceita
// (MediaTrackCapabilities, da especificação Media Capture e Image Capture) para os controles da tela, e de volta.
//
// Unidades da especificação:
// - exposureTime em centenas de microssegundos (1/48 s = 208,33). Aqui tudo fica em segundos e só a borda converte.
// - colorTemperature em Kelvin; focusDistance em metros; zoom em razão (1 = sem zoom); iso direto.
// Só aparece na tela o que a câmera deste aparelho aceita: nada de controle que não faz nada.

export const UNIDADE_EXPOSICAO = 1e-4 // 100 µs

const num = (v) => (Number.isFinite(v) ? v : null)
const faixa = (c) => (c && Number.isFinite(c.min) && Number.isFinite(c.max) && c.max > c.min ? { min: c.min, max: c.max, passo: c.step > 0 ? c.step : 0 } : null)

/** O que esta câmera deixa controlar. caps = track.getCapabilities(), ajustes = track.getSettings(). */
export function lerCapacidades(caps = {}, ajustes = {}) {
  const exp = faixa(caps.exposureTime)
  const modos = (v) => (Array.isArray(v) ? v.filter((m) => typeof m === 'string') : [])
  const r = {
    iso: faixa(caps.iso),
    tempo: exp ? { min: exp.min * UNIDADE_EXPOSICAO, max: exp.max * UNIDADE_EXPOSICAO, passo: exp.passo * UNIDADE_EXPOSICAO } : null,
    compensacao: faixa(caps.exposureCompensation),
    kelvin: faixa(caps.colorTemperature),
    foco: faixa(caps.focusDistance),
    zoom: faixa(caps.zoom),
    tocha: Array.isArray(caps.torch) ? caps.torch.includes(true) : caps.torch === true,
    modoExposicao: modos(caps.exposureMode),
    modoFoco: modos(caps.focusMode),
    modoBalanco: modos(caps.whiteBalanceMode),
    largura: faixa(caps.width),
    altura: faixa(caps.height),
    fps: faixa(caps.frameRate),
    voltada: typeof ajustes.facingMode === 'string' ? ajustes.facingMode : null,
    contraste: faixa(caps.contrast),
    saturacao: faixa(caps.saturation),
    nitidez: faixa(caps.sharpness),
    // como a câmera abriu: é para onde o perfil Padrão volta
    imagemPadrao: { contraste: num(ajustes.contrast), saturacao: num(ajustes.saturation), nitidez: num(ajustes.sharpness) },
    pontos: 'pointsOfInterest' in ajustes || 'pointsOfInterest' in caps,
  }
  r.exposicaoManual = Boolean(r.tempo && r.iso && r.modoExposicao.includes('manual'))
  r.focoManual = Boolean(r.foco && r.modoFoco.includes('manual'))
  r.balancoManual = Boolean(r.kelvin && r.modoBalanco.includes('manual'))
  r.travaExposicao = r.modoExposicao.includes('manual') || r.modoExposicao.includes('single-shot')
  r.travaFoco = r.modoFoco.includes('manual') || r.modoFoco.includes('single-shot')
  r.travaBalanco = r.modoBalanco.includes('manual') || r.modoBalanco.includes('single-shot')
  r.neutro = Boolean(r.contraste || r.nitidez)
  r.algumManual = r.exposicaoManual || r.focoManual || r.balancoManual || Boolean(r.compensacao || r.zoom || r.tocha)
  return r
}

/** Prende o valor na faixa e no passo da câmera. */
export function prender(v, f) {
  if (!f) return v
  let x = Math.min(f.max, Math.max(f.min, v))
  if (f.passo > 0) x = f.min + Math.round((x - f.min) / f.passo) * f.passo
  return Math.min(f.max, Math.max(f.min, Number(x.toFixed(10))))
}

/** ISOs em terços de stop (100, 125, 160, 200…) dentro da faixa da câmera. */
export function isosDaCamera(f) {
  const base = [25, 32, 40, 50, 64, 80, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400, 8000, 10000, 12800, 25600]
  if (!f) return []
  const dentro = base.filter((v) => v >= f.min - 1e-6 && v <= f.max + 1e-6)
  return dentro.length ? dentro : [f.min, f.max]
}

/**
 * Neutro ZRO: o perfil plano do CAMZRO (titular, 09/11/2026). Não é Log: a imagem continua Rec.709 de 8 bits; só tira
 * do processamento do aparelho o que não se desfaz na edição. Nitidez no mínimo (o realce de borda não sai depois);
 * contraste e saturação a um terço do caminho entre o mínimo e como a câmera abriu (sem lavar a imagem a ponto de o
 * 8 bits virar degrau na correção). Sem o valor de abertura, o meio da faixa. Só o que a câmera aceita.
 */
export function imagemNeutra(cap) {
  const r = {}
  const terco = (f, padrao) => prender(f.min + ((padrao ?? (f.min + f.max) / 2) - f.min) / 3, f)
  if (cap.contraste) r.contrast = terco(cap.contraste, cap.imagemPadrao?.contraste)
  if (cap.saturacao) r.saturation = terco(cap.saturacao, cap.imagemPadrao?.saturacao)
  if (cap.nitidez) r.sharpness = cap.nitidez.min
  return r
}

/** O perfil Padrão: devolve contraste, saturação e nitidez a como a câmera abriu (o que se souber). */
export function imagemPadrao(cap) {
  const r = {}
  const p = cap.imagemPadrao || {}
  if (cap.contraste && p.contraste != null) r.contrast = prender(p.contraste, cap.contraste)
  if (cap.saturacao && p.saturacao != null) r.saturation = prender(p.saturacao, cap.saturacao)
  if (cap.nitidez && p.nitidez != null) r.sharpness = prender(p.nitidez, cap.nitidez)
  return r
}

/** Restrições para aplicar na track (applyConstraints) a partir dos controles da tela. Só o que a câmera aceita. */
export function restricoes(cap, c) {
  const a = {}
  if (cap.exposicaoManual && ['manual', 'obturador', 'iso'].includes(c.exposicao)) {
    a.exposureMode = 'manual'
    if (c.tempo) a.exposureTime = prender(c.tempo, cap.tempo) / UNIDADE_EXPOSICAO
    if (c.iso) a.iso = prender(c.iso, cap.iso)
  } else if (c.exposicao === 'travada' && cap.travaExposicao) {
    a.exposureMode = cap.modoExposicao.includes('manual') ? 'manual' : 'single-shot'
  } else if (cap.modoExposicao.includes('continuous')) {
    a.exposureMode = 'continuous'
    if (cap.compensacao && Number.isFinite(c.compensacao)) a.exposureCompensation = prender(c.compensacao, cap.compensacao)
  }
  if (cap.balancoManual && c.balanco === 'manual' && c.kelvin) {
    a.whiteBalanceMode = 'manual'
    a.colorTemperature = prender(c.kelvin, cap.kelvin)
  } else if (c.balanco === 'travado' && cap.travaBalanco) {
    a.whiteBalanceMode = cap.modoBalanco.includes('manual') ? 'manual' : 'single-shot'
  } else if (cap.modoBalanco.includes('continuous')) a.whiteBalanceMode = 'continuous'
  if (cap.focoManual && c.foco === 'manual' && Number.isFinite(c.distancia)) {
    a.focusMode = 'manual'
    a.focusDistance = prender(c.distancia, cap.foco)
  } else if (c.foco === 'travado' && cap.travaFoco) {
    a.focusMode = cap.modoFoco.includes('manual') ? 'manual' : 'single-shot'
  } else if (cap.modoFoco.includes('continuous')) a.focusMode = 'continuous'
  if (cap.zoom && Number.isFinite(c.zoom)) a.zoom = prender(c.zoom, cap.zoom)
  if (cap.tocha) a.torch = Boolean(c.tocha)
  if (cap.neutro) Object.assign(a, c.perfil === 'neutro' ? imagemNeutra(cap) : imagemPadrao(cap))
  return a
}

/** Ponto de interesse (toque para focar/expor) em coordenadas 0–1 do quadro, já prendido. */
export const pontoDeInteresse = (x, y) => [{ x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }]

/** Toque na tela (x, y em px de um elemento que mostra o vídeo em "contain") → ponto 0–1 no quadro, ou null fora. */
export function toqueNoQuadro(x, y, caixa, quadro) {
  const escala = Math.min(caixa.largura / quadro.largura, caixa.altura / quadro.altura)
  const w = quadro.largura * escala
  const h = quadro.altura * escala
  const ox = (caixa.largura - w) / 2
  const oy = (caixa.altura - h) / 2
  const u = (x - ox) / w
  const v = (y - oy) / h
  return u < 0 || u > 1 || v < 0 || v > 1 ? null : { x: u, y: v }
}

/** Resoluções pedidas à câmera, da maior para a menor (o navegador entrega a mais perto que a câmera tem). */
export const RESOLUCOES = [
  { id: '4k', largura: 3840, altura: 2160, rotulo: '4K' },
  { id: '1440', largura: 2560, altura: 1440, rotulo: '1440p' },
  { id: '1080', largura: 1920, altura: 1080, rotulo: '1080p' },
  { id: '720', largura: 1280, altura: 720, rotulo: '720p' },
]
