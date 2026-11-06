import { avisar } from '@/lib/radio/nucleo'
import { rotaDoRadio } from '@/lib/radio/api'

/** POST /api/v1/radio/aviso { diaria, tipo, setor? } — aviso de set (dono e Direção; responsável, para o setor dele). RADION (ADR 0042), não lançado. */
export const POST = rotaDoRadio(avisar, { mutation: true })
