/**
 * Lógica de /api/google/conectar e /api/google/callback (as rotas só repassam o Request).
 * Erros voltam como ?erro=<codigo> para a tela; os textos estão em src/components/conta/mensagens.ts.
 */
import { COOKIE_APARELHO, conferirAparelho, opcoesCookieAparelho } from "@/lib/auth/aparelho";
import { autenticar, COOKIE_SESSAO, criarSessao, opcoesCookieSessao } from "@/lib/auth/sessao";
import { destinoDeEntrada, voltaSegura } from "@/lib/auth/volta";
import { depoisDaResposta, type Depois } from "@/lib/depois";
import { lerCookie, lugarDe, origemDoPedido, redirecionar, serializarCookie } from "@/lib/http";
import { cookieSeguro } from "@/lib/site";
import { ESCOPOS_ENTRAR, googleConfigurado, redirectUri, type ModoDrive } from "./config";
import { donoDaContaGoogle, vincularConta } from "./contas";
import { chaveConfigurada } from "./cripto";
import { abrirEstado, COOKIE_OAUTH, DURACAO_OAUTH_S, novoState, selarEstado, stateConfere, type ModoGoogle } from "./estado";
import { acessoDoEscopo, perfil, pkce, revogar, trocarCodigo, urlDeConsentimento, type PerfilGoogle, type Tokens } from "./oauth";
import { driveInteiroPermitido, pedidoParaConectar, recusarDriveInteiro, registrarSeTotal } from "./vagas";

/** Junta um parâmetro a um caminho interno que talvez já tenha "?". */
export function comParametro(caminho: string, chave: string, valor: string): string {
  const u = new URL(caminho, "https://sobedesce.invalid");
  u.searchParams.set(chave, valor);
  return u.pathname + u.search + u.hash;
}

function paginaDeErro(modo: ModoGoogle, volta: string, codigo: string): string {
  if (modo === "entrar") {
    const base = comParametro("/entrar", "erro", codigo);
    return volta !== "/conta" ? comParametro(base, "volta", volta) : base;
  }
  return comParametro(volta, "erro", codigo);
}

export async function conectar(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const modo: ModoGoogle = url.searchParams.get("modo") === "entrar" ? "entrar" : "vincular";
  const volta = voltaSegura(url.searchParams.get("volta"));

  // O Google volta para o endereço cadastrado: o cookie do state precisa nascer nele.
  const retorno = new URL(redirectUri(url.origin));
  if (url.host !== retorno.host) return redirecionar(new URL(url.pathname + url.search, retorno.origin), 307);

  if (!googleConfigurado() || !chaveConfigurada()) return redirecionar(new URL(paginaDeErro(modo, volta, "google_config"), url.origin));

  let usuarioId: string | null = null;
  // Entrar com Google: só quem é a pessoa (nunca pede Drive, não gasta vaga). Conectar: o escopo do modo dela.
  let escopo = ESCOPOS_ENTRAR;
  let somarConcedidos = true;
  let pedido: ModoDrive | undefined;
  if (modo === "vincular") {
    const atual = await autenticar({ cookie: lerCookie(req, COOKIE_SESSAO) });
    if (!atual) return redirecionar(new URL(comParametro("/entrar", "volta", volta), url.origin));
    // Conectar Drive é função da conta: sem a SOBEDESCE liberada pela Absolute ZRO, não começa.
    if (!atual.liberado) return redirecionar(new URL(paginaDeErro(modo, volta, "zro_sem_acesso"), url.origin));
    usuarioId = atual.usuario.id;
    const p = await pedidoParaConectar(usuarioId);
    ({ escopo, somarConcedidos } = p);
    pedido = p.modo;
  }

  const state = novoState();
  const { verificador, desafio } = pkce();
  const cookie = serializarCookie(COOKIE_OAUTH, selarEstado({ state, verificador, modo, usuarioId, volta, ...(pedido ? { pedido } : {}) }), {
    maxAge: DURACAO_OAUTH_S,
    path: "/api/google",
    secure: cookieSeguro(url.origin),
  });
  return redirecionar(urlDeConsentimento({ state, desafio, origem: retorno.origin, escopo, somarConcedidos }), 302, [cookie]);
}

/** `depois`: onde vai o aviso de entrada nova (a rota usa o `after` do Next; os testes passam o deles). */
export async function callback(req: Request, depois: Depois = depoisDaResposta): Promise<Response> {
  const url = new URL(req.url);
  const seguro = cookieSeguro(origemDoPedido(req.headers, req.url));
  const limpar = serializarCookie(COOKIE_OAUTH, "", { maxAge: 0, path: "/api/google", secure: seguro });
  const ir = (caminho: string, cookies: string[] = []) => redirecionar(new URL(caminho, url.origin), 303, [limpar, ...cookies]);

  const estado = abrirEstado(lerCookie(req, COOKIE_OAUTH));
  if (!estado) {
    // Sem o cookie (venceu, outra aba, outro navegador): não dá para saber o modo.
    const logado = await autenticar({ cookie: lerCookie(req, COOKIE_SESSAO) });
    return ir(logado ? "/conta?erro=google_expirou" : "/entrar?erro=google_expirou");
  }
  const { modo, volta } = estado;
  const falhar = (codigo: string) => ir(paginaDeErro(modo, volta, codigo));

  if (!stateConfere(url.searchParams.get("state"), estado.state)) return falhar("google_expirou");
  const erroGoogle = url.searchParams.get("error");
  if (erroGoogle) return falhar(erroGoogle === "access_denied" ? "google_recusado" : "google_erro");
  const code = url.searchParams.get("code");
  if (!code) return falhar("google_erro");

  let tokens: Tokens;
  let quem: PerfilGoogle;
  try {
    tokens = await trocarCodigo(code, estado.verificador, url.origin);
    quem = await perfil(tokens.acesso);
  } catch {
    return falhar("google_erro");
  }
  // O que veio de fato (a pessoa pode desmarcar a caixinha do Drive na tela do Google).
  const acesso = acessoDoEscopo(tokens.escopo);

  if (modo === "vincular") {
    const atual = await autenticar({ cookie: lerCookie(req, COOKIE_SESSAO) });
    if (!atual || atual.usuario.id !== estado.usuarioId) return ir(comParametro("/entrar", "volta", volta));
    if (!acesso) return falhar("google_sem_drive");
    // `drive` que não foi pedido (escopo trocado na URL do Google) ou de conta Google nova depois da vaga usada: não
    // guarda o token, não dá vaga à pessoa e devolve a concessão ao Google (revisão M1/M2).
    if (acesso === "total" && !(await driveInteiroPermitido(atual.usuario.id, quem.sub, estado.pedido)))
      return falhar(await recusarDriveInteiro(atual.usuario.id, quem.sub, quem.email, tokens.refresh ?? tokens.acesso, revogar));
    if (!tokens.refresh) return falhar("google_erro");
    const r = await vincularConta(atual.usuario.id, quem, { ...tokens, refresh: tokens.refresh });
    // O Google já contou a vaga quando deu o `drive`, gravando ou não aqui.
    await registrarSeTotal(tokens.escopo, quem.sub, quem.email, r.ok ? atual.usuario.id : null);
    if (!r.ok) return falhar(r.erro);
    // Pediu o Drive inteiro e voltou só com drive.file: conectou, mas em Arquivos escolhidos (a tela diz).
    if ((estado.pedido ?? "total") === "total" && acesso === "arquivos") return ir(comParametro(volta, "google", "escolhidos"));
    return ir(comParametro(volta, "google", "ok"));
  }

  // Continuar com Google: o Google de entrar de uma conta entra nela; um Google que só está conectado como Drive
  // não abre a conta (revisão A3); um Google sem conta SOBEDESCE não cria nada: conta nova só pela Absolute ZRO.
  const entrada = await donoDaContaGoogle(quem, tokens);
  if (entrada.tipo === "nao_e_login") return falhar("google_nao_e_login");
  if (entrada.tipo === "nao_vinculada") return falhar("google_sem_conta");
  const usuarioId = entrada.usuarioId;
  const sessao = await criarSessao(usuarioId, "web");
  const o = opcoesCookieSessao(seguro);
  const cookieSessao = serializarCookie(COOKIE_SESSAO, sessao.token, { maxAge: o.maxAge, path: o.path, secure: o.secure });
  // Aparelho que a conta ainda não usou: aviso de entrada nova.
  const aparelho = await conferirAparelho({
    usuarioId,
    cookie: lerCookie(req, COOKIE_APARELHO),
    via: "google",
    entrada: { userAgent: req.headers.get("user-agent"), lugar: lugarDe(req.headers) },
    avisar: true,
    depois,
  });
  const cookies = [cookieSessao];
  if (aparelho) {
    const a = opcoesCookieAparelho(seguro);
    cookies.push(serializarCookie(COOKIE_APARELHO, aparelho, { maxAge: a.maxAge, path: a.path, secure: a.secure }));
  }
  // No celular, quem só entrou (sem pedir outra página) vai direto para o envio.
  const celular = /iPhone|iPad|iPod|Android|Mobile/i.test(req.headers.get("user-agent") ?? "");
  const destino = volta === "/conta" && celular ? "/app/" : destinoDeEntrada(volta);
  return ir(destino, cookies);
}
