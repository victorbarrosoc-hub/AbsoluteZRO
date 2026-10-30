/**
 * Roteiros do Maestro na biblioteca (Criação F8): as regras puras de app/js/entregas.js. A versão nova atualiza o mesmo
 * roteiro; o que a pessoa mexeu nunca é sobrescrito (vira cópia); a mesma entrega duas vezes não muda nada; um reenvio
 * traz de volta o que foi apagado; entrega fora do contrato é ignorada. Roda com `node --test tests/`.
 */
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { aplicarEntregas, avisoDaChegada, entregaValida, marcaDe, podarVistos, proximoDesde } from '../app/js/entregas.js'

const ROTEIRO = '6a1b2c3d-0000-4000-8000-000000000001'
const ITEM = `maestro-${ROTEIRO}-demo-ant`
let n = 0
const entrega = (versao, corpo, extra = {}) => ({
  id: `3f2b8c1e-7d4a-4b9e-9c21-5a6f7e8d9c${String(++n).padStart(2, '0')}`,
  origem: 'maestro',
  tipo: 'roteiro',
  item: ITEM,
  versao,
  titulo: 'Café Aurora · Antônio',
  corpo,
  sha256: 'a'.repeat(64),
  link: `https://maestro.absolutezro.com/app/criacao/roteiros/${ROTEIRO}`,
  alvo_seg: 60,
  de: 'Rita Roteiro',
  atualizada_em: `2026-10-30T12:00:${String(n).padStart(2, '0')}.000Z`,
  ...extra,
})
const minha = { id: 'abc123', title: 'Meu texto', body: 'Oi', updated: 1, pos: 0, fav: true, target: 0 }

describe('roteiros do Maestro na biblioteca', () => {
  test('chega novo: o id é o item (o mesmo do backup da F3), marcado Do Maestro com versão, link e meta de duração', () => {
    const e = entrega(1, '# Cena 1\nO café chega.')
    const r = aplicarEntregas([minha], [e], {}, 1000)
    assert.equal(r.novos, 1)
    assert.deepEqual(r.ids, [e.id])
    const s = r.scripts.find((x) => x.id === ITEM)
    assert.equal(s.title, 'Café Aurora · Antônio')
    assert.equal(s.body, e.corpo)
    assert.equal(s.target, 60)
    assert.deepEqual(s.origem, { app: 'maestro', item: ITEM, versao: 1, link: e.link, de: 'Rita Roteiro', entrega: e.id, marca: marcaDe(e.corpo), em: 1000 })
    assert.deepEqual(
      r.scripts.find((x) => x.id === 'abc123'),
      minha,
      'o roteiro da pessoa não muda',
    )
    assert.equal(avisoDaChegada(r), 'Roteiro do Maestro chegou')
  })

  test('a mesma entrega de novo (outra leitura, outro aparelho já viu) não muda nada', () => {
    const e = entrega(1, 'Texto')
    const a = aplicarEntregas([], [e], {})
    const b = aplicarEntregas(a.scripts, [e], a.vistos)
    assert.equal(b.mudou, false)
    assert.deepEqual(b.scripts, a.scripts)
    assert.deepEqual(b.ids, [e.id], 'conta de novo (o HUB ignora o que já está marcado)')
    assert.equal(avisoDaChegada(b), '')
  })

  test('versão nova sem a pessoa ter mexido: atualiza o mesmo roteiro (favorito e leitura ficam)', () => {
    const a = aplicarEntregas([], [entrega(1, 'v1')], {})
    a.scripts[0].fav = true
    a.scripts[0].readAt = 5
    const b = aplicarEntregas(a.scripts, [entrega(2, 'v2 com fala nova')], a.vistos, 2000)
    assert.equal(b.atualizados, 1)
    assert.equal(b.scripts.length, 1)
    assert.equal(b.scripts[0].body, 'v2 com fala nova')
    assert.equal(b.scripts[0].origem.versao, 2)
    assert.equal(b.scripts[0].fav, true)
    assert.equal(b.scripts[0].readAt, 5)
    assert.equal(avisoDaChegada(b), 'Versão nova do Maestro')
  })

  test('a pessoa mexeu no texto: a versão nova vira cópia "· v2" e o dela fica como está', () => {
    const a = aplicarEntregas([], [entrega(1, 'v1')], {})
    a.scripts[0].body = 'v1 com o meu ajuste'
    const b = aplicarEntregas(a.scripts, [entrega(2, 'v2')], a.vistos)
    assert.equal(b.copias, 1)
    assert.equal(b.scripts.find((x) => x.id === ITEM).body, 'v1 com o meu ajuste')
    const c = b.scripts.find((x) => x.id === `${ITEM}-v2`)
    assert.equal(c.title, 'Café Aurora · Antônio · v2')
    assert.equal(c.body, 'v2')
    assert.equal(c.origem.versao, 2)
    assert.equal(avisoDaChegada(b), 'Versão nova do Maestro, numa cópia')
    // reenviar a v2 não duplica a cópia
    const d = aplicarEntregas(b.scripts, [{ ...entrega(2, 'v2'), id: c.origem.entrega, atualizada_em: '2026-10-30T13:00:00.000Z' }], b.vistos)
    assert.equal(d.scripts.length, b.scripts.length)
  })

  test('roteiro do backup da F3 (mesmo id, sem origem): texto igual vira "Do Maestro"; diferente vira cópia', () => {
    const doBackup = { id: ITEM, title: 'Café', body: 'v1', updated: 1, pos: 0, fav: false, target: 0 }
    const igual = aplicarEntregas([doBackup], [entrega(1, 'v1')], {})
    assert.equal(igual.mudou, true)
    assert.equal(igual.scripts.length, 1)
    assert.equal(igual.scripts[0].origem.versao, 1)
    const outro = aplicarEntregas([{ ...doBackup, body: 'mexido' }], [entrega(2, 'v2')], {})
    assert.equal(outro.copias, 1)
    assert.equal(outro.scripts.find((x) => x.id === ITEM).body, 'mexido')
  })

  test('apagado aqui: só volta com entrega nova ou reenvio', () => {
    const e = entrega(1, 'v1')
    const a = aplicarEntregas([], [e], {})
    Object.assign(a.scripts[0], { deleted: true, body: '', title: '' })
    assert.equal(aplicarEntregas(a.scripts, [e], a.vistos).mudou, false, 'a mesma leitura não ressuscita')
    const reenvio = aplicarEntregas(a.scripts, [{ ...e, atualizada_em: '2026-10-30T14:00:00.000Z' }], a.vistos)
    assert.equal(reenvio.novos, 1)
    assert.equal(reenvio.scripts[0].deleted, false)
    assert.equal(reenvio.scripts[0].body, 'v1')
  })

  test('fora do contrato é ignorado (item de outro app, link estranho, texto vazio, id ruim)', () => {
    for (const ruim of [
      { item: 'abc123' },
      { item: 'sobedesce-x' },
      { link: 'javascript:alert(1)' },
      { corpo: '   ' },
      { id: 'nao-e-id' },
      { origem: 'synquei' },
      { versao: 0 },
    ])
      assert.equal(entregaValida(entrega(1, 'x', ruim)), false, JSON.stringify(ruim))
    const r = aplicarEntregas([minha], [entrega(1, 'x', { item: 'abc123' })], {})
    assert.equal(r.mudou, false)
    assert.deepEqual(r.scripts, [minha], 'nunca toca no roteiro da pessoa')
  })

  test('várias de uma vez, vistos podados e o próximo desde com folga', () => {
    const r = aplicarEntregas([], [entrega(1, 'a', { item: `maestro-${ROTEIRO}-todas` }), entrega(1, 'b')], {})
    assert.equal(avisoDaChegada(r), '2 roteiros do Maestro')
    const agora = Date.parse('2026-12-15T00:00:00Z')
    assert.deepEqual(podarVistos({ x: '2026-10-01T00:00:00.000Z', y: '2026-12-10T00:00:00.000Z' }, agora), { y: '2026-12-10T00:00:00.000Z' })
    assert.equal(proximoDesde([{ atualizada_em: '2026-10-30T12:10:00.000Z' }, { atualizada_em: '2026-10-30T12:00:00.000Z' }]), '2026-10-30T12:05:00.000Z')
    assert.equal(proximoDesde([], 'antes'), 'antes')
  })
})
