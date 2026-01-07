import { formatGold } from '@gdkp/shared';

interface GoldDisplayProps {
  amount: number;
  className?: string;
  iconSize?: number;
  abbreviated?: boolean;
  showSign?: boolean;
}

// WoW-style gold coin SVG
function GoldCoin({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="inline-block"
    >
      <circle cx="12" cy="12" r="10" fill="#FFD700" stroke="#B8860B" strokeWidth="2" />
      <circle cx="12" cy="12" r="6" fill="#FFC000" stroke="#DAA520" strokeWidth="1" />
      <ellipse cx="12" cy="12" rx="3" ry="4" fill="#FFE55C" opacity="0.6" />
    </svg>
  );
}

export function GoldDisplay({
  amount,
  className = '',
  iconSize = 16,
  abbreviated = false,
  showSign = false,
}: GoldDisplayProps) {
  const formattedAmount = formatGold(amount, { abbreviated, showSign, noSuffix: true });

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span>{formattedAmount}</span>
      <GoldCoin size={iconSize} />
    </span>
  );
}
