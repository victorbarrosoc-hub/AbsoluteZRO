import Link from 'next/link';
import { Apple, Monitor, Download, ArrowLeft, Smartphone } from 'lucide-react';
import { Brand } from '@/components/brand';
import EmDesenvolvimento from '@/components/em-desenvolvimento';
import InstallApp from '@/components/install-app';
import DownloadNotice from '@/components/download-notice';
import { desktopInstallers } from '@/lib/desktop-releases';
import { nossomClosed } from '@/lib/server/release';
export const metadata = {
  title: 'Aplicativos Quasar',
  description: 'Quasar no Mac, Windows e na tela de início do seu celular.',
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
// Instaladores publicados pelo Actions: a release nossom-v<versão> do AbsoluteZRO quando existe,
// senão a prévia desktop-v0.2.2 do repositório antigo. Os botões apontam para /baixar/<sistema>
// (os repositórios são privados; a rota entrega o endereço assinado). Variáveis de ambiente têm
// prioridade. A versão mostrada é conferida de hora em hora.
export const revalidate = 3600;
export default async function Apps() {
  // Fechado ao público (28/10/2026): nenhum instalador nem instrução de instalação, só a página institucional.
  if (nossomClosed()) return <EmDesenvolvimento />;
  const previews = await desktopInstallers();
  const builds = [
    {
      title: 'Mac · Apple Silicon',
      detail: 'Para Macs com chips M1, M2, M3, M4 ou mais recentes.',
      file: '.dmg',
      url: download(process.env.NOSSOM_DOWNLOAD_MAC_ARM64_URL) || previews.macArm64.url,
      preview: !download(process.env.NOSSOM_DOWNLOAD_MAC_ARM64_URL),
      version: previews.macArm64.version,
      icon: Apple,
    },
    {
      title: 'Mac · Intel',
      detail: 'Para Macs com processador Intel.',
      file: '.dmg',
      url: download(process.env.NOSSOM_DOWNLOAD_MAC_X64_URL) || previews.macX64.url,
      preview: !download(process.env.NOSSOM_DOWNLOAD_MAC_X64_URL),
      version: previews.macX64.version,
      icon: Apple,
    },
    {
      title: 'Windows',
      detail: 'Para Windows 10 e 11, em computadores de 64 bits.',
      file: '.exe',
      url: download(process.env.NOSSOM_DOWNLOAD_WINDOWS_URL) || previews.windows.url,
      preview: !download(process.env.NOSSOM_DOWNLOAD_WINDOWS_URL),
      version: previews.windows.version,
      icon: Monitor,
    },
  ];
  return (
    <main className="apps-page container">
      <Link href="/" aria-label="Quasar página inicial">
        <Brand />
      </Link>
      <Link className="text-link" href="/studio">
        <ArrowLeft size={16} />
        Voltar ao estúdio
      </Link>
      <h1>Quasar no seu dispositivo.</h1>
      <p>Escolha como abrir seu espaço. Sua conta e a IA são as mesmas em todas as versões.</p>
      <DownloadNotice />
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
                {build.preview && <small>Versão de teste · {build.version}</small>}
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
          <li>Arraste o Quasar para a pasta Aplicativos. Depois, ejete o instalador.</li>
          <li>Abra o Quasar pela pasta Aplicativos.</li>
        </ol>
        <details>
          <summary>O Mac bloqueou a abertura?</summary>
          <p>
            Depois de tentar abrir, vá a Ajustes do Sistema → Privacidade e Segurança. Na mensagem
            sobre o Quasar, escolha Abrir Mesmo Assim e confirme.
          </p>
          <p>
            Se você baixou a versão 0.1.0 e viu “aplicativo danificado”, substitua o aplicativo pela
            versão mais recente disponível acima. Seus projetos não precisam ser apagados.
          </p>
          <p>
            Se continuar bloqueado, instale pelo Terminal. O arquivo baixado pelo Terminal não fica
            em quarentena, então o Mac abre o Quasar sem o aviso:
          </p>
          <pre>
            <code>curl -fsSL https://nossom.absolutezro.com/instalar.sh | bash</code>
          </pre>
          <p>
            Ele escolhe a versão do seu Mac (Apple Silicon ou Intel), coloca o Quasar em Aplicativos
            e abre. Para atualizar, rode o mesmo comando. Você também pode continuar pelo navegador
            abaixo.
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
