import { emissor } from "@/lib/zro/config";

/**
 * O app do Maestro para computador, lido do catálogo da central de apps da Absolute ZRO (`GET <HUB>/api/v1/desktop/apps`,
 * que só lista instalador publicado num Release com SHA-256 e com o canal desktop aberto pelo gate). Sem instalador,
 * a página não mostra área de download nenhuma: nada de botão para arquivo que não existe. O download passa por
 * `<HUB>/baixar/app/maestro/<arquivo>`, que confere o canal e redireciona para o arquivo assinado. Sem "server-only":
 * os testes chamam direto (só a página inicial, no servidor, usa).
 */
export type DownloadMaestro = { sistema: "mac" | "windows"; rotulo: string; href: string; versao: string };

type Arquivo = { arquivo: string; versao: string };
type Catalogo = { apps?: { id?: string; mac?: { arquivos?: Arquivo[] } | null; windows?: { arquivo?: Arquivo } | null }[] };

const PRODUTO = "maestro";
const CACHE_MS = 5 * 60_000;
const TEMPO_MS = 1_500;
let guardado: { em: number; lista: DownloadMaestro[] } | null = null;

/** Para os testes. */
export function esquecerDownloads() {
  guardado = null;
}

const nomeValido = (n: unknown): n is string => typeof n === "string" && /^[A-Za-z0-9._-]{1,120}$/.test(n);

/** Puro (testável): do catálogo para os botões. Só arquivo com nome seguro; nada de URL vinda de fora. */
export function downloadsDoCatalogo(catalogo: unknown, hub: string): DownloadMaestro[] {
  const app = (catalogo as Catalogo | null)?.apps?.find((a) => a?.id === PRODUTO);
  if (!app) return [];
  const base = `${hub.replace(/\/$/, "")}/baixar/app/${PRODUTO}/`;
  const out: DownloadMaestro[] = [];
  const mac = app.mac?.arquivos?.find((a) => nomeValido(a?.arquivo));
  if (mac) out.push({ sistema: "mac", rotulo: "Mac", href: base + encodeURIComponent(mac.arquivo), versao: String(mac.versao ?? "") });
  const win = app.windows?.arquivo;
  if (win && nomeValido(win.arquivo))
    out.push({ sistema: "windows", rotulo: "Windows", href: base + encodeURIComponent(win.arquivo), versao: String(win.versao ?? "") });
  return out;
}

/**
 * Os instaladores publicados (lista vazia se não houver, se o HUB demorar ou estiver fora do ar). Cache de 5 min.
 * `MAESTRO_CATALOGO_DESKTOP=desligado` não pergunta nada (e2e: nunca serviço externo).
 */
export async function downloadsDoMaestro(f: typeof fetch = fetch, agora = Date.now()): Promise<DownloadMaestro[]> {
  if (process.env.MAESTRO_CATALOGO_DESKTOP === "desligado") return [];
  if (guardado && agora - guardado.em < CACHE_MS) return guardado.lista;
  let lista: DownloadMaestro[] = [];
  try {
    const hub = emissor();
    const r = await f(`${hub}/api/v1/desktop/apps`, { signal: AbortSignal.timeout(TEMPO_MS), cache: "no-store" });
    if (r.ok) lista = downloadsDoCatalogo(await r.json(), hub);
    else await r.body?.cancel().catch(() => {});
  } catch {
    lista = guardado?.lista ?? [];
  }
  guardado = { em: agora, lista };
  return lista;
}
