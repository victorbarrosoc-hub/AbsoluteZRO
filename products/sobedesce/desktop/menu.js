// Menu do app de desktop, todo em português. Sem Electron aqui (test/desktop.test.js confere os rótulos).
//
// Os papéis prontos do Electron que montam um menu inteiro (appMenu, fileMenu, editMenu, windowMenu) trazem os itens
// em inglês ("Undo", "Close Window", "Quit SOBEDESCE"…), e só o título levava o rótulo em português. Aqui cada item
// tem o papel do sistema (atalhos e comportamento nativos) e o próprio rótulo.

/**
 * @param {{ isMac: boolean, zoom: () => ({ tamanhoReal(): void, aumentar(): void, diminuir(): void } | null),
 *   abrirLogs: () => void, abrirNoNavegador: () => void }} o
 */
export function modeloDoMenu({ isMac, zoom, abrirLogs, abrirNoNavegador }) {
  return [
    ...(isMac
      ? [
          {
            label: 'SOBEDESCE',
            submenu: [
              { role: 'about', label: 'Sobre o SOBEDESCE' },
              { type: 'separator' },
              { role: 'services', label: 'Serviços' },
              { type: 'separator' },
              { role: 'hide', label: 'Ocultar o SOBEDESCE' },
              { role: 'hideOthers', label: 'Ocultar outros' },
              { role: 'unhide', label: 'Mostrar todos' },
              { type: 'separator' },
              { role: 'quit', label: 'Sair do SOBEDESCE' },
            ],
          },
        ]
      : []),
    {
      label: 'Arquivo',
      submenu: [isMac ? { role: 'close', label: 'Fechar janela' } : { role: 'quit', label: 'Sair', accelerator: 'Ctrl+Q' }],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Desfazer' },
        { role: 'redo', label: 'Refazer' },
        { type: 'separator' },
        { role: 'cut', label: 'Recortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Colar' },
        { role: 'pasteAndMatchStyle', label: 'Colar sem formatação' },
        { role: 'delete', label: 'Apagar' },
        { role: 'selectAll', label: 'Selecionar tudo' },
      ],
    },
    {
      label: 'Visualizar',
      submenu: [
        { role: 'reload', label: 'Recarregar' },
        { role: 'toggleDevTools', label: 'Ferramentas do desenvolvedor' },
        { type: 'separator' },
        { label: 'Tamanho real', accelerator: 'CmdOrCtrl+0', click: () => zoom()?.tamanhoReal() },
        { label: 'Aumentar', accelerator: 'CmdOrCtrl+=', click: () => zoom()?.aumentar() },
        { label: 'Aumentar', accelerator: 'CmdOrCtrl+Plus', click: () => zoom()?.aumentar(), visible: false, acceleratorWorksWhenHidden: true },
        { label: 'Diminuir', accelerator: 'CmdOrCtrl+-', click: () => zoom()?.diminuir() },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tela cheia' },
      ],
    },
    {
      label: 'Janela',
      role: 'window',
      submenu: [
        { role: 'minimize', label: 'Minimizar' },
        ...(isMac
          ? [{ role: 'zoom', label: 'Zoom' }, { type: 'separator' }, { role: 'front', label: 'Trazer tudo para a frente' }]
          : [{ role: 'close', label: 'Fechar' }]),
      ],
    },
    {
      role: 'help',
      label: 'Ajuda',
      submenu: [
        { label: 'Abrir pasta de logs', click: abrirLogs },
        { label: 'Abrir no navegador', click: abrirNoNavegador },
      ],
    },
  ]
}
