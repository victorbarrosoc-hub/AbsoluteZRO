// Adaptadores com fixtures gerados pelo código real do SOBEDESCE (tests/fixtures/sobedesce/README.md).
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { CarroJobSchema, OrganizationPlanSchema, validateManifest } from '@zro/media-contracts'
import {
  buildSobedesceManifest,
  parseChecksumReport,
  parseDescargas,
  parseEntrega,
  parsePreparos,
  planOrganization,
  projectInputFromJob,
  scriptFromTpeasyBackup,
  sobedesceAssetId,
  toTpeasyBackup,
  tpeasyBlocks,
  ultimoPreparo,
} from '../src/index'
import { fixture } from '../../../tests/integration/helpers'

const projectId = randomUUID()

describe('SOBEDESCE → manifest', () => {
  it('lê o descargas.jsonl real, ignora linha pela metade e cancelada', () => {
    const real = fixture('sobedesce/descargas.jsonl')
    const p = parseDescargas(real)
    expect(p.entries).toHaveLength(2)
    expect(p.partialTail).toBe(false)
    const cancel = JSON.stringify({ ...JSON.parse(real.split('\n')[0]!), id: 'x', resultado: 'cancelado' })
    const p2 = parseDescargas(`${real}${cancel}\nlixo\n{"v":1,"app":"sobed`)
    expect(p2.entries).toHaveLength(2)
    expect(p2.partialTail).toBe(true)
    expect(p2.skipped.map((s) => s.reason)).toEqual(['descarga cancelada', 'linha estragada (JSON inválido)'])
  })

  it('relatório xxh64 no formato do xxhsum', () => {
    const r = parseChecksumReport('SOBEDESCE_copia_x.xxh64', fixture('sobedesce/unica-principal.xxh64'))
    expect(r.algorithm).toBe('xxh64')
    expect(r.entries.get('PRIVATE/M4ROOT/CLIP/C0101.MP4')).toMatch(/^[0-9a-f]{16}$/)
    expect(r.invalidLines).toBe(0)
    expect(parseChecksumReport('a.md5', 'd41d8cd98f00b204e9800998ecf8427e *x.mov').entries.get('x.mov')).toBe('d41d8cd98f00b204e9800998ecf8427e')
  })

  it('leva única conferida nos dois destinos = backup comprovado', () => {
    const [entry] = parseDescargas(fixture('sobedesce/unica-descargas.jsonl')).entries
    const m = buildSobedesceManifest({
      projectId,
      entry: entry!,
      destinations: [
        { id: 'hd-principal', label: 'HD principal', reports: [{ name: 'SOBEDESCE_copia.xxh64', text: fixture('sobedesce/unica-principal.xxh64') }] },
        { id: 'hd-backup', label: 'HD backup', reports: [{ name: 'SOBEDESCE_copia.xxh64', text: fixture('sobedesce/unica-backup.xxh64') }] },
      ],
    })
    const v = validateManifest(m)
    expect(v.status).toBe('valid')
    expect(m.verification_summary).toMatchObject({ assets_total: 3, verified_locations: 6, unverified_locations: 0, backup_complete: true })
    expect(m.assets.every((a) => a.destinations.every((d) => d.uri.startsWith('zro-dest://')))).toBe(true)
  })

  it('sem relatório o backup NÃO é declarado concluído', () => {
    const [entry] = parseDescargas(fixture('sobedesce/unica-descargas.jsonl')).entries
    const m = buildSobedesceManifest({ projectId, entry: entry!, destinations: [{ id: 'hd-principal', label: 'HD', reports: [] }] })
    expect(m.verification_summary.backup_complete).toBe(false)
    expect(m.assets.every((a) => a.destinations[0]!.status === 'unverified')).toBe(true)
    const v = validateManifest(m)
    expect(v.status).toBe('valid_with_warnings')
    expect(v.issues.map((i) => i.code)).toContain('unverified_locations')
  })

  it('duas levas no mesmo minuto: só a última tem prova (comportamento real do SOBEDESCE)', () => {
    const entries = parseDescargas(fixture('sobedesce/descargas.jsonl')).entries
    const m = buildSobedesceManifest({
      projectId,
      entry: entries[1]!,
      destinations: [{ id: 'hd-principal', label: 'HD', reports: [{ name: 'r.xxh64', text: fixture('sobedesce/principal-leva1.xxh64') }] }],
    })
    const byName = Object.fromEntries(m.assets.map((a) => [a.original_name, a.destinations[0]!.status]))
    expect(byName['C0003.MP4']).toBe('verified')
    expect(byName['C0001.MP4']).toBe('unverified')
    expect(m.verification_summary.backup_complete).toBe(false)
  })

  it('checksum divergente entre destinos vira erro explícito', () => {
    const [entry] = parseDescargas(fixture('sobedesce/unica-descargas.jsonl')).entries
    const bad = fixture('sobedesce/unica-backup.xxh64').replace(/^[0-9a-f]{16}/, '0000000000000000')
    const m = buildSobedesceManifest({
      projectId,
      entry: entry!,
      destinations: [
        { id: 'a', label: 'A', reports: [{ name: 'r.xxh64', text: fixture('sobedesce/unica-principal.xxh64') }] },
        { id: 'b', label: 'B', reports: [{ name: 'r.xxh64', text: bad }] },
      ],
    })
    const v = validateManifest(m)
    expect(v.status).toBe('invalid')
    expect(v.issues.some((i) => i.code === 'checksum_mismatch')).toBe(true)
  })

  it('IDs de ativo são estáveis entre levas e destinos', () => {
    const entries = parseDescargas(fixture('sobedesce/descargas.jsonl')).entries
    const ids1 = buildSobedesceManifest({ projectId, entry: entries[0]!, destinations: [] }).assets.map((a) => a.asset_id)
    const ids2 = buildSobedesceManifest({ projectId, entry: entries[1]!, destinations: [] }).assets.map((a) => a.asset_id)
    for (const id of ids1) expect(ids2).toContain(id)
    expect(sobedesceAssetId('P', 'Diária 01/Cenas/X/Cartão 01', 'a.mp4')).toBe(sobedesceAssetId('P', 'Diária 01/Cenas/X/Cartão 01', 'a.mp4'))
  })

  it('caminho perigoso é recusado pelo contrato', () => {
    const [entry] = parseDescargas(fixture('sobedesce/unica-descargas.jsonl')).entries
    expect(() => buildSobedesceManifest({ projectId, entry: { ...entry!, cartao: { ...entry!.cartao, pasta: '../fora' } }, destinations: [] })).toThrow()
    const m = buildSobedesceManifest({
      projectId,
      entry: { ...entry!, arquivos: [{ rel: '../../etc/passwd', size: 1 }, ...entry!.arquivos] },
      destinations: [],
    })
    expect(m.assets.some((a) => a.relative_path.includes('..'))).toBe(false)
    expect(m.warnings.some((w) => w.includes('caminho inseguro'))).toBe(true)
  })
})

describe('Synquei: prévia de organização', () => {
  it('preserva todos os asset IDs, não move nada e cria as pastas de trabalho do Synquei', () => {
    const [entry] = parseDescargas(fixture('sobedesce/unica-descargas.jsonl')).entries
    const m = buildSobedesceManifest({ projectId, entry: entry!, destinations: [] })
    const plan = planOrganization(m)
    expect(OrganizationPlanSchema.parse(plan)).toBeTruthy()
    expect(plan.dry_run).toBe(true)
    expect(plan.moves).toEqual([])
    expect(plan.create_folders).toEqual(['Assets', 'Exports', 'Synquei/Sequências'])
    expect(new Set(plan.assets.map((a) => a.asset_id))).toEqual(new Set(m.assets.map((a) => a.asset_id)))
    expect(plan.assets.every((a, i) => a.keep_path === m.assets[i]!.relative_path)).toBe(true)
    expect(plan.bins[0]!.bin).toBe('Diária 01/Camera B - FX3/Cartão 01')
  })
})

describe('TPeasy e Carro do Freela', () => {
  it('backup do TPeasy vai e volta sem mexer nos ajustes do app', () => {
    const b = toTpeasyBackup({ projectId, title: 'Roteiro', body: '# Abertura\nOlá **mundo** [pausa]\n((nota))', updatedAt: new Date() })
    expect(b).toMatchObject({ app: 'tpeasy', version: 1 })
    expect('prefs' in b).toBe(false)
    expect(scriptFromTpeasyBackup(JSON.parse(JSON.stringify(b)))).toMatchObject({ id: `zro-${projectId}`, title: 'Roteiro' })
    expect(tpeasyBlocks(b.scripts[0]!.body)).toEqual(['Abertura'])
    expect(() => scriptFromTpeasyBackup({ app: 'outro' })).toThrow('não é um backup do TPeasy')
  })

  it('job do Carro do Freela vira projeto sem dados pessoais', () => {
    const job = CarroJobSchema.parse({ contract: 'carro-do-freela.job/1', job_id: 'job-1', title: 'Casamento', crew_roles: [{ role: 'Câmera', count: 2 }] })
    const p = projectInputFromJob(job)
    expect(p.brief).toMatchObject({ source: 'carro-do-freela', job_id: 'job-1', crew_roles: [{ role: 'Câmera', count: 2 }] })
    expect(CarroJobSchema.safeParse({ contract: 'carro-do-freela.job/1', job_id: 'j', title: 't', references: ['http://inseguro'] }).success).toBe(false)
  })
})

describe('SOBEDESCE → entrega conferida', () => {
  const base = () => JSON.parse(fixture('sobedesce/entrega.json'))
  it('lê o comprovante gerado pelo código real', () => {
    const r = parseEntrega(fixture('sobedesce/entrega.json'))
    expect(r.ok && r.entrega.arquivos.map((a) => a.rel)).toEqual(['Filme X · Reels.mp4', 'Filme X · YouTube.mp4', 'Legendas/Filme X.srt'])
  })
  it('recusa caminho perigoso, MD5 fora do formato, arquivo repetido e link que não é o da pasta', () => {
    const casos: [string, (e: ReturnType<typeof base>) => void][] = [
      ['caminho', (e) => (e.arquivos[0].rel = '../fora.mp4')],
      ['md5', (e) => (e.arquivos[0].md5 = 'abc')],
      ['repetido', (e) => (e.arquivos[1].rel = e.arquivos[0].rel)],
      ['link', (e) => (e.drive.link = 'https://drive.google.com/drive/folders/outra')],
      ['vazio', (e) => (e.arquivos = [])],
    ]
    for (const [nome, mexer] of casos) {
      const e = base()
      mexer(e)
      expect(parseEntrega(JSON.stringify(e)).ok, nome).toBe(false)
    }
    expect(parseEntrega('não é json').ok).toBe(false)
  })
})

describe('SOBEDESCE → Synquei: download do Drive (v2) e recibo do Synquei', () => {
  const texto = fixture('sobedesce/drive-descargas.jsonl')
  const linhaV2 = () => JSON.parse(texto.trim().split('\n')[1]!)
  const comLinha = (l: unknown) => `${JSON.stringify(l)}\n`

  it('lê a linha v2 gerada pelo código real; a v1 do mesmo arquivo continua igual', () => {
    const p = parseDescargas(texto)
    expect(p.entries).toHaveLength(1)
    expect(p.drive).toHaveLength(1)
    expect(p.skipped).toEqual([])
    const d = p.drive[0]!
    expect(d).toMatchObject({ v: 2, tipo: 'drive.download', op: 'bFixtureDrive01', estado: 'parcial', project_id: null })
    expect(d.verificacao).toEqual({ algoritmo: 'md5', total: 4, conferidos: 3, sem_conferencia: 1, tamanho: true })
    expect(d.arquivos.find((a) => a.rel === 'Roteiro.docx')).toMatchObject({ md5: null, conferido: false })
    expect(JSON.stringify(d)).not.toMatch(/token|@|https:/)
  })

  it('manifesto adulterado ou fora do contrato fica de fora, com o motivo', () => {
    const casos: [string, (l: ReturnType<typeof linhaV2>) => void][] = [
      ['campo a mais', (l) => (l.token = 'x')],
      ['..', (l) => (l.arquivos[0].rel = '../../etc/passwd')],
      ['absoluto', (l) => (l.arquivos[0].rel = '/etc/passwd')],
      ['barra invertida', (l) => (l.arquivos[0].rel = 'Câmera A\\C0001.MP4')],
      ['segmento vazio', (l) => (l.arquivos[0].rel = 'Câmera A//C0001.MP4')],
      ['conferido sem md5', (l) => (l.arquivos[0].md5 = null)],
      ['contagem', (l) => (l.verificacao.conferidos = 4)],
      ['estado mentindo', (l) => (l.estado = 'conferido')],
      ['bytes', (l) => (l.bytes = 1)],
      ['repetido', (l) => (l.arquivos[1] = { ...l.arquivos[0] })],
      ['op', (l) => (l.op = 'a b')],
      ['project_id', (l) => (l.project_id = 'nao-uuid')],
      ['origem com conta', (l) => (l.origem.conta = 'x@y.z')],
    ]
    for (const [nome, mexer] of casos) {
      const l = linhaV2()
      mexer(l)
      const p = parseDescargas(comLinha(l))
      expect(p.drive, nome).toHaveLength(0)
      expect(p.skipped[0]?.reason, nome).toMatch(/fora do contrato v2/)
    }
    // project_id de verdade (vínculo em degraus) passa
    expect(parseDescargas(comLinha({ ...linhaV2(), project_id: projectId })).drive[0]?.project_id).toBe(projectId)
  })

  it('recibo do Synquei: a última linha do op vale; adulterado fica de fora', () => {
    const r = parsePreparos(fixture('sobedesce/drive-preparos.jsonl'))
    expect(r.entries.map((e) => e.estado)).toEqual(['recebido', 'preparando', 'com_pendencias'])
    const ultimo = ultimoPreparo(r.entries, 'bFixtureDrive01')
    expect(ultimo?.resultado).toMatchObject({ organizados: 3, revisar: 1, pendentes: 1 })
    expect(ultimo?.exemplos.revisar).toEqual(['Câmera B/A001_C002.MOV'])
    expect(ultimoPreparo(r.entries, 'outroLote01')).toBeNull()
    const base = r.entries[2]!
    const ruins = [
      { ...base, estado: 'feito' },
      { ...base, resultado: { ...base.resultado, organizados: -1 } },
      { ...base, exemplos: { ...base.exemplos, ausentes: ['../x'] } },
      { ...base, exemplos: { ...base.exemplos, ausentes: Array.from({ length: 31 }, (_, i) => `a${i}`) } },
      { ...base, extra: 1 },
    ]
    const p2 = parsePreparos(ruins.map((x) => JSON.stringify(x)).join('\n') + '\nlixo\n{"formato":')
    expect(p2.entries).toHaveLength(0)
    expect(p2.skipped).toHaveLength(6)
    expect(p2.partialTail).toBe(true)
  })
})
