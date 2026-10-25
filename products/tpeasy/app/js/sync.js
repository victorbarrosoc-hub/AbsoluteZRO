// Conta e sincronização pela API REST do Supabase, sem biblioteca: login por código no e-mail
// (não sai do app instalado) ou Google, e roteiros/perfis espelhados com "o mais novo vence".
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";
import { store, debounce } from "./util.js";
import { allScripts, saveScripts, prefs, replacePrefs, on, emit } from "./data.js";

const AUTH_KEY = "tpeasy.auth.v1";
const SYNC_KEY = "tpeasy.sync.v1";
export const cloudEnabled = !!(SUPABASE_URL && SUPABASE_KEY);

let auth = store.get(AUTH_KEY, null);
let meta = Object.assign({ lastPull: 0, lastPush: 0, lastSync: 0 }, store.get(SYNC_KEY, {}));
export const syncState = { status: cloudEnabled ? (auth ? "idle" : "out") : "off", error: "", at: meta.lastSync };

export const currentUser = () => (auth ? auth.user : null);
const setStatus = (status, error = "") => {
  Object.assign(syncState, { status, error });
  emit("sync", syncState);
};

async function api(path, { method = "GET", body, token = true, headers = {} } = {}) {
  const h = { apikey: SUPABASE_KEY, "Content-Type": "application/json", ...headers };
  if (token && auth) h.Authorization = `Bearer ${await accessToken()}`;
  const res = await fetch(SUPABASE_URL + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && (data.msg || data.message || data.error_description || data.error)) || `Erro ${res.status}`);
  return data;
}

function saveAuth(a) {
  auth = a
    ? { access_token: a.access_token, refresh_token: a.refresh_token, expires_at: a.expires_at || Math.floor(Date.now() / 1000) + (a.expires_in || 3600), user: a.user || (auth && auth.user) }
    : null;
  if (auth) store.set(AUTH_KEY, auth);
  else store.del(AUTH_KEY);
  emit("auth", currentUser());
}
async function accessToken() {
  if (!auth) return null;
  if (auth.expires_at - 60 < Date.now() / 1000) {
    const a = await api("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: auth.refresh_token }, token: false });
    saveAuth(a);
  }
  return auth.access_token;
}

// ───────────── entrar / sair ─────────────
export async function sendCode(email) {
  await api("/auth/v1/otp", { method: "POST", body: { email, create_user: true }, token: false });
}
export async function verifyCode(email, code) {
  const a = await api("/auth/v1/verify", { method: "POST", body: { type: "email", email, token: code.trim() }, token: false });
  saveAuth(a);
  setStatus("idle");
  syncNow();
}
export function signInWithGoogle() {
  location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(location.origin + "/app/")}`;
}
// volta do Google com os tokens no #hash
export async function handleRedirect() {
  if (!cloudEnabled || !location.hash.includes("access_token=")) return;
  const q = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, "", location.pathname);
  try {
    const user = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${q.get("access_token")}` } }).then((r) => r.json());
    saveAuth({ access_token: q.get("access_token"), refresh_token: q.get("refresh_token"), expires_in: +q.get("expires_in") || 3600, user });
    setStatus("idle");
    syncNow();
  } catch {
    setStatus("error", "Não deu para concluir a entrada com o Google.");
  }
}
export async function signOut() {
  try {
    if (auth) await api("/auth/v1/logout", { method: "POST" });
  } catch {}
  saveAuth(null);
  meta = { lastPull: 0, lastPush: 0, lastSync: 0 };
  store.set(SYNC_KEY, meta);
  setStatus(cloudEnabled ? "out" : "off");
}

// ───────────── sincronizar ─────────────
let running = false;
export async function syncNow() {
  if (!cloudEnabled || !auth || running || !navigator.onLine) return;
  running = true;
  setStatus("syncing");
  try {
    const uidv = auth.user.id;
    // 1) baixa o que mudou na nuvem
    const since = new Date(meta.lastPull || 0).toISOString();
    const remote = await api(`/rest/v1/tp_scripts?select=id,title,body,fav,target,deleted,updated_at&updated_at=gt.${encodeURIComponent(since)}&order=updated_at.asc`);
    const list = allScripts();
    let maxPull = meta.lastPull;
    for (const r of remote) {
      const ts = Date.parse(r.updated_at);
      maxPull = Math.max(maxPull, ts);
      const cur = list.find((s) => s.id === r.id);
      if (!cur) list.push({ id: r.id, title: r.title, body: r.body, fav: r.fav, target: r.target, deleted: r.deleted, updated: ts, pos: 0 });
      else if (ts > (cur.updated || 0)) Object.assign(cur, { title: r.title, body: r.body, fav: r.fav, target: r.target, deleted: r.deleted, updated: ts });
    }
    // 2) sobe o que mudou aqui
    const changed = list.filter((s) => (s.updated || 0) > meta.lastPush);
    if (changed.length) {
      await api("/rest/v1/tp_scripts?on_conflict=user_id,id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: changed.map((s) => ({ user_id: uidv, id: s.id, title: s.title || "", body: s.body || "", fav: !!s.fav, target: s.target || 0, deleted: !!s.deleted, updated_at: new Date(s.updated || Date.now()).toISOString() })),
      });
    }
    // 3) perfis de TP: o mais novo vence
    const rp = await api("/rest/v1/tp_prefs?select=data,updated_at");
    const remoteTs = rp[0] ? Date.parse(rp[0].updated_at) : 0;
    if (rp[0] && remoteTs > (prefs.updated || 0)) replacePrefs({ ...rp[0].data, updated: remoteTs });
    else if ((prefs.updated || 0) > remoteTs) {
      await api("/rest/v1/tp_prefs?on_conflict=user_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: { user_id: uidv, data: prefs, updated_at: new Date(prefs.updated).toISOString() },
      });
    }
    meta = { lastPull: maxPull, lastPush: Date.now(), lastSync: Date.now() };
    store.set(SYNC_KEY, meta);
    saveScripts(true);
    syncState.at = meta.lastSync;
    setStatus("idle");
  } catch (err) {
    setStatus("error", err.message || "Falha ao sincronizar");
  } finally {
    running = false;
  }
}

const later = debounce(syncNow, 4000);
on("scripts", () => auth && !running && later());
on("prefs:saved", () => auth && later());
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && syncNow());
addEventListener("online", syncNow);
