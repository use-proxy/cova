**COVA**

**Complete Build Guide**

*Phases 0--9 \| All Cursor Prompts, Code, SQL, Terminal Commands \|
Version 2.0 \| March 2026*

Bundle ID: ai.cova.app \| Supabase: xdeacbmkdwqrwxonqaqh \|
hellocova@gmail.com

*GitHub: \~/Desktop/cova \| Pranav Goel (owner) \| Daksh (collaborator)*

**TABLE OF CONTENTS**

**HOW TO USE THIS BUILD GUIDE**

This document is the single source of truth for building Cova. It maps
exactly to the Cova Master Strategy Document v2.0. Every Phase in the
Master Document has a matching section here with the terminal commands,
Cursor Agent prompts, SQL migrations, config files, and verification
steps.

  ---------- ------------------------------------------------------------
   **CURSOR  Always use Cursor in AGENT mode. Always attach
    RULE**   \@BUILDGUIDE.md to every prompt. Run one prompt per session
             --- do not chain multiple phases in one Cursor session.

  ---------- ------------------------------------------------------------

**Golden Rules**

1.  Read the full phase section before running ANY commands

2.  Run Terminal commands yourself --- never let Cursor Agent run pnpm
    install or git commands

3.  After every phase: git add . && git commit -m \'Phase X complete\'
    && git push origin main

4.  Always test on physical iPhone --- iOS Simulator WebGL is broken for
    Three.js

5.  Get V0 design approval from both Pranav and Daksh before running any
    Phase 6+ UI prompt

6.  Never upgrade pinned packages. Never run npx expo install \--fix
    without checking the output.

**Version Lock --- Never Change These**

+-----------------------------------------------------------------------+
| expo: \~52.0.49                                                       |
|                                                                       |
| react: 18.3.1 (EXACT --- React 19 breaks \@react-three/fiber)         |
|                                                                       |
| react-dom: 18.3.1 (EXACT)                                             |
|                                                                       |
| \@react-three/fiber: 8.17.10 (PINNED --- last version for React 18)   |
|                                                                       |
| \@react-three/drei: 9.88.0 (PINNED --- must match R3F 8.x)            |
|                                                                       |
| three: 0.155.0 (PINNED --- last version stable with expo-gl on        |
| device)                                                               |
|                                                                       |
| \@supabase/supabase-js: 2.39.x                                        |
|                                                                       |
| zustand: 5.x                                                          |
+-----------------------------------------------------------------------+

**Required pnpm Overrides in Root package.json**

Without these, npx expo install \--fix or any package upgrade will pull
React 19 and break everything:

+-----------------------------------------------------------------------+
| \"pnpm\": {                                                           |
|                                                                       |
| \"overrides\": {                                                      |
|                                                                       |
| \"react\": \"18.3.1\",                                                |
|                                                                       |
| \"react-dom\": \"18.3.1\"                                             |
|                                                                       |
| }                                                                     |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

**Environment Variables**

File: \~/Desktop/cova/.env.local (git-ignored)

+-----------------------------------------------------------------------+
| EXPO_PUBLIC_SUPABASE_URL=https://xdeacbmkdwqrwxonqaqh.supabase.co     |
|                                                                       |
| EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key                           |
|                                                                       |
| NEXT_PUBLIC_SUPABASE_URL=https://xdeacbmkdwqrwxonqaqh.supabase.co     |
|                                                                       |
| NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key                           |
|                                                                       |
| SUPABASE_SERVICE_ROLE_KEY=your_service_role_key                       |
|                                                                       |
| REPLICATE_API_TOKEN=your_replicate_token                              |
|                                                                       |
| ANTHROPIC_API_KEY=your_anthropic_key                                  |
|                                                                       |
| STRIPE_SECRET_KEY=sk_test\_\... (empty until Phase 8)                 |
+-----------------------------------------------------------------------+

**PHASE 0: ENVIRONMENT SETUP**

  ---------- ------------------------------------------------------------------
   **DONE**  COMPLETED --- Both Pranav and Daksh have completed Phase 0. Re-run
             only if setting up a new Mac.

  ---------- ------------------------------------------------------------------

Phase 0 installs all tools required to build Cova. Run every command in
Terminal on both Macs. This phase has no Cursor prompts --- it is all
terminal work.

**0.1 Install Core Tools**

+-----------------------------------------------------------------------+
| \# Install Homebrew                                                   |
|                                                                       |
| /bin/bash -c \"\$(curl -fsSL                                          |
| https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\" |
|                                                                       |
| \# Install Node 20                                                    |
|                                                                       |
| brew install node@20                                                  |
|                                                                       |
| echo \'export PATH=\"/opt/homebrew/opt/node@20/bin:\$PATH\"\' \>\>    |
| \~/.zprofile                                                          |
|                                                                       |
| source \~/.zprofile                                                   |
|                                                                       |
| node \--version \# Should show v20.x.x                                |
|                                                                       |
| \# Install Git                                                        |
|                                                                       |
| brew install git                                                      |
|                                                                       |
| \# Install pnpm via corepack (permanent fix --- never loses pnpm      |
| after restart)                                                        |
|                                                                       |
| corepack enable                                                       |
|                                                                       |
| corepack prepare pnpm@latest \--activate                              |
|                                                                       |
| echo \'export PNPM_HOME=\"\$HOME/.local/share/pnpm\"\' \>\>           |
| \~/.zprofile                                                          |
|                                                                       |
| echo \'export PATH=\"\$PNPM_HOME:\$PATH\"\' \>\> \~/.zprofile         |
|                                                                       |
| source \~/.zprofile                                                   |
|                                                                       |
| pnpm \--version \# Should show 9.x.x                                  |
|                                                                       |
| \# Install Python 3.11                                                |
|                                                                       |
| brew install python@3.11                                              |
|                                                                       |
| \# Install Blender (for GLB optimization)                             |
|                                                                       |
| brew install \--cask blender                                          |
|                                                                       |
| \# Install Pandoc (for BUILDGUIDE.md conversion)                      |
|                                                                       |
| brew install pandoc                                                   |
+-----------------------------------------------------------------------+

**0.2 Install Xcode**

7.  Open App Store and install Xcode (latest version --- currently 16.x)

8.  After install, open Xcode and accept the license agreement

9.  Install iOS SDK components: Xcode \> Settings \> Components \>
    Download iOS 26.x SDK

10. Enable Developer Mode on your iPhone: Settings \> Privacy & Security
    \> Developer Mode \> Toggle ON \> Restart iPhone

+-----------------------------------------------------------------------+
| \# Install Xcode command line tools                                   |
|                                                                       |
| xcode-select \--install                                               |
|                                                                       |
| \# Verify                                                             |
|                                                                       |
| xcodebuild -version \# Should show Xcode 16.x                         |
+-----------------------------------------------------------------------+

**0.3 Install Expo and Supabase CLIs**

+-----------------------------------------------------------------------+
| \# Install Expo CLI globally                                          |
|                                                                       |
| pnpm add -g expo-cli                                                  |
|                                                                       |
| pnpm add -g eas-cli                                                   |
|                                                                       |
| \# Install Supabase CLI                                               |
|                                                                       |
| brew install supabase/tap/supabase                                    |
|                                                                       |
| \# Verify all tools                                                   |
|                                                                       |
| expo \--version                                                       |
|                                                                       |
| eas \--version                                                        |
|                                                                       |
| supabase \--version                                                   |
+-----------------------------------------------------------------------+

**0.4 Configure Cursor**

Open Cursor and configure for the Cova project:

11. Open Cursor \> Settings \> Features \> Enable Agent mode

12. Open Cursor \> Settings \> Rules \> Add project rules (contents in
    Phase 1 Step 1.6 below)

13. Set model to claude-sonnet-4-6 in Cursor settings

14. Increase context window to maximum in settings

**PHASE 1: MONOREPO SCAFFOLD**

  ---------- ------------------------------------------------------------------
   **DONE**  COMPLETED --- Monorepo exists at \~/Desktop/cova with all
             packages. Zero TypeScript errors.

  ---------- ------------------------------------------------------------------

Phase 1 creates the full monorepo structure. The code below is what was
built. Refer to this section if you need to re-scaffold or if a package
gets corrupted.

**1.1 Create Monorepo**

+-----------------------------------------------------------------------+
| cd \~/Desktop                                                         |
|                                                                       |
| mkdir cova && cd cova                                                 |
|                                                                       |
| \# Initialize monorepo                                                |
|                                                                       |
| pnpm init                                                             |
|                                                                       |
| \# Create workspace config                                            |
|                                                                       |
| cat \> pnpm-workspace.yaml \<\< \'EOF\'                               |
|                                                                       |
| packages:                                                             |
|                                                                       |
| \- \'apps/\*\'                                                        |
|                                                                       |
| \- \'packages/\*\'                                                    |
|                                                                       |
| EOF                                                                   |
+-----------------------------------------------------------------------+

**1.2 Root package.json**

File: \~/Desktop/cova/package.json

+-----------------------------------------------------------------------+
| {                                                                     |
|                                                                       |
| \"name\": \"cova-monorepo\",                                          |
|                                                                       |
| \"private\": true,                                                    |
|                                                                       |
| \"scripts\": {                                                        |
|                                                                       |
| \"mobile\": \"pnpm \--filter mobile start\",                          |
|                                                                       |
| \"web\": \"pnpm \--filter web dev\",                                  |
|                                                                       |
| \"build\": \"turbo run build\"                                        |
|                                                                       |
| },                                                                    |
|                                                                       |
| \"devDependencies\": {                                                |
|                                                                       |
| \"turbo\": \"\^2.0.0\",                                               |
|                                                                       |
| \"typescript\": \"\^5.3.3\"                                           |
|                                                                       |
| },                                                                    |
|                                                                       |
| \"pnpm\": {                                                           |
|                                                                       |
| \"overrides\": {                                                      |
|                                                                       |
| \"react\": \"18.3.1\",                                                |
|                                                                       |
| \"react-dom\": \"18.3.1\"                                             |
|                                                                       |
| }                                                                     |
|                                                                       |
| }                                                                     |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

**1.3 Install Root Dependencies**

+-----------------------------------------------------------------------+
| cd \~/Desktop/cova                                                    |
|                                                                       |
| pnpm install                                                          |
+-----------------------------------------------------------------------+

**1.4 Create App Scaffolds**

+-----------------------------------------------------------------------+
| mkdir -p apps packages/shared/src/{types,supabase,utils}              |
|                                                                       |
| \# Create Expo mobile app                                             |
|                                                                       |
| cd apps                                                               |
|                                                                       |
| npx create-expo-app mobile \--template blank-typescript               |
|                                                                       |
| cd ..                                                                 |
|                                                                       |
| \# Create Next.js web app                                             |
|                                                                       |
| cd apps                                                               |
|                                                                       |
| npx create-next-app@latest web \--typescript \--tailwind \--app       |
|                                                                       |
| cd ..                                                                 |
+-----------------------------------------------------------------------+

**1.5 Shared Package --- TypeScript Types**

File: \~/Desktop/cova/packages/shared/src/types/index.ts

This is the complete types file. All types must match these exactly ---
Cursor prompts reference these.

+-----------------------------------------------------------------------+
| export type CavaStyle = \'japandi\' \| \'midcentury\' \| \'coastal\'  |
| \| \'industrial\' \| \'bohemian\';                                    |
|                                                                       |
| export type QualityTier = \'draft\' \| \'hd\';                        |
|                                                                       |
| export type RenderStatus = \'processing\' \| \'complete\' \|          |
| \'failed\';                                                           |
|                                                                       |
| export type AccountType = \'user\' \| \'realtor\' \| \'designer\';    |
|                                                                       |
| export interface User {                                               |
|                                                                       |
| id: string;                                                           |
|                                                                       |
| email: string;                                                        |
|                                                                       |
| style_fingerprint: StyleFingerprint \| null;                          |
|                                                                       |
| budget_dna: BudgetDNA \| null;                                        |
|                                                                       |
| token_balance: number;                                                |
|                                                                       |
| account_type: AccountType;                                            |
|                                                                       |
| stripe_customer_id: string \| null;                                   |
|                                                                       |
| created_at: string;                                                   |
|                                                                       |
| }                                                                     |
|                                                                       |
| export interface StyleFingerprint {                                   |
|                                                                       |
| top_styles: CavaStyle\[\];                                            |
|                                                                       |
| color_palette: string\[\];                                            |
|                                                                       |
| density_preference: \'minimal\' \| \'balanced\' \| \'maximal\';       |
|                                                                       |
| material_preference: \'wood\' \| \'metal\' \| \'upholstered\' \|      |
| \'mixed\';                                                            |
|                                                                       |
| swipe_count: number;                                                  |
|                                                                       |
| confidence_score: number;                                             |
|                                                                       |
| }                                                                     |
|                                                                       |
| export interface BudgetDNA {                                          |
|                                                                       |
| total_room_budget: number;                                            |
|                                                                       |
| preferred_price_tier: \'budget\' \| \'mid\' \| \'premium\' \|         |
| \'luxury\';                                                           |
|                                                                       |
| spend_history: number\[\];                                            |
|                                                                       |
| }                                                                     |
|                                                                       |
| export interface Room {                                               |
|                                                                       |
| id: string;                                                           |
|                                                                       |
| user_id: string;                                                      |
|                                                                       |
| original_image_url: string \| null;                                   |
|                                                                       |
| calibration_data: CalibrationData \| null;                            |
|                                                                       |
| room_dimensions: RoomDimensions \| null;                              |
|                                                                       |
| scene_state: SceneState \| null;                                      |
|                                                                       |
| created_at: string;                                                   |
|                                                                       |
| }                                                                     |
|                                                                       |
| export interface CalibrationData {                                    |
|                                                                       |
| corners: { tl: Point; tr: Point; bl: Point; br: Point };              |
|                                                                       |
| image_width: number;                                                  |
|                                                                       |
| image_height: number;                                                 |
|                                                                       |
| }                                                                     |
|                                                                       |
| export interface Point { x: number; y: number; }                      |
|                                                                       |
| export interface RoomDimensions {                                     |
|                                                                       |
| width_ft: number;                                                     |
|                                                                       |
| depth_ft: number;                                                     |
|                                                                       |
| height_ft: number;                                                    |
|                                                                       |
| }                                                                     |
|                                                                       |
| export interface SceneState {                                         |
|                                                                       |
| style: CavaStyle;                                                     |
|                                                                       |
| furniture: PlacedFurniture\[\];                                       |
|                                                                       |
| camera_position: \[number, number, number\];                          |
|                                                                       |
| snapshot_url: string \| null;                                         |
|                                                                       |
| }                                                                     |
|                                                                       |
| export interface PlacedFurniture {                                    |
|                                                                       |
| id: string;                                                           |
|                                                                       |
| model_key: string;                                                    |
|                                                                       |
| position: \[number, number, number\];                                 |
|                                                                       |
| rotation_y: number;                                                   |
|                                                                       |
| style: CavaStyle;                                                     |
|                                                                       |
| }                                                                     |
|                                                                       |
| export interface FurnitureCatalogItem {                               |
|                                                                       |
| key: string;                                                          |
|                                                                       |
| name: string;                                                         |
|                                                                       |
| glb_path: string;                                                     |
|                                                                       |
| category: \'seating\' \| \'table\' \| \'lighting\' \| \'rug\' \|      |
| \'storage\' \| \'decor\';                                             |
|                                                                       |
| default_position: \[number, number, number\];                         |
|                                                                       |
| default_rotation_y: number;                                           |
|                                                                       |
| scale_factor: number;                                                 |
|                                                                       |
| styles: CavaStyle\[\];                                                |
|                                                                       |
| }                                                                     |
|                                                                       |
| export interface Render {                                             |
|                                                                       |
| id: string;                                                           |
|                                                                       |
| room_id: string;                                                      |
|                                                                       |
| user_id: string;                                                      |
|                                                                       |
| style_applied: CavaStyle;                                             |
|                                                                       |
| quality_tier: QualityTier;                                            |
|                                                                       |
| status: RenderStatus;                                                 |
|                                                                       |
| image_url: string \| null;                                            |
|                                                                       |
| replicate_prediction_id: string \| null;                              |
|                                                                       |
| prompt_used: string \| null;                                          |
|                                                                       |
| seed: number \| null;                                                 |
|                                                                       |
| brisque_score: number \| null;                                        |
|                                                                       |
| created_at: string;                                                   |
|                                                                       |
| }                                                                     |
|                                                                       |
| export interface Product {                                            |
|                                                                       |
| id: string;                                                           |
|                                                                       |
| name: string;                                                         |
|                                                                       |
| description: string \| null;                                          |
|                                                                       |
| retailer: \'wayfair\' \| \'amazon\' \| \'ikea\' \| \'cb2\' \|         |
| \'other\';                                                            |
|                                                                       |
| price: number;                                                        |
|                                                                       |
| price_tier: \'budget\' \| \'mid\' \| \'premium\' \| \'luxury\';       |
|                                                                       |
| image_url: string \| null;                                            |
|                                                                       |
| affiliate_url_base: string;                                           |
|                                                                       |
| style_tags: CavaStyle\[\];                                            |
|                                                                       |
| category: string;                                                     |
|                                                                       |
| clip_embedding: number\[\] \| null;                                   |
|                                                                       |
| }                                                                     |
|                                                                       |
| export interface ChatSession {                                        |
|                                                                       |
| id: string;                                                           |
|                                                                       |
| room_id: string;                                                      |
|                                                                       |
| user_id: string;                                                      |
|                                                                       |
| render_id: string \| null;                                            |
|                                                                       |
| messages: ChatMessage\[\];                                            |
|                                                                       |
| summary: string \| null;                                              |
|                                                                       |
| total_messages: number;                                               |
|                                                                       |
| created_at: string;                                                   |
|                                                                       |
| }                                                                     |
|                                                                       |
| export interface ChatMessage {                                        |
|                                                                       |
| role: \'user\' \| \'assistant\';                                      |
|                                                                       |
| content: string;                                                      |
|                                                                       |
| timestamp: string;                                                    |
|                                                                       |
| render_id?: string;                                                   |
|                                                                       |
| }                                                                     |
|                                                                       |
| export interface Listing {                                            |
|                                                                       |
| id: string;                                                           |
|                                                                       |
| realtor_id: string;                                                   |
|                                                                       |
| address: string;                                                      |
|                                                                       |
| description: string \| null;                                          |
|                                                                       |
| shareable_slug: string;                                               |
|                                                                       |
| vote_counts: Record\<CavaStyle, number\>;                             |
|                                                                       |
| is_published: boolean;                                                |
|                                                                       |
| qr_code_url: string \| null;                                          |
|                                                                       |
| created_at: string;                                                   |
|                                                                       |
| }                                                                     |
|                                                                       |
| export const TOKEN_COSTS = {                                          |
|                                                                       |
| RENDER_DRAFT: 2,                                                      |
|                                                                       |
| RENDER_HD: 3,                                                         |
|                                                                       |
| CHAT_WITH_RENDER: 2,                                                  |
|                                                                       |
| CHAT_NO_RENDER: 1,                                                    |
|                                                                       |
| PRODUCT_MATCH: 1,                                                     |
|                                                                       |
| PRICE_TIER_SWITCH: 1,                                                 |
|                                                                       |
| } as const;                                                           |
+-----------------------------------------------------------------------+

**1.6 Shared Package --- Supabase Client**

File: \~/Desktop/cova/packages/shared/src/supabase/client.ts

+-----------------------------------------------------------------------+
| import { createClient } from \'@supabase/supabase-js\';               |
|                                                                       |
| // Works in both Expo (EXPO_PUBLIC\_) and Next.js (NEXT_PUBLIC\_)     |
|                                                                       |
| const supabaseUrl =                                                   |
|                                                                       |
| (typeof process !== \'undefined\' &&                                  |
| process.env.NEXT_PUBLIC_SUPABASE_URL) \|\|                            |
|                                                                       |
| (typeof process !== \'undefined\' &&                                  |
| process.env.EXPO_PUBLIC_SUPABASE_URL) \|\|                            |
|                                                                       |
| \'\';                                                                 |
|                                                                       |
| const supabaseAnonKey =                                               |
|                                                                       |
| (typeof process !== \'undefined\' &&                                  |
| process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) \|\|                       |
|                                                                       |
| (typeof process !== \'undefined\' &&                                  |
| process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) \|\|                       |
|                                                                       |
| \'\';                                                                 |
|                                                                       |
| export const supabase = createClient(supabaseUrl, supabaseAnonKey);   |
+-----------------------------------------------------------------------+

**1.7 Shared Package --- Token Utilities**

File: \~/Desktop/cova/packages/shared/src/utils/tokens.ts

+-----------------------------------------------------------------------+
| import { TOKEN_COSTS } from \'../types\';                             |
|                                                                       |
| export function canAfford(balance: number, cost: number): boolean {   |
|                                                                       |
| return balance \>= cost;                                              |
|                                                                       |
| }                                                                     |
|                                                                       |
| export function tokenCostLabel(action: keyof typeof TOKEN_COSTS):     |
| string {                                                              |
|                                                                       |
| const cost = TOKEN_COSTS\[action\];                                   |
|                                                                       |
| return cost === 0 ? \'Free\' : \`\${cost} token\${cost !== 1 ? \'s\'  |
| : \'\'}\`;                                                            |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

**1.8 Shared Package package.json and tsconfig**

File: \~/Desktop/cova/packages/shared/package.json

+-----------------------------------------------------------------------+
| {                                                                     |
|                                                                       |
| \"name\": \"@cova/shared\",                                           |
|                                                                       |
| \"version\": \"0.0.1\",                                               |
|                                                                       |
| \"main\": \"./src/index.ts\",                                         |
|                                                                       |
| \"types\": \"./src/index.ts\",                                        |
|                                                                       |
| \"dependencies\": {                                                   |
|                                                                       |
| \"@supabase/supabase-js\": \"\^2.39.0\"                               |
|                                                                       |
| }                                                                     |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

File: \~/Desktop/cova/packages/shared/src/index.ts

+-----------------------------------------------------------------------+
| export \* from \'./types\';                                           |
|                                                                       |
| export \* from \'./supabase/client\';                                 |
|                                                                       |
| export \* from \'./utils/tokens\';                                    |
+-----------------------------------------------------------------------+

**1.9 .cursorrules File**

File: \~/Desktop/cova/.cursorrules --- auto-loaded by Cursor for every
session

+-----------------------------------------------------------------------+
| You are building Cova, an AI interior design iOS app.                 |
|                                                                       |
| CRITICAL LOCKED VERSIONS --- NEVER CHANGE:                            |
|                                                                       |
| \- expo: \~52.0.49                                                    |
|                                                                       |
| \- react: 18.3.1 (EXACT --- React 19 breaks \@react-three/fiber)      |
|                                                                       |
| \- \@react-three/fiber: 8.17.10 (PINNED)                              |
|                                                                       |
| \- \@react-three/drei: 9.88.0 (PINNED)                                |
|                                                                       |
| \- three: 0.155.0 (PINNED --- higher versions crash on device)        |
|                                                                       |
| CRITICAL RULES:                                                       |
|                                                                       |
| \- NEVER use OrbitControls --- causes \'touchAction of undefined\'    |
| crash on React Native                                                 |
|                                                                       |
| \- NEVER use texture maps (roughnessMap, normalMap etc) --- causes    |
| \'trim of undefined\' crash                                           |
|                                                                       |
| \- NEVER run pnpm install --- tell the user to run it themselves      |
|                                                                       |
| \- ALWAYS use StyleSheet.create for React Native styles --- no inline |
| styles                                                                |
|                                                                       |
| \- ALWAYS use \@cova/shared for types, never redefine them            |
|                                                                       |
| \- ALWAYS use deduct_tokens_atomic RPC for token deduction --- never  |
| direct UPDATE                                                         |
|                                                                       |
| \- ALWAYS handle errors with try/catch and display user-friendly      |
| messages                                                              |
|                                                                       |
| \- For 3D scene style changes: increment sceneKey to force Canvas     |
| remount                                                               |
|                                                                       |
| ARCHITECTURE:                                                         |
|                                                                       |
| \- Monorepo: \~/Desktop/cova (pnpm workspaces + Turborepo)            |
|                                                                       |
| \- Mobile: apps/mobile (React Native Expo iOS)                        |
|                                                                       |
| \- Web: apps/web (Next.js 14 realtor dashboard)                       |
|                                                                       |
| \- Shared: packages/shared (TypeScript types, Supabase client, utils) |
|                                                                       |
| \- Supabase project: xdeacbmkdwqrwxonqaqh                             |
|                                                                       |
| DESIGN SYSTEM:                                                        |
|                                                                       |
| \- Primary: Navy #0B1729                                              |
|                                                                       |
| \- Accent: Gold #C9A84C                                               |
|                                                                       |
| \- Background secondary: Cream #FAF7F2                                |
|                                                                       |
| \- Text secondary: Muted #8A8070                                      |
|                                                                       |
| ALWAYS reference \@BUILDGUIDE.md for implementation details.          |
+-----------------------------------------------------------------------+

**1.10 .cursorignore File**

File: \~/Desktop/cova/.cursorignore --- prevents Cursor from loading
large directories and crashing

+-----------------------------------------------------------------------+
| node_modules                                                          |
|                                                                       |
| assets/3d                                                             |
|                                                                       |
| .expo                                                                 |
|                                                                       |
| pnpm-lock.yaml                                                        |
|                                                                       |
| ios                                                                   |
|                                                                       |
| android                                                               |
|                                                                       |
| \*.log                                                                |
|                                                                       |
| dist                                                                  |
|                                                                       |
| .next                                                                 |
+-----------------------------------------------------------------------+

**1.11 Verification**

+-----------------------------------------------------------------------+
| cd \~/Desktop/cova                                                    |
|                                                                       |
| pnpm install                                                          |
|                                                                       |
| \# Should show 0 errors, packages installed                           |
|                                                                       |
| \# Verify shared package TypeScript                                   |
|                                                                       |
| cd packages/shared                                                    |
|                                                                       |
| npx tsc \--noEmit                                                     |
|                                                                       |
| \# Should show: 0 errors                                              |
+-----------------------------------------------------------------------+

**PHASE 2: SUPABASE BACKEND**

  ---------- ------------------------------------------------------------------
   **DONE**  COMPLETED --- All 13 tables created, RLS enabled on all, 6 storage
             buckets, 50 preset products seeded.

  ---------- ------------------------------------------------------------------

The Supabase backend is complete. This section documents all migrations
for reference and in case any table needs to be recreated. The Supabase
project is: xdeacbmkdwqrwxonqaqh.supabase.co

**2.1 Link Supabase Project**

+-----------------------------------------------------------------------+
| cd \~/Desktop/cova                                                    |
|                                                                       |
| supabase login                                                        |
|                                                                       |
| supabase link \--project-ref xdeacbmkdwqrwxonqaqh                     |
|                                                                       |
| \# Verify connection                                                  |
|                                                                       |
| supabase status                                                       |
+-----------------------------------------------------------------------+

**2.2 Migration 001 --- Enable Extensions**

File: \~/Desktop/cova/supabase/migrations/001_enable_extensions.sql

+-----------------------------------------------------------------------+
| \-- Enable pgvector for CLIP embeddings                               |
|                                                                       |
| CREATE EXTENSION IF NOT EXISTS vector;                                |
|                                                                       |
| \-- Enable pg_cron for price drop alerts (Phase 8)                    |
|                                                                       |
| CREATE EXTENSION IF NOT EXISTS pg_cron;                               |
|                                                                       |
| \-- Enable uuid generation                                            |
|                                                                       |
| CREATE EXTENSION IF NOT EXISTS pgcrypto;                              |
+-----------------------------------------------------------------------+

**2.3 Migration 002 --- Users Table**

File: \~/Desktop/cova/supabase/migrations/002_users.sql

+-----------------------------------------------------------------------+
| CREATE TABLE public.users (                                           |
|                                                                       |
| id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,      |
|                                                                       |
| email TEXT NOT NULL,                                                  |
|                                                                       |
| style_fingerprint JSONB,                                              |
|                                                                       |
| budget_dna JSONB,                                                     |
|                                                                       |
| token_balance INTEGER NOT NULL DEFAULT 5 CHECK (token_balance \>= 0), |
|                                                                       |
| account_type TEXT NOT NULL DEFAULT \'user\'                           |
|                                                                       |
| CHECK (account_type IN (\'user\', \'realtor\', \'designer\')),        |
|                                                                       |
| stripe_customer_id TEXT,                                              |
|                                                                       |
| created_at TIMESTAMPTZ DEFAULT NOW()                                  |
|                                                                       |
| );                                                                    |
|                                                                       |
| \-- Auto-create user profile on signup                                |
|                                                                       |
| CREATE OR REPLACE FUNCTION handle_new_user()                          |
|                                                                       |
| RETURNS TRIGGER AS \$\$                                               |
|                                                                       |
| BEGIN                                                                 |
|                                                                       |
| INSERT INTO public.users (id, email)                                  |
|                                                                       |
| VALUES (NEW.id, NEW.email);                                           |
|                                                                       |
| RETURN NEW;                                                           |
|                                                                       |
| END;                                                                  |
|                                                                       |
| \$\$ LANGUAGE plpgsql SECURITY DEFINER;                               |
|                                                                       |
| CREATE TRIGGER on_auth_user_created                                   |
|                                                                       |
| AFTER INSERT ON auth.users                                            |
|                                                                       |
| FOR EACH ROW EXECUTE FUNCTION handle_new_user();                      |
|                                                                       |
| \-- Atomic token deduction RPC (prevents race conditions)             |
|                                                                       |
| CREATE OR REPLACE FUNCTION deduct_tokens_atomic(                      |
|                                                                       |
| p_user_id UUID,                                                       |
|                                                                       |
| p_amount INTEGER,                                                     |
|                                                                       |
| p_reason TEXT DEFAULT \'deduction\'                                   |
|                                                                       |
| )                                                                     |
|                                                                       |
| RETURNS INTEGER AS \$\$                                               |
|                                                                       |
| DECLARE                                                               |
|                                                                       |
| new_balance INTEGER;                                                  |
|                                                                       |
| BEGIN                                                                 |
|                                                                       |
| UPDATE public.users                                                   |
|                                                                       |
| SET token_balance = token_balance - p_amount                          |
|                                                                       |
| WHERE id = p_user_id AND token_balance \>= p_amount                   |
|                                                                       |
| RETURNING token_balance INTO new_balance;                             |
|                                                                       |
| IF new_balance IS NULL THEN                                           |
|                                                                       |
| RAISE EXCEPTION \'Insufficient tokens\';                              |
|                                                                       |
| END IF;                                                               |
|                                                                       |
| INSERT INTO public.token_transactions (user_id, delta, reason)        |
|                                                                       |
| VALUES (p_user_id, -p_amount, p_reason);                              |
|                                                                       |
| RETURN new_balance;                                                   |
|                                                                       |
| END;                                                                  |
|                                                                       |
| \$\$ LANGUAGE plpgsql SECURITY DEFINER;                               |
|                                                                       |
| \-- RLS                                                               |
|                                                                       |
| ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;                   |
|                                                                       |
| CREATE POLICY \"Users can read own profile\" ON public.users          |
|                                                                       |
| FOR SELECT USING (auth.uid() = id);                                   |
|                                                                       |
| CREATE POLICY \"Users can update own profile\" ON public.users        |
|                                                                       |
| FOR UPDATE USING (auth.uid() = id);                                   |
+-----------------------------------------------------------------------+

**2.4 Migration 003 --- Token Transactions**

File: \~/Desktop/cova/supabase/migrations/003_token_transactions.sql

+-----------------------------------------------------------------------+
| CREATE TABLE public.token_transactions (                              |
|                                                                       |
| id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                        |
|                                                                       |
| user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,  |
|                                                                       |
| delta INTEGER NOT NULL, \-- negative = deduction, positive = credit   |
|                                                                       |
| reason TEXT NOT NULL,                                                 |
|                                                                       |
| render_id UUID,                                                       |
|                                                                       |
| created_at TIMESTAMPTZ DEFAULT NOW()                                  |
|                                                                       |
| );                                                                    |
|                                                                       |
| ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;      |
|                                                                       |
| CREATE POLICY \"Users can read own transactions\" ON                  |
| public.token_transactions                                             |
|                                                                       |
| FOR SELECT USING (auth.uid() = user_id);                              |
|                                                                       |
| CREATE POLICY \"Service role can insert\" ON                          |
| public.token_transactions                                             |
|                                                                       |
| FOR INSERT WITH CHECK (true);                                         |
+-----------------------------------------------------------------------+

**2.5 Migration 004 --- Rooms Table**

File: \~/Desktop/cova/supabase/migrations/004_rooms.sql

+-----------------------------------------------------------------------+
| CREATE TABLE public.rooms (                                           |
|                                                                       |
| id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                        |
|                                                                       |
| user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,  |
|                                                                       |
| original_image_url TEXT,                                              |
|                                                                       |
| calibration_data JSONB,                                               |
|                                                                       |
| room_dimensions JSONB,                                                |
|                                                                       |
| scene_state JSONB,                                                    |
|                                                                       |
| depth_map_url TEXT, \-- V2: Depth Anything V2                         |
|                                                                       |
| created_at TIMESTAMPTZ DEFAULT NOW(),                                 |
|                                                                       |
| updated_at TIMESTAMPTZ DEFAULT NOW()                                  |
|                                                                       |
| );                                                                    |
|                                                                       |
| ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;                   |
|                                                                       |
| CREATE POLICY \"Users can CRUD own rooms\" ON public.rooms            |
|                                                                       |
| FOR ALL USING (auth.uid() = user_id);                                 |
+-----------------------------------------------------------------------+

**2.6 Migration 005 --- Renders Table**

File: \~/Desktop/cova/supabase/migrations/005_renders.sql

+------------------------------------------------------------------------+
| CREATE TABLE public.renders (                                          |
|                                                                        |
| id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                         |
|                                                                        |
| room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,   |
|                                                                        |
| user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,   |
|                                                                        |
| style_applied TEXT NOT NULL                                            |
|                                                                        |
| CHECK (style_applied IN                                                |
| (\'japandi\',\'midcentury\',\'coastal\',\'industrial\',\'bohemian\')), |
|                                                                        |
| quality_tier TEXT NOT NULL DEFAULT \'draft\'                           |
|                                                                        |
| CHECK (quality_tier IN (\'draft\',\'hd\')),                            |
|                                                                        |
| status TEXT NOT NULL DEFAULT \'processing\'                            |
|                                                                        |
| CHECK (status IN (\'processing\',\'complete\',\'failed\')),            |
|                                                                        |
| image_url TEXT,                                                        |
|                                                                        |
| replicate_prediction_id TEXT,                                          |
|                                                                        |
| prompt_used TEXT,                                                      |
|                                                                        |
| seed BIGINT,                                                           |
|                                                                        |
| brisque_score NUMERIC,                                                 |
|                                                                        |
| tokens_charged INTEGER NOT NULL DEFAULT 0,                             |
|                                                                        |
| created_at TIMESTAMPTZ DEFAULT NOW()                                   |
|                                                                        |
| );                                                                     |
|                                                                        |
| ALTER TABLE public.renders ENABLE ROW LEVEL SECURITY;                  |
|                                                                        |
| CREATE POLICY \"Users can read own renders\" ON public.renders         |
|                                                                        |
| FOR SELECT USING (auth.uid() = user_id);                               |
|                                                                        |
| CREATE POLICY \"Service role can write renders\" ON public.renders     |
|                                                                        |
| FOR ALL USING (true);                                                  |
+------------------------------------------------------------------------+

**2.7 Migration 006 --- Products Table**

File: \~/Desktop/cova/supabase/migrations/006_products.sql

+-----------------------------------------------------------------------+
| CREATE TABLE public.products (                                        |
|                                                                       |
| id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                        |
|                                                                       |
| name TEXT NOT NULL,                                                   |
|                                                                       |
| description TEXT,                                                     |
|                                                                       |
| retailer TEXT NOT NULL                                                |
|                                                                       |
| CHECK (retailer IN                                                    |
| (\'wayfair\',\'amazon\',\'ikea\',\'cb2\',\'other\')),                 |
|                                                                       |
| price NUMERIC NOT NULL,                                               |
|                                                                       |
| price_tier TEXT NOT NULL                                              |
|                                                                       |
| CHECK (price_tier IN (\'budget\',\'mid\',\'premium\',\'luxury\')),    |
|                                                                       |
| image_url TEXT,                                                       |
|                                                                       |
| affiliate_url_base TEXT NOT NULL,                                     |
|                                                                       |
| style_tags TEXT\[\] NOT NULL DEFAULT \'{}\',                          |
|                                                                       |
| category TEXT NOT NULL,                                               |
|                                                                       |
| clip_embedding VECTOR(768),                                           |
|                                                                       |
| created_at TIMESTAMPTZ DEFAULT NOW()                                  |
|                                                                       |
| );                                                                    |
|                                                                       |
| \-- CLIP cosine similarity search RPC                                 |
|                                                                       |
| CREATE OR REPLACE FUNCTION search_products_by_embedding(              |
|                                                                       |
| query_embedding VECTOR(768),                                          |
|                                                                       |
| match_count INTEGER DEFAULT 10,                                       |
|                                                                       |
| style_filter TEXT DEFAULT NULL                                        |
|                                                                       |
| )                                                                     |
|                                                                       |
| RETURNS TABLE (id UUID, name TEXT, price NUMERIC, retailer TEXT,      |
|                                                                       |
| image_url TEXT, affiliate_url_base TEXT, style_tags TEXT\[\],         |
|                                                                       |
| price_tier TEXT, similarity FLOAT)                                    |
|                                                                       |
| AS \$\$                                                               |
|                                                                       |
| BEGIN                                                                 |
|                                                                       |
| RETURN QUERY                                                          |
|                                                                       |
| SELECT p.id, p.name, p.price, p.retailer, p.image_url,                |
|                                                                       |
| p.affiliate_url_base, p.style_tags, p.price_tier,                     |
|                                                                       |
| 1 - (p.clip_embedding \<=\> query_embedding) as similarity            |
|                                                                       |
| FROM public.products p                                                |
|                                                                       |
| WHERE (style_filter IS NULL OR style_filter = ANY(p.style_tags))      |
|                                                                       |
| AND p.clip_embedding IS NOT NULL                                      |
|                                                                       |
| ORDER BY p.clip_embedding \<=\> query_embedding                       |
|                                                                       |
| LIMIT match_count;                                                    |
|                                                                       |
| END;                                                                  |
|                                                                       |
| \$\$ LANGUAGE plpgsql;                                                |
|                                                                       |
| \-- Public read (anyone can browse products)                          |
|                                                                       |
| ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;                |
|                                                                       |
| CREATE POLICY \"Products are publicly readable\" ON public.products   |
|                                                                       |
| FOR SELECT USING (true);                                              |
+-----------------------------------------------------------------------+

**2.8 Migration 007 --- Chat Sessions**

File: \~/Desktop/cova/supabase/migrations/007_chat_sessions.sql

+-----------------------------------------------------------------------+
| CREATE TABLE public.chat_sessions (                                   |
|                                                                       |
| id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                        |
|                                                                       |
| room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,  |
|                                                                       |
| user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,  |
|                                                                       |
| render_id UUID REFERENCES public.renders(id),                         |
|                                                                       |
| messages JSONB NOT NULL DEFAULT \'\[\]\',                             |
|                                                                       |
| summary TEXT,                                                         |
|                                                                       |
| total_messages INTEGER NOT NULL DEFAULT 0,                            |
|                                                                       |
| created_at TIMESTAMPTZ DEFAULT NOW(),                                 |
|                                                                       |
| updated_at TIMESTAMPTZ DEFAULT NOW()                                  |
|                                                                       |
| );                                                                    |
|                                                                       |
| ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;           |
|                                                                       |
| CREATE POLICY \"Users can CRUD own chat sessions\" ON                 |
| public.chat_sessions                                                  |
|                                                                       |
| FOR ALL USING (auth.uid() = user_id);                                 |
+-----------------------------------------------------------------------+

**2.9 Migration 008 --- Listings (Realtor)**

File: \~/Desktop/cova/supabase/migrations/008_listings.sql

+-------------------------------------------------------------------------------------+
| CREATE TABLE public.listings (                                                      |
|                                                                                     |
| id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                                      |
|                                                                                     |
| realtor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,             |
|                                                                                     |
| address TEXT NOT NULL,                                                              |
|                                                                                     |
| description TEXT,                                                                   |
|                                                                                     |
| shareable_slug TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(4), \'hex\'),   |
|                                                                                     |
| vote_counts JSONB NOT NULL DEFAULT                                                  |
| \'{\"japandi\":0,\"midcentury\":0,\"coastal\":0,\"industrial\":0,\"bohemian\":0}\', |
|                                                                                     |
| is_published BOOLEAN NOT NULL DEFAULT false,                                        |
|                                                                                     |
| qr_code_url TEXT,                                                                   |
|                                                                                     |
| created_at TIMESTAMPTZ DEFAULT NOW()                                                |
|                                                                                     |
| );                                                                                  |
|                                                                                     |
| CREATE TABLE public.votes (                                                         |
|                                                                                     |
| id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                                      |
|                                                                                     |
| listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,          |
|                                                                                     |
| render_id UUID REFERENCES public.renders(id),                                       |
|                                                                                     |
| device_fingerprint TEXT NOT NULL,                                                   |
|                                                                                     |
| style_voted TEXT NOT NULL                                                           |
|                                                                                     |
| CHECK (style_voted IN                                                               |
| (\'japandi\',\'midcentury\',\'coastal\',\'industrial\',\'bohemian\')),              |
|                                                                                     |
| created_at TIMESTAMPTZ DEFAULT NOW(),                                               |
|                                                                                     |
| UNIQUE(listing_id, device_fingerprint)                                              |
|                                                                                     |
| );                                                                                  |
|                                                                                     |
| ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;                              |
|                                                                                     |
| CREATE POLICY \"Realtors manage own listings\" ON public.listings                   |
|                                                                                     |
| FOR ALL USING (auth.uid() = realtor_id);                                            |
|                                                                                     |
| CREATE POLICY \"Published listings are public\" ON public.listings                  |
|                                                                                     |
| FOR SELECT USING (is_published = true);                                             |
|                                                                                     |
| ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;                                 |
|                                                                                     |
| CREATE POLICY \"Anyone can vote\" ON public.votes                                   |
|                                                                                     |
| FOR INSERT WITH CHECK (true);                                                       |
|                                                                                     |
| CREATE POLICY \"Anyone can read votes\" ON public.votes                             |
|                                                                                     |
| FOR SELECT USING (true);                                                            |
+-------------------------------------------------------------------------------------+

**2.10 Migration 009 --- Jobs Table**

File: \~/Desktop/cova/supabase/migrations/009_jobs.sql

+-----------------------------------------------------------------------+
| CREATE TABLE public.jobs (                                            |
|                                                                       |
| id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                        |
|                                                                       |
| user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,  |
|                                                                       |
| job_type TEXT NOT NULL DEFAULT \'render\',                            |
|                                                                       |
| status TEXT NOT NULL DEFAULT \'pending\'                              |
|                                                                       |
| CHECK (status IN                                                      |
| (\'pending\',\'processing\',\'complete\',\'failed\')),                |
|                                                                       |
| replicate_id TEXT,                                                    |
|                                                                       |
| input_params JSONB,                                                   |
|                                                                       |
| result_url TEXT,                                                      |
|                                                                       |
| error_message TEXT,                                                   |
|                                                                       |
| created_at TIMESTAMPTZ DEFAULT NOW(),                                 |
|                                                                       |
| completed_at TIMESTAMPTZ                                              |
|                                                                       |
| );                                                                    |
|                                                                       |
| ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;                    |
|                                                                       |
| CREATE POLICY \"Users can read own jobs\" ON public.jobs              |
|                                                                       |
| FOR SELECT USING (auth.uid() = user_id);                              |
|                                                                       |
| CREATE POLICY \"Service role can write jobs\" ON public.jobs          |
|                                                                       |
| FOR ALL USING (true);                                                 |
+-----------------------------------------------------------------------+

**2.11 Migration 010 --- Supporting Tables**

File: \~/Desktop/cova/supabase/migrations/010_supporting_tables.sql

+-----------------------------------------------------------------------+
| \-- Affiliate click tracking                                          |
|                                                                       |
| CREATE TABLE public.click_events (                                    |
|                                                                       |
| id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                        |
|                                                                       |
| user_id UUID REFERENCES public.users(id),                             |
|                                                                       |
| product_id UUID REFERENCES public.products(id),                       |
|                                                                       |
| render_id UUID REFERENCES public.renders(id),                         |
|                                                                       |
| created_at TIMESTAMPTZ DEFAULT NOW()                                  |
|                                                                       |
| );                                                                    |
|                                                                       |
| \-- Room to product junction                                          |
|                                                                       |
| CREATE TABLE public.room_products (                                   |
|                                                                       |
| id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                        |
|                                                                       |
| room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,  |
|                                                                       |
| render_id UUID REFERENCES public.renders(id),                         |
|                                                                       |
| product_id UUID NOT NULL REFERENCES public.products(id),              |
|                                                                       |
| created_at TIMESTAMPTZ DEFAULT NOW()                                  |
|                                                                       |
| );                                                                    |
|                                                                       |
| \-- Swipe history for Style Fingerprint                               |
|                                                                       |
| CREATE TABLE public.swipe_history (                                   |
|                                                                       |
| id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                        |
|                                                                       |
| user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,  |
|                                                                       |
| card_id TEXT NOT NULL,                                                |
|                                                                       |
| direction TEXT NOT NULL CHECK (direction IN (\'left\',\'right\')),    |
|                                                                       |
| dwell_ms INTEGER NOT NULL DEFAULT 0,                                  |
|                                                                       |
| created_at TIMESTAMPTZ DEFAULT NOW()                                  |
|                                                                       |
| );                                                                    |
|                                                                       |
| \-- Rate limiting                                                     |
|                                                                       |
| CREATE TABLE public.rate_limit_events (                               |
|                                                                       |
| id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                        |
|                                                                       |
| user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,  |
|                                                                       |
| event_type TEXT NOT NULL,                                             |
|                                                                       |
| created_at TIMESTAMPTZ DEFAULT NOW()                                  |
|                                                                       |
| );                                                                    |
|                                                                       |
| \-- RLS for all                                                       |
|                                                                       |
| ALTER TABLE public.click_events ENABLE ROW LEVEL SECURITY;            |
|                                                                       |
| CREATE POLICY \"Users track own clicks\" ON public.click_events FOR   |
| ALL USING (auth.uid() = user_id);                                     |
|                                                                       |
| ALTER TABLE public.room_products ENABLE ROW LEVEL SECURITY;           |
|                                                                       |
| CREATE POLICY \"Service role manages room_products\" ON               |
| public.room_products FOR ALL USING (true);                            |
|                                                                       |
| ALTER TABLE public.swipe_history ENABLE ROW LEVEL SECURITY;           |
|                                                                       |
| CREATE POLICY \"Users can write own swipes\" ON public.swipe_history  |
| FOR INSERT WITH CHECK (auth.uid() = user_id);                         |
|                                                                       |
| CREATE POLICY \"Users can read own swipes\" ON public.swipe_history   |
| FOR SELECT USING (auth.uid() = user_id);                              |
|                                                                       |
| ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;       |
|                                                                       |
| CREATE POLICY \"Service role manages rate limits\" ON                 |
| public.rate_limit_events FOR ALL USING (true);                        |
+-----------------------------------------------------------------------+

**2.12 Migration 011 --- Preset Products Seed**

File: \~/Desktop/cova/supabase/migrations/011_preset_products.sql
(abbreviated --- 50 products total)

+--------------------------------------------------------------------------+
| \-- Japandi products (10)                                                |
|                                                                          |
| INSERT INTO public.products (name, retailer, price, price_tier,          |
| affiliate_url_base, style_tags, category, image_url) VALUES              |
|                                                                          |
| (\'Japandi Oak Sofa\', \'wayfair\', 1299.00, \'premium\',                |
| \'https://wayfair.com/furniture/pdp/japandi-oak-sofa\', \'{japandi}\',   |
| \'seating\',                                                             |
| \'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400\'),    |
|                                                                          |
| (\'Linen Floor Cushion Set\', \'amazon\', 89.00, \'budget\',             |
| \'https://amazon.com/dp/B001\', \'{japandi,bohemian}\', \'seating\',     |
| \'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400\'), |
|                                                                          |
| (\'Minimal Oak Coffee Table\', \'ikea\', 199.00, \'budget\',             |
| \'https://ikea.com/us/en/p/japandi-coffee-table\', \'{japandi}\',        |
| \'table\',                                                               |
| \'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400\'),    |
|                                                                          |
| (\'Wabi-Sabi Floor Lamp\', \'cb2\', 349.00, \'mid\',                     |
| \'https://cb2.com/japandi-floor-lamp\', \'{japandi}\', \'lighting\',     |
| \'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400\'), |
|                                                                          |
| (\'Natural Jute Rug 8x10\', \'wayfair\', 449.00, \'mid\',                |
| \'https://wayfair.com/rugs/pdp/jute-rug\', \'{japandi,coastal}\',        |
| \'rug\',                                                                 |
| \'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400\'),    |
|                                                                          |
| \-- (45 more products across midcentury, coastal, industrial, bohemian)  |
|                                                                          |
| \-- Full seed in supabase/migrations/011_preset_products.sql on GitHub   |
|                                                                          |
| \-- Mid-Century Modern (10)                                              |
|                                                                          |
| (\'Walnut Eames-Style Chair\', \'wayfair\', 549.00, \'mid\',             |
| \'https://wayfair.com/furniture/pdp/eames-chair\', \'{midcentury}\',     |
| \'seating\',                                                             |
| \'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400\'),    |
|                                                                          |
| (\'Mustard Velvet Sofa\', \'cb2\', 2199.00, \'premium\',                 |
| \'https://cb2.com/mustard-velvet-sofa\', \'{midcentury}\', \'seating\',  |
| \'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400\'),    |
|                                                                          |
| \-- Coastal (10)                                                         |
|                                                                          |
| (\'Rattan Accent Chair\', \'wayfair\', 399.00, \'mid\',                  |
| \'https://wayfair.com/furniture/pdp/rattan-chair\',                      |
| \'{coastal,bohemian}\', \'seating\',                                     |
| \'https://images.unsplash.com/photo-1484101403633-562f891dc89a?w=400\'), |
|                                                                          |
| \-- Industrial (10)                                                      |
|                                                                          |
| (\'Steel Pipe Shelving Unit\', \'amazon\', 289.00, \'mid\',              |
| \'https://amazon.com/dp/B002\', \'{industrial}\', \'storage\',           |
| \'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400\'), |
|                                                                          |
| \-- Bohemian (10)                                                        |
|                                                                          |
| (\'Terracotta Velvet Loveseat\', \'cb2\', 1499.00, \'premium\',          |
| \'https://cb2.com/terracotta-loveseat\', \'{bohemian}\', \'seating\',    |
| \'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400\');    |
+--------------------------------------------------------------------------+

**2.13 Create Storage Buckets**

Run in Supabase Dashboard \> Storage \> New Bucket, OR via the CLI:

+-----------------------------------------------------------------------+
| \# Create all 6 buckets in Supabase Dashboard \> Storage              |
|                                                                       |
| \# Or use the Supabase client in a migration:                         |
|                                                                       |
| \# Bucket: room-uploads (private, 50MB max, images only)              |
|                                                                       |
| \# Bucket: renders (private, 20MB max, images only)                   |
|                                                                       |
| \# Bucket: product-images (public, 5MB max)                           |
|                                                                       |
| \# Bucket: swipe-cards (public, 5MB max)                              |
|                                                                       |
| \# Bucket: 3d-models (public, 50MB max, glb/gltf only)                |
|                                                                       |
| \# Bucket: scene-snapshots (private, 10MB max, images only)           |
+-----------------------------------------------------------------------+

**2.14 Apply All Migrations**

+-----------------------------------------------------------------------+
| cd \~/Desktop/cova                                                    |
|                                                                       |
| supabase db push                                                      |
|                                                                       |
| \# Or apply each migration individually in Supabase Dashboard \> SQL  |
| Editor                                                                |
+-----------------------------------------------------------------------+

**2.15 Verification**

+-----------------------------------------------------------------------+
| \# Check tables exist in Supabase Dashboard \> Table Editor           |
|                                                                       |
| \# Should see: users, token_transactions, rooms, renders, products,   |
|                                                                       |
| \# chat_sessions, listings, votes, jobs, click_events,                |
|                                                                       |
| \# room_products, swipe_history, rate_limit_events                    |
|                                                                       |
| \# Check RLS is enabled (Shield icon green on all tables)             |
|                                                                       |
| \# Check products were seeded                                         |
|                                                                       |
| \# Run in SQL Editor: SELECT COUNT(\*) FROM products;                 |
|                                                                       |
| \# Should return: 50                                                  |
+-----------------------------------------------------------------------+

**PHASE 2.5: 3D FURNITURE ASSET LIBRARY**

  ---------- ------------------------------------------------------------------
   **DONE**  COMPLETED --- 43 GLB models in assets/3d/furniture/ready/
             committed to GitHub.

  ---------- ------------------------------------------------------------------

**2.5.1 Asset Sources**

  ---------------------------------------------------------------------------------------------------
  **Pack**              **URL**                                        **License**   **Models Used**
  --------------------- ---------------------------------------------- ------------- ----------------
  Kenney Furniture Kit  kenney.nl/assets/furniture-kit                 CC0           17 models

  Quaternius House      quaternius.com/packs/ultimate-house-interior   CC0           12 models
  Interior                                                                           

  Sketchfab (CC BY)     sketchfab.com                                  CC BY         10 models

  Poly Haven            polyhaven.com/models                           CC0           4 models
  ---------------------------------------------------------------------------------------------------

**2.5.2 Directory Structure**

+-----------------------------------------------------------------------+
| \~/Desktop/cova/assets/3d/furniture/ready/                            |
|                                                                       |
| ├── japandi/                                                          |
|                                                                       |
| │ ├── japandi_sofa.glb                                                |
|                                                                       |
| │ ├── japandi_coffee_table.glb                                        |
|                                                                       |
| │ ├── japandi_chair.glb                                               |
|                                                                       |
| │ ├── japandi_floor_lamp.glb                                          |
|                                                                       |
| │ ├── japandi_rug.glb                                                 |
|                                                                       |
| │ ├── japandi_mirror.glb                                              |
|                                                                       |
| │ ├── japandi_pendant_lamp.glb                                        |
|                                                                       |
| │ ├── japandi_plant.glb                                               |
|                                                                       |
| │ └── japandi_side_table.glb                                          |
|                                                                       |
| ├── midcentury/                                                       |
|                                                                       |
| │ ├── midcentury_sofa.glb                                             |
|                                                                       |
| │ ├── midcentury_eames_chair.glb                                      |
|                                                                       |
| │ ├── midcentury_dining_chair.glb                                     |
|                                                                       |
| │ ├── midcentury_sideboard.glb                                        |
|                                                                       |
| │ ├── midcentury_table_lamp.glb                                       |
|                                                                       |
| │ ├── midcentury_rug.glb                                              |
|                                                                       |
| │ ├── midcentury_pendant_lamp.glb                                     |
|                                                                       |
| │ ├── midcentury_floor_lamp.glb                                       |
|                                                                       |
| │ └── midcentury_ottoman.glb                                          |
|                                                                       |
| ├── coastal/ (8 models)                                               |
|                                                                       |
| ├── industrial/ (8 models)                                            |
|                                                                       |
| ├── bohemian/ (8 models)                                              |
|                                                                       |
| └── shared/                                                           |
|                                                                       |
| └── plant_fiddle_leaf.glb                                             |
+-----------------------------------------------------------------------+

**2.5.3 GLB Optimization Script**

File: \~/Desktop/cova/scripts/optimise_glb.py --- run via Blender for
Draco compression

+-----------------------------------------------------------------------+
| import bpy                                                            |
|                                                                       |
| import sys                                                            |
|                                                                       |
| import os                                                             |
|                                                                       |
| input_dir = sys.argv\[sys.argv.index(\'\--\') + 1\]                   |
|                                                                       |
| output_dir = sys.argv\[sys.argv.index(\'\--\') + 2\]                  |
|                                                                       |
| os.makedirs(output_dir, exist_ok=True)                                |
|                                                                       |
| for fname in os.listdir(input_dir):                                   |
|                                                                       |
| if not fname.endswith(\'.glb\'):                                      |
|                                                                       |
| continue                                                              |
|                                                                       |
| path_in = os.path.join(input_dir, fname)                              |
|                                                                       |
| path_out = os.path.join(output_dir, fname)                            |
|                                                                       |
| bpy.ops.wm.read_factory_settings(use_empty=True)                      |
|                                                                       |
| bpy.ops.import_scene.gltf(filepath=path_in)                           |
|                                                                       |
| bpy.ops.export_scene.gltf(                                            |
|                                                                       |
| filepath=path_out,                                                    |
|                                                                       |
| export_format=\'GLB\',                                                |
|                                                                       |
| export_draco_mesh_compression_enable=True,                            |
|                                                                       |
| export_draco_mesh_compression_level=6,                                |
|                                                                       |
| export_draco_position_quantization=14,                                |
|                                                                       |
| export_draco_normal_quantization=10,                                  |
|                                                                       |
| use_selection=False                                                   |
|                                                                       |
| )                                                                     |
|                                                                       |
| print(f\'Optimized: {fname}\')                                        |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| \# Run optimization:                                                  |
|                                                                       |
| blender \--background \--python scripts/optimise_glb.py \--           |
| assets/3d/furniture/source assets/3d/furniture/ready                  |
+-----------------------------------------------------------------------+

**PHASE 3: 3D ROOM ENGINE**

  ---------- ------------------------------------------------------------------
   **DONE**  COMPLETED --- 3D room rendering on Pranav\'s physical iPhone.
             Style switching, screenshot save, reset all working.

  ---------- ------------------------------------------------------------------

  --------- ------------------------------------------------------------------
   **!!!**  Phase 3 is complete. The code below is what was built. DO NOT
            re-run the Cursor prompts below unless you are rebuilding from
            scratch after a catastrophic failure. The codebase on GitHub IS
            the source of truth.

  --------- ------------------------------------------------------------------

**3.1 Install Mobile Dependencies**

Run in Terminal (not via Cursor):

+-----------------------------------------------------------------------+
| cd \~/Desktop/cova/apps/mobile                                        |
|                                                                       |
| \# Core 3D stack --- ALL VERSIONS LOCKED                              |
|                                                                       |
| pnpm add \@react-three/fiber@8.17.10 \@react-three/drei@9.88.0        |
| three@0.155.0                                                         |
|                                                                       |
| \# Expo native modules                                                |
|                                                                       |
| pnpm add expo-gl expo-camera expo-image-picker expo-media-library     |
|                                                                       |
| pnpm add react-native-view-shot expo-file-system                      |
|                                                                       |
| \# Navigation                                                         |
|                                                                       |
| pnpm add \@react-navigation/native \@react-navigation/native-stack    |
|                                                                       |
| pnpm add react-native-screens react-native-safe-area-context          |
|                                                                       |
| \# Gestures and animations                                            |
|                                                                       |
| pnpm add react-native-gesture-handler react-native-reanimated         |
|                                                                       |
| \# SVG for calibration handles                                        |
|                                                                       |
| pnpm add react-native-svg                                             |
|                                                                       |
| \# State and utilities                                                |
|                                                                       |
| pnpm add zustand                                                      |
|                                                                       |
| pnpm add \@cova/shared@workspace:\*                                   |
|                                                                       |
| \# After install, verify React is still 18.3.1:                       |
|                                                                       |
| cat node_modules/react/package.json \| grep \'\"version\"\'           |
|                                                                       |
| \# Must show: \"version\": \"18.3.1\"                                 |
+-----------------------------------------------------------------------+

**3.2 app.json Configuration**

File: \~/Desktop/cova/apps/mobile/app.json

+-----------------------------------------------------------------------+
| {                                                                     |
|                                                                       |
| \"expo\": {                                                           |
|                                                                       |
| \"name\": \"Cova\",                                                   |
|                                                                       |
| \"slug\": \"cova\",                                                   |
|                                                                       |
| \"version\": \"1.0.0\",                                               |
|                                                                       |
| \"orientation\": \"portrait\",                                        |
|                                                                       |
| \"icon\": \"./assets/icon.png\",                                      |
|                                                                       |
| \"userInterfaceStyle\": \"dark\",                                     |
|                                                                       |
| \"newArchEnabled\": false,                                            |
|                                                                       |
| \"ios\": {                                                            |
|                                                                       |
| \"supportsTablet\": false,                                            |
|                                                                       |
| \"bundleIdentifier\": \"ai.cova.app\",                                |
|                                                                       |
| \"buildNumber\": \"1\",                                               |
|                                                                       |
| \"infoPlist\": {                                                      |
|                                                                       |
| \"NSCameraUsageDescription\": \"Cova needs camera access to capture   |
| your room for 3D design.\",                                           |
|                                                                       |
| \"NSPhotoLibraryUsageDescription\": \"Cova saves your room designs to |
| your photo library.\",                                                |
|                                                                       |
| \"NSPhotoLibraryAddUsageDescription\": \"Cova saves room design       |
| screenshots to your photo library.\",                                 |
|                                                                       |
| \"NSMicrophoneUsageDescription\": \"Cova needs microphone access for  |
| voice commands.\",                                                    |
|                                                                       |
| \"ITSAppUsesNonExemptEncryption\": false                              |
|                                                                       |
| }                                                                     |
|                                                                       |
| },                                                                    |
|                                                                       |
| \"plugins\": \[                                                       |
|                                                                       |
| \"expo-camera\",                                                      |
|                                                                       |
| \"expo-media-library\",                                               |
|                                                                       |
| \[\"expo-image-picker\", {                                            |
|                                                                       |
| \"photosPermission\": \"Cova needs photo library access to upload     |
| room photos.\"                                                        |
|                                                                       |
| }\]                                                                   |
|                                                                       |
| \]                                                                    |
|                                                                       |
| }                                                                     |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

  --------- ------------------------------------------------------------------
   **!!!**  newArchEnabled: false is REQUIRED. \@react-three/fiber 8.x is
            incompatible with Fabric/New Architecture. Do not change this.

  --------- ------------------------------------------------------------------

**3.3 metro.config.js**

File: \~/Desktop/cova/apps/mobile/metro.config.js --- registers GLB file
extension

+-----------------------------------------------------------------------+
| const { getDefaultConfig } = require(\'expo/metro-config\');          |
|                                                                       |
| const config = getDefaultConfig(\_\_dirname);                         |
|                                                                       |
| // Register GLB/GLTF as asset extensions                              |
|                                                                       |
| config.resolver.assetExts.push(\'glb\', \'gltf\', \'ktx2\');          |
|                                                                       |
| module.exports = config;                                              |
+-----------------------------------------------------------------------+

**3.4 babel.config.js**

File: \~/Desktop/cova/apps/mobile/babel.config.js --- Reanimated plugin
MUST be last

+-----------------------------------------------------------------------+
| module.exports = function(api) {                                      |
|                                                                       |
| api.cache(true);                                                      |
|                                                                       |
| return {                                                              |
|                                                                       |
| presets: \[\'babel-preset-expo\'\],                                   |
|                                                                       |
| plugins: \[                                                           |
|                                                                       |
| \'react-native-reanimated/plugin\', // MUST be last                   |
|                                                                       |
| \],                                                                   |
|                                                                       |
| };                                                                    |
|                                                                       |
| };                                                                    |
+-----------------------------------------------------------------------+

**3.5 Zustand Store**

File: \~/Desktop/cova/apps/mobile/src/store/index.ts

+-----------------------------------------------------------------------+
| import { create } from \'zustand\';                                   |
|                                                                       |
| import type { User, Room, SceneState, CavaStyle } from                |
| \'@cova/shared\';                                                     |
|                                                                       |
| interface CovaStore {                                                 |
|                                                                       |
| // Auth                                                               |
|                                                                       |
| user: User \| null;                                                   |
|                                                                       |
| setUser: (user: User \| null) =\> void;                               |
|                                                                       |
| // Active room                                                        |
|                                                                       |
| activeRoom: Room \| null;                                             |
|                                                                       |
| setActiveRoom: (room: Room \| null) =\> void;                         |
|                                                                       |
| // 3D Scene                                                           |
|                                                                       |
| activeStyle: CavaStyle;                                               |
|                                                                       |
| setActiveStyle: (style: CavaStyle) =\> void;                          |
|                                                                       |
| sceneKey: number;                                                     |
|                                                                       |
| incrementSceneKey: () =\> void;                                       |
|                                                                       |
| // Token balance (mirror of users.token_balance)                      |
|                                                                       |
| tokenBalance: number;                                                 |
|                                                                       |
| setTokenBalance: (n: number) =\> void;                                |
|                                                                       |
| deductTokens: (amount: number) =\> void;                              |
|                                                                       |
| }                                                                     |
|                                                                       |
| export const useCovaStore = create\<CovaStore\>((set) =\> ({          |
|                                                                       |
| user: null,                                                           |
|                                                                       |
| setUser: (user) =\> set({ user }),                                    |
|                                                                       |
| activeRoom: null,                                                     |
|                                                                       |
| setActiveRoom: (room) =\> set({ activeRoom: room }),                  |
|                                                                       |
| activeStyle: \'japandi\',                                             |
|                                                                       |
| setActiveStyle: (style) =\> set({ activeStyle: style }),              |
|                                                                       |
| sceneKey: 0,                                                          |
|                                                                       |
| incrementSceneKey: () =\> set((s) =\> ({ sceneKey: s.sceneKey + 1     |
| })),                                                                  |
|                                                                       |
| tokenBalance: 5,                                                      |
|                                                                       |
| setTokenBalance: (n) =\> set({ tokenBalance: n }),                    |
|                                                                       |
| deductTokens: (amount) =\> set((s) =\> ({ tokenBalance:               |
| s.tokenBalance - amount })),                                          |
|                                                                       |
| }));                                                                  |
+-----------------------------------------------------------------------+

**3.6 Furniture Catalog**

File: \~/Desktop/cova/apps/mobile/src/data/furnitureCatalog.ts
(abbreviated --- full file on GitHub)

+--------------------------------------------------------------------------------+
| import type { FurnitureCatalogItem, CavaStyle } from \'@cova/shared\';         |
|                                                                                |
| export const FURNITURE_CATALOG: Record\<string, FurnitureCatalogItem\> = {     |
|                                                                                |
| japandi_sofa: {                                                                |
|                                                                                |
| key: \'japandi_sofa\',                                                         |
|                                                                                |
| name: \'Japandi Sofa\',                                                        |
|                                                                                |
| glb_path:                                                                      |
| require(\'../../assets/3d/furniture/ready/japandi/japandi_sofa.glb\'),         |
|                                                                                |
| category: \'seating\',                                                         |
|                                                                                |
| default_position: \[0, 0, -1.5\],                                              |
|                                                                                |
| default_rotation_y: 0,                                                         |
|                                                                                |
| scale_factor: 1.0,                                                             |
|                                                                                |
| styles: \[\'japandi\'\],                                                       |
|                                                                                |
| },                                                                             |
|                                                                                |
| japandi_coffee_table: {                                                        |
|                                                                                |
| key: \'japandi_coffee_table\',                                                 |
|                                                                                |
| name: \'Coffee Table\',                                                        |
|                                                                                |
| glb_path:                                                                      |
| require(\'../../assets/3d/furniture/ready/japandi/japandi_coffee_table.glb\'), |
|                                                                                |
| category: \'table\',                                                           |
|                                                                                |
| default_position: \[0, 0, -0.5\],                                              |
|                                                                                |
| default_rotation_y: 0,                                                         |
|                                                                                |
| scale_factor: 0.9,                                                             |
|                                                                                |
| styles: \[\'japandi\'\],                                                       |
|                                                                                |
| },                                                                             |
|                                                                                |
| // \... 41 more items                                                          |
|                                                                                |
| };                                                                             |
|                                                                                |
| export const STYLE_DEFAULT_FURNITURE: Record\<CavaStyle, string\[\]\> = {      |
|                                                                                |
| japandi: \[\'japandi_sofa\', \'japandi_coffee_table\', \'japandi_floor_lamp\', |
| \'japandi_rug\', \'japandi_plant\'\],                                          |
|                                                                                |
| midcentury: \[\'midcentury_sofa\', \'midcentury_eames_chair\',                 |
| \'midcentury_table_lamp\', \'midcentury_rug\'\],                               |
|                                                                                |
| coastal: \[\'coastal_sofa\', \'coastal_coffee_table\',                         |
| \'coastal_rattan_chair\', \'coastal_rug\'\],                                   |
|                                                                                |
| industrial: \[\'industrial_sofa\', \'industrial_coffee_table\',                |
| \'industrial_floor_lamp\'\],                                                   |
|                                                                                |
| bohemian: \[\'bohemian_sofa\', \'bohemian_chair\', \'bohemian_rug\',           |
| \'bohemian_plant\'\],                                                          |
|                                                                                |
| };                                                                             |
|                                                                                |
| export const STYLE_COLORS: Record\<CavaStyle, { wall: string; floor: string;   |
| baseboard: string }\> = {                                                      |
|                                                                                |
| japandi: { wall: \'#E8E0D5\', floor: \'#C9BEA8\', baseboard: \'#8B7355\' },    |
|                                                                                |
| midcentury: { wall: \'#F5EBD8\', floor: \'#C4946A\', baseboard: \'#8B6B4A\' }, |
|                                                                                |
| coastal: { wall: \'#E8F4F8\', floor: \'#C2D4DC\', baseboard: \'#8AACB8\' },    |
|                                                                                |
| industrial: { wall: \'#6B6560\', floor: \'#4A4540\', baseboard: \'#3A3530\' }, |
|                                                                                |
| bohemian: { wall: \'#EDD5B8\', floor: \'#C4926A\', baseboard: \'#A0704A\' },   |
|                                                                                |
| };                                                                             |
|                                                                                |
| export const STYLE_MATERIALS: Record\<CavaStyle, {                             |
|                                                                                |
| sofa: { color: string; roughness: number; metalness: number };                 |
|                                                                                |
| table: { color: string; roughness: number; metalness: number };                |
|                                                                                |
| lamp: { color: string; roughness: number; metalness: number };                 |
|                                                                                |
| rug: { color: string; roughness: number; metalness: number };                  |
|                                                                                |
| }\> = {                                                                        |
|                                                                                |
| japandi: { sofa: { color: \'#C8B99A\', roughness: 0.95, metalness: 0.0 },      |
| table: { color: \'#8B7355\', roughness: 0.80, metalness: 0.0 }, lamp: { color: |
| \'#2C2C2C\', roughness: 0.60, metalness: 0.2 }, rug: { color: \'#D4C4A8\',     |
| roughness: 1.0, metalness: 0.0 } },                                            |
|                                                                                |
| midcentury: { sofa: { color: \'#D4956A\', roughness: 0.80, metalness: 0.0 },   |
| table: { color: \'#6B4A2A\', roughness: 0.75, metalness: 0.0 }, lamp: { color: |
| \'#C9A84C\', roughness: 0.40, metalness: 0.5 }, rug: { color: \'#C4846A\',     |
| roughness: 0.90, metalness: 0.0 } },                                           |
|                                                                                |
| coastal: { sofa: { color: \'#F0F4F8\', roughness: 0.90, metalness: 0.0 },      |
| table: { color: \'#D4E8F0\', roughness: 0.70, metalness: 0.0 }, lamp: { color: |
| \'#8AACB8\', roughness: 0.50, metalness: 0.1 }, rug: { color: \'#C8DDE8\',     |
| roughness: 0.95, metalness: 0.0 } },                                           |
|                                                                                |
| industrial: { sofa: { color: \'#2C2C2C\', roughness: 0.70, metalness: 0.05 },  |
| table: { color: \'#4A3728\', roughness: 0.75, metalness: 0.1 }, lamp: { color: |
| \'#C9A84C\', roughness: 0.30, metalness: 0.5 }, rug: { color: \'#5A5048\',     |
| roughness: 0.85, metalness: 0.0 } },                                           |
|                                                                                |
| bohemian: { sofa: { color: \'#C4604A\', roughness: 0.85, metalness: 0.0 },     |
| table: { color: \'#8B5E3C\', roughness: 0.75, metalness: 0.0 }, lamp: { color: |
| \'#D4946A\', roughness: 0.60, metalness: 0.1 }, rug: { color: \'#C4826A\',     |
| roughness: 0.95, metalness: 0.0 } },                                           |
|                                                                                |
| };                                                                             |
|                                                                                |
| export const STYLE_LIGHTING: Record\<CavaStyle, {                              |
|                                                                                |
| ambientColor: string; ambientIntensity: number;                                |
|                                                                                |
| directionalColor: string; directionalIntensity: number;                        |
|                                                                                |
| directionalPosition: \[number, number, number\];                               |
|                                                                                |
| }\> = {                                                                        |
|                                                                                |
| japandi: { ambientColor: \'#FFF8F0\', ambientIntensity: 0.8, directionalColor: |
| \'#FFF5E8\', directionalIntensity: 1.0, directionalPosition: \[5, 8, 3\] },    |
|                                                                                |
| midcentury: { ambientColor: \'#FFF3E0\', ambientIntensity: 0.7,                |
| directionalColor: \'#FFE0A0\', directionalIntensity: 1.3, directionalPosition: |
| \[4, 7, 2\] },                                                                 |
|                                                                                |
| coastal: { ambientColor: \'#F0F8FF\', ambientIntensity: 1.0, directionalColor: |
| \'#FFFFFF\', directionalIntensity: 1.2, directionalPosition: \[3, 10, 5\] },   |
|                                                                                |
| industrial: { ambientColor: \'#4A4540\', ambientIntensity: 0.5,                |
| directionalColor: \'#FFD080\', directionalIntensity: 1.5, directionalPosition: |
| \[2, 6, 1\] },                                                                 |
|                                                                                |
| bohemian: { ambientColor: \'#FFE8C8\', ambientIntensity: 0.7,                  |
| directionalColor: \'#FFB860\', directionalIntensity: 1.0, directionalPosition: |
| \[4, 7, 3\] },                                                                 |
|                                                                                |
| };                                                                             |
+--------------------------------------------------------------------------------+

**3.7 BoxRoom Component**

File: \~/Desktop/cova/apps/mobile/src/components/3d/BoxRoom.tsx

+-----------------------------------------------------------------------+
| import React from \'react\';                                          |
|                                                                       |
| import { useRef } from \'react\';                                     |
|                                                                       |
| import type { CavaStyle } from \'@cova/shared\';                      |
|                                                                       |
| import { STYLE_COLORS } from \'../../data/furnitureCatalog\';         |
|                                                                       |
| interface BoxRoomProps {                                              |
|                                                                       |
| style: CavaStyle;                                                     |
|                                                                       |
| width?: number;                                                       |
|                                                                       |
| depth?: number;                                                       |
|                                                                       |
| height?: number;                                                      |
|                                                                       |
| }                                                                     |
|                                                                       |
| export function BoxRoom({ style, width=7, depth=6, height=3 }:        |
| BoxRoomProps) {                                                       |
|                                                                       |
| const colors = STYLE_COLORS\[style\];                                 |
|                                                                       |
| const hw = width / 2;                                                 |
|                                                                       |
| const hd = depth / 2;                                                 |
|                                                                       |
| return (                                                              |
|                                                                       |
| \<group\>                                                             |
|                                                                       |
| {/\* Floor \*/}                                                       |
|                                                                       |
| \<mesh position={\[0, 0, 0\]} rotation={\[-Math.PI / 2, 0, 0\]}       |
| receiveShadow={false}\>                                               |
|                                                                       |
| \<planeGeometry args={\[width, depth\]} /\>                           |
|                                                                       |
| \<meshStandardMaterial color={colors.floor} roughness={0.9}           |
| metalness={0.0} /\>                                                   |
|                                                                       |
| \</mesh\>                                                             |
|                                                                       |
| {/\* Back wall \*/}                                                   |
|                                                                       |
| \<mesh position={\[0, height/2, -hd\]}\>                              |
|                                                                       |
| \<planeGeometry args={\[width, height\]} /\>                          |
|                                                                       |
| \<meshStandardMaterial color={colors.wall} roughness={0.95}           |
| metalness={0.0} /\>                                                   |
|                                                                       |
| \</mesh\>                                                             |
|                                                                       |
| {/\* Left wall \*/}                                                   |
|                                                                       |
| \<mesh position={\[-hw, height/2, 0\]} rotation={\[0, Math.PI/2,      |
| 0\]}\>                                                                |
|                                                                       |
| \<planeGeometry args={\[depth, height\]} /\>                          |
|                                                                       |
| \<meshStandardMaterial color={colors.wall} roughness={0.95}           |
| metalness={0.0} /\>                                                   |
|                                                                       |
| \</mesh\>                                                             |
|                                                                       |
| {/\* Right wall \*/}                                                  |
|                                                                       |
| \<mesh position={\[hw, height/2, 0\]} rotation={\[0, -Math.PI/2,      |
| 0\]}\>                                                                |
|                                                                       |
| \<planeGeometry args={\[depth, height\]} /\>                          |
|                                                                       |
| \<meshStandardMaterial color={colors.wall} roughness={0.95}           |
| metalness={0.0} /\>                                                   |
|                                                                       |
| \</mesh\>                                                             |
|                                                                       |
| {/\* Ceiling \*/}                                                     |
|                                                                       |
| \<mesh position={\[0, height, 0\]} rotation={\[Math.PI/2, 0, 0\]}\>   |
|                                                                       |
| \<planeGeometry args={\[width, depth\]} /\>                           |
|                                                                       |
| \<meshStandardMaterial color={colors.wall} roughness={1.0}            |
| metalness={0.0} /\>                                                   |
|                                                                       |
| \</mesh\>                                                             |
|                                                                       |
| {/\* Baseboard trim --- front wall bottom \*/}                        |
|                                                                       |
| \<mesh position={\[0, 0.06, hd - 0.02\]}\>                            |
|                                                                       |
| \<boxGeometry args={\[width, 0.12, 0.04\]} /\>                        |
|                                                                       |
| \<meshStandardMaterial color={colors.baseboard} roughness={0.7}       |
| metalness={0.0} /\>                                                   |
|                                                                       |
| \</mesh\>                                                             |
|                                                                       |
| {/\* Baseboard --- back wall \*/}                                     |
|                                                                       |
| \<mesh position={\[0, 0.06, -hd + 0.02\]}\>                           |
|                                                                       |
| \<boxGeometry args={\[width, 0.12, 0.04\]} /\>                        |
|                                                                       |
| \<meshStandardMaterial color={colors.baseboard} roughness={0.7}       |
| metalness={0.0} /\>                                                   |
|                                                                       |
| \</mesh\>                                                             |
|                                                                       |
| {/\* Baseboard --- left wall \*/}                                     |
|                                                                       |
| \<mesh position={\[-hw + 0.02, 0.06, 0\]}\>                           |
|                                                                       |
| \<boxGeometry args={\[0.04, 0.12, depth\]} /\>                        |
|                                                                       |
| \<meshStandardMaterial color={colors.baseboard} roughness={0.7}       |
| metalness={0.0} /\>                                                   |
|                                                                       |
| \</mesh\>                                                             |
|                                                                       |
| {/\* Baseboard --- right wall \*/}                                    |
|                                                                       |
| \<mesh position={\[hw - 0.02, 0.06, 0\]}\>                            |
|                                                                       |
| \<boxGeometry args={\[0.04, 0.12, depth\]} /\>                        |
|                                                                       |
| \<meshStandardMaterial color={colors.baseboard} roughness={0.7}       |
| metalness={0.0} /\>                                                   |
|                                                                       |
| \</mesh\>                                                             |
|                                                                       |
| \</group\>                                                            |
|                                                                       |
| );                                                                    |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

**3.8 SceneLighting Component**

File: \~/Desktop/cova/apps/mobile/src/components/3d/SceneLighting.tsx

+-----------------------------------------------------------------------+
| import React from \'react\';                                          |
|                                                                       |
| import type { CavaStyle } from \'@cova/shared\';                      |
|                                                                       |
| import { STYLE_LIGHTING } from \'../../data/furnitureCatalog\';       |
|                                                                       |
| interface SceneLightingProps { style: CavaStyle; }                    |
|                                                                       |
| export function SceneLighting({ style }: SceneLightingProps) {        |
|                                                                       |
| const l = STYLE_LIGHTING\[style\];                                    |
|                                                                       |
| return (                                                              |
|                                                                       |
| \<\>                                                                  |
|                                                                       |
| \<ambientLight color={l.ambientColor} intensity={l.ambientIntensity}  |
| /\>                                                                   |
|                                                                       |
| \<directionalLight                                                    |
|                                                                       |
| color={l.directionalColor}                                            |
|                                                                       |
| intensity={l.directionalIntensity}                                    |
|                                                                       |
| position={l.directionalPosition}                                      |
|                                                                       |
| castShadow={false}                                                    |
|                                                                       |
| /\>                                                                   |
|                                                                       |
| \</\>                                                                 |
|                                                                       |
| );                                                                    |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

**3.9 FurniturePiece Component**

File: \~/Desktop/cova/apps/mobile/src/components/3d/FurniturePiece.tsx

  --------- ------------------------------------------------------------------
   **!!!**  FurniturePiece is built but NOT currently rendered in
            RoomViewer3DScreen. It will be re-enabled in Phase 6. This is
            intentional --- Phase 3 isolated the base scene to eliminate
            shader crashes.

  --------- ------------------------------------------------------------------

+-----------------------------------------------------------------------+
| import React, { useRef, Suspense } from \'react\';                    |
|                                                                       |
| import { useGLTF } from \'@react-three/drei/native\';                 |
|                                                                       |
| import { useThree } from \'@react-three/fiber/native\';               |
|                                                                       |
| import \* as THREE from \'three\';                                    |
|                                                                       |
| import type { PlacedFurniture, FurnitureCatalogItem, CavaStyle } from |
| \'@cova/shared\';                                                     |
|                                                                       |
| import { STYLE_MATERIALS } from \'../../data/furnitureCatalog\';      |
|                                                                       |
| interface FurniturePieceProps {                                       |
|                                                                       |
| piece: PlacedFurniture;                                               |
|                                                                       |
| catalogItem: FurnitureCatalogItem;                                    |
|                                                                       |
| isSelected: boolean;                                                  |
|                                                                       |
| onSelect: () =\> void;                                                |
|                                                                       |
| onDragEnd: (position: \[number, number, number\]) =\> void;           |
|                                                                       |
| style: CavaStyle;                                                     |
|                                                                       |
| }                                                                     |
|                                                                       |
| function FurniturePieceInner({ piece, catalogItem, isSelected,        |
| onSelect, style }: FurniturePieceProps) {                             |
|                                                                       |
| const { scene } = useGLTF(catalogItem.glb_path);                      |
|                                                                       |
| const groupRef = useRef\<THREE.Group\>(null);                         |
|                                                                       |
| const materials = STYLE_MATERIALS\[style\];                           |
|                                                                       |
| // Clone scene to avoid mutating shared cache                         |
|                                                                       |
| const clonedScene = React.useMemo(() =\> {                            |
|                                                                       |
| const clone = scene.clone(true);                                      |
|                                                                       |
| // Apply style material overrides                                     |
|                                                                       |
| clone.traverse((child) =\> {                                          |
|                                                                       |
| if (!(child instanceof THREE.Mesh)) return;                           |
|                                                                       |
| try {                                                                 |
|                                                                       |
| const name = child.name.toLowerCase();                                |
|                                                                       |
| let mat = materials.table; // default                                 |
|                                                                       |
| if (name.includes(\'sofa\') \|\| name.includes(\'seat\') \|\|         |
| name.includes(\'chair\'))                                             |
|                                                                       |
| mat = materials.sofa;                                                 |
|                                                                       |
| else if (name.includes(\'lamp\') \|\| name.includes(\'light\'))       |
|                                                                       |
| mat = materials.lamp;                                                 |
|                                                                       |
| else if (name.includes(\'rug\') \|\| name.includes(\'carpet\'))       |
|                                                                       |
| mat = materials.rug;                                                  |
|                                                                       |
| child.material = new THREE.MeshStandardMaterial({                     |
|                                                                       |
| color: mat.color,                                                     |
|                                                                       |
| roughness: mat.roughness,                                             |
|                                                                       |
| metalness: mat.metalness,                                             |
|                                                                       |
| // NO texture maps --- causes \'trim of undefined\' crash             |
|                                                                       |
| });                                                                   |
|                                                                       |
| } catch (e) {                                                         |
|                                                                       |
| // Skip mesh on error                                                 |
|                                                                       |
| }                                                                     |
|                                                                       |
| });                                                                   |
|                                                                       |
| // Auto-scale to max 1 meter                                          |
|                                                                       |
| const box = new THREE.Box3().setFromObject(clone);                    |
|                                                                       |
| const size = new THREE.Vector3();                                     |
|                                                                       |
| box.getSize(size);                                                    |
|                                                                       |
| const maxDim = Math.max(size.x, size.y, size.z);                      |
|                                                                       |
| if (maxDim \> 0) {                                                    |
|                                                                       |
| const targetSize = 1.0 \* catalogItem.scale_factor;                   |
|                                                                       |
| clone.scale.setScalar(targetSize / maxDim);                           |
|                                                                       |
| }                                                                     |
|                                                                       |
| return clone;                                                         |
|                                                                       |
| }, \[scene, style\]);                                                 |
|                                                                       |
| return (                                                              |
|                                                                       |
| \<group                                                               |
|                                                                       |
| ref={groupRef}                                                        |
|                                                                       |
| position={piece.position}                                             |
|                                                                       |
| rotation={\[0, piece.rotation_y, 0\]}                                 |
|                                                                       |
| onPointerDown={() =\> onSelect()}                                     |
|                                                                       |
| \>                                                                    |
|                                                                       |
| \<primitive object={clonedScene} /\>                                  |
|                                                                       |
| {isSelected && (                                                      |
|                                                                       |
| \<mesh position={\[0, 0.02, 0\]} rotation={\[-Math.PI/2, 0, 0\]}\>    |
|                                                                       |
| \<ringGeometry args={\[0.4, 0.45, 32\]} /\>                           |
|                                                                       |
| \<meshStandardMaterial color=\'#C9A84C\' roughness={0.5}              |
| metalness={0.3} /\>                                                   |
|                                                                       |
| \</mesh\>                                                             |
|                                                                       |
| )}                                                                    |
|                                                                       |
| \</group\>                                                            |
|                                                                       |
| );                                                                    |
|                                                                       |
| }                                                                     |
|                                                                       |
| export function FurniturePiece(props: FurniturePieceProps) {          |
|                                                                       |
| return (                                                              |
|                                                                       |
| \<Suspense fallback={null}\>                                          |
|                                                                       |
| \<FurniturePieceInner {\...props} /\>                                 |
|                                                                       |
| \</Suspense\>                                                         |
|                                                                       |
| );                                                                    |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

**3.10 RoomViewer3DScreen**

File:
\~/Desktop/cova/apps/mobile/src/screens/main/RoomViewer3DScreen.tsx

This is the current working build. FurniturePiece is intentionally not
included yet.

+-----------------------------------------------------------------------+
| import React, { useRef, useState, useCallback } from \'react\';       |
|                                                                       |
| import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView  |
| } from \'react-native\';                                              |
|                                                                       |
| import { Canvas } from \'@react-three/fiber/native\';                 |
|                                                                       |
| import ViewShot, { captureRef } from \'react-native-view-shot\';      |
|                                                                       |
| import \* as MediaLibrary from \'expo-media-library\';                |
|                                                                       |
| import { BoxRoom } from \'../../components/3d/BoxRoom\';              |
|                                                                       |
| import { SceneLighting } from \'../../components/3d/SceneLighting\';  |
|                                                                       |
| import type { CavaStyle } from \'@cova/shared\';                      |
|                                                                       |
| const STYLES: { id: CavaStyle; label: string; emoji: string }\[\] =   |
| \[                                                                    |
|                                                                       |
| { id: \'japandi\', label: \'Japandi\', emoji: \'🌿\' },               |
|                                                                       |
| { id: \'midcentury\', label: \'Mid-Century\', emoji: \'🪑\' },        |
|                                                                       |
| { id: \'coastal\', label: \'Coastal\', emoji: \'🌊\' },               |
|                                                                       |
| { id: \'industrial\', label: \'Industrial\', emoji: \'⚙️\' },         |
|                                                                       |
| { id: \'bohemian\', label: \'Bohemian\', emoji: \'🪬\' },             |
|                                                                       |
| \];                                                                   |
|                                                                       |
| function ThreeDErrorBoundary({ children, onError }: { children:       |
| React.ReactNode; onError?: () =\> void }) {                           |
|                                                                       |
| const \[hasError, setHasError\] = useState(false);                    |
|                                                                       |
| if (hasError) return (                                                |
|                                                                       |
| \<View style={styles.errorFallback}\>                                 |
|                                                                       |
| \<Text style={styles.errorText}\>3D failed to load. Tap Reset to try  |
| again.\</Text\>                                                       |
|                                                                       |
| \</View\>                                                             |
|                                                                       |
| );                                                                    |
|                                                                       |
| return (                                                              |
|                                                                       |
| \<React.Fragment\>                                                    |
|                                                                       |
| {children}                                                            |
|                                                                       |
| \</React.Fragment\>                                                   |
|                                                                       |
| );                                                                    |
|                                                                       |
| }                                                                     |
|                                                                       |
| export function RoomViewer3DScreen({ navigation }: any) {             |
|                                                                       |
| const \[activeStyle, setActiveStyle\] =                               |
| useState\<CavaStyle\>(\'japandi\');                                   |
|                                                                       |
| const \[sceneKey, setSceneKey\] = useState(0);                        |
|                                                                       |
| const viewShotRef = useRef\<ViewShot\>(null);                         |
|                                                                       |
| const handleStyleSwitch = useCallback((style: CavaStyle) =\> {        |
|                                                                       |
| setActiveStyle(style);                                                |
|                                                                       |
| setSceneKey(prev =\> prev + 1); // Force full Canvas remount          |
|                                                                       |
| }, \[\]);                                                             |
|                                                                       |
| const handleSave = async () =\> {                                     |
|                                                                       |
| try {                                                                 |
|                                                                       |
| const { status } = await MediaLibrary.requestPermissionsAsync();      |
|                                                                       |
| if (status !== \'granted\') {                                         |
|                                                                       |
| Alert.alert(\'Permission needed\', \'Please allow photo library       |
| access to save screenshots.\');                                       |
|                                                                       |
| return;                                                               |
|                                                                       |
| }                                                                     |
|                                                                       |
| const uri = await captureRef(viewShotRef, { format: \'jpg\', quality: |
| 0.9 });                                                               |
|                                                                       |
| await MediaLibrary.saveToLibraryAsync(uri);                           |
|                                                                       |
| Alert.alert(\'Saved\', \'Screenshot saved to your camera roll!\');    |
|                                                                       |
| } catch (e) {                                                         |
|                                                                       |
| console.warn(\'Save error:\', e);                                     |
|                                                                       |
| Alert.alert(\'Error\', \'Could not save screenshot.\');               |
|                                                                       |
| }                                                                     |
|                                                                       |
| };                                                                    |
|                                                                       |
| const handleReset = useCallback(() =\> {                              |
|                                                                       |
| setSceneKey(prev =\> prev + 1);                                       |
|                                                                       |
| }, \[\]);                                                             |
|                                                                       |
| const handleAIRender = useCallback(() =\> {                           |
|                                                                       |
| Alert.alert(\'Coming Soon\', \'AI Render is coming in Phase 4!\');    |
|                                                                       |
| }, \[\]);                                                             |
|                                                                       |
| return (                                                              |
|                                                                       |
| \<View style={styles.container}\>                                     |
|                                                                       |
| {/\* Header \*/}                                                      |
|                                                                       |
| \<View style={styles.header}\>                                        |
|                                                                       |
| \<TouchableOpacity onPress={() =\> navigation.goBack()}               |
| style={styles.backBtn}\>                                              |
|                                                                       |
| \<Text style={styles.backText}\>{\'\<\'}\</Text\>                     |
|                                                                       |
| \</TouchableOpacity\>                                                 |
|                                                                       |
| \<Text style={styles.title}\>My Room in 3D\</Text\>                   |
|                                                                       |
| \<View style={{ width: 40 }} /\>                                      |
|                                                                       |
| \</View\>                                                             |
|                                                                       |
| {/\* Style switcher \*/}                                              |
|                                                                       |
| \<ScrollView horizontal showsHorizontalScrollIndicator={false}        |
|                                                                       |
| style={styles.styleBar}                                               |
| contentContainerStyle={styles.styleBarContent}\>                      |
|                                                                       |
| {STYLES.map(s =\> (                                                   |
|                                                                       |
| \<TouchableOpacity                                                    |
|                                                                       |
| key={s.id}                                                            |
|                                                                       |
| onPress={() =\> handleStyleSwitch(s.id)}                              |
|                                                                       |
| style={\[styles.styleChip, activeStyle === s.id &&                    |
| styles.styleChipActive\]}                                             |
|                                                                       |
| \>                                                                    |
|                                                                       |
| \<Text style={styles.styleEmoji}\>{s.emoji}\</Text\>                  |
|                                                                       |
| \<Text style={\[styles.styleLabel, activeStyle === s.id &&            |
| styles.styleLabelActive\]}\>                                          |
|                                                                       |
| {s.label}                                                             |
|                                                                       |
| \</Text\>                                                             |
|                                                                       |
| \</TouchableOpacity\>                                                 |
|                                                                       |
| ))}                                                                   |
|                                                                       |
| \</ScrollView\>                                                       |
|                                                                       |
| {/\* 3D Canvas \*/}                                                   |
|                                                                       |
| \<ViewShot ref={viewShotRef} style={styles.canvasContainer}\>         |
|                                                                       |
| \<ThreeDErrorBoundary\>                                               |
|                                                                       |
| \<Canvas                                                              |
|                                                                       |
| key={sceneKey}                                                        |
|                                                                       |
| shadows={false}                                                       |
|                                                                       |
| camera={{ position: \[0, 4, 6\], fov: 60, near: 0.1, far: 100 }}      |
|                                                                       |
| style={styles.canvas}                                                 |
|                                                                       |
| gl={{ antialias: true }}                                              |
|                                                                       |
| \>                                                                    |
|                                                                       |
| \<SceneLighting style={activeStyle} /\>                               |
|                                                                       |
| \<BoxRoom style={activeStyle} /\>                                     |
|                                                                       |
| \</Canvas\>                                                           |
|                                                                       |
| \</ThreeDErrorBoundary\>                                              |
|                                                                       |
| \</ViewShot\>                                                         |
|                                                                       |
| {/\* Action bar \*/}                                                  |
|                                                                       |
| \<View style={styles.actionBar}\>                                     |
|                                                                       |
| \<TouchableOpacity style={styles.goldButton} onPress={handleSave}\>   |
|                                                                       |
| \<Text style={styles.goldButtonText}\>Save\</Text\>                   |
|                                                                       |
| \</TouchableOpacity\>                                                 |
|                                                                       |
| \<TouchableOpacity style={styles.ghostButton} onPress={handleReset}\> |
|                                                                       |
| \<Text style={styles.ghostButtonText}\>Reset\</Text\>                 |
|                                                                       |
| \</TouchableOpacity\>                                                 |
|                                                                       |
| \<TouchableOpacity style={styles.ghostButton}                         |
| onPress={handleAIRender}\>                                            |
|                                                                       |
| \<Text style={styles.ghostButtonText}\>✨ AI Render\</Text\>          |
|                                                                       |
| \</TouchableOpacity\>                                                 |
|                                                                       |
| \</View\>                                                             |
|                                                                       |
| \</View\>                                                             |
|                                                                       |
| );                                                                    |
|                                                                       |
| }                                                                     |
|                                                                       |
| const styles = StyleSheet.create({                                    |
|                                                                       |
| container: { flex: 1, backgroundColor: \'#0B1729\' },                 |
|                                                                       |
| header: { flexDirection: \'row\', alignItems: \'center\',             |
| justifyContent: \'space-between\', paddingHorizontal: 16, paddingTop: |
| 56, paddingBottom: 12 },                                              |
|                                                                       |
| backBtn: { width: 40, height: 40, alignItems: \'center\',             |
| justifyContent: \'center\' },                                         |
|                                                                       |
| backText: { color: \'#FAF7F2\', fontSize: 24, fontWeight: \'300\' },  |
|                                                                       |
| title: { color: \'#FAF7F2\', fontSize: 20, fontWeight: \'600\' },     |
|                                                                       |
| styleBar: { maxHeight: 56, paddingVertical: 4 },                      |
|                                                                       |
| styleBarContent: { paddingHorizontal: 16, gap: 8 },                   |
|                                                                       |
| styleChip: { flexDirection: \'row\', alignItems: \'center\', gap: 6,  |
| paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,          |
| borderWidth: 1.5, borderColor: \'#2A3F5F\', backgroundColor:          |
| \'#0D1F35\' },                                                        |
|                                                                       |
| styleChipActive: { borderColor: \'#C9A84C\', backgroundColor:         |
| \'rgba(201,168,76,0.15)\' },                                          |
|                                                                       |
| styleEmoji: { fontSize: 14 },                                         |
|                                                                       |
| styleLabel: { color: \'#8A8070\', fontSize: 13, fontWeight: \'500\'   |
| },                                                                    |
|                                                                       |
| styleLabelActive: { color: \'#C9A84C\' },                             |
|                                                                       |
| canvasContainer: { flex: 1, backgroundColor: \'#0B1729\' },           |
|                                                                       |
| canvas: { flex: 1 },                                                  |
|                                                                       |
| errorFallback: { flex: 1, alignItems: \'center\', justifyContent:     |
| \'center\', backgroundColor: \'#0B1729\' },                           |
|                                                                       |
| errorText: { color: \'#8A8070\', fontSize: 14, textAlign: \'center\'  |
| },                                                                    |
|                                                                       |
| actionBar: { flexDirection: \'row\', gap: 12, padding: 16,            |
| paddingBottom: 34, backgroundColor: \'#0B1729\' },                    |
|                                                                       |
| goldButton: { flex: 1, backgroundColor: \'#C9A84C\', borderRadius:    |
| 14, paddingVertical: 14, alignItems: \'center\' },                    |
|                                                                       |
| goldButtonText: { color: \'#0B1729\', fontSize: 15, fontWeight:       |
| \'700\' },                                                            |
|                                                                       |
| ghostButton: { flex: 1, borderWidth: 1.5, borderColor: \'#C9A84C\',   |
| borderRadius: 14, paddingVertical: 14, alignItems: \'center\' },      |
|                                                                       |
| ghostButtonText: { color: \'#FAF7F2\', fontSize: 15, fontWeight:      |
| \'500\' },                                                            |
|                                                                       |
| });                                                                   |
+-----------------------------------------------------------------------+

**3.11 App.tsx Navigation Root**

File: \~/Desktop/cova/apps/mobile/App.tsx

+-----------------------------------------------------------------------+
| import React from \'react\';                                          |
|                                                                       |
| import { GestureHandlerRootView } from                                |
| \'react-native-gesture-handler\';                                     |
|                                                                       |
| import { NavigationContainer } from \'@react-navigation/native\';     |
|                                                                       |
| import { createNativeStackNavigator } from                            |
| \'@react-navigation/native-stack\';                                   |
|                                                                       |
| import { HomeScreen } from \'./src/screens/main/HomeScreen\';         |
|                                                                       |
| import { RoomViewer3DScreen } from                                    |
| \'./src/screens/main/RoomViewer3DScreen\';                            |
|                                                                       |
| import { RoomCalibrationScreen } from                                 |
| \'./src/screens/main/RoomCalibrationScreen\';                         |
|                                                                       |
| const Stack = createNativeStackNavigator();                           |
|                                                                       |
| export default function App() {                                       |
|                                                                       |
| return (                                                              |
|                                                                       |
| \<GestureHandlerRootView style={{ flex: 1 }}\>                        |
|                                                                       |
| \<NavigationContainer\>                                               |
|                                                                       |
| \<Stack.Navigator                                                     |
|                                                                       |
| initialRouteName=\'Home\'                                             |
|                                                                       |
| screenOptions={{ headerShown: false, animation: \'slide_from_right\'  |
| }}                                                                    |
|                                                                       |
| \>                                                                    |
|                                                                       |
| \<Stack.Screen name=\'Home\' component={HomeScreen} /\>               |
|                                                                       |
| \<Stack.Screen name=\'RoomCalibration\'                               |
| component={RoomCalibrationScreen} /\>                                 |
|                                                                       |
| \<Stack.Screen name=\'RoomViewer3D\' component={RoomViewer3DScreen}   |
| /\>                                                                   |
|                                                                       |
| \</Stack.Navigator\>                                                  |
|                                                                       |
| \</NavigationContainer\>                                              |
|                                                                       |
| \</GestureHandlerRootView\>                                           |
|                                                                       |
| );                                                                    |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

**3.12 Build for Physical iPhone --- Step-by-Step**

  --------- ------------------------------------------------------------------
   **!!!**  ALWAYS test on a physical iPhone. The iOS Simulator WebGL
            implementation is broken for Three.js shader compilation. Never
            use Expo Go --- expo-gl is a native module that Expo Go cannot
            load.

  --------- ------------------------------------------------------------------

15. Connect iPhone to Mac via USB cable

16. Unlock iPhone and trust the Mac if prompted

17. Enable Developer Mode: iPhone Settings \> Privacy & Security \>
    Developer Mode \> Toggle ON \> Restart

18. Open Terminal and start Metro: cd \~/Desktop/cova/apps/mobile && npx
    expo start \--clear

19. Open Xcode: open \~/Desktop/cova/apps/mobile/ios/Cova.xcworkspace

20. In Xcode: select your iPhone from the device dropdown at the top

21. In Xcode: go to Cova target \> Signing & Capabilities

22. Set Team to \'Pranav Goel (Personal Team)\'

23. REMOVE the Push Notifications capability (Personal Team cannot use
    it --- causes provisioning failure)

24. Press Cmd+R to build and run (first build takes 10-15 minutes)

25. App installs on iPhone automatically when build completes

**3.13 Verification Checklist**

  -------------------------------------------------------------
  **Test**            **Expected Result**          **Status**
  ------------------- ---------------------------- ------------
  App loads on iPhone 3D room visible with Japandi ✅ PASS
                      floor and walls              

  Tap Mid-Century     Scene switches to warm brown ✅ PASS
  style chip          tones without crash          

  Tap all 5 style     All switch without crash or  ✅ PASS
  chips               white screen                 

  Tap Save button     Permission prompt appears;   ✅ PASS
                      saves screenshot to Photos   

  Tap Reset button    Brief flash then scene       ✅ PASS
                      remounts                     

  Tap AI Render       Alert: \'Coming Soon - Phase ✅ PASS
  button              4\'                          
  -------------------------------------------------------------

**3.14 Commit Phase 3**

+-----------------------------------------------------------------------+
| cd \~/Desktop/cova                                                    |
|                                                                       |
| git add .                                                             |
|                                                                       |
| git commit -m \'Phase 3 complete --- 3D room engine on iPhone, style  |
| switching, screenshot save\'                                          |
|                                                                       |
| git push origin main                                                  |
|                                                                       |
| \# Daksh pulls on his Mac:                                            |
|                                                                       |
| cd \~/Desktop/cova                                                    |
|                                                                       |
| git pull origin main                                                  |
|                                                                       |
| pnpm install                                                          |
+-----------------------------------------------------------------------+

*COVA BUILD GUIDE v2.0 --- Phases 0--3 \| hellocova@gmail.com \|
ai.cova.app \| March 2026*
**COVA**

**Complete Build Guide --- Phases 4--9**

*All Cursor Prompts, Edge Function Code, Screen Code, Error Playbook \|
Version 2.0 \| March 2026*

This is Part 2. Read Part 1 (Phases 0-3) first.

**TABLE OF CONTENTS**

**PHASE 4: AI RENDERING PIPELINE**

  ---------- ------------------------------------------------------------
   **GOAL**  Build the Supabase Edge Functions for AI room rendering via
             Replicate SDXL + ControlNet. Wire the AI Render button in
             RoomViewer3DScreen to call the Edge Function. Tokens are
             deducted on each render.

  ---------- ------------------------------------------------------------

  --------- ------------------------------------------------------------------
   **!!!**  Phase 4 is backend only. No new UI screens. The AI Render button
            already exists --- Phase 4 makes it actually work. Verify Phases
            0-3 are complete and committed before starting.

  --------- ------------------------------------------------------------------

**4.1 Pre-Phase Checklist**

1.  Verify REPLICATE_API_TOKEN is active: curl -H \'Authorization: Token
    YOUR_TOKEN\' https://api.replicate.com/v1/account

2.  Verify ANTHROPIC_API_KEY is active: curl -H \'x-api-key: YOUR_KEY\'
    https://api.anthropic.com/v1/models

3.  Verify Supabase is linked: supabase status

4.  Apply for Wayfair Partner Network: partners.wayfair.com (2-4 week
    approval --- start now)

5.  Apply for Amazon Associates: affiliate-program.amazon.com

**4.2 Create Edge Functions**

+-----------------------------------------------------------------------+
| cd \~/Desktop/cova                                                    |
|                                                                       |
| supabase functions new render-room                                    |
|                                                                       |
| supabase functions new get-render-status                              |
|                                                                       |
| supabase functions new match-products                                 |
|                                                                       |
| supabase functions new chat-room                                      |
+-----------------------------------------------------------------------+

**4.3 Set Supabase Secrets**

+-----------------------------------------------------------------------+
| supabase secrets set REPLICATE_API_TOKEN=your_replicate_token         |
|                                                                       |
| supabase secrets set ANTHROPIC_API_KEY=your_anthropic_key             |
|                                                                       |
| \# Verify secrets are set                                             |
|                                                                       |
| supabase secrets list                                                 |
+-----------------------------------------------------------------------+

**4.4 render-room Edge Function**

File: \~/Desktop/cova/supabase/functions/render-room/index.ts

Write this file manually or use the Cursor prompt below. Deno runtime
--- no Node.js.

+-----------------------------------------------------------------------------------------+
| **CURSOR AGENT PROMPT --- render-room Edge Function**                                   |
+-----------------------------------------------------------------------------------------+
| \@BUILDGUIDE.md                                                                         |
|                                                                                         |
| Create supabase/functions/render-room/index.ts --- a Supabase Edge Function (Deno       |
| runtime).                                                                               |
|                                                                                         |
| This function is called when the user taps \'AI Render\' in the 3D viewer.              |
|                                                                                         |
| INPUT (JSON body):                                                                      |
|                                                                                         |
| room_id: string                                                                         |
|                                                                                         |
| style: CavaStyle                                                                        |
| (\'japandi\'\|\'midcentury\'\|\'coastal\'\|\'industrial\'\|\'bohemian\')                |
|                                                                                         |
| quality_tier: \'draft\' \| \'hd\'                                                       |
|                                                                                         |
| scene_snapshot_url: string \| null                                                      |
|                                                                                         |
| COMPLETE LOGIC:                                                                         |
|                                                                                         |
| 1\. Import Supabase client from npm:@supabase/supabase-js                               |
|                                                                                         |
| Use Deno.env.get(\'SUPABASE_URL\') and Deno.env.get(\'SUPABASE_SERVICE_ROLE_KEY\')      |
|                                                                                         |
| 2\. Get user from Authorization header JWT:                                             |
|                                                                                         |
| const { data: { user } } = await supabase.auth.getUser(token)                           |
|                                                                                         |
| Return 401 if no user.                                                                  |
|                                                                                         |
| 3\. Check token balance:                                                                |
|                                                                                         |
| draft costs 2 tokens, hd costs 3 tokens                                                 |
|                                                                                         |
| SELECT token_balance FROM users WHERE id = user.id                                      |
|                                                                                         |
| Return 402 with JSON { error: \'insufficient_tokens\', required: X, available: Y } if   |
| balance \< cost                                                                         |
|                                                                                         |
| 4\. Rate limiting:                                                                      |
|                                                                                         |
| COUNT renders WHERE user_id = user.id AND created_at \> NOW() - INTERVAL \'1 hour\'     |
|                                                                                         |
| Return 429 if count \>= 10                                                              |
|                                                                                         |
| 5\. Validate style is one of: japandi, midcentury, coastal, industrial, bohemian        |
|                                                                                         |
| Return 400 if invalid                                                                   |
|                                                                                         |
| 6\. Build style-specific SDXL prompt:                                                   |
|                                                                                         |
| const STYLE_PROMPTS = {                                                                 |
|                                                                                         |
| japandi: \'japandi interior design, minimal, warm oak wood, linen sofa, neutral tones,  |
| soft natural light, professional architectural photography, 8k photorealistic, interior |
| design magazine\',                                                                      |
|                                                                                         |
| midcentury: \'mid century modern interior, walnut furniture, mustard velvet, brass      |
| accents, warm golden hour light, Eames era aesthetic, 8k photorealistic\',              |
|                                                                                         |
| coastal: \'coastal interior design, white linen, bleached wood, ocean blue accents,     |
| bright airy natural light, serene beachy atmosphere, 8k photorealistic\',               |
|                                                                                         |
| industrial: \'industrial loft interior, exposed brick, dark leather sofa, steel pipe    |
| shelving, Edison bulbs, dramatic contrast lighting, 8k photorealistic\',                |
|                                                                                         |
| bohemian: \'bohemian eclectic interior, terracotta velvet, moroccan patterns, layered   |
| rugs, warm amber candlelight, lush plants everywhere, 8k photorealistic\',              |
|                                                                                         |
| }                                                                                       |
|                                                                                         |
| const NEGATIVE_PROMPT = \'blurry, low quality, distorted, ugly, bad proportions,        |
| watermark, cartoon, anime, painting, drawing\'                                          |
|                                                                                         |
| 7\. Call Replicate API:                                                                 |
|                                                                                         |
| POST https://api.replicate.com/v1/predictions                                           |
|                                                                                         |
| Authorization: Token \${Deno.env.get(\'REPLICATE_API_TOKEN\')}                          |
|                                                                                         |
| Body: {                                                                                 |
|                                                                                         |
| version:                                                                                |
| \'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b\', |
|                                                                                         |
| input: {                                                                                |
|                                                                                         |
| prompt: STYLE_PROMPTS\[style\],                                                         |
|                                                                                         |
| negative_prompt: NEGATIVE_PROMPT,                                                       |
|                                                                                         |
| num_inference_steps: quality_tier === \'hd\' ? 50 : 30,                                 |
|                                                                                         |
| guidance_scale: 7.5,                                                                    |
|                                                                                         |
| width: 1024,                                                                            |
|                                                                                         |
| height: 1024,                                                                           |
|                                                                                         |
| }                                                                                       |
|                                                                                         |
| }                                                                                       |
|                                                                                         |
| 8\. Insert job record:                                                                  |
|                                                                                         |
| INSERT INTO jobs (user_id, job_type, status, replicate_id, input_params)                |
|                                                                                         |
| VALUES (user.id, \'render\', \'processing\', prediction.id, { style, quality_tier })    |
|                                                                                         |
| 9\. Insert render record:                                                               |
|                                                                                         |
| INSERT INTO renders (room_id, user_id, style_applied, quality_tier, status,             |
| replicate_prediction_id, prompt_used, tokens_charged)                                   |
|                                                                                         |
| VALUES (room_id, user.id, style, quality_tier, \'processing\', prediction.id,           |
| STYLE_PROMPTS\[style\], tokenCost)                                                      |
|                                                                                         |
| 10\. Deduct tokens atomically:                                                          |
|                                                                                         |
| CALL deduct_tokens_atomic(user.id, tokenCost, \'render\_\' + render.id)                 |
|                                                                                         |
| 11\. Return 200:                                                                        |
|                                                                                         |
| { render_id: render.id, job_id: job.id, status: \'processing\', tokens_charged:         |
| tokenCost }                                                                             |
|                                                                                         |
| ERROR HANDLING:                                                                         |
|                                                                                         |
| \- Wrap entire function in try/catch                                                    |
|                                                                                         |
| \- If Replicate API returns error: mark render as failed, refund tokens via             |
| deduct_tokens_atomic with negative delta, return 503                                    |
|                                                                                         |
| \- If database insert fails: return 500                                                 |
|                                                                                         |
| \- All CORS headers: Access-Control-Allow-Origin: \*                                    |
|                                                                                         |
| \- Handle OPTIONS preflight                                                             |
|                                                                                         |
| Report when complete.                                                                   |
+-----------------------------------------------------------------------------------------+

**4.5 get-render-status Edge Function**

File: \~/Desktop/cova/supabase/functions/get-render-status/index.ts

+------------------------------------------------------------------------------------+
| **CURSOR AGENT PROMPT --- get-render-status Edge Function**                        |
+------------------------------------------------------------------------------------+
| \@BUILDGUIDE.md                                                                    |
|                                                                                    |
| Create supabase/functions/get-render-status/index.ts (Deno runtime).               |
|                                                                                    |
| This function is polled by the mobile app to check if an AI render is complete.    |
|                                                                                    |
| INPUT (query params): render_id, job_id                                            |
|                                                                                    |
| COMPLETE LOGIC:                                                                    |
|                                                                                    |
| 1\. Authenticate user via Authorization header JWT                                 |
|                                                                                    |
| 2\. Fetch render from renders table WHERE id = render_id AND user_id = user.id     |
|                                                                                    |
| Return 404 if not found                                                            |
|                                                                                    |
| 3\. If render.status === \'complete\': return immediately:                         |
|                                                                                    |
| { status: \'complete\', image_url: render.image_url, render_id }                   |
|                                                                                    |
| 4\. If render.status === \'failed\': return:                                       |
|                                                                                    |
| { status: \'failed\', error: \'Render failed. Tokens have been refunded.\' }       |
|                                                                                    |
| 5\. Poll Replicate for current status:                                             |
|                                                                                    |
| GET https://api.replicate.com/v1/predictions/\${render.replicate_prediction_id}    |
|                                                                                    |
| Authorization: Token \${Deno.env.get(\'REPLICATE_API_TOKEN\')}                     |
|                                                                                    |
| 6\. If Replicate status === \'succeeded\':                                         |
|                                                                                    |
| a\. Download the output image URL (prediction.output\[0\])                         |
|                                                                                    |
| b\. Upload to Supabase Storage renders bucket as {user_id}/{render_id}.jpg:        |
|                                                                                    |
| const { data } = await supabase.storage.from(\'renders\')                          |
|                                                                                    |
| .upload(\`\${user.id}/\${render_id}.jpg\`, imageBlob, { contentType:               |
| \'image/jpeg\' })                                                                  |
|                                                                                    |
| c\. Get public URL:                                                                |
|                                                                                    |
| const { data: urlData } =                                                          |
| supabase.storage.from(\'renders\').getPublicUrl(\`\${user.id}/\${render_id}.jpg\`) |
|                                                                                    |
| d\. UPDATE renders SET status=\'complete\', image_url=urlData.publicUrl WHERE      |
| id=render_id                                                                       |
|                                                                                    |
| e\. UPDATE jobs SET status=\'complete\', result_url=urlData.publicUrl,             |
| completed_at=NOW() WHERE id=job_id                                                 |
|                                                                                    |
| f\. Return: { status: \'complete\', image_url: urlData.publicUrl, render_id }      |
|                                                                                    |
| 7\. If Replicate status === \'failed\':                                            |
|                                                                                    |
| a\. UPDATE renders SET status=\'failed\' WHERE id=render_id                        |
|                                                                                    |
| b\. UPDATE jobs SET status=\'failed\', error_message=prediction.error WHERE        |
| id=job_id                                                                          |
|                                                                                    |
| c\. Refund tokens: INSERT INTO token_transactions (user_id, delta, reason)         |
|                                                                                    |
| with delta = +render.tokens_charged and reason = \'refund_failed_render\_\' +      |
| render_id                                                                          |
|                                                                                    |
| AND UPDATE users SET token_balance = token_balance + render.tokens_charged         |
|                                                                                    |
| d\. Return: { status: \'failed\', error: \'Render failed. Tokens refunded.\' }     |
|                                                                                    |
| 8\. If Replicate still processing:                                                 |
|                                                                                    |
| Return: { status: \'processing\', estimated_seconds_remaining: 15 }                |
|                                                                                    |
| CORS headers on all responses. Handle OPTIONS preflight.                           |
|                                                                                    |
| Report when complete.                                                              |
+------------------------------------------------------------------------------------+

**4.6 match-products Edge Function**

File: \~/Desktop/cova/supabase/functions/match-products/index.ts

+-----------------------------------------------------------------------+
| **CURSOR AGENT PROMPT --- match-products Edge Function**              |
+-----------------------------------------------------------------------+
| \@BUILDGUIDE.md                                                       |
|                                                                       |
| Create supabase/functions/match-products/index.ts (Deno runtime).     |
|                                                                       |
| This function matches a rendered room image to real products using    |
| style tags                                                            |
|                                                                       |
| (CLIP embedding matching requires the embeddings to be populated,     |
| which happens                                                         |
|                                                                       |
| after Wayfair API access is approved. For now use style_tags          |
| fallback).                                                            |
|                                                                       |
| INPUT (JSON body): render_id, style (CavaStyle), limit (default 10)   |
|                                                                       |
| LOGIC:                                                                |
|                                                                       |
| 1\. Authenticate user via Authorization header JWT                    |
|                                                                       |
| 2\. Fetch render by render_id to get style_applied                    |
|                                                                       |
| 3\. Try CLIP embedding match first:                                   |
|                                                                       |
| const { data: products } = await                                      |
| supabase.rpc(\'search_products_by_embedding\', {                      |
|                                                                       |
| query_embedding: render.clip_embedding, // may be null                |
|                                                                       |
| match_count: limit,                                                   |
|                                                                       |
| style_filter: style                                                   |
|                                                                       |
| })                                                                    |
|                                                                       |
| 4\. If no clip_embedding on render (null), fall back to style_tags    |
| match:                                                                |
|                                                                       |
| const { data: products } = await supabase                             |
|                                                                       |
| .from(\'products\')                                                   |
|                                                                       |
| .select(\'\*\')                                                       |
|                                                                       |
| .contains(\'style_tags\', \[style\])                                  |
|                                                                       |
| .order(\'price\', { ascending: true })                                |
|                                                                       |
| .limit(limit)                                                         |
|                                                                       |
| 5\. Insert into room_products junction for each matched product:      |
|                                                                       |
| INSERT INTO room_products (room_id, render_id, product_id)            |
|                                                                       |
| (fetch room_id from renders table)                                    |
|                                                                       |
| 6\. Deduct 1 token via deduct_tokens_atomic                           |
|                                                                       |
| 7\. Return: { products: Product\[\], tokens_charged: 1 }              |
|                                                                       |
| CORS headers. Report when complete.                                   |
+-----------------------------------------------------------------------+

**4.7 Deploy Edge Functions**

+-----------------------------------------------------------------------+
| cd \~/Desktop/cova                                                    |
|                                                                       |
| supabase functions deploy render-room                                 |
|                                                                       |
| supabase functions deploy get-render-status                           |
|                                                                       |
| supabase functions deploy match-products                              |
|                                                                       |
| \# Verify deployment in Supabase Dashboard \> Edge Functions          |
|                                                                       |
| \# All three should show green status                                 |
+-----------------------------------------------------------------------+

**4.8 Test Edge Functions with curl**

+-----------------------------------------------------------------------------+
| \# Get your anon key from Supabase Dashboard \> Settings \> API             |
|                                                                             |
| ANON_KEY=your_anon_key                                                      |
|                                                                             |
| PROJECT_URL=https://xdeacbmkdwqrwxonqaqh.supabase.co                        |
|                                                                             |
| \# Test render-room (will return 401 without a real JWT --- that is         |
| expected)                                                                   |
|                                                                             |
| curl -X POST \$PROJECT_URL/functions/v1/render-room \\                      |
|                                                                             |
| -H \'Authorization: Bearer \$ANON_KEY\' \\                                  |
|                                                                             |
| -H \'Content-Type: application/json\' \\                                    |
|                                                                             |
| -d                                                                          |
| \'{\"room_id\":\"test\",\"style\":\"japandi\",\"quality_tier\":\"draft\"}\' |
|                                                                             |
| \# Expected: { error: \'Unauthorized\' } or { error:                        |
| \'insufficient_tokens\' }                                                   |
|                                                                             |
| \# NOT a 500 error                                                          |
+-----------------------------------------------------------------------------+

**4.9 Wire AI Render Button in RoomViewer3DScreen**

+-----------------------------------------------------------------------------+
| **CURSOR AGENT PROMPT --- Wire AI Render Button to Edge Function**          |
+-----------------------------------------------------------------------------+
| \@BUILDGUIDE.md                                                             |
|                                                                             |
| Update apps/mobile/src/screens/main/RoomViewer3DScreen.tsx                  |
|                                                                             |
| Replace the handleAIRender function (currently shows \'Coming Soon\' alert) |
|                                                                             |
| with a real implementation that calls the render-room Edge Function.        |
|                                                                             |
| The updated handleAIRender should:                                          |
|                                                                             |
| 1\. Check token balance from Zustand store:                                 |
|                                                                             |
| const { tokenBalance, deductTokens } = useCovaStore()                       |
|                                                                             |
| const tokenCost = quality === \'draft\' ? 2 : 3                             |
|                                                                             |
| If tokenBalance \< tokenCost: show Alert \'Not enough tokens\'              |
|                                                                             |
| 2\. Get current user and room from Zustand store                            |
|                                                                             |
| If no user: show Alert \'Please sign in\'                                   |
|                                                                             |
| If no room or no room.id: create a room record first:                       |
|                                                                             |
| INSERT INTO rooms (user_id) --- then use the returned id                    |
|                                                                             |
| 3\. Get Supabase session JWT:                                               |
|                                                                             |
| const { data: { session } } = await supabase.auth.getSession()              |
|                                                                             |
| 4\. Show loading state: setIsRendering(true) --- add isRendering state      |
|                                                                             |
| Disable the AI Render button and show a gold ActivityIndicator              |
|                                                                             |
| 5\. Call render-room Edge Function:                                         |
|                                                                             |
| const response = await fetch(                                               |
|                                                                             |
| \'https://xdeacbmkdwqrwxonqaqh.supabase.co/functions/v1/render-room\',      |
|                                                                             |
| {                                                                           |
|                                                                             |
| method: \'POST\',                                                           |
|                                                                             |
| headers: {                                                                  |
|                                                                             |
| \'Content-Type\': \'application/json\',                                     |
|                                                                             |
| \'Authorization\': \`Bearer \${session.access_token}\`,                     |
|                                                                             |
| },                                                                          |
|                                                                             |
| body: JSON.stringify({                                                      |
|                                                                             |
| room_id: room.id,                                                           |
|                                                                             |
| style: activeStyle,                                                         |
|                                                                             |
| quality_tier: \'draft\',                                                    |
|                                                                             |
| })                                                                          |
|                                                                             |
| }                                                                           |
|                                                                             |
| )                                                                           |
|                                                                             |
| const data = await response.json()                                          |
|                                                                             |
| 6\. If response.ok: deductTokens(tokenCost) in Zustand                      |
|                                                                             |
| Start polling get-render-status every 3 seconds:                            |
|                                                                             |
| const pollInterval = setInterval(async () =\> {                             |
|                                                                             |
| const statusResp = await fetch(                                             |
|                                                                             |
| \'https://xdeacbmkdwqrwxonqaqh.supabase.co/functions/v1/get-render-status\' |
| +                                                                           |
|                                                                             |
| \'?render_id=\' + data.render_id + \'&job_id=\' + data.job_id,              |
|                                                                             |
| { headers: { \'Authorization\': \`Bearer \${session.access_token}\` } }     |
|                                                                             |
| )                                                                           |
|                                                                             |
| const statusData = await statusResp.json()                                  |
|                                                                             |
| if (statusData.status === \'complete\') {                                   |
|                                                                             |
| clearInterval(pollInterval)                                                 |
|                                                                             |
| setIsRendering(false)                                                       |
|                                                                             |
| // Navigate to AI render result screen (Phase 6)                            |
|                                                                             |
| // For now: Alert showing image URL                                         |
|                                                                             |
| Alert.alert(\'Render complete!\', \'Image: \' + statusData.image_url)       |
|                                                                             |
| } else if (statusData.status === \'failed\') {                              |
|                                                                             |
| clearInterval(pollInterval)                                                 |
|                                                                             |
| setIsRendering(false)                                                       |
|                                                                             |
| Alert.alert(\'Render failed\', \'Tokens have been refunded.\')              |
|                                                                             |
| }                                                                           |
|                                                                             |
| }, 3000)                                                                    |
|                                                                             |
| 7\. If response not ok: show error Alert, setIsRendering(false)             |
|                                                                             |
| Add a rendering overlay on top of the 3D canvas when isRendering is true:   |
|                                                                             |
| Semi-transparent navy overlay (#0B1729 at 80% opacity)                      |
|                                                                             |
| Centered gold ActivityIndicator                                             |
|                                                                             |
| Text \'Generating your design\...\' in cream                                |
|                                                                             |
| Text showing current style: \'Japandi Style\' in gold                       |
|                                                                             |
| All styles via StyleSheet.create. All errors handled with try/catch.        |
|                                                                             |
| Report when complete.                                                       |
+-----------------------------------------------------------------------------+

**4.10 Phase 4 Verification**

  -----------------------------------------------------------------------
  **Test**         **Expected**              **How to Test**
  ---------------- ------------------------- ----------------------------
  render-room      Green status in Supabase  supabase functions list
  deploys          Dashboard \> Edge         
                   Functions                 

  Edge Functions   401 Unauthorized (not     curl test from Section 4.8
  respond          500)                      

  AI Render button Gold spinner +            Tap button on iPhone
  shows loading    \'Generating\...\'        
                   overlay                   

  Tokens deducted  Balance decreases by 2 in Check Dashboard \> users
                   Zustand + Supabase        table

  Poll stops on    Alert showing image URL   Wait 15-30s after tapping
  complete                                   button

  Render saved to  Image in                  Check Supabase Dashboard \>
  Storage          renders/{user_id}/ bucket Storage \> renders
  -----------------------------------------------------------------------

**4.11 Commit Phase 4**

+-----------------------------------------------------------------------+
| cd \~/Desktop/cova                                                    |
|                                                                       |
| git add .                                                             |
|                                                                       |
| git commit -m \'Phase 4 complete --- render-room, get-render-status,  |
| match-products Edge Functions deployed\'                              |
|                                                                       |
| git push origin main                                                  |
+-----------------------------------------------------------------------+

**PHASE 5: CLAUDE CHATBOT EDGE FUNCTION**

  ---------- ------------------------------------------------------------
   **GOAL**  Build the chat-room Edge Function that powers the Claude
             chatbot. Each message costs 2 tokens (with re-render) or 1
             token (text only). Claude has full context of the room,
             style, and render.

  ---------- ------------------------------------------------------------

**5.1 chat-room Edge Function**

File: \~/Desktop/cova/supabase/functions/chat-room/index.ts

+-------------------------------------------------------------------------+
| **CURSOR AGENT PROMPT --- chat-room Edge Function --- Complete          |
| Implementation**                                                        |
+-------------------------------------------------------------------------+
| \@BUILDGUIDE.md                                                         |
|                                                                         |
| Create supabase/functions/chat-room/index.ts (Deno runtime).            |
|                                                                         |
| INPUT (JSON body):                                                      |
|                                                                         |
| room_id: string                                                         |
|                                                                         |
| message: string (user\'s message to Claude)                             |
|                                                                         |
| chat_session_id: string \| null (null = start new session)              |
|                                                                         |
| render_id: string \| null (current render being edited)                 |
|                                                                         |
| COMPLETE LOGIC:                                                         |
|                                                                         |
| 1\. Authenticate via JWT. Return 401 if no user.                        |
|                                                                         |
| 2\. Check token balance \>= 1. Return 402 if insufficient.              |
|                                                                         |
| 3\. Rate limit: max 30 chat messages per user per hour.                 |
|                                                                         |
| COUNT from rate_limit_events WHERE user_id = user.id                    |
|                                                                         |
| AND event_type = \'chat\' AND created_at \> NOW() - INTERVAL \'1 hour\' |
|                                                                         |
| Return 429 if \>= 30                                                    |
|                                                                         |
| 4\. Fetch or create chat session:                                       |
|                                                                         |
| If chat_session_id provided: SELECT \* FROM chat_sessions WHERE id =    |
| chat_session_id AND user_id = user.id                                   |
|                                                                         |
| If null: INSERT INTO chat_sessions (room_id, user_id, render_id,        |
| messages, total_messages)                                               |
|                                                                         |
| VALUES (room_id, user.id, render_id, \'\[\]\', 0)                       |
|                                                                         |
| 5\. Context compression if total_messages \> 20:                        |
|                                                                         |
| Call Claude API with system: \'Summarize this interior design           |
| conversation in 200 words.\',                                           |
|                                                                         |
| user: JSON.stringify(session.messages)                                  |
|                                                                         |
| Store result in session.summary                                         |
|                                                                         |
| Reset session.messages = \[\]                                           |
|                                                                         |
| Reset session.total_messages = 0                                        |
|                                                                         |
| 6\. Fetch room and render for context:                                  |
|                                                                         |
| SELECT \* FROM rooms WHERE id = room_id                                 |
|                                                                         |
| SELECT \* FROM renders WHERE id = render_id (if provided)               |
|                                                                         |
| 7\. Build Claude system prompt:                                         |
|                                                                         |
| const systemPrompt = \`You are Cova\'s interior design AI assistant.    |
|                                                                         |
| Current room: \${room.room_dimensions?.width_ft \|\| 14}ft wide x       |
| \${room.room_dimensions?.depth_ft \|\| 12}ft deep x                     |
| \${room.room_dimensions?.height_ft \|\| 9}ft high.                      |
|                                                                         |
| Current style: \${room.scene_state?.style \|\| \'japandi\'}.            |
|                                                                         |
| \${session.summary ? \'Previous conversation summary: \' +              |
| session.summary : \'\'}                                                 |
|                                                                         |
| You are an expert interior designer helping the user perfect their      |
| room.                                                                   |
|                                                                         |
| When you want to suggest triggering a new AI render, include            |
| \[ACTION:RENDER\] in your response.                                     |
|                                                                         |
| When you recommend a specific product, include \[PRODUCT:product_name\] |
| in your response.                                                       |
|                                                                         |
| Keep responses concise (2-3 sentences max) and design-focused.          |
|                                                                         |
| Always be specific and actionable.\`                                    |
|                                                                         |
| 8\. Build messages array for Claude:                                    |
|                                                                         |
| const messages = \[                                                     |
|                                                                         |
| \...session.messages.map(m =\> ({ role: m.role, content: m.content })), |
|                                                                         |
| { role: \'user\', content: message }                                    |
|                                                                         |
| \]                                                                      |
|                                                                         |
| 9\. Call Anthropic API:                                                 |
|                                                                         |
| POST https://api.anthropic.com/v1/messages                              |
|                                                                         |
| Headers:                                                                |
|                                                                         |
| x-api-key: \${Deno.env.get(\'ANTHROPIC_API_KEY\')}                      |
|                                                                         |
| anthropic-version: 2023-06-01                                           |
|                                                                         |
| content-type: application/json                                          |
|                                                                         |
| Body:                                                                   |
|                                                                         |
| model: \'claude-sonnet-4-6\'                                            |
|                                                                         |
| max_tokens: 400                                                         |
|                                                                         |
| system: systemPrompt                                                    |
|                                                                         |
| messages: messages                                                      |
|                                                                         |
| 10\. Parse Claude response text from response.content\[0\].text         |
|                                                                         |
| 11\. Check for action tags in response:                                 |
|                                                                         |
| const shouldRender = claudeResponse.includes(\'\[ACTION:RENDER\]\')     |
|                                                                         |
| const productMatches =                                                  |
| \[\...claudeResponse.matchAll(/\\\[PRODUCT:(\[\^\\\]\]+)\\\]/g)\].map(m |
| =\> m\[1\])                                                             |
|                                                                         |
| const cleanResponse = claudeResponse.replace(/\\\[ACTION:RENDER\\\]/g,  |
| \'\').replace(/\\\[PRODUCT:\[\^\\\]\]+\\\]/g, \'\').trim()              |
|                                                                         |
| 12\. If shouldRender: call render-room function internally (or return   |
| trigger signal):                                                        |
|                                                                         |
| triggerRender = true --- the mobile app will call render-room after     |
| receiving this response                                                 |
|                                                                         |
| 13\. Append message pair to session.messages:                           |
|                                                                         |
| const newMessages = \[                                                  |
|                                                                         |
| \...session.messages,                                                   |
|                                                                         |
| { role: \'user\', content: message, timestamp: new Date().toISOString() |
| },                                                                      |
|                                                                         |
| { role: \'assistant\', content: cleanResponse, timestamp: new           |
| Date().toISOString(), render_id: null }                                 |
|                                                                         |
| \]                                                                      |
|                                                                         |
| UPDATE chat_sessions SET messages = newMessages, total_messages =       |
| total_messages + 1 WHERE id = session.id                                |
|                                                                         |
| 14\. Deduct tokens:                                                     |
|                                                                         |
| tokenCost = shouldRender ? 2 : 1                                        |
|                                                                         |
| CALL deduct_tokens_atomic(user.id, tokenCost, \'chat\_\' + session.id)  |
|                                                                         |
| 15\. Insert rate_limit_event:                                           |
|                                                                         |
| INSERT INTO rate_limit_events (user_id, event_type) VALUES (user.id,    |
| \'chat\')                                                               |
|                                                                         |
| 16\. Return:                                                            |
|                                                                         |
| {                                                                       |
|                                                                         |
| response: cleanResponse,                                                |
|                                                                         |
| chat_session_id: session.id,                                            |
|                                                                         |
| should_render: triggerRender,                                           |
|                                                                         |
| product_suggestions: productMatches,                                    |
|                                                                         |
| tokens_charged: tokenCost                                               |
|                                                                         |
| }                                                                       |
|                                                                         |
| All errors: try/catch, CORS headers, OPTIONS preflight.                 |
|                                                                         |
| Report when complete.                                                   |
+-------------------------------------------------------------------------+

**5.2 Deploy chat-room**

+-----------------------------------------------------------------------+
| supabase functions deploy chat-room                                   |
|                                                                       |
| \# Test with curl (expects 401 without real JWT):                     |
|                                                                       |
| curl -X POST                                                          |
| https://xdeacbmkdwqrwxonqaqh.supabase.co/functions/v1/chat-room \\    |
|                                                                       |
| -H \'Content-Type: application/json\' \\                              |
|                                                                       |
| -d \'{\"room_id\":\"test\",\"message\":\"make the sofa blue\"}\'      |
+-----------------------------------------------------------------------+

**5.3 Commit Phase 5**

  -----------------------------------------------------------------------
  git add . && git commit -m \'Phase 5 complete --- chat-room Edge
  Function deployed\' && git push origin main

  -----------------------------------------------------------------------

**PHASE 6: FULL MOBILE APP SCREENS**

  ---------- ------------------------------------------------------------
     **V0    Every screen in Phase 6 MUST be designed in V0 (v0.dev) and
    RULE**   approved by BOTH Pranav and Daksh before running any Cursor
             prompt. See V0 prompts in Section 6.1.

  ---------- ------------------------------------------------------------

  --------- ------------------------------------------------------------------
   **!!!**  Phase 6 is the largest phase. Do one screen at a time. Get V0
            approval, run Cursor prompt, test on iPhone, commit. Never batch
            multiple screens in one Cursor session.

  --------- ------------------------------------------------------------------

**6.1 V0 Design Prompts**

Paste these prompts into v0.dev, approve the output, THEN run the
matching Cursor prompt.

**V0 Prompt: Splash Screen**

+-----------------------------------------------------------------------+
| Create a React Native splash screen component.                        |
|                                                                       |
| Full navy background #0B1729.                                         |
|                                                                       |
| Centered COVA logo text: 64pt bold, gold color #C9A84C.               |
|                                                                       |
| Fade-in animation using react-native-reanimated FadeIn.               |
|                                                                       |
| Subtitle \'Design your room in minutes\' in cream #FAF7F2, 18pt,      |
| below logo.                                                           |
|                                                                       |
| No buttons. No interaction. Clean premium aesthetic.                  |
+-----------------------------------------------------------------------+

**V0 Prompt: Auth Screen**

+-----------------------------------------------------------------------+
| Create a React Native auth screen.                                    |
|                                                                       |
| Navy background #0B1729.                                              |
|                                                                       |
| COVA logo at top center, gold #C9A84C, 48pt bold.                     |
|                                                                       |
| Email text input: cream background #FAF7F2, navy text, 12px border    |
| radius,                                                               |
|                                                                       |
| gold border #C9A84C on focus, \'Email address\' placeholder in muted  |
| #8A8070.                                                              |
|                                                                       |
| Password input: same styling, show/hide eye toggle in gold.           |
|                                                                       |
| Primary button \'Sign In\': gold background #C9A84C, navy text        |
| #0B1729, 14px radius.                                                 |
|                                                                       |
| Secondary button \'Create Account\': gold border 1.5px, transparent   |
| bg, cream text.                                                       |
|                                                                       |
| \'Continue with Apple\' button: white background, black Apple logo,   |
| dark text.                                                            |
|                                                                       |
| Error message in red #EF5350 below inputs when present.               |
|                                                                       |
| Gold ActivityIndicator when loading, all inputs disabled.             |
+-----------------------------------------------------------------------+

**V0 Prompt: Onboarding Swipe Screen**

+-----------------------------------------------------------------------+
| Create a React Native Tinder-style swipe card component for room      |
| style discovery.                                                      |
|                                                                       |
| Navy background #0B1729.                                              |
|                                                                       |
| Gold progress bar at top: \'X of 20\' label in cream 13pt.            |
|                                                                       |
| Card: 85vw wide, 65vh tall, borderRadius 24px, overflow hidden.       |
|                                                                       |
| Top 75% of card: room photograph image, covers full width.            |
|                                                                       |
| Bottom 25%: dark navy #0D1F35 background, room style name in gold     |
| 22pt bold,                                                            |
|                                                                       |
| centered vertically.                                                  |
|                                                                       |
| Card stack effect: current card + 1 card slightly behind and scaled   |
| down.                                                                 |
|                                                                       |
| Swipe left = dislike (spring animation moving card left off screen).  |
|                                                                       |
| Swipe right = like (spring animation moving card right off screen).   |
|                                                                       |
| Bottom buttons: X circle in red, heart circle in gold, 64px diameter. |
|                                                                       |
| \'Skip for now\' text button top right in muted #8A8070.              |
|                                                                       |
| PanResponder for gesture detection. Reanimated for animations.        |
+-----------------------------------------------------------------------+

**V0 Prompt: Room Upload Screen**

+-----------------------------------------------------------------------+
| Create a React Native room upload screen.                             |
|                                                                       |
| Navy background #0B1729.                                              |
|                                                                       |
| Header \'Add Your Room\' in cream #FAF7F2, 24pt semibold.             |
|                                                                       |
| Camera preview area: 90% width, 50% height, rounded 16px corners,     |
|                                                                       |
| dark navy border, camera icon if permission not granted.              |
|                                                                       |
| Two large buttons stacked:                                            |
|                                                                       |
| 1\. Gold button \'Take Photo\' with camera SF symbol icon             |
|                                                                       |
| 2\. Ghost button \'Choose from Library\' with photo SF symbol icon    |
|                                                                       |
| Below: \'Recent rooms\' label in muted 14pt.                          |
|                                                                       |
| Horizontal scroll of 4 room thumbnail cards: 100x100, rounded 12px,   |
| navy bg.                                                              |
|                                                                       |
| Upload progress bar in gold when uploading (0-100%).                  |
|                                                                       |
| All text in cream or gold on navy background. Clean spacing.          |
+-----------------------------------------------------------------------+

**V0 Prompt: 3D Viewer with Furniture Panel**

+-----------------------------------------------------------------------+
| Create a React Native 3D room viewer screen layout (no actual 3D ---  |
| just the UI frame).                                                   |
|                                                                       |
| Navy background #0B1729.                                              |
|                                                                       |
| Top: horizontal scrollable style chip row.                            |
|                                                                       |
| Each chip: emoji + style name, borderRadius 20px, navy border.        |
|                                                                       |
| Active chip: gold border #C9A84C, rgba(201,168,76,0.15) background.   |
|                                                                       |
| 5 chips: Japandi, Mid-Century, Coastal, Industrial, Bohemian.         |
|                                                                       |
| Middle: dark navy rectangle placeholder for Three.js Canvas.          |
|                                                                       |
| Bottom selected furniture panel (shows when furniture is tapped):     |
|                                                                       |
| Slides up from bottom with spring animation.                          |
|                                                                       |
| Cream panel, rounded top corners 20px.                                |
|                                                                       |
| Furniture name in navy 18pt bold.                                     |
|                                                                       |
| \'Drag to move • Pinch to scale\' hint in muted 12pt.                 |
|                                                                       |
| Red ghost button \'Remove\'.                                          |
|                                                                       |
| Action bar at very bottom:                                            |
|                                                                       |
| GoldButton \'Save\', GhostButton \'Reset\', GhostButton \'✨ AI       |
| Render\'.                                                             |
|                                                                       |
| Token badge top right: gold pill with coin icon + balance number.     |
+-----------------------------------------------------------------------+

**V0 Prompt: AI Render Result Screen**

+-----------------------------------------------------------------------+
| Create a React Native AI render result screen.                        |
|                                                                       |
| Navy background #0B1729.                                              |
|                                                                       |
| Top 50% of screen: room render image with rounded bottom corners      |
| 24px.                                                                 |
|                                                                       |
| Share button (iOS share icon) top right in gold.                      |
|                                                                       |
| \'Regenerate\' ghost button below image with refresh icon.            |
|                                                                       |
| Loading shimmer animation when render is processing.                  |
|                                                                       |
| Middle: \'Matched Products\' label in cream 18pt bold.                |
|                                                                       |
| Horizontal scrollable ProductCard list.                               |
|                                                                       |
| Each card: 120x120 image, product name 13pt cream, price 15pt gold    |
| bold,                                                                 |
|                                                                       |
| retailer badge (wayfair=purple, amazon=orange, ikea=blue), small gold |
| \'Add\' button.                                                       |
|                                                                       |
| Bottom chat interface:                                                |
|                                                                       |
| Scrollable chat messages above input.                                 |
|                                                                       |
| User messages: right-aligned, gold background bubble, navy text.      |
|                                                                       |
| Claude messages: left-aligned, cream bubble, navy text.               |
|                                                                       |
| Input bar: rounded navy bg, cream placeholder \'Edit this             |
| design\...\',                                                         |
|                                                                       |
| gold circular send button.                                            |
|                                                                       |
| \'1 token per message\' hint in muted 11pt.                           |
|                                                                       |
| TokenBadge top right in header.                                       |
+-----------------------------------------------------------------------+

**6.2 Design System Components**

+-----------------------------------------------------------------------+
| **CURSOR AGENT PROMPT --- Cova Design System Components**             |
+-----------------------------------------------------------------------+
| \@BUILDGUIDE.md                                                       |
|                                                                       |
| Create the Cova design system in apps/mobile/src/components/ui/       |
|                                                                       |
| Create these files --- ALL with StyleSheet.create, NO inline styles:  |
|                                                                       |
| 1\. GoldButton.tsx                                                    |
|                                                                       |
| Props: { title: string; onPress: () =\> void; disabled?: boolean;     |
| loading?: boolean; style?: ViewStyle }                                |
|                                                                       |
| Styles: backgroundColor #C9A84C, borderRadius 14, paddingVertical 16, |
| paddingHorizontal 24                                                  |
|                                                                       |
| Text: color #0B1729, fontSize 15, fontWeight \'700\'                  |
|                                                                       |
| Loading: show ActivityIndicator color=\'#0B1729\' instead of text     |
|                                                                       |
| Disabled: opacity 0.5, pointerEvents \'none\'                         |
|                                                                       |
| 2\. GhostButton.tsx                                                   |
|                                                                       |
| Props: same as GoldButton                                             |
|                                                                       |
| Styles: borderWidth 1.5, borderColor #C9A84C, borderRadius 14, bg     |
| transparent                                                           |
|                                                                       |
| Text: color #FAF7F2, fontSize 15, fontWeight \'500\'                  |
|                                                                       |
| 3\. TokenBadge.tsx                                                    |
|                                                                       |
| Props: none --- reads from useCovaStore().tokenBalance                |
|                                                                       |
| Shows: coin emoji + tokenBalance number                               |
|                                                                       |
| Styles: borderWidth 1, borderColor #C9A84C, borderRadius 20,          |
|                                                                       |
| backgroundColor rgba(201,168,76,0.12), paddingHorizontal 12,          |
| paddingVertical 6                                                     |
|                                                                       |
| Text: color #C9A84C, fontSize 13, fontWeight \'600\'                  |
|                                                                       |
| If balance \< 5: show yellow warning color #F0A500                    |
|                                                                       |
| 4\. StyleChip.tsx                                                     |
|                                                                       |
| Props: { id: CavaStyle; label: string; emoji: string; isActive:       |
| boolean; onPress: () =\> void }                                       |
|                                                                       |
| Active: borderColor #C9A84C, backgroundColor rgba(201,168,76,0.15)    |
|                                                                       |
| Inactive: borderColor #2A3F5F, backgroundColor #0D1F35                |
|                                                                       |
| Layout: row, emoji + label, borderRadius 20, borderWidth 1.5          |
|                                                                       |
| 5\. ProductCard.tsx                                                   |
|                                                                       |
| Props: { product: Product; onAddToRoom?: () =\> void; onBuy?: () =\>  |
| void }                                                                |
|                                                                       |
| (import Product type from \@cova/shared)                              |
|                                                                       |
| Image: 120x120, borderRadius 12, backgroundColor #0D1F35              |
|                                                                       |
| Name: cream, 13pt, numberOfLines 2                                    |
|                                                                       |
| Price: gold, 15pt bold (format as \'\$X.XX\')                         |
|                                                                       |
| Retailer badge: small pill --- wayfair=#7B61FF, amazon=#FF9900,       |
| ikea=#0057A8, cb2=#1A1A1A                                             |
|                                                                       |
| Add button: small GoldButton \'Add\'                                  |
|                                                                       |
| onBuy: open affiliate_url_base via Linking.openURL()                  |
|                                                                       |
| 6\. Toast.tsx                                                         |
|                                                                       |
| Props: { message: string; type: \'success\'\|\'error\'\|\'info\';     |
| visible: boolean; onHide: () =\> void }                               |
|                                                                       |
| Slides in from bottom, auto-dismisses after 3 seconds                 |
|                                                                       |
| success: green bg #4CAF50, error: red bg #EF5350, info: navy bg with  |
| gold border                                                           |
|                                                                       |
| Text: white, 14pt                                                     |
|                                                                       |
| This replaces ALL Alert.alert() calls before App Store submission     |
|                                                                       |
| 7\. index.ts --- export all components                                |
|                                                                       |
| Report when all 7 files are created.                                  |
+-----------------------------------------------------------------------+

**6.3 Splash + Auth Screens**

+-----------------------------------------------------------------------+
| **CURSOR AGENT PROMPT --- Splash and Auth Screens**                   |
+-----------------------------------------------------------------------+
| \@BUILDGUIDE.md                                                       |
|                                                                       |
| Create apps/mobile/src/screens/auth/SplashScreen.tsx                  |
|                                                                       |
| Logic:                                                                |
|                                                                       |
| \- On mount: call supabase.auth.getSession()                          |
|                                                                       |
| \- If session exists: navigate to \'Home\' after 300ms                |
|                                                                       |
| \- If no session: animate logo in (FadeIn 600ms), then navigate to    |
| \'Auth\' after 2 seconds                                              |
|                                                                       |
| \- Centered COVA text 64pt gold, subtitle cream 18pt, navy background |
|                                                                       |
| \- Use Reanimated FadeIn for logo animation                           |
|                                                                       |
| Create apps/mobile/src/screens/auth/AuthScreen.tsx                    |
|                                                                       |
| State: email, password, isLoading, error, mode                        |
| (\'signin\'\|\'signup\')                                              |
|                                                                       |
| Sign In logic:                                                        |
|                                                                       |
| const { error } = await supabase.auth.signInWithPassword({ email,     |
| password })                                                           |
|                                                                       |
| On success: fetch user from users table, call setUser() in Zustand,   |
| navigate to \'Home\'                                                  |
|                                                                       |
| Sign Up logic:                                                        |
|                                                                       |
| const { error } = await supabase.auth.signUp({ email, password })     |
|                                                                       |
| On success: show \'Check your email to confirm\' message              |
|                                                                       |
| Validation:                                                           |
|                                                                       |
| \- Email must contain @                                               |
|                                                                       |
| \- Password must be 8+ characters                                     |
|                                                                       |
| \- Show field-level error messages                                    |
|                                                                       |
| After sign in, sync token balance to Zustand:                         |
|                                                                       |
| const { data: user } = await                                          |
| supabase.from(\'users\').select(\'token_balance\').single()           |
|                                                                       |
| setTokenBalance(user.token_balance)                                   |
|                                                                       |
| Update App.tsx to:                                                    |
|                                                                       |
| \- Check session on startup                                           |
|                                                                       |
| \- Show Splash as initial screen                                      |
|                                                                       |
| \- Auth stack: Splash -\> Auth                                        |
|                                                                       |
| \- Main stack: Home -\> RoomCalibration -\> RoomViewer3D -\> AIRender |
|                                                                       |
| \- If authenticated: go to Main stack; if not: go to Auth stack       |
|                                                                       |
| All styles via StyleSheet.create. Match V0 design approved above.     |
|                                                                       |
| Report when complete.                                                 |
+-----------------------------------------------------------------------+

**6.4 Onboarding Swipe Screen**

+------------------------------------------------------------------------+
| **CURSOR AGENT PROMPT --- Onboarding Swipe Screen --- Style            |
| Fingerprint**                                                          |
+------------------------------------------------------------------------+
| \@BUILDGUIDE.md                                                        |
|                                                                        |
| Create apps/mobile/src/screens/onboarding/OnboardingSwipeScreen.tsx    |
|                                                                        |
| SWIPE CARD DATA --- use these Unsplash image URLs:                     |
|                                                                        |
| const SWIPE_CARDS = \[                                                 |
|                                                                        |
| { id: \'japandi_1\', style: \'japandi\', label: \'Japandi\', imageUrl: |
| \'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800\' |
| },                                                                     |
|                                                                        |
| { id: \'japandi_2\', style: \'japandi\', label: \'Japandi\', imageUrl: |
| \'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800\' }, |
|                                                                        |
| { id: \'midcentury_1\', style: \'midcentury\', label: \'Mid-Century\', |
| imageUrl:                                                              |
| \'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800\' }, |
|                                                                        |
| { id: \'midcentury_2\', style: \'midcentury\', label: \'Mid-Century\', |
| imageUrl:                                                              |
| \'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800\' |
| },                                                                     |
|                                                                        |
| { id: \'coastal_1\', style: \'coastal\', label: \'Coastal\', imageUrl: |
| \'https://images.unsplash.com/photo-1484101403633-562f891dc89a?w=800\' |
| },                                                                     |
|                                                                        |
| { id: \'coastal_2\', style: \'coastal\', label: \'Coastal\', imageUrl: |
| \'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800\' |
| },                                                                     |
|                                                                        |
| { id: \'industrial_1\', style: \'industrial\', label: \'Industrial\',  |
| imageUrl:                                                              |
| \'https://images.unsplash.com/photo-1565538810643-b5bdb714032a?w=800\' |
| },                                                                     |
|                                                                        |
| { id: \'industrial_2\', style: \'industrial\', label: \'Industrial\',  |
| imageUrl:                                                              |
| \'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?w=800\' |
| },                                                                     |
|                                                                        |
| { id: \'bohemian_1\', style: \'bohemian\', label: \'Bohemian\',        |
| imageUrl:                                                              |
| \'https://images.unsplash.com/photo-1567016432779-094069958ea5?w=800\' |
| },                                                                     |
|                                                                        |
| { id: \'bohemian_2\', style: \'bohemian\', label: \'Bohemian\',        |
| imageUrl:                                                              |
| \'https://images.unsplash.com/photo-1617103996702-96ff29b1c467?w=800\' |
| },                                                                     |
|                                                                        |
| // Add 10 more covering all 5 styles (2 more per style)                |
|                                                                        |
| \]                                                                     |
|                                                                        |
| GESTURE DETECTION:                                                     |
|                                                                        |
| \- Use PanResponder for swipe gestures                                 |
|                                                                        |
| \- Right swipe (dx \> 80): like --- direction = \'right\'              |
|                                                                        |
| \- Left swipe (dx \< -80): dislike --- direction = \'left\'            |
|                                                                        |
| \- Record dwell_ms = Date.now() - cardShownAt for each swipe           |
|                                                                        |
| \- Reanimated Animated.Value for card position and rotation            |
|                                                                        |
| \- Spring animation: card flies off screen on swipe                    |
|                                                                        |
| \- Next card scales up from 0.95 to 1.0 as current card leaves         |
|                                                                        |
| DATA RECORDING:                                                        |
|                                                                        |
| \- On each swipe, INSERT into swipe_history (user_id, card_id,         |
| direction, dwell_ms)                                                   |
|                                                                        |
| \- Track counts: styleLikes\[style\] = count of right swipes per style |
|                                                                        |
| STYLE FINGERPRINT COMPUTATION (after all cards shown OR after 12       |
| right-swipes):                                                         |
|                                                                        |
| const computeFingerprint = (likes: Record\<CavaStyle, number\>):       |
| StyleFingerprint =\> {                                                 |
|                                                                        |
| const sorted = Object.entries(likes).sort((a,b) =\> b\[1\]-a\[1\])     |
|                                                                        |
| return {                                                               |
|                                                                        |
| top_styles: sorted.filter((\[,v\]) =\> v \> 0).map((\[k\]) =\> k as    |
| CavaStyle),                                                            |
|                                                                        |
| color_palette: \[\], // populated from liked room colors (V2)          |
|                                                                        |
| density_preference: \'balanced\', // V2: inferred from card metadata   |
|                                                                        |
| material_preference: \'wood\', // V2: inferred                         |
|                                                                        |
| swipe_count: totalSwipes,                                              |
|                                                                        |
| confidence_score: Math.min(totalSwipes / 12, 1.0),                     |
|                                                                        |
| }                                                                      |
|                                                                        |
| }                                                                      |
|                                                                        |
| SAVE FINGERPRINT:                                                      |
|                                                                        |
| await supabase.from(\'users\').update({ style_fingerprint: fingerprint |
| }).eq(\'id\', user.id)                                                 |
|                                                                        |
| Update Zustand: setUser({ \...user, style_fingerprint: fingerprint })  |
|                                                                        |
| NAVIGATION:                                                            |
|                                                                        |
| \- After all cards OR skip tapped: navigate to \'Home\'                |
|                                                                        |
| All styles via StyleSheet.create. Match V0 design approved above.      |
|                                                                        |
| Report when complete.                                                  |
+------------------------------------------------------------------------+

**6.5 Room Upload Screen**

+-----------------------------------------------------------------------+
| **CURSOR AGENT PROMPT --- Room Upload Screen**                        |
+-----------------------------------------------------------------------+
| \@BUILDGUIDE.md                                                       |
|                                                                       |
| Create apps/mobile/src/screens/main/RoomUploadScreen.tsx              |
|                                                                       |
| PERMISSIONS:                                                          |
|                                                                       |
| \- Request camera permission on mount:                                |
| Camera.requestCameraPermissionsAsync()                                |
|                                                                       |
| \- Request media library permission on mount:                         |
| MediaLibrary.requestPermissionsAsync()                                |
|                                                                       |
| TAKE PHOTO:                                                           |
|                                                                       |
| \- Use expo-camera CameraView component                               |
|                                                                       |
| \- Ref: const cameraRef = useRef(null)                                |
|                                                                       |
| \- On \'Take Photo\' button: const photo = await                      |
| cameraRef.current.takePictureAsync()                                  |
|                                                                       |
| CHOOSE FROM LIBRARY:                                                  |
|                                                                       |
| \- const result = await ImagePicker.launchImageLibraryAsync({         |
| mediaTypes: \[\'images\'\], quality: 0.8 })                           |
|                                                                       |
| ON PHOTO SELECTED (both paths):                                       |
|                                                                       |
| 1\. Show upload progress (setProgress(0 to 100))                      |
|                                                                       |
| 2\. Upload to Supabase Storage room-uploads bucket:                   |
|                                                                       |
| const fileName = \`\${user.id}/\${Date.now()}.jpg\`                   |
|                                                                       |
| const { error } = await                                               |
| supabase.storage.from(\'room-uploads\').upload(fileName, { uri:       |
| photoUri, type: \'image/jpeg\' })                                     |
|                                                                       |
| 3\. Get public URL:                                                   |
| supabase.storage.from(\'room-uploads\').getPublicUrl(fileName)        |
|                                                                       |
| 4\. Create room record in Supabase:                                   |
|                                                                       |
| const { data: room } = await supabase.from(\'rooms\')                 |
|                                                                       |
| .insert({ user_id: user.id, original_image_url: publicUrl })          |
|                                                                       |
| .select().single()                                                    |
|                                                                       |
| 5\. Update Zustand: setActiveRoom(room)                               |
|                                                                       |
| 6\. Navigate to \'RoomCalibration\' with params: { room_id: room.id,  |
| image_url: publicUrl }                                                |
|                                                                       |
| RECENT ROOMS (bottom of screen):                                      |
|                                                                       |
| \- Fetch last 5 rooms for user from Supabase on mount                 |
|                                                                       |
| \- Show as horizontal scroll of thumbnail cards                       |
|                                                                       |
| \- Tap a recent room: navigate directly to RoomViewer3D               |
|                                                                       |
| Error handling: show Toast component on any failure.                  |
|                                                                       |
| All styles via StyleSheet.create. Match V0 design approved above.     |
|                                                                       |
| Report when complete.                                                 |
+-----------------------------------------------------------------------+

**6.6 Room Calibration Screen --- Restyle**

+-----------------------------------------------------------------------+
| **CURSOR AGENT PROMPT --- Room Calibration Screen --- V0 Restyle**    |
+-----------------------------------------------------------------------+
| \@BUILDGUIDE.md                                                       |
|                                                                       |
| The RoomCalibrationScreen.tsx already exists but has basic styling.   |
|                                                                       |
| Restyle it to match the V0-approved design while keeping all existing |
| logic.                                                                |
|                                                                       |
| ONLY change styles. Do not change any logic, PanResponder handlers,   |
|                                                                       |
| corner handle positions, or dimension state.                          |
|                                                                       |
| Style changes to make:                                                |
|                                                                       |
| 1\. Background: #0B1729 navy                                          |
|                                                                       |
| 2\. Corner handles: gold circles #C9A84C, 20px radius, white stroke   |
| 2px                                                                   |
|                                                                       |
| 3\. Connecting polygon: gold dashed lines between corners             |
|                                                                       |
| 4\. Overlay: semi-transparent #0B1729 at 40% opacity outside polygon  |
|                                                                       |
| 5\. Bottom sheet: cream background #FAF7F2, top border radius 20px    |
|                                                                       |
| 6\. Dimension labels: navy text, gold value text, gold +/- buttons    |
|                                                                       |
| 7\. CTA button: GoldButton from design system with \'View My Room in  |
| 3D\'                                                                  |
|                                                                       |
| 8\. Handle labels (TL, TR, BL, BR): white 10pt text centered in       |
| handle                                                                |
|                                                                       |
| Import GoldButton from ../../components/ui                            |
|                                                                       |
| All styles via StyleSheet.create.                                     |
|                                                                       |
| Report when complete.                                                 |
+-----------------------------------------------------------------------+

**6.7 Re-enable FurniturePiece in 3D Viewer**

+-----------------------------------------------------------------------+
| **CURSOR AGENT PROMPT --- Re-enable FurniturePiece in                 |
| RoomViewer3DScreen**                                                  |
+-----------------------------------------------------------------------+
| \@BUILDGUIDE.md                                                       |
|                                                                       |
| FurniturePiece.tsx exists at                                          |
| apps/mobile/src/components/3d/FurniturePiece.tsx                      |
|                                                                       |
| but is NOT currently rendered in RoomViewer3DScreen.tsx.              |
|                                                                       |
| Add it back now that the base scene is stable.                        |
|                                                                       |
| In apps/mobile/src/screens/main/RoomViewer3DScreen.tsx:               |
|                                                                       |
| 1\. Add imports at top:                                               |
|                                                                       |
| import { FurniturePiece } from                                        |
| \'../../components/3d/FurniturePiece\';                               |
|                                                                       |
| import { FURNITURE_CATALOG, STYLE_DEFAULT_FURNITURE } from            |
| \'../../data/furnitureCatalog\';                                      |
|                                                                       |
| import type { PlacedFurniture } from \'@cova/shared\';                |
|                                                                       |
| 2\. Add state inside the component:                                   |
|                                                                       |
| const \[furniture, setFurniture\] =                                   |
| useState\<PlacedFurniture\[\]\>(\[\]);                                |
|                                                                       |
| const \[selectedFurnitureId, setSelectedFurnitureId\] =               |
| useState\<string \| null\>(null);                                     |
|                                                                       |
| 3\. Add buildDefaultFurniture function:                               |
|                                                                       |
| const buildDefaultFurniture = (style: CavaStyle): PlacedFurniture\[\] |
| =\> {                                                                 |
|                                                                       |
| const keys = STYLE_DEFAULT_FURNITURE\[style\] \|\| \[\];              |
|                                                                       |
| return keys.map((key, index) =\> ({                                   |
|                                                                       |
| id: key + \'\_\' + Date.now() + \'\_\' + index,                       |
|                                                                       |
| model_key: key,                                                       |
|                                                                       |
| position: FURNITURE_CATALOG\[key\]?.default_position \|\| \[0, 0,     |
| 0\],                                                                  |
|                                                                       |
| rotation_y: FURNITURE_CATALOG\[key\]?.default_rotation_y \|\| 0,      |
|                                                                       |
| style,                                                                |
|                                                                       |
| }));                                                                  |
|                                                                       |
| };                                                                    |
|                                                                       |
| 4\. Initialize furniture on mount and update on style change:         |
|                                                                       |
| useEffect(() =\> {                                                    |
|                                                                       |
| setFurniture(buildDefaultFurniture(activeStyle));                     |
|                                                                       |
| setSelectedFurnitureId(null);                                         |
|                                                                       |
| }, \[activeStyle\]);                                                  |
|                                                                       |
| 5\. Inside the Canvas component (after BoxRoom and SceneLighting):    |
|                                                                       |
| {furniture.map(piece =\> {                                            |
|                                                                       |
| const catalogItem = FURNITURE_CATALOG\[piece.model_key\];             |
|                                                                       |
| if (!catalogItem) return null;                                        |
|                                                                       |
| return (                                                              |
|                                                                       |
| \<FurniturePiece                                                      |
|                                                                       |
| key={piece.id}                                                        |
|                                                                       |
| piece={piece}                                                         |
|                                                                       |
| catalogItem={catalogItem}                                             |
|                                                                       |
| isSelected={selectedFurnitureId === piece.id}                         |
|                                                                       |
| onSelect={() =\> setSelectedFurnitureId(piece.id)}                    |
|                                                                       |
| onDragEnd={(pos) =\> setFurniture(prev =\> prev.map(p =\>             |
|                                                                       |
| p.id === piece.id ? { \...p, position: pos } : p                      |
|                                                                       |
| ))}                                                                   |
|                                                                       |
| style={activeStyle}                                                   |
|                                                                       |
| /\>                                                                   |
|                                                                       |
| );                                                                    |
|                                                                       |
| })}                                                                   |
|                                                                       |
| 6\. Update handleReset to also reset furniture:                       |
|                                                                       |
| const handleReset = useCallback(() =\> {                              |
|                                                                       |
| setFurniture(buildDefaultFurniture(activeStyle));                     |
|                                                                       |
| setSelectedFurnitureId(null);                                         |
|                                                                       |
| setSceneKey(prev =\> prev + 1);                                       |
|                                                                       |
| }, \[activeStyle\]);                                                  |
|                                                                       |
| 7\. Add selected furniture info panel below the Canvas:               |
|                                                                       |
| {selectedFurnitureId && (() =\> {                                     |
|                                                                       |
| const piece = furniture.find(f =\> f.id === selectedFurnitureId);     |
|                                                                       |
| const item = piece && FURNITURE_CATALOG\[piece.model_key\];           |
|                                                                       |
| if (!piece \|\| !item) return null;                                   |
|                                                                       |
| return (                                                              |
|                                                                       |
| \<View style={styles.furniturePanel}\>                                |
|                                                                       |
| \<Text style={styles.furnitureName}\>{item.name}\</Text\>             |
|                                                                       |
| \<Text style={styles.furnitureHint}\>Drag to move\</Text\>            |
|                                                                       |
| \<TouchableOpacity onPress={() =\> {                                  |
|                                                                       |
| setFurniture(prev =\> prev.filter(f =\> f.id !==                      |
| selectedFurnitureId));                                                |
|                                                                       |
| setSelectedFurnitureId(null);                                         |
|                                                                       |
| }}\>                                                                  |
|                                                                       |
| \<Text style={styles.removeText}\>Remove\</Text\>                     |
|                                                                       |
| \</TouchableOpacity\>                                                 |
|                                                                       |
| \</View\>                                                             |
|                                                                       |
| );                                                                    |
|                                                                       |
| })()}                                                                 |
|                                                                       |
| Add to StyleSheet: furniturePanel, furnitureName, furnitureHint,      |
| removeText                                                            |
|                                                                       |
| Panel styles: cream bg #FAF7F2, navy text, borderTopLeftRadius 16,    |
| borderTopRightRadius 16                                               |
|                                                                       |
| IMPORTANT: If any specific GLB model causes a crash after adding,     |
| remove its key                                                        |
|                                                                       |
| from STYLE_DEFAULT_FURNITURE for that style. Test each style on       |
| physical iPhone.                                                      |
|                                                                       |
| Report when complete.                                                 |
+-----------------------------------------------------------------------+

**6.8 AI Render Result Screen**

+-----------------------------------------------------------------------+
| **CURSOR AGENT PROMPT --- AIRenderScreen --- Full Implementation**    |
+-----------------------------------------------------------------------+
| \@BUILDGUIDE.md                                                       |
|                                                                       |
| Create apps/mobile/src/screens/main/AIRenderScreen.tsx                |
|                                                                       |
| Route params: { render_id: string, room_id: string, style: CavaStyle  |
| }                                                                     |
|                                                                       |
| STATE:                                                                |
|                                                                       |
| \- renderUrl: string \| null (null = loading)                         |
|                                                                       |
| \- products: Product\[\] (from match-products Edge Function)          |
|                                                                       |
| \- chatMessages: ChatMessage\[\]                                      |
|                                                                       |
| \- chatInput: string                                                  |
|                                                                       |
| \- chatSessionId: string \| null                                      |
|                                                                       |
| \- isSendingMessage: boolean                                          |
|                                                                       |
| \- isMatchingProducts: boolean                                        |
|                                                                       |
| ON MOUNT:                                                             |
|                                                                       |
| 1\. Poll get-render-status every 3 seconds until status ===           |
| \'complete\'                                                          |
|                                                                       |
| Set renderUrl when complete                                           |
|                                                                       |
| 2\. After render is complete, call match-products Edge Function:      |
|                                                                       |
| POST                                                                  |
| https://xdeacbmkdwqrwxonqaqh.supabase.co/functions/v1/match-products  |
|                                                                       |
| Body: { render_id, style }                                            |
|                                                                       |
| Set products from response                                            |
|                                                                       |
| CHAT SEND:                                                            |
|                                                                       |
| 1\. Append user message to chatMessages immediately                   |
|                                                                       |
| 2\. Set isSendingMessage = true                                       |
|                                                                       |
| 3\. POST to chat-room Edge Function:                                  |
|                                                                       |
| Body: { room_id, message: chatInput, chat_session_id: chatSessionId,  |
| render_id }                                                           |
|                                                                       |
| 4\. On response: append Claude response to chatMessages               |
|                                                                       |
| 5\. If response.should_render: show \'Generating new render\...\' and |
| call render-room                                                      |
|                                                                       |
| 6\. Update chatSessionId if new session created                       |
|                                                                       |
| 7\. Deduct tokens in Zustand: deductTokens(response.tokens_charged)   |
|                                                                       |
| 8\. Show Toast: response.tokens_charged === 2 ? \'2 tokens used\' :   |
| \'1 token used\'                                                      |
|                                                                       |
| PRODUCT CARD TAP:                                                     |
|                                                                       |
| \- Open product.affiliate_url_base via Linking.openURL()              |
|                                                                       |
| \- INSERT into click_events (user_id, product_id, render_id)          |
|                                                                       |
| SHARE RENDER:                                                         |
|                                                                       |
| \- Use Share.share({ url: renderUrl, message: \'My room designed with |
| Cova\' })                                                             |
|                                                                       |
| LOW TOKEN WARNING:                                                    |
|                                                                       |
| \- If tokenBalance \< 5: show yellow warning banner \'Low tokens ---  |
| tap to refill\'                                                       |
|                                                                       |
| \- Banner navigates to TokenShop screen                               |
|                                                                       |
| LAYOUT (matches V0-approved design):                                  |
|                                                                       |
| \- Top 50%: render image with shimmer loading state                   |
|                                                                       |
| \- Share button top right                                             |
|                                                                       |
| \- Product cards horizontal scroll                                    |
|                                                                       |
| \- Chat messages scrollable                                           |
|                                                                       |
| \- Chat input at bottom with send button                              |
|                                                                       |
| All styles via StyleSheet.create. Use design system components.       |
|                                                                       |
| Report when complete.                                                 |
+-----------------------------------------------------------------------+

**6.9 Profile Screen**

+-----------------------------------------------------------------------+
| **CURSOR AGENT PROMPT --- Profile Screen**                            |
+-----------------------------------------------------------------------+
| \@BUILDGUIDE.md                                                       |
|                                                                       |
| Create apps/mobile/src/screens/main/ProfileScreen.tsx                 |
|                                                                       |
| Data to show (fetch from Supabase on mount):                          |
|                                                                       |
| \- User email                                                         |
|                                                                       |
| \- Token balance (from Zustand + real-time from users table)          |
|                                                                       |
| \- Style Fingerprint top styles (from user.style_fingerprint)         |
|                                                                       |
| \- Render count (SELECT COUNT(\*) FROM renders WHERE user_id =        |
| user.id)                                                              |
|                                                                       |
| \- Last 5 renders as thumbnail grid                                   |
|                                                                       |
| Buttons:                                                              |
|                                                                       |
| \- \'Get More Tokens\' GoldButton -\> navigate to \'TokenShop\'       |
|                                                                       |
| \- \'Sign Out\' GhostButton -\> supabase.auth.signOut(), clear        |
| Zustand, navigate to \'Auth\'                                         |
|                                                                       |
| Layout:                                                               |
|                                                                       |
| \- Navy background                                                    |
|                                                                       |
| \- User avatar placeholder (first letter of email in gold circle)     |
|                                                                       |
| \- Email in cream 16pt                                                |
|                                                                       |
| \- TokenBadge component showing balance                               |
|                                                                       |
| \- \'Your Style: Japandi, Coastal\' in cream 14pt (from top_styles)   |
|                                                                       |
| \- Render grid 2-columns                                              |
|                                                                       |
| All styles via StyleSheet.create. Report when complete.               |
+-----------------------------------------------------------------------+

**6.10 Update Navigation**

+-----------------------------------------------------------------------+
| **CURSOR AGENT PROMPT --- Update App.tsx Navigation for All Screens** |
+-----------------------------------------------------------------------+
| \@BUILDGUIDE.md                                                       |
|                                                                       |
| Update apps/mobile/App.tsx to include all new screens.                |
|                                                                       |
| Import all new screens:                                               |
|                                                                       |
| \- SplashScreen from ./src/screens/auth/SplashScreen                  |
|                                                                       |
| \- AuthScreen from ./src/screens/auth/AuthScreen                      |
|                                                                       |
| \- OnboardingSwipeScreen from                                         |
| ./src/screens/onboarding/OnboardingSwipeScreen                        |
|                                                                       |
| \- HomeScreen from ./src/screens/main/HomeScreen                      |
|                                                                       |
| \- RoomUploadScreen from ./src/screens/main/RoomUploadScreen          |
|                                                                       |
| \- RoomCalibrationScreen from                                         |
| ./src/screens/main/RoomCalibrationScreen                              |
|                                                                       |
| \- RoomViewer3DScreen from ./src/screens/main/RoomViewer3DScreen      |
|                                                                       |
| \- AIRenderScreen from ./src/screens/main/AIRenderScreen              |
|                                                                       |
| \- ProfileScreen from ./src/screens/main/ProfileScreen                |
|                                                                       |
| Create two stacks:                                                    |
|                                                                       |
| AuthStack (shown when not authenticated):                             |
|                                                                       |
| Splash (initial) -\> Auth -\> OnboardingSwipe                         |
|                                                                       |
| MainStack (shown when authenticated):                                 |
|                                                                       |
| Home (initial) -\> RoomUpload -\> RoomCalibration -\> RoomViewer3D    |
| -\> AIRender -\> Profile                                              |
|                                                                       |
| Root Navigator logic:                                                 |
|                                                                       |
| \- Use useState for isAuthenticated                                   |
|                                                                       |
| \- On mount: check supabase.auth.getSession()                         |
|                                                                       |
| \- Subscribe to supabase.auth.onAuthStateChange()                     |
|                                                                       |
| \- Show AuthStack if not authenticated, MainStack if authenticated    |
|                                                                       |
| All stack screens: headerShown: false, animation:                     |
| \'slide_from_right\'                                                  |
|                                                                       |
| GestureHandlerRootView wraps everything.                              |
|                                                                       |
| Report when complete.                                                 |
+-----------------------------------------------------------------------+

**6.11 PanResponder Orbit Controls**

OrbitControls crashes React Native. Implement camera orbit via
PanResponder:

+-----------------------------------------------------------------------+
| **CURSOR AGENT PROMPT --- Custom Camera Orbit via PanResponder**      |
+-----------------------------------------------------------------------+
| \@BUILDGUIDE.md                                                       |
|                                                                       |
| Add touch-based camera orbit to RoomViewer3DScreen.tsx.               |
|                                                                       |
| DO NOT use OrbitControls --- it crashes with \'touchAction of         |
| undefined\' on React Native.                                          |
|                                                                       |
| Add this to the RoomViewer3DScreen component:                         |
|                                                                       |
| 1\. Add camera state:                                                 |
|                                                                       |
| const \[cameraAzimuth, setCameraAzimuth\] = useState(0);              |
|                                                                       |
| const \[cameraElevation, setCameraElevation\] = useState(0.6);        |
|                                                                       |
| const panStartRef = useRef({ azimuth: 0, elevation: 0 });             |
|                                                                       |
| const lastTouchRef = useRef\<{ x: number; y: number } \|              |
| null\>(null);                                                         |
|                                                                       |
| 2\. Create PanResponder:                                              |
|                                                                       |
| const panResponder = useRef(PanResponder.create({                     |
|                                                                       |
| onStartShouldSetPanResponder: () =\> true,                            |
|                                                                       |
| onMoveShouldSetPanResponder: () =\> true,                             |
|                                                                       |
| onPanResponderGrant: () =\> {                                         |
|                                                                       |
| panStartRef.current = { azimuth: cameraAzimuth, elevation:            |
| cameraElevation };                                                    |
|                                                                       |
| },                                                                    |
|                                                                       |
| onPanResponderMove: (\_, gestureState) =\> {                          |
|                                                                       |
| const newAzimuth = panStartRef.current.azimuth + gestureState.dx \*   |
| 0.008;                                                                |
|                                                                       |
| const newElevation = Math.max(0.1, Math.min(                          |
|                                                                       |
| Math.PI / 2.2,                                                        |
|                                                                       |
| panStartRef.current.elevation - gestureState.dy \* 0.008              |
|                                                                       |
| ));                                                                   |
|                                                                       |
| setCameraAzimuth(newAzimuth);                                         |
|                                                                       |
| setCameraElevation(newElevation);                                     |
|                                                                       |
| },                                                                    |
|                                                                       |
| })).current;                                                          |
|                                                                       |
| 3\. Create CameraController component (inside the Canvas):            |
|                                                                       |
| function CameraController({ azimuth, elevation }: { azimuth: number;  |
| elevation: number }) {                                                |
|                                                                       |
| const { camera } = useThree();                                        |
|                                                                       |
| const radius = 8;                                                     |
|                                                                       |
| useFrame(() =\> {                                                     |
|                                                                       |
| camera.position.x = radius \* Math.sin(azimuth) \*                    |
| Math.cos(elevation);                                                  |
|                                                                       |
| camera.position.y = radius \* Math.sin(elevation);                    |
|                                                                       |
| camera.position.z = radius \* Math.cos(azimuth) \*                    |
| Math.cos(elevation);                                                  |
|                                                                       |
| camera.lookAt(0, 1.5, 0);                                             |
|                                                                       |
| });                                                                   |
|                                                                       |
| return null;                                                          |
|                                                                       |
| }                                                                     |
|                                                                       |
| 4\. Add CameraController inside the Canvas:                           |
|                                                                       |
| \<CameraController azimuth={cameraAzimuth}                            |
| elevation={cameraElevation} /\>                                       |
|                                                                       |
| 5\. Apply panResponder.panHandlers to the ViewShot (canvas            |
| container):                                                           |
|                                                                       |
| \<ViewShot ref={viewShotRef} style={styles.canvasContainer}           |
|                                                                       |
| {\...panResponder.panHandlers}\>                                      |
|                                                                       |
| Report when complete. Test orbit gesture on physical iPhone.          |
+-----------------------------------------------------------------------+

**6.12 Phase 6 Commit**

  -----------------------------------------------------------------------
  git add . && git commit -m \'Phase 6 complete --- all mobile screens,
  furniture enabled, orbit controls\' && git push origin main

  -----------------------------------------------------------------------

**PHASE 7: REALTOR TOOLS**

  ---------- ------------------------------------------------------------
   **GOAL**  Realtors create listings with multiple AI renders, share via
             QR code, and track which style buyers vote for at open
             houses.

  ---------- ------------------------------------------------------------

**7.1 Install QR Code Library**

+-----------------------------------------------------------------------+
| cd \~/Desktop/cova/apps/mobile                                        |
|                                                                       |
| pnpm add react-native-qrcode-svg                                      |
+-----------------------------------------------------------------------+

**7.2 Realtor Screens**

+-----------------------------------------------------------------------+
| **CURSOR AGENT PROMPT --- Realtor Listing System --- Mobile Screens** |
+-----------------------------------------------------------------------+
| \@BUILDGUIDE.md                                                       |
|                                                                       |
| Create apps/mobile/src/screens/realtor/ directory with these screens. |
|                                                                       |
| All screens: navy background, Cova design system, StyleSheet.create.  |
|                                                                       |
| 1\. CreateListingScreen.tsx                                           |
|                                                                       |
| Form fields: address (TextInput), description (TextInput multiline)   |
|                                                                       |
| \'Select Rooms\' section: shows user\'s existing rooms from Supabase  |
| as a list                                                             |
|                                                                       |
| On submit:                                                            |
|                                                                       |
| INSERT INTO listings (realtor_id, address, description,               |
| shareable_slug)                                                       |
|                                                                       |
| shareable_slug is auto-generated by DB default                        |
|                                                                       |
| After insert: fetch listing with generated slug                       |
|                                                                       |
| Generate QR code URL: \'https://cova.app/listing/\' + slug            |
|                                                                       |
| UPDATE listings SET qr_code_url = qrUrl WHERE id = listing.id         |
|                                                                       |
| Show QR code using QRCode component from react-native-qrcode-svg      |
|                                                                       |
| Show shareable link with copy button                                  |
|                                                                       |
| GoldButton \'Share Listing\' -\> Share.share({ url:                   |
| \'https://cova.app/listing/\' + slug })                               |
|                                                                       |
| 2\. ListingDashboardScreen.tsx                                        |
|                                                                       |
| Fetch all listings WHERE realtor_id = user.id                         |
|                                                                       |
| For each listing: show address, vote counts as a simple bar chart     |
| (react-native View widths)                                            |
|                                                                       |
| Vote counts: { japandi: 5, coastal: 3, \... } from                    |
| listings.vote_counts                                                  |
|                                                                       |
| Show total votes                                                      |
|                                                                       |
| GhostButton \'View Listing\' -\> opens browser with listing URL       |
|                                                                       |
| 3\. Add realtor navigation:                                           |
|                                                                       |
| If user.account_type === \'realtor\': show \'Listings\' tab in        |
| navigation                                                            |
|                                                                       |
| Otherwise: show \'Upgrade to Realtor\' option in Profile              |
|                                                                       |
| Report when complete.                                                 |
+-----------------------------------------------------------------------+

**7.3 Public Voting Page --- Next.js**

+-----------------------------------------------------------------------+
| **CURSOR AGENT PROMPT --- Public Listing Voting Page --- Next.js**    |
+-----------------------------------------------------------------------+
| \@BUILDGUIDE.md                                                       |
|                                                                       |
| Create apps/web/src/app/listing/\[slug\]/page.tsx in the Next.js app. |
|                                                                       |
| This is a PUBLIC page --- no authentication required for viewers.     |
|                                                                       |
| FETCH LISTING:                                                        |
|                                                                       |
| const { data: listing } = await supabase                              |
|                                                                       |
| .from(\'listings\')                                                   |
|                                                                       |
| .select(\'\*, rooms(\*)\')                                            |
|                                                                       |
| .eq(\'shareable_slug\', params.slug)                                  |
|                                                                       |
| .eq(\'is_published\', true)                                           |
|                                                                       |
| .single()                                                             |
|                                                                       |
| DISPLAY:                                                              |
|                                                                       |
| \- Address as H1                                                      |
|                                                                       |
| \- Description paragraph                                              |
|                                                                       |
| \- Grid of render images from the listing\'s rooms                    |
|                                                                       |
| \- Each render: image + style label + vote count + \'Vote for this    |
| style\' button                                                        |
|                                                                       |
| VOTING LOGIC:                                                         |
|                                                                       |
| \- On vote: generate device fingerprint (use crypto.randomUUID()      |
| stored in localStorage)                                               |
|                                                                       |
| \- POST to Supabase: INSERT INTO votes (listing_id, style_voted,      |
| device_fingerprint)                                                   |
|                                                                       |
| Handle UNIQUE constraint error (already voted) gracefully             |
|                                                                       |
| \- UPDATE listings.vote_counts using Supabase Realtime subscription   |
|                                                                       |
| REAL-TIME VOTE UPDATES:                                               |
|                                                                       |
| supabase.channel(\'listing-votes\')                                   |
|                                                                       |
| .on(\'postgres_changes\', { event: \'INSERT\', schema: \'public\',    |
| table: \'votes\',                                                     |
|                                                                       |
| filter: \'listing_id=eq.\' + listing.id }, () =\> {                   |
| refetchVoteCounts() })                                                |
|                                                                       |
| .subscribe()                                                          |
|                                                                       |
| Mobile-optimized styling: large buttons, readable on phone screens.   |
|                                                                       |
| Cova branding: navy/gold palette, \'Designed with Cova\' footer.      |
|                                                                       |
| Report when complete.                                                 |
+-----------------------------------------------------------------------+

**7.4 Phase 7 Commit**

  -----------------------------------------------------------------------
  git add . && git commit -m \'Phase 7 complete --- realtor listings, QR
  voting, public listing page\' && git push origin main

  -----------------------------------------------------------------------

**PHASE 8: PAYMENTS & TOKEN ECONOMY**

  --------- ------------------------------------------------------------------
   **!!!**  Phase 8 requires: Apple Developer Program (\$99/year at
            developer.apple.com), Stripe account, and App Store Connect
            configured. Do NOT start Phase 8 without these.

  --------- ------------------------------------------------------------------

**8.1 Pre-Phase Setup**

6.  Enroll in Apple Developer Program: developer.apple.com (\$99/year)

7.  Create Stripe account: stripe.com

8.  Create App Store Connect app with bundle ID ai.cova.app

9.  Create in-app purchase products in App Store Connect:

+-----------------------------------------------------------------------+
| Product ID: ai.cova.tokens.20 --- \$4.99 --- \'Starter Pack: 20       |
| tokens\'                                                              |
|                                                                       |
| Product ID: ai.cova.tokens.75 --- \$14.99 --- \'Standard Pack: 75     |
| tokens\'                                                              |
|                                                                       |
| Product ID: ai.cova.tokens.220 --- \$39.99 --- \'Pro Pack: 220        |
| tokens\'                                                              |
|                                                                       |
| Product ID: ai.cova.plus.monthly --- \$14.99/mo --- \'Cova Plus\'     |
|                                                                       |
| Product ID: ai.cova.pro.monthly --- \$29.99/mo --- \'Cova Pro\'       |
|                                                                       |
| Product ID: ai.cova.studio.monthly --- \$49.99/mo --- \'Cova Studio\' |
+-----------------------------------------------------------------------+

**8.2 Install Payment Libraries**

+-----------------------------------------------------------------------+
| cd \~/Desktop/cova/apps/mobile                                        |
|                                                                       |
| pnpm add expo-in-app-purchases                                        |
|                                                                       |
| \# Rebuild after native module install                                |
|                                                                       |
| cd \~/Desktop/cova/apps/mobile                                        |
|                                                                       |
| rm -rf ios && npx expo prebuild \--clean                              |
|                                                                       |
| \# Then rebuild from Xcode                                            |
+-----------------------------------------------------------------------+

**8.3 handle-purchase Edge Function**

+-----------------------------------------------------------------------+
| **CURSOR AGENT PROMPT --- handle-purchase Edge Function**             |
+-----------------------------------------------------------------------+
| \@BUILDGUIDE.md                                                       |
|                                                                       |
| Create supabase/functions/handle-purchase/index.ts (Deno runtime).    |
|                                                                       |
| This function validates StoreKit purchase receipts and credits        |
| tokens.                                                               |
|                                                                       |
| INPUT (JSON body):                                                    |
|                                                                       |
| receipt_data: string (base64 StoreKit receipt)                        |
|                                                                       |
| product_id: string (e.g. \'ai.cova.tokens.20\')                       |
|                                                                       |
| transaction_id: string                                                |
|                                                                       |
| PRODUCT MAP:                                                          |
|                                                                       |
| const PRODUCT_TOKENS = {                                              |
|                                                                       |
| \'ai.cova.tokens.20\': 20,                                            |
|                                                                       |
| \'ai.cova.tokens.75\': 75,                                            |
|                                                                       |
| \'ai.cova.tokens.220\': 220,                                          |
|                                                                       |
| };                                                                    |
|                                                                       |
| LOGIC:                                                                |
|                                                                       |
| 1\. Authenticate user via JWT                                         |
|                                                                       |
| 2\. Check for duplicate transaction:                                  |
|                                                                       |
| SELECT \* FROM token_transactions WHERE reason = \'purchase\_\' +     |
| transaction_id                                                        |
|                                                                       |
| Return 200 with \'already_processed\' if exists (idempotent)          |
|                                                                       |
| 3\. Validate receipt with Apple (sandbox for development, production  |
| for release):                                                         |
|                                                                       |
| POST https://sandbox.itunes.apple.com/verifyReceipt                   |
|                                                                       |
| Body: { receipt-data: receipt_data, password:                         |
| Deno.env.get(\'APP_STORE_SHARED_SECRET\') }                           |
|                                                                       |
| Check that status === 0 (valid)                                       |
|                                                                       |
| Check that transaction_id matches in receipt                          |
|                                                                       |
| 4\. Credit tokens:                                                    |
|                                                                       |
| const tokensToCredit = PRODUCT_TOKENS\[product_id\] \|\| 0            |
|                                                                       |
| UPDATE users SET token_balance = token_balance + tokensToCredit WHERE |
| id = user.id                                                          |
|                                                                       |
| INSERT INTO token_transactions (user_id, delta, reason)               |
|                                                                       |
| VALUES (user.id, tokensToCredit, \'purchase\_\' + transaction_id)     |
|                                                                       |
| 5\. Return: { success: true, tokens_credited: tokensToCredit,         |
| new_balance: newBalance }                                             |
|                                                                       |
| Error handling: if Apple validation fails, return 402 with error      |
| details.                                                              |
|                                                                       |
| CORS headers. Report when complete.                                   |
+-----------------------------------------------------------------------+

**8.4 Token Shop Screen**

+----------------------------------------------------------------------------------+
| **CURSOR AGENT PROMPT --- Token Shop Screen --- StoreKit**                       |
+----------------------------------------------------------------------------------+
| \@BUILDGUIDE.md                                                                  |
|                                                                                  |
| Create apps/mobile/src/screens/main/TokenShopScreen.tsx                          |
|                                                                                  |
| Import expo-in-app-purchases for StoreKit integration.                           |
|                                                                                  |
| ON MOUNT:                                                                        |
|                                                                                  |
| await InAppPurchases.connectAsync()                                              |
|                                                                                  |
| const { results } = await InAppPurchases.getProductsAsync(\[                     |
|                                                                                  |
| \'ai.cova.tokens.20\', \'ai.cova.tokens.75\', \'ai.cova.tokens.220\'             |
|                                                                                  |
| \])                                                                              |
|                                                                                  |
| Store products in state                                                          |
|                                                                                  |
| PURCHASE FLOW:                                                                   |
|                                                                                  |
| await InAppPurchases.purchaseItemAsync(productId)                                |
|                                                                                  |
| InAppPurchases.setPurchaseListener(async ({ responseCode, results }) =\> {       |
|                                                                                  |
| if (responseCode === IAPResponseCode.OK) {                                       |
|                                                                                  |
| for (const purchase of results) {                                                |
|                                                                                  |
| if (!purchase.acknowledged) {                                                    |
|                                                                                  |
| // Call handle-purchase Edge Function                                            |
|                                                                                  |
| const response = await                                                           |
| fetch(\'https://xdeacbmkdwqrwxonqaqh.supabase.co/functions/v1/handle-purchase\', |
| \...)                                                                            |
|                                                                                  |
| if (response.ok) {                                                               |
|                                                                                  |
| await InAppPurchases.finishTransactionAsync(purchase, true)                      |
|                                                                                  |
| // Update Zustand token balance                                                  |
|                                                                                  |
| setTokenBalance(data.new_balance)                                                |
|                                                                                  |
| Alert.alert(\'Success\', data.tokens_credited + \' tokens added!\')              |
|                                                                                  |
| }                                                                                |
|                                                                                  |
| }                                                                                |
|                                                                                  |
| }                                                                                |
|                                                                                  |
| }                                                                                |
|                                                                                  |
| })                                                                               |
|                                                                                  |
| LAYOUT (match V0 design):                                                        |
|                                                                                  |
| Header: \'Get More Tokens\' + current balance TokenBadge                         |
|                                                                                  |
| 3 token pack cards:                                                              |
|                                                                                  |
| Starter \$4.99 / 20 tokens / \'\~7 renders\'                                     |
|                                                                                  |
| Standard \$14.99 / 75 tokens / \'\~25 renders\' / \'MOST POPULAR\' badge in gold |
|                                                                                  |
| Pro \$39.99 / 220 tokens / \'\~73 renders\'                                      |
|                                                                                  |
| Each card: GoldButton \'Buy Now\'                                                |
|                                                                                  |
| Subscription section below packs                                                 |
|                                                                                  |
| Loading state when purchase is processing.                                       |
|                                                                                  |
| Error state with Toast on failure.                                               |
|                                                                                  |
| All styles via StyleSheet.create. Report when complete.                          |
+----------------------------------------------------------------------------------+

**8.5 Phase 8 Commit**

  -----------------------------------------------------------------------
  git add . && git commit -m \'Phase 8 complete --- StoreKit token shop,
  handle-purchase Edge Function\' && git push origin main

  -----------------------------------------------------------------------

**PHASE 9: APP STORE SUBMISSION**

  -------------------- ------------------------------------------------------------
   **PRE-SUBMISSION**  Complete all items in Section 9.1 before submitting. Apple
                       reviews take 24-48 hours. A rejected submission sets you
                       back days. Do it right the first time.

  -------------------- ------------------------------------------------------------

**9.1 Pre-Submission Checklist**

  ------------------------------------------------------------------
  **Item**              **How to Complete**             **Status**
  --------------------- ------------------------------- ------------
  End-to-end test x10   Run complete user journey 10    ⬜
                        times without any crash         

  Replace all           Use Toast component from design ⬜
  Alert.alert()         system for all alerts           

  Email confirmation    Supabase Dashboard \> Auth \>   ⬜
  enabled               Settings \> Enable email        
                        confirmations                   

  Privacy policy URL    Add to app.json ios.infoPlist   ⬜
                        NSPrivacyPolicyURL              

  Support URL           Create support@cova.app or add  ⬜
                        to App Store Connect            

  app.json version      Set to \'1.0.0\' and            ⬜
                        buildNumber to \'1\'            

  App Store screenshots iPhone 6.7 (1290x2796) and 6.1  ⬜
                        (1170x2532) --- 5 screenshots   
                        each                            

  App Store description Max 4000 chars --- lead with 3D ⬜
                        viewer + AI renders + shoppable 

  Keywords              interior design, AI room, 3D    ⬜
                        room design, home decor,        
                        virtual staging                 

  Category              Lifestyle (primary), Utilities  ⬜
                        (secondary)                     

  Age rating            4+ (no objectionable content)   ⬜

  TestFlight beta       Submit to TestFlight, get 10+   ⬜
                        beta testers, fix all crashes   

  Apple Review notes    Explain 3D content, camera      ⬜
                        usage, in-app purchases in      
                        review notes                    
  ------------------------------------------------------------------

**9.2 Build for App Store**

+-----------------------------------------------------------------------+
| cd \~/Desktop/cova/apps/mobile                                        |
|                                                                       |
| \# Update version in app.json:                                        |
|                                                                       |
| \# version: \'1.0.0\', ios.buildNumber: \'1\'                         |
|                                                                       |
| \# Build production IPA via EAS                                       |
|                                                                       |
| eas build \--platform ios \--profile production                       |
|                                                                       |
| \# Submit to TestFlight                                               |
|                                                                       |
| eas submit \--platform ios                                            |
|                                                                       |
| \# Or build locally in Xcode:                                         |
|                                                                       |
| \# Product \> Archive \> Distribute App \> App Store Connect          |
+-----------------------------------------------------------------------+

**9.3 App Store Description Template**

+-----------------------------------------------------------------------+
| Design your room in minutes with Cova --- the AI interior design app  |
|                                                                       |
| that shows your actual room in interactive 3D.                        |
|                                                                       |
| WHAT COVA DOES:                                                       |
|                                                                       |
| • Upload a photo of your real room                                    |
|                                                                       |
| • See it instantly in 5 design styles: Japandi, Mid-Century, Coastal, |
|                                                                       |
| Industrial, and Bohemian --- in an interactive 3D viewer              |
|                                                                       |
| • Tap \'AI Render\' for a photorealistic redesign of your room        |
|                                                                       |
| • Chat with our AI to refine your design: \'Make the sofa darker\'    |
|                                                                       |
| • Shop every item in the render --- furniture matched from Wayfair,   |
|                                                                       |
| Amazon, IKEA, and CB2                                                 |
|                                                                       |
| • Stay on budget with a live cost tracker                             |
|                                                                       |
| FOR REALTORS:                                                         |
|                                                                       |
| • Stage empty listing photos with AI                                  |
|                                                                       |
| • Share QR codes at open houses for buyer style voting                |
|                                                                       |
| HOW TOKENS WORK:                                                      |
|                                                                       |
| New users get 5 free tokens. AI renders cost 2-3 tokens.              |
|                                                                       |
| Chat edits cost 1-2 tokens. Purchase more token packs anytime.        |
+-----------------------------------------------------------------------+

**APPENDIX A: COMPLETE ERROR PLAYBOOK**

Every error encountered during Phases 0-3 is documented here with the
exact fix. Reference this before asking for help.

**A1: React Version Conflict**

  --------- ------------------------------------------------------------------
   **!!!**  Symptom: \'ReactCurrentOwner of undefined\' OR \'Cannot read
            property S of undefined\' on app startup

  --------- ------------------------------------------------------------------

Cause: React 19 was pulled in by npx expo install \--fix, a dependency
upgrade, or pnpm resolving wrong version.

+-----------------------------------------------------------------------+
| \# DIAGNOSIS                                                          |
|                                                                       |
| cat \~/Desktop/cova/apps/mobile/node_modules/react/package.json \|    |
| grep version                                                          |
|                                                                       |
| \# If NOT 18.3.1 --- you have the problem                             |
|                                                                       |
| \# FIX                                                                |
|                                                                       |
| cd \~/Desktop/cova/apps/mobile                                        |
|                                                                       |
| pnpm add react@18.3.1 react-dom@18.3.1                                |
|                                                                       |
| \# Verify pnpm overrides exist in root package.json:                  |
|                                                                       |
| cat \~/Desktop/cova/package.json \| grep -A5 overrides                |
|                                                                       |
| \# Must show: \'react\': \'18.3.1\'                                   |
|                                                                       |
| \# Clean install                                                      |
|                                                                       |
| cd \~/Desktop/cova                                                    |
|                                                                       |
| rm -rf node_modules apps/mobile/node_modules                          |
|                                                                       |
| rm -f pnpm-lock.yaml                                                  |
|                                                                       |
| pnpm install                                                          |
|                                                                       |
| \# Verify fix                                                         |
|                                                                       |
| cat apps/mobile/node_modules/react/package.json \| grep version       |
|                                                                       |
| \# Must show: 18.3.1                                                  |
+-----------------------------------------------------------------------+

**A2: Three.js Shader Crash**

  --------- ------------------------------------------------------------------
   **!!!**  Symptom: App crashes on style switch with \'Cannot read property
            trim of undefined\' at onFirstUse → getUniforms → setProgram

  --------- ------------------------------------------------------------------

Cause: Three.js version \> 0.155.0 breaks expo-gl shader uniform
handling on iOS.

+-----------------------------------------------------------------------+
| \# DIAGNOSIS                                                          |
|                                                                       |
| cat \~/Desktop/cova/apps/mobile/node_modules/three/package.json \|    |
| grep version                                                          |
|                                                                       |
| \# If NOT 0.155.0 --- you have the problem                            |
|                                                                       |
| \# FIX                                                                |
|                                                                       |
| cd \~/Desktop/cova/apps/mobile                                        |
|                                                                       |
| pnpm add three@0.155.0                                                |
|                                                                       |
| \# Also add to root pnpm overrides if needed:                         |
|                                                                       |
| \# \'three\': \'0.155.0\'                                             |
+-----------------------------------------------------------------------+

**A3: OrbitControls Crash**

  --------- ------------------------------------------------------------------
   **!!!**  Symptom: \'Cannot set property touchAction of undefined\' when
            adding OrbitControls

  --------- ------------------------------------------------------------------

Cause: OrbitControls.cjs tries to set domElement.style.touchAction which
does not exist in React Native. This will NEVER work. Use PanResponder
instead (Phase 6 Section 6.11).

+-----------------------------------------------------------------------+
| \# FIX: Remove OrbitControls entirely from RoomViewer3DScreen.tsx     |
|                                                                       |
| \# Remove import: import { OrbitControls } from                       |
| \'@react-three/drei/native\'                                          |
|                                                                       |
| \# Remove component: \<OrbitControls \... /\>                         |
|                                                                       |
| \# Use CameraController with PanResponder instead (see Phase 6        |
| Section 6.11)                                                         |
+-----------------------------------------------------------------------+

**A4: pnpm Not Found After Mac Restart**

  --------- ------------------------------------------------------------------
   **!!!**  Symptom: \'command not found: pnpm\' after restarting Mac or
            opening new Terminal

  --------- ------------------------------------------------------------------

+-----------------------------------------------------------------------+
| \# PERMANENT FIX:                                                     |
|                                                                       |
| corepack enable                                                       |
|                                                                       |
| corepack prepare pnpm@latest \--activate                              |
|                                                                       |
| \# If still not found, add to \~/.zprofile:                           |
|                                                                       |
| echo \'export PNPM_HOME=\"\$HOME/.local/share/pnpm\"\' \>\>           |
| \~/.zprofile                                                          |
|                                                                       |
| echo \'export PATH=\"\$PNPM_HOME:\$PATH\"\' \>\> \~/.zprofile         |
|                                                                       |
| source \~/.zprofile                                                   |
|                                                                       |
| pnpm \--version \# Should now work                                    |
+-----------------------------------------------------------------------+

**A5: Pod Install Failure**

  --------- ------------------------------------------------------------------
   **!!!**  Symptom: pod install fails with get_folly_config error OR
            ReactAppDependencyProvider error

  --------- ------------------------------------------------------------------

Cause: The ios/ folder is corrupt or incompatible. It is a generated
folder --- treat it as disposable.

+-----------------------------------------------------------------------+
| cd \~/Desktop/cova/apps/mobile                                        |
|                                                                       |
| rm -rf ios                                                            |
|                                                                       |
| npx expo prebuild \--clean                                            |
|                                                                       |
| \# Then rebuild from Xcode                                            |
+-----------------------------------------------------------------------+

**A6: Xcode Push Notifications Error**

  --------- ------------------------------------------------------------------
   **!!!**  Symptom: \'No profiles for ai.cova.app --- Personal Team does not
            support Push Notifications capability\'

  --------- ------------------------------------------------------------------

Cause: Push Notifications is listed as a capability. Personal Apple ID
accounts cannot use it without Apple Developer Program.

+-----------------------------------------------------------------------+
| \# FIX in Xcode:                                                      |
|                                                                       |
| \# 1. Open \~/Desktop/cova/apps/mobile/ios/Cova.xcworkspace           |
|                                                                       |
| \# 2. Select Cova target \> Signing & Capabilities tab                |
|                                                                       |
| \# 3. Find \'Push Notifications\' capability                          |
|                                                                       |
| \# 4. Click the trash icon to REMOVE it                               |
|                                                                       |
| \# 5. Click \'Try Again\' button                                      |
|                                                                       |
| \# 6. Should now show green checkmark                                 |
|                                                                       |
| \# PERMANENT FIX --- remove from app.json:                            |
|                                                                       |
| \# Remove any push notification plugin or entitlement from app.json   |
|                                                                       |
| \# Re-run: npx expo prebuild \--clean && rebuild from Xcode           |
+-----------------------------------------------------------------------+

**A7: Expo Go Version Mismatch**

  --------- ------------------------------------------------------------------
   **!!!**  Symptom: \'Project is incompatible with this version of Expo Go\'

  --------- ------------------------------------------------------------------

Cause: Cova uses expo-gl which is a native module that Expo Go cannot
load. NEVER use Expo Go for Cova. Always use the native development
build via Xcode.

+-----------------------------------------------------------------------+
| \# CORRECT build process:                                             |
|                                                                       |
| cd \~/Desktop/cova/apps/mobile                                        |
|                                                                       |
| npx expo start \--clear \# Start Metro                                |
|                                                                       |
| \# Open Xcode -\> select iPhone -\> Cmd+R                             |
|                                                                       |
| \# App installs on physical iPhone                                    |
+-----------------------------------------------------------------------+

**A8: Metro Port Already In Use**

  --------- ------------------------------------------------------------------
   **!!!**  Symptom: \'Port 8081 is running this app in another window\'

  --------- ------------------------------------------------------------------

+-----------------------------------------------------------------------+
| \# Kill processes on both possible ports                              |
|                                                                       |
| kill \$(lsof -t -i:8081) 2\>/dev/null; echo \'done\'                  |
|                                                                       |
| kill \$(lsof -t -i:8082) 2\>/dev/null; echo \'done\'                  |
|                                                                       |
| \# Then start Metro fresh                                             |
|                                                                       |
| cd \~/Desktop/cova/apps/mobile                                        |
|                                                                       |
| npx expo start \--clear                                               |
+-----------------------------------------------------------------------+

**A9: Cursor Memory Crash (79GB+)**

  --------- ------------------------------------------------------------------
   **!!!**  Symptom: Mac fans max out, system slows to a crawl, Cursor uses
            79GB+ RAM when running Agent prompts

  --------- ------------------------------------------------------------------

+-----------------------------------------------------------------------+
| \# Step 1: Force quit Cursor (Cmd+Option+Esc -\> Cursor -\> Force     |
| Quit)                                                                 |
|                                                                       |
| \# Step 2: Clear ALL Cursor caches                                    |
|                                                                       |
| rm -rf \~/Library/Application\\ Support/Cursor/Cache                  |
|                                                                       |
| rm -rf \~/Library/Application\\ Support/Cursor/CachedData             |
|                                                                       |
| rm -rf \~/Library/Caches/Cursor                                       |
|                                                                       |
| rm -rf \~/Library/Application\\ Support/Cursor/GPUCache               |
|                                                                       |
| \# Step 3: Restart Mac before reopening Cursor                        |
|                                                                       |
| \# PREVENTION --- ensure .cursorignore contains:                      |
|                                                                       |
| \# node_modules                                                       |
|                                                                       |
| \# assets/3d                                                          |
|                                                                       |
| \# .expo                                                              |
|                                                                       |
| \# pnpm-lock.yaml                                                     |
|                                                                       |
| \# ios                                                                |
|                                                                       |
| \# android                                                            |
+-----------------------------------------------------------------------+

**A10: iOS Simulator 3D Blank Screen**

  --------- ------------------------------------------------------------------
   **!!!**  Symptom: 3D room is blank/black in iOS Simulator even though it
            works on physical iPhone

  --------- ------------------------------------------------------------------

Cause: iOS Simulator WebGL implementation is broken for Three.js shader
compilation. This is a known issue with expo-gl + Simulator and is NOT
fixable. Always use a physical iPhone.

+-----------------------------------------------------------------------+
| \# There is no fix for Simulator. Use physical iPhone for ALL 3D      |
| testing.                                                              |
|                                                                       |
| \# Make sure iPhone is connected via USB and Developer Mode is ON.    |
+-----------------------------------------------------------------------+

**A11: New Architecture Error**

  --------- ------------------------------------------------------------------
   **!!!**  Symptom: \'right operand of in is not an object\' at RCTBridge OR
            \'Cannot read properties of undefined (reading NativeModules)\'

  --------- ------------------------------------------------------------------

Cause: newArchEnabled: true in app.json. \@react-three/fiber 8.x is
incompatible with Fabric/New Architecture.

+-----------------------------------------------------------------------+
| \# FIX: Open apps/mobile/app.json                                     |
|                                                                       |
| \# Ensure: \"newArchEnabled\": false                                  |
|                                                                       |
| \# Rebuild from Xcode after changing                                  |
+-----------------------------------------------------------------------+

**A12: GLB Model Causes Shader Crash**

  --------- ------------------------------------------------------------------
   **!!!**  Symptom: After re-enabling FurniturePiece, app crashes on specific
            style only

  --------- ------------------------------------------------------------------

Cause: One of the GLB models for that style has a problematic material.
Isolate and remove it.

+-----------------------------------------------------------------------+
| \# DIAGNOSTIC: Comment out furniture models one by one in             |
| STYLE_DEFAULT_FURNITURE                                               |
|                                                                       |
| \# until crash stops. The last model you commented out is the         |
| problem.                                                              |
|                                                                       |
| \# FIX options:                                                       |
|                                                                       |
| \# 1. Remove that model key from STYLE_DEFAULT_FURNITURE for that     |
| style                                                                 |
|                                                                       |
| \# 2. Re-export the GLB from Blender without complex materials        |
|                                                                       |
| \# 3. Replace with a simpler GLB from Kenney Kit                      |
+-----------------------------------------------------------------------+

**APPENDIX B: COLLABORATION --- PRANAV & DAKSH**

**B1: Daily Workflow**

  -------------------------------------------------------------------------
  **Person**   **Responsibility**              **How**
  ------------ ------------------------------- ----------------------------
  Pranav       Primary builder, Supabase       \~/Desktop/cova is the
               owner, GitHub owner             source repo

  Daksh        Feature builder, testing, code  Fork or direct push to main
               review                          with permission

  Both         V0 design approval required     Share screenshots in team
               before any Phase 6+ UI code     chat

  Both         Git commit after every          git add . && git commit &&
               completed session               git push
  -------------------------------------------------------------------------

**B2: Daksh Setup (New Mac)**

+-----------------------------------------------------------------------+
| \# Clone repo                                                         |
|                                                                       |
| git clone https://github.com/YOUR_ORG/cova.git \~/Desktop/cova        |
|                                                                       |
| cd \~/Desktop/cova                                                    |
|                                                                       |
| \# Install dependencies                                               |
|                                                                       |
| pnpm install                                                          |
|                                                                       |
| \# Copy environment variables from Pranav (never commit these)        |
|                                                                       |
| \# Create \~/Desktop/cova/.env.local with all keys from Pranav        |
|                                                                       |
| \# Verify                                                             |
|                                                                       |
| cat apps/mobile/node_modules/react/package.json \| grep version       |
|                                                                       |
| \# Must show 18.3.1                                                   |
+-----------------------------------------------------------------------+

**B3: Staying in Sync**

+-----------------------------------------------------------------------+
| \# Start of every work session:                                       |
|                                                                       |
| cd \~/Desktop/cova                                                    |
|                                                                       |
| git pull origin main                                                  |
|                                                                       |
| pnpm install \# In case new packages were added                       |
|                                                                       |
| \# End of every work session:                                         |
|                                                                       |
| git add .                                                             |
|                                                                       |
| git commit -m \'Phase X: brief description of what was done\'         |
|                                                                       |
| git push origin main                                                  |
+-----------------------------------------------------------------------+

**B4: If You Break Something**

+-----------------------------------------------------------------------+
| \# If you can\'t figure out what broke:                               |
|                                                                       |
| git stash \# Save your changes                                        |
|                                                                       |
| git log \--oneline -10 \# See recent commits                          |
|                                                                       |
| git checkout COMMIT_HASH \# Go back to known good state               |
|                                                                       |
| \# OR reset to last commit completely (DESTROYS unsaved work):        |
|                                                                       |
| git checkout \-- .                                                    |
|                                                                       |
| \# OR reset to remote main (DESTROYS local commits):                  |
|                                                                       |
| git fetch origin                                                      |
|                                                                       |
| git reset \--hard origin/main                                         |
+-----------------------------------------------------------------------+

*COVA BUILD GUIDE v2.0 --- Phases 4--9 + Error Playbook \|
hellocova@gmail.com \| ai.cova.app \| March 2026*
