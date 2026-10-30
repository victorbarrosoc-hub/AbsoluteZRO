'use client';
/**
 * O Set da Absolute ZRO (ADR 0032 de lá) no estúdio: quem da equipe e dos contatos está online, em qual app, e as
 * conversas (diretas e do projeto). É a aba em comum de todas as plataformas: aqui, "Set" no fim da navegação do
 * estúdio (lateral e barra do celular). A folha é o `<zro-set modo="folha">` publicado pela Absolute ZRO (lateral no
 * computador, tela cheia no iPhone), vestida com os tokens do NOSSOM (studio.css, --zro-set-*). Ele fala com
 * /api/zro/set, o repasse do servidor que acrescenta o token da conta (nada de token no navegador). A entrada só
 * aparece quando o Set responde (conta conectada com o escopo zro.set).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const ZRO_SET_SCRIPT = 'https://absolutezro.com/set/v1/zro-set.js';

type ZroSetElement = HTMLElement & { aberto?: boolean; abrirSet?: () => void; fecharSet?: () => void };
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'zro-set': React.DetailedHTMLProps<React.HTMLAttributes<ZroSetElement>, ZroSetElement> & {
        api?: string;
        modo?: 'botao' | 'pagina' | 'folha';
        tema?: 'claro' | 'escuro' | 'auto';
      };
    }
  }
}

export type SetZro = { visivel: boolean; novidades: number; online: number; aberto: boolean; alternar: () => void };

/** O estado do Set para as entradas da navegação, e o elemento (`elemento`) que vai uma vez no estúdio. */
export function useSetZro(ligado: boolean, theme: 'system' | 'light' | 'dark') {
  const ref = useRef<ZroSetElement>(null);
  const [visivel, setVisivel] = useState(false);
  const [novidades, setNovidades] = useState(0);
  const [online, setOnline] = useState(0);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!ligado || customElements.get('zro-set') || document.querySelector(`script[src="${ZRO_SET_SCRIPT}"]`)) return;
    const s = document.createElement('script');
    s.type = 'module';
    s.src = ZRO_SET_SCRIPT;
    document.head.append(s);
  }, [ligado]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const estado = (e: Event) => {
      const d = (e as CustomEvent<{ online?: number; naoLidas?: number; pedidos?: number }>).detail || {};
      setVisivel(true);
      setOnline(d.online || 0);
      setNovidades((d.naoLidas || 0) + (d.pedidos || 0));
    };
    const fora = () => setVisivel(false);
    const abriu = () => setAberto(true);
    const fechou = () => setAberto(false);
    el.addEventListener('zro-set:estado', estado);
    el.addEventListener('zro-set:sem-login', fora);
    el.addEventListener('zro-set:aberto', abriu);
    el.addEventListener('zro-set:fechado', fechou);
    return () => {
      el.removeEventListener('zro-set:estado', estado);
      el.removeEventListener('zro-set:sem-login', fora);
      el.removeEventListener('zro-set:aberto', abriu);
      el.removeEventListener('zro-set:fechado', fechou);
    };
  }, [ligado]);

  const alternar = useCallback(() => {
    const el = ref.current;
    if (el?.aberto) el.fecharSet?.();
    else el?.abrirSet?.();
  }, []);

  // versão antiga do widget (sem o modo folha) não aparece nem fala com ninguém: a entrada fica escondida
  const elemento = ligado ? (
    <zro-set
      ref={ref}
      api="/api/zro/set"
      modo="folha"
      tema={theme === 'light' ? 'claro' : theme === 'dark' ? 'escuro' : 'auto'}
      style={{ display: 'none' }}
    />
  ) : null;
  const set: SetZro = { visivel: ligado && visivel, novidades, online, aberto, alternar };
  return { set, elemento };
}

/** O rótulo acessível da entrada: quantos online e quantas novidades. */
export function rotuloSet(s: SetZro) {
  return `Set${s.online ? `, ${s.online} online` : ''}${s.novidades ? `, ${s.novidades} ${s.novidades === 1 ? 'novidade' : 'novidades'}` : ''}`;
}
