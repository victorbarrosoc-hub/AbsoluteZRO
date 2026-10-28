/**
 * Absolute ZRO falsa para os testes do "Entrar com Absolute ZRO" (molde: products/sobedesce/web/tests/zro-falso.mts):
 * descoberta OIDC, /oauth/authorize (devolve o código na hora, como app da família), /oauth/token (confere segredo,
 * PKCE, redirect_uri e uso único; refresh RODA e reuso derruba a família), /oauth/userinfo (os claims atuais da
 * pessoa: o teste muda nome, produtos ou organização e o /eu relê), /oauth/revoke, JWKS e /api/v1/ia/* (só com Bearer
 * válido e escopo zro.ia; /mensagens em NDJSON). Assina o id_token com uma chave ES256 de verdade. `adulterar` gera
 * tokens ruins de propósito.
 */
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";

export type OrgFalsa = { id: string; name: string; role: string };
export type PessoaZro = {
  sub: string;
  email: string;
  nome: string;
  verificado?: boolean;
  foto?: string | null;
  org?: OrgFalsa | null;
  produtos?: string[];
  /** null = um HUB que não manda a claim. */
  release?: Record<string, string> | null;
};
type Codigo = { desafio: string; redirectUri: string; pessoa: PessoaZro; nonce: string; usado: boolean; escopo: string };
export type PedidoIa = { metodo: string; caminho: string; autorizacao: string | null; corpo: string };

export const ESCOPOS_COMPLETOS = "openid email profile org offline_access zro.ia maestro.projects";
export const ESCOPOS_BASICOS = "openid email profile org offline_access";

export async function iniciarZroFalsa(cliente: { clientId: string; clientSecret: string }) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "chave-teste", alg: "ES256", use: "sig" };
  const codigos = new Map<string, Codigo>();
  /** A conta de cada pessoa na Absolute ZRO (por sub): o /userinfo responde daqui, então o teste pode mudar. */
  const contas = new Map<string, PessoaZro>();
  const estado = {
    proximo: { pessoa: null as PessoaZro | null, negar: false, adulterar: null as null | "nonce" | "aud" | "assinatura" | "emissor" },
    trocas: 0,
    /** `prompt` e `scope` do último /oauth/authorize. */
    ultimoPrompt: null as string | null,
    ultimoEscopo: null as string | null,
    /** A Absolute ZRO ainda não conhece os escopos além dos básicos: responde invalid_scope a quem pedir. */
    recusarEscoposExtras: false,
    /** Vida do access token (s); 0 obriga o Maestro a renovar antes de cada uso. */
    vidaAcesso: 600,
    renovacoes: 0,
    userinfos: 0,
    revogados: 0,
    familiaDerrubada: false,
    /** Recusa toda renovação (acesso do app removido no Perfil): invalid_grant. */
    recusarRefresh: false,
    /** Fora do ar: toda chamada de token/userinfo/ia falha (rede). */
    fora: false,
    pedidosIa: [] as PedidoIa[],
  };
  const acessos = new Map<string, { exp: number; escopo: string; sub: string }>();
  const refreshs = new Map<string, { usado: boolean; escopo: string; sub: string }>();
  /** Com vidaAcesso 0 o Maestro renova antes de usar; a falsa ainda aceita o token recém-emitido por 5 s. */
  const valido = (a: { exp: number } | undefined): a is { exp: number; escopo: string; sub: string } => !!a && a.exp + 5000 >= Date.now();
  const emitir = (escopo: string, sub: string) => {
    const at = `zat_${randomBytes(12).toString("hex")}`;
    const rt = `zrt_${randomBytes(12).toString("hex")}`;
    acessos.set(at, { exp: Date.now() + estado.vidaAcesso * 1000, escopo, sub });
    refreshs.set(rt, { usado: false, escopo, sub });
    return { access_token: at, refresh_token: rt, expires_in: estado.vidaAcesso };
  };
  let base = "";

  const jwt = (dados: Record<string, unknown>, assinarErrado = false, typ = "JWT") => {
    const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const cab = `${b({ alg: "ES256", typ, kid: jwk.kid })}.${b(dados)}`;
    const chave = assinarErrado ? generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey : privateKey;
    return `${cab}.${sign("sha256", Buffer.from(cab), { key: chave, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  };

  const claimsDe = (p: PessoaZro) => ({
    sub: p.sub,
    email: p.email,
    email_verified: p.verificado !== false,
    name: p.nome,
    ...(p.foto ? { picture: p.foto } : {}),
    updated_at: 1_790_000_000,
    zro_conta: `${base}/perfil`,
    zro_org: p.org === undefined ? null : p.org,
    zro_products: p.produtos ?? [],
    // Como o HUB de verdade: zro_release vai sempre. Padrão: o Maestro em teste aberto (migration 0022 do HUB).
    zro_release: p.release === undefined ? { maestro: "released" } : p.release,
  });

  const responder = (res: http.ServerResponse, status: number, corpo: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(corpo));
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", base);
    if (estado.fora && url.pathname !== "/.well-known/openid-configuration" && url.pathname !== "/oauth/jwks") {
      res.destroy();
      return;
    }
    if (url.pathname === "/.well-known/openid-configuration") {
      return responder(res, 200, {
        issuer: base,
        authorization_endpoint: `${base}/oauth/authorize`,
        token_endpoint: `${base}/oauth/token`,
        jwks_uri: `${base}/oauth/jwks`,
        userinfo_endpoint: `${base}/oauth/userinfo`,
        revocation_endpoint: `${base}/oauth/revoke`,
      });
    }
    if (url.pathname === "/oauth/jwks") return responder(res, 200, { keys: [jwk] });
    if (url.pathname === "/oauth/authorize") {
      const q = url.searchParams;
      estado.ultimoPrompt = q.get("prompt");
      estado.ultimoEscopo = q.get("scope");
      const volta = new URL(q.get("redirect_uri")!);
      volta.searchParams.set("state", q.get("state")!);
      const escopo = q.get("scope") ?? "";
      if (q.get("client_id") !== cliente.clientId || q.get("code_challenge_method") !== "S256" || !q.get("nonce")) {
        volta.searchParams.set("error", "invalid_request");
      } else if (estado.recusarEscoposExtras && escopo.split(" ").some((s) => !ESCOPOS_BASICOS.split(" ").includes(s))) {
        volta.searchParams.set("error", "invalid_scope");
      } else if (estado.proximo.negar || !estado.proximo.pessoa) {
        volta.searchParams.set("error", "access_denied");
      } else {
        const code = `zc_${randomBytes(16).toString("hex")}`;
        contas.set(estado.proximo.pessoa.sub, estado.proximo.pessoa);
        codigos.set(code, {
          desafio: q.get("code_challenge")!,
          redirectUri: q.get("redirect_uri")!,
          pessoa: estado.proximo.pessoa,
          nonce: q.get("nonce")!,
          usado: false,
          escopo,
        });
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
        if (!r || estado.recusarRefresh) return responder(res, 400, { error: "invalid_grant" });
        if (r.usado) {
          estado.familiaDerrubada = true;
          refreshs.clear();
          acessos.clear();
          return responder(res, 400, { error: "invalid_grant" });
        }
        r.usado = true;
        estado.renovacoes++;
        return responder(res, 200, { ...emitir(r.escopo, r.sub), token_type: "Bearer", scope: r.escopo });
      }
      const c = codigos.get(f.get("code") ?? "");
      if (!c || c.usado) return responder(res, 400, { error: "invalid_grant" });
      c.usado = true;
      const desafio = createHash("sha256")
        .update(f.get("code_verifier") ?? "")
        .digest("base64url");
      if (desafio !== c.desafio || f.get("redirect_uri") !== c.redirectUri) return responder(res, 400, { error: "invalid_grant" });
      estado.trocas++;
      const agora = Math.floor(Date.now() / 1000);
      const ad = estado.proximo.adulterar;
      const id = jwt(
        {
          ...claimsDe(c.pessoa),
          iss: ad === "emissor" ? "https://outro.exemplo" : base,
          aud: ad === "aud" ? "outro-app" : cliente.clientId,
          iat: agora,
          exp: agora + 600,
          nonce: ad === "nonce" ? "nonce-errado" : c.nonce,
        },
        ad === "assinatura",
      );
      const tokens = c.escopo.split(" ").includes("offline_access") ? emitir(c.escopo, c.pessoa.sub) : { access_token: "at", expires_in: 600 };
      return responder(res, 200, { ...tokens, token_type: "Bearer", id_token: id, scope: c.escopo || "openid email profile org" });
    }
    const bearer = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    if (url.pathname === "/oauth/userinfo") {
      estado.userinfos++;
      const a = acessos.get(bearer);
      if (!valido(a)) return responder(res, 401, { error: "invalid_token" });
      const p = contas.get(a.sub);
      if (!p) return responder(res, 401, { error: "invalid_token" });
      return responder(res, 200, claimsDe(p));
    }
    if (url.pathname === "/oauth/revoke" && req.method === "POST") {
      let corpo = "";
      for await (const c of req) corpo += c;
      const f = new URLSearchParams(corpo);
      const basic = Buffer.from((req.headers.authorization ?? "").replace(/^Basic /, ""), "base64").toString();
      if (basic !== `${cliente.clientId}:${cliente.clientSecret}`) return responder(res, 401, { error: "invalid_client" });
      if (refreshs.delete(f.get("token") ?? "")) estado.revogados++;
      res.writeHead(200);
      return res.end();
    }
    if (url.pathname.startsWith("/api/v1/ia/")) {
      let corpo = "";
      for await (const c of req) corpo += c;
      const autorizacao = req.headers.authorization ?? null;
      const caminho = url.pathname.slice("/api/v1/ia/".length);
      estado.pedidosIa.push({ metodo: req.method ?? "GET", caminho, autorizacao, corpo });
      const a = acessos.get(bearer);
      if (!valido(a) || !a.escopo.split(" ").includes("zro.ia")) return responder(res, 401, { error: "unauthenticated" });
      const p = contas.get(a.sub);
      if (caminho === "estado")
        return responder(res, 200, {
          ligada: true,
          nome: (p?.nome ?? "").split(" ")[0],
          produto: "maestro",
          creditos: { usados: 3, limite: 100, renova_em: "2026-11-01T00:00:00.000Z" },
        });
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
    estado,
    contas,
    /** Um pedido servidor-a-servidor como o `assinarPedidoDeApp` do HUB (typ zro-pedido+jwt, 60 s). */
    assinarPedido: (p: { sub: string; aud: string; acao: string; jti?: string; vida?: number; iss?: string }, errado = false) => {
      const iat = Math.floor(Date.now() / 1000);
      return jwt(
        { iss: p.iss ?? base, sub: p.sub, aud: p.aud, iat, exp: iat + (p.vida ?? 60), jti: p.jti ?? randomBytes(12).toString("hex"), zro_pedido: p.acao },
        errado,
        "zro-pedido+jwt",
      );
    },
    fechar: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}
