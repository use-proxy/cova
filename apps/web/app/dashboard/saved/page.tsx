import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getSavedProducts } from '@/lib/dashboard/queries'
import { GoldDivider } from '@/components/cova/GoldDivider'
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
    <>
      <h1 className="mb-6 font-serif text-3xl text-cova-ivory">Saved Items</h1>

      {savedProducts.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <p className="font-serif text-xl text-cova-ivory-dim">Nothing saved yet</p>
          <p className="max-w-xs text-sm text-cova-muted">
            Tap &ldquo;Shop This Look&rdquo; on any render to save items here
          </p>
        </div>
      ) : (
        <>
          <GoldDivider className="mb-6" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {savedProducts.map((product) => (
              <SavedProductCard key={product.id} product={product} large />
            ))}
          </div>
        </>
      )}
    </>
  )
}
