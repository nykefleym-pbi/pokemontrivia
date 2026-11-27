import { trainerSpriteUrl } from "@/lib/game-data";
import { FittedTrainer } from "@/components/na/battle";
import { NaGlossIcon } from "@/components/na/gloss-icon";

/** A trainer in a round frame (Figma avatar()): the app's own art fitted to the frame. */
export function FaceAvatar({ spriteId, ring, size = 96 }: { spriteId: string; ring: string; size?: number }) {
  const art = trainerSpriteUrl(spriteId);
  const k = size / 96;
  return (
    <span
      className="relative block shrink-0 overflow-hidden rounded-full bg-night-card-2"
      style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(3 * k)), borderStyle: "solid", borderColor: ring }}
    >
      {art && <FittedTrainer art={art} height={74 * k} cx={45 * k} feetY={86 * k} />}
    </span>
  );
}

/** Figma faceOff(): you and them, the red VS between, and how many each got right. */
export function FaceOff({
  me,
  them,
  mine,
  theirs,
  width = 320,
  crown,
}: {
  me: string;
  them: string;
  mine?: number | string | null;
  theirs?: number | string | null;
  width?: number;
  /** The winner's crown (16.6). */
  crown?: "me" | "them";
}) {
  const scored = mine != null || theirs != null;
  return (
    <div className="relative shrink-0" style={{ width, height: scored ? 150 : 96 }}>
      <span className="absolute left-0 top-0">
        <FaceAvatar spriteId={me} ring="#FF3B4E" />
      </span>
      <span className="absolute right-0 top-0">
        <FaceAvatar spriteId={them} ring="#5B8CFF" />
      </span>
      <span
        className="na-fill-brand na-headline absolute top-5 flex h-14 w-14 items-center justify-center rounded-full text-foreground shadow-[0_4px_0_#A3142C]"
        style={{ left: width / 2 - 28 }}
      >
        VS
      </span>
      {crown && (
        <span aria-hidden className="absolute -top-[30px]" style={crown === "me" ? { left: 28 } : { right: 28 }}>
          <NaGlossIcon kind="crown" size={40} />
        </span>
      )}
      {mine != null && <span className="na-number-l absolute left-0 top-[108px] w-24 text-center text-reward-gold">{mine}</span>}
      {theirs != null && <span className="na-number-l absolute right-0 top-[108px] w-24 text-center text-reward-gold">{theirs}</span>}
    </div>
  );
}
