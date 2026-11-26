import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    // Figma "Toast": night glass with a gold rim (dark only, like the app).
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:!bg-night-deep/90 group-[.toaster]:!text-foreground group-[.toaster]:!border-reward-gold/50 group-[.toaster]:!rounded-2xl group-[.toaster]:backdrop-blur-xl group-[.toaster]:shadow-[0_12px_32px_rgb(0_0_0/0.35)]",
          description: "group-[.toast]:!text-text-secondary",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
