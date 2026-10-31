/**
 * Tipos de vídeo da produtora (drizzle/0038, `maestro.tipos_video`): a lista que diz quanto tempo cada categoria leva.
 * Puro. A cor é da paleta fechada das colunas (`CORES_COLUNA`, `--cor-*`, `data-cor`): o nome do tipo vai sempre
 * escrito ao lado (a cor nunca carrega a identidade sozinha).
 */
import { ehCorColuna, type CorColuna } from "@/lib/quadro/colunas";

export type TipoVideo = { id: string; nome: string; cor: CorColuna; ordem: number; arquivado: boolean };

/** Os de fábrica (iguais a `maestro.tipos_video_padrao_lista()`; o teste confere). */
export const TIPOS_PADRAO: { nome: string; cor: CorColuna }[] = [
  { nome: "Reels", cor: "rosa" },
  { nome: "YouTube longo", cor: "laranja" },
  { nome: "Institucional", cor: "turquesa" },
  { nome: "Casamento", cor: "latao" },
  { nome: "Motion", cor: "ameixa" },
  { nome: "Corte de podcast", cor: "verde" },
];

export const LIMITE_NOME_TIPO = 40;
export const MAX_TIPOS = 40;

/** Nome do tipo: espaços juntados, 1–40. undefined = inválido. */
export function nomeDoTipo(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return s.length >= 1 && s.length <= LIMITE_NOME_TIPO ? s : undefined;
}

export const corDoTipo = (v: unknown): CorColuna | undefined => (ehCorColuna(v) ? v : undefined);

/** Os vivos na ordem; o arquivado só aparece se for o do card (o card antigo segue mostrando o tipo dele). */
export function tiposParaEscolher(tipos: TipoVideo[], atual?: string | null): TipoVideo[] {
  return tipos.filter((t) => !t.arquivado || t.id === atual).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
}
