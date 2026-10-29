import Link from "next/link";
import type { CSSProperties } from "react";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { brlCurto, dataCurta, hojeBr } from "@/lib/dinheiro";
import { ETAPAS, nomeEtapa, quandoRetorno, situacaoRetorno, tomEtapa, type Etapa } from "@/lib/funil/regras";
import { podeEscrever, podeRemover } from "@/lib/papeis";
import { pode as podeArea } from "@/lib/acessos";
import { listarPedidos, type PedidoLista } from "@/lib/pedidos/equipe";
import { Pilulas } from "@/components/crm";
import { MoverRapido } from "@/components/funil";
import { Icone } from "@/components/icones";
import { SeloStatus } from "@/components/painel";
import { EstadoVazio } from "@/components/vazio";

export const metadata = { title: "Pedidos" };

function Retorno({ data, hoje }: { data: string | null; hoje: string }) {
  if (!data) return null;
  const s = situacaoRetorno(data, hoje);
  return (
    <span className="funil-chip" data-sit={s} title={`Próximo contato ${dataCurta(data)}`}>
      <Icone nome="retorno" size={13} /> {quandoRetorno(data, hoje)}
    </span>
  );
}

/**
 * Comercial → Pedidos: o funil leve (drizzle/0014). Quadro por etapa (Novo → Em conversa → Orçamento enviado →
 * Negociando → Ganho | Perdido) ou lista; o próximo contato de cada um, vencido em destaque. A ficha tem o resto.
 */
export default async function Pedidos({ searchParams }: PageProps<"/app/pedidos">) {
  const s = await exigirAcessoNaPagina("/app/pedidos");
  const sp = await searchParams;
  const ver = sp.ver === "lista" ? "lista" : "quadro";
  const etapa = typeof sp.etapa === "string" && ETAPAS.some((x) => x.k === sp.etapa) ? (sp.etapa as Etapa) : "todas";
  const todos = await listarPedidos({ sub: s.sub, orgId: s.orgId });
  const hoje = hojeBr();
  const dinheiro = podeArea(s, "orcamentos");
  const escreve = podeEscrever(s.papel);
  const lista = etapa === "todas" ? todos : todos.filter((p) => p.etapa === etapa);
  const abertos = todos.filter((p) => p.etapa !== "ganho" && p.etapa !== "perdido");
  const vencidos = abertos.filter((p) => p.proximoContato && p.proximoContato <= hoje).length;
  const emAberto = abertos.reduce((t, p) => t + (p.valor ?? 0), 0);
  const href = (o: { ver?: string; etapa?: string }) => {
    const q = new URLSearchParams();
    const v = o.ver ?? ver;
    const e = o.etapa ?? etapa;
    if (v !== "quadro") q.set("ver", v);
    if (e !== "todas") q.set("etapa", e);
    const t = q.toString();
    return t ? `/app/pedidos?${t}` : "/app/pedidos";
  };
  const cartao = (p: PedidoLista, i: number) => (
    <li key={p.id} className="funil-card" style={{ "--i": i } as CSSProperties}>
      <Link href={`/app/pedidos/${p.id}`} className="funil-card__link">
        <span className="funil-card__nome">{p.empresa ?? p.nome}</span>
        <span className="funil-card__apoio">{[p.tipo, `chegou ${dataCurta(p.criadoEm.slice(0, 10))}`].filter(Boolean).join(" · ")}</span>
      </Link>
      <span className="funil-card__pe">
        {dinheiro && p.valor ? <b className="num">{brlCurto(p.valor)}</b> : null}
        <Retorno data={p.proximoContato} hoje={hoje} />
        {escreve ? <MoverRapido id={p.id} etapa={p.etapa} podeGanhar={false} /> : null}
      </span>
    </li>
  );
  return (
    <div className="pagina pagina--larga">
      <header className="pagina__cabeca pagina__cabeca--acao">
        <div>
          <h1 className="atitle">
            Seus <strong>pedidos.</strong>
          </h1>
          {todos.length ? (
            <p className="apoio">
              {abertos.length} em aberto
              {dinheiro && emAberto ? ` · ${brlCurto(emAberto)}` : ""}
              {vencidos ? ` · ${vencidos} para retornar` : ""}
            </p>
          ) : null}
        </div>
        <div className="acoes">
          {todos.length ? (
            <nav className="q-segmentos" aria-label="Ver como">
              <Link href={href({ ver: "quadro" })} aria-current={ver === "quadro" ? "true" : undefined} title="Quadro">
                <Icone nome="grade" size={16} /> <span className="sr-only">Quadro</span>
              </Link>
              <Link href={href({ ver: "lista" })} aria-current={ver === "lista" ? "true" : undefined} title="Lista">
                <Icone nome="lista" size={16} /> <span className="sr-only">Lista</span>
              </Link>
            </nav>
          ) : null}
          {podeArea(s, "orcamentos") && podeRemover(s.papel) ? (
            <Link className="glass-btn" href="/app/ajustes/pedido">
              <Icone nome="link" size={18} /> Link de pedido
            </Link>
          ) : null}
        </div>
      </header>
      {!todos.length ? (
        <EstadoVazio icone="pedidos" titulo="Nenhum pedido ainda" apoio="Compartilhe o link de pedido: o cliente conta o que precisa e chega aqui.">
          {podeArea(s, "orcamentos") && podeRemover(s.papel) ? (
            <Link className="glass-btn glass-btn--ink" href="/app/ajustes/pedido">
              <Icone nome="link" size={18} /> Criar o link
            </Link>
          ) : null}
        </EstadoVazio>
      ) : ver === "quadro" ? (
        <div className="funil" aria-label="Funil de pedidos" data-rolagem>
          {ETAPAS.map((e) => {
            const daEtapa = todos.filter((p) => p.etapa === e.k);
            const soma = daEtapa.reduce((t, p) => t + (p.valor ?? 0), 0);
            return (
              <section key={e.k} className="funil__coluna" data-etapa={e.k} aria-label={e.nome}>
                <header className="funil__topo">
                  <i aria-hidden="true" />
                  <h2>{e.nome}</h2>
                  <span className="funil__n">{daEtapa.length}</span>
                  {dinheiro && soma ? <span className="funil__soma num">{brlCurto(soma)}</span> : null}
                </header>
                {daEtapa.length ? <ul>{daEtapa.slice(0, 40).map(cartao)}</ul> : <p className="funil__vazio">—</p>}
              </section>
            );
          })}
        </div>
      ) : (
        <>
          <div className="filtros">
            <Pilulas
              ativo={etapa}
              itens={[
                { valor: "todas", nome: "Todos", href: href({ etapa: "todas" }) },
                ...ETAPAS.map((x) => ({ valor: x.k, nome: x.nome, href: href({ etapa: x.k }) })),
              ]}
            />
          </div>
          {lista.length ? (
            <ul className="lista" aria-label="Pedidos">
              {lista.map((p) => (
                <li key={p.id}>
                  <Link className="item" href={`/app/pedidos/${p.id}`} data-novo={p.etapa === "novo" || undefined}>
                    <span className="codigo">{p.protocolo}</span>
                    <span className="item__miolo">
                      <span className="item__nome">{p.empresa ?? p.nome}</span>
                      <span className="item__apoio">
                        {[p.tipo, p.empresa ? p.nome : null, `chegou ${dataCurta(p.criadoEm.slice(0, 10))}`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <Retorno data={p.etapa === "ganho" || p.etapa === "perdido" ? null : p.proximoContato} hoje={hoje} />
                    <SeloStatus status={tomEtapa(p.etapa)}>{nomeEtapa(p.etapa)}</SeloStatus>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="nada">Nenhum pedido nessa etapa.</p>
          )}
        </>
      )}
    </div>
  );
}
