// Tipos do gerador (o teste do HUB, tests/integration/radio.test.ts, importa `gerar` para conferir as cópias).
export const CABECALHO_NUCLEO: string
export const ARQUIVOS: Record<string, string>
export function gerar(): { nucleo: string; arquivos: string }
