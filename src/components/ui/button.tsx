import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all press focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
        /**
         * The app's action button: every "do the thing" button in a flow —
         * Continue, Next Battle, Rematch, Claim, Back home — is this size.
         *
         * Taken from onboarding's "New Trainer", which the owner named as the
         * reference. Before this the same button was h-11, h-12, h-13 or h-14
         * depending on which screen you were on, because each call site picked
         * its own; the level-up screen's Continue read as visibly smaller than
         * everything around it and that is what surfaced the drift.
         *
         * Geometry only — height, radius, padding, type size. Colour, border
         * and shadow stay with the call site, because a primary and a
         * secondary action are the same SIZE and deliberately not the same
         * look.
         *
         * Not for: icon buttons, chips inside list rows, or the mode cards on
         * Home (Daily Quest and friends), which are artwork with their own
         * geometry rather than instances of this.
         */
        action: "h-[58px] rounded-full px-6 text-[17px] font-bold",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
