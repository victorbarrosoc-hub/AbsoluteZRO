#!/bin/sh
# Instalação pelo Terminal, fechada ao público: este comando não baixa nem instala nada (titular, 01/11/2026: app não
# lançado não aparece em lugar nenhum, nem pelo nome). O instalador de verdade fica guardado fora do site
# (scripts/instalar-mac.sh) até o titular lançar o produto.
# Tudo dentro de main, chamada só na última linha: um download cortado no meio não roda pela metade.

main() {
  printf 'Indisponível. Nada foi baixado nem instalado.\n'
  printf 'https://absolutezro.com\n'
  exit 1
}

main "$@"
