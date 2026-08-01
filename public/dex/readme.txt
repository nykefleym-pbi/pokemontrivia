Pokédex detail-page backdrops
=============================

The artwork behind a Pokémon's name, types and sprite on its detail page —
the screen with the Pokédex entry and the Play cry button.

Canvas
------
  1170 x 1500 px, portrait (aspect 0.78)
  .webp, quality ~80, under 220 KB each

1170 is 390 CSS px at 3x — the width of an iPhone 12/13/14/15 Pro, and the
same convention public/loading uses.

Safe zone: the middle 1170 x 1170
---------------------------------
The header's height is not fixed. It is roughly 408 CSS px on a phone with no
notch and a one-line name, and grows to about 500 with a notch's safe-area
inset and a name that wraps to two lines. The image is painted with
`object-fit: cover`, so a shorter header crops the TOP AND BOTTOM.

Treat the top 165 px and the bottom 165 px as bleed. Anything that must be
seen — a horizon, a landmark, the focal point — belongs in the middle square.

Composition notes
-----------------
* The top ~38% sits under a dark scrim (black 42% fading to nothing), which is
  what keeps the white name, dex number and type chips readable. A bright sky
  up there is fine and is what the scrim is for.
* A 224 CSS px circular disc sits over the centre holding the sprite, tinted
  black 15% with a 2px blur. Busy detail dead-centre is wasted; keep the middle
  fairly open.
* The bottom edge butts against the cream page background, so a hard line
  there reads as a seam. Fade or land it on ground/horizon.

Where files go
--------------
  public/dex/type/<type>.webp        the habitat shared by every Pokémon whose
                                     PRIMARY type is this one. 18 files:
                                     normal fire water electric grass ice
                                     fighting poison ground flying psychic bug
                                     rock ghost dragon dark steel fairy

  public/dex/pokemon/<dex id>.webp   a one-off scene for a single Pokémon,
                                     used for Legendaries and Mythicals.
                                     Named by NATIONAL DEX NUMBER, not name:
                                     150.webp is Mewtwo, 151.webp is Mew.
                                     Takes priority over the type file.

Both folders may be empty, half full or complete. A Pokémon with no art of its
own and no art for its type keeps the plain type gradient the page has always
had — that is a supported state, not a bug.

Adding a file is the whole of the work. The build reads these folders (see
dexBackdropManifest in vite.config.ts), so no code changes; a running dev
server needs a restart to notice a new one.
