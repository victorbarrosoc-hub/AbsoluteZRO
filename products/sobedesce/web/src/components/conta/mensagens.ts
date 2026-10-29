/** Textos dos `?erro=` que voltam do Google e do login. Frases curtas, sem alarme. */
export const ERROS_GOOGLE: Record<string, string> = {
  google_recusado: "Tudo bem, nada foi conectado.",
  google_email_em_uso: "Este e-mail já tem uma conta SOBEDESCE. Entre com a senha e conecte o Drive em Sua conta.",
  google_email_nao_verificado: "O Google não confirmou este e-mail. Use outra conta do Google.",
  google_sem_conta: "Ainda não tem conta? Crie com a Absolute ZRO e depois conecte o Drive.",
  google_devagar: "Muitas contas criadas daqui agora há pouco. Espere alguns minutos e tente de novo.",
  google_outra_conta: "Esta conta do Google já está ligada a outra conta SOBEDESCE. Entre naquela conta e remova o Drive de lá primeiro.",
  google_nao_e_login:
    "Este Google está conectado como Drive numa conta SOBEDESCE, mas não é o Google de entrar dela. Entre com o e-mail e a senha, ou com o Google escolhido para entrar.",
  google_sem_drive: "Faltou permitir o acesso ao Google Drive na tela do Google. Tente de novo e deixe essa opção marcada.",
  google_expirou: "A conexão com o Google demorou demais. Tente de novo.",
  google_erro: "O Google não completou a conexão. Tente de novo em instantes.",
  google_config: "O Google ainda não foi configurado neste servidor.",
  zro_recusado: "Tudo bem, nada foi conectado.",
  zro_sem_acesso: "Sua conta Absolute ZRO ainda não tem acesso ao SOBEDESCE.",
  zro_email_em_uso: "Este e-mail já tem uma conta SOBEDESCE. Entre como sempre e ligue a Absolute ZRO em Sua conta.",
  zro_email_nao_verificado: "Falta confirmar seu e-mail na Absolute ZRO. Reenvie o link, confirme e volte aqui.",
  zro_devagar: "Muitas contas criadas daqui agora há pouco. Espere alguns minutos e tente de novo.",
  zro_outra_conta: "Esta conta Absolute ZRO já está ligada a outra conta SOBEDESCE. Continue com outra conta Absolute ZRO.",
  zro_ja_ligada: "Esta conta SOBEDESCE já está ligada a outra conta Absolute ZRO. Desligue a atual primeiro.",
  zro_unico_login: "A Absolute ZRO é o único jeito de entrar nesta conta. Crie uma senha (Esqueci a senha) antes de desligar.",
  zro_expirou: "A entrada pela Absolute ZRO demorou demais. Tente de novo.",
  zro_erro: "A Absolute ZRO não completou a entrada. Tente de novo em instantes.",
  zro_config: "A entrada pela Absolute ZRO ainda não foi configurada neste servidor.",
};

export function mensagemDeErro(codigo: string | undefined): string | null {
  if (!codigo) return null;
  return ERROS_GOOGLE[codigo] ?? null;
}
