// Criação · Fluxo, a tela (fase F5), o que é puro: as contas do canvas (vista, zoom em torno de um ponto, enquadrar,
// laço, seção sob o ponto, desenho da ligação), o que o colar vira (referência do Maestro, link, notas), a conferência
// da imagem antes de subir e o estado otimista (aplicar na tela, juntar a fila, pôr o rev visto, juntar o poll).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  caixaDe,
  caminhoLigacao,
  enquadrar,
  intersecta,
  mundoParaTela,
  retangulo,
  secaoNoPonto,
  telaParaMundo,
  zoomEm,
  ZOOM_MAX,
  ZOOM_MIN,
} from "../src/components/criacao/fluxo/geometria";
import { conferirImagem, IMAGEM_ENTRADA_MAX, LEGENDA_PX, oQueColar, tamanhoDaImagem } from "../src/components/criacao/fluxo/colar";
import { aplicarLocal, aplicarTodas, comRevs, juntarDoServidor, juntarFila, novoId, type Estado } from "../src/components/criacao/fluxo/ops";
import { IMAGEM_ENTRADA_MAX as NO_SERVIDOR } from "../src/lib/criacao/fluxo/imagem";
import { lerOps, type LigacaoFluxo, type NoFluxo, type Op } from "../src/lib/criacao/fluxo/modelo";

const ORIGEM = "https://maestro.absolutezro.com";
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function no(n: number, extra: Partial<NoFluxo> = {}): NoFluxo {
  return {
    id: ID(n),
    tipo: "nota",
    x: 0,
    y: 0,
    w: 200,
    h: 120,
    z: 0,
    secaoId: null,
    dados: { texto: "", cor: "amarelo" },
    imagemId: null,
    roteiroId: null,
    cardId: null,
    imagem: null,
    rev: 1,
    apagado: false,
    atualizado: "",
    atualizadoPor: null,
    ...extra,
  };
}
const lig = (n: number, de: number, para: number, extra: Partial<LigacaoFluxo> = {}): LigacaoFluxo => ({
  id: ID(n),
  de: ID(de),
  para: ID(para),
  rotulo: null,
  rev: 1,
  apagado: false,
  atualizado: "",
  ...extra,
});

describe("canvas: vista, zoom e enquadrar", () => {
  test("tela ↔ mundo são inversas", () => {
    const v = { x: 120, y: -40, z: 1.5 };
    const p = { x: 333, y: 77 };
    const m = telaParaMundo(v, p);
    const de = mundoParaTela(v, m);
    assert.ok(Math.abs(de.x - p.x) < 1e-9 && Math.abs(de.y - p.y) < 1e-9);
  });

  test("zoom em torno do cursor: o ponto do mundo sob o cursor não sai do lugar; limites de 10% a 400%", () => {
    const v = { x: 50, y: 80, z: 1 };
    const cursor = { x: 400, y: 300 };
    const antes = telaParaMundo(v, cursor);
    const z2 = zoomEm(v, 2, cursor);
    const depois = telaParaMundo(z2, cursor);
    assert.equal(z2.z, 2);
    assert.ok(Math.abs(antes.x - depois.x) < 1e-9 && Math.abs(antes.y - depois.y) < 1e-9);
    assert.equal(zoomEm(v, 99, cursor).z, ZOOM_MAX);
    assert.equal(zoomEm(v, 0.0001, cursor).z, ZOOM_MIN);
    assert.equal(zoomEm(v, Number.NaN, cursor).z, 1);
  });

  test("enquadrar cabe tudo, nunca passa de 100% e respeita a cabeça e a barra", () => {
    const c = caixaDe([
      { x: 0, y: 0, w: 200, h: 100 },
      { x: 1800, y: 900, w: 200, h: 100 },
    ])!;
    assert.deepEqual(c, { x: 0, y: 0, w: 2000, h: 1000 });
    const v = enquadrar(c, 1440, 900, { topo: 150, pe: 110, margem: 48 });
    assert.ok(v.z < 1);
    const a = mundoParaTela(v, { x: 0, y: 0 });
    const b = mundoParaTela(v, { x: 2000, y: 1000 });
    assert.ok(a.x >= 47.9 && b.x <= 1440 - 47.9, "cabe na largura");
    assert.ok(a.y >= 150 + 47.9 && b.y <= 900 - 110 - 47.9, "cabe entre a cabeça e a barra");
    const pequeno = enquadrar({ x: 10, y: 10, w: 100, h: 50 }, 1440, 900);
    assert.equal(pequeno.z, 1, "fluxo pequeno não fica gigante");
    assert.deepEqual(enquadrar(null, 1000, 800, { topo: 100, pe: 100 }), { x: 500, y: 400, z: 1 });
  });

  test("laço em qualquer direção e interseção", () => {
    assert.deepEqual(retangulo({ x: 50, y: 60 }, { x: 10, y: 20 }), { x: 10, y: 20, w: 40, h: 40 });
    assert.equal(intersecta({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 5, h: 5 }), true);
    assert.equal(intersecta({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 }), false);
  });

  test("a seção sob o ponto: a de cima ganha; empate, a menor; ignora a que está sendo levada", () => {
    const secoes = [
      { id: "grande", z: 1, x: 0, y: 0, w: 1000, h: 1000 },
      { id: "pequena", z: 1, x: 100, y: 100, w: 200, h: 200 },
      { id: "em-cima", z: 5, x: 500, y: 500, w: 400, h: 400 },
    ];
    assert.equal(secaoNoPonto(secoes, { x: 150, y: 150 }), "pequena");
    assert.equal(secaoNoPonto(secoes, { x: 600, y: 600 }), "em-cima");
    assert.equal(secaoNoPonto(secoes, { x: 50, y: 50 }), "grande");
    assert.equal(secaoNoPonto(secoes, { x: 2000, y: 50 }), null);
    assert.equal(secaoNoPonto(secoes, { x: 150, y: 150 }, new Set(["pequena"])), "grande");
  });

  test("a ligação sai da borda virada para o outro nó e chega na borda dele", () => {
    const a = { x: 0, y: 0, w: 100, h: 50 };
    const b = { x: 400, y: 0, w: 100, h: 50 };
    const c = caminhoLigacao(a, b);
    assert.match(c.d, /^M100 25 C/);
    assert.deepEqual(c.fim, { x: 400, y: 25 });
    assert.ok(Math.abs(c.angulo) < 1e-9, "a seta aponta para a direita");
    const abaixo = caminhoLigacao(a, { x: 0, y: 400, w: 100, h: 50 });
    assert.match(abaixo.d, /^M50 50 C/);
    assert.deepEqual(abaixo.fim, { x: 50, y: 400 });
    // puxando até um ponto (a ligação ainda sem destino)
    const puxando = caminhoLigacao(a, { x: 300, y: 200 });
    assert.deepEqual(puxando.fim, { x: 300, y: 200 });
  });
});

describe("colar: o que o texto vira", () => {
  test("endereço de roteiro ou card do próprio Maestro vira referência", () => {
    const r = oQueColar(`  ${ORIGEM}/app/criacao/roteiros/${ID(7)}  `, [ORIGEM]);
    assert.deepEqual(r, { tipo: "ref", ref: { tipo: "roteiro", id: ID(7) } });
    assert.deepEqual(oQueColar(`${ORIGEM}/app/quadro?card=demo-card-1`, [ORIGEM]), { tipo: "ref", ref: { tipo: "card", id: "demo-card-1" } });
  });

  test("link vira nó de link (YouTube reconhecido; outro site com o domínio); o Maestro de outro site é só link", () => {
    const y = oQueColar("https://youtu.be/dQw4w9WgXcQ", [ORIGEM]);
    assert.equal(y.tipo, "link");
    assert.equal(y.tipo === "link" && y.link.fonte, "youtube");
    const w = oQueColar("www.exemplo.com.br/receita", [ORIGEM]);
    assert.equal(w.tipo === "link" && w.link.dominio, "exemplo.com.br");
    const outro = oQueColar(`https://outro.site/app/criacao/roteiros/${ID(7)}`, [ORIGEM]);
    assert.equal(outro.tipo, "link");
  });

  test("texto com espaço, várias linhas ou endereço interno vira notas; vazio não faz nada", () => {
    assert.deepEqual(oQueColar("Paleta quente, nada de azul.", [ORIGEM]), { tipo: "texto", texto: "Paleta quente, nada de azul." });
    assert.equal(oQueColar("https://exemplo.com e mais", [ORIGEM]).tipo, "texto");
    assert.equal(oQueColar("http://localhost:3000/x", [ORIGEM]).tipo, "texto", "endereço interno não vira link");
    assert.deepEqual(oQueColar("   \n  ", [ORIGEM]), { tipo: "nada" });
  });

  test("imagem: só PNG, JPEG ou WebP até 12 MB (o mesmo limite do servidor)", () => {
    assert.equal(IMAGEM_ENTRADA_MAX, NO_SERVIDOR);
    assert.deepEqual(conferirImagem({ type: "image/png", size: 1000 }), { ok: true });
    assert.equal(conferirImagem({ type: "image/gif", size: 1000 }).ok, false);
    assert.equal(conferirImagem({ type: "image/svg+xml", size: 1000 }).ok, false);
    assert.equal(conferirImagem({ type: "image/jpeg", size: IMAGEM_ENTRADA_MAX + 1 }).ok, false);
    assert.equal(conferirImagem({ type: "image/webp", size: 0 }).ok, false);
  });

  test("tamanho do nó de imagem: pela proporção, com a legenda, sem passar dos limites", () => {
    assert.deepEqual(tamanhoDaImagem(1600, 900), { w: 240, h: 135 + LEGENDA_PX });
    const empe = tamanhoDaImagem(1080, 1920);
    assert.equal(empe.w, 200);
    assert.ok(empe.h <= 360 + LEGENDA_PX);
    assert.deepEqual(tamanhoDaImagem(4000, 100), { w: 240, h: 80 + LEGENDA_PX });
    assert.deepEqual(tamanhoDaImagem(0, 0), { w: 240, h: 180 });
  });
});

describe("estado otimista: aplicar, juntar a fila, rev e poll", () => {
  const e0: Estado = { nos: { [ID(1)]: no(1), [ID(2)]: no(2, { x: 400 }) }, ligacoes: { [ID(9)]: lig(9, 1, 2) } };

  test("aplicar na tela: criar, mover, mudar dados (soma), apagar e restaurar (lápide fica)", () => {
    const criar: Op = {
      op: "criar_no",
      id: ID(3),
      tipo: "nota",
      x: 10,
      y: 20,
      w: 200,
      h: 120,
      z: 3,
      secaoId: null,
      dados: { texto: "Oi", cor: "menta" },
      imagemId: null,
      roteiroId: null,
      cardId: null,
    };
    let e = aplicarLocal(e0, criar);
    assert.equal(e.nos[ID(3)].rev, 0);
    assert.notEqual(e, e0);
    assert.equal(e0.nos[ID(3)], undefined, "o estado de entrada não muda");
    e = aplicarTodas(e, [
      { op: "mudar_no", id: ID(3), x: 50 },
      { op: "mudar_no", id: ID(3), dados: { texto: "Olá" } },
      { op: "apagar_no", id: ID(1) },
      { op: "apagar_ligacao", id: ID(9) },
    ]);
    assert.equal(e.nos[ID(3)].x, 50);
    assert.deepEqual(e.nos[ID(3)].dados, { texto: "Olá", cor: "menta" });
    assert.equal(e.nos[ID(1)].apagado, true);
    assert.equal(e.ligacoes[ID(9)].apagado, true);
    e = aplicarTodas(e, [
      { op: "restaurar_no", id: ID(1) },
      { op: "restaurar_ligacao", id: ID(9) },
    ]);
    assert.equal(e.nos[ID(1)].apagado, false);
    assert.equal(e.ligacoes[ID(9)].apagado, false);
    assert.equal(aplicarLocal(e, { op: "mudar_no", id: ID(77), x: 1 }), e, "item desconhecido não muda nada");
  });

  test("juntar a fila: o mesmo nó mexido várias vezes vira uma operação; mudança no recém-criado entra no criar", () => {
    const fila = juntarFila([
      {
        op: {
          op: "criar_no",
          id: ID(3),
          tipo: "nota",
          x: 0,
          y: 0,
          w: 200,
          h: 120,
          z: 0,
          secaoId: null,
          dados: { texto: "", cor: "amarelo" },
          imagemId: null,
          roteiroId: null,
          cardId: null,
        },
      },
      { op: { op: "mudar_no", id: ID(3), dados: { texto: "Gancho" } }, comRev: true },
      { op: { op: "mudar_no", id: ID(3), x: 40, y: 50 } },
      { op: { op: "mudar_no", id: ID(1), x: 1 } },
      { op: { op: "mudar_no", id: ID(1), x: 2, y: 3 } },
      { op: { op: "mudar_no", id: ID(2), dados: { texto: "a" } }, comRev: true },
      { op: { op: "mudar_no", id: ID(2), dados: { cor: "rosa" } } },
      { op: { op: "apagar_no", id: ID(1) } },
      { op: { op: "mudar_no", id: ID(1), x: 9 } },
      { op: { op: "criar_ligacao", id: ID(8), de: ID(1), para: ID(3), rotulo: null } },
      { op: { op: "mudar_ligacao", id: ID(8), rotulo: "depois" }, comRev: true },
    ]);
    assert.deepEqual(
      fila.map((i) => i.op.op),
      ["criar_no", "mudar_no", "mudar_no", "apagar_no", "mudar_no", "criar_ligacao"],
    );
    const criar = fila[0].op as Extract<Op, { op: "criar_no" }>;
    assert.deepEqual([criar.x, criar.y, criar.dados], [40, 50, { texto: "Gancho", cor: "amarelo" }]);
    assert.deepEqual(fila[1].op, { op: "mudar_no", id: ID(1), x: 2, y: 3 });
    assert.deepEqual(fila[2], { op: { op: "mudar_no", id: ID(2), dados: { texto: "a", cor: "rosa" } }, comRev: true });
    assert.deepEqual(fila[4].op, { op: "mudar_no", id: ID(1), x: 9 }, "depois da lápide, outra operação");
    assert.equal((fila[5].op as Extract<Op, { op: "criar_ligacao" }>).rotulo, "depois");
    // o que sai continua passando na conferência do servidor
    assert.equal(lerOps(comRevs(fila, new Map([[ID(2), 4]]))).ok, true);
  });

  test("o rev visto só vai nas mudanças de conteúdo (mover vai sem: quem grava por último leva)", () => {
    const ops = comRevs(
      [
        { op: { op: "mudar_no", id: ID(1), x: 5 } },
        { op: { op: "mudar_no", id: ID(2), dados: { texto: "x" } }, comRev: true },
        { op: { op: "mudar_ligacao", id: ID(9), rotulo: "r" }, comRev: true },
        { op: { op: "mudar_no", id: ID(5), dados: { texto: "y" } }, comRev: true },
      ],
      new Map([
        [ID(1), 3],
        [ID(2), 7],
        [ID(9), 2],
      ]),
    );
    assert.deepEqual(ops[0], { op: "mudar_no", id: ID(1), x: 5 });
    assert.deepEqual(ops[1], { op: "mudar_no", id: ID(2), dados: { texto: "x" }, rev: 7 });
    assert.deepEqual(ops[2], { op: "mudar_ligacao", id: ID(9), rotulo: "r", rev: 2 });
    assert.deepEqual(ops[3], { op: "mudar_no", id: ID(5), dados: { texto: "y" } }, "sem rev conhecido, vai sem");
  });

  test("o poll não passa por cima do que está na fila, sendo editado ou mais novo na tela", () => {
    const revs = new Map([
      [ID(1), 1],
      [ID(2), 5],
    ]);
    const vindo = {
      nos: [no(1, { x: 999, rev: 2 }), no(2, { x: 888, rev: 3 }), no(4, { x: 77, rev: 1 })],
      ligacoes: [lig(9, 1, 2, { rotulo: "novo", rev: 2 })],
    };
    const e = juntarDoServidor(e0, vindo, { pendentes: new Set([ID(9)]), revs });
    assert.equal(e.nos[ID(1)].x, 999, "mudança de outra pessoa entra");
    assert.equal(e.nos[ID(2)].x, 400, "a tela tem versão mais nova (rev 5)");
    assert.equal(e.nos[ID(4)].x, 77, "item novo entra");
    assert.equal(e.ligacoes[ID(9)].rotulo, null, "na fila: fica o da tela");
    assert.equal(revs.get(ID(1)), 2);
    const editando = juntarDoServidor(e0, { nos: [no(1, { x: 5, rev: 9 })], ligacoes: [] }, { pendentes: new Set(), revs: new Map(), editando: ID(1) });
    assert.equal(editando, e0, "sendo editado: nada muda");
  });

  test("ids novos são UUID v4", () => {
    const a = novoId();
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(a, novoId());
  });
});
