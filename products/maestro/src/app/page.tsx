import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Image from "next/image";
import { temAcesso } from "@/lib/auth/acesso";
import { sessaoDaPagina } from "@/lib/auth/pagina";
import { COLUNAS } from "@/lib/quadro/metodo";
import { CENTRAL_ZRO, downloadsDoMaestro } from "@/lib/desktop";
import { CONTATO, CRIAR_CONTA_ZRO, ENTRAR_ZRO, HUB_URL, MAESTRO_LANCADO, ROTAS, SITE_FRASE, SITE_NOME } from "@/lib/site";
import { Icone, type NomeIcone } from "@/components/icones";
import { Abas } from "@/components/inicio/abas";
import { IPhone, MacBook, Recorte } from "@/components/inicio/aparelhos";
import { DemoAcessos, DemoViagem } from "@/components/inicio/demos";
import { InstalarNoCelular } from "@/components/instalar";
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

/** Números do próprio produto (src/lib/quadro/metodo.ts, revisao, roteiro/vistas, acessos.ts). */
const NUMEROS: { n: string; rotulo: string }[] = [
  { n: String(COLUNAS.length), rotulo: "colunas do método" },
  { n: "1", rotulo: "link por lote, sem conta" },
  { n: "4", rotulo: "vistas do roteiro" },
  { n: "6", rotulo: "áreas de acesso por pessoa" },
];

/**
 * As ferramentas de dentro, uma por aba, cada uma com a tela de verdade no MacBook e no iPhone. Só entra aqui o que já
 * roda no app; `pontos` são 3 marcas curtas (o resto fica no app).
 */
const FERRAMENTAS: {
  id: string;
  aba: string;
  icone: NomeIcone;
  fino: string;
  forte: string;
  linha: string;
  pontos: string[];
  mac: { nome: string; alt: string };
  iphone: { nome: string; alt: string };
}[] = [
  {
    id: "quadro",
    aba: "Quadro",
    icone: "quadro",
    fino: "A pauta em",
    forte: "oito colunas.",
    linha: "Da ideia à entrega, cada card sabe o próximo passo.",
    pontos: ["Arrastar e soltar", "Prazo e responsável", "Colunas suas"],
    mac: { nome: "quadro", alt: "O Quadro num MacBook: as oito colunas com os cards da produtora de demonstração" },
    iphone: { nome: "quadro", alt: "O Quadro no iPhone, uma coluna por vez" },
  },
  {
    id: "aprovacao",
    aba: "Aprovação",
    icone: "aprovacoes",
    fino: "O cliente aprova",
    forte: "pelo link.",
    linha: "Sem conta: comenta no tempo do vídeo e decide.",
    pontos: ["Comentário no tempo", "PIN opcional", "O card anda sozinho"],
    mac: { nome: "aprovacao", alt: "Um lote de aprovação no MacBook: o vídeo, as versões e os comentários com tempo" },
    iphone: { nome: "aprovacao", alt: "O link do cliente no iPhone, com o vídeo e a decisão" },
  },
  {
    id: "orcamento",
    aba: "Orçamento",
    icone: "orcamento",
    fino: "Orçamento",
    forte: "com contrato.",
    linha: "Tabela de preços, timbrado em PDF e aceite online.",
    pontos: ["Timbrado em PDF", "Contrato junto", "Parcelas no caixa"],
    mac: { nome: "orcamento", alt: "Um orçamento no MacBook, com o link para o cliente e o contrato indo junto" },
    iphone: { nome: "orcamento", alt: "O orçamento no iPhone, com as parcelas do link" },
  },
  {
    id: "equipe",
    aba: "Equipe",
    icone: "freelas",
    fino: "Equipe e",
    forte: "diárias.",
    linha: "Escala, equipamento e conflito de agenda à vista.",
    pontos: ["Ordem do dia", "Conflito avisado", "Agenda no celular"],
    mac: { nome: "agenda", alt: "A agenda no MacBook: diárias com a equipe e o aviso de conflito" },
    iphone: { nome: "equipe", alt: "Uma diária no iPhone, com a equipe escalada e o equipamento" },
  },
  {
    id: "financeiro",
    aba: "Financeiro",
    icone: "dinheiro",
    fino: "O caixa",
    forte: "em dia.",
    linha: "A pagar, a receber, fluxo e a meta do mês.",
    pontos: ["Diária vira a pagar", "Meta do mês", "Margem por projeto"],
    mac: { nome: "financeiro", alt: "O fluxo de caixa no MacBook, com o resultado por projeto" },
    iphone: { nome: "financeiro", alt: "Os números do mês no iPhone, com a meta" },
  },
  {
    id: "criacao",
    aba: "Criação",
    icone: "criacao",
    fino: "Do roteiro",
    forte: "ao set.",
    linha: "Roteiro com tempo, teleprompter e o Fluxo das referências.",
    pontos: ["Literário e técnico", "Teleprompter", "Fluxo"],
    mac: { nome: "roteiro-literario", alt: "O editor de roteiro no MacBook, com cenas, falas e o tempo" },
    iphone: { nome: "roteiro-teleprompter", alt: "O Teleprompter do roteiro no iPhone" },
  },
];

const VISTAS = [
  { id: "literario", rotulo: "Literário", alt: "O roteiro na vista Literário: cena a cena, como se lê" },
  { id: "tecnico", rotulo: "Técnico", alt: "O roteiro na vista Técnico: imagem, lettering, áudio e tempo em colunas" },
  { id: "teleprompter", rotulo: "Teleprompter", alt: "O roteiro na vista Teleprompter: só as falas, por pessoa" },
  { id: "edicao", rotulo: "Edição", alt: "O roteiro na vista Edição: cada bloco com o tempo, para a ilha" },
];

/** O ecossistema: o que o Maestro reconhece porque é a mesma conta Absolute ZRO. */
const JUNTO: { icone: NomeIcone; nome: string; linha: string }[] = [
  { icone: "balao", nome: "Set", linha: "A conversa da equipe, em todos os apps." },
  { icone: "pasta", nome: "Drive", linha: "As pastas do projeto, pelo SOBEDESCE." },
  { icone: "agenda", nome: "Google Agenda", linha: "Diárias e prazos no seu calendário." },
  { icone: "letra", nome: "TPeasy", linha: "O roteiro direto no teleprompter." },
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
 * Página inicial pública do Maestro (plano v2 §10), no ritmo da do SOBEDESCE: o símbolo desenhando a pauta, o produto
 * real em aparelhos, números do produto, as ferramentas numa aba cada, uma foto de set, os detalhes em cartões de mexer
 * e a porta. Lançado (`MAESTRO_LANCADO`, no ar para toda conta Absolute ZRO; sem selo de Beta, decisão do titular de
 * 30/10/2026): "Criar conta" e "Entrar com Absolute ZRO"
 * direto no login único, o app no celular e, se o app de computador estiver na central, "Use no computador com a
 * Absolute ZRO" (desde 01/11/2026 o computador é só pela central: nada de instalador aqui). Antes do lançamento:
 * "Em teste fechado", "Quero acesso" (lista de espera) e "Entrar" para quem já está na lista do HUB. Quem entra é
 * sempre o gate do HUB (temAcesso), nunca esta página.
 */
export default async function Inicio() {
  const sessao = await sessaoDaPagina().catch(() => null);
  const dentro = !!sessao && temAcesso(sessao);
  const downloads = MAESTRO_LANCADO ? await downloadsDoMaestro() : [];
  const entrar = dentro ? (
    <a className="glass-btn glass-btn--ink" href={ROTAS.app}>
      Abrir o Maestro
    </a>
  ) : (
    <a className="glass-btn" href={MAESTRO_LANCADO ? ENTRAR_ZRO : ROTAS.entrar}>
      <ZroSimbolo size={18} /> Entrar com Absolute ZRO
    </a>
  );
  const criarConta = dentro ? null : (
    <a className="glass-btn glass-btn--ink" href={CRIAR_CONTA_ZRO}>
      Criar conta
    </a>
  );
  // O que ainda não existe, com o selo "Em breve" (o app de computador sai daqui quando está na central).
  const chegando: { icone: NomeIcone; nome: string }[] = [
    ...(downloads.length ? [] : [{ icone: "computador" as const, nome: "App de computador" }]),
    { icone: "link", nome: "Domínio próprio" },
  ];
  return (
    <div className="inicio">
      <header className="site-topo">
        <a className="site-topo__marca" href="#conteudo" aria-label="Maestro">
          <MaestroSimbolo width={32} />
          <span>Maestro</span>
        </a>
        <nav className="site-topo__nav" aria-label="Nesta página">
          <a href="#ferramentas">Ferramentas</a>
          <a href="#detalhes">Detalhes</a>
          <a href="#acesso">Conta</a>
        </nav>
        <div className="site-topo__fim">
          <SeletorDeTema />
          <a className="glass-btn glass-btn--sm glass-btn--ink" href={dentro ? ROTAS.app : MAESTRO_LANCADO ? ENTRAR_ZRO : ROTAS.entrar}>
            {dentro ? "Abrir" : "Entrar"}
          </a>
        </div>
      </header>

      <main id="conteudo">
        <section className="ihero" aria-labelledby="ihero-titulo">
          <MaestroSimbolo width={320} className="ihero__simbolo" />
          {MAESTRO_LANCADO ? null : (
            <span className="selo selo--fechado">
              <i aria-hidden="true" />
              Em teste fechado
            </span>
          )}
          <h1 className="ihero__titulo" id="ihero-titulo">
            <span className="ihero__fino">{palavras("A produtora", 0)}</span> <strong>{palavras("inteira", 2)}</strong>{" "}
            <span className="ihero__fino">{palavras("num lugar só.", 3)}</span>
          </h1>
          <p className="apoio ihero__apoio">Pauta, aprovação, orçamento, equipe e caixa, com a sua conta Absolute ZRO.</p>
          <div className="acoes acoes--centro ihero__acoes">
            {dentro ? null : MAESTRO_LANCADO ? (
              criarConta
            ) : (
              <a className="glass-btn glass-btn--ink" href="#acesso">
                Quero acesso
              </a>
            )}
            {entrar}
          </div>
          <div className="ihero__aparelhos">
            <MacBook tela={{ nome: "quadro", alt: "O Quadro do Maestro num MacBook, com a produtora de demonstração" }} prioridade />
            <IPhone tela={{ nome: "hoje", alt: "O Hoje do Maestro no iPhone: agenda, prazos e quem retornar" }} />
          </div>
        </section>

        <section className="inumeros" aria-label="O Maestro em números">
          <dl>
            {NUMEROS.map((x, i) => (
              <div key={x.rotulo} className="revela" style={{ "--i": i } as CSSProperties}>
                <dt>{x.rotulo}</dt>
                <dd>{x.n}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="isecao" id="ferramentas" aria-labelledby="ferramentas-titulo">
          <div className="isecao__cabeca revela">
            <p className="isecao__sobre">Por dentro</p>
            <h2 className="isecao__titulo" id="ferramentas-titulo">
              Tudo o que a produtora <strong>faz.</strong>
            </h2>
          </div>
          <Abas
            prefixo="ferr"
            rotulo="Ferramentas do Maestro"
            className="itour revela"
            abas={FERRAMENTAS.map((f) => ({
              id: f.id,
              rotulo: f.aba,
              painel: (
                <div className="itour__painel">
                  <div className="itour__texto">
                    <span className="itour__icone" aria-hidden="true">
                      <Icone nome={f.icone} size={22} />
                    </span>
                    <h3>
                      {f.fino} <strong>{f.forte}</strong>
                    </h3>
                    <p>{f.linha}</p>
                    {f.id === "quadro" ? (
                      <ol className="metodo" aria-label="As colunas do Quadro">
                        {COLUNAS.map((c) => (
                          <li key={c.k} data-col={c.k} title={c.desc}>
                            <i className="q-ponto" aria-hidden="true" />
                            {c.nome}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <ul className="itour__pontos">
                        {f.pontos.map((p) => (
                          <li key={p}>
                            <Icone nome="check" size={14} />
                            {p}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="itour__aparelhos">
                    <MacBook tela={f.mac} sizes="(max-width: 900px) 90vw, 820px" />
                    <IPhone tela={f.iphone} sizes="(max-width: 900px) 30vw, 220px" />
                  </div>
                </div>
              ),
            }))}
          />
        </section>

        <section className="ifoto" aria-labelledby="foto-titulo">
          <Image
            className="ifoto__img"
            src="/inicio/set-2400.webp"
            alt="Uma equipe pequena filmando num cafezal ao entardecer: câmera no tripé, som com a vara e a direção olhando o celular"
            fill
            sizes="100vw"
          />
          <div className="ifoto__texto revela">
            <h2 id="foto-titulo">
              Feito para quem <strong>produz.</strong>
            </h2>
            <p>Do pedido do cliente ao pagamento do freela.</p>
          </div>
        </section>

        <section className="isecao" id="detalhes" aria-labelledby="detalhes-titulo">
          <div className="isecao__cabeca revela">
            <p className="isecao__sobre">Detalhes</p>
            <h2 className="isecao__titulo" id="detalhes-titulo">
              O que poupa <strong>o seu dia.</strong>
            </h2>
          </div>
          <div className="ibento">
            <article className="icartao icartao--largo icartao--viagem revela">
              <div className="icartao__texto">
                <p className="icartao__sobre">
                  <Icone nome="carro" size={16} /> No orçamento
                </p>
                <h3>Viagem calculada.</h3>
                <p>Km pela estrada e o litro da semana na ANP.</p>
                <DemoViagem />
              </div>
              <Recorte
                tela={{ nome: "viagem-mac", alt: "A folha Deslocamento do orçamento: São Paulo a Campinas, SUV compacto, gasolina da semana e o custo" }}
                larg={1020}
                alt={1431}
                sizes="(max-width: 900px) 90vw, 420px"
                className="recorte--viagem"
              />
            </article>

            <article className="icartao icartao--largo icartao--vistas revela">
              <div className="icartao__texto">
                <p className="icartao__sobre">
                  <Icone nome="criacao" size={16} /> Criação
                </p>
                <h3>Um roteiro, quatro vistas.</h3>
                <p>Escreva uma vez; a direção, o set e a ilha leem do jeito deles.</p>
              </div>
              <Abas
                prefixo="vistas"
                rotulo="Vistas do roteiro"
                className="iabas--vistas"
                abas={VISTAS.map((v) => ({
                  id: v.id,
                  rotulo: v.rotulo,
                  painel: <Recorte tela={{ nome: `roteiro-${v.id}-mac`, alt: v.alt }} larg={2160} alt={1350} sizes="(max-width: 900px) 92vw, 1100px" />,
                }))}
              />
            </article>

            <article className="icartao icartao--fluxo revela">
              <div className="icartao__texto">
                <p className="icartao__sobre">
                  <Icone nome="fluxo" size={16} /> Fluxo
                </p>
                <h3>As referências num quadro.</h3>
                <p>Fotos, notas, o roteiro e o card, ligados.</p>
              </div>
              <Recorte
                tela={{ nome: "fluxo-mac", alt: "Um Fluxo no MacBook: fotos de referência, notas em seções, o roteiro e o card ligados" }}
                larg={2160}
                alt={1350}
                sizes="(max-width: 900px) 90vw, 560px"
              />
            </article>

            <article className="icartao icartao--acessos revela">
              <div className="icartao__texto">
                <p className="icartao__sobre">
                  <Icone nome="cadeado" size={16} /> Acessos
                </p>
                <h3>Cada um vê o que precisa.</h3>
                <p>O valor fica com quem decide; a administração ajusta por pessoa.</p>
              </div>
              <DemoAcessos />
            </article>

            <article className="icartao icartao--junto revela">
              <div className="icartao__texto">
                <p className="icartao__sobre">
                  <ZroSimbolo size={16} /> Uma conta
                </p>
                <h3>Os apps se reconhecem.</h3>
              </div>
              <ul className="ijunto">
                {JUNTO.map((j) => (
                  <li key={j.nome}>
                    <span className="ijunto__icone" aria-hidden="true">
                      <Icone nome={j.icone} size={20} />
                    </span>
                    <strong>{j.nome}</strong>
                    <span>{j.linha}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        {MAESTRO_LANCADO ? (
          <section className="isecao" id="celular" aria-label="No celular e no computador">
            <div className="revela">
              <InstalarNoCelular variante="pagina" />
            </div>
            {downloads.length ? (
              <div className="isecao__cabeca revela" id="computador">
                <h2 className="isecao__titulo">
                  No <strong>computador.</strong>
                </h2>
                <div className="idesktop">
                  <p className="idesktop__titulo">
                    <ZroSimbolo size={20} /> Use no computador com a Absolute ZRO
                  </p>
                  <ol className="idesktop__passos">
                    <li>Baixe a Absolute ZRO</li>
                    <li>Entre com a sua conta</li>
                    <li>Instale o Maestro por ela</li>
                  </ol>
                  <a className="glass-btn glass-btn--ink" href={CENTRAL_ZRO}>
                    Baixar a Absolute ZRO
                  </a>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="isecao" aria-labelledby="vem-titulo">
          <div className="isecao__cabeca revela">
            <h2 className="isecao__titulo isecao__titulo--menor" id="vem-titulo">
              Vem <strong>aí.</strong>
            </h2>
          </div>
          <ul className="ivem revela">
            {chegando.map((c) => (
              <li key={c.nome}>
                <Icone nome={c.icone} size={20} />
                <span>{c.nome}</span>
                <span className="selo">Em breve</span>
              </li>
            ))}
          </ul>
        </section>

        {MAESTRO_LANCADO ? (
          <section className="iacesso" id="acesso" aria-labelledby="acesso-titulo">
            <div className="iacesso__miolo revela">
              <MaestroSimbolo width={96} />
              <h2 className="iacesso__titulo" id="acesso-titulo">
                Já está <strong>na sua conta.</strong>
              </h2>
              <p>Entre com a conta Absolute ZRO.</p>
              <div className="acoes acoes--centro">
                {criarConta}
                {entrar}
              </div>
            </div>
          </section>
        ) : (
          <section className="iacesso" id="acesso" aria-labelledby="acesso-titulo">
            <div className="iacesso__miolo revela">
              <MaestroSimbolo width={96} />
              <h2 className="iacesso__titulo" id="acesso-titulo">
                Por convite, <strong>por enquanto.</strong>
              </h2>
              <p>Deixe seu e-mail e a gente avisa quando abrir para você.</p>
              {dentro ? (
                <div className="acoes acoes--centro">{entrar}</div>
              ) : (
                <>
                  <QueroAcesso />
                  <p className="iacesso__ja">
                    Já tem acesso? <a href={ROTAS.entrar}>Entrar com Absolute ZRO</a>
                  </p>
                </>
              )}
            </div>
          </section>
        )}
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
