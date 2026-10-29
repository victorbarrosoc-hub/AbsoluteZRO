"use server";
/** Ações da Criação: sessão e papel aqui (`permissoes.ts`); o banco confere de novo (RLS e gatilhos da 0030). */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { podeEditarCriacao } from "@/lib/criacao/permissoes";
import { ehModeloRoteiro, FICHAS_MODELOS } from "@/lib/criacao/roteiro/modelos";
import { abrirDocumentoAntigo, criarRoteiro } from "@/lib/criacao/roteiro/servidor";
import type { EstadoForm } from "@/components/form";

const SO_LE = "Seu papel nesta organização só lê.";
const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** "Novo roteiro": modelo, título, vínculo opcional e a vista de começo ("Técnico ou Literário primeiro?"). */
export async function criarRoteiroAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeEditarCriacao(s.papel)) return { mensagem: SO_LE };
  const modelo = texto(fd, "modelo");
  if (!ehModeloRoteiro(modelo)) return { mensagem: "Escolha um modelo." };
  const r = await criarRoteiro(
    { sub: s.sub, orgId: s.orgId },
    {
      titulo: texto(fd, "titulo") || (modelo === "branco" ? "Roteiro" : FICHAS_MODELOS.find((f) => f.k === modelo)!.nome),
      modelo,
      projetoId: texto(fd, "projeto") || null,
      cardId: texto(fd, "card") || null,
    },
  );
  if (!r.ok) return { mensagem: r.mensagem, erros: r.erro === "titulo" ? { titulo: r.mensagem } : undefined };
  revalidatePath("/app/criacao");
  const vista = texto(fd, "vista") === "tecnico" ? "tecnico" : "literario";
  redirect(`/app/criacao/roteiros/${r.id}?vista=${vista}`);
}

/** "Abrir no editor novo" no roteiro ou na decupagem antiga do projeto (o documento antigo fica como está). */
export async function abrirNoEditorNovoAcao(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await exigirAcessoNaAcao();
  if (!podeEditarCriacao(s.papel)) return { mensagem: SO_LE };
  const r = await abrirDocumentoAntigo({ sub: s.sub, orgId: s.orgId }, texto(fd, "documento"));
  if (!r.ok) return { mensagem: r.mensagem };
  revalidatePath("/app/criacao");
  redirect(`/app/criacao/roteiros/${r.id}?vista=${texto(fd, "tipo") === "decupagem" ? "tecnico" : "literario"}`);
}
