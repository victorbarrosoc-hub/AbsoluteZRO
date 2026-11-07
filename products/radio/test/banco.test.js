// Banco do rádio num Postgres de verdade, montado como no Supabase: o administrador cria o papel `radio` (login, dono
// do schema) e o `radio_app`; o migrador roda como `radio`. Confere a migração, o gate (sem a claim do rádio, nada
// abre), o isolamento entre pessoas pelo RLS (pelas rotas e direto no banco) e quem pode mandar aviso de set.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import postgres from 'postgres'
import { semPostgres, subirPostgres } from './banco-apoio.js'

const pular = semPostgres
let pg, urlRadio, z, banco, rotas

const SEGREDO = 'segredo-de-teste-que-so-existe-aqui'
const pedido = (metodo, url, cookie, corpo) => {
  const texto = corpo ? JSON.stringify(corpo) : ''
  return Object.assign([Buffer.from(texto)][Symbol.iterator](), {
    method: metodo,
    url,
    body: corpo ?? undefined,
    headers: { host: 'radion.absolutezro.com', 'x-forwarded-proto': 'https', cookie: cookie ? `rd_conta=${cookie}` : '', 'content-type': 'application/json' },
  })
}
const resposta = () => {
  const r = { statusCode: 0, headers: {} }
  r.setHeader = (k, v) => (r.headers[k.toLowerCase()] = v)
  r.end = (c) => {
    const t = c == null ? '' : String(c)
    try {
      r.corpo = t ? JSON.parse(t) : null
    } catch {
      r.corpo = t
    }
  }
  return r
}
const chamar = async (rota, metodo, cookie, corpo, url = '/') => {
  const r = resposta()
  await rotas[rota](pedido(metodo, url, cookie, corpo), r)
  return r
}
/** Sessão do login único como o callback grava: com a claim do rádio liberada (ou sem, para o gate). */
const sessao = (sub, nome, apps = ['radio']) => z.selar(z.COOKIE_CONTA, { sub, nome, email: `${sub}@exemplo.com`, apps, lido: Math.floor(Date.now() / 1000) }, 3600)

before(async () => {
  if (pular) return
  pg = await subirPostgres()
  const admin = postgres(pg.url, { max: 1, onnotice: () => {} })
  await admin.unsafe(`create role radio login password 'teste'; create role radio_app nologin; grant radio_app to radio with admin option; create schema radio authorization radio;`)
  await admin.end()
  urlRadio = pg.url.replace('postgres://postgres@', 'postgres://radio:teste@')
  process.env.ZRO_CLIENT_ID = 'radio-web'
  process.env.ZRO_CLIENT_SECRET = SEGREDO
  process.env.RADIO_DATABASE_URL = urlRadio
  delete process.env.RADIO_LOCAL
  const { migrar } = await import('../scripts/migrar.mjs')
  await migrar(urlRadio)
  z = await import('../api/_zro.js')
  banco = await import('../api/_banco.js')
  rotas = {
    diarias: (await import('../api/radio/diarias.js')).default,
    batida: (await import('../api/radio/batida.js')).default,
    aviso: (await import('../api/radio/aviso.js')).default,
    moderar: (await import('../api/radio/moderar.js')).default,
    pagina: (await import('../api/pagina.js')).default,
    recurso: (await import('../api/recurso.js')).default,
    local: (await import('../api/local.js')).default,
  }
})
after(async () => {
  await banco?.fecharBanco()
  await pg?.fechar()
})

test('migração: não repete e recusa arquivo já aplicado que mudou', { skip: pular }, async () => {
  const { migrar, migracoes } = await import('../scripts/migrar.mjs')
  assert.deepEqual(await migrar(urlRadio), [])
  const sql = postgres(urlRadio, { max: 1, onnotice: () => {} })
  const [m] = await sql`select count(*)::int as n from radio.migracoes`
  assert.equal(m.n, migracoes().length)
  await sql`update radio.migracoes set sha = 'outro' where nome = '0000_fundacao.sql'`
  await assert.rejects(migrar(urlRadio), /mudou/)
  await sql`update radio.migracoes set sha = ${migracoes()[0].sha} where nome = '0000_fundacao.sql'`
  await sql.end()
})

test('gate: sem a claim do rádio, página neutra, recurso 404 e API 401', { skip: pular }, async () => {
  const fora = sessao('sub-fora', 'Fora', ['maestro'])
  const p = await chamar('pagina', 'GET', fora)
  assert.equal(p.statusCode, 200)
  assert.match(p.corpo, /Página <\/span><b>indisponível/)
  assert.doesNotMatch(p.corpo, /Rádio/)
  assert.match((await chamar('pagina', 'GET', null)).corpo, /indisponível/)
  assert.equal((await chamar('recurso', 'GET', fora, null, '/api/recurso?f=app.js')).statusCode, 404)
  assert.equal((await chamar('diarias', 'GET', fora)).statusCode, 401)
  assert.equal((await chamar('batida', 'POST', null, { diaria: 'aaaaaaaaaaaa', peer: 'a'.repeat(24) })).statusCode, 401)
  // modo local nunca liga com o login configurado nem fora de localhost
  process.env.RADIO_LOCAL = '1'
  assert.equal((await chamar('local', 'POST', null, { nome: 'Teste' })).statusCode, 404)
  delete process.env.RADIO_LOCAL
  // com a claim: o app
  const dentro = sessao('sub-dentro', 'Dentro')
  assert.match((await chamar("pagina", "GET", dentro)).corpo, /id="ptt"/)
  const js = await chamar('recurso', 'GET', dentro, null, '/api/recurso?f=app.js')
  assert.equal(js.statusCode, 200)
  assert.equal((await chamar('recurso', 'GET', dentro, null, '/api/recurso?f=../api/_zro.js')).statusCode, 404)
  // a página inicial: prévia só com acesso; sem sessão, neutra, até o lançamento abrir o site
  assert.match((await chamar('pagina', 'GET', dentro, null, '/api/pagina?v=sobre')).corpo, /stay<\/span> <span class="forte">connected/)
  assert.match((await chamar('pagina', 'GET', null, null, '/api/pagina?v=sobre')).corpo, /indisponível/)
  assert.equal((await chamar('recurso', 'GET', null, null, '/api/recurso?f=site.css')).statusCode, 404)
  assert.equal((await chamar('recurso', 'GET', null, null, '/api/recurso?f=site.js')).statusCode, 404)
  assert.equal((await chamar('recurso', 'GET', null, null, '/api/recurso?f=marca/og.png')).statusCode, 404)
  // o ícone do compartilhar e o manifesto da Tela de Início vêm com o app
  assert.match((await chamar('pagina', 'GET', dentro)).corpo, /rel="apple-touch-icon"[\s\S]*rel="manifest"/)
  process.env.RADION_SITE_ABERTO = '1'
  try {
    const aberto = (await chamar('pagina', 'GET', null)).corpo
    assert.match(aberto, /href="\/entrar"/)
    assert.match(aberto, /og:image" content="https:\/\/radion\.absolutezro\.com\/og\.png"/)
    assert.equal((await chamar('recurso', 'GET', null, null, '/api/recurso?f=marca/og.png')).statusCode, 200)
    assert.equal((await chamar('recurso', 'GET', null, null, '/api/recurso?f=site.css')).statusCode, 200)
    assert.equal((await chamar('recurso', 'GET', null, null, '/api/recurso?f=site.js')).statusCode, 200)
    assert.equal((await chamar('recurso', 'GET', null, null, '/api/recurso?f=app.js')).statusCode, 404)
  } finally {
    delete process.env.RADION_SITE_ABERTO
  }
})

test('diária: criar, entrar pelo código, função, presença e isolamento', { skip: pular }, async () => {
  const ana = sessao('sub-ana', 'Ana')
  const bia = sessao('sub-bia', 'Bia')
  const caio = sessao('sub-caio', 'Caio')

  const c = await chamar('diarias', 'POST', ana, { acao: 'criar', nome: 'Comercial · dia 1' })
  assert.equal(c.statusCode, 201)
  const d = c.corpo.diaria
  assert.match(d.codigo, /^[A-HJ-NP-Z2-9]{6}$/)
  assert.equal(d.dono, true)
  assert.equal(d.funcao, 'direcao')

  // Bia ainda não está: não vê a diária nem bate
  assert.equal((await chamar('diarias', 'GET', bia)).corpo.diarias.length, 0)
  // a foto da conta Absolute ZRO vem da sessão para o topo do app; só o endereço público da foto, nada inventado
  assert.equal((await chamar('diarias', 'GET', bia)).corpo.eu.foto, null)
  const comFoto = z.selar(z.COOKIE_CONTA, { sub: 'bia-foto', nome: 'Bia', foto: 'https://absolutezro.com/api/v1/foto/0b6f1c3e-1a2b-4c5d-8e9f-0a1b2c3d4e5f', apps: ['radio'], lido: Math.floor(Date.now() / 1000) }, 3600)
  assert.equal((await chamar('diarias', 'GET', comFoto)).corpo.eu.foto, 'https://absolutezro.com/api/v1/foto/0b6f1c3e-1a2b-4c5d-8e9f-0a1b2c3d4e5f')
  const fotoRuim = z.selar(z.COOKIE_CONTA, { sub: 'bia-ruim', nome: 'Bia', foto: 'javascript:alert(1)', apps: ['radio'], lido: Math.floor(Date.now() / 1000) }, 3600)
  assert.equal((await chamar('diarias', 'GET', fotoRuim)).corpo.eu.foto, null)
  assert.equal((await chamar('batida', 'POST', bia, { diaria: d.id, peer: 'b'.repeat(24) })).statusCode, 403)
  assert.equal((await chamar('diarias', 'POST', bia, { acao: 'entrar', codigo: 'ZZZZZZ' })).statusCode, 404)

  const e = await chamar('diarias', 'POST', bia, { acao: 'entrar', codigo: d.codigo.toLowerCase() })
  assert.equal(e.statusCode, 200)
  assert.equal(e.corpo.diaria.dono, false)
  assert.equal((await chamar('diarias', 'POST', bia, { acao: 'funcao', diaria: d.id, funcao: 'som' })).statusCode, 200)
  assert.equal((await chamar('diarias', 'POST', bia, { acao: 'funcao', diaria: d.id, funcao: 'diretor' })).statusCode, 409)
  assert.equal((await chamar('diarias', 'POST', bia, { acao: 'funcao', diaria: d.id, funcao: 'Di Retor' })).statusCode, 400)

  // presença: os dois se veem; Caio (fora) não
  const pa = 'a'.repeat(24)
  const pb = 'b'.repeat(24)
  await chamar('batida', 'POST', ana, { diaria: d.id, peer: pa })
  const bb = await chamar('batida', 'POST', bia, { diaria: d.id, peer: pb })
  assert.equal(bb.statusCode, 200)
  assert.deepEqual(bb.corpo.pessoas.map((p) => [p.nome, p.funcao, p.eu]), [
    ['Ana', 'direcao', false],
    ['Bia', 'som', true],
  ])
  assert.equal(bb.corpo.eu.podeAvisar, false)
  assert.equal((await chamar('batida', 'POST', caio, { diaria: d.id, peer: 'c'.repeat(24) })).statusCode, 403)

  // sinal: Ana → Bia chega só para a Bia, uma vez
  await chamar('batida', 'POST', ana, { diaria: d.id, peer: pa, sinais: [{ para: pb, tipo: 'oferta', dados: { sdp: 'v=0 teste' } }] })
  const s1 = await chamar('batida', 'POST', bia, { diaria: d.id, peer: pb })
  assert.deepEqual(s1.corpo.sinais, [{ de: pa, tipo: 'oferta', dados: { sdp: 'v=0 teste' } }])
  assert.deepEqual((await chamar('batida', 'POST', bia, { diaria: d.id, peer: pb })).corpo.sinais, [])
  // sinal para aparelho que não está na diária não grava
  await chamar('batida', 'POST', ana, { diaria: d.id, peer: pa, sinais: [{ para: 'c'.repeat(24), tipo: 'oferta', dados: { sdp: 'x' } }] })
  const sql = postgres(urlRadio, { max: 1, onnotice: () => {} })
  assert.equal((await sql`select count(*)::int as n from radio.sinais`)[0].n, 0)

  // aviso: Ana (dona) manda; Bia (Som) não; quem bate depois recebe
  const visto = s1.corpo.ultimoAviso
  const av = await chamar('aviso', 'POST', ana, { diaria: d.id, tipo: 'acao' })
  assert.equal(av.statusCode, 201)
  assert.equal((await chamar('aviso', 'POST', bia, { diaria: d.id, tipo: 'corta' })).statusCode, 403)
  const comAviso = await chamar('batida', 'POST', bia, { diaria: d.id, peer: pb, aviso: visto })
  assert.deepEqual(comAviso.corpo.avisos, [{ id: av.corpo.aviso.id, tipo: 'acao', de: 'Ana', setor: null }])
  // Bia na Direção passa a poder
  await chamar('diarias', 'POST', bia, { acao: 'funcao', diaria: d.id, funcao: 'direcao' })
  assert.equal((await chamar('aviso', 'POST', bia, { diaria: d.id, tipo: 'corta' })).statusCode, 201)

  // direto no banco, como radio_app: Caio não lê nada; Bia não vira dona nem se põe em diária alheia
  const como = (sub, fn) =>
    sql.begin(async (tx) => {
      await tx`select set_config('radio.user_sub', ${sub}, true)`
      await tx.unsafe('set local role radio_app')
      return fn(tx)
    })
  assert.equal((await como('sub-caio', (tx) => tx`select * from radio.diarias`)).length, 0)
  assert.equal((await como('sub-caio', (tx) => tx`select * from radio.membros`)).length, 0)
  assert.equal((await como('sub-caio', (tx) => tx`select * from radio.avisos`)).length, 0)
  await assert.rejects(como('sub-bia', (tx) => tx`update radio.membros set papel = 'dono' where user_sub = 'sub-bia'`), /permission denied/)
  await assert.rejects(como('sub-caio', (tx) => tx`insert into radio.membros (diaria_id, user_sub, nome, papel) values (${d.id}, 'sub-caio', 'Caio', 'dono')`), /row-level security/)
  await assert.rejects(como('sub-caio', (tx) => tx`insert into radio.avisos (diaria_id, tipo, de_sub, de_nome) values (${d.id}, 'acao', 'sub-caio', 'Caio')`), /permission denied/)
  assert.equal((await como('sub-bia', (tx) => tx`delete from radio.diarias where id = ${d.id}`)).count, 0)
  await sql.end()
})

test('poderes: responsável do setor, silenciar, silenciar todos, Gravando, pedir a palavra e quem é imune', { skip: pular }, async () => {
  const dona = sessao('sub-dona', 'Dona')
  const lia = sessao('sub-lia', 'Lia')
  const gil = sessao('sub-gil', 'Gil')
  const teo = sessao('sub-teo', 'Teo')
  const rui = sessao('sub-rui', 'Rui')
  const d = (await chamar('diarias', 'POST', dona, { acao: 'criar', nome: 'Poderes' })).corpo.diaria
  for (const [s, f] of [[lia, 'luz'], [gil, 'luz'], [teo, 'som'], [rui, 'camera']]) {
    await chamar('diarias', 'POST', s, { acao: 'entrar', codigo: d.codigo })
    await chamar('diarias', 'POST', s, { acao: 'funcao', diaria: d.id, funcao: f })
  }
  const bater = async (s, peer) => (await chamar('batida', 'POST', s, { diaria: d.id, peer })).corpo
  const mod = async (s, corpo) => chamar('moderar', 'POST', s, { diaria: d.id, ...corpo })
  const quem = async (nome) => (await bater(dona, 'd'.repeat(24))).membros.find((m) => m.nome === nome).apelido
  const calados = async () => {
    const b = await bater(dona, 'd'.repeat(24))
    return b.silenciados.map((x) => b.membros.find((m) => m.apelido === x.apelido).nome).sort()
  }
  const aLia = await quem('Lia')
  const aGil = await quem('Gil')
  const aTeo = await quem('Teo')
  const aDona = await quem('Dona')
  // apelido, nunca o sub da conta
  assert.match(aLia, /^[a-f0-9]{16}$/)
  assert.doesNotMatch(JSON.stringify(await bater(lia, 'l'.repeat(24))), /sub-/)

  // só a dona escolhe responsável; Lia vira a da Luz
  assert.equal((await mod(lia, { acao: 'responsavel', alvo: aGil })).statusCode, 403)
  assert.equal((await mod(dona, { acao: 'responsavel', alvo: aLia })).statusCode, 200)
  const bl = await bater(lia, 'l'.repeat(24))
  assert.equal(bl.eu.papel, 'responsavel')
  assert.equal(bl.eu.podeModerar, true)
  assert.equal(bl.eu.podeAvisar, true)

  // responsável silencia gente do setor dela, nunca de outro setor nem a dona
  assert.equal((await mod(lia, { acao: 'silenciar', alvo: aGil, minutos: 5 })).statusCode, 200)
  assert.equal((await mod(lia, { acao: 'silenciar', alvo: aTeo })).statusCode, 403)
  assert.equal((await mod(lia, { acao: 'silenciar', alvo: aDona })).statusCode, 409)
  assert.equal((await mod(teo, { acao: 'silenciar', alvo: aGil })).statusCode, 403)
  assert.deepEqual(await calados(), ['Gil'])
  const bg = await bater(gil, 'g'.repeat(24))
  assert.equal(bg.eu.silenciado.por, 'Lia')
  assert.ok(Date.parse(bg.eu.silenciado.ate) > Date.now())

  // pedir a palavra: só quem está silenciado; a responsável reativa e a mão baixa
  assert.equal((await mod(teo, { acao: 'mao' })).statusCode, 400)
  assert.equal((await mod(gil, { acao: 'mao' })).statusCode, 200)
  assert.deepEqual((await bater(lia, 'l'.repeat(24))).maos, [aGil])
  assert.equal((await mod(lia, { acao: 'reativar', alvo: aGil })).statusCode, 200)
  assert.deepEqual(await calados(), [])
  assert.deepEqual((await bater(lia, 'l'.repeat(24))).maos, [])

  // responsável silencia o setor (ela mesma fica livre); dona silencia o set (ela e a Direção ficam livres)
  assert.equal((await mod(lia, { acao: 'silenciar_todos' })).statusCode, 200)
  assert.deepEqual(await calados(), ['Gil'])
  assert.deepEqual((await bater(gil, 'g'.repeat(24))).silencio.setores, ['luz'])
  assert.equal((await mod(lia, { acao: 'reativar_todos' })).statusCode, 200)
  assert.equal((await mod(teo, { acao: 'silenciar_todos' })).statusCode, 403)
  assert.equal((await mod(dona, { acao: 'silenciar_todos' })).statusCode, 200)
  assert.deepEqual(await calados(), ['Gil', 'Lia', 'Rui', 'Teo'])
  // a dona libera uma pessoa durante o silêncio do set
  assert.equal((await mod(dona, { acao: 'reativar', alvo: aTeo })).statusCode, 200)
  assert.deepEqual(await calados(), ['Gil', 'Lia', 'Rui'])
  assert.equal((await mod(dona, { acao: 'reativar_todos' })).statusCode, 200)
  assert.deepEqual(await calados(), [])

  // Gravando silencia o set menos Direção e Som; Corta reativa
  assert.equal((await chamar('aviso', 'POST', dona, { diaria: d.id, tipo: 'acao' })).statusCode, 201)
  assert.deepEqual(await calados(), ['Gil', 'Lia', 'Rui'])
  assert.equal((await bater(teo, 't'.repeat(24))).silencio.todos.motivo, 'gravando')
  await chamar('aviso', 'POST', dona, { diaria: d.id, tipo: 'corta' })
  assert.deepEqual(await calados(), [])
  // com o ajuste desligado, Gravando não silencia; só a dona mexe nos ajustes
  assert.equal((await mod(lia, { acao: 'ajustes', ajustes: { gravandoSilencia: false } })).statusCode, 403)
  assert.equal((await mod(dona, { acao: 'ajustes', ajustes: { gravandoSilencia: false } })).statusCode, 200)
  await chamar('aviso', 'POST', dona, { diaria: d.id, tipo: 'acao' })
  assert.deepEqual(await calados(), [])

  // aviso da responsável vai só para o setor dela, mesmo pedindo para todos
  const visto = (await bater(teo, 't'.repeat(24))).ultimoAviso
  const al = await chamar('aviso', 'POST', lia, { diaria: d.id, tipo: 'intervalo' })
  assert.equal(al.corpo.aviso.setor, 'luz')
  assert.deepEqual((await chamar('batida', 'POST', teo, { diaria: d.id, peer: 't'.repeat(24), aviso: visto })).corpo.avisos, [])
  assert.equal((await chamar('batida', 'POST', gil, { diaria: d.id, peer: 'g'.repeat(24), aviso: visto })).corpo.avisos.length, 1)

  // convidado só ouve: entra silenciado; a dona move, tira e o histórico guarda (só para ela)
  assert.equal((await mod(dona, { acao: 'papel', alvo: await quem('Rui'), valor: 'convidado' })).statusCode, 200)
  assert.deepEqual(await calados(), ['Rui'])
  assert.equal((await mod(dona, { acao: 'mover', alvo: aGil, valor: 'arte' })).statusCode, 200)
  assert.equal((await bater(gil, 'g'.repeat(24))).eu.funcao, 'arte')
  assert.equal((await mod(lia, { acao: 'tirar', alvo: aGil })).statusCode, 403)
  assert.equal((await mod(dona, { acao: 'tirar', alvo: aGil })).statusCode, 200)
  assert.equal((await chamar('batida', 'POST', gil, { diaria: d.id, peer: 'g'.repeat(24) })).statusCode, 403)
  const h = (await mod(dona, { acao: 'historico' })).corpo.historico
  assert.ok(h.some((x) => x.acao === 'silenciar' && x.quem === 'Lia' && x.alvo === 'Gil' && x.detalhe === '5 min'))
  assert.deepEqual((await mod(lia, { acao: 'historico' })).corpo.historico, [])
  // sem setor (NULL) não é setor de ninguém: a responsável não silencia quem está sem setor, e quem está sem setor
  // não manda aviso
  const ze = sessao('sub-ze', 'Zé')
  await chamar('diarias', 'POST', ze, { acao: 'entrar', codigo: d.codigo })
  assert.equal((await mod(lia, { acao: 'silenciar', alvo: await quem('Zé') })).statusCode, 403)
  assert.equal((await chamar('aviso', 'POST', ze, { diaria: d.id, tipo: 'corta' })).statusCode, 403)
  // responsável que troca de setor deixa de ser responsável
  await chamar('diarias', 'POST', lia, { acao: 'funcao', diaria: d.id, funcao: 'som' })
  assert.equal((await bater(lia, 'l'.repeat(24))).eu.papel, 'equipe')

  // direto no banco, como radio_app: ninguém escreve silêncio, mão nem histórico, nem troca o próprio papel ou setor
  const sql = postgres(urlRadio, { max: 1, onnotice: () => {} })
  const como = (sub, fn) =>
    sql.begin(async (tx) => {
      await tx`select set_config('radio.user_sub', ${sub}, true)`
      await tx.unsafe('set local role radio_app')
      return fn(tx)
    })
  await assert.rejects(como('sub-teo', (tx) => tx`insert into radio.silencios (diaria_id, tipo, alvo, por_sub, por_nome) values (${d.id}, 'todos', '*', 'sub-teo', 'Teo')`), /permission denied/)
  await assert.rejects(como('sub-teo', (tx) => tx`delete from radio.silencios`), /permission denied/)
  await assert.rejects(como('sub-teo', (tx) => tx`insert into radio.maos (diaria_id, user_sub) values (${d.id}, 'sub-teo')`), /permission denied/)
  await assert.rejects(como('sub-teo', (tx) => tx`update radio.membros set funcao = 'direcao' where user_sub = 'sub-teo'`), /permission denied/)
  assert.equal((await como('sub-teo', (tx) => tx`select * from radio.historico`)).length, 0)
  assert.equal((await como('sub-fora', (tx) => tx`select * from radio.silencios`)).length, 0)
  assert.equal((await como('sub-fora', (tx) => tx`select * from radio.silenciados(${d.id})`)).length, 0)
  await sql.end()
})

test('setores da diária: criar, renomear, tirar, pôr gente, trava de setor, sair e encerrar', { skip: pular }, async () => {
  const dona = sessao('sub-dona2', 'Dona')
  const ana = sessao('sub-ana', 'Ana')
  const bia = sessao('sub-bia', 'Bia')
  const d = (await chamar('diarias', 'POST', dona, { acao: 'criar', nome: 'Setores' })).corpo.diaria
  for (const s of [ana, bia]) await chamar('diarias', 'POST', s, { acao: 'entrar', codigo: d.codigo })
  const bater = async (s, peer) => (await chamar('batida', 'POST', s, { diaria: d.id, peer })).corpo
  const mod = async (s, corpo) => chamar('moderar', 'POST', s, { diaria: d.id, ...corpo })
  const setores = async () => (await bater(dona, 'e'.repeat(24))).setores

  // nasce com os sete de sempre, na ordem
  assert.deepEqual((await setores()).map((x) => x.id), ['direcao', 'producao', 'camera', 'som', 'luz', 'arte', 'elenco'])
  assert.equal((await setores())[0].nome, 'Direção')

  // só a dona cria; nome repetido e cor fora da lista são recusados
  assert.equal((await mod(ana, { acao: 'setor_criar', setor: { nome: 'Maquiagem', cor: 'rosa' } })).statusCode, 403)
  assert.equal((await mod(dona, { acao: 'setor_criar', setor: { nome: 'Maquiagem', cor: 'rosa' } })).statusCode, 200)
  assert.equal((await mod(dona, { acao: 'setor_criar', setor: { nome: 'maquiagem', cor: 'azul' } })).statusCode, 409)
  assert.equal((await mod(dona, { acao: 'setor_criar', setor: { nome: 'Figurino', cor: 'dourado' } })).statusCode, 400)
  const maq = (await setores()).find((x) => x.nome === 'Maquiagem')
  assert.match(maq.id, /^s[a-f0-9]{7}$/)
  assert.equal(maq.cor, 'rosa')

  // a equipe escolhe o setor novo; a dona renomeia e o nome novo aparece para todos
  assert.equal((await chamar('diarias', 'POST', ana, { acao: 'funcao', diaria: d.id, funcao: maq.id })).statusCode, 200)
  assert.equal((await mod(dona, { acao: 'setor_editar', setor: { id: maq.id, nome: 'Make' } })).statusCode, 200)
  assert.equal((await setores()).find((x) => x.id === maq.id).nome, 'Make')
  assert.equal((await chamar('diarias', 'GET', ana)).corpo.diarias.find((x) => x.id === d.id).funcaoNome, 'Make')
  assert.equal((await mod(ana, { acao: 'setor_editar', setor: { id: maq.id, nome: 'Outro' } })).statusCode, 403)
  // setor que não é desta diária não vale
  assert.equal((await chamar('diarias', 'POST', ana, { acao: 'funcao', diaria: d.id, funcao: 'sinexiste' })).statusCode, 409)

  // a dona põe a Bia no setor novo (mover) e a faz responsável; tirar o setor deixa as duas sem setor e a Bia na equipe
  const quem = async (nome) => (await bater(dona, 'e'.repeat(24))).membros.find((m) => m.nome === nome).apelido
  assert.equal((await mod(dona, { acao: 'mover', alvo: await quem('Bia'), valor: maq.id })).statusCode, 200)
  assert.equal((await mod(dona, { acao: 'responsavel', alvo: await quem('Bia') })).statusCode, 200)
  assert.equal((await mod(dona, { acao: 'setor_tirar', setor: { id: 'direcao' } })).statusCode, 400)
  assert.equal((await mod(dona, { acao: 'setor_tirar', setor: { id: maq.id } })).statusCode, 200)
  const bb = await bater(bia, 'b'.repeat(24))
  assert.equal(bb.eu.funcao, null)
  assert.equal(bb.eu.papel, 'equipe')
  assert.ok(!bb.setores.some((x) => x.id === maq.id))

  // trava de setor: a primeira escolha vale; depois, só a dona move
  assert.equal((await mod(ana, { acao: 'ajustes', ajustes: { setorTravado: true } })).statusCode, 403)
  assert.equal((await mod(dona, { acao: 'ajustes', ajustes: { setorTravado: true } })).statusCode, 200)
  assert.equal((await bater(ana, 'a'.repeat(24))).ajustes.setorTravado, true)
  assert.equal((await chamar('diarias', 'POST', ana, { acao: 'funcao', diaria: d.id, funcao: 'luz' })).statusCode, 200)
  assert.equal((await chamar('diarias', 'POST', ana, { acao: 'funcao', diaria: d.id, funcao: 'som' })).statusCode, 409)
  assert.equal((await mod(dona, { acao: 'mover', alvo: await quem('Ana'), valor: 'som' })).statusCode, 200)
  assert.equal((await bater(ana, 'a'.repeat(24))).eu.funcao, 'som')

  // Gravando é estado: liga no aviso de Gravando e desliga no Corta
  assert.equal((await bater(dona, 'e'.repeat(24))).gravando, null)
  await chamar('aviso', 'POST', dona, { diaria: d.id, tipo: 'acao' })
  assert.ok(Date.parse((await bater(ana, 'a'.repeat(24))).gravando) > 0)
  await chamar('aviso', 'POST', dona, { diaria: d.id, tipo: 'corta' })
  assert.equal((await bater(ana, 'a'.repeat(24))).gravando, null)

  // renomear: só a dona
  assert.equal((await chamar('diarias', 'POST', ana, { acao: 'renomear', diaria: d.id, nome: 'Outra' })).statusCode, 403)
  const ren = await chamar('diarias', 'POST', dona, { acao: 'renomear', diaria: d.id, nome: 'Setores 2' })
  assert.equal(ren.corpo.diaria.nome, 'Setores 2')
  assert.equal((await chamar('diarias', 'GET', ana)).corpo.diarias.find((x) => x.id === d.id).nome, 'Setores 2')

  // sair: a Ana deixa a diária (e some da equipe); a dona não sai, encerra, e a diária some para todos
  assert.equal((await chamar('diarias', 'POST', ana, { acao: 'sair', diaria: d.id })).statusCode, 200)
  assert.equal((await chamar('batida', 'POST', ana, { diaria: d.id, peer: 'a'.repeat(24) })).statusCode, 403)
  assert.ok(!(await bater(dona, 'e'.repeat(24))).membros.some((m) => m.nome === 'Ana'))
  assert.equal((await chamar('diarias', 'POST', dona, { acao: 'sair', diaria: d.id })).statusCode, 403)
  assert.equal((await chamar('diarias', 'POST', bia, { acao: 'encerrar', diaria: d.id })).statusCode, 403)
  assert.equal((await chamar('diarias', 'POST', dona, { acao: 'encerrar', diaria: d.id })).statusCode, 200)
  assert.equal((await chamar('batida', 'POST', bia, { diaria: d.id, peer: 'b'.repeat(24) })).statusCode, 403)
  assert.ok(!(await chamar('diarias', 'GET', dona)).corpo.diarias.some((x) => x.id === d.id))

  // direto no banco, como radio_app: ninguém escreve setor
  const sql = postgres(urlRadio, { max: 1, onnotice: () => {} })
  const como = (sub, fn) =>
    sql.begin(async (tx) => {
      await tx`select set_config('radio.user_sub', ${sub}, true)`
      await tx.unsafe('set local role radio_app')
      return fn(tx)
    })
  await assert.rejects(como('sub-dona2', (tx) => tx`insert into radio.setores (diaria_id, id, nome, cor) values (${d.id}, 'xx', 'X', 'azul')`), /permission denied/)
  await assert.rejects(como('sub-dona2', (tx) => tx`update radio.setores set nome = 'Y'`), /permission denied/)
  assert.equal((await como('sub-fora', (tx) => tx`select * from radio.setores`)).length, 0)
  await sql.end()
})
