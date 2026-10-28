import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { lerAssinatura } from "@/lib/agenda/feed";
import { dataBr } from "@/lib/dinheiro";
import { AssinaturaAgenda } from "@/components/assinatura-agenda";
import { CabecaForm } from "@/components/form";
import { Icone } from "@/components/icones";

export const metadata = { title: "Agenda no celular" };

const PASSOS = [
  {
    app: "iPhone e Mac",
    passos:
      "Toque em “Abrir no calendário” e confirme “Assinar”. Ou: Ajustes → Calendário → Contas → Adicionar → Outra → Calendário Assinado, e cole o endereço.",
  },
  { app: "Google Agenda", passos: "No computador: Outras agendas → + → Do URL, cole o endereço e “Adicionar agenda”. Aparece no celular em seguida." },
  { app: "Outlook", passos: "Calendário → Adicionar calendário → Assinar da Web, cole o endereço e dê um nome." },
];

/**
 * Agenda no celular (estudo MakersHub §4.6, drizzle/0017): o endereço secreto (.ics) da pessoa, com diárias, entregas,
 * reuniões, escala, prazos dos cards, vencimento das aprovações e retornos, só o que ela vê. Sincronia de duas vias com
 * o Google não existe: o calendário só lê.
 */
export default async function AgendaNoCelular() {
  const s = await exigirAcessoNaPagina("/app/ajustes/agenda");
  const a = await lerAssinatura({ sub: s.sub, orgId: s.orgId });
  return (
    <div className="pagina">
      <CabecaForm voltar="/app/ajustes" titulo={<strong>Agenda no celular</strong>}>
        <p className="apoio">Diárias, prazos e retornos no seu calendário. Só o que você vê no Maestro.</p>
      </CabecaForm>
      <section className="ficha" aria-label="Endereço da agenda">
        <div className="assinatura__estado">
          <Icone nome="agenda" size={20} />
          <div>
            <strong>{a.ativa ? "Endereço ativo" : "Sem endereço"}</strong>
            <span className="sutil">
              {a.ativa
                ? [`criado em ${dataBr(a.criadaEm?.slice(0, 10))}`, a.usadaEm ? `lido em ${dataBr(a.usadaEm.slice(0, 10))}` : "ainda não lido"].join(" · ")
                : "Gere um endereço e assine no seu calendário."}
            </span>
          </div>
        </div>
        <AssinaturaAgenda ativa={a.ativa} />
      </section>
      <section className="ficha" aria-label="Como assinar">
        <strong className="ficha__titulo">Como assinar</strong>
        <ul className="assinatura__passos">
          {PASSOS.map((p) => (
            <li key={p.app}>
              <b>{p.app}</b>
              <span>{p.passos}</span>
            </li>
          ))}
        </ul>
        <p className="sutil">
          O calendário atualiza sozinho (de hora em hora, no ritmo de cada aplicativo). Quem tiver o endereço vê a sua agenda: não compartilhe; se vazar,
          troque.
        </p>
      </section>
    </div>
  );
}
