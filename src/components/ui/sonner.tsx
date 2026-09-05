import type { ComponentProps } from "react";
import { X } from "lucide-react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      theme="dark"
      position="bottom-right"
      closeButton
      duration={4000}
      visibleToasts={4}
      gap={10}
      offset="16px"
      mobileOffset="16px"
      icons={{
        close: <X className="size-3" strokeWidth={2.5} />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card/95 group-[.toaster]:text-foreground group-[.toaster]:border-white/10 group-[.toaster]:shadow-lg group-[.toaster]:rounded-md group-[.toaster]:px-3 group-[.toaster]:py-2 group-[.toaster]:text-xs group-[.toaster]:font-mono group-[.toaster]:backdrop-blur-md group-[.toaster]:gap-2",
          title: "group-[.toast]:text-xs group-[.toast]:font-mono",
          description: "group-[.toast]:text-[0.65rem] group-[.toast]:text-muted-foreground",
          closeButton:
            "group-[.toast]:size-5 group-[.toast]:p-0.5 group-[.toast]:text-muted-foreground/60 group-[.toast]:hover:text-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
