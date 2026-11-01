'use client';
import { useEffect, useState } from 'react';
export default function DesktopWebUpdates({ blocked }: { blocked: boolean }) {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!window.nossomDesktop) return;
    let alive = true,
      checking = false;
    const controller = new AbortController();
    const check = async () => {
      if (!alive || checking || document.visibilityState !== 'visible') return;
      const release = document.querySelector<HTMLMetaElement>(
        'meta[name="nossom-release"]',
      )?.content;
      if (!release) return;
      checking = true;
      try {
        const response = await fetch('/api/desktop/version', {
          cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        });
        const next = await response.json();
        if (
          alive &&
          response.ok &&
          typeof next.release === 'string' &&
          /^[a-f0-9]{40}$/.test(next.release) &&
          next.release !== release
        )
          setPending(true);
      } catch {
        /* Offline clients keep the current workspace. Retry on the next check. */
      } finally {
        checking = false;
      }
    };
    void check();
    const interval = setInterval(() => void check(), 60000);
    window.addEventListener('focus', check);
    return () => {
      alive = false;
      controller.abort();
      clearInterval(interval);
      window.removeEventListener('focus', check);
    };
  }, []);
  useEffect(() => {
    if (!pending || blocked) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const focused = document.activeElement;
        // Do not discard text being edited, open dialogs or background work.
        if (
          document.visibilityState !== 'visible' ||
          focused?.matches('input, textarea, select, [contenteditable="true"]') ||
          document.querySelector('[role="dialog"], [aria-busy="true"]')
        ) {
          schedule();
          return;
        }
        location.reload();
      }, 30000);
    };
    const events = ['pointerdown', 'keydown', 'input', 'focusin'] as const;
    for (const event of events) window.addEventListener(event, schedule);
    schedule();
    return () => {
      clearTimeout(timer);
      for (const event of events) window.removeEventListener(event, schedule);
    };
  }, [pending, blocked]);
  if (!pending) return null;
  return (
    <aside className="desktop-web-update" role="status">
      <strong>Uma melhoria do Quasar está pronta.</strong>
      <p>
        {blocked
          ? 'Vamos esperar sua gravação ou tratamento terminar.'
          : 'Vamos aplicar automaticamente quando você fizer uma pausa. Seus projetos salvos continuam aqui.'}
      </p>
    </aside>
  );
}
