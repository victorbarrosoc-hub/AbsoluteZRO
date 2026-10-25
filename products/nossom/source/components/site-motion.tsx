'use client';
import { useEffect } from 'react';
import { playUiSound } from '@/lib/ui-sound';

// Delegated listeners for the public site: no React state per frame or per pointer move.
const sounds: [string, Parameters<typeof playUiSound>[0]][] = [
  ['.ns-menu', 'open'],
  ['.ns-nav nav a, .ns-faq-item button', 'step'],
  ['.button.primary, .chrome-intents a', 'tap'],
  ['.button, .home-listen-link, footer a', 'soft'],
];

export default function SiteMotion() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('.ns-header');
    let scrolled = false;
    const onScroll = () => {
      // Hysteresis avoids flicker around the threshold.
      const y = scrollY;
      if (!scrolled && y > 28) scrolled = true;
      else if (scrolled && y < 4) scrolled = false;
      else return;
      header?.classList.toggle('is-scrolled', scrolled);
    };
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      // The demo player plays real audio; it stays silent.
      if (!target?.closest || target.closest('.voice-player')) return;
      for (const [selector, sound] of sounds) {
        if (!target.closest(selector)) continue;
        if (
          sound === 'open' &&
          target.closest('.ns-menu')?.getAttribute('aria-expanded') === 'true'
        )
          return playUiSound('close');
        return playUiSound(sound);
      }
    };
    document.addEventListener('click', onClick, true);

    // Specular highlight follows the pointer on glass surfaces.
    let frame = 0,
      lit: HTMLElement | null = null,
      px = 0,
      py = 0;
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    const paint = () => {
      frame = 0;
      if (!lit) return;
      const r = lit.getBoundingClientRect();
      lit.style.setProperty('--mx', `${px - r.left}px`);
      lit.style.setProperty('--my', `${py - r.top}px`);
    };
    const onMove = (e: PointerEvent) => {
      const next = (e.target as Element | null)?.closest?.<HTMLElement>('.lg') ?? null;
      if (next !== lit) {
        lit?.classList.remove('is-lit');
        lit = next;
        lit?.classList.add('is-lit');
      }
      if (!lit) return;
      px = e.clientX;
      py = e.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    if (fine) document.addEventListener('pointermove', onMove, { passive: true });

    // Step illustrations animate only while visible.
    const quick = document.querySelector('.home-quick');
    const io = new IntersectionObserver(([entry]) =>
      quick?.classList.toggle('is-visible', entry.isIntersecting),
    );
    if (quick) io.observe(quick);

    return () => {
      removeEventListener('scroll', onScroll);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
      io.disconnect();
    };
  }, []);
  return null;
}
