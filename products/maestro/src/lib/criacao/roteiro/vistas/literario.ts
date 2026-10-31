/**
 * Vista Literário (quem escreve e o cliente): cabeçalho da cena em caixa-alta (`2. INT. TORREFAÇÃO – DIA`), ação em
 * parágrafo, falas com o nome acima (OFF/sonora/passagem ao lado do nome, a indicação entre parênteses). Lettering e
 * áudio entram como linhas discretas. Plano e observação são do Técnico; nota interna nunca sai. Puro.
 */
import { type Cena, cabecalhoDaCena, type EstiloLettering, type ModoFala, NOME_MODO_FALA, nomeDeQuemFala, type Roteiro } from "../modelo";
import { aparar, entra, type OpcoesVista, rotuloAudio, rotuloLettering } from "./comum";

export type LinhaLiteraria =
  | { tipo: "acao"; blocoId: string; texto: string; dica?: string }
  | { tipo: "fala"; blocoId: string; quem: string | null; nome: string; modo: ModoFala; obs: string | null; texto: string; dica?: string }
  | { tipo: "lettering"; blocoId: string; estilo: EstiloLettering; rotulo: string; texto: string; dica?: string }
  | { tipo: "audio"; blocoId: string; rotulo: string; texto: string; dica?: string };

export type CenaLiteraria = {
  id: string;
  numero: number;
  cabecalho: string;
  /** O título, quando o cabeçalho mostra o lugar (senão o título já está no cabeçalho). */
  titulo: string | null;
  linhas: LinhaLiteraria[];
};

export type VistaLiterario = { cenas: CenaLiteraria[] };

const comDica = <T extends object>(o: T, dica: string | undefined, vazio: boolean): T => (vazio && dica ? { ...o, dica } : o);

function cenaLiteraria(r: Roteiro, c: Cena, numero: number, o: OpcoesVista): CenaLiteraria {
  const cabecalho = cabecalhoDaCena(c, numero);
  const temLugar = !!(c.intExt || c.local?.trim() || c.periodo);
  const linhas: LinhaLiteraria[] = [];
  for (const b of c.blocos) {
    if (!entra(b, o)) continue;
    const vazio = !!o.incluirVazios;
    switch (b.tipo) {
      case "acao":
        linhas.push(comDica({ tipo: "acao", blocoId: b.id, texto: aparar(b.texto) }, b.dica, vazio));
        break;
      case "fala":
        linhas.push(
          comDica(
            { tipo: "fala", blocoId: b.id, quem: b.quem, nome: nomeDeQuemFala(r, b.quem), modo: b.modo, obs: b.obs?.trim() || null, texto: aparar(b.texto) },
            b.dica,
            vazio,
          ),
        );
        break;
      case "lettering":
        linhas.push(comDica({ tipo: "lettering", blocoId: b.id, estilo: b.estilo, rotulo: rotuloLettering(b), texto: aparar(b.texto) }, b.dica, vazio));
        break;
      case "audio":
        linhas.push(comDica({ tipo: "audio", blocoId: b.id, rotulo: rotuloAudio(b), texto: aparar(b.texto) }, b.dica, vazio));
        break;
    }
  }
  return { id: c.id, numero, cabecalho, titulo: temLugar && c.titulo.trim() ? c.titulo.trim() : null, linhas };
}

export function vistaLiterario(r: Roteiro, o: OpcoesVista = {}): VistaLiterario {
  return { cenas: r.cenas.map((c, i) => cenaLiteraria(r, c, i + 1, o)) };
}

/** "ANA (OFF)", "JOÃO (SONORA)" ou só "ANA". */
export function nomeNaFala(nome: string, modo: ModoFala): string {
  const n = nome.toLocaleUpperCase("pt-BR");
  return modo === "on" ? n : `${n} (${NOME_MODO_FALA[modo].toLocaleUpperCase("pt-BR")})`;
}

/** O Literário em texto corrido (copiar e colar, e-mail). */
export function literarioEmTexto(r: Roteiro): string {
  const partes: string[] = [];
  for (const c of vistaLiterario(r).cenas) {
    const bloco: string[] = [c.titulo ? `${c.cabecalho}\n${c.titulo}` : c.cabecalho];
    for (const l of c.linhas) {
      if (l.tipo === "acao") bloco.push(l.texto);
      else if (l.tipo === "fala") bloco.push([nomeNaFala(l.nome, l.modo), l.obs ? `(${l.obs})` : "", l.texto].filter(Boolean).join("\n"));
      else bloco.push(l.texto ? `[${l.rotulo}: ${l.texto}]` : `[${l.rotulo}]`);
    }
    partes.push(bloco.join("\n\n"));
  }
  return partes.join("\n\n\n");
}
