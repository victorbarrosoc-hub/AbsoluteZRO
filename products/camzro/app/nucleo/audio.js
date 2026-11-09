// CAMZRO · medidores de áudio. Contas puras; o worklet (motor/medidor.worklet.js) roda as mesmas.
//
// - dBFS = 20 × log10(amplitude). Pico verdadeiro não: pico de amostra (o que a câmera também mostra).
// - Balística de pico (IEC 60268-18): sobe na hora e cai 20 dB em 1,7 s (≈ 11,8 dB/s); segura o pico 1,5 s.
// - Loudness (ITU-R BS.1770 / EBU R128): filtro K (prateleira +4 dB acima de ~1,7 kHz e passa-altas em ~38 Hz),
//   média quadrática ponderada por canal e LUFS = −0,691 + 10 × log10(Σ média). Momentânea = janela de 400 ms.
//   Coeficientes calculados para qualquer taxa (a 48 kHz batem com os publicados na norma).

export const PISO_DB = -90

export const dbfs = (amp) => (amp > 0 ? Math.max(PISO_DB, 20 * Math.log10(amp)) : PISO_DB)
export const ampDe = (db) => 10 ** (db / 20)

/** Coeficientes do filtro K para a taxa `fs`: dois biquads { b: [b0,b1,b2], a: [1,a1,a2] }. */
export function filtroK(fs) {
  // estágio 1: prateleira alta (efeito da cabeça)
  const f0 = 1681.974450955533
  const G = 3.999843853973347
  const Q = 0.7071752369554196
  const K = Math.tan((Math.PI * f0) / fs)
  const Vh = 10 ** (G / 20)
  const Vb = Vh ** 0.4996667741545416
  const a0 = 1 + K / Q + K * K
  const prateleira = {
    b: [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0],
    a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0],
  }
  // estágio 2: passa-altas RLB
  const f1 = 38.13547087602444
  const Q1 = 0.5003270373238773
  const K1 = Math.tan((Math.PI * f1) / fs)
  const d = 1 + K1 / Q1 + K1 * K1
  const passaAltas = { b: [1, -2, 1], a: [1, (2 * (K1 * K1 - 1)) / d, (1 - K1 / Q1 + K1 * K1) / d] }
  return [prateleira, passaAltas]
}

/** Biquad em forma direta II transposta, com estado (para processar em blocos). */
export function criarBiquad({ b, a }) {
  let z1 = 0
  let z2 = 0
  return (x) => {
    const y = b[0] * x + z1
    z1 = b[1] * x - a[1] * y + z2
    z2 = b[2] * x - a[2] * y
    return y
  }
}

/**
 * Medidor por canal: pico com balística, RMS do bloco e loudness momentânea (400 ms). Alimente com blocos
 * Float32Array por canal (ex.: 128 amostras do AudioWorklet). leitura() devolve dB prontos para a tela.
 */
export function criarMedidor({ fs = 48000, canais = 2, queda = 20 / 1.7, segura = 1.5 } = {}) {
  const k = filtroK(fs)
  const filtros = Array.from({ length: canais }, () => k.map(criarBiquad))
  const janela = Math.round(0.4 * fs)
  const quadrados = Array.from({ length: canais }, () => new Float64Array(janela))
  const somas = new Float64Array(canais)
  let pos = 0
  let preenchido = 0
  const pico = new Float64Array(canais).fill(PISO_DB)
  const picoSegurado = new Float64Array(canais).fill(PISO_DB)
  const desdeOPico = new Float64Array(canais)
  const rms = new Float64Array(canais).fill(PISO_DB)
  let estouros = 0
  return {
    processar(blocos) {
      const n = blocos[0]?.length || 0
      if (!n) return
      const dt = n / fs
      for (let c = 0; c < canais; c++) {
        const x = blocos[c] || blocos[0]
        let max = 0
        let soma = 0
        for (let i = 0; i < n; i++) {
          const v = x[i]
          const av = v < 0 ? -v : v
          if (av > max) max = av
          soma += v * v
          const w = filtros[c][1](filtros[c][0](v))
          const p = (pos + i) % janela
          somas[c] += w * w - quadrados[c][p]
          quadrados[c][p] = w * w
        }
        const db = dbfs(max)
        pico[c] = db >= pico[c] ? db : Math.max(db, pico[c] - queda * dt)
        desdeOPico[c] += dt
        if (db >= picoSegurado[c] || desdeOPico[c] > segura) {
          picoSegurado[c] = db
          desdeOPico[c] = 0
        }
        rms[c] = dbfs(Math.sqrt(soma / n))
        if (max >= 0.999) estouros++
      }
      pos = (pos + n) % janela
      preenchido = Math.min(janela, preenchido + n)
    },
    leitura() {
      let total = 0
      for (let c = 0; c < canais; c++) total += Math.max(0, somas[c]) / Math.max(1, preenchido)
      const lufs = total > 0 ? Math.max(PISO_DB, -0.691 + 10 * Math.log10(total)) : PISO_DB
      return { pico: [...pico], picoSegurado: [...picoSegurado], rms: [...rms], lufs, estouros }
    },
  }
}

/** Faixa do nível para a cor do medidor: verde até −12, amarelo até −6, vermelho acima (como as câmeras). */
export const faixaDoNivel = (db) => (db >= -6 ? 'alto' : db >= -12 ? 'bom' : db >= -40 ? 'baixo' : 'silencio')

/** Posição (0–1) de um dB na barra do medidor, de −60 a 0, mais espaço nos níveis de trabalho. */
export function posicaoNoMedidor(db) {
  if (db <= -60) return 0
  if (db >= 0) return 1
  // dois trechos lineares: −60…−20 ocupa 35%, −20…0 ocupa 65%
  return db < -20 ? ((db + 60) / 40) * 0.35 : 0.35 + ((db + 20) / 20) * 0.65
}

/**
 * Bip de sincronia: a MESMA assinatura do bip do TPeasy (products/tpeasy/app/js/util.js, beep(1000, 160, 0.25)) que o
 * Synquei já acha no áudio (acharBips em products/synquei/app/js/tpeasy.js): seno de 1 kHz, ataque seco, volume 0,25
 * e queda exponencial até 0,0001 em 160 ms (cai ~13 dB nos primeiros 30 ms, bem abaixo da metade que o Synquei exige). O ataque seco é o que a correlação do
 * Synquei alinha entre a câmera e o gravador de som.
 */
export const BIP = Object.freeze({ hz: 1000, ms: 160, amp: 0.25, piso: 0.0001 })

export function bip({ fs = 48000, hz = BIP.hz, ms = BIP.ms, amp = BIP.amp, piso = BIP.piso } = {}) {
  const n = Math.round((ms / 1000) * fs)
  const s = new Float32Array(n)
  for (let i = 0; i < n; i++) s[i] = amp * (piso / amp) ** (i / n) * Math.sin((2 * Math.PI * hz * i) / fs)
  return s
}
