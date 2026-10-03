# Klammr brand guide

Klammr's identity is a **text cursor held in a pair of brackets**, `[|]`: the moment before you type, and the
name itself (*Klammer* is German for bracket). The cursor is the only coloured element; everything else is quiet.

Source files live in [`brand/`](../brand). Rasterised icons are generated from them into `product/icons/`,
`media/` (extension), `site/img/` (website) and, at install time, into the app's `.icns` / `.ico`.

## Mark

| File | Use |
|---|---|
| `brand/klammr-mark.svg` | The app icon: mark on a dark rounded tile (58/256 corner radius). Launchers, dock, website favicon, social avatars. |
| `brand/klammr-glyph.svg` | Mark without the tile; the brackets use `currentColor`. For dark or themed surfaces inside the app (chat empty state, About). |
| `brand/klammr-mark-mono.svg` | 24 px single-colour outline (`currentColor`, 2.2 stroke). Activity bar, status bar, menus, anywhere an icon must follow the UI colour. |
| `brand/klammr-wordmark.svg` | Mark + "Klammr" set in Inter 700, tracking −0.03 em. Website header, README, documents. |
| `brand/letterpress-*.svg` | Empty-editor watermark variants (dark / light / high-contrast). Installed over VS Code's letterpress. |
| `brand/social-card.svg` | 1200 × 630 Open Graph / social preview. |

Geometry (256 grid): brackets stroke 22 with round caps and joins, left `103,68 → 70,68 → 70,188 → 103,188`, right
mirrored about x 128; cursor bar `x 117–139, y 81–175, r 10`, centred between them. Minimum size 16 px (mono) /
24 px (tile). Clear space around the mark: ¼ of its width. Never recolour the brackets on the tile, never add a
drop shadow, never set the mark on the violet gradient.

## Colour

| Token | Hex | Role |
|---|---|---|
| Ink | `#0F1014` | Page and app background |
| Surface | `#1A1D25` | Cards, tiles, inputs |
| Border | `#262A35` | Hairlines |
| Mist | `#EEF0F6` | Primary text, the brackets |
| Muted | `#8B91A1` | Secondary text |
| Violet | `#7C8CFF` | Primary accent: focus, links, buttons, the cursor bar (top) |
| Orchid | `#B57CFF` | Accent gradient end, editor cursor, the cursor bar (bottom) |
| Keep | `#5FD38A` | Accepted / added |
| Undo | `#FF6B78` | Rejected / removed |
| Warn | `#E8A33D` | Needs approval |

Accent gradient: `linear-gradient(135deg, #7C8CFF, #B57CFF)`. Use it for the hero headline highlight, the
primary call-to-action and the cursor bar only. Interactive accent on dark surfaces: `#7C8CFF`, hover `#8F9BFF`,
text on accent `#0F1014`.

## In the app

**Klammr Dark** (`media/themes/klammr-dark.json`) is generated from the tokens above by
`scripts/build-theme.mjs` (`npm run theme`; CI fails when the committed file is stale). Every colour in it is a
token, a lightness step of one, or one of them with alpha:

- Ink is the window: title bar, status bar and the gaps between panels. Surface is the editor, side bars and panel,
  shown as floating cards with Border hairlines. Fields (inputs, dropdowns, code wells) are inset in Ink; menus,
  widgets and the command palette float one step above Surface (`#222631`).
- Text is `#CDD1DC`, headings and selected items Mist, secondary text Muted, line numbers `#5F6578`.
- Violet marks focus, links, buttons, badges, selections and the activity indicator. Orchid is the editor and
  terminal cursor. Keep / Undo / Warn are diffs and git status (added / removed / modified), errors and warnings.
- Syntax uses the accents lightened for text, plus one sky hue for types: keywords `#C99BFF`, functions `#8F9BFF`,
  strings `#8BDFA9`, numbers and constants `#EEBA6D`, types `#79CFEC`, tags `#FF8F9A`, comments `#6E768A` italic.
  Variables, properties and parameters stay in the text colour, operators and punctuation in Muted.

The Klammr extension sets the workbench defaults that carry the look (`contributes.configurationDefaults` in
`package.json`): VS Code's Modern UI (floating, rounded panels), the brand UI font stack (Inter, then Adwaita Sans,
which is Inter-based, then the system sans), the smooth-blinking cursor and no minimap. The installer seeds the
folded menu bar (`window.menuBarVisibility: compact`), which an extension cannot set.

The chat and Settings webviews follow whatever theme the user runs through `--vscode-*` variables and use the same
UI font stack. Their only fixed colours are the logo, the cursor bar (the streaming caret), the accent gradient on
the send button and the code-block syntax palette (with a light counterpart).

## Type

- UI and website: **Inter** (fallback: system sans). Headlines 700 with −0.02 em tracking, body 400/500.
- Code: the user's editor font (JetBrains Mono by default on Omarchy).
- The product name is **Klammr** (capital K, never KLAMMR or klammr in prose; the CLI command is `klammr`).

## Voice

Short, concrete, developer-to-developer. Say what a feature does and which key triggers it. No exclamation
marks, no "magic", no sparkle emoji. Always state plainly that Klammr runs the user's own Claude Code and is
not affiliated with Anthropic or Anysphere.

## Regenerating assets

```bash
for s in 16 24 32 48 64 128 256 512 1024; do rsvg-convert -w $s -h $s brand/klammr-mark.svg -o product/icons/klammr-$s.png; done
cp product/icons/klammr-1024.png product/icons/klammr.png
cp brand/klammr-mark.svg media/klammr.svg site/img/klammr.svg
cp brand/klammr-mark-mono.svg media/klammr-activity.svg
cp product/icons/klammr-32.png site/img/favicon.png && cp product/icons/klammr-512.png site/img/apple-touch-icon.png
rsvg-convert -w 1200 -h 630 brand/social-card.svg -o site/img/social-card.png
cp product/icons/klammr-256.png site/img/icon-256.png && cp product/icons/klammr-512.png site/brand/klammr-mark-512.png
cp brand/klammr-*.svg brand/social-card.svg site/brand/ && cp brand/klammr-mark.svg brand/letterpress-*.svg product/brand/
npm run theme   # media/themes/klammr-dark.json from scripts/build-theme.mjs
```

The installer builds `.icns` and `.ico` from `product/icons/*.png` on the fly.
