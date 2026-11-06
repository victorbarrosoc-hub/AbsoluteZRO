// Tipos do espelho dos instaladores (o teste tests/integration/espelho-ci.test.ts importa as peças para conferir).
export type Config = { endpoint: string; chave: string; segredo: string; regiao: string; bucket: string }
export const BUCKET: string
export const REGIAO_PADRAO: string
export function configuracao(env?: Record<string, string | undefined>): Config | null
export function pastaPublica(endpoint: string, tag: string, bucket?: string): string | null
export function assinar(o: {
  metodo: string
  url: string
  cabecalhos?: Record<string, string>
  hashCorpo?: string
  chave: string
  segredo: string
  regiao: string
  servico?: string
  agora?: Date
}): Record<string, string>
export function enderecoS3(c: Config, chave?: string): string
export function lerLista(xml: string): { chaves: string[]; proxima: string | null }
export function sobras(chaves: string[], tag: string, manter: string[]): string[]
export function instaladoresDoVersao(v: unknown): { nome: string; sha256: string }[]
export function comEspelho<T extends object>(v: T, pasta: string): T & { espelho: string }
export function tipoDe(nome: string): string
export function subir(c: Config, chave: string, corpo: Buffer, o?: { f?: typeof fetch }): Promise<void>
export function listar(c: Config, prefixo: string, o?: { f?: typeof fetch }): Promise<string[]>
export function apagar(c: Config, chave: string, o?: { f?: typeof fetch }): Promise<void>
export function espelhar(o: {
  tag: string
  versaoJson: string
  env?: Record<string, string | undefined>
  f?: typeof fetch
  baixarDoRelease?: (tag: string, nome: string, pasta: string) => void | Promise<void>
}): Promise<{ pulado: true } | { pasta: string; arquivos: string[]; apagados: string[] }>
