"use client";

import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GoldDivider } from "@/components/cova/GoldDivider";

interface AvatarDropdownProps {
  email: string | null;
}

export function AvatarDropdown({ email }: AvatarDropdownProps) {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const initials = email ? email[0].toUpperCase() : "U";

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full border border-cova-border bg-cova-surface text-sm font-semibold text-cova-gold transition-colors hover:border-cova-border-gold focus:outline-none"
          aria-label="Account menu"
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {email && (
          <div className="px-3 py-2">
            <p className="truncate text-xs text-cova-muted">{email}</p>
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/dashboard/profile")}>
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/dashboard/settings")}>
          Settings
        </DropdownMenuItem>
        <div className="px-1 py-1">
          <GoldDivider />
        </div>
        <DropdownMenuItem
          onClick={handleSignOut}
          className="text-cova-error hover:text-cova-error focus:text-cova-error"
        >
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
