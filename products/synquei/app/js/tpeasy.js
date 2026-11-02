// TPeasy → Synquei: o registro de leituras (contrato tpeasy.leituras/1, docs/integration-contracts/tpeasy-leituras.md na
// raiz do AbsoluteZRO). Cada leitura no teleprompter traz a hora do celular no bip e os blocos ("# …") que passaram; aqui
// cada clipe com o bip no áudio ganha a sua leitura e os blocos viram marcadores na exportação.
// A hora só diz onde procurar: o relógio da câmera e o do celular não batem, e muita câmera grava hora local como UTC.
// Quem confirma é o bip, e a diferença de relógio de cada aparelho tem de se repetir em mais de um take. Ambíguo, sem
// bip ou com um take só vai para "revisar" (a pessoa decide); nunca um chute. Nenhum arquivo é renomeado.
// Puro, sem DOM: roda no navegador, no Worker e no Node (tests/tpeasy.test.mjs).

export const CONTRATO = 'tpeasy.leituras/1'
/** Diferença de relógio que ainda conta como "o mesmo" entre dois takes do mesmo aparelho. */
export const TOLERANCIA_MS = 1500
/** Um take só (sem outro para conferir o relógio): só se a hora bater dentro disto, e mesmo assim vai para revisar. */
export const JANELA_UM_TAKE_MS = 15 * 60_000
/** Diferença máxima aceita (relógio errado em horas, fuso trocado). */
const JANELA_MAX_MS = 36 * 3_600_000

export const ehArquivoDeLeituras = (nome) => /^TPeasy-leituras-[^/]*\.jsonl$/i.test(String(nome).split('/').pop())

const ID = /^l[0-9a-f]{18}$/
const inteiro = (v, min, max) => Number.isInteger(v) && v >= min && v <= max

/** Uma linha do arquivo, já conferida; null se não for uma leitura válida. */
function leitura(o) {
  if (!o || typeof o !== 'object' || o.contrato !== CONTRATO || !ID.test(o.id)) return null
  const t0 = Date.parse(o.inicio)
  const fim = Date.parse(o.fim)
  if (!Number.isFinite(t0) || !Number.isFinite(fim) || !inteiro(o.duracao_ms, 1, 6 * 3_600_000) || fim - t0 !== o.duracao_ms) return null
  if (typeof o.bip !== 'boolean' || !Array.isArray(o.blocos) || !o.blocos.length || o.blocos.length > 500) return null
  const r = o.roteiro
  if (!r || typeof r.id !== 'string' || typeof r.titulo !== 'string') return null
  const blocos = []
  let antes = 0
  for (const b of o.blocos) {
    if (!b || !inteiro(b.em_ms, antes, o.duracao_ms)) return null
    if (!(b.i === null || inteiro(b.i, 0, 499)) || !(b.nome === null || (typeof b.nome === 'string' && b.nome.length <= 120))) return null
    blocos.push({ i: b.i, nome: b.nome, em_ms: b.em_ms })
    antes = b.em_ms
  }
  if (blocos[0].em_ms !== 0) return null
  return {
    id: o.id,
    roteiro: { id: r.id.slice(0, 120), titulo: r.titulo.slice(0, 300), versao: Number.isInteger(r.versao) ? r.versao : null },
    t0,
    dur_ms: o.duracao_ms,
    bip: o.bip,
    completo: o.completo === true,
    blocos,
  }
}

/** Lê o .jsonl. Linha ruim não derruba as outras: vai para `invalidas` (número da linha). Mesma leitura repetida conta uma vez. */
export function lerLeituras(texto) {
  const leituras = []
  const invalidas = []
  const vistas = new Set()
  String(texto)
    .split(/\r?\n/)
    .forEach((linha, k) => {
      if (!linha.trim()) return
      let l = null
      try {
        l = leitura(JSON.parse(linha))
      } catch {
        l = null
      }
      if (!l) invalidas.push(k + 1)
      else if (!vistas.has(l.id)) {
        vistas.add(l.id)
        leituras.push(l)
      }
    })
  leituras.sort((a, b) => a.t0 - b.t0)
  return { leituras, invalidas }
}

/** Junta leituras de mais de um arquivo (ou de uma importação anterior) pelo id. */
export function juntarLeituras(a, b) {
  const m = new Map(a.map((l) => [l.id, l]))
  for (const l of b) m.set(l.id, l)
  return [...m.values()].sort((x, y) => x.t0 - y.t0)
}

// ───────── o bip no áudio ─────────
// O bip do TPeasy é um seno de 1000 Hz que começa no volume cheio e some em ~160 ms (rampa exponencial: −2 dB em 5 ms,
// −13 dB em 30 ms). No sinal de 4 kHz do Synquei, 1000 Hz é sr/4: a cada 4 amostras (1 ms) a amplitude do tom sai de
// (x0 − x2, x1 − x3), sem filtro nenhum. Bip = o tom aparece de uma vez (nada 2–6 ms antes), segura os primeiros
// milissegundos, cai até 30 ms depois e, nesses 20 ms, quase toda a energia do som está num tom só, com a fase firme (a
// soma coerente dos 20 blocos: num tom ela cresce, em ruído se anula). Sílaba de fala sobe aos poucos; palma é ruído.

const PUREZA = 0.5

/** Amplitude do tom de sr/4 a cada 1 ms (4 amostras) e a energia total do mesmo trecho. */
function envelope(sig) {
  const n = Math.floor(sig.length / 4)
  const amp = new Float32Array(n)
  const pot = new Float32Array(n)
  const re = new Float32Array(n)
  const im = new Float32Array(n)
  for (let m = 0; m < n; m++) {
    const i = m * 4
    const I = (re[m] = sig[i] - sig[i + 2])
    const Q = (im[m] = sig[i + 1] - sig[i + 3])
    amp[m] = Math.sqrt(I * I + Q * Q) / 2
    pot[m] = (sig[i] ** 2 + sig[i + 1] ** 2 + sig[i + 2] ** 2 + sig[i + 3] ** 2) / 4
  }
  return { amp, pot, re, im }
}

const media = (xs, a, b) => {
  let s = 0
  for (let i = a; i < b; i++) s += xs[i]
  return s / Math.max(1, b - a)
}

/**
 * Onde o bip começa no clipe, em segundos (precisão de 1–2 ms). `sig` é o áudio mono do clipe a 4 kHz (o do Synquei);
 * devolve [{ t, forca }] em ordem, sem repetir o mesmo bip.
 */
export function acharBips(sig, sr = 4000, freq = 1000) {
  if (!sig || sr !== freq * 4 || sig.length < sr * 0.2) return []
  const { amp, pot, re, im } = envelope(sig)
  const ord = Float32Array.from(amp).sort()
  // fundo: o 20º percentil (o clipe pode ter mais fala que silêncio; o bip toca na pausa da contagem)
  const piso = Math.max(ord[Math.floor(ord.length / 5)] || 0, 1e-5)
  const bips = []
  for (let m = 6; m + 36 < amp.length; m++) {
    const pico = Math.max(amp[m], amp[m + 1], amp[m + 2])
    if (pico < piso * 5 || pico < 2e-3) continue
    if (amp[m] < pico * 0.6 || Math.max(amp[m - 6], amp[m - 5], amp[m - 4], amp[m - 3], amp[m - 2]) > pico * 0.25) continue
    if (media(amp, m + 3, m + 8) < pico * 0.55) continue
    // amplitude do tom com a fase somada (o ruído de fundo não soma): cai depois de 30 ms e domina os 20 primeiros
    const coerente = (a, b) => {
      let I = 0
      let Q = 0
      for (let j = a; j < b; j++) {
        I += re[j]
        Q += im[j]
      }
      return Math.sqrt(I * I + Q * Q) / (2 * (b - a))
    }
    if (coerente(m + 25, m + 36) > coerente(m, m + 8) * 0.5) continue
    const a = coerente(m, m + 20)
    if ((a * a) / 2 < PUREZA * media(pot, m, m + 20)) continue
    const t = m / 1000
    const ult = bips[bips.length - 1]
    if (ult && t - ult.t < 0.3) continue
    bips.push({ t, forca: pico })
  }
  return bips
}

// ───────── casar takes e leituras ─────────

const mediana = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

/** A diferença de relógio (câmera − celular) que mais takes deste aparelho confirmam. */
function relogioDoAparelho(pares) {
  if (!pares.length) return null
  const ord = [...pares].sort((a, b) => a.delta - b.delta)
  let melhor = null
  let empate = false
  for (let i = 0, j = 0; i < ord.length; i++) {
    while (ord[i].delta - ord[j].delta > 2 * TOLERANCIA_MS) j++
    const janela = ord.slice(j, i + 1)
    const apoio = new Set(janela.map((p) => p.clip)).size
    if (!melhor || apoio > melhor.apoio) {
      melhor = { apoio, delta: mediana(janela.map((p) => p.delta)) }
      empate = false
    } else if (apoio === melhor.apoio && Math.abs(mediana(janela.map((p) => p.delta)) - melhor.delta) > 2 * TOLERANCIA_MS) empate = true
  }
  if (melhor.apoio >= 2) return empate ? null : melhor
  // um take só: a leitura mais perto da hora, se for bem mais perto que a segunda; mesmo assim, para revisar
  const perto = pares.filter((p) => Math.abs(p.delta) <= JANELA_UM_TAKE_MS).sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))
  if (!perto.length) return null
  if (perto.length > 1 && Math.abs(perto[1].delta) < Math.abs(perto[0].delta) * 3 + 2 * TOLERANCIA_MS) return null
  return { apoio: 1, delta: perto[0].delta }
}

/**
 * Casa cada clipe com as leituras.
 * @param {Array<{ id, device, created: number|null, dur: number, bips: Array<{t}> }>} clipes `created` = hora da câmera
 *   no começo do clipe (ms); `dur` em segundos; `bips` de acharBips.
 * @param {Array} leituras de lerLeituras
 * @returns {Map<string, { estado: 'confirmado'|'revisar', motivo: string|null, leituras: Array, marcadores: Array<{t, nome, leitura}> }>}
 */
export function casar(clipes, leituras) {
  const comBip = leituras.filter((l) => l.bip)
  const porId = new Map(leituras.map((l) => [l.id, l]))
  const out = new Map()
  const porAparelho = new Map()
  for (const c of clipes) {
    if (!porAparelho.has(c.device)) porAparelho.set(c.device, [])
    porAparelho.get(c.device).push(c)
  }
  for (const doAparelho of porAparelho.values()) {
    const pares = []
    for (const c of doAparelho) {
      if (!Number.isFinite(c.created)) continue
      for (const b of c.bips || []) {
        for (const l of comBip) {
          const delta = c.created + b.t * 1000 - l.t0
          if (Math.abs(delta) <= JANELA_MAX_MS) pares.push({ clip: c.id, bip: b.t, leitura: l.id, delta })
        }
      }
    }
    const rel = relogioDoAparelho(pares)
    if (!rel) continue
    // cada bip com a leitura que bate com o relógio do aparelho; cada leitura num clipe só deste aparelho
    const certos = pares.filter((p) => Math.abs(p.delta - rel.delta) <= TOLERANCIA_MS)
    const usos = new Map()
    for (const p of certos) usos.set(p.leitura, (usos.get(p.leitura) || 0) + 1)
    for (const c of doAparelho) {
      const meus = certos.filter((p) => p.clip === c.id)
      const achados = []
      let motivo = null
      for (const b of c.bips || []) {
        const doBip = meus.filter((p) => p.bip === b.t)
        if (!doBip.length) continue
        if (doBip.length > 1) motivo = 'Mais de uma leitura no mesmo bip'
        else if (usos.get(doBip[0].leitura) > 1) motivo = 'A mesma leitura em mais de um clipe'
        else achados.push({ leitura: porId.get(doBip[0].leitura), bip_s: b.t, desvio_ms: Math.round(doBip[0].delta - rel.delta), viaBip: true })
      }
      // leitura sem bip: só pela hora, com o relógio do aparelho que os outros takes confirmaram
      if (Number.isFinite(c.created)) {
        for (const l of leituras) {
          if (l.bip || achados.some((a) => a.leitura.id === l.id)) continue
          const t = (l.t0 + rel.delta - c.created) / 1000
          if (t >= 0 && t < c.dur) {
            achados.push({ leitura: l, bip_s: t, desvio_ms: null, viaBip: false })
            motivo = motivo || 'Leitura sem bip: casada só pela hora'
          }
        }
      }
      if (!achados.length && !motivo) continue
      if (achados.length && rel.apoio < 2) motivo = motivo || 'Um take só: confira a hora'
      achados.sort((a, b) => a.bip_s - b.bip_s)
      const marcadores = []
      for (const a of achados) {
        for (const bl of a.leitura.blocos) {
          const t = a.bip_s + bl.em_ms / 1000
          if (bl.nome && t >= 0 && t < c.dur) marcadores.push({ t: Math.round(t * 1000) / 1000, nome: bl.nome, leitura: a.leitura.id })
        }
      }
      out.set(c.id, {
        estado: motivo || !achados.length ? 'revisar' : 'confirmado',
        motivo: motivo || (achados.length ? null : 'Bip sem leitura'),
        leituras: achados.map((a) => ({ id: a.leitura.id, titulo: a.leitura.roteiro.titulo, versao: a.leitura.roteiro.versao, bip_s: a.bip_s, desvio_ms: a.desvio_ms, viaBip: a.viaBip })),
        marcadores,
      })
    }
  }
  return out
}

/** Contagem para a tela: quantos clipes confirmados, para revisar e quantos já com os marcadores aceitos. */
export function resumoLeituras(project) {
  const r = { leituras: (project.tpeasy && project.tpeasy.leituras.length) || 0, confirmados: 0, revisar: 0, aceitos: 0 }
  for (const c of project.clips || []) {
    if (!c.tpeasy) continue
    if (c.tpeasy.estado === 'confirmado') r.confirmados++
    else r.revisar++
    if (c.tpeasy.aceito) r.aceitos++
  }
  return r
}
