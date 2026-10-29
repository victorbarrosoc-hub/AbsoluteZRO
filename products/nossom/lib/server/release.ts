/**
 * Lançamento do NOSSOM: fechado ao público até o proprietário abrir (PRD §5, Etapa B, 28/10/2026).
 *
 * Deny-by-default local: `RELEASE` (variável de ambiente) vale `closed` sempre que não for exatamente `released`,
 * inclusive sem a variável e com o HUB fora do ar. Abrir ao público exige mudar os dois lados: `released` aqui e o
 * produto liberado no HUB (a claim `zro_release` abaixo). Assim ninguém abre o NOSSOM sem querer.
 *
 * O HUB conta, no id_token, no access token e no `userinfo`, o estado do produto para aquela pessoa na claim
 * `zro_release` = { "<product_id>": "released" | "closed" | "allowed" }: `allowed` = fechado, mas esta conta está na
 * lista do proprietário. `zro_products` traz só os produtos que a pessoa pode usar. As duas ficam guardadas no vínculo
 * (`nossom_private.zro_links`) e na sessão cifrada; são relidas no login, ao ligar a conta, na renovação e em cada
 * pedido à API (`signedInAccount`). A conta autorizada vem do HUB pela claim, nunca por e-mail.
 *
 * `temAcesso()` é o único lugar que decide; páginas, proxy e APIs só perguntam a ele.
 */
export type ReleaseState = 'closed' | 'released';
export type ZroReleaseValue = 'released' | 'closed' | 'allowed';
export type ZroRelease = Record<string, ZroReleaseValue>;
/** Id do NOSSOM nas claims `zro_products` e `zro_release` da Absolute ZRO. */
export const ZRO_PRODUCT = 'nossom';
const VALUES: ZroReleaseValue[] = ['released', 'closed', 'allowed'];

export function releaseState(): ReleaseState {
  return process.env.RELEASE?.trim() === 'released' ? 'released' : 'closed';
}
/** Fechado ao público: só a página institucional; estúdio, APIs, jobs, downloads e instalador negados. */
export const nossomClosed = () => releaseState() === 'closed';

/** Lê a claim `zro_release` (ou o que ficou guardado no vínculo) sem confiar em nada além dos três estados. */
export function readZroRelease(claim: unknown): ZroRelease {
  const release: ZroRelease = {};
  if (!claim || typeof claim !== 'object' || Array.isArray(claim)) return release;
  for (const [key, value] of Object.entries(claim as Record<string, unknown>).slice(0, 50))
    if (key.length <= 64 && VALUES.includes(value as ZroReleaseValue))
      release[key] = value as ZroReleaseValue;
  return release;
}

export type AccessClaims = {
  /** `zro_products` guardados no vínculo; ausente = conta sem vínculo com a Absolute ZRO. */
  zroProducts?: string[];
  /** `zro_release` guardada no vínculo; ausente = vínculo anterior à claim (ou conta sem vínculo). */
  zroRelease?: ZroRelease;
};
/**
 * A única regra de acesso ao NOSSOM:
 * - `allowed` no HUB abre sempre: a conta está na lista do proprietário.
 * - Com `RELEASE=closed` (padrão), todo o resto é negado: conta sem vínculo, vínculo sem a claim, `closed` e até
 *   `released` no HUB (abrir exige os dois lados).
 * - Com `RELEASE=released`, `closed` no HUB continua negado e o uso segue `zro_products` (direito de uso); conta sem
 *   vínculo volta a entrar como antes.
 */
export function temAcesso(claims: AccessClaims | null | undefined): boolean {
  const release = claims?.zroRelease?.[ZRO_PRODUCT];
  if (release === 'allowed') return true;
  if (releaseState() !== 'released') return false;
  if (release === 'closed') return false;
  if (Array.isArray(claims?.zroProducts)) return claims.zroProducts.includes(ZRO_PRODUCT);
  return true;
}

/** Login ou volta da Absolute ZRO recusados porque o NOSSOM está fechado para esta conta. */
export class AccessClosedError extends Error {
  readonly code = 'product_closed';
  constructor() {
    super('O NOSSOM está em desenvolvimento. Só contas autorizadas pela Absolute ZRO entram.');
  }
}
