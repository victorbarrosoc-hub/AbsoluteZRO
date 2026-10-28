import Link from "next/link";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { listarClientes, NOME_STATUS_CLIENTE, STATUS_CLIENTE, whatsappLegivel } from "@/lib/crm/clientes";
import { podeEscrever } from "@/lib/papeis";
import { Busca } from "@/components/busca";
import { Monograma, Pilulas, Selo } from "@/components/crm";
import { Icone } from "@/components/icones";
import { EstadoVazio } from "@/components/vazio";

export const metadata = { title: "Clientes" };

const TOM = { ativo: "ok", lead: "aviso", pausado: "neutro" } as const;

/** Clientes da organização: busca, filtro por relacionamento e, para cada um, projetos e cards em aberto. */
export default async function Clientes({ searchParams }: PageProps<"/app/clientes">) {
  const sessao = await exigirAcessoNaPagina("/app/clientes");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" && sp.status in NOME_STATUS_CLIENTE ? sp.status : "todos";
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  const [clientes, total] = await Promise.all([
    listarClientes(ctx, { busca: q, status }),
    q || status !== "todos" ? listarClientes(ctx).then((l) => l.length) : Promise.resolve(-1),
  ]);
  const temAlgum = total === -1 ? clientes.length > 0 : total > 0;
  const escreve = podeEscrever(sessao.papel);
  const href = (s: string) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (s !== "todos") u.set("status", s);
    const t = u.toString();
    return t ? `/app/clientes?${t}` : "/app/clientes";
  };

  return (
    <div className="pagina">
      <header className="pagina__cabeca pagina__cabeca--acao">
        <h1 className="atitle">
          <strong>Clientes.</strong>
        </h1>
        {escreve ? (
          <Link className="glass-btn glass-btn--ink" href="/app/clientes/novo">
            <Icone nome="mais" size={18} /> Novo cliente
          </Link>
        ) : null}
      </header>

      {!temAlgum ? (
        <EstadoVazio
          icone="clientes"
          titulo="Nenhum cliente ainda"
          apoio={escreve ? "Cadastre quem você atende. Leads também entram." : "Quando a equipe cadastrar clientes, eles aparecem aqui."}
        >
          {escreve ? (
            <Link className="glass-btn glass-btn--ink" href="/app/clientes/novo">
              <Icone nome="mais" size={18} /> Novo cliente
            </Link>
          ) : null}
        </EstadoVazio>
      ) : (
        <>
          <div className="filtros">
            <Busca placeholder="Buscar cliente, empresa ou contato" />
            <Pilulas
              ativo={status}
              itens={[
                { valor: "todos", nome: "Todos", href: href("todos") },
                ...STATUS_CLIENTE.map((s) => ({ valor: s.k, nome: `${s.nome}s`, href: href(s.k) })),
              ]}
            />
          </div>
          {clientes.length ? (
            <ul className="lista" aria-label="Clientes">
              {clientes.map((c) => (
                <li key={c.id}>
                  <Link className="item" href={`/app/clientes/${c.id}`}>
                    <Monograma nome={c.nome} />
                    <span className="item__miolo">
                      <span className="item__nome">{c.nome}</span>
                      <span className="item__apoio">
                        {[c.empresa, c.contato, whatsappLegivel(c.whatsapp) || c.email].filter(Boolean).join(" · ") || "Sem contato"}
                      </span>
                    </span>
                    <span className="item__numeros" title="Projetos e cards em aberto">
                      <span>
                        <Icone nome="projetos" size={14} /> {c.projetos}
                      </span>
                      <span>
                        <Icone nome="quadro" size={14} /> {c.cardsAbertos}
                      </span>
                    </span>
                    <Selo tom={TOM[c.status]}>{NOME_STATUS_CLIENTE[c.status]}</Selo>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="nada">Nenhum cliente com esse filtro.</p>
          )}
        </>
      )}
    </div>
  );
}
