// Roteiros do Maestro na biblioteca (Criação F8; contrato em docs/integration-contracts/maestro-tpeasy.md na raiz).
// Puro e sem dependências (tests/entregas.test.mjs): recebe a lista de roteiros do aparelho e o que chegou da caixa de
// entrada da Absolute ZRO e devolve a lista nova. Regras:
// - O id do roteiro é o `item` da entrega (`maestro-<roteiro>-<pessoa|todas>`, o mesmo do backup da F3): cada versão
//   nova ATUALIZA o mesmo roteiro, marcado "Do Maestro · vN" (`origem`).
// - Nunca escreve por cima do que a pessoa mexeu: se o texto mudou depois que chegou (a `marca` não bate), a versão nova
//   vira uma CÓPIA (`<item>-v<N>`, "· vN" no título) e o roteiro dela fica como está.
// - A mesma entrega duas vezes (outro aparelho, a mesma leitura) não muda nada: `vistos[id]` guarda o último
//   `atualizada_em` visto. Um reenvio (atualizada_em novo) traz de volta o que a pessoa apagou.

/** Marca curta do texto (FNV-1a de 32 bits): o texto ainda é o que veio do Maestro? */
export function marcaDe(texto) {
  let h = 0x811c9dc5;
  const s = String(texto ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const ITEM = /^maestro-[A-Za-z0-9._-]{1,100}$/;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Só o que tem a forma do contrato (`zro.app-entrega.recebidas.v1`); o resto é ignorado. */
export function entregaValida(e) {
  return (
    !!e &&
    typeof e === "object" &&
    ID.test(e.id) &&
    e.origem === "maestro" &&
    e.tipo === "roteiro" &&
    ITEM.test(e.item) &&
    Number.isInteger(e.versao) &&
    e.versao >= 1 &&
    typeof e.titulo === "string" &&
    !!e.titulo.trim() &&
    typeof e.corpo === "string" &&
    !!e.corpo.trim() &&
    e.corpo.length <= 200000 &&
    (e.link === null || (typeof e.link === "string" && /^https?:\/\/[^\s"<>]+$/.test(e.link))) &&
    typeof e.atualizada_em === "string"
  );
}

/** Mexeu no texto depois que chegou? Roteiro sem `origem` (veio do backup da F3) só é "o mesmo" se o texto for igual. */
const editado = (s, corpo) => (s.origem && s.origem.app === "maestro" ? marcaDe(s.body) !== s.origem.marca : s.body !== corpo);

/**
 * @param {object[]} scripts os roteiros do aparelho (com lápides `deleted`)
 * @param {object[]} entregas o que chegou (mais antigo primeiro)
 * @param {Record<string,string>} vistos entrega → último `atualizada_em` visto
 * @returns {{ scripts: object[], vistos: Record<string,string>, ids: string[], novos: number, atualizados: number, copias: number, mudou: boolean }}
 */
export function aplicarEntregas(scripts, entregas, vistos = {}, agora = Date.now()) {
  const lista = scripts.map((s) => ({ ...s }));
  const vis = { ...vistos };
  const ids = [];
  let novos = 0;
  let atualizados = 0;
  let copias = 0;
  const achar = (id) => lista.find((s) => s.id === id);
  for (const e of (Array.isArray(entregas) ? entregas : []).filter(entregaValida)) {
    ids.push(e.id);
    if (vis[e.id] === e.atualizada_em) continue;
    vis[e.id] = e.atualizada_em;
    const origem = { app: "maestro", item: e.item, versao: e.versao, link: e.link, de: typeof e.de === "string" ? e.de.slice(0, 120) : "", entrega: e.id, marca: marcaDe(e.corpo), em: agora };
    const campos = { title: e.titulo.slice(0, 300), body: e.corpo, target: Math.max(0, Math.min(3600, Math.round(e.alvo_seg || 0))), origem, updated: agora, pos: 0 };
    const atual = achar(e.item);
    if (!atual || atual.deleted) {
      // novo, ou apagado aqui e mandado de novo do Maestro (só chega aqui com entrega nova ou reenvio)
      if (atual) Object.assign(atual, campos, { deleted: false });
      else lista.push({ id: e.item, fav: false, ...campos });
      novos++;
      continue;
    }
    if (atual.body === e.corpo && atual.origem && atual.origem.versao === e.versao) continue;
    if (!editado(atual, e.corpo)) {
      Object.assign(atual, { ...campos, fav: atual.fav, readAt: atual.readAt });
      atualizados++;
      continue;
    }
    // a pessoa mexeu: a versão nova vai numa cópia, e o roteiro dela fica como está
    const idCopia = `${e.item}-v${e.versao}`.slice(0, 120);
    const copia = achar(idCopia);
    if (copia && !copia.deleted && copia.body === e.corpo) continue;
    const comVersao = { ...campos, title: `${e.titulo} · v${e.versao}`.slice(0, 300) };
    if (copia && !copia.deleted && editado(copia, e.corpo)) continue;
    if (copia) Object.assign(copia, comVersao, { deleted: false });
    else lista.push({ id: idCopia, fav: false, ...comVersao });
    copias++;
  }
  return { scripts: lista, vistos: vis, ids, novos, atualizados, copias, mudou: novos + atualizados + copias > 0 };
}

/** O que avisar ("Roteiro do Maestro chegou", "Versão nova do Maestro", "2 roteiros do Maestro"). Vazio = nada. */
export function avisoDaChegada(r) {
  const n = r.novos + r.atualizados + r.copias;
  if (!n) return "";
  if (n > 1) return `${n} roteiros do Maestro`;
  if (r.novos) return "Roteiro do Maestro chegou";
  return r.copias ? "Versão nova do Maestro, numa cópia" : "Versão nova do Maestro";
}

/** Os vistos que ainda importam (a caixa guarda 30 dias): tira o que passou de 31. */
export function podarVistos(vistos, agora = Date.now()) {
  const limite = agora - 31 * 86400000;
  return Object.fromEntries(Object.entries(vistos || {}).filter(([, v]) => Date.parse(v) > limite));
}

/** Próximo `desde`: o mais novo visto, com 5 min de folga (o que gravar no meio da leitura não se perde). */
export function proximoDesde(entregas, anterior = null) {
  const tempos = (Array.isArray(entregas) ? entregas : []).map((e) => Date.parse(e && e.atualizada_em)).filter(Number.isFinite);
  if (!tempos.length) return anterior;
  return new Date(Math.max(...tempos) - 5 * 60000).toISOString();
}
