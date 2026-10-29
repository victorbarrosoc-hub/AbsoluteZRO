// Tipos do lado da página do stream do Drive (stream-pagina.js).
export type TokenDoDrive = { token: string; expiraEm: number; api: string }
export function criarStream(o: { swUrl?: string; escopo?: string; obterToken: (conta: string, o: { renovar: boolean }) => Promise<TokenDoDrive> }): {
  chave: string
  url(arquivo: { id: string; name?: string; mimeType?: string; size?: string | number | null }, conta?: string): string
  iniciar(espera?: number): Promise<boolean>
}
