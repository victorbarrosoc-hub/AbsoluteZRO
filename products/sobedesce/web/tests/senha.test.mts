/**
 * Campo de senha com o olho (src/components/ui/senha.tsx): todo campo de senha do site usa o InputSenha, o olho é um
 * botão comum (nunca envia o form) com rótulo e aria-pressed, e o autocomplete do gerenciador de senhas continua.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arquivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? arquivos(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

test("nenhum campo de senha sem o olho", () => {
  const soltos = arquivos(path.join(raiz, "src"))
    .filter((f) => !f.endsWith(path.join("ui", "senha.tsx")))
    .filter((f) => /type=["{']*password/.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(soltos, []);
});

test("olho: botão comum, rótulo, aria-pressed e autocomplete preservado", () => {
  const html = execFileSync(process.execPath, ["--import", "tsx", path.join(raiz, "tests", "senha-render.mts")], { cwd: raiz, encoding: "utf8" });
  assert.match(html, /<input[^>]*type="password"/);
  assert.match(html, /autoComplete="current-password"/);
  assert.match(html, /<button type="button"[^>]*aria-label="Mostrar senha"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /aria-controls="senha"/);
  assert.match(html, /stroke="currentColor"/);
  assert.doesNotMatch(html, /type="submit"/);
});
