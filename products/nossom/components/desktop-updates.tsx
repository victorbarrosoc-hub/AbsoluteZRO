'use client';
import DesktopWebUpdates from './desktop-web-updates';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Bell, Download, Check, LoaderCircle, RefreshCw, X } from 'lucide-react';
import type { UpdateState } from '@/lib/desktop';
const headings: Record<UpdateState['status'], string> = {
  unavailable: 'Atualizações do aplicativo',
  idle: 'Seu aplicativo Quasar',
  checking: 'Buscando novidades…',
  current: 'Você está em dia.',
  available: 'Um novo Quasar chegou.',
  downloading: 'Sua atualização está chegando.',
  downloaded: 'Tudo pronto para atualizar.',
  installing: 'Reiniciando o Quasar…',
  error: 'Vamos tentar de novo.',
};
export default function DesktopUpdates({
  blocked = false,
  floating = false,
}: {
  blocked?: boolean;
  floating?: boolean;
}) {
  const [state, setState] = useState<UpdateState | null>(null),
    [open, setOpen] = useState(false),
    [requested, setRequested] = useState(false),
    installing = useRef(false),
    reduced = useReducedMotion();
  useEffect(() => {
    const bridge = window.nossomDesktop;
    if (!bridge) return;
    let alive = true;
    const receive = (next: UpdateState) => {
      if (!alive || !next) return;
      if (next.status === 'error') installing.current = false;
      setState(next);
      if (['available', 'downloaded', 'error'].includes(next.status)) setOpen(true);
    };
    const unsubscribe = bridge.onUpdate(receive);
    bridge
      .getUpdateState()
      .then(receive)
      .catch(() => {});
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (
      state?.status !== 'downloaded' ||
      !(requested || state.installRequested) ||
      blocked ||
      installing.current
    )
      return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () => {
          if (
            state.automatic &&
            (document.activeElement?.matches('input, textarea, select, [contenteditable="true"]') ||
              document.querySelector('[role="dialog"], [aria-busy="true"]'))
          ) {
            schedule();
            return;
          }
          installing.current = true;
          window.nossomDesktop
            ?.update('install')
            .then((next) => {
              if (next) setState(next);
            })
            .catch(() => {
              installing.current = false;
              setRequested(false);
              setState((s) => s && { ...s, status: 'error' });
            });
        },
        state.automatic ? 30000 : 3000,
      );
    };
    const events = ['pointerdown', 'keydown', 'input', 'focusin'] as const;
    if (state.automatic) for (const event of events) window.addEventListener(event, schedule);
    schedule();
    return () => {
      clearTimeout(timer);
      for (const event of events) window.removeEventListener(event, schedule);
    };
  }, [state?.status, state?.installRequested, state?.automatic, requested, blocked]);
  async function act(action: 'check' | 'download' | 'install') {
    if (action === 'download') setRequested(true);
    try {
      const next = await window.nossomDesktop?.update(action);
      if (next) setState(next);
    } catch {
      setState((s) => s && { ...s, status: 'error' });
    }
  }
  if (!state) return <DesktopWebUpdates blocked={blocked} />;
  const active = ['available', 'downloading', 'downloaded'].includes(state.status),
    busy = ['checking', 'downloading', 'installing'].includes(state.status);
  return (
    <>
      <DesktopWebUpdates
        blocked={blocked || ['downloading', 'downloaded', 'installing'].includes(state.status)}
      />
      <button
        className={`icon-button desktop-update-trigger ${active ? 'has-update' : ''} ${floating ? 'floating' : ''}`}
        aria-label="Atualizações do aplicativo"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Bell size={18} />
        {active && <i />}
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.section
              className="desktop-update-notice"
              role="region"
              aria-label="Atualização Quasar"
              initial={reduced ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <button
                className="icon-button desktop-update-close"
                aria-label="Fechar aviso de atualização"
                onClick={() => setOpen(false)}
              >
                <X size={17} />
              </button>
              <span className="desktop-update-icon">
                {busy ? (
                  <LoaderCircle size={24} className="spin" />
                ) : state.status === 'current' ? (
                  <Check size={24} />
                ) : (
                  <Download size={24} />
                )}
              </span>
              <h2>{headings[state.status]}</h2>
              <p>
                Versão atual {state.version}
                {state.nextVersion ? ` · Nova versão ${state.nextVersion}` : ''}
              </p>
              {state.status === 'available' && (
                <>
                  <p>
                    {state.automatic
                      ? 'O download começa automaticamente. A instalação aguarda sua gravação ou tratamento terminar.'
                      : 'Baixe por aqui. Ao terminar, o aplicativo reinicia e instala a nova versão.'}
                  </p>
                  {!state.automatic && (
                    <button className="button primary" onClick={() => act('download')}>
                      Atualizar agora <Download size={16} />
                    </button>
                  )}
                </>
              )}
              {state.status === 'downloading' && (
                <>
                  <progress max="100" value={state.progress} aria-label="Download da atualização" />
                  <span aria-live="polite">{state.progress}% baixado</span>
                </>
              )}
              {state.status === 'downloaded' &&
                (blocked ? (
                  <p role="status">
                    Aguardando sua gravação ou tratamento terminar antes de reiniciar.
                  </p>
                ) : requested || state.installRequested ? (
                  <p role="status">
                    {state.automatic
                      ? 'Atualização pronta. Vamos instalar quando você fizer uma pausa.'
                      : 'O download terminou. Reiniciando para instalar…'}
                  </p>
                ) : (
                  <button className="button primary" onClick={() => setRequested(true)}>
                    Reiniciar e atualizar <RefreshCw size={16} />
                  </button>
                ))}
              {['idle', 'current', 'error'].includes(state.status) && (
                <>
                  {state.status === 'error' && (
                    <p role="status">
                      {state.error ||
                        'Não foi possível atualizar agora. Você pode continuar usando a plataforma.'}
                    </p>
                  )}
                  <button className="button secondary" onClick={() => act('check')}>
                    Buscar atualização <RefreshCw size={16} />
                  </button>
                </>
              )}
              {state.status === 'unavailable' && (
                <p>
                  Esta prévia ainda não possui atualização automática do instalador. Ao
                  disponibilizarmos a distribuição assinada, será preciso instalá-la uma vez para
                  ativar esse recurso. As melhorias do estúdio chegam ao reabrir o aplicativo.
                </p>
              )}
            </motion.section>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
