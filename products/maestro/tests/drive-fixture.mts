/**
 * Um Google Drive de mentira, só para teste (nunca dado de verdade): pastas e arquivos com miniatura sintética. Usado
 * pela ponte falsa (tests/ponte-falsa.mts, o SOBEDESCE e o HUB de mentira) e pelo e2e (o navegador intercepta
 * https://www.googleapis.com/drive/v3 e responde daqui; o vídeo é o sintético de public/demo).
 */
export const PASTA = "application/vnd.google-apps.folder";

/** Miniatura sintética (SVG em data:, sem rede): um degradê da luz C1 com uma forma simples. */
function miniatura(c1: string, c2: string, forma: "play" | "foto" | "doc"): string {
  const icone =
    forma === "play"
      ? `<circle cx="160" cy="100" r="30" fill="rgba(255,255,255,.85)"/><path d="M152 86l24 14-24 14z" fill="${c2}"/>`
      : forma === "foto"
        ? `<circle cx="120" cy="80" r="16" fill="rgba(255,255,255,.9)"/><path d="M60 170l70-60 50 40 40-30 60 50z" fill="rgba(255,255,255,.85)"/>`
        : `<rect x="128" y="50" width="64" height="90" rx="8" fill="rgba(255,255,255,.9)"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="320" height="200" fill="url(#g)"/>${icone}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export type ArquivoFixo = {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  size?: string;
  modifiedTime: string;
  thumbnailLink?: string;
  videoMediaMetadata?: { width: number; height: number; durationMillis: string };
  driveId?: string;
};

const QUANDO = "2026-10-27T14:20:00.000Z";

export const DRIVE_FIXO: ArquivoFixo[] = [
  { id: "f-clientes", name: "Clientes", mimeType: PASTA, parents: ["root"], modifiedTime: QUANDO },
  { id: "f-referencias", name: "Referências", mimeType: PASTA, parents: ["root"], modifiedTime: QUANDO },
  { id: "f-aurora", name: "Café Aurora", mimeType: PASTA, parents: ["f-clientes"], modifiedTime: QUANDO },
  { id: "f-norte", name: "Norte Bikes", mimeType: PASTA, parents: ["f-clientes"], modifiedTime: QUANDO },
  {
    id: "vid-manifesto",
    name: "Filme manifesto v3.mp4",
    mimeType: "video/mp4",
    parents: ["f-aurora"],
    size: "48213400",
    modifiedTime: "2026-10-28T09:12:00.000Z",
    thumbnailLink: miniatura("#ffd9b8", "#f59e7a", "play"),
    videoMediaMetadata: { width: 1920, height: 1080, durationMillis: "6000" },
  },
  {
    id: "vid-teaser",
    name: "Teaser 15s vertical.mp4",
    mimeType: "video/mp4",
    parents: ["f-aurora"],
    size: "12800400",
    modifiedTime: "2026-10-27T18:40:00.000Z",
    thumbnailLink: miniatura("#ddd9ff", "#9aa3d8", "play"),
    videoMediaMetadata: { width: 1080, height: 1920, durationMillis: "6000" },
  },
  {
    id: "img-still",
    name: "Still 01.jpg",
    mimeType: "image/jpeg",
    parents: ["f-aurora"],
    size: "2400000",
    modifiedTime: QUANDO,
    thumbnailLink: miniatura("#f9d3dc", "#c8962f", "foto"),
  },
  {
    id: "pdf-roteiro",
    name: "Roteiro aprovado.pdf",
    mimeType: "application/pdf",
    parents: ["f-aurora"],
    size: "182000",
    modifiedTime: QUANDO,
    thumbnailLink: miniatura("#f5f5f7", "#c7c7cc", "doc"),
  },
  {
    id: "vid-making",
    name: "Making of.mov",
    mimeType: "video/quicktime",
    parents: ["f-norte"],
    size: "98000000",
    modifiedTime: QUANDO,
    thumbnailLink: miniatura("#12a594", "#46a758", "play"),
    videoMediaMetadata: { width: 3840, height: 2160, durationMillis: "6000" },
  },
];

export const DRIVES_FIXOS = [{ id: "d-produtora", name: "Produtora (compartilhado)" }];

/** O que o files.list do Drive v3 responderia (só o que o navegador do Maestro pede: pai, nome, tipo, lixeira). */
export function listarFixo(q: string): ArquivoFixo[] {
  const pai = /'([^']+)' in parents/.exec(q)?.[1];
  const nome = /name contains '((?:[^'\\]|\\.)*)'/.exec(q)?.[1]?.replace(/\\(.)/g, "$1").toLowerCase();
  const soVideo = /mimeType contains 'video\//.test(q);
  return DRIVE_FIXO.filter((f) => (!pai || f.parents.includes(pai)) && (!nome || f.name.toLowerCase().includes(nome)))
    .filter((f) => !soVideo || f.mimeType.startsWith("video/") || f.mimeType === PASTA)
    .sort((a, b) => Number(b.mimeType === PASTA) - Number(a.mimeType === PASTA) || a.name.localeCompare(b.name, "pt-BR"));
}
