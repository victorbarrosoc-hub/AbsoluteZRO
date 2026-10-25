// Ponte com o DaVinci (desktop/davinci.cjs): o pedido vira código Lua, o script do Resolve roda no LuaJIT com um
// Resolve de mentira (Media Pool, linhas do tempo, projeto) e a resposta volta para o Synquei.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const { Ponte, paraLua, scriptLua, pastaScripts, pastaTroca, corResolve } = require('../desktop/davinci.cjs')

const temLua = spawnSync('luajit', ['-v']).status === 0

test('pedido em Lua: aspas, barra, quebra de linha e acento', () => {
  assert.equal(paraLua('a"b\\c\nd'), '"a\\"b\\\\c\\010d"')
  assert.equal(paraLua('Diária'), '"Diária"')
  assert.equal(paraLua([1, true, null]), '{1, true, nil}')
  assert.equal(paraLua({ a: 1, 'Camera #': 'A', x: undefined }), '{["a"] = 1, ["Camera #"] = "A"}')
  assert.equal(paraLua(NaN), 'nil')
})

test('pastas do Resolve e da troca em cada sistema', () => {
  assert.equal(pastaScripts('darwin', '/Users/v'), '/Users/v/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility')
  assert.equal(pastaScripts('win32', 'C:\\Users\\v', { APPDATA: 'C:\\Users\\v\\AppData\\Roaming' }), 'C:\\Users\\v\\AppData\\Roaming\\Blackmagic Design\\DaVinci Resolve\\Support\\Fusion\\Scripts\\Utility')
  assert.equal(pastaScripts('linux', '/home/v'), '/home/v/.local/share/DaVinciResolve/Fusion/Scripts/Utility')
  assert.equal(pastaTroca('win32', 'C:\\Users\\João\\AppData\\Roaming\\Synquei', { PROGRAMDATA: 'C:\\ProgramData' }), 'C:\\ProgramData\\Synquei\\davinci')
  assert.equal(corResolve(0), 'Blue')
  assert.equal(corResolve(1), 'Orange')
  assert.equal(corResolve(17), 'Orange')
})

// Resolve de mentira: só o que o script usa
const MOCK = String.raw`
local function Pasta(nome)
  local f = { nome = nome, subs = {}, clips = {} }
  function f:GetName() return self.nome end
  function f:GetSubFolderList() local t = {}; for i, s in ipairs(self.subs) do t[i] = s end; return t end
  function f:GetClipList() local t = {}; for i, c in ipairs(self.clips) do t[i] = c end; return t end
  return f
end
local function Item(c)
  local it = { caminho = c, meta = {} }
  function it:GetClipProperty(k) if k == "File Path" then return self.caminho end; if k == "Frames" then return "36" end end
  function it:SetClipColor(x) self.cor = x; return true end
  function it:SetMetadata(k, v) self.meta[k] = v; return true end
  return it
end
local timelines = {}
local function TItem(c, ini)
  local it = {}
  function it:GetName() return c.nome end
  function it:GetStart() return ini + c.inicio end
  function it:GetEnd() return ini + c.fim end
  function it:GetLeftOffset() return c.entrada or 0 end
  function it:GetMediaPoolItem() local m = {}; function m:GetClipProperty(k) return c.arquivo end; return m end
  return it
end
-- monta: uma sequência já montada (faixas com clipes de verdade), para a análise de SFX
local function Timeline(nome, n, monta)
  local tl = { nome = nome, n = n, monta = monta, marcadores = {}, anexados = {}, faixasExtra = 0, nomesFaixas = {} }
  local ini = monta and monta.inicio or 0
  function tl:GetName() return self.nome end
  function tl:SetName(x) self.nome = x; return true end
  function tl:GetSetting(k) if k == "timelineFrameRate" then return tostring(monta and monta.fps or 24) end end
  function tl:GetStartFrame() return ini end
  function tl:GetEndFrame() return ini + (monta and monta.quadros or 0) end
  function tl:GetTrackCount(tipo)
    if not monta then return tipo == "video" and 1 or 0 end
    return #(monta[tipo] or {}) + (tipo == "audio" and self.faixasExtra or 0)
  end
  function tl:GetItemListInTrack(tipo, t)
    local r = {}
    if not monta then for i = 1, self.n do r[i] = {} end; return r end
    for i, c in ipairs((monta[tipo] or {})[t] or {}) do r[i] = TItem(c, ini) end
    return r
  end
  function tl:AddMarker(q, cor, nome, nota, dur) table.insert(self.marcadores, { quadro = q, cor = cor, nome = nome, nota = nota }); return true end
  function tl:AddTrack(tipo) if tipo == "audio" then self.faixasExtra = self.faixasExtra + 1 end; return true end
  function tl:SetTrackName(tipo, i, nome) self.nomesFaixas[i] = nome; return true end
  return tl
end
for _, s in ipairs(SEED or {}) do table.insert(timelines, Timeline(s[1], s[2], s[3])) end
local corrente = timelines[1]
local raiz = Pasta("Master")
local atual = raiz
local chamadas = { importMedia = 0 }
local pool = {}
function pool:GetRootFolder() return raiz end
function pool:AddSubFolder(pai, nome) local f = Pasta(nome); table.insert(pai.subs, f); return f end
function pool:SetCurrentFolder(f) atual = f; return true end
function pool:ImportMedia(lst)
  chamadas.importMedia = chamadas.importMedia + 1
  local out = {}
  for _, x in ipairs(lst) do
    local c = type(x) == "table" and x.FilePath or x
    if not c:find("FALHA", 1, true) then local it = Item(c); table.insert(atual.clips, it); out[#out + 1] = it end
  end
  return out
end
function pool:ImportTimelineFromFile(arq, o)
  local tl = Timeline(o.timelineName, 3); tl.pasta = atual.nome; tl.semFonte = (o.importSourceClips == false)
  table.insert(timelines, tl)
  return tl
end
function pool:AppendToTimeline(infos)
  local out = {}
  for _, x in ipairs(infos) do
    table.insert(corrente.anexados, { caminho = x.mediaPoolItem.caminho, faixa = x.trackIndex, quadro = x.recordFrame, fim = x.endFrame, pasta = atual.nome })
    out[#out + 1] = {}
  end
  return out
end
function pool:DeleteTimelines(l)
  for _, x in ipairs(l) do for i, t in ipairs(timelines) do if t == x then table.remove(timelines, i); break end end end
  return true
end
local proj = { nome = PROJETO }
function proj:GetName() return self.nome end
function proj:GetMediaPool() return pool end
function proj:GetTimelineCount() return #timelines end
function proj:GetTimelineByIndex(i) return timelines[i] end
function proj:GetCurrentTimeline() return corrente end
function proj:SetCurrentTimeline(tl) corrente = tl; return true end
function proj:GetSetting(k) return "24" end
local pm = {}
function pm:GetCurrentProject() return proj end
function pm:LoadProject(n) if n == "nao existe" then return false end; proj.nome = n; return true end
function pm:CreateProject(n) proj.nome = n; return true end
resolve = {}
function resolve:GetProjectManager() return pm end
if SYNQUEI_UI then
  -- UIManager de mentira: guarda cada item pelo ID; RunLoop aperta os botões pedidos e volta
  local itens, sequencia = {}, {}
  local function item(tipo)
    return function(_, props, filho)
      if type(props) ~= "table" then props = {} end
      props._tipo = tipo
      if props.ID then itens[props.ID] = props end
      return props
    end
  end
  local ui = setmetatable({}, { __index = function(_, k)
    if k == "Timer" then return function(_, p) itens[p.ID] = p; p.Start = function() end; p.Stop = function() end; return p end end
    return item(k)
  end })
  local auto = function() return setmetatable({}, { __index = function(t, k) local v = {}; rawset(t, k, v); return v end }) end
  fu = { UIManager = ui }
  bmd = { UIDispatcher = function()
    local disp = { On = {} }
    function disp:AddWindow(props, raiz)
      itens[props.ID] = props
      local win = { On = auto(), raiz = raiz }
      function win:GetItems() return itens end
      function win:Show() end
      function win:Hide() end
      UI_WIN = win
      return win
    end
    function disp:RunLoop()
      sequencia[#sequencia + 1] = { Pilula = itens.Pilula.Text, Status = itens.Status.Text, Usar = itens.Usar.Enabled, Historico = itens.Historico.Text, Fila = itens.Fila.Text, Projeto = itens.Projeto.Text, Ultimo = itens.Ultimo.Text }
      for _, b in ipairs(CLIQUES or {}) do
        UI_WIN.On[b].Clicked({})
        sequencia[#sequencia + 1] = { Pilula = itens.Pilula.Text, Status = itens.Status.Text, Usar = itens.Usar.Enabled, Historico = itens.Historico.Text, Fila = itens.Fila.Text, Projeto = itens.Projeto.Text, Ultimo = itens.Ultimo.Text }
      end
    end
    function disp:ExitLoop() end
    return disp
  end }
  dofile(SCRIPT)
  local function q(v) if type(v) == "boolean" then return tostring(v) end; if v == nil then return "null" end
    return '"' .. tostring(v):gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end) .. '"' end
  local p = {}
  for _, e in ipairs(sequencia) do
    local c = {}
    for k, v in pairs(e) do c[#c + 1] = q(k) .. ":" .. q(v) end
    p[#p + 1] = "{" .. table.concat(c, ",") .. "}"
  end
  local raiz = {}
  for id, it in pairs(itens) do raiz[#raiz + 1] = q(id) .. ":" .. q(it.StyleSheet or "") end
  print("{" .. '"telas":[' .. table.concat(p, ",") .. '],"estilos":{' .. table.concat(raiz, ",") .. "}}")
  return
end
SYNQUEI_TESTE = true
local m = dofile(SCRIPT)
local feitos = {}
for _, acao in ipairs(ACOES or { "passada" }) do
  if acao == "passada" then feitos[#feitos + 1] = m.passada() else m[acao]() end
end
local clips = {}
local function varrer(f, pre)
  for _, c in ipairs(f.clips) do clips[#clips + 1] = { pasta = pre, caminho = c.caminho, cor = c.cor, meta = c.meta } end
  for _, s in ipairs(f.subs) do varrer(s, (pre == "" and "" or pre .. "/") .. s.nome) end
end
varrer(raiz, "")
local tls = {}
for _, t in ipairs(timelines) do tls[#tls + 1] = { nome = t.nome, pasta = t.pasta or "", semFonte = t.semFonte or false } end
local cor = corrente and { nome = corrente.nome, marcadores = corrente.marcadores, anexados = corrente.anexados, nomesFaixas = corrente.nomesFaixas } or {}
print(m.json({ feitos = feitos, clips = clips, linhas = tls, estado = m.estado, importMedia = chamadas.importMedia, projeto = proj.nome, corrente = cor }))
`

function rodar(troca, { projeto = 'Filme X', seed = [], acoes = ['passada'], ui = false, cliques = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'resolve-'))
  const script = join(dir, 'Synquei.lua')
  writeFileSync(script, scriptLua({ troca }))
  const mock = join(dir, 'mock.lua')
  writeFileSync(mock, `PROJETO = ${paraLua(projeto)}\nSCRIPT = ${paraLua(script)}\nSEED = ${paraLua(seed)}\nACOES = ${paraLua(acoes)}\nSYNQUEI_UI = ${ui}\nCLIQUES = ${paraLua(cliques)}\n${MOCK}`)
  const r = spawnSync('luajit', [mock], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  return JSON.parse(r.stdout)
}

const item = (caminho, pasta, cor, meta = {}) => ({ caminho, pasta, cor, meta })
const CAM = ['Diária 01', 'Câmeras', 'Aladim - FX30', 'Cartão 01']
const SOM = ['Diária 01', 'Áudio', 'Som - F8', 'Cartão 01']

test('Resolve: pastas, cores, Cena/Take, sem importar duas vezes, linhas do tempo trocadas', { skip: !temLua && 'sem luajit' }, async () => {
  const troca = mkdtempSync(join(tmpdir(), 'troca-'))
  const ponte = new Ponte({ troca })
  const linhas = (nomes) => ({ prefixo: 'Diária 01 · ', sufixo: ' · Synquei', importar: nomes.map((n) => ({ nome: n, arquivo: `/hd/Filme X/Synquei/Sequências/${n}.xml`, pasta: ['Diária 01', 'Sequências'] })) })
  await ponte.enviar({
    projeto: 'Filme X',
    pastaId: 'abc',
    itens: [item('/hd/Filme X/Diária 01/C0001.MP4', CAM, 'Blue', { 'Camera #': 'Aladim - FX30', 'Roll Card #': 'Cartão 01' }), item('/hd/Filme X/Diária 01/C0002.MP4', CAM, 'Blue')],
    linhas: linhas(['Diária 01 · Sessão 1 · Synquei']),
  })
  // segundo cartão: o C0001 já está lá (ganha a Cena que veio do gravador), chega o áudio e um que falha
  await ponte.enviar({
    projeto: 'Filme X',
    pastaId: 'abc',
    itens: [
      item('/hd/Filme X/Diária 01/C0001.MP4', CAM, 'Blue', { Scene: '12', Take: '3' }),
      item('/hd/Filme X/Diária 01/ZOOM0001.WAV', SOM, 'Orange', { Scene: '12', Take: '3' }),
      item('/hd/Filme X/Diária 01/FALHA.MP4', CAM, 'Blue'),
      { ...item('/hd/Filme X/Diária 01/A001_0001.dng', CAM, 'Blue'), seq: { padrao: '/hd/Filme X/Diária 01/A001_%04d.dng', ini: 1, fim: 48 } },
    ],
    linhas: linhas(['Diária 01 · Sessão 1 · Synquei', 'Diária 01 · Sessão 2 · Synquei']),
  })
  // linhas que já existiam: uma igual a quando entrou (sai), uma editada (fica com outro nome), uma de outra diária
  mkdirSync(join(troca, 'linhas'), { recursive: true })
  writeFileSync(join(troca, 'linhas', 'Filme X.txt'), 'Diária 01 · Sessão 8 · Synquei\t5\nDiária 01 · Sessão 9 · Synquei\t2\n')
  const r = rodar(troca, { seed: [['Diária 01 · Sessão 8 · Synquei', 5], ['Diária 01 · Sessão 9 · Synquei', 5], ['Diária 02 · Sessão 1 · Synquei', 3], ['Meu corte', 7]] })
  assert.deepEqual(r.feitos, [2])
  const por = Object.fromEntries(r.clips.map((c) => [c.caminho.split('/').pop(), c]))
  assert.deepEqual(Object.keys(por).sort(), ['A001_%04d.dng', 'C0001.MP4', 'C0002.MP4', 'ZOOM0001.WAV'])
  assert.equal(por['C0001.MP4'].pasta, CAM.join('/'))
  assert.equal(por['ZOOM0001.WAV'].pasta, SOM.join('/'))
  assert.equal(por['C0001.MP4'].cor, 'Blue')
  assert.equal(por['ZOOM0001.WAV'].cor, 'Orange')
  assert.deepEqual(por['C0001.MP4'].meta, { 'Camera #': 'Aladim - FX30', 'Roll Card #': 'Cartão 01', Scene: '12', Take: '3' })
  const nomes = r.linhas.map((t) => t.nome)
  assert.ok(nomes.includes('Diária 02 · Sessão 1 · Synquei'), 'outra diária não é mexida')
  assert.ok(nomes.includes('Meu corte'))
  assert.ok(!nomes.includes('Diária 01 · Sessão 8 · Synquei'), 'a antiga sem edição sai')
  assert.ok(nomes.some((n) => n.startsWith('Diária 01 · Sessão 9 · Synquei (editada')), 'a editada fica com outro nome')
  assert.equal(nomes.filter((n) => n === 'Diária 01 · Sessão 1 · Synquei').length, 1)
  assert.equal(nomes.filter((n) => n === 'Diária 01 · Sessão 2 · Synquei').length, 1)
  const s2 = r.linhas.find((t) => t.nome === 'Diária 01 · Sessão 2 · Synquei')
  assert.equal(s2.pasta, 'Sequências')
  assert.equal(s2.semFonte, true)

  const resp = await ponte.verificar()
  assert.equal(resp.length, 2)
  assert.equal(resp[0].importados, 2)
  assert.equal(resp[1].importados, 2)
  assert.equal(resp[1].jaEstavam, 1)
  assert.deepEqual(resp[1].falhas, ['/hd/Filme X/Diária 01/FALHA.MP4'])
  assert.deepEqual(resp[0].guardadas, ['Diária 01 · Sessão 9 · Synquei'])
  assert.equal(resp[0].trocadas, 1)
  assert.equal(resp[1].trocadas, 1)
  assert.ok(!existsSync(join(troca, 'pedidos', '000001.lua')), 'pedido respondido sai da fila')
  const st = await ponte.status({ platform: 'linux', home: troca })
  assert.equal(st.conectado, true)
  assert.equal(st.projeto, 'Filme X')
  assert.equal(st.fila, 0)
  // o que já foi importado não volta, mesmo se tirarem da Media Pool
  assert.match(readFileSync(join(troca, 'importados', 'Filme X.txt'), 'utf8'), /C0002\.MP4/)
})

test('Resolve: outro projeto aberto espera; "Usar o projeto aberto" liga e organiza', { skip: !temLua && 'sem luajit' }, async () => {
  const troca = mkdtempSync(join(tmpdir(), 'troca-'))
  const ponte = new Ponte({ troca })
  await ponte.enviar({ projeto: 'Filme X', pastaId: 'abc', itens: [item('/hd/a.mov', CAM, 'Blue')] })
  let r = rodar(troca, { projeto: 'Outro' })
  assert.deepEqual(r.feitos, [0])
  assert.equal(r.estado.esperando, 'Filme X')
  assert.equal(r.clips.length, 0)
  assert.equal((await ponte.status()).fila, 1)
  assert.equal((await ponte.status()).esperando, 'Filme X')
  r = rodar(troca, { projeto: 'Outro', acoes: ['passada', 'usarAberto', 'passada'] })
  assert.deepEqual(r.feitos, [0, 1])
  assert.equal(r.clips.length, 1)
  assert.match(readFileSync(join(troca, 'ligado.txt'), 'utf8'), /^abc\tOutro/)
  // "Abrir o projeto esperado"
  await ponte.enviar({ projeto: 'Filme Y', pastaId: 'xyz', itens: [item('/hd/b.mov', CAM, 'Blue')] })
  r = rodar(troca, { projeto: 'Outro', acoes: ['passada', 'abrirEsperado', 'passada'] })
  assert.deepEqual(r.feitos, [0, 1])
  assert.equal(r.projeto, 'Filme Y')
})

test('instalar põe o script no menu do Resolve com a pasta de troca', async () => {
  const home = mkdtempSync(join(tmpdir(), 'home-'))
  const troca = join(home, 'troca')
  const ponte = new Ponte({ troca })
  const f = await ponte.instalar({ platform: 'linux', home })
  assert.ok(f.endsWith(join('Fusion', 'Scripts', 'Utility', 'Synquei.lua')))
  assert.match(readFileSync(f, 'utf8'), new RegExp(`local TROCA = "${troca.replace(/\\/g, '/')}"`))
  const st = await ponte.status({ platform: 'linux', home })
  assert.equal(st.instalado, true)
  assert.equal(st.conectado, false)
})

test('janelinha no Resolve: visual do Synquei, esperando o projeto, "Usar o projeto aberto" e o histórico', { skip: !temLua && 'sem luajit' }, async () => {
  const troca = mkdtempSync(join(tmpdir(), 'troca-'))
  const ponte = new Ponte({ troca })
  await ponte.instalar({ platform: 'linux', home: mkdtempSync(join(tmpdir(), 'home-')) })
  assert.ok(existsSync(join(troca, 'synquei-logo.png')), 'logo copiado para a pasta de troca')
  assert.ok(existsSync(join(troca, 'ui', 'status-ok.png')) && existsSync(join(troca, 'ui', 'thumb-1.png')), 'ícones copiados')
  await ponte.enviar({ projeto: 'Filme X', pastaId: 'abc', diaria: 'Diária 01', cartao: 'Diária 01 · Aladim - FX30 · Cartão 01', cor: 1, itens: [item('/hd/a.mov', CAM, 'Blue'), item('/hd/b.mov', CAM, 'Blue')] })
  const r = rodar(troca, { projeto: 'Outro <b>', ui: true, cliques: ['Usar'] })
  const [antes, depois] = r.telas.slice(-2)
  assert.match(antes.Pilula, /Esperando/)
  assert.match(antes.Status, /Esperando o projeto “Filme X”/)
  assert.match(antes.Status, /Outro &lt;b&gt;/, 'nome do projeto escapado no HTML')
  assert.equal(antes.Usar, true)
  assert.match(antes.Fila, /1 cartão/)
  assert.match(antes.Historico, /quando o SOBEDESCE terminar/)
  assert.match(depois.Pilula, /Ligado/)
  assert.match(depois.Status, /Organizado às \d\d:\d\d/)
  assert.equal(depois.Usar, false)
  assert.match(depois.Fila, /Nada/)
  assert.match(depois.Ultimo, /2 clipes novos/)
  assert.match(depois.Historico, /Aladim - FX30 · Cartão 01/)
  assert.match(depois.Historico, /Diária 01 · 2 clipes/)
  assert.match(depois.Historico, /thumb-1\.png/, 'miniatura na cor da câmera')
  assert.match(depois.Historico, /Organizado/)
  assert.match(r.estilos.SynqueiJanela, /background-color: #0b0b0c/)
  assert.match(r.estilos.Agora, /border-radius: 18px/)
  // o histórico fica guardado: abrir o script de novo mostra o último cartão
  const r2 = rodar(troca, { projeto: 'Outro <b>', ui: true })
  assert.match(r2.telas[0].Historico, /Aladim - FX30/)
  assert.match(r2.telas[0].Status, /Ligado ao projeto/)
})

test('app atualizado troca o script que já estava no Resolve', async () => {
  const home = mkdtempSync(join(tmpdir(), 'home-'))
  const ponte = new Ponte({ troca: join(home, 'troca') })
  assert.equal(await ponte.atualizarSeInstalado({ platform: 'linux', home }), false, 'não instala sozinho quem nunca instalou')
  const f = await ponte.instalar({ platform: 'linux', home })
  assert.equal(await ponte.atualizarSeInstalado({ platform: 'linux', home }), false)
  writeFileSync(f, '-- versão antiga')
  assert.equal(await ponte.atualizarSeInstalado({ platform: 'linux', home }), true)
  assert.match(readFileSync(f, 'utf8'), /local VERSAO = 3/)
})

test('SFX: lista as sequências, lê a escolhida e encaixa os sons numa faixa nova com marcadores', { skip: !temLua && 'sem luajit' }, async () => {
  const troca = mkdtempSync(join(tmpdir(), 'troca-'))
  const ponte = new Ponte({ troca })
  const montada = {
    fps: 24,
    inicio: 86400,
    quadros: 720,
    video: [[{ nome: 'A001.mov', inicio: 0, fim: 120, arquivo: '/hd/A001.mov' }, { nome: 'A002.mov', inicio: 120, fim: 720, arquivo: '/hd/A002.mov', entrada: 30 }]],
    audio: [[{ nome: 'Musica.wav', inicio: 0, fim: 720, arquivo: '/hd/Musica.wav', entrada: 48 }]],
  }
  const seed = [['Diária 01 · Sessão 1 · Synquei', 3], ['Clipe · montagem final', 0, montada]]
  await ponte.enviar({ tipo: 'listar_linhas' })
  await ponte.enviar({ tipo: 'ler_linha', linha: 'Clipe · montagem final' })
  await ponte.enviar({ tipo: 'ler_linha', linha: 'Não existe' })
  await ponte.enviar({
    tipo: 'sfx',
    linha: 'Clipe · montagem final',
    marcadores: [{ quadro: 0, cor: 'Blue', nome: 'SFX · Abertura', nota: 'Começo da sequência' }, { quadro: 120, cor: 'Purple', nome: 'SFX · Corte', nota: 'Corte para A002.mov' }],
    sons: [{ caminho: '/sfx/Riser.wav', quadro: 0 }, { caminho: '/sfx/Whoosh.wav', quadro: 120 }, { caminho: '/sfx/Whoosh.wav', quadro: 400 }],
  })
  const r = rodar(troca, { seed })
  const resp = await ponte.verificar()
  assert.equal(resp.length, 4)
  const [lista, lida, erro, sfx] = resp
  assert.equal(lista.tipo, 'listar_linhas')
  assert.deepEqual(lista.sequencias.map((x) => x.nome), ['Diária 01 · Sessão 1 · Synquei', 'Clipe · montagem final'])
  assert.equal(lista.sequencias[1].quadros, 720)
  assert.equal(lida.linha.nome, 'Clipe · montagem final')
  assert.equal(lida.linha.fps, 24)
  assert.deepEqual(lida.linha.video[0].map((c) => [c.nome, c.inicio, c.fim]), [['A001.mov', 0, 120], ['A002.mov', 120, 720]])
  assert.equal(lida.linha.audio[0][0].entrada, 48)
  assert.equal(lida.linha.audio[0][0].arquivo, '/hd/Musica.wav')
  assert.equal(erro.ok, false)
  assert.match(erro.erro, /Não achei a sequência/)
  assert.equal(sfx.ok, true)
  assert.equal(sfx.marcados, 2)
  assert.equal(sfx.encaixados, 3)
  assert.equal(sfx.faixa, 2, 'faixa de áudio nova depois da música')
  // no DaVinci de mentira: a sequência analisada virou a aberta, com os marcadores e os sons na faixa nova
  assert.equal(r.corrente.nome, 'Clipe · montagem final')
  assert.deepEqual(r.corrente.marcadores.map((m) => [m.quadro, m.cor]), [[0, 'Blue'], [120, 'Purple']])
  assert.deepEqual(r.corrente.anexados.map((a) => [a.caminho, a.faixa, a.quadro, a.fim, a.pasta]), [
    ['/sfx/Riser.wav', 2, 86400, 35, 'SFX · Synquei'],
    ['/sfx/Whoosh.wav', 2, 86520, 35, 'SFX · Synquei'],
    ['/sfx/Whoosh.wav', 2, 86800, 35, 'SFX · Synquei'],
  ])
  assert.equal(r.corrente.nomesFaixas['2'], 'SFX · Synquei')
  // o mesmo som usado duas vezes entra uma vez só na Media Pool
  assert.equal(r.clips.filter((c) => c.pasta === 'SFX · Synquei').length, 2)
  // pedidos de SFX não entram no histórico de cartões da janelinha (o de encaixar entra)
  assert.equal(r.estado.historico.length, 1)
})
