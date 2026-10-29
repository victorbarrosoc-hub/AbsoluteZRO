/**
 * Lógica de /api/zro/entrar, /api/zro/callback, /api/zro/eu e /api/zro/sair (as rotas só repassam o Request), no
 * molde do SOBEDESCE web (src/lib/zro/rotas.ts) e do Synquei (/eu relê o perfil). Erros voltam como ?erro=<codigo>
 * em /entrar; os textos estão em lib/mensagens.ts.
 */
import { createHash } from "node:crypto";
import { temAcesso } from "@/lib/auth/acesso";
import { chaveConfigurada, igualSeguro } from "@/lib/auth/cripto";
import { dentroDoLimite, registrarTentativa, REGRAS } from "@/lib/auth/limite";
import { sessaoDaRequisicao } from "@/lib/auth/requisicao";
import {
  aplicarPerfilNaSessao,
  comTokensDaSessao,
  COOKIE_SESSAO,
  criarSessao,
  encerrarSessao,
  marcarPerfilLido,
  opcoesCookieSessao,
  type Sessao,
} from "@/lib/auth/sessao";
import { comParametro, erro, ipDe, json, lerCookie, origemConfere, origemDoPedido, redirecionar, serializarCookie, voltaSegura } from "@/lib/http";
import { NOME_DO_PAPEL } from "@/lib/papeis";
import { cookieSeguro, FERRAMENTAS_ZRO, origensDoSite, ROTAS } from "@/lib/site";
import { emissor, PROXIMO_NIVEL, retornoZro, zroConfigurado, type NivelEscopo } from "./config";
import { entrarNaOrganizacao } from "./contas";
import { abrirEstadoZro, COOKIE_ZRO, DURACAO_ZRO_S, selarEstadoZro, type ModoZro } from "./estado";
import { lerUserinfo, novoValor, renovarTokens, revogarToken, trocarCodigoZro, urlDeLogin, type PerfilZro, type TokensZro } from "./oidc";

const VOLTA_PADRAO: string = ROTAS.app;
/** O /eu relê o perfil na Absolute ZRO no máximo uma vez por minuto por sessão. */
export const REVER_MS = 60_000;

function paginaDeErro(volta: string, codigo: string): string {
  const base = comParametro(ROTAS.entrar, "erro", codigo);
  return volta !== VOLTA_PADRAO ? comParametro(base, "volta", volta) : base;
}

/**
 * ?modo=entrar|criar&volta=/app/quadro → 302 para a Absolute ZRO (state, nonce e PKCE S256 em cookie selado de 10 min).
 * "criar" (a tela Criar conta) é o "entrar" com `prompt=create`: a Absolute ZRO abre direto em criar conta (ADR 0014).
 */
export async function entrar(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const modo: ModoZro = url.searchParams.get("modo") === "criar" ? "criar" : "entrar";
  const pedido = url.searchParams.get("nivel");
  // `basico=1` é o formato antigo do mesmo pedido.
  const nivel: NivelEscopo =
    pedido === "sem_set" || pedido === "sem_pessoas" || pedido === "sem_agenda" || pedido === "basico" ? pedido : url.searchParams.get("basico") === "1" ? "basico" : "completo";
  const volta = voltaSegura(url.searchParams.get("volta"), VOLTA_PADRAO);

  // A Absolute ZRO volta para o endereço cadastrado: o cookie do state precisa nascer nele.
  const retorno = new URL(retornoZro(url.origin));
  if (url.host !== retorno.host) return redirecionar(new URL(url.pathname + url.search, retorno.origin), 307);
  if (!zroConfigurado() || !chaveConfigurada()) return redirecionar(new URL(paginaDeErro(volta, "zro_config"), url.origin));
  const chave = `entrar:${ipDe(req.headers)}`;
  if (!(await dentroDoLimite(chave, REGRAS.entrarIp))) return redirecionar(new URL(paginaDeErro(volta, "zro_devagar"), url.origin));
  await registrarTentativa(chave);

  const state = novoValor();
  const nonce = novoValor();
  const verificador = novoValor();
  const desafio = createHash("sha256").update(verificador).digest("base64url");
  let destino: string;
  try {
    destino = await urlDeLogin({ state, desafio, nonce, origem: retorno.origin, criar: modo === "criar", nivel });
  } catch {
    return redirecionar(new URL(paginaDeErro(volta, "zro_erro"), url.origin));
  }
  const cookie = serializarCookie(COOKIE_ZRO, selarEstadoZro({ state, verificador, nonce, modo, volta, nivel }), {
    maxAge: DURACAO_ZRO_S,
    path: "/api/zro",
    secure: cookieSeguro(url.origin),
  });
  return redirecionar(destino, 302, [cookie]);
}

/** Volta da Absolute ZRO → 303 para `volta` (ou /sem-acesso) com a sessão no cookie, ou /entrar?erro=<codigo>. */
export async function callback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const seguro = cookieSeguro(origemDoPedido(req.headers, req.url));
  const limpar = serializarCookie(COOKIE_ZRO, "", { maxAge: 0, path: "/api/zro", secure: seguro });
  const ir = (caminho: string, cookies: string[] = []) => redirecionar(new URL(caminho, url.origin), 303, [limpar, ...cookies]);

  const estado = abrirEstadoZro(lerCookie(req, COOKIE_ZRO));
  if (!estado) return ir(paginaDeErro(VOLTA_PADRAO, "zro_expirou"));
  const { modo, volta } = estado;
  const falhar = (codigo: string) => ir(paginaDeErro(volta, codigo));

  if (!igualSeguro(url.searchParams.get("state"), estado.state)) return falhar("zro_expirou");
  // RFC 9207: a resposta diz quem a emitiu; confere antes de usar o código.
  const iss = url.searchParams.get("iss");
  if (iss && iss !== emissor()) return falhar("zro_erro");
  const erroZro = url.searchParams.get("error");
  // A Absolute ZRO ainda não conhece um dos escopos: tira primeiro o Set (zro.set), depois Pessoas, a Agenda, e a Z e projetos.
  const proximo = erroZro === "invalid_scope" ? PROXIMO_NIVEL[estado.nivel ?? "completo"] : null;
  if (proximo) {
    const q = new URLSearchParams({ modo, volta, nivel: proximo });
    return ir(`/api/zro/entrar?${q}`);
  }
  if (erroZro) return falhar(erroZro === "access_denied" ? "zro_recusado" : "zro_erro");
  const code = url.searchParams.get("code");
  if (!code) return falhar("zro_erro");

  let perfil: PerfilZro;
  let tokens: TokensZro | null;
  try {
    ({ perfil, tokens } = await trocarCodigoZro(code, estado.verificador, estado.nonce, url.origin));
  } catch {
    return falhar("zro_erro");
  }
  // Entrar = entrar na organização da Absolute ZRO. Sem organização, não há onde entrar.
  const entrada = await entrarNaOrganizacao(perfil);
  if (!entrada) return falhar("zro_sem_org");
  const sessao = await criarSessao({
    orgId: entrada.orgId,
    sub: perfil.sub,
    produtos: perfil.produtos,
    release: perfil.release,
    tokens,
    userAgent: req.headers.get("user-agent"),
  });
  const cookies = [serializarCookie(COOKIE_SESSAO, sessao.token, opcoesCookieSessao(seguro))];
  // A sessão existe mesmo sem acesso: a tela "sem acesso" mostra quem é e oferece Sair.
  if (!temAcesso(perfil)) return ir(ROTAS.semAcesso, cookies);
  return ir(volta, cookies);
}

/**
 * Perfil único: relê nome, e-mail, foto e zro_products em /oauth/userinfo com os tokens da sessão. Absolute ZRO fora
 * do ar: vale a última cópia. Recusou (acesso do app removido no Perfil, conta inativa): a sessão acaba.
 */
async function relerPerfil(s: Sessao): Promise<Sessao | "revogado" | null> {
  let perfil: PerfilZro | null = null;
  let revogado = false;
  try {
    await comTokensDaSessao(s.id, async (tokens, guardar) => {
      if (!tokens) return;
      let t = tokens;
      const renovar = async () => {
        const r = await renovarTokens(t.rt);
        if (!r.tokens) {
          if (r.recusado) {
            revogado = true;
            await guardar(null);
          }
          return false;
        }
        t = r.tokens;
        await guardar(t);
        return true;
      };
      if (t.atExp - 30 <= Math.floor(Date.now() / 1000) && !(await renovar())) return;
      let u = await lerUserinfo(t.at);
      if (u.recusado) {
        if (!(await renovar())) return;
        u = await lerUserinfo(t.at);
        if (u.recusado) {
          revogado = true;
          await guardar(null);
          return;
        }
      }
      perfil = u.perfil;
    });
  } catch {
    // rede ou Absolute ZRO fora: segue com a última cópia, sem bater toda hora
    await marcarPerfilLido(s.id);
    return null;
  }
  if (revogado) return "revogado";
  if (!perfil) {
    await marcarPerfilLido(s.id);
    return null;
  }
  const p: PerfilZro = perfil;
  if (p.sub !== s.sub) return "revogado";
  await aplicarPerfilNaSessao(s, p);
  return { ...s, nome: p.nome, email: p.email, foto: p.foto, produtos: p.produtos, release: p.release, recursos: p.recursos, perfilLidoEm: new Date() };
}

/** GET /api/zro/eu: quem está logado, com `acesso` (o Maestro em zro_products) relido na Absolute ZRO. */
export async function eu(req: Request): Promise<Response> {
  if (!zroConfigurado()) return json({ ok: false, configurado: false }, 503);
  const semSessao = (cookies: string[] = []) =>
    json(
      { ok: false, configurado: true, entrar: "/api/zro/entrar", criar: "/api/zro/entrar?modo=criar" },
      401,
      cookies.map((c) => ["Set-Cookie", c] as [string, string]),
    );
  let s = await sessaoDaRequisicao(req);
  if (!s) return semSessao();
  const agora = Date.now();
  if (s.temTokens && (!s.perfilLidoEm || agora - s.perfilLidoEm.getTime() >= REVER_MS)) {
    const r = await relerPerfil(s);
    if (r === "revogado") {
      await encerrarSessao(s.id);
      const seguro = cookieSeguro(origemDoPedido(req.headers, req.url));
      return semSessao([serializarCookie(COOKIE_SESSAO, "", { maxAge: 0, path: "/", secure: seguro })]);
    }
    if (r) s = r;
  }
  return json({
    ok: true,
    acesso: temAcesso(s),
    ferramentas: FERRAMENTAS_ZRO,
    pessoa: { nome: s.nome, email: s.email, foto: s.foto, conta: `${emissor()}/perfil` },
    organizacao: { nome: s.orgNome, papel: s.papel, papel_nome: NOME_DO_PAPEL[s.papel], hub_role: s.hubRole },
    produtos: s.produtos,
  });
}

/** POST (ou GET) /api/zro/sair: encerra a sessão, avisa a Absolute ZRO e volta à página inicial. */
export async function sair(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const seguro = cookieSeguro(origemDoPedido(req.headers, req.url));
  if (req.method === "POST" && !origemConfere(req.headers, req.url, origensDoSite())) return erro(403, "origem", "Pedido de outra origem recusado.");
  const s = await sessaoDaRequisicao(req);
  if (s) {
    const tokens = await encerrarSessao(s.id);
    if (tokens?.rt) await revogarToken(tokens.rt).catch(() => undefined);
  }
  return redirecionar(new URL("/", url.origin), 303, [serializarCookie(COOKIE_SESSAO, "", { maxAge: 0, path: "/", secure: seguro })]);
}
