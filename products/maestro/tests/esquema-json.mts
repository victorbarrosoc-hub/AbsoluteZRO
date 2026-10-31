/**
 * Um conferidor pequeno de JSON Schema (o subconjunto que `z.toJSONSchema` gera para os contratos de
 * packages/media-contracts: type, const, enum, anyOf, oneOf, properties, required, additionalProperties, items,
 * min/maxItems, min/maxLength, pattern, minimum, maximum, exclusiveMinimum/Maximum). O Maestro não depende do zod nem
 * de um validador: os testes e o e2e conferem o arquivo que sai contra o schema PUBLICADO em
 * docs/integration-contracts/schemas (o mesmo que a raiz confere contra o código, `npm run contracts:export`).
 * Palavra-chave fora desse subconjunto faz o teste falhar (nada passa por não ser entendido). Só para testes.
 */
import { readFileSync } from "node:fs";

type Esquema = Record<string, unknown>;
const IGNORADAS = new Set(["$schema", "$id", "title", "description", "format", "default"]);
const CONHECIDAS = new Set([
  "type",
  "const",
  "enum",
  "anyOf",
  "oneOf",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "pattern",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
]);

const tipoDe = (v: unknown): string =>
  v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v;

/** Lista de erros ("caminho: o quê"); vazia = confere. */
export function conferirEsquema(esquema: Esquema, valor: unknown, caminho = "$"): string[] {
  const erros: string[] = [];
  for (const k of Object.keys(esquema)) if (!IGNORADAS.has(k) && !CONHECIDAS.has(k)) erros.push(`${caminho}: palavra-chave não suportada "${k}"`);
  const e = esquema as Record<string, unknown>;
  if (e.type !== undefined) {
    const tipos = Array.isArray(e.type) ? (e.type as string[]) : [e.type as string];
    const t = tipoDe(valor);
    if (!tipos.some((x) => x === t || (x === "number" && t === "integer"))) return [...erros, `${caminho}: esperava ${tipos.join("|")}, veio ${t}`];
  }
  if ("const" in e && JSON.stringify(e.const) !== JSON.stringify(valor)) erros.push(`${caminho}: esperava ${JSON.stringify(e.const)}`);
  if (Array.isArray(e.enum) && !e.enum.some((x) => JSON.stringify(x) === JSON.stringify(valor))) erros.push(`${caminho}: fora da lista`);
  if (Array.isArray(e.anyOf) && !(e.anyOf as Esquema[]).some((s) => conferirEsquema(s, valor, caminho).length === 0))
    erros.push(`${caminho}: nenhuma das opções (anyOf)`);
  if (Array.isArray(e.oneOf) && (e.oneOf as Esquema[]).filter((s) => conferirEsquema(s, valor, caminho).length === 0).length !== 1) {
    const melhores = (e.oneOf as Esquema[]).map((s) => conferirEsquema(s, valor, caminho)).sort((a, b) => a.length - b.length)[0] ?? [];
    erros.push(`${caminho}: não é exatamente uma das opções (oneOf)`, ...melhores);
  }
  if (typeof valor === "string") {
    const n = [...valor].length;
    if (typeof e.minLength === "number" && n < e.minLength) erros.push(`${caminho}: menor que ${e.minLength}`);
    if (typeof e.maxLength === "number" && valor.length > e.maxLength) erros.push(`${caminho}: maior que ${e.maxLength}`);
    if (typeof e.pattern === "string" && !new RegExp(e.pattern).test(valor)) erros.push(`${caminho}: não bate com ${e.pattern}`);
  }
  if (typeof valor === "number") {
    if (typeof e.minimum === "number" && valor < e.minimum) erros.push(`${caminho}: menor que ${e.minimum}`);
    if (typeof e.maximum === "number" && valor > e.maximum) erros.push(`${caminho}: maior que ${e.maximum}`);
    if (typeof e.exclusiveMinimum === "number" && valor <= e.exclusiveMinimum) erros.push(`${caminho}: precisa passar de ${e.exclusiveMinimum}`);
    if (typeof e.exclusiveMaximum === "number" && valor >= e.exclusiveMaximum) erros.push(`${caminho}: precisa ficar abaixo de ${e.exclusiveMaximum}`);
  }
  if (Array.isArray(valor)) {
    if (typeof e.minItems === "number" && valor.length < e.minItems) erros.push(`${caminho}: menos de ${e.minItems} itens`);
    if (typeof e.maxItems === "number" && valor.length > e.maxItems) erros.push(`${caminho}: mais de ${e.maxItems} itens`);
    if (e.items && typeof e.items === "object") valor.forEach((x, i) => erros.push(...conferirEsquema(e.items as Esquema, x, `${caminho}[${i}]`)));
  }
  if (valor && typeof valor === "object" && !Array.isArray(valor)) {
    const o = valor as Record<string, unknown>;
    const props = (e.properties ?? {}) as Record<string, Esquema>;
    for (const r of (e.required as string[] | undefined) ?? []) if (!(r in o)) erros.push(`${caminho}: falta "${r}"`);
    for (const [k, v] of Object.entries(o)) {
      if (props[k]) erros.push(...conferirEsquema(props[k], v, `${caminho}.${k}`));
      else if (e.additionalProperties === false) erros.push(`${caminho}: campo a mais "${k}"`);
      else if (e.additionalProperties && typeof e.additionalProperties === "object")
        erros.push(...conferirEsquema(e.additionalProperties as Esquema, v, `${caminho}.${k}`));
    }
  }
  return erros;
}

/** O schema publicado de um contrato (`maestro.roteiro.v1`, …) em docs/integration-contracts/schemas. */
export function esquemaPublicado(nome: string): Esquema {
  return JSON.parse(readFileSync(new URL(`../../../docs/integration-contracts/schemas/${nome}.schema.json`, import.meta.url), "utf8")) as Esquema;
}
