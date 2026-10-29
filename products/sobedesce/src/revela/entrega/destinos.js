// Entrega por destino: codec, contêiner, cor e áudio para cada lugar onde o material vai passar.
//
// Regra do PRD (§8): nenhum perfil é "oficial" de terceiros sem fonte e data de verificação. Cada destino diz de onde
// veio cada número (`fontes`) e se é especificação publicada pela plataforma ('oficial') ou recomendação de mercado
// quando a plataforma não publica uma ('mercado'). Plataformas mudam requisitos: a tela avisa e mostra a data.
//
// Cor: o grade é feito em Rec.709 com gama 2,4 (BT.1886) no monitor; o arquivo SDR sai marcado como BT.709 nos três
// campos do H.273 (primárias, transferência e matriz = 1). É o que YouTube e Vimeo pedem e o padrão de masters.
// `cor.resolve` são os nomes das tags no Deliver do Resolve (ColorSpaceTag / GammaTag).

export const VERIFICADO_EM = '2026-10-25'

const SDR_709 = {
  nome: 'Rec.709 SDR',
  primarias: 'BT.709',
  transferencia: 'BT.709 (no monitor: gama 2,4 / BT.1886)',
  matriz: 'BT.709',
  h273: '1-1-1',
  resolve: { colorSpaceTag: 'Rec.709', gammaTag: 'Rec.709' },
}

const HDR_PQ = {
  nome: 'Rec.2100 PQ (HDR10)',
  primarias: 'BT.2020',
  transferencia: 'SMPTE ST 2084 (PQ)',
  matriz: 'BT.2020 não constante',
  h273: '9-16-9',
  resolve: { colorSpaceTag: 'Rec.2020', gammaTag: 'ST2084' },
}

const fonte = (titulo, url, tipo = 'oficial') => ({ titulo, url, tipo, verificadoEm: VERIFICADO_EM })

const YOUTUBE = fonte('YouTube: configurações de codificação recomendadas', 'https://support.google.com/youtube/answer/1722171')
const YOUTUBE_HDR = fonte('YouTube: enviar vídeos HDR', 'https://support.google.com/youtube/answer/7126552')
const VIMEO = fonte('Vimeo: configurações de compressão de vídeo', 'https://help.vimeo.com/hc/en-us/articles/12426982098449-Video-compression-settings')
const NETFLIX = fonte(
  'Netflix Partner Help: turnover de servicing (ProRes 422 HQ, Rec.709, BT.1886)',
  'https://backlothelp.netflix.com/hc/en-us/articles/360000385467-Content-Hub-Preparing-Pre-Release-Servicing-Turnovers',
)
const PORTARIA = fonte(
  'Portaria MC 354/2012 (Lei 10.222/2001): loudness −23 LKFS ±2, ITU-R BS.1770',
  'https://www2.camara.leg.br/comunicacao/rede-legislativa-radio-tv/arquivos/legislacao-arquivos/legislacao-de-radio/DOUPortarian354.pdf/view',
)
const MERCADO_VERTICAL = fonte(
  'Sem especificação técnica pública da plataforma; valores de mercado (1080×1920, H.264, AAC) conferidos em guias de criadores',
  'https://www.socialpilot.co/instagram-marketing/instagram-video-size',
  'mercado',
)

/**
 * Bitrate em kbit/s por altura do quadro e cadência (padrão = 24/25/30, alta = 48/50/60).
 * O script do Resolve escolhe pela resolução da timeline.
 */
export const DESTINOS = [
  {
    id: 'youtube',
    nome: 'YouTube',
    grupo: 'Web',
    resumo: 'Upload no YouTube em SDR.',
    video: {
      formato: 'mp4',
      codec: 'H.264',
      perfil: 'High',
      subamostragem: '4:2:0',
      bits: 8,
      fps: 'o da gravação (24, 25, 30, 48, 50, 60), progressivo',
      resolucao: 'a da timeline',
      bitrate: { 720: [5000, 7500], 1080: [8000, 12000], 1440: [16000, 24000], 2160: [45000, 68000] },
      otimizarRede: true,
    },
    cor: SDR_709,
    audio: { codec: 'aac', kbps: 384, taxa: 48000, canais: 'estéreo', loudness: null },
    fontes: [YOUTUBE],
    avisos: ['YouTube recomenda bitrate variável sem limite; o número é o mínimo recomendado para a resolução.'],
  },
  {
    id: 'youtube-hdr',
    nome: 'YouTube HDR',
    grupo: 'Web',
    resumo: 'Upload no YouTube em HDR (PQ), só se o grade foi feito em HDR.',
    video: {
      formato: 'mp4',
      codec: 'H.265',
      perfil: 'Main10',
      subamostragem: '4:2:0',
      bits: 10,
      fps: 'o da gravação, progressivo',
      resolucao: 'a da timeline',
      bitrate: { 720: [6500, 9500], 1080: [10000, 15000], 1440: [20000, 30000], 2160: [56000, 85000] },
      otimizarRede: true,
    },
    cor: HDR_PQ,
    audio: { codec: 'aac', kbps: 384, taxa: 48000, canais: 'estéreo', loudness: null },
    fontes: [YOUTUBE_HDR, YOUTUBE],
    avisos: [
      'Só use se a timeline estiver em HDR (Rec.2100 PQ) e o grade foi feito num monitor HDR.',
      'O YouTube gera a versão SDR sozinho; para controlar o SDR, ele aceita uma LUT de conversão no arquivo.',
    ],
  },
  {
    id: 'vimeo',
    nome: 'Vimeo',
    grupo: 'Web',
    resumo: 'Upload no Vimeo, com a margem de qualidade que o Vimeo pede.',
    video: {
      formato: 'mp4',
      codec: 'H.264',
      perfil: 'High',
      subamostragem: '4:2:0',
      bits: 8,
      fps: 'o da gravação, constante e progressivo',
      resolucao: 'a da timeline',
      bitrate: { 720: [10000, 10000], 1080: [20000, 20000], 1440: [30000, 30000], 2160: [60000, 60000] },
      otimizarRede: true,
    },
    cor: SDR_709,
    audio: { codec: 'aac', kbps: 320, taxa: 48000, canais: 'estéreo', loudness: null },
    fontes: [VIMEO],
    avisos: ['O Vimeo aceita ProRes 422 HQ se a conexão permitir o upload pesado; é a opção de maior qualidade.'],
  },
  {
    id: 'reels',
    nome: 'Instagram Reels e Stories',
    grupo: 'Redes',
    resumo: 'Vertical 9:16 para Instagram.',
    video: {
      formato: 'mp4',
      codec: 'H.264',
      perfil: 'High',
      subamostragem: '4:2:0',
      bits: 8,
      fps: '30 (ou 60 para movimento rápido); evite 24 se o celular for o destino principal',
      resolucao: '1080×1920 (9:16)',
      largura: 1080,
      altura: 1920,
      bitrate: { 1920: [12000, 15000] },
      otimizarRede: true,
    },
    cor: SDR_709,
    audio: { codec: 'aac', kbps: 320, taxa: 48000, canais: 'estéreo', loudness: null },
    fontes: [MERCADO_VERTICAL],
    avisos: [
      'A Meta não publica especificação técnica de upload: o Instagram recomprime tudo. Os valores são de mercado.',
      'Deixe a parte de baixo livre de texto: a interface cobre o rodapé do vídeo.',
    ],
  },
  {
    id: 'tiktok',
    nome: 'TikTok',
    grupo: 'Redes',
    resumo: 'Vertical 9:16 para TikTok.',
    video: {
      formato: 'mp4',
      codec: 'H.264',
      perfil: 'High',
      subamostragem: '4:2:0',
      bits: 8,
      fps: '30 (ou 60 para movimento rápido)',
      resolucao: '1080×1920 (9:16)',
      largura: 1080,
      altura: 1920,
      bitrate: { 1920: [10000, 12000] },
      otimizarRede: true,
    },
    cor: SDR_709,
    audio: { codec: 'aac', kbps: 320, taxa: 48000, canais: 'estéreo', loudness: null },
    fontes: [
      fonte(
        'TikTok Studio: upload em MP4 ou WebM, 720×1280 ou mais (citado em guias); sem bitrate oficial',
        'https://www.renderforest.com/blog/tiktok-video-specs-dimensions',
        'mercado',
      ),
    ],
    avisos: ['O TikTok recomprime tudo e não publica bitrate; mandar 4K não melhora o resultado.'],
  },
  {
    id: 'tv-aberta',
    nome: 'TV aberta (Brasil)',
    grupo: 'TV',
    resumo: 'Master para emissora, com o loudness da lei brasileira.',
    video: {
      formato: 'mov',
      codec: 'Apple ProRes 422 HQ',
      perfil: null,
      subamostragem: '4:2:2',
      bits: 10,
      fps: '29,97 (o padrão das emissoras no Brasil), salvo pedido da emissora',
      resolucao: '1920×1080',
      largura: 1920,
      altura: 1080,
      bitrate: null,
      otimizarRede: false,
    },
    cor: SDR_709,
    audio: { codec: 'lpcm', bits: 24, taxa: 48000, canais: 'estéreo', loudness: { alvo: -23, tolerancia: 2, unidade: 'LKFS' } },
    fontes: [PORTARIA],
    // só o loudness vem da lei; codec, resolução e cadência são da ficha técnica de cada emissora
    selo: { tipo: 'parcial', texto: 'Loudness oficial' },
    avisos: [
      'Cada emissora tem a própria especificação técnica (codec, timecode, barras, claquete, faixas de áudio). Peça a ficha antes de entregar.',
      'O loudness de −23 LKFS ±2 vale para programas e intervalos (Portaria 354/2012). Meça com o medidor do Fairlight antes do render.',
    ],
  },
  {
    id: 'streaming',
    nome: 'Streaming (servicing)',
    grupo: 'Streaming',
    resumo: 'Arquivo de serviço em ProRes para plataformas de streaming.',
    video: {
      formato: 'mov',
      codec: 'Apple ProRes 422 HQ',
      perfil: null,
      subamostragem: '4:2:2',
      bits: 10,
      fps: 'o do projeto',
      resolucao: 'a da timeline',
      bitrate: null,
      otimizarRede: false,
    },
    cor: SDR_709,
    audio: { codec: 'lpcm', bits: 24, taxa: 48000, canais: 'estéreo', loudness: null },
    fontes: [NETFLIX],
    avisos: [
      'A entrega final de um streaming grande (como a Netflix) é um pacote IMF feito a partir de master sem compressão; isto aqui é o arquivo de serviço, não o IMF.',
      'Siga a lista de entregáveis (DRL) do contrato: ela manda mais que este preset.',
    ],
  },
  {
    id: 'master',
    nome: 'Master de arquivo',
    grupo: 'Master',
    resumo: 'Master de alta qualidade para guardar e gerar as outras versões.',
    video: {
      formato: 'mov',
      codec: 'Apple ProRes 4444 XQ',
      perfil: null,
      subamostragem: '4:4:4',
      bits: 12,
      fps: 'o do projeto',
      resolucao: 'a da timeline',
      bitrate: null,
      otimizarRede: false,
    },
    cor: SDR_709,
    audio: { codec: 'lpcm', bits: 24, taxa: 48000, canais: 'os do projeto', loudness: null },
    fontes: [
      fonte(
        'Apple ProRes white paper (ProRes 4444 XQ como formato de master); PCM 24 bits é padrão de mercado',
        'https://www.apple.com/final-cut-pro/docs/Apple_ProRes.pdf',
        'mercado',
      ),
    ],
    avisos: ['Gere as versões de web e redes a partir deste master, não de outro arquivo comprimido.'],
  },
]

export const GRUPOS = ['Web', 'Redes', 'TV', 'Streaming', 'Master']

export const destino = (id) => DESTINOS.find((d) => d.id === id)

/** Bitrate (kbit/s) para a altura do quadro e a cadência; pega a faixa mais próxima de cima. */
export function bitratePara(d, altura, fps) {
  const tabela = d.video.bitrate
  if (!tabela) return null
  const alturas = Object.keys(tabela)
    .map(Number)
    .sort((a, b) => a - b)
  const faixa = alturas.find((a) => a >= altura) ?? alturas[alturas.length - 1]
  return tabela[faixa][fps > 30 ? 1 : 0]
}
