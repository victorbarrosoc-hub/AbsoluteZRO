// As telas: Roteiros, Teleprompter, Ajustes e o editor. Pouco texto, só o que ajuda a decidir.
import { $, $$, esc, icon, fmtClock, fmtAgo, plural, debounce, isStandalone, isIOS, clamp } from "./util.js";
import * as D from "./data.js";
import { toast, openPage, closePage, enableEdgeBack, actionSheet, confirmDanger, ask, openSheet } from "./ui.js";
import { openPrompter, openCalib, prompterOpen } from "./prompter.js";
import { syncSettingsUI, setPref } from "./settings.js";
import * as Sync from "./sync.js";
import * as Zro from "./zro.js";
import { pendencias, numeroBalao, rotuloBalao } from "./pendencias.js";

const VERSION = "2.2";
const wpm = () => D.S().wpm;
const durOf = (s) => (D.countWords(s.body) / wpm()) * 60;
const PALETTE = [
  ["#7aa7ff", "#4d7dff"],
  ["#c9a2ff", "#9b6bff"],
  ["#ff9bd6", "#f45fb5"],
  ["#ffc46b", "#ff9a2e"],
  ["#7fe0c4", "#2fbf98"],
];
const colorOf = (id) => PALETTE[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
function fmtDay(ts) {
  const d0 = new Date();
  d0.setHours(0, 0, 0, 0);
  const days = Math.floor((d0.getTime() + 86400000 - ts) / 86400000);
  if (days <= 0) return "Hoje";
  if (days === 1) return "Ontem";
  if (days < 7) return `${days} dias`;
  if (days < 30) return plural(Math.floor(days / 7), "semana", "semanas");
  return new Date(ts).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}
const mins = (secs) => (secs < 60 ? `${Math.max(1, Math.round(secs))} s` : `${Math.round(secs / 60)} min`);
const recentFirst = () => D.liveScripts().slice().sort((a, b) => Math.max(b.updated, b.readAt || 0) - Math.max(a.updated, a.readAt || 0));

// ───────────── Roteiros ─────────────
function rowHTML(s) {
  const [c1, c2] = colorOf(s.id);
  const prog = s.pos > 0.01 && s.pos < 0.985 ? `<i class="row-prog" style="--p:${(s.pos * 100).toFixed(1)}%"></i>` : "";
  return `<li class="item" data-id="${s.id}">
    <button class="item-main" data-act="edit">
      <span class="doc" style="--c1:${c1};--c2:${c2}">${icon("doc")}</span>
      <span class="item-text">
        <span class="item-title">${esc(s.title || "Sem título")}${s.fav ? icon("star-fill", "icon star") : ""}</span>
        <span class="item-meta">${fmtDay(Math.max(s.updated, s.readAt || 0))} · ${mins(durOf(s))}</span>
      </span>
      ${prog}
    </button>
    <button class="item-play" data-act="play" aria-label="Ler">${icon("play")}</button>
    <button class="item-more" data-act="more" aria-label="Opções">${icon("more")}</button>
  </li>`;
}
let filter = "all";
export function renderScripts() {
  const q = $("#search").value.trim().toLowerCase();
  let rows = recentFirst().filter((s) => !q || (s.title + " " + s.body).toLowerCase().includes(q));
  if (filter === "fav") rows = rows.filter((s) => s.fav);
  if (filter === "recent") rows = rows.filter((s) => s.readAt).sort((a, b) => b.readAt - a.readAt);
  $("#scriptList").innerHTML = rows.map(rowHTML).join("");
  const none = D.liveScripts().length === 0;
  $("#empty").hidden = rows.length > 0;
  $("#emptyAction").hidden = !none;
  $("#emptyTitle").textContent = none ? "Nenhum roteiro" : q ? "Nada encontrado" : filter === "fav" ? "Nenhum favorito" : "Nada lido ainda";
  $("#installCard").hidden = !(isIOS && !isStandalone() && !D.ui.installDismissed);
}
$("#scriptList").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const s = D.byId(b.closest("[data-id]").dataset.id);
  if (!s) return;
  if (b.dataset.act === "edit") openEditor(s.id);
  else if (b.dataset.act === "play") openPrompter(s.id);
  else scriptMenu(s);
});
async function scriptMenu(s) {
  const v = await actionSheet(
    [
      { label: "Ler", icon: "play", value: "play" },
      { label: s.fav ? "Remover dos favoritos" : "Favoritar", icon: "star", value: "fav" },
      { label: "Duplicar", icon: "copy", value: "dup" },
      { label: "Compartilhar", icon: "share", value: "share" },
      { label: "Excluir", icon: "trash", value: "del", danger: true },
    ],
    s.title || "Sem título",
  );
  if (v === "play") openPrompter(s.id);
  else if (v === "fav") D.updateScript(s.id, { fav: !s.fav });
  else if (v === "dup") D.duplicateScript(s.id);
  else if (v === "share") shareScript(s);
  else if (v === "del" && (await confirmDanger("Excluir este roteiro?", "Excluir"))) D.deleteScript(s.id);
}
async function shareScript(s) {
  const text = (s.title ? s.title + "\n\n" : "") + s.body;
  try {
    if (navigator.share) return await navigator.share({ title: s.title, text });
  } catch (err) {
    if (err && err.name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("Copiado");
  } catch {}
}
$("#filters").addEventListener("click", (e) => {
  const b = e.target.closest("[data-f]");
  if (!b) return;
  filter = b.dataset.f;
  for (const c of $$("[data-f]")) c.setAttribute("aria-pressed", String(c === b));
  renderScripts();
});
$("#searchToggle").addEventListener("click", () => {
  const w = $("#searchWrap");
  w.hidden = !w.hidden;
  if (!w.hidden) $("#search").focus();
  else {
    $("#search").value = "";
    renderScripts();
  }
});
$("#search").addEventListener("input", debounce(renderScripts, 120));
$("#installCard").addEventListener("click", (e) => {
  if (e.target.closest("#dismissInstall")) {
    D.ui.installDismissed = true;
    D.saveUi();
    renderScripts();
  } else toast("Compartilhar › Adicionar à Tela de Início", 2800);
});

export async function newFrom(kind) {
  if (kind === "paste") {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {}
    if (!text.trim()) return openEditor(D.createScript().id, true);
    const first = text.trim().split("\n")[0].replace(/^#+\s*/, "");
    openEditor(D.createScript(first.length <= 50 ? first : first.slice(0, 47).trim() + "…", text.trim()).id);
  } else if (kind === "file") {
    fileTarget = null;
    $("#fileInput").click();
  } else openEditor(D.createScript().id, true);
}
$("#newScript").addEventListener("click", async () => {
  const v = await actionSheet([
    { label: "Colar texto", icon: "paste", value: "paste" },
    { label: "Escrever", icon: "doc", value: "blank" },
    { label: "Importar arquivo", icon: "import", value: "file" },
  ]);
  if (v) newFrom(v);
});
let fileTarget = null;
$("#fileInput").addEventListener("change", async (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!f) return;
  const text = (await f.text()).replace(/\r\n?/g, "\n").trim();
  if (fileTarget && D.byId(fileTarget)) {
    D.updateScript(fileTarget, { body: text });
    openEditor(fileTarget);
  } else openEditor(D.createScript(f.name.replace(/\.[^.]+$/, ""), text).id);
});

// ───────────── Teleprompter (aba) ─────────────
export function renderTp() {
  syncSettingsUI();
  renderMini();
}
function renderMini() {
  const s = D.S();
  const a = D.areaNow();
  const mini = $("#mini");
  mini.style.aspectRatio = `${innerWidth} / ${innerHeight}`;
  const c = D.COLORS[s.colors] || D.COLORS.white;
  mini.style.setProperty("--p-bg", c.bg);
  mini.style.setProperty("--p-fg", c.fg);
  Object.assign($("#miniArea").style, { left: a.l + "%", right: a.r + "%", top: a.t + "%", bottom: a.b + "%" });
  $("#miniFlip").style.transform = `scale(${s.mirrorX ? -1 : 1}, ${s.mirrorY ? -1 : 1})`;
  const fs = s.fontSize * ((mini.clientWidth || 150) / innerWidth);
  const areaH = (mini.clientHeight || 300) * ((100 - a.t - a.b) / 100);
  const pad = Math.max(0, (areaH * s.guidePos) / 100 - (fs * s.lineHeight) / 2);
  Object.assign($("#miniText").style, { fontSize: fs + "px", lineHeight: s.lineHeight, fontFamily: D.FONTS[s.font], fontWeight: s.weight, textAlign: s.align, paddingTop: pad + "px" });
  $("#miniText").innerHTML = "Grandes ideias merecem ser ditas com clareza. <span>O TPeasy mantém o seu texto no ritmo certo enquanto você olha para a câmera.</span>";
  $("#miniGuide").hidden = !s.guide;
  $("#miniGuide").style.top = s.guidePos + "%";
}
$("#tpRead").addEventListener("click", () => {
  const s = recentFirst()[0];
  if (s) openPrompter(s.id);
  else newFrom("paste");
});
$("#remoteMenu").addEventListener("click", async () => {
  const v = await actionSheet(
    [
      { label: "Controlar este TP por outro aparelho", icon: "remote", value: "host" },
      { label: "Usar este aparelho como controle", icon: "remote", value: "remote" },
    ],
    "Controle remoto",
  );
  if (v === "host") $("#tpRemote").click();
  else if (v === "remote") location.href = "/app/remote.html";
});
$("#tpRemote").addEventListener("click", () => {
  const s = recentFirst()[0];
  if (s) openPrompter(s.id, { remote: true });
  else newFrom("paste");
});
$("#moreSettings").addEventListener("click", () => {
  syncSettingsUI();
  openSheet($("#tpSheetLayer"));
});
document.addEventListener("click", (e) => {
  const b = e.target.closest(".mini-stepper button");
  if (!b) return;
  const k = b.closest("[data-stepkey]").dataset.stepkey;
  const [lo, hi] = k === "wpm" ? [60, 320] : [16, 160];
  setPref(k, clamp(D.S()[k] + +b.dataset.d, lo, hi));
});

// perfis
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-pid]");
  if (!b) return;
  const id = b.dataset.pid;
  if (id === "new") {
    const v = await actionSheet([{ label: "Copiar o atual", icon: "copy", value: "copy" }, ...D.TEMPLATES.map((t) => ({ label: t.name, value: t.key }))], "Novo perfil");
    if (!v) return;
    if (v === "copy") {
      const name = await ask("Nome do perfil", { value: `TP ${D.prefs.profiles.length + 1}`, ok: "Criar" });
      if (name) D.addProfile(name);
    } else D.addProfileFromTemplate(D.TEMPLATES.find((t) => t.key === v));
  } else if (id !== D.prefs.active) D.setActiveProfile(id);
  else {
    const v = await actionSheet(
      [
        { label: "Renomear", value: "ren" },
        { label: "Duplicar", value: "dup" },
        { label: "Restaurar padrão", value: "reset" },
        ...(D.prefs.profiles.length > 1 ? [{ label: "Excluir", value: "del", danger: true }] : []),
      ],
      D.profile().name,
    );
    if (v === "ren") {
      const name = await ask("Nome do perfil", { value: D.profile().name });
      if (name) {
        D.profile().name = name.slice(0, 30);
        D.savePrefs();
        D.emit("prefs");
      }
    } else if (v === "dup") D.addProfile(D.profile().name + " 2");
    else if (v === "reset") D.resetProfile();
    else if (v === "del") {
      const target = D.profile();
      if (await confirmDanger(`Excluir "${target.name}"?`, "Excluir")) {
        D.deleteProfile(target.id);
        toast("Perfil excluído");
      }
    }
  }
});

// ───────────── Ajustes ─────────────
let login = { email: "", sent: false, busy: false };
export function renderAccount() {
  const card = $("#accountCard");
  const user = Sync.currentUser();
  const st = Sync.syncState;
  const local = `<p class="account-note">Seus roteiros continuam salvos neste aparelho.</p>`;
  let conta = "";
  if (Zro.zro.estado === "dentro") {
    const p = Zro.zro.pessoa;
    const org = p.organizacao && p.organizacao.nome ? `<span>${esc(p.organizacao.nome)}</span>` : "";
    // nome, e-mail e foto vêm da conta Absolute ZRO e só se editam lá (perfil único)
    const editar = `<a class="btn btn-soft btn-block account-edit" id="zroEditar" href="${esc(Zro.linkConta(p))}" target="_blank" rel="noopener">Editar na conta Absolute ZRO</a>`;
    conta = `<div class="account">${Zro.avatarHtml(p)}<div class="account-text"><b>${esc(p.nome || p.email)}</b>${p.nome ? `<span>${esc(p.email)}</span>` : ""}${org}</div><button class="pill is-small" id="zroSair">Sair</button>${editar}${local}</div>`;
    if (Zro.semAcesso())
      conta += `<div class="account account-form" id="zroSemAcesso"><div class="account-row"><span class="avatar">${icon("user")}</span><div class="account-text"><b>Sem acesso</b><span>Sua conta Absolute ZRO ainda não tem acesso ao TPeasy.</span></div></div><a class="btn btn-blue btn-block" href="${Zro.HUB_FERRAMENTAS}" target="_blank" rel="noopener">Ver na Absolute ZRO</a></div>`;
  } else if (Zro.zro.estado === "fora") {
    conta = `<div class="account account-form"><div class="account-row"><span class="avatar">${icon("user")}</span><div class="account-text"><b>Conta</b><span>A mesma da Absolute ZRO</span></div></div><a class="btn btn-blue btn-block" href="${Zro.linkEntrar()}">Entrar com Absolute ZRO</a><a class="btn btn-soft btn-block" href="${Zro.linkCriarConta()}">Criar conta</a>${local}</div>`;
  }
  if (!Sync.cloudEnabled) {
    card.innerHTML = conta || `<div class="account"><span class="avatar">${icon("cloud")}</span><div class="account-text"><b>Sincronização</b><span>Em breve</span></div></div>`;
  } else if (!user) {
    card.innerHTML = conta + `<form class="account account-form" id="loginForm">
      <div class="account-row"><span class="avatar">${icon("user")}</span><div class="account-text"><b>Conta antiga</b><span>Já tinha conta no TPeasy? Entre com o código do e-mail.</span></div></div>
      ${
        login.sent
          ? `<input class="input" id="codeInput" inputmode="numeric" autocomplete="one-time-code" placeholder="Código do e-mail" maxlength="10" required />
             <button class="btn btn-blue btn-block" type="submit">${login.busy ? "Entrando…" : "Entrar"}</button>`
          : `<input class="input" id="emailInput" type="email" autocomplete="email" placeholder="E-mail" value="${esc(login.email)}" required />
             <button class="btn btn-soft btn-block" type="submit">${login.busy ? "Enviando…" : "Continuar"}</button>`
      }
    </form>`;
  } else {
    const status = st.status === "syncing" ? "Sincronizando…" : st.status === "error" ? "Erro ao sincronizar" : st.at ? `Sincronizado ${fmtAgo(st.at)}` : "Conectado";
    card.innerHTML = conta + `<div class="account"><span class="avatar is-on">${esc((user.email || "?").charAt(0).toUpperCase())}</span><div class="account-text"><b>${esc(user.email || "Conta")}</b><span>${status}</span></div><button class="pill is-small" id="signOutBtn">Sair</button></div>`;
  }
  // quem entrou com a Absolute ZRO não tem nome próprio no TPeasy: o nome é o da conta
  $("#setName").hidden = Zro.zro.estado === "dentro";
  $("#nameValue").textContent = D.ui.name || "";
  $("#soundsSwitch").setAttribute("aria-checked", String(!!D.ui.sounds));
  $("#installState").textContent = isStandalone() ? "Instalado" : "";
  $("#appVersion").textContent = `versão ${VERSION}`;
  renderBaloes();
}
// Balões da barra de abas (app/js/pendencias.js): redesenham junto com a conta (zro, auth, sync)
export function renderBaloes() {
  const pend = pendencias({ zro: Zro.zro, nuvem: Sync.cloudEnabled, usuario: Sync.currentUser(), sync: Sync.syncState });
  for (const b of $$("[data-balao]")) {
    const p = pend[b.dataset.balao];
    const tab = b.closest(".tab");
    const n = p ? numeroBalao(p.n) : "";
    if (b.textContent !== n) b.textContent = n;
    b.hidden = !p;
    if (p) {
      b.setAttribute("aria-label", rotuloBalao(p.n));
      tab.title = p.t;
    } else {
      b.removeAttribute("aria-label");
      tab.removeAttribute("title");
    }
  }
}
$("#accountCard").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (login.busy) return;
  login.busy = true;
  try {
    if (!login.sent) {
      login.email = $("#emailInput").value.trim();
      renderAccount();
      await Sync.sendCode(login.email);
      login.sent = true;
      toast("Código enviado");
    } else {
      renderAccount();
      await Sync.verifyCode(login.email, $("#codeInput").value);
      login = { email: "", sent: false, busy: false };
    }
  } catch (err) {
    toast(err.message || "Não deu certo", 2600);
  }
  login.busy = false;
  renderAccount();
});
$("#accountCard").addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.id === "zroSair") {
    if (!(await confirmDanger("Sair da conta? Os roteiros continuam aqui.", "Sair"))) return;
    try {
      await Zro.sairZro();
    } catch (err) {
      toast(err.message || "Não deu certo", 2600);
    }
  } else if (b.id === "signOutBtn" && (await confirmDanger("Sair da conta? Os roteiros continuam aqui.", "Sair"))) await Sync.signOut();
});
$("#setName").addEventListener("click", async () => {
  const name = await ask("Seu nome", { value: D.ui.name });
  if (name == null) return;
  D.ui.name = name.slice(0, 40);
  D.saveUi();
  renderAccount();
});
$("#soundsSwitch").addEventListener("click", () => {
  D.ui.sounds = !D.ui.sounds;
  D.saveUi();
  renderAccount();
});
$("#exportBtn").addEventListener("click", async () => {
  const name = `tpeasy-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([JSON.stringify(D.exportAll(), null, 2)], name, { type: "application/json" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) return await navigator.share({ files: [file] });
  } catch (err) {
    if (err && err.name === "AbortError") return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
});
$("#importBtn").addEventListener("click", () => $("#backupInput").click());
$("#backupInput").addEventListener("change", async (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    D.importAll(JSON.parse(await f.text()));
    toast("Backup restaurado");
  } catch (err) {
    toast(err.message || "Arquivo inválido", 2600);
  }
});
$("#installRow").addEventListener("click", () => toast(isStandalone() ? "Já instalado" : "Compartilhar › Adicionar à Tela de Início", 2800));

// ───────────── Editor ─────────────
const editor = $("#editor");
const titleIn = $("#titleInput");
const bodyIn = $("#bodyInput");
let editingId = null;
let editTimer = 0;

export function openEditor(id, focus = false) {
  if (!D.byId(id)) return;
  editingId = id;
  const s = D.byId(id);
  titleIn.value = s.title;
  bodyIn.value = s.body;
  updateEditorMeta();
  openPage(editor);
  if (focus) setTimeout(() => (s.title ? bodyIn : titleIn).focus(), 420);
}
function commitEditor() {
  const s = D.byId(editingId);
  if (s && (s.title !== titleIn.value || s.body !== bodyIn.value)) D.updateScript(editingId, { title: titleIn.value, body: bodyIn.value });
}
function closeEditor() {
  clearTimeout(editTimer);
  commitEditor();
  const s = D.byId(editingId);
  if (s && !s.title.trim() && !s.body.trim()) D.deleteScript(s.id);
  editingId = null;
  document.activeElement && document.activeElement.blur();
  closePage();
}
function updateEditorMeta() {
  const s = D.byId(editingId);
  if (!s) return;
  const words = D.countWords(bodyIn.value);
  const secs = (words / wpm()) * 60;
  const t = s.target || 0;
  for (const c of $$("[data-t]")) c.setAttribute("aria-pressed", String(+c.dataset.t === t));
  const meter = $("#targetMeter");
  meter.hidden = !t;
  const over = t && secs > t * 1.05;
  if (t) {
    meter.firstElementChild.style.transform = `scaleX(${Math.min(1, secs / t).toFixed(3)})`;
    meter.classList.toggle("is-over", !!over);
  }
  $("#stats").innerHTML = `<b class="${over ? "is-over" : ""}">${fmtClock(secs)}</b><span>${plural(words, "palavra", "palavras")}</span>`;
  $("#editorFav").innerHTML = icon(s.fav ? "star-fill" : "star");
  $("#editorFav").classList.toggle("is-on", !!s.fav);
}
const onEdit = () => {
  updateEditorMeta();
  clearTimeout(editTimer);
  editTimer = setTimeout(commitEditor, 400);
};
titleIn.addEventListener("input", onEdit);
bodyIn.addEventListener("input", onEdit);
titleIn.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    bodyIn.focus();
  }
});
$("#targetChips").addEventListener("click", (e) => {
  const b = e.target.closest("[data-t]");
  if (!b) return;
  D.updateScript(editingId, { target: +b.dataset.t });
  updateEditorMeta();
});
$("#marks").addEventListener("pointerdown", (e) => e.target.closest("button") && e.preventDefault());
$("#marks").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const st = bodyIn.selectionStart ?? bodyIn.value.length;
  const en = bodyIn.selectionEnd ?? st;
  const v = bodyIn.value;
  let ins;
  let caret;
  if (b.dataset.wrap) {
    const [l, r] = b.dataset.wrap.includes("|") ? b.dataset.wrap.split("|") : [b.dataset.wrap, b.dataset.wrap];
    const sel = v.slice(st, en) || (l === "((" ? "nota" : "texto");
    ins = l + sel + r;
    caret = st + l.length + sel.length;
  } else {
    ins = b.dataset.ins.startsWith("#") && st > 0 && v[st - 1] !== "\n" ? "\n\n" + b.dataset.ins : b.dataset.ins;
    caret = st + ins.length;
  }
  bodyIn.value = v.slice(0, st) + ins + v.slice(en);
  bodyIn.focus();
  bodyIn.setSelectionRange(caret, caret);
  onEdit();
});
$("#editorBack").addEventListener("click", closeEditor);
enableEdgeBack(editor, closeEditor);
$("#readBtn").addEventListener("click", () => {
  commitEditor();
  document.activeElement && document.activeElement.blur();
  openPrompter(editingId, { onClose: updateEditorMeta });
});
$("#editorFav").addEventListener("click", () => {
  D.updateScript(editingId, { fav: !D.byId(editingId).fav });
  updateEditorMeta();
});
$("#editorMore").addEventListener("click", async () => {
  commitEditor();
  const s = D.byId(editingId);
  const v = await actionSheet([
    { label: "Importar arquivo", icon: "import", value: "file" },
    { label: "Copiar texto", icon: "copy", value: "copy" },
    { label: "Compartilhar", icon: "share", value: "share" },
    { label: "Excluir", icon: "trash", value: "del", danger: true },
  ]);
  if (v === "file") {
    fileTarget = editingId;
    $("#fileInput").click();
  } else if (v === "copy") {
    try {
      await navigator.clipboard.writeText(s.body);
      toast("Copiado");
    } catch {}
  } else if (v === "share") shareScript(s);
  else if (v === "del" && (await confirmDanger("Excluir este roteiro?", "Excluir"))) {
    D.deleteScript(s.id);
    editingId = null;
    closePage();
  }
});

// ───────────── comum ─────────────
export function startCalib() {
  if (prompterOpen()) return openCalib();
  const target = D.byId(editingId) || recentFirst()[0] || D.createScript("Teste de área", "Arraste as bordas até onde o vidro do seu TP mostra.");
  openPrompter(target.id, { calib: true });
}
export function renderAll() {
  renderScripts();
  renderTp();
  renderAccount();
}
D.on("scripts", renderScripts);
D.on("prefs", () => {
  renderTp();
  renderScripts();
  if (editingId) updateEditorMeta();
});
D.on("setting", () => {
  renderMini();
  if (editingId) updateEditorMeta();
});
D.on("sync", renderAccount);
D.on("auth", renderAccount);
D.on("zro", renderAccount);
D.on("tab", (t) => {
  if (t === "tp") renderTp();
  if (t === "ajustes") renderAccount();
});
addEventListener("resize", debounce(renderMini, 150));
