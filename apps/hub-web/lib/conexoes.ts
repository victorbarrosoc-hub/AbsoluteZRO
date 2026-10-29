import 'server-only'
import { chaveDasConexoes, googleUrls, type AmbienteAgenda, type GoogleAgendaConfig } from '@zro/core'
import { appOrigin, isProduction } from './env'

/**
 * Conexões (ADR 0026): o mesmo cliente OAuth do "Entrar com Google" (GOOGLE_CLIENT_ID/SECRET, "Absolute ZRO – central")
 * com o retorno /conexoes/google/retorno, e a chave ZRO_CONEXOES_KEY para cifrar os tokens. Sem qualquer um dos dois,
 * a tela mostra "indisponível" e a API responde 503: nunca guarda token em claro.
 * Em produção desde 29/10/2026 (projeto Vercel absolutezro). Trocar a chave obriga todo mundo a conectar de novo.
 * ZRO_GOOGLE_TESTE_URL (+ _CLIENT_ID/_CLIENT_SECRET) troca o Google por um falso, e só fora de produção (testes e2e).
 */
export function googleAgendaConfig(): GoogleAgendaConfig | null {
  // Só fora de produção: o Google falso dos testes, com um cliente próprio (o "Entrar com Google" segue desligado).
  const teste = !isProduction ? process.env.ZRO_GOOGLE_TESTE_URL?.trim() || null : null
  const clientId = ((teste && process.env.ZRO_GOOGLE_TESTE_CLIENT_ID) || process.env.GOOGLE_CLIENT_ID)?.trim()
  const clientSecret = ((teste && process.env.ZRO_GOOGLE_TESTE_CLIENT_SECRET) || process.env.GOOGLE_CLIENT_SECRET)?.trim()
  if (!clientId || !clientSecret) return null
  const origem = appOrigin.replace(/\/$/, '')
  return { clientId, clientSecret, redirectUri: `${origem}/conexoes/google/retorno`, conexoesUrl: `${origem}/conexoes`, ...googleUrls(teste) }
}

/** Google configurado e chave presente; senão null (a função fica indisponível). */
export function ambienteAgenda(): AmbienteAgenda | null {
  const cfg = googleAgendaConfig()
  const chave = chaveDasConexoes()
  return cfg && chave ? { cfg, chave } : null
}

export const CONEXAO_COOKIE = 'zro_conexao'
export const conexaoCookieOptions = { httpOnly: true, secure: isProduction, sameSite: 'lax' as const, path: '/conexoes/google', maxAge: 600 }

/** Textos do `?erro=` que a volta do Google deixa em /conexoes. */
export const CONEXAO_ERROS: Record<string, string> = {
  cancelado: 'Conexão cancelada. Nada mudou.',
  expirou: 'O pedido expirou. Tente de novo.',
  escopo: 'Marque as permissões da Agenda na tela do Google para conectar.',
  sem_refresh: 'O Google não deixou a conexão ficar ativa. Tente de novo.',
  google: 'O Google não completou a conexão. Tente de novo.',
  indisponivel: 'As Conexões estão indisponíveis agora.',
  outra_conta: 'Este pedido foi aberto em outra conta. Tente de novo.',
}

/** URL do SOBEDESCE (Drive): a conta lá, onde a pessoa conecta o Google Drive. */
export const sobedesceConta = () => `${(process.env.ZRO_SOBEDESCE_URL?.trim() || 'https://sobedesce.com').replace(/\/$/, '')}/conta`
