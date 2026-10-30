/**
 * A Criação na demonstração (plano da Criação §8): um roteiro institucional da cafeteria de exemplo, ligado ao projeto
 * "Filme de marca: Safra 2027", com quatro cenas e quase todos os tipos de bloco, e uma versão salva (v1). Tudo
 * inventado (pessoas fictícias), `demo = true`; sai com "Remover demonstração" (as versões vão junto).
 */
import { sql } from "drizzle-orm";
import type { Contexto, Tx } from "@/lib/db/client";
import { lerRoteiro, type Roteiro } from "@/lib/criacao/roteiro/modelo";
import { duracaoDoRoteiro } from "@/lib/criacao/roteiro/tempo";

export const TITULO_ROTEIRO_DEMO = "Institucional Café Serra Alta";

export function roteiroDemo(): Roteiro {
  return lerRoteiro({
    v: 1,
    formato: "16:9",
    alvo: { min: 45, max: 75 },
    wpm: 150,
    pessoas: [
      { id: "demo-loc", nome: "", papel: "locutor" },
      { id: "demo-ant", nome: "Antônio", papel: "entrevistado" },
    ],
    cenas: [
      {
        id: "demo-c1",
        titulo: "Abertura",
        intExt: "EXT",
        local: "Fazenda",
        periodo: "amanhecer",
        blocos: [
          { id: "demo-b01", tipo: "plano", tamanho: "PG", movimento: "drone subindo", duracao: 10 },
          { id: "demo-b02", tipo: "acao", texto: "O drone sobe sobre o cafezal com a névoa baixa." },
          { id: "demo-b03", tipo: "audio", audio: "trilha", texto: "Violão suave", entra: "fade" },
          { id: "demo-b04", tipo: "lettering", estilo: "titulo", texto: "Café Serra Alta · desde 1962" },
          { id: "demo-b05", tipo: "fala", quem: "demo-loc", modo: "off", texto: "Tudo começa **antes do sol**. [pausa]" },
          { id: "demo-b06", tipo: "observacao", texto: "Golden hour: chamada às 5h10." },
          { id: "demo-b07", tipo: "nota", texto: "Confirmar a autorização do drone com a fazenda." },
        ],
      },
      {
        id: "demo-c2",
        titulo: "A família",
        intExt: "INT",
        local: "Torrefação",
        periodo: "dia",
        blocos: [
          { id: "demo-b08", tipo: "plano", tamanho: "PM", movimento: "câmera na mão", duracao: 14 },
          { id: "demo-b09", tipo: "acao", texto: "Seu Antônio mexe os grãos no tambor." },
          { id: "demo-b10", tipo: "lettering", estilo: "gc", texto: "Antônio · 3ª geração" },
          { id: "demo-b11", tipo: "fala", quem: "demo-ant", modo: "sonora", texto: "Meu avô dizia que café bom não tem pressa." },
        ],
      },
      {
        id: "demo-c3",
        titulo: "O processo",
        intExt: "INT",
        local: "Laboratório",
        periodo: "dia",
        blocos: [
          { id: "demo-b12", tipo: "plano", tamanho: "PD", lente: "macro 100mm", fps: 120, duracao: 18 },
          { id: "demo-b13", tipo: "acao", texto: "Grãos caindo em câmera lenta." },
          { id: "demo-b14", tipo: "audio", audio: "efeito", texto: "Som dos grãos" },
          { id: "demo-b15", tipo: "lettering", estilo: "legenda", texto: "Torra artesanal" },
          { id: "demo-b16", tipo: "fala", quem: "demo-loc", modo: "off", texto: "Cada lote é provado antes de sair." },
        ],
      },
      {
        id: "demo-c4",
        titulo: "Assinatura",
        intExt: "INT",
        local: "Estúdio",
        blocos: [
          { id: "demo-b17", tipo: "plano", tamanho: "PP", duracao: 10 },
          { id: "demo-b18", tipo: "acao", texto: "Xícara fumegando, a marca ao lado." },
          { id: "demo-b19", tipo: "lettering", estilo: "cta", texto: "cafeserraalta.exemplo.com" },
          { id: "demo-b20", tipo: "fala", quem: "demo-loc", modo: "off", texto: "Café Serra Alta. [pausa] O dia começa aqui." },
        ],
      },
    ],
  })!;
}

/** Monta o roteiro de exemplo (uma vez) e congela a v1. Devolve quantos criou. */
export async function montarCriacao(tx: Tx, ctx: Contexto, projetoId: string | null): Promise<number> {
  const conteudo = roteiroDemo();
  const [r] = (await tx.execute(sql`
    insert into maestro.roteiros (org_id, projeto_id, titulo, modelo, formato, conteudo, duracao_seg, demo)
    values (${ctx.orgId}, ${projetoId}, ${TITULO_ROTEIRO_DEMO}, 'institucional', ${conteudo.formato}, ${JSON.stringify(conteudo)}::jsonb,
            ${Math.round(duracaoDoRoteiro(conteudo))}, true)
    returning id`)) as unknown as { id: string }[];
  await tx.execute(sql`select maestro.roteiro_versao_salvar(${r.id}::uuid, ${"Primeira leitura com o cliente"})`);
  return 1;
}
