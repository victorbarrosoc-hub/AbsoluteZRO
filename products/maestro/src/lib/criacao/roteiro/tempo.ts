/**
 * Tempo do roteiro (plano da Criação §4.1): a fala é ESTIMADA por palavras ÷ palavras por minuto (o TPeasy conta do
 * mesmo jeito, `countWords` em products/tpeasy/app/js/data.js: notas `((…))` e deixas `[…]` não contam); o resto só tem
 * o tempo que alguém digitou. Puro.
 *
 * Regras de uma cena (duas trilhas, como no roteiro de duas colunas):
 *   - voz    = soma das falas, uma depois da outra (tempo digitado no bloco, senão a estimativa);
 *   - imagem = planos, um depois do outro. Um plano é o bloco `plano` mais as ações que vêm depois dele (até o próximo
 *     plano); ação antes de qualquer plano é um plano sozinha. O tempo do plano é a soma do que foi digitado nos blocos
 *     dele; todos os blocos do plano ocupam o mesmo intervalo;
 *   - a cena dura o `duracaoSeg` digitado nela; sem ele, o maior entre voz e imagem digitada;
 *   - planos sem tempo dividem igualmente o que sobra da cena na trilha de imagem;
 *   - lettering, áudio e observação começam com o último bloco de fala/plano/ação antes deles (ou no começo da cena);
 *     com tempo digitado, duram isso; sem tempo, o lettering e a observação vão até o fim desse bloco e o áudio vai até
 *     o fim da cena;
 *   - nota interna não entra na linha do tempo;
 *   - `excede` = a voz estimada passa do tempo digitado na cena.
 * Tudo em segundos, arredondado a 0,1.
 */
import { type Alvo, type Bloco, type Roteiro, type TipoBloco, WPM_PADRAO } from "./modelo";

const r1 = (n: number) => Math.round(n * 10) / 10;

const PALAVRA = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
const semNotasNemDeixas = (t: string) => t.replace(/\(\([\s\S]*?\)\)/g, " ").replace(/\[[^\]]*\]/g, " ");

/** Palavras de um texto do TPeasy, exatamente como o `countWords` dele (sem `((nota))`, `[deixa]` e linha `# título`). */
export function contarPalavras(texto: string): number {
  return (
    semNotasNemDeixas(texto)
      .replace(/^\s*#.*$/gm, " ")
      .match(PALAVRA)?.length ?? 0
  );
}

/** Palavras de uma fala do roteiro (aqui `#` no começo é texto, não título). */
export function palavrasDaFala(texto: string): number {
  return semNotasNemDeixas(texto).match(PALAVRA)?.length ?? 0;
}

/** Segundos estimados de uma fala. */
export function segundosDaFala(texto: string, wpm: number = WPM_PADRAO): number {
  return r1((palavrasDaFala(texto) / Math.max(1, wpm)) * 60);
}

/** O tempo do bloco: o digitado; na fala sem tempo, a estimativa; no resto, null (sem tempo). */
export function duracaoDoBloco(b: Bloco, wpm: number = WPM_PADRAO): number | null {
  if (b.duracao) return b.duracao;
  return b.tipo === "fala" ? segundosDaFala(b.texto, wpm) : null;
}

export type TempoCena = {
  id: string;
  numero: number;
  inicioSeg: number;
  duracaoSeg: number;
  vozSeg: number;
  imagemSeg: number;
  /** A cena tem `duracaoSeg` digitado. */
  definida: boolean;
  /** A voz estimada passa do tempo digitado na cena. */
  excede: boolean;
};

/** Um bloco na linha do tempo (começo e fim absolutos, desde o começo do roteiro). */
export type Deixa = { blocoId: string; cenaId: string; cenaNumero: number; tipo: Exclude<TipoBloco, "nota">; inicioSeg: number; fimSeg: number };

export type LinhaDoTempo = { cenas: TempoCena[]; deixas: Deixa[]; totalSeg: number };

const IMAGEM = new Set<TipoBloco>(["plano", "acao"]);

/** A linha do tempo inteira: cada cena e cada bloco (menos nota) com começo e fim estimados. */
export function linhaDoTempo(r: Roteiro): LinhaDoTempo {
  const cenas: TempoCena[] = [];
  const deixas: Deixa[] = [];
  let inicio = 0;
  r.cenas.forEach((c, i) => {
    const numero = i + 1;
    // planos da trilha de imagem: plano + as ações seguintes; ação antes de plano fica sozinha
    const planoDe = new Map<string, number>();
    const planos: { digitado: number; temTempo: boolean }[] = [];
    let ultimoPlano = -1;
    let voz = 0;
    for (const b of c.blocos) {
      if (b.tipo === "fala") voz += duracaoDoBloco(b, r.wpm) ?? 0;
      else if (b.tipo === "plano" || (b.tipo === "acao" && ultimoPlano < 0)) {
        planos.push({ digitado: b.duracao ?? 0, temTempo: !!b.duracao });
        planoDe.set(b.id, planos.length - 1);
        if (b.tipo === "plano") ultimoPlano = planos.length - 1;
      } else if (b.tipo === "acao") {
        const p = planos[ultimoPlano];
        p.digitado += b.duracao ?? 0;
        p.temTempo ||= !!b.duracao;
        planoDe.set(b.id, ultimoPlano);
      }
    }
    voz = r1(voz);
    const imagemDigitada = r1(planos.reduce((s, p) => s + p.digitado, 0));
    const semTempo = planos.filter((p) => !p.temTempo).length;
    const definida = c.duracaoSeg !== undefined;
    const dur = r1(c.duracaoSeg ?? Math.max(voz, imagemDigitada));
    const fatia = semTempo ? Math.max(0, dur - imagemDigitada) / semTempo : 0;
    const intervalos: { ini: number; fim: number }[] = [];
    let tImg = 0;
    for (const p of planos) {
      const d = p.temTempo ? p.digitado : fatia;
      intervalos.push({ ini: tImg, fim: tImg + d });
      tImg += d;
    }

    let tVoz = 0;
    let ancora: { ini: number; fim: number } | null = null;
    for (const b of c.blocos) {
      if (b.tipo === "nota") continue;
      let ini: number;
      let fim: number;
      if (b.tipo === "fala") {
        ini = tVoz;
        fim = tVoz + (duracaoDoBloco(b, r.wpm) ?? 0);
        tVoz = fim;
        ancora = { ini, fim };
      } else if (IMAGEM.has(b.tipo)) {
        ({ ini, fim } = intervalos[planoDe.get(b.id)!]);
        ancora = { ini, fim };
      } else {
        ini = ancora?.ini ?? 0;
        fim = b.duracao ? ini + b.duracao : b.tipo === "audio" ? Math.max(ini, dur) : (ancora?.fim ?? dur);
      }
      deixas.push({ blocoId: b.id, cenaId: c.id, cenaNumero: numero, tipo: b.tipo, inicioSeg: r1(inicio + ini), fimSeg: r1(inicio + fim) });
    }
    cenas.push({
      id: c.id,
      numero,
      inicioSeg: r1(inicio),
      duracaoSeg: dur,
      vozSeg: voz,
      imagemSeg: imagemDigitada,
      definida,
      excede: definida && voz > dur + 0.05,
    });
    inicio += dur;
  });
  return { cenas, deixas, totalSeg: r1(inicio) };
}

/** Total estimado do roteiro em segundos. */
export const duracaoDoRoteiro = (r: Roteiro) => linhaDoTempo(r).totalSeg;

export type EstadoMedidor = "sem_alvo" | "abaixo" | "no_alvo" | "acima";
export type Medidor = {
  totalSeg: number;
  alvo: Alvo | null;
  estado: EstadoMedidor;
  /** negativo = falta; positivo = sobra; 0 dentro do alvo */ diferencaSeg: number;
  /** 0–1 do máximo do alvo */ fracao: number;
};

/** Folga do medidor, a mesma do TPeasy ("passou" só acima de 5% da meta). */
export const FOLGA_ALVO = 0.05;

/** O medidor do topo: total contra o alvo, com 5% de folga para cada lado. */
export function medidor(totalSeg: number, alvo: Alvo | null): Medidor {
  if (!alvo) return { totalSeg, alvo: null, estado: "sem_alvo", diferencaSeg: 0, fracao: 0 };
  const fracao = Math.min(1, totalSeg / Math.max(1, alvo.max));
  if (totalSeg < alvo.min * (1 - FOLGA_ALVO)) return { totalSeg, alvo, estado: "abaixo", diferencaSeg: r1(totalSeg - alvo.min), fracao };
  if (totalSeg > alvo.max * (1 + FOLGA_ALVO)) return { totalSeg, alvo, estado: "acima", diferencaSeg: r1(totalSeg - alvo.max), fracao };
  return { totalSeg, alvo, estado: "no_alvo", diferencaSeg: 0, fracao };
}

/** `1:14` (ou `1:02:05` a partir de 1 h), em segundos inteiros. */
export function formatarTempo(seg: number): string {
  const s = Math.max(0, Math.round(seg));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
