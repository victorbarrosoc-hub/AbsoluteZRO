// Ponto de partida do app: monta as telas, liga as abas e registra o modo offline.
import { $, $$ } from "./util.js";
import { ui } from "./data.js";
import { go, TABS, enableSheetDrag } from "./ui.js";
import { mountSettingsForms, syncSettingsUI } from "./settings.js";
import { renderAll, newFrom, startCalib } from "./views.js";
import { handleRedirect } from "./sync.js";

document.querySelector('meta[name="theme-color"]').content = matchMedia("(prefers-color-scheme: dark)").matches ? "#000000" : "#f5f5f7";
mountSettingsForms();
syncSettingsUI();
enableSheetDrag($("#tpSheetLayer"));

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-go], [data-new], [data-action]");
  if (!t) return;
  if (t.dataset.go) go(t.dataset.go);
  else if (t.dataset.new) newFrom(t.dataset.new);
  else if (t.dataset.action === "calib") startCalib();
});

// teclado do iPhone: o editor acompanha a área visível
const vv = window.visualViewport;
function onViewport() {
  const h = vv ? vv.height : innerHeight;
  document.documentElement.style.setProperty("--vvh", h + "px");
  document.documentElement.classList.toggle("kb-open", innerHeight - h > 120);
}
if (vv) vv.addEventListener("resize", onViewport);
onViewport();
// título pequeno aparece na barra de cima quando o título grande sai da tela
let scrolled = false;
addEventListener(
  "scroll",
  () => {
    const on = scrollY > 44;
    if (on !== scrolled) document.documentElement.classList.toggle("scrolled", (scrolled = on));
  },
  { passive: true },
);

renderAll();
const fromHash = location.hash.slice(1);
go(TABS.includes(fromHash) ? fromHash : TABS.includes(ui.lastTab) ? ui.lastTab : "roteiros", { instant: true });
document.documentElement.classList.add("ready");
handleRedirect();

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
