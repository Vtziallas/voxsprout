"""
Generate word card images for all words in the word lists.
Each card: 400x400px, colored background, emoji, word text, IPA.
Run from the backend/ directory:  python generate_images.py
"""
import os
import json
from PIL import Image, ImageDraw, ImageFont

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "data", "images")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── Emoji mapping (word_id -> emoji) ─────────────────────────────────────────
EMOJI = {
    # English
    "en_rabbit":   "🐰", "en_carrot":  "🥕", "en_ear":      "👂",
    "en_lemon":    "🍋", "en_balloon": "🎈", "en_ball":     "⚽",
    "en_sun":      "☀️", "en_glasses": "👓", "en_bus":      "🚌",
    "en_shoe":     "👟", "en_washing": "🧺", "en_fish":     "🐟",
    "en_thumb":    "👍", "en_feather": "🪶", "en_teeth":    "🦷",
    "en_van":      "🚐", "en_cat":     "🐱", "en_bucket":   "🪣",
    "en_dog":      "🐶", "en_pig":     "🐷", "en_chair":    "🪑",
    "en_kitchen":  "🍳", "en_jump":    "🤸", "en_spoon":    "🥄",
    "en_tree":     "🌳", "en_flag":    "🚩", "en_snake":    "🐍",
    "en_drum":     "🥁", "en_frog":    "🐸", "en_yellow":   "💛",
    # Greek
    "el_roda":       "🛞", "el_arkouda":    "🐻", "el_liontari":   "🦁",
    "el_lemoni":     "🍋", "el_elefantas":  "🐘", "el_molvee":     "✏️",
    "el_saligkari":  "🐌", "el_psalidi":    "✂️", "el_thronos":    "👑",
    "el_dachtilo":   "☝️", "el_xeri":       "✋", "el_maxeri":     "🔪",
    "el_gata":       "🐱", "el_tsanta":     "👜", "el_tzami":      "🪟",
    "el_vivlio":     "📚", "el_fidi":       "🐍", "el_kaltsa":     "🧦",
    "el_papoutsi":   "👟", "el_trapezi":    "🍽️", "el_spiti":      "🏠",
    "el_aeroplane":  "✈️", "el_miti":       "👃", "el_nero":       "💧",
    "el_xilo":       "🪵", "el_petaloyda":  "🦋", "el_podilatο":   "🚲",
    "el_bala":       "⚽", "el_ntomata":    "🍅", "el_stronggilo": "⭕",
    "el_afti":       "👂",
}

# ── Background color per phoneme target ──────────────────────────────────────
PHONEME_COLORS = {
    "r":   ("#FFF3E0", "#E65100"),  # orange family
    "l":   ("#E8F5E9", "#2E7D32"),  # green family
    "s":   ("#E3F2FD", "#1565C0"),  # blue family
    "z":   ("#E8EAF6", "#283593"),
    "ʃ":   ("#EDE7F6", "#4527A0"),  # purple
    "θ":   ("#FCE4EC", "#880E4F"),  # pink
    "ð":   ("#FCE4EC", "#AD1457"),
    "x":   ("#FFF8E1", "#F57F17"),  # amber
    "ɣ":   ("#F1F8E9", "#558B2F"),
    "ts":  ("#E0F7FA", "#006064"),  # teal
    "dz":  ("#E0F2F1", "#004D40"),
    "v":   ("#FFF3E0", "#BF360C"),
    "f":   ("#FFF8E1", "#E65100"),
    "k":   ("#F3E5F5", "#6A1B9A"),
    "p":   ("#E8F5E9", "#1B5E20"),
    "b":   ("#E3F2FD", "#0D47A1"),
    "t":   ("#FBE9E7", "#BF360C"),
    "d":   ("#FAFAFA", "#212121"),
    "tr":  ("#FFF3E0", "#E65100"),
    "sp":  ("#E3F2FD", "#1565C0"),
    "str": ("#EDE7F6", "#4527A0"),
    "fl":  ("#E8F5E9", "#2E7D32"),
    "sn":  ("#E3F2FD", "#1565C0"),
    "dr":  ("#FCE4EC", "#880E4F"),
    "fr":  ("#E8F5E9", "#2E7D32"),
    "ps":  ("#FFF8E1", "#F57F17"),
    "ks":  ("#E0F7FA", "#006064"),
    "sp":  ("#E3F2FD", "#1565C0"),
    "m":   ("#FFF8E1", "#E65100"),
    "n":   ("#F3E5F5", "#6A1B9A"),
    "j":   ("#E8F5E9", "#2E7D32"),
    "g":   ("#E0F2F1", "#004D40"),
    "tʃ":  ("#EDE7F6", "#4527A0"),
    "dʒ":  ("#FCE4EC", "#880E4F"),
    "sp":  ("#E3F2FD", "#1565C0"),
    "default": ("#F5F5F5", "#37474F"),
}


def get_font(size, bold=False):
    """Try system fonts in order of preference."""
    candidates = [
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/calibri.ttf",
    ]
    if bold:
        candidates = [
            "C:/Windows/Fonts/segoeuib.ttf",
            "C:/Windows/Fonts/arialbd.ttf",
            "C:/Windows/Fonts/calibrib.ttf",
        ] + candidates
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def get_emoji_font(size):
    """Try to get an emoji-capable font."""
    candidates = [
        "C:/Windows/Fonts/seguiemj.ttf",   # Segoe UI Emoji
        "C:/Windows/Fonts/segoeui.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def draw_rounded_rect(draw, xy, radius, fill, outline=None, outline_width=2):
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle([x1, y1, x2, y2], radius=radius, fill=fill,
                            outline=outline, width=outline_width)


def make_card(word_id, word, ipa, phoneme, translation, emoji_char):
    W, H = 400, 400
    bg_color, accent_color = PHONEME_COLORS.get(phoneme, PHONEME_COLORS["default"])

    img = Image.new("RGB", (W, H), bg_color)
    draw = ImageDraw.Draw(img)

    # Subtle border
    draw.rounded_rectangle([4, 4, W-4, H-4], radius=20,
                            outline=accent_color, width=3, fill=bg_color)

    # Phoneme label pill at top
    pill_text = f"/{phoneme}/"
    font_pill = get_font(15, bold=True)
    bbox = draw.textbbox((0, 0), pill_text, font=font_pill)
    pw, ph = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pill_x = (W - pw - 20) // 2
    draw.rounded_rectangle([pill_x, 20, pill_x + pw + 20, 20 + ph + 10],
                            radius=99, fill=accent_color)
    draw.text((pill_x + 10, 25), pill_text, font=font_pill, fill="white")

    # Emoji — big, centered
    emoji_font = get_emoji_font(110)
    try:
        bbox_e = draw.textbbox((0, 0), emoji_char, font=emoji_font)
        ew = bbox_e[2] - bbox_e[0]
        eh = bbox_e[3] - bbox_e[1]
        ex = (W - ew) // 2 - bbox_e[0]
        ey = 65 - bbox_e[1]
        draw.text((ex, ey), emoji_char, font=emoji_font, embedded_color=True)
    except Exception:
        # Fallback: draw a colored circle with first letter
        draw.ellipse([120, 70, 280, 220], fill=accent_color)
        fb = get_font(80, bold=True)
        letter = word[0].upper()
        bbox_l = draw.textbbox((0, 0), letter, font=fb)
        lx = (W - (bbox_l[2] - bbox_l[0])) // 2
        ly = 110 - bbox_l[1]
        draw.text((lx, ly), letter, font=fb, fill="white")

    # Word text
    font_word = get_font(36, bold=True)
    bbox_w = draw.textbbox((0, 0), word, font=font_word)
    ww = bbox_w[2] - bbox_w[0]
    draw.text(((W - ww) // 2, 235), word, font=font_word, fill="#1a1a2e")

    # Translation (if different from word)
    if translation and translation.lower() != word.lower():
        font_trans = get_font(18)
        t_text = f"({translation})"
        bbox_t = draw.textbbox((0, 0), t_text, font=font_trans)
        tw = bbox_t[2] - bbox_t[0]
        draw.text(((W - tw) // 2, 282), t_text, font=font_trans, fill="#666")

    # IPA
    font_ipa = get_font(20)
    ipa_text = ipa
    bbox_i = draw.textbbox((0, 0), ipa_text, font=font_ipa)
    iw = bbox_i[2] - bbox_i[0]
    draw.text(((W - iw) // 2, 315), ipa_text, font=font_ipa, fill=accent_color)

    # Bottom divider
    draw.line([(40, 350), (W - 40, 350)], fill=accent_color + "80"
              if len(accent_color) == 7 else accent_color, width=1)

    # App label
    font_label = get_font(12)
    label = "LogotherapyPro"
    bbox_lb = draw.textbbox((0, 0), label, font=font_label)
    lbw = bbox_lb[2] - bbox_lb[0]
    draw.text(((W - lbw) // 2, 362), label, font=font_label, fill="#aaa")

    return img


def main():
    words_dir = os.path.join(os.path.dirname(__file__), "data", "words")
    total = 0
    skipped = 0

    for lang_file in ["en.json", "el.json"]:
        path = os.path.join(words_dir, lang_file)
        if not os.path.exists(path):
            print(f"Skipping {lang_file} — not found")
            continue

        with open(path, encoding="utf-8") as f:
            data = json.load(f)

        for word in data["words"]:
            wid        = word["id"]
            filename   = word["image_filename"]
            out_path   = os.path.join(OUTPUT_DIR, filename)

            if os.path.exists(out_path):
                skipped += 1
                continue

            emoji_char = EMOJI.get(wid, "🔊")
            translation = word.get("translation", "")

            try:
                img = make_card(
                    word_id=wid,
                    word=word["word"],
                    ipa=word["ipa"],
                    phoneme=word["phoneme_target"],
                    translation=translation,
                    emoji_char=emoji_char,
                )
                img.save(out_path, "JPEG", quality=92)
                print(f"  OK  {filename}")
                total += 1
            except Exception as e:
                print(f"  FAIL  {filename}: {e}")

    print(f"\nDone -- {total} images generated, {skipped} already existed.")
    print(f"Saved to: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
