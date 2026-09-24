#!/usr/bin/env python3
"""Turn a video into the ASCII frames that index.html plays.

    pip install numpy pillow imageio-ffmpeg
    python3 tools/ascii_video.py beluga.mp4

Writes two files to media/:
  beluga-wide.txt  the full frame, for landscape screens
  beluga-tall.txt  a centre crop around the whale, for portrait screens

Each file starts with a header line "cols rows frames fps", followed by
frames * rows lines of exactly `cols` characters. A character cell is
drawn twice as tall as it is wide, so rows = cols * aspect / 2.
"""

import sys
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from PIL import Image

# Light to dense, ordered by measured ink coverage in a monospace font.
RAMP = " .:;+?x#aS8$B@"

# name: (left edge, right edge, as a fraction of the frame width; columns)
VERSIONS = {
    "wide": (0.0, 1.0, 200),
    "tall": (0.26, 0.76, 84),
}

BLACK, WHITE = 70, 210  # grey levels mapped to blank / the densest glyph
SHARPEN = 0.7           # unsharp-mask strength, keeps fins and outline crisp
FADE = 6                # frames faded in and out, so the loop restarts from black

# 4x4 ordered-dither thresholds: stable from frame to frame, unlike error diffusion.
BAYER = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16

OUT = Path(__file__).resolve().parent.parent / "media"


def read_gray(path):
    reader = imageio_ffmpeg.read_frames(str(path), pix_fmt="gray", bits_per_pixel=8)
    meta = next(reader)
    width, height = meta["size"]
    frames = np.stack([np.frombuffer(f, np.uint8).reshape(height, width) for f in reader])
    return frames, meta["fps"]


def to_grid(frames, left, right, cols):
    height, width = frames.shape[1:]
    x0, x1 = round(left * width), round(right * width)
    rows = round(cols * height / (x1 - x0) / 2)
    return np.stack([
        np.asarray(Image.fromarray(f[:, x0:x1]).resize((cols, rows), Image.BOX), np.float32)
        for f in frames
    ])


def blur(grid, sigma=1.2):
    kernel = np.exp(-0.5 * (np.arange(-3, 4) / sigma) ** 2)
    kernel /= kernel.sum()
    rows, cols = grid.shape[1:]
    padded = np.pad(grid, ((0, 0), (3, 3), (3, 3)), mode="edge")
    padded = sum(k * padded[:, i:i + rows, :] for i, k in enumerate(kernel))
    return sum(k * padded[:, :, i:i + cols] for i, k in enumerate(kernel))


def to_text(grid):
    grid = grid + SHARPEN * (grid - blur(grid))
    level = np.clip((grid - BLACK) / (WHITE - BLACK), 0, 1) * (len(RAMP) - 1)

    fade = np.ones(len(level), np.float32)
    fade[:FADE] = np.linspace(0, 1, FADE, endpoint=False)
    fade[-FADE:] = fade[:FADE][::-1]
    level *= fade[:, None, None]

    # Dither the faint end so the dark water thins out smoothly; round the rest.
    rows, cols = level.shape[1:]
    dither = np.tile(BAYER, (rows // 4 + 1, cols // 4 + 1))[:rows, :cols]
    index = np.where(level < 2, np.floor(level + dither), np.rint(level)).astype(int)

    glyphs = np.array(list(RAMP))
    return ["\n".join("".join(row) for row in glyphs[frame]) for frame in index]


def main(video):
    frames, fps = read_gray(video)
    OUT.mkdir(exist_ok=True)
    for name, (left, right, cols) in VERSIONS.items():
        text = to_text(to_grid(frames, left, right, cols))
        rows = text[0].count("\n") + 1
        path = OUT / f"beluga-{name}.txt"
        path.write_text(f"{cols} {rows} {len(text)} {fps:g}\n" + "\n".join(text) + "\n")
        print(f"{path.name}: {cols}x{rows}, {len(text)} frames @ {fps:g} fps")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
