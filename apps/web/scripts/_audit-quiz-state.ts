// One-shot audit query for Session C wiring. Throws nothing — pure SELECT counts.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, "..", ".env.local") });
config({ path: path.join(__dirname, "..", "..", "..", ".env.local") });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  const queries: Array<[string, () => Promise<{ count: number | null }>]> = [
    [
      "quiz_anchor_images livability >= 3",
      async () =>
        admin
          .from("quiz_anchor_images")
          .select("*", { count: "exact", head: true })
          .gte("livability_score", 3),
    ],
    [
      "quiz_comparison_pairs is_validated = true",
      async () =>
        admin
          .from("quiz_comparison_pairs")
          .select("*", { count: "exact", head: true })
          .eq("is_validated", true),
    ],
    [
      "swipe_cards (legacy)",
      async () =>
        admin.from("swipe_cards").select("*", { count: "exact", head: true }),
    ],
    [
      "style_references (legacy)",
      async () =>
        admin
          .from("style_references")
          .select("*", { count: "exact", head: true }),
    ],
  ];
  for (const [label, fn] of queries) {
    const { count } = await fn();
    console.log(`${count ?? 0}\t${label}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
