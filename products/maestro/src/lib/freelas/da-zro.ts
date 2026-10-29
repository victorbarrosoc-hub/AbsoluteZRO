/**
 * Freela achado pelo @ na Absolute ZRO (ADR 0029 do HUB, drizzle/0022): entra no banco de freelas já ligado ao perfil
 * dele (`zro_sub` + `zro_arroba`), com nome, cidade e funções do perfil. Uma conta por organização: adicionar de novo só
 * atualiza o @. Contato (e-mail, WhatsApp) nunca vem do perfil: a produtora pede à pessoa. Quando a sincronia do Carro
 * do Freela ligar (CARRO_SYNC_ATIVO, desligada), o inventário chega pelo mesmo `zro_sub`. Sem "server-only".
 */
import { sql } from "drizzle-orm";
import { getBanco, type Contexto } from "@/lib/db/client";
import { falha, traduzirPg, type Res } from "@/lib/crm/comum";
import type { PessoaZro } from "@/lib/zro/pessoas";
import { normalizarFuncao } from "./funcoes";

/** Funções do perfil da Absolute ZRO → funções do banco de freelas. "Outra" vira o texto da pessoa. */
const MAPA: Record<string, string> = {
  direcao: "Direção",
  producao: "producao",
  camera: "captacao-camera",
  edicao: "edicao",
  color: "color",
  som: "som",
  drone: "drone",
  fotografia: "foto",
  motion: "motion",
  roteiro: "roteiro",
};

export function funcoesDoPerfil(funcoes: { chave: string; nome: string }[]): string[] {
  const out = funcoes
    .map((f) => (f.chave === "outra" ? normalizarFuncao(f.nome) : MAPA[f.chave] ? normalizarFuncao(MAPA[f.chave]) : null))
    .filter((f): f is string => !!f);
  return [...new Set(out)].slice(0, 20);
}

export async function adicionarFreelaDaZro(ctx: Contexto, p: PessoaZro): Promise<Res<{ id: string; novo: boolean }>> {
  const funcoes = funcoesDoPerfil(p.funcoes);
  const arr = `{${funcoes.map((x) => `"${x.replace(/["\\]/g, "")}"`).join(",")}}`;
  try {
    return await getBanco().asUser(ctx, async (tx) => {
      const [ja] = (await tx.execute(sql`select id from maestro.freelas where zro_sub = ${p.id}::uuid`)) as unknown as { id: string }[];
      if (ja) {
        const r = await tx.execute(sql`update maestro.freelas set zro_arroba = ${p.arroba} where id = ${ja.id} returning id`);
        if (!r.length) return falha("sem_permissao", "Seu papel nesta organização só lê.");
        return { ok: true as const, id: ja.id, novo: false };
      }
      const [r] = (await tx.execute(sql`
        insert into maestro.freelas (org_id, nome, cidade, funcoes, zro_sub, zro_arroba)
        values (${ctx.orgId}, ${p.nome.slice(0, 120)}, ${p.cidade?.slice(0, 120) ?? null}, ${arr}::text[], ${p.id}::uuid, ${p.arroba})
        returning id`)) as unknown as { id: string }[];
      await tx.execute(sql`
        insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
        values (${ctx.orgId}, ${ctx.sub}, 'freela.da_zro', 'freela', ${r.id}, ${JSON.stringify({ arroba: p.arroba })}::jsonb)`);
      return { ok: true as const, id: r.id, novo: true };
    });
  } catch (e) {
    return traduzirPg(e);
  }
}
