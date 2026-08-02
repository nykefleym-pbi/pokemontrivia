import { useState } from "react";
import { UI_ICON } from "@/lib/app-icons";
import { RESULT_ART, trimmedArtStyles } from "@/lib/result-art";

/**
 * The "WHO'S THAT POKÉMON?" title, as art.
 *
 * Drawn at its visible height through the same wrapper/negative-margin pair as
 * every other square asset here — see `trimmedArtStyles`, which explains why
 * the negative margin cannot go straight on the <img>. Without it the file's
 * 30% transparent bands top and bottom would reserve ~150px of nothing on a
 * screen that already has a silhouette, a question and a submit button to fit.
 *
 * The pixel heading it replaced stays as the `onError` arm: this is the only
 * title on the screen, and a round that opens with a blank space above the
 * silhouette reads as broken rather than as art that has not arrived.
 */
export function WhosThatWordmark({ className = "" }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  const s = trimmedArtStyles(RESULT_ART.whosThat);
  if (failed) {
    return (
      <h1 className={`text-center font-pixel text-lg leading-relaxed text-foreground ${className}`}>
        WHO&apos;S THAT
        <br />
        POKÉMON?
      </h1>
    );
  }
  return (
    <div className={`relative mx-auto w-full max-w-[300px] ${className}`} style={s.wrapper}>
      <img
        src={encodeURI(UI_ICON.whosThat)}
        alt="Who's that Pokémon?"
        draggable={false}
        onError={() => setFailed(true)}
        className="absolute left-0 top-0 w-full select-none"
        style={s.image}
      />
    </div>
  );
}
