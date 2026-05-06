import { type FC } from "react";
import { truncateAddress } from "../lib/utils";

interface WalletPillProps {
  address: string;
  balanceSol: number;
  className?: string;
}

const WalletPill: FC<WalletPillProps> = ({
  address,
  balanceSol,
  className = "",
}) => {
  return (
    <div
      className={[
        "inline-flex items-center gap-2 px-3 py-1.5",
        "rounded-full bg-[var(--color-elevated)] border border-[var(--color-border)]",
        className,
      ].join(" ")}
    >
      {/* Green connected dot */}
      <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-success)] shrink-0" />

      {/* Truncated address */}
      <span className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)] tabular-nums">
        {truncateAddress(address)}
      </span>

      {/* Separator */}
      <span className="w-px h-3 bg-[var(--color-border)]" />

      {/* SOL balance */}
      <span className="font-[var(--font-mono)] text-xs text-[var(--color-text-primary)] tabular-nums">
        {balanceSol.toFixed(2)} SOL
      </span>
    </div>
  );
};

export default WalletPill;
