import Link from "next/link";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { dataCurta } from "@/lib/dinheiro";
import { podeVerDinheiro } from "@/lib/papeis";
import { listarPedidos } from "@/lib/pedidos/equipe";
import { nomeStatusPedido, STATUS_PEDIDO, TOM_PEDIDO } from "@/lib/pedidos/formulario";
import { Pilulas } from "@/components/crm";
import { Icone } from "@/components/icones";
import { SeloStatus } from "@/components/painel";
import { EstadoVazio } from "@/components/vazio";

export const metadata = { title: "Pedidos" };

/** Comercial → Pedidos: o que chegou pelo link público, os novos primeiro. "Gerar orçamento" fica na ficha. */
export default async function Pedidos({ searchParams }: PageProps<"/app/pedidos">) {
  const s = await exigirAcessoNaPagina("/app/pedidos");
  const sp = await searchParams;
  const status = typeof sp.status === "string" && STATUS_PEDIDO.some((x) => x.k === sp.status) ? sp.status : "todos";
  const todos = await listarPedidos({ sub: s.sub, orgId: s.orgId });
  const lista = status === "todos" ? todos : todos.filter((p) => p.status === status);
  const novos = todos.filter((p) => p.status === "novo").length;
  return (
    <div className="pagina">
      <header className="pagina__cabeca pagina__cabeca--acao">
        <h1 className="atitle">
          Seus <strong>pedidos.</strong>
        </h1>
        {podeVerDinheiro(s.papel) ? (
          <Link className="glass-btn" href="/app/ajustes/pedido">
            <Icone nome="link" size={18} /> Link de pedido
          </Link>
        ) : null}
      </header>
      {!todos.length ? (
        <EstadoVazio icone="pedidos" titulo="Nenhum pedido ainda" apoio="Compartilhe o link de pedido: o cliente conta o que precisa e chega aqui.">
          {podeVerDinheiro(s.papel) ? (
            <Link className="glass-btn glass-btn--ink" href="/app/ajustes/pedido">
              <Icone nome="link" size={18} /> Criar o link
            </Link>
          ) : null}
        </EstadoVazio>
      ) : (
        <>
          <div className="filtros">
            <Pilulas
              ativo={status}
              itens={[
                { valor: "todos", nome: novos ? `Todos · ${novos} novos` : "Todos", href: "/app/pedidos" },
                ...STATUS_PEDIDO.map((x) => ({ valor: x.k, nome: x.nome, href: `/app/pedidos?status=${x.k}` })),
              ]}
            />
          </div>
          {lista.length ? (
            <ul className="lista" aria-label="Pedidos">
              {lista.map((p) => (
                <li key={p.id}>
                  <Link className="item" href={`/app/pedidos/${p.id}`} data-novo={p.status === "novo" || undefined}>
                    <span className="codigo">{p.protocolo}</span>
                    <span className="item__miolo">
                      <span className="item__nome">{p.empresa ?? p.nome}</span>
                      <span className="item__apoio">
                        {[p.tipo, p.empresa ? p.nome : null, `chegou ${dataCurta(p.criadoEm.slice(0, 10))}`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <SeloStatus status={TOM_PEDIDO[p.status] ?? "neutro"}>{nomeStatusPedido(p.status)}</SeloStatus>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="nada">Nenhum pedido com esse filtro.</p>
          )}
        </>
      )}
    </div>
  );
}
