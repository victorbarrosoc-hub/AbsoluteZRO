import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { temAcesso } from "@/lib/auth/acesso";
import { sessaoDaPagina } from "@/lib/auth/pagina";
import { COLUNAS } from "@/lib/quadro/metodo";
import { CONTATO, HUB_URL, ROTAS, SITE_FRASE, SITE_NOME } from "@/lib/site";
import { Icone, type NomeIcone } from "@/components/icones";
import { IPhone, MacBook } from "@/components/inicio/aparelhos";
import { QueroAcesso } from "@/components/inicio/quero-acesso";
import { MaestroSimbolo, ZroSimbolo } from "@/components/marca";
import { SeletorDeTema } from "@/components/tema";
import "./inicio.css";

export const metadata: Metadata = {
  title: { absolute: `${SITE_NOME} · ${SITE_FRASE}` },
  // A página inicial é pública e pode ser achada; o resto do site segue fora da busca (layout raiz e robots.ts).
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
};

/** O que já roda hoje (Fase 1 do plano v2). Cada item só entra aqui quando a tela existe no app. */
const JA: { icone: NomeIcone; nome: string; linha: string }[] = [
  { icone: "aprovacoes", nome: "Aprovação do cliente", linha: "Um link por lote. O cliente comenta no tempo do vídeo e aprova sem conta." },
  { icone: "clientes", nome: "Clientes", linha: "Quem você atende, com projetos e cards em aberto." },
  { icone: "projetos", nome: "Projetos", linha: "Código, prazo e os cards do cliente juntos." },
  { icone: "z", nome: "Z", linha: "A IA da Absolute ZRO em toda tela." },
];

/** O que vem aí, com o selo "Em breve". Só troca de estado quando a fase dele entrar no ar. */
const CHEGANDO: { icone: NomeIcone; nome: string }[] = [
  { icone: "orcamento", nome: "Orçamentos" },
  { icone: "dinheiro", nome: "Financeiro" },
];

/** Cada palavra do título sobe na sua vez (CSS; o espaço fica fora do bloco). */
function palavras(texto: string, de: number) {
  return texto.split(" ").flatMap((p, i) => [
    i > 0 ? " " : "",
    <span key={p + i} className="ihero__palavra" style={{ "--i": de + i } as CSSProperties}>
      {p}
    </span>,
  ]);
}

/**
 * Página inicial pública do Maestro (plano v2 §10), no padrão das irmãs: o símbolo desenhando a pauta, o produto real em
 * aparelhos, só o que existe, e a porta: "Entrar com Absolute ZRO" para quem já tem acesso e "Quero acesso" para os
 * outros. O Maestro está fechado (só a lista de acesso do HUB entra): a página diz isso sem rodeio.
 */
export default async function Inicio() {
  const sessao = await sessaoDaPagina().catch(() => null);
  const dentro = !!sessao && temAcesso(sessao);
  const entrar = dentro ? (
    <a className="glass-btn glass-btn--ink" href={ROTAS.app}>
      Abrir o Maestro
    </a>
  ) : (
    <a className="glass-btn" href={ROTAS.entrar}>
      <ZroSimbolo size={18} /> Entrar com Absolute ZRO
    </a>
  );
  return (
    <div className="inicio">
      <header className="site-topo">
        <a className="site-topo__marca" href="#conteudo" aria-label="Maestro">
          <MaestroSimbolo width={40} />
          <span>Maestro</span>
        </a>
        <div className="site-topo__fim">
          <SeletorDeTema />
          <a className="glass-btn glass-btn--sm" href={dentro ? ROTAS.app : ROTAS.entrar}>
            {dentro ? "Abrir" : "Entrar"}
          </a>
        </div>
      </header>

      <main id="conteudo">
        <section className="ihero" aria-labelledby="ihero-titulo">
          <MaestroSimbolo width={320} className="ihero__simbolo" />
          <span className="selo selo--fechado">
            <i aria-hidden="true" />
            Em teste fechado
          </span>
          <h1 className="ihero__titulo" id="ihero-titulo">
            <span className="ihero__fino">{palavras("A produtora", 0)}</span> <strong>{palavras("inteira", 2)}</strong>{" "}
            <span className="ihero__fino">{palavras("num lugar só.", 3)}</span>
          </h1>
          <p className="apoio ihero__apoio">Pauta, aprovação do cliente e projetos da sua equipe, com a sua conta Absolute ZRO.</p>
          <div className="acoes acoes--centro ihero__acoes">
            {dentro ? null : (
              <a className="glass-btn glass-btn--ink" href="#acesso">
                Quero acesso
              </a>
            )}
            {entrar}
          </div>
          <div className="ihero__aparelhos">
            <MacBook tela={{ nome: "quadro", alt: "O Quadro do Maestro num MacBook, com a produtora de demonstração" }} prioridade />
            <IPhone tela={{ nome: "quadro", alt: "O Quadro do Maestro no iPhone" }} />
          </div>
        </section>

        <section className="isecao" aria-labelledby="quadro-titulo">
          <div className="isecao__cabeca revela">
            <h2 className="isecao__titulo" id="quadro-titulo">
              Oito colunas, <strong>um método.</strong>
            </h2>
            <p className="apoio">Da ideia à entrega, cada card sabe o próximo passo.</p>
          </div>
          <ol className="metodo revela" aria-label="As colunas do Quadro">
            {COLUNAS.map((c, i) => (
              <li key={c.k} data-col={c.k} style={{ "--i": i } as CSSProperties} title={c.desc}>
                <i className="q-ponto" aria-hidden="true" />
                {c.nome}
              </li>
            ))}
          </ol>
        </section>

        <section className="isecao" aria-labelledby="ja-titulo">
          <div className="isecao__cabeca revela">
            <h2 className="isecao__titulo" id="ja-titulo">
              Já <strong>funciona.</strong>
            </h2>
          </div>
          <div className="ija">
            <article className="icartao icartao--tela icartao--largo revela">
              <div className="icartao__texto">
                <Icone nome="aprovacoes" size={22} />
                <h3>{JA[0].nome}</h3>
                <p>{JA[0].linha}</p>
              </div>
              <IPhone tela={{ nome: "aprovacao", alt: "A tela de aprovação do cliente no iPhone, com a versão nova e os comentários no tempo" }} />
            </article>
            <article className="icartao icartao--tela revela">
              <div className="icartao__texto">
                <Icone nome="clientes" size={22} />
                <h3>{JA[1].nome}</h3>
                <p>{JA[1].linha}</p>
              </div>
              <IPhone tela={{ nome: "clientes", alt: "Clientes no iPhone" }} />
            </article>
            <article className="icartao icartao--tela revela">
              <div className="icartao__texto">
                <Icone nome="projetos" size={22} />
                <h3>{JA[2].nome}</h3>
                <p>{JA[2].linha}</p>
              </div>
              <IPhone tela={{ nome: "projetos", alt: "Projetos no iPhone" }} />
            </article>
            <article className="icartao icartao--z revela">
              <span className="icartao__z" aria-hidden="true">
                <Icone nome="z" size={40} />
              </span>
              <div className="icartao__texto">
                <h3>{JA[3].nome}</h3>
                <p>{JA[3].linha}</p>
              </div>
            </article>
          </div>
        </section>

        <section className="isecao" aria-labelledby="vem-titulo">
          <div className="isecao__cabeca revela">
            <h2 className="isecao__titulo" id="vem-titulo">
              Vem <strong>aí.</strong>
            </h2>
          </div>
          <ul className="ivem revela">
            {CHEGANDO.map((c) => (
              <li key={c.nome}>
                <Icone nome={c.icone} size={20} />
                <span>{c.nome}</span>
                <span className="selo">Em breve</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="isecao iacesso" id="acesso" aria-labelledby="acesso-titulo">
          <div className="isecao__cabeca revela">
            <MaestroSimbolo width={96} />
            <h2 className="isecao__titulo" id="acesso-titulo">
              Por convite, <strong>por enquanto.</strong>
            </h2>
            <p className="apoio">Deixe seu e-mail e a gente avisa quando abrir para você.</p>
          </div>
          {dentro ? (
            <div className="acoes acoes--centro">{entrar}</div>
          ) : (
            <>
              <QueroAcesso />
              <p className="sutil iacesso__ja">
                Já tem acesso? <a href={ROTAS.entrar}>Entrar com Absolute ZRO</a>
              </p>
            </>
          )}
        </section>
      </main>

      <footer className="site-rodape">
        <a className="site-rodape__zro" href={HUB_URL}>
          <ZroSimbolo size={20} /> Uma plataforma Absolute ZRO
        </a>
        <a href={`mailto:${CONTATO}`}>{CONTATO}</a>
      </footer>
    </div>
  );
}
