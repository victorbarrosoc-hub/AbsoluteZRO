/**
 * Lógica de /api/zro/entrar e /api/zro/callback (as rotas só repassam o Request), no mesmo molde do Google.
 * Erros voltam como ?erro=<codigo>; os textos estão em src/components/conta/mensagens.ts.
 */
import { createHash } from "node:crypto";
import { COOKIE_APARELHO, conferirAparelho, opcoesCookieAparelho } from "@/lib/auth/aparelho";
import { autenticar, COOKIE_SESSAO, criarSessao, opcoesCookieSessao } from "@/lib/auth/sessao";
import { destinoDeEntrada, voltaSegura } from "@/lib/auth/volta";
import { depoisDaResposta, type Depois } from "@/lib/depois";
import { chaveConfigurada } from "@/lib/google/cripto";
import { comParametro } from "@/lib/google/rotas";
import { stateConfere } from "@/lib/google/estado";
import { ipDe, lerCookie, lugarDe, origemDoPedido, redirecionar, serializarCookie } from "@/lib/http";
import { cookieSeguro } from "@/lib/site";
import { liberadoPelaZro } from "./acesso";
import { conexoesZro, retornoZro, zroConfigurado } from "./config";
import { criarContaComZro, donoDaContaZro, vincularZro } from "./contas";
import { abrirEstadoZro, COOKIE_ZRO, DURACAO_ZRO_S, selarEstadoZro, type ModoZro } from "./estado";
import { guardarTokensIa } from "./ia";
import { novoValor, trocarCodigoZro, urlDeLogin, type PerfilZro, type TokensIa } from "./oidc";

function paginaDeErro(modo: ModoZro, volta: string, codigo: string): string {
  if (modo === "entrar") {
    const base = comParametro("/entrar", "erro", codigo);
    return volta !== "/conta" ? comParametro(base, "volta", volta) : base;
  }
  return comParametro(volta, "erro", codigo);
}

/**
 * ?modo=entrar|criar|vincular. "criar" (a tela Criar conta) é o "entrar" com `prompt=create`: a Absolute ZRO abre
 * direto em criar conta, e a volta segue igual (conta nova no SOBEDESCE só nasce por aqui).
 */
export async function entrar(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pedido = url.searchParams.get("modo");
  const modo: ModoZro = pedido === "vincular" ? "vincular" : "entrar";
  const criar = pedido === "criar";
  const basico = url.searchParams.get("basico") === "1";
  const semSet = !basico && url.searchParams.get("sem_set") === "1";
  const volta = voltaSegura(url.searchParams.get("volta"));

  // A Absolute ZRO volta para o endereço cadastrado: o cookie do state precisa nascer nele.
  const retorno = new URL(retornoZro(url.origin));
  if (url.host !== retorno.host) return redirecionar(new URL(url.pathname + url.search, retorno.origin), 307);
  if (!zroConfigurado() || !chaveConfigurada()) return redirecionar(new URL(paginaDeErro(modo, volta, "zro_config"), url.origin));

  let usuarioId: string | null = null;
  if (modo === "vincular") {
    const atual = await autenticar({ cookie: lerCookie(req, COOKIE_SESSAO) });
    if (!atual) return redirecionar(new URL(comParametro("/entrar", "volta", volta), url.origin));
    usuarioId = atual.usuario.id;
  }

  const state = novoValor();
  const nonce = novoValor();
  const verificador = novoValor();
  const desafio = createHash("sha256").update(verificador).digest("base64url");
  let destino: string;
  try {
    destino = await urlDeLogin({ state, desafio, nonce, origem: retorno.origin, criar, basico, semSet });
  } catch {
    return redirecionar(new URL(paginaDeErro(modo, volta, "zro_erro"), url.origin));
  }
  const cookie = serializarCookie(COOKIE_ZRO, selarEstadoZro({ state, verificador, nonce, modo, usuarioId, volta, basico, ...(semSet ? { semSet } : {}) }), {
    maxAge: DURACAO_ZRO_S,
    path: "/api/zro",
    secure: cookieSeguro(url.origin),
  });
  return redirecionar(destino, 302, [cookie]);
}

export async function callback(req: Request, depois: Depois = depoisDaResposta): Promise<Response> {
  const url = new URL(req.url);
  const seguro = cookieSeguro(origemDoPedido(req.headers, req.url));
  const limpar = serializarCookie(COOKIE_ZRO, "", { maxAge: 0, path: "/api/zro", secure: seguro });
  const ir = (caminho: string, cookies: string[] = []) => redirecionar(new URL(caminho, url.origin), 303, [limpar, ...cookies]);

  const estado = abrirEstadoZro(lerCookie(req, COOKIE_ZRO));
  if (!estado) {
    const logado = await autenticar({ cookie: lerCookie(req, COOKIE_SESSAO) });
    return ir(logado ? "/conta?erro=zro_expirou" : "/entrar?erro=zro_expirou");
  }
  const { modo, volta } = estado;
  const falhar = (codigo: string) => ir(paginaDeErro(modo, volta, codigo));

  if (!stateConfere(url.searchParams.get("state"), estado.state)) return falhar("zro_expirou");
  // RFC 9207: a resposta diz quem a emitiu; confere antes de usar o código.
  const erroZro = url.searchParams.get("error");
  // A Absolute ZRO de antes do Set recusa `zro.set`: primeiro refaz sem ele (a Z segue); recusou de novo, também sem
  // o escopo da Z. O login nunca quebra por causa da Z nem do Set.
  if (erroZro === "invalid_scope" && !estado.basico && !estado.semSet) {
    const q = new URLSearchParams({ modo, volta, sem_set: "1" });
    return ir(`/api/zro/entrar?${q}`);
  }
  if (erroZro === "invalid_scope" && !estado.basico) {
    const q = new URLSearchParams({ modo, volta, basico: "1" });
    return ir(`/api/zro/entrar?${q}`);
  }
  if (erroZro) return falhar(erroZro === "access_denied" ? "zro_recusado" : "zro_erro");
  const code = url.searchParams.get("code");
  if (!code) return falhar("zro_erro");

  let quem: PerfilZro;
  let ia: TokensIa | null;
  try {
    ({ perfil: quem, ia } = await trocarCodigoZro(code, estado.verificador, estado.nonce, url.origin));
  } catch {
    return falhar("zro_erro");
  }

  if (modo === "vincular") {
    const atual = await autenticar({ cookie: lerCookie(req, COOKIE_SESSAO) });
    if (!atual || atual.usuario.id !== estado.usuarioId) return ir(comParametro("/entrar", "volta", volta));
    const r = await vincularZro(atual.usuario.id, quem);
    if (!r.ok) return falhar(r.erro);
    await guardarTokensIa(atual.usuario.id, ia);
    // Ligou agora (conta antiga sem vínculo): segue para as Conexões da central (lib/zro/ligar.ts). Religar fica aqui.
    // Sem a SOBEDESCE em zro_products, fica aqui também: a tela "Acesso ainda não liberado" explica o próximo passo.
    if (r.novo && liberadoPelaZro(quem.produtos.join(" "))) return ir(conexoesZro());
    return ir(comParametro(volta, "zro", "ok"));
  }

  let usuarioId = await donoDaContaZro(quem);
  let criou = false;
  if (!usuarioId) {
    const novo = await criarContaComZro(quem, ipDe(req.headers), depois);
    if (!novo.ok) return falhar(novo.erro);
    usuarioId = novo.usuarioId;
    criou = true;
  }
  await guardarTokensIa(usuarioId, ia);
  const sessao = await criarSessao(usuarioId, "web");
  const o = opcoesCookieSessao(seguro);
  const cookies = [serializarCookie(COOKIE_SESSAO, sessao.token, { maxAge: o.maxAge, path: o.path, secure: o.secure })];
  const aparelho = await conferirAparelho({
    usuarioId,
    cookie: lerCookie(req, COOKIE_APARELHO),
    via: "zro",
    entrada: { userAgent: req.headers.get("user-agent"), lugar: lugarDe(req.headers) },
    avisar: !criou,
    depois,
  });
  if (aparelho) {
    const a = opcoesCookieAparelho(seguro);
    cookies.push(serializarCookie(COOKIE_APARELHO, aparelho, { maxAge: a.maxAge, path: a.path, secure: a.secure }));
  }
  const celular = /iPhone|iPad|iPod|Android|Mobile/i.test(req.headers.get("user-agent") ?? "");
  const destino = volta === "/conta" && celular ? "/app/" : criou ? comParametro(volta, "zro", "ok") : destinoDeEntrada(volta);
  return ir(destino, cookies);
}
