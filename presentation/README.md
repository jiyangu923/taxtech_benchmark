# TEI Keynote — Tax AI Infrastructure

A self-contained, offline-safe slide deck for the TEI conference talk
**"Tax AI Infrastructure: The Next 2–3 Years."**

## Files
- **`index.html`** — the deck. One file, no build step, no dependencies. Opens in any browser.
- **`SPEAKER-NOTES.md`** — rehearsal script, run-of-show with timing, the coding analogy, and Q&A prep.

## Present it
1. Double-click `index.html` (or open it in Chrome/Edge/Safari).
2. Press **F** for fullscreen. Done — it fills the projector at 16:9.

### Controls
| Key | Action |
|-----|--------|
| **→ / Space / Page Down** | Next slide |
| **← / Page Up** | Previous slide |
| **F** | Toggle fullscreen |
| **N** | Toggle presenter notes (on-screen) |
| **Home / End** | First / last slide |
| Click right / left edge | Next / previous |

The slide number in the corner and the bottom progress bar track where you are.
Deep-link to any slide with `index.html#18`.

## Offline & projector notes
- Fonts (Inter / Geist Mono) load from Google when online and fall back to
  clean system fonts offline — either way it looks right.
- The QR slide pulls a code from an online generator. **If the venue Wi-Fi is
  unreliable, pre-generate one:** make a QR for `https://taxbenchmark.ai`, save
  it as `qr.png` in this folder, and change the QR `<img src>` in `index.html`
  to `qr.png`. If it can't load, the slide auto-shows a labelled fallback.
- For a presenter-notes-on-a-second-screen setup, mirror the display and use
  **N**, or keep `SPEAKER-NOTES.md` open on your laptop.

## Export to PDF (backup copy / handout)
Open in Chrome → **Print** → *Save as PDF* → Landscape, margins **None**,
enable *Background graphics*. Tip: append `#1` and step through, or just print —
each `.slide` is sized to a 16:9 page.

## Editing
It's plain HTML/CSS. Each slide is a `<section class="slide">`. Page numbers
auto-update, so you can insert or remove slides freely without renumbering.
Presenter notes live in `<aside class="notes">` inside each slide.
