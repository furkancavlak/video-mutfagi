#!/usr/bin/env bash
# Frame sheets for the review agent: one frame per second, 12 per sheet (4 columns x 3 rows, row by row).
# Sheet N, tile T (1..12, left-to-right, top-to-bottom) = second 12*(N-1) + (T-1).
# (No burned-in timestamps: ffmpeg drawtext crashes on some Windows builds.)
# Usage: bash denetim/kareler.sh <video.mp4> <out_dir>
set -euo pipefail
V="$1"; O="$2"; mkdir -p "$O"
ffmpeg -loglevel error -y -i "$V" -vf "fps=1,scale=360:-1,tile=4x3:padding=8:color=0x222222" -start_number 1 "$O/sayfa-%02d.jpg"
ls "$O"
