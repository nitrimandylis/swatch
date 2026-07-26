#!/bin/sh
# Screenshot layout for a theme. Run inside any Supacode terminal:
#   sh supacode/layout.sh [theme-slug]
#
#   +-----------------------------------------+
#   | juke   |  glow README.md  |   ff         |
#   |        |                  |------------- |
#   |        |                  |   btop       |
#   +-----------------------------------------+
#   |                 cava                     |   <- full-width row, under everything
#   +-----------------------------------------+
#
# Supacode CLI splits (verified): -d v = new pane BELOW (row),
#                                 -d h = new pane RIGHT (column).
# cava is split off the ORIGINAL pane FIRST (below, full width); the columns
# are then built into the top pane, so cava stays full-width underneath.

# The generated per-theme page, which is the swatch table worth having on screen.
PALETTE="$(cd "$(dirname "$0")/.." && pwd)/themes/${1:-batman-jazz}/README.md"
[ -f "$PALETTE" ] || { echo "no such theme: ${1:-batman-jazz}" >&2; exit 1; }

TAB=$(supacode tab new -i "juke")                                  # original pane = juke (top-left)
supacode surface split -t "$TAB" -s "$TAB" -d v -i "cava"          # full-width cava row underneath
MID=$(supacode surface split -t "$TAB" -s "$TAB" -d h -i "glow $PALETTE")  # column: palette
TOP=$(supacode surface split -t "$TAB" -s "$MID" -d h -i "ff")            # column: fastfetch
supacode surface split -t "$TAB" -s "$TOP" -d v -i "btop"                 # row under ff: btop
