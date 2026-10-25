// Short synthesized interface sounds for the public site. No audio files, no network.
// The context is created inside the first user gesture and the preference is kept per browser.
const KEY = 'nossom:ui-sound';
type Sound = 'tap' | 'soft' | 'step' | 'open' | 'close' | 'on';
let ctx: AudioContext | null = null,
  master: GainNode | null = null;

export function uiSoundEnabled() {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setUiSound(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {}
  if (on) playUiSound('on', true);
}
function context() {
  if (ctx) return ctx;
  const AC =
    typeof window === 'undefined'
      ? undefined
      : window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.12;
  master.connect(ctx.destination);
  return ctx;
}
function tone(
  a: AudioContext,
  type: OscillatorType,
  from: number,
  to: number,
  t0: number,
  attack: number,
  decay: number,
  peak: number,
) {
  const o = a.createOscillator(),
    g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t0);
  o.frequency.exponentialRampToValueAtTime(to, t0 + attack + decay);
  g.gain.setValueAtTime(1e-4, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(1e-4, t0 + attack + decay);
  o.connect(g).connect(master!);
  o.start(t0);
  o.stop(t0 + attack + decay + 0.02);
}
const palette: Record<Sound, (a: AudioContext, t: number) => void> = {
  // Glassy tick for primary actions.
  tap: (a, t) => {
    tone(a, 'triangle', 1240, 880, t, 0.003, 0.06, 0.5);
    tone(a, 'sine', 2480, 2100, t, 0.002, 0.04, 0.12);
  },
  soft: (a, t) => tone(a, 'sine', 760, 620, t, 0.004, 0.05, 0.35),
  step: (a, t) => tone(a, 'sine', 980, 900, t, 0.003, 0.035, 0.22),
  open: (a, t) => {
    tone(a, 'sine', 520, 780, t, 0.01, 0.12, 0.3);
    tone(a, 'sine', 1040, 1560, t + 0.03, 0.01, 0.1, 0.1);
  },
  close: (a, t) => tone(a, 'sine', 760, 480, t, 0.008, 0.1, 0.28),
  on: (a, t) => {
    tone(a, 'sine', 660, 660, t, 0.006, 0.09, 0.3);
    tone(a, 'sine', 990, 990, t + 0.08, 0.006, 0.14, 0.26);
  },
};
export function playUiSound(sound: Sound, force = false) {
  if (!force && !uiSoundEnabled()) return;
  const a = context();
  if (!a) return;
  // Sounds scheduled on a suspended context would all fire later at once.
  if (a.state === 'suspended') {
    a.resume().catch(() => {});
    return;
  }
  try {
    palette[sound](a, a.currentTime + 0.005);
  } catch {}
}
