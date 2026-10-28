/**
 * Absolute ZRO FALSA para o teste do login: descoberta OIDC, /oauth/authorize
 * (devolve o código na hora, como app da família — sem tela de permissão),
 * /oauth/token (confere client_secret_basic, PKCE S256, redirect_uri e uso
 * único) e JWKS. Assina o id_token com uma chave EC P-256 de verdade, gerada
 * a cada teste. `proximo.adulterar` gera respostas ruins de propósito.
 *
 * Desde 26/out · 3 também: o refresh token (com rotação: reapresentar um já
 * trocado derruba a família, como o HUB), /oauth/revoke e as duas rotas do
 * Carro na API (job/1 e crew/1) exigindo Bearer com o escopo de jobs.
 * `semEscopoJobs` faz o authorize recusar o escopo (HUB antigo);
 * `recusaJob`/`recusaEquipe` devolvem o erro de domínio pedido.
 *
 * Desde 27/out · 4: a API da IA (/api/v1/ia/*) exigindo Bearer com `zro.ia`,
 * com /mensagens em NDJSON de verdade (a primeira linha sai antes do fim).
 * `semEscopoIa` faz o authorize recusar o escopo da Z; `pedidosIa` guarda o
 * que chegou (método, caminho, Authorization e corpo).
 *
 * Desde 28/out: O PORTÃO DO LANÇAMENTO, como o HUB de verdade o aplica para
 * um cliente de produto fechado. Cada pessoa tem `acesso` (allowed | closed |
 * released; sem o campo, allowed — a LIA das suítes é a conta do
 * proprietário), que vira a claim `zro_release` no id_token e no
 * /oauth/userinfo, e `zro_products` só lista o Carro para quem pode usá-lo.
 * Para `closed`: o authorize não emite código (access_denied), o refresh
 * devolve invalid_grant, o userinfo responde 401 e as APIs do Carro e da Z
 * respondem 403 product_closed. `contas` guarda a pessoa por `sub`: mudar
 * `acesso` ali é o acesso sendo removido depois do login. `hubAntigo` desliga
 * tudo isso (um HUB de antes do portão, que emite token para qualquer um — é
 * ele que prova a trava do lado do Carro); `semRelease` na pessoa tira a
 * claim; `semFiltro` deixa o Carro em zro_products mesmo fechado.
 */
const crypto = require('crypto');
const http = require('http');

async function iniciarZroFalsa(cliente) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = Object.assign(publicKey.export({ format: 'jwk' }), { kid: 'chave-teste', alg: 'ES256', use: 'sig' });
  const codigos = new Map();
  const refresh = new Map();
  const acessos = new Map();
  const estado = {
    proximo: { pessoa: null, negar: false, adulterar: null },
    trocas: 0,
    ultimoAuthorize: null,
    semEscopoJobs: false,
    recusaJob: null,
    recusaEquipe: null,
    jobs: new Map(),
    equipes: [],
    renovacoes: 0,
    revogados: 0,
    atTtl: 600,
    semEscopoIa: false,
    pedidosIa: [],
    contas: new Map(),
    hubAntigo: false,
    userinfos: 0,
    /* o HUB fora do ar: a conexão cai antes de qualquer resposta */
    fora: false,
  };
  /* o portão (28/out): o que o HUB diz desta conta sobre o Carro */
  const liberacao = p => (p && p.acesso) || 'allowed';
  const contaDe = p => (p && estado.contas.get(p.sub)) || p;
  const fechado = p => !estado.hubAntigo && liberacao(contaDe(p)) === 'closed';
  /* zro_products como o HUB com o portão entrega: o Carro só entra na lista de quem pode usá-lo */
  const produtosDe = p => {
    const lista = Array.isArray(p.produtos) ? p.produtos : ['carro-do-freela'];
    return liberacao(p) === 'closed' && !p.semFiltro ? lista.filter(x => x !== 'carro-do-freela') : lista;
  };
  const claimsDe = p => Object.assign(
    { zro_org: p.org ? { id: 'org-1', name: p.org, role: 'owner' } : null, zro_products: produtosDe(p) },
    p.semRelease ? {} : { zro_release: { 'carro-do-freela': liberacao(p) } },
  );
  const emitir = (pessoa, escopo) => {
    const at = 'at_' + crypto.randomBytes(12).toString('hex');
    acessos.set(at, { pessoa, escopo, exp: Date.now() + estado.atTtl * 1000 });
    const out = { access_token: at, token_type: 'Bearer', expires_in: estado.atTtl, scope: escopo };
    if (escopo.split(' ').includes('offline_access')) {
      out.refresh_token = 'zt_' + crypto.randomBytes(12).toString('hex');
      refresh.set(out.refresh_token, { pessoa, escopo, usado: false });
    }
    return out;
  };
  const lerJson = async req => {
    let t = '';
    for await (const c of req) t += c;
    return JSON.parse(t);
  };
  const portador = req => {
    const a = acessos.get(String(req.headers.authorization || '').replace(/^Bearer /, ''));
    return a && a.exp > Date.now() && a.escopo.split(' ').includes('carro-do-freela.jobs') ? a : null;
  };
  let base = '';

  const jwt = (dados, assinarErrado) => {
    const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const cab = b({ alg: 'ES256', typ: 'JWT', kid: jwk.kid }) + '.' + b(dados);
    const chave = assinarErrado ? crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey : privateKey;
    return cab + '.' + crypto.sign('sha256', Buffer.from(cab), { key: chave, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  };
  const responder = (res, status, corpo) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(corpo));
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, base);
    if (estado.fora) { req.socket.destroy(); return }
    if (url.pathname === '/.well-known/openid-configuration')
      return responder(res, 200, {
        issuer: base,
        authorization_endpoint: base + '/oauth/authorize',
        token_endpoint: base + '/oauth/token',
        jwks_uri: base + '/oauth/jwks',
        userinfo_endpoint: base + '/oauth/userinfo',
        revocation_endpoint: base + '/oauth/revoke',
      });
    if (url.pathname === '/oauth/jwks') return responder(res, 200, { keys: [jwk] });
    if (url.pathname === '/oauth/authorize') {
      const q = url.searchParams;
      estado.ultimoAuthorize = Object.fromEntries(q);
      const volta = new URL(q.get('redirect_uri'));
      volta.searchParams.set('state', q.get('state'));
      if (q.get('client_id') !== cliente.clientId || q.get('code_challenge_method') !== 'S256' || !q.get('nonce') || q.get('response_type') !== 'code') {
        volta.searchParams.set('error', 'invalid_request');
      } else if ((estado.semEscopoJobs && (q.get('scope') || '').includes('carro-do-freela.jobs')) || (estado.semEscopoIa && (q.get('scope') || '').split(' ').includes('zro.ia'))) {
        volta.searchParams.set('error', 'invalid_scope');
      } else if (estado.proximo.negar || !estado.proximo.pessoa) {
        volta.searchParams.set('error', 'access_denied');
      } else if (fechado(estado.proximo.pessoa)) {
        /* cliente de produto fechado, conta fora da lista: o HUB mostra "Em
           desenvolvimento" e não emite código (com prompt=none, access_denied) */
        volta.searchParams.set('error', 'access_denied');
      } else {
        estado.contas.set(estado.proximo.pessoa.sub, estado.proximo.pessoa);
        const code = 'zc_' + crypto.randomBytes(16).toString('hex');
        codigos.set(code, { desafio: q.get('code_challenge'), redirectUri: q.get('redirect_uri'), pessoa: estado.proximo.pessoa, nonce: q.get('nonce'), escopo: q.get('scope') || '', usado: false });
        volta.searchParams.set('code', code);
        volta.searchParams.set('iss', estado.proximo.adulterar === 'iss-param' ? 'https://outro.exemplo' : base);
      }
      res.writeHead(302, { location: volta.toString() });
      return res.end();
    }
    if (url.pathname === '/oauth/token' && req.method === 'POST') {
      let corpo = '';
      for await (const c of req) corpo += c;
      const f = new URLSearchParams(corpo);
      const basic = Buffer.from(String(req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString();
      if (basic !== cliente.clientId + ':' + cliente.clientSecret) return responder(res, 401, { error: 'invalid_client' });
      if (f.get('grant_type') === 'refresh_token') {
        const r = refresh.get(f.get('refresh_token') || '');
        if (!r) return responder(res, 400, { error: 'invalid_grant' });
        if (r.usado) {
          for (const x of refresh.values()) if (x.pessoa === r.pessoa) x.usado = true;
          return responder(res, 400, { error: 'invalid_grant' });
        }
        /* acesso removido depois do login: o refresh de um cliente fechado não renova */
        if (fechado(r.pessoa)) return responder(res, 400, { error: 'invalid_grant' });
        r.usado = true;
        estado.renovacoes++;
        return responder(res, 200, emitir(r.pessoa, r.escopo));
      }
      const c = codigos.get(f.get('code') || '');
      if (!c || c.usado) return responder(res, 400, { error: 'invalid_grant' });
      c.usado = true;
      const desafio = crypto.createHash('sha256').update(f.get('code_verifier') || '').digest('base64url');
      if (desafio !== c.desafio || f.get('redirect_uri') !== c.redirectUri || f.get('grant_type') !== 'authorization_code')
        return responder(res, 400, { error: 'invalid_grant' });
      estado.trocas++;
      const agora = Math.floor(Date.now() / 1000);
      const ad = estado.proximo.adulterar;
      const id = jwt(
        Object.assign(
          {
            iss: ad === 'emissor' ? 'https://outro.exemplo' : base,
            sub: c.pessoa.sub,
            aud: ad === 'aud' ? 'outro-app' : cliente.clientId,
            iat: agora,
            exp: ad === 'expirado' ? agora - 3600 : agora + 600,
            auth_time: agora,
            nonce: ad === 'nonce' ? 'nonce-errado' : c.nonce,
            email: c.pessoa.email,
            email_verified: true,
            name: c.pessoa.nome,
          },
          claimsDe(c.pessoa),
        ),
        ad === 'assinatura',
      );
      return responder(res, 200, Object.assign(emitir(c.pessoa, c.escopo), { id_token: id }));
    }
    /* quem é esta conta AGORA (é o que o Carro relê a cada pedido): 401 para
       token vencido e para conta fora da lista de um cliente fechado */
    if (url.pathname === '/oauth/userinfo') {
      const a = acessos.get(String(req.headers.authorization || '').replace(/^Bearer /, ''));
      if (!a || a.exp <= Date.now()) return responder(res, 401, { error: 'invalid_token' });
      estado.userinfos++;
      const p = contaDe(a.pessoa);
      if (fechado(p)) return responder(res, 401, { error: 'invalid_token' });
      return responder(res, 200, Object.assign({ sub: p.sub, email: p.email, email_verified: true, name: p.nome }, claimsDe(p)));
    }
    if (url.pathname === '/oauth/revoke' && req.method === 'POST') {
      let corpo = '';
      for await (const c of req) corpo += c;
      const r = refresh.get(new URLSearchParams(corpo).get('token') || '');
      if (r) for (const x of refresh.values()) if (x.pessoa === r.pessoa) x.usado = true;
      estado.revogados++;
      return responder(res, 200, {});
    }
    if (url.pathname === '/api/v1/carro-do-freela/jobs' && req.method === 'POST') {
      if (!portador(req)) return responder(res, 401, { error: 'unauthenticated' });
      if (fechado(portador(req).pessoa)) return responder(res, 403, { error: 'product_closed' });
      if (estado.recusaJob) return responder(res, 403, { error: estado.recusaJob });
      const job = await lerJson(req);
      if (job.contract !== 'carro-do-freela.job/1') return responder(res, 422, { error: 'invalid_input' });
      const ja = estado.jobs.get(job.job_id);
      if (ja) return responder(res, 200, { projectId: ja.projectId, created: false });
      const projectId = crypto.randomUUID();
      estado.jobs.set(job.job_id, { projectId, job });
      return responder(res, 201, { projectId, created: true });
    }
    if (url.pathname === '/api/v1/carro-do-freela/jobs/crew' && req.method === 'POST') {
      if (!portador(req)) return responder(res, 401, { error: 'unauthenticated' });
      if (fechado(portador(req).pessoa)) return responder(res, 403, { error: 'product_closed' });
      if (estado.recusaEquipe) return responder(res, 403, { error: estado.recusaEquipe });
      const eq = await lerJson(req);
      const j = estado.jobs.get(eq.job_id);
      if (!j) return responder(res, 404, { error: 'not_found' });
      estado.equipes.push(eq);
      return responder(res, 200, {
        projectId: j.projectId,
        members: eq.members.map((m, i) => ({ zro_user_id: m.zro_user_id, function: m.function, status: i === 0 ? 'na_equipe' : 'convidado' })),
        emailDelivery: true,
      });
    }
    if (url.pathname.startsWith('/api/v1/ia/')) {
      let corpo = '';
      for await (const c of req) corpo += c;
      const caminho = url.pathname.slice('/api/v1/ia/'.length);
      estado.pedidosIa.push({ metodo: req.method, caminho, autorizacao: req.headers.authorization || null, corpo });
      const a = acessos.get(String(req.headers.authorization || '').replace(/^Bearer /, ''));
      if (!a || a.exp <= Date.now() || !a.escopo.split(' ').includes('zro.ia')) return responder(res, 401, { error: 'unauthenticated' });
      if (fechado(a.pessoa)) return responder(res, 403, { error: 'product_closed' });
      if (req.method === 'GET' && caminho === 'estado') return responder(res, 200, { ligada: true, nome: a.pessoa.nome.split(' ')[0], produto: 'carro-do-freela', creditos: { usados: 1, limite: 100, renova_em: '2026-11-01T00:00:00.000Z' } });
      if (req.method === 'GET' && caminho === 'conversas') return responder(res, 200, { conversas: [] });
      if (req.method === 'DELETE' && caminho.startsWith('conversas/')) { res.writeHead(204); return res.end() }
      if (req.method === 'POST' && caminho === 'mensagens') {
        res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8' });
        res.write(JSON.stringify({ tipo: 'conversa', id: 'c1', titulo: 'Teste' }) + '\n');
        await new Promise(ok => setTimeout(ok, 80));
        res.write(JSON.stringify({ tipo: 'texto', t: 'Olá.' }) + '\n');
        return res.end(JSON.stringify({ tipo: 'fim', mensagem: 'm1', creditos: 1 }) + '\n');
      }
      return responder(res, 404, { error: 'not_found' });
    }
    responder(res, 404, { error: 'not_found' });
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  base = 'http://127.0.0.1:' + server.address().port;
  return { url: base, estado, fechar: () => new Promise(ok => server.close(() => ok())) };
}

module.exports = { iniciarZroFalsa };
