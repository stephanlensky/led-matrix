import { type LucideIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const EXPANDED_STORAGE_KEY = "navigation-expanded";

export type NavigationItem<T extends string> = {
  id: T;
  label: string;
  icon: LucideIcon;
};

type NavigationProps<T extends string> = {
  items: readonly NavigationItem<T>[];
  activeId: T;
  onSelect: (id: T) => void;
};

function getStoredExpanded(): boolean {
  try {
    return localStorage.getItem(EXPANDED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function setStoredExpanded(isExpanded: boolean) {
  try {
    localStorage.setItem(EXPANDED_STORAGE_KEY, String(isExpanded));
  } catch {
    return;
  }
}

function NavigationTooltip({
  label,
  isEnabled,
  children,
}: {
  label: string;
  isEnabled: boolean;
  children: ReactElement;
}) {
  if (!isEnabled) {
    return children;
  }
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function NavigationLabel({ isExpanded, children }: { isExpanded: boolean; children: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "truncate transition-opacity duration-200 motion-reduce:transition-none",
        !isExpanded && "opacity-0",
      )}
    >
      {children}
    </span>
  );
}

const itemClassName =
  "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-sm whitespace-nowrap text-muted-foreground outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0";

export function Navigation<T extends string>({ items, activeId, onSelect }: NavigationProps<T>) {
  const [isExpanded, setIsExpanded] = useState(getStoredExpanded);
  const toggleLabel = isExpanded ? "Collapse sidebar" : "Expand sidebar";
  const ToggleIcon = isExpanded ? PanelLeftCloseIcon : PanelLeftOpenIcon;

  function toggle() {
    setIsExpanded(!isExpanded);
    setStoredExpanded(!isExpanded);
  }

  return (
    <nav
      className={cn(
        "flex shrink-0 flex-col justify-between overflow-hidden border-r bg-sidebar p-2 transition-[width] duration-200 ease-out motion-reduce:transition-none",
        isExpanded ? "w-44" : "w-12",
      )}
    >
      <ul className="flex flex-col gap-1">
        {items.map(({ id, label, icon: Icon }) => {
          const isActive = id === activeId;
          return (
            <li key={id}>
              <NavigationTooltip label={label} isEnabled={!isExpanded}>
                <button
                  type="button"
                  aria-label={label}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onSelect(id)}
                  className={cn(
                    itemClassName,
                    isActive && "bg-muted text-foreground hover:bg-muted",
                  )}
                >
                  <Icon />
                  <NavigationLabel isExpanded={isExpanded}>{label}</NavigationLabel>
                </button>
              </NavigationTooltip>
            </li>
          );
        })}
      </ul>
      <NavigationTooltip label={toggleLabel} isEnabled={!isExpanded}>
        <button
          type="button"
          aria-label={toggleLabel}
          aria-expanded={isExpanded}
          onClick={toggle}
          className={itemClassName}
        >
          <ToggleIcon />
          <NavigationLabel isExpanded={isExpanded}>Collapse</NavigationLabel>
        </button>
      </NavigationTooltip>
    </nav>
  );
}
