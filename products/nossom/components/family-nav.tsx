// Família Absolute ZRO no menu do estúdio: cada app com o próprio ícone e nome.
// Os ícones moram em /public (cada app publica sozinho). Abre em outra aba para não
// interromper gravação nem tratamento em andamento; no app de Mac/Windows abre no navegador.
const FAMILY = [
  {
    href: 'https://absolutezro.vercel.app',
    name: 'Absolute ZRO',
    icon: '/familia/absolute-zro.png',
  },
  {
    href: 'https://carrodofreela.com.br',
    name: 'Carro do Freela',
    icon: '/familia/carro-do-freela.png',
  },
  { href: 'https://revela-zro.vercel.app', name: 'Revela', icon: '/familia/revela.svg' },
  { href: 'https://sobedesce.vercel.app', name: 'Sobedesce', icon: '/familia/sobedesce.svg' },
  { href: 'https://synquei.vercel.app', name: 'Synquei', icon: '/familia/synquei.svg' },
  { href: 'https://tpeasy.vercel.app', name: 'TPEasy', icon: '/familia/tpeasy.svg' },
] as const;

export default function FamilyNav({ onOpen }: { onOpen?: () => void }) {
  return (
    <nav className="family-nav" aria-labelledby="family-nav-title">
      <span id="family-nav-title" className="family-nav-title">
        Absolute ZRO
      </span>
      {FAMILY.map((app) => (
        <a
          key={app.href}
          href={app.href}
          target="_blank"
          rel="noopener"
          title={app.name}
          onClick={onOpen}
        >
          <img src={app.icon} alt="" width={22} height={22} decoding="async" loading="lazy" />
          <span>{app.name}</span>
        </a>
      ))}
    </nav>
  );
}
