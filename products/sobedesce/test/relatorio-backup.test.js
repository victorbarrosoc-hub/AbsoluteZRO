// Relatório do que passou (src/backup/relatorio.js): a diária do Backup Automático e o download do Drive.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bytes, contar, dadosDaDiaria, dadosDoDrive, relatorioHtml } from '../src/backup/relatorio.js'
import { RELATORIO_CSP } from '../src/server/backup.js'

const linha = (o) => ({ v: 1, app: 'sobedesce', resultado: 'ok', secao: 'cenas', copiados: 2, bytes: 2048, quando: '2026-11-07T15:00:00Z', ...o })

test('diária: por câmera e cartão, só da diária pedida, repetição conta uma vez, e o link do Synquei no fim', () => {
  const linhas = [
    linha({ id: 'd1', diaria: { n: 1, nome: 'Diária 01' }, dono: { pasta: 'Aladim - FX30' }, cartao: { n: 1, nome: 'Cartão 01' }, arquivos: [{ rel: 'C0001.MP4', size: 1 }, { rel: 'C0001M01.XML', size: 1 }] }),
    linha({ id: 'd1', diaria: { n: 1, nome: 'Diária 01' }, dono: { pasta: 'Aladim - FX30' }, cartao: { n: 1, nome: 'Cartão 01' }, arquivos: [{ rel: 'C0001.MP4', size: 1 }] }),
    linha({ id: 'd2', diaria: { n: 1, nome: 'Diária 01' }, dono: { pasta: 'Som <Zoom>' }, cartao: { n: 1, nome: 'Cartão 01' }, resultado: 'falhou', arquivos: [{ rel: 'ZOOM0001.WAV', size: 1 }] }),
    linha({ id: 'd3', diaria: { n: 2, nome: 'Diária 02' }, dono: { pasta: 'Bia' }, cartao: { n: 1, nome: 'Cartão 01' }, arquivos: [] }),
  ]
  const d = dadosDaDiaria({ projeto: 'Ana & Leo', diaria: { n: 1, nome: 'Diária 01' }, linhas, tipoLabel: 'Casamento', link: 'synquei://organizar?pasta=%2FHD%2FAna' })
  assert.equal(d.total.cartoes, 2)
  assert.equal(d.total.cameras, 2)
  assert.equal(d.total.problemas, 1)
  assert.deepEqual(d.cameras.map((c) => c.nome), ['Aladim - FX30', 'Som <Zoom>'])
  const html = relatorioHtml(d)
  assert.doesNotMatch(html, /<script/i)
  assert.match(html, /Som &lt;Zoom&gt;/)
  assert.match(html, /Ana &amp; Leo/)
  assert.match(html, /href="synquei:\/\/organizar\?pasta=%2FHD%2FAna">Preparar no Synquei</)
  assert.match(html, /1 cartão pede atenção/)
  assert.doesNotMatch(RELATORIO_CSP, /script-src/)
})

test('diária sem cartão: sem botão do Synquei', () => {
  const html = relatorioHtml(dadosDaDiaria({ projeto: 'X', diaria: { n: 1, nome: 'Diária 01' }, linhas: [], link: 'synquei://organizar?pasta=%2FX' }))
  assert.doesNotMatch(html, /Preparar no Synquei/)
})

test('Drive: por pasta de cima, e só diz conferido com MD5', () => {
  const d = dadosDoDrive({
    linha: { v: 2, op: 'lote-123456', quando: '2026-11-07T15:00:00Z', destino: { pasta: 'Clipe Lua', caminho: '/HD/Clipe Lua' }, bytes: 3000, verificacao: { total: 3, conferidos: 2, sem_conferencia: 1 }, arquivos: [{ rel: 'CAM A/A001.MOV', size: 1000, conferido: true }, { rel: 'CAM A/A002.MOV', size: 1000, conferido: false }, { rel: 'Som/T01.WAV', size: 1000, conferido: true }] },
  })
  assert.deepEqual(d.grupos.map((g) => [g.nome, g.arquivos, g.conferidos]), [['CAM A', 2, 1], ['Som', 1, 1]])
  const html = relatorioHtml(d)
  assert.match(html, /1 arquivo ficou sem conferência/)
  assert.match(html, /Conferido \(MD5\)/)
})

test('contas e tamanhos', () => {
  assert.deepEqual(contar([{ rel: 'a.MP4' }, { rel: 'b.wav' }, { rel: 'c.ARW' }, { rel: 'd.xml' }]), { videos: 1, audios: 1, fotos: 1, outros: 1 })
  assert.equal(bytes(1536), '1,5 KB')
})
