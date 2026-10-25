// Ligação direta entre dois aparelhos (WebRTC). O servidor público do PeerJS só apresenta um ao outro;
// o roteiro e os comandos vão de aparelho para aparelho, criptografados.
const PEER_SRC = "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js";
const QR_SRC = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
const PREFIX = "tpeasy-tp-";
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const loaded = {};
export function loadScript(src) {
  if (!loaded[src])
    loaded[src] = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = res;
      s.onerror = () => {
        delete loaded[src];
        rej(new Error("Sem internet para conectar os aparelhos."));
      };
      document.head.append(s);
    });
  return loaded[src];
}
export const loadPeer = () => loadScript(PEER_SRC).then(() => window.Peer);
export const loadQr = () => loadScript(QR_SRC).then(() => window.qrcode);
export const peerIdFor = (code) => PREFIX + code.toLowerCase();
export const normalizeCode = (c) => (c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
export function newCode() {
  let c = "";
  const r = crypto.getRandomValues(new Uint8Array(5));
  for (const n of r) c += ALPHABET[n % ALPHABET.length];
  return c;
}
export const remoteUrl = (code) => `${location.origin}/app/remote.html#${code}`;

export async function qrSvg(text) {
  const qrcode = await loadQr();
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}

// ───────────── lado do TP ─────────────
// Abre uma "sala" com um código curto. Recebe comandos e manda o estado para cada controle conectado.
export async function startHost({ hello, state, onCommand, onStatus }) {
  const Peer = await loadPeer();
  let peer = null;
  let code = "";
  let timer = 0;
  let last = "";
  const conns = new Set();
  const report = (status, extra = {}) => onStatus({ status, code, count: conns.size, ...extra });
  const send = (c, msg) => {
    try {
      c.open && c.send(msg);
    } catch {}
  };
  const open = () => {
    code = newCode();
    peer = new Peer(peerIdFor(code), { debug: 0 });
    peer.on("open", () => report("ready"));
    peer.on("connection", (c) => {
      c.on("open", () => {
        conns.add(c);
        send(c, hello());
        last = "";
        report("ready");
      });
      c.on("data", (d) => d && d.t === "cmd" && onCommand(d));
      const gone = () => {
        conns.delete(c);
        report("ready");
      };
      c.on("close", gone);
      c.on("error", gone);
    });
    peer.on("disconnected", () => {
      try {
        peer.reconnect();
      } catch {}
    });
    peer.on("error", (err) => {
      if (err.type === "unavailable-id") {
        peer.destroy();
        open();
      } else if (err.type === "network" || err.type === "server-error" || err.type === "socket-error") report("error", { error: "Sem conexão com a internet." });
    });
  };
  open();
  timer = setInterval(() => {
    if (!conns.size) return;
    const msg = state();
    const key = JSON.stringify(msg);
    if (key === last) return;
    last = key;
    conns.forEach((c) => send(c, msg));
  }, 120);
  return {
    get code() {
      return code;
    },
    get count() {
      return conns.size;
    },
    resend() {
      last = "";
      conns.forEach((c) => send(c, hello()));
    },
    stop() {
      clearInterval(timer);
      conns.forEach((c) => {
        try {
          c.close();
        } catch {}
      });
      try {
        peer && peer.destroy();
      } catch {}
    },
  };
}
