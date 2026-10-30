// "Do Maestro": os roteiros que o Maestro manda chegam na caixa de entrada da Absolute ZRO e entram na biblioteca ao
// abrir o app (e ao voltar para ele), em cada aparelho. Sem conta, sem acesso ou sem as funções de /api/zro (offline,
// servidor estático), nada muda. As regras de juntar ficam em entregas.js (puro, com teste).
import * as D from "./data.js";
import { store } from "./util.js";
import { toast } from "./ui.js";
import { zro, semAcesso } from "./zro.js";
import { aplicarEntregas, avisoDaChegada, podarVistos, proximoDesde } from "./entregas.js";

const KEY = "tpeasy.entregas.v1";
const INTERVALO = 60_000;
const temServidor = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
let ultima = 0;
let indo = null;

const lerEstado = () => {
  const s = store.get(KEY, null);
  return { desde: s && typeof s.desde === "string" ? s.desde : null, vistos: s && s.vistos && typeof s.vistos === "object" ? s.vistos : {} };
};

async function buscar() {
  const st = lerEstado();
  const r = await fetch(`/api/zro/entregas${st.desde ? `?desde=${encodeURIComponent(st.desde)}` : ""}`, {
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!r.ok || !(r.headers.get("content-type") || "").includes("application/json")) return;
  const j = await r.json();
  const entregas = Array.isArray(j && j.entregas) ? j.entregas : [];
  const res = aplicarEntregas(D.allScripts(), entregas, st.vistos);
  if (res.mudou) D.replaceScripts(res.scripts);
  store.set(KEY, { desde: proximoDesde(entregas, st.desde), vistos: podarVistos(res.vistos) });
  const aviso = avisoDaChegada(res);
  if (aviso) toast(aviso, 2600);
  // conta o que gravou (quem mandou vê "Recebido"); sem esperar
  if (res.ids.length)
    fetch("/api/zro/entregas", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: res.ids.slice(0, 100) }),
      keepalive: true,
    }).catch(() => {});
}

/** Busca o que chegou (no máximo uma vez por minuto, a menos que `forcar`). */
export function receberDoMaestro({ forcar = false } = {}) {
  if (!temServidor || !navigator.onLine || zro.estado !== "dentro" || semAcesso()) return Promise.resolve();
  if (indo || (!forcar && Date.now() - ultima < INTERVALO)) return indo || Promise.resolve();
  ultima = Date.now();
  indo = buscar()
    .catch(() => {})
    .finally(() => (indo = null));
  return indo;
}

export function iniciarMaestro(on) {
  on("zro", () => receberDoMaestro());
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && receberDoMaestro());
  addEventListener("online", () => receberDoMaestro({ forcar: true }));
  return receberDoMaestro({ forcar: true });
}

/** "Do Maestro · v3" para a linha da lista e o editor; vazio para os roteiros da pessoa. */
export const rotuloOrigem = (s) => (s && s.origem && s.origem.app === "maestro" && Number.isInteger(s.origem.versao) ? `Do Maestro · v${s.origem.versao}` : "");
/** O link de volta para o roteiro no Maestro (só http(s)). */
export const linkOrigem = (s) => (s && s.origem && typeof s.origem.link === "string" && /^https?:\/\/[^\s"<>]+$/.test(s.origem.link) ? s.origem.link : "");
