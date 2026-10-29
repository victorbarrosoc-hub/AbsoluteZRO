/**
 * Arquivos (plano v2 §5, fases 9–10): o Drive da pessoa pelo SOBEDESCE, dentro do Maestro. Liberado só com o SOBEDESCE
 * no plano (`temProduto(sessao, 'sobedesce')`); sem ele, a aba mostra o cadeado e toda rota responde 403.
 *
 * O navegador lista, busca, mostra miniatura e toca direto do Google com o token curto (`drive.token`), que passa por
 * aqui só para a aba e nunca é guardado. O Maestro guarda só o vínculo projeto → pasta (id e nome) e cria a estrutura
 * padrão do projeto (`drive.pasta.criar`: Maestro/<Cliente>/<Projeto>/01 Briefing … 05 Entregas).
 */
import { sql } from "drizzle-orm";
import { temProduto } from "@/lib/auth/acesso";
import type { Sessao } from "@/lib/auth/sessao";
import { getBanco } from "@/lib/db/client";
import { podeEscrever } from "@/lib/papeis";
import { apiDoGoogle, noSobedesce, PRODUTO_SOBEDESCE, SEM_SOBEDESCE, type Falha, type Resultado } from "./ponte";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_DRIVE = /^[A-Za-z0-9_-]{1,200}$/;

export type ContaDrive = { id: string; email: string };
export type TokenParaAba = { token: string; expiraEm: number; api: string; conta: ContaDrive; contas: ContaDrive[] };

export const temArquivos = (s: Sessao) => temProduto(s, PRODUTO_SOBEDESCE);

/** O token curto do Drive da própria pessoa, para a aba (memória só). */
export async function tokenParaAba(sessao: Sessao, conta?: string | null): Promise<Resultado<TokenParaAba>> {
  if (!temArquivos(sessao)) return SEM_SOBEDESCE();
  const corpo = conta && conta.length <= 64 ? { conta } : {};
  const r = await noSobedesce<{ access_token: string; expira_em: string; conta: ContaDrive; contas: ContaDrive[] }>(sessao, "drive.token", corpo);
  if (!r.ok) return r;
  const exp = Date.parse(r.dados.expira_em);
  if (typeof r.dados.access_token !== "string" || !Number.isFinite(exp))
    return { ok: false, status: 502, erro: "sobedesce", mensagem: "Resposta inesperada do SOBEDESCE." };
  return {
    ok: true,
    dados: { token: r.dados.access_token, expiraEm: exp, api: apiDoGoogle(), conta: r.dados.conta, contas: r.dados.contas ?? [r.dados.conta] },
  };
}

export type ProjetoComPasta = { id: string; codigo: string; titulo: string; cliente: string | null; pasta: { id: string; nome: string } | null };

export async function projetosComPasta(sessao: Sessao): Promise<ProjetoComPasta[]> {
  return getBanco().asUser({ sub: sessao.sub, orgId: sessao.orgId }, async (tx) => {
    const r = (await tx.execute(sql`
      select p.id, p.code as codigo, p.title as titulo, c.name as cliente,
             case when p.drive_folder_id is null then null else jsonb_build_object('id', p.drive_folder_id, 'nome', coalesce(p.drive_folder_nome, 'Pasta do projeto')) end as pasta
        from maestro.projects p left join maestro.clients c on c.id = p.client_id
       where p.deleted_at is null and p.status <> 'archived'
       order by p.updated_at desc limit 200`)) as unknown as ProjetoComPasta[];
    return [...r];
  });
}

const negar = (mensagem: string): Falha => ({ ok: false, status: 403, erro: "sem_permissao", mensagem });

/** Liga (ou desliga, com `null`) uma pasta do Drive a um projeto. Só quem escreve; o banco confere de novo (RLS). */
export async function ligarPasta(sessao: Sessao, projetoId: string, pasta: { id: string; nome: string } | null): Promise<Resultado<null>> {
  if (!temArquivos(sessao)) return SEM_SOBEDESCE();
  if (!podeEscrever(sessao.papel)) return negar("Seu papel nesta organização só lê.");
  if (!UUID.test(projetoId)) return { ok: false, status: 400, erro: "formato", mensagem: "Projeto inválido." };
  const nome = pasta ? pasta.nome.replace(/\s+/g, " ").trim().slice(0, 200) : null;
  if (pasta && (!ID_DRIVE.test(pasta.id) || !nome)) return { ok: false, status: 400, erro: "formato", mensagem: "Pasta inválida." };
  const r = await getBanco().asUser({ sub: sessao.sub, orgId: sessao.orgId }, (tx) =>
    tx.execute(
      sql`update maestro.projects set drive_folder_id = ${pasta?.id ?? null}, drive_folder_nome = ${nome} where id = ${projetoId}::uuid and deleted_at is null returning id`,
    ),
  );
  return r.length ? { ok: true, dados: null } : { ok: false, status: 404, erro: "nao_existe", mensagem: "Esse projeto não existe mais." };
}

/** "Estrutura por projeto": cria (ou acha) Maestro/<Cliente>/<Projeto>/{01 … 05} no Drive e liga a pasta ao projeto. */
export async function criarEstrutura(
  sessao: Sessao,
  projetoId: string,
  conta?: string | null,
): Promise<Resultado<{ pasta: { id: string; nome: string }; criadas: number }>> {
  if (!temArquivos(sessao)) return SEM_SOBEDESCE();
  if (!podeEscrever(sessao.papel)) return negar("Seu papel nesta organização só lê.");
  if (!UUID.test(projetoId)) return { ok: false, status: 400, erro: "formato", mensagem: "Projeto inválido." };
  const [p] = await getBanco().asUser(
    { sub: sessao.sub, orgId: sessao.orgId },
    async (tx) =>
      (await tx.execute(sql`
      select p.code as codigo, p.title as titulo, coalesce(c.name, 'Sem cliente') as cliente
        from maestro.projects p left join maestro.clients c on c.id = p.client_id
       where p.id = ${projetoId}::uuid and p.deleted_at is null`)) as unknown as { codigo: string; titulo: string; cliente: string }[],
  );
  if (!p) return { ok: false, status: 404, erro: "nao_existe", mensagem: "Esse projeto não existe mais." };
  const r = await noSobedesce<{ pasta: { id: string; nome: string }; criadas: number }>(sessao, "drive.pasta.criar", {
    cliente: p.cliente,
    projeto: `${p.codigo} ${p.titulo}`,
    ...(conta ? { conta } : {}),
  });
  if (!r.ok) return r;
  const l = await ligarPasta(sessao, projetoId, { id: r.dados.pasta.id, nome: r.dados.pasta.nome });
  if (!l.ok) return l;
  return { ok: true, dados: { pasta: r.dados.pasta, criadas: r.dados.criadas } };
}
