import type { ReactNode } from "react";
import { TruncatedText } from "./TruncatedText.tsx";
import { cn } from "@led-matrix/ui/lib/utils";

type ListRowProps = {
  icon: ReactNode;
  title: string;
  subtitle: string;
  detail: string;
  isActive?: boolean;
  onClick?: () => void;
};

export function ListRow({
  icon,
  title,
  subtitle,
  detail,
  isActive = false,
  onClick,
}: ListRowProps) {
  return (
    <button
      type="button"
      aria-pressed={onClick ? isActive : undefined}
      disabled={!onClick}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 border-l-2 border-transparent px-3 py-2 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted disabled:cursor-default disabled:hover:bg-transparent",
        isActive && "border-foreground bg-muted hover:bg-muted",
      )}
    >
      <span className={cn("text-muted-foreground [&_svg]:size-3.5", isActive && "text-foreground")}>
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <TruncatedText className="text-sm">{title}</TruncatedText>
        <TruncatedText className="text-xs text-muted-foreground">{subtitle}</TruncatedText>
      </span>
      <span className="font-mono text-xs text-muted-foreground tabular-nums">{detail}</span>
    </button>
  );
}

export function ListEmpty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-6 text-center text-xs text-muted-foreground">{children}</p>;
}
