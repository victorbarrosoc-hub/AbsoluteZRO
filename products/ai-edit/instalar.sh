#!/bin/sh
# AEON (by Absolute ZRO) · instalador para Mac pelo Terminal, no molde do Synquei. Sem o aviso "A Apple não pôde
# verificar se o item está livre de malware": o app tem assinatura ad-hoc (custo zero, sem certificado da Apple,
# decisão do titular de 26/10/2026) e o aviso vem da "quarentena" que o navegador põe no que baixa. O curl não põe.
#
#   curl -fsSL https://raw.githubusercontent.com/victorbarrosoc-hub/AbsoluteZRO/main/products/ai-edit/instalar.sh | bash
#
# NOME é o mesmo de src/produto.js (um teste confere). Os arquivos vêm do Release do GitHub (tag ai-edit-app-desktop),
# sem site no meio: versao.json diz o build, o nome e o SHA-256 de cada instalador.
# O que este script faz, nesta ordem (sem nada escondido: leia antes de rodar, se quiser):
#   1. lê o versao.json do Release (build, nome do .dmg e SHA-256);
#   2. baixa o .dmg e confere o SHA-256 (não bateu = não instala nada);
#   3. fecha o app, se estiver aberto;
#   4. abre o .dmg, copia o app para Aplicativos (troca o antigo; pede a senha do Mac só se precisar),
#      tira a quarentena (xattr -cr), fecha o .dmg e abre o app.
# Tudo fica dentro da função main, chamada só na última linha: um download cortado no meio não roda pela metade.

main() {
  set -eu

  NOME="AEON"
  RELEASE="${AIEDIT_RELEASE:-https://github.com/victorbarrosoc-hub/AbsoluteZRO/releases/download/ai-edit-app-desktop}"
  DEST="/Applications/$NOME.app"
  NOVO="/Applications/.$NOME-instalando.app"
  ANTIGO="/Applications/.$NOME-antigo.app"
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

  printf '%s%s%s · instalação pelo Terminal\n' "$NEGRITO" "$NOME" "$FIM"

  [ "$(uname -s)" = "Darwin" ] || erro "Este instalador é para Mac." "No Windows, abra o PowerShell e rode: irm https://raw.githubusercontent.com/victorbarrosoc-hub/AbsoluteZRO/main/products/ai-edit/instalar.ps1 | iex"
  for cmd in curl hdiutil ditto shasum xattr open; do
    command -v "$cmd" >/dev/null 2>&1 || erro "Falta o comando \"$cmd\" neste Mac."
  done

  # 1. Versão mais nova, nome do instalador e SHA-256
  passo "1/4" "Procurando a versão mais nova…"
  VERSAO="$(curl -fsSL --retry 2 --connect-timeout 15 "$RELEASE/versao.json" 2>/dev/null)" ||
    erro "Ainda não há versão publicada, ou o GitHub não respondeu." "Confira a internet e rode o comando de novo."
  BUILD="$(printf '%s' "$VERSAO" | grep -Eo '"build"[[:space:]]*:[[:space:]]*[0-9]+' | grep -Eo '[0-9]+$' || true)"
  SHA="$(printf '%s' "$VERSAO" | grep -Eo '"sha256Mac"[[:space:]]*:[[:space:]]*"[0-9a-fA-F]{64}"' | grep -Eo '[0-9a-fA-F]{64}' | tr 'A-F' 'a-f' || true)"
  ARQ="$(printf '%s' "$VERSAO" | grep -Eo '"mac"[[:space:]]*:[[:space:]]*"[A-Za-z0-9._-]+\.dmg"' | sed -E 's/.*"([^"]+)"$/\1/' || true)"
  [ -n "$BUILD" ] || erro "O Release não respondeu com uma versão." "Tente de novo em alguns minutos."
  if [ -z "$SHA" ] || [ -z "$ARQ" ]; then
    erro "O Release ainda não tem o instalador de Mac conferido (SHA-256)." "Tente de novo em alguns minutos."
  fi
  nota "build $BUILD"

  TMP="$(mktemp -d "${TMPDIR:-/tmp}/aeon.XXXXXX")"
  DMG="$TMP/instalador.dmg"
  MNT="$TMP/montagem"

  # 2. Baixa e confere
  passo "2/4" "Baixando o $NOME…"
  curl -fL --retry 2 --connect-timeout 15 --progress-bar -o "$DMG" "$RELEASE/$ARQ" ||
    erro "O download não terminou." "Confira a internet e rode o comando de novo."
  GOT="$(shasum -a 256 "$DMG" | awk '{print $1}')"
  if [ "$GOT" != "$SHA" ]; then
    erro "O arquivo baixado não bate com a conferência do Release (SHA-256). Nada foi instalado." \
      "Pode ser uma versão nova sendo publicada agora: espere uns minutos e rode de novo."
  fi
  nota "conferido (SHA-256 ${SHA%"${SHA#????????????}"}…)"

  # 3. Fecha o app aberto
  if pgrep -x "$NOME" >/dev/null 2>&1; then
    passo "3/4" "Fechando o $NOME aberto…"
    osascript -e "quit app \"$NOME\"" >/dev/null 2>&1 || true
    i=0
    while pgrep -x "$NOME" >/dev/null 2>&1; do
      i=$((i + 1))
      [ "$i" -gt 60 ] && erro "O $NOME não fechou." "Feche o app (⌘Q) e rode o comando de novo."
      sleep 1
    done
  else
    passo "3/4" "O $NOME não está aberto. Seguindo."
  fi

  # 4. Instala em Aplicativos
  passo "4/4" "Instalando em Aplicativos…"
  mkdir "$MNT"
  hdiutil attach "$DMG" -nobrowse -noautoopen -readonly -mountpoint "$MNT" -quiet ||
    erro "Não consegui abrir o instalador baixado." "Rode o comando de novo."
  MONTADO=1
  [ -d "$MNT/$NOME.app" ] || erro "O instalador baixado não tem o app dentro."

  if [ -w /Applications ] && { [ ! -e "$DEST" ] || [ -w "$DEST" ]; }; then
    SUDO=""
  else
    nota "Para gravar em Aplicativos, o macOS vai pedir a senha deste Mac (a mesma de entrar no computador)."
    SUDO="sudo"
  fi

  $SUDO rm -rf "$NOVO" "$ANTIGO"
  $SUDO ditto "$MNT/$NOME.app" "$NOVO" ||
    { $SUDO rm -rf "$NOVO"; erro "Não consegui copiar o app para Aplicativos."; }
  hdiutil detach "$MNT" -quiet >/dev/null 2>&1 || hdiutil detach "$MNT" -force -quiet >/dev/null 2>&1 || true
  MONTADO=0

  # Troca: o antigo sai do caminho, o novo entra; se algo falhar, o antigo volta.
  if [ -e "$DEST" ]; then
    $SUDO mv "$DEST" "$ANTIGO" 2>/dev/null || {
      $SUDO rm -rf "$NOVO"
      erro "O macOS não deixou trocar o app em Aplicativos." \
        "Abra Ajustes do Sistema → Privacidade e Segurança → Gerenciamento de Apps, ligue o Terminal e rode de novo."
    }
  fi
  if ! $SUDO mv "$NOVO" "$DEST"; then
    if [ -e "$ANTIGO" ]; then $SUDO mv "$ANTIGO" "$DEST" || true; fi
    $SUDO rm -rf "$NOVO"
    erro "Não consegui pôr o app novo em Aplicativos. O app antigo continua lá."
  fi
  $SUDO rm -rf "$ANTIGO"
  if [ -n "$SUDO" ]; then $SUDO chown -R "$(id -un)" "$DEST" 2>/dev/null || true; fi
  # Sem quarentena: nada de "A Apple não pôde verificar…" ao abrir.
  $SUDO xattr -cr "$DEST" 2>/dev/null || true

  printf '\n%s✓ %s instalado em Aplicativos (build %s).%s\n' "$VERDE" "$NOME" "$BUILD" "$FIM"
  open "$DEST" 2>/dev/null || nota "Abra o $NOME em Aplicativos."
  nota "Para atualizar depois, rode este mesmo comando."
}

main "$@"
