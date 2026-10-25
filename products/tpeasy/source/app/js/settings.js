// Formulário de ajustes do perfil. O mesmo formulário aparece na aba Meu TP e no painel ao vivo do TP.
import { $$, esc, icon } from "./util.js";
import { S, areaNow, savePrefs, emit, prefs } from "./data.js";

const FORMAT = {
  margin: (v) => (v === 0 ? "Zero" : `${String(v).replace(".", ",")}%`),
  fontSize: (v) => `${v}`,
  lineHeight: (v) => v.toFixed(2).replace(".", ","),
  wpm: (v) => `${v} ppm`,
  guidePos: (v) => `${v}%`,
  focus: (v) => (v === 0 ? "Sem" : `${v}%`),
  voiceSens: (v) => (v < 35 ? "Baixa" : v > 70 ? "Alta" : "Média"),
  voiceHold: (v) => `${(v / 1000).toFixed(1).replace(".", ",")} s`,
};

const row = (label, control, small = "") => `<div class="row"><span>${label}${small ? `<small>${small}</small>` : ""}</span>${control}</div>`;
const sw = (key) => `<button class="switch" role="switch" data-key="${key}" aria-label=""></button>`;
const slider = (label, key, min, max, step) =>
  `<div class="row row-slider"><div class="row-top"><span>${label}</span><output data-out="${key}"></output></div><input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" aria-label="${label}" /></div>`;
const seg = (label, key, opts) =>
  `<div class="row row-stack"><span>${label}</span><div class="seg" data-key="${key}">${opts.map(([v, t, st]) => `<button data-v="${v}"${st ? ` style="${st}"` : ""}>${t}</button>`).join("")}</div></div>`;

export function settingsFormHTML() {
  return `
  <div class="group-label">Área</div>
  <div class="group">
    ${slider("Margem lateral", "margin", 0, 25, 0.5)}
    <button class="row row-link" data-action="calib"><span>Ajustar no TP</span>${icon("chev", "icon chev")}</button>
    ${row("Desviar da câmera", sw("avoidNotch"))}
  </div>

  <div class="group-label">Espelho</div>
  <div class="group">
    ${row("Horizontal", sw("mirrorX"))}
    ${row("Vertical", sw("mirrorY"))}
  </div>

  <div class="group-label">Texto</div>
  <div class="group">
    ${slider("Tamanho", "fontSize", 16, 160, 1)}
    ${slider("Entrelinha", "lineHeight", 1, 2, 0.05)}
    ${seg("Fonte", "font", [
      ["system", "Padrão"],
      ["rounded", "Redonda", "font-family: ui-rounded, -apple-system, sans-serif"],
      ["serif", "Serifa", "font-family: ui-serif, Georgia, serif"],
      ["mono", "Mono", "font-family: ui-monospace, Menlo, monospace"],
    ])}
    ${seg("Peso", "weight", [
      ["400", "Normal", "font-weight:400"],
      ["600", "Forte", "font-weight:600"],
      ["800", "Pesado", "font-weight:800"],
    ])}
    ${seg("Alinhamento", "align", [
      ["left", "Esquerda"],
      ["center", "Centro"],
    ])}
    <div class="row row-stack"><span>Cores</span>
      <div class="swatches" data-key="colors">
        <button data-v="white" aria-label="Branco no preto"><i style="background:#000;color:#fff">Aa</i></button>
        <button data-v="soft" aria-label="Cinza no preto"><i style="background:#000;color:#c7c7cc">Aa</i></button>
        <button data-v="yellow" aria-label="Amarelo no preto"><i style="background:#000;color:#ffd60a">Aa</i></button>
        <button data-v="paper" aria-label="Preto no branco"><i style="background:#fff;color:#000">Aa</i></button>
      </div>
    </div>
  </div>

  <div class="group-label">Leitura</div>
  <div class="group">
    ${slider("Velocidade", "wpm", 60, 320, 5)}
    ${seg("Contagem", "countdown", [
      ["0", "Sem"],
      ["3", "3 s"],
      ["5", "5 s"],
    ])}
    ${row("Bip ao começar", sw("beep"))}
    ${row("Linha de leitura", sw("guide"))}
    ${slider("Altura da linha", "guidePos", 8, 70, 1)}
    ${slider("Foco", "focus", 0, 85, 5)}
  </div>

  <div class="group-label">Voz</div>
  <div class="group">
    ${slider("Sensibilidade", "voiceSens", 10, 90, 5)}
    ${slider("Espera", "voiceHold", 300, 1600, 100)}
  </div>

  <div class="group-label">Controle Bluetooth</div>
  <div class="group keys">
    <div><kbd>espaço</kbd><span>rolar / pausar</span></div>
    <div><kbd>↑</kbd><kbd>↓</kbd><span>velocidade</span></div>
    <div><kbd>←</kbd><kbd>→</kbd><span>bloco</span></div>
  </div>`;
}

export function mountSettingsForms() {
  for (const el of $$("[data-settings-form]")) el.innerHTML = settingsFormHTML();
}

function getVal(k) {
  if (k === "margin") {
    const a = areaNow();
    return Math.round(((a.l + a.r) / 2) * 2) / 2;
  }
  return S()[k];
}
export function setPref(k, v) {
  if (k === "margin") {
    const a = areaNow();
    a.l = a.r = v;
  } else S()[k] = v;
  savePrefs();
  syncSettingsUI();
  emit("setting", k);
}

export function syncSettingsUI() {
  const s = S();
  for (const el of $$("input[type=range][data-key]")) {
    const v = getVal(el.dataset.key);
    if (String(el.value) !== String(v)) el.value = v;
    el.style.setProperty("--p", ((v - el.min) / (el.max - el.min)) * 100 + "%");
  }
  for (const out of $$("[data-out]")) out.textContent = FORMAT[out.dataset.out](getVal(out.dataset.out));
  for (const g of $$(".seg[data-key], .swatches[data-key]")) for (const b of $$("button", g)) b.setAttribute("aria-pressed", String(String(s[g.dataset.key]) === b.dataset.v));
  for (const b of $$(".switch[data-key]")) b.setAttribute("aria-checked", String(!!s[b.dataset.key]));
  for (const el of $$("[data-profiles]")) renderProfiles(el);
}

export function renderProfiles(el) {
  el.innerHTML =
    prefs.profiles
      .map((p) => `<button class="chip" data-pid="${p.id}" aria-pressed="${p.id === prefs.active}">${esc(p.name)}</button>`)
      .join("") + `<button class="chip chip-add" data-pid="new" aria-label="Novo perfil">${icon("plus")}</button>`;
}

// ligação genérica: qualquer controle com data-key em qualquer formulário
document.addEventListener("input", (e) => {
  const el = e.target.closest("input[type=range][data-key]");
  if (el) setPref(el.dataset.key, parseFloat(el.value));
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const g = b.closest(".seg[data-key], .swatches[data-key]");
  if (g && b.dataset.v != null) {
    const raw = b.dataset.v;
    setPref(g.dataset.key, isNaN(+raw) ? raw : +raw);
  } else if (b.classList.contains("switch") && b.dataset.key) setPref(b.dataset.key, !S()[b.dataset.key]);
});
