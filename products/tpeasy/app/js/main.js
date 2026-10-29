// Ponto de partida do app: monta as telas, liga as abas e registra o modo offline.
import { $, $$, uid } from "./util.js";
import { go, TABS, enableSheetDrag, toast } from "./ui.js";
import { mountSettingsForms, syncSettingsUI } from "./settings.js";
import { renderAll, newFrom, startCalib, openEditor } from "./views.js";
import { handleRedirect } from "./sync.js";
import { verificarZro, avisoDaVolta } from "./zro.js";
import { iniciarZ } from "./z.js";
import { abaDeEntrada } from "./entrada.js";
import { projetoDoHash, abrirDoHub } from "./hub.js";
import { allScripts, replaceScripts } from "./data.js";

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
// link com #roteiros, #tp ou #ajustes abre a aba dele; tarefa em curso ganha da Z; senão, a Z (entrada.js)
go(abaDeEntrada(location.hash, TABS), { instant: true });
document.documentElement.classList.add("ready");
// "Abrir no TPeasy": o roteiro do projeto da Absolute ZRO chega já carregado no editor
const projetoHub = projetoDoHash(location.hash);
if (projetoHub) {
  history.replaceState(null, "", location.pathname + location.search + "#roteiros");
  abrirDoHub(projetoHub, { toast, allScripts, replaceScripts, uid, openEditor });
}
handleRedirect();
const aviso = avisoDaVolta();
if (aviso) toast(aviso, 3200);
// a Z entra na aba dela depois de saber da conta
verificarZro().then(iniciarZ);

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
