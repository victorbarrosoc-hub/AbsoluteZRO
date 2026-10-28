import Link from "next/link";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { brl } from "@/lib/dinheiro";
import { FUNCOES, nomeFuncao } from "@/lib/freelas/funcoes";
import { listarFreelas } from "@/lib/freelas/servidor";
import { podeEscrever } from "@/lib/papeis";
import { Busca } from "@/components/busca";
import { Monograma, Pilulas } from "@/components/crm";
import { Icone } from "@/components/icones";
import { EstadoVazio } from "@/components/vazio";

export const metadata = { title: "Freelas" };

/** O banco de freelas: funções, cidade, diária e quantas escalas. Filtro por função. */
export default async function Freelas({ searchParams }: PageProps<"/app/freelas">) {
  const sessao = await exigirAcessoNaPagina("/app/freelas");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const funcao = typeof sp.funcao === "string" ? sp.funcao : "";
  const inativos = sp.inativos === "1";
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  const [lista, todos] = await Promise.all([listarFreelas(ctx, { busca: q, funcao: funcao || undefined, inativos }), listarFreelas(ctx, { inativos: true })]);
  const escreve = podeEscrever(sessao.papel);
  const usadas = FUNCOES.filter((f) => todos.some((x) => x.funcoes.includes(f.k)));
  const href = (f: string) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (f) u.set("funcao", f);
    const t = u.toString();
    return t ? `/app/freelas?${t}` : "/app/freelas";
  };
  return (
    <div className="pagina">
      <header className="pagina__cabeca pagina__cabeca--acao">
        <h1 className="atitle">
          Seu banco de <strong>freelas.</strong>
        </h1>
        {escreve ? (
          <Link className="glass-btn glass-btn--ink" href="/app/freelas/novo">
            <Icone nome="mais" size={18} /> Novo freela
          </Link>
        ) : null}
      </header>
      {!todos.length ? (
        <EstadoVazio icone="freelas" titulo="Nenhum freela ainda" apoio="Funções, diárias e equipamento de quem trabalha com vocês, num lugar só.">
          {escreve ? (
            <Link className="glass-btn glass-btn--ink" href="/app/freelas/novo">
              <Icone nome="mais" size={18} /> Novo freela
            </Link>
          ) : null}
        </EstadoVazio>
      ) : (
        <>
          <div className="filtros">
            <Busca placeholder="Buscar nome, cidade ou função" />
            <Pilulas
              ativo={funcao || "todas"}
              itens={[{ valor: "todas", nome: "Todas", href: href("") }, ...usadas.map((f) => ({ valor: f.k, nome: f.nome, href: href(f.k) }))]}
            />
          </div>
          {lista.length ? (
            <ul className="lista lista--grade" aria-label="Freelas">
              {lista.map((f) => (
                <li key={f.id}>
                  <Link className="item" href={`/app/freelas/${f.id}`} data-inativo={!f.ativo || undefined}>
                    <Monograma nome={f.nome} />
                    <span className="item__miolo">
                      <span className="item__nome">{f.nome}</span>
                      <span className="item__apoio">{[f.funcoes.map(nomeFuncao).join(", "), f.cidade].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="item__numeros">
                      {f.diaria != null ? <span title="Diária">{brl(f.diaria)}</span> : null}
                      <span title="Escalas">
                        <Icone nome="agenda" size={14} /> {f.escalas}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="nada">Ninguém com esse filtro.</p>
          )}
          <p className="sutil">
            {inativos ? (
              <Link href="/app/freelas">Esconder inativos</Link>
            ) : (
              <Link href={`${href(funcao)}${href(funcao).includes("?") ? "&" : "?"}inativos=1`}>Mostrar inativos</Link>
            )}
          </p>
        </>
      )}
    </div>
  );
}
