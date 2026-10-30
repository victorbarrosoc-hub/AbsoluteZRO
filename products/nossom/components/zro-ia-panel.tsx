'use client';
/**
 * A Z, a IA da Absolute ZRO, na tela própria do estúdio (/studio/z). Desde 29/10/2026 (titular; Plano de Integração
 * §7–8) não é a primeira da navegação nem a entrada: /studio abre no Início, e a Z abre pelo anel discreto do topo, pelo
 * último item da barra lateral ou por link direto. Ocupa a tela toda. O painel é o `<zro-ia>` publicado pela Absolute ZRO; ele fala com /api/zro/ia, o repasse do servidor que
 * acrescenta o token da conta (nada de token no navegador). Sem a conta Absolute ZRO conectada (ou com um token antigo,
 * sem o escopo da IA), o painel avisa e aqui aparece "Conectar com Absolute ZRO".
 */
import { useEffect, useRef, useState } from 'react';
import { ZroSymbol } from './zro-symbol';

export const ZRO_IA_SCRIPT = 'https://absolutezro.com/ia/v1/zro-ia.js';
// Só o que a Z de fato faz aqui: conversa e lê a conta. Tratar o áudio continua no estúdio.
const SUGESTOES = [
  'Como deixo minha fala mais limpa?',
  'Isolar voz ou limpar fala?',
  'Volume certo para podcast',
  'Quantos créditos de IA tenho?',
];
const CONECTAR = '/api/zro/entrar?modo=ligar&volta=%2Fstudio%2Fz';

type ZroIaElement = HTMLElement & { token?: unknown };
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'zro-ia': React.DetailedHTMLProps<React.HTMLAttributes<ZroIaElement>, ZroIaElement> & {
        api?: string;
        apoio?: string;
        sugestoes?: string;
        tema?: 'claro' | 'escuro' | 'auto';
      };
    }
  }
}

export default function ZroIaPanel({ theme }: { theme: 'system' | 'light' | 'dark' }) {
  const ref = useRef<ZroIaElement>(null);
  const [semLogin, setSemLogin] = useState(false);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    if (customElements.get('zro-ia')) return;
    let script = document.querySelector<HTMLScriptElement>(`script[src="${ZRO_IA_SCRIPT}"]`);
    const fail = () => setFalhou(true);
    if (!script) {
      script = document.createElement('script');
      script.type = 'module';
      script.src = ZRO_IA_SCRIPT;
      document.head.append(script);
    }
    script.addEventListener('error', fail);
    return () => script?.removeEventListener('error', fail);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sem = () => setSemLogin(true);
    const ok = () => setSemLogin(false);
    el.addEventListener('zro-ia:sem-login', sem);
    el.addEventListener('zro-ia:resposta', ok);
    return () => {
      el.removeEventListener('zro-ia:sem-login', sem);
      el.removeEventListener('zro-ia:resposta', ok);
    };
  }, [falhou]);

  // Sem o painel publicado (rede fora, bloqueio): avisa aqui mesmo, sem fingir conversa.
  if (falhou)
    return (
      <section className="zro-ia-tela zro-ia-falhou" aria-label="Z, a IA da Absolute ZRO">
        <ZroSymbol size={40} />
        <p role="status">A Z não carregou agora.</p>
        <button className="button" onClick={() => location.reload()}>
          Tentar de novo
        </button>
      </section>
    );
  return (
    <section
      className="zro-ia-tela"
      aria-label="Z, a IA da Absolute ZRO"
      data-z={semLogin ? 'sem-login' : undefined}
    >
      <zro-ia
        ref={ref}
        api="/api/zro/ia"
        tema={theme === 'light' ? 'claro' : theme === 'dark' ? 'escuro' : 'auto'}
        apoio="Pergunte sobre seu áudio."
        sugestoes={JSON.stringify(SUGESTOES)}
      />
      {semLogin && (
        <div className="zro-ia-conectar" role="status">
          <p>Conecte sua conta Absolute ZRO para conversar com a Z.</p>
          <a className="button primary" href={CONECTAR}>
            <ZroSymbol size={16} /> Conectar com Absolute ZRO
          </a>
        </div>
      )}
    </section>
  );
}
