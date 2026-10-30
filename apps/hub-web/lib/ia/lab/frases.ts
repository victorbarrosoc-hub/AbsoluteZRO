/**
 * Texto da Z → frases para a voz (Laboratório da Z, ADR 0033). Puro, sem DOM: roda no navegador e nos testes.
 *
 * A resposta chega em pedaços; a voz começa na primeira frase fechada, sem esperar o resto. Frase curta demais espera a
 * próxima (soa mais natural e gasta menos chamadas); frase longa demais quebra na vírgula.
 */

/** Tira o que não se fala: markdown, links, emojis e símbolos soltos. */
export function paraFala(texto: string): string {
  return texto
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-•*]|\d+[.)])\s+/gm, '')
    .replace(/\*\*|__|\*|_(?=\S)|~~/g, '')
    .replace(/\p{Extended_Pictographic}|️/gu, '')
    .replace(/[|<>{}[\]^=#]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n+\s*/g, ' ')
    .trim()
}

const FIM = /[.!?…](?=\s|$)|\n/g

/** Junta pedaços e solta frases prontas para falar. `fechar()` solta o que sobrou. */
export class Frases {
  private resto = ''
  private primeira = true
  constructor(
    private readonly min = 28,
    private readonly max = 220,
  ) {}

  /** Recebe um pedaço do texto e devolve as frases que fecharam. */
  empurrar(pedaco: string): string[] {
    this.resto += pedaco
    const prontas: string[] = []
    for (;;) {
      FIM.lastIndex = 0
      let corte = -1
      let m: RegExpExecArray | null
      while ((m = FIM.exec(this.resto))) {
        const fim = m.index + m[0].length
        // A primeira frase sai assim que fecha (a voz começa logo); as outras esperam ter um tamanho bom.
        if (this.primeira ? fim >= 2 : fim >= this.min) {
          corte = fim
          break
        }
      }
      if (corte < 0 && this.resto.length > this.max) {
        const virgula = this.resto.lastIndexOf(', ', this.max)
        corte = virgula > this.min ? virgula + 1 : this.resto.lastIndexOf(' ', this.max)
        if (corte <= 0) corte = this.max
      }
      if (corte < 0) break
      const frase = paraFala(this.resto.slice(0, corte))
      this.resto = this.resto.slice(corte)
      if (frase) {
        prontas.push(frase)
        this.primeira = false
      }
    }
    return prontas
  }

  fechar(): string[] {
    const frase = paraFala(this.resto)
    this.resto = ''
    return frase ? [frase] : []
  }
}
