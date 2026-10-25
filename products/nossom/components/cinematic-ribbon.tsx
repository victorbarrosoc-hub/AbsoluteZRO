'use client';
import { useEffect, useRef, useState } from 'react';
import { useAmbientMotion } from './use-ambient-motion';

/** Flowing identity lines, painted locally without per-frame React or DOM updates. */
export default function CinematicRibbon({
  energetic = false,
}: {
  energetic?: boolean;
  priority?: boolean;
}) {
  const { ref, running } = useAmbientMotion();
  const canvas = useRef<HTMLCanvasElement>(null);
  const phase = useRef(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext('2d');
    if (!context) return;
    let frame = 0;
    let previous = 0;
    let width = 0;
    let height = 0;
    let scale = 1;
    let painted = false;
    const draw = () => {
      if (!width || !height) return;
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.clearRect(0, 0, width, height);
      const small = width < 500;
      const count = small ? 20 : 32;
      const points = small ? 72 : 110;
      const time = phase.current;
      const amplitude = height * (energetic ? 0.4 : 0.29);
      const gradient = context.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, '#65bbff00');
      gradient.addColorStop(0.12, '#73c7ff');
      gradient.addColorStop(0.42, '#f2faff');
      gradient.addColorStop(0.7, '#b4ddff');
      gradient.addColorStop(0.9, '#69bdff');
      gradient.addColorStop(1, '#65bbff00');
      const yAt = (x: number, line: number) => {
        const envelope = Math.sin(x * Math.PI);
        const carrier = -Math.sin(x * Math.PI * 2 - 0.45 + Math.sin(time * 0.75) * 0.42);
        const twist = Math.cos(x * Math.PI * 2 - time + 0.65);
        return (
          height * 0.48 +
          carrier * amplitude * (0.35 + 0.65 * envelope) +
          (line - 0.5) * height * (0.06 + 0.3 * envelope * twist) +
          Math.sin(x * Math.PI * 4 + time * 0.65 + line * 2.2) * height * 0.022 * envelope
        );
      };
      for (let line = 0; line < count; line++) {
        const depth = line / (count - 1);
        context.beginPath();
        for (let point = 0; point <= points; point++) {
          const x = point / points;
          if (point) context.lineTo(x * width, yAt(x, depth));
          else context.moveTo(0, yAt(0, depth));
        }
        context.strokeStyle = gradient;
        context.globalAlpha = 0.25 + Math.sin(depth * Math.PI) * 0.62;
        context.lineWidth = small ? 0.8 : 1.05;
        context.stroke();
        if (line % 9 === 0) {
          context.globalAlpha = 0.08;
          context.lineWidth = 4;
          context.stroke();
        }
      }
      // A few travelling highlights make the direction legible without particle clutter.
      for (let i = 0; i < 3; i++) {
        const x = ((time * 0.105 + i * 0.32) % 0.84) + 0.08;
        const y = yAt(x, 0.28 + i * 0.22);
        context.globalAlpha = 0.12;
        context.fillStyle = '#86d3ff';
        context.beginPath();
        context.arc(x * width, y, 4, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 0.8;
        context.fillStyle = '#f0faff';
        context.beginPath();
        context.arc(x * width, y, 1.35, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      if (!painted) {
        painted = true;
        setReady(true);
      }
    };
    const resize = () => {
      const box = element.getBoundingClientRect();
      width = box.width;
      height = box.height;
      scale = Math.min(devicePixelRatio || 1, 1.5);
      element.width = Math.max(1, Math.round(width * scale));
      element.height = Math.max(1, Math.round(height * scale));
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const animate = (now: number) => {
      const interval = width < 500 ? 1000 / 24 : 1000 / 30;
      if (!previous || now - previous >= interval) {
        const delta = previous ? Math.min((now - previous) / 1000, 0.1) : 0;
        phase.current += delta * (energetic ? 2.8 : 0.9);
        previous = now;
        draw();
      }
      frame = requestAnimationFrame(animate);
    };
    if (running) frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [running, energetic]);
  return (
    <div
      ref={ref}
      className={`cinematic-ribbon ${running ? 'is-running' : ''} ${energetic ? 'is-energetic' : ''} ${ready ? 'is-ready' : ''}`}
      aria-hidden="true"
    >
      <div className="ribbon-halo" />
      <svg className="ribbon-static" viewBox="0 0 1000 400" fill="none">
        {Array.from({ length: 20 }, (_, i) => (
          <path
            key={i}
            d={`M-60 ${200 + i * 2} C180 ${-25 + i * 8},300 ${60 + i * 5},500 ${205 + i * 2} S790 ${400 - i * 6},1060 ${165 + i * 2}`}
            stroke={i % 4 === 0 ? '#dfF4ff' : '#83caff'}
            strokeWidth="1"
            opacity=".65"
          />
        ))}
      </svg>
      {/* Light lines run beneath the chrome symbol, never across it. */}
      <canvas ref={canvas} className="ribbon-canvas" />
      <img
        className="ribbon-chrome"
        src="/brand/chrome-wave.webp"
        width={1440}
        height={540}
        alt=""
        decoding="async"
        loading="eager"
      />
      <div className="ribbon-ground" />
    </div>
  );
}
