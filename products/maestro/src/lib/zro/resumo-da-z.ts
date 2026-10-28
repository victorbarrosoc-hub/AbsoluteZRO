/**
 * O dia da produtora para a Z (só leitura): `POST /api/zro/maestro/resumo`, chamado pelo HUB servidor a servidor com o
 * pedido assinado (ação `maestro.resumo`, src/lib/zro/pedido.ts). Contrato em
 * docs/integration-contracts/maestro-z.md. **Pronto e desligado**: o HUB ainda não tem a ferramenta da Z que chama
 * aqui (estudo MakersHub §4.5, "Z com os números do Maestro", espera a decisão do titular sobre cota e plano).
 *
 * A pessoa é a do pedido (`sub`); a organização é a do último login dela no Maestro, e só vale se esse login tinha
 * acesso (o mesmo temAcesso()) e ela segue ativa. Tudo é lido como ela (`asUser`: RLS, papel, acesso por cliente):
 * o dinheiro só para administração e gestão. Cada bloco vem com a fonte e a hora; nada é inventado nem guardado.
 */
import { sql } from "drizzle-orm";
import { getBanco } from "@/lib/db/client";
import { temAcesso } from "@/lib/auth/acesso";
import { dentroDoLimite, registrarTentativa } from "@/lib/auth/limite";
import { erro, json } from "@/lib/http";
import { hojeBr } from "@/lib/dinheiro";
import { resumoDoDia } from "@/lib/hoje";
import { metaDoMes } from "@/lib/numeros/servidor";
import { podeVerDinheiro, type Papel } from "@/lib/papeis";
import { siteUrl } from "@/lib/site";
import { zroConfigurado } from "./config";
import { conferirPedidoZro, PedidoRecusado } from "./pedido";

export const ACAO_RESUMO = "maestro.resumo";
const LIMITE = { max: 30, janelaMs: 10 * 60_000 };

type Dono = { org: string; nome: string; papel: Papel; produtos: string[]; release: Record<string, string> | null };

async function donoDoPedido(sub: string): Promise<Dono | null> {
  return getBanco().asSystem("pedido da Z: achar a organização", async (tx) => {
    const [r] = (await tx.execute(sql`
      select s.org_id as org, o.name as nome, m.role as papel, s.produtos, s.zro_release as release
        from maestro.sessions s
        join maestro.members m on m.org_id = s.org_id and m.zro_sub = s.zro_sub and m.status = 'active'
        join maestro.organizations o on o.id = s.org_id
       where s.zro_sub = ${sub}::uuid
       order by s.created_at desc limit 1`)) as unknown as Dono[];
    return r ?? null;
  });
}

export type ResumoDaZ = {
  fonte: string;
  organizacao: string;
  gerado_em: string;
  hoje: string;
  link: string;
  retornar_hoje: { nome: string; tipo: "pedido" | "cliente"; data: string; nota: string | null }[];
  vencendo: { card: string; cliente: string | null; prazo: string | null }[];
  com_o_cliente: { card: string; cliente: string | null; desde: string | null }[];
  contagens: { pedidos_novos: number; orcamentos_aguardando: number; agenda_hoje: number; cards_atrasados: number };
  dinheiro: null | {
    meta_do_mes: number | null;
    faturado_no_mes: number | null;
    caixa: number;
    receber_semana: number;
    pagar_semana: number;
    moeda: "BRL centavos";
  };
};

export async function resumoParaZ(sub: string, hoje = hojeBr()): Promise<ResumoDaZ | null> {
  const dono = await donoDoPedido(sub);
  if (!dono || !temAcesso({ produtos: dono.produtos ?? [], release: dono.release })) return null;
  const ctx = { sub, orgId: dono.org };
  const dinheiro = podeVerDinheiro(dono.papel);
  const [r, meta] = await Promise.all([resumoDoDia(ctx, dinheiro, hoje), dinheiro ? metaDoMes(ctx, hoje.slice(0, 7)) : null]);
  return {
    fonte: "Maestro",
    organizacao: dono.nome,
    gerado_em: new Date().toISOString(),
    hoje,
    link: `${siteUrl()}/app/hoje`,
    retornar_hoje: r.retornos.map((x) => ({ nome: x.nome, tipo: x.alvo, data: x.data, nota: x.nota })),
    vencendo: r.vencendo.map((k) => ({ card: k.tema, cliente: k.cliente, prazo: k.prazo })),
    com_o_cliente: r.comCliente.map((k) => ({ card: k.tema, cliente: k.cliente, desde: k.desde })),
    contagens: {
      pedidos_novos: r.pedidosNovos,
      orcamentos_aguardando: r.orcamentos.aguardando,
      agenda_hoje: r.agenda.hoje.length,
      cards_atrasados: r.cards.atrasados,
    },
    dinheiro: r.dinheiro
      ? {
          meta_do_mes: meta?.meta ?? null,
          faturado_no_mes: meta?.faturado ?? null,
          caixa: r.dinheiro.caixa,
          receber_semana: r.dinheiro.receberSemana.valor + r.dinheiro.receberAtrasado.valor,
          pagar_semana: r.dinheiro.pagarSemana.valor + r.dinheiro.pagarAtrasado.valor,
          moeda: "BRL centavos",
        }
      : null,
  };
}

/** A rota: confere o pedido do HUB, o limite por pessoa e devolve o resumo (404 se a pessoa não usa o Maestro). */
export async function rotaResumoDaZ(req: Request): Promise<Response> {
  if (!zroConfigurado()) return erro(503, "sem_config", "A Absolute ZRO não está configurada neste Maestro.");
  let sub: string;
  try {
    sub = (await conferirPedidoZro(req.headers.get("authorization"), ACAO_RESUMO)).sub;
  } catch (e) {
    if (e instanceof PedidoRecusado)
      return erro(401, "nao_autorizado", "Pedido sem autorização válida da Absolute ZRO.", { "WWW-Authenticate": 'Bearer error="invalid_token"' });
    return erro(502, "zro_indisponivel", "Não deu para conferir o pedido com a Absolute ZRO agora.");
  }
  if (!/^[0-9a-f-]{36}$/i.test(sub)) return erro(404, "sem_vinculo", "Esta conta não usa o Maestro.");
  const chave = `resumo-z:${sub}`;
  if (!(await dentroDoLimite(chave, LIMITE))) return erro(429, "devagar", "Muitas leituras seguidas. Tente de novo em instantes.", { "Retry-After": "120" });
  await registrarTentativa(chave);
  const r = await resumoParaZ(sub);
  if (!r) return erro(404, "sem_vinculo", `Esta conta ainda não usa o Maestro (ou está sem acesso). Entre em ${siteUrl()}.`);
  return json(r);
}
