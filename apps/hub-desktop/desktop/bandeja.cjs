// Ícone na barra de menus (Mac) e na bandeja (Windows): o Absolute ZRO fica em segundo plano, como o Creative Cloud.
// Aqui só o que dá para testar sem Electron: o menu (como lista de itens), o ícone certo para cada sistema e a dica.
// O main.cjs transforma a lista em Menu do Electron e liga cada `acao`.
//
// Menu curto, na ordem: Abrir Absolute ZRO · apps instalados (abrir cada um) · Procurar atualizações · Reiniciar e
// atualizar <app> (quando está "ao fechar") · Atualizar tudo (quando há mais de uma) · Abrir com o computador · Sair.

const OCUPADO = new Set(['baixando', 'instalando', 'fechando'])

/** Texto do item de cada app instalado (o clique abre o app). */
function rotuloDoApp(app, pendente) {
  if (!pendente) return app.nome
  if (pendente.fase === 'ao-fechar') return `${app.nome} · atualiza ao fechar`
  if (pendente.fase === 'instalando' || pendente.fase === 'fechando') return `${app.nome} · atualizando…`
  return app.nome
}

/**
 * @param {{ apps: {id:string,nome:string}[], pendentes: {id:string,nome:string,fase:string}[], procurando: boolean,
 *   abrirComSistema: boolean|null (null = este sistema não tem a opção) }} e
 * @returns {Array<{ tipo: 'item'|'separador'|'checkbox', acao?: string, id?: string, rotulo?: string, ativo?: boolean, marcado?: boolean }>}
 */
function modeloDoMenu({ apps = [], pendentes = [], procurando = false, abrirComSistema = null } = {}) {
  const porId = new Map(pendentes.map((p) => [p.id, p]))
  const itens = [{ tipo: 'item', acao: 'abrir', rotulo: 'Abrir Absolute ZRO' }]
  if (apps.length) {
    itens.push({ tipo: 'separador' })
    for (const a of apps) {
      const p = porId.get(a.id)
      itens.push({ tipo: 'item', acao: 'abrir-app', id: a.id, rotulo: rotuloDoApp(a, p), ativo: !(p && (p.fase === 'instalando' || p.fase === 'fechando')) })
    }
  }
  itens.push({ tipo: 'separador' })
  const algumOcupado = pendentes.some((p) => OCUPADO.has(p.fase))
  itens.push({ tipo: 'item', acao: 'procurar', rotulo: procurando ? 'Procurando atualizações…' : 'Procurar atualizações', ativo: !procurando && !algumOcupado })
  const aoFechar = pendentes.filter((p) => p.fase === 'ao-fechar')
  for (const p of aoFechar) itens.push({ tipo: 'item', acao: 'reiniciar-e-atualizar', id: p.id, rotulo: `Reiniciar e atualizar ${p.nome}` })
  const prontas = pendentes.filter((p) => p.fase === 'ao-fechar' || p.fase === 'erro')
  if (prontas.length > 1 || (prontas.length === 1 && prontas[0].fase === 'erro'))
    itens.push({ tipo: 'item', acao: 'atualizar-tudo', rotulo: 'Atualizar tudo', ativo: !algumOcupado })
  itens.push({ tipo: 'separador' })
  if (abrirComSistema !== null) itens.push({ tipo: 'checkbox', acao: 'abrir-com-sistema', rotulo: 'Abrir com o computador', marcado: !!abrirComSistema })
  itens.push({ tipo: 'item', acao: 'sair', rotulo: 'Sair do Absolute ZRO' })
  return itens
}

/** Dica ao parar o ponteiro no ícone. */
function dica({ pendentes = [] } = {}) {
  const n = pendentes.filter((p) => p.fase === 'ao-fechar').length
  if (pendentes.some((p) => p.fase === 'instalando' || p.fase === 'fechando')) return 'Absolute ZRO · atualizando apps'
  if (n === 1) return 'Absolute ZRO · 1 atualização pronta'
  if (n > 1) return `Absolute ZRO · ${n} atualizações prontas`
  return 'Absolute ZRO'
}

/**
 * Ícone para cada sistema (build/bandeja/, gerado por scripts/bandeja.mjs a partir do símbolo oficial).
 * Mac: imagem "template" (preta com alfa; o macOS pinta conforme a barra). Windows: branco na barra escura (o padrão)
 * e grafite na clara. Linux: branco (as barras costumam ser escuras).
 */
function iconeDaBandeja({ plataforma, barraClara = false } = {}) {
  if (plataforma === 'mac') return { arquivo: 'bandejaTemplate.png', template: true }
  if (plataforma === 'windows' && barraClara) return { arquivo: 'bandeja-grafite.png', template: false }
  return { arquivo: 'bandeja-branco.png', template: false }
}

/** Saída do `reg query …\Themes\Personalize /v SystemUsesLightTheme` → a barra de tarefas é clara? */
function barraClaraDoWindows(saida) {
  const m = /SystemUsesLightTheme\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(String(saida || ''))
  return !!m && parseInt(m[1], 16) === 1
}

module.exports = { modeloDoMenu, rotuloDoApp, dica, iconeDaBandeja, barraClaraDoWindows }
