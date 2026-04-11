// Quick verification that the new quiz_image_library schema is in place.
// Throws if anything is missing. Run via: npx tsx scripts/_verify-quiz-schema.ts
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
  const checks: Array<[string, () => Promise<void>]> = [
    [
      "quiz_anchor_images table exists",
      async () => {
        const { error } = await admin
          .from("quiz_anchor_images")
          .select("id")
          .limit(1);
        if (error) throw new Error(error.message);
      },
    ],
    [
      "quiz_comparison_pairs table exists",
      async () => {
        const { error } = await admin
          .from("quiz_comparison_pairs")
          .select("id")
          .limit(1);
        if (error) throw new Error(error.message);
      },
    ],
    [
      "quiz-images storage bucket exists",
      async () => {
        const { data, error } = await admin.storage.getBucket("quiz-images");
        if (error) throw new Error(error.message);
        if (!data) throw new Error("bucket data null");
        console.log(
          `    bucket public=${data.public}, size_limit=${data.file_size_limit}`,
        );
      },
    ],
  ];
  for (const [label, fn] of checks) {
    try {
      await fn();
      console.log(`✓ ${label}`);
    } catch (e) {
      console.error(`✗ ${label}: ${(e as Error).message}`);
      process.exit(1);
    }
  }
  console.log("schema OK");
}

main();
