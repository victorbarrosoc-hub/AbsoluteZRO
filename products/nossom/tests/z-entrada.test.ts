// Entrada do estúdio (titular, 29/10/2026; Plano de Integração §7–8: "a tarefa principal do aplicativo vem primeiro"):
// /studio abre no Início, nunca na Z. A Z não é a primeira da barra lateral nem aba da barra do celular: fica por último
// na lateral e num anel discreto no topo; /studio/z segue valendo como link direto. O e2e (tests/e2e/zro-ia.spec.ts)
// confere a tela; aqui, o contrato no código, sem servidor.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ler = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('/studio não redireciona para a Z', () => {
  const page = ler('app/studio/page.tsx');
  assert.doesNotMatch(page, /redirect\(/);
  assert.doesNotMatch(page, /\/studio\/z'/);
});

test('só /studio/z abre a Z (link direto); /studio é o Início', () => {
  const studio = ler('components/studio.tsx');
  assert.doesNotMatch(studio, /pathname === '\/studio' && zroIa/);
  assert.match(studio, /pathname === '\/studio\/z' && zroIa/);
});

test('a Z por último na barra lateral, fora da barra do celular, e com o anel discreto no topo', () => {
  const studio = ler('components/studio.tsx');
  const lateral = /<nav aria-label="Navegação do estúdio">([\s\S]*?)<\/nav>/.exec(studio)![1];
  assert.ok(lateral.indexOf("navigate('home')") < lateral.indexOf("navigate('z')"));
  assert.ok(lateral.indexOf("visitStudio('/studio/planos')") < lateral.indexOf("navigate('z')"));
  const celular = /<nav className="studio-tabs"[\s\S]*?<\/nav>/.exec(studio)![0];
  assert.doesNotMatch(celular, /navigate\('z'\)/);
  assert.match(celular.split('<button')[1], /navigate\('home'\)/);
  const topo = /<div className="studio-header-actions">([\s\S]*?)<\/div>/.exec(studio)![1];
  assert.match(topo, /className=\{`icon-button z-top/);
});
