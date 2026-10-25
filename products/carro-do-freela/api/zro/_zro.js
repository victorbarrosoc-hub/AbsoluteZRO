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
 */
const crypto = require('crypto');

const EMISSOR_PADRAO = 'https://absolutezro.vercel.app';
const ESCOPOS = 'openid email profile org';
const COOKIE_IDA = 'cdf_zro';
const COOKIE_SESSAO = 'cdf_sessao';
const IDA_S = 10 * 60;
const SESSAO_S = 30 * 24 * 60 * 60;
/** o id deste app em zro_products */
const PRODUTO = 'carro-do-freela';

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
  };
}

async function trocarCodigo(cfg, code, verificador, nonce, retorno) {
  const d = await descobrir(cfg);
  const basic = Buffer.from(encodeURIComponent(cfg.clientId) + ':' + encodeURIComponent(cfg.clientSecret)).toString('base64');
  const { status, corpo } = await buscarJson(d.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + basic, Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verificador, redirect_uri: retorno }).toString(),
  });
  if (status !== 200 || !corpo || typeof corpo.id_token !== 'string') throw new Error('recusado: ' + ((corpo && corpo.error) || status));
  return conferirIdToken(cfg, corpo.id_token, nonce);
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
  u.searchParams.set('scope', ESCOPOS);
  u.searchParams.set('state', state);
  u.searchParams.set('nonce', nonce);
  u.searchParams.set('code_challenge', desafio);
  u.searchParams.set('code_challenge_method', 'S256');
  if (criar) u.searchParams.set('prompt', 'create');
  const exp = Math.floor(Date.now() / 1000) + IDA_S;
  const ida = selar({ state, nonce, verificador, volta, origem, exp }, cfg.clientSecret, COOKIE_IDA);
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
  if (erro) return falhar(erro === 'access_denied' ? 'recusado' : 'erro');
  const code = url.searchParams.get('code');
  if (!code) return falhar('erro');
  let quem;
  try {
    quem = await trocarCodigo(cfg, code, ida.verificador, ida.nonce, origem + '/api/zro/callback');
  } catch (e) {
    return falhar('erro');
  }
  const exp = Math.floor(Date.now() / 1000) + SESSAO_S;
  const sessao = selar({ sub: quem.sub, nome: quem.nome, email: quem.email, org: quem.organizacao, produtos: quem.produtos, exp }, cfg.clientSecret, COOKIE_SESSAO);
  return ir(res, 303, comMarca(volta, 'entrou'), [limpar, cookie(COOKIE_SESSAO, sessao, { path: '/', maxAge: SESSAO_S, seguro: seguro(origem) })]);
}

/** GET /api/zro/eu — quem está na sessão, ou 401 */
function eu(req, res) {
  if (req.method !== 'GET') return json(res, 405, { erro: 'metodo' }, { Allow: 'GET' });
  const cfg = config();
  if (!cfg.ligado) return json(res, 503, { erro: 'desligado' });
  const s = abrir(lerCookie(req, COOKIE_SESSAO), cfg.clientSecret, COOKIE_SESSAO);
  if (!s || typeof s.sub !== 'string') return json(res, 401, { erro: 'sem_sessao' });
  /* sessão de antes da lista de produtos: entra de novo pelo HUB, que é
     onde o direito de uso é lido — nunca "liberado" nem "bloqueado" no chute */
  if (!Array.isArray(s.produtos)) return json(res, 401, { erro: 'sem_sessao' });
  const produtos = s.produtos.filter(p => typeof p === 'string');
  return json(res, 200, {
    sub: s.sub,
    nome: s.nome || null,
    email: s.email || null,
    organizacao: s.org || null,
    produtos,
    liberado: produtos.includes(PRODUTO),
  });
}

/** POST /api/zro/sair — apaga a sessão deste site (não a do HUB) */
function sair(req, res) {
  if (req.method !== 'POST') return json(res, 405, { erro: 'metodo' }, { Allow: 'POST' });
  const origem = origemDe(req);
  if (!origem) return json(res, 400, { erro: 'origem' });
  /* pedido de outro site não derruba a sessão de ninguém */
  const de = req.headers.origin;
  if (de && de !== origem) return json(res, 403, { erro: 'origem' });
  res.writeHead(204, { 'Cache-Control': 'no-store', 'Set-Cookie': [cookie(COOKIE_SESSAO, '', { path: '/', maxAge: 0, seguro: seguro(origem) })] });
  res.end();
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
  /* para os testes */
  _interno: { abrir, selar, voltaSegura, origemDe, conferirIdToken, config, esquecer: () => (cache = { descoberta: null, chaves: null }), COOKIE_IDA, COOKIE_SESSAO, ORIGENS, PRODUTO },
};
