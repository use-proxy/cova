"use client";

import "../../design/step-1/step1.css";
import "./saved.css";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ViewMode = "grid" | "list";
type Category =
  | "All"
  | "Seating"
  | "Tables"
  | "Lighting"
  | "Rugs"
  | "Decor"
  | "Art";
type SortOption =
  | "Recently Saved"
  | "Price: Low to High"
  | "Price: High to Low"
  | "Brand A–Z";

type ProductTemplate = {
  brand: string;
  name: string;
  category: Exclude<Category, "All">;
  room: "Living Room" | "Bedroom" | "Dining Room";
  retailer: string;
  description: string;
  dimensions: string;
  price: number;
  salePrice?: number;
  image: string;
  swatches: string[];
  link: string;
};

type SavedItem = ProductTemplate & {
  id: string;
  savedAt: string;
};

const COLORS = {
  background: "#091829",
  gold: "#C9A84C",
  ivory: "#F5F0E8",
  muted: "rgba(245, 240, 232, 0.45)",
  surface: "rgba(255, 255, 255, 0.04)",
  border: "rgba(201, 168, 76, 0.15)",
};

const categories: Category[] = [
  "All",
  "Seating",
  "Tables",
  "Lighting",
  "Rugs",
  "Decor",
  "Art",
];
const roomOptions = [
  "All Rooms",
  "Living Room",
  "Bedroom",
  "Dining Room",
] as const;
const sortOptions: SortOption[] = [
  "Recently Saved",
  "Price: Low to High",
  "Price: High to Low",
  "Brand A–Z",
];
const budgetLimit = 20000;

const productTemplates: ProductTemplate[] = [
  {
    brand: "Atelier Forme",
    name: "Luca Lounge Chair",
    category: "Seating",
    room: "Living Room",
    retailer: "Holloway House",
    description:
      "A softly sculpted lounge chair with a tailored bouclé seat and low walnut frame designed for refined, quiet living spaces.",
    dimensions: '34" W × 31" D × 28" H',
    price: 365,
    salePrice: 305,
    image:
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
    swatches: ["#F1E8DC", "#A88963", "#6B4F3C", "#2F2A26", "#B99B73"],
    link: "https://example.com/products/luca-lounge-chair",
  },
  {
    brand: "Maison Celine",
    name: "Verre Console Table",
    category: "Tables",
    room: "Dining Room",
    retailer: "The Modern Manor",
    description:
      "A slim smoked-oak console with brass inlay details that adds a gallery-like line to an entry or dining setting.",
    dimensions: '60" W × 16" D × 30" H',
    price: 420,
    image:
      "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=1200&q=80",
    swatches: ["#5E4735", "#B38B59", "#31261E", "#CAB8A3", "#95806B"],
    link: "https://example.com/products/verre-console-table",
  },
  {
    brand: "Studio Lume",
    name: "Aurelia Floor Lamp",
    category: "Lighting",
    room: "Bedroom",
    retailer: "Crest & Co.",
    description:
      "A slender floor lamp with a brushed-brass stem and parchment shade that brings a warm editorial glow to intimate corners.",
    dimensions: '18" W × 18" D × 64" H',
    price: 310,
    salePrice: 260,
    image:
      "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80",
    swatches: ["#D7C7A9", "#AF8E4F", "#4A3B2A", "#F0E8D8", "#8A735B"],
    link: "https://example.com/products/aurelia-floor-lamp",
  },
  {
    brand: "North August",
    name: "Marlowe Wool Rug",
    category: "Rugs",
    room: "Living Room",
    retailer: "Collective Loom",
    description:
      "A hand-loomed wool rug in muted sand and espresso tones that grounds a seating arrangement with subtle texture.",
    dimensions: "9' × 12'",
    price: 510,
    image:
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
    swatches: ["#E0D5C3", "#B69972", "#7D6755", "#3E352F", "#C7B39A"],
    link: "https://example.com/products/marlowe-wool-rug",
  },
  {
    brand: "Arc & Grain",
    name: "Sora Ceramic Vessel",
    category: "Decor",
    room: "Bedroom",
    retailer: "Velvet District",
    description:
      "A matte ceramic vessel with a gently irregular silhouette that softens millwork, shelves, and bedside styling.",
    dimensions: '11" W × 11" D × 15" H',
    price: 385,
    image:
      "https://images.unsplash.com/photo-1517705008128-361805f42e86?auto=format&fit=crop&w=1200&q=80",
    swatches: ["#F2EEE6", "#D7C6B3", "#A7835A", "#6A5648", "#A6A39B"],
    link: "https://example.com/products/sora-ceramic-vessel",
  },
  {
    brand: "Galerie Rive",
    name: "Contour No. 07",
    category: "Art",
    room: "Dining Room",
    retailer: "Edition Lane",
    description:
      "A large-format abstract print with warm umber strokes and ivory negative space, framed in slim bronze.",
    dimensions: '40" W × 2" D × 54" H',
    price: 600,
    image:
      "https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?auto=format&fit=crop&w=1200&q=80",
    swatches: ["#EEE6D8", "#B08956", "#5C4734", "#2A231E", "#A39A8D"],
    link: "https://example.com/products/contour-no-07",
  },
  {
    brand: "Bespoke Union",
    name: "Renata Bench",
    category: "Seating",
    room: "Bedroom",
    retailer: "Maison Passage",
    description:
      "A compact upholstered bench with an antique-brass base sized elegantly for the foot of the bed or a dressing corner.",
    dimensions: '52" W × 18" D × 18" H',
    price: 335,
    image:
      "https://images.unsplash.com/photo-1484101403633-562f891dc89a?auto=format&fit=crop&w=1200&q=80",
    swatches: ["#E7DDD0", "#BFA27A", "#8E775F", "#5E4B3D", "#2B2420"],
    link: "https://example.com/products/renata-bench",
  },
  {
    brand: "Foundry Atelier",
    name: "Solace Side Table",
    category: "Tables",
    room: "Living Room",
    retailer: "Obsidian Row",
    description:
      "A monolithic side table in honed stone composite with softened edges and a quiet, architectural profile.",
    dimensions: '20" W × 20" D × 22" H',
    price: 295,
    image:
      "https://images.unsplash.com/photo-1538688423619-a81d3f23454b?auto=format&fit=crop&w=1200&q=80",
    swatches: ["#F3ECDC", "#C5B18E", "#8D755E", "#695343", "#302924"],
    link: "https://example.com/products/solace-side-table",
  },
];

const editions = [
  "Gallery Edition",
  "Signature Edition",
  "Studio Edition",
  "Collector Edition",
];

function buildInitialItems(): SavedItem[] {
  const items: SavedItem[] = [];

  for (let cycle = 0; cycle < 4; cycle += 1) {
    productTemplates.forEach((template, index) => {
      const shouldBoostFirstItem = cycle === 0 && index === 0;
      const adjustedSalePrice =
        typeof template.salePrice === "number"
          ? template.salePrice + (shouldBoostFirstItem ? 10 : 0)
          : undefined;
      const adjustedPrice =
        template.price +
        (shouldBoostFirstItem && typeof template.salePrice !== "number"
          ? 10
          : 0);

      items.push({
        ...template,
        id: `${cycle + 1}-${index + 1}`,
        name: `${template.name} · ${editions[cycle]}`,
        price: adjustedPrice,
        salePrice: adjustedSalePrice,
        savedAt: new Date(
          Date.now() - (cycle * 8 + index) * 1000 * 60 * 35,
        ).toISOString(),
      });
    });
  }

  return items;
}

const HeartIcon = ({
  filled = false,
  className = "",
}: {
  filled?: boolean;
  className?: string;
}) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 20.5s-7.25-4.35-9.25-8.31C1.2 9.1 2.18 5.5 5.78 4.47c2.05-.58 4.08.14 5.22 1.93 1.14-1.79 3.17-2.51 5.22-1.93 3.6 1.03 4.58 4.63 3.03 7.72C19.25 16.15 12 20.5 12 20.5Z" />
  </svg>
);

const GridIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
    <title>{active ? "Grid view active" : "Grid view"}</title>
  </svg>
);

const ListIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <circle cx="4" cy="6" r="1.5" />
    <circle cx="4" cy="12" r="1.5" />
    <circle cx="4" cy="18" r="1.5" />
    <title>{active ? "List view active" : "List view"}</title>
  </svg>
);

const CloseIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ShareIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.6 10.8l6.8-3.6" />
    <path d="M8.6 13.2l6.8 3.6" />
  </svg>
);

const BagIcon = () => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    stroke={COLORS.gold}
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M18 22h28l3 30H15l3-30Z" />
    <path d="M24 24v-3c0-4.4 3.6-8 8-8s8 3.6 8 8v3" />
    <path d="M24 30c0 3.5 3.6 6 8 6s8-2.5 8-6" opacity="0.45" />
  </svg>
);

const Sidebar = () => {
  const navItems = [
    "Dashboard",
    "Design Studio",
    "Saved Products",
    "Projects",
    "Moodboards",
    "Settings",
  ];

  return (
    <aside className="saved-sidebar">
      <div className="saved-sidebar__brand">
        <span className="saved-sidebar__eyebrow">Private Residence</span>
        <h2 className="saved-sidebar__title">Maison Curator</h2>
      </div>

      <nav className="saved-sidebar__nav" aria-label="Primary navigation">
        {navItems.map((item) => (
          <button
            key={item}
            type="button"
            className={`saved-sidebar__nav-item ${item === "Saved Products" ? "is-active" : ""}`}
          >
            <span className="saved-sidebar__nav-dot" />
            <span>{item}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function getEffectivePrice(item: SavedItem) {
  return item.salePrice ?? item.price;
}

export default function SavedItemsPage() {
  const router = useRouter();
  const [_hydrated, setHydrated] = useState(false);
  const [savedItems, setSavedItems] = useState<SavedItem[]>(() =>
    buildInitialItems(),
  );
  const [view, setView] = useState<ViewMode>("grid");
  const [category, setCategory] = useState<Category>("All");
  const [priceMenuOpen, setPriceMenuOpen] = useState(false);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 5000]);
  const [room, setRoom] = useState<(typeof roomOptions)[number]>("All Rooms");
  const [sortBy, setSortBy] = useState<SortOption>("Recently Saved");
  const [quickViewItem, setQuickViewItem] = useState<SavedItem | null>(null);
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showBudgetBreakdown, setShowBudgetBreakdown] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { createBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) router.push("/auth");
      else setHydrated(true);
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    if (!quickViewItem) {
      return;
    }

    const exists = savedItems.some((item) => item.id === quickViewItem.id);
    if (!exists) {
      setQuickViewItem(null);
    }
  }, [quickViewItem, savedItems]);

  const filtersActive =
    category !== "All" ||
    room !== "All Rooms" ||
    priceRange[0] !== 0 ||
    priceRange[1] !== 5000;

  const filteredItems = useMemo(() => {
    const nextItems = savedItems
      .filter((item) =>
        category === "All" ? true : item.category === category,
      )
      .filter((item) => (room === "All Rooms" ? true : item.room === room))
      .filter((item) => {
        const effectivePrice = getEffectivePrice(item);
        return (
          effectivePrice >= priceRange[0] && effectivePrice <= priceRange[1]
        );
      });

    nextItems.sort((a, b) => {
      if (sortBy === "Recently Saved") {
        return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
      }
      if (sortBy === "Price: Low to High") {
        return getEffectivePrice(a) - getEffectivePrice(b);
      }
      if (sortBy === "Price: High to Low") {
        return getEffectivePrice(b) - getEffectivePrice(a);
      }
      return a.brand.localeCompare(b.brand);
    });

    return nextItems;
  }, [category, priceRange, room, savedItems, sortBy]);

  const totalSavedValue = useMemo(
    () => savedItems.reduce((sum, item) => sum + getEffectivePrice(item), 0),
    [savedItems],
  );

  const roomCount = useMemo(
    () => new Set(savedItems.map((item) => item.room)).size,
    [savedItems],
  );
  const budgetUsage = Math.min((totalSavedValue / budgetLimit) * 100, 100);

  const budgetByRoom = useMemo(() => {
    return roomOptions
      .filter((roomName) => roomName !== "All Rooms")
      .map((roomName) => ({
        room: roomName,
        total: savedItems
          .filter((item) => item.room === roomName)
          .reduce((sum, item) => sum + getEffectivePrice(item), 0),
      }));
  }, [savedItems]);

  const clearFilters = () => {
    setCategory("All");
    setPriceRange([0, 5000]);
    setRoom("All Rooms");
    setSortBy("Recently Saved");
    setPriceMenuOpen(false);
  };

  const handleExport = () => {
    if (typeof window === "undefined") {
      return;
    }

    const headers = [
      "Brand",
      "Name",
      "Category",
      "Room",
      "Retailer",
      "Price",
      "Link",
    ];
    const rows = filteredItems.map((item) => [
      item.brand,
      item.name,
      item.category,
      item.room,
      item.retailer,
      String(getEffectivePrice(item)),
      item.link,
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "saved-items-export.csv";
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  const handleRemove = (item: SavedItem) => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        `Remove “${item.name}” from your saved items?`,
      );
      if (!confirmed) {
        return;
      }
    }

    setPendingRemovalId(item.id);

    window.setTimeout(() => {
      setSavedItems((current) =>
        current.filter((entry) => entry.id !== item.id),
      );
      setPendingRemovalId(null);
    }, 260);
  };

  const handleShare = async (item: SavedItem) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(item.link);
      }
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId(null), 1800);
    }
  };

  const sliderLeft = (priceRange[0] / 5000) * 100;
  const sliderRight = (priceRange[1] / 5000) * 100;

  return (
    <div
      className="saved-page"
      style={{ background: COLORS.background, color: COLORS.ivory }}
    >
      <Sidebar />

      <main className="saved-main">
        <section className="saved-header">
          <div>
            <h1 className="saved-title">Saved Items</h1>
            <p className="saved-subtitle">
              {savedItems.length} pieces across {roomCount} rooms
            </p>
          </div>

          <div className="saved-header__actions">
            <div className="view-toggle" aria-label="Toggle layout view">
              <button
                type="button"
                className={`view-toggle__button ${view === "grid" ? "is-active" : ""}`}
                onClick={() => setView("grid")}
                aria-pressed={view === "grid"}
              >
                <GridIcon active={view === "grid"} />
              </button>
              <button
                type="button"
                className={`view-toggle__button ${view === "list" ? "is-active" : ""}`}
                onClick={() => setView("list")}
                aria-pressed={view === "list"}
              >
                <ListIcon active={view === "list"} />
              </button>
            </div>

            <button
              type="button"
              className="ghost-button"
              onClick={handleExport}
            >
              Export List <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>

        <div className="gold-separator" />

        <section className="filter-bar">
          <div className="filter-row filter-row--categories">
            {categories.map((pill) => (
              <button
                key={pill}
                type="button"
                className={`filter-pill ${pill === category ? "is-active" : ""}`}
                onClick={() => setCategory(pill)}
              >
                {pill}
              </button>
            ))}
          </div>

          <div className="filter-row filter-row--controls">
            <div className="filter-controls-left">
              <div className="price-filter">
                <button
                  type="button"
                  className="filter-control"
                  onClick={() => setPriceMenuOpen((current) => !current)}
                >
                  Price: {formatCurrency(priceRange[0])} –{" "}
                  {formatCurrency(priceRange[1])}
                </button>

                {priceMenuOpen ? (
                  <div className="price-menu">
                    <div className="price-menu__track">
                      <span className="price-menu__track-base" />
                      <span
                        className="price-menu__track-fill"
                        style={{
                          left: `${sliderLeft}%`,
                          width: `${Math.max(sliderRight - sliderLeft, 2)}%`,
                        }}
                      />
                    </div>

                    <input
                      aria-label="Minimum price"
                      className="range-input"
                      type="range"
                      min={0}
                      max={5000}
                      step={50}
                      value={priceRange[0]}
                      onChange={(event) => {
                        const nextMin = Math.min(
                          Number(event.target.value),
                          priceRange[1] - 50,
                        );
                        setPriceRange([nextMin, priceRange[1]]);
                      }}
                    />
                    <input
                      aria-label="Maximum price"
                      className="range-input"
                      type="range"
                      min={0}
                      max={5000}
                      step={50}
                      value={priceRange[1]}
                      onChange={(event) => {
                        const nextMax = Math.max(
                          Number(event.target.value),
                          priceRange[0] + 50,
                        );
                        setPriceRange([priceRange[0], nextMax]);
                      }}
                    />

                    <div className="price-menu__values">
                      <span>{formatCurrency(priceRange[0])}</span>
                      <span>{formatCurrency(priceRange[1])}</span>
                    </div>
                  </div>
                ) : null}
              </div>

              <label className="select-wrap">
                <span className="sr-only">Room filter</span>
                <select
                  value={room}
                  onChange={(event) =>
                    setRoom(event.target.value as (typeof roomOptions)[number])
                  }
                >
                  {roomOptions.map((option) => (
                    <option key={option} value={option}>
                      Room: {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="filter-controls-right">
              <label className="select-wrap">
                <span className="sr-only">Sort items</span>
                <select
                  value={sortBy}
                  onChange={(event) =>
                    setSortBy(event.target.value as SortOption)
                  }
                >
                  {sortOptions.map((option) => (
                    <option key={option} value={option}>
                      Sort: {option}
                    </option>
                  ))}
                </select>
              </label>

              {filtersActive ? (
                <button
                  type="button"
                  className="clear-filters"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {filteredItems.length === 0 ? (
          <section className="empty-state">
            <div className="empty-state__icon">
              <BagIcon />
            </div>
            <h2>Nothing saved yet</h2>
            <p>Start designing to discover pieces you love.</p>
            <button
              type="button"
              className="cta-pill"
              onClick={() => router.push("/design/step-1")}
            >
              Design a Room <span aria-hidden="true">→</span>
            </button>
          </section>
        ) : (
          <section className={`products products--${view}`}>
            {filteredItems.map((item, index) => {
              const effectivePrice = getEffectivePrice(item);
              const isRemoving = pendingRemovalId === item.id;

              if (view === "list") {
                return (
                  <article
                    key={item.id}
                    className={`product-list-card ${isRemoving ? "is-removing" : ""}`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <button
                      type="button"
                      className="product-list-card__image-wrap"
                      onClick={() => setQuickViewItem(item)}
                    >
                      <img
                        src={item.image}
                        alt={item.name}
                        className="product-list-card__image"
                      />
                    </button>

                    <div className="product-list-card__name-col">
                      <span className="product-brand">{item.brand}</span>
                      <h3>{item.name}</h3>
                    </div>

                    <div className="product-list-card__meta-col">
                      <span className="room-tag">From: {item.room}</span>
                      <span className="product-retailer">{item.retailer}</span>
                    </div>

                    <div className="product-list-card__price-col">
                      <span className="price-current">
                        {formatCurrency(effectivePrice)}
                      </span>
                    </div>

                    <div className="product-list-card__actions">
                      <button
                        type="button"
                        className="heart-button is-filled"
                        onClick={() => handleRemove(item)}
                      >
                        <HeartIcon filled />
                      </button>
                      <a
                        className="shop-link"
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Shop <span aria-hidden="true">→</span>
                      </a>
                    </div>
                  </article>
                );
              }

              return (
                <article
                  key={item.id}
                  className={`product-card ${isRemoving ? "is-removing" : ""}`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <button
                    type="button"
                    className="product-card__image-wrap"
                    onClick={() => setQuickViewItem(item)}
                  >
                    <img
                      src={item.image}
                      alt={item.name}
                      className="product-card__image"
                    />
                    <span className="quick-view-overlay">Quick View</span>
                  </button>

                  <div className="product-card__body">
                    <span className="product-brand">{item.brand}</span>
                    <h3>{item.name}</h3>

                    <div className="price-row">
                      {item.salePrice ? (
                        <span className="price-original">
                          {formatCurrency(item.price)}
                        </span>
                      ) : null}
                      <span className="price-current">
                        {formatCurrency(effectivePrice)}
                      </span>
                    </div>

                    <div className="product-card__meta">
                      <span className="room-tag">From: {item.room}</span>
                      <span className="product-retailer">{item.retailer}</span>
                    </div>

                    <div className="product-card__actions">
                      <button
                        type="button"
                        className="heart-button is-filled"
                        onClick={() => handleRemove(item)}
                      >
                        <HeartIcon filled className="heart-button__icon" />
                      </button>
                      <a
                        className="shop-link"
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Shop Now <span aria-hidden="true">→</span>
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>

      {showBudgetBreakdown ? (
        <aside className="budget-breakdown-panel">
          <div className="budget-breakdown-panel__header">
            <h3>Budget Breakdown</h3>
            <button
              type="button"
              className="budget-breakdown-panel__close"
              onClick={() => setShowBudgetBreakdown(false)}
            >
              <CloseIcon />
            </button>
          </div>
          <div className="budget-breakdown-panel__body">
            {budgetByRoom.map((entry) => (
              <div key={entry.room} className="budget-breakdown-row">
                <span>{entry.room}</span>
                <strong>{formatCurrency(entry.total)}</strong>
              </div>
            ))}
          </div>
        </aside>
      ) : null}

      <div className="budget-tracker">
        <div className="budget-tracker__left">
          Total saved value: {formatCurrency(totalSavedValue)}
        </div>
        <div className="budget-tracker__center">
          <div className="budget-progress">
            <span
              className="budget-progress__fill"
              style={{ width: `${budgetUsage}%` }}
            />
          </div>
          <span className="budget-progress__caption">
            {formatCurrency(totalSavedValue)} of {formatCurrency(budgetLimit)}{" "}
            budget
          </span>
        </div>
        <button
          type="button"
          className="budget-tracker__link"
          onClick={() => setShowBudgetBreakdown((current) => !current)}
        >
          View Budget Breakdown <span aria-hidden="true">→</span>
        </button>
      </div>

      {quickViewItem ? (
        <div
          className="quick-view-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setQuickViewItem(null);
            }
          }}
          role="presentation"
        >
          <section className="quick-view-modal" aria-modal="true" role="dialog">
            <button
              type="button"
              className="quick-view-close"
              onClick={() => setQuickViewItem(null)}
              aria-label="Close quick view"
            >
              <CloseIcon />
            </button>

            <div className="quick-view-modal__media">
              <img
                src={quickViewItem.image}
                alt={quickViewItem.name}
                className="quick-view-modal__image"
              />
            </div>

            <div className="quick-view-modal__content">
              <span className="quick-view-brand">{quickViewItem.brand}</span>
              <h2>{quickViewItem.name}</h2>
              <div className="quick-view-price">
                {formatCurrency(getEffectivePrice(quickViewItem))}
              </div>
              <div className="gold-separator gold-separator--compact" />

              <p className="quick-view-description">
                {quickViewItem.description}
              </p>
              <p className="quick-view-dimensions">
                Dimensions: {quickViewItem.dimensions}
              </p>

              <div className="swatch-row">
                {quickViewItem.swatches.map((swatch, index) => (
                  <button
                    key={`${quickViewItem.id}-${swatch}`}
                    type="button"
                    className={`swatch ${index === 0 ? "is-active" : ""}`}
                    style={{ backgroundColor: swatch }}
                    aria-label={`Color swatch ${index + 1}`}
                  />
                ))}
              </div>

              <span className="room-tag room-tag--modal">
                From: {quickViewItem.room}
              </span>
              <div className="gold-separator gold-separator--compact" />

              <a
                className="cta-pill cta-pill--full"
                href={quickViewItem.link}
                target="_blank"
                rel="noreferrer"
              >
                Shop at {quickViewItem.retailer}{" "}
                <span aria-hidden="true">→</span>
              </a>

              <button
                type="button"
                className="saved-toggle"
                onClick={() => handleRemove(quickViewItem)}
              >
                <HeartIcon filled />
                <span>Saved</span>
              </button>

              <button
                type="button"
                className="share-button"
                onClick={() => handleShare(quickViewItem)}
              >
                <ShareIcon />
                <span>
                  {copiedId === quickViewItem.id ? "Link copied" : "Share"}
                </span>
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
