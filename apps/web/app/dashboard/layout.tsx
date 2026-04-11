import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AvatarDropdown } from "@/components/dashboard/AvatarDropdown";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-cova-bg font-sans">
      {/* Fixed top navigation */}
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-cova-border-dim bg-cova-bg/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          {/* Wordmark */}
          <Link
            href="/dashboard"
            className="font-serif text-xl text-cova-gold transition-opacity hover:opacity-80"
          >
            Cova
          </Link>

          {/* Right actions */}
          <div className="flex items-center gap-4">
            <Link
              href="/design/step-1"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-cova-gold px-3 py-1.5 text-sm font-semibold text-cova-bg transition-all duration-150 hover:bg-cova-gold-light active:scale-[0.98]"
            >
              Design New Room
            </Link>
            <AvatarDropdown email={user.email ?? null} />
          </div>
        </div>
      </nav>

      {/* Main content — offset for fixed nav */}
      <main className="pt-14">
        <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
      </main>
    </div>
  );
}
