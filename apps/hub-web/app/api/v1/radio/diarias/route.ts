import { listarDiarias, mudarDiarias } from '@/lib/radio/nucleo'
import { rotaDoRadio } from '@/lib/radio/api'

/**
 * GET /api/v1/radio/diarias — as diárias da pessoa. POST { acao: criar | entrar | funcao } — criar diária (quem cria é o
 * dono, na Direção), entrar pelo código, escolher a função. RADION (ADR 0042), não lançado: fora do gate, 404.
 */
export const GET = rotaDoRadio(listarDiarias, { comFoto: true })
export const POST = rotaDoRadio(mudarDiarias, { mutation: true, comFoto: true })
