// Rolar com a voz: o microfone só detecta SE você está falando (não o que fala).
// Funciona offline e no app instalado, ao contrário do reconhecimento de fala do Safari.
let stream = null;
let ctx = null;
let analyser = null;
let buf = null;
let floor = 0.004;
let lastVoice = 0;

export const voice = { on: false, speaking: false, level: 0 };

export async function startVoice() {
  if (voice.on) return true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (err) {
    throw new Error(err && err.name === "NotAllowedError" ? "Libere o microfone para o TPeasy nos Ajustes do iPhone." : "Não foi possível abrir o microfone.");
  }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") await ctx.resume();
  const src = ctx.createMediaStreamSource(stream);
  analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  buf = new Float32Array(analyser.fftSize);
  src.connect(analyser);
  floor = 0.004;
  voice.on = true;
  voice.speaking = false;
  return true;
}

export function stopVoice() {
  voice.on = false;
  voice.speaking = false;
  voice.level = 0;
  try {
    stream && stream.getTracks().forEach((t) => t.stop());
  } catch {}
  try {
    ctx && ctx.close();
  } catch {}
  stream = ctx = analyser = null;
}

// Chamado a cada quadro. sens: 0–100 (mais alto = pega voz mais baixa); hold: ms de silêncio antes de parar.
export function sampleVoice(now, sens = 55, hold = 700) {
  if (!voice.on || !analyser) return;
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / buf.length);
  // o "chão" de ruído desce rápido e sobe devagar
  floor = rms < floor ? floor * 0.9 + rms * 0.1 : floor * 0.998 + rms * 0.002;
  const ratio = 1.6 + ((100 - sens) / 100) * 4;
  const min = 0.006 + ((100 - sens) / 100) * 0.02;
  const talking = rms > Math.max(min, floor * ratio);
  if (talking) lastVoice = now;
  voice.speaking = now - lastVoice < hold;
  voice.level = Math.min(1, rms / 0.12);
}
