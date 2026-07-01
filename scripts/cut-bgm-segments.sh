#!/usr/bin/env bash
#
# Cut the master soundtrack ("Pokemon SFX.mp3") into per-segment mp3 clips so
# the app can loop small, reliably-loading files instead of seeking into one
# 48 MB stream (which does not play on mobile).
#
# Usage:
#   scripts/cut-bgm-segments.sh [path-to-Pokemon-SFX.mp3]
#
# If no path is given it tries to download the file from the public Supabase
# Storage "Songs" bucket. Output is written to public/song/segments/.
#
# The [start,end] timeframes below mirror the SEG / BATTLE_HOME tables in
# src/lib/audio.ts. Keep the two in sync.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$REPO_ROOT/public/song/segments"
MASTER_URL="https://dvdorceiasaipdvyfhil.supabase.co/storage/v1/object/public/Songs/Pokemon%20SFX.mp3"

SRC="${1:-}"
if [[ -z "$SRC" ]]; then
  SRC="$(mktemp -t pokemon-sfx-XXXX).mp3"
  echo "No source given — downloading master from Supabase…"
  curl -fSL "$MASTER_URL" -o "$SRC"
fi

if [[ ! -f "$SRC" ]]; then
  echo "Source file not found: $SRC" >&2
  exit 1
fi

command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg is required but not installed." >&2; exit 1; }

mkdir -p "$OUT_DIR"

# name              start   end   (seconds)
SEGMENTS=(
  "splash            13    131"
  "home-1           131    209"
  "home-2           534    665"
  "home-3          1339   1416"
  "home-4          1554   1617"
  "home-5          2084   2193"
  "home-6          2333   2411"
  "dex              258    304"
  "shop             665    739"
  "profile         1999   2084"
  "daily            407    497"
  "daily-win        497    534"
  "regular          923   1120"
  "regular-win     1120   1151"
  "weekly          1823   1942"
  "weekly-win      1942   1999"
  "elite-intro     3028   3104"
  "elite           3104   3253"
  "elite-win       3253   3317"
  "lose            1543   1554"
  "evolution       2992   3028"
  "item             739    747"
  "leaderboard      859    897"
)

for row in "${SEGMENTS[@]}"; do
  # shellcheck disable=SC2086
  set -- $row
  name="$1"; start="$2"; end="$3"
  dur="$(awk "BEGIN{print $end-$start}")"
  echo "Cutting $name  ($start → $end,  ${dur}s)"
  ffmpeg -y -hide_banner -loglevel error \
    -ss "$start" -to "$end" -i "$SRC" \
    -c:a libmp3lame -q:a 4 \
    "$OUT_DIR/$name.mp3"
done

echo
echo "Done. ${#SEGMENTS[@]} clips written to public/song/segments/"
du -h "$OUT_DIR"/*.mp3 | sort -h
echo
echo "Next: commit the clips, then the audio engine can be pointed at"
echo "/song/segments/<name>.mp3 (looping <audio>) instead of the master track."
