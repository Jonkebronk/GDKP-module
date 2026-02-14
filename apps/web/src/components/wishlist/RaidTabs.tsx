import { TBC_RAID_INSTANCES } from '@gdkp/shared';

interface RaidTabsProps {
  selectedRaid: string | null;
  onSelectRaid: (raid: string | null) => void;
  itemCounts?: Record<string, number>;
}

export function RaidTabs({ selectedRaid, onSelectRaid, itemCounts = {} }: RaidTabsProps) {
  return (
    <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
      <div className="flex gap-1 min-w-max pb-2">
        <button
          onClick={() => onSelectRaid(null)}
          className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
            selectedRaid === null
              ? 'bg-amber-500 text-black'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
          }`}
        >
          All Raids
        </button>
        {TBC_RAID_INSTANCES.map((instance) => {
          const count = itemCounts[instance.name] || 0;
          return (
            <button
              key={instance.id}
              onClick={() => onSelectRaid(instance.name)}
              className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2 ${
                selectedRaid === instance.name
                  ? 'bg-amber-500 text-black'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              {instance.name}
              {count > 0 && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    selectedRaid === instance.name
                      ? 'bg-black/20 text-black'
                      : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
