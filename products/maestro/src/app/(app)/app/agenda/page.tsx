import Link from "next/link";
import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { listarEventos, nomeTipoEvento, type Evento } from "@/lib/agenda/servidor";
import { dataCurta, diaDaSemana, ehData, hojeBr, somarDias } from "@/lib/dinheiro";
import { nomeFuncao } from "@/lib/freelas/funcoes";
import { podeEscrever } from "@/lib/papeis";
import { Icone } from "@/components/icones";
import { EstadoVazio } from "@/components/vazio";

export const metadata = { title: "Agenda" };

const DIAS = 28;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Os eventos de cada dia (um evento de vários dias aparece em cada um deles). */
function porDia(eventos: Evento[], de: string, dias: number) {
  const out: { dia: string; eventos: Evento[] }[] = [];
  for (let i = 0; i < dias; i++) {
    const dia = somarDias(de, i);
    const doDia = eventos.filter((e) => e.data <= dia && (e.dataFim ?? e.data) >= dia);
    if (doDia.length) out.push({ dia, eventos: doDia });
  }
  return out;
}

/** A agenda da produtora: diárias, entregas e reuniões das próximas quatro semanas, com a equipe e os conflitos. */
export default async function Agenda({ searchParams }: PageProps<"/app/agenda">) {
  const sessao = await exigirAcessoNaPagina("/app/agenda");
  const sp = await searchParams;
  const hoje = hojeBr();
  const de = ehData(sp.de) ? sp.de : hoje;
  const ate = somarDias(de, DIAS - 1);
  const eventos = await listarEventos({ sub: sessao.sub, orgId: sessao.orgId }, de, ate);
  const dias = porDia(eventos, de, DIAS);
  const escreve = podeEscrever(sessao.papel);
  const conflitos = eventos.filter((e) => e.equipe.some((p) => p.conflitos.length)).length;
  const diarias = eventos.filter((e) => e.tipo === "diaria").length;
  return (
    <div className="pagina">
      <header className="pagina__cabeca pagina__cabeca--acao">
        <h1 className="atitle">
          Sua <strong>agenda.</strong>
        </h1>
        {escreve ? (
          <Link className="glass-btn glass-btn--ink" href="/app/agenda/novo">
            <Icone nome="mais" size={18} /> Novo
          </Link>
        ) : null}
      </header>
      <div className="mes-nav">
        <Link className="q-icone-btn" href={`/app/agenda?de=${somarDias(de, -DIAS)}`} aria-label="Semanas anteriores">
          <Icone nome="voltar" size={16} />
        </Link>
        <strong>
          {dataCurta(de)} a {dataCurta(ate)}
        </strong>
        <Link className="q-icone-btn" href={`/app/agenda?de=${somarDias(de, DIAS)}`} aria-label="Próximas semanas">
          <Icone nome="seta" size={16} />
        </Link>
        {de !== hoje ? (
          <Link className="secao__link" href="/app/agenda">
            Hoje
          </Link>
        ) : null}
        <span className="sutil">
          {diarias} diárias{conflitos ? ` · ${conflitos} com conflito` : ""}
        </span>
      </div>
      {!dias.length ? (
        <EstadoVazio icone="agenda" titulo="Nada nestas semanas" apoio="Diárias, entregas e reuniões, com quem está escalado em cada uma.">
          {escreve ? (
            <Link className="glass-btn glass-btn--ink" href="/app/agenda/novo">
              <Icone nome="mais" size={18} /> Novo
            </Link>
          ) : null}
        </EstadoVazio>
      ) : (
        <ol className="agenda">
          {dias.map(({ dia, eventos: evs }) => (
            <li key={dia} className="agenda__dia" data-hoje={dia === hoje || undefined}>
              <div className="agenda__data">
                <span>{diaDaSemana(dia)}</span>
                <strong>{dia.slice(8, 10)}</strong>
                <span>{MESES[+dia.slice(5, 7) - 1]}</span>
              </div>
              <ul className="agenda__eventos">
                {evs.map((e) => (
                  <li key={e.id}>
                    <Link className="evento" href={`/app/agenda/${e.id}`} data-tipo={e.tipo} data-cor={e.cor ?? undefined}>
                      <span className="evento__topo">
                        <span className="evento__tipo">{nomeTipoEvento(e.tipo)}</span>
                        {e.horaIni ? (
                          <span className="evento__hora">
                            {e.horaIni}
                            {e.horaFim ? `–${e.horaFim}` : ""}
                          </span>
                        ) : null}
                        {e.dataFim ? (
                          <span className="evento__hora">
                            {dataCurta(e.data)} a {dataCurta(e.dataFim)}
                          </span>
                        ) : null}
                      </span>
                      <span className="evento__titulo">{e.titulo}</span>
                      <span className="evento__apoio">{[e.projetoCodigo, e.local].filter(Boolean).join(" · ")}</span>
                      {e.equipe.length || e.equipamentos ? (
                        <span className="evento__equipe">
                          {e.equipe.map((p) => (
                            <span
                              key={p.escalaId}
                              className="chip"
                              data-conflito={p.conflitos.length ? true : undefined}
                              title={p.conflitos.length ? `Também em: ${p.conflitos.map((c) => c.titulo).join(", ")}` : nomeFuncao(p.funcao)}
                            >
                              {p.conflitos.length ? <Icone nome="alerta" size={12} /> : null}
                              {p.nome.split(" ")[0]}
                            </span>
                          ))}
                          {e.equipamentos ? (
                            <span className="chip chip--suave">
                              <Icone nome="inventario" size={12} /> {e.equipamentos}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
