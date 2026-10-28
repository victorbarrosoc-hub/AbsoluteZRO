/**
 * Tela de entrada do Maestro (decisão do titular, 28/10/2026): "a Z continua como aba, mas o app abre na tarefa quando
 * há algo em andamento". Quem entra sem pedir página (`/app`) cai no Quadro se tiver card seu em produção ou em
 * revisão; senão, na Z (a primeira aba). Link direto (`/app/quadro?card=…`, `/app/projetos/…`) é respeitado sempre.
 * Puro: roda no servidor e nos testes.
 */
import type { ColunaKey, DadosCard } from "./quadro/metodo";

/** Colunas em que o card é trabalho em curso de quem é o responsável. */
export const EM_ANDAMENTO: ColunaKey[] = ["fazendo", "revisao"];
export const ENTRADA_Z = "/app/z";
export const ENTRADA_QUADRO = "/app/quadro";

/** A pessoa (`eu` = sub) tem card dela em andamento (não apagado)? */
export function temTarefaEmAndamento(cards: { dados: DadosCard }[], eu: string): boolean {
  return cards.some(({ dados: d }) => !d.apagadoEm && d.resp === eu && EM_ANDAMENTO.includes(d.coluna));
}

export function entradaDoMaestro(cards: { dados: DadosCard }[], eu: string): string {
  return temTarefaEmAndamento(cards, eu) ? ENTRADA_QUADRO : ENTRADA_Z;
}
