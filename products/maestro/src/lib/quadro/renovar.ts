"use server";
/**
 * O Quadro grava por /api/quadro (não por Server Action), então o cache do roteador do navegador (staleTimes em
 * next.config.ts) não sabe que algo mudou. Depois de gravar, o Quadro chama esta ação: ela só manda o navegador
 * esquecer as seções guardadas (Hoje, Projetos…), para a próxima troca trazer os números novos. Não lê nem devolve dado.
 */
import { revalidatePath } from "next/cache";

export async function renovarSecoes(): Promise<void> {
  revalidatePath("/app", "layout");
}
