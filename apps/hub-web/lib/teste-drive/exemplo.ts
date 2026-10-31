// Teste do Drive: um resultado FICTÍCIO, só para ver a tela de resultado fora de produção (/admin/teste-drive?exemplo=1,
// fotos e e2e). Não é medição: a tela mostra a faixa "Exemplo" e nenhuma chamada ao Google acontece.
import type { Checagem } from './veredito'

export const EXEMPLO: Checagem[] = [
  { id: 'ler_pasta', estado: 'passou', status: 200, detalhe: 'A pasta respondeu. canListChildren: não, canAddChildren: sim.' },
  {
    id: 'listar_filhos',
    estado: 'falhou',
    status: 200,
    detalhe: 'Voltou 0 itens, embora a pasta tenha 4 itens: o drive.file não enxerga o que o app não criou.',
  },
  { id: 'ler_arquivo_existente', estado: 'nao_testado', detalhe: 'A listagem não trouxe um arquivo para ler.' },
  { id: 'listar_subpasta', estado: 'nao_testado', detalhe: 'A listagem não trouxe uma subpasta.' },
  { id: 'enviar_arquivo', estado: 'passou', status: 200, detalhe: 'teste-absolutezro.txt entrou na pasta.' },
  { id: 'criar_subpasta', estado: 'passou', status: 200, detalhe: 'teste-absolutezro/ criada, com um arquivo dentro.' },
  {
    id: 'ler_criados',
    estado: 'passou',
    status: 200,
    detalhe: 'Leu o arquivo e a subpasta criados. A pasta agora lista 2 itens (antes: 0); 2 de 2 são do app.',
  },
  { id: 'ler_escolhidos', estado: 'passou', status: 206, detalhe: '3 de 3 lidos (metadados e começo do conteúdo).' },
]

export const EXEMPLO_ESCOPOS = 'https://www.googleapis.com/auth/drive.file'
