// Mensagens do "Continuar com Absolute ZRO" (vale para a tela de entrar e para Minha conta).
const messages: Record<string, string> = {
  zro_config: 'O acesso pela Absolute ZRO ainda não está disponível.',
  zro_expirou: 'O acesso demorou demais. Tente de novo.',
  zro_recusado: 'Você cancelou na Absolute ZRO. Nada mudou.',
  zro_erro: 'Não deu para falar com a Absolute ZRO agora. Tente de novo.',
  zro_devagar: 'Muitas tentativas. Aguarde alguns minutos.',
  zro_email_nao_verificado:
    'Confirme seu e-mail na Absolute ZRO antes de criar a conta NOSSOM por ela.',
  zro_email_em_uso:
    'Este e-mail já tem conta NOSSOM. Entre com sua senha e ligue a Absolute ZRO em Minha conta.',
  zro_outra_conta: 'Esta conta Absolute ZRO já está ligada a outra conta NOSSOM.',
  zro_ja_ligada: 'Sua conta já está ligada a outra conta Absolute ZRO.',
  zro_unico_login:
    'A Absolute ZRO é o único jeito de entrar nesta conta, então ela continua ligada.',
};

export function zroMessage(code: unknown) {
  return typeof code === 'string' && Object.hasOwn(messages, code) ? messages[code] : null;
}
