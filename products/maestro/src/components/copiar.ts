/** Copia texto (a API do navegador; sem ela, o jeito antigo). Usado no Fluxo (Exportar) e no Quadro (link do card). */
export async function copiarTexto(t: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    try {
      const a = document.createElement("textarea");
      a.value = t;
      a.setAttribute("readonly", "");
      a.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(a);
      a.select();
      const ok = document.execCommand("copy");
      a.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
