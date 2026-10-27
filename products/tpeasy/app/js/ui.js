// Peças de interface: abas, páginas empilhadas, folhas, menus, diálogos e avisos.
import { $, $$, esc, icon, reducedMotion } from "./util.js";
import { ui, saveUi, emit } from "./data.js";

// ───────────── avisos ─────────────
let toastTimer = 0;
export function toast(msg, ms = 1500) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("is-on");
  void el.offsetWidth;
  el.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-on"), ms);
}

// ───────────── abas ─────────────
// a Z é a primeira aba e a tela de entrada do app
export const TABS = ["z", "roteiros", "tp", "ajustes"];
let current = null;
const scrollPos = {};
export const currentTab = () => current;

export function go(tab, { instant = false } = {}) {
  if (!TABS.includes(tab)) tab = "z";
  if (pageOpen()) closePage();
  if (tab === current) {
    scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
    return;
  }
  if (current) scrollPos[current] = scrollY;
  current = tab;
  for (const v of $$(".view")) v.hidden = v.dataset.tab !== tab;
  const v = $(`.view[data-tab="${tab}"]`);
  emit("tab", tab);
  if (!instant) {
    v.classList.remove("entra");
    void v.offsetWidth;
    v.classList.add("entra");
  }
  scrollTo(0, scrollPos[tab] || 0);
  for (const b of $$(".tab[data-go]")) b.setAttribute("aria-current", b.dataset.go === tab ? "page" : "false");
  ui.lastTab = tab;
  saveUi();
}
// ───────────── páginas empilhadas (editor) ─────────────
let openPageEl = null;
export const pageOpen = () => !!openPageEl;
export function openPage(el) {
  openPageEl = el;
  el.hidden = false;
  el.scrollTop = 0;
  document.documentElement.classList.add("has-page");
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("is-in")));
}
export function closePage(cb) {
  const el = openPageEl;
  if (!el) return;
  openPageEl = null;
  el.style.transform = "";
  el.classList.remove("is-in");
  document.documentElement.classList.remove("has-page");
  setTimeout(() => {
    if (!el.classList.contains("is-in")) el.hidden = true;
    cb && cb();
  }, 380);
}
// Puxar da borda esquerda para voltar, como no iPhone.
export function enableEdgeBack(el, onBack) {
  let d = null;
  el.addEventListener("pointerdown", (e) => {
    if (e.clientX > 26 || e.pointerType === "mouse") return;
    d = { x: e.clientX, w: el.clientWidth, id: e.pointerId };
    el.classList.add("is-dragging");
  });
  el.addEventListener("pointermove", (e) => {
    if (!d || e.pointerId !== d.id) return;
    const dx = Math.max(0, e.clientX - d.x);
    el.style.transform = `translateX(${dx}px)`;
    d.dx = dx;
  });
  const end = () => {
    if (!d) return;
    el.classList.remove("is-dragging");
    if ((d.dx || 0) > d.w * 0.33) onBack();
    else el.style.transform = "";
    d = null;
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

// ───────────── folhas (sheets) ─────────────
export function openSheet(layer, { live = false } = {}) {
  layer.classList.toggle("is-live", live);
  layer.hidden = false;
  document.documentElement.classList.add("no-scroll");
  requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add("is-open")));
}
export function closeSheet(layer) {
  if (!layer.classList.contains("is-open")) return;
  const sheet = layer.querySelector(".sheet");
  sheet.style.transform = "";
  layer.classList.remove("is-open");
  if (!$(".prompter:not([hidden])")) document.documentElement.classList.remove("no-scroll");
  setTimeout(() => {
    if (!layer.classList.contains("is-open")) layer.hidden = true;
  }, 400);
  emit("sheet:closed", layer.id);
}
export const sheetIsOpen = (layer) => layer.classList.contains("is-open");
// Arrastar a folha para baixo fecha.
export function enableSheetDrag(layer) {
  const sheet = layer.querySelector(".sheet");
  let d = null;
  sheet.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".sheet-grab, .sheet-head") || e.target.closest("button:not(.sheet-grab)")) return;
    d = { y: e.clientY, t: performance.now(), id: e.pointerId, dy: 0 };
    sheet.classList.add("is-dragging");
    try {
      sheet.setPointerCapture(e.pointerId);
    } catch {}
  });
  sheet.addEventListener("pointermove", (e) => {
    if (!d || e.pointerId !== d.id) return;
    d.dy = Math.max(0, e.clientY - d.y);
    sheet.style.transform = `translateY(${d.dy}px)`;
  });
  const end = () => {
    if (!d) return;
    sheet.classList.remove("is-dragging");
    const v = d.dy / Math.max(1, performance.now() - d.t);
    if (d.dy > 120 || (d.dy > 40 && v > 0.6)) closeSheet(layer);
    else sheet.style.transform = "";
    d = null;
  };
  sheet.addEventListener("pointerup", end);
  sheet.addEventListener("pointercancel", end);
  layer.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) closeSheet(layer);
  });
}

// ───────────── menu de ações ─────────────
// Um menu pode abrir logo depois de outro (ex.: "Excluir" e a confirmação). O fechamento do
// anterior não pode esconder o novo, e só um menu escuta toques por vez.
let closeMenu = null;
let menuHideTimer = 0;
export function actionSheet(items, title) {
  const layer = $("#actionLayer");
  const box = $("#actionItems");
  if (closeMenu) closeMenu(null);
  clearTimeout(menuHideTimer);
  return new Promise((resolve) => {
    box.innerHTML =
      (title ? `<div class="action-title">${esc(title)}</div>` : "") +
      items
        .map((it, i) => `<button class="action-item${it.danger ? " is-danger" : ""}" data-i="${i}">${it.icon ? icon(it.icon) : ""}<span>${esc(it.label)}</span>${it.hint ? `<small>${esc(it.hint)}</small>` : ""}</button>`)
        .join("");
    layer.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add("is-open")));
    const done = (v) => {
      if (closeMenu !== done) return;
      closeMenu = null;
      layer.classList.remove("is-open");
      layer.removeEventListener("click", onClick);
      menuHideTimer = setTimeout(() => {
        if (!closeMenu) layer.hidden = true;
      }, 320);
      resolve(v);
    };
    closeMenu = done;
    const onClick = (e) => {
      const b = e.target.closest("[data-i]");
      if (b) return done(items[+b.dataset.i].value ?? +b.dataset.i);
      if (e.target.closest("[data-close]")) done(null);
    };
    layer.addEventListener("click", onClick);
  });
}
export async function confirmDanger(title, label) {
  return !!(await actionSheet([{ label, value: true, danger: true }], title));
}

// ───────────── diálogo com campo (substitui o prompt) ─────────────
export function ask(title, { value = "", placeholder = "", ok = "Salvar", hint = "" } = {}) {
  const layer = $("#dialogLayer");
  const input = $("#dialogInput");
  $("#dialogTitle").textContent = title;
  $("#dialogHint").textContent = hint;
  $("#dialogHint").hidden = !hint;
  $("#dialogOk").textContent = ok;
  input.value = value;
  input.placeholder = placeholder;
  layer.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add("is-open")));
  setTimeout(() => {
    input.focus();
    input.select();
  }, 60);
  return new Promise((resolve) => {
    const done = (v) => {
      layer.classList.remove("is-open");
      input.blur();
      layer.removeEventListener("click", onClick);
      $("#dialogForm").removeEventListener("submit", onSubmit);
      setTimeout(() => (layer.hidden = true), 250);
      resolve(v);
    };
    const onClick = (e) => {
      if (e.target.closest("[data-cancel]")) done(null);
    };
    const onSubmit = (e) => {
      e.preventDefault();
      done(input.value.trim() || null);
    };
    layer.addEventListener("click", onClick);
    $("#dialogForm").addEventListener("submit", onSubmit);
  });
}
