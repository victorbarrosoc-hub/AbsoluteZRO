// Dólar automático dos Custos (migração 0030): a leitura da resposta do Banco Central (PTAX, Olinda), a volta até o
// último dia útil, os erros que interrompem, a regra de "busca velha" e a porta do agendamento (CRON_SECRET). Tudo
// com um Banco Central falso (servidor local); nada sai para a rede. O banco fica em custos.test.ts.
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buscarPtax, dataPtax, DOLAR_ESPERA_FALHA_MS, dolarPrecisaAtualizar, lerRespostaPtax, urlPtaxDoDia } from '@zro/core'

/** Banco Central falso: `dias` diz o que cada dia (MM-DD-YYYY) responde; o resto vem vazio. */
function bcbFalso() {
  const pedidos: string[] = []
  let dias: Record<string, unknown> = {}
  let status = 200
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url ?? '')
    pedidos.push(url)
    const dia = url.match(/@dataCotacao='(\d{2}-\d{2}-\d{4})'/)?.[1] ?? ''
    if (status !== 200) {
      res.writeHead(status).end('fora do ar')
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ '@odata.context': 'x', value: dias[dia] ?? [] }))
  })
  return {
    server,
    pedidos,
    definir(d: Record<string, unknown>, s = 200) {
      dias = d
      status = s
      pedidos.length = 0
    },
    get base() {
      return `http://127.0.0.1:${(server.address() as AddressInfo).port}/olinda/servico/PTAX/versao/v1/odata`
    },
  }
}

const bcb = bcbFalso()
beforeAll(() => new Promise<void>((ok) => bcb.server.listen(0, '127.0.0.1', ok)))
afterAll(() => new Promise<void>((ok) => bcb.server.close(() => ok())))

describe('resposta do Banco Central', () => {
  it('lê a venda com 4 casas e o dia da cotação', () => {
    expect(lerRespostaPtax({ value: [{ cotacaoCompra: 5.3414, cotacaoVenda: 5.342, dataHoraCotacao: '2026-10-28 13:05:31.600448' }] }, '2026-10-28')).toEqual({
      venda: 5.342,
      data: '2026-10-28',
      dataHora: '2026-10-28 13:05:31.600448',
      fonte: 'bcb-ptax',
    })
    // Vários boletins: vale o último (o de fechamento).
    expect(lerRespostaPtax({ value: [{ cotacaoVenda: 5.1 }, { cotacaoVenda: 5.123456 }] }, '2026-10-27')).toMatchObject({ venda: 5.1235, data: '2026-10-27' })
  })

  it('dia sem PTAX = null; formato estranho = erro (nada inventado)', () => {
    expect(lerRespostaPtax({ value: [] }, '2026-10-25')).toBeNull()
    expect(() => lerRespostaPtax({}, '2026-10-25')).toThrow('formato')
    expect(() => lerRespostaPtax(null, '2026-10-25')).toThrow('formato')
    expect(() => lerRespostaPtax({ value: [{ cotacaoVenda: 0 }] }, '2026-10-25')).toThrow('inválida')
    expect(() => lerRespostaPtax({ value: [{ cotacaoVenda: 'abc' }] }, '2026-10-25')).toThrow('inválida')
    expect(() => lerRespostaPtax({ value: [{ cotacaoVenda: 500 }] }, '2026-10-25')).toThrow('inválida')
  })

  it('a URL do Olinda pede o dia no formato MM-DD-YYYY', () => {
    expect(dataPtax('2026-10-28')).toBe('10-28-2026')
    expect(urlPtaxDoDia('2026-10-28')).toBe(
      "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='10-28-2026'&$format=json&$select=cotacaoCompra,cotacaoVenda,dataHoraCotacao",
    )
  })
})

describe('busca com volta ao último dia útil', () => {
  it('feriado e fim de semana: volta um dia por vez até a sexta', async () => {
    // 02/11/2026 (segunda, Finados), 01/11 (domingo), 31/10 (sábado): vazios. 30/10 (sexta) tem PTAX.
    bcb.definir({ '10-30-2026': [{ cotacaoCompra: 5.33, cotacaoVenda: 5.3391, dataHoraCotacao: '2026-10-30 13:04:00.000' }] })
    const c = await buscarPtax({ hoje: '2026-11-02', base: bcb.base })
    expect(c).toMatchObject({ venda: 5.3391, data: '2026-10-30', fonte: 'bcb-ptax' })
    expect(bcb.pedidos.map((u) => u.match(/'(.+?)'/)?.[1])).toEqual(['11-02-2026', '11-01-2026', '10-31-2026', '10-30-2026'])
  })

  it('dia útil com PTAX: um pedido só', async () => {
    bcb.definir({ '10-28-2026': [{ cotacaoVenda: 5.342, dataHoraCotacao: '2026-10-28 13:05:31.600' }] })
    expect((await buscarPtax({ hoje: '2026-10-28', base: bcb.base })).venda).toBe(5.342)
    expect(bcb.pedidos).toHaveLength(1)
  })

  it('erro HTTP interrompe; dez dias sem cotação também', async () => {
    bcb.definir({}, 503)
    await expect(buscarPtax({ hoje: '2026-10-28', base: bcb.base })).rejects.toThrow('503')
    expect(bcb.pedidos).toHaveLength(1)
    bcb.definir({})
    await expect(buscarPtax({ hoje: '2026-10-28', base: bcb.base })).rejects.toThrow('sem cotação nos últimos 10 dias')
    expect(bcb.pedidos).toHaveLength(10)
  })

  it('servidor que não responde estoura o tempo', async () => {
    const parado = http.createServer(() => {})
    await new Promise<void>((ok) => parado.listen(0, '127.0.0.1', ok))
    const base = `http://127.0.0.1:${(parado.address() as AddressInfo).port}`
    await expect(buscarPtax({ hoje: '2026-10-28', base, timeoutMs: 200 })).rejects.toThrow()
    parado.closeAllConnections()
    await new Promise<void>((ok) => parado.close(() => ok()))
  })
})

describe('quando buscar de novo', () => {
  const agora = new Date('2026-10-29T15:00:00Z')
  const ha = (ms: number) => new Date(agora.getTime() - ms).toISOString()
  it('nunca buscou ou passou de 24 h: busca; antes disso, não', () => {
    expect(dolarPrecisaAtualizar({ buscadaEm: null, erroEm: null }, agora)).toBe(true)
    expect(dolarPrecisaAtualizar({ buscadaEm: ha(25 * 3600_000), erroEm: null }, agora)).toBe(true)
    expect(dolarPrecisaAtualizar({ buscadaEm: ha(23 * 3600_000), erroEm: null }, agora)).toBe(false)
  })
  it('falhou há pouco: a página espera uma hora antes de tentar de novo', () => {
    expect(dolarPrecisaAtualizar({ buscadaEm: ha(30 * 3600_000), erroEm: ha(10 * 60_000) }, agora)).toBe(false)
    expect(dolarPrecisaAtualizar({ buscadaEm: null, erroEm: ha(10 * 60_000) }, agora)).toBe(false)
    expect(dolarPrecisaAtualizar({ buscadaEm: ha(30 * 3600_000), erroEm: ha(DOLAR_ESPERA_FALHA_MS + 1) }, agora)).toBe(true)
  })
})

describe('agendamento GET /api/cron/dolar', () => {
  it('sem CRON_SECRET configurado: 503; segredo errado ou ausente: 401 (nada é buscado)', async () => {
    const { GET } = await import('../../apps/hub-web/app/api/cron/dolar/route')
    const antes = process.env.CRON_SECRET
    try {
      delete process.env.CRON_SECRET
      expect((await GET(new Request('http://hub/api/cron/dolar', { headers: { authorization: 'Bearer x' } }))).status).toBe(503)
      process.env.CRON_SECRET = 'segredo-de-teste'
      bcb.definir({})
      expect((await GET(new Request('http://hub/api/cron/dolar'))).status).toBe(401)
      expect((await GET(new Request('http://hub/api/cron/dolar', { headers: { authorization: 'Bearer outro-segredo' } }))).status).toBe(401)
      expect((await GET(new Request('http://hub/api/cron/dolar', { headers: { authorization: 'segredo-de-teste' } }))).status).toBe(401)
      expect(bcb.pedidos).toHaveLength(0)
    } finally {
      if (antes == null) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = antes
    }
  })
})
