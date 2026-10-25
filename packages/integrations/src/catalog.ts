/**
 * O que o HUB sabe fazer com cada produto hoje, sem exagero (PRD §2, §6.2). Usado no catálogo e na
 * página do projeto. Estratégia: (a) código no monorepo, (b) módulo isolado, (c) adaptador, (d) link externo.
 */
export type AdapterInfo = {
  productId: string
  strategy: string
  inputs: string[]
  outputs: string[]
  hubCan: string[]
  notYet: string[]
  sourceManifest: string | null
}

export const ADAPTERS: AdapterInfo[] = [
  {
    productId: 'carro-do-freela',
    strategy: '(d) link externo + (c) contrato job.created',
    inputs: ['Oportunidade, briefing, equipe, datas'],
    outputs: ['Job → projeto no HUB, referências, funções da equipe'],
    hubCan: ['Criar projeto a partir de um job no formato carro-do-freela.job/1', 'Guardar o vínculo com o job de origem'],
    notYet: ['O protótipo ainda não envia jobs sozinho'],
    sourceManifest: 'products/carro-do-freela/ORIGEM.md',
  },
  {
    productId: 'tpeasy',
    strategy: '(d) link externo + (c) backup JSON do TPeasy',
    inputs: ['Briefing ou roteiro (opcional)'],
    outputs: ['Roteiro versionado no HUB', 'Arquivo de backup que o TPeasy importa'],
    hubCan: ['Exportar o roteiro do projeto para o TPeasy', 'Importar um roteiro do TPeasy como nova versão'],
    notYet: ['Sincronização automática (o TPeasy sincroniza só com a própria conta)'],
    sourceManifest: 'products/tpeasy/ORIGEM.md',
  },
  {
    productId: 'sobedesce',
    strategy: '(c) adaptador do resumo descargas.jsonl v1 + relatórios xxHash64',
    inputs: ['Arquivos brutos, destinos, regras de cópia (no app SOBEDESCE)'],
    outputs: ['Manifest com checksums por destino e relatório de integridade'],
    hubCan: ['Importar o resumo do cartão e os relatórios de checksum', 'Mostrar o que está conferido, não conferido ou divergente'],
    notYet: ['Ler os discos direto (o SOBEDESCE roda no computador; o HUB recebe o que ele grava)'],
    sourceManifest: 'products/sobedesce/ORIGEM.md',
  },
  {
    productId: 'synquei',
    strategy: '(c) adaptador manifest → prévia de organização',
    inputs: ['Manifest SOBEDESCE ou importação manual'],
    outputs: ['Prévia de pastas e bins, sem mover arquivos'],
    hubCan: ['Validar o manifest', 'Propor a organização preservando os IDs dos ativos'],
    notYet: ['Sincronizar pelo som (roda no app Synquei)', 'Executar movimentações no disco'],
    sourceManifest: 'products/synquei/ORIGEM.md',
  },
  {
    productId: 'ai-edit',
    strategy: 'Scaffold de produto futuro',
    inputs: ['Mídias, transcrições, brief, referências, presets de linguagem'],
    outputs: ['Decupagem, selects, markers, timeline editável'],
    hubCan: ['Contrato de eventos edit.selects.ready e edit.timeline.ready'],
    notYet: ['Nenhum processamento: a ferramenta ainda não existe'],
    sourceManifest: null,
  },
  {
    productId: 'nossom',
    strategy: '(d) link externo com conta própria',
    inputs: ['Timeline, áudio, marcações da edição'],
    outputs: ['Áudio limpo, mix, master'],
    hubCan: ['Abrir o NOSSOM', 'Contrato edit.timeline.ready para a passagem futura'],
    notYet: ['Enviar áudio: o áudio fica no dispositivo, por desenho do NOSSOM'],
    sourceManifest: 'products/nossom/ORIGEM.md',
  },
  {
    productId: 'finishing',
    strategy: 'Scaffold de produto futuro',
    inputs: ['Timeline aprovada, mídia vinculada, perfis de destino'],
    outputs: ['Master, versões, QC e pacotes de entrega'],
    hubCan: ['Contrato de eventos finishing.qc.completed e delivery.ready'],
    notYet: ['Nenhum processamento: a ferramenta ainda não existe'],
    sourceManifest: null,
  },
]

export const adapterFor = (productId: string) => ADAPTERS.find((a) => a.productId === productId) ?? null
