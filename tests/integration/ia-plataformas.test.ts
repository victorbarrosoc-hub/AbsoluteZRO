import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { guiaDasPlataformas, nomesDasPlataformas, PLATAFORMAS } from '../../apps/hub-web/lib/ia/plataformas'

describe('Z: o que cada plataforma faz', () => {
  it('cobre todos os produtos do catálogo, com ids que existem', () => {
    const catalogo = readFileSync(new URL('../../infra/migrations/0003_catalog.sql', import.meta.url), 'utf8')
    const ids = [...catalogo.matchAll(/^\s+\('([a-z-]+)', '[^']+', '(?:beta|active|coming_soon)'/gm)].map((m) => m[1])
    expect(ids.length).toBeGreaterThan(5)
    expect(Object.keys(PLATAFORMAS).sort()).toEqual([...ids].sort())
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
})
