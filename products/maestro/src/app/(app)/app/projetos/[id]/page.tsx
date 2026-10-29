import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { listarEventos, nomeTipoEvento } from "@/lib/agenda/servidor";
import { NOME_STATUS_PROJETO, obterProjeto } from "@/lib/crm/projetos";
import { brl, dataCurta, hojeBr } from "@/lib/dinheiro";
import { nomeTipoDoc, TIPOS_DOC } from "@/lib/documentos/conteudo";
import { listarDocumentos } from "@/lib/documentos/servidor";
import { NOME_STATUS } from "@/lib/financeiro/contas";
import { camposEscala } from "@/lib/freelas/formularios";
import { nomeFuncao } from "@/lib/freelas/funcoes";
import { escalasDoProjeto, listarFreelas } from "@/lib/freelas/servidor";
import { reservasDoProjeto } from "@/lib/inventario/servidor";
import { podeEscrever, podeVerDinheiro } from "@/lib/papeis";
import { BotaoAcao } from "@/components/acao";
import { dataBr, LinhaCard, Secao, Selo } from "@/components/crm";
import { ListaContratos } from "@/components/contrato/lista";
import { contratosDe } from "@/lib/contrato/servidor";
import { Formulario } from "@/components/form";
import { Icone } from "@/components/icones";
import { SeloStatus } from "@/components/painel";
import { removerEscalaAcao, salvarEscalaAcao } from "../../freelas/acoes";
import { criarDocumentoAcao } from "./documentos/acoes";
import { podeEditarCriacao } from "@/lib/criacao/permissoes";
import { listarRoteiros, NOME_ESTADO_ROTEIRO } from "@/lib/criacao/roteiro/servidor";
import { formatarTempo } from "@/lib/criacao/roteiro/tempo";
import { STATUS_DO_ESTADO } from "@/components/criacao/roteiro/comum";

export const metadata = { title: "Projeto" };

const TOM = { active: "ok", paused: "aviso", done: "neutro", archived: "neutro" } as const;

/** O projeto: cards, agenda, equipe (escala e pagamentos), equipamento reservado e documentos. */
export default async function FichaProjeto({ params }: PageProps<"/app/projetos/[id]">) {
  const { id } = await params;
  const sessao = await exigirAcessoNaPagina(`/app/projetos/${id}`);
  const ctx = { sub: sessao.sub, orgId: sessao.orgId };
  const p = await obterProjeto(ctx, id);
  if (!p) notFound();
  const hoje = hojeBr();
  const [escalas, freelas, eventos, reservas, docs, contratos, roteiros] = await Promise.all([
    escalasDoProjeto(ctx, sessao.papel, id, hoje),
    listarFreelas(ctx),
    listarEventos(ctx, "2000-01-01", "2999-12-31", { projeto: id }),
    reservasDoProjeto(ctx, id),
    listarDocumentos(ctx, id),
    podeVerDinheiro(sessao.papel) ? contratosDe(ctx, { projetoId: id }) : Promise.resolve([]),
    listarRoteiros(ctx, { projetoId: id }),
  ]);
  const escreve = podeEscrever(sessao.papel);
  const dinheiro = podeVerDinheiro(sessao.papel);
  const custoEquipe = escalas.reduce((s, e) => s + e.valorCents, 0);
  const proximos = eventos.filter((e) => (e.dataFim ?? e.data) >= hoje);
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
            <Link className="glass-btn glass-btn--icone" href={`/app/agenda/novo?projeto=${p.id}`} title="Nova diária" aria-label="Nova diária">
              <Icone nome="agenda" size={18} />
            </Link>
            <Link className="glass-btn glass-btn--icone" href={`/app/projetos/${p.id}/editar`} title="Editar" aria-label="Editar projeto">
              <Icone nome="editar" size={18} />
            </Link>
          </div>
        ) : null}
      </header>

      <div className="painel">
        <div className="painel__lado">
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

          <ListaContratos contratos={contratos} />

          <Secao titulo="Equipe" acao={escalas.length ? <span className="sutil num">{brl(custoEquipe)}</span> : undefined}>
            {escalas.length ? (
              <ul className="linhas">
                {escalas.map((e) => (
                  <li key={e.id} className="linha">
                    <span className="linha__coluna">
                      {dataCurta(e.inicio)}
                      {e.fim !== e.inicio ? `–${dataCurta(e.fim)}` : ""}
                    </span>
                    <span className="linha__titulo">
                      <Link href={`/app/freelas/${e.freelaId}`}>{e.freela}</Link>
                      <span className="sutil"> · {nomeFuncao(e.funcao)}</span>
                    </span>
                    {e.conflitos.length ? (
                      <span className="selo" data-status="atrasado" title={`Também em: ${e.conflitos.map((c) => c.titulo).join(", ")}`}>
                        <i aria-hidden="true" />
                        Conflito
                      </span>
                    ) : null}
                    <span className="linha__meta num" title={e.diariaCents != null ? `${e.dias} × ${brl(e.diariaCents)}` : "Total"}>
                      {brl(e.valorCents)}
                    </span>
                    {e.pagamento ? <SeloStatus status={e.pagamento.status}>{NOME_STATUS[e.pagamento.status]}</SeloStatus> : null}
                    {escreve && (!e.pagamento || e.pagamento.pagoCents === 0) ? (
                      <BotaoAcao acao={removerEscalaAcao} campos={{ id: e.id }} rotulo="Tirar" classe="q-limpar" confirmar="Tirar da escala?" />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="nada">Ninguém escalado. Escale numa diária da agenda ou aqui.</p>
            )}
            {escreve && freelas.length ? (
              <details className="secao--abrir">
                <summary>
                  <Icone nome="mais" size={16} /> Escalar sem diária
                </summary>
                <Formulario
                  acao={salvarEscalaAcao}
                  campos={camposEscala(freelas)}
                  compacto
                  ocultos={{ projeto: p.id }}
                  inicial={{ inicio: hoje, fim: hoje, modo: "total" }}
                  rotulo="Escalar"
                />
              </details>
            ) : null}
            {dinheiro ? null : <p className="sutil">O pagamento de cada um aparece para a gestão.</p>}
          </Secao>
        </div>
        <div className="painel__lado">
          <Secao
            titulo="Agenda"
            acao={
              escreve ? (
                <Link className="secao__link" href={`/app/agenda/novo?projeto=${p.id}`}>
                  Nova
                </Link>
              ) : undefined
            }
          >
            {proximos.length ? (
              <ul className="linhas">
                {proximos.map((e) => (
                  <li key={e.id}>
                    <Link className="linha" href={`/app/agenda/${e.id}`}>
                      <span className="linha__coluna">{dataCurta(e.data)}</span>
                      <span className="linha__titulo">{e.titulo}</span>
                      <span className="linha__meta">{nomeTipoEvento(e.tipo)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="nada">Nada marcado daqui para a frente.</p>
            )}
          </Secao>
          <Secao
            titulo="Roteiros"
            acao={
              podeEditarCriacao(sessao.papel) ? (
                <Link className="secao__link" href={`/app/criacao?novo=1&projeto=${p.id}`}>
                  Novo
                </Link>
              ) : undefined
            }
          >
            {roteiros.length ? (
              <ul className="linhas">
                {roteiros.map((r) => (
                  <li key={r.id}>
                    <Link className="linha" href={`/app/criacao/roteiros/${r.id}`}>
                      <span className="linha__coluna num">{formatarTempo(r.duracaoSeg)}</span>
                      <span className="linha__titulo">{r.titulo}</span>
                      <span className="selo" data-status={STATUS_DO_ESTADO[r.estado]}>
                        <i aria-hidden="true" />
                        {NOME_ESTADO_ROTEIRO[r.estado]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="nada">Nenhum roteiro. Escreva na Criação, com as vistas Literário e Técnico.</p>
            )}
          </Secao>
          <Secao titulo="Documentos">
            {docs.length ? (
              <ul className="linhas">
                {docs.map((d) => (
                  <li key={d.id}>
                    <Link className="linha" href={`/app/projetos/${p.id}/documentos/${d.id}`}>
                      <span className="linha__coluna">{nomeTipoDoc(d.tipo).split(" ")[0]}</span>
                      <span className="linha__titulo">{d.titulo}</span>
                      {d.data ? <span className="linha__meta">{dataCurta(d.data)}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="nada">Ordem do dia e checklist.</p>
            )}
            {escreve ? (
              <div className="chips">
                {/* Roteiro e decupagem agora nascem na Criação (os antigos continuam abrindo e vão para o editor novo). */}
                {TIPOS_DOC.filter((t) => t.k !== "roteiro" && t.k !== "decupagem").map((t) => (
                  <BotaoAcao
                    key={t.k}
                    acao={criarDocumentoAcao}
                    campos={{ projeto: p.id, tipo: t.k, titulo: t.nome }}
                    rotulo={t.nome}
                    icone="mais"
                    classe="chip chip--botao"
                  />
                ))}
              </div>
            ) : null}
          </Secao>
          <Secao titulo="Equipamento">
            {reservas.length ? (
              <ul className="linhas">
                {reservas.map((r) => (
                  <li key={r.id}>
                    <Link className="linha" href={`/app/inventario/${r.equipamentoId}`}>
                      <span className="linha__coluna">{dataCurta(r.inicio)}</span>
                      <span className="linha__titulo">{r.equipamento}</span>
                      <span className="linha__meta">{r.evento ?? ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="nada">Nada reservado. Reserve pela diária ou no inventário.</p>
            )}
          </Secao>
          {p.inicio || p.prazo ? (
            <Secao titulo="Datas">
              <dl className="dados">
                <dt>Início</dt>
                <dd>{p.inicio ? dataBr(p.inicio) : "—"}</dd>
                <dt>Prazo</dt>
                <dd>{p.prazo ? dataBr(p.prazo) : "—"}</dd>
              </dl>
            </Secao>
          ) : null}
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
