// CAMZRO · exposição. Contas puras (rodam no navegador e nos testes em Node), sem tocar na câmera.
//
// - Obturador em ângulo e em velocidade (regra dos 180°): t = ângulo / (360 × fps).
// - Anti-flicker: a luz de rede pisca no dobro da frequência (50 Hz → 100 vezes por segundo; 60 Hz → 120). Sem
//   flicker, o tempo de exposição precisa cobrir ciclos inteiros: t = n / (2 × Hz), n ≥ 1, e t ≤ 1/fps.
//   Ex.: 24 fps na rede de 60 Hz → 1/120 s (72°), 1/60 s (144°)... na de 50 Hz → 172,8° (1/50 s).
// - EV100 = log2(N² / t) − log2(ISO / 100).
// - ND: densidade óptica D (0,3 por stop) e fator (ND8 = 3 stops). No celular a abertura é fixa: o ND que falta para
//   chegar no obturador desejado sem estourar sai da exposição automática medida agora.

const EPS = 1e-9

/** Tempo de exposição (s) para o ângulo de obturador numa cadência. 180° a 24 fps → 1/48 s. */
export function anguloParaTempo(angulo, fps) {
  if (!(angulo > 0) || !(fps > 0)) throw new RangeError('ângulo e fps precisam ser positivos')
  return angulo / (360 * fps)
}

/** Ângulo de obturador (°) para um tempo de exposição numa cadência. 1/50 s a 25 fps → 180°. */
export function tempoParaAngulo(tempo, fps) {
  if (!(tempo > 0) || !(fps > 0)) throw new RangeError('tempo e fps precisam ser positivos')
  return 360 * fps * tempo
}

/** Velocidades de obturador que as câmeras mostram (1/x). */
export const VELOCIDADES = [8000, 6400, 5000, 4000, 3200, 2500, 2000, 1600, 1250, 1000, 800, 640, 500, 400, 320, 250, 200, 160, 125, 120, 100, 96, 60, 50, 48, 30, 25, 24]

/** "1/48" (ou "1/2" para meio segundo; "2″" para 2 s). Arredonda o denominador como as câmeras. */
export function fracao(tempo) {
  if (!(tempo > 0)) return '—'
  if (tempo >= 1) return `${Number(tempo.toFixed(1)).toLocaleString('pt-BR')}″`
  const d = 1 / tempo
  return `1/${d >= 10 ? Math.round(d) : Number(d.toFixed(1)).toLocaleString('pt-BR')}`
}

/** Ângulo com uma casa quando precisa (172,8°), sem casa quando é inteiro (180°). */
export function anguloTexto(angulo) {
  if (!Number.isFinite(angulo)) return '—'
  const r = Math.round(angulo * 10) / 10
  return `${Number.isInteger(r) ? r : r.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}°`
}

/**
 * Tempos de exposição sem flicker para a rede (50 ou 60 Hz) que cabem no quadro (t ≤ 1/fps), do mais curto ao mais
 * longo, com o ângulo de cada um. Também diz se a cadência inteira já é segura (a cadência divide os pulsos da luz:
 * 25 ou 50 fps em 50 Hz; 30 ou 60 fps em 60 Hz), quando qualquer tempo múltiplo do pulso funciona.
 */
export function antiFlicker(hz, fps) {
  if (hz !== 50 && hz !== 60) throw new RangeError('rede elétrica: 50 ou 60 Hz')
  if (!(fps > 0)) throw new RangeError('fps precisa ser positivo')
  const pulso = 1 / (2 * hz)
  const quadro = 1 / fps
  const seguros = []
  for (let n = 1; n * pulso <= quadro + EPS; n++) {
    const tempo = n * pulso
    seguros.push({ n, tempo, angulo: tempoParaAngulo(tempo, fps), texto: fracao(tempo) })
  }
  const pulsosPorQuadro = (2 * hz) / fps
  return { pulso, seguros, cadenciaSegura: Math.abs(pulsosPorQuadro - Math.round(pulsosPorQuadro)) < 1e-6 }
}

/** O tempo sem flicker mais perto do pedido (ex.: pediu 180° a 24 fps em 50 Hz → 172,8°). null se nenhum cabe. */
export function tempoSemFlicker(tempo, hz, fps) {
  const { seguros } = antiFlicker(hz, fps)
  if (!seguros.length) return null
  // compara em stops (log2): 1/100 está mais perto de 1/120 do que 1/50 de 1/60, em exposição
  let melhor = seguros[0]
  for (const s of seguros) if (Math.abs(Math.log2(s.tempo / tempo)) < Math.abs(Math.log2(melhor.tempo / tempo))) melhor = s
  return melhor
}

/** EV100 de uma exposição: abertura f/N, tempo t (s), ISO. */
export function ev100(N, tempo, iso) {
  if (!(N > 0) || !(tempo > 0) || !(iso > 0)) throw new RangeError('abertura, tempo e ISO precisam ser positivos')
  return Math.log2((N * N) / tempo) - Math.log2(iso / 100)
}

/** Diferença em stops entre duas exposições (positivo: a segunda recebe mais luz). Abertura fixa no celular. */
export function stopsEntre(a, b) {
  const luz = (e) => (e.tempo * e.iso) / ((e.N || 1) * (e.N || 1))
  return Math.log2(luz(b) / luz(a))
}

/** ND por densidade óptica (0,3 = 1 stop; 0,9 = 3 stops). */
export const stopsDaDensidade = (d) => d / Math.log10(2)
/** ND por fator (ND2 = 1 stop, ND8 = 3, ND64 = 6). */
export const stopsDoFator = (f) => Math.log2(f)
/** Fator e densidade de um ND em stops. */
export const ndDeStops = (stops) => ({ stops, fator: 2 ** stops, densidade: Math.round(stops * Math.log10(2) * 100) / 100 })

/** Os filtros ND fixos que se vendem (densidade). */
export const NDS = [0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 2.4, 3.0]

/**
 * O ND que falta para filmar com o obturador e o ISO desejados sem perder a exposição que o automático achou agora.
 * Abertura fixa (celular). medido = { tempo, iso } (do modo automático), desejado = { tempo, iso }.
 * Devolve os stops de luz a mais (positivo = precisa de ND; negativo = falta luz), o ND fixo mais perto e o ajuste de
 * ISO que fecha a conta depois dele (em stops: negativo = baixar o ISO, positivo = subir).
 */
export function ndNecessario(medido, desejado) {
  const stops = Math.log2((desejado.tempo * desejado.iso) / (medido.tempo * medido.iso))
  if (stops < 1 / 6) return { stops, nd: null, ajusteIso: stops < -1 / 6 ? -stops : 0 }
  let nd = NDS[0]
  for (const d of NDS) if (Math.abs(stopsDaDensidade(d) - stops) < Math.abs(stopsDaDensidade(nd) - stops)) nd = d
  return { stops, nd, ajusteIso: -(stops - stopsDaDensidade(nd)) }
}

/** Texto curto de stops: "+1,3 stop", "−2 stops". */
export function stopsTexto(s) {
  const r = Math.round(s * 10) / 10
  const n = Math.abs(r).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${n} ${Math.abs(r) === 1 ? 'stop' : 'stops'}`
}

/** Cadências do cinema e da TV, com o valor exato (23,976 = 24000/1001). */
export const CADENCIAS = [
  { id: '23.976', fps: 24000 / 1001, nominal: 24, rotulo: '23,976' },
  { id: '24', fps: 24, nominal: 24, rotulo: '24' },
  { id: '25', fps: 25, nominal: 25, rotulo: '25' },
  { id: '29.97', fps: 30000 / 1001, nominal: 30, rotulo: '29,97' },
  { id: '30', fps: 30, nominal: 30, rotulo: '30' },
  { id: '48', fps: 48, nominal: 48, rotulo: '48' },
  { id: '50', fps: 50, nominal: 50, rotulo: '50' },
  { id: '59.94', fps: 60000 / 1001, nominal: 60, rotulo: '59,94' },
  { id: '60', fps: 60, nominal: 60, rotulo: '60' },
  { id: '120', fps: 120, nominal: 120, rotulo: '120' },
]

export const cadencia = (id) => CADENCIAS.find((c) => c.id === String(id)) || null

/**
 * Câmera lenta: gravando a `fpsCaptura` e reproduzindo a `fpsProjeto`, quanto fica mais lento (60 → 24 = 2,5×) e
 * quanto tempo de tela sai de cada segundo gravado.
 */
export function camaraLenta(fpsCaptura, fpsProjeto) {
  const fator = fpsCaptura / fpsProjeto
  return { fator, porcentagem: Math.round((fpsProjeto / fpsCaptura) * 1000) / 10, segundosDeTelaPorSegundo: fator }
}

/**
 * Exposição automática com prioridade (o laço que o celular não dá ao navegador): mede a luma média do quadro e diz
 * quantos stops mudar. A imagem tem gama (~2,2): dobrar a luz sobe a luma em 2^(1/2,2), então
 * stops = 2,2 × log2(alvo / medido). Alvo 0,42 ≈ cinza 18% em Rec.709; o EV desloca o alvo. Passo máximo de 1/3 de
 * stop por leitura (sem "respirar") e zona morta de 0,1 stop (sem ficar caçando).
 */
export function stopsParaAlvo(medido, { alvo = 0.42, ev = 0, gama = 2.2, passoMax = 1 / 3, zonaMorta = 0.1 } = {}) {
  const alvoEv = Math.min(0.95, alvo * 2 ** (ev / gama))
  if (!(medido > 0.002)) return passoMax
  const s = gama * Math.log2(alvoEv / medido)
  if (Math.abs(s) < zonaMorta) return 0
  return Math.max(-passoMax, Math.min(passoMax, s))
}

/**
 * Aplica os stops no que está livre: prioridade de obturador mexe no ISO; prioridade de ISO mexe no tempo (até o
 * tempo do quadro). Devolve { iso, tempo, limite: null|'luz-demais'|'falta-luz' } (no limite, a tela sugere ND ou ISO).
 */
export function aplicarStops({ iso, tempo }, stops, modo, { iso: fIso, tempo: fTempo, fps }) {
  if (modo === 'obturador') {
    const novo = iso * 2 ** stops
    const min = fIso?.min ?? 25
    const max = fIso?.max ?? 12800
    const preso = Math.min(max, Math.max(min, novo))
    return { iso: preso, tempo, limite: novo < min * 0.99 ? 'luz-demais' : novo > max * 1.01 ? 'falta-luz' : null }
  }
  const novo = tempo * 2 ** stops
  const min = fTempo?.min ?? 1 / 8000
  const max = Math.min(fTempo?.max ?? 1, 1 / fps)
  const preso = Math.min(max, Math.max(min, novo))
  return { iso, tempo: preso, limite: novo < min * 0.99 ? 'luz-demais' : novo > max * 1.01 ? 'falta-luz' : null }
}
