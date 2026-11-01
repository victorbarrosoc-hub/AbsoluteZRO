'use client';
// A navegação do estúdio da Proposta 2 (escolhida pelo titular em 01/11/2026): no trilho, os quatro passos (Tratar →
// Ajustar → Criar → Entregar); na coluna ao lado, as ferramentas do passo aberto, cada uma com ícone e uma linha curta.
// A pessoa sempre sabe em que passo está, sem procurar ferramenta numa lista longa.
import {
  AudioLines,
  Captions,
  Gauge,
  Layers,
  Mic,
  Music2,
  Send,
  SlidersHorizontal,
  Sparkles,
  Waves,
  Wind,
  Wand2,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { operations, type Operation } from '@/lib/presets';
import { toolGroups } from '@/lib/workflow';

const ICONES_PASSO: Record<string, LucideIcon> = {
  Tratar: WandSparkles,
  Ajustar: SlidersHorizontal,
  Criar: Sparkles,
  Entregar: Send,
};
const ICONES: Record<Operation, LucideIcon> = {
  auto: Sparkles,
  vocals: Mic,
  remix: Layers,
  denoise: Waves,
  wind: Wind,
  clarity: Wand2,
  eq: SlidersHorizontal,
  level: Gauge,
  effects: Sparkles,
  mix: Music2,
  master: Send,
  transcribe: Captions,
};
const CURTO: Record<Operation, string> = {
  auto: 'Voz limpa e clara',
  vocals: 'Só a voz fica',
  remix: 'Cinco faixas separadas',
  denoise: 'Fala ou som geral',
  wind: 'Grave e rajada',
  clarity: 'Limpeza e presença',
  eq: 'Assinatura de voz',
  level: 'Tudo no mesmo nível',
  effects: 'Ambientes e texturas',
  mix: 'Trilha sob a fala',
  master: 'YouTube, podcast, TV',
  transcribe: 'Cada fala no tempo',
};

/** O passo da ferramenta (o primeiro, se nenhuma). */
export function passoDe(id: Operation) {
  return toolGroups.find((g) => g.tools.includes(id)) ?? toolGroups[0];
}

/** Os quatro passos, no trilho. */
export function PassosTrilho({
  ferramenta,
  atual,
  desabilitado,
  onFerramenta,
}: {
  /** A ferramenta aberta (fora do editor: nada marcado). */
  ferramenta?: Operation | null;
  /** A última ferramenta escolhida (ao voltar a um passo, abre nela). */
  atual: Operation;
  desabilitado: boolean;
  onFerramenta: (id: Operation) => void;
}) {
  const aberto = ferramenta ? passoDe(ferramenta).label : null;
  return (
    <div className="passos-trilho" role="group" aria-label="Passos do estúdio">
      {toolGroups.map((g) => {
        const Icone = ICONES_PASSO[g.label] ?? AudioLines;
        return (
          <button
            key={g.label}
            className={`trilho-item ${aberto === g.label ? 'active' : ''}`}
            aria-current={aberto === g.label ? 'step' : undefined}
            disabled={desabilitado}
            onClick={() => onFerramenta(g.tools.includes(atual) ? atual : g.tools[0])}
          >
            <Icone size={20} />
            <span>{g.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** As ferramentas do passo aberto, na coluna ao lado do trilho. */
export function PassosLista({
  ferramenta,
  atual,
  desabilitado,
  onFerramenta,
}: {
  ferramenta?: Operation | null;
  atual: Operation;
  desabilitado: boolean;
  onFerramenta: (id: Operation) => void;
}) {
  const g = passoDe(ferramenta ?? atual);
  return (
    <section className="passos-lista" aria-label={`Ferramentas de ${g.label}`}>
      <h2>{g.label}</h2>
      <ul>
        {g.tools.map((id) => {
          const Icone = ICONES[id];
          const ativo = id === ferramenta;
          return (
            <li key={id}>
              <button
                className={ativo ? 'active' : ''}
                aria-current={ativo ? 'page' : undefined}
                disabled={desabilitado}
                onClick={() => onFerramenta(id)}
              >
                <span className="ferr-icone" aria-hidden="true">
                  <Icone size={17} />
                </span>
                <span className="ferr-textos">
                  <strong>{operations.find((o) => o.id === id)?.label ?? id}</strong>
                  <small>{CURTO[id]}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
