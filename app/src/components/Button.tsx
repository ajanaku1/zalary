import { type ButtonHTMLAttributes, type FC, type ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: [
    "bg-[var(--color-accent)] text-white",
    "hover:bg-[var(--color-accent-hover)]",
  ].join(" "),
  outline: [
    "bg-transparent border border-[var(--color-border)] text-[var(--color-text-primary)]",
    "hover:border-[var(--color-warm)] hover:text-[var(--color-warm)]",
  ].join(" "),
  ghost: [
    "bg-transparent text-[var(--color-text-secondary)]",
    "hover:bg-[var(--color-elevated)] hover:text-[var(--color-text-primary)]",
  ].join(" "),
  danger: [
    "bg-[var(--color-error)] text-white",
    "hover:brightness-110",
  ].join(" "),
};

const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "min-h-[44px] px-4 text-sm",
  md: "min-h-[44px] px-6 text-sm",
  lg: "min-h-[44px] px-8 text-base",
};

const Button: FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  children,
  disabled,
  className = "",
  ...rest
}) => {
  return (
    <button
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center gap-2 font-medium",
        "rounded-[var(--radius-DEFAULT)]",
        "transition-[background-color,transform] duration-200",
        "active:scale-[0.97]",
        "disabled:opacity-50 disabled:pointer-events-none",
        variantClasses[variant],
        sizeClasses[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ transitionTimingFunction: "var(--ease-out)" }}
      {...rest}
    >
      {children}
    </button>
  );
};

export default Button;
