/* O MODO DEMONSTRAÇÃO (02/nov, pedido do titular: "um modo demonstração pra simular como se tivesse uns 100 usuários
   usando a plataforma… qualquer pessoa com o link vê como funciona"). Mora em carro.absolutezro.com/demo.
   É o SITE REAL (as mesmas telas do domínio) com um servidor de mentira NO NAVEGADOR: este arquivo carrega antes do app
   (build.js o põe no <head> de demo.html) e troca o fetch das rotas /api/zro/*. Nada sai do aparelho e nada é salvo:
   ao recarregar, tudo volta ao começo. Cerca de 100 perfis INVENTADOS (nome e sobrenome sorteados, sem rosto: as
   iniciais), agendas, feed, brechó, propostas e uma guilda com o quadro de missões. Um selo fixo diz que é demonstração.
   ⚠️ Nenhum nome daqui pode coincidir com a base fictícia antiga (crew.json): o vercel-build confere.
   ⚠️ Só o que o site real tem: nada de preço de plano, take nem garantia. Desde 03/11 a tabela de diária e o selo de
   verificado existem no site real (servidor), e a demonstração responde /api/zro/tabela e /api/zro/selo com a MESMA
   conta do banco (pesos de selo_de, 85% e 6 jobs); as tabelas e os selos das pessoas daqui são inventados como elas. */
(function () {
  'use strict';
  /* ⚠️ A MEMÓRIA DA DEMONSTRAÇÃO É SÓ DELA. A demo mora no MESMO endereço do site real (carro.absolutezro.com/demo), e o
     app guarda o estado no localStorage: sem isto, mexer na demo apagaria ou trocaria o que o Carro de verdade guardou
     neste aparelho. Aqui o localStorage e o sessionStorage viram memória que some ao fechar a aba. */
  var memoria = function () {
    var m = {};
    return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null }, setItem: function (k, v) { m[k] = String(v) },
      removeItem: function (k) { delete m[k] }, clear: function () { m = {} }, key: function (i) { return Object.keys(m)[i] || null },
      get length() { return Object.keys(m).length } };
  };
  try { Object.defineProperty(window, 'localStorage', { value: memoria(), configurable: true }) } catch (e) {}
  try { Object.defineProperty(window, 'sessionStorage', { value: memoria(), configurable: true }) } catch (e) {}
  /* (02/nov · 3) /demo?novo=1 é a conta que acabou de chegar: sem perfil, ela passa pela entrada em perguntas */
  var NOVO = /[?&]novo=1\b/.test(location.search);
  /* a conta da demonstração já passou pela porta (não zera o perfil nem pede cadastro) */
  if (!NOVO) try { window.localStorage.setItem('cdf-entrou', '1') } catch (e) {}
  var seed = 20261102;
  var rnd = function () { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
  var um = function (a) { return a[Math.floor(rnd() * a.length)] };
  var pad = function (n) { return String(n).padStart(2, '0') };
  var hoje = new Date(); hoje.setHours(12, 0, 0, 0);
  var dia = function (n) { var d = new Date(hoje.getTime() + n * 864e5); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) };
  var quando = function (h) { return new Date(Date.now() - h * 36e5).toISOString() };
  var uuid = function (p, n) { return p + '-0000-4000-8000-' + String(n).padStart(12, '0') };

  var NOMES = ['Aline', 'Bento', 'Cecília', 'Dante', 'Elisa', 'Flávio', 'Giovana', 'Henrique', 'Íris', 'Joaquim', 'Kátia', 'Lauro',
    'Mirela', 'Nicolau', 'Olívia', 'Pietro', 'Quitéria', 'Raul', 'Sílvia', 'Tobias', 'Úrsula', 'Valter', 'Wanda', 'Yago', 'Zélia',
    'Akira', 'Benício', 'Celina', 'Dalva', 'Edgar', 'Fabiana', 'Gael', 'Hilda', 'Ivo', 'Jade', 'Kauê', 'Lívia', 'Moacir', 'Noêmia', 'Orlando'];
  var SOBRE = ['Arruda', 'Bandeira', 'Cavalcanti', 'Diniz', 'Esteves', 'Fontes', 'Guedes', 'Holanda', 'Inácio', 'Jucá', 'Leite',
    'Maranhão', 'Nogueira', 'Oiticica', 'Pinheiro', 'Quintas', 'Rêgo', 'Saldanha', 'Torres', 'Uchoa', 'Varela', 'Xavier', 'Zenaide',
    'Barreto', 'Câmara', 'Dutra', 'Fagundes', 'Gurgel', 'Medeiros', 'Rosado'];
  var FUNCOES = ['Op. de câmera', 'Op. de gimbal', 'Editor', 'Op. de drone', 'Fotógrafo', 'Direção', 'Assistente', 'Editor realtime',
    'Storymaker', 'Motion / VFX', 'Direção de fotografia', 'Colorista', 'Produtor', 'Op. de live', 'Designer', 'Gaffer', 'DIT', 'Op. de FPV'];
  var CIDADES = ['Natal/RN', 'Natal/RN', 'Natal/RN', 'Parnamirim/RN', 'São Gonçalo do Amarante/RN', 'Mossoró/RN', 'Macaíba/RN'];
  var NICHOS = ['Publicidade', 'Casamento', 'Clipe', 'Documentário', 'Festa e evento', 'Conteúdo para redes', 'Corporativo', 'Show / DVD'];
  var BIOS = ['Set de publicidade e clipe desde 2016.', 'Casamento aos sábados, publicidade no resto da semana.', 'Drone com licença e seguro.',
    'Cor e finalização, DaVinci.', 'Documentário e cinema de baixo orçamento.', 'Live multicâmera para eventos e igrejas.', null, null];

  var EU_ID = uuid('eeeeeeee', 1);
  var vistos = {};
  var pessoas = [];
  for (var i = 0; pessoas.length < 100; i++) {
    var nome = um(NOMES) + ' ' + um(SOBRE);
    if (vistos[nome]) continue;
    vistos[nome] = 1;
    var n = pessoas.length;
    var f1 = FUNCOES[(n * 7) % FUNCOES.length], f2 = um(FUNCOES);
    var agenda = {};
    for (var d = 0; d < 42; d++) {
      var r = rnd();
      if (r < 0.22) agenda[dia(d)] = { e: 'fechado', p: 'dia' };
      else if (r < 0.3) agenda[dia(d)] = { e: 'negociando', p: 'dia' };
      else if (r < 0.36) agenda[dia(d)] = { e: 'fechado', p: rnd() < 0.5 ? 'manha' : 'tarde' };
    }
    /* (03/11) a tabela inventada de parte das pessoas (de 50 em 50 reais), o "topo viajar" e o selo de algumas */
    var fs = f1 === f2 ? [f1] : [f1, f2], tab = null;
    if (rnd() < 0.55) tab = { linhas: fs.map(function (f) { var b = (8 + Math.floor(rnd() * 14)) * 5000;
        return { funcao: f, so_eu_cents: b, com_equip_cents: rnd() < 0.6 ? b + (4 + Math.floor(rnd() * 8)) * 5000 : null } }),
      meia_pct: rnd() < 0.7 ? 60 : null, fds_pct: rnd() < 0.5 ? 20 : null, hora_extra_cents: rnd() < 0.7 ? 8000 : null, deslocamento_cents: rnd() < 0.6 ? 15000 : null };
    pessoas.push({ id: uuid('dddddddd', n + 1), arroba: nome.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(' ', '.'),
      nome: nome, foto: null, cidade: um(CIDADES), funcoes: fs, nichos: [um(NICHOS)], bio: um(BIOS),
      portfolio: null, agenda: agenda, agenda_atualizada_em: quando(rnd() * 72),
      viaja: rnd() < 0.45, tabela: tab, verificado: !!tab && rnd() < 0.3 });
  }
  var P = function (k) { return pessoas[k % pessoas.length] };

  /* a conta da demonstração */
  var euAgenda = {};
  euAgenda[dia(2)] = { e: 'fechado', p: 'dia' }; euAgenda[dia(5)] = { e: 'negociando', p: 'dia' }; euAgenda[dia(9)] = { e: 'fechado', p: 'manha' };
  var perfil = { nome: 'Você (demonstração)', cidade: 'Natal', uf: 'RN', funcoes: ['Op. de câmera', 'Editor'], nichos: ['Publicidade', 'Clipe'],
    bio: 'Conta de demonstração: mexa à vontade, nada é salvo.', portfolio: null, visibilidade: 'contratantes', arroba: 'voce.demo', atualizado_em: quando(2) };
  if (NOVO) perfil = null;
  /* a tabela de diária da conta: nasce vazia (quem preenche é a pessoa) */
  var tabela = null;
  var inventario = [
    { id: uuid('11111111', 1), categoria: 'camera', marca: 'Sony', modelo: 'FX3', quantidade: 1, observacao: null, diaria_cents: null, ativo: true, atualizado_em: quando(30) },
    { id: uuid('11111111', 2), categoria: 'lente', marca: 'Sigma', modelo: '24-70 f/2.8 Art', quantidade: 1, observacao: null, diaria_cents: null, ativo: true, atualizado_em: quando(30) },
    { id: uuid('11111111', 3), categoria: 'estabilizador', marca: 'DJI', modelo: 'RS 4 Pro', quantidade: 1, observacao: null, diaria_cents: null, ativo: true, atualizado_em: quando(30) }];

  /* propostas: chegam de gente da base */
  var propostas = [];
  var proposta = function (k, de, para, deNome, f, d, ini, fim, local, msg, estado, h) {
    propostas.push({ id: uuid('pppppppp', k), recebida: para === EU_ID, de: de, para: para, de_nome: deNome, tipo: 'job', anuncio: null, dia: dia(d),
      ini: ini, fim: fim, funcao: f, local: local, mensagem: msg, valor_cents: null, estado: estado, motivo: null, criado_em: quando(h) });
  };
  proposta(1, P(3).id, EU_ID, P(3).nome, 'Op. de câmera', 3, '07:00', '17:00', 'Ponta Negra', 'Comercial de praia, duas câmeras. Topa?', 'pendente', 1);
  proposta(2, P(11).id, EU_ID, P(11).nome, 'Editor', 6, '09:00', '18:00', 'Home office', 'Edição de um clipe de 3 min.', 'pendente', 5);
  proposta(3, P(27).id, EU_ID, P(27).nome, 'Op. de câmera', 12, '14:00', '23:00', 'Pipa', 'Casamento na praia, segunda câmera.', 'pendente', 20);
  proposta(4, P(40).id, EU_ID, P(40).nome, 'Op. de câmera', -4, '08:00', '18:00', 'Redinha', null, 'aceita', 120);
  proposta(5, EU_ID, P(8).id, 'Você (demonstração)', 'Op. de drone', 6, '06:00', '10:00', 'Forte dos Reis Magos', 'Nascer do sol, voo de 2h.', 'pendente', 3);
  proposta(6, P(19).id, EU_ID, P(19).nome, 'Op. de câmera', 8, '14:00', '23:00', 'Pipa', 'Casamento em Pipa, segunda câmera.', 'aceita', 30);
  proposta(7, P(33).id, EU_ID, P(33).nome, 'Editor', 16, '08:00', '18:00', 'Redinha', 'Show na Redinha — corte do aftermovie.', 'aceita', 52);
  proposta(8, P(52).id, EU_ID, P(52).nome, 'Op. de câmera', -11, '07:00', '17:00', 'Genipabu', 'Institucional nas dunas.', 'aceita', 300);
  /* o job aconteceu? (0009): cada lado responde depois do dia; só o confirmado pelos dois conta no selo. Os dois jobs
     feitos de sempre (4 e 8) estão confirmados; o 10 espera a SUA resposta (quem chamou já disse que sim), o 11 espera
     quem chamou, e o 12 é um job que VOCÊ contratou, esperando a sua resposta de contratante */
  proposta(10, P(23).id, EU_ID, P(23).nome, 'Op. de câmera', -2, '09:00', '19:00', 'Cidade Alta', 'Clipe no Centro Histórico.', 'aceita', 90);
  proposta(11, P(47).id, EU_ID, P(47).nome, 'Editor', -7, '09:00', '18:00', 'Home office', 'Corte do institucional da escola.', 'aceita', 200);
  proposta(12, EU_ID, P(14).id, 'Você (demonstração)', 'Op. de drone', -5, '06:00', '10:00', 'Via Costeira', 'Imagens aéreas da Via Costeira.', 'aceita', 160);
  var confirmacoes = {};
  [[4, true, true], [8, true, true], [10, true, null], [11, null, true], [12, null, true]].forEach(function (x) { confirmacoes[uuid('pppppppp', x[0])] = { de: x[1], para: x[2] } });
  var comConf = function (x) {
    if (x.tipo !== 'job' || x.estado !== 'aceita' || !x.dia) return x;
    var c = confirmacoes[x.id] || { de: null, para: null }, eu = x.para === EU_ID ? 'para' : 'de', aberta = x.dia < dia(0);
    var minha = c[eu] === undefined ? null : c[eu], outra = c[eu === 'para' ? 'de' : 'para']; outra = outra === undefined ? null : outra;
    return Object.assign({}, x, { confirmacao: { aberta: aberta, minha: minha, outra: outra, pendente: aberta && minha === null, confirmado: minha === true && outra === true } });
  };
  if (NOVO) propostas = [];

  /* o feed do set */
  var TEXTOS = {
    entrega: ['Entregue o clipe da banda de forró, cor fechada ontem.', 'Mais um casamento entregue, 14 min de filme.', 'Campanha de verão no ar. Obrigado, equipe!'],
    bastidor: ['Set começou às 5h na Redinha, o sol ajudou.', 'Testando a nova lente anamórfica no estúdio.', 'Chuva no meio da diária, salvos pelo galpão.'],
    procura: ['Procuro gaffer para sábado, Natal, diária cheia.', 'Alguém com drone livre dia 15? Evento em Mossoró.', 'Preciso de editor para reels, 10 vídeos por mês.'],
    nota: ['Alguém indica locação de luz em Parnamirim?', 'Workshop de cor no sábado, quem vai?', 'Dica: a ponte Newton Navarro rende muito no fim da tarde.'] };
  var feed = [];
  for (var k = 0; k < 36; k++) {
    var tipo = um(['entrega', 'bastidor', 'procura', 'nota', 'entrega']);
    var a = P(k * 3 + 1);
    feed.push({ id: uuid('ffffffff', k + 1), autor: { sub: a.id, nome: a.nome }, eu: false, tipo: tipo, texto: um(TEXTOS[tipo]), criado_em: quando(k * 3 + rnd() * 2) });
  }

  /* o brechó */
  var ANUNCIOS = [['Sony A7 III, só corpo', 'camera', 'Usado, bom estado', 780000], ['Lente Canon 50mm 1.8', 'lente', 'Seminovo', 45000],
    ['Mavic Air 2 Fly More', 'drone', 'Usado, bom estado', 420000], ['Kit 3 LEDs Godox SL60', 'luz', 'Seminovo', 210000],
    ['Gimbal Ronin SC', 'estabilizador', 'Usado, marcas de uso', 120000], ['Microfone Rode Wireless GO II', 'audio', 'Novo na caixa', 180000],
    ['Monitor Feelworld 7"', 'monitor', 'Usado, bom estado', 90000], ['Tripé Manfrotto com cabeça fluida', 'acessorio', 'Usado, bom estado', 75000],
    ['Blackmagic Pocket 4K', 'camera', 'Usado, bom estado', 690000], ['Sigma 18-35 1.8 (EF)', 'lente', 'Seminovo', 260000],
    ['Aputure 300d II', 'luz', 'Usado, bom estado', 350000], ['Zoom H5', 'audio', 'Usado, bom estado', 95000]];
  var brecho = ANUNCIOS.map(function (x, k) { var d = P(k * 5 + 2);
    return { id: uuid('bbbbbbbb', k + 1), dono: { sub: d.id, nome: d.nome }, eu: false, titulo: x[0], categoria: x[1], estado_item: x[2],
      descricao: null, cidade: d.cidade, preco_cents: x[3], situacao: 'disponivel', criado_em: quando(k * 9 + 4) } });
  /* um anúncio da própria conta, com alguém interessado (a proposta de brechó chega na caixa) */
  var meuAnuncio = { id: uuid('bbbbbbbb', 99), dono: { sub: EU_ID, nome: 'Você (demonstração)' }, eu: true, titulo: 'Canon C70', categoria: 'camera',
    estado_item: 'Usado, bom estado', descricao: null, cidade: 'Natal/RN', preco_cents: 2350000, situacao: 'disponivel', criado_em: quando(40) };
  if (!NOVO) { brecho.splice(3, 0, meuAnuncio);
    propostas.push({ id: uuid('pppppppp', 9), recebida: true, de: P(61).id, para: EU_ID, de_nome: P(61).nome, tipo: 'brecho', anuncio: meuAnuncio.id, dia: null,
      ini: null, fim: null, funcao: null, local: null, mensagem: 'Tenho interesse: Canon C70', valor_cents: null, estado: 'pendente', motivo: null, criado_em: quando(6) }) }

  /* a guilda: fase 1, grátis, 15 lugares */
  var membros = [{ sub: EU_ID, nome: 'Você (demonstração)', arroba: 'voce.demo', foto: null, papel: 'dono', eu: true, online: true }];
  for (var m = 0; m < 14; m++) membros.push({ sub: P(m * 6).id, nome: P(m * 6).nome, arroba: P(m * 6).arroba, foto: null, papel: m < 2 ? 'admin' : 'membro', eu: false, online: m % 3 === 0 });
  var V = function (k, f, e) { var p = membros[k]; return { sub: p.sub, nome: p.nome, funcao: f, estado: e, enviada: true, eu: p.eu } };
  var conta = function (eq) { return { vai: eq.filter(function (x) { return x.estado === 'vai' }).length, pendente: eq.filter(function (x) { return x.estado === 'pendente' }).length,
    nao_vai: eq.filter(function (x) { return x.estado === 'nao_vai' }).length } };
  var missao = function (k, titulo, d, estado, dono, eq, cliente) {
    return { id: uuid('mmmmmmmm', k), titulo: titulo, contratante: cliente ? 'fora' : 'casa', cliente: cliente || null, dia: dia(d), ini: '06:00', fim: '18:00',
      local: um(['Redinha', 'Ponta Negra', 'Pipa', 'Forte dos Reis Magos', 'Genipabu']), dono: { sub: membros[dono].sub, nome: membros[dono].nome },
      eu_dono: dono === 0, canal: uuid('cccccccc', k), chamada: null, estado: estado, equipe: eq, conta: conta(eq), criado_em: quando(48) } };
  var missoes = [
    missao(1, 'Campanha Café Potengi', 0, 'rodando', 3, [V(0, 'Direção de fotografia', 'vai'), V(1, 'Op. de gimbal', 'vai'), V(5, 'Som direto', 'vai')]),
    missao(2, 'Clipe Maré Cheia', 6, 'a_rodar', 0, [V(1, 'Op. de câmera', 'vai'), V(2, 'Gaffer', 'pendente'), V(3, 'Op. de drone', 'nao_vai'), V(4, 'Fotógrafo', 'pendente')], 'Selo Potengi'),
    missao(3, 'Doc das dunas', 12, 'a_rodar', 4, [V(0, 'Op. de câmera', 'pendente'), V(7, 'Som direto', 'vai'), V(9, 'Still', 'pendente')]),
    missao(4, 'Evento Arena Natal', 9, 'a_rodar', 6, [V(6, 'Op. de câmera', 'vai'), V(8, 'Op. de câmera', 'vai'), V(10, 'Switcher', 'vai')], 'Arena Natal'),
    missao(5, 'Casamento na Redinha', -3, 'feito', 0, [V(4, 'Fotógrafo', 'vai'), V(11, 'Filmmaker', 'vai')])];
  var proximos = {};
  missoes.filter(function (x) { return x.estado !== 'feito' }).forEach(function (x) { x.equipe.forEach(function (e) {
    if (!proximos[e.sub] && e.estado !== 'nao_vai') proximos[e.sub] = { missao: x.id, titulo: x.titulo, dia: x.dia, estado: e.estado } }) });
  var SALA = uuid('cccccccc', 0);
  var minha = {
    guilda: { id: 'g-demo', nome: 'Panelinha', tag: 'PNL', cor: '#F062B8', sobre: 'Clipe e publicidade em Natal', praca: 'Natal/RN', criada_em: '2026-03-01T10:00:00Z',
      paleta: { id: 'gel-magenta', nome: 'Gel magenta', d: '#F062B8', l: '#B0307A', ink: '#1F0716' }, cor_propria: null, logo: null },
    eu: { sub: EU_ID, papel: 'dono' }, membros: membros,
    nivel: { atual: 6, xp: 2280, de: 2000, ate: 2400, por_nivel: 400, faltam: 1, jobs: 14 },
    vagas: { base: 15, bonus_de_nivel: 0, extra: 0, total: 15, ocupadas: 15, livres: 0 }, beneficios: [],
    placa: { sequencia: 6, semanas: [false, false, false, false, false, false, true, true, true, true, true, true],
      credenciais: [{ codigo: 'primeiro', titulo: 'Primeiro job', detalhe: 'o primeiro job fechado', ico: 'estrela', n: 1, meta: 1, ok: true },
        { codigo: 'madrugada', titulo: 'Madrugada', detalhe: '3 chamadas antes das 6h', ico: 'relogio', n: 2, meta: 3, ok: false }],
      semana: [{ t: 'Fechar um job', n: 1, meta: 1 }, { t: 'Presença num call sheet', n: 0, meta: 1 }, { t: 'Uma vitória no quadro', n: 1, meta: 1 }],
      temporada: { xp: 900, jobs: 6 } },
    memoria: { jobs: 14, contratantes: 9, desde: '2026-03-01T10:00:00Z', cartazes: missoes.filter(function (x) { return x.estado === 'feito' }).map(function (x) {
      return { id: x.id, dia: x.dia, titulo: x.titulo, tipo: 'Casamento', local: x.local, contratante: null, de_fora: true, eu: true, vem: false,
        creditos: x.equipe.map(function (e) { return { funcao: e.funcao, nome: e.nome, de_fora: false, saiu: false } }), fechado_em: quando(72) } }) },
    jobs: [], agora: { n: 5, subs: [EU_ID].concat(membros.filter(function (x) { return x.online }).map(function (x) { return x.sub })) },
    chat: { sala: SALA, nao_lidas: 4, digitando: [], canais: [{ id: SALA, tipo: 'sala', nome: 'geral', nao_lidas: 3 }, { id: uuid('cccccccc', 2), tipo: 'job', nome: 'Clipe Maré Cheia', nao_lidas: 1 }],
      ultimas: [{ id: 'm1', autor: { sub: membros[1].sub, nome: membros[1].nome }, tipo: 'texto', texto: 'Cliente aprovou o roteiro final.', dados: {}, criado_em: quando(1), reacoes: [{ e: '🙌', n: 6, eu: false }] }] },
    convites: [], missoes: missoes, proximos: proximos };
  var msg = function (k, autor, texto, h) { return { id: 'x' + k, seq: k, ver: k, autor: { sub: membros[autor].sub, nome: membros[autor].nome }, eu: autor === 0, tipo: 'texto', texto: texto,
    dados: {}, mencoes: [], imagem: null, fixada: false, apagada: false, criado_em: quando(h), reacoes: [], chamada: null } };
  var chat = [msg(1, 3, 'Alguém tem um tripé de cabeça fluida pra sábado?', 6), msg(2, 7, 'Tenho o Manfrotto, passo aí às 7h.', 5.8),
    msg(3, 1, 'Cliente aprovou o roteiro final.', 1), msg(4, 9, 'Drone liberado na Redinha, a autorização saiu.', 0.6), msg(5, 12, 'Fechei a cor do doc, link no canal do job.', 0.2)];
  var mural = [
    { id: 'p1', tipo: 'aviso', autor: { sub: EU_ID, nome: 'Você (demonstração)' }, eu: true, titulo: 'Sábado é dia de Café Potengi', texto: 'Chamada 6h na Redinha.', link: null, imagem: null, dados: {}, fixado: true, criado_em: quando(20), reacoes: [{ e: '👍', n: 5, eu: false }], quero: { n: 0, eu: false } },
    { id: 'p2', tipo: 'vaga', autor: { sub: membros[2].sub, nome: membros[2].nome }, eu: false, titulo: '1º assistente de câmera', texto: null, link: null, imagem: null, dados: { dia: dia(10), funcao: 'Assistente' }, fixado: false, criado_em: quando(30), reacoes: [], quero: { n: 2, eu: false } },
    { id: 'p3', tipo: 'vitoria', autor: { sub: membros[5].sub, nome: membros[5].nome }, eu: false, titulo: 'Campanha aprovada sem refação', texto: null, link: null, imagem: null, dados: {}, fixado: false, criado_em: quando(50), reacoes: [{ e: '🔥', n: 8, eu: true }], quero: { n: 0, eu: false } }];

  /* o selo: a mesma conta de carro_do_freela.selo_de / selo_fatos (0008) — pesos, 85% e 6 jobs; job = proposta de job
     aceita que eu FIZ, com o dia passado, o mesmo contratante no mesmo dia uma vez */
  var SELO_ITENS = [['nome', 'Nome e praça', 10], ['port', 'Portfólio', 4], ['func', 'Funções', 16], ['nicho', 'Tipos de trabalho', 5],
    ['equip', 'Câmera e lente', 12], ['tabela', 'Tabela de diária', 17], ['regras', 'Hora extra e deslocamento', 4]];
  var seloDemo = function () {
    var p = perfil || {}, t = tabela, usa = function (c) { return inventario.some(function (i) { return i.ativo !== false && i.categoria === c }) };
    var fatos = { nome: !!(p.nome && p.cidade), port: !!p.portfolio, func: !!(p.funcoes || []).length, nicho: !!(p.nichos || []).length,
      equip: usa('camera') && usa('lente'), tabela: !!t && t.linhas.some(function (l) { return l.so_eu_cents > 0 || l.com_equip_cents > 0 }),
      regras: !!t && t.hora_extra_cents != null && t.deslocamento_cents != null };
    var feitos = {}; propostas.forEach(function (x) { var c = confirmacoes[x.id];
      if (x.recebida && x.tipo === 'job' && x.estado === 'aceita' && x.dia && x.dia < dia(0) && c && c.de === true && c.para === true) feitos[x.de + x.dia] = 1 });
    var soma = 0; SELO_ITENS.forEach(function (i) { if (fatos[i[0]]) soma += i[2] });
    var pct = Math.floor(100 * soma / 68), jobs = Object.keys(feitos).length;
    return { pct: pct, jobs: jobs, verificado: pct >= 85 && jobs >= 6, meta: { pct: 85, jobs: 6 },
      itens: SELO_ITENS.map(function (i) { return { k: i[0], t: i[1], peso: i[2], ok: !!fatos[i[0]] } }) };
  };

  /* ---------------- o servidor de mentira ---------------- */
  var original = window.fetch ? window.fetch.bind(window) : null;
  var J = function (s, j) { return Promise.resolve(new Response(j === undefined ? null : JSON.stringify(j), { status: s, headers: { 'Content-Type': 'application/json' } })) };
  var corpo = function (o) { try { return o && typeof o.body === 'string' ? JSON.parse(o.body) : {} } catch (e) { return {} } };
  var nova = 0, pedidos = [];
  window.fetch = function (u, o) {
    var url = new URL(typeof u === 'string' ? u : u.url, location.href);
    if (url.origin !== location.origin || url.pathname.indexOf('/api/zro/') !== 0) return original ? original(u, o) : J(404, {});
    var r = url.pathname.slice(9), met = ((o && o.method) || 'GET').toUpperCase(), q = url.searchParams, c = met === 'GET' ? {} : corpo(o);
    pedidos.push(met + ' ' + r);
    if (r === 'eu') return J(200, { entrou: true, sub: EU_ID, nome: 'Você (demonstração)', email: '', arroba: 'voce.demo', organizacao: 'Demonstração', liberado: true, hub: false, release: 'open' });
    if (r === 'pessoas') return J(200, { pessoas: pessoas, de: q.get('de'), ate: q.get('ate'), agendas: true });
    if (r === 'perfil') { if (met === 'PUT') perfil = Object.assign({}, perfil, c, { viaja: c.viaja === true, atualizado_em: new Date().toISOString() }); return J(200, { perfil: perfil }) }
    if (r === 'tabela') {
      if (met === 'PUT') {
        var nn = function (x) { return typeof x === 'number' && x >= 0 ? x : null };
        tabela = { linhas: (c.linhas || []).map(function (l) { return { funcao: l.funcao, so_eu_cents: nn(l.so_eu_cents), com_equip_cents: nn(l.com_equip_cents) } })
          .filter(function (l) { return l.so_eu_cents !== null || l.com_equip_cents !== null }),
          meia_pct: nn(c.meia_pct), fds_pct: nn(c.fds_pct), hora_extra_cents: nn(c.hora_extra_cents), deslocamento_cents: nn(c.deslocamento_cents), atualizado_em: new Date().toISOString() };
      } else if (met !== 'GET') return J(405, { erro: 'metodo' });
      return J(200, { tabela: tabela, selo: seloDemo() });
    }
    if (r === 'selo') return J(200, { selo: seloDemo() });
    if (r === 'inventario') {
      if (met === 'POST') { var it = Object.assign({ id: uuid('11111111', 100 + ++nova), ativo: true, atualizado_em: new Date().toISOString() }, c); inventario.push(it); return J(201, { item: it }) }
      if (met === 'DELETE') { inventario = inventario.filter(function (x) { return x.id !== q.get('id') }); return J(204) }
      return J(200, { itens: inventario });
    }
    if (r === 'agenda') {
      if (met === 'PUT') { euAgenda[c.dia] = { e: c.estado, p: c.parte || 'dia', h: c.hora || undefined }; return J(200, { dia: c.dia, declaracao: euAgenda[c.dia] }) }
      if (met === 'DELETE') { delete euAgenda[q.get('dia')]; return J(204) }
      return J(200, { agenda: euAgenda });
    }
    if (r === 'propostas') {
      if (met === 'POST') { var pp = Object.assign({ id: uuid('pppppppp', 100 + ++nova), recebida: false, de: EU_ID, de_nome: 'Você (demonstração)', tipo: 'job', estado: 'pendente', motivo: null, valor_cents: null, criado_em: new Date().toISOString() }, c);
        propostas.unshift(pp); return J(201, { proposta: pp }) }
      if (met === 'PATCH') { var alvo = propostas.filter(function (x) { return x.id === q.get('id') })[0]; if (!alvo) return J(404, { erro: 'nao_achado' });
        if ('acao' in c) {
          if (c.acao !== 'confirmar') return J(400, { erro: 'tipo', campo: 'acao' });
          if (typeof c.aconteceu !== 'boolean') return J(400, { erro: 'tipo', campo: 'aconteceu' });
          if (alvo.tipo !== 'job' || alvo.estado !== 'aceita') return J(409, { erro: 'estado', campo: 'estado' });
          if (!alvo.dia || alvo.dia >= dia(0)) return J(409, { erro: 'cedo', campo: 'dia' });
          var cf = confirmacoes[alvo.id] = confirmacoes[alvo.id] || { de: null, para: null }, lado = alvo.para === EU_ID ? 'para' : 'de';
          if (cf[lado] !== null && cf[lado] !== undefined) return J(409, { erro: 'ja_confirmado', campo: 'aconteceu' });
          cf[lado] = c.aconteceu; return J(200, { proposta: comConf(alvo) });
        }
        alvo.estado = c.estado || alvo.estado; return J(200, { proposta: comConf(alvo) }) }
      return J(200, { recebidas: propostas.filter(function (x) { return x.recebida }).map(comConf), enviadas: propostas.filter(function (x) { return !x.recebida }).map(comConf) });
    }
    if (r === 'feed') {
      if (met === 'POST') { var po = { id: uuid('ffffffff', 100 + ++nova), autor: { sub: EU_ID, nome: 'Você (demonstração)' }, eu: true, tipo: c.tipo || 'nota', texto: c.texto || '', criado_em: new Date().toISOString() };
        feed.unshift(po); return J(201, { post: po }) }
      if (met === 'DELETE') { feed = feed.filter(function (x) { return x.id !== q.get('id') }); return J(204) }
      return J(200, { posts: feed });
    }
    if (r === 'brecho') {
      if (met === 'POST') { var an = Object.assign({ id: uuid('bbbbbbbb', 100 + ++nova), dono: { sub: EU_ID, nome: 'Você (demonstração)' }, eu: true, situacao: 'disponivel', criado_em: new Date().toISOString() }, c);
        brecho.unshift(an); return J(201, { anuncio: an }) }
      if (met === 'DELETE') { brecho = brecho.filter(function (x) { return x.id !== q.get('id') }); return J(204) }
      return J(200, { anuncios: brecho });
    }
    if (r === 'denuncia') return J(204);
    if (r === 'guildas') {
      if (met === 'GET') return J(200, { fase: 1, pode_fundar: true, pedir_url: null, pacotes: [], recebidos: [], carencia_ate: null, minha: minha });
      return J(204);
    }
    if (r === 'sede') {
      if (q.get('ver') === 'dia') return J(200, { dia: q.get('dia') || '', pessoas: membros.map(function (x, i) { return { sub: x.sub, estado: i === 0 ? 'livre' : ['livre', 'livre', 'ocupado', 'sem_agenda'][i % 4] } }) });
      if (q.get('ver') === 'mural') return J(200, { posts: mural });
      if (q.get('ver') === 'memoria') return J(200, { cartazes: minha.memoria.cartazes.map(function (x) { return Object.assign({ canal: null }, x) }) });
      if (q.get('canal')) return J(200, { v: 1, canal: { id: q.get('canal'), tipo: 'sala', nome: 'geral', dia: null }, completo: true, digitando: [], agora: minha.agora,
        fixadas: [], canais: minha.chat.canais, mensagens: chat });
      if (met === 'POST') {
        if (c.acao === 'missao') return J(201, { missao: { id: uuid('mmmmmmmm', 100 + ++nova), canal: uuid('cccccccc', 100 + nova), chamada: null } });
        if (c.texto) { chat.push(Object.assign(msg(chat.length + 1, 0, c.texto, 0))); return J(201, { mensagem: { id: 'x' + chat.length } }) }
        return J(201, {});
      }
      return J(204);
    }
    /* a Z, o Set, entrar e sair: não existem na demonstração */
    return J(404, { erro: 'demonstracao' });
  };

  /* o selo: sempre à vista, e a saída para o Carro de verdade */
  var selo = function () {
    if (document.getElementById('demo-selo')) return;
    var s = document.createElement('div');
    s.id = 'demo-selo';
    s.setAttribute('role', 'status');
    s.innerHTML = '<b>Demonstração</b><span>perfis fictícios · nada é salvo</span><a href="https://carro.absolutezro.com/">Usar de verdade</a>';
    var st = document.createElement('style');
    st.textContent = '#demo-selo{position:fixed;z-index:2147483000;left:50%;transform:translateX(-50%);top:calc(10px + env(safe-area-inset-top,0px));display:flex;align-items:center;gap:10px;' +
      'padding:6px 6px 6px 14px;border-radius:999px;background:rgba(20,20,24,.82);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:#F5F5F7;' +
      'font:500 12.5px/1.2 "Figtree",system-ui,sans-serif;box-shadow:0 0 0 1px rgba(255,255,255,.12),0 8px 24px rgba(0,0,0,.35);white-space:nowrap;max-width:calc(100vw - 24px)}' +
      '#demo-selo b{color:#17D1E8;font-weight:800}#demo-selo span{color:#AEAEB2}' +
      '#demo-selo a{color:#1D1D1F;background:rgba(245,245,247,.94);border-radius:999px;padding:6px 12px;font-weight:700;text-decoration:none}' +
      '@media(max-width:520px){#demo-selo span{display:none}}' +
      /* a entrada em perguntas ocupa a tela toda: no celular o selo não pode cobrir a barra de progresso */
      '@media(max-width:820px){.ob-esq{padding-top:calc(64px + env(safe-area-inset-top,0px))!important}}';
    document.head.appendChild(st);
    document.body.appendChild(s);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', selo); else selo();
  /* entra sozinho na conta de demonstração, assim que o app leu a conta (/api/zro/eu) */
  var tentativas = 0;
  var entrar = setInterval(function () {
    if (++tentativas > 200) return clearInterval(entrar);
    try {
      if (typeof ZRO_PRONTO === 'undefined' || !ZRO_PRONTO || !ZRO_CONTA || typeof zroEntrar !== 'function') return;
      clearInterval(entrar);
      /* o perfil da conta de demonstração já vem pronto (sem passar pelo cadastro) e o feed abre na praça inteira */
      if (NOVO) { zroEntrar(false); return }
      if (typeof EU === 'object' && EU) { EU.nome = EU.nome || 'Você (demonstração)'; if (!(EU.func || []).length) EU.func = ['Op. de câmera', 'Editor']; EU.cidade = EU.cidade || 'Natal/RN' }
      try { FDP_ABA = 'praca' } catch (e) {}
      zroEntrar(false);
      /* se o app ainda pediu o cadastro, a conta de exemplo já tem perfil: vai direto ao feed */
      setTimeout(function () {
        try { if (S.tab === 'cadastro') { EU.nome = 'Você (demonstração)'; EU.func = ['Op. de câmera', 'Editor']; EU.principal = ['Op. de câmera']; EU.cidade = 'Natal/RN'; EU.incompleto = false; show('feed') } } catch (e) {}
      }, 300);
    } catch (e) { clearInterval(entrar) }
  }, 100);
  window.CDF_DEMO = { pessoas: pessoas.length, novo: NOVO, pedidos: pedidos, perfil: function () { return perfil }, confirmacoes: function () { return confirmacoes } };
})();
