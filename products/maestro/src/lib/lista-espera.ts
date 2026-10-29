/**
 * "Quero acesso" da página inicial (decisão do titular, 28/10/2026): o e-mail entra na lista de espera do Maestro, com
 * consentimento. A liberação continua manual, pela lista de acesso do HUB; aqui só se guarda o pedido.
 *
 * Defesas, nesta ordem: armadilha (campo escondido que gente não preenche: finge que deu certo e não grava nada),
 * validação, limite de tentativas (5 por hora por IP e um teto geral) e a porta estreita do banco: a transação assume
 * `maestro_app`, que só pode executar maestro.lista_espera_entrar() (drizzle/0004), sem ler a tabela. O mesmo e-mail
 * de novo responde igual (não conta a ninguém quem já está na lista). O IP nunca é guardado em claro.
 * Sem "server-only": os testes chamam direto.
 */
import { sql } from "drizzle-orm";
import { getBanco } from "@/lib/db/client";
import { PAPEL_APP } from "@/lib/db/config";
import { hashComChave } from "@/lib/auth/cripto";
import { dentroDoLimite, MENSAGEM_LIMITE, registrarTentativa, REGRAS } from "@/lib/auth/limite";

export type PedidoEspera = {
  email: string;
  nome?: string | null;
  consentimento: boolean;
  /** O campo-armadilha do formulário (escondido de gente). */
  armadilha?: string | null;
  ip: string;
};

export type ResultadoEspera =
  | { ok: true; /** só para testes e log: a tela responde igual nos dois casos */ novo: boolean }
  | { ok: false; erros?: { email?: string; consentimento?: string }; mensagem?: string };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizarEmail(v: string): string {
  return v.trim().toLowerCase();
}

export function validarPedido(p: Pick<PedidoEspera, "email" | "consentimento">): { email?: string; consentimento?: string } | null {
  const erros: { email?: string; consentimento?: string } = {};
  const email = normalizarEmail(p.email ?? "");
  if (!email) erros.email = "Escreva seu e-mail.";
  else if (email.length > 254 || !EMAIL.test(email)) erros.email = "Confira o e-mail.";
  if (p.consentimento !== true) erros.consentimento = "Marque para a gente poder escrever para você.";
  return Object.keys(erros).length ? erros : null;
}

export async function entrarNaListaDeEspera(p: PedidoEspera): Promise<ResultadoEspera> {
  if (p.armadilha && p.armadilha.trim()) return { ok: true, novo: false };
  const erros = validarPedido(p);
  if (erros) return { ok: false, erros };

  const ipHash = hashComChave(p.ip || "desconhecido", "lista-espera:ip");
  const chaveIp = `espera:${ipHash}`;
  const [porIp, geral] = await Promise.all([dentroDoLimite(chaveIp, REGRAS.esperaIp), dentroDoLimite("espera", REGRAS.esperaGeral)]);
  if (!porIp || !geral) return { ok: false, mensagem: MENSAGEM_LIMITE };
  await registrarTentativa(chaveIp, "espera");

  const nome = (p.nome ?? "").trim().slice(0, 80) || null;
  const novo = await getBanco().asSystem("lista de espera (porta estreita)", async (tx) => {
    await tx.execute(sql.raw(`set local role ${PAPEL_APP}`));
    const linhas = await tx.execute<{ novo: boolean }>(
      sql`select maestro.lista_espera_entrar(${normalizarEmail(p.email)}, ${nome}, ${true}, ${ipHash}) as novo`,
    );
    return Boolean(linhas[0]?.novo);
  });
  return { ok: true, novo };
}
