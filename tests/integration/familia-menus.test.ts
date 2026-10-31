// A família Absolute ZRO dentro de cada app (o menu com os outros apps): a mesma lista em todo lugar, só com o que está
// no ar, e o ícone de cada um é cópia do oficial (apps/hub-web/public/products). Cada app publica sozinho, com a
// própria cópia da lista e dos ícones (Root Directory = pasta do app); esta régua é o que mantém as cópias iguais.
// Lançou uma plataforma (gate aberto por migration, como a 0032 fez com o Relay)? Ela entra em NO_AR e o teste
// aponta cada menu que falta. NOSSOM, AEON, Revela e Carro do Freela ficam de fora até lançarem.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = path.resolve(__dirname, '../..')
const ler = (f: string) => readFileSync(path.join(RAIZ, f), 'utf8')

/** As plataformas no ar (zro.product_release 'released'), com o endereço de produção (zro.products.external_url). */
const NO_AR: Record<string, string> = {
  maestro: 'https://maestro.absolutezro.com',
  relay: 'https://relay.absolutezro.com',
  sobedesce: 'https://sobedesce.vercel.app',
  synquei: 'https://synquei.vercel.app',
  tpeasy: 'https://tpeasy.absolutezro.com',
}
const HUB = 'https://absolutezro.com'
const FECHADOS = /nossom|aeon|ai-edit|revela|finishing|carro-?do-?freela|carrodofreela/i

type Menu = {
  app: string
  arquivo: string
  /** O pedaço do arquivo que é o menu da família. */
  bloco: (texto: string) => string
  /** Onde mora o ícone de cada plataforma, a partir da raiz do repositório. */
  icone: (id: string) => string
  /**
   * Menu num arquivo que dispara o build de computador: o endereço antigo ainda vale até o commit de computador (que
   * troca o menu e tira esta marca), para a parte web publicar antes sem esperar a autorização dos instaladores.
   */
  aceitaAntigo?: boolean
}

/** Endereço antigo → o de agora (o antigo continua no ar). */
const ANTIGOS: Record<string, string> = { 'https://tpeasy.vercel.app': 'https://tpeasy.absolutezro.com' }

const entre = (inicio: RegExp, fim: RegExp) => (texto: string) => {
  const i = texto.search(inicio)
  if (i < 0) throw new Error(`sem ${inicio}`)
  const j = texto.slice(i).search(fim)
  return texto.slice(i, i + j)
}

const MENUS: Menu[] = [
  {
    app: 'synquei',
    arquivo: 'products/synquei/app/index.html',
    bloco: entre(/<nav class="nav nav-familia"/, /<\/nav>/),
    icone: (id) => `products/synquei/app/familia/${id}.svg`,
    aceitaAntigo: true,
  },
  {
    app: 'tpeasy',
    arquivo: 'products/tpeasy/app/index.html',
    bloco: entre(/<nav class="familia"/, /<\/nav>/),
    icone: (id) => `products/tpeasy/icons/familia/${id}.svg`,
  },
  {
    app: 'carro-do-freela',
    arquivo: 'products/carro-do-freela/src/template.html',
    bloco: entre(/<div class="ladofam"/, /<\/div>/),
    icone: (id) => `products/carro-do-freela/src/midia/familia-${id}.svg`,
  },
  {
    app: 'carro-do-freela',
    arquivo: 'products/carro-do-freela/src/template.html',
    bloco: entre(/<div class="mn-g mn-fam" id="g-fam"/, /<\/div>/),
    icone: (id) => `products/carro-do-freela/src/midia/familia-${id}.svg`,
  },
  {
    app: 'sobedesce',
    arquivo: 'products/sobedesce/public/components/sidebar.js',
    bloco: entre(/const FAMILIA = \[/, /\n\n/),
    icone: (id) => `products/sobedesce/public/familia/${id}.svg`,
    aceitaAntigo: true,
  },
  {
    app: 'sobedesce',
    arquivo: 'products/sobedesce/web/public/app/components/settings.js',
    bloco: entre(/const FAMILIA = \[/, /\n\n/),
    icone: (id) => `products/sobedesce/web/public/app/icons/familia/${id}.svg`,
  },
]

/** Os endereços do menu, sem o que estiver comentado (um bloco maestro-familia fechado não conta). */
const enderecos = (bloco: string) =>
  [...bloco.replace(/<!--maestro-familia [\s\S]*? maestro-familia-->/g, '').matchAll(/href(?:=|: )["'](https:\/\/[^"']+)["']/g)].map((m) => m[1])

describe('a família Absolute ZRO nos menus dos apps', () => {
  for (const menu of MENUS) {
    it(`${menu.arquivo}: só as plataformas no ar, sem o próprio app, com o ícone oficial`, () => {
      const bloco = menu.bloco(ler(menu.arquivo))
      const esperado = [
        HUB,
        ...Object.entries(NO_AR)
          .filter(([id]) => id !== menu.app)
          .map(([, url]) => url),
      ].sort()
      expect([...enderecos(bloco)].map((u) => (menu.aceitaAntigo && u && ANTIGOS[u]) || u).sort()).toEqual(esperado)
      expect(bloco).not.toMatch(FECHADOS)
      for (const id of Object.keys(NO_AR).filter((i) => i !== menu.app)) {
        const copia = menu.icone(id)
        expect(existsSync(path.join(RAIZ, copia)), copia).toBe(true)
        const oficial = readFileSync(path.join(RAIZ, `apps/hub-web/public/products/${id}.svg`))
        expect(readFileSync(path.join(RAIZ, copia)).equals(oficial), copia).toBe(true)
      }
    })
  }
})
