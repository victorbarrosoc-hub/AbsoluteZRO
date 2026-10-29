// Presets do Relay: para onde o arquivo vai, e o que sai para chegar lá bem.
//
// Regra do PRD (§8): nenhum número é "oficial" sem fonte e data. Cada preset diz de onde veio (`fontes`) e se é
// especificação publicada pela plataforma ('oficial') ou recomendação de mercado quando ela não publica ('mercado').
// Plataformas mudam: a tela mostra a data da conferência.
//
// Bitrate: tabela em kbit/s pelo LADO MENOR do quadro (1080p = 1920×1080 ou 1080×1920) e pela cadência
// ([até 30 fps, acima de 30]). É o alvo para os codificadores do navegador e de hardware; no computador, com o x264,
// o mesmo número vira o teto de um CRF (qualidade constante, como o HandBrake), então sai igual ou menor e melhor.
// Os números de upload ficam ACIMA do mínimo da plataforma de propósito: ela recomprime tudo, e quanto mais limpo o
// arquivo que chega, melhor a versão dela.
//
// GOP (`gop`, segundos entre quadros-chave): 2 s, não o "meio segundo" da página do YouTube. A plataforma recodifica
// tudo, então o GOP do upload não muda nada para quem assiste, e quadro-chave a cada meio segundo custa qualidade no
// mesmo tamanho (medido em docs/QUALIDADE.md). Proxy de edição fica com 1 s, para a timeline correr solta.

export const VERIFICADO_EM = '2026-10-29'

const fonte = (titulo, url, tipo = 'oficial') => ({ titulo, url, tipo, verificadoEm: VERIFICADO_EM })

const F = {
  youtube: fonte('YouTube: configurações de codificação recomendadas para upload', 'https://support.google.com/youtube/answer/1722171'),
  youtube1440: fonte(
    'Criadores: o YouTube usa codecs melhores (VP9/AV1) para vídeos enviados em 1440p ou mais; 1080p enviado em 1440p fica mais nítido',
    'https://support.google.com/youtube/answer/1722171',
    'mercado',
  ),
  instagram: fonte(
    'Instagram não publica bitrate: 1080×1920, 30 fps, H.264 + AAC é o consenso de guias de criadores; ligue "Enviar na mais alta qualidade" no app',
    'https://www.socialpilot.co/instagram-marketing/instagram-video-size',
    'mercado',
  ),
  tiktok: fonte('TikTok não publica bitrate de upload: 1080×1920, H.264 + AAC (guias de criadores)', 'https://www.renderforest.com/blog/tiktok-video-specs-dimensions', 'mercado'),
  vimeo: fonte('Vimeo: configurações de compressão de vídeo', 'https://help.vimeo.com/hc/en-us/articles/12426982098449-Video-compression-settings'),
  whatsapp: fonte('WhatsApp: vídeo em HD sai em 720p, o padrão em 480p (guias; a Meta não publica a especificação)', 'https://www.techradar.com/phones/this-whatsapp-setting-will-upgrade-your-photos-and-videos-heres-how-to-use-it', 'mercado'),
  discord: fonte('Discord: anexos de até 20 MB na conta grátis (agosto de 2026)', 'https://www.dexerto.com/entertainment/discord-raises-free-upload-limit-to-20mb-after-lowering-it-two-years-ago-3398251/', 'mercado'),
  gmail: fonte('Gmail: anexos de até 25 MB por e-mail', 'https://support.google.com/mail/answer/6584'),
  apple: fonte('Apple: HEVC (hvc1) toca no iPhone, iPad, Mac e Apple TV', 'https://support.apple.com/en-us/116944'),
  mp3: fonte('MP3 320 kbit/s CBR: o teto do formato (MPEG-1 Layer III), padrão de mercado', 'https://lame.sourceforge.io/', 'mercado'),
  wav: fonte('WAV PCM 48 kHz: a taxa de áudio do vídeo e dos editores (EBU R 128 / produção)', 'https://tech.ebu.ch/docs/r/r128.pdf', 'mercado'),
}

const AAC = (kbps) => ({ codec: 'aac', kbps, taxa: 48000, canais: 2 })

/**
 * Cada preset:
 * - `video`: null (só áudio) ou { codec 'avc'|'hevc', ladoMenor (null = o do arquivo), quadro: { largura, altura }
 *   (tela fixa, ex.: 9:16), fpsMax, gop (s), kbps: { lado: [≤30, >30] }, crf (computador), ampliar (pode aumentar),
 *   teto (computador: limite do CRF em múltiplos do bitrate; sem ele, qualidade constante livre, como o HandBrake) }
 * - `audio`: { codec 'aac'|'mp3'|'pcm-s24'|'pcm-s16', kbps, taxa, canais }
 * - `tamanhoMax`: bytes (cabe no limite: o Relay escolhe tamanho e bitrate para caber)
 * - `formato`: contêiner de saída ('mp4' | 'mp3' | 'wav' | 'm4a')
 */
export const PRESETS = [
  {
    id: 'youtube-1080',
    nome: 'YouTube 1080p',
    grupo: 'Redes',
    icone: 'youtube',
    resumo: 'Full HD com folga para a recompressão do YouTube.',
    formato: 'mp4',
    video: { codec: 'avc', ladoMenor: 1080, fpsMax: 60, gop: 2, kbps: { 1080: [16000, 24000] }, crf: 17 },
    audio: AAC(384),
    fontes: [F.youtube],
  },
  {
    id: 'youtube-1440',
    nome: 'YouTube 1440p',
    grupo: 'Redes',
    icone: 'youtube',
    resumo: 'O truque da nitidez: 1080p enviado em 1440p ganha o codec melhor do YouTube.',
    formato: 'mp4',
    video: { codec: 'avc', ladoMenor: 1440, ampliar: true, fpsMax: 60, gop: 2, kbps: { 1440: [24000, 36000] }, crf: 17 },
    audio: AAC(384),
    fontes: [F.youtube1440, F.youtube],
    dica: 'Use em vídeo 1080p: o YouTube passa a servir em VP9/AV1. Não melhora o que já é 1440p ou mais.',
  },
  {
    id: 'youtube-4k',
    nome: 'YouTube 4K',
    grupo: 'Redes',
    icone: 'youtube',
    resumo: '2160p no bitrate que o YouTube recomenda para 4K.',
    formato: 'mp4',
    video: { codec: 'avc', ladoMenor: 2160, fpsMax: 60, gop: 2, kbps: { 2160: [50000, 75000] }, crf: 18 },
    audio: AAC(384),
    fontes: [F.youtube],
  },
  {
    id: 'shorts',
    nome: 'YouTube Shorts',
    grupo: 'Redes',
    icone: 'shorts',
    resumo: 'Vertical 9:16 em 1080p.',
    formato: 'mp4',
    video: { codec: 'avc', quadro: { largura: 1080, altura: 1920 }, fpsMax: 60, gop: 2, kbps: { 1080: [16000, 24000] }, crf: 17 },
    audio: AAC(384),
    fontes: [F.youtube],
  },
  {
    id: 'reels',
    nome: 'Reels · No Compress',
    grupo: 'Redes',
    icone: 'instagram',
    resumo: 'O arquivo que o Instagram menos estraga: 1080×1920, 30 fps.',
    formato: 'mp4',
    video: { codec: 'avc', quadro: { largura: 1080, altura: 1920 }, fpsMax: 30, gop: 2, kbps: { 1080: [14000, 14000] }, crf: 17 },
    audio: AAC(320),
    fontes: [F.instagram],
    dica: 'O Instagram sempre recomprime. Ligue "Enviar na mais alta qualidade" em Configurações › Qualidade de mídia.',
  },
  {
    id: 'feed',
    nome: 'Instagram Feed 4:5',
    grupo: 'Redes',
    icone: 'instagram',
    resumo: '1080×1350, o formato que ocupa mais tela no feed.',
    formato: 'mp4',
    video: { codec: 'avc', quadro: { largura: 1080, altura: 1350 }, fpsMax: 30, gop: 2, kbps: { 1080: [12000, 12000] }, crf: 17 },
    audio: AAC(320),
    fontes: [F.instagram],
  },
  {
    id: 'tiktok',
    nome: 'TikTok',
    grupo: 'Redes',
    icone: 'tiktok',
    resumo: 'Vertical 1080×1920, até 60 fps.',
    formato: 'mp4',
    video: { codec: 'avc', quadro: { largura: 1080, altura: 1920 }, fpsMax: 60, gop: 2, kbps: { 1080: [14000, 20000] }, crf: 17 },
    audio: AAC(320),
    fontes: [F.tiktok],
    dica: 'Mandar 4K não melhora: o TikTok entrega em 1080p.',
  },
  {
    id: 'whatsapp',
    nome: 'WhatsApp',
    grupo: 'Redes',
    icone: 'whatsapp',
    resumo: '720p leve, no tamanho do envio em HD.',
    formato: 'mp4',
    video: { codec: 'avc', ladoMenor: 720, fpsMax: 30, gop: 2, kbps: { 720: [3000, 3000] }, crf: 22, teto: 1.5 },
    audio: AAC(128),
    fontes: [F.whatsapp],
    dica: 'Envie com o botão HD ligado; sem ele, o WhatsApp reduz para 480p.',
  },
  {
    id: 'vimeo',
    nome: 'Vimeo',
    grupo: 'Trabalho',
    icone: 'vimeo',
    resumo: 'Para aprovação e portfólio, com a margem que o Vimeo pede.',
    formato: 'mp4',
    video: { codec: 'avc', ladoMenor: null, fpsMax: 60, gop: 2, kbps: { 720: [10000, 15000], 1080: [20000, 30000], 1440: [30000, 45000], 2160: [60000, 90000] }, crf: 16 },
    audio: AAC(320),
    fontes: [F.vimeo],
  },
  {
    id: 'hevc',
    nome: 'Apple HEVC',
    grupo: 'Trabalho',
    icone: 'apple',
    resumo: 'Metade do tamanho do H.264, na mesma qualidade, para iPhone e Mac.',
    formato: 'mp4',
    video: { codec: 'hevc', ladoMenor: null, fpsMax: 120, gop: 2, kbps: { 720: [5000, 7500], 1080: [10000, 15000], 1440: [16000, 24000], 2160: [35000, 50000] }, crf: 20 },
    audio: AAC(256),
    fontes: [F.apple],
  },
  {
    
    nome: 'Proxy para edição',
    grupo: 'Trabalho',
    icone: 'proxy',
    resumo: '720p leve que corre solto na timeline.',
    formato: 'mp4',
    video: { codec: 'avc', ladoMenor: 720, fpsMax: 120, gop: 1, kbps: { 720: [6000, 9000] }, crf: 20, teto: 2 },
    audio: { codec: 'aac', kbps: 192, taxa: 48000, canais: null },
    fontes: [fonte('Proxy de edição: 720p, GOP curto para correr na timeline, mesmo nome e duração do original', 'https://www.blackmagicdesign.com/products/davinciresolve/', 'mercado')],
  },
  {
    id: 'discord',
    nome: 'Discord',
    grupo: 'Tamanho',
    icone: 'peso',
    resumo: 'Cabe nos 20 MB da conta grátis.',
    formato: 'mp4',
    tamanhoMax: 20e6,
    video: { codec: 'avc', ladoMenor: 1080, fpsMax: 30, gop: 2, kbps: null, crf: 23 },
    audio: AAC(128),
    fontes: [F.discord],
  },
  {
    id: 'email',
    nome: 'E-mail',
    grupo: 'Tamanho',
    icone: 'envelope',
    resumo: 'Cabe nos 25 MB de anexo do Gmail.',
    formato: 'mp4',
    tamanhoMax: 25e6,
    video: { codec: 'avc', ladoMenor: 1080, fpsMax: 30, gop: 2, kbps: null, crf: 23 },
    audio: AAC(128),
    fontes: [F.gmail],
  },
  {
    id: 'tamanho',
    nome: 'Tamanho exato',
    grupo: 'Tamanho',
    icone: 'peso',
    resumo: 'Você diz quantos MB; o Relay escolhe o resto.',
    formato: 'mp4',
    tamanhoMax: 50e6,
    ajustavel: true,
    video: { codec: 'avc', ladoMenor: 2160, fpsMax: 60, gop: 2, kbps: null, crf: 20 },
    audio: AAC(160),
    fontes: [],
  },
  {
    id: 'mp3',
    nome: 'MP3 320',
    grupo: 'Áudio',
    icone: 'onda',
    resumo: 'O áudio em MP3 no teto do formato.',
    formato: 'mp3',
    video: null,
    audio: { codec: 'mp3', kbps: 320, taxa: null, canais: null },
    fontes: [F.mp3],
  },
  {
    id: 'm4a',
    nome: 'AAC 256',
    grupo: 'Áudio',
    icone: 'onda',
    resumo: 'M4A, o mesmo som em metade do MP3.',
    formato: 'm4a',
    video: null,
    audio: { codec: 'aac', kbps: 256, taxa: null, canais: null },
    fontes: [fonte('AAC-LC 256 kbit/s: o padrão do Apple Music e do iTunes Plus', 'https://www.apple.com/apple-music/', 'mercado')],
  },
  {
    id: 'wav',
    nome: 'WAV 48 kHz',
    grupo: 'Áudio',
    icone: 'onda',
    resumo: 'Sem perda, 24 bits, pronto para o editor.',
    formato: 'wav',
    video: null,
    audio: { codec: 'pcm-s24', kbps: null, taxa: 48000, canais: null },
    fontes: [F.wav],
  },
]

export const GRUPOS = ['Redes', 'Trabalho', 'Tamanho', 'Áudio']

export const preset = (id) => PRESETS.find((p) => p.id === id) ?? null
