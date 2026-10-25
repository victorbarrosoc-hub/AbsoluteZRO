'use client';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Download, Share, PlusSquare, X, Smartphone } from 'lucide-react';
import { useDialog } from '@/lib/use-dialog';
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export default function InstallApp({
  onOpen,
  label = 'Adicionar à Tela de Início',
}: {
  onOpen?: () => void;
  label?: string;
}) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false),
    [standalone, setStandalone] = useState(false),
    [ios, setIos] = useState(false),
    [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  useDialog(open);
  useEffect(() => {
    const query = matchMedia('(display-mode: standalone)');
    const installed = () =>
      setStandalone(
        query.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
      );
    installed();
    setIos(
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    );
    const before = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const onInstalled = () => setStandalone(true);
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('beforeinstallprompt', before);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('keydown', escape);
    query.addEventListener('change', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', before);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('keydown', escape);
      query.removeEventListener('change', installed);
    };
  }, []);
  if (standalone) return null;
  return (
    <>
      <button
        className="install-app-button"
        onClick={async () => {
          if (prompt) {
            await prompt.prompt();
            const choice = await prompt.userChoice;
            setPrompt(null);
            if (choice.outcome === 'accepted') setStandalone(true);
          } else {
            onOpen?.();
            setOpen(true);
          }
        }}
      >
        <Download size={16} /> {label}
      </button>
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                className="modal-backdrop install-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.18 }}
                onClick={(event) => {
                  if (event.target === event.currentTarget) setOpen(false);
                }}
              >
                <motion.section
                  initial={reduced ? false : { opacity: 0, y: 22, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: reduced ? 0 : 12 }}
                  transition={{ duration: reduced ? 0 : 0.23 }}
                  className="install-dialog"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="install-title"
                  aria-describedby="install-description"
                >
                  <button
                    className="icon-button install-close"
                    aria-label="Fechar instruções de instalação"
                    onClick={() => setOpen(false)}
                  >
                    <X size={20} />
                  </button>
                  <Smartphone size={30} />
                  <h2 id="install-title">Seu som, a um toque.</h2>
                  <p id="install-description">
                    Adicione a NOSSOM à Tela de Início para abrir direto no estúdio, em modo
                    aplicativo.
                  </p>
                  <ol>
                    <li>
                      <Share size={20} />
                      <span>
                        No <strong>Safari</strong>, toque em <strong>Compartilhar</strong> na barra
                        do navegador. Se estiver em outro aplicativo, abra o link no Safari.
                      </span>
                    </li>
                    <li>
                      <PlusSquare size={20} />
                      <span>
                        Escolha <strong>Adicionar à Tela de Início</strong>. Se a opção não aparecer
                        de imediato, role a lista de ações.
                      </span>
                    </li>
                    <li>
                      <Smartphone size={20} />
                      <span>
                        Confirme o nome <strong>NOSSOM</strong> e toque em{' '}
                        <strong>Adicionar</strong>.
                      </span>
                    </li>
                  </ol>
                  {!ios && (
                    <p className="install-desktop-note">
                      No computador, use a opção de instalar na barra de endereço do Chrome/Edge. No
                      Safari do Mac, use Arquivo → Adicionar ao Dock.
                    </p>
                  )}
                  <Link
                    className="install-download-link"
                    href="/apps"
                    onClick={() => setOpen(false)}
                  >
                    Aplicativos para Mac e Windows <Download size={14} />
                  </Link>
                  <button className="button primary" onClick={() => setOpen(false)}>
                    Entendi
                  </button>
                </motion.section>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
