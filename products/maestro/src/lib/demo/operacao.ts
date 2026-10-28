/**
 * O roteiro da demonstração para a produtora por dentro (plano v2 §6–§7): tabela de preços, orçamentos, financeiro,
 * freelas, inventário, agenda e documentos. Tudo inventado: pessoas fictícias, e-mails @exemplo.com, nenhum telefone,
 * nenhum CPF; a chave PIX de exemplo é aleatória (UUID gerado na hora). Datas relativas a hoje (em dias), valores em
 * centavos. Índices de cliente e projeto são os de produtora.ts. Puro: só dados.
 */
import type { CategoriaEquip, Estado } from "@/lib/inventario/nomes";
import type { Grupo, Quantidade } from "@/lib/orcamento/motor";
import type { Categoria } from "@/lib/financeiro/contas";
import type { TipoEvento } from "@/lib/agenda/servidor";

export const EMPRESA_DEMO = {
  razao: "Produtora Exemplo Audiovisual Ltda.",
  cnpj: "00.000.000/0001-00",
  endereco: "Rua dos Exemplos, 100 · São Paulo, SP",
  email: "contato@exemplo.com",
  instagram: "produtoraexemplo",
  site: "exemplo.com",
  cidade: "São Paulo",
  uf: "SP",
  lat: -23.5505,
  lon: -46.6333,
  validadeDias: 15,
  condicoes:
    "Validade de 15 dias a partir da emissão.\nDuas rodadas de ajuste incluídas em cada peça.\nDeslocamento fora da cidade base cobrado à parte.\nDireitos de uso por 12 meses nas redes da marca.",
  fechamento: "Para aprovar, é só responder a esta proposta. A partir daí, a gente marca a primeira conversa de produção.",
  demo: true,
};

/* ───────────── tabela de preços ───────────── */

export type ItemDemo = { grupo: Grupo; nome: string; descricao?: string; unidade: string; preco: number; custo: number; faixas?: [number, number][] };

export const ITENS_DEMO: ItemDemo[] = [
  { grupo: "pacote", nome: "Pacote reels do mês", descricao: "8 reels com roteiro, captação e edição", unidade: "pacote", preco: 480_000, custo: 210_000 },
  {
    grupo: "captacao",
    nome: "Diária de captação",
    descricao: "Câmera cinema e operador",
    unidade: "diaria",
    preco: 180_000,
    custo: 90_000,
    faixas: [
      [3, 165_000],
      [5, 150_000],
    ],
  },
  { grupo: "captacao", nome: "Meia diária de captação", unidade: "diaria", preco: 110_000, custo: 55_000 },
  { grupo: "captacao", nome: "Drone", descricao: "Piloto habilitado e seguro", unidade: "diaria", preco: 90_000, custo: 45_000 },
  { grupo: "captacao", nome: "Fotografia", unidade: "diaria", preco: 150_000, custo: 70_000 },
  { grupo: "captacao", nome: "Som direto", unidade: "diaria", preco: 80_000, custo: 45_000 },
  {
    grupo: "pos",
    nome: "Edição de vídeo curto",
    descricao: "Até 60 segundos",
    unidade: "video",
    preco: 90_000,
    custo: 35_000,
    faixas: [
      [4, 75_000],
      [10, 60_000],
    ],
  },
  { grupo: "pos", nome: "Edição de filme", descricao: "Até 3 minutos", unidade: "video", preco: 280_000, custo: 120_000 },
  { grupo: "pos", nome: "Color grading", unidade: "video", preco: 60_000, custo: 25_000 },
  { grupo: "pos", nome: "Motion de abertura", unidade: "unidade", preco: 120_000, custo: 50_000 },
  { grupo: "pos", nome: "Legendas", unidade: "video", preco: 15_000, custo: 5_000 },
  { grupo: "extra", nome: "Roteiro", unidade: "projeto", preco: 150_000, custo: 0 },
  { grupo: "extra", nome: "Trilha licenciada", unidade: "unidade", preco: 35_000, custo: 20_000 },
  { grupo: "extra", nome: "Tratamento de fotos", unidade: "unidade", preco: 2_500, custo: 800, faixas: [[40, 2_000]] },
  { grupo: "logistica", nome: "Alimentação da equipe", unidade: "diaria", preco: 25_000, custo: 25_000 },
  { grupo: "logistica", nome: "Hospedagem da equipe", unidade: "diaria", preco: 60_000, custo: 60_000 },
];

export type VariavelDemo = {
  chave: string;
  rotulo: string;
  tipo: "escolha" | "numero";
  opcoes: { valor: string; rotulo: string; mult?: number; grupos?: string[] }[];
};

export const VARIAVEIS_DEMO: VariavelDemo[] = [
  {
    chave: "nicho",
    rotulo: "Nicho",
    tipo: "escolha",
    opcoes: [
      { valor: "corporativo", rotulo: "Corporativo", mult: 1 },
      { valor: "casamento", rotulo: "Casamento", mult: 1.3 },
      { valor: "moda", rotulo: "Moda", mult: 1.15 },
      { valor: "imobiliario", rotulo: "Imobiliário", mult: 1.1 },
    ],
  },
  {
    chave: "urgencia",
    rotulo: "Prazo",
    tipo: "escolha",
    opcoes: [
      { valor: "normal", rotulo: "Normal" },
      { valor: "urgente", rotulo: "Urgente", mult: 1.25, grupos: ["pos"] },
    ],
  },
  { chave: "diarias", rotulo: "Diárias", tipo: "numero", opcoes: [] },
  { chave: "videos", rotulo: "Vídeos", tipo: "numero", opcoes: [] },
];

/** Linhas dos modelos: índice do item em ITENS_DEMO e a fórmula da quantidade. */
export type ModeloDemo = {
  nome: string;
  nicho: string;
  descricao: string;
  linhas: { item: number; qtd: Quantidade }[];
  respostas: Record<string, string | number>;
};

export const MODELOS_DEMO: ModeloDemo[] = [
  {
    nome: "Filme institucional",
    nicho: "corporativo",
    descricao: "Filme de até 3 min com roteiro, diárias e cor.",
    linhas: [
      { item: 11, qtd: { fixo: 1 } },
      { item: 1, qtd: { var: "diarias", min: 1 } },
      { item: 5, qtd: { var: "diarias", min: 1 } },
      { item: 7, qtd: { fixo: 1 } },
      { item: 8, qtd: { fixo: 1 } },
      { item: 6, qtd: { var: "videos" } },
      { item: 14, qtd: { var: "diarias", min: 1 } },
    ],
    respostas: { nicho: "corporativo", urgencia: "normal", diarias: 2, videos: 3 },
  },
  {
    nome: "Pacote de reels",
    nicho: "social",
    descricao: "Captação do mês e reels editados com legenda.",
    linhas: [
      { item: 2, qtd: { var: "diarias", min: 1 } },
      { item: 6, qtd: { var: "videos", min: 1 } },
      { item: 10, qtd: { var: "videos" } },
    ],
    respostas: { nicho: "corporativo", urgencia: "normal", diarias: 1, videos: 8 },
  },
  {
    nome: "Casamento",
    nicho: "casamento",
    descricao: "Filme, foto e drone no dia, com teaser para as redes.",
    linhas: [
      { item: 1, qtd: { var: "diarias", min: 1 } },
      { item: 4, qtd: { var: "diarias", min: 1 } },
      { item: 3, qtd: { fixo: 1 } },
      { item: 7, qtd: { fixo: 1 } },
      { item: 6, qtd: { var: "videos" } },
      { item: 13, qtd: { fixo: 60 } },
    ],
    respostas: { nicho: "casamento", urgencia: "normal", diarias: 1, videos: 2 },
  },
];

/* ───────────── orçamentos ───────────── */

export type LinhaOrcDemo = { item: number; qtd: number } | { livre: string; detalhe: string; preco: number; custo: number; unidade: string };
export type OrcamentoDemo = {
  cliente: number;
  projeto: number | null;
  titulo: string;
  categoria: string;
  status: "rascunho" | "enviado" | "aprovado" | "recusado";
  emissao: number;
  validadeDias: number;
  respostas: Record<string, string | number>;
  escopo: string;
  periodo?: string;
  pagamento?: string;
  desconto?: number;
  linhas: LinhaOrcDemo[];
  /** Aprovado: em quantas parcelas, a partir de qual dia. */
  parcelas?: { n: number; desde: number };
  /** Versão anterior recusada (o mesmo número, v1). */
  versaoAnteriorRecusada?: boolean;
};

export const ORCAMENTOS_DEMO: OrcamentoDemo[] = [
  {
    cliente: 0,
    projeto: 0,
    titulo: "Filme de marca: Safra 2027",
    categoria: "Filme publicitário",
    status: "aprovado",
    emissao: -28,
    validadeDias: 15,
    respostas: { nicho: "corporativo", urgencia: "normal", diarias: 3, videos: 3 },
    escopo:
      "Filme de 60s e versões de 30s e 15s.\n• Captação: 3 diárias (fazenda, torrefação e teaser)\n• Entrega: 1 filme e 3 cortes curtos, horizontal e vertical",
    periodo: "Captação em novembro, entrega em dezembro",
    pagamento: "50% na aprovação e 50% na entrega do primeiro corte.",
    linhas: [
      { item: 11, qtd: 1 },
      { item: 1, qtd: 3 },
      { item: 5, qtd: 3 },
      { item: 3, qtd: 1 },
      { item: 7, qtd: 1 },
      { item: 6, qtd: 3 },
      { item: 8, qtd: 4 },
      { item: 12, qtd: 1 },
      { item: 14, qtd: 3 },
    ],
    parcelas: { n: 2, desde: -20 },
  },
  {
    cliente: 1,
    projeto: 2,
    titulo: "Lançamento Residencial Jardins",
    categoria: "Filme imobiliário",
    status: "aprovado",
    emissao: -38,
    validadeDias: 10,
    respostas: { nicho: "imobiliario", urgencia: "normal", diarias: 2, videos: 2 },
    escopo: "Vídeo de lançamento de 90s, teaser de 15s e tour pelo decorado.",
    pagamento: "Três parcelas iguais a cada 30 dias.",
    linhas: [
      { item: 11, qtd: 1 },
      { item: 1, qtd: 2 },
      { item: 3, qtd: 2 },
      { item: 7, qtd: 1 },
      { item: 6, qtd: 2 },
      { item: 9, qtd: 1 },
      { item: 8, qtd: 3 },
    ],
    parcelas: { n: 3, desde: -30 },
  },
  {
    cliente: 3,
    projeto: 5,
    titulo: "Campanha de matrículas 2027",
    categoria: "Campanha",
    status: "aprovado",
    emissao: -22,
    validadeDias: 15,
    respostas: { nicho: "corporativo", urgencia: "urgente", diarias: 2, videos: 6 },
    escopo: "Vídeo de 60s, depoimentos de pais e peças para outdoor digital.",
    desconto: 50_000,
    linhas: [
      { item: 1, qtd: 2 },
      { item: 5, qtd: 2 },
      { item: 7, qtd: 1 },
      { item: 6, qtd: 6 },
      { item: 9, qtd: 1 },
      { item: 10, qtd: 6 },
    ],
    parcelas: { n: 2, desde: -15 },
  },
  {
    cliente: 7,
    projeto: 9,
    titulo: "Vídeos de treinamento: atendimento",
    categoria: "Corporativo",
    status: "enviado",
    emissao: -4,
    validadeDias: 15,
    respostas: { nicho: "corporativo", urgencia: "normal", diarias: 2, videos: 8 },
    escopo: "8 vídeos curtos de atendimento no balcão, gravados em duas lojas.",
    linhas: [
      { item: 11, qtd: 1 },
      { item: 1, qtd: 2 },
      { item: 5, qtd: 2 },
      { item: 6, qtd: 8 },
      { item: 10, qtd: 8 },
    ],
  },
  {
    cliente: 8,
    projeto: 10,
    titulo: "Institucional de temporada",
    categoria: "Turismo",
    status: "enviado",
    emissao: -2,
    validadeDias: 20,
    versaoAnteriorRecusada: true,
    respostas: { nicho: "corporativo", urgencia: "normal", diarias: 2, videos: 4 },
    escopo: "Vídeo institucional de 90s e 4 reels para a alta temporada, gravados no hotel.",
    periodo: "Captação em dezembro",
    linhas: [
      { item: 1, qtd: 2 },
      { item: 3, qtd: 1 },
      { item: 7, qtd: 1 },
      { item: 6, qtd: 4 },
      { item: 15, qtd: 2 },
      {
        livre: "Deslocamento São Paulo → Porto Seguro",
        detalhe: "Passagens aéreas da equipe (3 pessoas), ida e volta",
        preco: 540_000,
        custo: 540_000,
        unidade: "trecho",
      },
    ],
  },
  {
    cliente: 4,
    projeto: null,
    titulo: "Lookbook inverno: foto e vídeo",
    categoria: "Moda",
    status: "rascunho",
    emissao: 0,
    validadeDias: 15,
    respostas: { nicho: "moda", urgencia: "normal", diarias: 2, videos: 6 },
    escopo: "Uma diária de estúdio e uma externa. 40 fotos tratadas e 6 reels.",
    linhas: [
      { item: 1, qtd: 2 },
      { item: 4, qtd: 2 },
      { item: 6, qtd: 6 },
      { item: 13, qtd: 40 },
    ],
  },
  {
    cliente: 6,
    projeto: 8,
    titulo: "Cortes do documentário para as redes",
    categoria: "Documentário",
    status: "enviado",
    emissao: -21,
    validadeDias: 15,
    respostas: { nicho: "corporativo", urgencia: "normal", videos: 5 },
    escopo: "Cinco cortes curtos do documentário Maré Viva para Instagram e YouTube.",
    linhas: [
      { item: 6, qtd: 5 },
      { item: 10, qtd: 5 },
      { item: 8, qtd: 5 },
    ],
  },
  {
    cliente: 5,
    projeto: null,
    titulo: "Temporada de verão: reels",
    categoria: "Social",
    status: "recusado",
    emissao: -30,
    validadeDias: 15,
    respostas: { nicho: "corporativo", urgencia: "normal", diarias: 1, videos: 8 },
    escopo: "Pacote de 8 reels para a temporada de verão.",
    linhas: [{ item: 0, qtd: 1 }],
  },
];

/* ───────────── freelas ───────────── */

export type FreelaDemo = {
  nome: string;
  cidade: string;
  funcoes: string[];
  nichos: string[];
  valores: string;
  notas?: string;
  ativo?: boolean;
  pix?: boolean;
};

export const FREELAS_DEMO: FreelaDemo[] = [
  {
    nome: "Rafael Moura",
    cidade: "São Paulo, SP",
    funcoes: ["captacao-camera", "drone"],
    nichos: ["Corporativo", "Imobiliário"],
    valores: "Captação com câmera: 900,00\nDrone: 700,00",
    pix: true,
    notas: "Tem FX6 própria. Prefere diárias com saída cedo.",
  },
  {
    nome: "Lívia Andrade",
    cidade: "São Paulo, SP",
    funcoes: ["edicao", "color"],
    nichos: ["Moda", "Publicidade"],
    valores: "Edição: 450,00\nEdição: 3.200,00 por projeto\nColor e finalização: 600,00 por vídeo",
    pix: true,
  },
  { nome: "Caio Bastos", cidade: "Campinas, SP", funcoes: ["som"], nichos: ["Documentário", "Corporativo"], valores: "Som direto: 600,00" },
  { nome: "Marina Teles", cidade: "São Paulo, SP", funcoes: ["foto"], nichos: ["Moda", "Gastronomia"], valores: "Fotografia: 800,00" },
  {
    nome: "Diego Furtado",
    cidade: "Belo Horizonte, MG",
    funcoes: ["captacao-camera"],
    nichos: ["Corporativo", "Saúde"],
    valores: "Captação com câmera: 850,00",
    notas: "Tem Sony FX30 própria.",
  },
  { nome: "Bruna Siqueira", cidade: "São Paulo, SP", funcoes: ["producao"], nichos: ["Publicidade"], valores: "Produção: 500,00" },
  {
    nome: "Tiago Lacerda",
    cidade: "Curitiba, PR",
    funcoes: ["drone"],
    nichos: ["Imobiliário", "Eventos"],
    valores: "Drone: 750,00",
    notas: "Piloto com registro na ANAC. DJI Mini 4 Pro própria.",
  },
  { nome: "Helena Prado", cidade: "São Paulo, SP", funcoes: ["motion"], nichos: ["Educação", "Publicidade"], valores: "Motion: 2.200,00 por projeto" },
  { nome: "Otávio Reis", cidade: "São Paulo, SP", funcoes: ["assistente"], nichos: [], valores: "Assistente: 350,00" },
  { nome: "Paula Menezes", cidade: "Rio de Janeiro, RJ", funcoes: ["roteiro"], nichos: ["Documentário"], valores: "Roteiro: 1.800,00 por projeto" },
  {
    nome: "Gustavo Viana",
    cidade: "São Paulo, SP",
    funcoes: ["edicao", "sameday"],
    nichos: ["Eventos"],
    valores: "Edição: 500,00\nSameday: 900,00",
    pix: true,
  },
  {
    nome: "Renata Alves",
    cidade: "Florianópolis, SC",
    funcoes: ["captacao-camera", "foto"],
    nichos: ["Documentário", "Moda"],
    valores: "Captação com câmera: 950,00\nFotografia: 850,00",
  },
  { nome: "Felipe Couto", cidade: "São Paulo, SP", funcoes: ["color"], nichos: ["Publicidade"], valores: "Color e finalização: 700,00 por vídeo" },
  { nome: "Aline Duarte", cidade: "Recife, PE", funcoes: ["producao", "assistente"], nichos: ["Saúde"], valores: "Produção: 400,00\nAssistente: 300,00" },
  { nome: "Bruno Quintela", cidade: "São Paulo, SP", funcoes: ["som"], nichos: ["Documentário"], valores: "Som direto: 650,00" },
  {
    nome: "Sofia Arantes",
    cidade: "São Paulo, SP",
    funcoes: ["Maquiagem"],
    nichos: ["Moda"],
    valores: "Maquiagem: 450,00",
    ativo: false,
    notas: "De licença até março.",
  },
];

/* ───────────── agenda e escala ───────────── */

export type EventoDemo = {
  tipo: TipoEvento;
  titulo: string;
  projeto: number | null;
  dia: number;
  ate?: number;
  hora?: string;
  horaFim?: string;
  local?: string;
  cor?: string;
  /** [índice do freela, função] */
  equipe?: [number, string][];
  /** Índices de EQUIPAMENTOS_DEMO reservados para a diária. */
  equipamentos?: number[];
};

export const EVENTOS_DEMO: EventoDemo[] = [
  {
    tipo: "diaria",
    titulo: "Festival da Colheita: cobertura",
    projeto: 7,
    dia: -40,
    ate: -38,
    hora: "15:00",
    local: "Parque Vila Germânica, Blumenau, SC",
    equipe: [
      [0, "captacao-camera"],
      [6, "drone"],
      [10, "sameday"],
    ],
    equipamentos: [0, 23, 30],
  },
  {
    tipo: "diaria",
    titulo: "Captação de depoimentos: Residencial",
    projeto: 2,
    dia: -18,
    hora: "09:00",
    local: "Stand de vendas, Curitiba, PR",
    equipe: [
      [4, "captacao-camera"],
      [2, "som"],
    ],
    equipamentos: [2, 12, 13],
  },
  {
    tipo: "diaria",
    titulo: "Captação Safra: teaser",
    projeto: 0,
    dia: -12,
    hora: "06:30",
    local: "Fazenda Serra Alta, Carmo de Minas, MG",
    equipe: [
      [0, "captacao-camera"],
      [2, "som"],
    ],
    equipamentos: [0, 4, 9, 16, 30],
  },
  {
    tipo: "diaria",
    titulo: "Gravação ep. 1 e ep. 2",
    projeto: 4,
    dia: -9,
    hora: "09:00",
    local: "Clínica Viva Sorriso, Recife, PE",
    equipe: [
      [13, "producao"],
      [4, "captacao-camera"],
    ],
    equipamentos: [2, 13, 17],
  },
  {
    tipo: "diaria",
    titulo: "Diária de estúdio: lookbook",
    projeto: 6,
    dia: -6,
    hora: "08:00",
    local: "Estúdio Vila Madalena, São Paulo",
    equipe: [
      [3, "foto"],
      [8, "assistente"],
      [11, "captacao-camera"],
    ],
    equipamentos: [1, 7, 16, 17, 18, 20],
  },
  { tipo: "reuniao", titulo: "Pré-produção: Residencial Jardins", projeto: 2, dia: 1, hora: "10:00", horaFim: "11:00", local: "Online", cor: "azul" },
  {
    tipo: "diaria",
    titulo: "Lookbook verão: externa",
    projeto: 6,
    dia: 2,
    hora: "07:00",
    local: "Parque Ibirapuera, São Paulo",
    equipe: [
      [3, "foto"],
      [11, "captacao-camera"],
      [8, "assistente"],
    ],
    equipamentos: [1, 7, 18, 31],
  },
  { tipo: "reuniao", titulo: "Proposta: vídeos de treinamento", projeto: 9, dia: 3, hora: "11:00", horaFim: "11:45", local: "Online", cor: "roxo" },
  {
    tipo: "diaria",
    titulo: "Safra 2027: fazenda",
    projeto: 0,
    dia: 4,
    ate: 5,
    hora: "06:00",
    local: "Fazenda Serra Alta, Carmo de Minas, MG",
    equipe: [
      [0, "captacao-camera"],
      [2, "som"],
      [8, "assistente"],
      [5, "producao"],
    ],
    equipamentos: [0, 4, 9, 12, 16, 24, 23, 30, 31],
  },
  {
    tipo: "diaria",
    titulo: "Depoimentos de pais",
    projeto: 5,
    dia: 5,
    hora: "14:00",
    local: "Escola Pequeno Mundo, Campinas, SP",
    equipe: [
      [0, "captacao-camera"],
      [13, "producao"],
    ],
    equipamentos: [3, 13, 19],
  },
  {
    tipo: "diaria",
    titulo: "Safra 2027: torrefação",
    projeto: 0,
    dia: 6,
    hora: "08:00",
    local: "Torrefação Serra Alta, Belo Horizonte, MG",
    equipe: [
      [4, "captacao-camera"],
      [2, "som"],
    ],
    equipamentos: [2, 13, 17],
  },
  {
    tipo: "diaria",
    titulo: "Gravação ep. 3: clareamento",
    projeto: 4,
    dia: 8,
    hora: "09:00",
    local: "Clínica Viva Sorriso, Recife, PE",
    equipe: [
      [13, "producao"],
      [4, "captacao-camera"],
    ],
    equipamentos: [3, 14, 18],
  },
  { tipo: "entrega", titulo: "Entrega do lookbook", projeto: 6, dia: 8, cor: "verde" },
  { tipo: "entrega", titulo: "Entrega do vídeo de lançamento", projeto: 2, dia: 10, cor: "verde" },
  {
    tipo: "reuniao",
    titulo: "Apresentação do corte do documentário",
    projeto: 8,
    dia: 12,
    hora: "15:00",
    horaFim: "16:30",
    local: "Instituto Mar Aberto, Florianópolis",
    cor: "amarelo",
  },
  {
    tipo: "diaria",
    titulo: "Voo de drone: mês 3",
    projeto: 3,
    dia: 14,
    hora: "07:30",
    local: "Canteiro do Residencial Jardins, Curitiba, PR",
    equipe: [[6, "drone"]],
  },
  {
    tipo: "diaria",
    titulo: "Documentário: bloco 3",
    projeto: 8,
    dia: 18,
    ate: 20,
    hora: "05:30",
    local: "Pântano do Sul, Florianópolis, SC",
    equipe: [
      [11, "captacao-camera"],
      [14, "som"],
    ],
    equipamentos: [1, 6, 10, 15, 23, 26, 32],
  },
  { tipo: "entrega", titulo: "Entrega dos reels de novembro", projeto: 1, dia: 25, cor: "verde" },
  {
    tipo: "outro",
    titulo: "Manutenção preventiva das câmeras",
    projeto: null,
    dia: 21,
    hora: "10:00",
    local: "Assistência técnica, São Paulo",
    cor: "laranja",
  },
];

/** Escalas sem diária (edição, motion, color: por projeto). [freela, projeto, função, de, até, total em centavos] */
export const ESCALAS_AVULSAS_DEMO: [number, number, string, number, number, number][] = [
  [1, 0, "edicao", -5, 15, 320_000],
  [12, 0, "color", 10, 16, 280_000],
  [7, 5, "motion", -10, 6, 220_000],
  [10, 6, "edicao", -4, 6, 200_000],
  [9, 8, "roteiro", -80, -60, 180_000],
  [1, 2, "edicao", -15, 8, 360_000],
];

/* ───────────── inventário ───────────── */

export type EquipDemo = {
  nome: string;
  marca?: string;
  categoria?: CategoriaEquip;
  valor?: number;
  estado?: Estado;
  freela?: number;
  kmL?: number;
  local?: string;
  compra?: number;
};

export const EQUIPAMENTOS_DEMO: EquipDemo[] = [
  { nome: "Sony FX6", marca: "Sony", valor: 3_890_000, compra: -620 },
  { nome: "Sony FX3", marca: "Sony", valor: 2_590_000, compra: -400 },
  { nome: "Sony A7 IV", marca: "Sony", valor: 1_390_000, compra: -700 },
  { nome: "Blackmagic Pocket 6K", marca: "Blackmagic", valor: 1_250_000, compra: -900 },
  { nome: "Sony 24-70mm f/2.8 GM II", marca: "Sony", valor: 1_490_000 },
  { nome: "Sony 70-200mm f/2.8 GM", marca: "Sony", valor: 1_690_000, estado: "manutencao", local: "Assistência técnica" },
  { nome: "Sigma 18-35mm 1.8", marca: "Sigma", valor: 390_000 },
  { nome: "Sony 85mm f/1.4 GM", marca: "Sony", valor: 990_000 },
  { nome: "Laowa 12mm f/2.8", marca: "Laowa", valor: 450_000 },
  { nome: "DJI RS 4 Pro", marca: "DJI", valor: 590_000 },
  { nome: "Tripé Sachtler Flowtech 75", marca: "Sachtler", valor: 1_120_000 },
  { nome: "Slider Edelkrone SliderPLUS", marca: "Edelkrone", valor: 380_000 },
  { nome: "Microfone Rode NTG5", marca: "Rode", valor: 260_000 },
  { nome: "Lapela Sennheiser EW-D", marca: "Sennheiser", valor: 450_000 },
  { nome: "Lapela Deity Theos", marca: "Deity", valor: 320_000 },
  { nome: "Gravador Zoom F6", marca: "Zoom", valor: 390_000 },
  { nome: "Aputure 600d Pro", marca: "Aputure", valor: 1_150_000 },
  { nome: "Aputure 300x", marca: "Aputure", valor: 690_000 },
  { nome: "Amaran 200x S", marca: "Amaran", valor: 260_000 },
  { nome: "Nanlite PavoTube 30C", marca: "Nanlite", valor: 310_000 },
  { nome: "Softbox Light Dome II", marca: "Aputure", valor: 120_000 },
  { nome: "C-Stand Avenger", marca: "Avenger", valor: 95_000 },
  { nome: "Kit de bandeiras e difusão", categoria: "grip", valor: 70_000 },
  { nome: "DJI Mavic 3 Pro", marca: "DJI", valor: 2_190_000 },
  { nome: "Atomos Ninja V", marca: "Atomos", valor: 420_000 },
  { nome: "Hollyland Mars 4K", marca: "Hollyland", valor: 380_000 },
  { nome: "Transmissor Accsoon CineEye", marca: "Accsoon", valor: 150_000 },
  { nome: "MacBook Pro M3 Max", marca: "Apple", valor: 2_890_000, local: "Ilha de edição" },
  { nome: "DaVinci Speed Editor", marca: "Blackmagic", valor: 220_000, local: "Ilha de edição" },
  { nome: "Kit de baterias V-Mount", categoria: "acessorio", valor: 340_000 },
  { nome: "SSD Samsung T7 2TB", marca: "Samsung", valor: 89_000, compra: -50 },
  { nome: "Fiat Ducato", marca: "Fiat", categoria: "veiculo", kmL: 9, valor: 18_900_000, local: "Garagem" },
  { nome: "Renault Kwid", marca: "Renault", categoria: "veiculo", kmL: 14, valor: 6_200_000, local: "Garagem" },
  { nome: "Sony FX30", marca: "Sony", freela: 4 },
  { nome: "DJI Mini 4 Pro", marca: "DJI", freela: 6 },
];

/* ───────────── financeiro ───────────── */

export type LancamentoDemo = {
  tipo: "entrada" | "saida";
  categoria: Categoria;
  descricao: string;
  valor: number;
  dia: number;
  pagoEm?: number;
  projeto?: number;
  cliente?: number;
  parcela?: string;
};

export const LANCAMENTOS_DEMO: LancamentoDemo[] = [
  {
    tipo: "entrada",
    categoria: "cliente",
    descricao: "Cervejaria Vale do Lúpulo · parcela única",
    valor: 1_600_000,
    dia: -35,
    pagoEm: -33,
    projeto: 7,
    cliente: 5,
    parcela: "1/1",
  },
  {
    tipo: "entrada",
    categoria: "cliente",
    descricao: "AgroVerde Sementes · saldo",
    valor: 1_900_000,
    dia: -80,
    pagoEm: -78,
    projeto: 11,
    cliente: 9,
    parcela: "2/2",
  },
  {
    tipo: "entrada",
    categoria: "cliente",
    descricao: "Instituto Mar Aberto · parcela 1",
    valor: 3_166_600,
    dia: -85,
    pagoEm: -84,
    projeto: 8,
    cliente: 6,
    parcela: "1/3",
  },
  {
    tipo: "entrada",
    categoria: "cliente",
    descricao: "Instituto Mar Aberto · parcela 2",
    valor: 3_166_600,
    dia: -25,
    pagoEm: -24,
    projeto: 8,
    cliente: 6,
    parcela: "2/3",
  },
  { tipo: "entrada", categoria: "cliente", descricao: "Instituto Mar Aberto · parcela 3", valor: 3_166_800, dia: 40, projeto: 8, cliente: 6, parcela: "3/3" },
  {
    tipo: "entrada",
    categoria: "cliente",
    descricao: "Clínica Viva Sorriso · entrada",
    valor: 1_200_000,
    dia: -10,
    pagoEm: -10,
    projeto: 4,
    cliente: 2,
    parcela: "1/2",
  },
  { tipo: "entrada", categoria: "cliente", descricao: "Clínica Viva Sorriso · saldo", valor: 1_200_000, dia: 30, projeto: 4, cliente: 2, parcela: "2/2" },
  { tipo: "entrada", categoria: "cliente", descricao: "Moda Raiz · lookbook verão", valor: 2_900_000, dia: 10, projeto: 6, cliente: 4, parcela: "1/1" },
  { tipo: "entrada", categoria: "cliente", descricao: "Construtora Horizonte Azul · drone, parcela do mês", valor: 300_000, dia: -2, projeto: 3, cliente: 1 },
  { tipo: "entrada", categoria: "outra-receita", descricao: "Venda de lente usada (Sony 50mm)", valor: 180_000, dia: -45, pagoEm: -45 },
  { tipo: "saida", categoria: "equipamento", descricao: "Compra: SSD Samsung T7 2TB", valor: 89_000, dia: -50, pagoEm: -50 },
  { tipo: "saida", categoria: "locacao", descricao: "Locação de luz HMI: teaser Safra", valor: 240_000, dia: -12, pagoEm: -11, projeto: 0 },
  { tipo: "saida", categoria: "alimentacao", descricao: "Alimentação da equipe: teaser Safra", valor: 48_000, dia: -12, pagoEm: -12, projeto: 0 },
  { tipo: "saida", categoria: "deslocamento", descricao: "Combustível e pedágio: festival", valor: 62_000, dia: -38, pagoEm: -38, projeto: 7 },
  { tipo: "saida", categoria: "locacao", descricao: "Locação de drone extra: Residencial", valor: 70_000, dia: -3, projeto: 2 },
  { tipo: "saida", categoria: "marketing", descricao: "Impulsionamento do portfólio", valor: 50_000, dia: 7 },
  { tipo: "saida", categoria: "deslocamento", descricao: "Passagens: documentário bloco 3", valor: 186_000, dia: 15, projeto: 8 },
];

/** Recorrências: [tipo, categoria, descrição, valor, dia do mês, cliente?] a partir de 3 meses atrás; geradas até 2 meses à frente. */
export const RECORRENCIAS_DEMO: { tipo: "entrada" | "saida"; categoria: Categoria; descricao: string; valor: number; dia: number; cliente?: number }[] = [
  { tipo: "saida", categoria: "fixo", descricao: "Aluguel do estúdio", valor: 350_000, dia: 5 },
  { tipo: "saida", categoria: "software", descricao: "Adobe Creative Cloud", valor: 29_000, dia: 12 },
  { tipo: "saida", categoria: "software", descricao: "Armazenamento em nuvem", valor: 6_000, dia: 20 },
  { tipo: "saida", categoria: "fixo", descricao: "Contabilidade", valor: 60_000, dia: 10 },
  { tipo: "saida", categoria: "fixo", descricao: "Internet do estúdio", valor: 25_000, dia: 15 },
  { tipo: "entrada", categoria: "cliente", descricao: "Café Serra Alta · contrato mensal", valor: 650_000, dia: 10, cliente: 0 },
];

/* ───────────── documentos ───────────── */

export const ROTEIRO_DEMO = `FILME SAFRA 2027 · 60s

CENA 1 · EXT. CAFEZAL · AMANHECER
Névoa baixa entre as fileiras. Mãos colhem o grão maduro.
LOC (off): "Todo ano, a gente começa do mesmo jeito: cedo."

CENA 2 · INT. TERREIRO · DIA
Grãos espalhados ao sol. A câmera acompanha o rodo.
LOC (off): "Sem pressa. O café ensina a esperar."

CENA 3 · INT. TORREFAÇÃO · DIA
O tambor gira. A cor muda do verde ao castanho.

CENA 4 · INT. CAFETERIA · DIA
A primeira xícara. Assinatura da marca.
LOC (off): "Safra 2027. Do pé à xícara."`;

export const PLANOS_DEMO = [
  { cena: "1", plano: "1A", descricao: "Geral do cafezal com névoa", lente: "24mm", movimento: "Drone, avanço lento" },
  { cena: "1", plano: "1B", descricao: "Detalhe das mãos colhendo", lente: "85mm", movimento: "Fixo" },
  { cena: "1", plano: "1C", descricao: "Rosto da colhedora contra o sol", lente: "85mm", movimento: "Gimbal, lateral" },
  { cena: "2", plano: "2A", descricao: "Plongée do terreiro", lente: "12mm", movimento: "Drone, top shot" },
  { cena: "2", plano: "2B", descricao: "Rodo passando nos grãos", lente: "35mm", movimento: "Slider" },
  { cena: "3", plano: "3A", descricao: "Tambor girando, grãos caindo", lente: "50mm", movimento: "Fixo, câmera lenta" },
  { cena: "3", plano: "3B", descricao: "Mestre de torra cheirando o grão", lente: "85mm", movimento: "Gimbal" },
  { cena: "4", plano: "4A", descricao: "Xícara servida, vapor", lente: "100mm macro", movimento: "Fixo" },
];
