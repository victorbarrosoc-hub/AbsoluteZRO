import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { NOME_STATUS_PROJETO, obterProjeto } from "@/lib/crm/projetos";
import { podeEscrever } from "@/lib/papeis";
import { dataBr, LinhaCard, Secao, Selo } from "@/components/crm";
import { Icone } from "@/components/icones";

export const metadata = { title: "Projeto" };

const TOM = { active: "ok", paused: "aviso", done: "neutro", archived: "neutro" } as const;

/** O projeto: código, cliente, datas, briefing e os cards dele. O vínculo com a Absolute ZRO chega na etapa 3. */
export default async function FichaProjeto({ params }: PageProps<"/app/projetos/[id]">) {
  const { id } = await params;
  const sessao = await exigirAcessoNaPagina(`/app/projetos/${id}`);
  const p = await obterProjeto({ sub: sessao.sub, orgId: sessao.orgId }, id);
  if (!p) notFound();
  const escreve = podeEscrever(sessao.papel);
  return (
    <div className="pagina">
      <Link className="voltar" href="/app/projetos">
        <Icone nome="voltar" size={16} /> Projetos
      </Link>
      <header className="perfil">
        <span className="codigo codigo--grande">{p.codigo}</span>
        <div className="perfil__miolo">
          <h1 className="atitle">
            <strong>{p.titulo}</strong>
          </h1>
          <p className="apoio">
            {p.cliente && p.clienteNome ? <Link href={`/app/clientes/${p.cliente}`}>{p.clienteNome}</Link> : "Sem cliente"}
            {p.prazo ? ` · prazo ${dataBr(p.prazo)}` : ""}
          </p>
          <div className="perfil__selos">
            <Selo tom={TOM[p.status]}>{NOME_STATUS_PROJETO[p.status]}</Selo>
            <span className="selo selo--neutro" title="O vínculo com o projeto da Absolute ZRO chega numa próxima etapa.">
              <i aria-hidden="true" />
              Absolute ZRO: pendente
            </span>
          </div>
        </div>
        {escreve ? (
          <div className="acoes perfil__acoes">
            <Link className="glass-btn glass-btn--ink" href={`/app/quadro?novo=1&projeto=${p.id}${p.cliente ? `&cliente=${p.cliente}` : ""}`}>
              <Icone nome="mais" size={18} /> Novo card
            </Link>
            <Link className="glass-btn glass-btn--icone" href={`/app/projetos/${p.id}/editar`} title="Editar" aria-label="Editar projeto">
              <Icone nome="editar" size={18} />
            </Link>
          </div>
        ) : null}
      </header>

      <div className="painel">
        <Secao titulo="Cards">
          {p.cards.length ? (
            <ul className="linhas">
              {p.cards.map((k) => (
                <LinhaCard key={k.id} c={k} />
              ))}
            </ul>
          ) : (
            <p className="nada">Nenhum card neste projeto. Escolha o projeto na ficha do card.</p>
          )}
        </Secao>
        <div className="painel__lado">
          <Secao titulo="Datas">
            <dl className="dados">
              <dt>Início</dt>
              <dd>{p.inicio ? dataBr(p.inicio) : "—"}</dd>
              <dt>Prazo</dt>
              <dd>{p.prazo ? dataBr(p.prazo) : "—"}</dd>
            </dl>
          </Secao>
          {p.briefing ? (
            <Secao titulo="Briefing">
              <p className="observacoes">{p.briefing}</p>
            </Secao>
          ) : null}
        </div>
      </div>
    </div>
  );
}
