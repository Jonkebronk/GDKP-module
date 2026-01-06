import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { Eye } from 'lucide-react';

interface UserDisplayProps {
  /** The alias or display name to show */
  displayName: string;
  /** The real Discord username (only shown to admins) */
  discordUsername?: string;
  /** Optional avatar URL */
  avatar?: string | null;
  /** Show avatar alongside name */
  showAvatar?: boolean;
  /** Avatar size in pixels */
  avatarSize?: number;
  /** Additional CSS classes */
  className?: string;
}

export function UserDisplay({
  displayName,
  discordUsername,
  avatar,
  showAvatar = false,
  avatarSize = 24,
  className = '',
}: UserDisplayProps) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLSpanElement>(null);

  // Show tooltip if admin and discord username differs from display name
  const canShowTooltip = isAdmin && discordUsername && discordUsername !== displayName;

  // Position tooltip to not overflow screen
  useEffect(() => {
    if (showTooltip && tooltipRef.current && containerRef.current) {
      const tooltip = tooltipRef.current;

      // Reset positioning
      tooltip.style.left = '50%';
      tooltip.style.transform = 'translateX(-50%)';

      // Check if tooltip overflows right edge
      const tooltipRect = tooltip.getBoundingClientRect();
      if (tooltipRect.right > window.innerWidth - 10) {
        tooltip.style.left = 'auto';
        tooltip.style.right = '0';
        tooltip.style.transform = 'none';
      }
      // Check if tooltip overflows left edge
      if (tooltipRect.left < 10) {
        tooltip.style.left = '0';
        tooltip.style.transform = 'none';
      }
    }
  }, [showTooltip]);

  return (
    <span
      ref={containerRef}
      className={`inline-flex items-center gap-1.5 relative ${className}`}
      onMouseEnter={() => canShowTooltip && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {showAvatar && (
        <img
          src="/anonymous-avatar.png"
          alt={displayName}
          className="rounded-full object-cover"
          style={{ width: avatarSize, height: avatarSize }}
        />
      )}

      <span className={canShowTooltip ? 'cursor-help border-b border-dotted border-gray-500' : ''}>
        {displayName}
      </span>

      {canShowTooltip && (
        <Eye className="h-3 w-3 text-gray-500" />
      )}

      {/* Admin tooltip showing real Discord username */}
      {showTooltip && canShowTooltip && (
        <div
          ref={tooltipRef}
          className="absolute bottom-full mb-2 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-50 whitespace-nowrap"
        >
          <div className="text-xs text-gray-400 mb-1">Discord:</div>
          <div className="text-sm text-white font-medium">{discordUsername}</div>
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="border-8 border-transparent border-t-gray-700" />
            <div className="absolute -top-px left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-900" />
          </div>
        </div>
      )}
    </span>
  );
}

// Simplified version for common use cases
interface SimpleUserDisplayProps {
  user: {
    alias?: string | null;
    discord_username?: string;
    display_name?: string;
    username?: string;
    discord_avatar?: string | null;
    avatar?: string | null;
  };
  showAvatar?: boolean;
  avatarSize?: number;
  className?: string;
}

export function SimpleUserDisplay({
  user: userData,
  showAvatar = false,
  avatarSize = 24,
  className = '',
}: SimpleUserDisplayProps) {
  // Determine display name from various possible fields
  const displayName = userData.display_name
    || userData.alias
    || userData.username
    || userData.discord_username
    || 'Unknown';

  const discordUsername = userData.discord_username;
  const avatar = userData.discord_avatar || userData.avatar;

  return (
    <UserDisplay
      displayName={displayName}
      discordUsername={discordUsername}
      avatar={avatar}
      showAvatar={showAvatar}
      avatarSize={avatarSize}
      className={className}
    />
  );
}
