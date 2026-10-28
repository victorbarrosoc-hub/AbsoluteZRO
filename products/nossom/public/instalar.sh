#!/bin/sh
# NOSSOM · instalação pelo Terminal
#
#   curl -fsSL https://nossom-teal.vercel.app/instalar.sh | bash
#
# O NOSSOM está em desenvolvimento e fechado ao público (28/10/2026): este comando não baixa nem instala nada.
# O instalador de verdade fica guardado fora do site (scripts/instalar-mac.sh) até o proprietário abrir o produto.
# Tudo dentro de main, chamada só na última linha: um download cortado no meio não roda pela metade.

main() {
  if [ -t 1 ]; then
    NEGRITO="$(printf '\033[1m')"
    FRACO="$(printf '\033[2m')"
    FIM="$(printf '\033[0m')"
  else
    NEGRITO="" FRACO="" FIM=""
  fi
  printf '%sNOSSOM%s · em desenvolvimento\n' "$NEGRITO" "$FIM"
  printf '  O NOSSOM ainda não está aberto. Nada foi baixado nem instalado.\n'
  printf '  %sAcompanhe pelo Absolute ZRO: https://absolutezro.com/inicio%s\n' "$FRACO" "$FIM"
  exit 1
}

main "$@"
