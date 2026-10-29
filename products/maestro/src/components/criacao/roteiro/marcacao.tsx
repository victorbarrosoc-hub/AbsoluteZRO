/** A marcação do TPeasy desenhada (prévia e impressão; servidor e navegador). */
import type { ReactNode } from "react";

/** Uma linha na marcação do TPeasy: `**ênfase**`, `[deixa]` (aparece apagada), `((nota))` (não aparece). */
export function marcacao(linha: string): ReactNode[] {
  const partes: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]\n]*)\]|\(\([\s\S]*?\)\)/g;
  let i = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(linha))) {
    if (m.index > i) partes.push(linha.slice(i, m.index));
    if (m[1] !== undefined) partes.push(<strong key={k++}>{m[1]}</strong>);
    else if (m[2] !== undefined)
      partes.push(
        <span key={k++} className="cr-tp__deixa">
          [{m[2]}]
        </span>,
      );
    i = m.index + m[0].length;
  }
  if (i < linha.length) partes.push(linha.slice(i));
  return partes;
}
