import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { camposEvento } from "@/lib/agenda/formularios";
import { nomeTipoEvento, obterEvento } from "@/lib/agenda/servidor";
import { listarProjetos } from "@/lib/crm/projetos";
import { dataBr, dataCurta, hojeBr } from "@/lib/dinheiro";
import { nomeFuncao } from "@/lib/freelas/funcoes";
import { listarFreelas } from "@/lib/freelas/servidor";
import { equipamentosDasEscalas } from "@/lib/freelas/equipamentos";
import { EquipNaEscala } from "@/components/kit-freela";
import { listarEquipamentos, reservasDoPeriodo } from "@/lib/inventario/servidor";
import { podeEscrever } from "@/lib/papeis";
import { BotaoAcao } from "@/components/acao";
import { Secao } from "@/components/crm";
import { Formulario } from "@/components/form";
import { Icone } from "@/components/icones";
import { OcupadoNoGoogle } from "@/components/ocupado-google";
import { removerEscalaAcao } from "../../freelas/acoes";
import { mudarReservaAcao } from "../../inventario/acoes";
import { criarDocumentoAcao } from "../../projetos/[id]/documentos/acoes";
import { escalarAcao, removerEventoAcao, reservarNaDiariaAcao, salvarEventoAcao } from "../acoes";

export const metadata = { title: "Agenda" };

/** Um evento: quando e onde, a equipe escalada (com conflito), o equipamento reservado e a ordem do dia. */
export default async function FichaEvento({ params }: PageProps<"/app/agenda/[id]">) {
  const { id } = await params;
  const s = await exigirAcessoNaPagina(`/app/agenda/${id}`);
  const ctx = { sub: s.sub, orgId: s.orgId };
  const e = await obterEvento(ctx, id);
  if (!e) notFound();
  const fim = e.dataFim ?? e.data;
  const [projetos, freelas, equipamentos, reservas, kits] = await Promise.all([
    listarProjetos(ctx),
    listarFreelas(ctx),
    listarEquipamentos(ctx, hojeBr()),
    reservasDoPeriodo(ctx, e.data, fim),
    equipamentosDasEscalas(
      ctx,
      e.equipe.map((p) => p.escalaId),
    ),
  ]);
  const minhas = reservas.filter((r) => r.eventoId === e.id);
  const ocupados = new Set(reservas.map((r) => r.equipamentoId));
  const livres = equipamentos.filter((q) => !ocupados.has(q.id) && q.estado !== "manutencao");
  const escreve = podeEscrever(s.papel);
  return (
    <div className="pagina">
      <Link className="voltar" href={`/app/agenda?de=${e.data}`}>
        <Icone nome="voltar" size={16} /> Agenda
      </Link>
      <header className="perfil">
        <div className="agenda__data agenda__data--grande" aria-hidden="true">
          <span>{nomeTipoEvento(e.tipo)}</span>
          <strong>{e.data.slice(8, 10)}</strong>
          <span>{dataCurta(e.data).slice(3)}</span>
        </div>
        <div className="perfil__miolo">
          <h1 className="atitle">
            <strong>{e.titulo}</strong>
          </h1>
          <p className="apoio">
            {[dataBr(e.data) + (e.dataFim ? ` a ${dataBr(e.dataFim)}` : ""), e.horaIni ? `${e.horaIni}${e.horaFim ? `–${e.horaFim}` : ""}` : null, e.local]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {e.projetoId ? (
            <div className="perfil__selos">
              <Link className="selo" href={`/app/projetos/${e.projetoId}`}>
                {e.projetoCodigo} · {e.projeto}
              </Link>
            </div>
          ) : null}
        </div>
        {escreve && e.projetoId ? (
          <div className="acoes perfil__acoes">
            <BotaoAcao
              acao={criarDocumentoAcao}
              campos={{ projeto: e.projetoId, tipo: "ordem_do_dia", titulo: `Ordem do dia: ${e.titulo}`.slice(0, 200), data: e.data, evento: e.id }}
              rotulo="Ordem do dia"
              icone="documento"
              classe="glass-btn glass-btn--ink"
              titulo="Monta a ordem do dia com a equipe e o horário desta diária"
            />
            <BotaoAcao
              acao={criarDocumentoAcao}
              campos={{ projeto: e.projetoId, tipo: "checklist", titulo: `Checklist: ${e.titulo}`.slice(0, 200), data: e.data, evento: e.id }}
              rotulo="Checklist"
              icone="check"
              titulo="Checklist com o equipamento reservado"
            />
          </div>
        ) : null}
      </header>

      {escreve ? <OcupadoNoGoogle de={e.data} ate={fim} volta={`/app/agenda/${e.id}`} /> : null}

      <div className="painel">
        <Secao titulo="Equipe">
          {e.equipe.length ? (
            <ul className="linhas">
              {e.equipe.map((p) => (
                <li key={p.escalaId} className="linha">
                  <Link className="linha__titulo" href={`/app/freelas/${p.freelaId}`}>
                    {p.nome}
                  </Link>
                  <span className="linha__meta">{nomeFuncao(p.funcao)}</span>
                  {p.conflitos.length ? (
                    <span className="selo" data-status="atrasado" title={p.conflitos.map((c) => `${c.titulo} (${dataCurta(c.inicio)})`).join(", ")}>
                      <i aria-hidden="true" />
                      Conflito
                    </span>
                  ) : null}
                  {escreve ? (
                    <BotaoAcao acao={removerEscalaAcao} campos={{ id: p.escalaId }} rotulo="Tirar" classe="q-limpar" confirmar="Tirar da diária?" />
                  ) : null}
                  {escreve
                    ? (() => {
                        const k = kits.find((x) => x.escalaId === p.escalaId);
                        return k ? (
                          <EquipNaEscala escalaId={k.escalaId} disponiveis={k.disponiveis} marcados={k.marcados} dias={k.dias} aluguelCents={k.aluguelCents} />
                        ) : null;
                      })()
                    : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="nada">Ninguém escalado.</p>
          )}
          {escreve && freelas.length ? (
            <Formulario
              acao={escalarAcao}
              compacto
              ocultos={{ evento: e.id }}
              campos={[
                {
                  nome: "freela",
                  rotulo: "Freela",
                  tipo: "select",
                  opcoes: [{ valor: "", nome: "Escolha" }, ...freelas.map((f) => ({ valor: f.id, nome: f.nome }))],
                },
                { nome: "funcao", rotulo: "Função", max: 40, placeholder: "a primeira do cadastro" },
                { nome: "valor", rotulo: "Diária", tipo: "dinheiro", placeholder: "a do cadastro", dica: "Vira o a pagar no Financeiro." },
              ]}
              inicial={{}}
              rotulo="Escalar"
            />
          ) : null}
        </Secao>
        <div className="painel__lado">
          <Secao titulo="Equipamento">
            {minhas.length ? (
              <ul className="linhas">
                {minhas.map((r) => (
                  <li key={r.id} className="linha">
                    <Link className="linha__titulo" href={`/app/inventario/${r.equipamentoId}`}>
                      {r.equipamento}
                    </Link>
                    <span className="linha__meta">{r.retornoEm ? "voltou" : r.saidaEm ? "saiu" : ""}</span>
                    {escreve && !r.saidaEm ? (
                      <BotaoAcao acao={mudarReservaAcao} campos={{ id: r.id, acao: "cancelar" }} rotulo="Tirar" classe="q-limpar" />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="nada">Nada reservado para esta diária.</p>
            )}
            {escreve && livres.length ? (
              <Formulario
                acao={reservarNaDiariaAcao}
                compacto
                ocultos={{ evento: e.id, projeto: e.projetoId ?? "", inicio: e.data, fim }}
                campos={[
                  {
                    nome: "equipamento",
                    rotulo: "Livre nessas datas",
                    tipo: "select",
                    opcoes: [{ valor: "", nome: "Escolha" }, ...livres.map((q) => ({ valor: q.id, nome: q.nome }))],
                  },
                ]}
                inicial={{}}
                rotulo="Reservar"
              />
            ) : null}
          </Secao>
          {e.notas ? (
            <Secao titulo="Notas">
              <p className="observacoes">{e.notas}</p>
            </Secao>
          ) : null}
          {escreve ? (
            <details className="secao secao--abrir">
              <summary>
                <Icone nome="editar" size={16} /> Editar
              </summary>
              <Formulario
                acao={salvarEventoAcao}
                campos={camposEvento(projetos)}
                id={e.id}
                compacto
                inicial={{
                  titulo: e.titulo,
                  tipo: e.tipo,
                  projeto: e.projetoId ?? "",
                  data: e.data,
                  dataFim: e.dataFim ?? "",
                  horaIni: e.horaIni ?? "",
                  horaFim: e.horaFim ?? "",
                  local: e.local ?? "",
                  cor: e.cor ?? "",
                  notas: e.notas ?? "",
                }}
                rotulo="Salvar"
              />
              <BotaoAcao
                acao={removerEventoAcao}
                campos={{ id: e.id }}
                rotulo="Apagar da agenda"
                classe="q-perigo"
                icone="lixo"
                confirmar="Apagar com a escala?"
              />
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}
