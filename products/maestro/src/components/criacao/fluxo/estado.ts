"use client";
/**
 * O estado do Fluxo na tela (fase F5): otimista, com a fila de gravação, o Desfazer/Refazer e o poll de 5 s.
 *
 *   * `fazer({ ops, volta, refazer })`: aplica na hora (ops.ts), põe na fila e guarda o caminho de volta. A fila sai em
 *     lote (`POST /api/criacao/fluxo`, op `ops`) 250 ms depois da última mudança, um pedido por vez, até 500 operações;
 *     o mesmo item mexido várias vezes vira uma operação só (`juntarFila`).
 *   * Cada resultado volta por item: `ok` traz o item como ficou (e o `rev`); `conflito` traz a versão de quem gravou
 *     antes, que fica na tela com um aviso; `nao_existe` tira o item. Recusa do pedido inteiro (limite, papel, lixeira)
 *     desfaz tudo no banco: a tela avisa e recarrega o fluxo. Sem rede, a fila espera e tenta de novo.
 *   * Poll de 5 s em `?desde=` (fluxoDesde): o que outras pessoas mudaram entra sem mexer na vista nem no que a pessoa
 *     está editando ou ainda não gravou (`juntarDoServidor`).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FluxoInfo } from "@/lib/criacao/fluxo/servidor";
import type { ImagemNo, LigacaoFluxo, NoFluxo, Op, RefResolvida } from "@/lib/criacao/fluxo/modelo";
import { aplicarTodas, comRevs, idsDaFila, juntarDoServidor, juntarFila, type Estado, type ItemFila } from "./ops";

export type Inicial = {
  fluxo: FluxoInfo;
  nos: NoFluxo[];
  ligacoes: LigacaoFluxo[];
  refs: Record<string, RefResolvida>;
  cursor: string;
};

/** Uma ação da pessoa: o que fazer, como voltar e (para criar) como refazer sem criar de novo. */
export type Acao = { ops: Op[]; volta?: Op[]; refazer?: Op[] };
export type Salvamento = "salvo" | "salvando" | "sem_rede" | "erro";
export type Aviso = { id: number; texto: string; desfazer?: () => void; tom?: "erro" };

type Resultado =
  | { ok: true; no: NoFluxo }
  | { ok: true; ligacao: LigacaoFluxo }
  | { ok: false; erro: "conflito"; no: NoFluxo }
  | { ok: false; erro: "conflito"; ligacao: LigacaoFluxo }
  | { ok: false; erro: "nao_existe"; id: string };

const ENDERECO = "/api/criacao/fluxo";
const ESPERA_MS = 250;
const POLL_MS = 5000;
const MAX_OPS = 500;

/** Mudança de conteúdo vai com o rev visto (ops.ts). */
const marcar = (op: Op): ItemFila => ({ op, comRev: (op.op === "mudar_no" && op.dados !== undefined) || op.op === "mudar_ligacao" });

const porId = <T extends { id: string }>(xs: readonly T[]) => Object.fromEntries(xs.map((x) => [x.id, x])) as Record<string, T>;

export function useFluxo(inicial: Inicial) {
  const id = inicial.fluxo.id;
  const [estado, setEstado] = useState<Estado>(() => ({ nos: porId(inicial.nos), ligacoes: porId(inicial.ligacoes) }));
  const [refs, setRefs] = useState<Record<string, RefResolvida>>(inicial.refs);
  const [info, setInfo] = useState<FluxoInfo>(inicial.fluxo);
  const [salvamento, setSalvamento] = useState<Salvamento>("salvo");
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [pilhas, setPilhas] = useState({ desfazer: 0, refazer: 0 });

  // o que não precisa de render: fica em refs
  const estadoRef = useRef(estado);
  const revs = useRef(new Map<string, number>([...inicial.nos.map((n) => [n.id, n.rev] as const), ...inicial.ligacoes.map((l) => [l.id, l.rev] as const)]));
  const fila = useRef<ItemFila[]>([]);
  const emVoo = useRef<ItemFila[] | null>(null);
  const cursor = useRef(inicial.cursor);
  const timer = useRef(0);
  const tentativa = useRef(0);
  const editando = useRef<string | null>(null);
  const imagens = useRef(new Map<string, ImagemNo>());
  const desfazerPilha = useRef<{ volta: Op[]; refazer: Op[] }[]>([]);
  const refazerPilha = useRef<{ volta: Op[]; refazer: Op[] }[]>([]);
  const infoRef = useRef(info);
  const editandoTitulo = useRef(false);
  const vivo = useRef(true);
  /** O próprio `enviar` (para tentar de novo de dentro dele). */
  const enviarDeNovo = useRef<() => void>(() => {});

  const mudarEstado = useCallback((f: (e: Estado) => Estado) => {
    const novo = f(estadoRef.current);
    if (novo === estadoRef.current) return;
    estadoRef.current = novo;
    setEstado(novo);
  }, []);

  const avisar = useCallback(
    (texto: string, extra?: { desfazer?: () => void; tom?: "erro" }) => setAviso({ id: Date.now() + Math.random(), texto, ...extra }),
    [],
  );
  const fecharAviso = useCallback(() => setAviso(null), []);

  const pendentes = useCallback(() => {
    const s = idsDaFila(fila.current);
    for (const i of emVoo.current ?? []) {
      const a = "id" in i.op ? i.op.id : undefined;
      if (a) s.add(a);
    }
    return s;
  }, []);

  /** Lê o fluxo inteiro de novo (depois de uma recusa do pedido inteiro). A fila que falhou sai. */
  const recarregar = useCallback(async () => {
    try {
      const r = await fetch(`${ENDERECO}?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!r.ok) return;
      const f = (await r.json()) as Inicial;
      revs.current = new Map([...f.nos.map((n) => [n.id, n.rev] as const), ...f.ligacoes.map((l) => [l.id, l.rev] as const)]);
      cursor.current = f.cursor;
      const novo = { nos: porId(f.nos), ligacoes: porId(f.ligacoes) };
      estadoRef.current = novo;
      setEstado(novo);
      setRefs(f.refs);
      infoRef.current = f.fluxo;
      setInfo(f.fluxo);
    } catch {}
  }, [id]);

  const enviar = useCallback(
    async (manterVivo = false) => {
      if (emVoo.current || !fila.current.length) return;
      const junto = juntarFila(fila.current);
      const lote = junto.slice(0, MAX_OPS);
      fila.current = junto.slice(MAX_OPS);
      emVoo.current = lote;
      setSalvamento("salvando");
      let resposta: Response | null = null;
      try {
        resposta = await fetch(ENDERECO, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ op: "ops", id, ops: comRevs(lote, revs.current) }),
          keepalive: manterVivo,
        });
      } catch {
        resposta = null;
      }
      if (!vivo.current) return;
      if (!resposta || resposta.status >= 500) {
        // sem rede (ou o servidor caiu): o lote volta para a frente da fila e tenta de novo com espera crescente
        fila.current = [...lote, ...fila.current];
        emVoo.current = null;
        setSalvamento("sem_rede");
        tentativa.current = Math.min(tentativa.current + 1, 5);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => enviarDeNovo.current(), Math.min(30_000, 1500 * 2 ** tentativa.current));
        return;
      }
      tentativa.current = 0;
      const corpo = (await resposta.json().catch(() => null)) as { resultados?: Resultado[]; refs?: Record<string, RefResolvida>; mensagem?: string } | null;
      emVoo.current = null;
      if (!resposta.ok || !corpo?.resultados) {
        // recusa do pedido inteiro: nada gravou. Avisa e volta ao que o banco tem.
        fila.current = [];
        setSalvamento("erro");
        avisar(corpo?.mensagem ?? "Não deu para salvar.", { tom: "erro" });
        await recarregar();
        setSalvamento("salvo");
        return;
      }
      const resto = pendentes();
      let conflitos = 0;
      mudarEstado((e) => {
        let nos = e.nos;
        let ligacoes = e.ligacoes;
        const nosM = () => (nos === e.nos ? (nos = { ...e.nos }) : nos);
        const ligM = () => (ligacoes === e.ligacoes ? (ligacoes = { ...e.ligacoes }) : ligacoes);
        for (const r of corpo.resultados!) {
          if ("no" in r) {
            revs.current.set(r.no.id, Math.max(revs.current.get(r.no.id) ?? 0, r.no.rev));
            if (!r.ok) {
              conflitos++;
              fila.current = fila.current.filter((i) => !(i.comRev && "id" in i.op && i.op.id === r.no.id));
              nosM()[r.no.id] = r.no;
            } else if (!resto.has(r.no.id) && editando.current !== r.no.id) nosM()[r.no.id] = r.no;
            else if (e.nos[r.no.id]) nosM()[r.no.id] = { ...e.nos[r.no.id], rev: r.no.rev, imagem: r.no.imagem ?? e.nos[r.no.id].imagem };
          } else if ("ligacao" in r) {
            revs.current.set(r.ligacao.id, Math.max(revs.current.get(r.ligacao.id) ?? 0, r.ligacao.rev));
            if (!r.ok) {
              conflitos++;
              fila.current = fila.current.filter((i) => !(i.comRev && "id" in i.op && i.op.id === r.ligacao.id));
              ligM()[r.ligacao.id] = r.ligacao;
            } else if (!resto.has(r.ligacao.id) && editando.current !== r.ligacao.id) ligM()[r.ligacao.id] = r.ligacao;
          } else if (r.erro === "nao_existe") {
            if (e.nos[r.id]) nosM()[r.id] = { ...e.nos[r.id], apagado: true };
            if (e.ligacoes[r.id]) ligM()[r.id] = { ...e.ligacoes[r.id], apagado: true };
          }
        }
        return nos === e.nos && ligacoes === e.ligacoes ? e : { nos, ligacoes };
      });
      if (corpo.refs && Object.keys(corpo.refs).length) setRefs((r) => ({ ...r, ...corpo.refs }));
      if (conflitos)
        avisar(
          conflitos === 1
            ? "Outra pessoa mudou este item ao mesmo tempo. Ficou a versão dela."
            : "Outras pessoas mudaram itens ao mesmo tempo. Ficou a versão delas.",
        );
      if (fila.current.length) enviarDeNovo.current();
      else setSalvamento("salvo");
    },
    [id, avisar, mudarEstado, pendentes, recarregar],
  );
  useLayoutEffect(() => {
    enviarDeNovo.current = () => void enviar();
  }, [enviar]);

  const agendar = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void enviar(), ESPERA_MS);
    setSalvamento((s) => (s === "sem_rede" ? s : "salvando"));
  }, [enviar]);

  const empurrar = useCallback(
    (ops: Op[]) => {
      if (!ops.length) return;
      mudarEstado((e) => aplicarTodas(e, ops, imagens.current));
      fila.current.push(...ops.map(marcar));
      agendar();
    },
    [mudarEstado, agendar],
  );

  const fazer = useCallback(
    (a: Acao) => {
      empurrar(a.ops);
      if (a.volta?.length) {
        desfazerPilha.current.push({ volta: a.volta, refazer: a.refazer ?? a.ops });
        if (desfazerPilha.current.length > 100) desfazerPilha.current.shift();
        refazerPilha.current = [];
        setPilhas({ desfazer: desfazerPilha.current.length, refazer: 0 });
      }
    },
    [empurrar],
  );

  const desfazer = useCallback(() => {
    const p = desfazerPilha.current.pop();
    if (!p) return false;
    empurrar(p.volta);
    refazerPilha.current.push(p);
    setPilhas({ desfazer: desfazerPilha.current.length, refazer: refazerPilha.current.length });
    return true;
  }, [empurrar]);

  const refazer = useCallback(() => {
    const p = refazerPilha.current.pop();
    if (!p) return false;
    empurrar(p.refazer);
    desfazerPilha.current.push(p);
    setPilhas({ desfazer: desfazerPilha.current.length, refazer: refazerPilha.current.length });
    return true;
  }, [empurrar]);

  /** A imagem que acabou de subir (o nó de imagem nasce mostrando a foto). */
  const registrarImagem = useCallback((img: ImagemNo) => imagens.current.set(img.id, img), []);
  const marcarEditando = useCallback((alvo: string | null) => {
    editando.current = alvo;
  }, []);

  /** Muda o título com o rev do fluxo (conflito: fica o de quem gravou antes). */
  const mudarTitulo = useCallback(
    async (titulo: string) => {
      const antes = infoRef.current;
      if (!titulo.trim() || titulo.trim() === antes.titulo) return;
      const novo = { ...antes, titulo: titulo.trim() };
      infoRef.current = novo;
      setInfo(novo);
      try {
        const r = await fetch(ENDERECO, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ op: "titulo", id, rev: antes.rev, titulo }),
        });
        const c = (await r.json().catch(() => null)) as { rev?: number; mensagem?: string; atual?: FluxoInfo } | null;
        if (r.ok && c?.rev) {
          infoRef.current = { ...infoRef.current, rev: c.rev };
          setInfo(infoRef.current);
        } else {
          const volta = c?.atual ?? antes;
          infoRef.current = volta;
          setInfo(volta);
          avisar(c?.mensagem ?? "Não deu para mudar o título.", { tom: "erro" });
        }
      } catch {
        infoRef.current = antes;
        setInfo(antes);
        avisar("Sem conexão. O título não mudou.", { tom: "erro" });
      }
    },
    [id, avisar],
  );
  const marcarEditandoTitulo = useCallback((sim: boolean) => {
    editandoTitulo.current = sim;
  }, []);

  /** Lixeira (`apagar`) ou tira dela. */
  const lixeira = useCallback(
    async (apagar: boolean) => {
      const r = await fetch(ENDERECO, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: apagar ? "lixeira" : "restaurar", id }),
      }).catch(() => null);
      if (!r?.ok) {
        const c = (await r?.json().catch(() => null)) as { mensagem?: string } | null;
        avisar(c?.mensagem ?? "Sem conexão. Tente de novo.", { tom: "erro" });
        return false;
      }
      infoRef.current = { ...infoRef.current, apagado: apagar };
      setInfo(infoRef.current);
      return true;
    },
    [id, avisar],
  );

  /** "Mandar para um card" (F6): liga o fluxo ao card (null desliga), mantendo o projeto. O card mostra o fluxo. */
  const ligarCard = useCallback(
    async (card: { id: string; titulo: string } | null) => {
      const r = await fetch(ENDERECO, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "ligar", id, projetoId: infoRef.current.projetoId, cardId: card?.id ?? null }),
      }).catch(() => null);
      if (!r?.ok) {
        const c = (await r?.json().catch(() => null)) as { mensagem?: string } | null;
        avisar(c?.mensagem ?? "Sem conexão. Tente de novo.", { tom: "erro" });
        return false;
      }
      infoRef.current = { ...infoRef.current, cardId: card?.id ?? null, card: card?.titulo ?? null };
      setInfo(infoRef.current);
      return true;
    },
    [id, avisar],
  );

  // ───── poll de 5 s: o que outras pessoas mudaram ─────
  useEffect(() => {
    vivo.current = true;
    let parado = false;
    let rodando = false;
    const perguntar = async () => {
      if (parado || rodando || document.hidden) return;
      rodando = true;
      try {
        const r = await fetch(`${ENDERECO}?id=${encodeURIComponent(id)}&desde=${encodeURIComponent(cursor.current)}`, { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as Inicial;
        if (parado) return;
        cursor.current = d.cursor;
        mudarEstado((e) => juntarDoServidor(e, d, { pendentes: pendentes(), revs: revs.current, editando: editando.current }));
        setRefs(d.refs);
        if (!editandoTitulo.current && (d.fluxo.rev > infoRef.current.rev || d.fluxo.apagado !== infoRef.current.apagado)) {
          infoRef.current = d.fluxo;
          setInfo(d.fluxo);
        }
      } catch {
        // sem rede: o próximo poll tenta
      } finally {
        rodando = false;
      }
    };
    const t = window.setInterval(perguntar, POLL_MS);
    const aoVoltar = () => {
      if (!document.hidden) void perguntar();
    };
    // saindo da página com mudança na fila: manda já (keepalive)
    const aoSair = () => {
      if (fila.current.length && !emVoo.current) void enviar(true);
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("pagehide", aoSair);
    return () => {
      parado = true;
      vivo.current = false;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("pagehide", aoSair);
      aoSair();
    };
  }, [id, mudarEstado, pendentes, enviar]);

  const vivos = useMemo(() => Object.values(estado.nos).filter((n) => !n.apagado), [estado.nos]);
  const ligacoesVivas = useMemo(() => {
    return Object.values(estado.ligacoes).filter(
      (l) => !l.apagado && estado.nos[l.de] && !estado.nos[l.de].apagado && estado.nos[l.para] && !estado.nos[l.para].apagado,
    );
  }, [estado]);

  return {
    info,
    estado,
    estadoRef,
    vivos,
    ligacoesVivas,
    refs,
    setRefs,
    salvamento,
    aviso,
    avisar,
    fecharAviso,
    fazer,
    desfazer,
    refazer,
    podeDesfazer: pilhas.desfazer > 0,
    podeRefazer: pilhas.refazer > 0,
    registrarImagem,
    marcarEditando,
    mudarTitulo,
    marcarEditandoTitulo,
    lixeira,
    ligarCard,
  };
}

export type UsoFluxo = ReturnType<typeof useFluxo>;
