// Dados do app: roteiros, perfis de TP, sessões de leitura e preferências.
// Tudo fica no aparelho; o sync.js espelha na nuvem quando há conta.
import { store, uid, esc } from "./util.js";
import { acrescentar } from "./leituras.js";

const KEY = { scripts: "tpeasy.scripts.v1", prefs: "tpeasy.prefs.v1", ui: "tpeasy.ui.v1", sessions: "tpeasy.sessions.v1", leituras: "tpeasy.leituras.v1" };

// ───────────── eventos ─────────────
const listeners = {};
export const on = (ev, fn) => (listeners[ev] = listeners[ev] || []).push(fn);
export const emit = (ev, data) => (listeners[ev] || []).forEach((fn) => fn(data));

// ───────────── perfis de TP ─────────────
export const DEFAULTS = {
  fontSize: 44,
  lineHeight: 1.3,
  font: "system",
  weight: 600,
  align: "left",
  colors: "white",
  wpm: 150,
  countdown: 3,
  beep: false,
  guide: true,
  guidePos: 30,
  focus: 45,
  mirrorX: false,
  mirrorY: false,
  avoidNotch: false,
  voiceSens: 55,
  voiceHold: 700,
  area: { portrait: { l: 3, r: 3, t: 0, b: 0 }, landscape: { l: 3, r: 3, t: 0, b: 0 } },
};
export const FONTS = {
  system: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
  rounded: 'ui-rounded, "SF Pro Rounded", -apple-system, system-ui, sans-serif',
  serif: 'ui-serif, "New York", Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, monospace',
};
export const COLORS = {
  white: { bg: "#000000", fg: "#ffffff" },
  soft: { bg: "#000000", fg: "#c7c7cc" },
  yellow: { bg: "#000000", fg: "#ffd60a" },
  paper: { bg: "#ffffff", fg: "#000000" },
};
// Modelos prontos para criar um perfil em um toque.
export const TEMPLATES = [
  {
    key: "small",
    name: "TP pequeno",
    hint: "Vidro menor que a tela: margem zero, letra média",
    s: { fontSize: 36, weight: 700, area: { portrait: { l: 0, r: 0, t: 0, b: 0 }, landscape: { l: 0, r: 0, t: 0, b: 0 } }, mirrorX: true },
  },
  {
    key: "big",
    name: "TP grande / iPad",
    hint: "Leitura de longe: letra grande, linha mais alta",
    s: { fontSize: 72, lineHeight: 1.25, guidePos: 35, mirrorX: true },
  },
  {
    key: "hand",
    name: "Na mão, olhando a lente",
    hint: "Sem TP: coluna estreita colada na câmera",
    s: { fontSize: 30, guidePos: 12, focus: 70, area: { portrait: { l: 8, r: 8, t: 4, b: 40 }, landscape: { l: 30, r: 30, t: 6, b: 10 } }, countdown: 3 },
  },
];

const fresh = (base = DEFAULTS) => JSON.parse(JSON.stringify(base));
export function mergeSettings(s) {
  const out = Object.assign(fresh(), s || {});
  out.area = Object.assign(fresh().area, (s && s.area) || {});
  return out;
}
function normalizePrefs(p) {
  if (!p || !Array.isArray(p.profiles) || !p.profiles.length) {
    const id = uid();
    p = { active: id, profiles: [{ id, name: "Meu TP", s: fresh() }], updated: 0 };
  }
  for (const pr of p.profiles) pr.s = mergeSettings(pr.s);
  if (!p.profiles.some((x) => x.id === p.active)) p.active = p.profiles[0].id;
  return p;
}

export let prefs = normalizePrefs(store.get(KEY.prefs, null));
export const profile = () => prefs.profiles.find((x) => x.id === prefs.active);
export const S = () => profile().s;
let prefsTimer = 0;
export function savePrefs(now = false) {
  prefs.updated = Date.now();
  clearTimeout(prefsTimer);
  const write = () => {
    store.set(KEY.prefs, prefs);
    emit("prefs:saved");
  };
  if (now) write();
  else prefsTimer = setTimeout(write, 300);
}
export function replacePrefs(p) {
  prefs = normalizePrefs(p);
  store.set(KEY.prefs, prefs);
  emit("prefs");
}
export const orient = () => (innerWidth > innerHeight ? "landscape" : "portrait");
export const areaNow = () => S().area[orient()];

export function addProfile(name, base) {
  const p = { id: uid(), name: name.slice(0, 30), s: mergeSettings(base || S()) };
  prefs.profiles.push(p);
  prefs.active = p.id;
  savePrefs();
  emit("prefs");
  return p;
}
export function addProfileFromTemplate(t) {
  return addProfile(t.name, Object.assign(fresh(), JSON.parse(JSON.stringify(t.s))));
}
export function setActiveProfile(id) {
  prefs.active = id;
  savePrefs();
  emit("prefs");
}
export function deleteProfile(id) {
  if (prefs.profiles.length < 2) return;
  prefs.profiles = prefs.profiles.filter((p) => p.id !== id);
  if (prefs.active === id) prefs.active = prefs.profiles[0].id;
  savePrefs();
  emit("prefs");
}
export function resetProfile() {
  profile().s = fresh();
  savePrefs();
  emit("prefs");
}

// ───────────── roteiros ─────────────
const SEED = `# Começo
Oi! Toque na tela para rolar. Toque de novo para pausar. [pausa]

Arraste para voltar um trecho. Use a pinça para mudar a letra.

# Seu TP
Se o vidro mostra só um pedaço da tela, toque em Área e arraste as bordas até onde ele mostra.

# Voz
Toque no microfone e o texto anda enquanto você fala. ((esta nota não aparece no TP))

Boa gravação!`;

let scripts = store.get(KEY.scripts, null);
if (!Array.isArray(scripts)) {
  scripts = [{ id: uid(), title: "Comece aqui", body: SEED, updated: Date.now(), pos: 0, fav: false, target: 0 }];
  store.set(KEY.scripts, scripts);
}
for (const s of scripts) {
  if (s.fav == null) s.fav = false;
  if (s.target == null) s.target = 0;
}
export const allScripts = () => scripts;
export const liveScripts = () => scripts.filter((s) => !s.deleted);
export const byId = (id) => scripts.find((s) => s.id === id && !s.deleted);
export function saveScripts(evt = true) {
  store.set(KEY.scripts, scripts);
  if (evt) emit("scripts");
}
export function createScript(title = "", body = "") {
  const s = { id: uid(), title, body, updated: Date.now(), pos: 0, fav: false, target: 0 };
  scripts.push(s);
  saveScripts();
  return s;
}
export function updateScript(id, patch, touch = true) {
  const s = byId(id);
  if (!s) return;
  Object.assign(s, patch);
  if (touch) s.updated = Date.now();
  saveScripts();
}
export function deleteScript(id) {
  const s = byId(id);
  if (!s) return;
  // fica uma lápide para o sync apagar nos outros aparelhos
  Object.assign(s, { deleted: true, body: "", title: "", updated: Date.now() });
  saveScripts();
}
export function duplicateScript(id) {
  const s = byId(id);
  if (!s) return null;
  const c = { ...s, id: uid(), title: (s.title || "Sem título") + " (cópia)", updated: Date.now(), pos: 0 };
  scripts.push(c);
  saveScripts();
  return c;
}
export function replaceScripts(list) {
  scripts = list;
  saveScripts();
}

// ───────────── sessões de leitura ─────────────
let sessions = store.get(KEY.sessions, []);
export const allSessions = () => sessions;
export function logSession(entry) {
  sessions.push(entry);
  if (sessions.length > 400) sessions = sessions.slice(-400);
  store.set(KEY.sessions, sessions);
  emit("sessions");
}
export function weekStats() {
  const since = Date.now() - 7 * 86400000;
  const list = sessions.filter((x) => x.at >= since);
  const secs = list.reduce((a, x) => a + x.secs, 0);
  const words = list.reduce((a, x) => a + (x.words || 0), 0);
  const ids = new Set(list.map((x) => x.scriptId));
  return { count: list.length, secs, words, scripts: ids.size, wpm: secs > 20 ? Math.round(words / (secs / 60)) : 0 };
}
export function lastSessionOf(id) {
  for (let i = sessions.length - 1; i >= 0; i--) if (sessions[i].scriptId === id) return sessions[i];
  return null;
}

// ───────────── registro de leituras (tpeasy.leituras/1, leituras.js) ─────────────
let leituras = store.get(KEY.leituras, []);
if (!Array.isArray(leituras)) leituras = [];
export const allLeituras = () => leituras;
export function registrarLeitura(linha) {
  if (!linha) return;
  leituras = acrescentar(leituras, linha);
  store.set(KEY.leituras, leituras);
  emit("leituras");
}

// ───────────── preferências do app ─────────────
export const ui = Object.assign({ installDismissed: false, name: "", sounds: true, lastTab: "roteiros", tipsSeen: {} }, store.get(KEY.ui, {}));
export const saveUi = () => store.set(KEY.ui, ui);

// ───────────── texto ─────────────
export function countWords(body) {
  const clean = stripForReading(body).replace(/^\s*#.*$/gm, " ");
  const m = clean.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}
// Notas ((assim)) e deixas [assim] não contam como fala.
export function stripForReading(body) {
  return body.replace(/\(\([\s\S]*?\)\)/g, " ").replace(/\[[^\]]*\]/g, " ");
}
export function previewOf(body) {
  return stripForReading(body).replace(/^\s*#.*$/gm, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}
export function blocksOf(body) {
  return body
    .split("\n")
    .map((l) => l.match(/^\s*#+\s*(.+)$/))
    .filter(Boolean)
    .map((m) => m[1].trim());
}
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]/g, '<span class="cue">[$1]</span>');
}
export function renderScript(body) {
  const clean = body.replace(/\r\n?/g, "\n").replace(/\(\([\s\S]*?\)\)/g, "");
  let html = "";
  for (const b of clean.split(/\n\s*\n/)) {
    let para = [];
    const flush = () => {
      if (para.length) html += `<p>${para.join("<br>")}</p>`;
      para = [];
    };
    for (const line of b.split("\n")) {
      if (!line.trim()) continue;
      const h = line.match(/^\s*#+\s*(.*)$/);
      if (h) {
        flush();
        html += `<span class="sec">${inline(h[1])}</span>`;
      } else para.push(inline(line.trim()));
    }
    flush();
  }
  return html || '<p style="opacity:.4">Sem texto ainda.</p>';
}

// ───────────── backup ─────────────
export function exportAll() {
  return { app: "tpeasy", version: 1, exportedAt: new Date().toISOString(), scripts: liveScripts(), prefs, sessions };
}
export function importAll(data) {
  if (!data || data.app !== "tpeasy" || !Array.isArray(data.scripts)) throw new Error("Esse arquivo não é um backup do TPeasy.");
  const known = new Set(scripts.map((s) => s.id));
  let added = 0;
  for (const s of data.scripts) {
    if (!s || typeof s.body !== "string") continue;
    if (known.has(s.id)) {
      const cur = scripts.find((x) => x.id === s.id);
      if ((s.updated || 0) > (cur.updated || 0)) Object.assign(cur, s);
    } else {
      scripts.push(Object.assign({ pos: 0, fav: false, target: 0 }, s));
      added++;
    }
  }
  saveScripts();
  if (data.prefs) replacePrefs(data.prefs);
  if (Array.isArray(data.sessions)) {
    const seen = new Set(sessions.map((x) => x.at));
    sessions = sessions.concat(data.sessions.filter((x) => !seen.has(x.at))).sort((a, b) => a.at - b.at);
    store.set(KEY.sessions, sessions);
  }
  return added;
}
