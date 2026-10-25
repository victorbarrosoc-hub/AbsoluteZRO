import Link from 'next/link';
import { Apple, Monitor, Download, ArrowLeft, Smartphone } from 'lucide-react';
import { Brand } from '@/components/brand';
import InstallApp from '@/components/install-app';
export const metadata = {
  title: 'Aplicativos NOSSOM',
  description: 'NOSSOM no Mac, Windows e na tela de início do seu celular.',
};
function download(value: string | undefined) {
  try {
    if (!value) return null;
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
const releaseTag = 'desktop-v0.2.2';
const releaseBase = `https://github.com/victorbarrosoc-hub/nossom/releases/download/${releaseTag}/`;
const installerNames = {
  macArm64: 'NOSSOM-0.2.2-mac-arm64.dmg',
  macX64: 'NOSSOM-0.2.2-mac-x64.dmg',
  windows: 'NOSSOM-0.2.2-win-x64.exe',
};
// These versioned installer assets were built by Actions and anonymously
// verified before enabling the links. Environment URLs override the previews.
export default function Apps() {
  const previews = Object.fromEntries(
    Object.entries(installerNames).map(([key, name]) => [key, releaseBase + name]),
  );
  const builds = [
    {
      title: 'Mac · Apple Silicon',
      detail: 'Para Macs com chips M1, M2, M3, M4 ou mais recentes.',
      file: '.dmg',
      url: download(process.env.NOSSOM_DOWNLOAD_MAC_ARM64_URL) || previews.macArm64,
      preview: !download(process.env.NOSSOM_DOWNLOAD_MAC_ARM64_URL),
      icon: Apple,
    },
    {
      title: 'Mac · Intel',
      detail: 'Para Macs com processador Intel.',
      file: '.dmg',
      url: download(process.env.NOSSOM_DOWNLOAD_MAC_X64_URL) || previews.macX64,
      preview: !download(process.env.NOSSOM_DOWNLOAD_MAC_X64_URL),
      icon: Apple,
    },
    {
      title: 'Windows',
      detail: 'Para Windows 10 e 11, em computadores de 64 bits.',
      file: '.exe',
      url: download(process.env.NOSSOM_DOWNLOAD_WINDOWS_URL) || previews.windows,
      preview: !download(process.env.NOSSOM_DOWNLOAD_WINDOWS_URL),
      icon: Monitor,
    },
  ];
  return (
    <main className="apps-page container">
      <Link href="/" aria-label="NOSSOM página inicial">
        <Brand />
      </Link>
      <Link className="text-link" href="/studio">
        <ArrowLeft size={16} />
        Voltar ao estúdio
      </Link>
      <h1>NOSSOM no seu dispositivo.</h1>
      <p>Escolha como abrir seu espaço. Sua conta e a IA são as mesmas em todas as versões.</p>
      <div className="apps-grid">
        {builds.map((build) => (
          <section key={build.title}>
            <build.icon size={32} />
            <h2>{build.title}</h2>
            <p>{build.detail}</p>
            <span className="apps-format">Instalador {build.file}</span>
            {build.url ? (
              <>
                <a className="button primary" href={build.url}>
                  <Download size={17} />
                  Baixar para {build.title}
                </a>
                {build.preview && <small>Versão de teste · 0.2.2</small>}
              </>
            ) : (
              <>
                <button className="button secondary" disabled>
                  Instalador em preparação
                </button>
                <small>O download será liberado quando o arquivo estiver publicado.</small>
              </>
            )}
          </section>
        ))}
      </div>
      {builds.some((build) => build.url && build.preview) && (
        <p className="apps-note">
          Esta é uma versão de teste. O Mac ainda pode pedir autorização para abrir, pois a prévia
          não tem notarização da Apple. Veja as instruções abaixo. Atualizações automáticas ainda
          não estão disponíveis.
        </p>
      )}
      <section className="apps-install-help" aria-labelledby="mac-install-title">
        <h2 id="mac-install-title">Para instalar no Mac</h2>
        <ol>
          <li>Baixe a versão do seu Mac e abra o arquivo .dmg.</li>
          <li>Arraste o NOSSOM para a pasta Aplicativos. Depois, ejete o instalador.</li>
          <li>Abra o NOSSOM pela pasta Aplicativos.</li>
        </ol>
        <details>
          <summary>O Mac bloqueou a abertura?</summary>
          <p>
            Depois de tentar abrir, vá a Ajustes do Sistema → Privacidade e Segurança. Na mensagem
            sobre o NOSSOM, escolha Abrir Mesmo Assim e confirme.
          </p>
          <p>
            Se você baixou a versão 0.1.0 e viu “aplicativo danificado”, substitua o aplicativo pela
            versão 0.2.2 disponível acima. Seus projetos não precisam ser apagados.
          </p>
          <p>
            Se a prévia continuar bloqueada, confirme que o arquivo veio desta página e que o NOSSOM
            está em Aplicativos. Abra o Terminal e execute:
          </p>
          <pre>
            <code>xattr -dr com.apple.quarantine /Applications/NOSSOM.app</code>
          </pre>
          <p>
            Esse comando remove o bloqueio de download apenas do NOSSOM. Depois, tente abrir
            novamente. Se o Terminal disser que o arquivo não existe, confira se o aplicativo foi
            movido para Aplicativos. Você também pode continuar pelo navegador abaixo.
          </p>
        </details>
      </section>
      <section className="apps-browser">
        <Smartphone size={30} />
        <div>
          <h2>Use agora, pelo navegador.</h2>
          <p>
            No iPhone, adicione à Tela de Início. No Mac, Safari → Arquivo → Adicionar ao Dock. No
            Windows, use a opção de instalação do Edge ou Chrome.
          </p>
          <InstallApp />
        </div>
      </section>
      <p className="apps-note">
        Os arquivos de áudio ficam no dispositivo onde foram importados. A conta e a franquia mensal
        são compartilhados; os projetos de áudio não são sincronizados entre aparelhos.
      </p>
    </main>
  );
}
