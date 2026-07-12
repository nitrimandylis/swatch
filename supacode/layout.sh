#!/bin/sh
# Batman-jazz rice layout. Run inside any Supacode terminal:
#   sh ~/Developer/rice/supacode/layout.sh
#
#   +-----------------------------------------+
#   | juke   |  glow PALETTE.md |   ff         |
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

PALETTE="$HOME/Developer/rice/PALETTE.md"

TAB=$(supacode tab new -i "juke")                                  # original pane = juke (top-left)
supacode surface split -t "$TAB" -s "$TAB" -d v -i "cava"          # full-width cava row underneath
MID=$(supacode surface split -t "$TAB" -s "$TAB" -d h -i "glow $PALETTE")  # column: palette
TOP=$(supacode surface split -t "$TAB" -s "$MID" -d h -i "ff")            # column: fastfetch
supacode surface split -t "$TAB" -s "$TOP" -d v -i "btop"                 # row under ff: btop
