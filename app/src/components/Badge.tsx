import { type FC } from "react";
import { LockIcon, CheckIcon, ClockIcon } from "./Icons";

type BadgeVariant = "encrypted" | "paid" | "pending" | "active" | "inactive";

interface BadgeProps {
  variant: BadgeVariant;
  label?: string;
  className?: string;
}

const variantConfig: Record<
  BadgeVariant,
  {
    bg: string;
    text: string;
    border?: string;
    icon: FC<{ className?: string; size?: number }> | null;
    dot?: string;
    defaultLabel: string;
  }
> = {
  encrypted: {
    bg: "bg-[var(--color-accent-subtle)]",
    text: "text-[var(--color-accent)]",
    icon: LockIcon,
    defaultLabel: "Encrypted",
  },
  paid: {
    bg: "bg-[rgba(0,184,148,0.12)]",
    text: "text-[var(--color-success)]",
    icon: CheckIcon,
    defaultLabel: "Paid",
  },
  pending: {
    bg: "bg-[rgba(253,203,110,0.12)]",
    text: "text-[var(--color-warning)]",
    icon: ClockIcon,
    defaultLabel: "Pending",
  },
  active: {
    bg: "bg-[rgba(0,184,148,0.12)]",
    text: "text-[var(--color-success)]",
    icon: null,
    dot: "bg-[var(--color-success)]",
    defaultLabel: "Active",
  },
  inactive: {
    bg: "bg-[var(--color-elevated)]",
    text: "text-[var(--color-text-muted)]",
    icon: null,
    dot: "bg-[var(--color-text-muted)]",
    defaultLabel: "Inactive",
  },
};

const Badge: FC<BadgeProps> = ({ variant, label, className = "" }) => {
  const config = variantConfig[variant];
  const IconComponent = config.icon;
  const displayLabel = label ?? config.defaultLabel;

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 px-2.5 py-1",
        "rounded-full font-[var(--font-mono)] text-[11px] leading-none font-medium",
        config.bg,
        config.text,
        className,
      ].join(" ")}
    >
      {IconComponent && <IconComponent size={12} />}
      {config.dot && (
        <span
          className={["inline-block w-1.5 h-1.5 rounded-full", config.dot].join(
            " "
          )}
        />
      )}
      {displayLabel}
    </span>
  );
};

export default Badge;
