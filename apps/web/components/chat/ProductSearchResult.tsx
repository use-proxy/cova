"use client";

interface ProductResult {
  name: string;
  price: number;
  retailer: string;
  image: string;
  url: string;
}

interface ProductSearchResultProps {
  products: ProductResult[];
}

export function ProductSearchResult({ products }: ProductSearchResultProps) {
  if (products.length === 0) return null;

  return (
    <div className="flex gap-2.5 overflow-x-auto scrollbar-hide py-2 mt-2">
      {products.map((product, i) => (
        <a
          key={i}
          href={product.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 rounded-xl overflow-hidden transition-all duration-200 hover:scale-[1.03]"
          style={{ width: 140, border: "1px solid rgba(201,168,76,0.15)" }}
        >
          <div
            className="aspect-square p-2"
            style={{ background: "rgba(255,245,220,0.04)" }}
          >
            <img
              src={product.image}
              alt=""
              className="w-full h-full object-contain"
              draggable={false}
            />
          </div>
          <div className="px-2.5 py-2 bg-[#0d1f3c]">
            <p className="text-[10px] font-sans text-white/60 truncate">
              {product.name}
            </p>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-[10px] font-sans text-[#C9A84C]">
                ${product.price}
              </span>
              <span className="text-[9px] font-sans text-white/30">
                {product.retailer}
              </span>
            </div>
            <span className="text-[10px] font-sans text-[#C9A84C]/60 uppercase tracking-wider mt-1 inline-block">
              View
            </span>
          </div>
        </a>
      ))}
    </div>
  );
}
