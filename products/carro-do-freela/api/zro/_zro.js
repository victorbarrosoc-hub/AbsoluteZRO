/**
 * "CONTINUAR COM ABSOLUTE ZRO" (25/out) — o Carro do Freela como app da
 * família no login único do HUB (ADR 0012 com o adendo dos apps da família).
 *
 * Quatro funções em api/zro/ (entrar, callback, eu, sair) e este miolo, só
 * com o que vem no Node: nada de pacote, porque o Carro não tem
 * node_modules de propósito e a Vercel publica a pasta como ela é.
 *
 * O fluxo é OpenID Connect com código + PKCE S256, cliente confidencial
 * (`client_secret_basic` na troca), e o id_token só vale depois de conferido
 * pela chave pública do HUB (ES256, JWKS): emissor, público, validade e
 * nonce. Nada que volta do navegador é aceito sem passar por aqui.
 *
 * ⚠️ OS COOKIES SÃO ASSINADOS, NÃO CIFRADOS. O de ida (state + nonce +
 * verificador + volta) vive 10 minutos só em /api/zro; o de sessão (sub,
 * nome, e-mail, organização) vive 30 dias. Os dois são httpOnly, Secure e
 * SameSite=Lax, e a chave do HMAC sai do ZRO_CLIENT_SECRET por HKDF — uma
 * chave por cookie, para um nunca valer no lugar do outro.
 *
 * Variáveis (na Vercel, nunca no fonte): ZRO_CLIENT_ID, ZRO_CLIENT_SECRET e
 * ZRO_ISSUER (opcional; o padrão é o HUB de produção).
 *
 * CONTA ÚNICA (25/out · 2, regra do titular): toda conta nova nasce no HUB.
 * `entrar?criar=1` pede `prompt=create`, e o HUB leva a pessoa a /criar-conta
 * e volta com ela já dentro. O DIREITO DE USO vem do admin da Absolute ZRO:
 * o id_token traz `zro_products` (produtos liberados para a organização
 * ativa) e o Carro guarda a lista na sessão, relida a cada novo login. Sem
 * "carro-do-freela" na lista a pessoa entra, mas o /eu diz `liberado:false`
 * e a tela fica no aviso curto, com a porta para a Absolute ZRO.
 *
 * JOB → PROJETO (26/out · 3): o login também pede `offline_access` e
 * `carro-do-freela.jobs`, e o refresh token fica num cookie httpOnly
 * CIFRADO (AES-256-GCM, chave própria por HKDF), só em /api/zro. É com ele
 * que POST /api/zro/enviar leva o job (carro-do-freela.job/1) e a equipe
 * escalada (carro-do-freela.crew/1) para a organização no HUB, em nome da
 * pessoa: o HUB confere papel e plano no banco. O token nunca vai ao
 * navegador. Se o HUB ainda não conhece o escopo (invalid_scope), o login
 * refaz o pedido sem ele e tudo segue como antes, só sem o envio.
 *
 * A Z, A IA DO ECOSSISTEMA (27/out · 4): o login pede também `zro.ia`, e
 * GET/POST/DELETE /api/zro/ia/<caminho> repassa o painel <zro-ia> para
 * https://absolutezro.com/api/v1/ia/<caminho> com o MESMO acesso do cookie
 * `cdf_hub` (um token só, e o refresh roda igual ao do envio). Só os
 * caminhos do painel passam; a resposta das mensagens (NDJSON) vai pedaço a
 * pedaço, sem buffer. Sem o escopo, sem o cookie ou com o acesso recusado:
 * 401 `reconectar`, que o painel transforma em "Reconectar com Absolute ZRO".
 *
 * ⚠️ O PORTÃO DO LANÇAMENTO (28/out, adendo do PRD: acesso exclusivo do
 * proprietário). Até a autorização de lançamento o Carro é FECHADO: só entra
 * a conta que o HUB lista por `user_id` (claim `zro_release` =
 * { "carro-do-freela": "allowed" } — hoje, só a do proprietário; outros
 * admins, testers e assinantes ficam de fora). Nunca por e-mail, nunca por
 * papel, nunca por lista escrita aqui. Duas travas, e as duas têm de abrir:
 *   1. a claim é RELIDA no HUB a cada pedido (/oauth/userinfo com o token
 *      guardado em `cdf_hub`, renovando como o Synquei faz) — o cookie de
 *      30 dias não decide nada, e a sessão que o HUB recusa é descartada;
 *   2. CARRO_RELEASE deste deploy: sem a variável, ou com qualquer valor
 *      que não seja exatamente "released", é `closed`, e fechado vale até
 *      com o HUB fora do ar. "released" no HUB só abre se aqui também for.
 * Fechado: o callback não abre sessão (volta ?zro=fechado), /eu responde
 * 401/403 e apaga os cookies, /enviar e /ia respondem 403 `fechado`.
 */
const crypto = require('crypto');

const EMISSOR_PADRAO = 'https://absolutezro.com';
const ESCOPOS_BASE = 'openid email profile org';
const ESCOPO_JOBS = 'carro-do-freela.jobs';
const ESCOPO_IA = 'zro.ia';
const ESCOPOS = ESCOPOS_BASE + ' offline_access ' + ESCOPO_JOBS + ' ' + ESCOPO_IA;
/* o pedido sem os escopos novos (HUB que ainda não os conhece): o refresh
   fica, porque é com ele que a claim é relida depois */
const ESCOPOS_BASICO = ESCOPOS_BASE + ' offline_access';
const COOKIE_IDA = 'cdf_zro';
const COOKIE_SESSAO = 'cdf_sessao';
const COOKIE_HUB = 'cdf_hub';
const IDA_S = 10 * 60;
const SESSAO_S = 30 * 24 * 60 * 60;
/** o id deste app em zro_products e em zro_release */
const PRODUTO = 'carro-do-freela';

/* ---------------- o portão do lançamento (28/out) ---------------- */
/** o estado deste deploy: `released` só com CARRO_RELEASE=released; qualquer outra coisa é `closed` */
function release(env = process.env) {
  return env.CARRO_RELEASE === 'released' ? 'released' : 'closed';
}
/** o que o HUB diz desta conta sobre o Carro: released | closed | allowed (sem a claim = closed) */
function liberacaoDe(claims) {
  const r = claims && claims.zro_release && typeof claims.zro_release === 'object' ? claims.zro_release[PRODUTO] : null;
  return r === 'released' || r === 'allowed' ? r : 'closed';
}
/** a conta pode usar o Carro agora? `allowed` sempre; `released` só com este deploy também released */
function acessoOk(quem) {
  return !!quem && (quem.release === 'allowed' || (quem.release === 'released' && release() === 'released'));
}

/* ⚠️ SÓ ESTES ENDEREÇOS, e são os mesmos retornos cadastrados no HUB para o
   cliente `carrodofreela-web`. Um Host que não está aqui não recebe login —
   é o que impede um domínio qualquer apontado para a Vercel de montar um
   redirect_uri em nome do Carro. Localhost fica para rodar na máquina. */
const ORIGENS = ['https://carrodofreela.com.br', 'https://www.carrodofreela.com.br', 'https://carrodofreela-app.vercel.app'];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

function config(env = process.env) {
  const clientId = String(env.ZRO_CLIENT_ID || '').trim();
  const clientSecret = String(env.ZRO_CLIENT_SECRET || '').trim();
  const issuer = (String(env.ZRO_ISSUER || '').trim() || EMISSOR_PADRAO).replace(/\/+$/, '');
  return { clientId, clientSecret, issuer, ligado: !!(clientId && clientSecret) };
}

/* ---------------- endereço de quem pediu ---------------- */
function origemDe(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
  if (!host) return null;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase() || (req.socket && req.socket.encrypted ? 'https' : 'http');
  const o = proto + '://' + host;
  return ORIGENS.includes(o) || LOCAL.test(o) ? o : null;
}
const seguro = origem => !LOCAL.test(origem);

/** volta só para dentro do próprio site: caminho que começa com UMA barra */
function voltaSegura(v) {
  if (typeof v !== 'string' || !v || v.length > 512) return '/';
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return '/';
  if (/[\u0000-\u001f\u007f\\]/.test(v)) return '/';
  try {
    const u = new URL(v, 'https://carro.invalido');
    if (u.origin !== 'https://carro.invalido') return '/';
    return u.pathname + u.search + u.hash;
  } catch (e) {
    return '/';
  }
}
/** acrescenta ?zro=… à volta, preservando o resto */
function comMarca(volta, valor) {
  const u = new URL(volta, 'https://carro.invalido');
  u.searchParams.set('zro', valor);
  return u.pathname + u.search + u.hash;
}

/* ---------------- cookies assinados ---------------- */
function chave(segredo, uso) {
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(segredo, 'utf8'), Buffer.from('carro-do-freela', 'utf8'), Buffer.from('cookie:' + uso, 'utf8'), 32));
}
function selar(dados, segredo, uso) {
  const corpo = Buffer.from(JSON.stringify(dados), 'utf8').toString('base64url');
  const mac = crypto.createHmac('sha256', chave(segredo, uso)).update(corpo).digest('base64url');
  return corpo + '.' + mac;
}
function abrir(valor, segredo, uso, agora = Date.now()) {
  if (typeof valor !== 'string' || valor.length > 4096) return null;
  const [corpo, mac, sobra] = valor.split('.');
  if (!corpo || !mac || sobra !== undefined) return null;
  const esperado = crypto.createHmac('sha256', chave(segredo, uso)).update(corpo).digest();
  let dado;
  try {
    dado = Buffer.from(mac, 'base64url');
  } catch (e) {
    return null;
  }
  if (dado.length !== esperado.length || !crypto.timingSafeEqual(dado, esperado)) return null;
  let d;
  try {
    d = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'));
  } catch (e) {
    return null;
  }
  if (!d || typeof d !== 'object' || typeof d.exp !== 'number' || d.exp * 1000 < agora) return null;
  return d;
}
/* o cookie do HUB guarda TOKEN: assinar não basta, ele vai cifrado */
function cifrar(dados, segredo) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave(segredo, 'cifra:hub'), iv);
  const corpo = Buffer.concat([c.update(JSON.stringify(dados), 'utf8'), c.final()]);
  return [iv, corpo, c.getAuthTag()].map(b => b.toString('base64url')).join('.');
}
function decifrar(valor, segredo, agora = Date.now()) {
  if (typeof valor !== 'string' || valor.length > 4096) return null;
  const partes = valor.split('.');
  if (partes.length !== 3) return null;
  try {
    const [iv, corpo, tag] = partes.map(x => Buffer.from(x, 'base64url'));
    if (iv.length !== 12 || tag.length !== 16) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', chave(segredo, 'cifra:hub'), iv);
    d.setAuthTag(tag);
    const dados = JSON.parse(Buffer.concat([d.update(corpo), d.final()]).toString('utf8'));
    if (!dados || typeof dados.exp !== 'number' || dados.exp * 1000 < agora) return null;
    return dados;
  } catch (e) {
    return null;
  }
}
function lerCookie(req, nome) {
  const linha = String(req.headers.cookie || '');
  for (const parte of linha.split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return undefined;
}
function cookie(nome, valor, o) {
  return [
    nome + '=' + encodeURIComponent(valor),
    'Path=' + o.path,
    'Max-Age=' + o.maxAge,
    'HttpOnly',
    'SameSite=Lax',
  ]
    .concat(o.seguro ? ['Secure'] : [])
    .join('; ');
}
/** os dois cookies da sessão, apagados: a sessão é descartada por inteiro */
function apagarCookies(origem) {
  const s = origem ? seguro(origem) : true;
  return [cookie(COOKIE_SESSAO, '', { path: '/', maxAge: 0, seguro: s }), cookie(COOKIE_HUB, '', { path: '/api/zro', maxAge: 0, seguro: s })];
}

/* ---------------- respostas ---------------- */
function json(res, status, corpo, extra = {}) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extra));
  res.end(JSON.stringify(corpo));
}
function ir(res, status, destino, cookies = []) {
  const h = { Location: destino, 'Cache-Control': 'no-store' };
  if (cookies.length) h['Set-Cookie'] = cookies;
  res.writeHead(status, h);
  res.end();
}
function texto(res, status, msg) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(msg);
}

/* ---------------- o HUB: descoberta, chaves, troca ---------------- */
let cache = { descoberta: null, chaves: null };
const CACHE_MS = 10 * 60 * 1000;

async function buscarJson(url, init) {
  let r;
  try {
    r = await fetch(url, Object.assign({ cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) }, init || {}));
  } catch (e) {
    throw new Error('rede: ' + url);
  }
  let corpo = null;
  try {
    corpo = await r.json();
  } catch (e) {}
  return { status: r.status, corpo };
}

async function descobrir(cfg) {
  const c = cache.descoberta;
  if (c && c.issuer === cfg.issuer && c.expira > Date.now()) return c.valor;
  const { status, corpo } = await buscarJson(cfg.issuer + '/.well-known/openid-configuration');
  /* o documento tem de ser do MESMO emissor configurado */
  if (status !== 200 || !corpo || corpo.issuer !== cfg.issuer || !corpo.authorization_endpoint || !corpo.token_endpoint || !corpo.jwks_uri)
    throw new Error('descoberta');
  cache.descoberta = { issuer: cfg.issuer, valor: corpo, expira: Date.now() + CACHE_MS };
  return corpo;
}

async function chavePublica(cfg, kid) {
  const achar = () => (cache.chaves && cache.chaves.issuer === cfg.issuer ? cache.chaves.lista.find(k => k.kid === kid) : null) || null;
  if (cache.chaves && cache.chaves.expira > Date.now() && achar()) return achar();
  /* chave desconhecida: busca de novo (o HUB pode ter trocado de chave) */
  const d = await descobrir(cfg);
  const { status, corpo } = await buscarJson(d.jwks_uri);
  if (status !== 200 || !corpo || !Array.isArray(corpo.keys)) throw new Error('jwks');
  cache.chaves = { issuer: cfg.issuer, lista: corpo.keys, expira: Date.now() + CACHE_MS };
  return achar();
}

/** confere o id_token e devolve quem é. Recusa qualquer coisa fora do lugar. */
async function conferirIdToken(cfg, idToken, nonce, agora = Date.now()) {
  const partes = String(idToken).split('.');
  if (partes.length !== 3) throw new Error('formato');
  let cab, dados;
  try {
    cab = JSON.parse(Buffer.from(partes[0], 'base64url').toString('utf8'));
    dados = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
  } catch (e) {
    throw new Error('json');
  }
  if (cab.alg !== 'ES256' || typeof cab.kid !== 'string') throw new Error('algoritmo');
  const jwk = await chavePublica(cfg, cab.kid);
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256') throw new Error('chave desconhecida');
  const ok = crypto.verify(
    'sha256',
    Buffer.from(partes[0] + '.' + partes[1]),
    { key: crypto.createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' },
    Buffer.from(partes[2], 'base64url'),
  );
  if (!ok) throw new Error('assinatura');
  const s = Math.floor(agora / 1000);
  if (dados.iss !== cfg.issuer) throw new Error('emissor');
  const aud = Array.isArray(dados.aud) ? dados.aud : [dados.aud];
  if (!aud.includes(cfg.clientId)) throw new Error('público');
  if (aud.length > 1 && dados.azp !== cfg.clientId) throw new Error('azp');
  if (typeof dados.exp !== 'number' || dados.exp < s - 60) throw new Error('expirado');
  if (typeof dados.iat === 'number' && dados.iat > s + 300) throw new Error('data futura');
  if (typeof nonce !== 'string' || !nonce || dados.nonce !== nonce) throw new Error('nonce');
  if (typeof dados.sub !== 'string' || !dados.sub || typeof dados.email !== 'string') throw new Error('sem sub ou e-mail');
  return contaDeClaims(dados);
}

/** a conta como o HUB a descreve (id_token ou /oauth/userinfo): quem é, o que pode, e o que diz do Carro */
function contaDeClaims(dados) {
  const org = dados.zro_org && typeof dados.zro_org === 'object' ? dados.zro_org : null;
  /* sem a lista (escopo org não concedido, formato estranho) = nada liberado */
  const produtos = Array.isArray(dados.zro_products)
    ? dados.zro_products.filter(p => typeof p === 'string' && p.length <= 64).slice(0, 32)
    : [];
  return {
    sub: dados.sub.slice(0, 200),
    email: dados.email.trim().toLowerCase().slice(0, 254),
    emailVerificado: dados.email_verified === true,
    nome: typeof dados.name === 'string' && dados.name.trim() ? dados.name.trim().slice(0, 120) : null,
    organizacao: org && typeof org.name === 'string' ? org.name.slice(0, 120) : null,
    produtos,
    /* o portão: released | closed | allowed — sem a claim, closed */
    release: liberacaoDe(dados),
  };
}

const basicDe = cfg => 'Basic ' + Buffer.from(encodeURIComponent(cfg.clientId) + ':' + encodeURIComponent(cfg.clientSecret)).toString('base64');
async function pedirToken(cfg, form) {
  const d = await descobrir(cfg);
  return buscarJson(d.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicDe(cfg), Accept: 'application/json' },
    body: new URLSearchParams(form).toString(),
  });
}
/** o que vai no cookie do HUB: o access token (é com ele que a claim é RELIDA a cada pedido, 28/out), o
 *  refresh token quando o HUB deu offline_access, e para que o acesso serve: `jobs` e `ia` (cookie de antes
 *  da Z não tem `ia`: reconectar). Sem access token não há sessão que se confira: null. */
function acessoHub(corpo, sub) {
  if (!corpo || typeof corpo.access_token !== 'string') return null;
  const escopos = String(corpo.scope || '').split(' ');
  const agora = Math.floor(Date.now() / 1000);
  return {
    sub,
    rt: typeof corpo.refresh_token === 'string' ? corpo.refresh_token : null,
    at: corpo.access_token,
    atExp: agora + Math.min(Number(corpo.expires_in) || 0, 3600),
    exp: agora + SESSAO_S,
    jobs: escopos.includes(ESCOPO_JOBS),
    ia: escopos.includes(ESCOPO_IA),
  };
}

async function trocarCodigo(cfg, code, verificador, nonce, retorno) {
  const { status, corpo } = await pedirToken(cfg, { grant_type: 'authorization_code', code, code_verifier: verificador, redirect_uri: retorno });
  if (status !== 200 || !corpo || typeof corpo.id_token !== 'string') throw new Error('recusado: ' + ((corpo && corpo.error) || status));
  const quem = await conferirIdToken(cfg, corpo.id_token, nonce);
  return { quem, hub: acessoHub(corpo, quem.sub) };
}

const novoValor = () => crypto.randomBytes(32).toString('base64url');
function iguais(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* ---------------- as quatro rotas ---------------- */

/** GET /api/zro/entrar?volta=/caminho — o HUB abre o app por aqui */
async function entrar(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return texto(res, 405, 'Método não aceito.');
  const cfg = config();
  const origem = origemDe(req);
  if (!origem) return texto(res, 400, 'Este endereço não está cadastrado para entrar com a Absolute ZRO.');
  const url = new URL(req.url, origem);
  const volta = voltaSegura(url.searchParams.get('volta'));
  /* "Criar conta" no Carro = criar a conta Absolute ZRO, lá no HUB */
  const criar = url.searchParams.get('criar') === '1';
  /* o HUB recusou o escopo de jobs (ainda não o conhece): entra sem ele */
  const basico = url.searchParams.get('basico') === '1';
  if (!cfg.ligado) return ir(res, 303, comMarca(volta, 'indisponivel'));
  const state = novoValor(), nonce = novoValor(), verificador = novoValor();
  const desafio = crypto.createHash('sha256').update(verificador).digest('base64url');
  let d;
  try {
    d = await descobrir(cfg);
  } catch (e) {
    return ir(res, 303, comMarca(volta, 'erro'));
  }
  const u = new URL(d.authorization_endpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', cfg.clientId);
  u.searchParams.set('redirect_uri', origem + '/api/zro/callback');
  u.searchParams.set('scope', basico ? ESCOPOS_BASICO : ESCOPOS);
  u.searchParams.set('state', state);
  u.searchParams.set('nonce', nonce);
  u.searchParams.set('code_challenge', desafio);
  u.searchParams.set('code_challenge_method', 'S256');
  if (criar) u.searchParams.set('prompt', 'create');
  const exp = Math.floor(Date.now() / 1000) + IDA_S;
  const ida = selar({ state, nonce, verificador, volta, origem, basico, criar, exp }, cfg.clientSecret, COOKIE_IDA);
  return ir(res, 302, u.toString(), [cookie(COOKIE_IDA, ida, { path: '/api/zro', maxAge: IDA_S, seguro: seguro(origem) })]);
}

/** GET /api/zro/callback?code=…&state=… — confere tudo e abre a sessão */
async function callback(req, res) {
  if (req.method !== 'GET') return texto(res, 405, 'Método não aceito.');
  const cfg = config();
  const origem = origemDe(req);
  if (!origem) return texto(res, 400, 'Este endereço não está cadastrado para entrar com a Absolute ZRO.');
  const limpar = cookie(COOKIE_IDA, '', { path: '/api/zro', maxAge: 0, seguro: seguro(origem) });
  if (!cfg.ligado) return ir(res, 303, '/?zro=indisponivel', [limpar]);
  const url = new URL(req.url, origem);
  const ida = abrir(lerCookie(req, COOKIE_IDA), cfg.clientSecret, COOKIE_IDA);
  if (!ida) return ir(res, 303, '/?zro=expirou', [limpar]);
  const volta = voltaSegura(ida.volta);
  const falhar = codigo => ir(res, 303, comMarca(volta, codigo), [limpar]);
  if (ida.origem !== origem) return falhar('erro');
  if (!iguais(url.searchParams.get('state') || '', ida.state)) return falhar('expirou');
  /* RFC 9207: quando a resposta diz quem a emitiu, tem de ser o HUB */
  const iss = url.searchParams.get('iss');
  if (iss !== null && iss !== cfg.issuer) return falhar('erro');
  const erro = url.searchParams.get('error');
  if (erro === 'invalid_scope' && !ida.basico)
    return ir(res, 303, '/api/zro/entrar?basico=1&volta=' + encodeURIComponent(volta) + (ida.criar ? '&criar=1' : ''), [limpar]);
  if (erro) return falhar(erro === 'access_denied' ? 'recusado' : 'erro');
  const code = url.searchParams.get('code');
  if (!code) return falhar('erro');
  let quem, hub;
  try {
    ({ quem, hub } = await trocarCodigo(cfg, code, ida.verificador, ida.nonce, origem + '/api/zro/callback'));
  } catch (e) {
    return falhar('erro');
  }
  /* sem o access token não há como RELER a claim depois: sessão que não se confere não nasce */
  if (!hub) return falhar('erro');
  /* ⚠️ O PORTÃO (28/out): sem "allowed" (ou "released" dos dois lados) a
     sessão NÃO nasce — nenhum cookie fica, e a volta diz "Em desenvolvimento".
     O HUB normalmente nem emite o código para quem está de fora; esta é a
     trava DESTE lado, para token de HUB antigo ou de outro estado não abrir
     nada. */
  if (!acessoOk(quem)) return ir(res, 303, comMarca(volta, 'fechado'), [limpar].concat(apagarCookies(origem)));
  const exp = Math.floor(Date.now() / 1000) + SESSAO_S;
  const sessao = selar({ sub: quem.sub, nome: quem.nome, email: quem.email, org: quem.organizacao, produtos: quem.produtos, exp }, cfg.clientSecret, COOKIE_SESSAO);
  const cookieHub = cookie(COOKIE_HUB, cifrar(hub, cfg.clientSecret), { path: '/api/zro', maxAge: SESSAO_S, seguro: seguro(origem) });
  return ir(res, 303, comMarca(volta, 'entrou'), [limpar, cookie(COOKIE_SESSAO, sessao, { path: '/', maxAge: SESSAO_S, seguro: seguro(origem) }), cookieHub]);
}

/** GET /api/zro/eu — quem está na sessão SEGUNDO O HUB AGORA, ou 401/403 (e `release`, o estado deste deploy) */
async function eu(req, res) {
  if (req.method !== 'GET') return json(res, 405, { erro: 'metodo' }, { Allow: 'GET' });
  const cfg = config();
  const estado = release();
  if (!cfg.ligado) return json(res, 503, { erro: 'desligado', release: estado });
  const origem = origemDe(req);
  const apagar = { 'Set-Cookie': apagarCookies(origem) };
  const s = abrir(lerCookie(req, COOKIE_SESSAO), cfg.clientSecret, COOKIE_SESSAO);
  if (!s || typeof s.sub !== 'string') return json(res, 401, { erro: 'sem_sessao', release: estado });
  /* ⚠️ O COOKIE DE 30 DIAS NÃO DECIDE NADA (28/out): a claim é RELIDA no HUB
     a cada pedido, com o token guardado. Sessão de antes disso (sem o token)
     não tem como ser conferida e não vale; sessão que o HUB recusa (acesso
     removido, token revogado) é descartada aqui mesmo. */
  const h = decifrar(lerCookie(req, COOKIE_HUB), cfg.clientSecret);
  if (!h || h.sub !== s.sub) return json(res, 401, { erro: 'sem_sessao', release: estado }, apagar);
  const c = await lerConta(cfg, h);
  if (c.recusado) return json(res, 401, { erro: 'sem_sessao', release: estado }, apagar);
  /* HUB fora do ar: nada se confere, nada abre — e a sessão fica para quando ele voltar */
  if (!c.quem) return json(res, 503, { erro: 'hub', release: estado });
  if (!acessoOk(c.quem)) return json(res, 403, { erro: 'fechado', release: estado }, apagar);
  const acesso = c.novo || h;
  const extra = c.novo && origem ? { 'Set-Cookie': [cookie(COOKIE_HUB, cifrar(c.novo, cfg.clientSecret), { path: '/api/zro', maxAge: SESSAO_S, seguro: seguro(origem) })] } : {};
  return json(res, 200, {
    sub: c.quem.sub,
    nome: c.quem.nome || null,
    email: c.quem.email || null,
    organizacao: c.quem.organizacao || null,
    produtos: c.quem.produtos,
    liberado: c.quem.produtos.includes(PRODUTO),
    /* dá para levar job e equipe ao HUB a partir daqui (cookie de antes do envio: ainda vale) */
    hub: acesso.jobs !== false,
    /* a Z (IA da Absolute ZRO) tem acesso: sem isso o painel pede para reconectar */
    ia: acesso.ia === true,
    release: estado,
  }, extra);
}

/** POST /api/zro/sair — apaga a sessão deste site (não a do HUB) */
async function sair(req, res) {
  if (req.method !== 'POST') return json(res, 405, { erro: 'metodo' }, { Allow: 'POST' });
  const origem = origemDe(req);
  if (!origem) return json(res, 400, { erro: 'origem' });
  /* pedido de outro site não derruba a sessão de ninguém */
  const de = req.headers.origin;
  if (de && de !== origem) return json(res, 403, { erro: 'origem' });
  /* o refresh token do HUB morre junto: revoga lá (sem esperar resposta boa) e apaga aqui */
  const cfg = config();
  const h = cfg.ligado ? decifrar(lerCookie(req, COOKIE_HUB), cfg.clientSecret) : null;
  if (h && typeof h.rt === 'string' && h.rt)
    try {
      const d = await descobrir(cfg);
      if (d.revocation_endpoint)
        await buscarJson(d.revocation_endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicDe(cfg) },
          body: new URLSearchParams({ token: h.rt, token_type_hint: 'refresh_token' }).toString(),
        });
    } catch (e) {}
  res.writeHead(204, {
    'Cache-Control': 'no-store',
    'Set-Cookie': [
      cookie(COOKIE_SESSAO, '', { path: '/', maxAge: 0, seguro: seguro(origem) }),
      cookie(COOKIE_HUB, '', { path: '/api/zro', maxAge: 0, seguro: seguro(origem) }),
    ],
  });
  res.end();
}

/* ---------------- job e equipe → projeto no HUB ---------------- */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const corte = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);

/** monta o carro-do-freela.job/1 só com o que o contrato aceita; o resto do pedido é ignorado */
function montarJob(j) {
  if (!j || typeof j !== 'object') return null;
  const job_id = corte(j.id, 200), title = corte(j.titulo, 160);
  if (!job_id || !/^[A-Za-z0-9._:-]+$/.test(job_id) || !title) return null;
  const datas = (Array.isArray(j.datas) ? j.datas : [])
    .filter(d => d && DATA.test(d.data))
    .slice(0, 60)
    .map(d => Object.assign({ date: d.data }, corte(d.rotulo, 120) ? { label: corte(d.rotulo, 120) } : {}));
  const funcoes = (Array.isArray(j.funcoes) ? j.funcoes : [])
    .filter(f => f && corte(f.funcao, 80) && Number.isInteger(f.quantas) && f.quantas > 0 && f.quantas <= 200)
    .slice(0, 40)
    .map(f => ({ role: corte(f.funcao, 80), count: f.quantas }));
  const refs = (Array.isArray(j.referencias) ? j.referencias : []).filter(u => typeof u === 'string' && /^https:\/\/[^\s]{3,1990}$/.test(u)).slice(0, 20);
  const job = { contract: 'carro-do-freela.job/1', job_id, title, dates: datas, crew_roles: funcoes, references: refs };
  for (const [k, de, n] of [['production_type', 'tipo', 60], ['client_reference', 'cliente', 200], ['briefing', 'briefing', 20000], ['city', 'cidade', 120]])
    if (corte(j[de], n)) job[k] = corte(j[de], n);
  return job;
}
/** a equipe que tem conta na Absolute ZRO; quem não tem fica de fora (sem conta, não há convite possível) */
function montarEquipe(jobId, lista) {
  const membros = (Array.isArray(lista) ? lista : [])
    .filter(m => m && UUID.test(m.conta) && typeof m.email === 'string' && /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(m.email) && corte(m.funcao, 80))
    .slice(0, 200)
    .map(m => ({ zro_user_id: m.conta.toLowerCase(), email: m.email.trim().toLowerCase(), function: corte(m.funcao, 80), project_role: m.papel === 'editor' ? 'editor' : 'viewer' }));
  return membros.length ? { contract: 'carro-do-freela.crew/1', job_id: jobId, members: membros } : null;
}

async function lerCorpo(req, max) {
  let n = 0;
  const partes = [];
  for await (const c of req) {
    n += c.length;
    if (n > max) throw new Error('grande');
    partes.push(c);
  }
  return JSON.parse(Buffer.concat(partes).toString('utf8'));
}

/** access token do HUB: o guardado, se ainda vale; senão troca o refresh (que roda: o novo substitui o velho) */
async function tokenDoHub(cfg, h) {
  const agora = Math.floor(Date.now() / 1000);
  if (h.at && h.atExp - 60 > agora) return { at: h.at, novo: null };
  /* sem refresh token (login sem offline_access) o acesso acaba com o token: entra de novo */
  if (typeof h.rt !== 'string' || !h.rt) return { at: null, novo: null, recusado: true };
  const { status, corpo } = await pedirToken(cfg, { grant_type: 'refresh_token', refresh_token: h.rt });
  if (status !== 200 || !corpo) return { at: null, novo: null, recusado: status === 400 || status === 401 };
  const novo = acessoHub(corpo, h.sub);
  if (novo) {
    if (!novo.rt) novo.rt = h.rt;
    /* resposta sem `scope`: o acesso continua servindo para o que servia */
    if (corpo.scope === undefined) { novo.jobs = h.jobs; novo.ia = h.ia }
  }
  return { at: novo ? novo.at : null, novo, recusado: !novo };
}

/** /oauth/userinfo com o token: quem é esta conta e o que ela pode, segundo o HUB agora */
async function lerUserinfo(cfg, at) {
  const d = await descobrir(cfg);
  return buscarJson(d.userinfo_endpoint || cfg.issuer + '/oauth/userinfo', { headers: { Authorization: 'Bearer ' + at, Accept: 'application/json' } });
}

/**
 * A CLAIM RELIDA (28/out): quem está na sessão segundo o HUB AGORA — nunca
 * segundo o cookie de 30 dias. Usa o access token guardado enquanto vale;
 * vencido ou recusado, troca o refresh token (que RODA) uma vez só. Devolve
 * { quem, at, novo } (`novo` é o acesso para o cookie, quando a troca rodou),
 * { recusado } (o HUB não aceita mais esta sessão: acesso removido, token
 * revogado, outra pessoa) ou { fora } (rede, HUB fora do ar — temporário, e
 * fechado enquanto durar: ninguém entra sem a claim relida).
 */
async function lerConta(cfg, h) {
  let t;
  try { t = await tokenDoHub(cfg, h) } catch (e) { return { fora: true } }
  if (!t.at) return t.recusado ? { recusado: true } : { fora: true };
  let r;
  try { r = await lerUserinfo(cfg, t.at) } catch (e) { return { fora: true, novo: t.novo } }
  if (r.status === 401 && !t.novo) {
    /* o token guardado parecia valer e o HUB não aceitou: uma troca, uma só */
    try { t = await tokenDoHub(cfg, Object.assign({}, h, { at: null })) } catch (e) { return { fora: true } }
    if (!t.at) return t.recusado ? { recusado: true } : { fora: true };
    try { r = await lerUserinfo(cfg, t.at) } catch (e) { return { fora: true, novo: t.novo } }
  }
  if (r.status === 401 || r.status === 403) return { recusado: true, novo: t.novo };
  if (r.status !== 200 || !r.corpo || typeof r.corpo.sub !== 'string' || typeof r.corpo.email !== 'string') return { fora: true, novo: t.novo };
  if (r.corpo.sub !== h.sub) return { recusado: true, novo: t.novo };
  return { quem: contaDeClaims(r.corpo), at: t.at, novo: t.novo };
}

async function postarNoHub(cfg, at, caminho, corpo) {
  return buscarJson(cfg.issuer + caminho, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + at, Accept: 'application/json' },
    body: JSON.stringify(corpo),
  });
}

/**
 * POST /api/zro/enviar — { job, equipe } do navegador vira projeto no HUB.
 * Só da própria origem, com sessão liberada e o cookie do HUB da MESMA conta.
 * Responde { projeto: { id, link, criado }, equipe } ou um erro curto:
 * reconectar (falta o acesso ou ele caiu), papel/plano (o HUB recusou), hub.
 */
async function enviar(req, res) {
  if (req.method !== 'POST') return json(res, 405, { erro: 'metodo' }, { Allow: 'POST' });
  const cfg = config();
  if (!cfg.ligado) return json(res, 503, { erro: 'desligado' });
  const origem = origemDe(req);
  if (!origem || req.headers.origin !== origem) return json(res, 403, { erro: 'origem' });
  if (!/^application\/json\b/.test(String(req.headers['content-type'] || ''))) return json(res, 415, { erro: 'formato' });
  const s = abrir(lerCookie(req, COOKIE_SESSAO), cfg.clientSecret, COOKIE_SESSAO);
  if (!s || typeof s.sub !== 'string') return json(res, 401, { erro: 'sem_sessao' });
  const h = decifrar(lerCookie(req, COOKIE_HUB), cfg.clientSecret);
  const apagar = { 'Set-Cookie': apagarCookies(origem) };
  if (!h || h.sub !== s.sub) return json(res, 401, { erro: 'reconectar' }, apagar);
  /* ⚠️ A CLAIM RELIDA (28/out): o direito de uso vem do HUB agora, nunca do
     cookie. Sessão recusada ou fechada é descartada; HUB fora do ar não abre. */
  const c = await lerConta(cfg, h);
  if (c.recusado) return json(res, 401, { erro: 'reconectar' }, apagar);
  if (!c.quem) return json(res, 502, { erro: 'hub' });
  if (!acessoOk(c.quem)) return json(res, 403, { erro: 'fechado' }, apagar);
  /* a partir daqui o refresh pode ter rodado: o cookie novo vai em TODA resposta */
  const extra = c.novo ? { 'Set-Cookie': [cookie(COOKIE_HUB, cifrar(c.novo, cfg.clientSecret), { path: '/api/zro', maxAge: SESSAO_S, seguro: seguro(origem) })] } : {};
  if (!c.quem.produtos.includes(PRODUTO)) return json(res, 403, { erro: 'plano' }, extra);
  if ((c.novo || h).jobs === false) return json(res, 401, { erro: 'reconectar' }, extra);
  let pedido;
  try {
    pedido = await lerCorpo(req, 64 * 1024);
  } catch (e) {
    return json(res, 400, { erro: 'pedido' }, extra);
  }
  const job = montarJob(pedido && pedido.job);
  if (!job) return json(res, 400, { erro: 'pedido' }, extra);
  const equipe = montarEquipe(job.job_id, pedido.equipe);
  const recusa = r => {
    const cd = String((r.corpo && r.corpo.error) || '');
    if (r.status === 401) return 'reconectar';
    if (cd === 'product_closed') return 'fechado';
    if (/^(entitlement_required|feature_not_included|product_unavailable)$/.test(cd)) return 'plano';
    return { forbidden_role: 'papel', email_not_verified: 'email', no_active_organization: 'organizacao' }[cd] || 'hub';
  };

  const rj = await postarNoHub(cfg, c.at, '/api/v1/carro-do-freela/jobs', job);
  if ((rj.status !== 200 && rj.status !== 201) || !rj.corpo || !UUID.test(String(rj.corpo.projectId)))
    return json(res, [401, 403, 409].includes(rj.status) ? rj.status : 502, { erro: recusa(rj) }, extra);
  const id = rj.corpo.projectId;
  const saida = { projeto: { id, link: cfg.issuer + '/projetos/' + id, criado: rj.status === 201 }, equipe: null };
  if (equipe) {
    const re = await postarNoHub(cfg, c.at, '/api/v1/carro-do-freela/jobs/crew', equipe);
    saida.equipe =
      re.status === 200 && re.corpo && Array.isArray(re.corpo.members)
        ? {
            membros: re.corpo.members.map(m => ({ conta: m.zro_user_id, funcao: m.function, estado: m.status })),
            emailEnviado: re.corpo.emailDelivery === true,
          }
        : { erro: recusa(re) };
  }
  return json(res, 200, saida, extra);
}

/* ---------------- a Z, a IA da Absolute ZRO (27/out · 4) ---------------- */

const ID_CONVERSA = /^[A-Za-z0-9_-]{1,80}$/;
/** o caminho do painel que pode passar com este método; qualquer outro é 404 */
function caminhoIa(bruto, metodo) {
  const partes = String(bruto || '').split('/');
  const [a, b] = partes;
  if (partes.length > 2) return null;
  if (partes.length === 1 && a === 'estado' && metodo === 'GET') return 'estado';
  if (partes.length === 1 && a === 'conversas' && metodo === 'GET') return 'conversas';
  if (partes.length === 2 && a === 'conversas' && ID_CONVERSA.test(b) && (metodo === 'GET' || metodo === 'DELETE')) return 'conversas/' + b;
  if (partes.length === 1 && a === 'mensagens' && metodo === 'POST') return 'mensagens';
  return null;
}
/** o caminho vem de /api/zro/ia/<caminho> (a rota manda para esta função com ?caminho=, e qualquer um dos dois serve) */
function caminhoDoPedido(req) {
  const u = new URL(req.url, 'http://local');
  const q = u.searchParams.get('caminho');
  if (q !== null) return q;
  const m = /^\/api\/zro\/ia\/(.+)$/.exec(u.pathname);
  return m ? m[1] : '';
}

/**
 * GET/POST/DELETE /api/zro/ia/<caminho> — o painel <zro-ia> fala com a API
 * da IA do HUB pelo servidor do Carro, que acrescenta o Bearer da sessão.
 */
async function ia(req, res) {
  const caminho = caminhoIa(caminhoDoPedido(req), req.method);
  if (!caminho) return json(res, 404, { erro: 'nao_encontrado' });
  const cfg = config();
  if (!cfg.ligado) return json(res, 503, { erro: 'desligado' });
  const origem = origemDe(req);
  if (!origem) return json(res, 403, { erro: 'origem' });
  /* GET de outro site não lê nada (sem CORS); o que muda exige a própria origem */
  if (req.method !== 'GET' && req.headers.origin !== origem) return json(res, 403, { erro: 'origem' });
  const s = abrir(lerCookie(req, COOKIE_SESSAO), cfg.clientSecret, COOKIE_SESSAO);
  if (!s || typeof s.sub !== 'string') return json(res, 401, { erro: 'sem_sessao' });
  const h = decifrar(lerCookie(req, COOKIE_HUB), cfg.clientSecret);
  const apagar = { 'Set-Cookie': apagarCookies(origem) };
  if (!h || h.sub !== s.sub) return json(res, 401, { erro: 'reconectar' }, apagar);
  /* ⚠️ A CLAIM RELIDA (28/out), como no /enviar: fechado é 403 e a sessão vai embora */
  const c = await lerConta(cfg, h);
  if (c.recusado) return json(res, 401, { erro: 'reconectar' }, apagar);
  if (!c.quem) return json(res, 502, { erro: 'hub' });
  if (!acessoOk(c.quem)) return json(res, 403, { erro: 'fechado' }, apagar);
  /* o refresh rodou: o cookie novo vai nesta resposta, seja ela qual for */
  const novo = c.novo ? [cookie(COOKIE_HUB, cifrar(c.novo, cfg.clientSecret), { path: '/api/zro', maxAge: SESSAO_S, seguro: seguro(origem) })] : null;
  const extra = novo ? { 'Set-Cookie': novo } : {};
  if (!c.quem.produtos.includes(PRODUTO)) return json(res, 403, { erro: 'plano' }, extra);
  if ((c.novo || h).ia !== true) return json(res, 401, { erro: 'reconectar' }, extra);
  let corpo;
  if (req.method === 'POST') {
    if (!/^application\/json\b/.test(String(req.headers['content-type'] || ''))) return json(res, 415, { erro: 'formato' }, extra);
    try {
      corpo = JSON.stringify(await lerCorpo(req, 64 * 1024));
    } catch (e) {
      return json(res, 400, { erro: 'pedido' }, extra);
    }
  }
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ac.abort() });
  let r;
  try {
    r = await fetch(cfg.issuer + '/api/v1/ia/' + caminho, {
      method: req.method,
      headers: Object.assign({ Authorization: 'Bearer ' + c.at, Accept: 'application/json, application/x-ndjson' }, corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      body: corpo,
      cache: 'no-store',
      redirect: 'error',
      signal: ac.signal,
    });
  } catch (e) {
    return json(res, 502, { erro: 'hub' }, extra);
  }
  /* o HUB recusou o token (acesso removido, escopo faltando): pede para entrar de novo */
  if (r.status === 401) {
    try { await r.body.cancel() } catch (e) {}
    return json(res, 401, { erro: 'reconectar' }, apagar);
  }
  /* o HUB fechou o produto para esta conta (403 product_closed): a sessão daqui vai junto */
  if (r.status === 403) {
    let erro = null;
    try { erro = (await r.json()).error } catch (e) {}
    if (erro === 'product_closed') return json(res, 403, { erro: 'fechado' }, apagar);
    return json(res, 403, { erro: erro || 'hub' }, extra);
  }
  const h2 = { 'Content-Type': r.headers.get('content-type') || 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' };
  if (novo) h2['Set-Cookie'] = novo;
  res.writeHead(r.status, h2);
  if (!r.body) return res.end();
  try {
    for await (const pedaco of r.body) res.write(pedaco);
  } catch (e) {
    return res.destroy();
  }
  res.end();
}

/* ---------------- a sessão das rotas de dados (perfil e inventário, 28/out) ---------------- */

/**
 * Quem está pedindo, CONFERIDO NO HUB AGORA — a mesma régua do /eu e do
 * /enviar: cookie de sessão + `cdf_hub` da MESMA conta, claim relida, portão
 * do lançamento (fechado: só a conta `allowed`) e o Carro no plano. Devolve
 * { quem, at, extra, origem } ou { status, corpo, headers } para responder.
 * ⚠️ É por isso que as rotas de dados moram em /api/zro/: o `cdf_hub` só vai
 * para esse caminho (Path=/api/zro), e sem ele não há claim relida.
 */
async function sessaoConferida(req) {
  const cfg = config();
  if (!cfg.ligado) return { status: 503, corpo: { erro: 'desligado' } };
  const origem = origemDe(req);
  if (!origem) return { status: 400, corpo: { erro: 'origem' } };
  const s = abrir(lerCookie(req, COOKIE_SESSAO), cfg.clientSecret, COOKIE_SESSAO);
  if (!s || typeof s.sub !== 'string') return { status: 401, corpo: { erro: 'sem_sessao' } };
  const apagar = { 'Set-Cookie': apagarCookies(origem) };
  const h = decifrar(lerCookie(req, COOKIE_HUB), cfg.clientSecret);
  if (!h || h.sub !== s.sub) return { status: 401, corpo: { erro: 'reconectar' }, headers: apagar };
  const c = await lerConta(cfg, h);
  if (c.recusado) return { status: 401, corpo: { erro: 'reconectar' }, headers: apagar };
  if (!c.quem) return { status: 503, corpo: { erro: 'hub' } };
  if (!acessoOk(c.quem)) return { status: 403, corpo: { erro: 'fechado' }, headers: apagar };
  const extra = c.novo ? { 'Set-Cookie': [cookie(COOKIE_HUB, cifrar(c.novo, cfg.clientSecret), { path: '/api/zro', maxAge: SESSAO_S, seguro: seguro(origem) })] } : {};
  if (!c.quem.produtos.includes(PRODUTO)) return { status: 403, corpo: { erro: 'plano' }, headers: extra };
  return { quem: c.quem, at: c.at, extra, origem };
}

/* cada função responde 500 curto em vez de derrubar o processo */
const protegido = fn => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (!res.headersSent) texto(res, 500, 'Não deu para entrar agora. Tente de novo.');
    else res.end();
  }
};

module.exports = {
  entrar: protegido(entrar),
  callback: protegido(callback),
  eu: protegido(eu),
  sair: protegido(sair),
  enviar: protegido(enviar),
  ia: protegido(ia),
  /* para as rotas de dados (api/zro/_dados.js) */
  sessaoConferida,
  lerCorpo,
  origemDe,
  /* para os testes */
  _interno: { caminhoIa, abrir, selar, cifrar, decifrar, montarJob, montarEquipe, COOKIE_HUB, voltaSegura, origemDe, conferirIdToken, contaDeClaims, lerConta, release, liberacaoDe, acessoOk, config, esquecer: () => (cache = { descoberta: null, chaves: null }), COOKIE_IDA, COOKIE_SESSAO, ORIGENS, PRODUTO },
};
