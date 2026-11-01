// Ponte mínima para a página do HUB e para a tela "Sem conexão": diz que é o app de desktop, oferece "Tentar de novo"
// e a central de apps (window.zroDesktop.apps). Nada do Node chega à página, nem a sessão: a central fala com o HUB
// pelo processo principal, com o cookie da partição do app (que a página nunca lê).

const { contextBridge, ipcRenderer } = require('electron')

const plataforma = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux'

contextBridge.exposeInMainWorld('zroDesktop', {
  isDesktop: true,
  plataforma,
  /** Volta para o HUB (tela "Sem conexão"). */
  tentarDeNovo: () => ipcRenderer.invoke('zro:tentar-de-novo'),
  /** Abre o endereço que falhou no navegador padrão (tela "Sem conexão"). */
  abrirNoNavegador: () => ipcRenderer.invoke('zro:abrir-no-navegador'),
  /**
   * Central de apps: instala, abre, atualiza e remove as ferramentas. Só funciona na página do HUB; recebe só o id da
   * ferramenta (o que baixar vem dos apps da conta, conferido no processo principal). Respostas: { ok, dados?, erro? }.
   */
  apps: {
    // 2: listar traz `atualizacao` ({ fase: 'ao-fechar'|…, versao }) e há reiniciarEAtualizar; instalar com a
    // ferramenta aberta devolve 'ao-fechar' (instala quando ela fechar)
    // 3 (1.4, ADR 0035): listar traz `bloqueado` ({ plano } quando o plano não inclui o app) e `atualizacao.fase`
    // 'disponivel'; há atualizar, atualizarTudo e os Ajustes ("Atualizar sozinho" por app e abrir com o computador)
    versao: 3,
    listar: () => ipcRenderer.invoke('central:listar'),
    instalar: (id) => ipcRenderer.invoke('central:instalar', String(id)),
    atualizar: (id) => ipcRenderer.invoke('central:atualizar', String(id)),
    atualizarTudo: () => ipcRenderer.invoke('central:atualizar-tudo'),
    reiniciarEAtualizar: (id) => ipcRenderer.invoke('central:reiniciar-e-atualizar', String(id)),
    abrir: (id) => ipcRenderer.invoke('central:abrir', String(id)),
    remover: (id) => ipcRenderer.invoke('central:remover', String(id)),
    cancelar: (id) => ipcRenderer.invoke('central:cancelar', String(id)),
    ajustes: () => ipcRenderer.invoke('central:ajustes'),
    definirAtualizarSozinho: (id, ligado) => ipcRenderer.invoke('central:definir-atualizar-sozinho', String(id), ligado === true),
    definirAbrirComSistema: (ligado) => ipcRenderer.invoke('central:definir-abrir-com-sistema', ligado === true),
    /** Progresso: { id, fase: baixando|instalando|pronto|erro|removendo|removido|agendado, recebido?, total?, mensagem? }. */
    aoProgresso: (fn) => {
      const ouvinte = (_e, ev) => fn(ev)
      ipcRenderer.on('central:progresso', ouvinte)
      return () => ipcRenderer.removeListener('central:progresso', ouvinte)
    },
  },
})

addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('zro-desktop', `zro-desktop--${plataforma}`)
})
