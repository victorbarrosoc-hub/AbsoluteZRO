export type Account = {
  id: string;
  name: string;
  username: string;
  email: string;
  kind: 'supabase';
  isAdmin: boolean;
  /** Version of the profile photo (upload time); absent when the person has none. */
  avatar?: number;
  /** Conta Absolute ZRO cuja organização ainda não tem o NOSSOM liberado (zro_products). */
  zroBlocked?: true;
  /**
   * Conta ligada à Absolute ZRO (perfil único): e-mail e organização do vínculo, a foto da conta
   * (endereço público do emissor) e onde editar nome, foto e e-mail.
   */
  zro?: { email?: string; organization?: string; picture?: string; manage: string };
  /** Dá para ligar a Absolute ZRO e a conta ainda não está ligada. */
  zroInvite?: true;
};
export function accountPlan(
  account: Pick<Account, 'isAdmin'>,
  usage?: { planName?: string; unlimited?: boolean } | null,
) {
  // "Ilimitado" só quando o saldo do servidor diz que é; antes dele chegar, só "ADM".
  return account.isAdmin
    ? usage?.unlimited
      ? 'ADM · Ilimitado'
      : 'ADM'
    : usage?.planName
      ? 'Plano ' + usage.planName
      : 'Plano Gratuito';
}
export function safeReturnPath(value: unknown) {
  if (typeof value !== 'string' || !/^\/studio(?:\/|\?|$)/.test(value)) return '/studio';
  return value.length < 2000 && !/[\\\r\n]/.test(value) ? value : '/studio';
}
