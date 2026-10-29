/** Textos curtos das telas de entrada (?erro=<codigo>). Tom humano, sem termo técnico. */

export const MENSAGENS_DE_ERRO: Record<string, string> = {
  zro_config: "O login com Absolute ZRO ainda não está configurado neste endereço.",
  zro_erro: "Não deu para entrar com a Absolute ZRO agora. Tente de novo.",
  zro_expirou: "O login demorou demais. Tente de novo.",
  zro_recusado: "Você não permitiu a entrada. Quando quiser, tente de novo.",
  zro_sem_org: "Sua conta Absolute ZRO ainda não tem uma organização. Crie uma em absolutezro.com e volte.",
  zro_devagar: "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.",
};

export function mensagemDeErro(codigo: string | null | undefined): string | null {
  return codigo ? (MENSAGENS_DE_ERRO[codigo] ?? MENSAGENS_DE_ERRO.zro_erro) : null;
}
