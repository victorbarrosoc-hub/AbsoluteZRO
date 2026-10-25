/**
 * Absolute ZRO falsa para os testes do "Entrar com Absolute ZRO": descoberta OIDC, /oauth/authorize (devolve o
 * código na hora, como se a pessoa tivesse permitido), /oauth/token (confere segredo, PKCE, redirect_uri e uso único)
 * e JWKS. Assina o id_token com uma chave ES256 de verdade. `adulterar` gera tokens ruins de propósito.
 */
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";

export type PessoaZro = { sub: string; email: string; nome: string; verificado?: boolean; org?: string | null; produtos?: string[] };
type Codigo = { desafio: string; redirectUri: string; pessoa: PessoaZro; nonce: string; usado: boolean };

export async function iniciarZroFalsa(cliente: { clientId: string; clientSecret: string }) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "chave-teste", alg: "ES256", use: "sig" };
  const codigos = new Map<string, Codigo>();
  const estado = {
    proximo: { pessoa: null as PessoaZro | null, negar: false, adulterar: null as null | "nonce" | "aud" | "assinatura" | "emissor" },
    trocas: 0,
    /** `prompt` do último /oauth/authorize ("create" quando a pessoa veio de Criar conta). */
    ultimoPrompt: null as string | null,
  };
  let base = "";

  const jwt = (dados: Record<string, unknown>, assinarErrado = false) => {
    const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const cab = `${b({ alg: "ES256", typ: "JWT", kid: jwk.kid })}.${b(dados)}`;
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
      const volta = new URL(q.get("redirect_uri")!);
      volta.searchParams.set("state", q.get("state")!);
      if (q.get("client_id") !== cliente.clientId || q.get("code_challenge_method") !== "S256" || !q.get("nonce")) {
        volta.searchParams.set("error", "invalid_request");
      } else if (estado.proximo.negar || !estado.proximo.pessoa) {
        volta.searchParams.set("error", "access_denied");
      } else {
        const code = `zc_${randomBytes(16).toString("hex")}`;
        codigos.set(code, { desafio: q.get("code_challenge")!, redirectUri: q.get("redirect_uri")!, pessoa: estado.proximo.pessoa, nonce: q.get("nonce")!, usado: false });
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
          zro_org: c.pessoa.org ? { id: "org-1", name: c.pessoa.org, role: "owner" } : null,
          zro_products: c.pessoa.produtos ?? [],
        },
        ad === "assinatura",
      );
      return responder(res, 200, { access_token: "at", token_type: "Bearer", expires_in: 600, id_token: id, scope: "openid email profile org" });
    }
    responder(res, 404, { error: "not_found" });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url: base,
    ...estado,
    estado,
    fechar: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}
