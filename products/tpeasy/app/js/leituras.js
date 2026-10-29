// Registro de leituras (contrato tpeasy.leituras/1, docs/integration-contracts/tpeasy-leituras.md): cada leitura no TP
// vira uma linha com a hora do aparelho no bip e os blocos ("# bloco") que passaram, para o Synquei e o AEON darem o
// nome do bloco a cada take. Só tempos e nomes: nada de áudio, conta ou aparelho.
// Sem DOM e sem dependências: o TP chama, e os testes do app e do HUB (schema) geram linhas com este mesmo código.

export const CONTRATO = "tpeasy.leituras/1";
export const MAX_LEITURAS = 1000;
/** Leitura mais curta que isso foi toque sem querer: não entra no registro. */
export const MIN_MS = 1500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const novoId = () => {
  const b = new Uint8Array(9);
  globalThis.crypto.getRandomValues(b);
  return "l" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
};
const corta = (s, n) => String(s ?? "").slice(0, n);

/** Data e hora do aparelho com o fuso (ISO 8601 com deslocamento), ex.: 2026-10-29T14:03:12.345-03:00. */
export function isoLocal(ms, fusoMin) {
  const d = new Date(ms + fusoMin * 60000);
  const sinal = fusoMin < 0 ? "-" : "+";
  const a = Math.abs(fusoMin);
  return d.toISOString().slice(0, 23) + `${sinal}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

/** O roteiro como vai na linha: o projeto só quando o roteiro veio da Absolute ZRO (id "zro-<projeto>"). */
export function roteiroDaLeitura(s) {
  const projeto = typeof s.id === "string" && s.id.startsWith("zro-") && UUID.test(s.id.slice(4)) ? s.id.slice(4).toLowerCase() : null;
  const versao = projeto && s.zro && Number.isInteger(s.zro.versao) && s.zro.versao > 0 ? s.zro.versao : null;
  return { id: corta(s.id, 80), titulo: corta(s.title || "Sem título", 200), projeto, versao };
}

/**
 * Começa uma leitura no instante em que o texto começa a andar (o bip, quando ligado). `bloco` é onde a leitura
 * começa: { i, nome } do "# bloco" na linha de leitura, ou { i: null, nome: null } antes do primeiro.
 */
export function comecar({ roteiro, agora = Date.now(), fusoMin = -new Date(agora).getTimezoneOffset(), bip = false, contagem = 0, voz = false, bloco = null }) {
  return {
    id: novoId(),
    roteiro: roteiroDaLeitura(roteiro),
    t0: agora,
    fusoMin,
    bip: !!bip,
    contagem: Math.max(0, Math.min(10, Math.round(contagem) || 0)),
    voz: !!voz,
    blocos: [{ i: bloco ? bloco.i : null, nome: bloco && bloco.nome != null ? corta(bloco.nome, 120) : null, em_ms: 0 }],
  };
}

/** O texto chegou noutro bloco (rolando, pulando ou voltando). Repetir o mesmo bloco não cria linha nova. */
export function passarBloco(l, bloco, agora = Date.now()) {
  const ult = l.blocos[l.blocos.length - 1];
  const i = bloco ? bloco.i : null;
  if (ult && ult.i === i) return l;
  if (l.blocos.length >= 500) return l;
  l.blocos.push({ i, nome: bloco && bloco.nome != null ? corta(bloco.nome, 120) : null, em_ms: Math.max(0, Math.round(agora - l.t0)) });
  return l;
}

/** A voz foi ligada durante a leitura. */
export const usouVoz = (l) => ((l.voz = true), l);

/** Fecha a leitura e devolve a linha do contrato (ou null se foi curta demais). */
export function terminar(l, { agora = Date.now(), completo = false } = {}) {
  const duracao = Math.max(0, Math.round(agora - l.t0));
  if (duracao < MIN_MS) return null;
  return {
    contrato: CONTRATO,
    id: l.id,
    roteiro: l.roteiro,
    inicio: isoLocal(l.t0, l.fusoMin),
    fim: isoLocal(l.t0 + duracao, l.fusoMin),
    fuso_min: l.fusoMin,
    duracao_ms: duracao,
    bip: l.bip,
    contagem_s: l.contagem,
    voz: l.voz,
    completo: !!completo,
    blocos: l.blocos.filter((b) => b.em_ms <= duracao),
  };
}

/** Guarda a linha nova no fim e mantém só as últimas MAX_LEITURAS. */
export function acrescentar(lista, linha) {
  const out = Array.isArray(lista) ? lista.concat(linha) : [linha];
  return out.length > MAX_LEITURAS ? out.slice(-MAX_LEITURAS) : out;
}

/** Arquivo JSONL (uma leitura por linha), na ordem em que aconteceram. */
export function paraJsonl(lista) {
  return lista.map((l) => JSON.stringify(l)).join("\n") + (lista.length ? "\n" : "");
}

/** Nome do arquivo: TPeasy-leituras-AAAA-MM-DD.jsonl (data do aparelho). */
export function nomeDoArquivo(agora = Date.now(), fusoMin = -new Date(agora).getTimezoneOffset()) {
  return `TPeasy-leituras-${isoLocal(agora, fusoMin).slice(0, 10)}.jsonl`;
}
