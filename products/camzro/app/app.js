// CAMZRO · o app. Junta o motor (motor/), as contas (nucleo/) e a tela. Uma tela de captura, uma ação principal
// (gravar) e o resto em folhas que abrem por cima. Só aparece controle que a câmera deste aparelho aceita.

import * as E from './estado.js'
import { pintar, svg } from './icones.js'
import * as cam from './motor/camera.js'
import { criarMonitor } from './motor/monitor.js'
import { criarFormaDeOnda, criarHistograma, criarVectorscope } from './motor/scopes.js'
import * as som from './motor/som.js'
import * as arm from './motor/armazem.js'
import * as grav from './motor/gravador.js'
import * as exp from './nucleo/exposicao.js'
import * as tc from './nucleo/timecode.js'
import * as cl from './nucleo/claquete.js'
import * as md from './nucleo/metadados.js'
import { lerCube, paraTextura, ErroLut } from './nucleo/lut.js'
import { cubeDoLook, look as lookPorId } from './nucleo/looks.js'
import { bitrateAudio, bitrateSugerido, bitrateTexto, nivelDoEspaco, segundosQueCabem, tempoTexto } from './nucleo/armazenamento.js'
import { guia, areaSegura, PROPORCOES, caixaDaPrevia, nivel as calcNivel } from './nucleo/guias.js'
import { posicaoNoMedidor } from './nucleo/audio.js'
import { amostra, combinar, qualidade } from './nucleo/relogio.js'
import { FALSA_COR, lumaMedia } from './nucleo/cor.js'
import { RESOLUCOES } from './nucleo/controles.js'
import { eloDoClipe, posicao as posicaoNoRoteiro } from './nucleo/maestro.js'
import { abrirFolha, fecharFolha, folhaAberta, redesenharFolha, registrarFolhas } from './paineis.js'
import * as bib from './biblioteca.js'

export const $ = (id) => document.getElementById(id)
const metaDe = (n) => document.querySelector(`meta[name="${n}"]`)?.content || ''
export const MODO = metaDe('camzro-modo') // conta | previa | local
const SET = metaDe('camzro-set')
const SET_API = metaDe('camzro-set-api')

/** Ajustes (persistem) e o estado do momento (não persiste). */
export let A = E.carregar()
export const S = {
  aparelho: E.aparelho(),
  stream: null,
  video: null,
  audio: null,
  ajustes: null,
  capacidades: null,
  monitor: null,
  oQueGrava: null,
  sessao: null,
  fechando: false,
  lut: null,
  lutNome: '',
  lupa: false,
  lupaPos: { x: 0.5, y: 0.5 },
  relogio: null, // { diferenca, incerteza }
  espaco: null,
  ultimoClipe: null,
  roteiro: E.roteiro(),
  leitura: null,
  medidaAuto: null, // exposição que o automático achou (para o ND)
  nivelZero: 0,
  avisoTempo: 0,
}

// ───────── ajustes ─────────

export function definir(caminho, valor) {
  const [grupo, chave] = caminho.split('.')
  if (chave === undefined) A = E.limpar({ ...A, [grupo]: valor })
  else A = E.limpar({ ...A, [grupo]: { ...A[grupo], [chave]: valor } })
  E.salvar(A)
  efeito(caminho)
}

const REABRE = new Set(['formato.resolucao', 'formato.cadencia', 'camera.camera', 'camera.voltada', 'camera.microfone', 'formato.audio'])
function efeito(caminho) {
  const grupo = caminho.split('.')[0]
  if (REABRE.has(caminho)) return void reabrir()
  if (grupo === 'camera') void aplicarControles()
  if (caminho === 'monitor.look') usarLook()
  if (grupo === 'monitor') desenharSobre()
  if (grupo === 'tema') aplicarTema()
  atualizarTela()
}

export function substituirAjustes(novo) {
  const antes = A
  A = E.limpar(novo)
  E.salvar(A)
  const mudouCamera = ['resolucao', 'cadencia', 'audio'].some((k) => antes.formato[k] !== A.formato[k])
  if (mudouCamera) void reabrir()
  else void aplicarControles()
  desenharSobre()
  aplicarTema()
  atualizarTela()
}

function aplicarTema() {
  document.documentElement.dataset.tema = A.tema
  for (const img of document.querySelectorAll('.inicio .simbolo-tema')) img.src = A.tema === 'escuro' ? img.dataset.escuro : img.dataset.claro
  document.querySelector('zro-set')?.setAttribute('tema', A.tema === 'escuro' ? 'escuro' : 'claro')
}

// ───────── avisos ─────────

let avisoTimer = 0
export function avisar(texto, { ruim = false, ms = 3200 } = {}) {
  const el = $('aviso')
  el.textContent = texto
  el.classList.toggle('ruim', ruim)
  el.hidden = false
  clearTimeout(avisoTimer)
  avisoTimer = setTimeout(() => (el.hidden = true), ms)
}

// ───────── câmera ─────────

export const cadencia = () => exp.cadencia(A.formato.cadencia) || exp.cadencia('30')
export const df = () => tc.base(cadencia().fps).podeDF

async function abrirCamera() {
  const res = RESOLUCOES.find((r) => r.id === A.formato.resolucao) || RESOLUCOES[2]
  const c = cadencia()
  const r = await cam.abrir({
    camera: A.camera.camera || null,
    voltada: A.camera.voltada,
    microfone: A.camera.microfone || null,
    largura: res.largura,
    altura: res.altura,
    fps: c.nominal,
    comAudio: A.formato.audio !== 'sem',
  })
  S.stream = r.stream
  S.video = r.video
  S.audio = r.audio
  S.ajustes = r.ajustes
  S.capacidades = r.capacidades
  S.video.addEventListener('ended', () => {
    if (S.sessao) void parar('A câmera foi fechada por outro app. O take foi salvo até aqui.')
    else avisar('A câmera foi fechada por outro app. Toque para abrir de novo.', { ruim: true, ms: 6000 })
  })
  if (r.stream.semAudio && A.formato.audio !== 'sem') avisar('Sem microfone: gravando só a imagem.', { ruim: true })
  else avisarSoAutomatico(r.capacidades)
  const v = $('video')
  v.srcObject = r.stream
  await v.play().catch(() => {})
  if (!S.monitor) {
    S.monitor = criarMonitor($('tela'), v, { opcoes: opcoesDoMonitor, aoScope: desenharScope })
    $('visor').classList.toggle('sem-gl', !S.monitor)
    if (!S.monitor) avisar('Sem WebGL2: imagem direta, sem falsa cor, zebra e foco.', { ruim: true, ms: 6000 })
  }
  pararMedidor()
  pararMedidor = await som.medir(S.audio, (l) => (S.leitura = l))
  await aplicarControles()
  const fps = c.fps
  S.oQueGrava = await grav.oQueGrava({ largura: S.ajustes.largura || res.largura, altura: S.ajustes.altura || res.altura, fps, bitrate: 20e6 })
  if (S.ajustes.fps && Math.abs(S.ajustes.fps - c.nominal) > 0.6) avisar(`A câmera entrega ${Math.round(S.ajustes.fps)} fps; o arquivo sai a ${c.rotulo} fps.`, { ms: 5000 })
  posicionar()
  atualizarTela()
}

let pararMedidor = () => {}

async function reabrir() {
  if (S.sessao) return avisar('Pare de gravar para trocar o formato.')
  cam.fechar(S.stream)
  try {
    await abrirCamera()
  } catch (e) {
    avisar(mensagemDeErro(e), { ruim: true, ms: 6000 })
  }
}

async function aplicarControles() {
  if (!S.video || !S.capacidades) return
  const c = A.camera
  const fps = cadencia().fps
  // guarda o que o automático achou antes de travar (para a calculadora de ND)
  if (S.ajustes?.tempo && S.ajustes?.iso && c.exposicao === 'auto') S.medidaAuto = { tempo: S.ajustes.tempo, iso: S.ajustes.iso }
  let tempo = c.tempo || exp.anguloParaTempo(c.angulo, fps)
  let iso = c.iso || S.ajustes?.iso || S.capacidades.iso?.min || null
  // prioridade: o que está livre vem do laço de exposição (lacoDeExposicao)
  if (c.exposicao === 'obturador') iso = S.isoAuto ?? S.ajustes?.iso ?? S.capacidades.iso?.min ?? null
  if (c.exposicao === 'iso') tempo = S.tempoAuto ?? S.ajustes?.tempo ?? 1 / (2 * fps)
  S.aplicando = true
  try {
    S.ajustes = await cam.aplicar(S.video, S.capacidades, { ...c, tempo, iso })
  } finally {
    S.aplicando = false
  }
  atualizarTela()
}

function mensagemDeErro(e) {
  const n = e?.name || ''
  if (n === 'NotAllowedError') return 'Sem permissão para a câmera. Libere nos ajustes do navegador.'
  if (n === 'NotFoundError') return 'Nenhuma câmera encontrada.'
  if (n === 'NotReadableError') return 'A câmera está em uso por outro app.'
  if (n === 'OverconstrainedError') return 'Esta câmera não grava nesse formato.'
  if (!window.isSecureContext) return 'A câmera só abre em https.'
  return 'Não deu para abrir a câmera.'
}

// ───────── monitor e sobreposições ─────────

function opcoesDoMonitor() {
  const m = A.monitor
  return {
    lut: S.lut,
    falsaCor: m.falsaCorLigada ? m.falsaCor : null,
    zebra: m.zebra ? { modo: m.zebraModo, nivel: m.zebraNivel } : null,
    pico: m.pico ? { sensibilidade: m.picoSensibilidade, cor: E.CORES_PICO[m.picoCor] } : null,
    mono: m.mono,
    lupa: S.lupa ? { x: S.lupaPos.x, y: S.lupaPos.y, zoom: 4 } : null,
    espelho: m.espelho || S.ajustes?.voltada === 'user',
  }
}

/** O retângulo da imagem no visor (contain, com o anamórfico esticado). Tela, sobreposição e toque seguem ele. */
function posicionar() {
  const visor = $('visor')
  const vw = S.ajustes?.largura || 16
  const vh = S.ajustes?.altura || 9
  document.documentElement.style.setProperty('--proporcao', `${(vw * A.monitor.anamorfico) / vh}`)
  const r = visor.getBoundingClientRect()
  const caixa = caixaDaPrevia(vw, vh, A.monitor.anamorfico, r.width, r.height)
  const x = (r.width - caixa.largura) / 2
  const y = (r.height - caixa.altura) / 2
  for (const id of ['tela', 'sobre', 'toque']) {
    const el = $(id)
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.style.width = `${caixa.largura}px`
    el.style.height = `${caixa.altura}px`
  }
  desenharSobre()
}

/** Guias, grade, centro e área segura em SVG por cima da imagem (nítido em qualquer tela). */
function desenharSobre() {
  const el = $('sobre')
  const w = el.clientWidth || 1
  const h = el.clientHeight || 1
  const m = A.monitor
  const partes = []
  if (m.guia) {
    const p = PROPORCOES.find((x) => x.id === m.guia)
    const g = guia(p.valor, w, h)
    const gx = g.x * w
    const gy = g.y * h
    const gw = g.largura * w
    const gh = g.altura * h
    partes.push(`<path fill="rgba(0,0,0,0.55)" fill-rule="evenodd" d="M0 0H${w}V${h}H0Z M${gx} ${gy}V${gy + gh}H${gx + gw}V${gy}Z"/>`)
    partes.push(`<rect x="${gx + 0.5}" y="${gy + 0.5}" width="${gw - 1}" height="${gh - 1}" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>`)
    partes.push(`<text x="${gx + 8}" y="${gy + 18}" fill="rgba(255,255,255,0.8)" font-size="12" font-weight="700" font-family="Figtree, system-ui">${p.rotulo}</text>`)
  }
  if (m.grade) {
    const l = 'stroke="rgba(255,255,255,0.35)" stroke-width="1"'
    for (const f of [1 / 3, 2 / 3]) partes.push(`<line x1="${w * f}" y1="0" x2="${w * f}" y2="${h}" ${l}/><line x1="0" y1="${h * f}" x2="${w}" y2="${h * f}" ${l}/>`)
  }
  if (m.aurea) {
    const l = 'stroke="rgba(255,214,10,0.45)" stroke-width="1"'
    for (const f of [0.382, 0.618]) partes.push(`<line x1="${w * f}" y1="0" x2="${w * f}" y2="${h}" ${l}/><line x1="0" y1="${h * f}" x2="${w}" y2="${h * f}" ${l}/>`)
  }
  if (m.centro) partes.push(`<path d="M${w / 2 - 12} ${h / 2}H${w / 2 + 12}M${w / 2} ${h / 2 - 12}V${h / 2 + 12}" stroke="rgba(255,255,255,0.8)" stroke-width="1.5"/>`)
  if (m.segura)
    for (const f of [0.9, 0.8]) {
      const a = areaSegura(f)
      partes.push(`<rect x="${a.x * w}" y="${a.y * h}" width="${a.largura * w}" height="${a.altura * h}" fill="none" stroke="rgba(255,255,255,0.4)" stroke-dasharray="6 6"/>`)
    }
  el.setAttribute('viewBox', `0 0 ${w} ${h}`)
  el.innerHTML = partes.join('')
  // legenda da falsa cor
  const leg = $('legenda')
  leg.hidden = !m.falsaCorLigada
  if (m.falsaCorLigada) {
    const t = FALSA_COR[m.falsaCor]
    leg.innerHTML = t.faixas.map((f) => `<span><i style="background:rgb(${f.cor.map((c) => Math.round(c * 255)).join(',')})"></i>${f.nome}</span>`).join('')
  }
  $('scope').hidden = !m.scopes
  $('scope').classList.toggle('vetor', m.scopes === 'vetor')
  $('nivel').hidden = !m.nivel
}

const desenhistas = {}
function desenharScope(rgba, w, h) {
  lacoDeExposicao(rgba, w, h)
  const modo = A.monitor.scopes
  if (!modo) return
  const canvas = $('scope-canvas')
  if (canvas.dataset.modo !== modo) {
    canvas.dataset.modo = modo
    desenhistas.atual = modo === 'histograma' ? criarHistograma(canvas) : modo === 'vetor' ? criarVectorscope(canvas) : criarFormaDeOnda(canvas)
  }
  const r = desenhistas.atual(rgba, w, h, modo === 'parade' ? 'parade' : 'luma')
  $('scope-aviso').textContent = r && r.cortadoEmCima > 1 ? `estouro ${Math.round(r.cortadoEmCima)}%` : ''
}

/**
 * Prioridade de obturador ou de ISO: o celular não dá esse modo ao navegador, então o CAMZRO fecha o laço — mede a
 * luma do quadro (centro com mais peso) e corrige o que está livre em até 1/3 de stop por vez.
 */
function lacoDeExposicao(rgba, w, h) {
  const modo = A.camera.exposicao
  if ((modo !== 'obturador' && modo !== 'iso') || !S.capacidades?.exposicaoManual || S.aplicando || S.sessaoAjuste > performance.now()) return
  S.sessaoAjuste = performance.now() + 250
  const fps = cadencia().fps
  const stops = exp.stopsParaAlvo(lumaMedia(rgba, w, h), { ev: A.camera.ev })
  const atual = { iso: S.isoAuto ?? S.ajustes?.iso ?? S.capacidades.iso.min, tempo: S.tempoAuto ?? S.ajustes?.tempo ?? 1 / (2 * fps) }
  if (modo === 'obturador') atual.tempo = A.camera.tempo || exp.anguloParaTempo(A.camera.angulo, fps)
  else atual.iso = A.camera.iso || atual.iso
  const r = stops ? exp.aplicarStops(atual, stops, modo, { iso: S.capacidades.iso, tempo: S.capacidades.tempo, fps }) : { ...atual, limite: null }
  if (r.limite && performance.now() - S.avisoTempo > 8000) {
    S.avisoTempo = performance.now()
    avisar(r.limite === 'luz-demais' ? 'Luz demais para este obturador: ponha ND (Calculadora do set).' : 'Falta luz: suba o ISO, abra o obturador ou ilumine.', { ms: 4000 })
  }
  if (!stops || (Math.abs(r.iso - atual.iso) < 0.5 && Math.abs(r.tempo - atual.tempo) < 1e-6)) return
  if (modo === 'obturador') S.isoAuto = r.iso
  else S.tempoAuto = r.tempo
  void aplicarControles()
}

// ───────── toque no visor: focar, lupa, pinça para zoom ─────────

/** Uma vez por aparelho: sem nenhum controle manual (Safari no iPhone), diz o que dá e onde está o resto. */
function avisarSoAutomatico(cap) {
  if (cap.exposicaoManual || cap.balancoManual || cap.focoManual) return
  try {
    if (localStorage.getItem('camzro.aviso-automatico')) return
    localStorage.setItem('camzro.aviso-automatico', '1')
  } catch {}
  // depois dos avisos da abertura (cadência, microfone), para não sumir debaixo deles
  setTimeout(() => avisar('Aqui a câmera fica no automático, com trava. Controle manual completo: no Android.', { ms: 6000 }), 3500)
}

/** O botão Exposição (aparelho sem ISO e obturador): um toque trava, outro solta. */
function alternarExposicao() {
  const cap = S.capacidades || {}
  if (!cap.travaExposicao) return avisar('Neste aparelho a exposição é só automática.')
  const travar = A.camera.exposicao !== 'travada'
  A = E.limpar({ ...A, camera: { ...A.camera, exposicao: travar ? 'travada' : 'auto' } })
  E.salvar(A)
  void aplicarControles()
  avisar(travar ? 'Exposição travada' : 'Exposição no automático', { ms: 1500 })
  navigator.vibrate?.(10)
}

function travarAeAf() {
  const cap = S.capacidades || {}
  if (!cap.travaExposicao && !cap.travaFoco) return avisar('Este aparelho não deixa travar exposição e foco.')
  S.travouAgora = true
  const travado = A.camera.exposicao === 'travada' || A.camera.foco === 'travado'
  A = E.limpar({ ...A, camera: { ...A.camera, exposicao: travado ? 'auto' : cap.travaExposicao ? 'travada' : A.camera.exposicao, foco: travado ? 'auto' : cap.travaFoco ? 'travado' : A.camera.foco } })
  E.salvar(A)
  void aplicarControles()
  avisar(travado ? 'AE/AF soltos' : 'AE/AF travados', { ms: 1500 })
  navigator.vibrate?.(10)
}

function ligarToque() {
  const el = $('toque')
  const toques = new Map()
  let pinca = null
  let segurar = 0
  let arrasto = null
  el.addEventListener('pointerdown', (e) => {
    toques.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY })
    clearTimeout(segurar)
    arrasto = null
    // segurar ~0,6 s: trava (ou solta) exposição e foco, como no app de câmera do celular
    if (toques.size === 1) segurar = setTimeout(() => travarAeAf(), 600)
    if (toques.size === 2 && S.capacidades?.zoom) {
      const [a, b] = [...toques.values()]
      pinca = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: A.camera.zoom }
    }
  })
  el.addEventListener('pointermove', (e) => {
    const t = toques.get(e.pointerId)
    if (!t) return
    toques.set(e.pointerId, { ...t, x: e.clientX, y: e.clientY })
    const dy = t.y0 - e.clientY
    if (toques.size === 1 && !S.lupa && (arrasto || Math.abs(dy) > 14)) {
      // arrastar para cima ou para baixo: EV (1 stop a cada ~120 px)
      clearTimeout(segurar)
      arrasto ??= { ev: A.camera.exposicao === 'auto' ? A.camera.compensacao : A.camera.ev }
      const ev = Math.round(Math.max(-3, Math.min(3, arrasto.ev + dy / 120)) * 3) / 3
      if (A.camera.exposicao === 'auto' && S.capacidades?.compensacao) A = E.limpar({ ...A, camera: { ...A.camera, compensacao: ev } })
      else A = E.limpar({ ...A, camera: { ...A.camera, ev } })
      avisar(`EV ${ev > 0 ? '+' : ev < 0 ? '−' : ''}${Math.abs(ev).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`, { ms: 900 })
      void aplicarControles()
      return
    }
    if (Math.hypot(e.clientX - t.x0, e.clientY - t.y0) > 10) clearTimeout(segurar)
    if (pinca && toques.size === 2) {
      const [a, b] = [...toques.values()]
      const z = Math.min(S.capacidades.zoom.max, Math.max(S.capacidades.zoom.min, (pinca.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinca.d))
      A = E.limpar({ ...A, camera: { ...A.camera, zoom: Math.round(z * 10) / 10 } })
      void aplicarControles()
    }
  })
  const fim = (e) => {
    const era = toques.get(e.pointerId)
    toques.delete(e.pointerId)
    clearTimeout(segurar)
    if (arrasto) {
      arrasto = null
      E.salvar(A)
      return
    }
    if (S.travouAgora) {
      S.travouAgora = false
      return
    }
    if (pinca) {
      if (!toques.size) {
        pinca = null
        E.salvar(A)
      }
      return
    }
    if (!era || e.type === 'pointercancel') return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    if (x < 0 || x > 1 || y < 0 || y > 1) return
    if (S.lupa) {
      S.lupaPos = { x: Math.min(0.875, Math.max(0.125, x)), y: Math.min(0.875, Math.max(0.125, y)) }
      return
    }
    const alvo = $('foco-alvo')
    alvo.hidden = true
    void alvo.offsetWidth
    alvo.style.left = `${e.clientX - $('visor').getBoundingClientRect().left}px`
    alvo.style.top = `${e.clientY - $('visor').getBoundingClientRect().top}px`
    alvo.hidden = false
    setTimeout(() => (alvo.hidden = true), 1200)
    if (S.video && S.capacidades) void cam.focarNoPonto(S.video, S.capacidades, x, y)
  }
  el.addEventListener('pointerup', fim)
  el.addEventListener('pointercancel', fim)
  el.addEventListener('dblclick', () => alternarFerramenta('lupa'))
}

// ───────── ferramentas ─────────

const CICLO_SCOPES = ['', 'histograma', 'onda', 'parade', 'vetor']
function alternarFerramenta(f) {
  if (f === 'lupa') {
    S.lupa = !S.lupa
    S.lupaPos = { x: 0.5, y: 0.5 }
  } else if (f === 'scopes') definir('monitor.scopes', CICLO_SCOPES[(CICLO_SCOPES.indexOf(A.monitor.scopes) + 1) % CICLO_SCOPES.length])
  else if (f === 'guias') {
    // liga e desliga as guias como estavam (proporção, grade, centro e área segura); na primeira vez, 2,39 e grade
    const m = A.monitor
    const ligado = Boolean(m.guia || m.grade || m.centro || m.segura)
    if (ligado) S.guiasGuardadas = { guia: m.guia, grade: m.grade, centro: m.centro, segura: m.segura }
    const novo = ligado ? { guia: '', grade: false, centro: false, segura: false } : S.guiasGuardadas || { guia: '2.39', grade: true, centro: false, segura: false }
    A = E.limpar({ ...A, monitor: { ...m, ...novo } })
    E.salvar(A)
    desenharSobre()
  } else definir(`monitor.${f}`, !A.monitor[f])
  atualizarTela()
}

// ───────── relógio do set ─────────

async function acertarRelogio() {
  const amostras = []
  for (let i = 0; i < 8; i++) {
    try {
      const t0 = Date.now()
      const r = await fetch('/api/camzro/hora', { cache: 'no-store', credentials: 'same-origin' })
      const t1 = Date.now()
      if (!r.ok) break
      const { agora } = await r.json()
      amostras.push(amostra({ t0, t1, servidor: agora }))
    } catch {
      break
    }
  }
  S.relogio = combinar(amostras)
  atualizarTela()
}

export const agora = () => Date.now() + (S.relogio?.diferenca || 0)

// ───────── gravar ─────────

function perfil() {
  const c = cadencia()
  const largura = S.ajustes?.largura || 1920
  const altura = S.ajustes?.altura || 1080
  const g = S.oQueGrava
  let codec = A.formato.codec
  if (codec === 'auto' || !g?.codecs?.[codec]) codec = ['hevc', 'avc', 'av1', 'vp9'].find((k) => g?.codecs?.[k]) || null
  // H.264 é o que todo editor abre; HEVC só no automático quando o contêiner é MOV (Apple, DaVinci e Premiere leem)
  if (A.formato.codec === 'auto' && g?.codecs?.avc && A.formato.conteiner === 'mp4') codec = 'avc'
  // S.forcarSimples: o gravador profissional falhou logo no começo neste navegador; segue no simples
  const motor = !S.forcarSimples && g?.webcodecs && codec ? 'webcodecs' : 'mediarecorder'
  let audio = A.formato.audio === 'sem' || !S.audio ? null : A.formato.audio
  if (audio && !audio.startsWith('pcm') && !g?.audio?.[audio]) audio = 'pcm-s24'
  if (motor === 'webcodecs' && audio?.startsWith('pcm') && A.formato.conteiner === 'mp4' && g?.audio?.aac) audio = 'aac'
  const bitrate = A.formato.nivel === 'manual' && A.formato.bitrate ? A.formato.bitrate : bitrateSugerido({ largura, altura, fps: c.fps, codec: codec || 'avc', nivel: A.formato.nivel === 'manual' ? 'alta' : A.formato.nivel })
  return { motor, codec, bitrate, modoBitrate: A.formato.modoBitrate, quadroChave: A.formato.quadroChave, conteiner: A.formato.conteiner, audio: motor === 'webcodecs' ? audio : audio ? 'aac' : null, fps: c.fps, largura, altura }
}
export { perfil }

export async function gravar() {
  if (S.sessao || S.fechando || !S.stream) return
  await som.acordar()
  const c = cadencia()
  const p = perfil()
  if (S.espaco) {
    const resta = segundosQueCabem(S.espaco.livre, p.bitrate + (p.audio ? bitrateAudio({ codec: p.audio }) : 0))
    if (resta < 15) return avisar('Sem espaço para gravar. Descarregue e apague clipes.', { ruim: true, ms: 5000 })
    if (resta < 120) avisar(`Cabem só ${tempoTexto(resta)}.`, { ms: 3000 })
  }
  const nome = cl.nomeDoClipe({ camera: A.claquete.camera, rolo: A.claquete.rolo, clipe: A.claquete.clipe, data: new Date(agora()), aparelho: S.aparelho })
  const claquete = { ...A.claquete }
  let sessao
  try {
    sessao = await grav.gravar({
      stream: S.stream,
      nome,
      perfil: p,
      aoMudar: (e) => (S.estadoGravacao = e),
      aoErro: (e) => {
        console.warn('camzro: gravação', e)
        const cedo = S.sessao && performance.now() - S.sessao.inicioPerf < 5000
        if (p.motor === 'webcodecs' && cedo) {
          S.forcarSimples = true
          avisar('Este navegador não aguentou o gravador profissional: o próximo take vai no gravador simples.', { ruim: true, ms: 7000 })
        } else avisar(`A gravação parou: ${e?.message || e}`, { ruim: true, ms: 7000 })
        void parar()
      },
    })
  } catch (e) {
    return avisar(`Não deu para gravar: ${e?.message || e}`, { ruim: true, ms: 6000 })
  }
  const inicioMs = agora()
  S.sessao = { sessao, nome, claquete, maestro: eloDoClipe(S.roteiro, claquete), perfil: p, inicioMs, inicioPerf: performance.now(), lutTexto: S.lutTexto || null, tcInicio: tc.horaDoDia(inicioMs, c.fps, df()), fps: c.fps, camera: fotoDaCamera(), sincronia: null }
  S.estadoGravacao = { bytes: 0, quadros: 0, perdidos: 0, segundos: 0 }
  if (!sessao.protegido) avisar('Este navegador só confirma o arquivo no fim: não feche o app durante o take.', { ms: 5000 })
  $('cam').classList.add('gravando')
  $('gravar').setAttribute('aria-label', 'Parar')
  // sidecar provisório: se o app cair, o take volta com a claquete certa
  void grav.gravarSidecar(nome, sidecarDe(S.sessao, { duracao: 0, quadros: 0, arquivo: `${nome}.gravando.mp4` })).catch(() => {})
  if (A.sincronia.bip) setTimeout(() => void bater(), 700)
  atualizarTela()
}

function fotoDaCamera() {
  const a = S.ajustes || {}
  const fps = cadencia().fps
  return { iso: a.iso ?? null, tempo: a.tempo ?? null, angulo: a.tempo ? exp.tempoParaAngulo(a.tempo, fps) : null, kelvin: a.kelvin ?? null, zoom: a.zoom ?? null, lente: A.camera.lente || null, anamorfico: A.monitor.anamorfico, lut: S.lutNome || null, nd: A.camera.nd || null, perfil: A.camera.perfil === 'neutro' && S.capacidades?.neutro ? 'neutro-zro' : 'padrao' }
}

function sidecarDe(s, { duracao, quadros, arquivo, perdidos = 0 }) {
  return md.sidecar({
    arquivo,
    nome: s.nome,
    inicioMs: s.inicioMs,
    duracao,
    quadros,
    fps: s.fps,
    df: df(),
    tcInicio: s.tcInicio,
    tcFonte: S.relogio ? 'relogio-do-set' : 'relogio-do-aparelho',
    claquete: s.claquete,
    bom: s.bom || false,
    notas: s.notas || '',
    video: { codec: s.perfil.codec || s.sessao.mime || 'mediarecorder', largura: s.perfil.largura, altura: s.perfil.altura, bitrate: s.perfil.bitrate, quadroChave: s.perfil.motor === 'webcodecs' ? s.perfil.quadroChave : null, perdidos, motor: s.perfil.motor },
    audio: s.perfil.audio ? { codec: s.perfil.audio, taxa: S.ajustes?.audio?.taxa || 48000, canais: S.ajustes?.audio?.canais || 2 } : null,
    aparelho: S.aparelho,
    camera: s.camera,
    sincronia: s.sincronia,
    maestro: s.maestro,
  })
}

export async function parar(motivo) {
  const s = S.sessao
  if (!s) return
  S.sessao = null
  S.fechando = true
  $('cam').classList.remove('gravando')
  $('cam').classList.add('fechando')
  $('gravar').setAttribute('aria-label', 'Gravar')
  atualizarTela()
  try {
    const r = await s.sessao.parar()
    const miniatura = await bib.miniaturaDoVideo($('video'), s.nome)
    let arquivo = r.arquivo
    let fechado = false
    if (s.perfil.motor === 'webcodecs' && A.formato.fecharTake) {
      const f = await grav.fecharTake({ nome: s.nome, arquivoGravando: r.arquivo, conteiner: A.formato.conteiner, fps: s.fps })
      arquivo = f.arquivo
      fechado = f.fechado
      if (!f.fechado) avisar('Take salvo em MP4 fragmentado (não deu para fechar em MOV agora).', { ms: 5000 })
    } else {
      const f = await grav.fecharTake({ nome: s.nome, arquivoGravando: r.arquivo, conteiner: 'mp4', fps: s.fps }).catch(() => null)
      if (f) arquivo = f.arquivo
    }
    const quadros = Math.max(1, Math.round(r.segundos * s.fps))
    const sc = sidecarDe(s, { duracao: r.segundos, quadros, arquivo, perdidos: r.perdidos })
    sc.fechado = fechado
    if (s.lutTexto) {
      // o look do monitor vai junto: o editor parte do mesmo .cube (o arquivo de vídeo segue limpo)
      const w = await arm.escritorSimples(`${s.nome}.cube`)
      await w.write(new Blob([s.lutTexto], { type: 'text/plain' }))
      await w.close()
      sc.camera.lut_arquivo = `${s.nome}.cube`
    }
    await grav.gravarSidecar(s.nome, sc)
    S.ultimoClipe = { nome: s.nome, miniatura }
    A = E.limpar({ ...A, claquete: cl.depoisDeGravar(A.claquete) })
    E.salvar(A)
    if (r.perdidos > 0) avisar(`${r.perdidos} quadros perdidos: o aparelho não deu conta. Tente um bitrate menor.`, { ruim: true, ms: 6000 })
    else if (motivo) avisar(motivo, { ms: 5000 })
    else avisar(`${s.nome} · ${tc.duracaoTexto(r.segundos)}`, { ms: 2200 })
  } catch (e) {
    console.warn('camzro: parar', e)
    avisar(`O take pode ter ficado incompleto: ${e?.message || e}`, { ruim: true, ms: 7000 })
  } finally {
    S.fechando = false
    $('cam').classList.remove('fechando')
    void medirEspaco()
    atualizarTela()
    if (folhaAberta() === 'biblioteca') redesenharFolha()
  }
}

/** Bip e flash de sincronia (o Synquei acha o bip no som da câmera e no do gravador). */
export async function bater() {
  const flash = $('flash')
  const quando = await som.tocarBip()
  setTimeout(
    () => {
      flash.classList.remove('ativo')
      void flash.offsetWidth
      flash.classList.add('ativo')
      $('slate').classList.remove('batida')
      void $('slate').offsetWidth
      if (!$('slate').hidden) $('slate').classList.add('batida')
    },
    Math.max(0, quando - performance.now()),
  )
  if (S.sessao) {
    const segundos = (quando - S.sessao.inicioPerf) / 1000
    S.sessao.sincronia = { bip_s: Math.max(0, Math.round(segundos * 1000) / 1000), hz: 1000, ms: 160, assinatura: 'tpeasy' }
  }
}

// ───────── espaço ─────────

async function medirEspaco() {
  S.espaco = await arm.espaco()
  atualizarTela()
}

// ───────── tela ─────────

const fmtIso = () => (S.ajustes?.iso ? String(Math.round(S.ajustes.iso)) : 'Auto')
function fmtObt() {
  const t = S.ajustes?.tempo
  if (!t) return 'Auto'
  return A.monitor.mostrarAngulo ? exp.anguloTexto(exp.tempoParaAngulo(t, cadencia().fps)) : exp.fracao(t)
}

export function atualizarTela() {
  if ($('cam').hidden) return
  const p = perfil()
  const c = cadencia()
  const res = S.ajustes?.altura ? (S.ajustes.altura >= 2160 ? '4K' : `${S.ajustes.altura}p`) : '—'
  const codec = p.motor === 'webcodecs' ? { hevc: 'HEVC', avc: 'H.264', av1: 'AV1', vp9: 'VP9' }[p.codec] : 'Simples'
  $('chip-formato').textContent = `${res} · ${c.rotulo} · ${codec} · ${bitrateTexto(p.bitrate)}${A.camera.perfil === 'neutro' && S.capacidades?.neutro ? ' · Neutro' : ''}`
  // espaço em minutos no bitrate de agora
  if (S.espaco) {
    const bps = p.bitrate + (p.audio ? bitrateAudio({ codec: p.audio }) : 0)
    const gravando = S.estadoGravacao && S.sessao ? S.estadoGravacao.bytes : 0
    const seg = segundosQueCabem(Math.max(0, S.espaco.livre - gravando), bps, 0)
    const ch = $('chip-espaco')
    ch.textContent = tempoTexto(seg)
    ch.classList.toggle('chip--alerta', nivelDoEspaco(seg) === 'pouco')
    ch.classList.toggle('chip--ruim', nivelDoEspaco(seg) === 'acabando')
  }
  const rel = $('chip-relogio')
  if (MODO === 'conta' || MODO === 'local' || MODO === 'previa') {
    rel.hidden = false
    const q = qualidade(S.relogio, c.fps)
    rel.textContent = q === 'sem' ? 'TC do aparelho' : `TC do set ±${Math.max(1, Math.round(S.relogio.incerteza))} ms`
    rel.classList.toggle('chip--alerta', q === 'fraca')
  }
  // valores de exposição
  const cap = S.capacidades || {}
  const valor = (id, texto, manual) => {
    const el = $(id)
    el.querySelector('b').textContent = texto
    el.classList.toggle('manual', Boolean(manual))
  }
  valor('v-iso', fmtIso(), A.camera.exposicao === 'manual' && cap.exposicaoManual)
  valor('v-obt', fmtObt(), A.camera.exposicao === 'manual' && cap.exposicaoManual)
  // sem ISO e obturador (Safari no iPhone): um botão só, que trava e solta a exposição, com o que o aparelho contar
  const soAuto = Boolean(S.capacidades) && !cap.exposicaoManual
  $('v-iso').hidden = soAuto
  $('v-obt').hidden = soAuto
  $('v-exp').hidden = !soAuto
  if (soAuto) {
    const medido = [S.ajustes?.iso ? `ISO ${Math.round(S.ajustes.iso)}` : '', S.ajustes?.tempo ? exp.fracao(S.ajustes.tempo) : ''].filter(Boolean).join(' · ')
    valor('v-exp', A.camera.exposicao === 'travada' ? 'Travada' : medido ? `Auto · ${medido}` : 'Auto', A.camera.exposicao === 'travada')
  }
  valor('v-wb', S.ajustes?.kelvin ? `${Math.round(S.ajustes.kelvin)}K` : A.camera.balanco === 'travado' ? 'Travado' : 'Auto', A.camera.balanco !== 'auto')
  valor('v-foco', A.camera.foco === 'manual' && S.ajustes?.foco != null ? `${S.ajustes.foco.toFixed(2)} m` : A.camera.foco === 'travado' ? 'Travado' : 'Auto', A.camera.foco !== 'auto')
  valor('v-zoom', `${(S.ajustes?.zoom || A.camera.zoom || 1).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}×`, (S.ajustes?.zoom || 1) !== 1)
  $('v-zoom').hidden = !cap.zoom
  // claquete
  const k = A.claquete
  $('claquete-texto').textContent = `Cena ${k.cena} · ${k.plano} · Take ${k.take}`
  const doRoteiro = S.roteiro ? posicaoNoRoteiro(S.roteiro, k).plano : null
  $('claquete-cam').textContent = doRoteiro ? doRoteiro.descricao : `${cl.nomeDoRolo(k.camera, k.rolo)} · C${String(k.clipe).padStart(3, '0')}`
  // ferramentas
  for (const b of document.querySelectorAll('[data-ferramenta]')) {
    const f = b.dataset.ferramenta
    const ligado = f === 'lupa' ? S.lupa : f === 'scopes' ? Boolean(A.monitor.scopes) : f === 'guias' ? Boolean(A.monitor.guia || A.monitor.grade || A.monitor.segura) : Boolean(A.monitor[f])
    b.setAttribute('aria-pressed', String(ligado))
  }
  $('medidor').hidden = !S.audio
  const mini = $('miniatura')
  if (S.ultimoClipe?.miniatura && mini.dataset.src !== S.ultimoClipe.miniatura) {
    mini.dataset.src = S.ultimoClipe.miniatura
    mini.style.backgroundImage = `url(${S.ultimoClipe.miniatura})`
  }
  $('gravar').disabled = S.fechando
}

/** O que muda a cada quadro de tela: timecode, medidores, nível, slate. */
function laco() {
  const c = cadencia()
  let tcAgora
  if (S.sessao) {
    const q = tc.quadrosDe((agora() - S.sessao.inicioMs) / 1000, c.fps)
    tcAgora = tc.fim(S.sessao.tcInicio, q, c.fps, df())
  } else tcAgora = tc.horaDoDia(agora(), c.fps, df())
  const texto = tc.formatar(tcAgora, c.fps, df())
  $('tc').textContent = texto
  if (!$('slate').hidden) $('slate-tc').textContent = texto
  const l = S.leitura
  if (l) {
    for (let i = 0; i < 2; i++) {
      const barra = $(`barra-${i}`)
      const pico = l.pico[Math.min(i, l.pico.length - 1)]
      const seg = l.picoSegurado[Math.min(i, l.picoSegurado.length - 1)]
      barra.firstElementChild.style.height = `${posicaoNoMedidor(pico) * 100}%`
      barra.lastElementChild.style.bottom = `${posicaoNoMedidor(seg) * 100}%`
    }
    $('lufs').textContent = l.lufs > -70 ? `${Math.round(l.lufs)} LUFS` : '— LUFS'
  }
  requestAnimationFrame(laco)
}

// ───────── nível (acelerômetro) ─────────

function ligarNivel() {
  window.addEventListener('devicemotion', (e) => {
    if (!A.monitor.nivel) return
    const g = e.accelerationIncludingGravity
    if (!g || g.x == null) return
    const angTela = screen.orientation?.angle ?? window.orientation ?? 0
    const n = calcNivel(g.x, g.y, { orientacao: angTela })
    const graus = n.graus - S.nivelZero
    $('nivel-linha').style.transform = `rotate(${-graus}deg)`
    $('nivel-graus').textContent = `${graus.toFixed(1)}°`
    $('nivel').classList.toggle('ok', Math.abs(graus) <= 0.5)
  })
}

// ───────── LUT ─────────

export async function carregarLut(arquivo) {
  try {
    if (arquivo.size > 16 * 1024 * 1024) throw new ErroLut('Arquivo grande demais para uma LUT.')
    const texto = await arquivo.text()
    const l = lerCube(texto)
    S.lut = paraTextura(l)
    S.lutTexto = texto
    S.lutNome = (l.titulo || arquivo.name.replace(/\.cube$/i, '')).slice(0, 60)
    if (A.monitor.look) definir('monitor.look', '') // uma LUT de fora tira o look
    avisar(`LUT ${S.lutNome} no monitor (não grava no arquivo).`)
  } catch (e) {
    avisar(e instanceof ErroLut ? e.message : 'Não deu para ler a LUT.', { ruim: true })
  }
  if (folhaAberta()) redesenharFolha()
}
export function tirarLut() {
  S.lut = null
  S.lutTexto = null
  S.lutNome = ''
  S.lutDoLook = ''
  if (A.monitor.look) definir('monitor.look', '')
  if (folhaAberta()) redesenharFolha()
}

/**
 * Looks ZRO (nucleo/looks.js): o look escolhido vira a LUT do monitor. Só na tela; o .cube vai ao lado de cada take
 * (o mesmo caminho da LUT carregada), com o nome na ficha e no CSV.
 */
const cacheLooks = new Map()
export function usarLook() {
  const id = A.monitor.look
  if (!id) {
    if (S.lutDoLook) {
      S.lut = null
      S.lutTexto = null
      S.lutNome = ''
      S.lutDoLook = ''
    }
  } else if (S.lutDoLook !== id) {
    if (!cacheLooks.has(id)) {
      const texto = cubeDoLook(id)
      cacheLooks.set(id, { texto, textura: paraTextura(lerCube(texto)) })
    }
    const c = cacheLooks.get(id)
    S.lut = c.textura
    S.lutTexto = c.texto
    S.lutNome = `ZRO · ${lookPorId(id).nome}`
    S.lutDoLook = id
  }
  if (folhaAberta()) redesenharFolha()
}

// ───────── o Set da Absolute ZRO ─────────

function ligarSet() {
  if (MODO !== 'conta' || !SET || !SET_API) return
  const s = document.createElement('script')
  s.type = 'module'
  s.src = SET
  document.head.append(s)
  const el = document.createElement('zro-set')
  el.setAttribute('api', SET_API)
  el.setAttribute('tema', A.tema === 'escuro' ? 'escuro' : 'claro')
  $('set-slot').append(el)
}

// ───────── recuperar takes de uma queda ─────────

async function recuperar() {
  let lista = []
  try {
    lista = await arm.listar()
  } catch {
    return
  }
  const caidos = lista.filter((c) => c.gravando)
  for (const c of caidos) {
    try {
      const fps = c.sidecar?.fps || cadencia().fps
      const f = await grav.fecharTake({ nome: c.nome, arquivoGravando: c.arquivo, conteiner: A.formato.conteiner, fps })
      const sc = c.sidecar || md.sidecar({ arquivo: f.arquivo, nome: c.nome, inicioMs: c.modificado, duracao: f.duracao, quadros: 0, fps, tcInicio: 0, claquete: A.claquete, video: { codec: null, largura: null, altura: null, bitrate: null, motor: 'desconhecido' }, aparelho: S.aparelho })
      sc.arquivo = f.arquivo
      sc.duracao_s = Math.round(f.duracao * 1000) / 1000
      sc.quadros = Math.round(f.duracao * fps)
      sc.recuperado = true
      sc.fechado = f.fechado
      await grav.gravarSidecar(c.nome, sc)
    } catch {}
  }
  if (caidos.length) avisar(caidos.length === 1 ? 'Um take que caiu foi recuperado.' : `${caidos.length} takes que caíram foram recuperados.`, { ms: 5000 })
  const ultimo = (await arm.listar().catch(() => []))[0]
  if (ultimo) S.ultimoClipe = { nome: ultimo.nome, miniatura: await bib.miniaturaSalva(ultimo.nome) }
  atualizarTela()
}

// ───────── microfone que chega, espaço que acaba ─────────

async function contarMicrofones() {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput').length
  } catch {
    return 0
  }
}
async function vigiarDispositivos() {
  let antes = await contarMicrofones()
  navigator.mediaDevices.addEventListener?.('devicechange', async () => {
    const agoraN = await contarMicrofones()
    const chegou = agoraN > antes
    antes = agoraN
    if (!chegou || A.camera.microfone || A.formato.audio === 'sem') return
    if (S.sessao) return avisar('Microfone conectado: entra no próximo take.', { ms: 4000 })
    avisar('Microfone conectado.', { ms: 2500 })
    void reabrir()
  })
}

/** Durante o take: se o espaço acabar, para com o que já foi gravado (antes de o navegador recusar a escrita). */
function vigiarEspaco() {
  if (!S.sessao || !S.espaco) return
  const p = S.sessao.perfil
  const bps = p.bitrate + (p.audio ? bitrateAudio({ codec: p.audio }) : 0)
  const resta = segundosQueCabem(Math.max(0, S.espaco.livre - (S.estadoGravacao?.bytes || 0)), bps)
  if (resta < 8) void parar('Acabou o espaço: o take foi salvo até aqui.')
}

// ───────── começo ─────────

async function comecar() {
  $('abrir').disabled = true
  $('inicio-erro').hidden = true
  try {
    if (!cam.temCamera()) throw Object.assign(new Error(), { name: window.isSecureContext ? 'NotFoundError' : 'Inseguro' })
    $('cam').hidden = false
    await abrirCamera()
    $('inicio').hidden = true
    cam.telaAcesa()
    void arm.persistir()
    void medirEspaco()
    setInterval(medirEspaco, 15000)
    void recuperar()
    void acertarRelogio()
    setInterval(acertarRelogio, 10 * 60_000)
    ligarSet()
    vigiarDispositivos()
    setInterval(vigiarEspaco, 1000)
    requestAnimationFrame(laco)
  } catch (e) {
    $('cam').hidden = true
    $('inicio-erro').textContent = mensagemDeErro(e)
    $('inicio-erro').hidden = false
  } finally {
    $('abrir').disabled = false
  }
}

function ligar() {
  aplicarTema()
  if (A.monitor.look) usarLook() // o look escolhido da última vez
  pintar()
  registrarFolhas()
  $('abrir').addEventListener('click', comecar)
  $('gravar').addEventListener('click', () => (S.sessao ? parar() : gravar()))
  $('v-exp').addEventListener('click', alternarExposicao)
  document.addEventListener('click', (e) => {
    const f = e.target.closest('[data-ferramenta]')
    if (f) return alternarFerramenta(f.dataset.ferramenta)
    const folha = e.target.closest('[data-folha]')
    if (folha && !folha.closest('#folha')) return abrirFolha(folha.dataset.folha)
    const acao = e.target.closest('[data-acao]')
    if (acao?.dataset.acao === 'bater') return void bater()
    if (acao?.dataset.acao === 'fechar-slate') return ($('slate').hidden = true)
    if (acao?.dataset.acao === 'fechar-folha') return fecharFolha()
  })
  document.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, select, textarea')) return
    // espaço no teclado; Enter, volume e play/pausa nos disparadores Bluetooth (onde o sistema repassa a tecla)
    const disparo = e.code === 'Space' || (['Enter', 'NumpadEnter', 'AudioVolumeUp', 'AudioVolumeDown', 'MediaPlayPause', 'MediaRecord', 'Camera'].includes(e.key) && !e.target.closest?.('button, a'))
    if (disparo && !$('cam').hidden && $('folha').hidden && !e.repeat) {
      e.preventDefault()
      return S.sessao ? parar() : gravar()
    }
    if (e.key === 'Escape') {
      if (!$('slate').hidden) $('slate').hidden = true
      else fecharFolha()
    }
  })
  $('arquivo-lut').addEventListener('change', (e) => {
    const f = e.target.files?.[0]
    if (f) void carregarLut(f)
    e.target.value = ''
  })
  ligarToque()
  ligarNivel()
  new ResizeObserver(() => posicionar()).observe($('visor'))
  // iPhone e Android param a câmera quando o app sai da frente: o take fecha com o que já foi gravado
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && S.sessao) void parar('O app saiu da frente: o take foi salvo até ali.')
    if (document.visibilityState === 'visible' && S.stream && S.video?.readyState === 'ended') void reabrir()
  })
  window.addEventListener('beforeunload', (e) => {
    if (S.sessao) e.preventDefault()
  })
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {})
}

export const zerarNivel = () => {
  const t = $('nivel-graus').textContent
  S.nivelZero += Number.parseFloat(t) || 0
}
export const abrirSlate = () => {
  const k = A.claquete
  $('slate-projeto').textContent = k.projeto || '—'
  $('slate-cena').textContent = k.cena
  $('slate-plano').textContent = k.plano
  $('slate-take').textContent = k.take
  $('slate-cam').textContent = k.camera
  $('slate').hidden = false
}
export { svg, reabrir }

ligar()
