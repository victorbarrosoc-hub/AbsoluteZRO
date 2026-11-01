'use client';
import { useState, useEffect, useRef, useId } from 'react';
import AIMotion from './ai-motion';
import { Brand } from './brand';
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
} from 'lucide-react';
import { toolPath } from '@/lib/studio-routes';
import { inferPlan, operations, type Operation } from '@/lib/presets';
export default function Assistant({
  onClose = () => {},
  onPlan,
  context,
  embedded = false,
  onUpload,
  fileName,
  disabled = false,
}: {
  onClose?: () => void;
  embedded?: boolean;
  onUpload?: () => void;
  fileName?: string;
  disabled?: boolean;
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
        {/* No Início do estúdio o símbolo pequeno assina a tela (titular, 01/11/2026: sem o 3D, a ação sobe); o
            movimento grande fica no assistente aberto, onde mostra ouvindo e pensando. */}
        {embedded ? (
          <span className="assistant-simbolo" aria-hidden="true">
            <Brand compact />
          </span>
        ) : (
          <AIMotion
            compact
            state={
              error
                ? 'error'
                : conversation.isSpeaking
                  ? 'speaking'
                  : connected
                    ? 'listening'
                    : thinking || disabled
                      ? 'thinking'
                      : 'idle'
            }
          />
        )}
        <Title id={id + '-title'}>
          Seu áudio,{' '}
          {embedded ? <strong>melhor.</strong> : <span className="text-gradient">melhor.</span>}
        </Title>
        <p>
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
        <div className="assistant-mode">
          <Sparkles size={13} />{' '}
          {loading
            ? 'Preparando seu assistente…'
            : cloud
              ? 'Pronta para ajudar'
              : authenticated
                ? 'Ajuda básica · IA temporariamente indisponível'
                : 'Entre na sua conta para conversar'}
        </div>
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
            placeholder="Ou conte sua ideia…"
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
        <div className="suggestion-chips">
          {(
            [
              {
                label: 'Limpar minha fala',
                operation: 'auto',
                description: 'Reduzir ruído da gravação',
              },
              {
                label: 'Isolar voz',
                operation: 'vocals',
                description: 'Tirar música e ruído de fundo',
              },
              {
                label: 'Nivelar volumes',
                operation: 'level',
                description: 'Equilibrar trechos baixos e altos',
              },
              {
                label: 'Preparar para publicar',
                operation: 'master',
                description: 'Finalizar o volume para entrega',
              },
            ] as const
          ).map((shortcut) => (
            <button
              key={shortcut.operation}
              data-intent={shortcut.operation}
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
              <strong>{shortcut.label}</strong>
              <span id={id + shortcut.operation}>{shortcut.description}</span>
            </button>
          ))}
        </div>
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
