Boot loading-screen artwork — one image drawn at random per app open.

NAMING
  Anything you like, as long as it ends in .webp. The folder itself is the list:
  the app enumerates it at build time rather than looking for particular names,
  so dropping a file in adds it to the rotation and deleting one removes it. No
  code change either way, and no naming scheme to keep to.

  (Enumerated by loadingArtManifest() in vite.config.ts, exposed to the app as
  the `virtual:loading-art` module. A running dev server reads the list once —
  restart it after adding art. A deploy always reflects the current folder.)

HOW THE PICK WORKS
  Random per open, excluding whichever file the previous open used, so even a
  small folder visibly changes every launch. One file shows every time; an empty
  folder falls back to the app's brand gradient. Both are valid states — nothing
  breaks and nothing needs disabling.

SIZING
  Rendered full-bleed with object-fit: cover, portrait phone screens.

    1284 x 2778 px   covers every device this app targets, including the
                     3x iPhone Pro Max class, with no upscaling.

  Keep the file under ~320 KB — it is fetched during the 5-second logo phase,
  and a heavier file risks not being painted before the phase changes. The build
  warns about any file over that, and about any file here that is not a .webp
  (which the screen ignores entirely).

  Upload at whatever size you have and re-encode before committing. Every file
  currently in this folder came through:

    sharp(src)
      .flatten({ background: "#000000" })   // the screen is opaque; alpha is waste
      .resize(1284, 2778, { fit: "cover", kernel: "lanczos3" })
      .webp({ quality: 80, effort: 6, smartSubsample: true })

  Quality 80 lands 150-250 KB and is indistinguishable from the source at 1:1;
  step down to 76 if a busy image comes out over budget. 2000 px wide is roughly
  three times the bytes for pixels no phone can show.

COMPOSITION
  The bottom half carries a dark scrim for the progress bar and tip of the day.
  Put the subject in the TOP TWO-THIRDS; anything below that is dimmed and
  partly covered by text.
