#!/usr/bin/env python3
"""Turn videos into the ASCII frames that the pages play.

    pip install numpy pillow scipy imageio-ffmpeg
    python3 tools/ascii_video.py beluga beluga.mp4
    python3 tools/ascii_video.py vids one.mp4 two.mp4 three.mp4 four.mp4

Writes media/<name>-wide.txt (landscape screens) and media/<name>-tall.txt
(portrait screens); several videos are joined into one clip. Each file starts
with a header line "cols rows frames fps", followed by frames * rows lines of
exactly `cols` characters. A character cell is drawn twice as tall as it is
wide, so rows = cols * aspect / 2.
"""

import logging
import sys
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from PIL import Image
from scipy import ndimage

# Scaling while decoding is intended; silence the "frame size differs" warning.
logging.getLogger("imageio_ffmpeg").setLevel(logging.ERROR)

# Light to dense, ordered by measured ink coverage in a monospace font.
RAMP = " .:;+?x#aS8$B@"

PRESETS = {
    # The beluga on its own: water, surface light and the corner watermark are masked out.
    "beluga": {
        "size": (640, 360),                 # decode size
        "rows": (0.0, 1.0),                 # top and bottom of the picture, as fractions
        "versions": {"wide": (0.0, 1.0, 200), "tall": (0.26, 0.76, 84)},  # left, right, cols
        "levels": (60, 225, 1.0),           # grey mapped to blank / densest glyph, gamma
        "isolate": True,
    },
    # TikTok edits: only the 4:3 picture between the letterbox bars, long black gaps shortened.
    "vids": {
        "size": (360, 640),
        "rows": (0.2917, 0.7104),
        "versions": {"wide": (0.0, 1.0, 160), "tall": (0.0, 1.0, 96)},
        "levels": (16, 235, 1.6),
        "max_black": 12,                    # frames
    },
}

SHARPEN = 0.7  # unsharp-mask strength, keeps outlines crisp
FADE = 6       # frames faded in and out, so the loop restarts from black

# 4x4 ordered-dither thresholds: stable from frame to frame, unlike error diffusion.
BAYER = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16

OUT = Path(__file__).resolve().parent.parent / "media"


def read_gray(path, size):
    reader = imageio_ffmpeg.read_frames(
        str(path), pix_fmt="gray", bits_per_pixel=8,
        output_params=["-vf", f"scale={size[0]}:{size[1]}:flags=area"],
    )
    meta = next(reader)
    frames = np.stack([np.frombuffer(f, np.uint8).reshape(size[1], size[0]) for f in reader])
    return frames, meta["fps"]


def shorten_black(frames, longest):
    """Drop the black lead-in and tail, and cut black stretches down to `longest` frames."""
    dark = frames.mean(axis=(1, 2)) < 8
    keep = np.ones(len(frames), bool)
    run = 0
    for i, is_dark in enumerate(dark):
        run = run + 1 if is_dark else 0
        keep[i] = run <= longest
    lit = np.flatnonzero(~dark)
    keep[:lit[0]] = keep[lit[-1] + 1:] = False
    return frames[keep]


def whale_mask(frame):
    """The largest bright shape, grown into its shaded side where it stands out from the water."""
    smooth = ndimage.gaussian_filter(frame.astype(np.float32), 1.5)
    bright = smooth > 120
    labels, count = ndimage.label(bright)
    seed = labels == 1 + np.argmax(ndimage.sum(bright, labels, range(1, count + 1)))
    # The water darkens with depth, so compare each row with the water beside the whale.
    away = ~ndimage.binary_dilation(seed, iterations=25)
    water = np.array([np.median(row[a]) if a.sum() > 50 else np.nan for row, a in zip(smooth, away)])
    water = ndimage.uniform_filter1d(np.nan_to_num(water, nan=np.nanmedian(water)), 9)
    lit = smooth > water[:, None] + 28
    labels, _ = ndimage.label(lit)
    whale = np.isin(labels, np.unique(labels[seed & lit]))
    return ndimage.binary_fill_holes(ndimage.binary_closing(whale, iterations=3))


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


def to_text(grid, black, white, gamma):
    grid = grid + SHARPEN * (grid - blur(grid))
    level = np.clip((grid - black) / (white - black), 0, 1) ** gamma * (len(RAMP) - 1)

    fade = np.ones(len(level), np.float32)
    fade[:FADE] = np.linspace(0, 1, FADE, endpoint=False)
    fade[-FADE:] = fade[:FADE][::-1]
    level *= fade[:, None, None]

    # Dither the faint end so dark areas thin out smoothly; round the rest.
    rows, cols = level.shape[1:]
    dither = np.tile(BAYER, (rows // 4 + 1, cols // 4 + 1))[:rows, :cols]
    index = np.where(level < 2, np.floor(level + dither), np.rint(level)).astype(int)

    glyphs = np.array(list(RAMP))
    return ["\n".join("".join(row) for row in glyphs[frame]) for frame in index]


def main(name, videos):
    preset = PRESETS[name]
    grids = {version: [] for version in preset["versions"]}
    for video in videos:
        frames, fps = read_gray(video, preset["size"])
        top, bottom = (round(f * frames.shape[1]) for f in preset["rows"])
        frames = frames[:, top:bottom]
        if "max_black" in preset:
            frames = shorten_black(frames, preset["max_black"])
        if preset.get("isolate"):
            frames = frames * np.stack([whale_mask(f) for f in frames]).astype(np.float32)
        for version, (left, right, cols) in preset["versions"].items():
            grids[version].append(to_grid(frames, left, right, cols))

    OUT.mkdir(exist_ok=True)
    for version, parts in grids.items():
        text = to_text(np.concatenate(parts), *preset["levels"])
        cols, rows = text[0].index("\n"), text[0].count("\n") + 1
        path = OUT / f"{name}-{version}.txt"
        path.write_text(f"{cols} {rows} {len(text)} {fps:g}\n" + "\n".join(text) + "\n")
        print(f"{path.name}: {cols}x{rows}, {len(text)} frames @ {fps:g} fps")


if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[1] not in PRESETS:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2:])
