/**
 * A SINCRONIZAÇÃO DO INVENTÁRIO COM O MAESTRO (28/out) — PRONTA E DESLIGADA.
 *
 * Caminho: Carro (fila `carro_do_freela.inventario_eventos`) → HUB (evento
 * `freela.inventario.atualizado` v1, contrato `freela.inventario/1`) → Maestro
 * (docs/integration-contracts/maestro-carro-do-freela.md).
 *
 * A fila enche sozinha: o gatilho do banco grava o inventário INTEIRO da
 * pessoa a cada mudança, já no formato do evento, com a chave de idempotência
 * `freela.inventario:<sub>:<atualizado_em>`. Este arquivo só PUBLICA.
 *
 * ⚠️ DESLIGADO POR PADRÃO. A rota do HUB (`freela.inventario.atualizado` em
 * DISABLED_ROUTES de packages/integrations/src/handlers.ts) está desligada e o
 * HUB ainda não tem o endpoint que recebe este evento. Enquanto
 * CARRO_SYNC_ATIVO não for exatamente "1", `publicar()` não faz nada e os
 * eventos ficam `pendente` na fila (nada se perde: quando ligar, sai o
 * retrato mais novo). Ligar é decisão do titular, junto com a rota do HUB.
 *
 * Regras do envio (as do PRD para despacho):
 *  - só o retrato MAIS NOVO de cada pessoa vai; os pendentes mais velhos viram
 *    `substituido` (cada retrato é o inventário inteiro);
 *  - antes de mandar, o evento vira `enviando` (gravado); 2xx → `enviado`;
 *  - QUALQUER outra coisa (recusa, erro, rede, tempo) → `revisao`, com o
 *    motivo. Despacho ambíguo vai para revisão, NUNCA para nova tentativa
 *    sozinho: quem decide é gente, pela porta de sistema.
 */
const PADRAO_CAMINHO = '/api/v1/carro-do-freela/inventario';

const ligado = (env = process.env) => env.CARRO_SYNC_ATIVO === '1';

/** para onde vai (o endpoint do HUB que ainda não existe; CARRO_SYNC_URL troca o padrão) */
function destino(env = process.env) {
  const u = String(env.CARRO_SYNC_URL || '').trim();
  if (u) return u;
  const issuer = (String(env.ZRO_ISSUER || '').trim() || 'https://absolutezro.com').replace(/\/+$/, '');
  return issuer + PADRAO_CAMINHO;
}

/**
 * Publica o retrato mais novo de `sub` (ou de todos, sem `sub`).
 * `autorizacao`: o cabeçalho Authorization a usar (o Bearer da pessoa, no fluxo da API).
 * `buscar`: fetch (trocável nos testes). Devolve { desligado } ou { enviados, revisao, substituidos }.
 */
async function publicar(banco, { sub = null, autorizacao = null, env = process.env, buscar = fetch, tempoMs = 8000 } = {}) {
  if (!ligado(env)) return { desligado: true };
  if (!autorizacao) return { semAcesso: true };
  /* 1. escolhe e reserva, numa transação curta */
  const reservados = await banco.asSystem('sync:reservar', async c => {
    const { rows } = await c.query(
      `select id, sub, idempotency_key, payload from carro_do_freela.inventario_eventos
        where estado = 'pendente' and ($1::uuid is null or sub = $1::uuid)
        order by sub, id for update skip locked`,
      [sub],
    );
    const maisNovo = new Map();
    for (const r of rows) maisNovo.set(r.sub, r);
    const velhos = rows.filter(r => maisNovo.get(r.sub) !== r).map(r => r.id);
    if (velhos.length) await c.query(`update carro_do_freela.inventario_eventos set estado = 'substituido' where id = any($1::bigint[])`, [velhos]);
    const ids = [...maisNovo.values()].map(r => r.id);
    if (ids.length) await c.query(`update carro_do_freela.inventario_eventos set estado = 'enviando', tentativas = tentativas + 1 where id = any($1::bigint[])`, [ids]);
    return { lista: [...maisNovo.values()], substituidos: velhos.length };
  });
  /* 2. manda, fora da transação; 3. grava o resultado */
  const saida = { enviados: 0, revisao: 0, substituidos: reservados.substituidos };
  for (const ev of reservados.lista) {
    let ok = false, motivo = null;
    try {
      const r = await buscar(destino(env), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: autorizacao, 'Idempotency-Key': ev.idempotency_key },
        body: JSON.stringify({ type: 'freela.inventario.atualizado', version: 1, idempotency_key: ev.idempotency_key, payload: ev.payload }),
        signal: AbortSignal.timeout(tempoMs),
      });
      ok = r.status >= 200 && r.status < 300;
      if (!ok) motivo = 'HUB respondeu ' + r.status;
    } catch (e) {
      motivo = 'ambíguo: ' + String((e && e.name) || 'erro') + ' ao enviar';
    }
    await banco.asSystem('sync:resultado', c =>
      c.query(
        `update carro_do_freela.inventario_eventos set estado = $2, ultimo_erro = $3, enviado_em = case when $2 = 'enviado' then now() else enviado_em end where id = $1`,
        [ev.id, ok ? 'enviado' : 'revisao', ok ? null : String(motivo).slice(0, 500)],
      ),
    );
    ok ? saida.enviados++ : saida.revisao++;
  }
  return saida;
}

module.exports = { ligado, destino, publicar, PADRAO_CAMINHO };
