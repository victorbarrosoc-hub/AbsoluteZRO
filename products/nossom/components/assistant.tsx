'use client';
import { useState, useEffect, useRef, useId } from 'react';
import AIMotion from './ai-motion';
import QuasarIA from './quasar-ia';
import { passoDe, slugPasso } from './passos-nav';
import type { ProjectSummary } from '@/lib/storage';
import { useDialog } from '@/lib/use-dialog';
import { useConversation } from '@elevenlabs/react';
import {
  ArrowUp,
  Paperclip,
  FileAudio,
  AudioLines,
  Mic,
  PhoneOff,
  X,
  Sparkles,
  ArrowRight,
  Plus,
} from 'lucide-react';
import { toolPath } from '@/lib/studio-routes';
import { inferPlan, operations, type Operation } from '@/lib/presets';
/** Barrinhas decorativas de cada projeto nos Recentes (fixas pelo id, não são a onda real do áudio). */
function barras(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return Array.from({ length: 28 }, (_, i) => {
    h = (h * 1103515245 + 12345) >>> 0;
    return 30 + (Math.abs(Math.sin(i * 0.7 + (h % 7))) * 50 + (h % 21)) * 0.9;
  });
}
const relogio = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
/** "há 6 minutos", "ontem", "há 3 dias". */
function quando(ms: number) {
  const min = Math.round((ms - Date.now()) / 60000);
  if (Math.abs(min) < 60) return relogio.format(min, 'minute');
  const horas = Math.round(min / 60);
  if (Math.abs(horas) < 24) return relogio.format(horas, 'hour');
  return relogio.format(Math.round(horas / 24), 'day');
}
export default function Assistant({
  onClose = () => {},
  onPlan,
  context,
  embedded = false,
  onUpload,
  fileName,
  disabled = false,
  onRecord,
  recentes,
  onAbrir,
}: {
  onClose?: () => void;
  embedded?: boolean;
  onUpload?: () => void;
  fileName?: string;
  disabled?: boolean;
  /** Início do estúdio: "Gravar" ao lado de "Enviar áudio". */
  onRecord?: () => void;
  /** Início do estúdio: os projetos mais recentes deste aparelho, cada um com a cor do passo em que parou. */
  recentes?: ProjectSummary[];
  onAbrir?: (id: string) => void;
  onPlan?: (operation: Operation, intensity?: number, eqPreset?: string) => void;
  context?: Record<string, number | null>;
}) {
  const id = useId();
  const Title = embedded ? 'h1' : 'h2';
  const [cloud, setCloud] = useState(false),
    [authenticated, setAuthenticated] = useState(false),
    [loading, setLoading] = useState(true),
    [thinking, setThinking] = useState(false);
  const [recommended, setRecommended] = useState<{ intensity?: number; eqPreset?: string }>({});
  const pending = useRef<AbortController | null>(null);
  const managedConversation = useRef<string | undefined>(undefined);
  function endManagedConversation() {
    const token = managedConversation.current;
    managedConversation.current = undefined;
    if (token)
      void fetch('/api/ai/assistant', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation: token }),
        keepalive: true,
      }).catch(() => {});
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/ai/status', {
      cache: 'no-store',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
    })
      .then((r) => r.json())
      .then((s) => {
        setAuthenticated(s.authorized === true);
        setCloud(s.configured && s.authorized);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      pending.current?.abort();
      endManagedConversation();
    };
  }, []);
  const [text, setText] = useState(''),
    [reply, setReply] = useState(''),
    [plan, setPlan] = useState<Operation | null>(null),
    [error, setError] = useState('');
  useDialog(!embedded);
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  const conversation = useConversation({
    onError: () =>
      setError('Não foi possível conectar a voz. Confira a conexão e tente novamente.'),
    onMessage: (message) => {
      if (message.source === 'ai') setReply(message.message);
    },
  });
  useEffect(
    () => () => {
      void conversation.endSession();
    },
    [conversation.endSession],
  );
  useEffect(() => {
    pending.current?.abort();
    endManagedConversation();
    setReply('');
    setPlan(null);
    setThinking(false);
  }, [fileName]);
  const connected = conversation.status === 'connected';
  async function suggest(value: string) {
    if (loading || !authenticated || disabled || !value.trim()) return;
    setText(value);
    setError('');
    setRecommended({});
    if (cloud) {
      setThinking(true);
      setPlan(null);
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      try {
        const response = await fetch('/api/ai/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: value, context, conversation: managedConversation.current }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
        });
        const result = await response.json();
        if (controller.signal.aborted || pending.current !== controller) return;
        if (!response.ok) throw new Error(result.error);
        if (typeof result.conversation === 'string')
          managedConversation.current = result.conversation;
        setReply(result.reply);
        setPlan(operations.some((o) => o.id === result.operation) ? result.operation : null);
        setRecommended({ intensity: result.intensity, eqPreset: result.eqPreset });
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof DOMException && e.name === 'TimeoutError'
              ? 'A resposta demorou. Tente novamente ou escolha um dos atalhos.'
              : e instanceof Error
                ? e.message
                : 'Não foi possível concluir. Tente novamente.',
          );
      } finally {
        if (pending.current === controller) {
          pending.current = null;
          setThinking(false);
        }
      }
      return;
    }
    const selected = inferPlan(value);
    setPlan(selected);
    setReply(
      selected
        ? `${operations.find((o) => o.id === selected)?.description} Você poderá revisar a intensidade antes de aplicar. Nenhum áudio foi alterado.`
        : 'Esse pedido ainda não tem um tratamento disponível. Posso ajudar com ruído contínuo, clareza da voz, vento, volume, mixagem ou preparação para entrega.',
    );
  }
  async function voice() {
    setError('');
    try {
      if (connected) await conversation.endSession();
      else if (agentId) await conversation.startSession({ agentId, connectionType: 'websocket' });
    } catch {
      setError(
        'Permita o microfone para conversar. Se o problema continuar, verifique o agente ElevenLabs.',
      );
    }
  }
  const estado = error
    ? 'error'
    : conversation.isSpeaking
      ? 'speaking'
      : connected
        ? 'listening'
        : thinking || disabled
          ? 'thinking'
          : 'idle';
  const modo = (
    <div className="assistant-mode" data-estado={estado} data-ia={cloud ? 'on' : 'off'}>
      {embedded ? <i className="assistant-vivo" aria-hidden="true" /> : <Sparkles size={13} />}{' '}
      {loading
        ? 'Preparando seu assistente…'
        : cloud
          ? thinking && embedded
            ? 'Pensando…'
            : connected && embedded
              ? conversation.isSpeaking
                ? 'Falando…'
                : 'Ouvindo…'
              : 'Pronta para ajudar'
          : authenticated
            ? 'Ajuda básica · IA temporariamente indisponível'
            : 'Entre na sua conta para conversar'}
    </div>
  );
  return (
    <div
      className={embedded ? 'assistant-embedded' : 'modal-backdrop'}
      onClick={embedded ? undefined : onClose}
    >
      <section
        className="assistant-panel"
        role={embedded ? undefined : 'dialog'}
        aria-modal={embedded ? undefined : true}
        aria-labelledby={id + '-title'}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          {!embedded && (
            <button className="icon-button" aria-label="Fechar assistente" onClick={onClose}>
              <X size={19} />
            </button>
          )}
        </header>
        {embedded ? (
          // Início (titular, 01/11/2026): o Quasar é a IA, como o Z no HUB. A Coroa vazada e viva, maior, com a onda
          // correndo pela borda e o feixe horizontal no clarão; pensa, ouve e fala junto com o assistente.
          <>
            <div className={`assistant-marca state-${estado}`} aria-hidden="true">
              <QuasarIA estado={estado} />
            </div>
            {/* no Início, o estado só aparece com a IA ligada (titular: tira o "modo básico") */}
            {cloud && !loading && modo}
          </>
        ) : (
          <AIMotion compact state={estado} />
        )}
        {/* sem frase de efeito (titular, 01/11/2026): no Início o título é só para leitor de tela */}
        <Title id={id + '-title'} className={embedded ? 'sr-only' : undefined}>
          {embedded ? 'Início do Quasar' : 'Peça ao Quasar'}
        </Title>
        {embedded && onUpload && (
          <div className="assistant-acoes">
            <button
              type="button"
              className="glass-btn glass-btn--ink"
              onClick={onUpload}
              disabled={disabled}
            >
              <Plus size={17} /> Enviar áudio
            </button>
            {onRecord && (
              <button type="button" className="glass-btn" onClick={onRecord} disabled={disabled}>
                <Mic size={17} /> Gravar
              </button>
            )}
          </div>
        )}
        <p className="assistant-sub">
          {embedded ? (
            'O que você quer fazer com seu áudio?'
          ) : (
            <>
              Descreva o que quer melhorar.
              <br />
              Eu encontro um ponto de partida para o seu som.
            </>
          )}
        </p>
        {!embedded && modo}
        {!loading && !authenticated && (
          <a className="button primary" href="/entrar?next=%2Fstudio%2Fia">
            Entrar para conversar
          </a>
        )}
        {fileName && (
          <div className="assistant-attachment">
            <FileAudio size={20} />
            <span>
              <strong>{fileName}</strong>
              <small>Original preservado</small>
            </span>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            suggest(text);
          }}
        >
          {onUpload && (
            <button
              type="button"
              className="assistant-attach"
              aria-label="Anexar áudio ao assistente"
              onClick={onUpload}
              disabled={disabled || thinking}
            >
              <Paperclip size={20} />
            </button>
          )}
          <label className="sr-only" htmlFor={id + '-text'}>
            Descreva seu objetivo
          </label>
          <input
            id={id + '-text'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={embedded ? 'Ou peça ao Quasar…' : 'Ou conte sua ideia…'}
            maxLength={1500}
            disabled={thinking || loading || !authenticated || disabled}
            required
          />
          <button
            disabled={thinking || loading || !authenticated || disabled}
            aria-label="Encontrar tratamento"
            className="icon-button solid"
          >
            <ArrowUp size={18} />
          </button>
        </form>
        <div className={`suggestion-chips ${embedded ? 'atalhos' : ''}`}>
          {(
            [
              {
                label: 'Limpar minha fala',
                curto: 'Limpar fala',
                operation: 'auto',
                description: 'Reduzir ruído da gravação',
              },
              {
                label: 'Isolar voz',
                curto: 'Isolar voz',
                operation: 'vocals',
                description: 'Tirar música e ruído de fundo',
              },
              {
                label: 'Nivelar volumes',
                curto: 'Nivelar',
                operation: 'level',
                description: 'Equilibrar trechos baixos e altos',
              },
              {
                label: 'Preparar para publicar',
                curto: 'Publicar',
                operation: 'master',
                description: 'Finalizar o volume para entrega',
              },
            ] as const
          ).map((shortcut) => (
            <button
              key={shortcut.operation}
              data-intent={shortcut.operation}
              data-passo={slugPasso(passoDe(shortcut.operation).label)}
              aria-label={shortcut.label}
              aria-describedby={id + shortcut.operation}
              disabled={disabled}
              onClick={() => {
                pending.current?.abort();
                pending.current = null;
                setThinking(false);
                if (onPlan) {
                  onPlan(shortcut.operation);
                  onClose();
                } else location.href = toolPath(shortcut.operation);
              }}
            >
              {embedded && <i className="ponto" aria-hidden="true" />}
              <strong>{embedded ? shortcut.curto : shortcut.label}</strong>
              <span id={id + shortcut.operation}>{shortcut.description}</span>
            </button>
          ))}
        </div>
        {embedded && recentes && recentes.length > 0 && onAbrir && (
          <section className="assistant-recentes" aria-labelledby={id + '-recentes'}>
            <h2 id={id + '-recentes'} className="rotulo">
              Recentes
            </h2>
            <div>
              {recentes.slice(0, 6).map((p) => {
                const op = operations.find((o) => o.id === p.lastOperation)?.id;
                const passo = op ? passoDe(op).label : null;
                return (
                  <button
                    key={p.id}
                    type="button"
                    data-passo={passo ? slugPasso(passo) : undefined}
                    onClick={() => onAbrir(p.id)}
                    disabled={disabled}
                  >
                    <span className="recente-onda" aria-hidden="true">
                      {barras(p.id).map((h, i) => (
                        <i key={i} style={{ height: `${h}%` }} />
                      ))}
                    </span>
                    <strong>{p.name}</strong>
                    <small>
                      {passo ? `${passo} · ` : ''}
                      {quando(p.updatedAt)}
                    </small>
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {thinking && (
          <p className="field-hint" role="status">
            Pensando no seu áudio…{' '}
            <button
              type="button"
              className="text-link"
              onClick={() => {
                pending.current?.abort();
                pending.current = null;
                setThinking(false);
              }}
            >
              Cancelar
            </button>
          </p>
        )}
        {reply && (
          <div className="assistant-reply" aria-live="polite">
            <p>{reply}</p>
            {plan && (
              <button
                className="button small primary"
                onClick={() => {
                  if (onPlan) {
                    onPlan(plan, recommended.intensity, recommended.eqPreset);
                    onClose();
                  } else location.href = toolPath(plan);
                }}
              >
                Revisar tratamento <ArrowRight size={14} />
              </button>
            )}
          </div>
        )}
        <details className="assistant-details">
          <summary>Privacidade e formatos</summary>
          <p>Áudio ou vídeo, até 10 minutos.</p>
          <p>
            O assistente recebe seu texto e medições. Na restauração, uma cópia temporária do áudio
            é processada na nuvem. O original fica neste dispositivo.
          </p>
        </details>
        {agentId && (
          <div className="voice-connect">
            <button
              className={`button ${connected ? 'primary' : 'secondary'}`}
              disabled={!agentId || conversation.status === 'connecting'}
              onClick={voice}
            >
              {connected ? <PhoneOff size={16} /> : <Mic size={16} />}{' '}
              {connected
                ? 'Encerrar conversa'
                : conversation.status === 'connecting'
                  ? 'Conectando…'
                  : 'Conversar por voz'}
            </button>
            <span>
              {agentId
                ? 'Voz por ElevenLabs · o microfone é enviado ao provedor durante a conversa.'
                : 'Voz ElevenLabs disponível após conectar um agente.'}
            </span>
          </div>
        )}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
