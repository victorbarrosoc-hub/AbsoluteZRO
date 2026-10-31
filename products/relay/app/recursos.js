// Recursos prontos no código que só aparecem quando a plataforma da família estiver no ar. A publicação troca este
// arquivo (scripts/publicar-site.mjs): as prévias da Vercel e o `npm run dev` ligam tudo; a produção liga a cor da
// Revela com REVELA=released no projeto `relay`, e o "Escolher no Drive" (o SOBEDESCE embutido) com DRIVE=released,
// quando o lado do SOBEDESCE (?no=relay) estiver no ar.
export const RECURSOS = { revela: false, drive: false }
