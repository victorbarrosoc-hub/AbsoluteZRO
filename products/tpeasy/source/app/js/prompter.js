// O teleprompter: rolagem por palavras/minuto, área calibrada, espelho, voz, gestos e controle Bluetooth.
import { $, $$, clamp, fmtClock, beep } from "./util.js";
import { S, areaNow, orient, savePrefs, byId, updateScript, countWords, renderScript, logSession, on, emit, FONTS, COLORS, ui } from "./data.js";
import { toast, openSheet, closeSheet, sheetIsOpen } from "./ui.js";
import { setPref, syncSettingsUI } from "./settings.js";
import { voice, startVoice, stopVoice, sampleVoice } from "./voice.js";
import { startHost, qrSvg, remoteUrl } from "./link.js";

const prompter = $("#prompter");
const stage = $("#stage");
const flip = $("#flip");
const textEl = $("#text");
const focusEl = $("#focus");
const guideEl = $("#guide");
const hud = $("#hud");
const playBtn = $("#pPlay");
const micBtn = $("#pMic");
const cdEl = $("#countdown");
const endEl = $("#endcard");
const calibEl = $("#calib");
const calibRect = $("#calibRect");
const liveSheet = $("#tpSheetLayer");

const P = {
  open: false,
  id: null,
  playing: false,
  counting: false,
  needsCountdown: true,
  pos: 0,
  max: 0,
  frac: 0,
  pxps: 0,
  v: 0,
  fling: 0,
  dragging: false,
  words: 1,
  last: 0,
  raf: 0,
  hudTimer: 0,
  cdTimer: 0,
  lock: null,
  lastSec: -1,
  saveTick: 0,
  padTop: 0,
  readSecs: 0,
  fracStart: 0,
  fracMax: 0,
  onClose: null,
};
export const prompterOpen = () => P.open;

const probe = document.createElement("div");
probe.style.cssText =
  "position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
document.body.append(probe);
function safeInsets() {
  const cs = getComputedStyle(probe);
  return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
}
const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// ───────────── layout ─────────────
export function layout() {
  if (!P.open) return;
  const s = S();
  const W = innerWidth;
  const H = innerHeight;
  const a = areaNow();
  let l = (W * a.l) / 100;
  let r = (W * a.r) / 100;
  let t = (H * a.t) / 100;
  let b = (H * a.b) / 100;
  if (s.avoidNotch) {
    const sa = safeInsets();
    l = Math.max(l, sa.l);
    r = Math.max(r, sa.r);
    t = Math.max(t, sa.t);
    b = Math.max(b, sa.b);
  }
  const aw = Math.max(80, W - l - r);
  const ah = Math.max(80, H - t - b);
  Object.assign(stage.style, { left: l + "px", top: t + "px", width: aw + "px", height: ah + "px" });

  const c = COLORS[s.colors] || COLORS.white;
  prompter.style.setProperty("--p-bg", c.bg);
  prompter.style.setProperty("--p-fg", c.fg);
  $('meta[name="theme-color"]').content = c.bg;
  const m = `scale(${s.mirrorX ? -1 : 1}, ${s.mirrorY ? -1 : 1})`;
  flip.style.transform = m;
  cdEl.style.transform = m;

  const lh = s.fontSize * s.lineHeight;
  const g = (ah * s.guidePos) / 100;
  const padX = s.guide ? Math.min(14, aw * 0.03) : 0;
  P.padTop = Math.max(0, g - lh / 2);
  Object.assign(textEl.style, {
    fontFamily: FONTS[s.font] || FONTS.system,
    fontWeight: String(s.weight),
    fontSize: s.fontSize + "px",
    lineHeight: String(s.lineHeight),
    textAlign: s.align,
    paddingTop: P.padTop + "px",
    paddingBottom: ah + "px",
    paddingLeft: padX + "px",
    paddingRight: padX + "px",
  });
  const textH = Math.max(0, textEl.offsetHeight - P.padTop - ah);
  P.max = Math.max(0, textH - lh * 0.75);
  P.pxps = ((s.wpm / 60) * textH) / Math.max(1, P.words);
  P.pos = P.frac * P.max;

  guideEl.hidden = !s.guide;
  guideEl.style.top = g + "px";
  const fa = s.focus / 100;
  if (fa > 0) {
    const band = lh * 0.62;
    const onC = rgba(c.bg, fa);
    const off = rgba(c.bg, 0);
    focusEl.style.background = `linear-gradient(to bottom, ${onC} 0px, ${onC} ${g - band * 2.2}px, ${off} ${g - band}px, ${off} ${g + band}px, ${onC} ${g + band * 2.6}px, ${onC} 100%)`;
  } else focusEl.style.background = "none";

  $("#pMirror").setAttribute("aria-pressed", String(s.mirrorX || s.mirrorY));
  $("#pSpeed b").textContent = s.wpm;
  P.lastSec = -1;
  render();
}
on("setting", () => {
  layout();
  if (!calibEl.hidden) drawCalib();
});

function render() {
  textEl.style.transform = `translate3d(0, ${-P.pos.toFixed(2)}px, 0)`;
  const frac = P.max ? P.pos / P.max : 0;
  $("#pProgress").style.transform = `scaleX(${frac.toFixed(4)})`;
  const sec = P.pxps ? Math.round(P.pos / P.pxps) : 0;
  if (sec !== P.lastSec) {
    P.lastSec = sec;
    const total = P.pxps ? P.max / P.pxps : 0;
    $("#pTime").textContent = fmtClock(sec);
    $("#pTime").title = `Total ${fmtClock(total)}`;
  }
}

function tick(now) {
  const dt = Math.min(0.05, (now - (P.last || now)) / 1000);
  P.last = now;
  const s = S();
  if (voice.on) {
    sampleVoice(now, s.voiceSens, s.voiceHold);
    micBtn.style.setProperty("--lvl", voice.speaking ? (0.35 + voice.level * 0.65).toFixed(2) : "0");
  }
  const moving = P.playing && !P.dragging && (!voice.on || voice.speaking);
  const target = moving ? P.pxps : 0;
  P.v += (target - P.v) * Math.min(1, dt * (voice.on ? 7 : 5));
  if (!moving && Math.abs(P.v) < 0.3) P.v = 0;
  if (P.v > 1) P.readSecs += dt * (P.v / Math.max(1, P.pxps));
  if (!P.dragging) {
    P.pos += (P.v + P.fling) * dt;
    P.fling *= Math.exp(-dt * 3.5);
    if (Math.abs(P.fling) < 2) P.fling = 0;
  }
  if (P.pos < 0) {
    P.pos = 0;
    P.fling = 0;
  }
  if (P.pos >= P.max) {
    P.pos = P.max;
    P.fling = 0;
    if (P.playing) reachEnd();
  }
  P.frac = P.max ? P.pos / P.max : 0;
  P.fracMax = Math.max(P.fracMax, P.frac);
  render();
  if (now - P.saveTick > 2000) {
    P.saveTick = now;
    savePos();
  }
  P.raf = requestAnimationFrame(tick);
}

function savePos() {
  const s = byId(P.id);
  if (s && Math.abs((s.pos || 0) - P.frac) > 0.001) updateScript(P.id, { pos: P.frac, readAt: Date.now() }, false);
}

// ───────────── tocar / pausar ─────────────
function setPlaying(on) {
  P.playing = on;
  playBtn.classList.toggle("is-paused", !on);
  playBtn.innerHTML = `<svg class="icon"><use href="#i-${on ? "pause" : "play"}"/></svg>`;
  playBtn.setAttribute("aria-label", on ? "Pausar" : "Iniciar");
  prompter.classList.toggle("is-playing", on);
  if (on) {
    endEl.hidden = true;
    scheduleHud();
  } else showHud(false);
}
function cancelCountdown() {
  clearInterval(P.cdTimer);
  P.counting = false;
  cdEl.hidden = true;
}
function startCountdown(n) {
  P.counting = true;
  let k = n;
  const span = cdEl.firstElementChild;
  const show = () => {
    span.textContent = k;
    span.style.animation = "none";
    void span.offsetWidth;
    span.style.animation = "";
    if (ui.sounds) beep(660, 70, 0.08);
  };
  cdEl.hidden = false;
  show();
  hud.classList.add("is-hidden");
  P.cdTimer = setInterval(() => {
    k -= 1;
    if (k <= 0) {
      cancelCountdown();
      if (S().beep) beep(1000, 160, 0.25);
      setPlaying(true);
    } else show();
  }, 1000);
}
export function togglePlay() {
  if (P.counting) {
    cancelCountdown();
    showHud(false);
    return;
  }
  if (P.playing) return setPlaying(false);
  if (P.pos >= P.max - 1) {
    P.pos = P.frac = 0;
  }
  endEl.hidden = true;
  const n = S().countdown;
  if (P.needsCountdown && n > 0) {
    P.needsCountdown = false;
    startCountdown(n);
  } else {
    P.needsCountdown = false;
    setPlaying(true);
  }
}
function reachEnd() {
  setPlaying(false);
  endEl.hidden = false;
}
function rewind() {
  cancelCountdown();
  P.pos = P.frac = P.fling = 0;
  P.needsCountdown = true;
  endEl.hidden = true;
  setPlaying(false);
}
// pula para o parágrafo/bloco seguinte ou anterior
function jumpBlock(dir) {
  const items = $$("p, .sec", textEl).map((el) => el.offsetTop - P.padTop);
  const cur = P.pos;
  let target = cur;
  if (dir > 0) target = items.find((y) => y > cur + 4) ?? P.max;
  else {
    const prev = items.filter((y) => y < cur - 4);
    target = prev.length ? prev[prev.length - 1] : 0;
  }
  P.pos = clamp(target, 0, P.max);
  P.fling = 0;
}

// ───────────── controle remoto ─────────────
// O outro aparelho vê o roteiro sem espelho e escolhe o parágrafo; o TP pula para lá.
const blockTops = () => $$("p, .sec", textEl).map((el) => el.offsetTop - P.padTop);
function blockIndex() {
  const tops = blockTops();
  let i = 0;
  for (let k = 0; k < tops.length; k++) {
    if (tops[k] <= P.pos + 2) i = k;
    else break;
  }
  return i;
}
function jumpTo(i) {
  const tops = blockTops();
  if (!tops.length) return;
  P.pos = clamp(tops[clamp(i, 0, tops.length - 1)], 0, P.max);
  P.fling = 0;
  endEl.hidden = true;
}
const remoteEl = $("#remotePanel");
const remoteBtn = $("#pRemote");
let host = null;
const remoteHello = () => {
  const s = byId(P.id);
  return { ...remoteState(), t: "hello", title: (s && s.title) || "Sem título", body: (s && s.body) || "" };
};
function remoteState() {
  return { t: "state", playing: P.playing || P.counting, i: blockIndex(), frac: +P.frac.toFixed(4), wpm: S().wpm, end: !endEl.hidden };
}
function onRemoteCommand(d) {
  if (!P.open) return;
  const c = d.c;
  if (c === "toggle") togglePlay();
  else if (c === "play" && !P.playing && !P.counting) togglePlay();
  else if (c === "pause" && (P.playing || P.counting)) togglePlay();
  else if (c === "jump") jumpTo(+d.i || 0);
  else if (c === "block") jumpBlock(d.d > 0 ? 1 : -1);
  else if (c === "rewind") rewind();
  else if (c === "speed") setPref("wpm", clamp(S().wpm + (d.d > 0 ? 5 : -5), 60, 320));
}
function renderRemoteStatus(st) {
  remoteBtn.setAttribute("aria-pressed", String(st.count > 0));
  remoteBtn.classList.toggle("is-live", st.count > 0);
  $("#rpCode").textContent = st.code || "·····";
  $("#rpStatus").textContent =
    st.status === "error" ? st.error : st.count > 0 ? (st.count === 1 ? "1 aparelho conectado" : `${st.count} aparelhos conectados`) : st.status === "ready" ? "Aponte a câmera do outro aparelho" : "Preparando…";
  $("#rpStatus").classList.toggle("is-on", st.count > 0);
}
let lastQrCode = "";
async function openRemote() {
  if (!P.open) return;
  cancelCountdown();
  setPlaying(false);
  hud.classList.add("is-hidden");
  remoteEl.hidden = false;
  if (host) return renderRemoteStatus({ status: "ready", code: host.code, count: host.count });
  renderRemoteStatus({ status: "loading" });
  try {
    host = await startHost({
      hello: remoteHello,
      state: remoteState,
      onCommand: onRemoteCommand,
      onStatus: async (st) => {
        renderRemoteStatus(st);
        if (st.code && st.code !== lastQrCode) {
          lastQrCode = st.code;
          $("#rpLink").textContent = remoteUrl(st.code).replace(/^https?:\/\//, "");
          try {
            $("#rpQr").innerHTML = await qrSvg(remoteUrl(st.code));
          } catch {}
        }
        if (st.count > 0 && !remoteEl.hidden && st.status === "ready") toast("Controle conectado");
      },
    });
  } catch (err) {
    renderRemoteStatus({ status: "error", error: err.message });
  }
}
function closeRemotePanel() {
  remoteEl.hidden = true;
  showHud(false);
}
function stopRemote() {
  if (host) host.stop();
  host = null;
  lastQrCode = "";
  $("#rpQr").innerHTML = "";
  remoteBtn.setAttribute("aria-pressed", "false");
  remoteBtn.classList.remove("is-live");
}
remoteBtn.addEventListener("click", openRemote);
$("#rpDone").addEventListener("click", closeRemotePanel);
$("#rpOff").addEventListener("click", () => {
  stopRemote();
  closeRemotePanel();
  toast("Controle desligado");
});

function showHud(autoHide = true) {
  hud.classList.remove("is-hidden");
  clearTimeout(P.hudTimer);
  if (autoHide && P.playing) scheduleHud();
}
function scheduleHud() {
  clearTimeout(P.hudTimer);
  P.hudTimer = setTimeout(() => {
    if (P.playing && !sheetIsOpen(liveSheet)) hud.classList.add("is-hidden");
  }, 1800);
}

async function lockScreen() {
  try {
    if ("wakeLock" in navigator) P.lock = await navigator.wakeLock.request("screen");
  } catch {}
}
document.addEventListener("visibilitychange", () => {
  if (!P.open) return;
  if (document.visibilityState === "visible") lockScreen();
  else {
    setPlaying(false);
    savePos();
  }
});

// ───────────── abrir / fechar ─────────────
export function openPrompter(id, { calib = false, remote = false, onClose = null } = {}) {
  const s = byId(id);
  if (!s) return;
  P.id = id;
  P.onClose = onClose;
  P.words = Math.max(1, countWords(s.body));
  textEl.innerHTML = renderScript(s.body);
  P.frac = s.pos && s.pos < 0.985 ? s.pos : 0;
  P.fracStart = P.fracMax = P.frac;
  P.readSecs = 0;
  P.needsCountdown = true;
  P.v = P.fling = 0;
  P.open = true;
  endEl.hidden = true;
  prompter.hidden = false;
  document.documentElement.classList.add("no-scroll", "has-prompter");
  layout();
  setPlaying(false);
  requestAnimationFrame(() => prompter.classList.add("is-in"));
  P.last = 0;
  cancelAnimationFrame(P.raf);
  P.raf = requestAnimationFrame(tick);
  lockScreen();
  updateMic();
  if (host) host.resend();
  if (calib) openCalib();
  else if (remote) openRemote();
  else if (P.frac > 0.01) toast("Continuando", 1200);
}
export function closePrompter() {
  if (!P.open) return;
  cancelCountdown();
  setPlaying(false);
  savePos();
  closeCalib(false);
  remoteEl.hidden = true;
  stopRemote();
  if (voice.on) stopVoice();
  const words = Math.round((P.fracMax - P.fracStart) * P.words);
  if (P.readSecs > 5 && words > 3) logSession({ at: Date.now(), scriptId: P.id, secs: Math.round(P.readSecs), words, wpm: S().wpm });
  P.open = false;
  cancelAnimationFrame(P.raf);
  try {
    P.lock && P.lock.release();
  } catch {}
  P.lock = null;
  prompter.classList.remove("is-in");
  document.documentElement.classList.remove("has-prompter");
  if (sheetIsOpen(liveSheet)) closeSheet(liveSheet);
  setTimeout(() => {
    if (!P.open) prompter.hidden = true;
  }, 260);
  document.documentElement.classList.remove("no-scroll");
  $('meta[name="theme-color"]').content = matchMedia("(prefers-color-scheme: dark)").matches ? "#000000" : "#f5f5f7";
  emit("prompter:closed", P.id);
  P.onClose && P.onClose();
}

// ───────────── voz ─────────────
function updateMic() {
  micBtn.setAttribute("aria-pressed", String(voice.on));
  micBtn.style.setProperty("--lvl", "0");
}
async function toggleVoice() {
  if (voice.on) {
    stopVoice();
    updateMic();
    toast("Voz desligada");
    return;
  }
  try {
    await startVoice();
    updateMic();
    toast("Voz ligada");
    if (!P.playing && !P.counting) togglePlay();
  } catch (err) {
    toast(err.message, 2800);
  }
}

// ───────────── toque, arrasto e pinça ─────────────
const pts = new Map();
let drag = null;
let pinch = null;
const dirY = () => (S().mirrorY ? -1 : 1);
const dist = () => {
  const [a, b] = Array.from(pts.values());
  return Math.hypot(a.x - b.x, a.y - b.y);
};
prompter.addEventListener("pointerdown", (e) => {
  if (e.target.closest("button, .calib, .endcard, .remote")) return;
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try {
    prompter.setPointerCapture(e.pointerId);
  } catch {}
  if (pts.size === 1) {
    drag = { y0: e.clientY, x0: e.clientX, y: e.clientY, t0: performance.now(), lastT: performance.now(), vel: 0, moved: false };
    P.fling = 0;
  } else if (pts.size === 2) {
    pinch = { d0: dist(), size0: S().fontSize };
    if (drag) drag.moved = true;
    P.dragging = false;
  }
});
prompter.addEventListener("pointermove", (e) => {
  const p = pts.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX;
  p.y = e.clientY;
  if (pinch && pts.size >= 2) {
    const size = clamp(Math.round(pinch.size0 * (dist() / pinch.d0)), 16, 160);
    if (size !== S().fontSize) {
      setPref("fontSize", size);
      toast(`Tamanho ${size}`, 900);
    }
    return;
  }
  if (!drag || pts.size !== 1) return;
  const dy = e.clientY - drag.y;
  const now = performance.now();
  if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 8) {
    drag.moved = true;
    P.dragging = true;
  }
  if (drag.moved) {
    P.pos = clamp(P.pos - dy * dirY(), 0, P.max);
    const dtt = Math.max(1, now - drag.lastT);
    drag.vel = drag.vel * 0.6 + (dy / dtt) * 1000 * 0.4;
    drag.lastT = now;
  }
  drag.y = e.clientY;
});
const endPointer = (e) => {
  if (!pts.has(e.pointerId)) return;
  pts.delete(e.pointerId);
  if (pinch) {
    if (pts.size < 2) pinch = null;
    if (pts.size === 0) drag = null;
    return;
  }
  if (!drag) return;
  if (!drag.moved && performance.now() - drag.t0 < 350 && e.type === "pointerup") togglePlay();
  else if (drag.moved) {
    const fresh = performance.now() - drag.lastT < 80;
    P.fling = fresh ? clamp(-drag.vel * dirY(), -4000, 4000) : 0;
  }
  P.dragging = false;
  drag = null;
};
prompter.addEventListener("pointerup", endPointer);
prompter.addEventListener("pointercancel", endPointer);
document.addEventListener("gesturestart", (e) => e.preventDefault());

// ───────────── HUD ─────────────
playBtn.addEventListener("click", togglePlay);
micBtn.addEventListener("click", toggleVoice);
$("#pClose").addEventListener("click", closePrompter);
$("#restart").addEventListener("click", rewind);
$("#pMirror").addEventListener("click", () => {
  const s = S();
  const onM = !(s.mirrorX || s.mirrorY);
  setPref("mirrorX", onM);
  if (!onM) setPref("mirrorY", false);
  toast(onM ? "Espelhado" : "Sem espelho");
  showHud();
});
$("#pSettings").addEventListener("click", () => {
  syncSettingsUI();
  openSheet(liveSheet, { live: true });
  showHud(false);
});
$("#pArea").addEventListener("click", openCalib);
const STEP = { wpm: [5, 60, 320] };
$$("[data-step]").forEach((b) =>
  b.addEventListener("click", () => {
    const k = b.dataset.step;
    const [st, lo, hi] = STEP[k];
    setPref(k, clamp(S()[k] + st * +b.dataset.dir, lo, hi));
    showHud();
  }),
);
hud.addEventListener("pointerdown", (e) => {
  if (e.target.closest("button")) showHud();
});
on("sheet:closed", (id) => {
  if (id === "tpSheetLayer" && P.open && P.playing) scheduleHud();
});

// controle Bluetooth / teclado
document.addEventListener("keydown", (e) => {
  if (!P.open || e.target.closest("input, textarea")) return;
  const k = e.key;
  const s = S();
  const page = stage.clientHeight * 0.4;
  const handled = () => e.preventDefault();
  emit("key", k);
  if (k === " " || k === "Enter" || k === "MediaPlayPause") {
    handled();
    togglePlay();
  } else if (k === "ArrowUp") {
    handled();
    setPref("wpm", clamp(s.wpm + 5, 60, 320));
    toast(`${S().wpm} palavras/min`, 900);
  } else if (k === "ArrowDown") {
    handled();
    setPref("wpm", clamp(s.wpm - 5, 60, 320));
    toast(`${S().wpm} palavras/min`, 900);
  } else if (k === "ArrowRight") {
    handled();
    jumpBlock(1);
  } else if (k === "ArrowLeft") {
    handled();
    jumpBlock(-1);
  } else if (k === "PageDown") {
    handled();
    P.pos = clamp(P.pos + page, 0, P.max);
  } else if (k === "PageUp") {
    handled();
    P.pos = clamp(P.pos - page, 0, P.max);
  } else if (k === "Home") {
    handled();
    rewind();
  } else if (k === "m" || k === "M") $("#pMirror").click();
  else if (k === "v" || k === "V") toggleVoice();
  else if (k === "+" || k === "=") setPref("fontSize", clamp(s.fontSize + 2, 16, 160));
  else if (k === "-") setPref("fontSize", clamp(s.fontSize - 2, 16, 160));
  else if (k === "Escape") {
    if (!remoteEl.hidden) closeRemotePanel();
    else if (!calibEl.hidden) closeCalib();
    else if (sheetIsOpen(liveSheet)) closeSheet(liveSheet);
    else closePrompter();
  }
});

// ───────────── calibração da área ─────────────
let cDrag = null;
export function openCalib() {
  if (!P.open) return;
  cancelCountdown();
  setPlaying(false);
  if (sheetIsOpen(liveSheet)) closeSheet(liveSheet);
  hud.classList.add("is-hidden");
  calibEl.hidden = false;
  drawCalib();
}
function closeCalib(show = true) {
  if (calibEl.hidden) return;
  calibEl.hidden = true;
  savePrefs();
  syncSettingsUI();
  emit("prefs");
  if (show) showHud(false);
}
function drawCalib() {
  const a = areaNow();
  Object.assign(calibRect.style, { left: a.l + "%", right: a.r + "%", top: a.t + "%", bottom: a.b + "%" });
  const f = (v) => (Math.round(v * 10) / 10).toString().replace(".", ",");
  $("#calibReadout").textContent = `esq ${f(a.l)}%  dir ${f(a.r)}%  topo ${f(a.t)}%  base ${f(a.b)}%  · ${orient() === "landscape" ? "deitado" : "em pé"}`;
}
calibEl.addEventListener("pointerdown", (e) => {
  const h = e.target.closest("[data-edge]");
  if (!h) return;
  e.preventDefault();
  try {
    h.setPointerCapture(e.pointerId);
  } catch {}
  cDrag = { edge: h.dataset.edge, x: e.clientX, y: e.clientY, a: { ...areaNow() } };
  calibEl.classList.add("is-dragging");
});
calibEl.addEventListener("pointermove", (e) => {
  if (!cDrag) return;
  const dx = ((e.clientX - cDrag.x) / innerWidth) * 100;
  const dy = ((e.clientY - cDrag.y) / innerHeight) * 100;
  const s0 = cDrag.a;
  const a = areaNow();
  const MIN = 20;
  const snap = (v) => Math.round(v * 2) / 2;
  if (cDrag.edge === "l") a.l = snap(clamp(s0.l + dx, 0, 100 - s0.r - MIN));
  else if (cDrag.edge === "r") a.r = snap(clamp(s0.r - dx, 0, 100 - s0.l - MIN));
  else if (cDrag.edge === "t") a.t = snap(clamp(s0.t + dy, 0, 100 - s0.b - MIN));
  else if (cDrag.edge === "b") a.b = snap(clamp(s0.b - dy, 0, 100 - s0.t - MIN));
  else {
    const mx = clamp(dx, -s0.l, s0.r);
    const my = clamp(dy, -s0.t, s0.b);
    a.l = snap(s0.l + mx);
    a.r = snap(s0.r - mx);
    a.t = snap(s0.t + my);
    a.b = snap(s0.b - my);
  }
  drawCalib();
  layout();
});
const endCalibDrag = () => {
  if (!cDrag) return;
  cDrag = null;
  calibEl.classList.remove("is-dragging");
  savePrefs();
};
calibEl.addEventListener("pointerup", endCalibDrag);
calibEl.addEventListener("pointercancel", endCalibDrag);
$("#calibFull").addEventListener("click", () => {
  Object.assign(areaNow(), { l: 0, r: 0, t: 0, b: 0 });
  drawCalib();
  layout();
  savePrefs();
});
$("#calibDone").addEventListener("click", () => {
  closeCalib();
  toast("Área salva");
});

addEventListener("resize", () =>
  requestAnimationFrame(() => {
    layout();
    if (!calibEl.hidden) drawCalib();
  }),
);
