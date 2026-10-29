/**
 * Vocabulário do inventário (porte de EQUIPMENT_CATEGORIES, guessEquipmentCategory, equipmentKey e cleanEquipmentName
 * do ZRO), com a categoria "Veículo" para a calculadora de deslocamento. Puro.
 */

export const CATEGORIAS_EQUIP = [
  { k: "camera", nome: "Câmera" },
  { k: "lente", nome: "Lente" },
  { k: "estabilizacao", nome: "Estabilização" },
  { k: "audio", nome: "Áudio" },
  { k: "luz", nome: "Luz" },
  { k: "grip", nome: "Maquinária e grip" },
  { k: "drone", nome: "Drone" },
  { k: "monitor", nome: "Monitor e vídeo" },
  { k: "edicao", nome: "Computador e edição" },
  { k: "acessorio", nome: "Acessórios" },
  { k: "veiculo", nome: "Veículo" },
  { k: "outro", nome: "Outros" },
] as const;
export type CategoriaEquip = (typeof CATEGORIAS_EQUIP)[number]["k"];
export const nomeCategoriaEquip = (k: string) => CATEGORIAS_EQUIP.find((c) => c.k === k)?.nome ?? k;
export const ehCategoriaEquip = (v: unknown): v is CategoriaEquip => CATEGORIAS_EQUIP.some((c) => c.k === v);

export const ESTADOS = [
  { k: "disponivel", nome: "Disponível" },
  { k: "em_uso", nome: "Em uso" },
  { k: "manutencao", nome: "Manutenção" },
  { k: "baixado", nome: "Baixado" },
] as const;
export type Estado = (typeof ESTADOS)[number]["k"];
export const nomeEstado = (k: string) => ESTADOS.find((e) => e.k === k)?.nome ?? k;

export const DONOS = [
  { k: "produtora", nome: "Da produtora" },
  { k: "freela", nome: "De freela" },
  { k: "locado", nome: "Locado" },
] as const;
export type Dono = (typeof DONOS)[number]["k"];

const DICAS: [CategoriaEquip, RegExp][] = [
  ["veiculo", /\bcarro\b|\bvan\b|\bpickup\b|\bpicape\b|\bmoto\b|\bsprinter\b|\bducato\b|\bstrada\b|\bsaveiro\b|\bhilux\b|\bspin\b|\bkombi\b/],
  ["acessorio", /adaptador|claquete|limpeza|walkie|radio comunicador|dummy|power ?bank|top handle|focus pro|speed ?booster/],
  ["camera", /ronin 4d|iphone|burano|raptor|z ?cam\b/],
  [
    "edicao",
    /macbook|mac studio|mac mini|\bimac\b|notebook|\bpc\b|computador|speed editor|micro panel|mini panel|tangent|wacom|loupedeck|proart|monitor de referencia/,
  ],
  [
    "grip",
    /c-?stand|difusao|extensoes|reguas|tripe de luz|saco de areia|sandbag|bandeira|\bflag\b|butterfly|\bframe \d|\bgrip\b|dolly|\bgrua\b|\bjib\b|trilho|travelling|\bclamp|garra|magic arm|braco articulado|apple ?box|extensao|regua eletrica|cabo de forca|gerador/,
  ],
  ["drone", /\bdrone|dji flip|mavic|\bdji (mini|air|avata|fpv|inspire|neo)\b|\bavata\b|\bfpv\b/],
  [
    "estabilizacao",
    /gimbal|rsc ?\d|osmo mobile|shoulder rig|car mount|ventosa|ronin|\brs ?\d|weebill|\bcrane\b|zhiyun|\bmoza\b|steadicam|estabiliz|tripe|monope|slider|easyrig|cabeca fluida/,
  ],
  [
    "audio",
    /microfone|shure|comica|boya|\bzoom f\d|mixpre|sound devices|zeppelin|blimp|peludo|protetor de vento|\bmic\b|lapela|wireless|\brode\b|sennheiser|\bzoom h\d|tascam|gravador|\bboom\b|shotgun|\blark\b|deity|saramonic|audio|\bfone/,
  ],
  [
    "monitor",
    /monitor|lilliput|cosmo c\d|video assist|\batem\b|cam link|teleprompter|atomos|ninja|shinobi|smallhd|feelworld|portkeys|transmiss|hollyland mars|accsoon|teradek/,
  ],
  [
    "luz",
    /\bluz\b|skypanel|kino ?flo|ring ?light|gelatina|octabox|colmeia|\bled\b|aputure|amaran|nanlite|godox|refletor|softbox|bastao|\btubo|painel|fresnel|sonaki|\d+ ?w\b|\bcob\b|rebatedor|difusor/,
  ],
  [
    "lente",
    /\blente|objetiva|\bsigma\b|tamron|samyang|rokinon|viltrox|laowa|sirui|7artisans|tokina|zeiss|\b\d{1,3} ?- ?\d{1,3} ?mm|\b\d{2,3} ?mm\b|\bf\/? ?\d(\.\d)?\b|\b\d{1,3}-\d{1,3} \d\.\d\b/,
  ],
  [
    "camera",
    /camera|filmadora|\bsony (fx|a7|a6|zv|a1|a9)|\bfx ?\d|\ba7 ?(s|r|c|iv|iii)|\bcanon (eos|r\d|c\d)|\beos\b|blackmagic|bmpcc|pocket (4k|6k)|lumix|panasonic|\bgh\d|fujifilm|\bx-?(h|t)\d|komodo|\barri\b|gopro|\bosmo\b|insta360|nikon z/,
  ],
  [
    "acessorio",
    /bateria|cartao|\bssd\b|hd externo|carregador|v-?mount|\bnd\b|filtro|\bcage\b|follow focus|matte ?box|\bcase\b|bolsa|mochila|\bcabo|adaptador|speed ?booster/,
  ],
];

/** Categoria provável pelo nome ("Sony FX30" → câmera, "Sigma 17-40 1.8" → lente). */
export function adivinharCategoria(nome: string): CategoriaEquip {
  const t = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return DICAS.find(([, re]) => re.test(t))?.[0] ?? "outro";
}

/** Chave para achar o mesmo modelo escrito de outro jeito ("Sony A7IV" = "sony a7 iv" = "SONY A7-IV"). */
export function chaveDoEquipamento(nome: string): string {
  return (
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9+]/g, "")
      .slice(0, 80) || "item"
  );
}

/** Nome limpo: sem marcador de lista, espaços sobrando ou ponto final. */
export function limparNome(texto: string): string | null {
  const t = texto
    .replace(/^[\s•·\-–—*]+/, "")
    .replace(/\s+/g, " ")
    .replace(/[.;,]+$/, "")
    .trim()
    .slice(0, 80);
  return t ? t.charAt(0).toLocaleUpperCase("pt-BR") + t.slice(1) : null;
}

/** Dois períodos de dias (início e fim inclusos) se cruzam? A mesma regra que o banco usa para barrar reserva dupla. */
export const cruzam = (a: { inicio: string; fim: string }, b: { inicio: string; fim: string }) => a.inicio <= b.fim && b.inicio <= a.fim;
