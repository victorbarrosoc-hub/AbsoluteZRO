// Tipos de digitando.js (a sugestão que se escreve sozinha no campo da Z), para o HUB e os testes.
export type Ritmo = { letra: number; variacao: number; pontuacao: number; segura: number; apaga: number; pausa: number; inicio: number; troca: number }
export type Fase = 'inicio' | 'escrevendo' | 'segurando' | 'apagando' | 'esperando'
export type Quadro = { texto: string; frase: string; fase: Fase; foco: boolean; cursor: boolean; troca: boolean }
export type Relogio = { agendar: (f: () => void, ms: number) => unknown; cancelar: (id: unknown) => void }
export type Condicoes = { visivel: boolean; aba: boolean; foco: boolean; ocupado: boolean; dispensada: boolean; reduzido: boolean }

export const RITMO: Readonly<Ritmo>
export function descricaoSugestoes(frases: readonly string[]): string

export class Digitando {
  constructor(o?: {
    frases?: readonly string[]
    reduzido?: boolean
    aoMudar?: (e: Quadro) => void
    relogio?: Relogio
    sorte?: () => number
    ritmo?: Partial<Ritmo>
  })
  ritmo: Ritmo
  c: Condicoes
  fase: Fase
  i: number
  n: number
  aoMudar: (e: Quadro) => void
  get frases(): string[]
  set frases(l: readonly string[])
  readonly frase: string
  readonly texto: string
  readonly rodando: boolean
  definir(parcial: Partial<Condicoes>): void
  tecla(nome: string, vazio?: boolean): string | null
  aceitar(): string | null
  dispensar(): boolean
  parar(): void
  cancelar(): void
}

export function preencher(campo: HTMLTextAreaElement | HTMLInputElement, texto: string): void
export function ligarCampo(campo: HTMLTextAreaElement | HTMLInputElement, fantasma: HTMLElement, motor: Digitando): () => void
