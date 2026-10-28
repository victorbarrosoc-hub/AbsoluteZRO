/**
 * Importar planilha (estudo MakersHub §4.2, drizzle/0016): ler o CSV, achar as colunas pelos cabeçalhos em português,
 * conferir linha a linha e dizer o que cada uma vai fazer. Puro (a tela, o servidor e os testes usam o mesmo); nada é
 * gravado aqui. O servidor (`servidor.ts`) casa com o que já existe e só grava na confirmação.
 *
 * Limites: 1 MB, 2.000 linhas, 40 colunas, 2.000 letras por célula. Separador `;` (Excel em português), `,` ou tab,
 * detectado pelo cabeçalho; aspas com "" dentro; BOM e CRLF aceitos. Fórmulas (=, +, -, @ no começo) entram como texto
 * e nunca voltam para uma planilha por aqui.
 */
import { adivinharCategoria, chaveDoEquipamento, ehCategoriaEquip, limparNome } from "@/lib/inventario/nomes";
import { normalizarFuncao } from "@/lib/freelas/funcoes";

export const LIMITES = { bytes: 1_000_000, linhas: 2000, colunas: 40, celula: 2000 } as const;

export const TIPOS = [
  { k: "clientes", nome: "Clientes", apoio: "Casa por e-mail ou nome" },
  { k: "projetos", nome: "Projetos", apoio: "Casa pelo código ou título" },
  { k: "freelas", nome: "Freelas", apoio: "Casa por e-mail ou nome" },
  { k: "equipamentos", nome: "Equipamentos", apoio: "Casa por patrimônio, série ou nome" },
] as const;
export type TipoImport = (typeof TIPOS)[number]["k"];
export const ehTipo = (v: unknown): v is TipoImport => typeof v === "string" && TIPOS.some((t) => t.k === v);

export type Campo = { k: string; nome: string; obrigatorio?: boolean; sinonimos: string[]; exemplo: string };

export const CAMPOS: Record<TipoImport, Campo[]> = {
  clientes: [
    { k: "nome", nome: "Nome", obrigatorio: true, sinonimos: ["nome", "cliente", "nome do cliente", "nome fantasia", "marca"], exemplo: "Café Serra Alta" },
    { k: "empresa", nome: "Empresa", sinonimos: ["empresa", "razao social", "razão social", "companhia"], exemplo: "Serra Alta Cafés Ltda" },
    { k: "contato", nome: "Contato", sinonimos: ["contato", "pessoa", "responsavel", "responsável", "nome do contato"], exemplo: "Joana Reis" },
    { k: "email", nome: "E-mail", sinonimos: ["email", "e-mail", "e mail", "correio"], exemplo: "joana@serraalta.com.br" },
    { k: "whatsapp", nome: "WhatsApp", sinonimos: ["whatsapp", "whats", "zap", "telefone", "celular", "fone"], exemplo: "(35) 99876-5432" },
    { k: "status", nome: "Status", sinonimos: ["status", "situacao", "situação", "estagio", "estágio"], exemplo: "ativo" },
    { k: "observacoes", nome: "Observações", sinonimos: ["observacoes", "observações", "obs", "notas", "anotacoes", "anotações"], exemplo: "Prefere WhatsApp" },
  ],
  projetos: [
    { k: "codigo", nome: "Código", sinonimos: ["codigo", "código", "cod", "id do projeto"], exemplo: "MAE-2026-010" },
    { k: "titulo", nome: "Título", obrigatorio: true, sinonimos: ["titulo", "título", "projeto", "nome", "nome do projeto"], exemplo: "Filme institucional" },
    { k: "cliente", nome: "Cliente", sinonimos: ["cliente", "nome do cliente", "marca"], exemplo: "Café Serra Alta" },
    { k: "status", nome: "Status", sinonimos: ["status", "situacao", "situação", "andamento"], exemplo: "em andamento" },
    { k: "inicio", nome: "Início", sinonimos: ["inicio", "início", "data de inicio", "data de início", "comeco", "começo"], exemplo: "03/11/2026" },
    { k: "prazo", nome: "Prazo", sinonimos: ["prazo", "entrega", "data de entrega", "fim", "termino", "término"], exemplo: "28/11/2026" },
    { k: "briefing", nome: "Briefing", sinonimos: ["briefing", "descricao", "descrição", "escopo", "observacoes", "observações"], exemplo: "Filme de 2 min" },
  ],
  freelas: [
    { k: "nome", nome: "Nome", obrigatorio: true, sinonimos: ["nome", "freela", "freelancer", "profissional"], exemplo: "Rafa Lima" },
    { k: "email", nome: "E-mail", sinonimos: ["email", "e-mail", "e mail"], exemplo: "rafa@exemplo.com" },
    { k: "whatsapp", nome: "WhatsApp", sinonimos: ["whatsapp", "whats", "zap", "telefone", "celular", "fone"], exemplo: "11 91234-5678" },
    { k: "cidade", nome: "Cidade", sinonimos: ["cidade", "local", "base", "municipio", "município"], exemplo: "São Paulo" },
    { k: "instagram", nome: "Instagram", sinonimos: ["instagram", "insta", "ig", "@"], exemplo: "@rafalima" },
    { k: "funcoes", nome: "Funções", sinonimos: ["funcoes", "funções", "funcao", "função", "especialidade", "cargo"], exemplo: "Edição, Drone" },
    { k: "nichos", nome: "Nichos", sinonimos: ["nichos", "nicho", "segmentos", "areas", "áreas"], exemplo: "Casamento" },
    { k: "notas", nome: "Notas", sinonimos: ["notas", "observacoes", "observações", "obs"], exemplo: "Tem carro" },
    {
      k: "zro_sub",
      nome: "Conta Absolute ZRO",
      sinonimos: ["conta absolute zro", "zro sub", "zro_sub", "id absolute zro", "sub"],
      exemplo: "",
    },
  ],
  equipamentos: [
    {
      k: "nome",
      nome: "Nome",
      obrigatorio: true,
      sinonimos: ["nome", "equipamento", "item", "descricao", "descrição", "modelo completo"],
      exemplo: "Sony FX6",
    },
    { k: "categoria", nome: "Categoria", sinonimos: ["categoria", "tipo", "grupo"], exemplo: "camera" },
    { k: "marca", nome: "Marca", sinonimos: ["marca", "fabricante"], exemplo: "Sony" },
    { k: "modelo", nome: "Modelo", sinonimos: ["modelo"], exemplo: "FX6" },
    {
      k: "serie",
      nome: "Nº de série",
      sinonimos: ["serie", "série", "numero de serie", "número de série", "n de serie", "nº de série", "serial"],
      exemplo: "S01234",
    },
    { k: "patrimonio", nome: "Patrimônio", sinonimos: ["patrimonio", "patrimônio", "etiqueta", "tag", "plaqueta"], exemplo: "PAT-001" },
    { k: "valor", nome: "Valor", sinonimos: ["valor", "valor pago", "preco", "preço", "custo"], exemplo: "R$ 32.000,00" },
    { k: "compra", nome: "Comprado em", sinonimos: ["compra", "data de compra", "comprado em", "aquisicao", "aquisição"], exemplo: "15/03/2025" },
    { k: "local", nome: "Onde fica", sinonimos: ["local", "onde fica", "localizacao", "localização", "armario", "armário"], exemplo: "Armário 2" },
    { k: "notas", nome: "Notas", sinonimos: ["notas", "observacoes", "observações", "obs"], exemplo: "Com 2 baterias" },
  ],
};

export type Mapa = Record<string, number | null>;
export type LinhaLida = { n: number; dados: Record<string, string | number | string[] | null>; erros: string[]; chave: string | null };
export type Leitura = { ok: true; cabecalho: string[]; linhas: string[][]; separador: string } | { ok: false; mensagem: string };

/** Sem acento, minúsculas, espaços simples (para comparar cabeçalhos e nomes). */
export const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_\s]+/g, " ")
    .replace(/[^a-z0-9@ -]/g, "")
    .trim();

/** Bytes → texto: UTF-8 (com ou sem BOM); se não for UTF-8 válido, Windows-1252 (o Excel em português). */
export function decodificar(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function separadorDe(linha: string): string {
  const conta = (s: string) => {
    let n = 0;
    let aspas = false;
    for (const c of linha) {
      if (c === '"') aspas = !aspas;
      else if (!aspas && c === s) n++;
    }
    return n;
  };
  return [";", ",", "\t"].reduce((melhor, s) => (conta(s) > conta(melhor) ? s : melhor), ";");
}

/** Lê o CSV inteiro (RFC 4180 com o separador detectado). Linhas totalmente vazias são puladas. */
export function lerCsv(texto: string): Leitura {
  const t = texto.replace(/^﻿/, "");
  if (new TextEncoder().encode(t).length > LIMITES.bytes) return { ok: false, mensagem: "O arquivo passa de 1 MB. Divida em partes." };
  const primeira = t.split(/\r\n|\n|\r/, 1)[0] ?? "";
  const sep = separadorDe(primeira);
  const linhas: string[][] = [];
  let linha: string[] = [];
  let celula = "";
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          celula += '"';
          i++;
        } else aspas = false;
      } else celula += c;
      continue;
    }
    if (c === '"' && celula === "") aspas = true;
    else if (c === sep) {
      linha.push(celula);
      celula = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      linha.push(celula);
      linhas.push(linha);
      linha = [];
      celula = "";
      if (linhas.length > LIMITES.linhas + 1) return { ok: false, mensagem: `Mais de ${LIMITES.linhas} linhas. Divida em partes.` };
    } else celula += c;
  }
  if (aspas) return { ok: false, mensagem: "Há aspas abertas sem fechar. Confira o arquivo." };
  if (celula !== "" || linha.length) {
    linha.push(celula);
    linhas.push(linha);
  }
  const cheias = linhas.filter((l) => l.some((c) => c.trim() !== ""));
  if (!cheias.length) return { ok: false, mensagem: "O arquivo está vazio." };
  const [cabecalho, ...resto] = cheias;
  if (cabecalho.length > LIMITES.colunas) return { ok: false, mensagem: `Mais de ${LIMITES.colunas} colunas.` };
  if (resto.length > LIMITES.linhas) return { ok: false, mensagem: `Mais de ${LIMITES.linhas} linhas. Divida em partes.` };
  if (!resto.length) return { ok: false, mensagem: "Só o cabeçalho: não há linhas para importar." };
  for (const l of cheias) for (const c of l) if (c.length > LIMITES.celula) return { ok: false, mensagem: "Uma célula passa de 2.000 letras." };
  return { ok: true, cabecalho: cabecalho.map((c) => c.trim()), linhas: resto, separador: sep };
}

/** Acha a coluna de cada campo pelo cabeçalho (sinônimos em português, sem acento). Uma coluna serve a um campo só. */
export function autoMapa(tipo: TipoImport, cabecalho: string[]): Mapa {
  const norm = cabecalho.map(normalizar);
  const usadas = new Set<number>();
  const mapa: Mapa = Object.fromEntries(CAMPOS[tipo].map((c) => [c.k, null]));
  // 1ª passada: cabeçalho igual a um sinônimo; 2ª: cabeçalho que contém um sinônimo (só nas colunas que sobraram).
  for (const exato of [true, false]) {
    for (const c of CAMPOS[tipo]) {
      if (mapa[c.k] != null || (!exato && c.k === "zro_sub")) continue;
      const sins = c.sinonimos.map(normalizar);
      const i = norm.findIndex((h, j) => !usadas.has(j) && (exato ? sins.includes(h) : sins.some((s) => s.length > 3 && h.includes(s))));
      if (i >= 0) {
        mapa[c.k] = i;
        usadas.add(i);
      }
    }
  }
  return mapa;
}

/** Confere um mapa que veio da tela: só campos conhecidos e colunas que existem. */
export function mapaValido(tipo: TipoImport, v: unknown, colunas: number): Mapa | null {
  if (!v || typeof v !== "object") return null;
  const m: Mapa = {};
  for (const c of CAMPOS[tipo]) {
    const x = (v as Record<string, unknown>)[c.k];
    m[c.k] = typeof x === "number" && Number.isInteger(x) && x >= 0 && x < colunas ? x : null;
  }
  return m;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "03/11/2026", "3/11/26", "2026-11-03" → "2026-11-03". Vazio = null; inválida = undefined. */
export function lerData(v: string): string | null | undefined {
  const t = v.trim();
  if (!t) return null;
  let a: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (r) [a, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t))) [d, m, a] = [+r[1], +r[2], r[3].length === 2 ? 2000 + +r[3] : +r[3]];
  else return undefined;
  const iso = `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso ? iso : undefined;
}

/** "R$ 1.234,56", "1234.56", "1.500" → centavos. Vazio = null; ilegível = undefined. */
export function lerValor(v: string): number | null | undefined {
  let t = v.replace(/[R$\s]/g, "").trim();
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return undefined;
  const c = Math.round(Number(t) * 100);
  return c <= 100_000_000_000 ? c : undefined;
}

/** WhatsApp só com dígitos e DDI (o mesmo de src/lib/crm/clientes.ts). Vazio = null; impossível = undefined. */
export function lerWhatsapp(v: string): string | null | undefined {
  if (!v.trim()) return null;
  let d = v.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if ((d.length === 10 || d.length === 11) && !v.trim().startsWith("+")) d = `55${d}`;
  return /^[0-9]{8,15}$/.test(d) ? d : undefined;
}

const STATUS_CLIENTE: Record<string, "lead" | "ativo" | "pausado"> = {
  lead: "lead",
  prospect: "lead",
  prospeccao: "lead",
  ativo: "ativo",
  ativa: "ativo",
  cliente: "ativo",
  pausado: "pausado",
  pausada: "pausado",
  inativo: "pausado",
};
const STATUS_PROJETO: Record<string, "active" | "paused" | "done" | "archived"> = {
  "em andamento": "active",
  andamento: "active",
  ativo: "active",
  aberto: "active",
  pausado: "paused",
  parado: "paused",
  concluido: "done",
  entregue: "done",
  finalizado: "done",
  arquivado: "archived",
};

/** Texto aparado, com o limite do banco; fórmulas viram texto literal (sem efeito aqui, e marcadas). */
function texto(v: string | undefined, max: number): string | null {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

/** Lê e confere uma linha. `chave` é o que casa com o que já existe (e-mail, código, patrimônio…). */
export function lerLinha(tipo: TipoImport, mapa: Mapa, celulas: string[], n: number): LinhaLida {
  const v = (k: string) => {
    const i = mapa[k];
    return i == null ? "" : (celulas[i] ?? "");
  };
  const erros: string[] = [];
  const d: LinhaLida["dados"] = {};
  const nome = texto(v("nome"), 200);
  const email = texto(v("email"), 254)?.toLowerCase() ?? null;
  if (email && !EMAIL.test(email)) erros.push("E-mail inválido");
  const whats = lerWhatsapp(v("whatsapp"));
  if (whats === undefined) erros.push("WhatsApp inválido");

  if (tipo === "clientes") {
    if (!nome) erros.push("Falta o nome");
    const st = normalizar(v("status"));
    const status = st ? STATUS_CLIENTE[st] : null;
    if (st && !status) erros.push("Status: use lead, ativo ou pausado");
    Object.assign(d, {
      nome,
      empresa: texto(v("empresa"), 200),
      contato: texto(v("contato"), 200),
      email,
      whatsapp: whats ?? null,
      status: status ?? null,
      observacoes: texto(v("observacoes"), 5000),
    });
    return { n, dados: d, erros, chave: email ? `email:${email}` : nome ? `nome:${normalizar(nome)}` : null };
  }
  if (tipo === "projetos") {
    const titulo = texto(v("titulo"), 200);
    if (!titulo) erros.push("Falta o título");
    const codigo = texto(v("codigo"), 20)?.toUpperCase() ?? null;
    if (codigo && !/^[A-Z]{2,6}-[0-9]{4}-[0-9]{3,5}$/.test(codigo)) erros.push("Código no formato MAE-2026-001");
    const st = normalizar(v("status"));
    const status = st ? STATUS_PROJETO[st] : null;
    if (st && !status) erros.push("Status: em andamento, pausado, concluído ou arquivado");
    const inicio = lerData(v("inicio"));
    const prazo = lerData(v("prazo"));
    if (inicio === undefined) erros.push("Início: data como 03/11/2026");
    if (prazo === undefined) erros.push("Prazo: data como 28/11/2026");
    if (inicio && prazo && prazo < inicio) erros.push("O prazo vem antes do início");
    Object.assign(d, {
      codigo,
      titulo,
      cliente: texto(v("cliente"), 200),
      status: status ?? null,
      inicio: inicio ?? null,
      prazo: prazo ?? null,
      briefing: texto(v("briefing"), 5000),
    });
    return { n, dados: d, erros, chave: codigo ? `codigo:${codigo}` : titulo ? `titulo:${normalizar(titulo)}` : null };
  }
  if (tipo === "freelas") {
    if (!nome) erros.push("Falta o nome");
    const lista = (s: string) =>
      [
        ...new Set(
          s
            .split(/[,;|/]/)
            .map((x) => normalizarFuncao(x))
            .filter((x): x is string => Boolean(x)),
        ),
      ].slice(0, 20);
    const sub = v("zro_sub").trim();
    if (sub && !UUID.test(sub)) erros.push("Conta Absolute ZRO: o id (uuid) da conta");
    const ig = texto(v("instagram"), 60)?.replace(/^@?/, "@") ?? null;
    Object.assign(d, {
      nome: nome?.slice(0, 120) ?? null,
      email,
      whatsapp: whats ?? null,
      cidade: texto(v("cidade"), 120),
      instagram: ig,
      funcoes: lista(v("funcoes")),
      nichos: lista(v("nichos")),
      notas: texto(v("notas"), 4000),
      zro_sub: sub && UUID.test(sub) ? sub.toLowerCase() : null,
    });
    return { n, dados: d, erros, chave: email ? `email:${email}` : nome ? `nome:${normalizar(nome)}` : null };
  }
  // equipamentos (inventário da produtora: dono "produtora")
  const nomeEq = limparNome(v("nome"));
  if (!nomeEq) erros.push("Falta o nome");
  const cat = normalizar(v("categoria"));
  const categoria = !cat
    ? nomeEq
      ? adivinharCategoria(nomeEq)
      : "outro"
    : ehCategoriaEquip(cat)
      ? cat
      : nomeEq
        ? adivinharCategoria(`${cat} ${nomeEq}`)
        : "outro";
  const valor = lerValor(v("valor"));
  if (valor === undefined) erros.push("Valor em reais, como 32.000,00");
  const compra = lerData(v("compra"));
  if (compra === undefined) erros.push("Data da compra como 15/03/2025");
  const patrimonio = texto(v("patrimonio"), 40);
  const serie = texto(v("serie"), 80);
  Object.assign(d, {
    nome: nomeEq,
    chave: nomeEq ? chaveDoEquipamento(nomeEq) : null,
    categoria,
    marca: texto(v("marca"), 60),
    modelo: texto(v("modelo"), 80),
    serie,
    patrimonio,
    valor: valor ?? null,
    compra: compra ?? null,
    local: texto(v("local"), 120),
    notas: texto(v("notas"), 2000),
  });
  return {
    n,
    dados: d,
    erros,
    chave: patrimonio ? `patrimonio:${normalizar(patrimonio)}` : serie ? `serie:${normalizar(serie)}` : nomeEq ? `nome:${chaveDoEquipamento(nomeEq)}` : null,
  };
}

export type Previa = {
  tipo: TipoImport;
  cabecalho: string[];
  mapa: Mapa;
  linhas: LinhaLida[];
  validas: number;
  invalidas: number;
  faltando: string[];
};

/** Prévia pura: ler, mapear (o dado ou o automático) e conferir cada linha. Repetidas no arquivo: vale a primeira. */
export function previa(tipo: TipoImport, textoCsv: string, mapaDado?: unknown): { ok: true; previa: Previa } | { ok: false; mensagem: string } {
  const l = lerCsv(textoCsv);
  if (!l.ok) return l;
  const mapa = mapaValido(tipo, mapaDado, l.cabecalho.length) ?? autoMapa(tipo, l.cabecalho);
  const faltando = CAMPOS[tipo].filter((c) => c.obrigatorio && mapa[c.k] == null).map((c) => c.nome);
  const vistas = new Set<string>();
  const linhas = l.linhas.map((cel, i) => {
    const r = lerLinha(tipo, mapa, cel, i + 2);
    if (r.chave && !r.erros.length) {
      if (vistas.has(r.chave)) r.erros.push("Repetida no arquivo (vale a primeira)");
      vistas.add(r.chave);
    }
    return r;
  });
  const invalidas = linhas.filter((x) => x.erros.length).length;
  return { ok: true, previa: { tipo, cabecalho: l.cabecalho, mapa, linhas, validas: linhas.length - invalidas, invalidas, faltando } };
}

/** O modelo para baixar: cabeçalho em português e uma linha de exemplo (separador `;`, BOM para o Excel). */
export function modeloCsv(tipo: TipoImport): string {
  const cel = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const campos = CAMPOS[tipo];
  return `﻿${campos.map((c) => cel(c.nome)).join(";")}\r\n${campos.map((c) => cel(c.exemplo)).join(";")}\r\n`;
}
