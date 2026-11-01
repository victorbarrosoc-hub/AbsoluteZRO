'use client';
// A navegação do estúdio em quatro passos (Proposta 2, escolhida pelo titular em 01/11/2026): Tratar → Ajustar →
// Criar → Entregar. O passo aberto mostra as ferramentas dele, cada uma com uma linha curta; a pessoa sempre sabe em
// que passo está, sem procurar ferramenta numa lista longa.
import { AudioLines, Send, SlidersHorizontal, Sparkles, WandSparkles } from 'lucide-react';
import { operations, type Operation } from '@/lib/presets';
import { toolGroups } from '@/lib/workflow';

const ICONES: Record<string, typeof AudioLines> = {
  Tratar: WandSparkles,
  Ajustar: SlidersHorizontal,
  Criar: Sparkles,
  Entregar: Send,
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

export default function PassosNav({
  ferramenta,
  atual,
  desabilitado,
  onEstudio,
  onFerramenta,
}: {
  /** A ferramenta aberta (null fora do editor). */
  ferramenta?: Operation | null;
  /** A última ferramenta escolhida (abre o passo dela mesmo fora do editor). */
  atual: Operation;
  desabilitado: boolean;
  onEstudio: () => void;
  onFerramenta: (id: Operation) => void;
}) {
  return (
    <>
      <button className={ferramenta ? 'active' : ''} onClick={onEstudio} disabled={desabilitado}>
        <AudioLines size={18} /> Estúdio
      </button>
      <div className="passos" role="group" aria-label="Passos do estúdio">
        {toolGroups.map((g, n) => {
          const Icone = ICONES[g.label] ?? AudioLines;
          const aberto = !!ferramenta && g.tools.includes(atual);
          return (
            <div key={g.label} className={`passo ${aberto ? 'aberto' : ''}`}>
              <button
                className="passo-titulo"
                aria-expanded={aberto}
                disabled={desabilitado}
                onClick={() => onFerramenta(g.tools.includes(atual) ? atual : g.tools[0])}
              >
                <span className="passo-num" aria-hidden="true">
                  {n + 1}
                </span>
                <Icone size={16} /> {g.label}
              </button>
              {aberto && (
                <ul>
                  {g.tools.map((id) => (
                    <li key={id}>
                      <button
                        className={id === ferramenta ? 'active' : ''}
                        aria-current={id === ferramenta ? 'page' : undefined}
                        disabled={desabilitado}
                        onClick={() => onFerramenta(id)}
                      >
                        <strong>{operations.find((o) => o.id === id)?.label ?? id}</strong>
                        <small>{CURTO[id]}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
