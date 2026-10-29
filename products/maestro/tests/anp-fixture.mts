/**
 * Planilha semanal da ANP de mentira ("resumo_semanal_lpc"), no mesmo desenho da de verdade: abas CAPITAIS, MUNICIPIOS,
 * ESTADOS e BRASIL, seis linhas de título, cabeçalho e datas como número do Excel. Valores INVENTADOS para teste.
 * Também a página "últimas semanas pesquisadas" e uma ANP falsa (servidor local) para o agendamento e o e2e.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { crc32, deflateRawSync } from "node:zlib";

/** Zip mínimo (deflate), o formato do .xlsx. */
export function zip(arquivos: Record<string, string>): Buffer {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let pos = 0;
  for (const [nome, texto] of Object.entries(arquivos)) {
    const dados = Buffer.from(texto, "utf8");
    const comp = deflateRawSync(dados);
    const n = Buffer.from(nome, "utf8");
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0);
    l.writeUInt16LE(20, 4);
    l.writeUInt16LE(8, 8);
    l.writeUInt32LE(crc32(dados), 14);
    l.writeUInt32LE(comp.length, 18);
    l.writeUInt32LE(dados.length, 22);
    l.writeUInt16LE(n.length, 26);
    locais.push(l, n, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc32(dados), 16);
    c.writeUInt32LE(comp.length, 20);
    c.writeUInt32LE(dados.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(pos, 42);
    centrais.push(c, n);
    pos += 30 + n.length + comp.length;
  }
  const dir = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(Object.keys(arquivos).length, 8);
  fim.writeUInt16LE(Object.keys(arquivos).length, 10);
  fim.writeUInt32LE(dir.length, 12);
  fim.writeUInt32LE(pos, 16);
  return Buffer.concat([...locais, dir, fim]);
}

/** 46313 = 18/10/2026 (domingo); a semana vai até 46319 (sábado, 24/10). */
export const SEMANA_PADRAO = 46313;
export const excelParaData = (n: number) => new Date(Date.UTC(1899, 11, 30) + n * 86_400_000).toISOString().slice(0, 10);

type Celula = string | number;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Monta o .xlsx. `semana` = número do Excel do domingo; `fator` multiplica os preços (para semanas diferentes). */
export function planilhaAnp({ semana = SEMANA_PADRAO, fator = 1 }: { semana?: number; fator?: number } = {}): Buffer {
  const textos: string[] = [];
  const s = (t: string) => {
    let i = textos.indexOf(t);
    if (i < 0) i = textos.push(t) - 1;
    return i;
  };
  const titulo = (tipo: string) => [
    ["AGÊNCIA NACIONAL DO PETRÓLEO, GÁS NATURAL E BIOCOMBUSTÍVEIS - ANP"],
    ["SUPERINTENDÊNCIA DE DEFESA DA CONCORRÊNCIA, ESTUDOS E REGULAÇÃO ECONÔMICA"],
    ["LEVANTAMENTO DE PREÇOS DE COMBUSTÍVEIS"],
    ["INTERVALO DE TEMPO: SEMANAL"],
    ["COMBUSTÍVEL: TODOS"],
    [`TIPO RELATÓRIO: ${tipo}`],
  ];
  const p = (v: number) => Math.round(v * fator * 1000) / 1000;
  const ini = semana;
  const fim = semana + 6;
  const folha = (linhas: Celula[][]) =>
    `<worksheet><sheetData>${linhas
      .map(
        (l, r) =>
          `<row r="${r + 1}">${l
            .map((v, c) => {
              const ref = `${String.fromCharCode(65 + c)}${r + 1}`;
              return typeof v === "number" ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="s"><v>${s(v)}</v></c>`;
            })
            .join("")}</row>`,
      )
      .join("")}</sheetData></worksheet>`;
  const cabMun = ["DATA INICIAL", "DATA FINAL", "ESTADO", "MUNICÍPIO", "PRODUTO", "NÚMERO DE POSTOS PESQUISADOS", "UNIDADE DE MEDIDA", "PREÇO MÉDIO REVENDA"];
  const municipios = folha([
    ...titulo("MUNICÍPIOS"),
    cabMun,
    [ini, fim, "RIO GRANDE DO NORTE", "NATAL", "GASOLINA COMUM", 52, "R$/l", p(6.493)],
    [ini, fim, "RIO GRANDE DO NORTE", "NATAL", "ETANOL HIDRATADO", 40, "R$/l", p(5.19)],
    [ini, fim, "RIO GRANDE DO NORTE", "NATAL", "OLEO DIESEL S10", 30, "R$/l", p(6.89)],
    [ini, fim, "RIO GRANDE DO NORTE", "NATAL", "GASOLINA ADITIVADA", 30, "R$/l", p(6.79)],
    [ini, fim, "RIO GRANDE DO NORTE", "MOSSORO", "ETANOL HIDRATADO", 9, "R$/l", p(5.39)],
    [ini, fim, "SAO PAULO", "SANTA BARBARA D'OESTE", "GASOLINA COMUM", 8, "R$/l", p(5.99)],
    [ini, fim, "SAO PAULO", "SAO PAULO", "GASOLINA COMUM", 300, "R$/l", p(6.11)],
    [ini, fim, "ESTADO QUE NAO EXISTE", "X", "GASOLINA COMUM", 1, "R$/l", p(6)],
    [ini, fim, "SAO PAULO", "PRECO ERRADO", "GASOLINA COMUM", 1, "R$/l", 0],
    [ini - 7, fim - 7, "SAO PAULO", "SEMANA VELHA", "GASOLINA COMUM", 1, "R$/l", p(4)],
    ["", "", "", "", "", "", "", ""],
  ]);
  const cabEst = ["DATA INICIAL", "DATA FINAL", "REGIAO", "ESTADOS", "PRODUTO", "NÚMERO DE POSTOS PESQUISADOS", "UNIDADE DE MEDIDA", "PREÇO MÉDIO REVENDA"];
  const estados = folha([
    ...titulo("ESTADOS"),
    cabEst,
    [ini, fim, "NORDESTE", "RIO GRANDE DO NORTE", "GASOLINA COMUM", 300, "R$/l", p(6.55)],
    [ini, fim, "NORDESTE", "RIO GRANDE DO NORTE", "ETANOL HIDRATADO", 200, "R$/l", p(5.3)],
    [ini, fim, "NORDESTE", "RIO GRANDE DO NORTE", "OLEO DIESEL S10", 150, "R$/l", p(6.95)],
    [ini, fim, "SUDESTE", "SAO PAULO", "GASOLINA COMUM", 1200, "R$/l", p(6.2)],
  ]);
  const cabBr = ["DATA INICIAL", "DATA FINAL", "BRASIL", "PRODUTO", "NÚMERO DE POSTOS PESQUISADOS", "UNIDADE DE MEDIDA", "PREÇO MÉDIO REVENDA"];
  const brasil = folha([
    ...titulo("BRASIL"),
    ["", "", "", "", "", "", ""],
    cabBr,
    [ini, fim, "BRASIL", "ETANOL HIDRATADO", 3929, "R$/l", p(4.11)],
    [ini, fim, "BRASIL", "GASOLINA COMUM", 4600, "R$/l", p(6.49)],
    [ini, fim, "BRASIL", "OLEO DIESEL", 1929, "R$/l", p(6.99)],
    [ini, fim, "BRASIL", "OLEO DIESEL S10", 3261, "R$/l", p(7.32)],
    [ini, fim, "BRASIL", "OLEO DIESEL S10", 3261, "R$/l", p(9.99)],
  ]);
  // CAPITAIS vem antes, como na planilha de verdade; a leitura não usa.
  const capitais = folha([...titulo("CAPITAIS"), cabMun, [ini, fim, "RIO GRANDE DO NORTE", "NATAL", "GASOLINA COMUM", 52, "R$/l", p(1)]]);
  return zip({
    "[Content_Types].xml": "<Types/>",
    "xl/workbook.xml": `<workbook><sheets><sheet name="CAPITAIS" sheetId="1" r:id="rId1"/><sheet name="MUNICIPIOS" sheetId="2" r:id="rId2"/><sheet name="ESTADOS" sheetId="3" r:id="rId3"/><sheet name="BRASIL" sheetId="4" r:id="rId4"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Target="/xl/worksheets/sheet3.xml"/><Relationship Id="rId4" Target="worksheets/sheet4.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": capitais,
    "xl/worksheets/sheet2.xml": municipios,
    "xl/worksheets/sheet3.xml": estados,
    "xl/worksheets/sheet4.xml": brasil,
    "xl/sharedStrings.xml": `<sst>${textos.map((t) => `<si><t>${esc(t)}</t></si>`).join("")}</sst>`,
  });
}

/** A página "últimas semanas pesquisadas": nomes no jeito bagunçado de verdade (a mais nova em cima). */
export function paginaAnp(base: string, semanas: number[] = [SEMANA_PADRAO]): string {
  const nome = (n: number) => {
    const [a, b] = [excelParaData(n), excelParaData(n + 6)];
    return n % 2 ? `resumo_semanal_lpc_${a.replaceAll("-", "_")}-${b.replaceAll("-", "_")}.xlsx` : `resumo_semanal_lpc_${a}_${b}.xlsx`;
  };
  const links = semanas.map(
    (n) => `<li><a href="${base}/arquivos-lpc/${nome(n)}">Resumo</a> <a href="${base}/arquivos-lpc/revendas_lpc_${n}.xlsx">Revendas</a></li>`,
  );
  return `<html><body><a href="https://outro-site.example/resumo_semanal_lpc_2099-01-01_2099-01-07.xlsx">não é da ANP</a><ul>${links.join("")}</ul></body></html>`;
}

/** ANP falsa: GET /pagina (a página) e /arquivos-lpc/<nome> (a planilha da semana do nome). `fora` = 503 em tudo. */
export async function iniciarAnpFalsa(porta = 0) {
  const estado = { fora: false, semanas: [SEMANA_PADRAO], pedidos: [] as string[] };
  const servidor = http.createServer((req, res) => {
    const url = req.url ?? "/";
    estado.pedidos.push(url);
    if (estado.fora) return void res.writeHead(503).end("fora do ar");
    if (url.startsWith("/pagina")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return void res.end(paginaAnp(base(), estado.semanas));
    }
    const m = url.match(/resumo_semanal_lpc_(\d{4})[_-](\d{2})[_-](\d{2})/);
    if (m) {
      const n = Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86_400_000);
      res.writeHead(200, { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      return void res.end(planilhaAnp({ semana: n, fator: 1 + (n - SEMANA_PADRAO) / 700 }));
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((ok) => servidor.listen(porta, "127.0.0.1", ok));
  const base = () => `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  return {
    estado,
    get pagina() {
      return `${base()}/pagina`;
    },
    fechar: () =>
      new Promise<void>((ok) => {
        servidor.closeAllConnections();
        servidor.close(() => ok());
      }),
  };
}
