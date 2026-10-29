"use server";
/**
 * Ações de Arquivos: sessão e acesso conferidos aqui; SOBEDESCE no plano e papel de escrita em lib/sobedesce/arquivos.ts
 * (o banco confere de novo pelo RLS). Nada de byte de arquivo: só o vínculo projeto → pasta e a estrutura no Drive.
 */
import { revalidatePath } from "next/cache";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { criarEstrutura, ligarPasta } from "@/lib/sobedesce/arquivos";

export type RespostaArquivos = { ok: true; pasta?: { id: string; nome: string }; criadas?: number } | { ok: false; erro: string; mensagem: string };

export async function criarEstruturaAcao(projetoId: string, conta: string | null): Promise<RespostaArquivos> {
  const s = await exigirAcessoNaAcao();
  const r = await criarEstrutura(s, projetoId, conta);
  if (!r.ok) return { ok: false, erro: r.erro, mensagem: r.mensagem };
  revalidatePath("/app/arquivos");
  return { ok: true, pasta: r.dados.pasta, criadas: r.dados.criadas };
}

export async function ligarPastaAcao(projetoId: string, pasta: { id: string; nome: string } | null): Promise<RespostaArquivos> {
  const s = await exigirAcessoNaAcao();
  const r = await ligarPasta(s, projetoId, pasta);
  if (!r.ok) return { ok: false, erro: r.erro, mensagem: r.mensagem };
  revalidatePath("/app/arquivos");
  return { ok: true };
}
