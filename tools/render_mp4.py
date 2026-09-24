#!/usr/bin/env python3
"""Render an ASCII clip from media/ as an MP4 that looks like the page.

    pip install pillow imageio-ffmpeg
    python3 tools/render_mp4.py media/beluga-wide.txt beluga.mp4 1920x1080

Draws the frames in the page's colours, centred with a small margin, and
encodes them as H.264 so phones and computers can play the file.
"""

import sys

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
INK, PAPER = (230, 237, 240), (0, 0, 0)
MARGIN = 0.04  # of the shorter side


def read_clip(path):
    lines = open(path).read().split("\n")
    cols, rows, count, fps = lines[0].split()
    cols, rows, count = int(cols), int(rows), int(count)
    frames = [lines[1 + i * rows:1 + (i + 1) * rows] for i in range(count)]
    return cols, rows, float(fps), frames


def main(src, out, size):
    width, height = map(int, size.split("x"))
    cols, rows, fps, frames = read_clip(src)

    # Cells twice as tall as wide, as on the page.
    advance = ImageFont.truetype(FONT, 100).getlength("M") / 100
    margin = MARGIN * min(width, height)
    cell = min((width - 2 * margin) / cols, (height - 2 * margin) / rows / 2)
    font = ImageFont.truetype(FONT, cell / advance)
    left, top = (width - cell * cols) / 2, (height - 2 * cell * rows) / 2

    writer = imageio_ffmpeg.write_frames(
        out, (width, height), fps=fps, codec="libx264", quality=None, macro_block_size=1,
        output_params=["-crf", "18", "-preset", "slow", "-movflags", "+faststart"],
    )
    writer.send(None)
    for frame in frames:
        image = Image.new("RGB", (width, height), PAPER)
        draw = ImageDraw.Draw(image)
        for row, line in enumerate(frame):
            draw.text((left, top + (2 * row + 1) * cell), line, font=font, fill=INK, anchor="lm")
        writer.send(image.tobytes())
    writer.close()
    print(f"{out}: {width}x{height}, {len(frames)} frames @ {fps:g} fps")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
