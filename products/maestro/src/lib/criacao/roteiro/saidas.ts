/**
 * Saídas do Roteiro (plano da Criação §5, fase F3): o que sai do Maestro, SEMPRE de uma versão salva (imutável e com
 * sha256), para o TPeasy (texto pronto, `.txt` e backup com id estável) e para a edição (`maestro.roteiro/1`, contrato em
 * packages/media-contracts/src/roteiro.ts). Puro: a tela e os testes usam igual; o registro de "o que saiu para onde"
 * é do servidor (`registrarEnvio` em servidor.ts).
 *
 * TPeasy (products/tpeasy/app/js/views.js e data.js): "Importar arquivo" aceita `.txt/.md` e o NOME do arquivo vira o
 * título; "Colar texto" usa a primeira linha; "Restaurar backup" (Ajustes) junta pelo id e fica com o mais novo
 * (`updated` = hora da versão: mandar a mesma versão de novo não muda nada; a nova atualiza).
 */
import {
  type BlocoAudio,
  type BlocoFala,
  type BlocoLettering,
  type BlocoPlano,
  cabecalhoDaCena,
  nomeDeQuemFala,
  type Roteiro,
  SIGLA_TAMANHO_PLANO,
  type TransicaoAudio,
} from "./modelo";
import { linhaDoTempo, palavrasDaFala } from "./tempo";
import { entra } from "./vistas/comum";
import { type BackupTpeasy, paraBackupTpeasy, vistaTeleprompter } from "./vistas/teleprompter";

/** A versão de onde a saída sai (o que a rota `?versao=n` devolve). */
export type VersaoDeOrigem = {
  roteiroId: string;
  titulo: string;
  n: number;
  sha256: string;
  /** `criado_em` da versão (texto do Postgres ou ISO). */
  criadoEm: string;
  conteudo: Roteiro;
};

/** Destinos e formatos que ficam registrados (auditoria `roteiro.enviado`). */
export const SAIDAS = {
  /** `direto` (F8): pela Absolute ZRO para a caixa de entrada do TPeasy. Só `enviarAoTpeasy` anota (a rota recusa no "enviado"). */
  tpeasy: ["compartilhar", "copiar", "txt", "backup", "direto"],
  edicao: ["pdf"],
  pdf: ["literario", "tecnico", "teleprompter"],
  aeon: ["json"],
  /** F7: a versão vira peça do link de aprovação do card. Só `maestro.roteiro_para_cliente` anota (a rota recusa no "enviado"). */
  cliente: ["link"],
} as const;
export type DestinoSaida = keyof typeof SAIDAS;
export type FormatoSaida = (typeof SAIDAS)[DestinoSaida][number];
export const ehSaida = (destino: unknown, formato: unknown): destino is DestinoSaida =>
  typeof destino === "string" && Object.hasOwn(SAIDAS, destino) && (SAIDAS[destino as DestinoSaida] as readonly string[]).includes(formato as string);

/** `criado_em::text` do Postgres ("2026-10-29 14:00:00.123+00") ou ISO → Date. */
export function dataDaVersao(t: string): Date {
  const d = new Date(t.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
  return Number.isFinite(d.getTime()) ? d : new Date(0);
}

/** Igual em conteúdo (a ordem das chaves não conta): o rascunho ainda é a versão? */
export function mesmoConteudo(a: unknown, b: unknown): boolean {
  const canon = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
              .sort()
              .map((k) => [k, canon((v as Record<string, unknown>)[k])]),
          )
        : v;
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

/**
 * Nome de arquivo que vira título no TPeasy e não quebra em sistema nenhum: sem `/ \ : * ? " < > |` nem controle,
 * espaços juntados, até 120 letras antes da extensão.
 */
export function nomeDeArquivo(base: string, ext: string): string {
  const limpo = base
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 120)
    .trim();
  return `${limpo || "Roteiro"}.${ext}`;
}

export type SaidaTpeasy = {
  /** Título no TPeasy ("Café Aurora · Ana"). */
  titulo: string;
  /** O texto pronto (só as falas, na marcação do TPeasy): compartilhar, copiar e o corpo do `.txt`. */
  texto: string;
  palavras: number;
  duracaoSeg: number;
  /** Nome do `.txt` (sem a versão: no TPeasy, o nome é o título). */
  arquivoTxt: string;
  arquivoBackup: string;
  backup: BackupTpeasy;
};

/** Tudo o que vai para o TPeasy, de uma versão, para "Todas" (`pessoa` vazio) ou uma pessoa. */
export function saidaTpeasy(v: VersaoDeOrigem, pessoa: string | null = null, agora: Date = new Date()): SaidaTpeasy {
  const r = v.conteudo;
  const quem = pessoa && r.pessoas.some((p) => p.id === pessoa) ? pessoa : null;
  const tp = vistaTeleprompter(r, { pessoa: quem });
  const base = v.titulo.replace(/\s+/g, " ").trim() || "Roteiro";
  const titulo = quem ? `${base} · ${nomeDeQuemFala(r, quem)}` : base;
  return {
    titulo,
    texto: tp.texto,
    palavras: tp.palavras,
    duracaoSeg: tp.duracaoSeg,
    arquivoTxt: nomeDeArquivo(titulo, "txt"),
    arquivoBackup: nomeDeArquivo(`${titulo} · v${v.n} · TPeasy`, "json"),
    backup: paraBackupTpeasy({
      roteiroId: v.roteiroId,
      titulo,
      pessoa: quem,
      texto: tp.texto,
      atualizadoEm: dataDaVersao(v.criadoEm),
      alvoSeg: r.alvo?.max ?? null,
      agora,
    }),
  };
}

/** Só o que se fala: sem `((nota))`, `[deixa]` e `**`, espaços juntados por linha. */
export function textoFalado(texto: string): string {
  return texto
    .replace(/\(\([\s\S]*?\)\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\*\*/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const ouNulo = (t: string | undefined) => (t && t.trim() ? t.trim() : null);

type TempoBloco = { id: string; inicio_seg: number; fim_seg: number; duracao_digitada_seg: number | null };
/** Um bloco do `maestro.roteiro/1` (o schema zod mora em packages/media-contracts; aqui é o espelho para o TypeScript). */
export type BlocoParaEdicao = TempoBloco &
  (
    | {
        tipo: "fala";
        pessoa_id: string | null;
        pessoa: string;
        modo: BlocoFala["modo"];
        texto: string;
        texto_falado: string;
        palavras: number;
        obs: string | null;
      }
    | { tipo: "acao"; texto: string }
    | {
        tipo: "plano";
        tamanho: BlocoPlano["tamanho"];
        sigla: string;
        angulo: string | null;
        movimento: string | null;
        lente: string | null;
        fps: number | null;
        texto: string | null;
      }
    | { tipo: "lettering"; estilo: BlocoLettering["estilo"]; texto: string }
    | { tipo: "audio"; audio: BlocoAudio["audio"]; texto: string; entra: TransicaoAudio | null; sai: TransicaoAudio | null }
  );
export type RoteiroParaEdicao = ReturnType<typeof paraRoteiroMaestro>;

/**
 * O arquivo `maestro.roteiro/1`: cenas com começo e fim estimados e os blocos que a edição usa (fala, ação, plano,
 * lettering, áudio), com o id estável de cada um. Nota interna, observação e bloco vazio não saem.
 */
export function paraRoteiroMaestro(v: VersaoDeOrigem, agora: Date = new Date()) {
  const r = v.conteudo;
  const tempo = linhaDoTempo(r);
  const deixa = new Map(tempo.deixas.map((d) => [d.blocoId, d]));
  const pessoas = new Set(r.pessoas.map((p) => p.id));
  const cenas = r.cenas.map((c, i) => {
    const tc = tempo.cenas[i];
    const blocos = c.blocos.flatMap((b): BlocoParaEdicao[] => {
      if (b.tipo === "nota" || b.tipo === "observacao" || !entra(b)) return [];
      const d = deixa.get(b.id);
      const base = { id: b.id, inicio_seg: d?.inicioSeg ?? tc.inicioSeg, fim_seg: d?.fimSeg ?? tc.inicioSeg, duracao_digitada_seg: b.duracao ?? null };
      switch (b.tipo) {
        case "fala":
          return [
            {
              ...base,
              tipo: "fala" as const,
              pessoa_id: b.quem && pessoas.has(b.quem) ? b.quem : null,
              pessoa: nomeDeQuemFala(r, b.quem).slice(0, 80),
              modo: b.modo,
              texto: b.texto.trim(),
              texto_falado: textoFalado(b.texto),
              palavras: palavrasDaFala(b.texto),
              obs: ouNulo(b.obs),
            },
          ];
        case "acao":
          return [{ ...base, tipo: "acao" as const, texto: b.texto.trim() }];
        case "plano":
          return [
            {
              ...base,
              tipo: "plano" as const,
              tamanho: b.tamanho,
              sigla: SIGLA_TAMANHO_PLANO[b.tamanho],
              angulo: ouNulo(b.angulo),
              movimento: ouNulo(b.movimento),
              lente: ouNulo(b.lente),
              fps: b.fps ?? null,
              texto: ouNulo(b.texto),
            },
          ];
        case "lettering":
          return [{ ...base, tipo: "lettering" as const, estilo: b.estilo, texto: b.texto.trim() }];
        case "audio":
          return [{ ...base, tipo: "audio" as const, audio: b.audio, texto: b.texto.trim(), entra: b.entra ?? null, sai: b.sai ?? null }];
      }
    });
    return {
      id: c.id,
      numero: i + 1,
      titulo: c.titulo.replace(/\s+/g, " ").trim(),
      cabecalho: cabecalhoDaCena(c, i + 1),
      int_ext: c.intExt ?? null,
      local: ouNulo(c.local),
      periodo: c.periodo ?? null,
      inicio_seg: tc.inicioSeg,
      fim_seg: r1(tc.inicioSeg + tc.duracaoSeg),
      duracao_digitada_seg: c.duracaoSeg ?? null,
      voz_seg: tc.vozSeg,
      blocos,
    };
  });
  return {
    contract: "maestro.roteiro/1" as const,
    gerado_em: agora.toISOString(),
    origem: {
      app: "maestro" as const,
      roteiro_id: v.roteiroId,
      titulo: v.titulo.replace(/\s+/g, " ").trim().slice(0, 200) || "Roteiro",
      versao: v.n,
      sha256: v.sha256,
      salva_em: dataDaVersao(v.criadoEm).toISOString(),
    },
    formato: r.formato,
    wpm: r.wpm,
    alvo_seg: r.alvo ? { min: r.alvo.min, max: r.alvo.max } : null,
    tempos: "estimados" as const,
    duracao_seg: tempo.totalSeg,
    pessoas: r.pessoas.map((p) => ({ id: p.id, nome: p.nome.trim(), papel: p.papel })),
    cenas,
  };
}

/** Nome do arquivo para a edição: `<título> · vN.maestro.json`. */
export const arquivoParaEdicao = (v: Pick<VersaoDeOrigem, "titulo" | "n">) => nomeDeArquivo(`${v.titulo} · v${v.n}.maestro`, "json");
