import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { linkWhatsapp, NOME_STATUS_CLIENTE, obterCliente, whatsappLegivel } from "@/lib/crm/clientes";
import { NOME_STATUS_PROJETO } from "@/lib/crm/projetos";
import { podeEscrever } from "@/lib/papeis";
import { dataBr, LinhaCard, Monograma, Secao, Selo } from "@/components/crm";
import { Icone } from "@/components/icones";

export const metadata = { title: "Cliente" };

const TOM = { ativo: "ok", lead: "aviso", pausado: "neutro" } as const;

/** A ficha do cliente: quem é, como falar com ele, os projetos e os cards dele no Quadro. */
export default async function FichaCliente({ params }: PageProps<"/app/clientes/[id]">) {
  const { id } = await params;
  const sessao = await exigirAcessoNaPagina(`/app/clientes/${id}`);
  const c = await obterCliente({ sub: sessao.sub, orgId: sessao.orgId }, id);
  if (!c) notFound();
  const escreve = podeEscrever(sessao.papel);
  const abertos = c.cards.filter((k) => k.coluna !== "entregue");
  const entregues = c.cards.length - abertos.length;
  const ola = `Oi${c.contato ? `, ${c.contato.split(" ")[0]}` : ""}! Tudo bem?`;

  return (
    <div className="pagina">
      <Link className="voltar" href="/app/clientes">
        <Icone nome="voltar" size={16} /> Clientes
      </Link>
      <header className="perfil">
        <Monograma nome={c.nome} grande />
        <div className="perfil__miolo">
          <h1 className="atitle">
            <strong>{c.nome}</strong>
          </h1>
          <p className="apoio">{[c.empresa, c.contato].filter(Boolean).join(" · ") || "Sem contato cadastrado"}</p>
          <div className="perfil__selos">
            <Selo tom={TOM[c.status]}>{NOME_STATUS_CLIENTE[c.status]}</Selo>
          </div>
        </div>
        <div className="acoes perfil__acoes">
          {escreve ? (
            <Link className="glass-btn glass-btn--ink" href={`/app/quadro?novo=1&cliente=${c.id}`}>
              <Icone nome="mais" size={18} /> Novo card
            </Link>
          ) : null}
          {c.whatsapp ? (
            <a className="glass-btn" href={linkWhatsapp(c.whatsapp, ola)} target="_blank" rel="noreferrer" title={whatsappLegivel(c.whatsapp)}>
              <Icone nome="whatsapp" size={18} /> WhatsApp
            </a>
          ) : null}
          {c.email ? (
            <a className="glass-btn glass-btn--icone" href={`mailto:${c.email}`} title={c.email} aria-label={`E-mail para ${c.email}`}>
              <Icone nome="email" size={18} />
            </a>
          ) : null}
          {escreve ? (
            <Link className="glass-btn glass-btn--icone" href={`/app/clientes/${c.id}/editar`} title="Editar" aria-label="Editar cliente">
              <Icone nome="editar" size={18} />
            </Link>
          ) : null}
        </div>
      </header>

      <div className="painel">
        <Secao
          titulo="Cards"
          acao={
            c.cards.length ? (
              <Link className="secao__link" href={`/app/quadro?cliente=${c.id}`}>
                Ver no Quadro <Icone nome="seta" size={14} />
              </Link>
            ) : null
          }
        >
          {abertos.length ? (
            <ul className="linhas">
              {abertos.map((k) => (
                <LinhaCard key={k.id} c={k} />
              ))}
            </ul>
          ) : (
            <p className="nada">{entregues ? "Tudo entregue." : "Nenhum card ainda."}</p>
          )}
          {entregues ? <p className="sutil">{entregues === 1 ? "1 card entregue" : `${entregues} cards entregues`}</p> : null}
        </Secao>

        <div className="painel__lado">
          <Secao
            titulo="Projetos"
            acao={
              escreve ? (
                <Link className="secao__link" href={`/app/projetos/novo?cliente=${c.id}`}>
                  <Icone nome="mais" size={14} /> Novo
                </Link>
              ) : null
            }
          >
            {c.projetos.length ? (
              <ul className="linhas">
                {c.projetos.map((p) => (
                  <li key={p.id}>
                    <Link className="linha" href={`/app/projetos/${p.id}`}>
                      <span className="linha__coluna">{p.codigo}</span>
                      <span className="linha__titulo">{p.titulo}</span>
                      <span className="linha__meta">{p.prazo ? dataBr(p.prazo) : NOME_STATUS_PROJETO[p.status as keyof typeof NOME_STATUS_PROJETO]}</span>
                      <Icone nome="seta" size={15} className="linha__seta" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="nada">Nenhum projeto.</p>
            )}
          </Secao>

          <Secao titulo="Contato">
            <dl className="dados">
              <dt>Contato</dt>
              <dd>{c.contato ?? "—"}</dd>
              <dt>WhatsApp</dt>
              <dd>{c.whatsapp ? whatsappLegivel(c.whatsapp) : "—"}</dd>
              <dt>E-mail</dt>
              <dd>{c.email ?? "—"}</dd>
              <dt>Empresa</dt>
              <dd>{c.empresa ?? "—"}</dd>
            </dl>
            {c.observacoes ? <p className="observacoes">{c.observacoes}</p> : null}
          </Secao>
        </div>
      </div>
    </div>
  );
}
