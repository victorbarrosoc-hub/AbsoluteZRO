import { moderar } from '@/lib/radio/nucleo'
import { rotaDoRadio } from '@/lib/radio/api'

/**
 * POST /api/v1/radio/moderar { diaria, acao, alvo?, valor?, minutos? } — silenciar e reativar (pessoa, setor ou o set),
 * mover de setor, escolher o responsável, mudar o papel, tirar, pedir a palavra, ajustes e histórico (dono). Quem pode
 * o quê fica no banco (radio.moderar). RADION (ADR 0042), não lançado: fora do gate, 404.
 */
export const POST = rotaDoRadio(moderar, { mutation: true })
