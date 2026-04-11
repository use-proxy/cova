"use client";

interface SimilarItem {
  id: string;
  name: string;
  price: number;
  image: string;
}

interface SimilarItemsProps {
  items: SimilarItem[];
  onSelect: (id: string) => void;
}

export function SimilarItems({ items, onSelect }: SimilarItemsProps) {
  if (items.length === 0) return null;

  return (
    <div className="mt-8">
      <p className="font-serif text-sm text-white italic mb-3">
        You might also like
      </p>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className="flex-shrink-0 rounded-xl overflow-hidden transition-all duration-200 hover:scale-[1.03]"
            style={{ width: 120, border: "1px solid rgba(201,168,76,0.15)" }}
          >
            <div
              className="aspect-square p-2"
              style={{ background: "rgba(255,245,220,0.04)" }}
            >
              <img
                src={item.image}
                alt=""
                className="w-full h-full object-contain"
                draggable={false}
              />
            </div>
            <div className="px-2 py-2 bg-[#0d1f3c]">
              <p className="text-[10px] font-sans text-white/60 truncate">
                {item.name}
              </p>
              <p className="text-[10px] font-sans text-[#C9A84C]">
                ${item.price}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
