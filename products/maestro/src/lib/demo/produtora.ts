/**
 * O roteiro da demonstração: uma produtora de vídeo com 10 clientes, projetos e a pauta espalhada pelas 8 colunas.
 * Tudo inventado: empresas fictícias, contatos fictícios, e-mails @exemplo.com, nenhum telefone. Datas relativas a
 * hoje (em dias), valores em centavos. Puro: só dados.
 */
import type { StatusCliente, StatusProjeto } from "@/lib/db/schema";
import type { ColunaKey, Prioridade } from "@/lib/quadro/metodo";

export type ClienteDemo = {
  nome: string;
  empresa: string;
  segmento: string;
  cidade: string;
  contato: string;
  email: string;
  status: StatusCliente;
  notas: string;
};

export type ProjetoDemo = {
  cliente: number;
  titulo: string;
  categoria: string;
  status: StatusProjeto;
  inicio: number | null;
  prazo: number | null;
  valorCentavos: number;
  briefing: string;
};

export type CardDemo = {
  cliente: number;
  projeto: number | null;
  coluna: ColunaKey;
  tema: string;
  prazo: number | null;
  prioridade?: Prioridade;
  briefing?: string;
};

export const CLIENTES_DEMO: ClienteDemo[] = [
  {
    nome: "Café Serra Alta",
    empresa: "Serra Alta Torrefação Ltda.",
    segmento: "Alimentos",
    cidade: "Belo Horizonte, MG",
    contato: "Juliana Prado",
    email: "juliana.prado@exemplo.com",
    status: "ativo",
    notas: "Contrato de conteúdo mensal desde março. Prefere aprovar tudo às sextas.",
  },
  {
    nome: "Construtora Horizonte Azul",
    empresa: "Horizonte Azul Empreendimentos S.A.",
    segmento: "Construção civil",
    cidade: "Curitiba, PR",
    contato: "Rodrigo Menezes",
    email: "rodrigo.menezes@exemplo.com",
    status: "ativo",
    notas: "Lançamento do Residencial Jardins em dezembro. Drone só com autorização da obra.",
  },
  {
    nome: "Clínica Viva Sorriso",
    empresa: "Viva Sorriso Odontologia Ltda.",
    segmento: "Saúde",
    cidade: "Recife, PE",
    contato: "Camila Torres",
    email: "camila.torres@exemplo.com",
    status: "ativo",
    notas: "Todo conteúdo passa pela responsável técnica antes de publicar.",
  },
  {
    nome: "Escola Pequeno Mundo",
    empresa: "Escola Bilíngue Pequeno Mundo",
    segmento: "Educação",
    cidade: "Campinas, SP",
    contato: "Patrícia Lemos",
    email: "patricia.lemos@exemplo.com",
    status: "ativo",
    notas: "Campanha de matrículas é a prioridade até janeiro. Imagem de alunos só com termo assinado.",
  },
  {
    nome: "Moda Raiz",
    empresa: "Raiz Confecções Ltda.",
    segmento: "Moda",
    cidade: "São Paulo, SP",
    contato: "Fernanda Alves",
    email: "fernanda.alves@exemplo.com",
    status: "ativo",
    notas: "Coleção verão sai em novembro. Paleta terrosa, nada de filtro frio.",
  },
  {
    nome: "Cervejaria Vale do Lúpulo",
    empresa: "Vale do Lúpulo Bebidas Ltda.",
    segmento: "Bebidas",
    cidade: "Blumenau, SC",
    contato: "Marcelo Hoffmann",
    email: "marcelo.hoffmann@exemplo.com",
    status: "ativo",
    notas: "Festival entregue. Conversar sobre a temporada de verão.",
  },
  {
    nome: "Instituto Mar Aberto",
    empresa: "Instituto Mar Aberto (ONG)",
    segmento: "Terceiro setor",
    cidade: "Florianópolis, SC",
    contato: "Beatriz Nunes",
    email: "beatriz.nunes@exemplo.com",
    status: "ativo",
    notas: "Documentário com estreia prevista em festival. Verba de edital: guardar notas.",
  },
  {
    nome: "Rede Mais Saúde",
    empresa: "Mais Saúde Farmácias Ltda.",
    segmento: "Varejo",
    cidade: "Salvador, BA",
    contato: "Thiago Ribeiro",
    email: "thiago.ribeiro@exemplo.com",
    status: "lead",
    notas: "Pediu proposta de vídeos de treinamento para 40 lojas.",
  },
  {
    nome: "Hotel Pedra do Sol",
    empresa: "Pedra do Sol Hotelaria Ltda.",
    segmento: "Turismo",
    cidade: "Porto Seguro, BA",
    contato: "Larissa Campos",
    email: "larissa.campos@exemplo.com",
    status: "lead",
    notas: "Veio por indicação. Quer vídeo institucional antes da alta temporada.",
  },
  {
    nome: "AgroVerde Sementes",
    empresa: "AgroVerde Sementes S.A.",
    segmento: "Agronegócio",
    cidade: "Rio Verde, GO",
    contato: "Eduardo Siqueira",
    email: "eduardo.siqueira@exemplo.com",
    status: "pausado",
    notas: "Pausado até a próxima safra. Retomar contato em fevereiro.",
  },
];

export const PROJETOS_DEMO: ProjetoDemo[] = [
  {
    cliente: 0,
    titulo: "Filme de marca: Safra 2027",
    categoria: "Filme publicitário",
    status: "active",
    inicio: -20,
    prazo: 25,
    valorCentavos: 4_800_000,
    briefing: "Filme de 60s e versões de 30s e 15s. Captação na fazenda e na torrefação. Trilha original.",
  },
  {
    cliente: 0,
    titulo: "Conteúdo mensal: novembro",
    categoria: "Social",
    status: "active",
    inicio: -5,
    prazo: 30,
    valorCentavos: 650_000,
    briefing: "12 posts, 8 reels e stories semanais. Uma diária de captação no mês.",
  },
  {
    cliente: 1,
    titulo: "Lançamento Residencial Jardins",
    categoria: "Filme imobiliário",
    status: "active",
    inicio: -30,
    prazo: 10,
    valorCentavos: 7_200_000,
    briefing: "Vídeo de lançamento de 90s, teaser de 15s e tour pelo decorado.",
  },
  {
    cliente: 1,
    titulo: "Drone e timelapse da obra",
    categoria: "Acompanhamento de obra",
    status: "active",
    inicio: -60,
    prazo: 120,
    valorCentavos: 1_800_000,
    briefing: "Um voo por mês e câmera de timelapse fixa até a entrega das chaves.",
  },
  {
    cliente: 2,
    titulo: "Série Sorria sem medo",
    categoria: "Série para redes",
    status: "active",
    inicio: -10,
    prazo: 40,
    valorCentavos: 2_400_000,
    briefing: "Seis episódios curtos com as dentistas da clínica, linguagem leve, legendas sempre.",
  },
  {
    cliente: 3,
    titulo: "Campanha de matrículas 2027",
    categoria: "Campanha",
    status: "active",
    inicio: -15,
    prazo: 20,
    valorCentavos: 3_500_000,
    briefing: "Vídeo de 60s, depoimentos de pais, peças para outdoor digital e anúncios.",
  },
  {
    cliente: 4,
    titulo: "Lookbook verão: foto e vídeo",
    categoria: "Moda",
    status: "active",
    inicio: -12,
    prazo: 8,
    valorCentavos: 2_900_000,
    briefing: "Uma diária de estúdio e uma externa. 40 fotos tratadas e 6 reels.",
  },
  {
    cliente: 5,
    titulo: "Cobertura do Festival da Colheita",
    categoria: "Evento",
    status: "done",
    inicio: -45,
    prazo: -10,
    valorCentavos: 1_600_000,
    briefing: "Aftermovie de 2 min e reels dos três dias de festival.",
  },
  {
    cliente: 6,
    titulo: "Documentário Maré Viva",
    categoria: "Documentário",
    status: "active",
    inicio: -90,
    prazo: 60,
    valorCentavos: 9_500_000,
    briefing: "Média-metragem de 26 min sobre pescadoras artesanais. Corte para festival e versão para redes.",
  },
  {
    cliente: 7,
    titulo: "Proposta: vídeos de treinamento",
    categoria: "Corporativo",
    status: "paused",
    inicio: null,
    prazo: 45,
    valorCentavos: 2_200_000,
    briefing: "Orçamento enviado: 8 vídeos curtos de atendimento no balcão. Aguardando retorno.",
  },
  {
    cliente: 8,
    titulo: "Proposta: institucional de temporada",
    categoria: "Turismo",
    status: "paused",
    inicio: null,
    prazo: 50,
    valorCentavos: 3_100_000,
    briefing: "Vídeo institucional de 90s e pacote de reels para a alta temporada.",
  },
  {
    cliente: 9,
    titulo: "Vídeo técnico: linha de sementes",
    categoria: "Corporativo",
    status: "done",
    inicio: -120,
    prazo: -60,
    valorCentavos: 3_800_000,
    briefing: "Vídeo técnico para a equipe comercial, com animação dos ciclos da planta.",
  },
];

export const CARDS_DEMO: CardDemo[] = [
  // Pauta: ideias sem responsável
  { cliente: 8, projeto: 10, coluna: "pauta", tema: "Ideia: reels um dia no Pedra do Sol", prazo: null },
  { cliente: 7, projeto: 9, coluna: "pauta", tema: "Roteiro piloto: atendimento no balcão", prazo: null },
  { cliente: 0, projeto: 1, coluna: "pauta", tema: "Bastidores da torra", prazo: 12 },
  { cliente: 6, projeto: 8, coluna: "pauta", tema: "Teaser do documentário para as redes", prazo: 20 },
  // A fazer
  {
    cliente: 1,
    projeto: 2,
    coluna: "afazer",
    tema: "Roteiro do vídeo de lançamento",
    prazo: 3,
    prioridade: "alta",
    briefing: "Destacar a área verde e a vista do 12º andar.",
  },
  {
    cliente: 3,
    projeto: 5,
    coluna: "afazer",
    tema: "Captação: depoimentos de pais",
    prazo: 5,
    briefing: "Três famílias confirmadas. Termos de imagem com a secretaria.",
  },
  { cliente: 2, projeto: 4, coluna: "afazer", tema: "Roteiro ep. 3: clareamento", prazo: 6 },
  { cliente: 4, projeto: 6, coluna: "afazer", tema: "Decupagem do ensaio externo", prazo: 2 },
  // Fazendo
  {
    cliente: 0,
    projeto: 0,
    coluna: "fazendo",
    tema: "Edição do filme de marca: 1º corte",
    prazo: 2,
    prioridade: "alta",
    briefing: "Corte de 60s primeiro; depois as versões curtas.",
  },
  { cliente: 6, projeto: 8, coluna: "fazendo", tema: "Montagem do bloco 2 do documentário", prazo: 9 },
  { cliente: 1, projeto: 3, coluna: "fazendo", tema: "Voo de drone: mês 2", prazo: -1, briefing: "Remarcado pela chuva. Confirmar com o mestre de obras." },
  { cliente: 3, projeto: 5, coluna: "fazendo", tema: "Animação de abertura da campanha", prazo: 4 },
  { cliente: 0, projeto: 1, coluna: "fazendo", tema: "Carrossel: do grão à xícara", prazo: 0 },
  // Revisão
  { cliente: 2, projeto: 4, coluna: "revisao", tema: "Ep. 2: aparelho invisível", prazo: 1, briefing: "Conferir termos técnicos com a responsável técnica." },
  { cliente: 4, projeto: 6, coluna: "revisao", tema: "Reels do lookbook: 30s", prazo: 1 },
  { cliente: 3, projeto: 5, coluna: "revisao", tema: "Peça para outdoor digital", prazo: 2 },
  { cliente: 0, projeto: 1, coluna: "revisao", tema: "Stories da semana", prazo: 0 },
  // Em aprovação
  { cliente: 1, projeto: 2, coluna: "aprovacao", tema: "Teaser 15s Residencial Jardins", prazo: 2, prioridade: "alta" },
  { cliente: 2, projeto: 4, coluna: "aprovacao", tema: "Ep. 1: primeira consulta", prazo: 3 },
  { cliente: 4, projeto: 6, coluna: "aprovacao", tema: "Fotos tratadas: seleção final", prazo: 2 },
  { cliente: 6, projeto: 8, coluna: "aprovacao", tema: "Trailer do documentário", prazo: 5 },
  // Aprovado
  { cliente: 3, projeto: 5, coluna: "aprovado", tema: "Vídeo da campanha: 60s", prazo: 4 },
  { cliente: 0, projeto: 1, coluna: "aprovado", tema: "Reels lançamento do blend", prazo: 3 },
  { cliente: 1, projeto: 3, coluna: "aprovado", tema: "Fotos da obra: outubro", prazo: 5 },
  // Agendado
  { cliente: 4, projeto: 6, coluna: "agendado", tema: "Carrossel da coleção verão", prazo: 3 },
  { cliente: 2, projeto: 4, coluna: "agendado", tema: "Reels: dica de escovação", prazo: 2 },
  { cliente: 0, projeto: 1, coluna: "agendado", tema: "Post do Dia do Café", prazo: 6 },
  // Entregue
  { cliente: 5, projeto: 7, coluna: "entregue", tema: "Aftermovie do festival", prazo: -10 },
  { cliente: 5, projeto: 7, coluna: "entregue", tema: "Reels: melhores momentos", prazo: -8 },
  { cliente: 9, projeto: 11, coluna: "entregue", tema: "Vídeo técnico: corte final", prazo: -60 },
  { cliente: 3, projeto: 5, coluna: "entregue", tema: "Fotos do campus", prazo: -4 },
];
