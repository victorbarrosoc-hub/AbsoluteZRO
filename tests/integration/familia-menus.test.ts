// A família Absolute ZRO dentro de cada app (o menu com os outros apps): a mesma lista em todo lugar, só com o que está
// no ar, e o ícone de cada um é cópia do oficial (apps/hub-web/public/products). Cada app publica sozinho, com a
// própria cópia da lista e dos ícones (Root Directory = pasta do app); esta régua é o que mantém as cópias iguais.
// Lançou uma plataforma (gate aberto por migration, como a 0032 fez com o Relay)? Ela entra em NO_AR e o teste
// aponta cada menu que falta. NOSSOM, AEON e Revela ficam de fora até lançarem; o Carro do Freela (0041) entrou na
// revisão de 01/11/2026, e os endereços são os oficiais (nada de *.vercel.app).
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = path.resolve(__dirname, '../..')
const ler = (f: string) => readFileSync(path.join(RAIZ, f), 'utf8')

/** As plataformas no ar (zro.product_release 'released'), com o endereço oficial de cada uma. */
const NO_AR: Record<string, string> = {
  'carro-do-freela': 'https://carro.absolutezro.com',
  maestro: 'https://maestro.absolutezro.com',
  relay: 'https://relay.absolutezro.com',
  sobedesce: 'https://sobedesce.com',
  synquei: 'https://synquei.absolutezro.com',
  tpeasy: 'https://tpeasy.absolutezro.com',
}
const HUB = 'https://absolutezro.com'
const FECHADOS = /nossom|aeon|ai-edit|revela|finishing|vercel\.app/i
/** O ícone oficial (apps/hub-web/public/products): SVG, menos o do Carro do Freela, que é PNG. */
const ext = (id: string) => (id === 'carro-do-freela' ? 'png' : 'svg')

type Menu = {
  app: string
  arquivo: string
  /** O pedaço do arquivo que é o menu da família. */
  bloco: (texto: string) => string
  /** Onde mora o ícone de cada plataforma, a partir da raiz do repositório. */
  icone: (id: string) => string
  /** A órbita da página inicial do Relay lista só as plataformas (a Absolute ZRO fica no cabeçalho dela). */
  semHub?: boolean
}

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
    icone: (id) => `products/synquei/app/familia/${id}.${ext(id)}`,
  },
  {
    app: 'tpeasy',
    arquivo: 'products/tpeasy/app/index.html',
    bloco: entre(/<nav class="familia"/, /<\/nav>/),
    icone: (id) => `products/tpeasy/icons/familia/${id}.${ext(id)}`,
  },
  {
    app: 'carro-do-freela',
    arquivo: 'products/carro-do-freela/src/template.html',
    bloco: entre(/<div class="ladofam"/, /<\/div>/),
    icone: (id) => `products/carro-do-freela/src/midia/familia-${id}.${ext(id)}`,
  },
  {
    app: 'carro-do-freela',
    arquivo: 'products/carro-do-freela/src/template.html',
    bloco: entre(/<div class="mn-g mn-fam" id="g-fam"/, /<\/div>/),
    icone: (id) => `products/carro-do-freela/src/midia/familia-${id}.${ext(id)}`,
  },
  {
    app: 'sobedesce',
    arquivo: 'products/sobedesce/public/components/sidebar.js',
    bloco: entre(/const FAMILIA = \[/, /\n\n/),
    icone: (id) => `products/sobedesce/public/familia/${id}.${ext(id)}`,
  },
  {
    app: 'sobedesce',
    arquivo: 'products/sobedesce/web/public/app/components/settings.js',
    bloco: entre(/const FAMILIA = \[/, /\n\n/),
    icone: (id) => `products/sobedesce/web/public/app/icons/familia/${id}.${ext(id)}`,
  },
  {
    app: 'relay',
    arquivo: 'products/relay/app/home.js',
    bloco: entre(/export const FAMILIA = \[/, /\n\]/),
    icone: (id) => `products/relay/marca/familia/${id}.${ext(id)}`,
    semHub: true,
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
        ...(menu.semHub ? [] : [HUB]),
        ...Object.entries(NO_AR)
          .filter(([id]) => id !== menu.app)
          .map(([, url]) => url),
      ].sort()
      expect([...enderecos(bloco)].sort()).toEqual(esperado)
      expect(bloco).not.toMatch(FECHADOS)
      for (const id of Object.keys(NO_AR).filter((i) => i !== menu.app)) {
        const copia = menu.icone(id)
        expect(existsSync(path.join(RAIZ, copia)), copia).toBe(true)
        const oficial = readFileSync(path.join(RAIZ, `apps/hub-web/public/products/${id}.${ext(id)}`))
        expect(readFileSync(path.join(RAIZ, copia)).equals(oficial), copia).toBe(true)
      }
    })
  }
})
