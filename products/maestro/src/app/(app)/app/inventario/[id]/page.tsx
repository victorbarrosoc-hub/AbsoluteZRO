import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { listarProjetos } from "@/lib/crm/projetos";
import { brl, dataBr, dataCurta, hojeBr } from "@/lib/dinheiro";
import { camposReserva } from "@/lib/inventario/formularios";
import { nomeCategoriaEquip, nomeEstado } from "@/lib/inventario/nomes";
import { obterEquipamento } from "@/lib/inventario/servidor";
import { podeEscrever } from "@/lib/papeis";
import { BotaoAcao } from "@/components/acao";
import { Secao } from "@/components/crm";
import { Formulario } from "@/components/form";
import { Icone } from "@/components/icones";
import { SeloStatus } from "@/components/painel";
import { mudarReservaAcao, reservarAcao } from "../acoes";

export const metadata = { title: "Equipamento" };

/** A ficha do item: dados, reservas (o banco barra período cruzado), saída e retorno. */
export default async function FichaEquipamento({ params }: PageProps<"/app/inventario/[id]">) {
  const { id } = await params;
  const s = await exigirAcessoNaPagina(`/app/inventario/${id}`);
  const ctx = { sub: s.sub, orgId: s.orgId };
  const hoje = hojeBr();
  const [e, projetos] = await Promise.all([obterEquipamento(ctx, id, hoje), listarProjetos(ctx)]);
  if (!e) notFound();
  const escreve = podeEscrever(s.papel);
  return (
    <div className="pagina">
      <Link className="voltar" href="/app/inventario">
        <Icone nome="voltar" size={16} /> Inventário
      </Link>
      <header className="perfil">
        <span className="cat-ficha cat-ficha--grande" data-cat={e.categoria} aria-hidden="true">
          <Icone nome={e.categoria === "veiculo" ? "carro" : "inventario"} size={30} />
        </span>
        <div className="perfil__miolo">
          <h1 className="atitle">
            <strong>{e.nome}</strong>
          </h1>
          <p className="apoio">{[nomeCategoriaEquip(e.categoria), e.marca, e.patrimonio].filter(Boolean).join(" · ")}</p>
          <div className="perfil__selos">
            <SeloStatus status={e.hoje ? "em_uso" : e.estado}>{e.hoje ? `Reservado até ${dataCurta(e.hoje.fim)}` : nomeEstado(e.estado)}</SeloStatus>
            {e.dono === "freela" && e.freelaId ? (
              <Link className="selo" href={`/app/freelas/${e.freelaId}`}>
                de {e.freela}
              </Link>
            ) : e.dono === "locado" ? (
              <span className="selo">Locado</span>
            ) : null}
          </div>
        </div>
        {escreve ? (
          <div className="acoes perfil__acoes">
            <Link className="glass-btn glass-btn--icone" href={`/app/inventario/${e.id}/editar`} aria-label="Editar" title="Editar">
              <Icone nome="editar" size={18} />
            </Link>
          </div>
        ) : null}
      </header>
      <div className="painel">
        <Secao titulo="Reservas">
          {e.reservas.length ? (
            <ul className="linhas">
              {e.reservas.map((r) => (
                <li key={r.id} className="linha">
                  <span className="linha__coluna">
                    {dataCurta(r.inicio)}
                    {r.fim !== r.inicio ? `–${dataCurta(r.fim)}` : ""}
                  </span>
                  <span className="linha__titulo">
                    {r.projetoId ? <Link href={`/app/projetos/${r.projetoId}`}>{r.evento ?? r.projeto}</Link> : (r.evento ?? r.notas ?? "Reserva")}
                  </span>
                  <span className="linha__meta">{r.retornoEm ? "voltou" : r.saidaEm ? "saiu" : ""}</span>
                  {escreve && !r.retornoEm ? (
                    <span className="acoes">
                      {!r.saidaEm ? (
                        <BotaoAcao acao={mudarReservaAcao} campos={{ id: r.id, acao: "saida" }} rotulo="Saiu" classe="glass-btn glass-btn--sm" />
                      ) : (
                        <BotaoAcao acao={mudarReservaAcao} campos={{ id: r.id, acao: "retorno" }} rotulo="Voltou" classe="glass-btn glass-btn--sm" />
                      )}
                      {!r.saidaEm ? (
                        <BotaoAcao
                          acao={mudarReservaAcao}
                          campos={{ id: r.id, acao: "cancelar" }}
                          rotulo="Cancelar"
                          classe="q-limpar"
                          confirmar="Cancelar a reserva?"
                        />
                      ) : null}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="nada">Sem reservas.</p>
          )}
          {escreve && e.estado !== "baixado" ? (
            <details className="secao--abrir">
              <summary>
                <Icone nome="mais" size={16} /> Reservar
              </summary>
              <Formulario
                acao={reservarAcao}
                campos={camposReserva({ projetos })}
                compacto
                ocultos={{ equipamento: e.id }}
                inicial={{ inicio: hoje, fim: hoje }}
                rotulo="Reservar"
              />
              <p className="sutil">Se o período cruzar outra reserva, o Maestro recusa.</p>
            </details>
          ) : null}
        </Secao>
        <div className="painel__lado">
          <Secao titulo="Dados">
            <dl className="dados">
              <dt>Modelo</dt>
              <dd>{e.modelo ?? "—"}</dd>
              <dt>Série</dt>
              <dd>{e.serie ?? "—"}</dd>
              <dt>Compra</dt>
              <dd>{e.compraEm ? dataBr(e.compraEm) : "—"}</dd>
              {e.veValor ? (
                <>
                  <dt>Valor</dt>
                  <dd>{e.valorCents != null ? brl(e.valorCents) : "—"}</dd>
                </>
              ) : null}
              <dt>Onde fica</dt>
              <dd>{e.local ?? "—"}</dd>
              {e.kmL != null ? (
                <>
                  <dt>Consumo</dt>
                  <dd>{String(e.kmL).replace(".", ",")} km/L</dd>
                </>
              ) : null}
            </dl>
            {e.notas ? <p className="observacoes">{e.notas}</p> : null}
          </Secao>
        </div>
      </div>
    </div>
  );
}
