/**
 * O que cada plataforma do ecossistema faz, para a Z responder com a ferramenta certa (e não mandar a pessoa para um
 * arquivo no Drive quando a plataforma já resolve). Só o que existe e está publicado: quando uma plataforma ganha ou
 * perde um recurso, atualize aqui. Chave = id do produto em zro.products. O guia que vai para a Z é filtrado em tempo
 * de execução pelo gate de lançamento (ADR 0023): plataforma fechada para a pessoa não entra, mas a entrada fica aqui.
 */
export const PLATAFORMAS: Record<string, { nome: string; faz: string[] }> = {
  finishing: {
    nome: 'Revela (revela.absolutezro.com)',
    faz: [
      'LUT: dá um frame de referência e um frame do material e sai uma LUT .cube (33 ou 65 pontos) para o DaVinci Resolve, Premiere, Final Cut, CapCut; preset .xmp aproximado para Lightroom.',
      'Looks próprios da Revela (Revela Look, Suave, Petróleo, Dourado, P&B) lado a lado no frame da pessoa, com intensidade.',
      'Clonar LUT: com o mesmo frame antes e depois de um grade (de outro colorista, de um pacote de LUTs, do Resolve), a Revela aprende a cor e gera a LUT; "Mais frames" aceita até 6 stills do mesmo grade para ficar mais fiel.',
      'Meus looks: o clone vira um look salvo com nome (até 8, só naquele navegador) para usar em qualquer frame e baixar o .cube.',
      'Revela Lab: cria o próprio look sobre bases da Revela, películas (Negativo 250D, 500T, Positivo 50D, Reversível, Sem branqueamento), cinema (cópias 2383, 2393 e 3513, feitas das curvas das fichas técnicas da Kodak e da Fujifilm, sozinhas ou com os negativos) e clássicos, com ajustes simples, num motor na luz da cena (como ACES e ARRI). O frame pode ser um still Rec.709 ou o log da câmera. O "Pacote profissional" traz o look como LMT em DaVinci Wide Gamut/Intermediate e ACEScct (65 pontos, .cube e CLF), a LUT do monitor do set, uma LUT Rec.709, a correção em CDL, a receita e o controle de qualidade do look.',
      'Revela Looks: vitrine dos packs (Revela, Película, Cinema, Clássicos) que abrem no Lab; a loja ainda não vende.',
      'CST: converte o log da câmera (Sony, ARRI, Canon, Panasonic, Blackmagic, Fujifilm, Nikon, DJI, RED) para Rec.709, sRGB, Rec.2020, P3, DaVinci Intermediate, ACEScct ou LogC3, em .cube; por clipe a partir do relatório do Synquei (script do Resolve).',
      'Entrega: preset de exportação por destino (YouTube, YouTube HDR, Vimeo, Reels, TikTok, TV aberta, streaming, master), com codec, bitrate, cor e loudness.',
      'Converter: converte vídeo (ProRes, H.264, HEVC) no próprio aparelho para os destinos da Entrega, com CST de log para Rec.709; nada sai do aparelho.',
      'Não aplica um pacote de LUTs pronto (.zip) direto: para chegar na cor de um pacote, o caminho é o Clonar LUT com frames antes e depois.',
    ],
  },
  sobedesce: {
    nome: 'SOBEDESCE',
    faz: [
      'Baixa e sobe pastas gigantes no Google Drive com várias conexões, pausa e continua, e confere cada arquivo (MD5).',
      'Compara uma pasta do computador com uma do Drive, recebe arquivos do celular pelo Wi-Fi, gera proxies e converte com o Relay (no computador e no celular).',
    ],
  },
  relay: {
    nome: 'Relay (relay.absolutezro.com)',
    faz: [
      'Conversor de vídeo e áudio no próprio aparelho (nada é enviado), incluído em toda conta Absolute ZRO: YouTube 1080p/1440p/4K, Shorts, Reels · No Compress, Instagram Feed 4:5, TikTok, WhatsApp, Vimeo, Apple HEVC, proxy para edição, Discord (20 MB), e-mail (25 MB), tamanho exato e áudio em MP3 320, AAC 256 ou WAV 48 kHz.',
      'Vários destinos de uma vez, presets próprios da pessoa ("Meus", com ficha técnica: codec, tamanho, cadência, bitrate ou tamanho máximo, quadro-chave e áudio) e levar/trazer presets em arquivo .relay.json.',
      'Para arquivo que está no Drive: o SOBEDESCE converte com o Relay no computador ou no celular e sobe ao lado do original.',
    ],
  },
  synquei: {
    nome: 'Synquei',
    faz: [
      'Sincroniza câmeras, celulares e gravadores pelo som no navegador: reconhece cada arquivo, separa por aparelho, acha onde cada clipe entra e exporta o projeto para o editor.',
    ],
  },
  'ai-edit': {
    nome: 'AEON',
    faz: [
      'Editor de vídeo para Mac e Windows (prévia): transcreve na máquina, sugere cortes de silêncio e respiro e zoom na fala, legenda animada e exporta para Premiere, Final Cut, DaVinci ou MP4.',
    ],
  },
  nossom: {
    nome: 'NOSSOM',
    faz: ['Estúdio de áudio para criadores: limpeza, EQ, dinâmica, efeitos, mixagem e entrega, restauração de fala e separação de voz.'],
  },
  tpeasy: { nome: 'TPeasy', faz: ['Teleprompter no iPhone (instala pela Tela de Início), com roteiros sincronizados pela conta.'] },
  'carro-do-freela': {
    nome: 'Carro do Freela',
    faz: ['Agenda e contratação de freelas do audiovisual (protótipo): quem contrata monta a escala, quem é freela mantém a própria agenda.'],
  },
  maestro: {
    nome: 'Maestro (maestro.absolutezro.com)',
    faz: [
      'Em Beta para toda conta Absolute ZRO: a gestão da produtora num lugar só: funil de pedidos e CRM de clientes, orçamentos com contrato e aceite online, financeiro, freelas, equipamento, controle de pauta (Quadro em 8 colunas), agenda e aprovação do cliente por link sem conta, com projetos ligados ao projeto da Absolute ZRO.',
      'Entra com a mesma conta (maestro.absolutezro.com › Entrar com Absolute ZRO). No celular vira app: no Safari, Compartilhar › Adicionar à Tela de Início; Ajustes do Maestro mostra o caminho.',
      'A Z lê o dia da produtora no Maestro (ver_maestro): retornos de hoje, cards vencendo, peças com o cliente, contagens e, para administração e gestão, meta, faturado, caixa, a receber e a pagar. Só leitura: criar pedido, cliente ou despesa e mexer no Quadro é no próprio Maestro.',
    ],
  },
}

/** Só as plataformas pedidas (as abertas para a pessoa), na ordem do guia. Sem lista = todas. */
function entradas(ids?: Iterable<string>) {
  const todas = Object.entries(PLATAFORMAS)
  if (!ids) return todas
  const quer = new Set(ids)
  return todas.filter(([id]) => quer.has(id))
}

/** Bloco de texto para o sistema da Z (fica no cache: só muda quando uma plataforma abre ou fecha). */
export function guiaDasPlataformas(ids?: Iterable<string>) {
  return entradas(ids)
    .map(([id, p]) => `- ${p.nome} [${id}]:\n${p.faz.map((f) => `  • ${f}`).join('\n')}`)
    .join('\n')
}

/** Nomes curtos das plataformas (para a Z se apresentar só com as que estão no ar). */
export function nomesDasPlataformas(ids?: Iterable<string>) {
  return entradas(ids).map(([, p]) => p.nome.replace(/\s*\(.*\)$/, ''))
}
