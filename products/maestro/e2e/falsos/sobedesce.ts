/**
 * O app do SOBEDESCE de mentira no e2e (nunca o de verdade): o contexto intercepta https://sobedesce.absolutezro.com/**
 * e serve em /app/ uma casca que cumpre o contrato do modo embutido do SOBEDESCE
 * (products/sobedesce/web/public/app/lib/embutido.js, PR "Porta-malas é o Sobedesce"):
 *
 * - `?no=maestro&tema=escuro|claro`: só Transferências e Drive, no tema do anfitrião;
 * - recados ao anfitrião (só para a origem dele): `pronto`, `pasta` (a pasta aberta) e `envios` (o teste manda pela
 *   própria janela do quadro, `enviosNoQuadro`);
 * - aceita `{ tipo: 'tema' }` da janela de cima e `#drive/<id>` abre a pasta sem recarregar (e o `#` some, como no app).
 *
 * As pastas e os arquivos são os do Drive de mentira (tests/drive-fixture.mts). Use com `serviceWorkers: 'block'`.
 * `recusar: true` responde 404 (o SOBEDESCE fora do ar ou ainda sem o modo embutido): a aba mostra o aviso.
 */
import type { BrowserContext, Frame, Page } from "@playwright/test";
import { DRIVE_FIXO, PASTA } from "../../tests/drive-fixture.mts";

export const SOBEDESCE_FALSO = "https://sobedesce.absolutezro.com";

const itens = DRIVE_FIXO.map((f) => ({
  id: f.id,
  nome: f.name,
  pasta: f.mimeType === PASTA,
  pai: f.parents[0],
  mini: f.thumbnailLink ?? null,
  tam: f.size ?? null,
}));

const CASCA = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SOBEDESCE</title>
<style>
:root{--bg:#f5f5f7;--card:#fff;--ink:#1d1d1f;--mute:#6e6e73;--line:rgba(0,0,0,.08);--up:#7c5cff;--down:#3d9cff;--pill:rgba(0,0,0,.05);color-scheme:light}
:root[data-theme=dark]{--bg:#0c0c0e;--card:#1c1c1f;--ink:#f5f5f7;--mute:#a1a1a6;--line:rgba(255,255,255,.09);--pill:rgba(255,255,255,.08);color-scheme:dark}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{background:var(--bg);color:var(--ink);font:15px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;display:flex;flex-direction:column}
header{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line)}
.abas{display:flex;gap:4px;padding:3px;border-radius:999px;background:var(--pill)}
.abas button{border:0;background:none;color:var(--mute);font:inherit;font-weight:600;font-size:14px;padding:7px 16px;border-radius:999px;cursor:pointer}
.abas button[aria-current]{background:var(--card);color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.eu{margin-left:auto;width:30px;height:30px;border-radius:50%;background:linear-gradient(#b9a8ff,#7c5cff);color:#fff;display:grid;place-items:center;font-weight:700;font-size:13px}
main{flex:1;overflow:auto;padding:16px 18px}
.trilha{display:flex;gap:6px;align-items:center;color:var(--mute);font-size:14px;margin:0 0 14px;flex-wrap:wrap}
.trilha button{border:0;background:none;color:inherit;font:inherit;padding:2px 4px;cursor:pointer;border-radius:6px}
.trilha button:last-child{color:var(--ink);font-weight:600}
.grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}
.item{display:grid;gap:8px;padding:8px;border:0;border-radius:14px;background:var(--card);color:inherit;font:inherit;text-align:left;cursor:pointer;box-shadow:0 0 0 1px var(--line)}
.mini{aspect-ratio:16/10;border-radius:9px;background:var(--pill);display:grid;place-items:center;overflow:hidden}
.mini img{width:100%;height:100%;object-fit:cover}
.mini svg{width:34px;height:34px;color:var(--down)}
.nome{font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tam{color:var(--mute);font-size:12px}
.vazio{color:var(--mute);padding:40px 0;text-align:center}
.solta{display:grid;place-items:center;gap:10px;min-height:220px;border:1.5px dashed var(--line);border-radius:18px;background:var(--card);text-align:center;padding:24px}
.solta b{font-size:18px}.solta span{color:var(--mute);font-size:14px}
.solta button{border:0;border-radius:999px;padding:10px 20px;background:var(--ink);color:var(--bg);font:inherit;font-weight:600}
.fila{margin-top:16px;color:var(--mute);font-size:14px}
@media (max-width:600px){
  header{padding:10px 12px}
  .abas{position:fixed;left:10px;right:10px;bottom:10px;justify-content:center;background:var(--card);box-shadow:0 4px 20px rgba(0,0,0,.18);z-index:2}
  .abas button{flex:1;padding:9px 0}
  main{padding:12px 12px 72px}
  .grade{grid-template-columns:1fr;gap:6px}
  .item{grid-template-columns:52px 1fr;align-items:center;padding:6px}
  .mini{aspect-ratio:1}
}
</style></head>
<body>
<header><nav class="abas" aria-label="Seções"><button type="button" data-aba="send">Transferências</button><button type="button" data-aba="drive">Drive</button></nav><span class="eu" title="Conta">A</span></header>
<main id="tela"></main>
<script>
const ITENS = __ITENS__;
const P = new URLSearchParams(location.search);
const ANF = (location.ancestorOrigins && location.ancestorOrigins[0]) || "*";
window.__sd = { carregou: Date.now(), recebidos: [], hashes: [] };
const raiz = document.documentElement;
function tema(t){ raiz.dataset.theme = t === "escuro" || t === "dark" ? "dark" : "light"; }
tema(P.get("tema"));
raiz.dataset.no = P.get("no") || "";
function avisar(tipo, dados){ if (window.parent !== window) window.parent.postMessage(Object.assign({ fonte: "sobedesce", tipo }, dados || {}), ANF); }
addEventListener("message", (e) => {
  if (e.source !== window.parent) return;
  window.__sd.recebidos.push(e.data);
  if (e.data && e.data.tipo === "tema") tema(e.data.tema);
});
let aba = "send", pasta = null;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const achar = (id) => ITENS.find((i) => i.id === id) || (id ? { id, nome: "Pasta nova", pasta: true, pai: "root" } : null);
function trilha(){ const t = []; let p = pasta; while (p) { t.unshift(p); p = ITENS.find((i) => i.id === p.pai) || null; } return t; }
const PASTA_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
function abrir(id){ pasta = achar(id); aba = "drive"; raiz.dataset.pasta = pasta ? pasta.id : ""; avisar("pasta", pasta ? { id: pasta.id, nome: pasta.nome } : { id: null, nome: null }); desenhar(); }
function desenhar(){
  for (const b of document.querySelectorAll(".abas button")) b.toggleAttribute("aria-current", b.dataset.aba === aba);
  const tela = document.getElementById("tela");
  if (aba === "send") {
    tela.innerHTML = '<div class="solta"><div><b>Solte os arquivos aqui</b><br><span>Vão direto para o seu Drive, em pedaços, conferidos.</span></div><button type="button">Escolher arquivos</button></div><p class="fila">Nada na fila.</p>';
    return;
  }
  const filhos = ITENS.filter((i) => i.pai === (pasta ? pasta.id : "root"));
  const migalhas = '<button type="button" data-ir="">Meu Drive</button>' + trilha().map((p) => '<span>›</span><button type="button" data-ir="' + esc(p.id) + '">' + esc(p.nome) + "</button>").join("");
  tela.innerHTML = '<nav class="trilha" aria-label="Caminho">' + migalhas + "</nav>" + (filhos.length
    ? '<div class="grade">' + filhos.map((f) => '<button type="button" class="item" data-' + (f.pasta ? "pasta" : "arquivo") + '="' + esc(f.id) + '"><span class="mini">' + (f.mini ? '<img alt="" src="' + f.mini + '">' : PASTA_SVG) + '</span><span><span class="nome">' + esc(f.nome) + '</span><br><span class="tam">' + (f.pasta ? "Pasta" : (Number(f.tam) / 1e6).toFixed(1) + " MB") + "</span></span></button>").join("") + "</div>"
    : '<p class="vazio">Pasta vazia.</p>');
}
document.addEventListener("click", (e) => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.aba) { aba = t.dataset.aba; desenhar(); }
  else if (t.dataset.pasta) abrir(t.dataset.pasta);
  else if (t.dataset.ir !== undefined) abrir(t.dataset.ir || null);
});
function peloHash(){
  window.__sd.hashes.push(location.hash);
  const m = /^#drive\\/([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (!m) return false;
  abrir(m[1]);
  history.replaceState(history.state, "", location.pathname + location.search);
  return true;
}
addEventListener("hashchange", peloHash);
if (!peloHash()) desenhar();
avisar("pronto");
</script></body></html>`.replace("__ITENS__", () => JSON.stringify(itens));

export async function sobedesceDeMentira(context: BrowserContext, o: { recusar?: boolean } = {}): Promise<{ pedidos: string[] }> {
  const pedidos: string[] = [];
  await context.route(`${SOBEDESCE_FALSO}/**`, (route) => {
    const u = new URL(route.request().url());
    if (u.pathname !== "/app/") return route.fulfill({ status: 404, body: "" });
    pedidos.push(u.search);
    if (o.recusar) return route.fulfill({ status: 404, contentType: "text/html", body: "<!doctype html><title>404</title><h1>404</h1>" });
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: CASCA });
  });
  return { pedidos };
}

/** O quadro do SOBEDESCE na página (a janela do iframe). */
export async function quadroDoSobedesce(page: Page): Promise<Frame> {
  const el = await page.waitForSelector("iframe.sd-quadro");
  const f = await el.contentFrame();
  if (!f) throw new Error("sem o quadro do SOBEDESCE");
  await f.waitForFunction(() => !!(window as unknown as { __sd?: unknown }).__sd);
  return f;
}

/** O SOBEDESCE conta os envios andando ao Maestro (o recado sai da janela do quadro, como no app). */
export async function enviosNoQuadro(f: Frame, andando: number) {
  await f.evaluate((n) => window.parent.postMessage({ fonte: "sobedesce", tipo: "envios", andando: n }, location.ancestorOrigins[0]), andando);
}
