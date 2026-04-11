import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const STYLE_DIMENSIONS: Record<string, Record<string, number>> = {
  bohemian: {
    luminosity: 0.2,
    density: 0.8,
    temperature: 0.7,
    form: 0.8,
    era: 0.5,
    texture: 0.9,
    scale: -0.2,
    nature: 0.8,
    saturation: 0.5,
    materialOrigin: 0.7,
  },
  coastal: {
    luminosity: 0.8,
    density: -0.4,
    temperature: -0.3,
    form: 0.3,
    era: -0.2,
    texture: 0.2,
    scale: 0.0,
    nature: 0.6,
    saturation: -0.2,
    materialOrigin: 0.1,
  },
  japandi: {
    luminosity: 0.5,
    density: -0.6,
    temperature: 0.4,
    form: 0.6,
    era: 0.2,
    texture: 0.3,
    scale: -0.3,
    nature: 0.7,
    saturation: -0.5,
    materialOrigin: 0.6,
  },
  mid_century: {
    luminosity: 0.4,
    density: 0.1,
    temperature: 0.5,
    form: -0.5,
    era: 0.6,
    texture: 0.1,
    scale: 0.3,
    nature: 0.1,
    saturation: 0.3,
    materialOrigin: -0.2,
  },
  minimalist: {
    luminosity: 0.7,
    density: -0.8,
    temperature: -0.1,
    form: -0.6,
    era: -0.4,
    texture: -0.7,
    scale: 0.0,
    nature: -0.3,
    saturation: -0.6,
    materialOrigin: -0.4,
  },
};

async function run() {
  const { data: cards, error } = await sb
    .from("swipe_cards")
    .select("id, style")
    .eq("phase", "baseline")
    .is("dimension_labels", null);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  console.log("Cards to update:", cards?.length);

  const batchSize = 50;
  for (let i = 0; i < (cards?.length ?? 0); i += batchSize) {
    const batch = cards!.slice(i, i + batchSize);
    await Promise.all(
      batch.map((card) => {
        const dims =
          STYLE_DIMENSIONS[card.style as keyof typeof STYLE_DIMENSIONS];
        if (!dims) {
          console.warn("Unknown style:", card.style);
          return Promise.resolve();
        }
        return sb
          .from("swipe_cards")
          .update({ dimension_labels: dims })
          .eq("id", card.id);
      }),
    );
    console.log(
      `Updated ${Math.min(i + batchSize, cards!.length)}/${cards!.length}`,
    );
  }
  console.log("Phase A dimension_labels populated.");
}

run();
