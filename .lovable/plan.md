## Problem
When selecting sprites in the 3rd column on both the trainer avatar and Pokemon selection grids, a horizontal scrollbar appears. The check badge on selected cards uses negative absolute positioning (`-right-2`, `-right-1`) which extends beyond the card and container bounds on the rightmost column.

## Changes in `src/routes/index.tsx`

1. **Trainer grid** (line ~349):
   - Reduce gap from `gap-2.5` to `gap-2` to give the 3rd-column selected badge more breathing room.
   - Move the selected check badge inside the card boundary: change `absolute -right-2 -top-2` to `absolute right-1 top-1` (and shrink badge slightly if needed to fit without overlapping content).

2. **Pokemon grid** (line ~430):
   - Reduce gap from `gap-3` to `gap-2`.
   - Move the selected check badge inside: change `absolute -right-1 -top-1` to `absolute right-1 top-1`.

3. **Scroll container** (line ~280):
   - Add `overflow-x-hidden` to the `flex-1 flex-col overflow-y-auto` container to suppress any residual horizontal overflow.

## Verification
- Open the preview on mobile (390x844).
- Navigate to avatar selection, pick a 3rd-column trainer → no horizontal scrollbar.
- Navigate to Pokemon selection, pick a 3rd-column Pokemon → no horizontal scrollbar.