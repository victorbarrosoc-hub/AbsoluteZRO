/**
 * O contrato de prestação de serviços audiovisuais (estudo MakersHub §4, item 4; decisão do titular, 29/10/2026): o
 * modelo base do Maestro, as {{variáveis}} que ele aceita, os números configuráveis e o preenchimento. Puro (sem banco,
 * sem `node:crypto`): Ajustes → Contrato (prévia ao vivo), a página do cliente e o servidor fazem a mesma conta.
 *
 * É um MODELO BASE: a produtora revisa com um advogado antes de usar. O aceite pelo link é um aceite eletrônico (quem,
 * quando, o quê e o hash do texto), não assinatura com certificado ICP-Brasil.
 *
 * Formato do texto: `# título`, `## cláusula`, parágrafos separados por linha em branco, `- item` para listas. Variável
 * é `{{chave}}`; as de lista (`entregaveis`, `parcelas`) viram itens quando ficam sozinhas na linha.
 */

export const AVISO_MODELO = "Modelo base; revise com um advogado antes de usar.";
export const AVISO_ACEITE = "Aceite eletrônico com registro de nome, documento, data, hora e hash do texto. Não é assinatura com certificado ICP-Brasil.";
export const TEXTO_MAX = 40_000;

export type GrupoVariavel = "contratada" | "contratante" | "proposta" | "ajustes" | "aceite";

export type CampoConfig = {
  chave: string;
  rotulo: string;
  tipo: "numero" | "texto";
  padrao: number | string;
  min?: number;
  max?: number;
  sufixo?: string;
};

/** Os números e textos do contrato que a produtora ajusta (Ajustes → Contrato). Todo percentual e prazo está aqui. */
export const CAMPOS_CONFIG: CampoConfig[] = [
  { chave: "revisoes_incluidas", rotulo: "Rodadas de revisão incluídas", tipo: "numero", padrao: 2, min: 0, max: 20 },
  { chave: "revisao_extra_pct", rotulo: "Rodada extra (% do total)", tipo: "numero", padrao: 10, min: 0, max: 100, sufixo: "%" },
  { chave: "prazo_aprovacao_dias", rotulo: "Prazo do cliente para aprovar (dias úteis)", tipo: "numero", padrao: 5, min: 1, max: 60 },
  { chave: "prazo_entrega_dias", rotulo: "Entrega após a última captação (dias úteis)", tipo: "numero", padrao: 15, min: 1, max: 365 },
  { chave: "guarda_material_dias", rotulo: "Guarda do material bruto (dias)", tipo: "numero", padrao: 90, min: 0, max: 3650 },
  { chave: "licenca_usos", rotulo: "Usos licenciados", tipo: "texto", padrao: "internet, redes sociais e apresentações institucionais" },
  { chave: "licenca_territorio", rotulo: "Território da licença", tipo: "texto", padrao: "Brasil" },
  { chave: "licenca_prazo_meses", rotulo: "Prazo da licença (meses)", tipo: "numero", padrao: 24, min: 1, max: 600 },
  { chave: "cancelamento_antecedencia_dias", rotulo: "Cancelamento: antecedência (dias)", tipo: "numero", padrao: 7, min: 0, max: 180 },
  { chave: "multa_cancelamento_antes_pct", rotulo: "Multa por cancelar com antecedência (%)", tipo: "numero", padrao: 20, min: 0, max: 100, sufixo: "%" },
  { chave: "multa_cancelamento_depois_pct", rotulo: "Multa por cancelar em cima da hora (%)", tipo: "numero", padrao: 50, min: 0, max: 100, sufixo: "%" },
  { chave: "remarcacao_antecedencia_dias", rotulo: "Remarcar sem custo até (dias antes)", tipo: "numero", padrao: 3, min: 0, max: 90 },
  { chave: "remarcacao_taxa_pct", rotulo: "Taxa de remarcação depois disso (%)", tipo: "numero", padrao: 10, min: 0, max: 100, sufixo: "%" },
  { chave: "multa_atraso_pct", rotulo: "Multa por atraso no pagamento (%)", tipo: "numero", padrao: 2, min: 0, max: 20, sufixo: "%" },
  { chave: "juros_atraso_pct", rotulo: "Juros por mês de atraso (%)", tipo: "numero", padrao: 1, min: 0, max: 10, sufixo: "%" },
  { chave: "confidencialidade_anos", rotulo: "Sigilo depois do fim (anos)", tipo: "numero", padrao: 2, min: 0, max: 20 },
  { chave: "foro_cidade", rotulo: "Foro (cidade/UF)", tipo: "texto", padrao: "" },
];

export type ConfigContrato = Record<string, number | string>;

export const CONFIG_PADRAO: ConfigContrato = Object.fromEntries(CAMPOS_CONFIG.map((c) => [c.chave, c.padrao]));

export type Variavel = { chave: string; rotulo: string; grupo: GrupoVariavel; lista?: boolean };

export const VARIAVEIS: Variavel[] = [
  { chave: "contratada_nome", rotulo: "Produtora (razão social)", grupo: "contratada" },
  { chave: "contratada_cnpj", rotulo: "CNPJ da produtora", grupo: "contratada" },
  { chave: "contratada_endereco", rotulo: "Endereço da produtora", grupo: "contratada" },
  { chave: "contratada_contato", rotulo: "E-mail e telefone da produtora", grupo: "contratada" },
  { chave: "contratante_nome", rotulo: "Nome do cliente", grupo: "contratante" },
  { chave: "contratante_documento", rotulo: "CPF/CNPJ do cliente", grupo: "contratante" },
  { chave: "contratante_endereco", rotulo: "Endereço do cliente", grupo: "contratante" },
  { chave: "proposta_codigo", rotulo: "Código da proposta", grupo: "proposta" },
  { chave: "proposta_titulo", rotulo: "Título da proposta", grupo: "proposta" },
  { chave: "proposta_data", rotulo: "Data da proposta", grupo: "proposta" },
  { chave: "periodo", rotulo: "Datas e diárias", grupo: "proposta" },
  { chave: "escopo", rotulo: "Escopo", grupo: "proposta" },
  { chave: "entregaveis", rotulo: "Entregáveis (lista)", grupo: "proposta", lista: true },
  { chave: "valor_total", rotulo: "Valor total", grupo: "proposta" },
  { chave: "parcelas", rotulo: "Parcelas (lista)", grupo: "proposta", lista: true },
  { chave: "forma_pagamento", rotulo: "Forma de pagamento", grupo: "proposta" },
  ...CAMPOS_CONFIG.map((c) => ({ chave: c.chave, rotulo: c.rotulo, grupo: "ajustes" as const })),
  { chave: "portfolio", rotulo: "Portfólio (escolha do cliente)", grupo: "aceite" },
  { chave: "data_aceite", rotulo: "Data do aceite", grupo: "aceite" },
];

export const NOMES_DOS_GRUPOS: Record<GrupoVariavel, string> = {
  contratada: "Produtora",
  contratante: "Cliente",
  proposta: "Proposta",
  ajustes: "Números do contrato",
  aceite: "Aceite",
};

const CHAVES = new Set(VARIAVEIS.map((v) => v.chave));
const LISTAS = new Set(VARIAVEIS.filter((v) => v.lista).map((v) => v.chave));

export const MODELO_PADRAO = `# Contrato de prestação de serviços audiovisuais

Pelo presente instrumento, de um lado **{{contratada_nome}}**, inscrita no CNPJ sob o nº {{contratada_cnpj}}, com sede em {{contratada_endereco}}, contato {{contratada_contato}}, doravante CONTRATADA; e, de outro, **{{contratante_nome}}**, inscrito(a) no CPF/CNPJ sob o nº {{contratante_documento}}, com endereço em {{contratante_endereco}}, doravante CONTRATANTE, têm entre si justo e contratado o que segue.

## 1. Objeto e escopo

1.1. A CONTRATADA prestará à CONTRATANTE os serviços audiovisuais descritos na proposta {{proposta_codigo}} ("{{proposta_titulo}}"), de {{proposta_data}}, que faz parte deste contrato.

1.2. Escopo: {{escopo}}

1.3. Entregáveis:

{{entregaveis}}

1.4. O que não estiver na proposta não está incluído e, se pedido, será orçado à parte.

## 2. Prazos e cronograma

2.1. Datas e diárias de captação: {{periodo}}.

2.2. A primeira versão do material editado será entregue em até {{prazo_entrega_dias}} dias úteis depois da última diária de captação, salvo outro prazo na proposta.

2.3. Os prazos da CONTRATADA ficam suspensos enquanto ela aguarda aprovação, material, informação ou pagamento que dependam da CONTRATANTE.

## 3. Valor e forma de pagamento

3.1. Pelos serviços, a CONTRATANTE pagará {{valor_total}}, assim:

{{parcelas}}

3.2. Forma de pagamento: {{forma_pagamento}}

3.3. Atraso no pagamento gera multa de {{multa_atraso_pct}}% sobre o valor em atraso e juros de {{juros_atraso_pct}}% ao mês, e permite à CONTRATADA suspender as entregas até a regularização.

## 4. Revisões incluídas

4.1. Estão incluídas {{revisoes_incluidas}} rodadas de revisão por peça. Uma rodada é o conjunto de ajustes pedidos de uma só vez sobre uma versão.

4.2. Cada rodada extra custa {{revisao_extra_pct}}% do valor total, cobrada à parte. Mudança de roteiro, de conceito ou nova captação não é revisão e será orçada à parte.

## 5. Aprovação

5.1. Cada peça é enviada à CONTRATANTE pelo link de aprovação do Maestro. A aprovação pelo link (botão "Aprovar", com nome, data e hora registrados) vale como aceite formal daquela peça e da versão aprovada.

5.2. A CONTRATANTE tem {{prazo_aprovacao_dias}} dias úteis para aprovar ou pedir ajuste de cada versão. Sem resposta nesse prazo, a versão poderá ser considerada aprovada, depois de aviso da CONTRATADA.

## 6. Direitos autorais e licença de uso

6.1. Os direitos patrimoniais de autor sobre as obras produzidas pertencem à CONTRATADA, que concede à CONTRATANTE, depois de quitado o valor total, licença de uso não exclusiva para {{licenca_usos}}, no território {{licenca_territorio}}, pelo prazo de {{licenca_prazo_meses}} meses a contar da entrega final. Outros usos, territórios ou prazos dependem de nova licença por escrito.

6.2. Os direitos morais de autor são inalienáveis e irrenunciáveis, na forma da Lei nº 9.610/1998, e serão respeitados por ambas as partes, inclusive o crédito quando cabível.

6.3. O material bruto (arquivos de câmera e projeto de edição) não faz parte da entrega, salvo se previsto na proposta. A CONTRATADA guarda o material bruto por {{guarda_material_dias}} dias depois da entrega final.

6.4. Trilhas, fontes, imagens e outros elementos de terceiros seguem as licenças dos respectivos titulares.

## 7. Direito de imagem e voz

7.1. A CONTRATANTE é responsável por obter as autorizações de uso de imagem, nome e voz das pessoas que indicar para aparecer nas obras, e de uso de marcas, obras e locações de terceiros que indicar, respondendo por elas.

7.2. Quando a CONTRATADA contratar elenco, locução ou locação, as autorizações seguem os usos, o território e o prazo da cláusula 6.

## 8. Uso em portfólio

8.1. {{portfolio}}

8.2. A CONTRATANTE pode mudar essa escolha a qualquer tempo, por escrito, valendo dali em diante.

## 9. Confidencialidade

9.1. As partes manterão em sigilo as informações não públicas que receberem uma da outra por causa deste contrato, durante a vigência e por {{confidencialidade_anos}} anos depois do fim, salvo obrigação legal ou ordem judicial.

## 10. Proteção de dados (LGPD)

10.1. As partes tratarão os dados pessoais envolvidos apenas para executar este contrato e cumprir obrigações legais, conforme a Lei nº 13.709/2018 (LGPD), com medidas de segurança adequadas, e os eliminarão quando não forem mais necessários, salvo guarda exigida por lei.

10.2. Os dados do aceite eletrônico (nome, documento, data, hora, endereço IP protegido por hash e navegador) são guardados como prova da contratação.

## 11. Cancelamento e remarcação

11.1. Se a CONTRATANTE cancelar com pelo menos {{cancelamento_antecedencia_dias}} dias de antecedência da primeira diária, pagará multa de {{multa_cancelamento_antes_pct}}% do valor total; com menos antecedência, {{multa_cancelamento_depois_pct}}%. Em ambos os casos, também pagará os serviços já prestados e as despesas já feitas.

11.2. A CONTRATANTE pode remarcar sem custo até {{remarcacao_antecedencia_dias}} dias antes da diária, uma vez, sujeito à agenda da CONTRATADA. Depois disso, a remarcação custa {{remarcacao_taxa_pct}}% do valor da diária, além das despesas já feitas.

11.3. Se a CONTRATADA cancelar sem justa causa, devolverá os valores recebidos pelos serviços não prestados.

## 12. Caso fortuito e força maior

12.1. Nenhuma parte responde por atraso ou falha causados por caso fortuito ou força maior (art. 393 do Código Civil), como chuva ou condição climática que impeça a captação externa, interdição ou indisponibilidade de locação, falta de energia ou doença súbita da equipe.

12.2. Nesses casos, as partes remarcarão a atividade em comum acordo, sem multa, e as despesas já feitas serão divididas ou pagas conforme combinarem por escrito.

## 13. Responsabilidades e limitação

13.1. A CONTRATADA responde pela execução técnica dos serviços com cuidado profissional. A CONTRATANTE responde pela veracidade do que fornecer (informações, textos, marcas e materiais) e pelo uso que fizer das obras.

13.2. A responsabilidade de cada parte por perdas e danos fica limitada ao valor total deste contrato, salvo dolo ou culpa grave.

## 14. Foro

14.1. Fica eleito o foro da comarca de {{foro_cidade}} para resolver questões deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja.

## 15. Disposições gerais

15.1. Este contrato e a proposta {{proposta_codigo}} formam o acordo inteiro entre as partes. Em conflito, vale este contrato.

15.2. Mudanças só valem por escrito, inclusive por e-mail ou pelo Maestro.

15.3. A tolerância de uma parte não é renúncia de direito.

15.4. As partes reconhecem como válido o aceite eletrônico deste contrato, com o registro de nome, documento, data, hora e o código de integridade (hash) do texto aceito.

## 16. Assinaturas

CONTRATADA: {{contratada_nome}}, CNPJ {{contratada_cnpj}}.

CONTRATANTE: {{contratante_nome}}, CPF/CNPJ {{contratante_documento}}, aceite eletrônico em {{data_aceite}}.
`;

export const PORTFOLIO_SIM =
  "A CONTRATANTE autoriza a CONTRATADA a usar trechos e imagens das obras em seu portfólio, site e redes sociais, com crédito, sem divulgar informação confidencial.";
export const PORTFOLIO_NAO = "A CONTRATANTE não autoriza o uso das obras no portfólio, no site ou nas redes sociais da CONTRATADA.";

export const VAZIO = "[a preencher]";

/** As {{chaves}} do texto, na ordem, sem repetir. */
export function variaveisDoTexto(texto: string): string[] {
  return [...new Set([...texto.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/g)].map((m) => m[1]))];
}

/** Confere o texto do modelo: tamanho, ao menos um título e só variáveis conhecidas. */
export function validarTexto(texto: string): { ok: true; texto: string } | { ok: false; mensagem: string } {
  const t = texto.replace(/\r\n?/g, "\n").trim();
  if (t.length < 20) return { ok: false, mensagem: "Escreva o contrato." };
  if (t.length > TEXTO_MAX) return { ok: false, mensagem: `Até ${TEXTO_MAX.toLocaleString("pt-BR")} caracteres.` };
  const desconhecidas = variaveisDoTexto(t).filter((v) => !CHAVES.has(v));
  if (desconhecidas.length) return { ok: false, mensagem: `Variável desconhecida: ${desconhecidas.map((v) => `{{${v}}}`).join(", ")}.` };
  if (/\{\{(?!\s*[a-z0-9_]+\s*\}\})/.test(t)) return { ok: false, mensagem: "Há uma variável sem fechar: use {{nome}}." };
  return { ok: true, texto: t };
}

/** Confere os números e textos do contrato (o que falta vira o padrão). */
export function validarConfig(v: Record<string, unknown>): { ok: true; config: ConfigContrato } | { ok: false; erros: Record<string, string> } {
  const erros: Record<string, string> = {};
  const out: ConfigContrato = {};
  for (const c of CAMPOS_CONFIG) {
    const bruto = v[c.chave];
    if (c.tipo === "numero") {
      const n = bruto === undefined || bruto === "" ? Number(c.padrao) : Number(String(bruto).replace(",", "."));
      if (!Number.isFinite(n) || n < (c.min ?? 0) || n > (c.max ?? 1e9)) erros[c.chave] = `De ${c.min ?? 0} a ${c.max}.`;
      else out[c.chave] = Math.round(n * 100) / 100;
    } else {
      const s = String(bruto ?? c.padrao)
        .replace(/\s+/g, " ")
        .trim();
      if (s.length > 200) erros[c.chave] = "Até 200 caracteres.";
      else out[c.chave] = s;
    }
  }
  return Object.keys(erros).length ? { ok: false, erros } : { ok: true, config: out };
}

/** Lê uma config guardada (jsonb) com os padrões no que faltar. */
export function lerConfig(v: unknown): ConfigContrato {
  const r = validarConfig(v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  if (r.ok) return r.config;
  const base: ConfigContrato = { ...CONFIG_PADRAO };
  for (const c of CAMPOS_CONFIG) {
    const x = (v as Record<string, unknown>)?.[c.chave];
    if (c.tipo === "numero" && typeof x === "number" && Number.isFinite(x)) base[c.chave] = x;
    if (c.tipo === "texto" && typeof x === "string") base[c.chave] = x.slice(0, 200);
  }
  return base;
}

/* ───────────── documento (CPF/CNPJ) ───────────── */

const digitos = (s: string) => s.replace(/\D/g, "");

function cpfValido(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const dv = ((s * 10) % 11) % 10;
    if (dv !== Number(d[n])) return false;
  }
  return true;
}

function cnpjValido(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (const n of [12, 13]) {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * pesos[i + 13 - n];
    const r = s % 11;
    if ((r < 2 ? 0 : 11 - r) !== Number(d[n])) return false;
  }
  return true;
}

/** CPF (11) ou CNPJ (14) com os dígitos verificadores certos. Devolve só os dígitos. */
export function conferirDocumento(v: unknown): { ok: true; digitos: string; tipo: "cpf" | "cnpj" } | { ok: false } {
  const d = digitos(typeof v === "string" ? v : "");
  if (cpfValido(d)) return { ok: true, digitos: d, tipo: "cpf" };
  if (cnpjValido(d)) return { ok: true, digitos: d, tipo: "cnpj" };
  return { ok: false };
}

export function formatarDocumento(d: string): string {
  const x = digitos(d);
  if (x.length === 11) return `${x.slice(0, 3)}.${x.slice(3, 6)}.${x.slice(6, 9)}-${x.slice(9)}`;
  if (x.length === 14) return `${x.slice(0, 2)}.${x.slice(2, 5)}.${x.slice(5, 8)}/${x.slice(8, 12)}-${x.slice(12)}`;
  return d;
}

/* ───────────── preencher e desenhar ───────────── */

export type Valores = Record<string, string | string[] | number | null | undefined>;

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function texto(v: Valores[string]): string {
  if (v == null || v === "") return VAZIO;
  if (Array.isArray(v)) return v.length ? v.join("; ") : VAZIO;
  if (typeof v === "number") return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return String(v).replace(/\s+/g, " ").trim() || VAZIO;
}

/** Linha com só uma variável de lista vira itens. Já escapado. */
function linhasDeLista(v: Valores[string]): string[] {
  if (Array.isArray(v) && v.length) return v.map((x) => escapar(String(x)));
  return [escapar(texto(v))];
}

/** Troca as variáveis da linha (texto já escapado + **negrito**). */
function linha(l: string, valores: Valores): string {
  const partes = l.split(/(\{\{\s*[a-z0-9_]+\s*\}\})/g).map((p) => {
    const m = /^\{\{\s*([a-z0-9_]+)\s*\}\}$/.exec(p);
    if (!m) return escapar(p);
    const valor = escapar(texto(valores[m[1]]));
    return valor === VAZIO ? `<span class="ct-vazio">${valor}</span>` : `<span class="ct-var">${valor}</span>`;
  });
  return partes.join("").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

/**
 * O contrato preenchido em HTML (fragmento, sem script nem atributo vindo do texto): o mesmo na prévia, na página do
 * cliente e no registro do aceite (o hash é deste HTML).
 */
export function desenharContrato(modelo: string, valores: Valores): string {
  const blocos = modelo.replace(/\r\n?/g, "\n").split(/\n\s*\n/);
  const out: string[] = [];
  for (const b of blocos) {
    const ls = b
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    if (!ls.length) continue;
    const lista = /^\{\{\s*([a-z0-9_]+)\s*\}\}$/.exec(ls[0]);
    if (ls.length === 1 && lista && LISTAS.has(lista[1])) {
      out.push(
        `<ul>${linhasDeLista(valores[lista[1]])
          .map((i) => `<li>${i}</li>`)
          .join("")}</ul>`,
      );
      continue;
    }
    if (ls.every((x) => x.startsWith("- "))) {
      out.push(`<ul>${ls.map((x) => `<li>${linha(x.slice(2), valores)}</li>`).join("")}</ul>`);
      continue;
    }
    if (ls[0].startsWith("# ")) {
      out.push(`<h2 class="ct-titulo">${linha(ls[0].slice(2), valores)}</h2>`);
      if (ls.length > 1)
        out.push(
          `<p>${ls
            .slice(1)
            .map((x) => linha(x, valores))
            .join("<br>")}</p>`,
        );
      continue;
    }
    if (ls[0].startsWith("## ")) {
      out.push(`<h3>${linha(ls[0].slice(3), valores)}</h3>`);
      if (ls.length > 1)
        out.push(
          `<p>${ls
            .slice(1)
            .map((x) => linha(x, valores))
            .join("<br>")}</p>`,
        );
      continue;
    }
    out.push(`<p>${ls.map((x) => linha(x, valores)).join("<br>")}</p>`);
  }
  return `<article class="ct-texto">${out.join("")}</article>`;
}

/** O que ainda falta preencher (variáveis usadas e vazias). */
export function faltando(modelo: string, valores: Valores): string[] {
  return variaveisDoTexto(modelo).filter((k) => texto(valores[k]) === VAZIO);
}

/* ───────────── valores a partir da proposta ───────────── */

export type DadosDoContrato = {
  contratada: { nome: string; razao: string | null; cnpj: string | null; endereco: string | null; email: string | null; telefone: string | null };
  sede: { cidade: string | null; uf: string | null } | null;
  proposta: {
    codigo: string;
    titulo: string;
    emissao: string;
    periodo: string | null;
    escopo: string | null;
    pagamento: string | null;
    totalCents: number;
    itens: { descricao: string; quantidade: number; unidade: string | null; totalCents: number }[];
    parcelas: { rotulo: string; valorCents: number; vencimento: string }[];
  };
  config: ConfigContrato;
  /** O que o cliente informa no aceite (vazio na prévia). */
  contratante: { nome: string; documento: string; endereco: string; portfolio: boolean };
  /** yyyy-mm-dd do aceite (ou de hoje, na prévia). */
  dataAceite: string;
};

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);
const qtd = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export const NOMES_DAS_UNIDADES: Record<string, [string, string]> = {
  diaria: ["diária", "diárias"],
  video: ["vídeo", "vídeos"],
  hora: ["hora", "horas"],
  unidade: ["unidade", "unidades"],
  pacote: ["pacote", "pacotes"],
  trecho: ["trecho", "trechos"],
  km: ["km", "km"],
  projeto: ["projeto", "projetos"],
};

/** As parcelas andam para a frente se o aceite chega depois do primeiro vencimento (a mesma conta do banco, 0012). */
export function parcelasNoAceite<T extends { vencimento: string }>(parcelas: T[], hoje: string): T[] {
  if (!parcelas.length) return parcelas;
  const dia = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const desloca = Math.max(0, Math.round((dia(hoje) - dia(parcelas[0].vencimento)) / 86_400_000));
  if (!desloca) return parcelas;
  return parcelas.map((p) => ({ ...p, vencimento: new Date(dia(p.vencimento) + desloca * 86_400_000).toISOString().slice(0, 10) }));
}

export function valoresDoContrato(d: DadosDoContrato): Valores {
  const c = d.contratada;
  const contato = [c.email, c.telefone].filter(Boolean).join(" · ");
  const foro = String(d.config.foro_cidade ?? "").trim() || [d.sede?.cidade, d.sede?.uf].filter(Boolean).join("/") || null;
  const parcelas = parcelasNoAceite(d.proposta.parcelas, d.dataAceite);
  return {
    contratada_nome: c.razao || c.nome,
    contratada_cnpj: c.cnpj,
    contratada_endereco: c.endereco,
    contratada_contato: contato || null,
    contratante_nome: d.contratante.nome || null,
    contratante_documento: d.contratante.documento ? formatarDocumento(d.contratante.documento) : null,
    contratante_endereco: d.contratante.endereco || null,
    proposta_codigo: d.proposta.codigo,
    proposta_titulo: d.proposta.titulo,
    proposta_data: dataBr(d.proposta.emissao),
    periodo: d.proposta.periodo || "a combinar entre as partes",
    escopo: d.proposta.escopo || "conforme os entregáveis abaixo.",
    entregaveis: d.proposta.itens.map((i) => {
      const u = i.unidade ? NOMES_DAS_UNIDADES[i.unidade] : null;
      const quanto = u ? `${qtd(i.quantidade)} ${i.quantidade === 1 ? u[0] : u[1]}` : `${qtd(i.quantidade)} ×`;
      return `${i.descricao} (${quanto})`;
    }),
    valor_total: brl(d.proposta.totalCents),
    parcelas: parcelas.length
      ? parcelas.map((p, i) => `${i + 1}ª parcela (${p.rotulo}): ${brl(p.valorCents)}, com vencimento em ${dataBr(p.vencimento)}`)
      : [`parcela única de ${brl(d.proposta.totalCents)}`],
    forma_pagamento: d.proposta.pagamento || "PIX ou transferência para a conta indicada pela CONTRATADA.",
    ...Object.fromEntries(CAMPOS_CONFIG.filter((k) => k.chave !== "foro_cidade").map((k) => [k.chave, d.config[k.chave] ?? k.padrao])),
    foro_cidade: foro,
    portfolio: d.contratante.portfolio ? PORTFOLIO_SIM : PORTFOLIO_NAO,
    data_aceite: dataBr(d.dataAceite),
  };
}

/** Dados de exemplo da prévia em Ajustes → Contrato. */
export function dadosDeExemplo(config: ConfigContrato, contratada: DadosDoContrato["contratada"], hoje: string): DadosDoContrato {
  return {
    contratada,
    sede: null,
    proposta: {
      codigo: "2026-001 v1",
      titulo: "Filme institucional",
      emissao: hoje,
      periodo: "2 diárias, 10 e 11 de dezembro",
      escopo: "roteiro, captação em duas diárias e edição de um filme de até 3 minutos e três cortes para redes sociais.",
      pagamento: null,
      totalCents: 1_850_000,
      itens: [
        { descricao: "Diária de captação", quantidade: 2, unidade: "diaria", totalCents: 900_000 },
        { descricao: "Edição do filme principal", quantidade: 1, unidade: "video", totalCents: 650_000 },
        { descricao: "Cortes para redes sociais", quantidade: 3, unidade: "video", totalCents: 300_000 },
      ],
      parcelas: [
        { rotulo: "entrada", valorCents: 925_000, vencimento: hoje },
        { rotulo: "na entrega", valorCents: 925_000, vencimento: hoje },
      ],
    },
    config,
    contratante: { nome: "Cliente de exemplo", documento: "", endereco: "", portfolio: true },
    dataAceite: hoje,
  };
}
