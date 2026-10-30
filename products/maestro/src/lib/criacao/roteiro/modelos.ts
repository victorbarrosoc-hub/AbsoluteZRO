/**
 * Os modelos de "Novo roteiro" (plano da Criação §4.2), versionados aqui no código. Cada modelo define formato, alvo,
 * cenas com título e blocos VAZIOS com a dica cinza do campo (`dica`): nunca conteúdo inventado. As pessoas do modelo
 * são só o papel (nome vazio). Na fase 2, cada produtora poderá salvar um roteiro como modelo dela. Puro.
 */
import {
  type Alvo,
  type Bloco,
  type Cena,
  type EstiloLettering,
  type Formato,
  type ModoFala,
  novoId,
  type PapelPessoa,
  type Pessoa,
  type Roteiro,
  type TipoAudio,
  WPM_PADRAO,
} from "./modelo";

export const MODELOS_ROTEIRO = ["institucional", "reels", "comercial30", "documentario", "evento", "branco"] as const;
export type ModeloRoteiro = (typeof MODELOS_ROTEIRO)[number];
export const ehModeloRoteiro = (v: unknown): v is ModeloRoteiro => MODELOS_ROTEIRO.includes(v as ModeloRoteiro);

/** O cartão da folha "Novo roteiro". */
export type FichaModelo = { k: ModeloRoteiro; nome: string; formato: Formato; alvo: Alvo | null; cenas: string[] };

type Gerar = () => string;

// Montadores: só estrutura e dica.
type Molde = (g: Gerar, p: Record<string, string>) => Bloco;
const fala =
  (quem: string, modo: ModoFala, dica: string): Molde =>
  (g, p) => ({ id: g(), tipo: "fala", quem: p[quem] ?? null, texto: "", modo, dica });
const acao =
  (dica: string): Molde =>
  (g) => ({ id: g(), tipo: "acao", texto: "", dica });
const lettering =
  (estilo: EstiloLettering, dica: string): Molde =>
  (g) => ({ id: g(), tipo: "lettering", texto: "", estilo, dica });
const audio =
  (tipo: TipoAudio, dica: string, entra?: "fade" | "corte"): Molde =>
  (g) => ({ id: g(), tipo: "audio", audio: tipo, texto: "", dica, ...(entra ? { entra } : {}) });
const nota =
  (dica: string): Molde =>
  (g) => ({ id: g(), tipo: "nota", texto: "", dica });

type DefCena = { titulo: string; duracaoSeg?: number; dica?: string; blocos: Molde[] };
type DefModelo = { nome: string; formato: Formato; alvo: Alvo | null; pessoas: { k: string; papel: PapelPessoa; dica: string }[]; cenas: DefCena[] };

const LEGENDA = lettering("legenda", "Legenda da fala");

const DEFINICOES: Record<ModeloRoteiro, DefModelo> = {
  institucional: {
    nome: "Vídeo institucional",
    formato: "16:9",
    alvo: { min: 90, max: 180 },
    pessoas: [
      { k: "loc", papel: "locutor", dica: "Quem narra" },
      { k: "ent", papel: "entrevistado", dica: "Quem fala pela empresa" },
    ],
    cenas: [
      { titulo: "Abertura", blocos: [acao("A primeira imagem do vídeo"), audio("trilha", "Trilha de abertura", "fade")] },
      { titulo: "Quem somos", blocos: [fala("ent", "sonora", "Quem é a empresa, na voz de quem faz"), lettering("gc", "Nome e cargo de quem fala")] },
      { titulo: "O que fazemos", blocos: [acao("O trabalho acontecendo"), fala("loc", "off", "O que a empresa faz, em uma frase")] },
      { titulo: "Diferenciais", blocos: [lettering("titulo", "Um número que prova o diferencial"), fala("loc", "off", "Por que escolher vocês")] },
      { titulo: "Prova", blocos: [fala("ent", "sonora", "Um cliente ou um caso real"), acao("Imagens do caso")] },
      { titulo: "Assinatura", blocos: [acao("Logo e assinatura"), fala("loc", "off", "Frase de assinatura"), lettering("cta", "O que a pessoa faz agora")] },
    ],
  },
  reels: {
    nome: "Reels/TikTok",
    formato: "9:16",
    alvo: { min: 30, max: 60 },
    pessoas: [{ k: "apr", papel: "apresentador", dica: "Quem aparece" }],
    cenas: [
      { titulo: "Gancho", duracaoSeg: 3, dica: "0 a 3 segundos", blocos: [fala("apr", "on", "A frase que segura nos 3 primeiros segundos"), LEGENDA] },
      {
        titulo: "Desenvolvimento",
        dica: "Três batidas",
        blocos: [fala("apr", "on", "Batida 1"), LEGENDA, fala("apr", "on", "Batida 2"), LEGENDA, fala("apr", "on", "Batida 3"), LEGENDA],
      },
      { titulo: "Virada", blocos: [fala("apr", "on", "A virada: o que muda"), LEGENDA] },
      { titulo: "CTA", blocos: [fala("apr", "on", "O que a pessoa faz agora"), LEGENDA, lettering("cta", "Siga, comente, salve…")] },
    ],
  },
  comercial30: {
    nome: 'Comercial 30"',
    formato: "16:9",
    alvo: { min: 30, max: 30 },
    pessoas: [{ k: "loc", papel: "locutor", dica: "Quem narra" }],
    cenas: [
      { titulo: "Abertura", duracaoSeg: 5, dica: "0 a 5 segundos", blocos: [acao("A imagem que abre"), audio("trilha", "Trilha")] },
      {
        titulo: "Problema",
        duracaoSeg: 7,
        dica: "5 a 12 segundos",
        blocos: [acao("O problema de quem assiste"), fala("loc", "off", "O problema, em uma frase")],
      },
      { titulo: "Produto", duracaoSeg: 12, dica: "12 a 24 segundos", blocos: [acao("O produto resolvendo"), fala("loc", "off", "Como o produto resolve")] },
      {
        titulo: "Assinatura",
        duracaoSeg: 6,
        dica: "24 a 30 segundos",
        blocos: [fala("loc", "off", "Assinatura da marca"), acao("Packshot: o produto e a marca"), lettering("legal", "Texto legal obrigatório")],
      },
    ],
  },
  documentario: {
    nome: "Documentário/entrevista",
    formato: "16:9",
    alvo: null,
    pessoas: [
      { k: "ent", papel: "entrevistado", dica: "Quem dá a entrevista" },
      { k: "loc", papel: "locutor", dica: "Quem narra" },
    ],
    cenas: [
      { titulo: "Abertura", blocos: [acao("Imagem de abertura"), audio("trilha", "Trilha", "fade")] },
      {
        titulo: "Bloco 1",
        blocos: [nota("Perguntas da entrevista para este bloco"), fala("ent", "sonora", "Trecho da entrevista"), lettering("gc", "Nome e cargo")],
      },
      { titulo: "Ligação", blocos: [fala("loc", "off", "O texto que liga um bloco ao outro"), acao("Imagens de cobertura")] },
      { titulo: "Bloco 2", blocos: [nota("Perguntas da entrevista para este bloco"), fala("ent", "sonora", "Trecho da entrevista")] },
      { titulo: "Encerramento", blocos: [acao("Imagem final"), audio("trilha", "Trilha de fechamento")] },
    ],
  },
  evento: {
    nome: "Evento",
    formato: "16:9",
    alvo: { min: 60, max: 180 },
    pessoas: [{ k: "ent", papel: "entrevistado", dica: "Quem dá depoimento" }],
    cenas: [
      { titulo: "Chegada", blocos: [acao("Chegada, fachada, ambiente"), audio("bg", "Som do lugar")] },
      { titulo: "Destaques", blocos: [acao("Os momentos mais fortes"), audio("trilha", "Trilha")] },
      {
        titulo: "Depoimentos",
        blocos: [fala("ent", "sonora", "Depoimento curto"), lettering("gc", "Nome de quem fala"), fala("ent", "sonora", "Outro depoimento")],
      },
      { titulo: "Encerramento", blocos: [acao("Imagem final"), lettering("titulo", "Data e local do evento")] },
    ],
  },
  branco: {
    nome: "Em branco",
    formato: "16:9",
    alvo: null,
    pessoas: [],
    cenas: [{ titulo: "", blocos: [acao("Comece por aqui")] }],
  },
};

/** Os 6 cartões da folha "Novo roteiro", na ordem. */
export const FICHAS_MODELOS: readonly FichaModelo[] = MODELOS_ROTEIRO.map((k) => {
  const d = DEFINICOES[k];
  return { k, nome: d.nome, formato: d.formato, alvo: d.alvo, cenas: d.cenas.map((c) => c.titulo).filter(Boolean) };
});

/** O roteiro novo a partir de um modelo (ids novos a cada chamada; os testes passam um contador). */
export function roteiroDoModelo(k: ModeloRoteiro, gerar: Gerar = novoId): Roteiro {
  const d = DEFINICOES[k];
  const ids: Record<string, string> = {};
  const pessoas: Pessoa[] = d.pessoas.map((p) => {
    ids[p.k] = gerar();
    return { id: ids[p.k], nome: "", papel: p.papel, dica: p.dica };
  });
  const cenas: Cena[] = d.cenas.map((c) => ({
    id: gerar(),
    titulo: c.titulo,
    ...(c.duracaoSeg ? { duracaoSeg: c.duracaoSeg } : {}),
    ...(c.dica ? { dica: c.dica } : {}),
    blocos: c.blocos.map((m) => m(gerar, ids)),
  }));
  return { v: 1, formato: d.formato, alvo: d.alvo ? { ...d.alvo } : null, wpm: WPM_PADRAO, pessoas, cenas };
}
