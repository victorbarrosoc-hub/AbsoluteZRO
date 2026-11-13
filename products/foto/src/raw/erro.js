// O erro de leitura de RAW, num arquivo só para os leitores (dng.js, jpeg.js, libraw.js) e a porta de entrada
// (src/abrir.js) usarem a mesma classe sem importar uns aos outros em círculo.

/** Erro com motivo que a tela pode mostrar. `codigo`: 'nao-e-raw' | 'sem-suporte' | 'corrompido'. */
export class ErroRaw extends Error {
  constructor(codigo, mensagem) {
    super(mensagem)
    this.name = 'ErroRaw'
    this.codigo = codigo
  }
}
