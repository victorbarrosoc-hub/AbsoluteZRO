'use client';
/**
 * A Z, a IA da Absolute ZRO, no topo do Início do estúdio (site, celular/PWA e app de computador, que abre o mesmo
 * /studio). O painel é o `<zro-ia>` publicado pela Absolute ZRO; ele fala com /api/zro/ia, o repasse do servidor que
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
const CONECTAR = '/api/zro/entrar?modo=ligar&volta=%2Fstudio';

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

  // Sem o painel publicado (rede fora, bloqueio), o Início segue como antes.
  if (falhou) return null;
  return (
    <section className="zro-ia-home" aria-label="Z, a IA da Absolute ZRO">
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
