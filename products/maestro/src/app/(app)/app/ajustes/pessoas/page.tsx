import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { listarClientes } from "@/lib/crm/clientes";
import { dataBr } from "@/lib/dinheiro";
import { NOME_DO_PAPEL, podeRemover } from "@/lib/papeis";
import { listarPessoas, PODE_RESTRINGIR } from "@/lib/pessoas";
import { emissor } from "@/lib/zro/config";
import { Alcance } from "@/components/alcance";
import { CabecaForm } from "@/components/form";
import { Monograma, Selo } from "@/components/crm";
import { Icone } from "@/components/icones";

export const metadata = { title: "Pessoas" };

/**
 * Ajustes → Pessoas: quem é da organização (contas Absolute ZRO; o papel vem do HUB a cada login) e, para quem é da
 * equipe ou só lê, o acesso por cliente (drizzle/0018, a regra vale no banco). Convidar e mudar papel é no HUB.
 */
export default async function Pessoas() {
  const s = await exigirAcessoNaPagina("/app/ajustes/pessoas");
  const ctx = { sub: s.sub, orgId: s.orgId };
  const gestao = podeRemover(s.papel);
  const [pessoas, clientes] = await Promise.all([listarPessoas(ctx), gestao ? listarClientes(ctx) : Promise.resolve([])]);
  return (
    <div className="pagina">
      <CabecaForm voltar="/app/ajustes" titulo={<strong>Pessoas</strong>}>
        <p className="apoio">Cada uma com a própria conta Absolute ZRO. Convites e papéis, no HUB.</p>
      </CabecaForm>
      <div className="acoes">
        <a className="glass-btn glass-btn--sm" href={`${emissor()}/equipe`} target="_blank" rel="noreferrer">
          <Icone nome="externo" size={15} /> Convidar na Absolute ZRO
        </a>
      </div>
      <ul className="pessoas" aria-label="Pessoas da organização">
        {pessoas.map((p) => {
          const nome = p.nome ?? p.email ?? "Sem nome";
          return (
            <li key={p.sub} className="pessoa" data-inativa={!p.ativo || undefined}>
              <div className="pessoa__topo">
                <Monograma nome={nome} />
                <div className="pessoa__miolo">
                  <b>
                    {nome}
                    {p.sub === s.sub ? <span className="sutil"> · você</span> : null}
                  </b>
                  <small>{[p.email, p.ultimoLogin ? `entrou ${dataBr(p.ultimoLogin.slice(0, 10))}` : null].filter(Boolean).join(" · ")}</small>
                </div>
                <Selo tom={p.papel === "admin" || p.papel === "gestor" ? "ok" : "neutro"}>{NOME_DO_PAPEL[p.papel]}</Selo>
                {PODE_RESTRINGIR.includes(p.papel) ? (
                  <Selo tom={p.restrito ? "aviso" : "neutro"}>
                    {p.restrito ? `${p.clientes.length} cliente${p.clientes.length === 1 ? "" : "s"}` : "Todos os clientes"}
                  </Selo>
                ) : null}
              </div>
              {gestao && PODE_RESTRINGIR.includes(p.papel) ? (
                <details className="pessoa__alcance">
                  <summary>Clientes que vê</summary>
                  <Alcance sub={p.sub} nome={nome} restrito={p.restrito} marcados={p.clientes} clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))} />
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
