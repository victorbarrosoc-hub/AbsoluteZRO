/**
 * "Baixar pacote" do Fluxo (plano da Criação §6.2, fase F6): um .zip com `fluxo.md`, `fluxo.json` e `imagens/`. É o
 * jeito mais privado de levar o fluxo para uma IA (sobe o arquivo; nada fica público), por isso não precisa de link.
 * Tudo lido como quem baixa (RLS): o fluxo por `dadosParaExportar` e as imagens pela porta `maestro.fluxo_imagem`, aos
 * poucos (16 por consulta), enquanto o zip vai saindo. No Markdown e no JSON a imagem aponta para o arquivo do pacote.
 */
import { sql } from "drizzle-orm";
import { getBanco, type Contexto } from "@/lib/db/client";
import { zipEmPartes, type ArquivoZip } from "@/lib/zip";
import { nomesDasImagens, slug } from "./compartilhar";
import { fluxoParaJson, fluxoParaMarkdown, organizar } from "./exportar";
import { dadosParaExportar } from "./servidor";

const LOTE = 16;

export async function pacoteDoFluxo(ctx: Contexto, id: string, agora = new Date()): Promise<{ nome: string; corpo: ReadableStream<Uint8Array> } | null> {
  const d = await dadosParaExportar(ctx, id);
  if (!d) return null;
  const org = organizar(d);
  const nomes = nomesDasImagens([...org.secoes.flatMap((s) => s.itens), ...org.soltos]);
  const opcoes = { agora, urlImagem: (img: { id: string }) => nomes.get(img.id) ?? null };
  const md = fluxoParaMarkdown(d, opcoes);
  const json = fluxoParaJson(d, opcoes);
  const imagens = [...nomes.entries()].map(([imagemId, nome]) => {
    const n = d.nos.find((x) => x.imagem?.id === imagemId)!;
    return { id: imagemId, sha: n.imagem!.sha256, nome };
  });

  async function* arquivos(): AsyncGenerator<ArquivoZip> {
    yield { nome: "fluxo.md", dados: new TextEncoder().encode(md), comprimir: true };
    yield { nome: "fluxo.json", dados: new TextEncoder().encode(`${JSON.stringify(json, null, 2)}\n`), comprimir: true };
    for (let i = 0; i < imagens.length; i += LOTE) {
      const lote = imagens.slice(i, i + LOTE);
      const bytes = await getBanco().asUser(ctx, async (tx) => {
        const r = (await tx.execute(sql`
          select x.id::text as id, b.bytes
            from jsonb_to_recordset(${JSON.stringify(lote.map((l) => ({ id: l.id, sha: l.sha })))}::jsonb) as x(id uuid, sha text)
            cross join lateral maestro.fluxo_imagem(x.id, x.sha, false) b`)) as unknown as { id: string; bytes: Buffer | null }[];
        return new Map(r.map((l) => [l.id, l.bytes]));
      });
      for (const l of lote) {
        const b = bytes.get(l.id);
        // imagem que saiu entre a leitura do fluxo e agora: fica de fora (o .md já diz o nome)
        if (b) yield { nome: l.nome, dados: new Uint8Array(b) };
      }
    }
  }

  return { nome: `fluxo-${slug(d.titulo)}.zip`, corpo: zipEmPartes(arquivos(), agora) };
}
