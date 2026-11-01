/**
 * Apps irmãos da Absolute ZRO que pedem a separação de faixas da NOSSOM pelo navegador da própria pessoa. Hoje, o
 * AEON (aeon.absolutezro.com): separa a voz e o instrumental de um clipe sem sair da edição (titular, 01/11/2026).
 *
 * Mesmo site (absolutezro.com), outra origem: o navegador manda o cookie de sessão da NOSSOM (SameSite=Lax vale entre
 * subdomínios do mesmo site) e a NOSSOM responde com CORS só para estas origens. A janela da NOSSOM não serve de ponte:
 * os dois apps usam COOP same-origin (isolamento entre origens para o WASM), que corta o `window.opener`.
 *
 * O irmão não ganha nada além do que a própria pessoa já tem: a autorização é a de sempre (sessão, portão de
 * lançamento, franquia mensal, um pedido por conta, sem repetir despacho ambíguo) e o irmão só pode separar faixas
 * (stems-v1). O áudio sobe com a pessoa sabendo: o AEON pergunta antes, com os minutos que vai usar.
 */
import { stemSeparation } from '@/lib/restoration';

/** Origens dos apps irmãos (exatas: esquema, host e porta). */
export const ORIGENS_IRMAS: readonly string[] = Object.freeze(['https://aeon.absolutezro.com']);
/** O que o irmão usa, e como: o pedido de separação (ler e pedir), a franquia e quem está logado (só ler). */
export const CAMINHOS_IRMAOS: Readonly<Record<string, string>> = Object.freeze({
  '/api/audio/jobs': 'GET, POST',
  '/api/usage': 'GET',
  '/api/account': 'GET',
});
/** O único tratamento que o irmão pode pedir. */
export const PRESETS_IRMAOS: readonly string[] = Object.freeze([stemSeparation.id]);

/** A origem do pedido, se for de um app irmão; senão null. */
export function origemIrma(request: Request): string | null {
  const origem = request.headers.get('origin');
  return origem && ORIGENS_IRMAS.includes(origem) ? origem : null;
}

export const caminhoIrmao = (path: string) => Object.hasOwn(CAMINHOS_IRMAOS, path);

/** CORS com credenciais para a origem irmã (nunca "*"). */
export function cabecalhosIrmao(origem: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origem,
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  };
}

/**
 * Pré-voo do CORS (OPTIONS): 204 só para origem irmã num caminho do irmão, com os métodos daquele caminho (POST só no
 * pedido de separação); o resto, 403 sem CORS.
 */
export function preVoo(request: Request, path: string): Response {
  const origem = origemIrma(request);
  if (!origem || !caminhoIrmao(path))
    return new Response(null, {
      status: 403,
      headers: { 'Cache-Control': 'no-store', Vary: 'Origin' },
    });
  return new Response(null, {
    status: 204,
    headers: {
      ...cabecalhosIrmao(origem),
      'Access-Control-Allow-Methods': CAMINHOS_IRMAOS[path],
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
      'Cache-Control': 'no-store',
    },
  });
}
