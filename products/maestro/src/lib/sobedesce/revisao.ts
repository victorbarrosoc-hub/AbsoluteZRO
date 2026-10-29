/**
 * Drive pelo SOBEDESCE na revisão (plano v2 §4.1, fase 8; decisão do titular de 28/10/2026): enquanto o link do cliente
 * vale, o arquivo do Drive de cada versão fica como "qualquer pessoa com o link" (o cliente toca pela URL pública de
 * mídia com a chave de API do Maestro, ou pelo iframe do Drive sem ela). Ao revogar, fechar ou vencer, volta ao que era.
 *
 * - Gerar o link (e versão nova num card com link ativo) → `drive.compartilhar_revisao` como a pessoa; o que mudou fica
 *   em `versoes.compartilhamento` (`maestro.versao_compartilhamento`): `{ permissao_id, ja_publico, sub, em }`.
 *   Arquivo que já era público: nada é mudado e nada é desfeito depois (`ja_publico`).
 * - Revogar ou fechar → `drive.recolher_revisao` para as versões que nenhum outro link ativo cobre; quem ligou é quem
 *   desliga (é o Drive dele): se é a própria pessoa, pelo token da sessão; se é outra, pela credencial do Maestro
 *   (`recolherSemPessoa`). Marca `recolhido_em`.
 * - Vencer (ninguém clicou em nada) → `varrerCompartilhamentos()`, chamado pelo agendamento (`/api/cron/revisao`).
 * Sem o SOBEDESCE no plano, compartilhar não acontece (o link do cliente segue como antes); desfazer acontece sempre.
 * Falha do Drive nunca impede o link de ser gerado ou revogado: fica registrada e o agendamento tenta de novo.
 */
import { sql } from "drizzle-orm";
import { temProduto } from "@/lib/auth/acesso";
import type { Sessao } from "@/lib/auth/sessao";
import { getBanco, type Tx } from "@/lib/db/client";
import { noSobedesce, PRODUTO_SOBEDESCE, recolherSemPessoa } from "./ponte";

export type Compartilhamento = {
  permissao_id: string | null;
  ja_publico: boolean;
  sub: string;
  em: string;
  recolhido_em?: string;
  erro?: string;
};

type Alvo = { id: string; drive: string; compartilhamento: Compartilhamento | null };

const COBERTA = sql`exists (
  select 1 from maestro.lote_cards lc
    join maestro.lotes l on l.id = lc.lote_id and l.status = 'enviado' and l.deleted_at is null
    join maestro.approval_links a on a.lote_id = l.id and a.kind = 'lote' and a.revoked_at is null and a.expires_at > now()
   where lc.org_id = v.org_id and lc.card_id = v.card_id)`;

const ativo = (c: Compartilhamento | null) => !!c && !!c.permissao_id && !c.recolhido_em;

async function gravar(sessao: Sessao, versaoId: string, c: Compartilhamento) {
  await getBanco().asUser({ sub: sessao.sub, orgId: sessao.orgId }, (tx) =>
    tx.execute(sql`select maestro.versao_compartilhamento(${versaoId}::uuid, ${JSON.stringify(c)}::jsonb)`),
  );
}

async function compartilharAlvos(sessao: Sessao, alvos: Alvo[]): Promise<{ ligados: number; falhas: number }> {
  let ligados = 0;
  let falhas = 0;
  for (const v of alvos) {
    if (ativo(v.compartilhamento) || v.compartilhamento?.ja_publico) continue;
    const r = await noSobedesce<{ permissao_id: string | null; ja_publico: boolean }>(sessao, "drive.compartilhar_revisao", { arquivoId: v.drive });
    const em = new Date().toISOString();
    if (r.ok) {
      ligados++;
      await gravar(sessao, v.id, { permissao_id: r.dados.permissao_id, ja_publico: r.dados.ja_publico, sub: sessao.sub, em });
    } else {
      falhas++;
      await gravar(sessao, v.id, { permissao_id: null, ja_publico: false, sub: sessao.sub, em, erro: r.erro.slice(0, 60) });
    }
  }
  return { ligados, falhas };
}

/** Ao gerar o link do lote: as versões do Drive dos cards do lote. */
export async function compartilharLote(sessao: Sessao, loteId: string) {
  if (!temProduto(sessao, PRODUTO_SOBEDESCE)) return { ligados: 0, falhas: 0, pulado: true };
  const alvos = await getBanco().asUser(
    { sub: sessao.sub, orgId: sessao.orgId },
    async (tx) =>
      (await tx.execute(sql`
      select v.id, v.drive_file_id as drive, v.compartilhamento from maestro.versoes v
       where v.fonte = 'drive' and v.drive_file_id is not null and v.drive_resource_key is null and v.apagado_em is null
         and v.card_id in (select lc.card_id from maestro.lote_cards lc where lc.lote_id = ${loteId}::uuid)`)) as unknown as Alvo[],
  );
  return { ...(await compartilharAlvos(sessao, [...alvos])), pulado: false };
}

/** Versão nova num card que já está com o cliente (link ativo): compartilha também. */
export async function compartilharVersaoSeComLink(sessao: Sessao, cardId: string) {
  if (!temProduto(sessao, PRODUTO_SOBEDESCE)) return { ligados: 0, falhas: 0, pulado: true };
  const alvos = await getBanco().asUser(
    { sub: sessao.sub, orgId: sessao.orgId },
    async (tx) =>
      (await tx.execute(sql`
      select v.id, v.drive_file_id as drive, v.compartilhamento from maestro.versoes v
       where v.card_id = ${cardId} and v.fonte = 'drive' and v.drive_file_id is not null and v.drive_resource_key is null
         and v.apagado_em is null and ${COBERTA}`)) as unknown as Alvo[],
  );
  return { ...(await compartilharAlvos(sessao, [...alvos])), pulado: false };
}

type ParaRecolher = { id: string; org: string; drive: string; compartilhamento: Compartilhamento };

async function recolher(v: ParaRecolher, sessao: Sessao | null): Promise<boolean> {
  const c = v.compartilhamento;
  const r =
    sessao && sessao.sub === c.sub
      ? await noSobedesce<{ recolhido: true }>(sessao, "drive.recolher_revisao", { arquivoId: v.drive, permissaoId: c.permissao_id })
      : await recolherSemPessoa(c.sub, v.drive, c.permissao_id!);
  // 400 = a permissão não é mais a "qualquer pessoa" que o Maestro criou: não há o que desfazer.
  const feito = r.ok || r.status === 400;
  const novo: Compartilhamento = feito ? { ...c, recolhido_em: new Date().toISOString(), erro: undefined } : { ...c, erro: r.erro.slice(0, 60) };
  await getBanco().asSystem("revisão: recolher compartilhamento", (tx: Tx) =>
    tx.execute(sql`update maestro.versoes set compartilhamento = ${JSON.stringify(novo)}::jsonb where id = ${v.id}::uuid and org_id = ${v.org}::uuid`),
  );
  return feito;
}

/** Ao revogar o link ou fechar o lote: desfaz nas versões que nenhum outro link ativo cobre. */
export async function recolherLote(sessao: Sessao, loteId: string): Promise<{ recolhidos: number; falhas: number }> {
  const alvos = await getBanco().asUser(
    { sub: sessao.sub, orgId: sessao.orgId },
    async (tx) =>
      (await tx.execute(sql`
      select v.id, v.org_id as org, v.drive_file_id as drive, v.compartilhamento from maestro.versoes v
       where v.fonte = 'drive' and v.compartilhamento ->> 'permissao_id' is not null and v.compartilhamento ->> 'recolhido_em' is null
         and v.card_id in (select lc.card_id from maestro.lote_cards lc where lc.lote_id = ${loteId}::uuid)
         and not ${COBERTA}`)) as unknown as ParaRecolher[],
  );
  let recolhidos = 0;
  let falhas = 0;
  for (const v of alvos) {
    if (await recolher(v, sessao)) recolhidos++;
    else falhas++;
  }
  return { recolhidos, falhas };
}

/**
 * O agendamento: em todas as organizações, as versões ainda públicas cujo link venceu, foi revogado ou cujo lote fechou
 * (nenhum link ativo cobre o card). Também tenta de novo as que falharam antes. Sem a pessoa: credencial do Maestro.
 */
export async function varrerCompartilhamentos(limite = 200): Promise<{ recolhidos: number; falhas: number }> {
  const alvos = await getBanco().asSystem(
    "revisão: varrer compartilhamentos",
    async (tx: Tx) =>
      (await tx.execute(sql`
      select v.id, v.org_id as org, v.drive_file_id as drive, v.compartilhamento from maestro.versoes v
       where v.fonte = 'drive' and v.compartilhamento ->> 'permissao_id' is not null and v.compartilhamento ->> 'recolhido_em' is null
         and not ${COBERTA}
       order by (v.compartilhamento ->> 'em') limit ${limite}`)) as unknown as ParaRecolher[],
  );
  let recolhidos = 0;
  let falhas = 0;
  for (const v of alvos) {
    if (await recolher(v, null)) recolhidos++;
    else falhas++;
  }
  return { recolhidos, falhas };
}
