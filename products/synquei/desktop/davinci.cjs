// Ponte com o DaVinci Resolve Studio. O Resolve só deixa mexer no projeto por script; o jeito que funciona sem
// instalar Python é um script Lua dentro dele (Workspace › Scripts › Synquei). Esse script abre uma janelinha, olha uma
// pasta de troca a cada 3 s e faz o que o Synquei pediu: cria as pastas na Media Pool (Diária › Câmeras › Dono ›
// Cartão, Áudio, Sequências, Assets), importa só o que ainda não está lá, pinta cada câmera com uma cor, preenche
// Cena/Take/Câmera/Cartão e troca as linhas do tempo da diária pelas novas.
//
// Pasta de troca:
//   indice.lua            return { ultimo = N }           (o Synquei grava)
//   pedidos/000012.lua    return { ...pedido... }         (o Synquei grava; Lua lê com dofile)
//   respostas/000012.json o que foi feito                 (o Lua grava; o Synquei lê e apaga os dois)
//   vivo.json             { quando, projeto, esperando }  (o Lua grava a cada passada)
//   feito.txt, ligado.txt, importados/, linhas/           (memória do Lua)
//
// No Windows a pasta fica em C:\ProgramData\Synquei\davinci: o Lua do Resolve abre arquivos pela página de código do
// sistema e um nome de usuário com acento quebraria o caminho dentro de AppData.

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { EventEmitter } = require('node:events')

// cores de clipe do Resolve, na ordem das cores dos aparelhos do Synquei (azul, laranja, verde-água, amarelo, rosa…)
const CORES_RESOLVE = ['Blue', 'Orange', 'Teal', 'Yellow', 'Pink', 'Green', 'Violet', 'Apricot', 'Navy', 'Lime', 'Purple', 'Olive', 'Tan', 'Beige', 'Brown', 'Chocolate']
const corResolve = (i) => CORES_RESOLVE[(Number(i) || 0) % CORES_RESOLVE.length]
const VERSAO = 3
const LOGO = path.join(__dirname, 'davinci-logo.png')
const UI_DIR = path.join(__dirname, 'davinci-ui')

/** Valor JS → código Lua (só dados: string, número, booleano, lista e objeto). */
function paraLua(v) {
  if (v == null) return 'nil'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'nil'
  if (typeof v === 'string') {
    // \ddd decimal: vale no Lua 5.1 (LuaJIT do Resolve); bytes UTF-8 passam como estão
    return '"' + v.replace(/[\\"\x00-\x1f\x7f]/g, (c) => (c === '\\' ? '\\\\' : c === '"' ? '\\"' : '\\' + String(c.charCodeAt(0)).padStart(3, '0'))) + '"'
  }
  if (Array.isArray(v)) return '{' + v.map(paraLua).join(', ') + '}'
  if (typeof v === 'object') {
    return '{' + Object.entries(v).filter(([, x]) => x !== undefined && x !== null).map(([k, x]) => `[${paraLua(String(k))}] = ${paraLua(x)}`).join(', ') + '}'
  }
  return 'nil'
}

/** Onde o Resolve procura os scripts do menu Workspace › Scripts. */
function pastaScripts(platform = process.platform, home = require('node:os').homedir(), env = process.env) {
  if (platform === 'darwin') return path.posix.join(home, 'Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility')
  if (platform === 'win32') return path.win32.join(env.APPDATA || path.win32.join(home, 'AppData', 'Roaming'), 'Blackmagic Design', 'DaVinci Resolve', 'Support', 'Fusion', 'Scripts', 'Utility')
  return path.posix.join(home, '.local/share/DaVinciResolve/Fusion/Scripts/Utility')
}

function pastaTroca(platform = process.platform, userData = '', env = process.env) {
  if (platform === 'win32') return path.win32.join(env.PROGRAMDATA || 'C:\\ProgramData', 'Synquei', 'davinci')
  return path.join(userData, 'davinci')
}

/** O script que vai para o Resolve, com a pasta de troca escrita dentro. */
function scriptLua({ troca }) {
  return `-- Synquei: organiza os cartões do SOBEDESCE neste projeto do DaVinci Resolve Studio.
-- Abra por Workspace > Scripts > Synquei e deixe a janelinha aberta. Instalado pelo app do Synquei; não edite.
local TROCA = ${paraLua(String(troca).replace(/\\/g, '/'))}
local VERSAO = ${VERSAO}
${LUA_CORPO}`
}

const LUA_CORPO = String.raw`
local WIN = package.config:sub(1, 1) == "\\"
local R = resolve or (Resolve and Resolve())

local function ler(c)
  local f = io.open(c, "rb")
  if not f then return nil end
  local s = f:read("*a")
  f:close()
  return s
end

local function gravar(c, s)
  local tmp = c .. ".tmp"
  local f = io.open(tmp, "wb")
  if not f then return false end
  f:write(s)
  f:close()
  os.remove(c)
  return os.rename(tmp, c)
end

local function carregar(c)
  local ok, v = pcall(dofile, c)
  if ok then return v end
  return nil
end

-- listas do Resolve chegam como tabela com chaves 1..n (às vezes como números com casa decimal)
local function lista(t)
  local out, ks = {}, {}
  if type(t) ~= "table" then return out end
  for k in pairs(t) do ks[#ks + 1] = k end
  table.sort(ks, function(a, b)
    if type(a) == "number" and type(b) == "number" then return a < b end
    return tostring(a) < tostring(b)
  end)
  for _, k in ipairs(ks) do out[#out + 1] = t[k] end
  return out
end

local function json(v)
  local t = type(v)
  if t == "nil" then return "null" end
  if t == "boolean" then return tostring(v) end
  if t == "number" then
    if v ~= v or v == math.huge or v == -math.huge then return "null" end
    return string.format("%.14g", v)
  end
  if t == "string" then
    local s = v:gsub('[%c"\\]', function(c)
      local m = { ['"'] = '\\"', ['\\'] = '\\\\', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }
      return m[c] or string.format("\\u%04x", c:byte())
    end)
    return '"' .. s .. '"'
  end
  if t == "table" then
    local n = 0
    for _ in pairs(v) do n = n + 1 end
    if n == 0 then return "[]" end
    if n == #v then
      local p = {}
      for i = 1, #v do p[i] = json(v[i]) end
      return "[" .. table.concat(p, ",") .. "]"
    end
    local p = {}
    for k, x in pairs(v) do p[#p + 1] = json(tostring(k)) .. ":" .. json(x) end
    table.sort(p)
    return "{" .. table.concat(p, ",") .. "}"
  end
  return "null"
end

local function normal(p)
  p = tostring(p or ""):gsub("\\", "/")
  if WIN then p = p:lower() end
  return p
end

local function arquivoSeguro(s)
  return (tostring(s):gsub('[^%w%-_. ]', "_"))
end

-- memória de linhas "chave<TAB>valor"
local function lerMapa(c)
  local m = {}
  local s = ler(c)
  if s then
    for linha in s:gmatch("[^\n]+") do
      local k, v = linha:match("^(.-)\t(.*)$")
      if k then m[k] = v end
    end
  end
  return m
end

local function gravarMapa(c, m)
  local p = {}
  for k, v in pairs(m) do p[#p + 1] = k .. "\t" .. tostring(v) end
  table.sort(p)
  gravar(c, table.concat(p, "\n") .. "\n")
end

-- ───────── Media Pool ─────────
local function subpasta(pool, pai, nome)
  for _, f in ipairs(lista(pai:GetSubFolderList())) do
    if f:GetName() == nome then return f end
  end
  return pool:AddSubFolder(pai, nome)
end

local function pastaDe(pool, caminho)
  local f = pool:GetRootFolder()
  for _, n in ipairs(caminho or {}) do
    local s = subpasta(pool, f, n)
    if not s then error("não consegui criar a pasta " .. n .. " na Media Pool") end
    f = s
  end
  return f
end

local function porCaminho(pasta)
  local m = {}
  for _, it in ipairs(lista(pasta:GetClipList())) do
    local p = it:GetClipProperty("File Path")
    if type(p) == "string" and p ~= "" then m[normal(p)] = it end
  end
  return m
end

local function aplicar(it, item, resp)
  if item.cor then
    if not pcall(function() it:SetClipColor(item.cor) end) then resp.avisos[#resp.avisos + 1] = "cor: " .. item.caminho end
  end
  for k, v in pairs(item.meta or {}) do
    pcall(function() it:SetMetadata(k, tostring(v)) end)
  end
end

local function importarItens(pool, pedido, resp, memoria)
  -- agrupa por pasta da Media Pool (o ImportMedia importa na pasta atual)
  local grupos, ordem = {}, {}
  for _, item in ipairs(pedido.itens or {}) do
    local k = table.concat(item.pasta or {}, "/")
    if not grupos[k] then grupos[k] = {}; ordem[#ordem + 1] = k end
    table.insert(grupos[k], item)
  end
  for _, k in ipairs(ordem) do
    local itens = grupos[k]
    local pasta = pastaDe(pool, itens[1].pasta)
    local ja = porCaminho(pasta)
    local novos, seqs = {}, {}
    for _, item in ipairs(itens) do
      local chave = normal(item.caminho)
      if ja[chave] then
        aplicar(ja[chave], item, resp)
        resp.jaEstavam = resp.jaEstavam + 1
      elseif memoria[chave] then
        -- já foi importado antes e alguém tirou da Media Pool: não volta
        resp.pulados = resp.pulados + 1
      elseif item.seq then
        seqs[#seqs + 1] = item
      else
        novos[#novos + 1] = item
      end
    end
    pool:SetCurrentFolder(pasta)
    if #novos > 0 then
      local caminhos = {}
      for i, item in ipairs(novos) do caminhos[i] = item.caminho end
      local vieram = lista(pool:ImportMedia(caminhos))
      local porC = {}
      for _, it in ipairs(vieram) do
        local p = it:GetClipProperty("File Path")
        if type(p) == "string" then porC[normal(p)] = it end
      end
      for _, item in ipairs(novos) do
        local it = porC[normal(item.caminho)]
        if it then
          aplicar(it, item, resp)
          memoria[normal(item.caminho)] = "1"
          resp.importados = resp.importados + 1
        else
          resp.falhas[#resp.falhas + 1] = item.caminho
        end
      end
    end
    for _, item in ipairs(seqs) do
      local vieram = lista(pool:ImportMedia({ { FilePath = item.seq.padrao, StartIndex = item.seq.ini, EndIndex = item.seq.fim } }))
      if vieram[1] then
        aplicar(vieram[1], item, resp)
        memoria[normal(item.caminho)] = "1"
        resp.importados = resp.importados + 1
      else
        resp.falhas[#resp.falhas + 1] = item.caminho
      end
    end
  end
end

-- ───────── linhas do tempo ─────────
local function contar(tl)
  local n = 0
  for _, tipo in ipairs({ "video", "audio" }) do
    local tracks = tonumber(tl:GetTrackCount(tipo)) or 0
    for t = 1, tracks do n = n + #lista(tl:GetItemListInTrack(tipo, t)) end
  end
  return n
end

local function linhas(proj)
  local out = {}
  local n = tonumber(proj:GetTimelineCount()) or 0
  for i = 1, n do
    local tl = proj:GetTimelineByIndex(i)
    if tl then out[#out + 1] = tl end
  end
  return out
end

local function comeca(s, p) return p ~= "" and s:sub(1, #p) == p end
local function termina(s, p) return p ~= "" and s:sub(-#p) == p end

-- a linha do tempo antiga sai só se ninguém mexeu nela (mesmo número de clipes de quando entrou); editada, fica com
-- outro nome
local function tirar(pool, tl, registro, resp)
  local nome = tl:GetName()
  if registro[nome] and tonumber(registro[nome]) == contar(tl) then
    pool:DeleteTimelines({ tl })
    resp.trocadas = resp.trocadas + 1
  else
    tl:SetName(nome .. " (editada " .. os.date("%d/%m %H:%M") .. ")")
    resp.guardadas[#resp.guardadas + 1] = nome
  end
  registro[nome] = nil
end

local function trocarLinhas(proj, pool, pedido, resp, registro)
  local L = pedido.linhas
  if not L then return end
  local novas = {}
  for _, x in ipairs(L.importar or {}) do novas[x.nome] = x end
  for _, tl in ipairs(linhas(proj)) do
    local nome = tl:GetName()
    if novas[nome] or (comeca(nome, L.prefixo or "") and termina(nome, L.sufixo or "")) then tirar(pool, tl, registro, resp) end
  end
  for _, x in ipairs(L.importar or {}) do
    pool:SetCurrentFolder(pastaDe(pool, x.pasta))
    local tl = pool:ImportTimelineFromFile(x.arquivo, { timelineName = x.nome, importSourceClips = false })
    if tl then
      registro[x.nome] = tostring(contar(tl))
      resp.linhas[#resp.linhas + 1] = x.nome
    else
      resp.falhas[#resp.falhas + 1] = x.arquivo
    end
  end
end

-- ───────── SFX: ler a linha do tempo aberta e encaixar os sons ─────────
-- a sequência escolhida pelo nome (ou a que estiver aberta)
local function linhaAtual(proj, nome)
  if nome then
    for i = 1, tonumber(proj:GetTimelineCount()) or 0 do
      local tl = proj:GetTimelineByIndex(i)
      if tl and tl:GetName() == nome then return tl end
    end
    error("Não achei a sequência “" .. tostring(nome) .. "” no projeto aberto")
  end
  local tl = proj:GetCurrentTimeline()
  if not tl then error("Abra uma linha do tempo no DaVinci") end
  return tl
end

-- as sequências do projeto aberto, para a pessoa escolher qual analisar
local function listarLinhas(proj)
  local atual = proj:GetCurrentTimeline()
  local nomeAtual = atual and atual:GetName() or nil
  local out = {}
  for i = 1, tonumber(proj:GetTimelineCount()) or 0 do
    local tl = proj:GetTimelineByIndex(i)
    if tl then
      local fps = tonumber(tl:GetSetting("timelineFrameRate")) or 24
      local q = (tonumber(tl:GetEndFrame()) or 0) - (tonumber(tl:GetStartFrame()) or 0)
      out[#out + 1] = { nome = tl:GetName(), quadros = q, fps = fps, aberta = tl:GetName() == nomeAtual }
    end
  end
  return out
end

-- a linha do tempo aberta, em quadros a partir do início dela: clipes de cada faixa com o arquivo de origem
local function lerLinha(proj, nome)
  local tl = linhaAtual(proj, nome)
  local fps = tonumber(tl:GetSetting("timelineFrameRate")) or tonumber(proj:GetSetting("timelineFrameRate")) or 24
  local ini = tonumber(tl:GetStartFrame()) or 0
  local out = { nome = tl:GetName(), fps = fps, quadros = (tonumber(tl:GetEndFrame()) or ini) - ini, video = {}, audio = {} }
  for _, tipo in ipairs({ "video", "audio" }) do
    for t = 1, tonumber(tl:GetTrackCount(tipo)) or 0 do
      local faixa = {}
      for _, it in ipairs(lista(tl:GetItemListInTrack(tipo, t))) do
        local arq = ""
        pcall(function()
          local mpi = it:GetMediaPoolItem()
          if mpi then arq = mpi:GetClipProperty("File Path") or "" end
        end)
        local entrada = 0
        pcall(function() entrada = tonumber(it:GetLeftOffset()) or 0 end)
        faixa[#faixa + 1] = { nome = it:GetName(), inicio = (tonumber(it:GetStart()) or ini) - ini, fim = (tonumber(it:GetEnd()) or ini) - ini, entrada = entrada, arquivo = arq }
      end
      out[tipo][t] = faixa
    end
  end
  return out
end

-- marcadores nos pontos sugeridos e/ou os sons numa faixa de áudio nova "SFX · Synquei"
local function aplicarSfx(proj, pool, pedido, resp)
  local tl = linhaAtual(proj, pedido.linha)
  -- os sons entram na sequência analisada: ela vira a aberta
  pcall(function() proj:SetCurrentTimeline(tl) end)
  local ini = tonumber(tl:GetStartFrame()) or 0
  resp.marcados, resp.encaixados = 0, 0
  for _, m in ipairs(pedido.marcadores or {}) do
    local ok = pcall(function() return tl:AddMarker(m.quadro, m.cor or "Purple", m.nome or "SFX", m.nota or "", 1) end)
    if ok then resp.marcados = resp.marcados + 1 end
  end
  local sons = pedido.sons or {}
  if #sons == 0 then return end
  local pasta = pastaDe(pool, { "SFX · Synquei" })
  pool:SetCurrentFolder(pasta)
  local ja = porCaminho(pasta)
  local faltam, vistos = {}, {}
  for _, s in ipairs(sons) do
    local k = normal(s.caminho)
    if not ja[k] and not vistos[k] then vistos[k] = true; faltam[#faltam + 1] = s.caminho end
  end
  if #faltam > 0 then
    for _, it in ipairs(lista(pool:ImportMedia(faltam))) do
      local p = it:GetClipProperty("File Path")
      if type(p) == "string" then ja[normal(p)] = it end
    end
  end
  pcall(function() tl:AddTrack("audio", "stereo") end)
  local faixa = tonumber(tl:GetTrackCount("audio")) or 1
  pcall(function() tl:SetTrackName("audio", faixa, "SFX · Synquei") end)
  local infos = {}
  for _, s in ipairs(sons) do
    local it = ja[normal(s.caminho)]
    if it then
      local q = tonumber(it:GetClipProperty("Frames")) or tonumber(s.quadros) or 48
      infos[#infos + 1] = { mediaPoolItem = it, startFrame = 0, endFrame = math.max(1, q - 1), trackIndex = faixa, recordFrame = ini + s.quadro, mediaType = 2 }
    else
      resp.falhas[#resp.falhas + 1] = s.caminho
    end
  end
  if #infos > 0 then resp.encaixados = #lista(pool:AppendToTimeline(infos)) end
  resp.faixa = faixa
end

-- ───────── pedidos ─────────
local function projetoAberto()
  if not R then return nil, nil, nil end
  local pm = R:GetProjectManager()
  local proj = pm and pm:GetCurrentProject()
  return proj, proj and proj:GetName() or nil, pm
end

local function aceita(pedido, nome)
  if not nome then return false end
  -- SFX vale para o projeto e a linha do tempo que estiverem abertos
  if pedido.tipo then return true end
  if nome == pedido.projeto then return true end
  return lerMapa(TROCA .. "/ligado.txt")[pedido.pastaId or ""] == nome
end

local function processar(pedido, proj, nome)
  local pool = proj:GetMediaPool()
  local resp = { seq = pedido.seq, tipo = pedido.tipo, ok = true, projeto = nome, importados = 0, jaEstavam = 0, pulados = 0, trocadas = 0, linhas = {}, guardadas = {}, falhas = {}, avisos = {} }
  local base = arquivoSeguro(nome)
  local memF = TROCA .. "/importados/" .. base .. ".txt"
  local regF = TROCA .. "/linhas/" .. base .. ".txt"
  local memoria = lerMapa(memF)
  local registro = lerMapa(regF)
  local ok, err = pcall(function()
    if pedido.tipo == "listar_linhas" then
      resp.sequencias = listarLinhas(proj)
    elseif pedido.tipo == "ler_linha" then
      resp.linha = lerLinha(proj, pedido.linha)
    elseif pedido.tipo == "sfx" then
      aplicarSfx(proj, pool, pedido, resp)
    else
      importarItens(pool, pedido, resp, memoria)
      trocarLinhas(proj, pool, pedido, resp, registro)
    end
  end)
  gravarMapa(memF, memoria)
  gravarMapa(regF, registro)
  pcall(function() pool:SetCurrentFolder(pool:GetRootFolder()) end)
  if not ok then resp.ok = false; resp.erro = tostring(err) end
  return resp
end

local estado = { texto = "Procurando pedidos do Synquei…", detalhe = "", situacao = "procurando", esperando = nil, pastaId = nil, projeto = nil, fila = 0, historico = {} }
local HIST = TROCA .. "/historico.txt"

-- últimos cartões organizados (sobrevive a fechar o DaVinci): hora, cartão, clipes novos, linhas do tempo, ok, erro
local function lerHistorico()
  local s = ler(HIST)
  local h = {}
  if s then
    for linha in s:gmatch("[^\n]+") do
      local q, r, i, l, ok, c, e = linha:match("^(%d+)\t(.-)\t(%d+)\t(%d+)\t(%d)\t(%d*)\t?(.*)$")
      if q then h[#h + 1] = { quando = tonumber(q), rotulo = r, importados = tonumber(i), linhas = tonumber(l), ok = ok == "1", cor = tonumber(c), erro = e ~= "" and e or nil } end
    end
  end
  return h
end

local function anotar(pedido, resp)
  local limpo = function(x) return (tostring(x or ""):gsub("[\t\n\r]", " ")) end
  local sfx = pedido.tipo == "sfx"
  local rotulo = sfx and ("SFX · " .. tostring(pedido.linha or "sequência")) or pedido.cartao or pedido.diaria or ("Pedido " .. pedido.seq)
  table.insert(estado.historico, 1, { quando = resp.quando, rotulo = rotulo, importados = sfx and (resp.encaixados or 0) or resp.importados, linhas = #resp.linhas, ok = resp.ok, cor = tonumber(pedido.cor), erro = resp.erro })
  while #estado.historico > 6 do table.remove(estado.historico) end
  local p = {}
  for _, x in ipairs(estado.historico) do
    p[#p + 1] = table.concat({ x.quando, limpo(x.rotulo), x.importados, x.linhas, x.ok and 1 or 0, x.cor or "", limpo(x.erro) }, "\t")
  end
  gravar(HIST, table.concat(p, "\n") .. "\n")
end
estado.historico = lerHistorico()

local function passada()
  local idx = carregar(TROCA .. "/indice.lua") or { ultimo = 0 }
  local feito = tonumber(ler(TROCA .. "/feito.txt") or "0") or 0
  local proj, nome, pm = projetoAberto()
  estado.esperando, estado.pastaId = nil, nil
  local feitos, erro = 0, nil
  for seq = feito + 1, tonumber(idx.ultimo) or 0 do
    local arq = string.format("%s/pedidos/%06d.lua", TROCA, seq)
    local pedido = carregar(arq)
    if pedido then
      pedido.seq = seq
      if not proj or not aceita(pedido, nome) then
        estado.esperando, estado.pastaId = pedido.projeto, pedido.pastaId
        break
      end
      local resp = processar(pedido, proj, nome)
      resp.quando = os.time()
      gravar(string.format("%s/respostas/%06d.json", TROCA, seq), json(resp))
      if pedido.tipo ~= "ler_linha" and pedido.tipo ~= "listar_linhas" then
        anotar(pedido, resp)
        if not resp.ok then erro = resp.erro end
        feitos = feitos + 1
      end
    end
    feito = seq
    gravar(TROCA .. "/feito.txt", tostring(feito))
  end
  estado.projeto = nome
  estado.fila = math.max(0, (tonumber(idx.ultimo) or 0) - feito)
  if estado.esperando then
    estado.situacao = "esperando"
    estado.texto = "Esperando o projeto “" .. estado.esperando .. "”"
    estado.detalhe = "Abra esse projeto no DaVinci ou use o que está aberto" .. (nome and (" (“" .. nome .. "”)") or "") .. "."
  elseif erro then
    estado.situacao = "erro"
    estado.texto = "Não deu certo no último cartão"
    estado.detalhe = erro
  elseif feitos > 0 then
    estado.situacao = "ok"
    estado.texto = "Organizado às " .. os.date("%H:%M")
    estado.detalhe = feitos == 1 and "1 cartão novo no projeto." or (feitos .. " cartões novos no projeto.")
  elseif nome then
    estado.situacao = "ok"
    estado.texto = "Ligado ao projeto “" .. nome .. "”"
    estado.detalhe = "Esperando o próximo cartão do SOBEDESCE."
  else
    estado.situacao = "semprojeto"
    estado.texto = "Abra um projeto no DaVinci"
    estado.detalhe = "Os cartões entram no projeto com o mesmo nome do projeto do SOBEDESCE."
  end
  gravar(TROCA .. "/vivo.json", json({ quando = os.time(), projeto = nome, esperando = estado.esperando, versao = VERSAO, feito = feito }))
  return feitos
end

local function usarAberto()
  local _, nome = projetoAberto()
  if not (nome and estado.pastaId) then return end
  local m = lerMapa(TROCA .. "/ligado.txt")
  m[estado.pastaId] = nome
  gravarMapa(TROCA .. "/ligado.txt", m)
end

local function abrirEsperado()
  local _, _, pm = projetoAberto()
  if not (pm and estado.esperando) then return end
  if not pm:LoadProject(estado.esperando) then pm:CreateProject(estado.esperando) end
end

-- ───────── janela: o mesmo desenho do app do Synquei no computador (tema escuro) ─────────
local C = { bg = "#0b0b0c", surface = "#161618", surface2 = "#1c1c1f", text = "#f5f5f7", text2 = "#a1a1a6", text3 = "#6e6e73", hair = "rgba(255,255,255,0.09)", hair2 = "rgba(255,255,255,0.14)", ok = "#4cd471", warn = "#ffb340", err = "#ff6961" }
local FONTE = '"SF Pro Text", -apple-system, "Segoe UI Variable Text", "Segoe UI", "Helvetica Neue", Arial, sans-serif'
-- dentro do style="" do HTML: nomes de fonte com aspas simples
local FONTE_TITULO = "'SF Pro Display', -apple-system, 'Segoe UI Variable Display', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
local UI = TROCA .. "/ui/"
local LOGO = TROCA .. "/synquei-logo.png"

local function esc(s)
  return (tostring(s or ""):gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"))
end

local function plural(n, um, varios)
  return tostring(n) .. " " .. (n == 1 and um or varios)
end

-- imagem só se o arquivo existir (sem o ícone, a janela continua legível)
local function img(arq, w, h)
  if not ler(arq) then return "" end
  return '<img src="' .. arq .. '" width="' .. w .. '" height="' .. (h or w) .. '">'
end

local function span(cor, tam, txt, peso)
  return '<span style="color:' .. cor .. '; font-size:' .. tam .. 'px;' .. (peso and " font-weight:600;" or "") .. '">' .. txt .. "</span>"
end

local PILULAS = {
  ok = { "Ligado", C.ok, "rgba(48,209,88,0.16)" },
  esperando = { "Esperando", C.warn, "rgba(255,159,10,0.18)" },
  erro = { "Com erro", C.err, "rgba(255,69,58,0.16)" },
  semprojeto = { "Sem projeto", C.text2, "rgba(255,255,255,0.08)" },
  procurando = { "Procurando", C.text2, "rgba(255,255,255,0.08)" },
}

-- os textos da janela (HTML simples do Qt), a partir do estado
local function textos()
  local sit = estado.situacao
  local t = {}
  local p = PILULAS[sit] or PILULAS.procurando
  t.pilula = "●  " .. p[1]
  t.pilulaEstilo = "QLabel { background-color: " .. p[3] .. "; color: " .. p[2] .. "; border-radius: 12px; padding: 4px 12px; font-size: 12px; font-weight: 600; }"
  t.marca = img(LOGO, 26) .. "&nbsp;&nbsp;" .. span(C.text, 19, "<b>Synquei</b>")
  t.titulo = '<span style="font-family:' .. FONTE_TITULO .. '; font-size:30px; font-weight:700; color:' .. C.text .. ';">Organizar</span><br>'
    .. span(C.text2, 14, "Cada cartão que o SOBEDESCE termina entra sozinho neste projeto: pastas por diária, câmera e cartão, cores e as linhas do tempo sincronizadas.")
  local icone = ({ ok = "status-ok", esperando = "status-esperando", erro = "status-erro" })[sit] or "status-off"
  t.status = '<table cellspacing="0" cellpadding="0"><tr><td valign="middle" style="padding-right:16px;">' .. img(UI .. icone .. ".png", 48) .. "</td>"
    .. '<td valign="middle">' .. span(C.text, 20, esc(estado.texto), true) .. "<br>" .. span(C.text2, 14, esc(estado.detalhe)) .. "</td></tr></table>"
  local function bloco(icone2, titulo, valor)
    return img(UI .. icone2 .. ".png", 34) .. "<br><br>" .. span(C.text, 14, titulo, true) .. "<br>" .. span(C.text2, 13, esc(valor))
  end
  local u = estado.historico[1]
  t.projeto = bloco("tile-projeto", "Projeto no DaVinci", estado.projeto or "Nenhum aberto")
  t.fila = bloco("tile-fila", "Na fila", estado.fila == 0 and "Nada esperando" or plural(estado.fila, "cartão esperando", "cartões esperando"))
  t.ultimo = bloco("tile-ultimo", "Último cartão", u and (os.date("%H:%M", u.quando) .. " · " .. plural(u.importados or 0, "clipe novo", "clipes novos")) or "Ainda nenhum")
  local linhas = {}
  for _, x in ipairs(estado.historico) do
    local titulo, sub = x.rotulo:match("^(.-) · (.+)$")
    if not titulo then titulo, sub = x.rotulo, "" end
    -- "Diária 01 · Aladim - FX30 · Cartão 01" → título "Aladim - FX30 · Cartão 01", embaixo a diária e os números
    local diaria, resto = x.rotulo:match("^(Di[^·]-) · (.+)$")
    if diaria then titulo, sub = resto, diaria end
    local nums = plural(x.importados or 0, "clipe", "clipes") .. ((x.linhas or 0) > 0 and (" · " .. plural(x.linhas, "linha do tempo", "linhas do tempo")) or "")
    local selo = x.ok and span(C.ok, 12, "●&nbsp;Organizado", true) or span(C.err, 12, "●&nbsp;Com erro", true)
    linhas[#linhas + 1] = '<tr><td valign="middle" style="padding:8px 14px 8px 0;">' .. img(UI .. "thumb-" .. math.min(8, tonumber(x.cor) or 8) .. ".png", 40) .. "</td>"
      .. '<td valign="middle" width="100%" style="padding:8px 0;">' .. span(C.text, 14, esc(titulo), true) .. "<br>"
      .. span(C.text2, 12.5, esc(sub ~= "" and (sub .. " · ") or "") .. (x.ok and nums or esc(x.erro or "erro")) .. " · " .. os.date("%H:%M", x.quando)) .. "</td>"
      .. '<td valign="middle" align="right" style="padding:8px 0 8px 12px;">' .. selo .. "</td></tr>"
  end
  t.historico = span(C.text, 15, "Últimos cartões", true) .. (#estado.historico > 0 and ("&nbsp;&nbsp;" .. span(C.text2, 12, tostring(#estado.historico))) or "") .. "<br>"
    .. (#linhas > 0 and ('<table width="100%" cellspacing="0" cellpadding="0">' .. table.concat(linhas) .. "</table>")
      or ("<br>" .. span(C.text2, 13, "Os cartões aparecem aqui quando o SOBEDESCE terminar de passar e o Synquei sincronizar.")))
  t.pe = span(C.text3, 11.5, "Deixe esta janela aberta enquanto grava · nada sai do seu computador")
  t.esperando = sit == "esperando"
  t.abrir = t.esperando and ("Abrir “" .. estado.esperando .. "”") or "Abrir o projeto esperado"
  return t
end

if SYNQUEI_TESTE then
  return { passada = passada, json = json, usarAberto = usarAberto, abrirEsperado = abrirEsperado, estado = estado, textos = textos }
end

local BASE = "QWidget { background-color: " .. C.bg .. "; color: " .. C.text .. "; font-family: " .. FONTE .. "; font-size: 13px; } QLabel { background-color: transparent; }"
local function cartao(raio, pad)
  return "QLabel { background-color: " .. C.surface .. "; border: 1px solid " .. C.hair .. "; border-radius: " .. raio .. "px; padding: " .. pad .. "; color: " .. C.text .. "; }"
end
local PRIMARIO = "QPushButton { background-color: " .. C.text .. "; color: " .. C.bg .. "; border: none; border-radius: 18px; min-height: 36px; max-height: 36px; padding: 0 20px; font-size: 14px; font-weight: 600; }"
  .. " QPushButton:hover { background-color: #ffffff; } QPushButton:pressed { background-color: #d8d8dc; }"
local SECUNDARIO = "QPushButton { background-color: transparent; color: " .. C.text .. "; border: 1px solid " .. C.hair2 .. "; border-radius: 18px; min-height: 34px; max-height: 34px; padding: 0 18px; font-size: 14px; font-weight: 600; }"
  .. " QPushButton:hover { background-color: rgba(255,255,255,0.06); } QPushButton:pressed { background-color: rgba(255,255,255,0.10); }"
  .. " QPushButton:disabled { color: " .. C.text3 .. "; border-color: " .. C.hair .. "; }"

local ui = fu.UIManager
local disp = bmd.UIDispatcher(ui)
local t0 = textos()
local function icone(nome)
  local arq = UI .. nome .. ".png"
  if not ler(arq) then return nil end
  local ok, i = pcall(function() return ui:Icon({ File = arq }) end)
  return ok and i or nil
end
local win = disp:AddWindow({ ID = "SynqueiJanela", WindowTitle = "Synquei", Geometry = { 120, 120, 700, 720 }, StyleSheet = BASE },
  ui:VGroup({ Spacing = 14,
    ui:HGroup({ Weight = 0,
      ui:Label({ ID = "Marca", Text = t0.marca, Weight = 1 }),
      ui:Label({ ID = "Pilula", Text = t0.pilula, Weight = 0, StyleSheet = t0.pilulaEstilo, Alignment = { AlignHCenter = true, AlignVCenter = true } }),
    }),
    ui:Label({ ID = "Titulo", Text = t0.titulo, WordWrap = true, Weight = 0 }),
    ui:Label({ ID = "Status", Text = t0.status, WordWrap = true, Weight = 0, StyleSheet = cartao(22, "20px 22px") }),
    ui:HGroup({ Weight = 0, Spacing = 10,
      ui:Button({ ID = "Agora", Text = "  Organizar agora", Icon = icone("botao-sync"), IconSize = { 16, 16 }, StyleSheet = PRIMARIO, Weight = 0 }),
      ui:Button({ ID = "Usar", Text = "  Usar o projeto aberto", Icon = icone("botao-check"), IconSize = { 16, 16 }, StyleSheet = SECUNDARIO, Weight = 0 }),
      ui:Button({ ID = "Abrir", Text = "  " .. t0.abrir, Icon = icone("botao-folder"), IconSize = { 16, 16 }, StyleSheet = SECUNDARIO, Weight = 0 }),
      ui:HGap(0, 1),
    }),
    ui:HGroup({ Weight = 0, Spacing = 12,
      ui:Label({ ID = "Projeto", Text = t0.projeto, WordWrap = true, StyleSheet = cartao(16, "16px 18px") }),
      ui:Label({ ID = "Fila", Text = t0.fila, WordWrap = true, StyleSheet = cartao(16, "16px 18px") }),
      ui:Label({ ID = "Ultimo", Text = t0.ultimo, WordWrap = true, StyleSheet = cartao(16, "16px 18px") }),
    }),
    ui:Label({ ID = "Historico", Text = t0.historico, WordWrap = true, Weight = 1, StyleSheet = cartao(16, "18px 20px"), Alignment = { AlignTop = true, AlignLeft = true } }),
    ui:Label({ ID = "Pe", Text = t0.pe, Weight = 0, Alignment = { AlignHCenter = true } }),
  }))
local itm = win:GetItems()
-- o fundo escuro vale para a janela toda (algumas versões do Resolve ignoram o StyleSheet passado na criação)
pcall(function() itm.SynqueiJanela.StyleSheet = BASE end)

local function desenhar(t)
  itm.Pilula.Text = t.pilula
  pcall(function() itm.Pilula.StyleSheet = t.pilulaEstilo end)
  itm.Status.Text = t.status
  itm.Projeto.Text = t.projeto
  itm.Fila.Text = t.fila
  itm.Ultimo.Text = t.ultimo
  itm.Historico.Text = t.historico
  itm.Abrir.Text = "  " .. t.abrir
  -- "Usar" e "Abrir" só aparecem quando há cartões esperando outro projeto
  for _, id in ipairs({ "Usar", "Abrir" }) do
    pcall(function() itm[id].Enabled = t.esperando end)
    pcall(function() itm[id].Hidden = not t.esperando end)
  end
end

-- o relógio do Resolve e o clique podem chamar juntos: uma passada a cada meio segundo, no máximo
local ultimo = nil
local function tick()
  if ultimo and os.clock() - ultimo < 0.5 then return end
  ultimo = os.clock()
  local ok, err = pcall(passada)
  if not ok then
    estado.situacao, estado.texto, estado.detalhe = "erro", "Não deu certo", tostring(err)
  end
  desenhar(textos())
end
function win.On.SynqueiJanela.Close(ev) disp:ExitLoop() end
function win.On.Agora.Clicked(ev) ultimo = nil; tick() end
function win.On.Usar.Clicked(ev) usarAberto(); ultimo = nil; tick() end
function win.On.Abrir.Clicked(ev) abrirEsperado(); ultimo = nil; tick() end
local timer = ui:Timer({ ID = "SynqueiRelogio", Interval = 3000 })
pcall(function() disp.On.Timeout = function(ev) tick() end end)
pcall(function() win.On.SynqueiRelogio.Timeout = function(ev) tick() end end)
tick()
timer:Start()
win:Show()
disp:RunLoop()
timer:Stop()
win:Hide()
`

class Ponte extends EventEmitter {
  constructor({ troca, intervaloMs = 3000, log = () => {} } = {}) {
    super()
    this.troca = troca
    this.intervaloMs = intervaloMs
    this.log = log
    this.timer = null
    this.respostas = []
  }

  async #pastas() {
    for (const d of ['pedidos', 'respostas', 'importados', 'linhas']) await fsp.mkdir(path.join(this.troca, d), { recursive: true })
  }

  async #ultimo() {
    try {
      const m = /ultimo\s*=\s*(\d+)/.exec(await fsp.readFile(path.join(this.troca, 'indice.lua'), 'utf8'))
      return m ? Number(m[1]) : 0
    } catch {
      return 0
    }
  }

  async #gravar(f, s) {
    await fsp.writeFile(f + '.tmp', s)
    await fsp.rename(f + '.tmp', f)
  }

  /** Põe um pedido na fila do Resolve. O pedido fica inteiro no disco antes de o índice apontar para ele. */
  async enviar(pedido) {
    await this.#pastas()
    const seq = (await this.#ultimo()) + 1
    const nome = String(seq).padStart(6, '0')
    await this.#gravar(path.join(this.troca, 'pedidos', `${nome}.lua`), `return ${paraLua({ ...pedido, v: VERSAO })}\n`)
    await this.#gravar(path.join(this.troca, 'indice.lua'), `return { ultimo = ${seq} }\n`)
    this.emit('mudou', await this.status())
    return seq
  }

  /** Respostas novas do Resolve: emite e apaga o pedido e a resposta. */
  async verificar() {
    let nomes = []
    try {
      nomes = (await fsp.readdir(path.join(this.troca, 'respostas'))).filter((n) => /^\d{6}\.json$/.test(n)).sort()
    } catch {
      return []
    }
    const out = []
    for (const n of nomes) {
      const f = path.join(this.troca, 'respostas', n)
      let r
      try {
        r = JSON.parse(await fsp.readFile(f, 'utf8'))
      } catch {
        continue
      }
      out.push(r)
      this.respostas.unshift(r)
      this.respostas.length = Math.min(this.respostas.length, 30)
      await fsp.rm(f, { force: true })
      await fsp.rm(path.join(this.troca, 'pedidos', n.replace('.json', '.lua')), { force: true })
      this.emit('resposta', r)
    }
    if (out.length) this.emit('mudou', await this.status())
    return out
  }

  async status({ platform = process.platform, home = require('node:os').homedir(), env = process.env } = {}) {
    let vivo = null
    try {
      vivo = JSON.parse(await fsp.readFile(path.join(this.troca, 'vivo.json'), 'utf8'))
    } catch {}
    const ultimo = await this.#ultimo()
    const feito = vivo && Number(vivo.feito) >= 0 ? Number(vivo.feito) : Number(String(await fsp.readFile(path.join(this.troca, 'feito.txt'), 'utf8').catch(() => '0')).trim()) || 0
    const script = path.join(pastaScripts(platform, home, env), 'Synquei.lua')
    return {
      instalado: fs.existsSync(script),
      script,
      // a janelinha grava vivo.json a cada 3 s
      conectado: !!(vivo && Date.now() / 1000 - Number(vivo.quando) < 20),
      projeto: (vivo && vivo.projeto) || null,
      esperando: (vivo && vivo.esperando) || null,
      fila: Math.max(0, ultimo - feito),
      respostas: this.respostas.slice(0, 10),
    }
  }

  /** Copia o script para o menu do Resolve (Workspace › Scripts › Synquei). */
  async instalar({ platform = process.platform, home = require('node:os').homedir(), env = process.env } = {}) {
    await this.#pastas()
    const dir = pastaScripts(platform, home, env)
    await fsp.mkdir(dir, { recursive: true })
    const f = path.join(dir, 'Synquei.lua')
    await this.#gravar(f, scriptLua({ troca: this.troca }))
    // o logo da janelinha (o script mostra se achar)
    await fsp.copyFile(LOGO, path.join(this.troca, 'synquei-logo.png')).catch(() => {})
    await fsp.mkdir(path.join(this.troca, 'ui'), { recursive: true })
    for (const n of await fsp.readdir(UI_DIR).catch(() => [])) if (n.endsWith('.png')) await fsp.copyFile(path.join(UI_DIR, n), path.join(this.troca, 'ui', n))
    this.emit('mudou', await this.status({ platform, home, env }))
    return f
  }

  /** App atualizado: o script que já estava no Resolve é trocado pelo novo (vale ao abrir o script de novo). */
  async atualizarSeInstalado(opts = {}) {
    const f = path.join(pastaScripts(opts.platform, opts.home, opts.env), 'Synquei.lua')
    let atual
    try {
      atual = await fsp.readFile(f, 'utf8')
    } catch {
      return false
    }
    if (atual === scriptLua({ troca: this.troca }) && fs.existsSync(path.join(this.troca, 'ui', 'status-ok.png'))) return false
    await this.instalar(opts)
    return true
  }

  start() {
    if (this.timer) return
    this.atualizarSeInstalado().catch((err) => this.log('davinci: atualizar script:', err && err.message))
    const tick = async () => {
      await this.verificar().catch((err) => this.log('davinci:', err && err.message))
      if (this.timer !== null) this.timer = setTimeout(tick, this.intervaloMs)
    }
    this.timer = setTimeout(tick, 1000)
  }

  stop() {
    clearTimeout(this.timer)
    this.timer = null
  }
}

module.exports = { Ponte, paraLua, scriptLua, pastaScripts, pastaTroca, corResolve, CORES_RESOLVE, VERSAO }
