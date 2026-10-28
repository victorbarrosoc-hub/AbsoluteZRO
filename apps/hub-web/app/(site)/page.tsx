import Link from 'next/link'
import type { CSSProperties } from 'react'
import { EVENT_PAYLOADS, EVENT_PRODUCER } from '@zro/media-contracts'
import { ProductMark } from '@zro/ui'
import { productColor } from '@/components/app-tile'
import { BrandSymbol } from '@/components/brand-symbol'
import { Aparece } from '@/components/home/aparece'
import { Conheca } from '@/components/home/conheca'
import { Fluxo } from '@/components/home/fluxo'
import { Numeros } from '@/components/home/numeros'
import { PalcoZ, Z } from '@/components/ia/simbolo-z'
import { liberadosPara, publicCatalog } from '@/lib/data/catalog'
import { hasDesktopInstaller } from '@/lib/downloads'
import { getAuth } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** Uma linha por ferramenta, curta, na faixa logo abaixo do topo. */
const LINE: Record<string, string> = {
  'carro-do-freela': 'Equipe e oportunidades',
  tpeasy: 'Teleprompter',
  sobedesce: 'Cópia e backup conferidos',
  synquei: 'Organização e sincronia',
  'ai-edit': 'Edição de vídeo',
  nossom: 'Tratamento de som',
  finishing: 'Cor e entrega',
  maestro: 'Gestão da produtora',
}

/** Três fatos por ferramenta, tirados do que cada uma faz hoje (README de cada produto em products/). */
const FATOS: Record<string, string[]> = {
  'carro-do-freela': ['Agenda de freelas por praça', 'Disponibilidade pública que sai da agenda', 'Escala da equipe sem adivinhar'],
  tpeasy: ['Teleprompter no Safari do iPhone', 'Rola com a sua voz', 'Funciona sem internet'],
  sobedesce: ['Até 32 conexões por arquivo', 'MD5 conferido em cada arquivo', 'Pausa e continua de onde parou'],
  synquei: ['Sincroniza câmeras e gravadores pelo som', 'Exporta para Premiere, Resolve, Final Cut e Avid', 'Nada sai do seu computador'],
  'ai-edit': ['Transcrição na sua máquina', 'Cortes e zoom propostos para você aprovar', 'Linha do tempo para o seu editor'],
  nossom: ['Estúdio de áudio para criadores', 'Instala pelo navegador', 'App para Mac e Windows'],
  finishing: ['LUT criativa a partir de uma referência', 'LOG para Rec.709 por câmera', 'PowerGrade para o DaVinci Resolve'],
  maestro: ['Entra com a sua conta Absolute ZRO', 'Papéis vindos da sua organização', 'A Z em toda tela'],
}

/** Ferramentas com a tela no MacBook e no iPhone (public/brand/produto-<id>-{claro,escuro}.webp); as outras mostram o ícone. */
const TELA = new Set(['carro-do-freela', 'tpeasy', 'sobedesce', 'synquei', 'ai-edit', 'nossom', 'finishing'])

/** O nome da etapa no fluxo, na ordem do catálogo. */
const ETAPA: Record<string, string> = {
  'carro-do-freela': 'Equipe',
  tpeasy: 'Roteiro',
  sobedesce: 'Cópia',
  synquei: 'Sincronia',
  'ai-edit': 'Edição',
  nossom: 'Som',
  finishing: 'Cor e entrega',
}

/** O que cada evento quer dizer, em português de gente (o nome técnico fica na dica). */
const EVENTO: Record<string, string> = {
  'job.created': 'Job e equipe definidos',
  'script.ready': 'Roteiro pronto',
  'ingest.completed': 'Cópia conferida',
  'media.manifest.ready': 'Lista das mídias',
  'media.sync.completed': 'Áudio e vídeo sincronizados',
  'edit.selects.ready': 'Melhores takes separados',
  'edit.timeline.ready': 'Linha do tempo pronta',
  'audio.mix.ready': 'Som tratado e mixado',
  'finishing.qc.completed': 'Cor e qualidade conferidas',
  'delivery.ready': 'Entrega pronta',
}

/** Eventos de bastidor que não entram no fluxo da página (começo e falha da cópia). */
const SO_BASTIDOR = new Set(['ingest.started', 'ingest.failed'])

/** Site oficial quando o catálogo ainda não tem o endereço (Revela e AEON já estão no ar nos subdomínios). */
const SITE: Record<string, string> = {
  'ai-edit': 'https://aeon.absolutezro.com',
  finishing: 'https://revela.absolutezro.com',
}

export default async function Landing() {
  // Gate de lançamento (ADR 0023): o que não está aberto ao público (ou liberado para a pessoa logada) aparece como
  // "Em desenvolvimento", sem link, e fica fora dos números, das etapas e da órbita da Z.
  const auth = await getAuth()
  const [{ products }, liberados, baixaveis] = await Promise.all([
    publicCatalog(),
    liberadosPara(auth?.user.id ?? null, 'web'),
    liberadosPara(auth?.user.id ?? null, 'download'),
  ])
  // Cada palavra sobe na sua vez; o espaço fica fora do bloco para não sumir.
  const words = (text: string, from: number) =>
    text.split(' ').flatMap((w, i) => [
      i > 0 ? ' ' : '',
      <span key={w + i} className="phero__word" style={{ '--i': from + i } as CSSProperties}>
        {w}
      </span>,
    ])
  const aberto = (id: string) => liberados.has(id)
  const ativos = products.filter((p) => aberto(p.id) && (p.stage === 'active' || p.stage === 'beta'))
  const siteDe = (p: (typeof products)[number]) => (aberto(p.id) ? (p.external_url as string | null) || SITE[p.id as string] || null : null)
  // Só os eventos de quem está aberto: o fluxo e os números mostram o que roda hoje, não o que ainda está fechado.
  const eventos = Object.keys(EVENT_PAYLOADS).filter((e) => aberto(EVENT_PRODUCER[e as keyof typeof EVENT_PRODUCER]))
  const formatos = aberto(EVENT_PRODUCER['edit.timeline.ready']) ? EVENT_PAYLOADS['edit.timeline.ready'][1].shape.format.options.length : 0
  const noComputador = ativos.filter((p) => hasDesktopInstaller(p.id as string, baixaveis)).length
  const numeros = [
    { valor: ativos.length, rotulo: 'ferramentas' },
    { valor: 1, rotulo: 'conta para tudo' },
    { valor: eventos.length, rotulo: 'eventos ligam as etapas', dica: 'Contratos versionados em @zro/media-contracts' },
    { valor: formatos, rotulo: 'formatos de linha do tempo', dica: 'OTIO, FCPXML, xmeml, EDL e AAF' },
    { valor: noComputador, rotulo: 'apps para Mac e Windows' },
  ].filter((n) => n.valor > 0)
  // Conheça de perto: os lançados primeiro; os fechados vêm depois, com o selo e sem link.
  const destaques = [...ativos, ...products.filter((p) => !ativos.includes(p))].map((p) => ({
    id: p.id as string,
    nome: p.name as string,
    linha: LINE[p.id as string] ?? (p.role_in_flow as string),
    fatos: FATOS[p.id as string] ?? [],
    site: siteDe(p),
    emDesenvolvimento: !aberto(p.id),
    tela: TELA.has(p.id as string),
    cor: productColor(p.id as string),
  }))
  const etapas = ativos.map((p) => ({
    id: p.id as string,
    nome: p.name as string,
    etapa: ETAPA[p.id as string] ?? (p.role_in_flow as string),
    eventos: eventos
      .filter((e) => EVENT_PRODUCER[e as keyof typeof EVENT_PRODUCER] === p.id && !SO_BASTIDOR.has(e))
      .map((e) => ({ id: e, nome: EVENTO[e] ?? e })),
    cor: productColor(p.id as string),
  }))
  return (
    <>
      {/* Topo de cinema: a paisagem em preto e branco com o símbolo esculpido em metal sobre a rocha (Higgsfield, fiel à marca). */}
      <section className="phero" aria-labelledby="hero-title">
        <div className="phero__scene">
          <picture>
            <source media="(max-width: 700px)" srcSet="/brand/home-paisagem-sm.webp" />
            <img
              className="phero__photo"
              src="/brand/home-paisagem.webp"
              alt="O símbolo da Absolute ZRO, um anel com a centelha, em metal sobre uma rocha diante do mar"
              width={2400}
              height={1357}
              fetchPriority="high"
            />
          </picture>
        </div>
        <div className="phero__text">
          <h1 className="phero__title" id="hero-title">
            <span className="phero__thin">{words('O futuro começa', 0)}</span>
            <span className="phero__bold">{words('do zero.', 3)}</span>
          </h1>
          <p className="phero__lead">Ferramentas para a produção audiovisual, numa conta só.</p>
          <div className="phero__ctas">
            <Link className="glass-btn glass-btn--ink" href="#ecossistema">
              Conheça o ecossistema
            </Link>
            <Link className="glass-btn" href="/planos">
              Ver planos
            </Link>
          </div>
        </div>
        <ul className="phero__side" aria-hidden="true">
          <li>Conta</li>
          <li>Ferramentas</li>
          <li>Fluxo</li>
          <li>Resultado</li>
        </ul>
      </section>

      {/* As ferramentas numa faixa só, discreta: ícone, nome e uma linha. */}
      <section className="pstrip" id="ecossistema" aria-label="Ferramentas">
        <ul className="pstrip__list" style={{ '--n': products.length } as CSSProperties}>
          {products.map((p, i) => {
            const id = p.id as string
            const name = p.name as string
            const site = siteDe(p)
            const inner = (
              <>
                <ProductMark productId={id} name={name} size={40} />
                <span className="pstrip__text">
                  <span className="pstrip__name">{name}</span>
                  <span className="pstrip__line">{LINE[id] ?? (p.role_in_flow as string)}</span>
                  {!aberto(id) && <span className="selo-dev">Em desenvolvimento</span>}
                </span>
                {site && (
                  <span className="pstrip__go" aria-hidden="true">
                    ›
                  </span>
                )}
              </>
            )
            return (
              <li key={id} style={{ '--i': i } as CSSProperties}>
                {site ? (
                  <a className="pstrip__card" href={site} target="_blank" rel="noopener noreferrer">
                    {inner}
                    <span className="zro-sr-only"> (abre o site oficial em nova aba)</span>
                  </a>
                ) : (
                  <span className="pstrip__card" data-fechado={aberto(id) ? undefined : 'sim'}>
                    {inner}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
        <p className="pstrip__rule" aria-hidden="true">
          <span>Ferramentas que se conectam</span>
          <i />
          <span>Uma conta só</span>
        </p>
      </section>

      {/* O ecossistema em números, todos tirados do catálogo e dos contratos (nada digitado à mão). */}
      <section className="pnum" aria-labelledby="numeros-title">
        <h2 id="numeros-title" className="display-2 atitle reveal">
          <span className="atitle__thin">Um ecossistema.</span>
          <span className="atitle__bold">Em números.</span>
        </h2>
        <Numeros itens={numeros} />
      </section>

      {/* Uma ferramenta por vez, de perto, como os destaques da apple.com. */}
      <section className="section section--center pconheca-sec" aria-labelledby="conheca-title">
        <div className="section__head section__head--wide reveal">
          <h2 id="conheca-title" className="display-2 atitle">
            <span className="atitle__thin">Uma por uma.</span>
            <span className="atitle__bold">Conheça de perto.</span>
          </h2>
        </div>
        <Conheca itens={destaques} />
      </section>

      {/* Como uma etapa passa para a outra: os eventos reais que cada app manda para o HUB. */}
      <section className="section section--center pfluxo-sec" aria-labelledby="fluxo-title">
        <div className="section__head section__head--wide reveal">
          <h2 id="fluxo-title" className="display-2 atitle">
            <span className="atitle__thin">Do roteiro</span>
            <span className="atitle__bold">à entrega.</span>
          </h2>
          <p>Cada etapa avisa o HUB. A próxima começa de onde a outra parou.</p>
        </div>
        <Fluxo etapas={etapas} />
      </section>

      {/* O Z, a IA do ecossistema: o símbolo no centro e as ferramentas em volta, ligadas pelo ar dele. */}
      <section className="section section--center pz-sec" aria-labelledby="z-title">
        <div className="section__head section__head--wide reveal">
          <h2 id="z-title" className="display-2 atitle">
            <span className="atitle__thin">Conheça a Z.</span>
            <span className="atitle__bold">A ponte entre tudo.</span>
          </h2>
          <p>Uma IA para o ecossistema inteiro. Lê o que acontece nas ferramentas e ajuda você a seguir para a próxima.</p>
        </div>
        <PalcoZ cena="ouvindo" className="pz">
          <Z movimento="pensando" tamanho={200} vento className="pz__z" />
          <ul className="pz__orbita" aria-label="Ferramentas que a Z conhece">
            {ativos.map((p, i) => (
              <li key={p.id as string} style={{ '--i': i, '--n': ativos.length } as CSSProperties} title={p.name as string}>
                <ProductMark productId={p.id as string} name={p.name as string} size={44} />
              </li>
            ))}
          </ul>
        </PalcoZ>
        <ul className="papp__chips reveal" aria-label="Como a Z funciona">
          <li>Uma conta só</li>
          <li>Conversas de todas as plataformas</li>
          <li>Você confere antes de agir</li>
        </ul>
        <div className="papp__ctas reveal">
          <Link className="glass-btn glass-btn--ink" href="/ia">
            Conversar com a Z
          </Link>
          <Link className="glass-btn" href="/planos">
            Créditos nos planos
          </Link>
        </div>
      </section>

      {/* O app para computador: o painel de verdade num MacBook e o HUB no iPhone. */}
      <section className="section section--center papp" aria-labelledby="app-title">
        <div className="section__head section__head--wide reveal">
          <h2 id="app-title" className="display-2 atitle">
            <span className="atitle__thin">Um app no computador.</span>
            <span className="atitle__bold">Todas as ferramentas.</span>
          </h2>
        </div>
        <div className="showcase papp__aparelhos">
          <figure className="ahero__product ahero__product--claro">
            <img
              src="/brand/produto-hub-claro.webp"
              alt="O app Absolute ZRO aberto num MacBook, com as ferramentas, e o HUB num iPhone"
              width={2400}
              height={1500}
              loading="lazy"
            />
          </figure>
          <figure className="ahero__product ahero__product--escuro">
            <img
              src="/brand/produto-hub-escuro.webp"
              alt="O app Absolute ZRO aberto num MacBook, com as ferramentas, e o HUB num iPhone"
              width={2400}
              height={1500}
              loading="lazy"
            />
          </figure>
        </div>
        <ul className="papp__chips reveal" aria-label="O que o app faz">
          <li>Instala, abre e atualiza</li>
          <li>Uma conta só</li>
          <li>Mac e Windows</li>
        </ul>
        <div className="papp__ctas reveal">
          <Link className="glass-btn glass-btn--ink" href="/baixar#absolute-zro">
            Baixar o app
          </Link>
          <Link className="glass-btn" href="/app">
            Abrir no navegador
          </Link>
        </div>
      </section>

      {/* O plano que abre tudo. */}
      <section className="pcycle reveal" id="ciclo" aria-labelledby="ciclo-title">
        <div className="pcycle__text">
          <h2 id="ciclo-title" className="pcycle__title">
            O Ciclo do O
          </h2>
          <p className="pcycle__lead">Todas as ferramentas lançadas numa assinatura só.</p>
        </div>
        <div className="pcycle__rings" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <i key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
        <Link className="glass-btn pcycle__cta" href="/planos">
          Conheça o plano completo
        </Link>
      </section>

      <section className="closing reveal" aria-labelledby="closing-title">
        <Aparece className="closing__aparece">
          <BrandSymbol className="closing__mark bsym--aparece" />
        </Aparece>
        <h2 id="closing-title" className="display-2 atitle">
          <span className="atitle__thin">Seus dados, seus acessos.</span>
          <span className="atitle__bold">Nada além do contratado.</span>
        </h2>
        <p className="closing__lead">Permissões conferidas no servidor em toda ação. Arquivos originais nunca são apagados ou sobrescritos pelo HUB.</p>
        <div className="closing__ctas">
          <Link className="glass-btn glass-btn--ink" href="/criar-conta">
            Começar do zero
          </Link>
          <Link className="glass-btn" href="/planos">
            Ver planos
          </Link>
        </div>
      </section>
    </>
  )
}
