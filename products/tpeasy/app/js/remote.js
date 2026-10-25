// O controle remoto: o roteiro aparece sem espelho, com o trecho que o TP está mostrando marcado.
// Tocar num parágrafo leva o TP para lá. Funciona em qualquer navegador, sem instalar.
import { $, $$, store } from "./util.js";
import { renderScript } from "./data.js";
import { loadPeer, peerIdFor, normalizeCode } from "./link.js";

const KEY = "tpeasy.remote.v1";
const els = { join: $("#rcJoin"), script: $("#rcScript"), bar: $("#rcBar"), follow: $("#rcFollow"), status: $("#rcStatus"), title: $("#rcTitle") };
let peer = null;
let conn = null;
let code = "";
let retry = 0;
let leaving = false;
let current = -1;
let following = true;
let blocks = [];
let lock = null;

let toastTimer = 0;
function toast(msg, ms = 1500) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("is-on"), ms);
}
function setStatus(kind, text) {
  els.status.dataset.s = kind;
  els.status.lastElementChild.textContent = text;
}
function showJoin(error = "") {
  els.join.hidden = false;
  els.script.hidden = els.bar.hidden = els.follow.hidden = true;
  $("#rcLeave").hidden = true;
  els.title.textContent = "Controle remoto";
  $("#rcError").hidden = !error;
  $("#rcError").textContent = error;
  setStatus("off", "Desconectado");
}

// ───────────── conexão ─────────────
async function connect(c) {
  code = normalizeCode(c);
  if (code.length < 5) return showJoin("O código tem 5 letras ou números.");
  leaving = false;
  store.set(KEY, { code });
  history.replaceState(null, "", "#" + code);
  els.join.hidden = true;
  setStatus("wait", "Conectando…");
  try {
    const Peer = await loadPeer();
    if (!peer || peer.destroyed) {
      peer = new Peer({ debug: 0 });
      peer.on("error", (err) => {
        if (err.type === "peer-unavailable") {
          if (current < 0) return showJoin("Nenhum TP com esse código. Confira se o controle remoto está ligado no TP.");
          scheduleRetry();
        } else if (err.type === "network" || err.type === "server-error" || err.type === "socket-error") {
          setStatus("wait", "Sem internet, tentando…");
          scheduleRetry();
        }
      });
      peer.on("disconnected", () => {
        try {
          peer.reconnect();
        } catch {}
      });
      await new Promise((res) => (peer.open ? res() : peer.once("open", res)));
    }
    open();
  } catch (err) {
    showJoin(err.message);
  }
}
function open() {
  if (conn) {
    try {
      conn.close();
    } catch {}
  }
  conn = peer.connect(peerIdFor(code), { reliable: true });
  conn.on("open", () => {
    retry = 0;
    setStatus("on", "Conectado");
    $("#rcLeave").hidden = false;
    keepAwake();
  });
  conn.on("data", onData);
  conn.on("close", () => {
    if (leaving) return;
    setStatus("wait", "Reconectando…");
    scheduleRetry();
  });
}
function scheduleRetry() {
  if (leaving) return;
  clearTimeout(retry);
  retry = setTimeout(() => peer && !peer.destroyed && open(), 2500);
}
function send(c, extra = {}) {
  if (conn && conn.open) conn.send({ t: "cmd", c, ...extra });
  else toast("Sem conexão com o TP");
}

// ───────────── roteiro ─────────────
function onData(d) {
  if (!d) return;
  if (d.t === "hello") {
    els.title.textContent = d.title;
    els.script.innerHTML = renderScript(d.body);
    blocks = $$("p, .sec", els.script);
    blocks.forEach((b, i) => {
      b.dataset.i = i;
      b.setAttribute("role", "button");
      b.tabIndex = 0;
    });
    els.script.hidden = els.bar.hidden = false;
    current = -1;
    following = true;
    els.follow.hidden = true;
  }
  if (d.t === "hello" || d.t === "state") {
    $("#rcPlay").innerHTML = `<svg class="icon"><use href="#i-${d.playing ? "pause" : "play"}"/></svg>`;
    $("#rcPlay").setAttribute("aria-label", d.playing ? "Pausar" : "Rolar");
    $("#rcPlay").classList.toggle("is-on", !!d.playing);
    $("#rcWpm").textContent = d.wpm;
    $("#rcProg").style.transform = `scaleX(${d.frac || 0})`;
    mark(d.i);
  }
}
function mark(i) {
  if (i === current || !blocks.length) return;
  if (blocks[current]) blocks[current].classList.remove("is-now");
  current = Math.max(0, Math.min(i, blocks.length - 1));
  blocks.forEach((b, k) => b.classList.toggle("is-past", k < current));
  blocks[current].classList.add("is-now");
  if (following) scrollToCurrent();
}
function scrollToCurrent(smooth = true) {
  const b = blocks[current];
  if (!b) return;
  const y = b.getBoundingClientRect().top + scrollY - innerHeight * 0.28;
  scrollTo({ top: Math.max(0, y), behavior: smooth ? "smooth" : "auto" });
}

// tocar num parágrafo leva o TP para lá
els.script.addEventListener("click", (e) => {
  const b = e.target.closest("[data-i]");
  if (!b) return;
  send("jump", { i: +b.dataset.i });
  b.classList.remove("flash");
  void b.offsetWidth;
  b.classList.add("flash");
  following = true;
  els.follow.hidden = true;
});
// rolar com o dedo para de seguir; um botão volta a seguir
const stopFollow = () => {
  if (els.script.hidden || !following) return;
  following = false;
  els.follow.hidden = false;
};
addEventListener("touchmove", stopFollow, { passive: true });
addEventListener("wheel", stopFollow, { passive: true });
els.follow.addEventListener("click", () => {
  following = true;
  els.follow.hidden = true;
  scrollToCurrent();
});
els.bar.addEventListener("click", (e) => {
  const b = e.target.closest("[data-c]");
  if (!b) return;
  send(b.dataset.c, b.dataset.d ? { d: +b.dataset.d } : {});
  if (b.dataset.c !== "speed") {
    following = true;
    els.follow.hidden = true;
  }
});
document.addEventListener("keydown", (e) => {
  if (els.script.hidden || e.target.closest("input")) return;
  if (e.key === " ") {
    e.preventDefault();
    send("toggle");
  } else if (e.key === "ArrowDown") send("block", { d: 1 });
  else if (e.key === "ArrowUp") send("block", { d: -1 });
  else if (e.key === "Enter" && e.target.dataset && e.target.dataset.i) send("jump", { i: +e.target.dataset.i });
});

// ───────────── entrar e sair ─────────────
$("#rcForm").addEventListener("submit", (e) => {
  e.preventDefault();
  connect($("#rcCode").value);
});
$("#rcCode").addEventListener("input", (e) => (e.target.value = normalizeCode(e.target.value)));
$("#rcLeave").addEventListener("click", () => {
  leaving = true;
  try {
    conn && conn.close();
  } catch {}
  current = -1;
  history.replaceState(null, "", location.pathname);
  showJoin();
});

async function keepAwake() {
  try {
    if ("wakeLock" in navigator && !lock) {
      lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => (lock = null));
    }
  } catch {}
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || leaving || !code) return;
  keepAwake();
  if (!conn || !conn.open) open();
});

const fromHash = normalizeCode(location.hash.slice(1));
const saved = (store.get(KEY, {}) || {}).code || "";
$("#rcCode").value = fromHash || saved;
if (fromHash) connect(fromHash);
else showJoin();
document.querySelector('meta[name="theme-color"]').content = matchMedia("(prefers-color-scheme: dark)").matches ? "#000000" : "#f5f5f7";
