import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getSavedProducts } from '@/lib/dashboard/queries'
import { SavedProductCard } from '@/components/dashboard/SavedProductCard'

export default async function SavedPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  const savedProducts = await getSavedProducts(user.id)

  return (
    <div className="bg-cova-bg min-h-screen font-dm-sans">
      {/* Frosted glass top bar */}
      <nav
        className="sticky top-0 z-[50] h-14 flex items-center justify-between px-6 backdrop-blur-xl"
        style={{
          background: 'rgba(9,24,41,0.8)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(201,168,76,0.1)',
        }}
      >
        <span className="font-playfair italic text-xl text-cova-gold tracking-[0.05em]">
          Cova
        </span>
        <span className="font-dm-sans font-semibold text-[15px] text-cova-ivory">
          Saved Products
        </span>
        <div className="w-8 h-8 rounded-full bg-[rgba(255,255,255,0.1)]" />
      </nav>

      {/* Filter bar — static visual UI (Server Component) */}
      <div
        className="px-6 py-4 flex items-center gap-3 overflow-x-auto"
        style={{ borderBottom: '1px solid rgba(201,168,76,0.1)' }}
      >
        {['All', 'Furniture', 'Lighting', 'Rugs', 'Art', 'Plants', 'Decor'].map((cat) => (
          <span
            key={cat}
            className="px-4 py-1.5 rounded-full whitespace-nowrap cursor-pointer font-dm-sans text-[13px]"
            style={{
              background: cat === 'All' ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.04)',
              color: cat === 'All' ? '#C9A84C' : 'rgba(245,240,232,0.45)',
              border: cat === 'All'
                ? '1px solid rgba(201,168,76,0.35)'
                : '1px solid rgba(201,168,76,0.15)',
            }}
          >
            {cat}
          </span>
        ))}
      </div>

      {/* Main content */}
      <div className="max-w-[1200px] mx-auto px-6 pt-8 pb-20">
        {savedProducts.length === 0 ? (
          <div className="text-center px-6 py-20">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: 'rgba(201,168,76,0.08)' }}
            >
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path
                  d="M16 4L4 12v16h8v-8h8v8h8V12L16 4z"
                  stroke="#C9A84C"
                  strokeWidth="1.5"
                  fill="none"
                />
              </svg>
            </div>
            <h3 className="font-playfair text-2xl text-cova-ivory mb-2">
              No saved products yet
            </h3>
            <p className="font-dm-sans text-sm text-cova-muted mb-6">
              Save products from your room designs
            </p>
            <Link
              href="/design/step-1"
              className="inline-block bg-cova-gold text-[#091829] font-dm-sans font-semibold text-sm rounded-lg px-5 py-2.5 no-underline"
            >
              Start Designing →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-5">
            {savedProducts.map((p) => (
              <SavedProductCard key={p.id} product={p} large />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
