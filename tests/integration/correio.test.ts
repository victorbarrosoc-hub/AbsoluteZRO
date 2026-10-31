// Correio do console (ADR 0034): filtro por caixa, HTML seguro, montagem da resposta, configuração, erros do iCloud e o
// caminho inteiro (IMAP e SMTP) contra o iCloud falso local. Nada vai para a rede.
import { simpleParser } from 'mailparser'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CAIXAS_CORREIO } from '@zro/core'
import { testDatabase } from '@zro/db/testing'
import { cabecalhosDoAnexo, tipoSeguro } from '../../apps/hub-web/lib/correio/anexo'
import { buscaDaCaixa, daCaixa, destinosDaMensagem, lerCabecalhos } from '../../apps/hub-web/lib/correio/caixas'
import { assuntoDeResposta, gerarMime, lerDestinatarios, montarNova, montarResposta, type Original } from '../../apps/hub-web/lib/correio/compor'
import { configDoCorreio, ICLOUD_IMAP, ICLOUD_SMTP, type ConfigCorreio } from '../../apps/hub-web/lib/correio/config'
import { enviarDoCorreio } from '../../apps/hub-web/lib/correio/enviar'
import { MENSAGEM, motivoDoErro } from '../../apps/hub-web/lib/correio/erros'
import { cspDaMensagem, documentoDaMensagem, limparHtml } from '../../apps/hub-web/lib/correio/html'
import { abrirMensagem, baixarAnexo, guardarEnviada, listarMensagens } from '../../apps/hub-web/lib/correio/imap'
import { exigirConfig } from '../../apps/hub-web/lib/correio/servico'
import { iniciarIcloudFalso, type IcloudFalso } from '../fixtures/icloud-falso'
import { newUser } from './helpers'

const caixa = (id: 'victor' | 'contato' | 'financeiro') => CAIXAS_CORREIO.find((c) => c.id === id)!

const msg = (o: { de?: string; para?: string; cc?: string; extra?: string; assunto?: string; id?: string; corpo?: string; tipo?: string }) =>
  [
    `From: ${o.de ?? 'Cliente <cliente@exemplo.com>'}`,
    `To: ${o.para ?? 'contato@absolutezro.com'}`,
    ...(o.cc ? [`Cc: ${o.cc}`] : []),
    ...(o.extra ? [o.extra] : []),
    `Subject: ${o.assunto ?? 'Olá'}`,
    `Date: Fri, 30 Oct 2026 14:00:00 -0300`,
    `Message-ID: ${o.id ?? `<${Math.random().toString(36).slice(2)}@exemplo.com>`}`,
    'MIME-Version: 1.0',
    `Content-Type: ${o.tipo ?? 'text/plain; charset=utf-8'}`,
    '',
    o.corpo ?? 'Oi, tudo bem?',
    '',
  ].join('\r\n')

describe('caixas: o INBOX separado pelo alias', () => {
  it('To, Cc, Delivered-To e X-Original-To contam; maiúsculas não importam', () => {
    expect(destinosDaMensagem(msg({ para: 'Contato <CONTATO@absolutezro.com>' }))).toContain('contato@absolutezro.com')
    expect(daCaixa(destinosDaMensagem(msg({ para: 'x@y.com', cc: 'financeiro@absolutezro.com' })), caixa('financeiro'))).toBe(true)
    expect(daCaixa(destinosDaMensagem(msg({ para: 'lista@grupo.com', extra: 'Delivered-To: victor@absolutezro.com' })), caixa('victor'))).toBe(true)
    expect(daCaixa(destinosDaMensagem(msg({ para: 'lista@grupo.com', extra: 'X-Original-To: financeiro@absolutezro.com' })), caixa('financeiro'))).toBe(true)
  })
  it('endereço exato: trecho parecido não entra; grupo e linha dobrada sim', () => {
    expect(daCaixa(destinosDaMensagem(msg({ para: 'xcontato@absolutezro.com' })), caixa('contato'))).toBe(false)
    expect(daCaixa(destinosDaMensagem(msg({ para: 'contato@absolutezro.com.br' })), caixa('contato'))).toBe(false)
    expect(daCaixa(destinosDaMensagem(msg({ para: 'Equipe: a@b.com, financeiro@absolutezro.com;' })), caixa('financeiro'))).toBe(true)
    expect(daCaixa(destinosDaMensagem(msg({ para: 'a@b.com,\r\n  Victor <victor@absolutezro.com>' })), caixa('victor'))).toBe(true)
    expect(daCaixa(destinosDaMensagem(msg({ para: 'contato@absolutezro.com' })), caixa('financeiro'))).toBe(false)
  })
  it('cabeçalhos param no corpo e a busca do servidor cobre os quatro campos', () => {
    expect(lerCabecalhos('To: a@b.com\r\n\r\nTo: c@d.com').get('to')).toEqual(['a@b.com'])
    expect(buscaDaCaixa(caixa('contato')).or).toHaveLength(4)
  })
})

describe('HTML seguro', () => {
  it('tira script, evento, javascript:, iframe, formulário, base e meta', () => {
    const { html } = limparHtml(
      '<p onclick="x()">oi</p><script>alert(1)</script><a href="javascript:alert(1)">a</a><iframe src="https://mal.com"></iframe><form action="https://mal.com"><input name="s"></form><base href="https://mal.com"><meta http-equiv="refresh" content="0;url=https://mal.com"><img src=x onerror="alert(1)"><svg onload="alert(1)"></svg><object data="x"></object>',
    )
    expect(html).not.toMatch(/script|onclick|onerror|onload|javascript:|<iframe|<form|<input|<base|<meta|<svg|<object|alert/i)
    expect(html).toContain('<p>oi</p>')
  })
  it('imagem remota bloqueada por padrão (contada); com "Mostrar imagens" fica', () => {
    const fonte = '<img src="https://rastreio.com/p.gif" alt="logo"><img src="//cdn.com/a.png">'
    const bloq = limparHtml(fonte)
    expect(bloq.imagensBloqueadas).toBe(2)
    expect(bloq.html).not.toContain('rastreio.com')
    expect(bloq.html).not.toContain('cdn.com')
    expect(bloq.html).toContain('data-zro-bloqueada')
    const ok = limparHtml(fonte, { imagens: true })
    expect(ok.imagensBloqueadas).toBe(0)
    expect(ok.html).toContain('https://rastreio.com/p.gif')
  })
  it('CSS: url() remota e @import saem sem imagens; imagem embutida (cid:) vira data:', () => {
    const { html } = limparHtml(
      '<style>@import url(https://mal.com/x.css); .a{background:url("https://rastreio.com/b.png")}</style><div style="background-image:url(https://rastreio.com/c.png)">x</div><img src="cid:logo@zro">',
      { embutidas: new Map([['logo@zro', 'data:image/png;base64,AAAA']]) },
    )
    expect(html).not.toContain('@import')
    expect(html).not.toContain('rastreio.com')
    expect(html).toContain('src="data:image/png;base64,AAAA"')
  })
  it('link abre fora, sem referenciador; data: que não é imagem sai', () => {
    const { html } = limparHtml('<a href="https://site.com">s</a><img src="data:text/html;base64,PHNjcmlwdD4=">')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
    expect(html).not.toContain('data:text/html')
  })
  it('documento com CSP própria: nada de fora, nenhum script', () => {
    expect(cspDaMensagem(false)).toContain("default-src 'none'")
    expect(cspDaMensagem(false)).not.toContain('https:')
    expect(cspDaMensagem(true)).toContain('img-src data: https: http:')
    const doc = documentoDaMensagem('<p>oi</p>', false)
    expect(doc).toContain('http-equiv="Content-Security-Policy"')
    expect(doc).toContain('name="referrer" content="no-referrer"')
    expect(doc).not.toMatch(/script-src|<script/)
  })
})

const original: Original = {
  messageId: '<orig-2@exemplo.com>',
  references: ['<raiz@exemplo.com>', '<orig-1@exemplo.com>'],
  de: [{ nome: 'Cliente', endereco: 'cliente@exemplo.com' }],
  replyTo: [{ nome: 'Atendimento', endereco: 'responda@exemplo.com' }],
  para: [
    { nome: '', endereco: 'contato@absolutezro.com' },
    { nome: 'Sócia', endereco: 'socia@exemplo.com' },
  ],
  cc: [
    { nome: '', endereco: 'financeiro@absolutezro.com' },
    { nome: '', endereco: 'responda@exemplo.com' },
  ],
  assunto: 'Orçamento',
  data: new Date('2026-10-30T17:00:00Z'),
  texto: 'Linha 1\nLinha 2',
}

describe('montagem da resposta', () => {
  it('From e Reply-To = alias da caixa; To = Reply-To do original; Re:, In-Reply-To e References certos', async () => {
    const s = montarResposta(caixa('contato'), original, { texto: 'Obrigado!' })
    expect(s.de.endereco).toBe('contato@absolutezro.com')
    expect(s.replyTo.endereco).toBe('contato@absolutezro.com')
    expect(s.para.map((e) => e.endereco)).toEqual(['responda@exemplo.com'])
    expect(s.cc).toEqual([])
    expect(s.assunto).toBe('Re: Orçamento')
    expect(s.inReplyTo).toBe('<orig-2@exemplo.com>')
    expect(s.references).toEqual(['<raiz@exemplo.com>', '<orig-1@exemplo.com>', '<orig-2@exemplo.com>'])
    expect(s.texto).toMatch(/^Obrigado!\n\nEm 30\/10\/2026, 14:00, Cliente <cliente@exemplo.com> escreveu:\n> Linha 1\n> Linha 2/)

    const mime = await gerarMime(s, { messageId: '<nova@absolutezro.com>', data: new Date('2026-10-31T12:00:00Z') })
    expect(mime.envelope).toEqual({ from: 'contato@absolutezro.com', to: ['responda@exemplo.com'] })
    const p = await simpleParser(mime.raw)
    expect(p.from?.value[0]?.address).toBe('contato@absolutezro.com')
    expect(p.replyTo?.value[0]?.address).toBe('contato@absolutezro.com')
    expect(p.inReplyTo).toBe('<orig-2@exemplo.com>')
    expect(p.references).toEqual(['<raiz@exemplo.com>', '<orig-1@exemplo.com>', '<orig-2@exemplo.com>'])
    expect(p.messageId).toBe('<nova@absolutezro.com>')
    expect(p.subject).toBe('Re: Orçamento')
  })
  it('sem Reply-To responde ao From; "todos" põe To/Cc em cópia, sem os aliases da casa nem repetidos', () => {
    const s = montarResposta(caixa('financeiro'), { ...original, replyTo: [] }, { texto: 'ok', todos: true })
    expect(s.para.map((e) => e.endereco)).toEqual(['cliente@exemplo.com'])
    expect(s.cc.map((e) => e.endereco)).toEqual(['socia@exemplo.com', 'responda@exemplo.com'])
    expect(montarResposta(caixa('contato'), original, { texto: 'ok', todos: true }).cc.map((e) => e.endereco)).toEqual(['socia@exemplo.com'])
  })
  it('assunto já com Re: não dobra; Message-ID estranho não vira cabeçalho', () => {
    expect(assuntoDeResposta('RE: Oi')).toBe('RE: Oi')
    expect(assuntoDeResposta('')).toBe('Re: (sem assunto)')
    const s = montarResposta(caixa('contato'), { ...original, messageId: 'sem-colchetes\r\nBcc: x@y.com', references: ['<a@b>\r\nX: y'] }, { texto: 'ok' })
    expect(s.inReplyTo).toBeNull()
    expect(s.references).toEqual([])
  })
  it('resposta vazia, e-mail novo sem destinatário ou com endereço inválido: recusa', () => {
    expect(() => montarResposta(caixa('contato'), original, { texto: '  ' })).toThrow(/Escreva/)
    expect(() => montarNova(caixa('contato'), { para: '', assunto: 'a', texto: 'b' })).toThrow(/Para quem/)
    expect(() => montarNova(caixa('contato'), { para: 'nao-e-email', assunto: 'a', texto: 'b' })).toThrow(/inválido/)
    expect(() => montarNova(caixa('contato'), { para: Array.from({ length: 21 }, (_, i) => `p${i}@x.com`).join(','), assunto: 'a', texto: 'b' })).toThrow(/20/)
    const n = montarNova(caixa('victor'), { para: 'Fulano <F@X.com>, f@x.com', assunto: 'Linha\r\nBcc: injetado@x.com', texto: 'oi' })
    expect(n.para).toEqual([{ nome: 'Fulano', endereco: 'f@x.com' }])
    expect(n.assunto).toBe('Linha Bcc: injetado@x.com')
    expect(lerDestinatarios('a@b.com; c@d.com', 'Para')).toHaveLength(2)
  })
})

describe('configuração e erros', () => {
  it('sem as variáveis: não configurado, com os nomes que faltam', () => {
    expect(configDoCorreio({})).toEqual({ config: null, faltam: ['ICLOUD_MAIL_USER', 'ICLOUD_MAIL_APP_PASSWORD'] })
    expect(configDoCorreio({ ICLOUD_MAIL_USER: 'a@icloud.com' }).faltam).toEqual(['ICLOUD_MAIL_APP_PASSWORD'])
    expect(() => exigirConfig({})).toThrow('Correio não configurado.')
  })
  it('com elas: iCloud de verdade (TLS 993 e STARTTLS 587); servidor de teste só local e fora de produção', () => {
    const base = { ICLOUD_MAIL_USER: 'a@icloud.com', ICLOUD_MAIL_APP_PASSWORD: 'abcd efgh ijkl mnop' }
    const c = configDoCorreio(base).config!
    expect(c.senha).toBe('abcdefghijklmnop')
    expect(c.imap).toEqual(ICLOUD_IMAP)
    expect(c.smtp).toEqual(ICLOUD_SMTP)
    expect(c.imap).toMatchObject({ host: 'imap.mail.me.com', port: 993, secure: true })
    expect(c.smtp).toMatchObject({ host: 'smtp.mail.me.com', port: 587, requireTLS: true })
    const teste = { ...base, ZRO_CORREIO_TESTE_IMAP: '127.0.0.1:1143', ZRO_CORREIO_TESTE_SMTP: '127.0.0.1:1587' }
    expect(configDoCorreio(teste).config!.imap).toEqual({ host: '127.0.0.1', port: 1143, secure: false })
    expect(configDoCorreio({ ...teste, ZRO_ENV: 'production' }).config!.imap).toEqual(ICLOUD_IMAP)
    expect(configDoCorreio({ ...base, ZRO_CORREIO_TESTE_IMAP: 'mal.com:143' }).config!.imap).toEqual(ICLOUD_IMAP)
  })
  it('erro do iCloud vira mensagem clara', () => {
    expect(motivoDoErro({ authenticationFailed: true })).toBe('senha')
    expect(motivoDoErro({ code: 'EAUTH' })).toBe('senha')
    expect(motivoDoErro({ code: 'ETIMEDOUT' })).toBe('demora')
    expect(motivoDoErro({ code: 'ENOTFOUND' })).toBe('fora')
    expect(motivoDoErro({ code: 'EENVELOPE', message: 'Sender address rejected' })).toBe('remetente')
    expect(motivoDoErro(new Error('???'))).toBe('geral')
  })
  it('anexo sempre como download; tipo perigoso vira octet-stream', () => {
    expect(tipoSeguro('text/html')).toBe('application/octet-stream')
    expect(tipoSeguro('image/svg+xml')).toBe('application/octet-stream')
    expect(tipoSeguro('application/pdf; name=x')).toBe('application/pdf')
    const h = cabecalhosDoAnexo({ nome: 'Nota fiscal "1".pdf', tipo: 'application/pdf', conteudo: Buffer.from('x') })
    expect(h['content-disposition']).toMatch(/^attachment; filename="Nota fiscal _1_.pdf"; filename\*=UTF-8''/)
    expect(h['x-content-type-options']).toBe('nosniff')
    expect(h['content-security-policy']).toContain('sandbox')
  })
})

describe('IMAP e SMTP (iCloud falso local)', () => {
  let ic: IcloudFalso
  let cfg: ConfigCorreio
  const db = testDatabase()

  beforeAll(async () => {
    ic = await iniciarIcloudFalso()
    cfg = configDoCorreio(ic.env).config!
    ic.receber(msg({ para: 'contato@absolutezro.com', assunto: 'Para o contato', id: '<c1@exemplo.com>' }))
    ic.receber(msg({ para: 'financeiro@absolutezro.com', assunto: 'Boleto de outubro', id: '<f1@exemplo.com>' }), { lida: true })
    ic.receber(msg({ para: 'victor@absolutezro.com', assunto: 'Pessoal do Victor', id: '<v1@exemplo.com>' }))
    ic.receber(msg({ para: 'lista@grupo.com', extra: 'X-Original-To: financeiro@absolutezro.com', assunto: 'Fatura pela lista', id: '<f2@exemplo.com>' }))
    ic.receber(msg({ para: 'xfinanceiro@absolutezro.com', assunto: 'Parecido, não é', id: '<x1@exemplo.com>' }))
    ic.receber(
      [
        'From: Banco <banco@exemplo.com>',
        'To: financeiro@absolutezro.com',
        'Subject: =?UTF-8?Q?Extrato_com_anexo?=',
        'Date: Sat, 31 Oct 2026 09:00:00 -0300',
        'Message-ID: <f3@exemplo.com>',
        'MIME-Version: 1.0',
        'Content-Type: multipart/mixed; boundary="b1"',
        '',
        '--b1',
        'Content-Type: text/html; charset=utf-8',
        '',
        '<p>Seu extrato</p><img src="https://rastreio.com/a.gif"><script>alert(1)</script>',
        '--b1',
        'Content-Type: application/pdf; name="extrato.pdf"',
        'Content-Disposition: attachment; filename="extrato.pdf"',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from('%PDF-1.4 extrato').toString('base64'),
        '--b1--',
        '',
      ].join('\r\n'),
    )
  })
  afterAll(() => ic.fechar())

  it('ordem pela chegada no iCloud, não pelo número da mensagem', async () => {
    const velha = ic.receber(msg({ para: 'victor@absolutezro.com', assunto: 'Chegou antes', id: '<v0@exemplo.com>' }), {
      data: new Date('2026-10-01T10:00:00Z'),
    })
    const lista = await listarMensagens(cfg, caixa('victor'))
    expect(lista.map((m) => m.assunto)).toEqual(['Pessoal do Victor', 'Chegou antes'])
    expect(lista[1]!.data).toBe('2026-10-01T10:00:00.000Z')
    ic.estado.pastas.get('INBOX')!.splice(ic.estado.pastas.get('INBOX')!.indexOf(velha), 1)
  })

  it('cada caixa vê só as suas, da mais nova para a mais antiga, com lida e anexo', async () => {
    const fin = await listarMensagens(cfg, caixa('financeiro'))
    expect(fin.map((m) => m.assunto)).toEqual(['Extrato com anexo', 'Fatura pela lista', 'Boleto de outubro'])
    expect(fin.map((m) => m.lida)).toEqual([false, false, true])
    expect(fin[0]).toMatchObject({ de: { nome: 'Banco', endereco: 'banco@exemplo.com' } })
    expect((await listarMensagens(cfg, caixa('contato'))).map((m) => m.assunto)).toEqual(['Para o contato'])
    expect((await listarMensagens(cfg, caixa('victor'))).map((m) => m.assunto)).toEqual(['Pessoal do Victor'])
    // a lista só lê (EXAMINE): nada é marcado
    expect(ic.estado.comandos).not.toContain('UID STORE')
  })

  it('abrir: HTML limpo com imagem bloqueada, anexo listado e marca como lida; outra caixa = 404', async () => {
    const [extrato] = await listarMensagens(cfg, caixa('financeiro'))
    const m = await abrirMensagem(cfg, caixa('financeiro'), extrato!.uid)
    expect(m.documento).toContain('Seu extrato')
    expect(m.documento).not.toContain('<script')
    expect(m.documento).not.toContain('rastreio.com')
    expect(m.imagensBloqueadas).toBe(1)
    expect(m.anexos).toEqual([{ indice: 0, nome: 'extrato.pdf', tipo: 'application/pdf', tamanho: 16 }])
    expect(
      ic.estado.pastas
        .get('INBOX')!
        .find((x) => x.uid === extrato!.uid)!
        .flags.has('\\Seen'),
    ).toBe(true)
    expect((await abrirMensagem(cfg, caixa('financeiro'), extrato!.uid, { imagens: true })).documento).toContain('https://rastreio.com/a.gif')

    const pessoal = ic.estado.pastas.get('INBOX')!.find((x) => x.raw.toString().includes('Pessoal do Victor'))!
    await expect(abrirMensagem(cfg, caixa('financeiro'), pessoal.uid)).rejects.toMatchObject({ code: 'not_found' })
    await expect(abrirMensagem(cfg, caixa('financeiro'), 9999)).rejects.toMatchObject({ code: 'not_found' })
    expect(pessoal.flags.has('\\Seen')).toBe(false)
  })

  it('anexo sob demanda, com a mesma checagem de caixa', async () => {
    const [extrato] = await listarMensagens(cfg, caixa('financeiro'))
    const a = await baixarAnexo(cfg, caixa('financeiro'), extrato!.uid, 0)
    expect(a).toMatchObject({ nome: 'extrato.pdf', tipo: 'application/pdf' })
    expect(a.conteudo.toString()).toBe('%PDF-1.4 extrato')
    await expect(baixarAnexo(cfg, caixa('contato'), extrato!.uid, 0)).rejects.toMatchObject({ code: 'not_found' })
    await expect(baixarAnexo(cfg, caixa('financeiro'), extrato!.uid, 5)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('responder: sai pelo SMTP do alias, cópia em Sent Messages e auditoria sem corpo nem assunto', async () => {
    const quem = await newUser(db, 'correio')
    const [boleto] = (await listarMensagens(cfg, caixa('financeiro'))).filter((m) => m.assunto === 'Boleto de outubro')
    const antes = ic.estado.enviados.length
    const r = await enviarDoCorreio(db, cfg, quem, caixa('financeiro'), { texto: 'Pago, obrigado.', responderA: boleto!.uid })
    expect(r.copiaEmEnviadas).toBe(true)
    const saiu = ic.estado.enviados[antes]!
    expect(saiu.de).toBe('financeiro@absolutezro.com')
    expect(saiu.para).toEqual(['cliente@exemplo.com'])
    const p = await simpleParser(saiu.raw)
    expect(p.from?.value[0]?.address).toBe('financeiro@absolutezro.com')
    expect(p.inReplyTo).toBe('<f1@exemplo.com>')
    expect(p.subject).toBe('Re: Boleto de outubro')
    expect(p.text).toContain('Pago, obrigado.')
    const enviada = ic.estado.pastas.get('Sent Messages')!.at(-1)!
    expect(enviada.flags.has('\\Seen')).toBe(true)
    expect(enviada.raw.toString()).toContain(r.messageId)
    const [log] =
      await db.sql`select actor_user_id, action, target_id, metadata from zro.audit_logs where action = 'admin.correio_enviado' and actor_user_id = ${quem.userId}`
    expect(log).toMatchObject({ target_id: 'financeiro', metadata: { tipo: 'resposta', destinatarios: 1, copiaEmEnviadas: true } })
    expect(JSON.stringify(log!.metadata)).not.toMatch(/Pago|Boleto|cliente@/)
  })

  it('e-mail novo: From = caixa escolhida; responder a uma mensagem de outra caixa é recusado antes de enviar', async () => {
    const quem = await newUser(db, 'correio-novo')
    const antes = ic.estado.enviados.length
    await enviarDoCorreio(db, cfg, quem, caixa('contato'), { para: 'Pessoa <pessoa@exemplo.com>', assunto: 'Proposta', texto: 'Segue.' })
    expect(ic.estado.enviados[antes]).toMatchObject({ de: 'contato@absolutezro.com', para: ['pessoa@exemplo.com'] })
    const pessoal = ic.estado.pastas.get('INBOX')!.find((x) => x.raw.toString().includes('Pessoal do Victor'))!
    await expect(enviarDoCorreio(db, cfg, quem, caixa('financeiro'), { texto: 'x', responderA: pessoal.uid })).rejects.toMatchObject({ code: 'not_found' })
    expect(ic.estado.enviados.length).toBe(antes + 1)
  })

  it('SMTP que recusa o remetente ou a senha: erro claro, nada gravado em Enviadas nem auditado', async () => {
    const quem = await newUser(db, 'correio-erro')
    const enviadas = ic.estado.pastas.get('Sent Messages')!.length
    ic.estado.remetentes.delete('contato@absolutezro.com')
    await expect(enviarDoCorreio(db, cfg, quem, caixa('contato'), { para: 'p@exemplo.com', assunto: 'a', texto: 'b' })).rejects.toMatchObject({
      code: 'upstream_unavailable',
      message: MENSAGEM.remetente,
    })
    ic.estado.remetentes.add('contato@absolutezro.com')
    await expect(
      enviarDoCorreio(db, { ...cfg, senha: 'errada' }, quem, caixa('contato'), { para: 'p@exemplo.com', assunto: 'a', texto: 'b' }),
    ).rejects.toMatchObject({
      code: 'upstream_unavailable',
      message: MENSAGEM.senha,
    })
    expect(ic.estado.pastas.get('Sent Messages')!.length).toBe(enviadas)
    expect(await db.sql`select 1 from zro.audit_logs where action = 'admin.correio_enviado' and actor_user_id = ${quem.userId}`).toHaveLength(0)
  })

  it('IMAP com senha errada: mensagem da senha de app', async () => {
    await expect(listarMensagens({ ...cfg, senha: 'errada' }, caixa('contato'))).rejects.toMatchObject({
      code: 'upstream_unavailable',
      message: MENSAGEM.senha,
    })
    await expect(guardarEnviada({ ...cfg, senha: 'errada' }, Buffer.from('x'))).rejects.toMatchObject({ message: MENSAGEM.senha })
  })
})
