// Os sons da Sonoplasta pela Absolute ZRO: os livres (Openverse) e o banco da pessoa no Drive (pelo SOBEDESCE). A busca,
// a pasta e o arquivo de cada som passam pelo próprio app (/api/zro/sons/*:
// na Vercel, api/_sons.js; no app de computador, desktop/main.cjs), com o token da conta da pessoa. Erro vira uma frase
// para a tela (sem conta, limite do banco, fonte fora), nunca um som inventado.

export class ErroSons extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function falha(r) {
  const j = await r.json().catch(() => ({}))
  if (r.status === 401) return new ErroSons('Entre de novo com a conta Absolute ZRO para buscar sons.', 401)
  if (r.status === 403 && !j.message) return new ErroSons('A busca de sons ainda não está liberada para esta conta.', 403)
  return new ErroSons(j.message || 'O banco de sons não respondeu. Tente de novo em instantes.', r.status)
}

/** { sons, pagina, paginas } */
export async function buscar(q, pagina = 1) {
  let r
  try {
    r = await fetch(`/api/zro/sons/buscar?${new URLSearchParams({ q, pagina: String(pagina) })}`, { credentials: 'same-origin', cache: 'no-store' })
  } catch {
    throw new ErroSons('Sem conexão agora. Confira a internet e tente de novo.', 0)
  }
  if (!r.ok) throw await falha(r)
  return r.json()
}

/** Uma página da pasta do banco no Drive: { pasta, conta, pastas, sons, proxima }. */
export async function listarBanco(pasta, { q = '', conta = '', pagina = '' } = {}) {
  let r
  try {
    r = await fetch(`/api/zro/sons/banco?${new URLSearchParams(Object.entries({ pasta, q, conta, pagina }).filter(([, v]) => v))}`, { credentials: 'same-origin', cache: 'no-store' })
  } catch {
    throw new ErroSons('Sem conexão agora. Confira a internet e tente de novo.', 0)
  }
  if (!r.ok) throw await falha(r)
  return r.json()
}

/**
 * URL para ouvir antes de escolher (o mesmo arquivo, pela mesma origem). s: um resultado da busca ({ origem, id, conta })
 * ou a origem de um som do projeto ({ tipo, id, conta }).
 */
export function urlDoSom(s) {
  const tipo = s.origem && typeof s.origem === 'string' ? s.origem : s.tipo
  if (tipo === 'banco') return `/api/zro/sons/banco/${encodeURIComponent(s.id)}${s.conta ? `?${new URLSearchParams({ conta: s.conta })}` : ''}`
  return `/api/zro/sons/openverse/${encodeURIComponent(s.id)}`
}

/** O arquivo do som (Blob), conferindo que veio o som pedido. */
export async function baixar(s) {
  let r
  try {
    r = await fetch(urlDoSom(s), { credentials: 'same-origin' })
  } catch {
    throw new ErroSons('Sem conexão agora. Confira a internet e tente de novo.', 0)
  }
  if (!r.ok) throw await falha(r)
  if (r.headers.get('x-zro-som-id') && r.headers.get('x-zro-som-id') !== s.id) throw new ErroSons('Veio outro som. Tente de novo.', 502)
  return r.blob()
}
