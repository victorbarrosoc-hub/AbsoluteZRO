import { exigirAcessoNaPagina } from "@/lib/auth/pagina";
import { lerAssinatura } from "@/lib/agenda/feed";
import { estadoDaConexao, urlConexoes, type EstadoDaConexao } from "@/lib/agenda/google";
import { lerPrefs } from "@/lib/agenda/sincronia";
import { dataBr } from "@/lib/dinheiro";
import { AgendaGoogle } from "@/components/agenda-google";
import { AssinaturaAgenda } from "@/components/assinatura-agenda";
import { CabecaForm } from "@/components/form";
import { Icone } from "@/components/icones";
import "../../../../agenda-google.css";

export const metadata = { title: "Agenda" };

const PASSOS = [
  {
    app: "iPhone e Mac",
    passos:
      "Toque em “Abrir no calendário” e confirme “Assinar”. Ou: Ajustes → Calendário → Contas → Adicionar → Outra → Calendário Assinado, e cole o endereço.",
  },
  { app: "Google Agenda", passos: "No computador: Outras agendas → + → Do URL, cole o endereço e “Adicionar agenda”. Aparece no celular em seguida." },
  { app: "Outlook", passos: "Calendário → Adicionar calendário → Assinar da Web, cole o endereço e dê um nome." },
];

const LINHA: Record<EstadoDaConexao["estado"], string> = {
  ok: "Conectada",
  sem_conexao: "Não conectada",
  app_desligado: "Maestro desligado nas Conexões",
  reconectar_zro: "Entre de novo para ligar",
  erro: "Não deu para ler agora",
  indisponivel: "Não deu para ler agora",
};

/**
 * Agenda: o Google Agenda pelas Conexões da Absolute ZRO (ADR 0026 do HUB, drizzle/0021: a pessoa conecta uma vez na
 * conta e escolhe aqui o que vai) e o endereço secreto (.ics, drizzle/0017) para qualquer calendário. Os dois mostram
 * só o que a pessoa vê no Maestro.
 */
export default async function AgendaAjustes() {
  const s = await exigirAcessoNaPagina("/app/ajustes/agenda");
  const ctx = { sub: s.sub, orgId: s.orgId };
  const [a, prefs, conexao] = await Promise.all([
    lerAssinatura(ctx),
    lerPrefs(ctx),
    s.temTokens ? estadoDaConexao(s.id) : Promise.resolve<EstadoDaConexao>({ estado: "reconectar_zro", conta: null, conectar: urlConexoes() }),
  ]);
  const ok = conexao.estado === "ok";
  return (
    <div className="pagina">
      <CabecaForm voltar="/app/ajustes" titulo={<strong>Agenda</strong>}>
        <p className="apoio">Diárias, prazos e retornos no seu calendário. Só o que você vê no Maestro.</p>
      </CabecaForm>

      <section className="ficha agenda-google__ficha" aria-label="Google Agenda" data-estado={conexao.estado}>
        <div className="assinatura__estado">
          <Icone nome="agenda" size={20} />
          <div>
            <strong>Google Agenda</strong>
            <span className="sutil">{ok && conexao.conta ? `Conectada · ${conexao.conta}` : LINHA[conexao.estado]}</span>
          </div>
          {ok ? (
            <span className="selo" data-status="ok">
              <i aria-hidden="true" />
              Conectada
            </span>
          ) : null}
        </div>
        {ok ? (
          <>
            <AgendaGoogle ligado={prefs.ligado} tipos={prefs.tipos} />
            {prefs.ligado ? (
              <p className="sutil agenda-google__rodape">
                {[
                  prefs.enviadoEm ? `Último envio em ${dataBr(prefs.enviadoEm.slice(0, 10))}` : "Nada enviado ainda",
                  prefs.pendentes ? `${prefs.pendentes} na fila` : null,
                  prefs.estado === "erro" ? "o Google ou a Absolute ZRO falhou; tentamos de novo" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
          </>
        ) : conexao.estado === "reconectar_zro" ? (
          <div className="acoes">
            <a className="glass-btn glass-btn--ink" href="/api/zro/entrar?volta=%2Fapp%2Fajustes%2Fagenda">
              Entrar de novo
            </a>
          </div>
        ) : conexao.estado === "sem_conexao" || conexao.estado === "app_desligado" ? (
          <div className="acoes">
            <a className="glass-btn glass-btn--ink" href={conexao.conectar} target="_blank" rel="noopener noreferrer">
              Abrir Conexões <Icone nome="externo" size={14} />
            </a>
            {prefs.ligado && prefs.pendentes ? <span className="sutil">{prefs.pendentes} esperando</span> : null}
          </div>
        ) : (
          <p className="sutil">A Absolute ZRO não respondeu agora. Volte daqui a pouco.</p>
        )}
      </section>

      <section className="ficha" aria-label="Endereço da agenda">
        <div className="assinatura__estado">
          <Icone nome="link" size={20} />
          <div>
            <strong>{a.ativa ? "Endereço ativo" : "Endereço da agenda"}</strong>
            <span className="sutil">
              {a.ativa
                ? [`criado em ${dataBr(a.criadaEm?.slice(0, 10))}`, a.usadaEm ? `lido em ${dataBr(a.usadaEm.slice(0, 10))}` : "ainda não lido"].join(" · ")
                : "Para qualquer calendário, sem conectar conta."}
            </span>
          </div>
        </div>
        <AssinaturaAgenda ativa={a.ativa} />
      </section>
      <details className="ficha agenda-google__passos">
        <summary className="ficha__titulo">Como assinar o endereço</summary>
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
      </details>
    </div>
  );
}
