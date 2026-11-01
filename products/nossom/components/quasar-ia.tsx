'use client';
import { useEffect, useRef, useState } from 'react';
import { CoroaLuz } from './brand';
import { useAmbientMotion } from './use-ambient-motion';
import { MotorQuasar, type EstadoQuasar } from '@/lib/quasar-ia';

/**
 * O Quasar como IA no Início: a Coroa sonora viva (lib/quasar-ia.ts). Anima só com a aba visível, na tela e sem
 * "reduzir movimento"; parada, fica na pose da logo. Antes do primeiro quadro aparece a Coroa em SVG.
 */
export default function QuasarIA({ estado }: { estado: EstadoQuasar }) {
  const { ref, running } = useAmbientMotion();
  const canvas = useRef<HTMLCanvasElement>(null);
  const motor = useRef<MotorQuasar | null>(null);
  const [pronto, setPronto] = useState(false);
  motor.current ??= new MotorQuasar();

  useEffect(() => {
    motor.current!.mudar(estado);
  }, [estado]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const m = motor.current!;
    let largura = 0;
    let altura = 0;
    let quadro = 0;
    let anterior = 0;
    const claro = () => el.closest('[data-theme]')?.getAttribute('data-theme') === 'light';
    const desenhar = () => {
      if (!largura || !altura) return;
      const escala = Math.min(devicePixelRatio || 1, 2);
      ctx.setTransform(escala, 0, 0, escala, 0, 0);
      m.desenhar(ctx, largura, altura, claro());
    };
    const medir = () => {
      const caixa = el.getBoundingClientRect();
      largura = caixa.width;
      altura = caixa.height;
      const escala = Math.min(devicePixelRatio || 1, 2);
      el.width = Math.max(1, Math.round(largura * escala));
      el.height = Math.max(1, Math.round(altura * escala));
      // reduzir movimento: a pose da logo; senão a Coroa acende ao começar a animar
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) m.estatico();
      desenhar();
      if (largura) setPronto(true);
    };
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    medir();
    // o tema pode mudar sem mexer no tamanho: redesenha a pose parada
    const tema = new MutationObserver(() => !running && desenhar());
    const raiz = el.closest('[data-theme]');
    if (raiz) tema.observe(raiz, { attributes: true, attributeFilter: ['data-theme'] });
    const animar = (agora: number) => {
      const intervalo = largura < 320 ? 1000 / 24 : 1000 / 30;
      if (!anterior || agora - anterior >= intervalo) {
        m.passo(anterior ? (agora - anterior) / 1000 : 0);
        anterior = agora;
        desenhar();
      }
      quadro = requestAnimationFrame(animar);
    };
    if (running) quadro = requestAnimationFrame(animar);
    return () => {
      cancelAnimationFrame(quadro);
      observador.disconnect();
      tema.disconnect();
    };
  }, [running]);

  return (
    <div
      ref={ref}
      className={`quasar-ia${running ? ' is-running' : ''}${pronto ? ' is-ready' : ''}`}
      data-estado={estado}
      aria-hidden="true"
    >
      <CoroaLuz size={200} />
      <canvas ref={canvas} />
    </div>
  );
}
