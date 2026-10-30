"use client";
/**
 * A tela do Fluxo (plano da Criação §6, fase F5): o canvas (canvas.tsx), a cabeça (título, Canvas · Lista, salvamento),
 * a barra de vidro do pé (Selecionar · Nota · Imagem · Link · Seção · Ligar · Roteiro · Card), o inspetor da seleção,
 * colar (⌘V) e soltar arquivo, os atalhos do teclado e, no celular, o "+" com a folha Adicionar. Quem só lê (papel de
 * leitura ou fluxo na lixeira) anda, aproxima, abre e lê; nada muda.
 *
 * Tudo que muda passa por `fazer` (estado.ts): na tela na hora, no banco em lote, com Desfazer.
 *
 * Exportar (fase F6, exportar.tsx): Copiar para IA, links (administração e gestão), Mandar para um card, pacote .zip,
 * JSON e PDF (a Lista com o CSS de impressão).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { linkParaIa, slug, urlImagemPeloLink } from "@/lib/criacao/fluxo/compartilhar";
import type { LinkFluxo } from "@/lib/criacao/fluxo/endereco";
import { fluxoParaJson, fluxoParaMarkdown } from "@/lib/criacao/fluxo/exportar";
import {
  CORES_FLUXO,
  notasDoTexto,
  TAMANHO_PADRAO,
  type CorFluxo,
  type DadosNota,
  type DadosSecao,
  type ImagemNo,
  type NoFluxo,
  type Op,
  type OpCriarNo,
  type RefResolvida,
  type TipoNo,
} from "@/lib/criacao/fluxo/modelo";
import { Icone } from "@/components/icones";
import { useMidia } from "@/components/use-midia";
import { Canvas, ZoomRotulo, type CanvasApi, type Ferramenta, type Movido, type Subida } from "./canvas";
import { conferirImagem, oQueColar, tamanhoDaImagem } from "./colar";
import { useFluxo, type Inicial } from "./estado";
import { baixarTexto, copiarTexto, FolhaCard, FolhaExportar, FolhaLinks, PopoverExportar, useLinks, type AcaoExportar } from "./exportar";
import { FolhaAdicionar, FolhaLink, FolhaReferencia, FolhaRotulo, type Adicionar, type CardEscolha, type RoteiroEscolha } from "./folhas";
import { caixaDe, lugarLivre, secaoNoPonto, type Caixa, type Ponto } from "./geometria";
import { IconeF } from "./icones";
import { imprimirComImagens } from "./imprimir";
import { ListaFluxo } from "./lista";
import type { Campo } from "./no";
import { novoId } from "./ops";

type Props = Inicial & {
  podeEditar: boolean;
  /** Criar e revogar links de exportação (administração e gestão). */
  podeEnviar?: boolean;
  roteiros: RoteiroEscolha[];
  cards: CardEscolha[];
};

type Folhas = "link" | "ref" | "adicionar" | "rotulo" | "exportar" | "links" | "card" | null;
type Modo = "canvas" | "lista";

const NOME_COR: Record<CorFluxo, string> = {
  amarelo: "Amarelo",
  pessego: "Pêssego",
  rosa: "Rosa",
  lavanda: "Lavanda",
  ceu: "Céu",
  menta: "Menta",
  pedra: "Pedra",
};
const MARGENS_COMPUTADOR = { topo: 150, pe: 110 };
const MARGENS_CELULAR = { topo: 150, pe: 170 };

const digitando = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable='true']");
const folhaAberta = () => !!document.querySelector(".m-veu");

/** Título com o contraste da casa: a primeira palavra pesada, o resto leve. */
function TituloDesenhado({ t }: { t: string }) {
  const [primeira, ...resto] = t.split(" ");
  return (
    <>
      <strong>{primeira}</strong>
      {resto.length ? ` ${resto.join(" ")}` : null}
    </>
  );
}

function Aviso({ texto, desfazer, tom, fechar }: { texto: string; desfazer?: () => void; tom?: "erro"; fechar: () => void }) {
  useEffect(() => {
    const t = setTimeout(fechar, desfazer ? 8000 : tom ? 7000 : 4500);
    return () => clearTimeout(t);
  }, [fechar, desfazer, tom]);
  return (
    <div className="fx-aviso" role={tom ? "alert" : "status"} data-tom={tom}>
      <span>{texto}</span>
      {desfazer ? (
        <button
          type="button"
          onClick={() => {
            desfazer();
            fechar();
          }}
        >
          Desfazer
        </button>
      ) : null}
    </div>
  );
}

export function Fluxo(props: Props) {
  const f = useFluxo(props);
  const { info, estado, estadoRef, vivos, ligacoesVivas, refs, fazer, marcarEditando, avisar, registrarImagem, setRefs, desfazer, refazer } = f;
  const router = useRouter();
  const podeEditar = props.podeEditar && !info.apagado;
  const canvas = useRef<CanvasApi>(null);
  const [selecaoBruta, setSelecao] = useState<ReadonlySet<string>>(() => new Set());
  const [ligSelBruta, setLigSel] = useState<string | null>(null);
  // a seleção só vale para o que existe (apagado aqui ou por outra pessoa sai)
  const selecao = useMemo(() => {
    const vivo = [...selecaoBruta].filter((id) => estado.nos[id] && !estado.nos[id].apagado);
    return vivo.length === selecaoBruta.size ? selecaoBruta : new Set(vivo);
  }, [selecaoBruta, estado.nos]);
  const ligSel = ligSelBruta && estado.ligacoes[ligSelBruta] && !estado.ligacoes[ligSelBruta].apagado ? ligSelBruta : null;
  const [editando, setEditando] = useState<{ id: string; campo: Campo } | null>(null);
  const [ferramenta, setFerramenta] = useState<Ferramenta>("selecionar");
  const [ligandoDe, setLigandoDe] = useState<string | null>(null);
  const [subindo, setSubindo] = useState<Subida[]>([]);
  const [folha, setFolha] = useState<Folhas>(null);
  const [modo, setModo] = useState<Modo>("canvas");
  const [editandoTitulo, setEditandoTitulo] = useState(false);
  const [menu, setMenu] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [incluirImagens, setIncluirImagens] = useState(false);
  const podeEnviar = !!props.podeEnviar;
  const L = useLinks(info.id, podeEnviar);
  const celular = useMidia("(max-width: 900px)");
  const margens = celular ? MARGENS_CELULAR : MARGENS_COMPUTADOR;
  const arquivo = useRef<HTMLInputElement>(null);
  const selRef = useRef(selecao);
  useEffect(() => {
    selRef.current = selecao;
  }, [selecao]);

  const trocarModo = useCallback((m: Modo) => setModo(m), []);

  /* ───────────── utilidades ───────────── */

  const maxZ = useCallback(() => vivos.reduce((m, n) => Math.max(m, n.z), 0), [vivos]);
  const secoesCaixas = useCallback(
    (sobrepor?: Map<string, Caixa>) =>
      Object.values(estadoRef.current.nos)
        .filter((n) => !n.apagado && n.tipo === "secao")
        .map((n) => ({ id: n.id, z: n.z, ...(sobrepor?.get(n.id) ?? { x: n.x, y: n.y, w: n.w, h: n.h }) })),
    [estadoRef],
  );
  /** Um canto livre perto de `p` (não empilha exatamente em cima de outro item). */
  const livre = useCallback(
    (p: Ponto, w: number, h: number): Ponto =>
      lugarLivre(
        p,
        w,
        h,
        Object.values(estadoRef.current.nos).filter((n) => !n.apagado && n.tipo !== "secao"),
      ),
    [estadoRef],
  );
  const centro = useCallback(() => canvas.current?.centro() ?? { x: 0, y: 0 }, []);

  /** Cria nós (e ligações) numa ação só: Desfazer apaga, Refazer devolve sem criar de novo. */
  const criar = useCallback(
    (nos: OpCriarNo[], ligs: Op[] = [], o: { editar?: Campo; escolher?: boolean } = {}) => {
      if (!nos.length && !ligs.length) return;
      const ops = [...nos, ...ligs];
      const ids = nos.map((n) => n.id!);
      const ligIds = ligs.map((l) => ("id" in l ? l.id! : ""));
      fazer({
        ops,
        volta: [...ligIds.map((id) => ({ op: "apagar_ligacao" as const, id })), ...ids.map((id) => ({ op: "apagar_no" as const, id }))],
        refazer: [...ids.map((id) => ({ op: "restaurar_no" as const, id })), ...ligIds.map((id) => ({ op: "restaurar_ligacao" as const, id }))],
      });
      if (o.escolher !== false) {
        setSelecao(new Set(ids));
        setLigSel(null);
      }
      if (o.editar && ids.length === 1) {
        setEditando({ id: ids[0], campo: o.editar });
        marcarEditando(ids[0]);
      }
    },
    [fazer, marcarEditando],
  );

  const opCriar = useCallback(
    (tipo: TipoNo, p: Ponto, extra: Partial<OpCriarNo> = {}): OpCriarNo => {
      const t = { w: extra.w ?? TAMANHO_PADRAO[tipo].w, h: extra.h ?? TAMANHO_PADRAO[tipo].h };
      const pos = livre(p, t.w, t.h);
      const secaoId = tipo === "secao" ? null : secaoNoPonto(secoesCaixas(), { x: pos.x + t.w / 2, y: pos.y + t.h / 2 });
      return {
        op: "criar_no",
        id: novoId(),
        tipo,
        x: pos.x,
        y: pos.y,
        w: t.w,
        h: t.h,
        z: maxZ() + 1,
        secaoId,
        dados: {},
        imagemId: null,
        roteiroId: null,
        cardId: null,
        ...extra,
      } as OpCriarNo;
    },
    [livre, secoesCaixas, maxZ],
  );

  const novaNota = useCallback(
    (p?: Ponto) => {
      if (!podeEditar) return;
      criar([opCriar("nota", p ?? centro(), { dados: { texto: "", cor: "amarelo" } })], [], { editar: "texto" });
    },
    [podeEditar, criar, opCriar, centro],
  );

  const novoLink = useCallback(
    (l: LinkFluxo, titulo: string, p?: Ponto) => {
      criar([opCriar("link", p ?? centro(), { dados: { url: l.url, titulo: titulo.trim(), link: l } })]);
    },
    [criar, opCriar, centro],
  );

  const novaReferencia = useCallback(
    (tipo: "roteiro" | "card", id: string, p?: Ponto, provisoria?: RefResolvida) => {
      const op = opCriar(tipo, p ?? centro(), tipo === "roteiro" ? { roteiroId: id } : { cardId: id });
      if (provisoria) setRefs((r) => ({ ...r, [op.id!]: provisoria }));
      criar([op]);
    },
    [opCriar, centro, criar, setRefs],
  );

  /** Seção nova: em volta do que está escolhido (que passa a morar nela) ou vazia no meio da tela. */
  const novaSecao = useCallback(() => {
    if (!podeEditar) return;
    const dentro = [...selRef.current].map((id) => estadoRef.current.nos[id]).filter((n): n is NoFluxo => !!n && !n.apagado && n.tipo !== "secao");
    const c = caixaDe(dentro);
    const zSecao = Object.values(estadoRef.current.nos).reduce((m, n) => (n.tipo === "secao" && !n.apagado ? Math.max(m, n.z) : m), 0) + 1;
    if (c) {
      const id = novoId();
      const op: OpCriarNo = {
        op: "criar_no",
        id,
        tipo: "secao",
        x: Math.round(c.x - 32),
        y: Math.round(c.y - 56),
        w: Math.round(c.w + 64),
        h: Math.round(c.h + 88),
        z: zSecao,
        secaoId: null,
        dados: { nome: "", cor: "pessego" },
        imagemId: null,
        roteiroId: null,
        cardId: null,
      };
      const mover = dentro.map((n) => ({ op: "mudar_no" as const, id: n.id, secaoId: id }));
      const voltar = dentro.map((n) => ({ op: "mudar_no" as const, id: n.id, secaoId: n.secaoId }));
      fazer({ ops: [op, ...mover], volta: [...voltar, { op: "apagar_no", id }], refazer: [{ op: "restaurar_no", id }, ...mover] });
      setSelecao(new Set([id]));
      setEditando({ id, campo: "nome" });
      marcarEditando(id);
      return;
    }
    criar([opCriar("secao", centro(), { z: zSecao, dados: { nome: "", cor: "pessego" } })], [], { editar: "nome" });
  }, [podeEditar, estadoRef, fazer, marcarEditando, criar, opCriar, centro]);

  /* ───────────── imagens ───────────── */

  const subir = useCallback(
    (arquivos: File[], p?: Ponto) => {
      if (!podeEditar) return;
      const base = p ?? centro();
      arquivos.forEach((a, i) => {
        const c = conferirImagem(a);
        if (!c.ok) {
          avisar(c.mensagem, { tom: "erro" });
          return;
        }
        const sid = novoId();
        const pos = livre({ x: base.x + i * 264, y: base.y }, 240, 180);
        setSubindo((s) => [...s, { id: sid, x: pos.x, y: pos.y, w: 240, h: 180, progresso: 0 }]);
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/criacao/img?fluxo=${encodeURIComponent(info.id)}`);
        xhr.setRequestHeader("Content-Type", a.type);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setSubindo((s) => s.map((x) => (x.id === sid ? { ...x, progresso: e.loaded / e.total } : x)));
        };
        const tirar = () => setSubindo((s) => s.filter((x) => x.id !== sid));
        xhr.onload = () => {
          tirar();
          type Corpo = { imagem?: ImagemNo; mensagem?: string };
          let corpo: Corpo | null = null;
          try {
            corpo = JSON.parse(xhr.responseText) as Corpo;
          } catch {}
          if (xhr.status >= 200 && xhr.status < 300 && corpo?.imagem) {
            const img = corpo.imagem;
            registrarImagem(img);
            const t = tamanhoDaImagem(img.largura, img.altura);
            criar([opCriar("imagem", { x: pos.x + t.w / 2, y: pos.y + t.h / 2 }, { ...t, imagemId: img.id, dados: { legenda: "" } })]);
          } else avisar(corpo?.mensagem ?? "Não deu para enviar a imagem.", { tom: "erro" });
        };
        xhr.onerror = () => {
          tirar();
          avisar("Sem conexão. A imagem não subiu.", { tom: "erro" });
        };
        xhr.send(a);
      });
    },
    [podeEditar, centro, avisar, registrarImagem, livre, info.id, criar, opCriar],
  );

  /** Texto colado ou solto: referência do Maestro, link ou notas (colar.ts). */
  const colarTexto = useCallback(
    (texto: string, p?: Ponto) => {
      if (!podeEditar) return false;
      const c = oQueColar(texto, [window.location.origin]);
      if (c.tipo === "nada") return false;
      if (c.tipo === "ref") novaReferencia(c.ref.tipo, c.ref.id, p);
      else if (c.tipo === "link") novoLink(c.link, "", p);
      else {
        // a coluna de notas inteira cabe num lugar livre
        const n = notasDoTexto(c.texto, { x: 0, y: 0 }).length;
        const { w, h } = TAMANHO_PADRAO.nota;
        const o = livre(p ?? centro(), w, n * (h + 16) - 16);
        const ops = notasDoTexto(c.texto, o).map((op, i) => {
          const secaoId = secaoNoPonto(secoesCaixas(), { x: op.x + op.w / 2, y: op.y + op.h / 2 });
          return { ...op, id: novoId(), z: maxZ() + 1 + i, secaoId };
        });
        criar(ops);
      }
      return true;
    },
    [podeEditar, novaReferencia, novoLink, livre, centro, secoesCaixas, maxZ, criar],
  );

  // ⌘V em qualquer lugar da tela (fora de um campo)
  useEffect(() => {
    const colar = (e: ClipboardEvent) => {
      if (digitando(e.target) || folhaAberta() || !podeEditar || !e.clipboardData) return;
      const imgs = [...e.clipboardData.files].filter((a) => a.type.startsWith("image/"));
      if (imgs.length) {
        e.preventDefault();
        if (modo !== "canvas") trocarModo("canvas");
        subir(imgs);
        return;
      }
      const t = e.clipboardData.getData("text/plain");
      if (t && colarTexto(t)) {
        e.preventDefault();
        if (modo !== "canvas") trocarModo("canvas");
      }
    };
    document.addEventListener("paste", colar);
    return () => document.removeEventListener("paste", colar);
  }, [podeEditar, subir, colarTexto, modo, trocarModo]);

  const soltar = useCallback(
    (dt: DataTransfer, p: Ponto) => {
      const imgs = [...dt.files].filter((a) => a.type.startsWith("image/"));
      if (imgs.length) return subir(imgs, p);
      if (dt.files.length) return avisar("Use PNG, JPEG ou WebP.", { tom: "erro" });
      const t =
        dt
          .getData("text/uri-list")
          .split("\n")
          .find((l) => l && !l.startsWith("#")) || dt.getData("text/plain");
      if (t) colarTexto(t, p);
    },
    [subir, colarTexto, avisar],
  );

  /* ───────────── mexer no que existe ───────────── */

  const selecionar = useCallback((ids: string[], m: "trocar" | "somar" | "alternar") => {
    setLigSel(null);
    setSelecao((s) => {
      if (m === "trocar") return new Set(ids);
      const n = new Set(s);
      for (const id of ids) {
        if (m === "alternar" && n.has(id)) n.delete(id);
        else n.add(id);
      }
      return n;
    });
  }, []);

  const selecionarLig = useCallback((id: string | null) => {
    setLigSel(id);
    if (id) setSelecao(new Set());
  }, []);

  const moverFim = useCallback(
    (movidos: Movido[]) => {
      const nos = estadoRef.current.nos;
      const novas = new Map<string, Caixa>();
      for (const m of movidos) {
        const n = nos[m.id];
        if (n?.tipo === "secao") novas.set(m.id, { x: m.x, y: m.y, w: n.w, h: n.h });
      }
      const secoes = secoesCaixas(novas);
      const movidosIds = new Set(movidos.map((m) => m.id));
      const ops: Op[] = [];
      const volta: Op[] = [];
      for (const m of movidos) {
        const n = nos[m.id];
        if (!n) continue;
        const op: Op = { op: "mudar_no", id: m.id, x: m.x, y: m.y };
        const v: Op = { op: "mudar_no", id: m.id, x: n.x, y: n.y };
        if (n.tipo !== "secao" && !(n.secaoId && movidosIds.has(n.secaoId))) {
          const s = secaoNoPonto(secoes, { x: m.x + n.w / 2, y: m.y + n.h / 2 });
          if (s !== n.secaoId) {
            op.secaoId = s;
            v.secaoId = n.secaoId;
          }
        }
        ops.push(op);
        volta.push(v);
      }
      if (ops.length) fazer({ ops, volta });
    },
    [estadoRef, secoesCaixas, fazer],
  );

  const redimensionarFim = useCallback(
    (id: string, c: Caixa) => {
      const n = estadoRef.current.nos[id];
      if (!n) return;
      const ops: Op[] = [{ op: "mudar_no", id, w: c.w, h: c.h }];
      const volta: Op[] = [{ op: "mudar_no", id, w: n.w, h: n.h }];
      if (n.tipo === "secao") {
        // a seção nova do tamanho novo: quem ficou dentro entra, quem ficou fora sai
        for (const o of Object.values(estadoRef.current.nos)) {
          if (o.apagado || o.tipo === "secao") continue;
          const meio = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
          const dentro = meio.x >= c.x && meio.x <= c.x + c.w && meio.y >= c.y && meio.y <= c.y + c.h;
          if (dentro && !o.secaoId) {
            ops.push({ op: "mudar_no", id: o.id, secaoId: id });
            volta.push({ op: "mudar_no", id: o.id, secaoId: null });
          } else if (!dentro && o.secaoId === id) {
            ops.push({ op: "mudar_no", id: o.id, secaoId: null });
            volta.push({ op: "mudar_no", id: o.id, secaoId: id });
          }
        }
      }
      fazer({ ops, volta });
    },
    [estadoRef, fazer],
  );

  const ligar = useCallback(
    (de: string, para: string | Ponto) => {
      if (!podeEditar) return;
      if (typeof para === "string") {
        const ja = Object.values(estadoRef.current.ligacoes).find((l) => !l.apagado && l.de === de && l.para === para);
        if (ja) {
          selecionarLig(ja.id);
          return;
        }
        const id = novoId();
        fazer({
          ops: [{ op: "criar_ligacao", id, de, para, rotulo: null }],
          volta: [{ op: "apagar_ligacao", id }],
          refazer: [{ op: "restaurar_ligacao", id }],
        });
        selecionarLig(id);
        return;
      }
      // soltou no vazio: nasce uma nota já ligada, pronta para escrever
      const nota = opCriar("nota", { x: para.x + TAMANHO_PADRAO.nota.w / 2, y: para.y }, { dados: { texto: "", cor: "amarelo" } });
      criar([nota], [{ op: "criar_ligacao", id: novoId(), de, para: nota.id!, rotulo: null }], { editar: "texto" });
    },
    [podeEditar, estadoRef, fazer, selecionarLig, opCriar, criar],
  );

  const escolherParaLigar = useCallback(
    (id: string) => {
      if (!ligandoDe) {
        setLigandoDe(id);
        return;
      }
      if (id !== ligandoDe) ligar(ligandoDe, id);
      setLigandoDe(null);
      setFerramenta("selecionar");
    },
    [ligandoDe, ligar],
  );

  const editar = useCallback(
    (id: string, campo: Campo) => {
      if (!podeEditar) return;
      setSelecao(new Set([id]));
      setEditando({ id, campo });
      marcarEditando(id);
    },
    [podeEditar, marcarEditando],
  );

  const salvarCampo = useCallback(
    (id: string, campo: Campo, valor: string | null) => {
      setEditando(null);
      marcarEditando(null);
      const n = estadoRef.current.nos[id];
      if (!n || valor === null) {
        // desistiu de uma nota que nasceu vazia: ela sai sem deixar rastro
        if (n && n.tipo === "nota" && !(n.dados as DadosNota).texto) fazer({ ops: [{ op: "apagar_no", id }] });
        return;
      }
      const antes = String((n.dados as Record<string, unknown>)[campo] ?? "");
      if (n.tipo === "nota" && !valor.trim() && !antes) {
        fazer({ ops: [{ op: "apagar_no", id }] });
        return;
      }
      if (valor === antes) return;
      fazer({ ops: [{ op: "mudar_no", id, dados: { [campo]: valor } }], volta: [{ op: "mudar_no", id, dados: { [campo]: antes } }] });
    },
    [estadoRef, fazer, marcarEditando],
  );

  const mudarCor = useCallback(
    (cor: CorFluxo) => {
      const alvo = [...selecao].map((id) => estadoRef.current.nos[id]).filter((n): n is NoFluxo => !!n && (n.tipo === "nota" || n.tipo === "secao"));
      const ops: Op[] = alvo.map((n) => ({ op: "mudar_no", id: n.id, dados: { cor } }));
      const volta: Op[] = alvo.map((n) => ({ op: "mudar_no", id: n.id, dados: { cor: (n.dados as DadosNota | DadosSecao).cor } }));
      if (ops.length) fazer({ ops, volta });
    },
    [selecao, estadoRef, fazer],
  );

  /** O que sai junto: a seleção, o que mora nas seções escolhidas e as ligações de tudo isso. */
  const apagarSelecao = useCallback(() => {
    if (!podeEditar) return;
    const nos = estadoRef.current.nos;
    const ids = new Set([...selecao].filter((id) => nos[id] && !nos[id].apagado));
    for (const id of [...ids]) if (nos[id].tipo === "secao") for (const n of Object.values(nos)) if (!n.apagado && n.secaoId === id) ids.add(n.id);
    const ligs = Object.values(estadoRef.current.ligacoes)
      .filter((l) => !l.apagado && (ids.has(l.de) || ids.has(l.para) || l.id === ligSel))
      .map((l) => l.id);
    if (!ids.size && !ligs.length) return;
    const ops: Op[] = [...ligs.map((id) => ({ op: "apagar_ligacao" as const, id })), ...[...ids].map((id) => ({ op: "apagar_no" as const, id }))];
    const volta: Op[] = [...[...ids].map((id) => ({ op: "restaurar_no" as const, id })), ...ligs.map((id) => ({ op: "restaurar_ligacao" as const, id }))];
    fazer({ ops, volta, refazer: ops });
    setSelecao(new Set());
    setLigSel(null);
    const total = ids.size + (ids.size ? 0 : ligs.length);
    avisar(total === 1 ? "Apagado." : `${total} itens apagados.`, { desfazer: () => desfazer() });
  }, [podeEditar, estadoRef, selecao, ligSel, fazer, avisar, desfazer]);

  const duplicar = useCallback(() => {
    if (!podeEditar) return;
    const nos = estadoRef.current.nos;
    const ids = new Set([...selecao].filter((id) => nos[id] && !nos[id].apagado));
    for (const id of [...ids]) if (nos[id].tipo === "secao") for (const n of Object.values(nos)) if (!n.apagado && n.secaoId === id) ids.add(n.id);
    if (!ids.size) return;
    const novo = new Map([...ids].map((id) => [id, novoId()]));
    let z = maxZ();
    const ordem = [...ids].map((id) => nos[id]).sort((a, b) => (a.tipo === "secao" ? -1 : 0) - (b.tipo === "secao" ? -1 : 0) || a.z - b.z);
    const ops: OpCriarNo[] = ordem.map((n) => ({
      op: "criar_no",
      id: novo.get(n.id)!,
      tipo: n.tipo,
      x: n.x + 32,
      y: n.y + 32,
      w: n.w,
      h: n.h,
      z: n.tipo === "secao" ? n.z : ++z,
      secaoId: n.secaoId ? (novo.get(n.secaoId) ?? n.secaoId) : null,
      dados: n.dados,
      imagemId: n.imagemId,
      roteiroId: n.roteiroId,
      cardId: n.cardId,
    }));
    for (const n of ordem) if (n.imagem) registrarImagem(n.imagem);
    const ligs: Op[] = Object.values(estadoRef.current.ligacoes)
      .filter((l) => !l.apagado && ids.has(l.de) && ids.has(l.para))
      .map((l) => ({ op: "criar_ligacao", id: novoId(), de: novo.get(l.de)!, para: novo.get(l.para)!, rotulo: l.rotulo }));
    for (const n of ordem) if (refs[n.id]) setRefs((r) => ({ ...r, [novo.get(n.id)!]: refs[n.id] }));
    criar(ops, ligs);
  }, [podeEditar, estadoRef, selecao, maxZ, registrarImagem, setRefs, refs, criar]);

  const moverSetas = useCallback(
    (dx: number, dy: number) => {
      const nos = estadoRef.current.nos;
      const ids = new Set([...selecao].filter((id) => nos[id] && !nos[id].apagado));
      for (const id of [...ids]) if (nos[id].tipo === "secao") for (const n of Object.values(nos)) if (!n.apagado && n.secaoId === id) ids.add(n.id);
      if (!ids.size) return;
      fazer({
        ops: [...ids].map((id) => ({ op: "mudar_no" as const, id, x: nos[id].x + dx, y: nos[id].y + dy })),
        volta: [...ids].map((id) => ({ op: "mudar_no" as const, id, x: nos[id].x, y: nos[id].y })),
      });
    },
    [estadoRef, selecao, fazer],
  );

  const mudarRotulo = useCallback(
    (id: string, rotulo: string) => {
      const l = estadoRef.current.ligacoes[id];
      if (!l) return;
      const novo = rotulo.trim() || null;
      if (novo === l.rotulo) return;
      fazer({ ops: [{ op: "mudar_ligacao", id, rotulo: novo }], volta: [{ op: "mudar_ligacao", id, rotulo: l.rotulo }] });
    },
    [estadoRef, fazer],
  );

  /* ───────────── teclado ───────────── */

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (digitando(e.target) || folhaAberta() || modo !== "canvas") return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (e.key === "Escape") {
        setEditando(null);
        setSelecao(new Set());
        setLigSel(null);
        setLigandoDe(null);
        setFerramenta("selecionar");
        setMenu(false);
        return;
      }
      if (mod && k === "z") {
        e.preventDefault();
        if (!podeEditar) return;
        const feito = e.shiftKey ? refazer() : desfazer();
        if (!feito) avisar(e.shiftKey ? "Nada para refazer." : "Nada para desfazer.");
        return;
      }
      if (mod && k === "y") {
        e.preventDefault();
        if (podeEditar) refazer();
        return;
      }
      if (mod && k === "a") {
        e.preventDefault();
        setSelecao(new Set(vivos.map((n) => n.id)));
        return;
      }
      if (mod && k === "d") {
        e.preventDefault();
        duplicar();
        return;
      }
      if (mod && (k === "=" || k === "+")) {
        e.preventDefault();
        canvas.current?.zoom(1.25);
        return;
      }
      if (mod && k === "-") {
        e.preventDefault();
        canvas.current?.zoom(0.8);
        return;
      }
      if (mod && k === "0") {
        e.preventDefault();
        canvas.current?.zoomCem();
        return;
      }
      if (e.shiftKey && e.code === "Digit1") {
        e.preventDefault();
        canvas.current?.enquadrar();
        return;
      }
      if (mod || e.altKey) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        apagarSelecao();
        return;
      }
      if (e.key.startsWith("Arrow") && selecao.size && podeEditar) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        moverSetas(e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0, e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0);
        return;
      }
      if (e.key === "Enter") {
        if (ligSel && podeEditar) {
          e.preventDefault();
          setFolha("rotulo");
        } else if (selecao.size === 1) {
          const n = estadoRef.current.nos[[...selecao][0]];
          const campo = n ? ({ nota: "texto", imagem: "legenda", link: "titulo", secao: "nome" } as Partial<Record<TipoNo, Campo>>)[n.tipo] : undefined;
          if (n && campo) {
            e.preventDefault();
            editar(n.id, campo);
          }
        }
        return;
      }
      if (!podeEditar) return;
      if (k === "n") {
        e.preventDefault();
        novaNota();
      } else if (k === "s") {
        e.preventDefault();
        novaSecao();
      } else if (k === "l") {
        setFerramenta((t) => (t === "ligar" ? "selecionar" : "ligar"));
        setLigandoDe(selecao.size === 1 ? [...selecao][0] : null);
      } else if (k === "v") {
        setFerramenta("selecionar");
        setLigandoDe(null);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [modo, podeEditar, avisar, desfazer, refazer, vivos, duplicar, apagarSelecao, selecao, ligSel, moverSetas, estadoRef, editar, novaNota, novaSecao]);

  /* ───────────── ações da barra e do celular ───────────── */

  const ligarAgora = () => {
    if (ferramenta === "ligar") {
      setFerramenta("selecionar");
      setLigandoDe(null);
      return;
    }
    setFerramenta("ligar");
    setLigandoDe(selecao.size === 1 ? [...selecao][0] : null);
    avisar(selecao.size === 1 ? "Toque no item de destino." : "Toque no primeiro item e depois no segundo.");
  };

  const aoAdicionar = (a: Adicionar, arquivos?: FileList | null) => {
    if (a === "foto" || a === "imagem") {
      if (arquivos?.length) subir([...arquivos]);
    } else if (a === "link") setTimeout(() => setFolha("link"), 240);
    else if (a === "ref") setTimeout(() => setFolha("ref"), 240);
    // depois que a folha fecha (ela devolve o foco a quem abriu; o campo novo perderia o foco)
    else if (a === "nota") setTimeout(() => novaNota(), 260);
    else if (a === "secao") setTimeout(() => novaSecao(), 260);
  };

  const irPara = useCallback(
    (id: string) => {
      trocarModo("canvas");
      setSelecao(new Set([id]));
      requestAnimationFrame(() => canvas.current?.irPara(id));
    },
    [trocarModo],
  );

  const escolhidos = useMemo(() => [...selecao].map((id) => estado.nos[id]).filter((n): n is NoFluxo => !!n && !n.apagado), [selecao, estado.nos]);
  const comCor = escolhidos.filter((n) => n.tipo === "nota" || n.tipo === "secao");
  const corAtual = comCor.length ? (comCor[0].dados as DadosNota).cor : null;
  const vazio = vivos.length === 0 && subindo.length === 0;
  const ligacaoEscolhida = ligSel ? estado.ligacoes[ligSel] : null;

  /* ───────────── exportar ───────────── */

  const paraExportar = useCallback(() => ({ titulo: info.titulo, nos: vivos, ligacoes: ligacoesVivas, refs }), [info.titulo, vivos, ligacoesVivas, refs]);
  const temImagens = vivos.some((n) => n.tipo === "imagem");

  /** PDF: a Lista com o CSS de impressão (no canvas, ⌘P também troca para a Lista antes). */
  const imprimir = useCallback(() => {
    flushSync(() => setModo("lista"));
    void imprimirComImagens();
  }, []);
  useEffect(() => {
    const antes = () => flushSync(() => setModo("lista"));
    window.addEventListener("beforeprint", antes);
    return () => window.removeEventListener("beforeprint", antes);
  }, []);

  const aoExportar = useCallback(
    async (a: AcaoExportar) => {
      setExportando(false);
      if (a === "ia") {
        const link = incluirImagens && L.links ? linkParaIa(L.links, new Date()) : null;
        const md = fluxoParaMarkdown(paraExportar(), {
          agora: new Date(),
          urlImagem: link?.token ? urlImagemPeloLink(window.location.origin, link.token) : null,
        });
        const ok = await copiarTexto(md);
        avisar(
          ok ? (temImagens && !link ? "Copiado. As imagens vão só pelo pacote ou por um link." : "Copiado. Cole na IA.") : "Não deu para copiar.",
          ok ? undefined : { tom: "erro" },
        );
      } else if (a === "json") {
        baixarTexto(
          `fluxo-${slug(info.titulo)}.json`,
          `${JSON.stringify(fluxoParaJson(paraExportar(), { agora: new Date() }), null, 2)}\n`,
          "application/json",
        );
      } else if (a === "pacote") {
        // o servidor monta e manda aos pedaços (Content-Disposition: attachment); a tela fica onde está
        const a = document.createElement("a");
        a.href = `/api/criacao/fluxo/pacote?id=${encodeURIComponent(info.id)}`;
        a.download = `fluxo-${slug(info.titulo)}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        avisar("Montando o pacote…");
      } else if (a === "pdf") imprimir();
      else if (a === "link" || a === "links") setFolha("links");
      else if (a === "card") setFolha("card");
    },
    [incluirImagens, L.links, paraExportar, avisar, temImagens, info.titulo, info.id, imprimir],
  );

  const menuExportar = {
    podeEnviar,
    podeEditar,
    naLixeira: info.apagado,
    temImagens,
    links: L.links,
    incluirImagens,
    setIncluirImagens,
    aoEscolher: (a: AcaoExportar) => void aoExportar(a),
  };
  const linksVivos = L.links?.length ?? 0;

  const salvamentoTexto =
    f.salvamento === "salvando" ? "Salvando…" : f.salvamento === "sem_rede" ? "Sem conexão" : f.salvamento === "erro" ? "Não salvou" : "Salvo";

  return (
    <div className="fx" data-modo={modo} data-leitura={!podeEditar || undefined}>
      <header className="fx-cabeca">
        <Link className="fx-voltar" href="/app/criacao/fluxos" aria-label="Fluxos" title="Fluxos">
          <Icone nome="voltar" size={18} />
          <span>Fluxos</span>
        </Link>
        <div className="fx-titulo">
          {editandoTitulo && podeEditar ? (
            <input
              className="fx-titulo__campo"
              autoFocus
              defaultValue={info.titulo}
              maxLength={200}
              aria-label="Título do fluxo"
              onFocus={(e) => {
                f.marcarEditandoTitulo(true);
                e.currentTarget.select();
              }}
              onBlur={(e) => {
                f.marcarEditandoTitulo(false);
                setEditandoTitulo(false);
                void f.mudarTitulo(e.currentTarget.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  e.currentTarget.value = info.titulo;
                  e.currentTarget.blur();
                }
              }}
            />
          ) : (
            <h1>
              {podeEditar ? (
                <button type="button" className="fx-titulo__botao" onClick={() => setEditandoTitulo(true)} title="Renomear">
                  <TituloDesenhado t={info.titulo} />
                </button>
              ) : (
                <TituloDesenhado t={info.titulo} />
              )}
            </h1>
          )}
          <span className="fx-salvo" data-estado={f.salvamento} aria-live="polite">
            {!props.podeEditar ? "Só leitura" : info.apagado ? "Na lixeira" : salvamentoTexto}
          </span>
        </div>
        <div className="fx-cabeca__fim">
          <div className="fx-seg" role="tablist" aria-label="Ver como">
            <button type="button" role="tab" aria-selected={modo === "canvas"} onClick={() => trocarModo("canvas")}>
              Canvas
            </button>
            <button type="button" role="tab" aria-selected={modo === "lista"} onClick={() => trocarModo("lista")}>
              Lista
            </button>
          </div>
          {podeEnviar ? (
            <button
              type="button"
              className="fx-privado"
              data-ativo={linksVivos > 0 || undefined}
              onClick={() => setFolha("links")}
              title={linksVivos ? "Quem tem o link vê o fluxo, só para ler." : "Ninguém de fora vê este fluxo."}
            >
              <Icone nome={linksVivos ? "link" : "cadeado"} size={15} />
              {linksVivos === 0 ? "Privado" : linksVivos === 1 ? "Link ativo" : `${linksVivos} links`}
            </button>
          ) : null}
          <div className="fx-exp">
            <button
              type="button"
              className="glass-btn glass-btn--sm glass-btn--ink fx-exp__botao"
              aria-haspopup="menu"
              aria-expanded={exportando || folha === "exportar"}
              onClick={() => (celular ? setFolha("exportar") : setExportando((v) => !v))}
            >
              <Icone nome="compartilhar" size={16} /> Exportar
            </button>
            {exportando && !celular ? <PopoverExportar {...menuExportar} fechar={() => setExportando(false)} /> : null}
          </div>
          <div className="fx-menu">
            <button type="button" className="fx-redondo" aria-label="Mais" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <Icone nome="pontos" size={18} />
            </button>
            {menu ? (
              <div className="fx-menu__painel" role="menu" onClick={() => setMenu(false)}>
                <button type="button" role="menuitem" onClick={() => (trocarModo("canvas"), requestAnimationFrame(() => canvas.current?.enquadrar()))}>
                  <IconeF nome="enquadrar" size={16} /> Mostrar tudo
                </button>
                {props.podeEditar && !info.apagado ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={async () => {
                      if (await f.lixeira(true)) {
                        router.push("/app/criacao/fluxos");
                        router.refresh();
                      }
                    }}
                  >
                    <Icone nome="lixo" size={16} /> Mandar para a lixeira
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {info.apagado ? (
        <div className="fx-faixa" role="status">
          <span>Este fluxo está na lixeira.</span>
          {props.podeEditar ? (
            <button type="button" className="glass-btn glass-btn--sm" onClick={() => void f.lixeira(false)}>
              Tirar da lixeira
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="fx-palco" hidden={modo !== "canvas"}>
        <Canvas
          ref={canvas}
          fluxoId={info.id}
          vivos={vivos}
          ligacoes={ligacoesVivas}
          refs={refs}
          podeEditar={podeEditar}
          ferramenta={ferramenta}
          ligandoDe={ligandoDe}
          selecao={selecao}
          ligSel={ligSel}
          editando={editando}
          subindo={subindo}
          margens={margens}
          selecionar={selecionar}
          selecionarLig={selecionarLig}
          escolherParaLigar={escolherParaLigar}
          moverFim={moverFim}
          redimensionarFim={redimensionarFim}
          ligar={ligar}
          editar={editar}
          editarRotulo={(id) => {
            setLigSel(id);
            setFolha("rotulo");
          }}
          salvarCampo={salvarCampo}
          notaEm={(p) => novaNota(p)}
          soltar={soltar}
        />

        {vazio ? (
          <div className="fx-vazio">
            <span className="fx-vazio__icone" aria-hidden="true">
              <IconeF nome="canvas" size={26} />
            </span>
            <h2>{podeEditar ? "Cole para começar" : "Fluxo vazio"}</h2>
            <p>{podeEditar ? "Imagem, link ou texto. Ou crie uma nota." : "Quando a equipe juntar ideias aqui, elas aparecem."}</p>
            {podeEditar ? (
              <button type="button" className="glass-btn glass-btn--ink glass-btn--sm" onClick={() => novaNota()}>
                <IconeF nome="nota" size={16} /> Nota
              </button>
            ) : null}
          </div>
        ) : null}

        {podeEditar && (escolhidos.length || ligacaoEscolhida) && !editando ? (
          <div className="fx-inspetor" role="toolbar" aria-label="Item escolhido">
            {comCor.length ? (
              <div className="fx-cores" role="radiogroup" aria-label="Cor">
                {CORES_FLUXO.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={corAtual === c}
                    data-cor={c}
                    title={NOME_COR[c]}
                    aria-label={NOME_COR[c]}
                    onClick={() => mudarCor(c)}
                  />
                ))}
              </div>
            ) : null}
            {ligacaoEscolhida ? (
              <button type="button" className="fx-inspetor__acao" onClick={() => setFolha("rotulo")}>
                Rótulo
              </button>
            ) : null}
            {escolhidos.length === 1 && escolhidos[0].tipo !== "secao" ? (
              <button type="button" className="fx-inspetor__acao" aria-pressed={ferramenta === "ligar"} onClick={ligarAgora}>
                <IconeF nome="ligar" size={16} /> Ligar
              </button>
            ) : null}
            {escolhidos.length ? (
              <button type="button" className="fx-inspetor__acao" onClick={duplicar} title="Duplicar (⌘D)">
                <Icone nome="copiar" size={16} />
                <span className="sr-only">Duplicar</span>
              </button>
            ) : null}
            <button type="button" className="fx-inspetor__acao" onClick={apagarSelecao} title="Apagar (Delete)">
              <Icone nome="lixo" size={16} />
              <span className="sr-only">Apagar</span>
            </button>
          </div>
        ) : null}

        {podeEditar ? (
          <nav className="fx-barra" aria-label="Ferramentas">
            <button
              type="button"
              aria-pressed={ferramenta === "selecionar"}
              onClick={() => {
                setFerramenta("selecionar");
                setLigandoDe(null);
              }}
              title="Selecionar (V)"
            >
              <IconeF nome="cursor" size={17} />
              <span>Selecionar</span>
            </button>
            <button type="button" onClick={() => novaNota()} title="Nota (N)">
              <IconeF nome="nota" size={17} />
              <span>Nota</span>
            </button>
            <button type="button" onClick={() => arquivo.current?.click()} title="Imagem">
              <Icone nome="imagem" size={17} />
              <span>Imagem</span>
            </button>
            <button type="button" onClick={() => setFolha("link")} title="Link">
              <Icone nome="link" size={17} />
              <span>Link</span>
            </button>
            <button type="button" onClick={novaSecao} title="Seção (S)">
              <IconeF nome="secao" size={17} />
              <span>Seção</span>
            </button>
            <button type="button" aria-pressed={ferramenta === "ligar"} onClick={ligarAgora} title="Ligar (L)">
              <IconeF nome="ligar" size={17} />
              <span>Ligar</span>
            </button>
            <button type="button" onClick={() => setFolha("ref")} title="Roteiro ou card">
              <IconeF nome="roteiro" size={17} />
              <span>Roteiro · Card</span>
            </button>
            <input
              ref={arquivo}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              hidden
              onChange={(e) => {
                subir([...(e.currentTarget.files ?? [])]);
                e.currentTarget.value = "";
              }}
            />
          </nav>
        ) : null}

        <div className="fx-pe">
          {podeEditar ? (
            <>
              <button type="button" className="fx-redondo" onClick={() => desfazer()} disabled={!f.podeDesfazer} aria-label="Desfazer" title="Desfazer (⌘Z)">
                <IconeF nome="desfazer" size={17} />
              </button>
              <button
                type="button"
                className="fx-redondo fx-so-celular"
                onClick={() => refazer()}
                disabled={!f.podeRefazer}
                aria-label="Refazer"
                title="Refazer (⇧⌘Z)"
              >
                <IconeF nome="refazer" size={17} />
              </button>
            </>
          ) : null}
          <div className="fx-zoom">
            <button type="button" onClick={() => canvas.current?.zoom(0.8)} aria-label="Afastar">
              <IconeF nome="menos" size={15} />
            </button>
            <button type="button" className="fx-zoom__n" onClick={() => canvas.current?.zoomCem()} title="100% (⌘0)" aria-label="Zoom; voltar a 100%">
              <ZoomRotulo />
            </button>
            <button type="button" onClick={() => canvas.current?.zoom(1.25)} aria-label="Aproximar">
              <Icone nome="mais" size={15} />
            </button>
            <button type="button" onClick={() => canvas.current?.enquadrar()} aria-label="Mostrar tudo" title="Mostrar tudo (⇧1)">
              <IconeF nome="enquadrar" size={15} />
            </button>
          </div>
          {podeEditar ? <span className="fx-dica">⌘V cola imagem, link ou texto</span> : null}
        </div>

        {podeEditar ? (
          <button type="button" className="fx-mais glass-btn glass-btn--ink" onClick={() => setFolha("adicionar")} aria-label="Adicionar">
            <Icone nome="mais" size={22} />
          </button>
        ) : null}
      </div>

      {modo === "lista" ? (
        <div className="imprimivel fx-imprimir">
          <div className="fx-imprimir__cabeca" aria-hidden="true">
            <h1>
              <TituloDesenhado t={info.titulo} />
            </h1>
            <p>Fluxo · Maestro · {new Date().toLocaleDateString("pt-BR")}</p>
          </div>
          <ListaFluxo titulo={info.titulo} nos={vivos} ligacoes={ligacoesVivas} refs={refs} irPara={irPara} />
        </div>
      ) : null}

      {folha === "link" ? <FolhaLink aoFechar={() => setFolha(null)} aoAdicionar={(l, t) => novoLink(l, t)} /> : null}
      {folha === "ref" ? (
        <FolhaReferencia
          aoFechar={() => setFolha(null)}
          roteiros={props.roteiros}
          cards={props.cards}
          aoEscolher={(e) =>
            e.tipo === "roteiro"
              ? novaReferencia("roteiro", e.r.id, undefined, {
                  tipo: "roteiro",
                  estado: "ok",
                  id: e.r.id,
                  titulo: e.r.titulo,
                  situacao: e.r.estado as "rascunho",
                  versao: e.r.versao,
                  duracaoSeg: e.r.duracaoSeg,
                  naLixeira: false,
                })
              : novaReferencia("card", e.c.id, undefined, {
                  tipo: "card",
                  estado: "ok",
                  id: e.c.id,
                  titulo: e.c.titulo,
                  coluna: "",
                  colunaNome: e.c.coluna,
                  colunaCor: null,
                  prazo: null,
                  naLixeira: false,
                })
          }
        />
      ) : null}
      {folha === "adicionar" ? <FolhaAdicionar aoFechar={() => setFolha(null)} aoEscolher={aoAdicionar} /> : null}
      {folha === "rotulo" && ligacaoEscolhida ? (
        <FolhaRotulo
          valor={ligacaoEscolhida.rotulo ?? ""}
          aoFechar={() => setFolha(null)}
          aoSalvar={(v) => mudarRotulo(ligacaoEscolhida.id, v)}
          aoApagar={apagarSelecao}
        />
      ) : null}

      {folha === "exportar" ? <FolhaExportar {...menuExportar} aoFechar={() => setFolha(null)} /> : null}
      {folha === "links" ? (
        <FolhaLinks
          aoFechar={() => setFolha(null)}
          links={L.links}
          criar={L.criar}
          revogar={L.revogar}
          avisar={(t, tom) => avisar(t, tom ? { tom } : undefined)}
          naLixeira={info.apagado}
        />
      ) : null}
      {folha === "card" ? (
        <FolhaCard
          aoFechar={() => setFolha(null)}
          cards={props.cards}
          atual={info.cardId ? { id: info.cardId, titulo: info.card } : null}
          aoEscolher={async (c) => {
            if (await f.ligarCard(c ? { id: c.id, titulo: c.titulo } : null))
              avisar(c ? `No card "${c.titulo || "sem título"}". A ficha mostra o fluxo.` : "Fluxo fora do card.");
          }}
        />
      ) : null}

      {f.aviso ? <Aviso key={f.aviso.id} texto={f.aviso.texto} desfazer={f.aviso.desfazer} tom={f.aviso.tom} fechar={f.fecharAviso} /> : null}
    </div>
  );
}
