'use client';
import HomeFerramentas from './home-ferramentas';
import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  ArrowUpRight,
  Play,
  Menu,
  Download,
  Laptop,
  Monitor,
  Smartphone,
  X,
  Plus,
  Minus,
  UserRound,
  MessageSquare,
  CircleCheck,
  Sparkle,
  AudioLines,
} from 'lucide-react';
import CinematicRibbon from './cinematic-ribbon';
import { Brand } from './brand';
import { ZroSymbol } from './zro-symbol';
import DemoPlayer from './demo-player';
import PlanCards from './plan-cards';
import InstallApp from './install-app';
import AccountMenu from './account-menu';
import StudioLink from './studio-link';
import DesktopUpdates from './desktop-updates';
import SiteMotion from './site-motion';
import SoundToggle from './sound-toggle';
const SECTIONS = [
  ['Ouça a diferença', 'experimente'],
  ['Ferramentas', 'produto'],
  ['Planos', 'planos'],
] as const;
type Section = (typeof SECTIONS)[number];
// Lights the nav item of the section in view; one state change per section, not per frame.
function useSectionInView(sections: readonly Section[]) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        setActive(sections.find(([, id]) => seen.get(id))?.[1] ?? null);
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    for (const [, id] of sections) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [sections]);
  return active;
}
/** As três ações do estúdio: cartões que abrem a ferramenta; fechado ao público, só apresentam (sem link). */
function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={`ns-reveal ${className}`}
      initial={false}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: reduced ? 0 : 0.45, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
const faqs = [
  [
    'Preciso saber tratar áudio?',
    'Comece pelo assistente: anexe sua gravação e conte o que quer melhorar. A IA usa seu objetivo e as medições do áudio para sugerir o tratamento. Você revisa a proposta, ouve e pode ajustar os controles no estúdio.',
  ],
  [
    'O que está incluído na minha conta?',
    'O Grátis inclui 5 minutos de restauração por mês. Essencial: 2 horas por R$39/mês; Studio: 6 horas por R$99/mês. Cada restauração usa no mínimo 1 minuto; EQ, efeitos e masterização local não descontam minutos. A franquia renova no dia 1. Os planos pagos são mensais; o Grátis não pede cartão.',
  ],
  [
    'Meu áudio é enviado à IA?',
    'Ao restaurar com IA, uma cópia temporária do arquivo vai para armazenamento privado e uma GPU da plataforma. Os projetos e originais ficam neste navegador. EQ, masterização e efeitos continuam locais. O assistente Claude recebe texto e medições, sem o arquivo de áudio.',
  ],
  [
    'Quais arquivos posso usar?',
    'Áudio (WAV, MP3, M4A, FLAC, OGG) até 500 MB e vídeo (MP4, MOV, WebM) até 2 GB, com até 10 minutos. Em vídeo, só o som vai para a IA e você baixa o vídeo com o som novo. Exporte também em WAV ou MP3.',
  ],
  [
    'Posso desfazer um tratamento?',
    'Sim. O original é preservado e os tratamentos criam versões. Compare antes e depois, desfaça, refaça ou retome uma versão anterior. Os efeitos também podem ser removidos. Exporte seus projetos antes de limpar os dados do navegador.',
  ],
];
/**
 * Página inicial. Com `closed` (NOSSOM fechado ao público) só a conta liberada no HUB chega aqui (o proxy manda o
 * resto para a Absolute ZRO), então a página age como nos outros apps: a conta no topo e "Abrir o estúdio". Planos,
 * download e instalação ficam de fora até o lançamento.
 */
export default function Landing({
  zroIa = false,
  closed = false,
}: {
  zroIa?: boolean;
  closed?: boolean;
}) {
  const sections = useMemo(
    () => (closed ? SECTIONS.filter(([, id]) => id !== 'planos') : SECTIONS),
    [closed],
  );
  const faqList = closed
    ? faqs.filter(([question]) => question !== 'O que está incluído na minha conta?')
    : faqs;
  const [menu, setMenu] = useState(false),
    [faq, setFaq] = useState<number | null>(null),
    [hover, setHover] = useState<string | null>(null),
    reduced = useReducedMotion(),
    inView = useSectionInView(sections),
    lens = hover ?? inView;
  return (
    <div className="ns-site home-v2 chrome-site home-p2">
      <SiteMotion />
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="ns-header">
        <div className="ns-wrap ns-nav lg">
          <span className="nav-progress" aria-hidden="true" />
          <Link href="/" aria-label="Quasar início">
            <Brand />
          </Link>
          <LayoutGroup id="site-nav">
            <nav
              className={menu ? 'open' : ''}
              aria-label="Navegação principal"
              onPointerLeave={() => setHover(null)}
            >
              {sections.map(([label, id]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  aria-current={inView === id ? 'true' : undefined}
                  onPointerEnter={() => setHover(id)}
                  onFocus={() => setHover(id)}
                  onBlur={() => setHover(null)}
                  onClick={() => setMenu(false)}
                >
                  {lens === id && (
                    <motion.span
                      className="nav-lens"
                      layoutId="nav-lens"
                      transition={
                        reduced
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }
                      }
                    />
                  )}
                  {label}
                </a>
              ))}
              {closed && (
                <StudioLink href="/studio" className="nav-apps" onClick={() => setMenu(false)}>
                  <AudioLines size={15} /> Abrir o estúdio
                </StudioLink>
              )}
              {!closed && (
                <Link
                  href="/apps"
                  className="nav-apps"
                  onPointerEnter={() => setHover('apps')}
                  onFocus={() => setHover('apps')}
                  onBlur={() => setHover(null)}
                  onClick={() => setMenu(false)}
                >
                  {lens === 'apps' && (
                    <motion.span
                      className="nav-lens"
                      layoutId="nav-lens"
                      transition={
                        reduced
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }
                      }
                    />
                  )}
                  <Download size={15} /> Baixar app
                </Link>
              )}
            </nav>
          </LayoutGroup>
          <div className="ns-nav-actions">
            <DesktopUpdates />
            <AccountMenu familia />
            <StudioLink href="/studio" className="button primary small">
              {closed ? 'Abrir o estúdio' : 'Começar grátis'} <ArrowRight size={14} />
            </StudioLink>
            <button
              className="icon-button ns-menu"
              onClick={() => setMenu(!menu)}
              aria-label={menu ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menu}
            >
              <motion.span
                key={menu ? 'x' : 'menu'}
                initial={reduced ? false : { rotate: -90, scale: 0.6, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                style={{ display: 'inline-flex' }}
              >
                {menu ? <X size={21} /> : <Menu size={21} />}
              </motion.span>
            </button>
          </div>
        </div>
      </header>
      <main id="conteudo">
        <section className="home-hero">
          <div className="ns-wrap home-hero-centro">
            <Reveal className="home-hero-copy">
              <h1>
                Do ruído
                <span>ao pronto.</span>
              </h1>
              <p>Um estúdio de áudio inteiro, com IA quando você quiser.</p>
              <div className="ns-actions">
                <StudioLink href="/studio" className="button primary">
                  Abrir o estúdio
                </StudioLink>
                <a href="#experimente" className="home-listen-link">
                  <span>
                    <Play size={13} fill="currentColor" />
                  </span>
                  Ouvir a diferença
                </a>
              </div>
            </Reveal>
          </div>
          {/* Proposta 2 (titular, 01/11/2026): as linhas de luz atravessam a página, embaixo do título. */}
          <div className="home-hero-interface chrome-hero-art">
            <CinematicRibbon priority />
          </div>
        </section>
        <section className="home-listen ns-wrap" id="experimente">
          <div className="chrome-listen-heading">
            <h2>Ouça a diferença.</h2>
            <p>Uma gravação real, antes e depois.</p>
          </div>
          <Reveal>
            <DemoPlayer closed={closed} />
          </Reveal>
        </section>
        <HomeFerramentas closed={closed} />
        {!closed && (
          <section className="ns-wrap" id="planos">
            <PlanCards />
          </section>
        )}
        {!closed && (
          <section className="home-downloads ns-wrap" id="baixar" aria-labelledby="baixar-title">
            <h2 id="baixar-title">Leve o Quasar com você.</h2>
            <p>No computador ou no celular, com a mesma conta.</p>
            {/* Central de apps da Absolute ZRO: o jeito recomendado de instalar; o download direto continua abaixo. */}
            <div className="lg zro-central">
              <ZroSymbol size={40} />
              <div>
                <strong>Instale pelo Absolute ZRO</strong>
                <small>
                  Um app só para instalar, abrir e atualizar o Quasar e as outras ferramentas, com a
                  mesma conta.
                </small>
              </div>
              <a className="button primary" href="https://absolutezro.com/baixar#app-nossom">
                Baixar o Absolute ZRO
              </a>
            </div>
            <p className="zro-central-ou">Ou baixe só o Quasar:</p>
            <div className="home-downloads-grid">
              <Link href="/apps" className="lg home-download">
                <Laptop size={26} />
                <strong>Mac</strong>
                <small>Apple Silicon e Intel</small>
                <span className="home-download-action">
                  Baixar <Download size={15} />
                </span>
              </Link>
              <Link href="/apps" className="lg home-download">
                <Monitor size={26} />
                <strong>Windows</strong>
                <small>Windows 10 e 11</small>
                <span className="home-download-action">
                  Baixar <Download size={15} />
                </span>
              </Link>
              <div className="lg home-download">
                <Smartphone size={26} />
                <strong>iPhone e Android</strong>
                <small>Direto na Tela de Início</small>
                <InstallApp label="Instalar" />
              </div>
            </div>
          </section>
        )}
        {/* Z, a IA do ecossistema Absolute ZRO. Com o login Absolute ZRO configurado (e o Quasar aberto), ela
            abre a aba da Z no estúdio (repasse em /api/zro/ia); fechado ao público ou sem o login, a seção diz
            que está chegando, sem link nenhum. */}
        <section className="home-z ns-wrap" id="z" aria-labelledby="z-title">
          <div className="lg home-z-card">
            <div className="z-simbolo" aria-hidden="true">
              <img
                className="z-anel"
                src="/z/anel.webp"
                alt=""
                width={560}
                height={560}
                loading="lazy"
              />
              <img
                className="z-estrela"
                src="/z/estrela.webp"
                alt=""
                width={400}
                height={400}
                loading="lazy"
              />
            </div>
            <div className="home-z-copy">
              <p className="z-selo">
                <i aria-hidden="true" />
                {zroIa ? 'Já no Quasar' : 'Chegando ao Quasar'}
              </p>
              <h2 id="z-title">Z. Uma IA para todo o ecossistema.</h2>
              <p>
                {zroIa
                  ? 'Ela abre o seu estúdio: pergunte sobre seu áudio e siga para a edição.'
                  : 'Vai entender seus projetos de áudio e ajudar a seguir para a edição.'}
              </p>
              <ul className="z-fichas" aria-label="Como a Z funciona">
                <li title="A mesma conta Absolute ZRO que você já usa.">
                  <UserRound size={16} aria-hidden="true" /> Mesma conta
                </li>
                <li title="Guardadas por plataforma e reunidas em absolutezro.com/ia.">
                  <MessageSquare size={16} aria-hidden="true" /> Conversas reunidas
                </li>
                <li title="Nenhuma ação sem você conferir.">
                  <CircleCheck size={16} aria-hidden="true" /> Você confere antes
                </li>
                <li title="Usa os créditos de IA do seu plano.">
                  <Sparkle size={16} aria-hidden="true" /> 1 crédito por resposta
                </li>
              </ul>
              {!closed && (
                <div className="home-z-acoes">
                  {zroIa && (
                    <Link className="button primary" href="/studio/z">
                      Conversar com a Z <ArrowRight size={15} />
                    </Link>
                  )}
                  <a className="button secondary" href="https://absolutezro.com/ia" rel="noopener">
                    Conhecer a Z <ArrowUpRight size={15} />
                  </a>
                </div>
              )}
            </div>
          </div>
        </section>
        <section className="ns-faq ns-wrap">
          <Reveal>
            <h2>Dúvidas?</h2>
          </Reveal>
          <div>
            {faqList.map(([question, answer], i) => (
              <div className="ns-faq-item" key={question}>
                <button
                  onClick={() => setFaq(faq === i ? null : i)}
                  aria-expanded={faq === i}
                  aria-controls={`faq-${i}`}
                >
                  {question}
                  {faq === i ? <Minus size={18} /> : <Plus size={18} />}
                </button>
                <div id={`faq-${i}`} hidden={faq !== i}>
                  <p>{answer}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
      <footer className="ns-footer ns-wrap">
        <div>
          <Link href="/" aria-label="Quasar início">
            <Brand />
          </Link>
          <p>O som encontrando o seu espaço.</p>
        </div>
        <nav aria-label="Rodapé">
          {!closed && <InstallApp />}
          <SoundToggle />
          {!closed && <Link href="/apps">Aplicativos para Mac e Windows</Link>}
          <Link href="/privacidade">Privacidade</Link>
          {closed ? (
            <a href="https://absolutezro.com/inicio">
              Absolute ZRO <ArrowUpRight size={13} />
            </a>
          ) : (
            <Link href="/studio">
              Abrir estúdio <ArrowUpRight size={13} />
            </Link>
          )}
          <span>© {new Date().getFullYear()} Quasar</span>
        </nav>
      </footer>
    </div>
  );
}
