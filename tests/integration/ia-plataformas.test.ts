import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { guiaDasPlataformas, nomesDasPlataformas, PLATAFORMAS } from '../../apps/hub-web/lib/ia/plataformas'

describe('Z: o que cada plataforma faz', () => {
  it('cobre todos os produtos do catálogo, com ids que existem', () => {
    // Todo produto inserido em zro.products por alguma migration (0003 e as seguintes, como a 0019 do Maestro).
    const pasta = new URL('../../infra/migrations/', import.meta.url)
    const ids = readdirSync(pasta)
      .filter((f) => f.endsWith('.sql'))
      .flatMap((f) => [...readFileSync(new URL(f, pasta), 'utf8').matchAll(/^\s+\('([a-z-]+)', '[^']+', '(?:beta|active|coming_soon)'/gm)].map((m) => m[1]))
    expect(ids.length).toBeGreaterThan(5)
    expect(Object.keys(PLATAFORMAS).sort()).toEqual([...new Set(ids)].sort())
  })

  it('na Revela, aponta o Clonar LUT e o Meus looks para chegar na cor de um pacote', () => {
    const guia = guiaDasPlataformas()
    expect(guia).toMatch(/Revela[\s\S]*Clonar LUT/)
    expect(guia).toMatch(/Meus looks/)
    expect(guia).toMatch(/pacote de LUTs pronto/)
  })

  it('o Drive só entra quando a pessoa pede; pergunta de como fazer vai para a plataforma', () => {
    const fonte = readFileSync(new URL('../../apps/hub-web/lib/ia/modelo.ts', import.meta.url), 'utf8')
    expect(fonte).toMatch(/Use o Drive só quando a pessoa pedir ou falar dele/)
    expect(fonte).not.toMatch(/sem pedir licença sempre que a pessoa falar de arquivo/)
    expect(fonte).toMatch(/\$\{guiaDasPlataformas\(abertas\)\}/)
  })

  it('o guia só cita as plataformas abertas para a pessoa (gate de lançamento, ADR 0023); as entradas continuam no arquivo', () => {
    const guia = guiaDasPlataformas(['sobedesce', 'synquei', 'tpeasy'])
    expect(guia).toMatch(/\[sobedesce\][\s\S]*\[synquei\][\s\S]*\[tpeasy\]/)
    expect(guia).not.toMatch(/\[(nossom|ai-edit|finishing|carro-do-freela)\]/)
    expect(Object.keys(PLATAFORMAS)).toEqual(expect.arrayContaining(['nossom', 'ai-edit', 'finishing', 'carro-do-freela']))
    expect(nomesDasPlataformas(['finishing', 'sobedesce'])).toEqual(['Revela', 'SOBEDESCE'])
    const fonte = readFileSync(new URL('../../apps/hub-web/lib/ia/modelo.ts', import.meta.url), 'utf8')
    expect(fonte).toMatch(/f\.acesso !== 'closed'/)
  })

  it('o Maestro: a Z só ganha ver_maestro (e o texto dele) com o Maestro aberto e contratado; o guia diz que é só leitura', () => {
    const fonte = readFileSync(new URL('../../apps/hub-web/lib/ia/modelo.ts', import.meta.url), 'utf8')
    expect(fonte).toMatch(/f\.id === MAESTRO_PRODUTO && f\.acesso === 'contracted'/)
    expect(fonte).toMatch(/FERRAMENTAS\.filter\(\(f\) => f\.name !== 'ver_maestro'\)/)
    expect(fonte).toMatch(/tools: ferramentas/)
    expect(fonte).toContain("${maestro ? `\\n${MAESTRO_NA_Z}\\n` : ''}")
    const guia = guiaDasPlataformas(['maestro'])
    expect(guia).toMatch(/ver_maestro/)
    expect(guia).toMatch(/Só leitura/)
    expect(guia).not.toMatch(/nada no ar/)
  })
})
