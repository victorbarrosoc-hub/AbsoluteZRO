/**
 * iCalendar (RFC 5545) da agenda por assinatura (drizzle/0017). Puro: recebe os itens já lidos como a pessoa e devolve
 * o texto do calendário. Regras do formato que importam aqui:
 *   * linhas terminam em CRLF e são dobradas em 75 octetos (UTF-8; a continuação começa com um espaço);
 *   * TEXT escapa `\`, `;`, `,` e quebra de linha (`\n`);
 *   * dia inteiro = DTSTART;VALUE=DATE e DTEND exclusivo (o dia seguinte ao último);
 *   * com hora = hora local com TZID=America/Sao_Paulo e o VTIMEZONE junto (o Brasil não tem horário de verão desde
 *     2019: -03:00 o ano todo);
 *   * DTSTAMP em UTC e UID estável por item (o aplicativo atualiza em vez de duplicar).
 */

export const FUSO = "America/Sao_Paulo";
export const DOMINIO_UID = "maestro.absolutezro.com";

export type ItemAgenda = {
  /** Estável entre leituras: tipo + id da linha. */
  uid: string;
  titulo: string;
  /** AAAA-MM-DD */
  data: string;
  /** AAAA-MM-DD (inclusive); ausente = um dia. */
  dataFim?: string | null;
  /** HH:MM (hora local de Brasília); ausente = dia inteiro. */
  horaIni?: string | null;
  horaFim?: string | null;
  local?: string | null;
  descricao?: string | null;
  /** Link de volta para o Maestro. */
  url?: string | null;
  categoria?: string | null;
  atualizadoEm?: Date | null;
};

/** Escapa um valor TEXT (RFC 5545 §3.3.11). */
export function escaparTexto(v: string): string {
  return v
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Dobra uma linha em pedaços de até 75 octetos, sem quebrar um caractere UTF-8 no meio (§3.1). */
export function dobrar(linha: string): string {
  const enc = new TextEncoder();
  if (enc.encode(linha).length <= 75) return linha;
  const partes: string[] = [];
  let atual = "";
  let bytes = 0;
  let limite = 75;
  for (const ch of linha) {
    const n = enc.encode(ch).length;
    if (bytes + n > limite) {
      partes.push(atual);
      atual = "";
      bytes = 0;
      limite = 74; // a continuação começa com um espaço
    }
    atual += ch;
    bytes += n;
  }
  partes.push(atual);
  return partes.join("\r\n ");
}

const D2 = (n: number) => String(n).padStart(2, "0");
const dataIcs = (d: string) => d.replaceAll("-", "");
const ehData = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
const ehHora = (h: unknown): h is string => typeof h === "string" && /^([01]\d|2[0-3]):[0-5]\d/.test(h);

export function diaSeguinte(d: string): string {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

/** 2026-11-10T13:05:09Z → 20261110T130509Z */
export function carimboUtc(d: Date): string {
  return `${d.getUTCFullYear()}${D2(d.getUTCMonth() + 1)}${D2(d.getUTCDate())}T${D2(d.getUTCHours())}${D2(d.getUTCMinutes())}${D2(d.getUTCSeconds())}Z`;
}

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${FUSO}`,
  "X-LIC-LOCATION:America/Sao_Paulo",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0300",
  "TZOFFSETTO:-0300",
  "TZNAME:-03",
  "DTSTART:19700101T000000",
  "END:STANDARD",
  "END:VTIMEZONE",
];

function evento(i: ItemAgenda, agora: Date): string[] {
  if (!ehData(i.data)) return [];
  const fim = ehData(i.dataFim) && i.dataFim >= i.data ? i.dataFim : i.data;
  const linhas = ["BEGIN:VEVENT", `UID:${i.uid}@${DOMINIO_UID}`, `DTSTAMP:${carimboUtc(agora)}`];
  if (ehHora(i.horaIni)) {
    const ini = i.horaIni.slice(0, 5).replace(":", "");
    linhas.push(`DTSTART;TZID=${FUSO}:${dataIcs(i.data)}T${ini}00`);
    if (ehHora(i.horaFim) && (fim > i.data || i.horaFim.slice(0, 5) > i.horaIni.slice(0, 5))) {
      linhas.push(`DTEND;TZID=${FUSO}:${dataIcs(fim)}T${i.horaFim.slice(0, 5).replace(":", "")}00`);
    } else {
      linhas.push("DURATION:PT1H");
    }
  } else {
    linhas.push(`DTSTART;VALUE=DATE:${dataIcs(i.data)}`, `DTEND;VALUE=DATE:${dataIcs(diaSeguinte(fim))}`, "TRANSP:TRANSPARENT");
  }
  linhas.push(`SUMMARY:${escaparTexto(i.titulo.slice(0, 200))}`);
  if (i.local) linhas.push(`LOCATION:${escaparTexto(i.local.slice(0, 300))}`);
  if (i.descricao) linhas.push(`DESCRIPTION:${escaparTexto(i.descricao.slice(0, 1000))}`);
  if (i.categoria) linhas.push(`CATEGORIES:${escaparTexto(i.categoria)}`);
  if (i.url && /^https?:\/\/[^\s"<>]+$/.test(i.url)) linhas.push(`URL:${i.url}`);
  if (i.atualizadoEm) linhas.push(`LAST-MODIFIED:${carimboUtc(i.atualizadoEm)}`);
  linhas.push("END:VEVENT");
  return linhas;
}

/** O calendário inteiro, pronto para servir como text/calendar. */
export function gerarIcs(o: { nome: string; itens: ItemAgenda[]; agora?: Date }): string {
  const agora = o.agora ?? new Date();
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Absolute ZRO//Maestro//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escaparTexto(o.nome)}`,
    `X-WR-TIMEZONE:${FUSO}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...VTIMEZONE,
    ...o.itens.flatMap((i) => evento(i, agora)),
    "END:VCALENDAR",
  ];
  return linhas.map(dobrar).join("\r\n") + "\r\n";
}
