/**
 * Release de teste do GitHub ("sobedesce-versao-de-teste" no repositório AbsoluteZRO): os instaladores do app de desktop e o versao.json,
 * que o GitHub Actions sobe por último, depois dos dois instaladores (scripts/build-info.mjs na raiz do repositório).
 *
 * Usado por /baixar/[plataforma] (redireciona para o instalador) e /baixar/versao (o aviso de versão nova do app).
 *
 * Cada build sobe instaladores com o número no nome (SOBEDESCE-0.1.0-b160-mac-universal.dmg) e o versao.json diz quais
 * são (arquivoMac/arquivoWindows). Assim o instalador entregue é sempre o do build conferido: antes, o build seguinte
 * trocava o arquivo no Release minutos antes de trocar o versao.json, e o SHA-256 não batia ("versão sendo publicada").
 * Repositório privado: com GITHUB_TOKEN (só leitura de conteúdo), o GitHub devolve um endereço assinado e temporário
 * do arquivo. Repositório público: funciona sem token, pelo link normal do arquivo.
 */

/**
 * De onde vêm os instaladores, na ordem. O SOBEDESCE passou a morar no repositório AbsoluteZRO (ADR 0013 da raiz):
 * o workflow da raiz publica no Release "sobedesce-versao-de-teste". Enquanto esse Release não existe (404), o site
 * continua entregando o do repositório antigo (baixadordodrive, "versao-de-teste"). Os builds daqui começam no b1001
 * (scripts/numero-build.mjs), então o primeiro build novo já aparece como mais novo que o último do antigo (b379).
 */
export const FONTES = [
  { repo: "victorbarrosoc-hub/AbsoluteZRO", tag: "sobedesce-versao-de-teste" },
  { repo: "victorbarrosoc-hub/baixadordodrive", tag: "versao-de-teste" },
] as const;
const CACHE_MS = 5 * 60_000;

export type Asset = { id: number; name: string; url: string; browser_download_url: string };
/**
 * sha256Mac/sha256Windows: SHA-256 de cada instalador (null em versao.json antigo, de antes da conferência).
 * arquivoMac/arquivoWindows: nome do instalador deste build no Release (null em versao.json antigo).
 */
export type Versao = {
  build: number;
  commit: string;
  data: string;
  sha256Mac: string | null;
  sha256Windows: string | null;
  arquivoMac: string | null;
  arquivoWindows: string | null;
};

export const PLATAFORMAS = {
  mac: (n: string) => n.endsWith(".dmg"),
  windows: (n: string) => n.endsWith("-windows-setup.exe"),
} as const satisfies Record<string, (nome: string) => boolean>;
export type Plataforma = keyof typeof PLATAFORMAS;

export function ehPlataforma(v: string): v is Plataforma {
  return Object.hasOwn(PLATAFORMAS, v);
}

/**
 * API do GitHub. SOBEDESCE_GITHUB_API troca por um GitHub falso, só em teste local
 * (nunca na Vercel nem em produção, porque o GITHUB_TOKEN iria para essa base) e só em 127.0.0.1/localhost.
 */
function apiBase(): string {
  const base = process.env.SOBEDESCE_GITHUB_API;
  if (base && !process.env.VERCEL && process.env.NODE_ENV !== "production") {
    try {
      const u = new URL(base);
      if ((u.protocol === "http:" || u.protocol === "https:") && ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)) return u.origin;
    } catch {
      // inválido: usa o GitHub
    }
  }
  return "https://api.github.com";
}

function token(): string | undefined {
  return process.env.GITHUB_TOKEN || undefined;
}

let cacheAssets: { em: number; base: string; fonte: string; assets: Asset[] } | null = null;
let cacheVersao: { em: number; base: string; versao: Versao } | null = null;

/** Esquece o que estava guardado (testes; e depois de uma falha, para a próxima tentativa ir ao GitHub). */
export function esquecerCache() {
  cacheAssets = null;
  cacheVersao = null;
}

/** Arquivos do Release de teste (guardados por 5 min): o do AbsoluteZRO; sem ele (404), o do repositório antigo. */
export async function assetsDoRelease(): Promise<Asset[]> {
  const base = apiBase();
  if (cacheAssets && cacheAssets.base === base && Date.now() - cacheAssets.em < CACHE_MS) return cacheAssets.assets;
  const t = token();
  for (const [i, { repo, tag }] of FONTES.entries()) {
    const res = await fetch(`${base}/repos/${repo}/releases/tags/${tag}`, {
      headers: { accept: "application/vnd.github+json", ...(t ? { authorization: `Bearer ${t}` } : {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    // Só "não existe" passa para a próxima fonte; qualquer outra falha é erro (não mistura releases por engano).
    if (res.status === 404 && i < FONTES.length - 1) {
      await res.body?.cancel().catch(() => {});
      continue;
    }
    if (!res.ok) throw new Error(`release ${res.status}`);
    const j = (await res.json()) as { assets?: Asset[] };
    cacheAssets = { em: Date.now(), base, fonte: `${repo}@${tag}`, assets: Array.isArray(j.assets) ? j.assets : [] };
    return cacheAssets.assets;
  }
  throw new Error("release 404");
}

/** De qual Release vieram os arquivos guardados (repo@tag), para o painel e os testes. null = nada guardado. */
export function fonteDoRelease(): string | null {
  return cacheAssets?.fonte ?? null;
}

/**
 * Endereço para baixar o arquivo: o link normal (sem token) ou o endereço assinado que o GitHub devolve com token.
 * null = o GitHub não deu um endereço.
 */
export async function enderecoDoArquivo(asset: Asset): Promise<string | null> {
  const t = token();
  if (!t) return asset.browser_download_url;
  // Com token: o GitHub responde 302 para um endereço assinado de poucos minutos.
  const res = await fetch(asset.url, {
    headers: { accept: "application/octet-stream", authorization: `Bearer ${t}` },
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const destino = res.headers.get("location");
  await res.body?.cancel().catch(() => {});
  return destino;
}

/** Build no nome do instalador ("-b160-"); null = nome antigo, sem build. */
export function buildDoNome(nome: string): number | null {
  const m = /-b(\d{1,9})-/.exec(nome);
  return m ? Number(m[1]) : null;
}

function escolher(assets: Asset[], plataforma: Plataforma, build: number | null, nome: string | null): Asset | null {
  const daPlataforma = assets.filter((a) => PLATAFORMAS[plataforma](a.name));
  if (build != null) return daPlataforma.find((a) => buildDoNome(a.name) === build) ?? null;
  if (nome) {
    const exato = daPlataforma.find((a) => a.name === nome);
    if (exato) return exato;
  }
  // Sem versao.json (ou antigo): o de maior build; empate (nomes antigos), o subido por último.
  return daPlataforma.sort((a, b) => (buildDoNome(b.name) ?? -1) - (buildDoNome(a.name) ?? -1) || b.id - a.id)[0] ?? null;
}

/**
 * O instalador da plataforma. Com `build` (o app e os instaladores de uma linha mandam o build que conferiram): só o
 * daquele build, ou null se ele não existe mais. Sem `build`: o que o versao.json publicado aponta (o mais novo
 * conferido); sem versao.json, o de maior build. A lista guardada pode ser de antes do upload: confere de novo uma vez.
 */
export async function instalador(plataforma: Plataforma, build: number | null = null): Promise<Asset | null> {
  let nome: string | null = null;
  if (build == null) {
    try {
      const v = await versaoPublicada();
      nome = plataforma === "mac" ? v.arquivoMac : v.arquivoWindows;
    } catch {
      // sem versao.json: fica o de maior build
    }
  }
  const achado = escolher(await assetsDoRelease(), plataforma, build, nome);
  if (achado && (!nome || achado.name === nome)) return achado;
  cacheAssets = null;
  return escolher(await assetsDoRelease(), plataforma, build, nome);
}

const sha256 = (v: unknown): string | null => (typeof v === "string" && /^[0-9a-f]{64}$/i.test(v) ? v.toLowerCase() : null);
/** Nome de arquivo simples (sem barra), do jeito que o Release guarda. */
const nomeArquivo = (v: unknown): string | null => (typeof v === "string" && /^[\w.+-]{1,200}$/.test(v) ? v : null);

/** Confere o versao.json: build inteiro positivo, commit em hexadecimal, data ISO; SHA-256 dos instaladores se houver. */
export function lerVersao(bruto: unknown): Versao | null {
  if (!bruto || typeof bruto !== "object") return null;
  const v = bruto as Record<string, unknown>;
  const build = v.build;
  if (typeof build !== "number" || !Number.isSafeInteger(build) || build <= 0) return null;
  const commit = typeof v.commit === "string" && /^[0-9a-f]{7,40}$/i.test(v.commit) ? v.commit.slice(0, 12).toLowerCase() : null;
  const ms = typeof v.data === "string" ? Date.parse(v.data) : NaN;
  if (!commit || !Number.isFinite(ms)) return null;
  return {
    build,
    commit,
    data: new Date(ms).toISOString(),
    sha256Mac: sha256(v.sha256Mac),
    sha256Windows: sha256(v.sha256Windows),
    arquivoMac: nomeArquivo(v.arquivoMac),
    arquivoWindows: nomeArquivo(v.arquivoWindows),
  };
}

/** O build mais novo publicado (versao.json do Release de teste, guardado por 5 min). Lança se não der. */
export async function versaoPublicada(): Promise<Versao> {
  const base = apiBase();
  if (cacheVersao && cacheVersao.base === base && Date.now() - cacheVersao.em < CACHE_MS) return cacheVersao.versao;
  try {
    const asset = (await assetsDoRelease()).find((a) => a.name === "versao.json");
    if (!asset) throw new Error("sem versao.json no release");
    const url = await enderecoDoArquivo(asset);
    if (!url) throw new Error("sem endereço do versao.json");
    const res = await fetch(url, { headers: { accept: "application/json, application/octet-stream" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`versao.json ${res.status}`);
    const texto = await res.text();
    if (texto.length > 4096) throw new Error("versao.json grande demais");
    const versao = lerVersao(JSON.parse(texto));
    if (!versao) throw new Error("versao.json inválido");
    cacheVersao = { em: Date.now(), base, versao };
    return versao;
  } catch (e) {
    // O versao.json é trocado a cada build (id novo): a lista guardada pode apontar para o arquivo antigo.
    cacheAssets = null;
    throw e;
  }
}
