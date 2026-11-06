/**
 * Espelho dos instaladores em São Paulo (ADR 0043, 06/11/2026). No Brasil, o servidor de arquivos do GitHub chegava a
 * 5–64 KB/s numa internet de 210 Mbps; o mesmo arquivo sai a 16 MB/s de um servidor nos EUA (é a rota do GitHub até o
 * provedor). O GitHub Actions copia cada build para o bucket público `apps` do Supabase AbsoluteZRO-SP (sa-east-1,
 * dentro da cota do plano Pro) e grava o endereço da pasta no versao.json do Release, no campo `espelho`.
 *
 * O HUB só manda alguém para o espelho quando:
 * - o `espelho` do versao.json tem a forma exata do bucket (`https://<ref>.supabase.co/storage/v1/object/public/apps/<tag>`);
 * - o arquivo pedido responde ao HEAD (timeout curto) com o tamanho que o GitHub informa, quando ele informa.
 * Senão, o GitHub, como antes. A conferência do arquivo continua sendo o SHA-256 do catálogo (a central e o app conferem).
 *
 * Sem `server-only` e com fetch injetável para os testes (tests/integration/espelho.test.ts).
 */

export type DepsEspelho = { fetch?: typeof fetch; agora?: () => number }

/** A pasta de um Release no espelho: o bucket `apps`, uma pasta por tag. */
const PASTA = /^https:\/\/[a-z0-9]{20}\.supabase\.co\/storage\/v1\/object\/public\/apps\/[A-Za-z0-9._-]{1,80}$/
const ARQUIVO = /^[A-Za-z0-9._-]{1,120}$/
/** O host do espelho, para conferir um redirecionamento (o mesmo padrão da central, apps/hub-desktop/desktop/regras.cjs). */
export const ESPELHO_HOST = /^[a-z0-9]{20}\.supabase\.co$/

const TEMPO_MS = 2_500
const CACHE_SIM_MS = 10 * 60_000
const CACHE_NAO_MS = 60_000
const cache = new Map<string, { em: number; ok: boolean }>()

/** Para os testes. */
export function limparCacheEspelho() {
  cache.clear()
}

/** O `espelho` de um versao.json, se tiver a forma exata da pasta do bucket (sem barra no fim); senão null. */
export function pastaDoEspelho(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const v = valor.trim().replace(/\/+$/, '')
  return PASTA.test(v) ? v : null
}

/** O endereço do arquivo no espelho (null se a pasta ou o nome não tiverem a forma esperada). */
export function urlNoEspelho(pasta: string | null | undefined, arquivo: string): string | null {
  const p = pastaDoEspelho(pasta)
  return p && ARQUIVO.test(arquivo) ? `${p}/${arquivo}` : null
}

/** É um arquivo do espelho? (para conferir o destino de um redirecionamento) */
export function ehDoEspelho(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.port || u.username || u.password || !ESPELHO_HOST.test(u.hostname)) return false
    const i = u.pathname.lastIndexOf('/')
    return !!pastaDoEspelho(`${u.origin}${u.pathname.slice(0, i)}`) && ARQUIVO.test(u.pathname.slice(i + 1))
  } catch {
    return false
  }
}

/**
 * O arquivo está no espelho? HEAD com timeout curto; confere o tamanho quando `tamanho` vem. Resposta guardada (sim por
 * 10 min, não por 1 min) para o redirecionamento não pagar a ida a São Paulo toda vez.
 */
export async function estaNoEspelho(url: string | null, tamanho?: number | null, d: DepsEspelho = {}): Promise<boolean> {
  if (!url || !ehDoEspelho(url)) return false
  const agora = (d.agora ?? Date.now)()
  const chave = `${url}#${tamanho ?? ''}`
  const guardado = cache.get(chave)
  if (guardado && agora - guardado.em < (guardado.ok ? CACHE_SIM_MS : CACHE_NAO_MS)) return guardado.ok
  let ok = false
  try {
    const r = await (d.fetch ?? fetch)(url, { method: 'HEAD', signal: AbortSignal.timeout(TEMPO_MS), cache: 'no-store', redirect: 'manual' })
    const tam = Number(r.headers.get('content-length'))
    ok = r.status === 200 && (!tamanho || !Number.isFinite(tam) || tam === 0 || tam === tamanho)
    await r.body?.cancel().catch(() => {})
  } catch {
    ok = false
  }
  cache.set(chave, { em: agora, ok })
  return ok
}

/** `?origem=github` força o GitHub (a reserva da central); `?origem=espelho` pede o espelho. */
export type Origem = 'espelho' | 'github' | null

export function origemPedida(valor: string | null): Origem {
  return valor === 'espelho' || valor === 'github' ? valor : null
}
