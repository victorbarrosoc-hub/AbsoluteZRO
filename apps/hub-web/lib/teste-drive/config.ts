// Teste do Drive (/admin/teste-drive): o que a tela precisa do ambiente e a política de conteúdo (CSP) só desta rota.
// Tudo aqui é público por natureza (client ID, chave do Picker restrita por referenciador, número do projeto): não é
// segredo, mas a tela nunca mostra os valores, só se estão configurados. Configurados na Vercel em 31/10/2026.

export const ROTA_TESTE_DRIVE = '/admin/teste-drive'

export const VARIAVEIS = {
  clientId: 'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
  apiKey: 'NEXT_PUBLIC_GOOGLE_PICKER_API_KEY',
  appId: 'NEXT_PUBLIC_GOOGLE_APP_ID',
} as const

export type ConfigTesteDrive = { clientId: string; apiKey: string; appId: string; clienteDoLogin: boolean }

/**
 * Lê as três variáveis. Sem NEXT_PUBLIC_GOOGLE_CLIENT_ID, usa o cliente do Entrar com Google (GOOGLE_CLIENT_ID, o ID é
 * público; o segredo nunca sai do servidor). `faltam` lista os nomes ausentes, na ordem da tela.
 */
export function configDoTesteDrive(env: Record<string, string | undefined>): {
  config: ConfigTesteDrive | null
  faltam: string[]
  clienteDoLogin: boolean
} {
  const proprio = env[VARIAVEIS.clientId]?.trim() ?? ''
  const login = env.GOOGLE_CLIENT_ID?.trim() ?? ''
  const clientId = proprio || login
  const apiKey = env[VARIAVEIS.apiKey]?.trim() ?? ''
  const appId = env[VARIAVEIS.appId]?.trim() ?? ''
  const clienteDoLogin = !proprio && Boolean(login)
  const faltam = [!clientId && VARIAVEIS.clientId, !apiKey && VARIAVEIS.apiKey, !/^\d{6,20}$/.test(appId) && VARIAVEIS.appId].filter(
    (x): x is (typeof VARIAVEIS)[keyof typeof VARIAVEIS] => Boolean(x),
  )
  return { config: faltam.length ? null : { clientId, apiKey, appId, clienteDoLogin }, faltam, clienteDoLogin }
}

/** As diretivas de sempre (next.config.ts): valem em todas as rotas, inclusive nesta. */
export const CSP_BASE = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"

/**
 * CSP desta rota: scripts só do próprio site e do Google (Identity Services e api.js do Picker), chamadas só à API do
 * Drive e ao login do Google, quadros só do Picker. O 'unsafe-inline' é dos scripts que o Next põe na página (sem nonce
 * no HUB); 'unsafe-eval' e o WebSocket só no `next dev`. oauth2.googleapis.com é o fim do `revoke`.
 */
export function cspTesteDrive({ dev = false }: { dev?: boolean } = {}): string {
  return [
    CSP_BASE,
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''} https://accounts.google.com https://apis.google.com`,
    `connect-src 'self'${dev ? ' ws: wss:' : ''} https://accounts.google.com https://oauth2.googleapis.com https://content.googleapis.com https://www.googleapis.com`,
    'frame-src https://accounts.google.com https://docs.google.com https://content.googleapis.com',
  ].join('; ')
}

/**
 * Cabeçalhos desta rota (vêm depois da regra geral no next.config.ts, então vencem). O login do Google abre numa janela
 * que conversa com esta página: com o COOP same-origin do resto do site, a resposta não volta.
 */
export function cabecalhosTesteDrive({ dev = false }: { dev?: boolean } = {}) {
  return [
    { key: 'Content-Security-Policy', value: cspTesteDrive({ dev }) },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  ]
}
