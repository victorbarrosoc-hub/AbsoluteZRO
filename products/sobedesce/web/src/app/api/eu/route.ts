import { aprenderAparelho, COOKIE_APARELHO, opcoesCookieAparelho } from "@/lib/auth/aparelho";
import { semAcesso, usuarioDaRequisicao, SEM_SESSAO } from "@/lib/auth/requisicao";
import { listarContas } from "@/lib/google/contas";
import { json, lerCookie, origemDoPedido, serializarCookie } from "@/lib/http";
import { recursosDe } from "@/lib/recursos";
import { cookieSeguro } from "@/lib/site";
import { caminhoLigarZro, precisaLigarZro } from "@/lib/zro/ligar";

/** Quem sou eu, quais Drives tenho e quais recursos a conta usa (cookie do site ou Bearer do computador). */
export async function GET(req: Request) {
  const atual = await usuarioDaRequisicao(req);
  if (!atual) {
    // O app do celular pergunta como visitante (?visitante=1, lib/auth.js): sem sessão é a resposta normal, não erro, e
    // um 401 a cada abertura só sujava o console. Sem o parâmetro (o app do computador, apps de antes), 401 de sempre.
    if (new URL(req.url).searchParams.get("visitante") === "1") return json({ entrou: false }, 200);
    return SEM_SESSAO();
  }
  // Conta ligada à Absolute ZRO sem a SOBEDESCE liberada: 403 sem_acesso_zro (o app mostra o aviso; a sessão fica).
  const bloqueio = semAcesso(atual);
  if (bloqueio) return bloqueio;
  const [contas, recursos, aparelho] = await Promise.all([
    listarContas(atual.usuario.id),
    recursosDe(atual.usuario),
    // Navegador com a sessão já aberta (o app do celular chama aqui ao abrir): a conta aprende o aparelho sem
    // aviso, para um login futuro dele não virar "entrada nova" (lib/auth/aparelho.ts).
    atual.via === "cookie" ? aprenderAparelho(atual.usuario.id, lerCookie(req, COOKIE_APARELHO)) : null,
  ]);
  let extras: HeadersInit | undefined;
  if (aparelho) {
    const o = opcoesCookieAparelho(cookieSeguro(origemDoPedido(req.headers, req.url)));
    extras = { "Set-Cookie": serializarCookie(COOKIE_APARELHO, aparelho, { maxAge: o.maxAge, path: o.path, secure: o.secure }) };
  }
  // Conta antiga sem vínculo com a Absolute ZRO (lib/zro/ligar.ts): os apps mostram uma vez a tela de ligar. Só avisa,
  // nunca bloqueia. `ligar`: o caminho do vincular de sempre (o app do computador abre no navegador do sistema).
  const zro = { ligada: atual.ligadoZro, pedir: precisaLigarZro(atual), ligar: caminhoLigarZro("/conta") };
  // `usuario` é a conta da pessoa (a Absolute ZRO, como o Apple ID): nome e foto do "você" no topo dos apps. A foto do
  // Google fica em `contas` (o Drive conectado), nunca aqui.
  const usuario = { ...atual.usuario, fotoUrl: atual.fotoZro };
  return json({ usuario, contas, recursos, zro }, 200, extras);
}
