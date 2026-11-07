import { bater } from '@/lib/radio/nucleo'
import { rotaDoRadio } from '@/lib/radio/api'

/**
 * POST /api/v1/radio/batida — o aparelho está na diária: presença, sinais de conexão (oferta e resposta WebRTC, apagados
 * ao ler) e avisos perdidos. A voz nunca passa pelo servidor. RADION (ADR 0042), não lançado: fora do gate, 404.
 */
export const POST = rotaDoRadio(bater, { mutation: true })
