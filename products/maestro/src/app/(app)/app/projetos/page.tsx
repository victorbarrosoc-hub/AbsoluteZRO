import Link from "next/link";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { listarProjetos, NOME_STATUS_PROJETO, STATUS_PROJETO } from "@/lib/crm/projetos";
import { podeEscrever } from "@/lib/papeis";
import { Busca } from "@/components/busca";
import { dataBr, Pilulas, Selo } from "@/components/crm";
import { Icone } from "@/components/icones";
import { EstadoVazio } from "@/components/vazio";

export const metadata = { title: "Projetos" };

const TOM = { active: "ok", paused: "aviso", done: "neutro", archived: "neutro" } as const;

/** Projetos da organização: código MAE-AAAA-NNN, cliente, status, prazo e cards em aberto. */
export default async function Projetos({ searchParams }: PageProps<"/app/projetos">) {
  const sessao = await exigirAcessoNaPagina("/app/projetos");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" && sp.status in NOME_STATUS_PROJETO ? sp.status : "todos";
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  const [projetos, todos] = await Promise.all([listarProjetos(ctx, { busca: q, status }), listarProjetos(ctx, { status: undefined })]);
  const temAlgum = todos.length > 0 || projetos.length > 0 || status === "archived";
  const escreve = podeEscrever(sessao.papel);
  const href = (s: string) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (s !== "todos") u.set("status", s);
    const t = u.toString();
    return t ? `/app/projetos?${t}` : "/app/projetos";
  };

  return (
    <div className="pagina">
      <header className="pagina__cabeca pagina__cabeca--acao">
        <h1 className="atitle">
          Seus <strong>projetos.</strong>
        </h1>
        {escreve ? (
          <Link className="glass-btn glass-btn--ink" href="/app/projetos/novo">
            <Icone nome="mais" size={18} /> Novo projeto
          </Link>
        ) : null}
      </header>

      {!temAlgum ? (
        <EstadoVazio
          icone="projetos"
          titulo="Nenhum projeto ainda"
          apoio={escreve ? "Cada projeto ganha um código e junta os cards do cliente." : "Quando a equipe criar projetos, eles aparecem aqui."}
        >
          {escreve ? (
            <Link className="glass-btn glass-btn--ink" href="/app/projetos/novo">
              <Icone nome="mais" size={18} /> Novo projeto
            </Link>
          ) : null}
        </EstadoVazio>
      ) : (
        <>
          <div className="filtros">
            <Busca placeholder="Buscar título, código ou cliente" />
            <Pilulas
              ativo={status}
              itens={[
                { valor: "todos", nome: "Em aberto", href: href("todos") },
                ...STATUS_PROJETO.map((s) => ({ valor: s.k, nome: s.nome, href: href(s.k) })),
              ]}
            />
          </div>
          {projetos.length ? (
            <ul className="lista" aria-label="Projetos">
              {projetos.map((p) => (
                <li key={p.id}>
                  <Link className="item" href={`/app/projetos/${p.id}`}>
                    <span className="codigo">{p.codigo}</span>
                    <span className="item__miolo">
                      <span className="item__nome">{p.titulo}</span>
                      <span className="item__apoio">
                        {[p.cliente ?? "Sem cliente", p.prazo ? `prazo ${dataBr(p.prazo)}` : null].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="item__numeros" title="Cards em aberto">
                      <span>
                        <Icone nome="quadro" size={14} /> {p.cardsAbertos}
                      </span>
                    </span>
                    <Selo tom={TOM[p.status]}>{NOME_STATUS_PROJETO[p.status]}</Selo>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="nada">Nenhum projeto com esse filtro.</p>
          )}
        </>
      )}
    </div>
  );
}
