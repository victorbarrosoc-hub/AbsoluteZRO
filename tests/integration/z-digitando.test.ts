// A sugestão que se escreve sozinha no campo da Z (public/ia/v1/digitando.js), com o relógio andado à mão: a ordem
// (escreve, segura, apaga, próxima), a pausa com a aba escondida ou o campo fora da tela, a parada no foco e quando a
// pessoa escreve, o Tab que completa e o "reduzir movimento".
import { describe, expect, test } from 'vitest'
import { Digitando, RITMO, descricaoSugestoes, type Quadro } from '../../apps/hub-web/public/ia/v1/digitando.js'

function relogio() {
  let agora = 0
  let seq = 0
  const fila = new Map<number, { em: number; f: () => void }>()
  return {
    agendar: (f: () => void, ms: number) => {
      fila.set(++seq, { em: agora + ms, f })
      return seq
    },
    cancelar: (id: unknown) => void fila.delete(id as number),
    pendentes: () => fila.size,
    /** Anda `ms` disparando o que vence no caminho, em ordem. */
    andar(ms: number) {
      const fim = agora + ms
      for (;;) {
        const prox = [...fila.entries()].filter(([, t]) => t.em <= fim).sort((a, b) => a[1].em - b[1].em)[0]
        if (!prox) break
        fila.delete(prox[0])
        agora = prox[1].em
        prox[1].f()
      }
      agora = fim
    },
    get agora() {
      return agora
    },
  }
}

const FRASES = ['Resuma meus projetos', 'O que pede atenção hoje?'] as const

function montar(o: { reduzido?: boolean } = {}) {
  const r = relogio()
  const quadros: Quadro[] = []
  const m = new Digitando({ frases: FRASES, reduzido: o.reduzido, relogio: r, sorte: () => 0.5, aoMudar: (q) => quadros.push(q) })
  return { r, m, quadros, ultimo: () => quadros[quadros.length - 1]! }
}

describe('Digitando: a sugestão que se escreve no campo da Z', () => {
  test('só começa com o campo à vista, e escreve letra a letra no ritmo (35 a 55 ms)', () => {
    const { r, m } = montar()
    expect(m.rodando).toBe(false)
    r.andar(5000)
    expect(m.texto).toBe('')
    m.definir({ visivel: true })
    r.andar(RITMO.inicio - 1)
    expect(m.texto).toBe('')
    r.andar(1)
    expect(m.texto).toBe('R')
    r.andar(45)
    expect(m.texto).toBe('Re')
    // escreve a frase inteira em ~45 ms por letra
    r.andar(45 * (FRASES[0].length - 2))
    expect(m.texto).toBe(FRASES[0])
    expect(m.fase).toBe('segurando')
  })

  test('o ritmo varia entre 35 e 55 ms, com um respiro depois da pontuação', () => {
    const atrasos: number[] = []
    for (const sorte of [0, 0.25, 0.5, 0.75, 0.999]) {
      const r = relogio()
      let ultimo = 0
      const m = new Digitando({ frases: ['Oi, Z'], relogio: r, sorte: () => sorte })
      m.definir({ visivel: true })
      r.andar(RITMO.inicio)
      ultimo = r.agora
      r.andar(1)
      while (m.texto.length < 2) r.andar(1)
      atrasos.push(r.agora - ultimo)
    }
    expect(Math.min(...atrasos)).toBeGreaterThanOrEqual(35)
    expect(Math.max(...atrasos)).toBeLessThanOrEqual(55)
    const r = relogio()
    const m = new Digitando({ frases: ['Oi, Z'], relogio: r, sorte: () => 0.5 })
    m.definir({ visivel: true })
    r.andar(RITMO.inicio + 45 * 2)
    expect(m.texto).toBe('Oi,')
    r.andar(45)
    expect(m.texto).toBe('Oi,')
    r.andar(RITMO.pontuacao)
    expect(m.texto).toBe('Oi, ')
  })

  test('segura ~1,6 s, apaga mais rápido (20 ms por letra), respira e escreve a próxima, em ciclo', () => {
    const { r, m } = montar()
    m.definir({ visivel: true })
    r.andar(RITMO.inicio + 45 * (FRASES[0].length - 1))
    expect(m.texto).toBe(FRASES[0])
    r.andar(RITMO.segura - 1)
    expect(m.texto).toBe(FRASES[0])
    r.andar(1)
    expect(m.texto).toBe(FRASES[0].slice(0, -1))
    expect(m.fase).toBe('apagando')
    r.andar(RITMO.apaga * (FRASES[0].length - 1))
    expect(m.texto).toBe('')
    expect(m.fase).toBe('esperando')
    expect(m.frase).toBe(FRASES[1])
    r.andar(RITMO.pausa)
    expect(m.texto).toBe('O')
    // a segunda inteira, apagada, e volta para a primeira
    r.andar(45 * (FRASES[1].length - 1) + RITMO.segura + RITMO.apaga * FRASES[1].length + RITMO.pausa)
    expect(m.frase).toBe(FRASES[0])
    expect(m.texto).toBe('R')
  })

  test('aba escondida ou campo fora da tela: para onde está e segue de lá ao voltar', () => {
    const { r, m } = montar()
    m.definir({ visivel: true })
    r.andar(RITMO.inicio + 45 * 4)
    expect(m.texto).toBe('Resum')
    m.definir({ aba: false })
    expect(r.pendentes()).toBe(0)
    r.andar(10_000)
    expect(m.texto).toBe('Resum')
    m.definir({ aba: true })
    r.andar(45)
    expect(m.texto).toBe('Resuma')
    m.definir({ visivel: false })
    r.andar(10_000)
    expect(m.texto).toBe('Resuma')
    expect(r.pendentes()).toBe(0)
    m.definir({ visivel: true })
    r.andar(45)
    expect(m.texto).toBe('Resuma ')
  })

  test('foco: para na hora e mostra a sugestão inteira, parada; no blur com o campo vazio, retoma', () => {
    const { r, m, ultimo } = montar()
    m.definir({ visivel: true })
    r.andar(RITMO.inicio + 45 * 3)
    expect(m.texto).toBe('Resu')
    m.definir({ foco: true })
    expect(r.pendentes()).toBe(0)
    expect(m.texto).toBe(FRASES[0])
    expect(ultimo()).toMatchObject({ texto: FRASES[0], foco: true, cursor: false })
    r.andar(60_000)
    expect(m.texto).toBe(FRASES[0])
    m.definir({ foco: false })
    expect(ultimo().cursor).toBe(true)
    r.andar(RITMO.segura)
    expect(m.texto).toBe(FRASES[0].slice(0, -1))
  })

  test('focar entre uma sugestão e outra mostra a próxima inteira', () => {
    const { r, m } = montar()
    m.definir({ visivel: true })
    r.andar(RITMO.inicio + 45 * (FRASES[0].length - 1) + RITMO.segura + RITMO.apaga * FRASES[0].length)
    expect(m.texto).toBe('')
    m.definir({ foco: true })
    expect(m.texto).toBe(FRASES[1])
  })

  test('a pessoa escreve: a sugestão some; apagou tudo com o campo focado, a sugestão volta inteira', () => {
    const { r, m, ultimo } = montar()
    m.definir({ visivel: true })
    r.andar(RITMO.inicio + 45 * 5)
    m.definir({ foco: true })
    m.definir({ ocupado: true })
    expect(m.texto).toBe('')
    expect(ultimo()).toMatchObject({ texto: '', cursor: false })
    expect(r.pendentes()).toBe(0)
    m.definir({ ocupado: false })
    expect(m.texto).toBe(FRASES[0])
    // saiu do campo com texto: continua parada
    m.definir({ ocupado: true, foco: false })
    r.andar(10_000)
    expect(m.texto).toBe('')
    expect(r.pendentes()).toBe(0)
  })

  test('Tab ou → com o campo focado e vazio completam; com texto, sem foco ou outra tecla, nada', () => {
    const { r, m } = montar()
    m.definir({ visivel: true })
    r.andar(RITMO.inicio + 45 * 3)
    expect(m.tecla('Tab', true)).toBeNull() // sem foco, o Tab é do navegador
    m.definir({ foco: true })
    expect(m.tecla('Tab', true)).toBe(FRASES[0])
    expect(m.tecla('ArrowRight', true)).toBe(FRASES[0])
    expect(m.tecla('Tab', false)).toBeNull()
    expect(m.tecla('Enter', true)).toBeNull()
    expect(m.tecla('a', true)).toBeNull()
    // Esc dispensa: o Tab volta a andar o foco
    expect(m.dispensar()).toBe(true)
    expect(m.texto).toBe('')
    expect(m.tecla('Tab', true)).toBeNull()
    m.definir({ foco: false })
    m.definir({ foco: true })
    expect(m.tecla('Tab', true)).toBe(FRASES[0])
  })

  test('aceitar não envia: só devolve o texto inteiro da sugestão à mostra', () => {
    const { r, m } = montar()
    expect(m.aceitar()).toBeNull()
    m.definir({ visivel: true })
    r.andar(RITMO.inicio)
    expect(m.texto).toBe('R')
    expect(m.aceitar()).toBe(FRASES[0])
  })

  test('reduzir movimento: sem digitação, uma sugestão inteira que troca a cada ~4 s', () => {
    const { r, m, ultimo } = montar({ reduzido: true })
    m.definir({ visivel: true })
    expect(m.texto).toBe(FRASES[0])
    expect(ultimo().cursor).toBe(false)
    r.andar(RITMO.troca - 1)
    expect(m.texto).toBe(FRASES[0])
    r.andar(1)
    expect(m.texto).toBe(FRASES[1])
    expect(ultimo().troca).toBe(true)
    r.andar(RITMO.troca)
    expect(m.texto).toBe(FRASES[0])
    // e respeita as mesmas pausas
    m.definir({ aba: false })
    r.andar(20_000)
    expect(m.texto).toBe(FRASES[0])
    m.definir({ aba: true, foco: true })
    expect(r.pendentes()).toBe(0)
    expect(m.tecla('Tab', true)).toBe(FRASES[0])
  })

  test('sem sugestões, nada roda; trocar a lista recomeça do início', () => {
    const r = relogio()
    const m = new Digitando({ frases: [], relogio: r })
    m.definir({ visivel: true, foco: true })
    expect(m.texto).toBe('')
    expect(m.tecla('Tab', true)).toBeNull()
    expect(r.pendentes()).toBe(0)
    m.definir({ foco: false })
    m.frases = ['  ', 'Quantos créditos tenho?']
    expect(m.frases).toEqual(['Quantos créditos tenho?'])
    r.andar(RITMO.inicio)
    expect(m.texto).toBe('Q')
  })

  test('a descrição acessível lista as sugestões e o atalho, fixa', () => {
    expect(descricaoSugestoes(FRASES)).toBe('Sugestões: Resuma meus projetos; O que pede atenção hoje? Tab completa a sugestão.')
    expect(descricaoSugestoes(['Resuma meus projetos'])).toBe('Sugestões: Resuma meus projetos. Tab completa a sugestão.')
    expect(descricaoSugestoes([])).toBe('')
  })
})
