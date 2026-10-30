"use server";
/** Acesso por cliente (Ajustes → Pessoas): sessão e papel aqui; o banco confere de novo (só admin e gestão). */
import { revalidatePath } from "next/cache";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { podeRemover } from "@/lib/papeis";
import { listarPessoas, salvarAcesso, salvarFuncaoNaProdutora } from "@/lib/pessoas";
import { AREAS, PADRAO, podeMudarAcessos } from "@/lib/acessos";
import { salvarAreas } from "@/lib/acessos-servidor";
import { buscarPessoas, convidarPessoa, PAPEL_DO_CONVITE, type PapelConvite, type PessoaZro } from "@/lib/zro/pessoas";
import type { EstadoForm } from "@/components/form";

export async function salvarAcessoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeRemover(s.papel)) return { mensagem: "Só administração e gestão mudam o acesso." };
  const restrito = fd.get("alcance") === "alguns";
  const clientes = fd.getAll("cliente").map(String);
  const r = await salvarAcesso({ sub: s.sub, orgId: s.orgId }, String(fd.get("sub") ?? ""), restrito, clientes);
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app", "layout");
  return { aviso: restrito ? `Vê ${clientes.length === 1 ? "1 cliente" : `${clientes.length} clientes`}.` : "Vê todos os clientes.", n: Date.now() };
}

/**
 * O que cada pessoa vê (áreas sensíveis, src/lib/acessos.ts): só a administração muda; o banco confere de novo
 * (políticas `acessos_*`) e a mudança vai para a auditoria. `padrao=1` volta ao padrão do papel.
 */
export async function salvarAreasAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeMudarAcessos(s.papel)) return { mensagem: "Só a administração muda o acesso." };
  const sub = String(fd.get("sub") ?? "");
  let ligadas = fd.getAll("area").map(String);
  if (fd.get("padrao") === "1") {
    const [m] = (await listarPessoas({ sub: s.sub, orgId: s.orgId })).filter((p) => p.sub === sub);
    if (!m) return { mensagem: "Pessoa não encontrada." };
    ligadas = AREAS.filter((a) => PADRAO[m.papel][a]);
  }
  const r = await salvarAreas({ sub: s.sub, orgId: s.orgId }, sub, ligadas);
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app", "layout");
  // `valores.areas`: o que ficou valendo (a tela acerta os interruptores pelo que o banco gravou).
  return {
    aviso: fd.get("padrao") === "1" ? "Voltou ao padrão." : "Acesso salvo.",
    valores: { areas: AREAS.filter((a) => r.acessos[a]).join(",") },
    n: Date.now(),
  };
}

/* ───────────── pessoas da Absolute ZRO (ADR 0029 do HUB) ───────────── */

export type ResultadoBuscaZro = { pessoas: PessoaZro[]; erro?: string; reconectar?: boolean };

/** Busca por @ ou nome na Absolute ZRO (só perfis visíveis; nenhum e-mail volta). */
export async function buscarNaZroAcao(q: string): Promise<ResultadoBuscaZro> {
  const s = await exigirAcessoNaAcao();
  const r = await buscarPessoas(s.id, q);
  if (!r.ok) return { pessoas: [], erro: r.mensagem, reconectar: r.estado === "reconectar_zro" };
  return { pessoas: r.pessoas.filter((p) => p.id !== s.sub) };
}

/** Convida o @ para a organização na Absolute ZRO; quem convida é a administração (o HUB confere o papel de novo). */
export async function convidarNaZroAcao(arroba: string, papel: string): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (s.papel !== "admin") return { mensagem: "Só a administração convida pessoas." };
  if (!(papel in PAPEL_DO_CONVITE)) return { mensagem: "Papel inválido." };
  const r = await convidarPessoa(s.id, arroba, papel as PapelConvite);
  if (!r.ok) return { mensagem: r.mensagem };
  return { aviso: `Convite enviado. @${r.arroba} aceita na Absolute ZRO.`, n: Date.now() };
}

/** Função na produtora (descrição; não muda o acesso). Só administração; o banco confere. */
export async function salvarFuncaoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (s.papel !== "admin") return { mensagem: "Só administração define a função na produtora." };
  const r = await salvarFuncaoNaProdutora({ sub: s.sub, orgId: s.orgId }, String(fd.get("sub") ?? ""), String(fd.get("funcao") ?? ""));
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app/ajustes/pessoas");
  return { aviso: "Salvo.", n: Date.now() };
}
