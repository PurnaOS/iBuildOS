import type { JSX } from "react";
import { cn } from "../../lib/cn.js";
import { ENGINEERING_NAV, PRODUCT_NAV, type Mode } from "../../lib/nav.js";

interface SidebarProps {
  mode: Mode;
  activeId: string;
  onSelect: (id: string) => void;
}

export function Sidebar({ mode, activeId, onSelect }: SidebarProps): JSX.Element {
  const items = mode === "product" ? PRODUCT_NAV : ENGINEERING_NAV;
  return (
    <nav
      aria-label={mode === "product" ? "Product navigation" : "Engineering navigation"}
      className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-border p-2"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px]",
              "transition-colors duration-150 ease-out",
              active
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
