import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DESKTOP_VERSION,
  desktopInstallers,
  forgetReleases,
  installerUrl,
  LEGACY_RELEASE,
} from '../lib/desktop-releases';
import { GET as baixar } from '../app/baixar/[arquivo]/route';
import { GET as atualizacao } from '../app/baixar/atualizacoes/[arquivo]/route';

const NEW_RELEASE = '/repos/victorbarrosoc-hub/AbsoluteZRO/releases/tags/nossom-v0.2.2';
const OLD_RELEASE = '/repos/victorbarrosoc-hub/nossom/releases/tags/desktop-v0.2.2';
const CHANNEL = '/repos/victorbarrosoc-hub/AbsoluteZRO/releases/tags/nossom-atualizacoes';
const TOKEN = 'github_pat_teste_falso';
const realFetch = globalThis.fetch;
const realToken = process.env.GITHUB_TOKEN;

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = realToken;
  forgetReleases();
});

const asset = (repo: string, id: number, name: string) => ({
  name,
  url: `https://api.github.com/repos/${repo}/releases/assets/${id}`,
  browser_download_url: `https://github.com/${repo}/releases/download/x/${name}`,
});
const OLD_ASSETS = [
  asset('victorbarrosoc-hub/nossom', 1, 'NOSSOM-0.2.2-mac-arm64.dmg'),
  asset('victorbarrosoc-hub/nossom', 2, 'NOSSOM-0.2.2-mac-x64.dmg'),
  asset('victorbarrosoc-hub/nossom', 3, 'NOSSOM-0.2.2-win-x64.exe'),
];

type Call = { url: string; init?: RequestInit };
/** GitHub falso: releases por caminho da API; arquivos respondem 302 para um endereço assinado. */
function fakeGitHub(releases: Record<string, unknown[] | number>, calls: Call[] = []) {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const u = new URL(url);
    if (u.hostname === 'api.github.com' && u.pathname.includes('/releases/assets/')) {
      const id = u.pathname.split('/').pop();
      return new Response(null, {
        status: 302,
        headers: { location: `https://objects.githubusercontent.example/arquivo-${id}?assinado=1` },
      });
    }
    const release = releases[u.pathname];
    if (Array.isArray(release)) return Response.json({ assets: release });
    return new Response('{}', { status: typeof release === 'number' ? release : 404 });
  }) as typeof fetch;
  return calls;
}
const params = (arquivo: string) => ({ params: Promise.resolve({ arquivo }) });
const get = (arquivo: string) =>
  baixar(new Request('https://nossom.test/baixar/' + arquivo), params(arquivo));

test('the site version matches the desktop package', () => {
  const pkg = JSON.parse(readFileSync('desktop/package.json', 'utf8'));
  assert.equal(DESKTOP_VERSION, pkg.version);
});

test('com token: lê o Release pela API e redireciona para o endereço assinado, sem baixar o arquivo', async () => {
  process.env.GITHUB_TOKEN = TOKEN + '\n';
  const calls = fakeGitHub({
    [NEW_RELEASE]: [asset('victorbarrosoc-hub/AbsoluteZRO', 77, 'NOSSOM-0.2.2-mac-arm64.dmg')],
    [OLD_RELEASE]: OLD_ASSETS,
  });
  const response = await get('mac-arm64');
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get('location'),
    'https://objects.githubusercontent.example/arquivo-77?assinado=1',
  );
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const download = calls.find((c) => c.url.endsWith('/releases/assets/77'));
  assert.ok(download, 'pede o arquivo à API de assets');
  const headers = new Headers(download.init?.headers);
  assert.equal(headers.get('accept'), 'application/octet-stream');
  assert.equal(headers.get('authorization'), 'Bearer ' + TOKEN, 'token sem a quebra de linha');
  assert.equal(
    download.init?.redirect,
    'manual',
    'não segue o 302: o arquivo não passa pela Vercel',
  );
  assert.ok(!calls.some((c) => c.url.includes('/victorbarrosoc-hub/nossom/')), 'não usa a reserva');
});

test('release ausente (ou sem o arquivo) cai na reserva desktop-v0.2.2', async () => {
  process.env.GITHUB_TOKEN = TOKEN;
  fakeGitHub({ [NEW_RELEASE]: 404, [OLD_RELEASE]: OLD_ASSETS });
  const windows = await get('windows');
  assert.equal(
    windows.headers.get('location'),
    'https://objects.githubusercontent.example/arquivo-3?assinado=1',
  );
  forgetReleases();
  // Release novo publicado só com o Windows: o Mac Intel continua na reserva.
  fakeGitHub({
    [NEW_RELEASE]: [asset('victorbarrosoc-hub/AbsoluteZRO', 90, 'NOSSOM-0.2.2-win-x64.exe')],
    [OLD_RELEASE]: OLD_ASSETS,
  });
  assert.equal(
    (await get('mac-x64')).headers.get('location'),
    'https://objects.githubusercontent.example/arquivo-2?assinado=1',
  );
  assert.equal(
    (await get('windows')).headers.get('location'),
    'https://objects.githubusercontent.example/arquivo-90?assinado=1',
  );
  forgetReleases();
  // Nenhuma fonte: volta para /apps com aviso, nunca para o github.com.
  fakeGitHub({});
  const none = await get('mac-arm64');
  assert.equal(none.status, 302);
  assert.equal(none.headers.get('location'), '/apps?baixar=indisponivel');
});

test('sem token e repositório público: link normal, conferido sem a API', async () => {
  delete process.env.GITHUB_TOKEN;
  const calls: Call[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    assert.equal(init?.method, 'HEAD');
    assert.equal(new Headers(init?.headers).get('authorization'), null);
    return new Response(null, { status: String(input).includes('/nossom/') ? 200 : 404 });
  }) as typeof fetch;
  const response = await get('mac-arm64');
  assert.equal(response.headers.get('location'), installerUrl(LEGACY_RELEASE, 'macArm64'));
  assert.ok(
    calls[0].url.startsWith(
      'https://github.com/victorbarrosoc-hub/AbsoluteZRO/releases/download/nossom-v0.2.2/',
    ),
  );
  // Repositório privado sem token: nada responde; o visitante volta para /apps com aviso.
  globalThis.fetch = (async () => new Response(null, { status: 404 })) as typeof fetch;
  assert.equal((await get('windows')).headers.get('location'), '/apps?baixar=indisponivel');
  globalThis.fetch = (async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch;
  assert.equal((await get('mac-x64')).headers.get('location'), '/apps?baixar=indisponivel');
});

test('a página /apps só aponta para as rotas deste site', async () => {
  process.env.GITHUB_TOKEN = TOKEN;
  fakeGitHub({ [NEW_RELEASE]: 404, [OLD_RELEASE]: OLD_ASSETS });
  const links = await desktopInstallers('0.2.2');
  assert.deepEqual(
    Object.values(links).map((l) => l.url),
    ['/baixar/mac-arm64', '/baixar/mac-x64', '/baixar/windows'],
  );
  forgetReleases();
  fakeGitHub({
    '/repos/victorbarrosoc-hub/AbsoluteZRO/releases/tags/nossom-v0.3.0': [
      asset('victorbarrosoc-hub/AbsoluteZRO', 5, 'NOSSOM-0.3.0-win-x64.exe'),
    ],
    [OLD_RELEASE]: OLD_ASSETS,
  });
  const mixed = await desktopInstallers('0.3.0');
  assert.equal(mixed.windows.version, '0.3.0');
  assert.equal(mixed.macArm64.version, '0.2.2');
  const page = readFileSync('app/apps/page.tsx', 'utf8');
  assert.doesNotMatch(page, /github\.com/);
});

test('diag explica o motivo sem mostrar o token', async () => {
  process.env.GITHUB_TOKEN = TOKEN;
  fakeGitHub({ [NEW_RELEASE]: 404, [OLD_RELEASE]: 404, [CHANNEL]: 404 });
  let response = await get('diag');
  let text = await response.text();
  assert.ok(!text.includes(TOKEN), 'o token nunca aparece');
  let body = JSON.parse(text);
  assert.equal(body.token, true);
  assert.equal(body.tipoToken, 'fino');
  assert.equal(body.entregando['mac-arm64'], null);
  assert.match(body.motivo, /sem acesso/);
  forgetReleases();
  fakeGitHub({ [NEW_RELEASE]: 401, [OLD_RELEASE]: 401, [CHANNEL]: 401 });
  body = await (await get('diag')).json();
  assert.match(body.motivo, /token recusado/);
  forgetReleases();
  fakeGitHub({ [NEW_RELEASE]: 404, [OLD_RELEASE]: OLD_ASSETS, [CHANNEL]: 404 });
  body = await (await get('diag')).json();
  assert.equal(body.motivo, null);
  assert.equal(body.entregando.windows, 'victorbarrosoc-hub/nossom (desktop-v0.2.2)');
  assert.equal(body.linkAssinado, true);
  assert.equal(body.fontes[1].instaladores['mac-x64'], true);
  // Sem token: diz que falta o token num repositório privado.
  delete process.env.GITHUB_TOKEN;
  forgetReleases();
  globalThis.fetch = (async () => new Response('{}', { status: 404 })) as typeof fetch;
  response = await get('diag');
  text = await response.text();
  body = JSON.parse(text);
  assert.equal(body.token, false);
  assert.match(body.motivo, /privado sem token/);
});

test('canal de atualização: só os arquivos do atualizador, pelo endereço assinado', async () => {
  process.env.GITHUB_TOKEN = TOKEN;
  fakeGitHub({ [CHANNEL]: [asset('victorbarrosoc-hub/AbsoluteZRO', 11, 'latest-mac.yml')] });
  const ask = (arquivo: string) =>
    atualizacao(new Request('https://nossom.test/baixar/atualizacoes/' + arquivo), params(arquivo));
  const manifest = await ask('latest-mac.yml');
  assert.equal(manifest.status, 302);
  assert.equal(
    manifest.headers.get('location'),
    'https://objects.githubusercontent.example/arquivo-11?assinado=1',
  );
  assert.equal((await ask('latest.yml')).status, 404);
  assert.equal((await ask('..%2Fsegredo')).status, 404);
  assert.equal((await ask('index.html')).status, 404);
});
