import type { Metadata } from "next";
import Link from "next/link";
import { temAcesso } from "@/lib/auth/acesso";
import { exigirFreelaNaPagina } from "@/lib/auth/pagina";
import { brl, hojeBr } from "@/lib/dinheiro";
import { horario, periodo, podeResponder, quando, separar, trabalhosDoFreela, type Trabalho } from "@/lib/freelas/area";
import { nomeFuncao } from "@/lib/freelas/funcoes";
import { ROTAS } from "@/lib/site";
import { AreaDoFreela, corDaProdutora, EstadoDoTrabalho, MarcaPequena } from "@/components/freelas/area";
import { Icone } from "@/components/icones";
import { MaestroSimbolo } from "@/components/marca";
import "../trabalhos.css";

export const metadata: Metadata = { title: "Seus trabalhos", robots: { index: false, follow: false } };

function CartaoDoTrabalho({ t, hoje }: { t: Trabalho; hoje: string }) {
  const hora = horario(t.horaIni, t.horaFim);
  const perto = quando(t.inicio, t.fim, hoje);
  const total = t.valorCents + t.aluguelCents;
  return (
    <li>
      <Link className="ft-cartao" href={`${ROTAS.trabalhos}/${t.id}`} data-passou={t.fim < hoje ? "" : undefined}>
        <span className="ft-dia" aria-hidden="true">
          <b>{+t.inicio.slice(8, 10)}</b>
          <span>{periodo(t.inicio, t.inicio).split(", ")[0]}</span>
        </span>
        <span className="ft-cartao__corpo">
          <span className="ft-cartao__titulo">{t.titulo}</span>
          <span className="ft-cartao__meta">{[t.cliente, nomeFuncao(t.funcao)].filter(Boolean).join(" · ")}</span>
          <span className="ft-cartao__meta">
            {perto ? <b>{perto}</b> : null}
            {perto ? " · " : null}
            {periodo(t.inicio, t.fim)}
            {hora ? ` · ${hora}` : ""}
          </span>
          {t.local ? (
            <span className="ft-cartao__meta ft-cartao__local">
              <Icone nome="alvo" size={13} /> {t.local}
            </span>
          ) : null}
          <span className="ft-cartao__fim">
            <EstadoDoTrabalho resposta={t.resposta} aberto={podeResponder(t, hoje)} />
            {total > 0 ? <span className="ft-valor num">{brl(total)}</span> : null}
            {t.pago ? (
              <span className="ft-estado" data-status="ok">
                <i aria-hidden="true" />
                Pago
              </span>
            ) : null}
            {t.entrega ? <Icone nome="nuvem" size={15} className="ft-cartao__icone" /> : null}
          </span>
        </span>
        <Icone nome="seta" size={16} className="ft-cartao__seta" />
      </Link>
    </li>
  );
}

/**
 * "Seus trabalhos" (drizzle/0037): o freela ligado à conta vê, por produtora, as escalas em que está. Próximos primeiro;
 * os que passaram ficam recolhidos. Só o que é dele (o banco confere pelo `sub` da sessão).
 */
export default async function SeusTrabalhos() {
  const { sessao, produtoras: ligadas } = await exigirFreelaNaPagina(ROTAS.trabalhos);
  const produtoras = await trabalhosDoFreela(sessao.sub);
  const hoje = hojeBr();
  const grupos = produtoras
    .map((p) => ({ ...p, ...separar(p.trabalhos, hoje) }))
    .sort((a, b) => (a.proximos[0]?.inicio ?? "9999").localeCompare(b.proximos[0]?.inicio ?? "9999") || a.marca.nome.localeCompare(b.marca.nome));
  const vazio = grupos.every((g) => !g.trabalhos.length);
  return (
    <AreaDoFreela sessao={sessao} maestro={temAcesso(sessao)}>
      <h1 className="ft-titulo">
        Seus <strong>trabalhos.</strong>
      </h1>
      {vazio ? (
        <section className="ft-vazio" aria-label="Nenhum trabalho">
          <MaestroSimbolo width={84} />
          <p className="ft-vazio__frase">Nenhum trabalho por enquanto.</p>
          <p className="ft-vazio__apoio">Quando te escalarem, aparece aqui.</p>
          <ul className="ft-vazio__marcas" aria-label="Produtoras">
            {ligadas.map((p) => (
              <li key={p.org} style={corDaProdutora(p.cor)}>
                <MarcaPequena marca={p} />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        grupos.map((g) => (
          <section key={g.org} className="ft-produtora" style={corDaProdutora(g.marca.cor)} aria-label={g.marca.nome}>
            <h2 className="ft-produtora__cabeca">
              <MarcaPequena marca={g.marca} />
            </h2>
            {g.proximos.length ? (
              <ul className="ft-lista">
                {g.proximos.map((t) => (
                  <CartaoDoTrabalho key={t.id} t={t} hoje={hoje} />
                ))}
              </ul>
            ) : (
              <p className="ft-nada">Nada marcado.</p>
            )}
            {g.anteriores.length ? (
              <details className="ft-anteriores">
                <summary>
                  Anteriores <span className="num">{g.anteriores.length}</span>
                  <Icone nome="abaixo" size={14} />
                </summary>
                <ul className="ft-lista">
                  {g.anteriores.map((t) => (
                    <CartaoDoTrabalho key={t.id} t={t} hoje={hoje} />
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        ))
      )}
    </AreaDoFreela>
  );
}
