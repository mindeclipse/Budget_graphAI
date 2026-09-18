interface TabNavigationHeaderProps {
  activeTab: "overview" | "wealth" | "history";
  onTabChange: (tab: "overview" | "wealth" | "history") => void;
}

export function TabNavigationHeader({
  activeTab,
  onTabChange,
}: TabNavigationHeaderProps) {
  return (
    <div className="mb-6 hidden rounded-2xl border border-zinc-800 bg-zinc-900/80 p-1 backdrop-blur-md md:flex">
      <button
        type="button"
        onClick={() => onTabChange("overview")}
        className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all ${
          activeTab === "overview"
            ? "bg-zinc-800 text-white shadow-md"
            : "text-zinc-400 hover:text-white"
        }`}
      >
        Аналітика & Бюджет
      </button>
      <button
        type="button"
        onClick={() => onTabChange("history")}
        className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all ${
          activeTab === "history"
            ? "bg-zinc-800 text-white shadow-md"
            : "text-zinc-400 hover:text-white"
        }`}
      >
        Історія операцій
      </button>
      <button
        type="button"
        onClick={() => onTabChange("wealth")}
        className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all ${
          activeTab === "wealth"
            ? "bg-zinc-800 text-white shadow-md"
            : "text-zinc-400 hover:text-white"
        }`}
      >
        Капітал & Цілі
      </button>
    </div>
  );
}
