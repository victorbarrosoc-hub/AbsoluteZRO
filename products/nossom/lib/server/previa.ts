/**
 * Prévia do titular no team grátis da Vercel (ZROFREE), sem o login da Absolute ZRO e sem banco, Stripe, GPU nem IA
 * ("só a interface", decisão do titular, 09/11/2026). A mesma porta de todos os apps não lançados
 * (products/camzro/api/_sessao.js):
 *
 * - `ZRO_CHAVE_PREVIA` (24+ caracteres) no projeto Vercel liga a porta. Sem a variável (o projeto oficial nunca a
 *   define) ou com menos de 24 caracteres, a porta não existe e nada muda.
 * - GET `/previa?chave=<a chave>` confere em tempo constante, grava o cookie `nossom-previa` com o HMAC-SHA256 da chave
 *   (nunca a chave), HttpOnly, Secure, SameSite=Lax, 30 dias, e manda para o estúdio (303). Chave errada: o mesmo que
 *   qualquer página fechada (vai para a Absolute ZRO), sem dizer que a porta existe.
 * - Com o cookie e sem conta: as páginas e o estúdio abrem com a conta de prévia (sem nome real, sem nuvem); o que
 *   depende de serviço responde "Indisponível nesta prévia." (503). A conta de verdade, quando existe, sempre vence.
 *
 * Web Crypto (crypto.subtle): roda igual no Node e no runtime de borda.
 */
import type { Account } from '../accounts';

export const PREVIA_COOKIE = 'nossom-previa';
export const PREVIA_S = 30 * 24 * 3600;
export const PREVIA_ERRO = 'Indisponível nesta prévia.';

/** A conta que o estúdio mostra na prévia: nada de dado de pessoa, nada de nuvem. */
export const CONTA_PREVIA: Account = Object.freeze({
  id: 'previa',
  name: 'Prévia',
  username: 'previa',
  email: 'previa@quasar.invalid',
  kind: 'supabase',
  isAdmin: false,
}) as Account;

/** A chave, se configurada e comprida o bastante; senão null (porta desligada). */
export function chavePrevia(): string | null {
  const k = String(process.env.ZRO_CHAVE_PREVIA || '').trim();
  return k.length >= 24 ? k : null;
}

const base64url = (bytes: ArrayBuffer) => {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** O valor do cookie: HMAC-SHA256 da chave sobre um rótulo fixo (o cookie nunca carrega a chave). */
export async function selo(chave: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(chave),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64url(
    await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('nossom:previa:v1')),
  );
}

/** Compara em tempo constante (sem depender de node:crypto). */
export function iguais(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

/** A chave digitada confere com a configurada. */
export function chaveConfere(digitada: string | null | undefined): boolean {
  const k = chavePrevia();
  return Boolean(
    k && typeof digitada === 'string' && digitada.length <= 256 && iguais(digitada, k),
  );
}

/** O cookie da prévia vale (porta ligada e o HMAC confere). */
export async function emPrevia(cookie: string | null | undefined): Promise<boolean> {
  const k = chavePrevia();
  if (!k || typeof cookie !== 'string' || !cookie || cookie.length > 100) return false;
  return iguais(cookie, await selo(k));
}

/** Set-Cookie da prévia (null apaga). */
export function previaCookie(valor: string | null): string {
  return valor
    ? `${PREVIA_COOKIE}=${valor}; Path=/; Max-Age=${PREVIA_S}; HttpOnly; Secure; SameSite=Lax`
    : `${PREVIA_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}
