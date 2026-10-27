#!/bin/sh
# NOSSOM · instalador do app para Mac, sem o bloqueio "A Apple não pôde verificar…" e sem precisar do xattr.
#
#   curl -fsSL https://nossom-teal.vercel.app/instalar.sh | bash
#
# Por que funciona: o bloqueio vem da "quarentena" que o navegador põe em tudo o que baixa. O curl não põe. Nas versões
# novas do macOS, tirar a quarentena depois (xattr) num app que já está em Aplicativos costuma dar "Operation not
# permitted" sem a permissão de Gerenciamento de Apps; aqui o app já chega limpo.
# O que este script faz, nesta ordem:
#   1. escolhe o instalador do seu Mac (Apple Silicon ou Intel);
#   2. baixa o .dmg de /baixar/mac-arm64 ou /baixar/mac-x64 e confere a integridade da imagem (hdiutil verify);
#   3. fecha o NOSSOM, se estiver aberto;
#   4. abre o .dmg, copia o app para Aplicativos (troca o antigo; pede a senha do Mac só se precisar), refaz a
#      assinatura local se ela não conferir, fecha o .dmg e abre o app.
# Tudo fica dentro da função main, chamada só na última linha: um download cortado no meio não roda pela metade.

main() {
  set -eu

  SITE="${NOSSOM_SITE:-https://nossom-teal.vercel.app}"
  DEST="/Applications/NOSSOM.app"
  NOVO="/Applications/.NOSSOM-instalando.app"
  ANTIGO="/Applications/.NOSSOM-antigo.app"
  TMP=""
  MNT=""
  MONTADO=0
  SUDO=""

  if [ -t 1 ]; then
    NEGRITO="$(printf '\033[1m')"
    FRACO="$(printf '\033[2m')"
    VERDE="$(printf '\033[32m')"
    VERMELHO="$(printf '\033[31m')"
    FIM="$(printf '\033[0m')"
  else
    NEGRITO="" FRACO="" VERDE="" VERMELHO="" FIM=""
  fi

  passo() { printf '\n%s%s%s %s\n' "$NEGRITO" "$1" "$FIM" "$2"; }
  nota() { printf '  %s%s%s\n' "$FRACO" "$1" "$FIM"; }
  erro() {
    printf '\n%s✕ %s%s\n' "$VERMELHO" "$1" "$FIM" >&2
    [ "$#" -gt 1 ] && printf '  %s\n' "$2" >&2
    exit 1
  }

  limpar() {
    if [ "$MONTADO" = 1 ]; then
      hdiutil detach "$MNT" -quiet >/dev/null 2>&1 || hdiutil detach "$MNT" -force -quiet >/dev/null 2>&1 || true
      MONTADO=0
    fi
    if [ -n "$TMP" ]; then rm -rf "$TMP"; fi
  }
  trap limpar EXIT
  trap 'exit 130' INT TERM HUP

  printf '%sNOSSOM%s · instalação pelo Terminal\n' "$NEGRITO" "$FIM"

  [ "$(uname -s)" = "Darwin" ] || erro "Este instalador é para Mac." "No Windows, baixe o instalador em $SITE/apps"
  for cmd in curl hdiutil ditto xattr codesign open; do
    command -v "$cmd" >/dev/null 2>&1 || erro "Falta o comando \"$cmd\" neste Mac."
  done

  # 1. Qual instalador: Apple Silicon (M1 ou mais novo) ou Intel
  if [ "$(uname -m)" = "arm64" ] || [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = "1" ]; then
    ARQ="mac-arm64"
    passo "1/4" "Mac com Apple Silicon. Usando o instalador para M1 ou mais novo."
  else
    ARQ="mac-x64"
    passo "1/4" "Mac com processador Intel. Usando o instalador para Intel."
  fi

  TMP="$(mktemp -d "${TMPDIR:-/tmp}/nossom.XXXXXX")"
  DMG="$TMP/NOSSOM.dmg"
  MNT="$TMP/montagem"

  # 2. Baixa e confere
  passo "2/4" "Baixando o NOSSOM…"
  FINAL="$(curl -fL --retry 2 --connect-timeout 15 --progress-bar -o "$DMG" -w '%{url_effective}' "$SITE/baixar/$ARQ")" ||
    erro "O download não terminou." "Confira a internet e rode o comando de novo."
  case "$FINAL" in
    *indisponivel*) erro "O instalador do NOSSOM ainda não está publicado." "Tente de novo em alguns minutos, ou use pelo navegador: $SITE/studio" ;;
  esac
  hdiutil verify "$DMG" -quiet >/dev/null 2>&1 ||
    erro "O arquivo baixado veio corrompido. Nada foi instalado." "Rode o comando de novo."
  nota "imagem conferida"

  # 3. Fecha o app aberto
  if pgrep -x "NOSSOM" >/dev/null 2>&1; then
    passo "3/4" "Fechando o NOSSOM aberto…"
    osascript -e 'quit app "NOSSOM"' >/dev/null 2>&1 || true
    i=0
    while pgrep -x "NOSSOM" >/dev/null 2>&1; do
      i=$((i + 1))
      [ "$i" -gt 60 ] && erro "O NOSSOM não fechou." "Feche o app (⌘Q) e rode o comando de novo."
      sleep 1
    done
  else
    passo "3/4" "O NOSSOM não está aberto. Seguindo."
  fi

  # 4. Instala em Aplicativos
  passo "4/4" "Instalando em Aplicativos…"
  mkdir "$MNT"
  hdiutil attach "$DMG" -nobrowse -noautoopen -readonly -mountpoint "$MNT" -quiet ||
    erro "Não consegui abrir o instalador baixado." "Rode o comando de novo. Se continuar, baixe pelo site: $SITE/apps"
  MONTADO=1
  [ -d "$MNT/NOSSOM.app" ] || erro "O instalador baixado não tem o app dentro."

  if [ -w /Applications ] && { [ ! -e "$DEST" ] || [ -w "$DEST" ]; }; then
    SUDO=""
  else
    nota "Para gravar em Aplicativos, o macOS vai pedir a senha deste Mac (a mesma de entrar no computador)."
    SUDO="sudo"
  fi

  $SUDO rm -rf "$NOVO" "$ANTIGO"
  $SUDO ditto "$MNT/NOSSOM.app" "$NOVO" ||
    { $SUDO rm -rf "$NOVO"; erro "Não consegui copiar o app para Aplicativos."; }
  hdiutil detach "$MNT" -quiet >/dev/null 2>&1 || hdiutil detach "$MNT" -force -quiet >/dev/null 2>&1 || true
  MONTADO=0

  # Troca: o antigo sai do caminho, o novo entra; se algo falhar, o antigo volta.
  if [ -e "$DEST" ]; then
    $SUDO mv "$DEST" "$ANTIGO" 2>/dev/null || {
      $SUDO rm -rf "$NOVO"
      erro "O macOS não deixou trocar o app em Aplicativos." \
        "Abra Ajustes do Sistema → Privacidade e Segurança → Gerenciamento de Apps, ligue o Terminal e rode de novo. Ou apague o NOSSOM de Aplicativos e rode de novo."
    }
  fi
  if ! $SUDO mv "$NOVO" "$DEST"; then
    if [ -e "$ANTIGO" ]; then $SUDO mv "$ANTIGO" "$DEST" || true; fi
    $SUDO rm -rf "$NOVO"
    erro "Não consegui pôr o app novo em Aplicativos. O app antigo continua lá."
  fi
  $SUDO rm -rf "$ANTIGO"
  # Instalado com sudo: o app fica com o seu usuário (como ao arrastar).
  if [ -n "$SUDO" ]; then $SUDO chown -R "$(id -un)" "$DEST" 2>/dev/null || true; fi
  # Sem quarentena: nada de "A Apple não pôde verificar…" ao abrir.
  $SUDO xattr -cr "$DEST" 2>/dev/null || true

  # A prévia tem só assinatura local (sem certificado da Apple). Se ela não conferir depois da cópia, refaz aqui:
  # sem isso o Mac com Apple Silicon diz que o app "está danificado".
  if ! codesign --verify --deep "$DEST" >/dev/null 2>&1; then
    $SUDO codesign --force --deep --sign - "$DEST" >/dev/null 2>&1 || nota "Não deu para refazer a assinatura local; se o Mac reclamar, rode de novo."
  fi

  printf '\n%s✓ NOSSOM instalado em Aplicativos.%s\n' "$VERDE" "$FIM"
  open "$DEST" 2>/dev/null || nota "Abra o NOSSOM em Aplicativos."
  nota "Para atualizar, rode este mesmo comando."
}

main "$@"
