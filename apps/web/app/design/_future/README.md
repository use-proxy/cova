# Retired V1 personalization steps — preserved for V4

These seven step pages implement the original V1 tabbed personalization flow
(constraints, keep/remove, and four personalization tabs: All/Tech/Products/Art).

They are moved out of the App Router tree so Next.js will not compile them,
but preserved for potential V4 reintroduction. The V3 flow uses a single
unified `step-7p` personalization screen.

The files in this directory are inert — no route is registered, no code imports
from them. Restore by moving any subdirectory back to `apps/web/app/design/`.
