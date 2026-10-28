import { describe, expect, it } from 'vitest'
import { resendSender } from '../src/email'

describe('resendSender', () => {
  it('envia pelo Resend do nao-responda, com resposta para o contato', async () => {
    const chamadas: { url: string; init: RequestInit }[] = []
    const fetcher = (async (url: string, init: RequestInit) => {
      chamadas.push({ url, init })
      return new Response('{"id":"x"}', { status: 200 })
    }) as unknown as typeof fetch
    await resendSender('chave-de-teste', fetcher).send({ to: 'pessoa@exemplo.com', subject: 'Oi', text: 'Corpo' })
    expect(chamadas[0]?.url).toBe('https://api.resend.com/emails')
    const body = JSON.parse(String(chamadas[0]?.init.body))
    expect(body).toMatchObject({
      from: 'Absolute ZRO <nao-responda@absolutezro.com>',
      reply_to: 'contato@absolutezro.com',
      to: ['pessoa@exemplo.com'],
      subject: 'Oi',
      text: 'Corpo',
    })
    expect((chamadas[0]?.init.headers as Record<string, string>).authorization).toBe('Bearer chave-de-teste')
  })

  it('falha alto quando o Resend recusa', async () => {
    const fetcher = (async () => new Response('{}', { status: 422 })) as unknown as typeof fetch
    await expect(resendSender('k', fetcher).send({ to: 'a@b.com', subject: 's', text: 't' })).rejects.toThrow('422')
  })
})
