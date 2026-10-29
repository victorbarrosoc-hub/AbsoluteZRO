/**
 * Contas antigas sem vínculo com a Absolute ZRO (sem linha em contas_zro), decisão do titular de 29/10/2026: o
 * ecossistema (Maestro e as outras ferramentas) só acha o Google Drive de uma pessoa pelo vínculo. Ninguém é tirado da
 * conta: o site, o app do celular e o app do computador mostram, uma vez, "Agora sua conta é Absolute ZRO", com um
 * botão que usa o mesmo caminho de sempre (/api/zro/entrar?modo=vincular). Depois de ligar, a pessoa vai para as
 * Conexões da central (config.ts › conexoesZro).
 * Regras: a API nunca bloqueia por falta de vínculo (transferências e o motor do computador seguem); admin e saúde não
 * mudam; /dispositivo (liberar um computador) também não, porque o app do computador mostra a própria tela depois.
 */
import { zroConfigurado } from "./config";

export const TITULO_LIGAR_ZRO = "Agora sua conta é Absolute ZRO";
export const BOTAO_LIGAR_ZRO = "Continuar com Absolute ZRO";

/** A tela de ligar aparece para esta sessão? Só com a Absolute ZRO configurada neste servidor. */
export function precisaLigarZro(atual: { ligadoZro: boolean } | null | undefined): boolean {
  return Boolean(atual && !atual.ligadoZro && zroConfigurado());
}

/** O caminho de ligar (o modo=vincular de sempre). `volta`: onde mostrar um erro, se a ligação não der certo. */
export function caminhoLigarZro(volta: string): string {
  return `/api/zro/entrar?${new URLSearchParams({ modo: "vincular", volta })}`;
}
