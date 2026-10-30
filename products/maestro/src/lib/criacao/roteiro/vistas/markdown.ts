/**
 * Markdown do roteiro (IA e copiar; também o nó de roteiro do Fluxo): título, uma linha de resumo, cabeçalho por cena e
 * blocos com rótulo. Nota interna nunca sai; bloco vazio e dica de modelo também não. Puro.
 */
import { NOME_MODO_FALA, nomeDeQuemFala, type Roteiro } from "../modelo";
import { formatarTempo, linhaDoTempo } from "../tempo";
import { aparar, entra, partesDoPlano, rotuloAudio, rotuloLettering } from "./comum";

/** Uma linha só, sem quebra (rótulos e cabeçalhos). */
const umaLinha = (t: string) => t.replace(/\s+/g, " ").trim();
/** Texto de várias linhas dentro de um item de lista: as linhas seguintes entram recuadas. */
const recuado = (t: string) => aparar(t).replace(/\n/g, "\n  ");

export function paraMarkdown(r: Roteiro, titulo: string): string {
  const tempo = linhaDoTempo(r);
  const linhas: string[] = [`# ${umaLinha(titulo) || "Roteiro"}`, ""];
  const resumo = [`Formato ${r.formato}`, `${r.cenas.length} ${r.cenas.length === 1 ? "cena" : "cenas"}`, `${formatarTempo(tempo.totalSeg)} estimados`];
  if (r.alvo) resumo.push(r.alvo.min === r.alvo.max ? `alvo ${formatarTempo(r.alvo.max)}` : `alvo ${formatarTempo(r.alvo.min)}–${formatarTempo(r.alvo.max)}`);
  linhas.push(`> ${resumo.join(" · ")}`);
  r.cenas.forEach((c, i) => {
    const tc = tempo.cenas[i];
    const lugar = [c.intExt, c.local?.trim(), c.periodo].filter(Boolean).join(" · ");
    const cab = [`Cena ${i + 1}`, umaLinha(c.titulo), lugar].filter(Boolean).join(" · ");
    linhas.push("", `## ${cab} (${formatarTempo(tc.duracaoSeg)})`, "");
    let algum = false;
    for (const b of c.blocos) {
      if (!entra(b)) continue;
      algum = true;
      switch (b.tipo) {
        case "fala": {
          const modo = b.modo === "on" ? "" : ` (${NOME_MODO_FALA[b.modo]})`;
          const obs = b.obs?.trim() ? ` _(${umaLinha(b.obs)})_` : "";
          linhas.push(`- **Fala · ${umaLinha(nomeDeQuemFala(r, b.quem))}${modo}:**${obs} ${recuado(b.texto)}`);
          break;
        }
        case "acao":
          linhas.push(`- **Ação:** ${recuado(b.texto)}`);
          break;
        case "plano": {
          const p = partesDoPlano(b);
          linhas.push(`- **Plano:** ${[p.sigla, p.detalhe].filter(Boolean).join(" · ")}`);
          break;
        }
        case "lettering":
          linhas.push(`- **Lettering (${rotuloLettering(b)}):** ${recuado(b.texto)}`);
          break;
        case "audio":
          linhas.push(`- **Áudio (${rotuloAudio(b)}):**${b.texto.trim() ? ` ${recuado(b.texto)}` : ""}`);
          break;
        case "observacao":
          linhas.push(`- **Observação:** ${recuado(b.texto)}`);
          break;
      }
    }
    if (!algum) linhas.push("_(cena vazia)_");
  });
  return linhas.join("\n") + "\n";
}
