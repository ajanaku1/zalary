import { type FC } from "react";

interface AvatarProps {
  initials: string;
  color: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeDimensions: Record<NonNullable<AvatarProps["size"]>, { px: number; text: string }> = {
  sm: { px: 28, text: "text-[10px]" },
  md: { px: 36, text: "text-xs" },
  lg: { px: 48, text: "text-sm" },
};

const Avatar: FC<AvatarProps> = ({
  initials,
  color,
  size = "md",
  className = "",
}) => {
  const dim = sizeDimensions[size];

  return (
    <div
      className={[
        "inline-flex items-center justify-center rounded-full font-semibold text-white select-none shrink-0",
        dim.text,
        className,
      ].join(" ")}
      style={{
        width: dim.px,
        height: dim.px,
        backgroundColor: color,
      }}
      aria-hidden="true"
    >
      {initials.slice(0, 2).toUpperCase()}
    </div>
  );
};

export default Avatar;
