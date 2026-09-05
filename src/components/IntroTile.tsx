import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  leaving: boolean;
  onClose: () => void;
};

export default function IntroTile({ open, leaving, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
      <button
        type="button"
        className={cn(
          "absolute inset-0 bg-black/50",
          leaving ? "animate-[intro-veil-out_280ms_ease-in_forwards]" : "animate-[intro-veil-in_280ms_ease-out]",
        )}
        aria-label="Dismiss introduction"
        onClick={onClose}
      />
      <article
        role="dialog"
        aria-labelledby="intro-title"
        className={cn(
          "paper-grid relative w-full max-w-[28rem] rounded-lg border border-border bg-card/95 p-7 backdrop-blur-md sm:p-8",
          leaving
            ? "animate-[intro-out_280ms_ease-in_forwards]"
            : "animate-[intro-in_420ms_ease-out]",
        )}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" strokeWidth={2} />
        </button>

        <p
          id="intro-title"
          className="text-[0.65rem] tracking-[0.24em] text-muted-foreground uppercase"
        >
          Dillon Harindiran
        </p>

        <div className="mt-5 space-y-4 font-display text-[1.35rem] leading-[1.25] text-foreground">
          <p>
            Hi I&apos;m Dillon. I live in London. I&apos;m building{" "}
            <a
              href="https://www.contextsystems.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-primary/50 underline-offset-4 transition-colors hover:text-primary hover:decoration-primary"
            >
              Context Systems
            </a>{" "}
            and you can often find me in NY and SF.
          </p>
          <p>
            We&apos;re organising institutional knowledge so law firms can finally unlock and use
            their decades of institutional knowledge across the tools they use.
          </p>
          <p>
            Before this, I built Slipstream. A real-time credit bureau that pivoted from
            rental-as-a-service.
          </p>
          <p>
            My diary is{" "}
            <a
              href="https://calendly.com/dillon"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-primary/50 underline-offset-4 transition-colors hover:text-primary hover:decoration-primary"
            >
              calendly.com/dillon
            </a>
            .
          </p>
        </div>
      </article>
    </div>
  );
}
