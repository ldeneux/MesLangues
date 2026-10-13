#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Découpe une planche de 20 images (5 colonnes x 4 lignes, légende sous chaque
image) en 20 fichiers WebP à fond transparent, nommés d'après la légende.

Usage :
    python decouper_planche.py                 -> ouvre une fenêtre de choix de fichier
    python decouper_planche.py planche1.png    -> traite directement ce fichier

Dépendances :
    pip install pillow numpy pytesseract
    + Tesseract OCR installé sur la machine, avec le pack de langue français
      (Windows : https://github.com/UB-Mannheim/tesseract/wiki - cocher "French")
      (Mac : brew install tesseract tesseract-lang)
      (Linux : sudo apt install tesseract-ocr tesseract-ocr-fra)

Si l'OCR n'est pas disponible ou ne lit rien, le script vous demande le nom
dans une petite fenêtre (en affichant la légende).
"""

import re
import sys
import unicodedata
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

# ----------------------------------------------------------------- Réglages
COLS, ROWS = 5, 4
OUTPUT_DIR = Path(__file__).resolve().parent / "image_webp"
WEBP_QUALITY = 90          # 0-100 ; mettre WEBP_LOSSLESS = True pour du sans perte
WEBP_LOSSLESS = False
PHOTO_FILL = 0.80          # carte "photo" (fond rempli) : on la garde telle quelle, sans transparence
WHITE_THRESHOLD = 245      # un pixel dont R, V et B sont >= à cette valeur = "blanc"
PICTURE_RATIO = 0.80       # part de la carte occupée par l'image (le reste = légende)
INSET = 7                  # marge retirée à l'intérieur de la carte (px) : enlève le liseré gris
KEEP_ACCENTS = False       # False -> "ecrire.webp" ; True -> "écrire.webp"
TRIM_TRANSPARENT = False   # True -> recadre chaque image au plus près du sujet
# Chemin de tesseract.exe (laisser "" pour la détection automatique)
TESSERACT_CMD = r"C:\Users\nftr4813\AppData\Local\Tesseract-OCR\tesseract.exe"
OCR_LANG = "fra"           # langue Tesseract (repli automatique sur "eng" si absente)
# -------------------------------------------------------------------------


def choose_file() -> Path:
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    path = filedialog.askopenfilename(
        title="Choisir la planche d'images",
        filetypes=[("Images", "*.png *.jpg *.jpeg *.webp *.bmp"), ("Tous", "*.*")],
    )
    root.destroy()
    if not path:
        sys.exit("Aucun fichier choisi.")
    return Path(path)


# ------------------------------------------------------------ Géométrie
def runs(mask):
    """Retourne les intervalles (début, fin) où mask est True."""
    out, start = [], None
    for i, v in enumerate(mask):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i - 1))
            start = None
    if start is not None:
        out.append((start, len(mask) - 1))
    return out


def find_cards(img: Image.Image):
    """Calcule les 20 rectangles de cartes (x0, y0, x1, y1)."""
    g = np.array(img.convert("L")).astype(int)
    h, w = g.shape
    content = g < 250

    # --- colonnes : on repère les gouttières blanches verticales
    col_profile = content.mean(axis=0)
    blocks = runs(col_profile >= 0.02)          # colonnes contenant du "contenu"
    blocks = [b for b in blocks if b[1] - b[0] > 40]
    if len(blocks) == COLS:
        xs = blocks
    else:  # repli : découpe régulière
        step = w / COLS
        xs = [(int(i * step), int((i + 1) * step) - 1) for i in range(COLS)]

    # --- lignes : première/dernière ligne de contenu, puis découpe régulière
    row_profile = content.mean(axis=1)
    active = np.where(row_profile >= 0.02)[0]
    y_top, y_bot = int(active[0]), int(active[-1])
    gap = int(np.median([xs[i + 1][0] - xs[i][1] for i in range(len(xs) - 1)])) if len(xs) > 1 else 12
    card_h = (y_bot - y_top + 1 - (ROWS - 1) * gap) / ROWS

    cards = []
    for r in range(ROWS):
        y0 = y_top + r * (card_h + gap)
        y1 = y0 + card_h
        for (x0, x1) in xs:
            cards.append((x0, int(round(y0)), x1 + 1, int(round(y1))))
    return cards


def find_split(img: Image.Image, x0, y0, x1, y1) -> int:
    """Ordonnée du trait gris qui sépare l'image de sa légende (repli : ratio)."""
    g = np.array(img.convert("L").crop((x0 + INSET, y0, x1 - INSET, y1))).astype(int)
    h = g.shape[0]
    lo, hi = int(h * 0.65), int(h * 0.92)
    greyish = ((g > 150) & (g < 248)).mean(axis=1)
    darkest = g.min(axis=1)
    for r in range(lo, hi):
        # le trait de séparation : ligne presque entièrement gris clair, sans pixel sombre
        if greyish[r] > 0.8 and darkest[r] > 180:
            return y0 + r
    return y0 + int(h * PICTURE_RATIO)


# ------------------------------------------------------- Fond transparent
def make_transparent(pic: Image.Image) -> Image.Image:
    """Rend transparent le blanc connecté aux bords de l'image (flood fill)."""
    rgb = pic.convert("RGB")
    arr = np.array(rgb)

    # Image de type photo (fond rempli : neige, train, parking...) -> on la garde opaque
    content = (arr < 250).any(axis=2)
    cols = np.where(content.mean(axis=0) > 0.05)[0]
    rows = np.where(content.mean(axis=1) > 0.05)[0]
    if len(cols) and len(rows):
        box = content[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]
        if box.mean() > PHOTO_FILL:
            return rgb.crop((cols[0], rows[0], cols[-1] + 1, rows[-1] + 1)).convert("RGBA")

    near_white = (arr >= WHITE_THRESHOLD).all(axis=2)

    mask = Image.fromarray((near_white * 255).astype("uint8"), "L")
    mask = ImageOps.expand(mask, border=1, fill=255)    # cadre blanc -> relie tous les bords
    ImageDraw.floodfill(mask, (0, 0), 128, thresh=0)
    bg = np.array(mask)[1:-1, 1:-1] == 128

    alpha = Image.fromarray(np.where(bg, 0, 255).astype("uint8"), "L")
    alpha = alpha.filter(ImageFilter.MinFilter(3))       # mange la frange blanche
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.7))  # bords adoucis

    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    if TRIM_TRANSPARENT:
        bbox = out.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
        if bbox:
            out = out.crop(bbox)
    return out


# -------------------------------------------------------------------- OCR
_ocr_ok = None


def find_tesseract():
    """Cherche tesseract.exe : réglage manuel, puis emplacements Windows courants."""
    import os
    import shutil

    candidates = [
        TESSERACT_CMD,
        shutil.which("tesseract") or "",
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Tesseract-OCR\tesseract.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe"),
    ]
    for c in candidates:
        if c and Path(c).exists():
            return c
    return ""


def read_label(label_img: Image.Image) -> str:
    global _ocr_ok, OCR_LANG
    if _ocr_ok is False:
        return ""
    try:
        import pytesseract

        cmd = find_tesseract()
        if cmd:
            pytesseract.pytesseract.tesseract_cmd = cmd

        g = ImageOps.autocontrast(label_img.convert("L"))
        g = g.resize((g.width * 3, g.height * 3), Image.LANCZOS)
        g = g.point(lambda v: 255 if v > 150 else 0)
        g = ImageOps.expand(g, border=20, fill=255)
        cfg = "--psm 7"
        try:
            text = pytesseract.image_to_string(g, lang=OCR_LANG, config=cfg)
        except pytesseract.TesseractError:
            if OCR_LANG != "eng":
                print("  (pack de langue français absent : lecture en anglais, accents moins fiables)")
                OCR_LANG = "eng"
                text = pytesseract.image_to_string(g, lang=OCR_LANG, config=cfg)
            else:
                raise
        _ocr_ok = True
        return " ".join(text.split())
    except Exception as e:  # Tesseract absent, etc.
        print(f"  OCR indisponible ({e.__class__.__name__}) -> saisie manuelle")
        _ocr_ok = False
        return ""


def ask_name(label_img: Image.Image, index: int, guess: str) -> str:
    """Petite fenêtre qui affiche la légende et demande le nom."""
    import tkinter as tk
    from PIL import ImageTk

    result = {"v": guess}
    win = tk.Tk()
    win.title(f"Image {index}/{COLS * ROWS} - nom du fichier")
    win.attributes("-topmost", True)
    shown = label_img.copy()
    shown.thumbnail((420, 120))
    photo = ImageTk.PhotoImage(shown)
    tk.Label(win, image=photo).pack(padx=10, pady=8)
    entry = tk.Entry(win, width=40, font=("Arial", 14))
    entry.insert(0, guess)
    entry.pack(padx=10, pady=4)
    entry.focus_set()
    entry.select_range(0, "end")

    def ok(_=None):
        result["v"] = entry.get()
        win.destroy()

    entry.bind("<Return>", ok)
    tk.Button(win, text="OK", command=ok).pack(pady=8)
    win.mainloop()
    return result["v"].strip()


# ----------------------------------------------------------------- Noms
def slugify(text: str) -> str:
    text = text.strip().lower().replace("œ", "oe").replace("’", "'")
    if not KEEP_ACCENTS:
        text = unicodedata.normalize("NFKD", text)
        text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"[^\w]+", "_", text, flags=re.UNICODE)
    return text.strip("_")


def unique_path(folder: Path, stem: str) -> Path:
    p = folder / f"{stem}.webp"
    n = 2
    while p.exists():
        p = folder / f"{stem}_{n}.webp"
        n += 1
    return p


# ------------------------------------------------------------------ Main
def main():
    src = choose_file()
    img = Image.open(src).convert("RGB")
    OUTPUT_DIR.mkdir(exist_ok=True)

    cards = find_cards(img)
    print(f"Planche : {src.name}  ({img.width}x{img.height}) -> {len(cards)} cartes")

    used = set()
    for i, (x0, y0, x1, y1) in enumerate(cards, start=1):
        card_h = y1 - y0
        split = find_split(img, x0, y0, x1, y1)

        picture = img.crop((x0 + INSET, y0 + INSET, x1 - INSET, split - 5))
        label = img.crop((x0 + INSET + 4, split + 8, x1 - INSET - 4, y1 - 8))

        name = read_label(label)
        if not name:
            name = ask_name(label, i, "")
        stem = slugify(name) or f"image_{i:02d}"
        if stem in used:
            print(f"  doublon de nom : {stem}")
        used.add(stem)

        out = make_transparent(picture)
        path = unique_path(OUTPUT_DIR, stem)
        out.save(path, "WEBP", quality=WEBP_QUALITY, lossless=WEBP_LOSSLESS, method=6)
        print(f"  {i:2d}. {name!r:32} -> {path.name}")

    print(f"\nTerminé : {len(cards)} images dans {OUTPUT_DIR}")


if __name__ == "__main__":
    main()