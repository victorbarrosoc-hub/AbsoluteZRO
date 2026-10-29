"use server";
/**
 * Importar planilha: sessão e papel aqui; o banco confere de novo. "Conferir" lê o arquivo e mostra a prévia (nada é
 * gravado); "Importar" grava o mesmo arquivo (sha256 conferido) e devolve o relatório.
 */
import { revalidatePath } from "next/cache";
import { exigirAcessoNaAcao } from "@/lib/auth/acao";
import { decodificar, ehTipo, LIMITES, type Mapa, type TipoImport } from "@/lib/importar/csv";
import { confirmarImportacao, previaNoBanco, type LinhaDaPrevia, type PreviaNoBanco, type Relatorio } from "@/lib/importar/servidor";
import { podeRemover } from "@/lib/papeis";

export type EstadoImportar =
  | {
      mensagem?: string;
      tipo?: TipoImport;
      arquivo?: string;
      texto?: string;
      previa?: Omit<PreviaNoBanco, "linhas"> & { linhas: LinhaDaPrevia[]; total: number };
      relatorio?: Relatorio;
    }
  | undefined;

const MOSTRAR = 60;

export async function importarAcao(_: EstadoImportar, fd: FormData): Promise<EstadoImportar> {
  const s = await exigirAcessoNaAcao();
  if (!podeRemover(s.papel)) return { mensagem: "Só administração e gestão importam planilhas." };
  const ctx = { sub: s.sub, orgId: s.orgId };
  const tipo = fd.get("tipo");
  if (!ehTipo(tipo)) return { mensagem: "Escolha o que importar." };
  let texto = String(fd.get("texto") ?? "");
  let arquivo = String(fd.get("arquivo_nome") ?? "");
  const f = fd.get("arquivo");
  if (f instanceof File && f.size > 0) {
    if (f.size > LIMITES.bytes) return { mensagem: "O arquivo passa de 1 MB. Divida em partes.", tipo };
    if (!/\.(csv|txt)$/i.test(f.name) && !/^text\/(csv|plain)/.test(f.type)) return { mensagem: "Envie um arquivo .csv (no Excel: Salvar como → CSV).", tipo };
    texto = decodificar(new Uint8Array(await f.arrayBuffer()));
    arquivo = f.name.slice(0, 200);
  }
  // Quebras de linha num formato só: o formulário devolve o texto com CRLF, e o sha256 da prévia tem de bater.
  texto = texto.replace(/\r\n?/g, "\n");
  if (!texto) return { mensagem: "Escolha o arquivo .csv.", tipo };
  let mapa: Mapa | undefined;
  try {
    mapa = fd.get("mapa") ? (JSON.parse(String(fd.get("mapa"))) as Mapa) : undefined;
  } catch {
    mapa = undefined;
  }

  if (fd.get("passo") === "confirmar") {
    const r = await confirmarImportacao(ctx, { tipo, texto, mapa: mapa ?? {}, sha: String(fd.get("sha") ?? ""), arquivo });
    if (!r.ok) return { mensagem: r.mensagem, tipo };
    revalidatePath("/app", "layout");
    return { tipo, arquivo, relatorio: r.relatorio };
  }

  const p = await previaNoBanco(ctx, tipo, texto, mapa);
  if (!p.ok) return { mensagem: p.mensagem, tipo };
  const linhas = [
    ...p.previa.linhas.filter((l) => l.acao === "erro").slice(0, 200),
    ...p.previa.linhas.filter((l) => l.acao !== "erro").slice(0, MOSTRAR),
  ].sort((a, b) => a.n - b.n);
  return { tipo, arquivo, texto, previa: { ...p.previa, linhas, total: p.previa.linhas.length } };
}
