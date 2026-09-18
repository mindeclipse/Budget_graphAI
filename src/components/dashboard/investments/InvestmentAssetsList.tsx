import { InvestmentAsset } from "@/types/finance";
import { AssetItemRow } from "./AssetItemRow";

interface InvestmentAssetsListProps {
  assets: InvestmentAsset[];
  onEdit: (asset: InvestmentAsset) => void;
  onDelete: (id: number) => void;
}

export function InvestmentAssetsList({
  assets,
  onEdit,
  onDelete,
}: InvestmentAssetsListProps) {
  if (assets.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-500">
        У вас ще немає доданих інвестиційних активів. Додайте ваші ОВДП,
        акції/ETF, REIT, криптовалюту чи банківські депозити.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {assets.map((asset) => (
        <AssetItemRow
          key={asset.id}
          asset={asset}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
