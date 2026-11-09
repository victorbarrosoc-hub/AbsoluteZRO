// Menu do item da aba Drive igual ao do Google Drive (titular, 09/11/2026), no app de computador e no do celular: os
// textos do "Copiar link" com "Qualquer pessoa com o link pode ver" são os mesmos nos dois, a escolha lembrada nunca
// inventa "público", o selo vem das permissionIds, o menu do vazio diz por que algo está cinza, "Enviar pasta" cria a
// árvore na ordem certa e o Desfazer devolve cada item para a pasta de onde saiu. As rotas do motor ficam em
// test/compartilhar.test.js (restringir e estrela).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as pc from '../public/lib/compartilhar.js'
import * as cel from '../web/public/app/lib/link-publico.js'
import { ehPublico as ehPublicoMotor, PUBLICO_IDS } from '../src/google/drive.js'

test('os textos do Copiar link são os mesmos no computador e no celular', () => {
  for (const k of ['LINK_PUBLICO', 'LINK_PUBLICO_SUB', 'LINK_SO_COPIAR', 'LINK_SO_COPIAR_SUB', 'SELO_PUBLICO', 'RESTRITO']) assert.equal(pc[k], cel[k], k)
  assert.equal(pc.LINK_PUBLICO, 'Qualquer pessoa com o link pode ver')
  assert.equal(pc.SELO_PUBLICO, 'Público (link)')
})

test('a escolha lembrada só vale "publico" ou "copiar": qualquer outra coisa pergunta de novo', () => {
  for (const f of [pc.padraoDoLink, cel.padraoDoLink]) {
    assert.equal(f('publico'), 'publico')
    assert.equal(f('copiar'), 'copiar')
    for (const v of [null, undefined, '', 'sim', true, 'PUBLICO', { publico: true }]) assert.equal(f(v), null)
  }
  assert.equal(pc.textoPublico(true), 'Copiado. Qualquer pessoa com o link pode ver.')
})

test('selo "Público (link)": anyoneWithLink ou anyone nas permissionIds, no motor e no celular', () => {
  assert.deepEqual([...PUBLICO_IDS], [...cel.PUBLICO_IDS])
  for (const [ids, esperado] of [
    [['12345', 'anyoneWithLink'], true],
    [['anyone'], true],
    [['12345', 'domain:exemplo.com'], false],
    [[], false],
  ]) {
    assert.equal(ehPublicoMotor(ids), esperado)
    assert.equal(cel.ehPublico({ permissionIds: ids }), esperado)
  }
  assert.equal(cel.ehPublico({}), false)
  assert.equal(ehPublicoMotor(undefined), false)
})

test('a listagem do celular pede estrela, permissões, dono e criação sem mexer no núcleo do Maestro', () => {
  const base = 'id,name,capabilities(canDownload,canRename)'
  const mais = cel.comCamposDoMenu(base)
  assert.equal(mais, 'id,name,capabilities(canShare,canDownload,canRename),starred,permissionIds,createdTime,owners(displayName,emailAddress)')
  assert.equal((mais.match(/capabilities\(/g) || []).length, 1, 'um capabilities(...) só')
  const browse = fs.readFileSync(new URL('../web/public/app/lib/browse.js', import.meta.url), 'utf8')
  assert.match(browse, /criarListador\(comMais\)/)
  const nucleo = fs.readFileSync(new URL('../web/public/app/lib/drive-nucleo.js', import.meta.url), 'utf8')
  assert.doesNotMatch(nucleo, /permissionIds/, 'o núcleo compartilhado com o Maestro fica igual')
})

test('menu do vazio: Nova pasta / Enviar arquivos / Enviar pasta, cinza com o motivo quando não dá', () => {
  const dest = { id: 'p1', name: 'Entrega' }
  assert.deepEqual(
    cel.acoesDoVazio({ dest }).map((a) => [a.id, a.motivo]),
    [
      ['pasta', null],
      ['arquivos', null],
      ['enviar-pasta', null],
    ],
  )
  assert.ok(cel.acoesDoVazio({ dest: null }).every((a) => /Abra uma pasta/.test(a.motivo)))
  assert.ok(cel.acoesDoVazio({ dest, busca: true }).every((a) => /Saia da busca/.test(a.motivo)))
  const semPasta = cel.acoesDoVazio({ dest, pastaInteira: false })
  assert.equal(semPasta[1].motivo, null)
  assert.match(semPasta[2].motivo, /não deixa escolher uma pasta inteira/)
})

test('Enviar pasta: a árvore sai inteira e cada pasta antes das de dentro', () => {
  const f = (p) => ({ name: p.split('/').pop(), webkitRelativePath: p })
  const grupos = cel.gruposDaPasta([f('Dia 1/Brutos/A001.mov'), f('Dia 1/roteiro.pdf'), f('Dia 1/Áudio/Lapela/L1.wav'), f('Dia 1/Brutos/A002.mov')])
  assert.deepEqual(
    grupos.map((g) => [g.caminho.join('/'), g.arquivos.map((x) => x.name)]),
    [
      ['Dia 1', ['roteiro.pdf']],
      ['Dia 1/Brutos', ['A001.mov', 'A002.mov']],
      ['Dia 1/Áudio', []],
      ['Dia 1/Áudio/Lapela', ['L1.wav']],
    ],
  )
})

test('Desfazer do mover: cada item volta para a pasta de onde saiu; quem já estava no destino fica', () => {
  const itens = [
    { id: 'a', parents: ['p1'] },
    { id: 'b', parents: ['p2'] },
    { id: 'c', parents: ['p1'] },
    { id: 'd', parents: ['dest'] },
    { id: 'e', parents: [] },
  ]
  assert.deepEqual(cel.voltasDoMover(itens, 'dest'), { p1: ['a', 'c'], p2: ['b'] })
})

test('o celular e o computador não tornam público sem a escolha: o "liberar" só sai da escolha ou do Compartilhar', () => {
  const menu = fs.readFileSync(new URL('../web/public/app/components/item-menu.js', import.meta.url), 'utf8')
  // openLink só em copiarLinkDoItem (com publico: true, vindo da escolha ou da escolha lembrada) e no Compartilhar.
  assert.equal((menu.match(/await openLink\(/g) || []).length, 2)
  assert.match(menu, /if \(!padrao\) return setFase\('link'\)/, 'sem escolha guardada, pergunta')
  const comp = fs.readFileSync(new URL('../public/components/compartilhar.js', import.meta.url), 'utf8')
  assert.match(comp, /if \(!modo\) \{\s*const r = await openModal\('escolher-link'/, 'sem escolha guardada, o computador pergunta')
  const link = fs.readFileSync(new URL('../public/components/link-share.js', import.meta.url), 'utf8')
  assert.equal((link.match(/\/link\/liberar`/g) || []).length, 2, 'liberar: o clique público e a confirmação do cartão')
})
