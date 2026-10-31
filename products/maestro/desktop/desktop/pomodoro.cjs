// O Pomodoro do app de computador: as mesmas regras do site (src/components/tempo/pomodoro.ts e o relógio de
// cronometro.tsx), aqui no processo principal para valer com a janela fechada. O foco É uma sessão do cronômetro (modo
// "pomodoro" no servidor); a pausa é só do app. Com o app aberto, é ele quem conduz as fases e avisa (notificação do
// sistema); o site no app só mostra o que o app manda (ponte `maestroDesktop.cronometro`). As preferências (foco,
// pausa, pausa longa, ciclos e o "perguntar parado após") vêm do painel do site.
//
// Puro (sem Electron e sem relógio próprio): cada função recebe `agora` no relógio do servidor e devolve o estado novo
// e os efeitos (pausar no servidor, notificar). O teste roda em Node.

const MIN = 60_000
const PADRAO = { focoMin: 25, pausaMin: 5, longaMin: 15, ciclos: 4 }
const OCIOSO_PADRAO_MIN = 10
const FASES = new Set(['pronto', 'foco', 'pausa', 'longa'])

/** Confere a configuração (os mesmos limites do `lerPomodoro` do site): fora deles, o padrão daquele campo. */
function lerConfig(v) {
  const o = v && typeof v === 'object' ? v : {}
  const n = (k, min, max) => (Number.isInteger(o[k]) && o[k] >= min && o[k] <= max ? o[k] : PADRAO[k])
  return { focoMin: n('focoMin', 5, 120), pausaMin: n('pausaMin', 1, 30), longaMin: n('longaMin', 5, 60), ciclos: n('ciclos', 2, 8) }
}

const num = (x, min, max, p) => (typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max ? x : p)

/** O estado guardado (ou vindo do site) → conferido. */
function lerPomodoro(v) {
  const o = v && typeof v === 'object' ? v : {}
  return {
    config: lerConfig(o.config),
    ociosoMin: num(o.ociosoMin, 0, 120, OCIOSO_PADRAO_MIN),
    fase: FASES.has(o.fase) ? o.fase : 'pronto',
    feitos: Math.floor(num(o.feitos, 0, 1000, 0)),
    acumulado: num(o.acumulado, 0, 4 * 3600_000, 0),
    pausaDe: typeof o.pausaDe === 'number' && Number.isFinite(o.pausaDe) ? o.pausaDe : null,
    pausaMs: num(o.pausaMs, 0, 3600_000, 0),
  }
}

/** A pausa depois do foco número `feitos`: a longa a cada `ciclos` (o `pausaDepois` do site). */
function pausaDepois(feitos, c) {
  return feitos > 0 && feitos % c.ciclos === 0 ? { tipo: 'longa', ms: c.longaMin * MIN } : { tipo: 'pausa', ms: c.pausaMin * MIN }
}

const emPausa = (p) => p.fase === 'pausa' || p.fase === 'longa'

/**
 * O servidor mudou (`antes` → `depois`, os estados de tempo.cjs): pausou no meio do foco guarda o feito (pela hora de
 * fim gravada); uma sessão Pomodoro rodando (de qualquer aparelho) é foco.
 */
function observar(p, antes, depois, agora) {
  let q = p
  const a = antes && antes.rodando
  const d = depois && depois.rodando
  if (a && a.modo === 'pomodoro' && (!d || d.id !== a.id) && q.fase === 'foco') {
    const fechado = depois && depois.hoje.find((r) => r.id === a.id && r.fim)
    const fim = fechado ? Date.parse(fechado.fim) : agora
    q = { ...q, acumulado: Math.min(4 * 3600_000, q.acumulado + Math.max(0, fim - Date.parse(a.inicio))), fase: 'pronto' }
  }
  if (d && d.modo === 'pomodoro' && q.fase !== 'foco') q = { ...q, fase: 'foco', pausaDe: null }
  return q
}

/**
 * Um segundo do relógio: fim do foco pausa o cronômetro e começa a pausa (curta ou longa); fim da pausa avisa e deixa
 * "Focar" pronto. Devolve { p, efeitos } (efeitos: { tipo: 'pausar' } e { tipo: 'notificar', titulo, corpo }).
 */
function passo(p, rodando, agora) {
  if (p.fase === 'foco' && rodando && rodando.modo === 'pomodoro') {
    const feito = p.acumulado + (agora - Date.parse(rodando.inicio))
    if (feito >= p.config.focoMin * MIN) {
      const feitos = p.feitos + 1
      const pausa = pausaDepois(feitos, p.config)
      return {
        p: { ...p, fase: pausa.tipo, feitos, acumulado: 0, pausaDe: agora, pausaMs: pausa.ms },
        efeitos: [
          { tipo: 'pausar' },
          {
            tipo: 'notificar',
            titulo: 'Foco feito.',
            corpo: pausa.tipo === 'longa' ? `Pausa longa de ${p.config.longaMin} min.` : `Pausa de ${p.config.pausaMin} min.`,
          },
        ],
      }
    }
  } else if (emPausa(p) && p.pausaDe !== null && agora - p.pausaDe >= p.pausaMs) {
    return { p: { ...p, fase: 'pronto', pausaDe: null }, efeitos: [{ tipo: 'notificar', titulo: 'Pausa acabou.', corpo: 'Pronto para focar.' }] }
  }
  return { p, efeitos: [] }
}

/** "Pausa de N min" no menu: pausa o cronômetro (se roda) e conta a pausa curta. */
function iniciarPausa(p, agora) {
  return { ...p, fase: 'pausa', acumulado: 0, pausaDe: agora, pausaMs: p.config.pausaMin * MIN }
}

const encerrarPausa = (p) => ({ ...p, fase: 'pronto', pausaDe: null })

/**
 * O site mandou o que a pessoa mudou no painel (preferências, ou "pular a pausa"): as preferências valem sempre; a fase
 * só quando o site encerra a pausa. O resto da fase é do app (ele é quem conduz).
 */
function doSite(p, v) {
  const s = lerPomodoro(v)
  let q = { ...p, config: s.config, ociosoMin: s.ociosoMin }
  if (v && typeof v === 'object' && v.fase === 'pronto' && emPausa(q)) q = encerrarPausa(q)
  return q
}

module.exports = { MIN, PADRAO, OCIOSO_PADRAO_MIN, lerConfig, lerPomodoro, pausaDepois, observar, passo, iniciarPausa, encerrarPausa, doSite, emPausa }
