'use client';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import {
  AudioLines,
  Mic2,
  SlidersHorizontal,
  ArrowRight,
  ArrowUpRight,
  Play,
  ShieldCheck,
  Menu,
  Download,
  Laptop,
  Monitor,
  Smartphone,
  X,
  Plus,
  Minus,
} from 'lucide-react';
import CinematicRibbon from './cinematic-ribbon';
import SignalField from './signal-field';
import { Brand } from './brand';
import { ZroSymbol } from './zro-symbol';
import DemoPlayer from './demo-player';
import PlanCards from './plan-cards';
import InstallApp from './install-app';
import AccountMenu from './account-menu';
import DesktopUpdates from './desktop-updates';
import SiteMotion from './site-motion';
import SoundToggle from './sound-toggle';
const sections = [
  ['Ouça a diferença', 'experimente'],
  ['Como funciona', 'produto'],
  ['Planos', 'planos'],
] as const;
// Lights the nav item of the section in view; one state change per section, not per frame.
function useSectionInView() {
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
  }, []);
  return active;
}
function StepArt({ kind }: { kind: 'send' | 'clean' | 'export' }) {
  const bars = Array.from({ length: 11 }, (_, i) => i);
  return (
    <svg className="step-art" viewBox="0 0 190 56" aria-hidden="true">
      <defs>
        <linearGradient id={`step-${kind}`} x1="0" x2="1">
          <stop stopColor="#5ab4ff" />
          <stop offset=".55" stopColor="#e9f6ff" />
          <stop offset="1" stopColor="#8fb3d6" />
        </linearGradient>
      </defs>
      {kind === 'send' && (
        <>
          <rect
            className="chip"
            x="64"
            y="10"
            width="62"
            height="36"
            rx="11"
            fill="#9fd6ff1a"
            stroke={`url(#step-${kind})`}
          />
          {bars.slice(0, 7).map((i) => (
            <rect
              key={i}
              x={76 + i * 6}
              y={28 - [4, 9, 6, 12, 7, 10, 5][i]}
              width="3"
              height={[4, 9, 6, 12, 7, 10, 5][i] * 2}
              rx="1.5"
              fill={`url(#step-${kind})`}
            />
          ))}
        </>
      )}
      {kind === 'clean' &&
        bars.map((i) => {
          const noisy = [8, 17, 5, 20, 11, 19, 6, 15, 9, 18, 7][i];
          return (
            <rect
              key={i}
              className="bar"
              x={40 + i * 10}
              y={28 - noisy}
              width="4"
              height={noisy * 2}
              rx="2"
              fill={`url(#step-${kind})`}
              style={{
                ['--from' as string]: 1,
                ['--to' as string]: (6 + (i % 3) * 3) / noisy,
                animationDelay: `${i * 70}ms`,
              }}
            />
          );
        })}
      {kind === 'export' && (
        <>
          <path d="M60 40h70" stroke="#9fd6ff55" strokeWidth="2" strokeLinecap="round" />
          <g className="arrow">
            <path
              d="M95 10v22m-8-8 8 8 8-8"
              fill="none"
              stroke={`url(#step-${kind})`}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </>
      )}
    </svg>
  );
}
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
    'WAV, MP3, M4A, FLAC, OGG e áudio de MP4 ou MOV. Até 100 MB e 10 minutos. Limpeza de fala em mono e separação musical em estéreo. Exporte o resultado em WAV ou MP3.',
  ],
  [
    'Posso desfazer um tratamento?',
    'Sim. O original é preservado e os tratamentos criam versões. Compare antes e depois, desfaça, refaça ou retome uma versão anterior. Os efeitos também podem ser removidos. Exporte seus projetos antes de limpar os dados do navegador.',
  ],
];
export default function Landing() {
  const [menu, setMenu] = useState(false),
    [faq, setFaq] = useState<number | null>(null),
    [hover, setHover] = useState<string | null>(null),
    reduced = useReducedMotion(),
    inView = useSectionInView(),
    lens = hover ?? inView;
  return (
    <div className="ns-site home-v2 chrome-site">
      <SiteMotion />
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="ns-header">
        <div className="ns-wrap ns-nav lg">
          <span className="nav-progress" aria-hidden="true" />
          <Link href="/" aria-label="NOSSOM início">
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
            </nav>
          </LayoutGroup>
          <div className="ns-nav-actions">
            <DesktopUpdates />
            <AccountMenu />
            <Link href="/studio" className="button primary small">
              Começar grátis <ArrowRight size={14} />
            </Link>
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
        <SignalField />
        <section className="home-hero">
          <div className="home-hero-atmosphere" aria-hidden="true" />
          <div className="ns-wrap home-hero-grid">
            <Reveal className="home-hero-copy">
              <h1>
                Seu som,
                <span>em outra escala.</span>
              </h1>
              <p>Limpe sua voz. Isole vocais. Crie do seu jeito.</p>
              <div className="ns-actions">
                <Link href="/studio" className="button primary">
                  Começar grátis <ArrowUpRight size={17} />
                </Link>
                <a href="#experimente" className="home-listen-link">
                  <span>
                    <Play size={13} fill="currentColor" />
                  </span>
                  Ouça a diferença
                </a>
              </div>
              <div className="home-hero-proof">
                <ShieldCheck size={15} />
                <span>5 minutos grátis de IA por mês. Seu original preservado.</span>
              </div>
            </Reveal>
            <div className="home-hero-interface chrome-hero-art">
              <CinematicRibbon priority />
            </div>
          </div>
          <nav
            className="home-intents chrome-intents ns-wrap"
            aria-label="Escolha o que fazer com seu áudio"
          >
            <Link
              href="/studio/automatico"
              data-intent="auto"
              className="lg"
              aria-label="Limpar fala"
            >
              <AudioLines size={32} />
              <span>
                <strong>Limpar fala</strong>
                <small>Reduza ruídos da gravação</small>
              </span>
              <ArrowRight size={18} />
            </Link>
            <Link
              href="/studio/isolar-voz"
              data-intent="vocals"
              className="lg"
              aria-label="Isolar cantor"
            >
              <Mic2 size={32} />
              <span>
                <strong>Isolar cantor</strong>
                <small>Separe a voz dos instrumentos</small>
              </span>
              <ArrowRight size={18} />
            </Link>
            <Link
              href="/studio/efeitos"
              data-intent="effects"
              className="lg"
              aria-label="Criar efeitos"
            >
              <SlidersHorizontal size={32} />
              <span>
                <strong>Criar efeitos</strong>
                <small>Transforme seu som</small>
              </span>
              <ArrowRight size={18} />
            </Link>
          </nav>
        </section>
        <section className="home-listen ns-wrap" id="experimente">
          <div className="chrome-listen-heading">
            <h2>Ouça a diferença.</h2>
            <p>Uma gravação real, antes e depois.</p>
          </div>
          <Reveal>
            <DemoPlayer />
          </Reveal>
        </section>
        <section className="home-quick ns-wrap" id="produto">
          <h2>Do áudio ao resultado.</h2>
          <div id="como-funciona" className="home-quick-steps">
            <p className="lg">
              <StepArt kind="send" />
              <strong>1. Envie</strong> Sua voz, do celular ou computador.
            </p>
            <p className="lg">
              <StepArt kind="clean" />
              <strong>2. Melhore</strong> Limpe a voz e ajuste seu som.
            </p>
            <p className="lg">
              <StepArt kind="export" />
              <strong>3. Baixe</strong> Compare e exporte em WAV ou MP3.
            </p>
          </div>
          <Link href="/studio" className="button primary">
            Experimentar grátis <ArrowRight size={16} />
          </Link>
        </section>
        <section className="ns-wrap" id="planos">
          <PlanCards />
        </section>
        <section className="home-downloads ns-wrap" id="baixar" aria-labelledby="baixar-title">
          <h2 id="baixar-title">Leve o NOSSOM com você.</h2>
          <p>No computador ou no celular, com a mesma conta.</p>
          {/* Central de apps da Absolute ZRO: o jeito recomendado de instalar; o download direto continua abaixo. */}
          <div className="lg zro-central">
            <ZroSymbol size={40} />
            <div>
              <strong>Instale pelo Absolute ZRO</strong>
              <small>
                Um app só para instalar, abrir e atualizar o NOSSOM e as outras ferramentas, com a
                mesma conta.
              </small>
            </div>
            <a className="button primary" href="https://absolutezro.vercel.app/baixar#app-nossom">
              Baixar o Absolute ZRO
            </a>
          </div>
          <p className="zro-central-ou">Ou baixe só o NOSSOM:</p>
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
        <section className="ns-faq ns-wrap">
          <Reveal>
            <h2>Dúvidas?</h2>
          </Reveal>
          <div>
            {faqs.map(([question, answer], i) => (
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
          <Link href="/" aria-label="NOSSOM início">
            <Brand />
          </Link>
          <p>Tudo acontece no som.</p>
        </div>
        <nav aria-label="Rodapé">
          <InstallApp />
          <SoundToggle />
          <Link href="/apps">Aplicativos para Mac e Windows</Link>
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/studio">
            Abrir estúdio <ArrowUpRight size={13} />
          </Link>
          <span>© {new Date().getFullYear()} NOSSOM</span>
        </nav>
      </footer>
    </div>
  );
}
