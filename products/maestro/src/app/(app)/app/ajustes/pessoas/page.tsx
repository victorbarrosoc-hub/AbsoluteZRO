import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { listarClientes } from "@/lib/crm/clientes";
import { dataBr } from "@/lib/dinheiro";
import { NOME_DO_PAPEL, podeRemover } from "@/lib/papeis";
import { FUNCOES_NA_PRODUTORA, listarPessoas, PODE_RESTRINGIR } from "@/lib/pessoas";
import { emissor } from "@/lib/zro/config";
import { Alcance } from "@/components/alcance";
import { AcessoAreas } from "@/components/acesso-areas";
import { areasLigadas, PADRAO, podeMudarAcessos, resumoDoAcesso } from "@/lib/acessos";
import { CabecaForm } from "@/components/form";
import { FuncaoProdutora } from "@/components/funcao-produtora";
import { Monograma, Selo } from "@/components/crm";
import { Icone } from "@/components/icones";
import { PessoasZro } from "@/components/pessoas-zro";
import { buscarNaZroAcao, convidarNaZroAcao } from "./acoes";

export const metadata = { title: "Pessoas" };

/** Papéis do convite pelo @ (a tabela de src/lib/papeis.ts ao contrário; administração só pelo HUB). */
const PAPEIS_CONVITE = [
  { valor: "equipe", nome: "Equipe" },
  { valor: "gestor", nome: "Gestão" },
  { valor: "leitura", nome: "Leitura" },
];

/**
 * Ajustes → Pessoas: quem é da organização (contas Absolute ZRO; o papel vem do HUB a cada login), a função de cada
 * uma na produtora (só descrição, não muda o acesso), **o que cada uma vê** (as áreas sensíveis de src/lib/acessos.ts,
 * só a administração muda; drizzle/0027), o acesso por cliente (drizzle/0018) e, para a administração, buscar pelo @
 * na Absolute ZRO e convidar (ADR 0029 do HUB: a pessoa aceita lá). Tudo vale no banco, não só aqui.
 */
export default async function Pessoas() {
  const s = await exigirAcessoNaPagina("/app/ajustes/pessoas");
  const ctx = { sub: s.sub, orgId: s.orgId };
  const gestao = podeRemover(s.papel);
  const admin = s.papel === "admin";
  const mudaAcesso = podeMudarAcessos(s.papel);
  const [pessoas, clientes] = await Promise.all([listarPessoas(ctx), gestao ? listarClientes(ctx) : Promise.resolve([])]);
  return (
    <div className="pagina">
      <CabecaForm voltar="/app/ajustes" titulo={<strong>Pessoas</strong>}>
        <p className="apoio">{mudaAcesso ? "Você decide o que cada pessoa vê." : "Cada uma com a própria conta Absolute ZRO."}</p>
      </CabecaForm>
      {admin ? (
        <section aria-label="Convidar pela Absolute ZRO">
          <PessoasZro buscar={buscarNaZroAcao} acao={convidarNaZroAcao} rotulo="Convidar" papeis={PAPEIS_CONVITE} perfilBase={emissor()} />
        </section>
      ) : (
        <div className="acoes">
          <a className="glass-btn glass-btn--sm" href={`${emissor()}/equipe`} target="_blank" rel="noreferrer">
            <Icone nome="externo" size={15} /> Equipe na Absolute ZRO
          </a>
        </div>
      )}
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
                  <small>
                    {[p.arroba ? `@${p.arroba}` : null, p.funcao, p.ultimoLogin ? `entrou ${dataBr(p.ultimoLogin.slice(0, 10))}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </div>
                <Selo tom={p.papel === "admin" || p.papel === "gestor" ? "ok" : "neutro"}>{NOME_DO_PAPEL[p.papel]}</Selo>
                {mudaAcesso || p.sub === s.sub ? (
                  <span className="selo selo--acesso" data-areas={p.papel === "admin" ? "tudo" : undefined} title="O que vê">
                    <i aria-hidden="true" />
                    {resumoDoAcesso(p.papel, p.acessos)}
                  </span>
                ) : null}
                {PODE_RESTRINGIR.includes(p.papel) ? (
                  <Selo tom={p.restrito ? "aviso" : "neutro"}>
                    {p.restrito ? `${p.clientes.length} cliente${p.clientes.length === 1 ? "" : "s"}` : "Todos os clientes"}
                  </Selo>
                ) : null}
              </div>
              {mudaAcesso && p.papel !== "admin" ? (
                <details className="pessoa__alcance" open={pessoas.length <= 3 || undefined}>
                  <summary>O que vê</summary>
                  <AcessoAreas
                    key={p.sub}
                    sub={p.sub}
                    nome={nome}
                    ligadas={areasLigadas(p.acessos)}
                    padrao={areasLigadas(PADRAO[p.papel])}
                    nomePapel={NOME_DO_PAPEL[p.papel]}
                  />
                </details>
              ) : null}
              {admin ? (
                <details className="pessoa__alcance">
                  <summary>Função na produtora</summary>
                  <FuncaoProdutora sub={p.sub} nome={nome} funcao={p.funcao} sugestoes={FUNCOES_NA_PRODUTORA} />
                </details>
              ) : null}
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
