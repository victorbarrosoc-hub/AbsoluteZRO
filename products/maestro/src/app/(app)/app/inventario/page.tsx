import Link from "next/link";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { dataCurta, hojeBr, somarDias } from "@/lib/dinheiro";
import { CATEGORIAS_EQUIP, ehCategoriaEquip, nomeCategoriaEquip, nomeEstado } from "@/lib/inventario/nomes";
import { listarEquipamentos, reservasDoPeriodo } from "@/lib/inventario/servidor";
import { podeEscrever } from "@/lib/papeis";
import { Busca } from "@/components/busca";
import { Pilulas, Secao } from "@/components/crm";
import { Icone } from "@/components/icones";
import { Cifra, Cifras, SeloStatus } from "@/components/painel";
import { EstadoVazio } from "@/components/vazio";

export const metadata = { title: "Inventário" };

/** O inventário: o que a produtora tem, onde está, o que está reservado hoje e o que sai nos próximos dias. */
export default async function Inventario({ searchParams }: PageProps<"/app/inventario">) {
  const sessao = await exigirAcessoNaPagina("/app/inventario");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const categoria = ehCategoriaEquip(sp.categoria) ? sp.categoria : "";
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  const hoje = hojeBr();
  const [lista, todos, proximas] = await Promise.all([
    listarEquipamentos(ctx, hoje, { busca: q, categoria }),
    listarEquipamentos(ctx, hoje),
    reservasDoPeriodo(ctx, hoje, somarDias(hoje, 14)),
  ]);
  const escreve = podeEscrever(sessao.papel);
  const usadas = CATEGORIAS_EQUIP.filter((c) => todos.some((e) => e.categoria === c.k));
  const href = (c: string) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (c) u.set("categoria", c);
    const t = u.toString();
    return t ? `/app/inventario?${t}` : "/app/inventario";
  };
  const fora = todos.filter((e) => e.hoje).length;
  const manutencao = todos.filter((e) => e.estado === "manutencao").length;
  return (
    <div className="pagina">
      <header className="pagina__cabeca pagina__cabeca--acao">
        <h1 className="atitle">
          Seu <strong>inventário.</strong>
        </h1>
        {escreve ? (
          <Link className="glass-btn glass-btn--ink" href="/app/inventario/novo">
            <Icone nome="mais" size={18} /> Novo item
          </Link>
        ) : null}
      </header>
      {!todos.length ? (
        <EstadoVazio icone="inventario" titulo="Nada no inventário ainda" apoio="Câmeras, lentes, luz e veículos, com reserva por diária sem conflito.">
          {escreve ? (
            <Link className="glass-btn glass-btn--ink" href="/app/inventario/novo">
              <Icone nome="mais" size={18} /> Novo item
            </Link>
          ) : null}
        </EstadoVazio>
      ) : (
        <>
          <Cifras>
            <Cifra rotulo="Itens" valor={String(todos.length)} apoio={`${usadas.length} categorias`} />
            <Cifra rotulo="Reservados hoje" valor={String(fora)} />
            <Cifra rotulo="Em manutenção" valor={String(manutencao)} tom={manutencao ? "aviso" : undefined} />
          </Cifras>
          <div className="painel">
            <div className="painel__lado">
              <div className="filtros">
                <Busca placeholder="Buscar nome, marca ou patrimônio" />
                <Pilulas
                  ativo={categoria || "todas"}
                  itens={[{ valor: "todas", nome: "Tudo", href: href("") }, ...usadas.map((c) => ({ valor: c.k, nome: c.nome, href: href(c.k) }))]}
                />
              </div>
              {lista.length ? (
                <ul className="lista" aria-label="Equipamentos">
                  {lista.map((e) => (
                    <li key={e.id}>
                      <Link className="item item--fino" href={`/app/inventario/${e.id}`}>
                        <span className="cat-ficha" data-cat={e.categoria} aria-hidden="true">
                          <Icone nome={e.categoria === "veiculo" ? "carro" : "inventario"} size={18} />
                        </span>
                        <span className="item__miolo">
                          <span className="item__nome">{e.nome}</span>
                          <span className="item__apoio">
                            {[nomeCategoriaEquip(e.categoria), e.patrimonio, e.dono === "freela" ? `de ${e.freela}` : e.dono === "locado" ? "locado" : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        <span className="item__apoio item__agenda">
                          {e.hoje ? `até ${dataCurta(e.hoje.fim)}` : e.proxima ? `sai ${dataCurta(e.proxima.inicio)}` : ""}
                        </span>
                        <SeloStatus status={e.hoje ? "em_uso" : e.estado}>{e.hoje ? "Reservado" : nomeEstado(e.estado)}</SeloStatus>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="nada">Nada com esse filtro.</p>
              )}
            </div>
            <Secao titulo="Próximos 14 dias" acao={<span className="sutil">{proximas.length} reservas</span>}>
              {proximas.length ? (
                <ul className="linhas">
                  {proximas.slice(0, 30).map((r) => (
                    <li key={r.id}>
                      <Link className="linha" href={`/app/inventario/${r.equipamentoId}`}>
                        <span className="linha__coluna">
                          {dataCurta(r.inicio)}
                          {r.fim !== r.inicio ? `–${dataCurta(r.fim)}` : ""}
                        </span>
                        <span className="linha__titulo">{r.equipamento}</span>
                        <span className="linha__meta">{r.evento ?? r.projeto ?? ""}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="nada">Nada reservado nas próximas duas semanas.</p>
              )}
            </Secao>
          </div>
        </>
      )}
    </div>
  );
}
