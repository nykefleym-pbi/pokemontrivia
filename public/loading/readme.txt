Boot loading-screen artwork — one image per calendar month.

NAMING (required)
  Zero-padded month number + .webp:

    01.webp  January     07.webp  July
    02.webp  February    08.webp  August
    03.webp  March       09.webp  September
    04.webp  April       10.webp  October
    05.webp  May         11.webp  November
    06.webp  June        12.webp  December

  The app resolves the path from the device clock (loadingArtForMonth in
  src/lib/app-icons.ts), so dropping a correctly named file in this folder is
  all that is needed — no code change, no list to update.

MISSING MONTHS ARE FINE
  If the file for the current month is absent, the loading screen falls back to
  the app's brand gradient. Nothing breaks and nothing needs disabling.

SIZING
  Rendered full-bleed with object-fit: cover, portrait phone screens.

    1284 x 2778 px   covers every device this app targets, including the
                     3x iPhone Pro Max class, with no upscaling.

  Keep the file under ~400 KB — it is fetched during the 5-second logo phase,
  and a heavier file risks not being painted before the phase changes. WebP at
  quality 80-85 comfortably hits that at this resolution.

COMPOSITION
  The bottom half carries a dark scrim for the progress bar and tip of the day.
  Put the subject in the TOP TWO-THIRDS; anything below that is dimmed and
  partly covered by text.
