// Ponte mínima entre a página e o sistema (app/ponte.js usa): caminho do arquivo escolhido, a pasta do SOBEDESCE,
// onde gravar a exportação e o vídeo, salvar o projeto. Nada mais do Node chega à página.

const { contextBridge, webUtils, ipcRenderer } = require('electron')

const chamar = (canal) => (...a) => ipcRenderer.invoke(canal, ...a)

contextBridge.exposeInMainWorld('aiEditDesktop', {
  isDesktop: true,
  platform: process.platform,
  caminhoDe(arquivo) {
    try {
      return webUtils.getPathForFile(arquivo) || null
    } catch {
      return null
    }
  },
  permitir: chamar('midia:permitir'),
  sobedesce: chamar('sobedesce:abrir'),
  escolherPasta: chamar('saida:pasta'),
  gravar: chamar('saida:gravar'),
  escolherArquivo: chamar('saida:arquivo'),
  arquivo: { abrir: chamar('arquivo:abrir'), escrever: chamar('arquivo:escrever'), fechar: chamar('arquivo:fechar') },
  salvarProjeto: chamar('projeto:salvar'),
  mostrarNaPasta: chamar('mostrar'),
  projetos: { listar: chamar('projetos:listar'), gravar: chamar('projetos:gravar'), ler: chamar('projetos:ler'), apagar: chamar('projetos:apagar') },
})

addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('is-desktop', `platform-${process.platform}`)
})
