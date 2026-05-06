import { type FC, type ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: string;
  gradient?: boolean;
  hover?: boolean;
}

const Card: FC<CardProps> = ({
  children,
  className = "",
  padding = "p-6",
  gradient = false,
  hover = false,
}) => {
  if (gradient) {
    return (
      <div
        className={[
          "relative rounded-[var(--radius-lg)]",
          hover
            ? "transition-transform duration-200 hover:-translate-y-0.5"
            : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          hover
            ? { transitionTimingFunction: "var(--ease-out)" }
            : undefined
        }
      >
        {/* Gradient border via ::before mask technique */}
        <div
          className="absolute inset-0 rounded-[var(--radius-lg)] pointer-events-none"
          style={{
            padding: "1px",
            background:
              "linear-gradient(135deg, var(--color-accent), var(--color-warm))",
            WebkitMask:
              "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
          }}
        />
        <div
          className={[
            "relative bg-[var(--color-card)] rounded-[var(--radius-lg)]",
            padding,
          ].join(" ")}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        "bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--radius-lg)]",
        padding,
        hover
          ? "transition-[border-color,transform] duration-200 hover:border-[var(--color-border-hover)] hover:-translate-y-0.5"
          : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        hover
          ? { transitionTimingFunction: "var(--ease-out)" }
          : undefined
      }
    >
      {children}
    </div>
  );
};

export default Card;
