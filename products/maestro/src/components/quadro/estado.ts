"use client";
/**
 * O estado do Quadro no navegador e a conversa com /api/quadro:
 * - grava por CAMPO, mandando como base a versão de cada campo que a pessoa viu (conflito por campo no banco);
 * - mostra a mudança na hora (otimista); recusa desfaz e conflito traz o card atual com um aviso curto;
 * - tempo real simples: a cada 5 s, com a aba à vista, pergunta "o que mudou desde" e junta o que chegou;
 *   card com gravação em andamento não é atropelado, e versão mais velha nunca substitui a mais nova;
 * - as colunas da produtora (nome, cor, ordem, arquivar) também mudam na hora e voltam se o banco recusar; a mesma
 *   pergunta de 5 s traz as colunas (outro aparelho renomeou: a tela acerta).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Referencias } from "@/lib/quadro/servidor";
import { novoId, type CampoEditavel, type CardQ, type ColunaId, type DadosCard } from "@/lib/quadro/metodo";
import { aplicarOrdem, colunasPadrao, colunasVivas, nomeDaColuna, type Coluna, type CorColuna } from "@/lib/quadro/colunas";
import { renovarSecoes } from "@/lib/quadro/renovar";

export type Inicial = Referencias & {
  cards: CardQ[];
  cursor: string;
  eu: string;
  podeEscrever: boolean;
  colunas: Coluna[];
  podeEditarColunas: boolean;
};
export type Aviso = { id: number; texto: string; desfazer?: () => void };
type Resposta = { ok: true; card: CardQ } | { ok: false; status: number; erro: string; mensagem: string; card?: CardQ };

const ENDERECO = "/api/quadro";
const POLL_MS = 5000;

async function chamar(corpo: Record<string, unknown>): Promise<Resposta> {
  try {
    const r = await fetch(ENDERECO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      cache: "no-store",
    });
    const d = (await r.json().catch(() => null)) as { card?: CardQ; erro?: string; mensagem?: string } | null;
    if (r.ok && d?.card) return { ok: true, card: d.card };
    if (r.status === 401) return { ok: false, status: 401, erro: "sem_sessao", mensagem: "A sessão acabou. Entre de novo." };
    return { ok: false, status: r.status, erro: d?.erro ?? "erro", mensagem: d?.mensagem ?? "Não deu para salvar agora.", card: d?.card };
  } catch {
    return { ok: false, status: 0, erro: "rede", mensagem: "Sem conexão. Tente de novo em instantes." };
  }
}

type RespostaColunas = { ok: true; colunas: Coluna[]; movidos?: number } | { ok: false; status: number; erro: string; mensagem: string };

async function chamarColunas(corpo: Record<string, unknown>): Promise<RespostaColunas> {
  try {
    const r = await fetch(ENDERECO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      cache: "no-store",
    });
    const d = (await r.json().catch(() => null)) as { colunas?: Coluna[]; movidos?: number; erro?: string; mensagem?: string } | null;
    if (r.ok && d?.colunas) return { ok: true, colunas: d.colunas, movidos: d.movidos };
    if (r.status === 401) return { ok: false, status: 401, erro: "sem_sessao", mensagem: "A sessão acabou. Entre de novo." };
    return { ok: false, status: r.status, erro: d?.erro ?? "erro", mensagem: d?.mensagem ?? "Não deu para salvar agora." };
  } catch {
    return { ok: false, status: 0, erro: "rede", mensagem: "Sem conexão. Tente de novo em instantes." };
  }
}

/** A mesma lista de colunas (para não trocar a referência à toa a cada 5 s). */
const mesmasColunas = (a: Coluna[], b: Coluna[]) =>
  a.length === b.length &&
  a.every((x, i) => {
    const y = b[i];
    return x.id === y.id && x.nome === y.nome && x.cor === y.cor && x.ordem === y.ordem && x.arquivada === y.arquivada && x.papel === y.papel;
  });

const porId = (l: CardQ[]) => Object.fromEntries(l.map((c) => [c.id, c])) as Record<string, CardQ>;

export function useQuadro(ini: Inicial) {
  const [cards, setCards] = useState<Record<string, CardQ>>(() => porId(ini.cards));
  const [colunas, setColunas] = useState<Coluna[]>(() => (ini.colunas.length ? ini.colunas : colunasPadrao()));
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const cursor = useRef(ini.cursor);
  const emVoo = useRef(new Map<string, number>());
  const colunasEmVoo = useRef(0);
  const atual = useRef(cards);
  const colunasAgora = useRef(colunas);
  const perguntarJa = useRef<() => void>(() => {});
  useEffect(() => {
    atual.current = cards;
    colunasAgora.current = colunas;
  });

  // depois de gravar (com uma folga, para juntar várias mudanças), as outras seções guardadas no navegador caducam
  const renovarT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const renovar = useCallback(() => {
    clearTimeout(renovarT.current);
    renovarT.current = setTimeout(() => void renovarSecoes().catch(() => {}), 1500);
  }, []);
  useEffect(() => () => clearTimeout(renovarT.current), []);

  const avisar = useCallback((texto: string, desfazer?: () => void) => setAviso({ id: Date.now(), texto, desfazer }), []);
  const fecharAviso = useCallback(() => setAviso(null), []);

  const voar = (id: string, d: 1 | -1) => {
    const n = (emVoo.current.get(id) ?? 0) + d;
    if (n > 0) emVoo.current.set(id, n);
    else emVoo.current.delete(id);
  };
  const por = useCallback((c: CardQ) => {
    setCards((m) => {
      const n = { ...m };
      if (c.dados.apagadoEm) delete n[c.id];
      else n[c.id] = c;
      return n;
    });
  }, []);

  /** Junta o que veio do banco: card em gravação fica como está; versão mais velha não volta. */
  const juntar = useCallback((chegaram: CardQ[]) => {
    // o mesmo card que já está na tela (a folga de 5 s do servidor devolve o que acabou de mudar): nada a desenhar
    const igual = (local: CardQ | undefined, c: CardQ) => !!local && local.versao === c.versao && JSON.stringify(local.dados) === JSON.stringify(c.dados);
    const pula = (m: Record<string, CardQ>, c: CardQ) => {
      const local = m[c.id];
      return emVoo.current.has(c.id) || (!!local && local.versao > c.versao) || igual(local, c) || (!local && !!c.dados.apagadoEm);
    };
    // nada novo: nem agenda render (senão o Quadro inteiro desenharia e mediria a cada 5 s, até no meio de um arrasto)
    if (chegaram.every((c) => pula(atual.current, c))) return;
    setCards((m) => {
      let n = m;
      for (const c of chegaram) {
        if (pula(m, c)) continue;
        if (n === m) n = { ...m };
        if (c.dados.apagadoEm) delete n[c.id];
        else n[c.id] = c;
      }
      return n;
    });
  }, []);

  // tempo real simples: pergunta a cada 5 s com a aba à vista, e logo que a aba volta
  useEffect(() => {
    let parado = false;
    let indo = false;
    let t: ReturnType<typeof setTimeout> | undefined;
    const volta = async () => {
      clearTimeout(t);
      if (parado || indo) return;
      if (document.visibilityState === "visible") {
        indo = true;
        try {
          const r = await fetch(`${ENDERECO}?desde=${encodeURIComponent(cursor.current)}`, { cache: "no-store" });
          if (r.ok) {
            const d = (await r.json()) as { cards: CardQ[]; cursor: string; colunas?: Coluna[] };
            cursor.current = d.cursor;
            if (d.cards.length) juntar(d.cards);
            const novas = d.colunas;
            // as mesmas colunas: nem agenda render (a cada 5 s o Quadro inteiro desenharia e mediria de novo)
            if (novas?.length && colunasEmVoo.current === 0 && !mesmasColunas(colunasAgora.current, novas)) setColunas(novas);
          }
        } catch {
          // sem rede: tenta na próxima volta
        } finally {
          indo = false;
        }
      }
      if (!parado) t = setTimeout(volta, POLL_MS);
    };
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void volta();
    };
    // A tela pode ter vindo do cache do roteador (staleTimes em next.config.ts): pergunta já o que mudou desde então.
    t = setTimeout(volta, 0);
    perguntarJa.current = () => void volta();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      parado = true;
      clearTimeout(t);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [juntar]);

  /** Muda campos de um card (otimista). Devolve false se o banco recusou. */
  const mudar = useCallback(
    async (id: string, campos: Partial<Record<CampoEditavel, unknown>>): Promise<boolean> => {
      const antes = atual.current[id];
      if (!antes) return false;
      const base: Record<string, number> = {};
      for (const k of Object.keys(campos)) base[k] = antes.versoes[k] ?? 0;
      const dados = { ...antes.dados } as Record<string, unknown>;
      for (const [k, v] of Object.entries(campos)) {
        if (v === null) delete dados[k];
        else dados[k] = v;
      }
      if (campos.coluna) dados.colunaEm = Date.now();
      por({ ...antes, dados: dados as DadosCard });
      voar(id, 1);
      const r = await chamar({ op: "mudar", id, campos, base });
      voar(id, -1);
      if (r.ok) {
        por(r.card);
        renovar();
        return true;
      }
      if (r.card) por(r.card);
      else por(antes);
      avisar(r.mensagem);
      return false;
    },
    [por, avisar, renovar],
  );

  const criar = useCallback(
    async (dados: Partial<DadosCard> & { tema: string }): Promise<string | null> => {
      const id = novoId();
      const campos: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(dados)) if (v !== undefined && v !== null && v !== "") campos[k] = v;
      const provisorio: CardQ = { id, versao: 0, versoes: {}, dados: { coluna: "pauta", ...campos, criadoEm: Date.now(), colunaEm: Date.now() } as DadosCard };
      por(provisorio);
      voar(id, 1);
      const r = await chamar({ op: "criar", id, dados: campos });
      voar(id, -1);
      if (r.ok) {
        por(r.card);
        renovar();
        return id;
      }
      setCards((m) => {
        const n = { ...m };
        delete n[id];
        return n;
      });
      avisar(r.mensagem);
      return null;
    },
    [por, avisar, renovar],
  );

  const restaurar = useCallback(
    async (id: string) => {
      const r = await chamar({ op: "restaurar", id });
      if (r.ok) por(r.card);
      else avisar(r.mensagem);
    },
    [por, avisar],
  );

  const apagar = useCallback(
    async (id: string) => {
      const antes = atual.current[id];
      if (!antes) return;
      setCards((m) => {
        const n = { ...m };
        delete n[id];
        return n;
      });
      voar(id, 1);
      const r = await chamar({ op: "apagar", id });
      voar(id, -1);
      if (r.ok) {
        avisar("Card apagado.", () => void restaurar(id));
        renovar();
      } else {
        por(antes);
        avisar(r.mensagem);
      }
    },
    [por, avisar, restaurar, renovar],
  );

  /* ───────────── colunas (só administração e gestão; o banco confere de novo) ───────────── */

  /** Grava uma mudança de colunas: a tela muda na hora (`otimista`) e volta se o banco recusar. */
  const operarColunas = useCallback(
    async (corpo: Record<string, unknown>, otimista: ((l: Coluna[]) => Coluna[]) | null): Promise<RespostaColunas> => {
      const antes = colunasAgora.current;
      if (otimista) {
        const depois = otimista(antes);
        colunasAgora.current = depois;
        setColunas(depois);
      }
      colunasEmVoo.current++;
      const r = await chamarColunas(corpo);
      colunasEmVoo.current--;
      if (r.ok) {
        colunasAgora.current = r.colunas;
        setColunas(r.colunas);
        renovar();
        return r;
      }
      if (otimista) {
        colunasAgora.current = antes;
        setColunas(antes);
      }
      avisar(r.mensagem);
      // a lista mudou em outro aparelho: busca já a de agora
      if (r.status === 409 || r.status === 404) perguntarJa.current();
      return r;
    },
    [avisar, renovar],
  );

  const renomearColuna = useCallback(
    async function renomear(id: ColunaId, nome: string, comDesfazer = true): Promise<void> {
      const antigo = colunasAgora.current.find((c) => c.id === id)?.nome;
      if (!antigo || antigo === nome) return;
      const r = await operarColunas({ op: "coluna_mudar", id, nome }, (l) => l.map((c) => (c.id === id ? { ...c, nome } : c)));
      if (r.ok && comDesfazer) avisar(`Agora é ${nome}.`, () => void renomear(id, antigo, false));
    },
    [operarColunas, avisar],
  );

  const recolorirColuna = useCallback(
    async (id: ColunaId, cor: CorColuna) => {
      if (colunasAgora.current.find((c) => c.id === id)?.cor === cor) return;
      await operarColunas({ op: "coluna_mudar", id, cor }, (l) => l.map((c) => (c.id === id ? { ...c, cor } : c)));
    },
    [operarColunas],
  );

  const ordenarColunas = useCallback(
    async function ordenar(ids: ColunaId[], comDesfazer = true): Promise<void> {
      const antes = colunasVivas(colunasAgora.current).map((c) => c.id);
      if (antes.join() === ids.join()) return;
      const r = await operarColunas({ op: "coluna_ordenar", ids }, (l) => aplicarOrdem(l, ids));
      if (r.ok && comDesfazer) avisar("Ordem salva.", () => void ordenar(antes, false));
    },
    [operarColunas, avisar],
  );

  /** Nova coluna (na posição 1..n+1; sem posição, no fim). Devolve o id dela. */
  const criarColuna = useCallback(
    async (nome: string, cor: CorColuna, posicao?: number): Promise<ColunaId | null> => {
      const antes = new Set(colunasAgora.current.map((c) => c.id));
      const r = await operarColunas({ op: "coluna_criar", nome, cor, posicao: posicao ?? null }, null);
      if (!r.ok) return null;
      return r.colunas.find((c) => !antes.has(c.id))?.id ?? null;
    },
    [operarColunas],
  );

  /** Arquiva levando os cards para `destino` (a tela já mostra os cards lá; volta tudo se o banco recusar). */
  const arquivarColuna = useCallback(
    async (id: ColunaId, destino: ColunaId): Promise<boolean> => {
      const cardsAntes = atual.current;
      const ids = Object.values(cardsAntes)
        .filter((c) => c.dados.coluna === id)
        .map((c) => c.id);
      const nome = nomeDaColuna(colunasAgora.current, id);
      const nomeDestino = nomeDaColuna(colunasAgora.current, destino);
      for (const k of ids) voar(k, 1);
      setCards((m) => {
        const n = { ...m };
        for (const k of ids) if (n[k]) n[k] = { ...n[k], dados: { ...n[k].dados, coluna: destino } };
        return n;
      });
      const r = await operarColunas({ op: "coluna_arquivar", id, destino }, (l) => l.map((c) => (c.id === id ? { ...c, arquivada: true } : c)));
      for (const k of ids) voar(k, -1);
      if (!r.ok) {
        setCards((m) => {
          const n = { ...m };
          for (const k of ids) if (cardsAntes[k] && n[k]) n[k] = cardsAntes[k];
          return n;
        });
        return false;
      }
      const movidos = r.movidos ?? ids.length;
      avisar(movidos ? `${nome} arquivada. ${movidos === 1 ? "1 card foi" : `${movidos} cards foram`} para ${nomeDestino}.` : `${nome} arquivada.`);
      perguntarJa.current();
      return true;
    },
    [operarColunas, avisar],
  );

  const restaurarColuna = useCallback(
    async (id: ColunaId) => {
      const fim = Math.max(0, ...colunasVivas(colunasAgora.current).map((c) => c.ordem)) + 1;
      const r = await operarColunas({ op: "coluna_restaurar", id }, (l) => l.map((c) => (c.id === id ? { ...c, arquivada: false, ordem: fim } : c)));
      if (r.ok) avisar(`${nomeDaColuna(r.colunas, id)} voltou ao Quadro.`);
    },
    [operarColunas, avisar],
  );

  /** As 8 do método voltam ao nome, à cor e à ordem de fábrica; as da produtora seguem depois. */
  const colunasDeFabrica = useCallback(async () => {
    const fabrica = new Map(colunasPadrao().map((c) => [c.id, c]));
    const extras = colunasVivas(colunasAgora.current).filter((c) => !c.papel);
    const r = await operarColunas({ op: "colunas_padrao" }, (l) =>
      l.map((c) => {
        const f = fabrica.get(c.id);
        if (f) return { ...c, nome: f.nome, cor: f.cor, ordem: f.ordem };
        const i = extras.findIndex((x) => x.id === c.id);
        return i >= 0 ? { ...c, ordem: fabrica.size + i + 1 } : c;
      }),
    );
    if (r.ok) avisar("Colunas do método de volta.");
  }, [operarColunas, avisar]);

  return {
    cards,
    mudar,
    criar,
    apagar,
    aviso,
    avisar,
    fecharAviso,
    colunas,
    renomearColuna,
    recolorirColuna,
    ordenarColunas,
    criarColuna,
    arquivarColuna,
    restaurarColuna,
    colunasDeFabrica,
  };
}
