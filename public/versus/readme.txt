Face-off (VS) screen artwork — backdrops and the Training Bot.

WHAT THIS SCREEN IS
  The moment before a battle: two trainers across a VS bar. The screen is split
  in half. The TOP half belongs to your opponent, the BOTTOM half to you, and
  each half draws its OWN background image. They are two separate pictures, not
  one picture cut in two — there is no horizon to line up across the bar, so a
  backdrop only ever has to look right on its own.


BACKDROP SIZE
  1284 x 1389 px  (portrait, 12:13 — exactly half of the 1284x2778 the boot
                   loading screens use, so one full-screen artwork can be cut
                   into two backdrops if you want a matching pair)

  Format   WebP
  Budget   160 KB or under, each. Two halves on screen at once, so the pair
           costs the same as one loading screen.
  Drawn    object-fit: cover, centred. Anything outside a centre 1284x1240 box
           may be cropped on a short screen — keep nothing important in the
           outer ~5% on any edge.

SAFE AREAS — where the art WILL be covered
  Each half has a dark gradient over it for text legibility, plus a label.

    Top half     top ~150 px   opponent name / title / ELO, over a scrim
                 bottom edge   the VS bar sits on the seam
    Bottom half  bottom ~380 px  your name / title / ELO and any buttons,
                                 over a heavier scrim
                 top edge      the VS bar sits on the seam

  The middle band of each half is what actually reads. Put the subject there.

  A backdrop is also darkened overall — 25% black on a lit half, 65% on a half
  whose trainer has not resolved yet. Art that is already dark will go very
  dark; favour something with light in it.


THE RECIPE
  Same as public/loading — see that readme for the sharp/cwebp pipeline. In
  short: flatten, resize to 1284x1389 lanczos3, WebP quality 80, then step down
  76 -> 72 -> 68 only as far as the file needs to reach budget, and eyeball it
  at 1:1.

  The 18 backdrops here came through exactly that, 3.88 MB -> 2.05 MB. Most
  landed at q80; the four busiest needed 76 and Ultraworm Hole 72, which is
  still indistinguishable from its source in a 1:1 crop.


TRAINING BOT
  Two files, both optional and independent.

  Avatar     Any size up to about 900 x 900 px. Drawn at 62% of its half's
             height, max 210 px tall, so more than ~600 px is wasted bytes.
             An animated GIF is fine and is the intended format — it replaces
             the trainer sprite outright rather than sitting behind it.
             Transparent background. Budget 500 KB; a GIF this size gets heavy
             fast, so prefer few frames over many.
  Backdrop   A normal backdrop to the spec above. This is the bot's own half,
             shown whenever you face it.


ADDING A BACKDROP
  Drop the .webp in this folder, then add one row to VERSUS_BACKDROPS in
  src/lib/versus-backdrops.ts:

    { id: "under-the-sea", label: "Under the Sea", file: "Under the Sea.webp" }

  `id` is what a saved preference points at — pick a slug and never reuse it
  for different art. `label` is what the player reads in the picker. `file` is
  the filename exactly as it sits here, spaces and apostrophes included; the
  app encodes it.

  A test (src/lib/versus-backdrops.test.ts) fails if the two ever drift: a row
  naming a file that is not here, or a file here that no row lists. Both are
  silent at runtime, which is why they are a test.

  Players choose theirs in Settings -> Trainer -> Battle background. It draws
  on THEIR half only; the opponent's pick is not synced, so their half — and
  yours before you have chosen — gets the catalogue default, Forest.

TRAINING BOT WIRING
  Its two files are separate constants in src/lib/app-icons.ts:

    TRAINING_BOT_AVATAR    e.g. "/versus/training-bot.gif"
    TRAINING_BOT_BACKDROP  e.g. "/versus/training-bot-bg.webp"

  Both null today, which is a valid state: a missing avatar falls back to a
  trainer sprite and a missing backdrop to the shared default. Nothing breaks
  and nothing needs disabling.
