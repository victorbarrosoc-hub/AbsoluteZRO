/**
 * Conferidor de JSON Schema (o pedaço que os contratos exportados usam:
 * type, const, enum, pattern, minLength/maxLength, minimum/maximum,
 * maxItems, items, required, additionalProperties:false, anyOf).
 * Os esquemas vêm de docs/integration-contracts/schemas, que o
 * `npm run contracts:export` da raiz gera a partir do zod de
 * packages/media-contracts — o mesmo contrato, sem pôr o zod no Carro.
 * Palavra-chave que ele não conhece REPROVA (para nunca passar à toa).
 */
const CONHECIDAS = new Set(['$id', '$schema', 'title', 'description', 'type', 'const', 'enum', 'pattern', 'format', 'minLength', 'maxLength', 'minimum', 'maximum', 'maxItems', 'items', 'properties', 'required', 'additionalProperties', 'anyOf']);

function tipoDe(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function conferir(esq, v, caminho = '$', erros = []) {
  for (const k of Object.keys(esq)) if (!CONHECIDAS.has(k)) erros.push(caminho + ': palavra-chave desconhecida ' + k);
  if (esq.anyOf) {
    if (!esq.anyOf.some(s => conferir(s, v, caminho, []).length === 0)) erros.push(caminho + ': nenhuma opção do anyOf');
    return erros;
  }
  if (esq.type) {
    const t = tipoDe(v);
    const ok = esq.type === t || (esq.type === 'number' && t === 'integer');
    if (!ok) { erros.push(caminho + ': tipo ' + t + ', esperava ' + esq.type); return erros }
  }
  if ('const' in esq && v !== esq.const) erros.push(caminho + ': diferente de ' + JSON.stringify(esq.const));
  if (esq.enum && !esq.enum.includes(v)) erros.push(caminho + ': fora do enum');
  if (typeof v === 'string') {
    if (esq.pattern && !new RegExp(esq.pattern, 'u').test(v)) erros.push(caminho + ': não casa com o padrão');
    if (esq.minLength !== undefined && [...v].length < esq.minLength) erros.push(caminho + ': curto');
    if (esq.maxLength !== undefined && [...v].length > esq.maxLength) erros.push(caminho + ': longo');
  }
  if (typeof v === 'number') {
    if (esq.minimum !== undefined && v < esq.minimum) erros.push(caminho + ': abaixo do mínimo');
    if (esq.maximum !== undefined && v > esq.maximum) erros.push(caminho + ': acima do máximo');
  }
  if (Array.isArray(v)) {
    if (esq.maxItems !== undefined && v.length > esq.maxItems) erros.push(caminho + ': itens demais');
    if (esq.items) v.forEach((x, i) => conferir(esq.items, x, caminho + '[' + i + ']', erros));
  }
  if (tipoDe(v) === 'object') {
    for (const r of esq.required || []) if (!(r in v)) erros.push(caminho + ': falta ' + r);
    const props = esq.properties || {};
    for (const [k, x] of Object.entries(v)) {
      if (props[k]) conferir(props[k], x, caminho + '.' + k, erros);
      else if (esq.additionalProperties === false) erros.push(caminho + ': campo a mais ' + k);
    }
  }
  return erros;
}

module.exports = { conferir };
