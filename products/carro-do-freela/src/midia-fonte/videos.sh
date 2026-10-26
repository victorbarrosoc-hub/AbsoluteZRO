#!/usr/bin/env bash
# Os vídeos da casa, refeitos do master sem perda (26/out). Ver README.md.
#
#   ./videos.sh <pasta dos masters>
#
# Para cada vídeo, dois tamanhos e três codecs. A tela escolhe (qual() no
# template): o menor tamanho que cobre a largura dela × a densidade, no
# melhor codec que o navegador toca — AV1, depois HEVC, e H.264 de reserva.
#   1280  o celular (um iPhone a 3x tem 1170 px físicos de largura)
#   1912  o computador (é a largura do original do Kling)
# Qualidade (26/out, medida contra o master — ver README): H.264 CRF 18 no
# computador e 20 no celular (o pedido do Victor: HD ≤ 18, celular ≤ 20 e
# ≥ 1280 px), sem teto de bitrate apertado. HEVC e AV1 calibrados para EMPATAR
# com o H.264 em SSIM/PSNR com menos bytes: HEVC 20/22, AV1 26/28. No celular,
# a carona foi de SSIM 0,923 (31 dB, o antigo 1024 CRF 31) para ~0,984 (41 dB).
# A nitidez leve (unsharp .45) é a mesma desde 18/out · 5.
set -euo pipefail
M="$1"; OUT="$(cd "$(dirname "$0")/../midia" && pwd)"
SHARP="unsharp=5:5:0.45"
enc() { # nome master largura
  local nome=$1 master=$2 w=$3 vf
  if [ "$w" = 1912 ]; then vf="$SHARP,format=yuv420p"; c264=18; c265=20; cav1=26
  else vf="$SHARP,scale=$w:-2:flags=lanczos,format=yuv420p"; c264=20; c265=22; cav1=28; fi
  ffmpeg -v error -y -i "$M/$master" -vf "$vf" -an -c:v libx264 -preset veryslow -crf $c264 -profile:v high \
    -g 48 -keyint_min 24 -maxrate 40M -bufsize 80M -movflags +faststart "$OUT/$nome@$w.mp4"
  ffmpeg -v error -y -i "$M/$master" -vf "$vf" -an -c:v libx265 -preset slow -crf $c265 -tag:v hvc1 \
    -x265-params "keyint=48:min-keyint=24:log-level=error" -movflags +faststart "$OUT/$nome@$w.hevc.mp4"
  ffmpeg -v error -y -i "$M/$master" -vf "$vf" -an -c:v libsvtav1 -preset 4 -crf $cav1 -g 48 \
    -svtav1-params "enable-overlays=1:scd=1" -movflags +faststart "$OUT/$nome@$w.av1.mp4"
  ls -l "$OUT/$nome@$w".*mp4 "$OUT/$nome@$w.mp4" | awk '{printf "  %s %.1f MB\n", $9, $5/1048576}'
}
for nome in home-laco login; do
  rm -f "$OUT/$nome.mp4" "$OUT/$nome@hd.mp4"
  for w in 1280 1912; do enc $nome master-${nome#home-}.mkv $w; done
done
rm -f "$OUT/home-intro.mp4" "$OUT/home-intro@hd.mp4"   # a abertura separada saiu em 18/out · 3
