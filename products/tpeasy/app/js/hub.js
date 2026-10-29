// "Abrir no TPeasy" (docs/integration-contracts/tpeasy-leituras.md §1): o HUB (e o Maestro) manda para
// /app/#hub/<projeto> passando pelo login do app; aqui o roteiro mais novo do projeto chega por /api/zro/roteiro e fica
// no aparelho como "zro-<projeto>", pronto para ler. A Absolute ZRO escreve, o TPeasy lê.
// A parte sem DOM (projetoDoHash, mesclarDoHub) é testada em tests/hub.test.mjs.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** #hub/<uuid> → o projeto; qualquer outro endereço → null. */
export function projetoDoHash(hash) {
  const m = /^#hub\/([^/?#]+)$/.exec(String(hash || ""));
  return m && UUID.test(m[1]) ? m[1].toLowerCase() : null;
}

/** Marca curta do texto, para saber se a pessoa mudou o roteiro no aparelho depois da última versão. */
export function marcaDoTexto(t) {
  let h = 5381;
  const s = String(t ?? "");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

/**
 * Junta o roteiro que veio da Absolute ZRO (resposta de /api/zro/roteiro) na lista do aparelho.
 * - Não existe (ou foi apagado): entra.
 * - Mesma versão: nada muda.
 * - Versão nova: o texto é trocado e a leitura volta ao começo. Se a pessoa mexeu no texto no aparelho desde a última
 *   versão, essa mudança vira uma cópia antes ("(do aparelho)"): nada se perde.
 * Devolve { lista, id, mudou, copia }.
 */
export function mesclarDoHub(lista, r, { agora = Date.now(), novoId }) {
  const rot = r.roteiro;
  const zro = { projeto: r.projeto, versao: r.versao ?? null, documento: r.documento ?? null, marca: marcaDoTexto(rot.body) };
  const out = lista.slice();
  const k = out.findIndex((s) => s.id === rot.id);
  const cur = k >= 0 ? out[k] : null;
  const novo = { id: rot.id, title: rot.title, body: rot.body, updated: agora, pos: 0, fav: cur && !cur.deleted ? !!cur.fav : false, target: cur && !cur.deleted ? cur.target || 0 : 0, zro };
  if (!cur || cur.deleted) {
    if (k >= 0) out[k] = novo;
    else out.push(novo);
    return { lista: out, id: rot.id, mudou: true, copia: null };
  }
  const mesmaVersao = cur.zro && cur.zro.documento && cur.zro.documento === zro.documento;
  if (mesmaVersao || cur.body === rot.body) {
    if (!mesmaVersao) out[k] = { ...cur, zro };
    return { lista: out, id: rot.id, mudou: false, copia: null };
  }
  const mexeuAqui = cur.body.trim() && (!cur.zro || cur.zro.marca !== marcaDoTexto(cur.body));
  let copia = null;
  if (mexeuAqui) {
    copia = { ...cur, id: novoId(), title: `${cur.title || "Sem título"} (do aparelho)`, updated: agora };
    delete copia.zro;
    out.push(copia);
  }
  out[k] = novo;
  return { lista: out, id: rot.id, mudou: true, copia: copia && copia.id };
}

/** Busca o roteiro do projeto e abre no editor. `ctx` traz o que vem do resto do app (sem import circular). */
export async function abrirDoHub(projeto, ctx) {
  const { toast, allScripts, replaceScripts, uid, openEditor } = ctx;
  const TENTOU = "tpeasy.hub.entrou";
  toast("Abrindo roteiro…", 1400);
  let r;
  try {
    r = await fetch(`/api/zro/roteiro?projeto=${projeto}`, { headers: { Accept: "application/json" }, credentials: "same-origin" });
  } catch {
    return toast("Sem internet para buscar o roteiro.", 2600);
  }
  const corpo = await r.json().catch(() => null);
  if (r.status === 401 && corpo && corpo.reconectar) {
    // entra de novo uma vez (o login novo já pede o escopo do roteiro) e volta para este mesmo projeto
    let jaTentou = null;
    try {
      jaTentou = sessionStorage.getItem(TENTOU);
      sessionStorage.setItem(TENTOU, projeto);
    } catch {}
    if (jaTentou !== projeto) {
      location.href = `/api/zro/entrar?volta=${encodeURIComponent(`/app/#hub/${projeto}`)}`;
      return;
    }
  }
  try {
    sessionStorage.removeItem(TENTOU);
  } catch {}
  if (!r.ok || !corpo || !corpo.roteiro) return toast((corpo && corpo.mensagem) || "Não deu para abrir o roteiro.", 2800);
  const m = mesclarDoHub(allScripts(), corpo, { agora: Date.now(), novoId: uid });
  replaceScripts(m.lista);
  openEditor(m.id);
  const v = corpo.versao ? `Versão ${corpo.versao}` : "Roteiro";
  toast(m.copia ? `${v}. Sua mudança virou cópia.` : m.mudou ? `${v} no aparelho` : `${v}, já estava aqui`, 2400);
}
