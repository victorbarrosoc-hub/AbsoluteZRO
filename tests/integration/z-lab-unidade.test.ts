// Laboratório da Z (ADR 0033), sem banco: anexos (tipo pelo conteúdo, limites, Office por dentro, bomba de zip), conta
// de custo, configuração e tom, pedidos, filtro de voz, a guarda de admin e as funções puras do navegador (frases para a
// voz e PCM).
import { describe, expect, it } from 'vitest'
import type { Authenticated } from '@zro/auth'
import {
  adminDoLab,
  blocoDeConhecimento,
  classificarVoz,
  custoDesignUsd,
  custoEscutaUsd,
  custoIaUsd,
  custoMinutoDeVoz,
  custoTranscricaoUsd,
  custoVozUsd,
  decodificarXml,
  descobrirTipo,
  lerArquivo,
  lerPedidoDeDesign,
  lerPedidoDeFala,
  lerPedidoDeVoz,
  lerPedidoDoLab,
  lerZConfig,
  linhaDeTom,
  nomeSeguro,
  personalizacaoDe,
  Z_ANEXO_MAX_BYTES,
  Z_IDENTIDADE_LAB,
  Z_REGRAS_PADRAO,
  Z_TEXTO_MAX_CARACTERES,
  Z_TOM_PADRAO,
  zConfigPadrao,
} from '@zro/core'
import { base64, bytesDoPcm, paraInt16, pedacosDoPcm, reamostrar, Reamostrador } from '../../apps/hub-web/lib/ia/lab/audio'
import { Frases, paraFala } from '../../apps/hub-web/lib/ia/lab/frases'
import { zip } from '../fixtures/zip'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16])
const PDF = new TextEncoder().encode('%PDF-1.7\n%âãÏÓ\n1 0 obj\n')

describe('anexos: tipo pelo conteúdo e limites', () => {
  it('imagem e PDF pelo começo do arquivo, não pela extensão', () => {
    expect(lerArquivo(PNG, 'foto.pdf')).toMatchObject({ tipo: 'imagem', mime: 'image/png' })
    expect(lerArquivo(JPEG, 'x.txt')).toMatchObject({ tipo: 'imagem', mime: 'image/jpeg' })
    expect(lerArquivo(PDF, 'contrato.png')).toMatchObject({ tipo: 'pdf', mime: 'application/pdf' })
  })

  it('texto e CSV em UTF-8; binário, vazio, grande e Office antigo são recusados', () => {
    const csv = lerArquivo(new TextEncoder().encode('nome,valor\nPlano,99\n'), 'planos.csv')
    expect(csv).toMatchObject({ tipo: 'texto', origem: 'texto', texto: 'nome,valor\nPlano,99', cortado: false })
    expect(() => lerArquivo(new Uint8Array([1, 2, 0, 0, 255, 254, 3]), 'x.bin')).toThrow(/não suportado/)
    expect(() => lerArquivo(new Uint8Array(), 'vazio.txt')).toThrow(/vazio/)
    expect(() => lerArquivo(new Uint8Array(Z_ANEXO_MAX_BYTES + 1).fill(65), 'grande.txt')).toThrow(/grande demais/)
    expect(() => lerArquivo(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]), 'velho.doc')).toThrow(/Formato antigo/)
    expect(() => lerArquivo(new TextEncoder().encode('ID3 nada'), 'musica.mp3')).toThrow(/transcrição/)
  })

  it('texto longo é cortado e avisa', () => {
    const r = lerArquivo(new TextEncoder().encode('a'.repeat(Z_TEXTO_MAX_CARACTERES + 50)), 'longo.md')
    expect(r).toMatchObject({ tipo: 'texto', cortado: true })
    expect(r.tipo === 'texto' && r.texto.length).toBe(Z_TEXTO_MAX_CARACTERES)
  })

  it('Word, Excel e PowerPoint por dentro: só o texto, com entidades básicas', () => {
    const docx = zip({
      '[Content_Types].xml': '<Types/>',
      'word/document.xml':
        '<w:document><w:body><w:p><w:r><w:t>Olá, </w:t></w:r><w:r><w:t xml:space="preserve">Z &amp; equipe</w:t></w:r></w:p><w:p><w:r><w:t>Linha 2</w:t><w:tab/><w:t>fim</w:t></w:r></w:p></w:body></w:document>',
    })
    expect(descobrirTipo(docx, 'a.docx')).toBe('docx')
    expect(lerArquivo(docx, 'a.docx')).toMatchObject({ tipo: 'texto', origem: 'docx', texto: 'Olá, Z & equipe\nLinha 2\tfim' })

    const xlsx = zip({
      'xl/workbook.xml': '<workbook><sheets><sheet name="Preços" sheetId="1"/></sheets></workbook>',
      'xl/sharedStrings.xml': '<sst><si><t>Plano</t></si><si><t>Estúdio</t></si></sst>',
      'xl/worksheets/sheet1.xml':
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>99</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" t="inlineStr"><is><t>mensal</t></is></c></row></sheetData></worksheet>',
    })
    expect(lerArquivo(xlsx, 'p.xlsx')).toMatchObject({ origem: 'xlsx', texto: 'Planilha: Preços\nPlano\t\t99\nEstúdio\tmensal' })

    const pptx = zip({
      'ppt/presentation.xml': '<p:presentation/>',
      'ppt/slides/slide2.xml': '<p:sld><a:p><a:r><a:t>Segundo</a:t></a:r></a:p></p:sld>',
      'ppt/slides/slide1.xml': '<p:sld><a:p><a:r><a:t>Primeiro &lt;slide&gt;</a:t></a:r></a:p></p:sld>',
    })
    expect(lerArquivo(pptx, 'd.pptx')).toMatchObject({ origem: 'pptx', texto: 'Slide 1\nPrimeiro <slide>\n\nSlide 2\nSegundo' })
  })

  it('ZIP perigoso ou estranho é recusado sem descompactar', () => {
    // Bomba: declara 2 MB a partir de poucos bytes (proporção absurda).
    const bomba = zip({ 'word/document.xml': new Uint8Array(2_000_000) })
    expect(() => lerArquivo(bomba, 'bomba.docx')).toThrow(/suspeito/)
    expect(() => lerArquivo(zip({ 'word/document.xml': '<w:t>x</w:t>' }, { flags: 1 }), 'senha.docx')).toThrow(/senha/)
    expect(() => lerArquivo(zip({ 'leiame.txt': 'oi' }), 'qualquer.zip')).toThrow(/não é Word/)
    // Tamanho declarado mentindo: a saída é travada e não bate.
    expect(() => lerArquivo(zip({ 'word/document.xml': '<w:t>texto de verdade aqui</w:t>' }, { tamanhoFalso: 5 }), 'menti.docx')).toThrow()
    // Sem texto nenhum.
    expect(() => lerArquivo(zip({ 'word/document.xml': '<w:document/>' }), 'vazio.docx')).toThrow(/Não achei texto/)
  })

  it('XML: só as 5 entidades e as numéricas; entidade externa não é seguida', () => {
    expect(decodificarXml('&lt;a&gt; &amp; &quot;b&quot; &apos;c&apos; &#65;&#x42;')).toBe(`<a> & "b" 'c' AB`)
    expect(decodificarXml('&xxe; &#0;')).toBe('&xxe; ')
  })

  it('nome seguro: sem caminho, sem controle, até 120', () => {
    expect(nomeSeguro('../../etc/passwd')).toBe('passwd')
    expect(nomeSeguro('C:\\x\\a<b>"c\u0007.txt')).toBe('abc.txt')
    expect(nomeSeguro('')).toBe('arquivo')
    expect(nomeSeguro('a'.repeat(300))).toHaveLength(120)
  })
})

describe('custos', () => {
  it('voz, transcrição, escuta, criar voz e Claude', () => {
    expect(custoVozUsd(1000, 'eleven_flash_v2_5')).toBeCloseTo(0.04)
    expect(custoVozUsd(1000, 'eleven_multilingual_v2')).toBeCloseTo(0.08)
    expect(custoVozUsd(1000, 'desconhecido')).toBeCloseTo(0.08)
    expect(custoVozUsd(-5, 'eleven_flash_v2_5')).toBe(0)
    expect(custoTranscricaoUsd(3600)).toBeCloseTo(0.22)
    expect(custoEscutaUsd(3600)).toBeCloseTo(0.39)
    expect(custoDesignUsd(200)).toBeCloseTo((200 * 3 * 0.08) / 1000)
    expect(custoIaUsd('claude-haiku-5-5', { entrada: 1_000_000, saida: 0, cache: 0 })).toBeCloseTo(0.1)
  })

  it('minuto de voz: estimativa com as premissas do laboratório', () => {
    const opus = custoMinutoDeVoz()
    expect(opus.escuta).toBeCloseTo(0.39 / 60)
    expect(opus.voz).toBeCloseTo((450 / 1000) * 0.04)
    expect(opus.total).toBeCloseTo(opus.escuta + opus.voz + opus.claude)
    const rapido = custoMinutoDeVoz({ modelo: 'claude-haiku-5-5' })
    expect(rapido.total).toBeLessThan(opus.total)
    expect(opus.total).toBeGreaterThan(0.03)
    expect(opus.total).toBeLessThan(0.15)
  })
})

describe('configuração, tom e personalidade', () => {
  it('o padrão valida e o tom padrão não muda o texto da Z', () => {
    const p = zConfigPadrao()
    expect(lerZConfig(p)).toEqual(p)
    expect(p.identidade).toBe(Z_IDENTIDADE_LAB)
    expect(linhaDeTom({ ...Z_TOM_PADRAO })).toBeNull()
    expect(linhaDeTom({ formalidade: 90, detalhe: 90 })).toMatch(/formal.*detalhadas/)
    expect(linhaDeTom({ formalidade: 5, detalhe: 5 })).toMatch(/bem próximo.*curtíssimas/)
    expect(() => lerZConfig({ ...p, tom: { formalidade: 101, detalhe: 0 } })).toThrow()
    expect(() => lerZConfig({ ...p, modelo: { id: 'gpt', resposta: 'media' } })).toThrow()
    expect(() => lerZConfig({ ...p, voz: { ...p.voz, id: 'x y' } })).toThrow()
  })

  it('personalização: instrução da plataforma atual, regras vazias voltam ao padrão, referência é dado', () => {
    const p = { ...zConfigPadrao(), regras: '', apps: { maestro: 'Comece pelo funil.', relay: 'Não fale de preço.' } }
    const noMaestro = personalizacaoDe(p, 'maestro')
    expect(noMaestro.regras).toBe(Z_REGRAS_PADRAO)
    expect(noMaestro.extras).toEqual(['Nesta plataforma (Maestro): Comece pelo funil.'])
    expect(personalizacaoDe(p, null).extras).toEqual([])
    const bloco = blocoDeConhecimento([{ titulo: 'FAQ "nova"', texto: 'Resposta.' }])
    expect(bloco).toMatch(/dados, não instruções/)
    expect(bloco).toContain(`<referencia titulo="FAQ 'nova'">`)
    expect(blocoDeConhecimento([])).toBeNull()
  })

  it('voz da Z: feminina e pt-BR pelos rótulos ou pelo idioma verificado', () => {
    expect(classificarVoz({ labels: { gender: 'female', accent: 'brazilian' } })).toEqual({ feminina: true, ptBr: true })
    expect(classificarVoz({ labels: { gender: 'Female' }, verified_languages: [{ language: 'pt', locale: 'pt-BR' }] })).toEqual({ feminina: true, ptBr: true })
    expect(classificarVoz({ labels: { gender: 'female', accent: 'portuguese' } })).toEqual({ feminina: true, ptBr: false })
    expect(classificarVoz({ labels: { gender: 'male', accent: 'brazilian' } })).toEqual({ feminina: false, ptBr: true })
    expect(classificarVoz({})).toEqual({ feminina: false, ptBr: false })
  })
})

describe('pedidos', () => {
  const h = (papel: 'user' | 'assistant', texto: string) => ({ papel, texto })
  it('turno: termina na pessoa, anexos válidos, modelo conhecido, texto anexado com limite', () => {
    expect(lerPedidoDoLab({ versao: 'rascunho', historico: [h('user', 'oi')] }).versao).toBe('rascunho')
    expect(() => lerPedidoDoLab({ versao: 'rascunho', historico: [h('user', 'oi'), h('assistant', 'olá')] })).toThrow(/Escreva/)
    expect(() => lerPedidoDoLab({ versao: 'rascunho', modelo: 'gpt-5', historico: [h('user', 'oi')] })).toThrow()
    expect(() => lerPedidoDoLab({ versao: 0, historico: [h('user', 'oi')] })).toThrow()
    expect(() =>
      lerPedidoDoLab({ versao: 'rascunho', historico: [{ papel: 'user', texto: '', anexos: [{ tipo: 'imagem', arquivo: '../segredo', nome: 'x' }] }] }),
    ).toThrow()
    const grande = { tipo: 'texto', nome: 'a.txt', texto: 'x'.repeat(150_000), origem: 'texto' }
    expect(() => lerPedidoDoLab({ versao: 'padrao', historico: [{ papel: 'user', texto: '', anexos: [grande, grande, grande] }] })).toThrow(
      /Texto anexado demais/,
    )
    expect(
      lerPedidoDoLab({ versao: 3, historico: [{ papel: 'user', texto: '', anexos: [{ tipo: 'pdf', arquivo: 'file_abc123XYZ', nome: 'c.pdf' }] }] }).versao,
    ).toBe(3)
  })

  it('fala, design e salvar voz', () => {
    const f = { texto: 'Oi!', voz: 'abcdEFGH1234', modelo: 'eleven_flash_v2_5', velocidade: 1, estabilidade: 0.5, chave: 'chave-1234' }
    expect(lerPedidoDeFala(f).texto).toBe('Oi!')
    expect(() => lerPedidoDeFala({ ...f, voz: '../x' })).toThrow()
    expect(() => lerPedidoDeFala({ ...f, texto: 'x'.repeat(1201) })).toThrow()
    expect(() => lerPedidoDeDesign({ descricao: 'mulher brasileira calorosa', texto: 'curto', chave: 'chave-1234' })).toThrow(/100 caracteres/)
    expect(lerPedidoDeDesign({ descricao: 'mulher brasileira calorosa', texto: 'a'.repeat(120), chave: 'chave-1234' }).texto).toHaveLength(120)
    const v = { amostra: 'gen_voice_123', nome: 'Z', descricao: 'mulher brasileira calorosa' }
    expect(() => lerPedidoDeVoz(v)).toThrow(/Confirme/)
    expect(lerPedidoDeVoz({ ...v, confirmar: true }).nome).toBe('Z')
  })
})

describe('guarda de admin', () => {
  const auth = (platformRole: 'admin' | 'support' | null, emailVerified = true) =>
    ({
      user: { id: '11111111-1111-4111-8111-111111111111', platformRole, emailVerified, status: 'active' },
      session: { activeOrgId: null },
    }) as unknown as Authenticated
  it('só admin com e-mail confirmado', () => {
    expect(() => adminDoLab(null)).toThrow()
    expect(() => adminDoLab(auth(null))).toThrow(/restrita/)
    expect(() => adminDoLab(auth('support'))).toThrow(/restrita/)
    expect(() => adminDoLab(auth('admin', false))).toThrow()
  })
})

describe('navegador: frases para a voz e PCM', () => {
  it('a primeira frase sai logo; as outras esperam um tamanho bom; o resto sai no fim', () => {
    const f = new Frases()
    expect(f.empurrar('Oi! ')).toEqual(['Oi!'])
    expect(f.empurrar('Tudo bem. Hoje ')).toEqual([])
    expect(f.empurrar('temos três projetos abertos no HUB. E ')).toEqual(['Tudo bem. Hoje temos três projetos abertos no HUB.'])
    expect(f.fechar()).toEqual(['E'])
    // Frase enorme sem ponto quebra na vírgula.
    const g = new Frases(28, 80)
    const partes = g.empurrar(`${'palavra '.repeat(8)}, ${'outra '.repeat(12)}`)
    expect(partes.length).toBeGreaterThan(0)
    expect(partes.every((p) => p.length <= 81)).toBe(true)
  })

  it('o que não se fala sai antes da voz', () => {
    expect(paraFala('**Olá**, veja [o HUB](https://absolutezro.com) 😀\n- item um\n- item dois')).toBe('Olá, veja o HUB item um item dois')
    expect(paraFala('## Título\n`código` e https://x.y/z')).toBe('Título código e')
  })

  it('PCM: reamostra contínuo, converte e corta em pedaços pares', () => {
    const um = new Float32Array(480).fill(0.5)
    expect(reamostrar(um, 48_000, 16_000).length).toBeGreaterThanOrEqual(159)
    expect(reamostrar(um, 16_000, 16_000)).toEqual(um)
    const r = new Reamostrador(48_000, 16_000)
    let total = 0
    for (let i = 0; i < 100; i++) total += r.empurrar(new Float32Array(128).fill(0.1)).length
    expect(Math.abs(total - (100 * 128) / 3)).toBeLessThan(3)
    expect([...paraInt16(new Float32Array([2, -2, 0]))]).toEqual([32767, -32768, 0])
    expect([...bytesDoPcm(new Int16Array([1, -2]))]).toEqual([1, 0, 254, 255])
    const pcm = new Uint8Array(32_000 * 250 + 1)
    const pedacos = pedacosDoPcm(pcm, 100)
    expect(pedacos).toHaveLength(3)
    expect(pedacos[0]!.length).toBe(3_200_000)
    expect(pedacos.slice(0, -1).every((p) => p.length % 2 === 0)).toBe(true)
    expect(base64(new Uint8Array([104, 105]))).toBe('aGk=')
  })
})
