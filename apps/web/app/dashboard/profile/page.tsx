import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserFingerprint } from "@/lib/dashboard/queries";
import { generateSwatchesFromFingerprint } from "@/lib/dashboard/colorUtils";
import { CovaCard } from "@/components/cova/CovaCard";
import { CovaButton } from "@/components/cova/CovaButton";
import { GoldDivider } from "@/components/cova/GoldDivider";
import { DeleteAccountButton } from "@/components/dashboard/DeleteAccountButton";

export default async function ProfilePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const fingerprint = await getUserFingerprint(user.id);

  const memberSince = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(user.created_at));

  const provider = user.app_metadata?.provider ?? "email";
  const providerLabel =
    provider === "google" ? "Google" : provider === "apple" ? "Apple" : "Email";

  const swatches = fingerprint
    ? generateSwatchesFromFingerprint(fingerprint.dimensions)
    : [];
  const styleTags = fingerprint?.style_tags?.slice(0, 4) ?? [];

  return (
    <>
      <h1 className="mb-6 font-serif text-3xl text-cova-ivory">Profile</h1>

      {/* Account section */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-cova-ivory-dim">
          Account
        </h2>
        <CovaCard variant="default">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-cova-muted">Email</span>
              <span className="text-sm text-cova-ivory">{user.email}</span>
            </div>
            <GoldDivider />
            <div className="flex items-center justify-between">
              <span className="text-sm text-cova-muted">Sign-in method</span>
              <span className="rounded-full border border-cova-border px-2 py-0.5 text-xs text-cova-ivory-dim">
                {providerLabel}
              </span>
            </div>
            <GoldDivider />
            <div className="flex items-center justify-between">
              <span className="text-sm text-cova-muted">Member since</span>
              <span className="text-sm text-cova-ivory">{memberSince}</span>
            </div>
          </div>
        </CovaCard>
      </section>

      {/* Your Style section */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-cova-ivory-dim">
          Your Style
        </h2>
        <CovaCard variant="elevated">
          {fingerprint ? (
            <>
              <div className="flex items-center justify-between">
                <p className="font-serif text-2xl text-cova-gold">
                  {fingerprint.style_name ?? "Your Style"}
                </p>
                <Link
                  href="/design/step-3"
                  className="text-sm text-cova-muted transition-colors hover:text-cova-ivory"
                >
                  Retake Quiz
                </Link>
              </div>

              {swatches.length > 0 && (
                <div className="mt-4 flex gap-2">
                  {swatches.map((hex, i) => (
                    <div
                      key={i}
                      className="h-10 w-10 rounded-lg border border-cova-border"
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              )}

              {styleTags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {styleTags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-cova-border px-3 py-1 text-xs text-cova-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <p className="text-sm text-cova-muted">
                No style profile yet. Take the quiz to see your design DNA.
              </p>
              <Link href="/design/step-3">
                <CovaButton variant="ghost" size="sm">
                  Take the Quiz
                </CovaButton>
              </Link>
            </div>
          )}
        </CovaCard>
      </section>

      {/* Danger Zone */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-cova-ivory-dim">
          Danger Zone
        </h2>
        <CovaCard variant="default" className="border-cova-error/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-cova-ivory">
                Delete Account
              </p>
              <p className="mt-1 text-xs text-cova-muted">
                Permanently remove your account and all data
              </p>
            </div>
            <DeleteAccountButton />
          </div>
        </CovaCard>
      </section>
    </>
  );
}
