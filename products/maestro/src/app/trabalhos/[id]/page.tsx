import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { temAcesso } from "@/lib/auth/acesso";
import { exigirFreelaNaPagina } from "@/lib/auth/pagina";
import { brl, hojeBr } from "@/lib/dinheiro";
import { horario, periodo, podeResponder, quando, trabalhoDoFreela } from "@/lib/freelas/area";
import { nomeFuncao } from "@/lib/freelas/funcoes";
import { whatsappDaProdutora } from "@/lib/publico/porta";
import { ROTAS } from "@/lib/site";
import { AreaDoFreela, corDaProdutora, EstadoDoTrabalho, MarcaPequena } from "@/components/freelas/area";
import { Icone } from "@/components/icones";
import { responderAcao } from "../acoes";
import "../../trabalhos.css";

export const metadata: Metadata = { title: "Trabalho", robots: { index: false, follow: false } };

const ERROS: Record<string, string> = { passou: "Esse trabalho já passou.", resposta: "Escolha confirmar ou recusar." };

/**
 * Um trabalho, para o freela (drizzle/0037): quando, onde, a função, o valor dele, o recado da produção, o link de
 * entrega e o contato da produtora; confirmar ou recusar enquanto não passou. Não é dele (ou não existe) = 404.
 */
export default async function Trabalho({ params, searchParams }: PageProps<"/trabalhos/[id]">) {
  const { id } = await params;
  const erro = (await searchParams).erro;
  const { sessao } = await exigirFreelaNaPagina(`${ROTAS.trabalhos}/${id}`);
  const t = await trabalhoDoFreela(sessao.sub, id);
  if (!t) notFound();
  const hoje = hojeBr();
  const aberto = podeResponder(t, hoje);
  const hora = horario(t.horaIni, t.horaFim);
  const perto = quando(t.inicio, t.fim, hoje);
  const total = t.valorCents + t.aluguelCents;
  const whats = whatsappDaProdutora(t.contato.telefone, `Oi! Sobre ${t.titulo} (${periodo(t.inicio, t.fim)}).`);
  const mapa = t.local ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.local)}` : null;
  const mensagem = typeof erro === "string" ? ERROS[erro] : undefined;
  return (
    <AreaDoFreela sessao={sessao} maestro={temAcesso(sessao)}>
      <div className="ft-ficha" style={corDaProdutora(t.marca.cor)}>
        <Link className="voltar" href={ROTAS.trabalhos}>
          <Icone nome="voltar" size={16} /> Seus trabalhos
        </Link>
        <MarcaPequena marca={t.marca} />
        <h1 className="ft-ficha__titulo">{t.titulo}</h1>
        {t.cliente || t.projeto ? <p className="ft-ficha__apoio">{[t.cliente, t.projeto].filter(Boolean).join(" · ")}</p> : null}
        <div className="ft-ficha__estado">
          <EstadoDoTrabalho resposta={t.resposta} aberto={aberto} />
          {t.pago ? (
            <span className="ft-estado" data-status="ok">
              <i aria-hidden="true" />
              Pago
            </span>
          ) : null}
        </div>

        <dl className="ft-fatos">
          <div>
            <dt>
              <Icone nome="agenda" size={16} /> Quando
            </dt>
            <dd>
              {periodo(t.inicio, t.fim)}
              {perto ? <small>{perto}</small> : null}
            </dd>
          </div>
          {hora ? (
            <div>
              <dt>
                <Icone nome="relogio" size={16} /> Horário
              </dt>
              <dd>{hora}</dd>
            </div>
          ) : null}
          {t.local ? (
            <div className="ft-fatos__largo">
              <dt>
                <Icone nome="alvo" size={16} /> Onde
              </dt>
              <dd>
                {mapa ? (
                  <a href={mapa} target="_blank" rel="noreferrer">
                    {t.local}
                  </a>
                ) : (
                  t.local
                )}
              </dd>
            </div>
          ) : null}
          <div>
            <dt>
              <Icone nome="camera" size={16} /> Função
            </dt>
            <dd>{nomeFuncao(t.funcao)}</dd>
          </div>
          {total > 0 ? (
            <div>
              <dt>
                <Icone nome="dinheiro" size={16} /> Seu valor
              </dt>
              <dd className="num">
                {brl(total)}
                {t.diariaCents != null && t.dias > 1 ? (
                  <small>
                    {t.dias} × {brl(t.diariaCents)}
                  </small>
                ) : null}
                {t.aluguelCents > 0 ? <small>com {brl(t.aluguelCents)} do seu equipamento</small> : null}
              </dd>
            </div>
          ) : null}
        </dl>

        {t.recado ? (
          <section className="ft-recado" aria-label="Da produção">
            <h2>Da produção</h2>
            <p>{t.recado}</p>
          </section>
        ) : null}

        {t.entrega || whats || t.contato.email ? (
          <div className="ft-acoes">
            {t.entrega ? (
              <a className="glass-btn glass-btn--ink" href={t.entrega} target="_blank" rel="noreferrer">
                <Icone nome="nuvem" size={16} /> Enviar material
              </a>
            ) : null}
            {whats ? (
              <a className="glass-btn" href={whats} target="_blank" rel="noreferrer">
                <Icone nome="whatsapp" size={16} /> Falar com a produção
              </a>
            ) : t.contato.email ? (
              <a className="glass-btn" href={`mailto:${t.contato.email}`}>
                <Icone nome="email" size={16} /> Falar com a produção
              </a>
            ) : null}
          </div>
        ) : null}

        {aberto ? (
          <form className="ft-responder" action={responderAcao} aria-label="Sua resposta">
            <input type="hidden" name="id" value={t.id} />
            <p>{t.resposta === "confirmado" ? "Você confirmou." : t.resposta === "recusado" ? "Você recusou." : "Você vai?"}</p>
            <div className="ft-responder__botoes">
              <button
                type="submit"
                name="resposta"
                value="confirmado"
                className={`glass-btn${t.resposta === "confirmado" ? "" : " glass-btn--ink"}`}
                aria-pressed={t.resposta === "confirmado"}
                disabled={t.resposta === "confirmado"}
              >
                <Icone nome="check" size={16} /> Confirmar
              </button>
              <button
                type="submit"
                name="resposta"
                value="recusado"
                className="glass-btn"
                aria-pressed={t.resposta === "recusado"}
                disabled={t.resposta === "recusado"}
              >
                <Icone nome="fechar" size={16} /> Recusar
              </button>
            </div>
            {mensagem ? (
              <p className="ft-responder__erro" role="alert">
                {mensagem}
              </p>
            ) : null}
          </form>
        ) : null}
      </div>
    </AreaDoFreela>
  );
}
