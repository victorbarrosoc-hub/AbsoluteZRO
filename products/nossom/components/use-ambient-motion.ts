'use client';
import { useEffect, useRef, useState } from 'react';

/** Pause decorative work when hidden, offscreen or the device requests less motion. */
export function useAmbientMotion() {
  const ref = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let visible = false;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () =>
      setRunning(visible && document.visibilityState === 'visible' && !reduced.matches);
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        update();
      },
      { threshold: 0 },
    );
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    reduced.addEventListener('change', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
      reduced.removeEventListener('change', update);
    };
  }, []);
  return { ref, running };
}
