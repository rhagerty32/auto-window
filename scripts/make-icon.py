#!/usr/bin/env python3
"""Write a 512×512 PNG: four displays with window panes (no third-party deps)."""

from __future__ import annotations

import struct
import sys
import zlib
from pathlib import Path

SIZE = 512
BG = (24, 26, 32)
BEZEL = (58, 62, 72)
SCREEN = (18, 20, 26)
PANE = (47, 111, 235)
PANE_DIM = (36, 84, 176)
LABEL = (230, 233, 239)


def px(img: list[list[tuple[int, int, int]]], x: int, y: int, color: tuple[int, int, int]) -> None:
    if 0 <= x < SIZE and 0 <= y < SIZE:
        img[y][x] = color


def fill(
    img: list[list[tuple[int, int, int]]],
    x: int,
    y: int,
    w: int,
    h: int,
    color: tuple[int, int, int],
) -> None:
    for yy in range(y, y + h):
        row = img[yy]
        for xx in range(x, x + w):
            if 0 <= xx < SIZE:
                row[xx] = color


def rect(
    img: list[list[tuple[int, int, int]]],
    x: int,
    y: int,
    w: int,
    h: int,
    color: tuple[int, int, int],
    t: int = 3,
) -> None:
    fill(img, x, y, w, t, color)
    fill(img, x, y + h - t, w, t, color)
    fill(img, x, y, t, h, color)
    fill(img, x + w - t, y, t, h, color)


def monitor(
    img: list[list[tuple[int, int, int]]],
    x: int,
    y: int,
    w: int,
    h: int,
    pane: tuple[int, int, int, int] | None,
) -> None:
    fill(img, x, y, w, h, BEZEL)
    fill(img, x + 6, y + 6, w - 12, h - 12, SCREEN)
    if pane:
        px_, py, pw, ph = pane
        fill(img, x + 6 + px_, y + 6 + py, pw, ph, PANE)


def write_png(path: Path, img: list[list[tuple[int, int, int]]]) -> None:
    raw = b"".join(b"\x00" + bytes(c for pixel in row for c in pixel) for row in img)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def main() -> None:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "assets/icon.png")
    img = [[BG for _ in range(SIZE)] for _ in range(SIZE)]

    # Three externals on top, laptop below (matches the Work desk diagram).
    monitor(img, 28, 72, 140, 88, None)  # leftmost unmanaged
    monitor(img, 176, 48, 160, 112, (8, 8, 128, 84))  # largest / Dia fill
    monitor(img, 344, 72, 140, 88, (8, 28, 112, 46))  # rightmost / Discord bottom 2/3
    monitor(img, 186, 300, 140, 92, (10, 10, 108, 64))  # builtin / Cursor
    fill(img, 236, 392, 40, 10, BEZEL)  # laptop chin

    write_png(out, img)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
