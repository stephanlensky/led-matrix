import { useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type TruncatedTextProps = {
  children: string;
  className?: string;
};

function isTruncated(element: HTMLElement | null): boolean {
  return element !== null && element.scrollWidth > element.clientWidth;
}

export function TruncatedText({ children, className }: TruncatedTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Tooltip open={isOpen} onOpenChange={(open) => setIsOpen(open && isTruncated(ref.current))}>
      <TooltipTrigger render={<span ref={ref} className={cn("min-w-0 truncate", className)} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent className="break-all">{children}</TooltipContent>
    </Tooltip>
  );
}
