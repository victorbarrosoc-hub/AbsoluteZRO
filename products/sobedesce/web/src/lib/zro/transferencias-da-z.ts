/**
 * A Z lê as transferências da pessoa (28/10/2026, Fase 1: só leitura). A fonte é o mesmo retrato que o celular lê
 * (lib/acompanhar/status.ts): o último andamento que cada computador mandou, guardado por até 7 dias. Nada novo é
 * guardado e nada é pedido ao computador.
 *
 * O que sai: por computador, o horário do último relato, se está ligado, as contagens (ativas, concluídas, falhas,
 * conferências MD5), os lotes e alguns nomes de arquivo. O que nunca sai: caminho local (só o nome da última pasta),
 * token, id de sessão. Mensagens de erro passam por `semCaminho` (um erro do sistema pode citar o caminho).
 */
import "server-only";
import type { StatusComputador } from "@/lib/acompanhar/formato";
import { listarComputadores } from "@/lib/acompanhar/status";

export const ACAO_TRANSFERENCIAS = "transferencias.ler";
const MAX_ITENS_Z = 10;

/**
 * Caminho de pasta (Mac, Linux, Windows, rede) vira "…". Caminho pode ter espaço: do começo dele até a próxima aspa,
 * quebra de linha ou o fim some (pode levar junto o resto da frase; melhor perder texto que vazar caminho).
 */
export function semCaminho(t: string | null | undefined): string | null {
  if (!t) return null;
  const limpo = t.replace(/(?<![\w.])(?:~?\/(?=[^\s/])|[A-Za-z]:[\\/]|\\\\)[^"'<>|\n]*/g, "…").slice(0, 200);
  return limpo || null;
}

/** Só o nome da última pasta, nunca o caminho inteiro. */
export function soNomeDaPasta(t: string | null | undefined): string | null {
  if (!t) return null;
  const partes = t.split(/[\\/]+/).filter(Boolean);
  return partes.length ? partes[partes.length - 1].slice(0, 120) : null;
}

const iso = (ms: number | null | undefined) => (typeof ms === "number" && ms > 0 ? new Date(ms).toISOString() : null);

export type ComputadorParaZ = ReturnType<typeof computadorParaZ>;

function computadorParaZ(c: { nome: string; plataforma: string | null; online: boolean; atualizadoEm: number; snapshot: StatusComputador }) {
  const s = c.snapshot;
  const g = s.geral;
  const lotes = s.lotes ?? [];
  const conferindo = s.itens.filter((i) => i.estado === "conferindo").length;
  return {
    nome: c.nome,
    plataforma: c.plataforma,
    ligado: c.online,
    fechado: s.fechado === true,
    relatado_em: new Date(c.atualizadoEm).toISOString(),
    estado: s.estado,
    rodada: {
      ativas: s.itens.length + (g.fora ?? 0),
      concluidas: g.feitos,
      falhas: g.erros,
      total: g.total,
      bytes_feitos: g.feitoBytes,
      bytes_total: g.totalBytes,
    },
    conferencias: {
      em_andamento: conferindo,
      conferidas: lotes.reduce((n, l) => n + l.conferidos, 0),
      divergentes: lotes.reduce((n, l) => n + l.divergentes, 0),
      // O app antigo não manda lotes: sem eles, não dá para contar conferências.
      informado: lotes.length > 0,
    },
    estimativa: { velocidade_bps: g.velocidade, faltam_s: g.eta },
    lotes: lotes.map((l) => ({
      titulo: l.titulo,
      direcao: l.direcao,
      pasta: soNomeDaPasta(l.destino),
      arquivos: l.arquivos,
      andando: l.andando,
      na_fila: l.naFila,
      esperando: l.esperando,
      pausados: l.pausados,
      concluidos: l.concluidos,
      cancelados: l.cancelados,
      falhas: l.erros,
      conferidos: l.conferidos,
      divergentes: l.divergentes,
      criado_em: iso(l.criadoEm),
      terminou_em: iso(l.terminouEm),
    })),
    em_andamento: s.itens.slice(0, MAX_ITENS_Z).map((i) => ({
      nome: i.nome,
      direcao: i.direcao,
      estado: i.estado,
      bytes_feitos: i.feito,
      bytes_total: i.total,
      pasta: soNomeDaPasta(i.destino),
      ...(i.erro ? { motivo: semCaminho(i.erro) } : {}),
    })),
    terminados: {
      ok: s.terminados.filter((t) => t.ok).length,
      falhas: s.terminados.filter((t) => !t.ok).length,
      falhas_recentes: s.terminados
        .filter((t) => !t.ok)
        .slice(0, MAX_ITENS_Z)
        .map((t) => ({ nome: t.nome, direcao: t.direcao, motivo: semCaminho(t.erro), terminou_em: iso(t.terminouEm) })),
    },
  };
}

/** O retrato das transferências da conta para a Z. Sem computador com notícia: lista vazia (a Z diz que não sabe). */
export async function transferenciasParaZ(usuarioId: string, agora = Date.now()) {
  const computadores = await listarComputadores(usuarioId, agora);
  return { fonte: "SOBEDESCE", lido_em: new Date(agora).toISOString(), computadores: computadores.map(computadorParaZ) };
}
