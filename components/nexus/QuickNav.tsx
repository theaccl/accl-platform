type Props = {
  active: string;
  onSelect: (id: string) => void;
};

const ITEMS = [
  { id: "standings", label: "Standings" },
  { id: "tournaments", label: "Tournaments" },
  { id: "records", label: "Records" },
  { id: "payouts", label: "Payouts" },
];

export default function QuickNav({ active, onSelect }: Props) {
  return (
    <nav id="quick-nav" className="flex flex-wrap gap-2">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect(item.id)}
          className={`px-3 py-1.5 rounded-lg text-xs border ${
            active === item.id
              ? "bg-[#7f1d1d] border-[#991b1b] text-white"
              : "bg-[#111723] border-[#2a3442] text-gray-300"
          }`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

