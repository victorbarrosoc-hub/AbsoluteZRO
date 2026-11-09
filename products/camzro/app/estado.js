// CAMZRO · ajustes que ficam no aparelho (localStorage) e os presets (como os "setups" das câmeras de cinema):
// um preset guarda formato, monitor e claquete-base, e vai para outro aparelho como .camzro.json (Levar/Trazer).
// Tudo validado na volta: nada de arquivo de fora virar ajuste estranho.

import { CLAQUETE_INICIAL, campo, CAMERAS, idDoAparelho } from './nucleo/claquete.js'
import { CADENCIAS } from './nucleo/exposicao.js'
import { PROPORCOES, ANAMORFICOS } from './nucleo/guias.js'

const CHAVE = 'camzro.ajustes.v1'
const CHAVE_PRESETS = 'camzro.presets.v1'
const CHAVE_APARELHO = 'camzro.aparelho'
export const FORMATO_PRESET = 'camzro.preset/1'

export const PADRAO = Object.freeze({
  formato: { resolucao: '1080', cadencia: '30', codec: 'auto', nivel: 'alta', bitrate: 0, modoBitrate: 'variable', quadroChave: 1, conteiner: 'mov', audio: 'pcm-s24', rede: 60, fecharTake: true },
  camera: { camera: '', voltada: 'environment', microfone: '', exposicao: 'auto', tempo: 0, angulo: 180, iso: 0, compensacao: 0, ev: 0, nd: 0, balanco: 'auto', kelvin: 5600, foco: 'auto', distancia: 0, zoom: 1, tocha: false, lente: '' },
  monitor: { falsaCor: 'arri', falsaCorLigada: false, zebra: false, zebraModo: 'acima', zebraNivel: 95, pico: false, picoCor: 'vermelho', picoSensibilidade: 0.6, mono: false, guia: '', grade: false, aurea: false, centro: false, segura: false, anamorfico: 1, espelho: false, scopes: '', nivel: false, mostrarAngulo: true },
  claquete: { ...CLAQUETE_INICIAL },
  sincronia: { bip: false, claqueteNaTela: false },
  tema: 'claro',
})

export const CORES_PICO = { vermelho: [1, 0.23, 0.19], verde: [0.2, 0.85, 0.35], azul: [0.1, 0.55, 1], amarelo: [1, 0.85, 0.1], branco: [1, 1, 1] }

const um = (v, lista, padrao) => (lista.includes(v) ? v : padrao)
const num = (v, min, max, padrao) => (Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max ? Number(v) : padrao)
const bool = (v, padrao) => (typeof v === 'boolean' ? v : padrao)

/** Confere e completa ajustes vindos do armazenamento ou de um preset. */
export function limpar(a = {}) {
  const f = a.formato || {}
  const c = a.camera || {}
  const m = a.monitor || {}
  const k = a.claquete || {}
  const s = a.sincronia || {}
  const P = PADRAO
  return {
    formato: {
      resolucao: um(f.resolucao, ['4k', '1440', '1080', '720'], P.formato.resolucao),
      cadencia: um(String(f.cadencia), CADENCIAS.map((x) => x.id), P.formato.cadencia),
      codec: um(f.codec, ['auto', 'hevc', 'avc', 'av1', 'vp9'], 'auto'),
      nivel: um(f.nivel, ['padrao', 'alta', 'maxima', 'manual'], 'alta'),
      bitrate: num(f.bitrate, 0, 800e6, 0),
      modoBitrate: um(f.modoBitrate, ['variable', 'constant'], 'variable'),
      quadroChave: num(f.quadroChave, 0, 10, 1),
      conteiner: um(f.conteiner, ['mov', 'mp4'], 'mov'),
      audio: um(f.audio, ['pcm-s24', 'pcm-s16', 'aac', 'opus', 'sem'], 'pcm-s24'),
      rede: um(Number(f.rede), [50, 60], 60),
      fecharTake: bool(f.fecharTake, true),
    },
    camera: {
      camera: typeof c.camera === 'string' ? c.camera.slice(0, 200) : '',
      voltada: um(c.voltada, ['environment', 'user'], 'environment'),
      microfone: typeof c.microfone === 'string' ? c.microfone.slice(0, 200) : '',
      exposicao: um(c.exposicao, ['auto', 'travada', 'manual', 'obturador', 'iso'], 'auto'),
      tempo: num(c.tempo, 0, 1, 0),
      angulo: num(c.angulo, 1, 360, 180),
      iso: num(c.iso, 0, 409600, 0),
      compensacao: num(c.compensacao, -10, 10, 0),
      ev: num(c.ev, -3, 3, 0),
      nd: num(c.nd, 0, 4, 0),
      balanco: um(c.balanco, ['auto', 'travado', 'manual'], 'auto'),
      kelvin: num(c.kelvin, 1500, 15000, 5600),
      foco: um(c.foco, ['auto', 'travado', 'manual'], 'auto'),
      distancia: num(c.distancia, 0, 1000, 0),
      zoom: num(c.zoom, 0.5, 100, 1),
      tocha: bool(c.tocha, false),
      lente: campo(c.lente, 40),
    },
    monitor: {
      falsaCor: um(m.falsaCor, ['arri', 'simples'], 'arri'),
      falsaCorLigada: bool(m.falsaCorLigada, false),
      zebra: bool(m.zebra, false),
      zebraModo: um(m.zebraModo, ['acima', 'faixa'], 'acima'),
      zebraNivel: num(m.zebraNivel, 50, 109, 95),
      pico: bool(m.pico, false),
      picoCor: um(m.picoCor, Object.keys(CORES_PICO), 'vermelho'),
      picoSensibilidade: num(m.picoSensibilidade, 0, 1, 0.6),
      mono: bool(m.mono, false),
      guia: um(m.guia, ['', ...PROPORCOES.map((p) => p.id)], ''),
      grade: bool(m.grade, false),
      aurea: bool(m.aurea, false),
      centro: bool(m.centro, false),
      segura: bool(m.segura, false),
      anamorfico: um(Number(m.anamorfico), ANAMORFICOS, 1),
      espelho: bool(m.espelho, false),
      scopes: um(m.scopes, ['', 'histograma', 'onda', 'parade', 'vetor'], ''),
      nivel: bool(m.nivel, false),
      mostrarAngulo: bool(m.mostrarAngulo, true),
    },
    claquete: {
      projeto: campo(k.projeto, 60),
      cena: campo(k.cena, 8).toUpperCase() || '1',
      plano: campo(k.plano, 6).toUpperCase() || 'A',
      take: num(k.take, 1, 999, 1),
      camera: um(String(k.camera || '').toUpperCase(), CAMERAS, 'A'),
      rolo: num(k.rolo, 1, 999, 1),
      clipe: num(k.clipe, 1, 999, 1),
      diretor: campo(k.diretor, 40),
      fotografo: campo(k.fotografo, 40),
    },
    sincronia: { bip: bool(s.bip, false), claqueteNaTela: bool(s.claqueteNaTela, false) },
    tema: um(a.tema, ['claro', 'escuro'], 'claro'),
  }
}

const ler = (chave) => {
  try {
    return JSON.parse(localStorage.getItem(chave) || 'null')
  } catch {
    return null
  }
}
const gravar = (chave, v) => {
  try {
    localStorage.setItem(chave, JSON.stringify(v))
    return true
  } catch {
    return false
  }
}

export const carregar = () => limpar(ler(CHAVE) || {})
export const salvar = (a) => gravar(CHAVE, limpar(a))

/** Id de 4 letras deste aparelho (vai no nome do clipe: dois celulares nunca geram o mesmo nome). */
export function aparelho() {
  let id = null
  try {
    id = localStorage.getItem(CHAVE_APARELHO)
  } catch {}
  if (!/^[2-9A-HJKMNP-Z]{4}$/.test(id || '')) {
    id = idDoAparelho()
    try {
      localStorage.setItem(CHAVE_APARELHO, id)
    } catch {}
  }
  return id
}

/** O que um preset leva: formato, câmera (menos lente e microfone deste aparelho), monitor e a base da claquete. */
export function paraPreset(nome, a) {
  const l = limpar(a)
  const { camera, microfone, ...camera2 } = l.camera
  void camera
  void microfone
  return { formato: FORMATO_PRESET, nome: campo(nome, 40) || 'Preset', criado: new Date().toISOString(), ajustes: { formato: l.formato, camera: camera2, monitor: l.monitor, claquete: { projeto: l.claquete.projeto, camera: l.claquete.camera, diretor: l.claquete.diretor, fotografo: l.claquete.fotografo } } }
}

/** Aplica um preset por cima dos ajustes atuais (mantém lente, microfone e a contagem da claquete). */
export function aplicarPreset(atual, preset) {
  if (!preset || preset.formato !== FORMATO_PRESET || typeof preset.ajustes !== 'object') throw new Error('Não é um preset do CAMZRO.')
  const a = limpar(atual)
  const p = preset.ajustes
  return limpar({
    ...a,
    formato: { ...a.formato, ...p.formato },
    camera: { ...a.camera, ...p.camera, camera: a.camera.camera, microfone: a.camera.microfone },
    monitor: { ...a.monitor, ...p.monitor },
    claquete: { ...a.claquete, ...(p.claquete || {}), cena: a.claquete.cena, plano: a.claquete.plano, take: a.claquete.take, rolo: a.claquete.rolo, clipe: a.claquete.clipe },
  })
}

const CHAVE_ROTEIRO = 'camzro.roteiro.v1'
/** O roteiro do Maestro que está na claquete (já lido por nucleo/maestro.js). */
export const roteiro = () => {
  const r = ler(CHAVE_ROTEIRO)
  return r && Array.isArray(r.cenas) ? r : null
}
export const guardarRoteiro = (r) => (r ? gravar(CHAVE_ROTEIRO, r) : (localStorage.removeItem(CHAVE_ROTEIRO), true))

export const presets = () => (Array.isArray(ler(CHAVE_PRESETS)) ? ler(CHAVE_PRESETS).filter((p) => p?.formato === FORMATO_PRESET).slice(0, 30) : [])
export function guardarPreset(p) {
  const lista = presets().filter((x) => x.nome !== p.nome)
  lista.unshift(p)
  return gravar(CHAVE_PRESETS, lista.slice(0, 30))
}
export const apagarPreset = (nome) => gravar(CHAVE_PRESETS, presets().filter((x) => x.nome !== nome))
