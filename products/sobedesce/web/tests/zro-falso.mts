/**
 * Absolute ZRO falsa para os testes do "Entrar com Absolute ZRO": descoberta OIDC, /oauth/authorize (devolve o
 * código na hora, como se a pessoa tivesse permitido), /oauth/token (confere segredo, PKCE, redirect_uri e uso único)
 * e JWKS. Assina o id_token com uma chave ES256 de verdade. `adulterar` gera tokens ruins de propósito.
 * A Z (27/10/2026): com `offline_access zro.ia` no pedido, devolve access e refresh token (o refresh RODA: reapresentado,
 * derruba a família) e atende /api/v1/ia/* só com Bearer válido, como a API da IA do HUB (/mensagens em NDJSON).
 * O Set (30/10/2026): /api/v1/set/* só com Bearer que tenha `zro.set` (sem ele, 401); leitura com ETag W/"v1" e 304.
 */
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";

/** `foto`: o `picture` do id_token, inteiro ("/api/v1/foto/…" vira endereço desta ZRO falsa). */
export type PessoaZro = { sub: string; email: string; nome: string; foto?: string; verificado?: boolean; org?: string | null; produtos?: string[] };
type Codigo = { desafio: string; redirectUri: string; pessoa: PessoaZro; nonce: string; usado: boolean; escopo: string };
export type PedidoIa = { metodo: string; caminho: string; autorizacao: string | null; corpo: string };

export async function iniciarZroFalsa(cliente: { clientId: string; clientSecret: string }) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "chave-teste", alg: "ES256", use: "sig" };
  const codigos = new Map<string, Codigo>();
  const estado = {
    proximo: { pessoa: null as PessoaZro | null, negar: false, adulterar: null as null | "nonce" | "aud" | "assinatura" | "emissor" },
    trocas: 0,
    /** `prompt` do último /oauth/authorize ("create" quando a pessoa veio de Criar conta). */
    ultimoPrompt: null as string | null,
    /** `scope` do último /oauth/authorize. */
    ultimoEscopo: null as string | null,
    /** A Absolute ZRO ainda não conhece zro.ia: responde invalid_scope a quem pedir. */
    recusarEscopoIa: false,
    /** A Absolute ZRO de antes do Set: responde invalid_scope a quem pedir zro.set. */
    recusarEscopoSet: false,
    pedidosSet: [] as { metodo: string; caminho: string; autorizacao: string | null; corpo: string; seEtag: string | null }[],
    /** Vida do access token (s); 0 obriga o SOBEDESCE a renovar antes de cada uso. */
    vidaAcesso: 600,
    renovacoes: 0,
    /** Família de refresh derrubada por reuso. */
    familiaDerrubada: false,
    pedidosIa: [] as PedidoIa[],
  };
  const acessos = new Map<string, { exp: number; escopo: string; nome: string }>();
  const refreshs = new Map<string, { usado: boolean; escopo: string; nome: string }>();
  const emitir = (escopo: string, nome: string) => {
    const at = `zat_${randomBytes(12).toString("hex")}`;
    const rt = `zrt_${randomBytes(12).toString("hex")}`;
    acessos.set(at, { exp: Date.now() + estado.vidaAcesso * 1000, escopo, nome });
    refreshs.set(rt, { usado: false, escopo, nome });
    return { access_token: at, refresh_token: rt, expires_in: estado.vidaAcesso };
  };
  let base = "";

  const jwt = (dados: Record<string, unknown>, assinarErrado = false, typ = "JWT") => {
    const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const cab = `${b({ alg: "ES256", typ, kid: jwk.kid })}.${b(dados)}`;
    const chave = assinarErrado ? generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey : privateKey;
    return `${cab}.${sign("sha256", Buffer.from(cab), { key: chave, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  };

  const responder = (res: http.ServerResponse, status: number, corpo: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(corpo));
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", base);
    if (url.pathname === "/.well-known/openid-configuration") {
      return responder(res, 200, {
        issuer: base,
        authorization_endpoint: `${base}/oauth/authorize`,
        token_endpoint: `${base}/oauth/token`,
        jwks_uri: `${base}/oauth/jwks`,
      });
    }
    if (url.pathname === "/oauth/jwks") return responder(res, 200, { keys: [jwk] });
    if (url.pathname === "/oauth/authorize") {
      const q = url.searchParams;
      estado.ultimoPrompt = q.get("prompt");
      estado.ultimoEscopo = q.get("scope");
      const volta = new URL(q.get("redirect_uri")!);
      volta.searchParams.set("state", q.get("state")!);
      if (q.get("client_id") !== cliente.clientId || q.get("code_challenge_method") !== "S256" || !q.get("nonce")) {
        volta.searchParams.set("error", "invalid_request");
      } else if (
        (estado.recusarEscopoIa && (q.get("scope") ?? "").split(" ").includes("zro.ia")) ||
        (estado.recusarEscopoSet && (q.get("scope") ?? "").split(" ").includes("zro.set"))
      ) {
        volta.searchParams.set("error", "invalid_scope");
      } else if (estado.proximo.negar || !estado.proximo.pessoa) {
        volta.searchParams.set("error", "access_denied");
      } else {
        const code = `zc_${randomBytes(16).toString("hex")}`;
        codigos.set(code, { desafio: q.get("code_challenge")!, redirectUri: q.get("redirect_uri")!, pessoa: estado.proximo.pessoa, nonce: q.get("nonce")!, usado: false, escopo: q.get("scope") ?? "" });
        volta.searchParams.set("code", code);
        volta.searchParams.set("iss", base);
      }
      res.writeHead(302, { location: volta.toString() });
      return res.end();
    }
    if (url.pathname === "/oauth/token" && req.method === "POST") {
      let corpo = "";
      for await (const c of req) corpo += c;
      const f = new URLSearchParams(corpo);
      const basic = Buffer.from((req.headers.authorization ?? "").replace(/^Basic /, ""), "base64").toString();
      if (basic !== `${cliente.clientId}:${cliente.clientSecret}`) return responder(res, 401, { error: "invalid_client" });
      if (f.get("grant_type") === "refresh_token") {
        const r = refreshs.get(f.get("refresh_token") ?? "");
        if (!r) return responder(res, 400, { error: "invalid_grant" });
        if (r.usado) {
          estado.familiaDerrubada = true;
          refreshs.clear();
          acessos.clear();
          return responder(res, 400, { error: "invalid_grant" });
        }
        r.usado = true;
        estado.renovacoes++;
        return responder(res, 200, { ...emitir(r.escopo, r.nome), token_type: "Bearer", scope: r.escopo });
      }
      const c = codigos.get(f.get("code") ?? "");
      if (!c || c.usado) return responder(res, 400, { error: "invalid_grant" });
      c.usado = true;
      const desafio = createHash("sha256").update(f.get("code_verifier") ?? "").digest("base64url");
      if (desafio !== c.desafio || f.get("redirect_uri") !== c.redirectUri) return responder(res, 400, { error: "invalid_grant" });
      estado.trocas++;
      const agora = Math.floor(Date.now() / 1000);
      const ad = estado.proximo.adulterar;
      const id = jwt(
        {
          iss: ad === "emissor" ? "https://outro.exemplo" : base,
          sub: c.pessoa.sub,
          aud: ad === "aud" ? "outro-app" : cliente.clientId,
          iat: agora,
          exp: agora + 600,
          nonce: ad === "nonce" ? "nonce-errado" : c.nonce,
          email: c.pessoa.email,
          email_verified: c.pessoa.verificado !== false,
          name: c.pessoa.nome,
          ...(c.pessoa.foto ? { picture: c.pessoa.foto.startsWith("/") ? `${base}${c.pessoa.foto}` : c.pessoa.foto } : {}),
          zro_org: c.pessoa.org ? { id: "org-1", name: c.pessoa.org, role: "owner" } : null,
          zro_products: c.pessoa.produtos ?? [],
        },
        ad === "assinatura",
      );
      const escopos = c.escopo.split(" ");
      const tokens = escopos.includes("offline_access") ? emitir(c.escopo, c.pessoa.nome) : { access_token: "at", expires_in: 600 };
      return responder(res, 200, { ...tokens, token_type: "Bearer", id_token: id, scope: c.escopo || "openid email profile org" });
    }
    if (url.pathname === "/api/v1/set" || url.pathname.startsWith("/api/v1/set/")) {
      let corpo = "";
      for await (const c of req) corpo += c;
      const autorizacao = req.headers.authorization ?? null;
      const caminho = url.pathname.slice("/api/v1/set".length).replace(/^\//, "") + url.search;
      estado.pedidosSet.push({ metodo: req.method ?? "GET", caminho, autorizacao, corpo, seEtag: (req.headers["if-none-match"] as string) ?? null });
      const a = acessos.get((autorizacao ?? "").replace(/^Bearer /, ""));
      if (!a || a.exp < Date.now() || !a.escopo.split(" ").includes("zro.set")) return responder(res, 401, { error: "unauthenticated" });
      if (req.method === "GET" && req.headers["if-none-match"] === 'W/"v1"') {
        res.writeHead(304, { etag: 'W/"v1"' });
        return res.end();
      }
      res.writeHead(200, { "content-type": "application/json", etag: 'W/"v1"' });
      return res.end(JSON.stringify({ eu: { nome: a.nome }, pessoas: [], naoLidas: 0, pedidos: 0, porConversa: {} }));
    }
    if (url.pathname.startsWith("/api/v1/ia/")) {
      let corpo = "";
      for await (const c of req) corpo += c;
      const autorizacao = req.headers.authorization ?? null;
      estado.pedidosIa.push({ metodo: req.method ?? "GET", caminho: url.pathname.slice("/api/v1/ia/".length), autorizacao, corpo });
      const a = acessos.get((autorizacao ?? "").replace(/^Bearer /, ""));
      if (!a || a.exp < Date.now() || !a.escopo.split(" ").includes("zro.ia")) return responder(res, 401, { error: "unauthenticated" });
      const caminho = url.pathname.slice("/api/v1/ia/".length);
      if (caminho === "estado") return responder(res, 200, { ligada: true, nome: a.nome.split(" ")[0], produto: "sobedesce", creditos: { usados: 3, limite: 100, renova_em: "2026-11-01T00:00:00.000Z" } });
      if (caminho === "conversas") return responder(res, 200, { conversas: [] });
      if (caminho === "mensagens" && req.method === "POST") {
        // Streaming de verdade: a primeira linha sai antes da segunda existir.
        res.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8" });
        res.write(JSON.stringify({ tipo: "conversa", id: "c1", titulo: "Teste" }) + "\n");
        await new Promise((ok) => setTimeout(ok, 60));
        res.write(JSON.stringify({ tipo: "texto", t: "Olá." }) + "\n");
        return res.end(JSON.stringify({ tipo: "fim", mensagem: "m1", creditos: 1 }) + "\n");
      }
      if (caminho.startsWith("conversas/") && req.method === "DELETE") {
        res.writeHead(204);
        return res.end();
      }
      return responder(res, 404, { error: "not_found" });
    }
    responder(res, 404, { error: "not_found" });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url: base,
    ...estado,
    estado,
    /**
     * Pedido do HUB para a Z (zro-pedido+jwt), como `assinarPedidoDeApp` do HUB. `mudar` troca campos do padrão
     * (aud, exp, iss...) e `typ`/`assinarErrado` geram pedidos ruins de propósito.
     */
    pedido(o: { sub: string; aud: string; acao: string; mudar?: Record<string, unknown>; typ?: string; assinarErrado?: boolean }) {
      const agora = Math.floor(Date.now() / 1000);
      const dados = { iss: base, sub: o.sub, aud: o.aud, iat: agora, exp: agora + 60, jti: randomBytes(12).toString("base64url"), zro_pedido: o.acao, ...o.mudar };
      return jwt(dados, o.assinarErrado ?? false, o.typ ?? "zro-pedido+jwt");
    },
    fechar: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}
