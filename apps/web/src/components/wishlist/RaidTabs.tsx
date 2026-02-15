import { TBC_RAID_INSTANCES } from '@gdkp/shared';
import { ChevronDown } from 'lucide-react';

interface RaidTabsProps {
  selectedRaid: string | null;
  onSelectRaid: (raid: string | null) => void;
  itemCounts?: Record<string, number>;
}

export function RaidTabs({ selectedRaid, onSelectRaid, itemCounts = {} }: RaidTabsProps) {
  const selectedLabel = selectedRaid
    ? `${selectedRaid} (${itemCounts[selectedRaid] || 0})`
    : 'All Raids';

  return (
    <div className="relative">
      <select
        value={selectedRaid || ''}
        onChange={(e) => onSelectRaid(e.target.value || null)}
        className="w-full sm:w-auto appearance-none bg-gray-800 border border-gray-600 rounded-lg px-4 py-2.5 pr-10 text-sm font-medium text-white focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 cursor-pointer"
      >
        <option value="">All Raids</option>
        {TBC_RAID_INSTANCES.map((instance) => {
          const count = itemCounts[instance.name] || 0;
          return (
            <option key={instance.id} value={instance.name}>
              {instance.name} ({count})
            </option>
          );
        })}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
    </div>
  );
}
