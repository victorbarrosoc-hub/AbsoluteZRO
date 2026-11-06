import { avisar } from '@/lib/radio/nucleo'
import { rotaDoRadio } from '@/lib/radio/api'

/** POST /api/v1/radio/aviso { diaria, tipo } — aviso de set (só o dono e a Direção). Rádio do set (ADR 0042), não lançado. */
export const POST = rotaDoRadio(avisar, { mutation: true })
