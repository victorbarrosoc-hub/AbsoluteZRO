#!/bin/sh
# SOBEDESCE · o instalador de uma linha saiu (01/11/2026, decisão do titular): o app de computador se instala e se
# atualiza só pela central Absolute ZRO. Este recado é o que `curl -fsSL https://sobedesce.com/instalar.sh | bash`
# recebe agora: não baixa nem instala nada. No navegador, /instalar.sh leva para https://absolutezro.com/baixar.

main() {
  printf '%s\n' 'O SOBEDESCE agora se instala pela Absolute ZRO.' 'Baixe a central em https://absolutezro.com/baixar e instale o SOBEDESCE por ela.' >&2
  exit 1
}

main "$@"
