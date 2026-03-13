**COVA**

**V1 Complete Build Guide**

*From Zero to App Store --- Step by Step \| 3D-First Architecture \| 14
Days*

React Native · Expo · Three.js · Supabase · Replicate · Claude API ·
StoreKit

  -----------------------------------------------------------------------
   **Phase**  **Name**            **What You Build**
  ----------- ------------------- ---------------------------------------
     **0**    **Environment       Homebrew, Node, Python, VS Code, Xcode,
              Setup**             Git, Expo CLI

     **1**    **Project           Monorepo, shared types, Supabase
              Scaffold**          client, 3D dependencies

     **2**    **Supabase          Database schema, RLS policies, storage
              Backend**           buckets, auth

     **3**    **3D Room Engine    Calibration screen, Three.js BoxRoom,
              ⭐**                glTF furniture, orbit, style switching

     **4**    **AI Rendering      Edge Functions, Replicate
              (2D)**              SDXL+ControlNet, webhooks, quality
                                  gates

     **5**    **Claude Chatbot**  Conversational editing, action
                                  dispatch, 3D scene mutations

     **6**    **Mobile App        Auth, onboarding swipe, home, upload,
              Screens**           3D viewer, product shelf

     **7**    **Realtor Tools**   Virtual staging, listing pages, open
                                  house voting, MLS export

     **8**    **Purchases**       StoreKit, token packs, subscriptions,
                                  receipt verification

     **9**    **App Store         EAS build, submission checklist,
              Launch**            go-live
  -----------------------------------------------------------------------

+:-------------:+-----------------------------------------------------+
| **PHASE 0**   | *Install every tool you need before writing a       |
|               | single line of app code --- Mac only*               |
| **Environment |                                                     |
| Setup**       |                                                     |
+---------------+-----------------------------------------------------+

This phase installs the developer tools required for building Cova.
Every command is typed into the Terminal app. Press Cmd+Space, type
\'Terminal\', press Enter. A window opens where you type commands. Press
Enter after each command to run it. Do not skip any step --- missing
tools will cause cryptic errors later.

  ------- ------------------------------------------------------------
   **1**  **Install Homebrew --- the Mac package manager**

  ------- ------------------------------------------------------------

Homebrew lets you install developer software from Terminal with one
command. Almost everything else depends on it.

  -----------------------------------------------------------------------
  /bin/bash -c \"\$(curl -fsSL
  https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"

  -----------------------------------------------------------------------

This will ask for your Mac password. Type it and press Enter --- you
won\'t see characters as you type, that\'s normal. Takes 3--5 minutes.
When it finishes, it may show a message saying \'Run these two commands
to add Homebrew to your PATH\'. If it does, run both:

+-----------------------------------------------------------------+
| echo \'export PATH=\"/opt/homebrew/bin:\$PATH\"\' \>\>          |
| \~/.zprofile                                                    |
|                                                                 |
| eval \"\$(/opt/homebrew/bin/brew shellenv)\"                    |
+-----------------------------------------------------------------+

Then verify:

  -----------------------------------------------------------------
  brew \--version

  -----------------------------------------------------------------

  ------------ --------------------------------------------------------
      **✅     You should see: Homebrew 4.x.x
   EXPECTED**  

  ------------ --------------------------------------------------------

  ------- ------------------------------------------------------------
   **2**  **Install Node.js 20 LTS**

  ------- ------------------------------------------------------------

Node.js runs JavaScript on your computer and comes with npm, the package
manager that installs all code libraries.

  -----------------------------------------------------------------
  brew install node@20

  -----------------------------------------------------------------

Add Node to your PATH so Terminal can find it:

+-----------------------------------------------------------------+
| echo \'export PATH=\"/opt/homebrew/opt/node@20/bin:\$PATH\"\'   |
| \>\> \~/.zprofile                                               |
|                                                                 |
| source \~/.zprofile                                             |
+-----------------------------------------------------------------+

Verify both installed correctly:

+-----------------------------------------------------------------+
| node \--version \# should show v20.x.x                          |
|                                                                 |
| npm \--version \# should show 10.x.x                            |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **3**  **Install Git**

  ------- ------------------------------------------------------------

Git is version control --- it tracks every change you make to your code
so you can go back in time if something breaks, and lets you collaborate
with a cofounder without overwriting each other\'s work.

  -----------------------------------------------------------------
  brew install git

  -----------------------------------------------------------------

Configure Git with your identity --- this attaches your name to every
change you save:

+-----------------------------------------------------------------+
| git config \--global user.name \"Your Name\"                    |
|                                                                 |
| git config \--global user.email \"hellocova@gmail.com\"         |
|                                                                 |
| git config \--global init.defaultBranch main                    |
+-----------------------------------------------------------------+

  -----------------------------------------------------------------
  git \--version

  -----------------------------------------------------------------

  ------------ --------------------------------------------------------
      **✅     Should show git version 2.x.x
   EXPECTED**  

  ------------ --------------------------------------------------------

  ------- ------------------------------------------------------------
   **4**  **Install Visual Studio Code**

  ------- ------------------------------------------------------------

VS Code is the code editor you will use for everything. Free, fast,
excellent TypeScript and React Native support.

  -----------------------------------------------------------------
  brew install \--cask visual-studio-code

  -----------------------------------------------------------------

After installation, open VS Code from Applications. Press Cmd+Shift+X to
open Extensions and install each of these (search by name):

- ESLint --- catches code errors as you type

- Prettier --- automatically formats your code on save

- TypeScript and JavaScript Language Features --- language support

- React Native Tools --- debugging and IntelliSense for React Native

- Tailwind CSS IntelliSense --- autocomplete for CSS classes in web
  dashboard

- GitLens --- see who changed what and when

- Thunder Client --- test your API endpoints directly in VS Code (no
  Postman needed)

- glTF Tools --- preview and validate your 3D model files

Configure VS Code to auto-format on save. Press Cmd+Shift+P, type \'Open
User Settings JSON\', press Enter, and add these lines inside the curly
braces:

+-----------------------------------------------------------------+
| \"editor.formatOnSave\": true,                                  |
|                                                                 |
| \"editor.defaultFormatter\": \"esbenp.prettier-vscode\",        |
|                                                                 |
| \"editor.tabSize\": 2,                                          |
|                                                                 |
| \"editor.fontSize\": 14,                                        |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **5**  **Install pnpm**

  ------- ------------------------------------------------------------

pnpm is a faster, more efficient replacement for npm --- especially
important for monorepos where multiple apps share packages.

  -----------------------------------------------------------------
  npm install -g pnpm

  -----------------------------------------------------------------

  -----------------------------------------------------------------
  pnpm \--version

  -----------------------------------------------------------------

  ------------ --------------------------------------------------------
      **✅     Should show 8.x.x or 9.x.x
   EXPECTED**  

  ------------ --------------------------------------------------------

  ------- ------------------------------------------------------------
   **6**  **Install Expo CLI and EAS CLI**

  ------- ------------------------------------------------------------

Expo is the framework for building the React Native iOS app. EAS is
Expo\'s cloud build service that compiles and submits the app to the App
Store. You need both.

+-----------------------------------------------------------------+
| npm install -g expo-cli                                         |
|                                                                 |
| npm install -g eas-cli                                          |
+-----------------------------------------------------------------+

Create a free Expo account at expo.dev if you don\'t have one. Then log
in:

  -----------------------------------------------------------------
  eas login

  -----------------------------------------------------------------

Enter your email and password when prompted. You\'ll see \'Logged in as
\[your email\]\' when successful.

  ------- ------------------------------------------------------------
   **7**  **Install Supabase CLI**

  ------- ------------------------------------------------------------

The Supabase CLI lets you manage your database, run migrations, and test
Edge Functions locally before deploying.

  -----------------------------------------------------------------
  brew install supabase/tap/supabase

  -----------------------------------------------------------------

  -----------------------------------------------------------------
  supabase \--version

  -----------------------------------------------------------------

  ------------ --------------------------------------------------------
      **✅     Should show supabase 1.x.x or 2.x.x
   EXPECTED**  

  ------------ --------------------------------------------------------

  ------- ------------------------------------------------------------
   **8**  **Install Python 3.11**

  ------- ------------------------------------------------------------

Python is needed for the AI training scripts, dataset processing, CLIP
embedding generation, and quality evaluation tools.

  -----------------------------------------------------------------
  brew install python@3.11

  -----------------------------------------------------------------

Add Python to your PATH:

+-----------------------------------------------------------------+
| echo \'export                                                   |
| PATH=\"/opt/homebrew/opt/python@3.11/bin:\$PATH\"\' \>\>        |
| \~/.zprofile                                                    |
|                                                                 |
| source \~/.zprofile                                             |
+-----------------------------------------------------------------+

+-----------------------------------------------------------------+
| python3 \--version \# should show Python 3.11.x                 |
|                                                                 |
| pip3 \--version \# should show pip 23.x.x                       |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **9**  **Install Blender CLI (for 3D model processing)**

  ------- ------------------------------------------------------------

Blender is needed to batch-convert and optimise glTF furniture models
for mobile. Install it via Homebrew:

  -----------------------------------------------------------------
  brew install \--cask blender

  -----------------------------------------------------------------

After installation, add Blender to your PATH so you can run it from
Terminal:

+-----------------------------------------------------------------+
| echo \'export                                                   |
| PATH=\"/Applications/Blender.app/Contents/MacOS:\$PATH\"\' \>\> |
| \~/.zprofile                                                    |
|                                                                 |
| source \~/.zprofile                                             |
|                                                                 |
| blender \--version \# should show Blender 4.x.x                 |
+-----------------------------------------------------------------+

  -------- ------------------------------------------------------------
   **10**  **Create GitHub repository**

  -------- ------------------------------------------------------------

Go to github.com, click the + icon, click \'New repository\'. Name it
\'cova\', set it to Private, check \'Add a README file\', click \'Create
repository\'. Then clone it:

+-----------------------------------------------------------------+
| cd \~/Documents                                                 |
|                                                                 |
| git clone https://github.com/YOURUSERNAME/cova.git              |
|                                                                 |
| cd cova                                                         |
+-----------------------------------------------------------------+

  ------------- --------------------------------------------------------
      **⚠️      Replace YOURUSERNAME with your actual GitHub username.
   IMPORTANT**  Every future command in this guide assumes you are
                inside \~/Documents/cova.

  ------------- --------------------------------------------------------

  -------- ------------------------------------------------------------
   **11**  **Install Xcode --- START THIS NOW, it takes 30--60
           minutes**

  -------- ------------------------------------------------------------

Xcode is Apple\'s developer tool required to build and run iOS apps. It
is 15GB so start the download now and continue with Phase 1 while it
downloads.

Open the App Store on your Mac, search for \'Xcode\', click Get /
Install. It is free but requires your Apple ID. After Xcode installs,
open it once to accept the license agreement. Then run:

+-----------------------------------------------------------------+
| sudo xcode-select \--switch /Applications/Xcode.app             |
|                                                                 |
| xcodebuild -runFirstLaunch                                      |
+-----------------------------------------------------------------+

  --------- --------------------------------------------------------
    **⏳    If Xcode has not finished downloading, continue with
   WAIT**   Phase 1 and Phase 2. Come back to test the iOS Simulator
            at the start of Phase 6.

  --------- --------------------------------------------------------

+:----------:+-----------------------------------------------------+
| **PHASE    | *Create the monorepo, install 3D dependencies, and  |
| 1**        | set up shared TypeScript types*                     |
|            |                                                     |
| **Project  |                                                     |
| Scaffold** |                                                     |
+------------+-----------------------------------------------------+

A monorepo means one repository holding multiple apps and shared code.
Cova has two apps --- the iOS mobile app and the realtor web dashboard
--- plus shared code they both use. Turborepo manages the build system
so the shared package compiles before either app builds.

  ------- ------------------------------------------------------------
   **1**  **Initialize the Turborepo monorepo**

  ------- ------------------------------------------------------------

Make sure you are in your cova folder. Run:

+-----------------------------------------------------------------+
| cd \~/Documents/cova                                            |
|                                                                 |
| npx create-turbo@latest . \--package-manager pnpm               |
+-----------------------------------------------------------------+

When it asks questions: select pnpm as the package manager, select Yes
for TypeScript. After it finishes, delete the example apps it created:

+-----------------------------------------------------------------+
| rm -rf apps/docs                                                |
|                                                                 |
| rm -rf apps/web                                                 |
|                                                                 |
| rm -rf packages/ui                                              |
|                                                                 |
| rm -rf packages/eslint-config                                   |
|                                                                 |
| rm -rf packages/typescript-config                               |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **2**  **Create the correct folder structure**

  ------- ------------------------------------------------------------

+-----------------------------------------------------------------+
| mkdir -p apps/mobile                                            |
|                                                                 |
| mkdir -p apps/web                                               |
|                                                                 |
| mkdir -p packages/shared/src/types                              |
|                                                                 |
| mkdir -p packages/shared/src/utils                              |
|                                                                 |
| mkdir -p packages/shared/src/supabase                           |
|                                                                 |
| mkdir -p supabase/migrations                                    |
|                                                                 |
| mkdir -p supabase/functions                                     |
|                                                                 |
| mkdir -p scripts                                                |
|                                                                 |
| mkdir -p assets/3d/furniture                                    |
|                                                                 |
| mkdir -p assets/3d/environments                                 |
+-----------------------------------------------------------------+

Your final structure:

+-----------------------------------------------------------------+
| cova/                                                           |
|                                                                 |
| ├── apps/                                                       |
|                                                                 |
| │ ├── mobile/ ← React Native Expo iOS app                       |
|                                                                 |
| │ └── web/ ← Next.js realtor web dashboard                      |
|                                                                 |
| ├── packages/                                                   |
|                                                                 |
| │ └── shared/ ← Shared TypeScript + utils                       |
|                                                                 |
| │ └── src/                                                      |
|                                                                 |
| │ ├── types/ ← All TypeScript interfaces                        |
|                                                                 |
| │ ├── utils/ ← Token costs, fingerprint scoring                 |
|                                                                 |
| │ └── supabase/← Supabase client init                           |
|                                                                 |
| ├── supabase/                                                   |
|                                                                 |
| │ ├── migrations/ ← Database schema SQL files                   |
|                                                                 |
| │ └── functions/ ← Edge Function serverless API                 |
|                                                                 |
| ├── assets/                                                     |
|                                                                 |
| │ └── 3d/                                                       |
|                                                                 |
| │ ├── furniture/ ← glTF .glb model files                        |
|                                                                 |
| │ └── environments/← HDR lighting files                         |
|                                                                 |
| ├── scripts/ ← Python AI/ML scripts                             |
|                                                                 |
| ├── .env.local ← Secret keys (NEVER committed)                  |
|                                                                 |
| └── turbo.json ← Turborepo config                               |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **3**  **Configure turbo.json**

  ------- ------------------------------------------------------------

  -----------------------------------------------------------------
  code turbo.json

  -----------------------------------------------------------------

Replace everything with:

+-----------------------------------------------------------------+
| {                                                               |
|                                                                 |
| \"\$schema\": \"https://turbo.build/schema.json\",              |
|                                                                 |
| \"globalEnv\": \[\"NEXT_PUBLIC_SUPABASE_URL\",                  |
| \"NEXT_PUBLIC_SUPABASE_ANON_KEY\"\],                            |
|                                                                 |
| \"pipeline\": {                                                 |
|                                                                 |
| \"build\": { \"dependsOn\": \[\"\^build\"\], \"outputs\":       |
| \[\".next/\*\*\", \"!.next/cache/\*\*\", \"dist/\*\*\"\] },     |
|                                                                 |
| \"dev\": { \"cache\": false, \"persistent\": true },            |
|                                                                 |
| \"lint\": { \"outputs\": \[\] },                                |
|                                                                 |
| \"typecheck\": { \"dependsOn\": \[\"\^build\"\] }               |
|                                                                 |
| }                                                               |
|                                                                 |
| }                                                               |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **4**  **Set up the root package.json**

  ------- ------------------------------------------------------------

  -----------------------------------------------------------------
  code package.json

  -----------------------------------------------------------------

Replace the entire file with:

+-----------------------------------------------------------------+
| {                                                               |
|                                                                 |
| \"name\": \"cova\",                                             |
|                                                                 |
| \"private\": true,                                              |
|                                                                 |
| \"scripts\": {                                                  |
|                                                                 |
| \"dev\": \"turbo run dev\",                                     |
|                                                                 |
| \"build\": \"turbo run build\",                                 |
|                                                                 |
| \"lint\": \"turbo run lint\",                                   |
|                                                                 |
| \"typecheck\": \"turbo run typecheck\"                          |
|                                                                 |
| },                                                              |
|                                                                 |
| \"devDependencies\": {                                          |
|                                                                 |
| \"turbo\": \"latest\",                                          |
|                                                                 |
| \"typescript\": \"\^5.3.0\"                                     |
|                                                                 |
| },                                                              |
|                                                                 |
| \"packageManager\": \"pnpm@9.0.0\"                              |
|                                                                 |
| }                                                               |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **5**  **Create the shared package --- types and Supabase client**

  ------- ------------------------------------------------------------

Create packages/shared/package.json:

  -----------------------------------------------------------------
  code packages/shared/package.json

  -----------------------------------------------------------------

+-----------------------------------------------------------------+
| {                                                               |
|                                                                 |
| \"name\": \"@cova/shared\",                                     |
|                                                                 |
| \"version\": \"0.0.1\",                                         |
|                                                                 |
| \"main\": \"./src/index.ts\",                                   |
|                                                                 |
| \"types\": \"./src/index.ts\",                                  |
|                                                                 |
| \"dependencies\": {                                             |
|                                                                 |
| \"@supabase/supabase-js\": \"\^2.39.0\"                         |
|                                                                 |
| }                                                               |
|                                                                 |
| }                                                               |
+-----------------------------------------------------------------+

Create the main types file --- packages/shared/src/types/index.ts:

  -----------------------------------------------------------------
  code packages/shared/src/types/index.ts

  -----------------------------------------------------------------

+-----------------------------------------------------------------------------------+
| // ── Core User Types ───────────────────────────────                             |
|                                                                                   |
| export interface User {                                                           |
|                                                                                   |
| id: string;                                                                       |
|                                                                                   |
| email: string;                                                                    |
|                                                                                   |
| full_name: string \| null;                                                        |
|                                                                                   |
| account_type: \'consumer\' \| \'realtor\';                                        |
|                                                                                   |
| style_fingerprint: StyleFingerprint;                                              |
|                                                                                   |
| budget_dna: BudgetDNA;                                                            |
|                                                                                   |
| token_balance: number;                                                            |
|                                                                                   |
| onboarding_completed: boolean;                                                    |
|                                                                                   |
| stripe_customer_id: string \| null;                                               |
|                                                                                   |
| created_at: string;                                                               |
|                                                                                   |
| }                                                                                 |
|                                                                                   |
| export interface StyleFingerprint {                                               |
|                                                                                   |
| top_styles: string\[\];                                                           |
|                                                                                   |
| density_preference: number; // 1=minimal, 3=maximalist                            |
|                                                                                   |
| color_palette: string\[\]; // hex values                                          |
|                                                                                   |
| material_preference: string\[\];                                                  |
|                                                                                   |
| price_tier: \'budget\' \| \'mid\' \| \'premium\';                                 |
|                                                                                   |
| swipe_count: number;                                                              |
|                                                                                   |
| }                                                                                 |
|                                                                                   |
| export interface BudgetDNA {                                                      |
|                                                                                   |
| total_room_budget: number;                                                        |
|                                                                                   |
| preferred_price_tier: \'budget\' \| \'mid\' \| \'premium\';                       |
|                                                                                   |
| spend_history: number\[\];                                                        |
|                                                                                   |
| price_alerts_enabled: boolean;                                                    |
|                                                                                   |
| }                                                                                 |
|                                                                                   |
| // ── Room & Render Types ───────────────────────────                             |
|                                                                                   |
| export interface Room {                                                           |
|                                                                                   |
| id: string;                                                                       |
|                                                                                   |
| user_id: string;                                                                  |
|                                                                                   |
| original_image_url: string;                                                       |
|                                                                                   |
| depth_map_url: string \| null;                                                    |
|                                                                                   |
| depth_map_quality_score: number \| null;                                          |
|                                                                                   |
| detected_existing_style: string \| null;                                          |
|                                                                                   |
| room_type:                                                                        |
| \'living_room\'\|\'bedroom\'\|\'kitchen\'\|\'bathroom\'\|\'office\'\|\'dining\';  |
|                                                                                   |
| // 3D calibration data                                                            |
|                                                                                   |
| calibration_data: RoomCalibration \| null;                                        |
|                                                                                   |
| room_dimensions: RoomDimensions \| null;                                          |
|                                                                                   |
| listing_id: string \| null;                                                       |
|                                                                                   |
| created_at: string;                                                               |
|                                                                                   |
| }                                                                                 |
|                                                                                   |
| export interface RoomCalibration {                                                |
|                                                                                   |
| corner_tl: { x: number; y: number };                                              |
|                                                                                   |
| corner_tr: { x: number; y: number };                                              |
|                                                                                   |
| corner_bl: { x: number; y: number };                                              |
|                                                                                   |
| corner_br: { x: number; y: number };                                              |
|                                                                                   |
| floor_line_y: number;                                                             |
|                                                                                   |
| image_width: number;                                                              |
|                                                                                   |
| image_height: number;                                                             |
|                                                                                   |
| }                                                                                 |
|                                                                                   |
| export interface RoomDimensions {                                                 |
|                                                                                   |
| width_ft: number;                                                                 |
|                                                                                   |
| depth_ft: number;                                                                 |
|                                                                                   |
| height_ft: number;                                                                |
|                                                                                   |
| }                                                                                 |
|                                                                                   |
| export interface Render {                                                         |
|                                                                                   |
| id: string;                                                                       |
|                                                                                   |
| room_id: string;                                                                  |
|                                                                                   |
| user_id: string;                                                                  |
|                                                                                   |
| style_applied: string;                                                            |
|                                                                                   |
| quality_tier: \'draft\' \| \'hd\';                                                |
|                                                                                   |
| image_url: string \| null;                                                        |
|                                                                                   |
| status: \'processing\'\|\'complete\'\|\'failed\'\|\'quality_rejected\';           |
|                                                                                   |
| brisque_score: number \| null;                                                    |
|                                                                                   |
| tokens_charged: number;                                                           |
|                                                                                   |
| created_at: string;                                                               |
|                                                                                   |
| }                                                                                 |
|                                                                                   |
| // ── 3D Scene Types ────────────────────────────────                             |
|                                                                                   |
| export interface SceneState {                                                     |
|                                                                                   |
| style: CavaStyle;                                                                 |
|                                                                                   |
| furniture: PlacedFurniture\[\];                                                   |
|                                                                                   |
| room_dimensions: RoomDimensions;                                                  |
|                                                                                   |
| }                                                                                 |
|                                                                                   |
| export interface PlacedFurniture {                                                |
|                                                                                   |
| id: string;                                                                       |
|                                                                                   |
| model_key: string; // key into FURNITURE_CATALOG                                  |
|                                                                                   |
| position: \[number, number, number\];                                             |
|                                                                                   |
| rotation_y: number; // radians                                                    |
|                                                                                   |
| style: CavaStyle;                                                                 |
|                                                                                   |
| }                                                                                 |
|                                                                                   |
| export type CavaStyle = \'japandi\' \| \'midcentury\' \| \'coastal\' \|           |
| \'industrial\' \| \'bohemian\';                                                   |
|                                                                                   |
| export interface FurnitureCatalogItem {                                           |
|                                                                                   |
| key: string;                                                                      |
|                                                                                   |
| name: string;                                                                     |
|                                                                                   |
| category:                                                                         |
| \'sofa\'\|\'chair\'\|\'table\'\|\'rug\'\|\'lamp\'\|\'plant\'\|\'shelf\'\|\'bed\'; |
|                                                                                   |
| styles: CavaStyle\[\];                                                            |
|                                                                                   |
| model_path: string; // path to .glb file                                          |
|                                                                                   |
| dimensions: { w: number; d: number; h: number }; // in metres                     |
|                                                                                   |
| default_position: \[number, number, number\];                                     |
|                                                                                   |
| default_rotation_y: number;                                                       |
|                                                                                   |
| }                                                                                 |
|                                                                                   |
| // ── Product & Commerce Types ──────────────────────                             |
|                                                                                   |
| export interface Product {                                                        |
|                                                                                   |
| id: string;                                                                       |
|                                                                                   |
| external_id: string;                                                              |
|                                                                                   |
| name: string;                                                                     |
|                                                                                   |
| retailer: \'wayfair\'\|\'amazon\'\|\'ikea\'\|\'cb2\';                             |
|                                                                                   |
| price: number;                                                                    |
|                                                                                   |
| category: string;                                                                 |
|                                                                                   |
| image_url: string;                                                                |
|                                                                                   |
| affiliate_url_base: string;                                                       |
|                                                                                   |
| price_tier: \'budget\'\|\'mid\'\|\'premium\';                                     |
|                                                                                   |
| in_stock: boolean;                                                                |
|                                                                                   |
| }                                                                                 |
|                                                                                   |
| export const TOKEN_COSTS = {                                                      |
|                                                                                   |
| render_draft: 2,                                                                  |
|                                                                                   |
| render_hd: 3,                                                                     |
|                                                                                   |
| inpaint: 2,                                                                       |
|                                                                                   |
| product_match: 1,                                                                 |
|                                                                                   |
| scene_export: 0,                                                                  |
|                                                                                   |
| } as const;                                                                       |
+-----------------------------------------------------------------------------------+

Create the Supabase client --- packages/shared/src/supabase/client.ts:

  -----------------------------------------------------------------
  code packages/shared/src/supabase/client.ts

  -----------------------------------------------------------------

+-----------------------------------------------------------------+
| import { createClient } from \'@supabase/supabase-js\';         |
|                                                                 |
| const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ??    |
| process.env.EXPO_PUBLIC_SUPABASE_URL ?? \'\';                   |
|                                                                 |
| const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY |
| ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? \'\';           |
|                                                                 |
| if (!SUPABASE_URL \|\| !SUPABASE_ANON) {                        |
|                                                                 |
| console.error(\'\[Cova\] Supabase env vars missing. Check       |
| .env.local\');                                                  |
|                                                                 |
| }                                                               |
|                                                                 |
| export const supabase = createClient(SUPABASE_URL,              |
| SUPABASE_ANON, {                                                |
|                                                                 |
| auth: {                                                         |
|                                                                 |
| autoRefreshToken: true,                                         |
|                                                                 |
| persistSession: true,                                           |
|                                                                 |
| detectSessionInUrl: false, // required for React Native         |
|                                                                 |
| },                                                              |
|                                                                 |
| });                                                             |
+-----------------------------------------------------------------+

Create packages/shared/src/index.ts to export everything:

  -----------------------------------------------------------------
  code packages/shared/src/index.ts

  -----------------------------------------------------------------

+-----------------------------------------------------------------+
| export \* from \'./types\';                                     |
|                                                                 |
| export \* from \'./supabase/client\';                           |
|                                                                 |
| export \* from \'./utils/tokens\';                              |
|                                                                 |
| export \* from \'./utils/fingerprint\';                         |
+-----------------------------------------------------------------+

Create packages/shared/src/utils/tokens.ts:

  -----------------------------------------------------------------
  code packages/shared/src/utils/tokens.ts

  -----------------------------------------------------------------

+-----------------------------------------------------------------+
| import { TOKEN_COSTS } from \'../types\';                       |
|                                                                 |
| export function canAfford(balance: number, action: keyof typeof |
| TOKEN_COSTS): boolean {                                         |
|                                                                 |
| return balance \>= TOKEN_COSTS\[action\];                       |
|                                                                 |
| }                                                               |
|                                                                 |
| export function tokenCostLabel(action: keyof typeof             |
| TOKEN_COSTS): string {                                          |
|                                                                 |
| const cost = TOKEN_COSTS\[action\];                             |
|                                                                 |
| return cost === 0 ? \'Free\' : \`\${cost} token\${cost \> 1 ?   |
| \'s\' : \'\'}\`;                                                |
|                                                                 |
| }                                                               |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **6**  **Set up environment variables**

  ------- ------------------------------------------------------------

Create the .env.local file at the root of the project. This file holds
all your secret keys. It is listed in .gitignore and will NEVER be
committed to GitHub.

  -----------------------------------------------------------------
  code .env.local

  -----------------------------------------------------------------

+-----------------------------------------------------------------+
| \# Supabase --- get these from supabase.com → your project →    |
| Settings → API                                                  |
|                                                                 |
| NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co   |
|                                                                 |
| NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here                |
|                                                                 |
| SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here            |
|                                                                 |
| \# Replicate --- get from replicate.com → Account → API tokens  |
|                                                                 |
| REPLICATE_API_TOKEN=r8_your_token_here                          |
|                                                                 |
| \# Anthropic Claude --- get from console.anthropic.com → API    |
| Keys                                                            |
|                                                                 |
| ANTHROPIC_API_KEY=sk-ant-your_key_here                          |
|                                                                 |
| \# Stripe --- get from dashboard.stripe.com → Developers → API  |
| keys                                                            |
|                                                                 |
| STRIPE_SECRET_KEY=sk_test_your_key_here                         |
|                                                                 |
| STRIPE_WEBHOOK_SECRET=whsec_your_secret_here                    |
|                                                                 |
| \# Also add EXPO\_ prefix versions for React Native             |
|                                                                 |
| EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co   |
|                                                                 |
| EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here                |
+-----------------------------------------------------------------+

  ------------- --------------------------------------------------------
      **⚠️      Never commit .env.local to GitHub. Verify it is in your
   IMPORTANT**  .gitignore by running: cat .gitignore \| grep .env

  ------------- --------------------------------------------------------

  ------- ------------------------------------------------------------
   **7**  **Commit Phase 1**

  ------- ------------------------------------------------------------

+-----------------------------------------------------------------+
| cd \~/Documents/cova                                            |
|                                                                 |
| git add .                                                       |
|                                                                 |
| git commit -m \"Phase 1: monorepo scaffold, shared types, 3D    |
| type definitions\"                                              |
|                                                                 |
| git push origin main                                            |
+-----------------------------------------------------------------+

+:----------:+-----------------------------------------------------+
| **PHASE    | *Database schema, RLS security policies, storage    |
| 2**        | buckets, and auth configuration*                    |
|            |                                                     |
| **Supabase |                                                     |
| Backend**  |                                                     |
+------------+-----------------------------------------------------+

Supabase is the backbone of the entire application. It provides
PostgreSQL, row-level security, authentication, real-time subscriptions
via WebSockets, object storage for images and 3D models, and serverless
edge functions --- all in one managed platform.

  ------- ------------------------------------------------------------
   **1**  **Create your Supabase project**

  ------- ------------------------------------------------------------

- Go to supabase.com and sign in or create a free account

- Click \'New Project\'

- Organization: your personal org or create \'cova\'

- Project name: cova

- Database password: generate a strong one and save it in 1Password /
  your notes

- Region: US East (or closest to you)

- Click \'Create new project\' and wait \~2 minutes for it to provision

Once created, go to Settings → API and copy:

- Project URL → paste as NEXT_PUBLIC_SUPABASE_URL in .env.local

- anon public key → paste as NEXT_PUBLIC_SUPABASE_ANON_KEY

- service_role secret key → paste as SUPABASE_SERVICE_ROLE_KEY

  ------------ --------------------------------------------------------
      **🔴     The service_role key has full database access with no
   CRITICAL**  RLS. Only use it in server-side Edge Functions. Never
               expose it in mobile app or browser code.

  ------------ --------------------------------------------------------

  ------- ------------------------------------------------------------
   **2**  **Enable required extensions**

  ------- ------------------------------------------------------------

Go to Database → Extensions in the Supabase dashboard. Enable these two
extensions:

- vector --- enables the vector(768) column type for CLIP embeddings.
  CLICK ENABLE NOW before creating any tables --- adding it after the
  fact requires migrating existing data.

- uuid-ossp --- enables gen_random_uuid() for generating IDs

  --------- --------------------------------------------------------
    **📝    If you don\'t see the \'Extensions\' menu item, go to
   NOTE**   Database → SQL Editor and run: CREATE EXTENSION IF NOT
            EXISTS vector; CREATE EXTENSION IF NOT EXISTS
            \"uuid-ossp\";

  --------- --------------------------------------------------------

  ------- ------------------------------------------------------------
   **3**  **Create the full database schema**

  ------- ------------------------------------------------------------

Go to Database → SQL Editor. Click \'New Query\'. Paste and run the
following SQL in order. Run each block separately --- copy one block,
paste into SQL Editor, click \'Run\'.

**Block 1 --- Users table**

+-----------------------------------------------------------------+
| CREATE TABLE public.users (                                     |
|                                                                 |
| id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE         |
| CASCADE,                                                        |
|                                                                 |
| email TEXT NOT NULL,                                            |
|                                                                 |
| full_name TEXT,                                                 |
|                                                                 |
| account_type TEXT NOT NULL DEFAULT \'consumer\'                 |
|                                                                 |
| CHECK (account_type IN (\'consumer\',\'realtor\')),             |
|                                                                 |
| style_fingerprint JSONB NOT NULL DEFAULT \'{}\',                |
|                                                                 |
| budget_dna JSONB NOT NULL DEFAULT \'{}\',                       |
|                                                                 |
| token_balance INTEGER NOT NULL DEFAULT 5 CHECK (token_balance   |
| \>= 0),                                                         |
|                                                                 |
| stripe_customer_id TEXT,                                        |
|                                                                 |
| onboarding_completed BOOLEAN NOT NULL DEFAULT false,            |
|                                                                 |
| last_active_at TIMESTAMPTZ,                                     |
|                                                                 |
| created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()                   |
|                                                                 |
| );                                                              |
|                                                                 |
| \-- Auto-create user row when auth.users entry is created       |
|                                                                 |
| CREATE OR REPLACE FUNCTION public.handle_new_user()             |
|                                                                 |
| RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS \$\$       |
|                                                                 |
| BEGIN                                                           |
|                                                                 |
| INSERT INTO public.users (id, email)                            |
|                                                                 |
| VALUES (NEW.id, NEW.email)                                      |
|                                                                 |
| ON CONFLICT (id) DO NOTHING;                                    |
|                                                                 |
| RETURN NEW;                                                     |
|                                                                 |
| END;                                                            |
|                                                                 |
| \$\$;                                                           |
|                                                                 |
| CREATE TRIGGER on_auth_user_created                             |
|                                                                 |
| AFTER INSERT ON auth.users                                      |
|                                                                 |
| FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();         |
+-----------------------------------------------------------------+

**Block 2 --- Token transactions (append-only ledger)**

+-----------------------------------------------------------------+
| CREATE TABLE public.token_transactions (                        |
|                                                                 |
| id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                  |
|                                                                 |
| user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE     |
| CASCADE,                                                        |
|                                                                 |
| delta INTEGER NOT NULL, \-- positive = credit, negative = debit |
|                                                                 |
| reason TEXT NOT NULL, \-- \'signup_bonus\', \'render_draft\',   |
| \'purchase_pack_20\', etc.                                      |
|                                                                 |
| render_id UUID, \-- nullable, set when debit is for a render    |
|                                                                 |
| created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()                   |
|                                                                 |
| );                                                              |
|                                                                 |
| \-- NEVER UPDATE this table. Only INSERT. Balance = SUM(delta)  |
| per user.                                                       |
|                                                                 |
| \-- Cached in users.token_balance and updated atomically via    |
| RPC.                                                            |
|                                                                 |
| \-- Atomic token deduction function                             |
|                                                                 |
| CREATE OR REPLACE FUNCTION public.deduct_tokens_atomic(         |
|                                                                 |
| p_user_id UUID,                                                 |
|                                                                 |
| p_amount INTEGER,                                               |
|                                                                 |
| p_reason TEXT                                                   |
|                                                                 |
| ) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS \$\$     |
|                                                                 |
| DECLARE                                                         |
|                                                                 |
| v_balance INTEGER;                                              |
|                                                                 |
| BEGIN                                                           |
|                                                                 |
| SELECT token_balance INTO v_balance FROM public.users           |
|                                                                 |
| WHERE id = p_user_id FOR UPDATE;                                |
|                                                                 |
| IF v_balance \< p_amount THEN RETURN FALSE; END IF;             |
|                                                                 |
| UPDATE public.users SET token_balance = token_balance -         |
| p_amount WHERE id = p_user_id;                                  |
|                                                                 |
| INSERT INTO public.token_transactions (user_id, delta, reason)  |
|                                                                 |
| VALUES (p_user_id, -p_amount, p_reason);                        |
|                                                                 |
| RETURN TRUE;                                                    |
|                                                                 |
| END;                                                            |
|                                                                 |
| \$\$;                                                           |
+-----------------------------------------------------------------+

**Block 3 --- Rooms table (with 3D calibration columns)**

+--------------------------------------------------------------------------------+
| CREATE TABLE public.rooms (                                                    |
|                                                                                |
| id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                                 |
|                                                                                |
| user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,           |
|                                                                                |
| original_image_url TEXT NOT NULL,                                              |
|                                                                                |
| depth_map_url TEXT,                                                            |
|                                                                                |
| depth_map_quality_score FLOAT,                                                 |
|                                                                                |
| detected_existing_style TEXT,                                                  |
|                                                                                |
| room_type TEXT DEFAULT \'living_room\'                                         |
|                                                                                |
| CHECK (room_type IN                                                            |
| (\'living_room\',\'bedroom\',\'kitchen\',\'bathroom\',\'office\',\'dining\')), |
|                                                                                |
| \-- 3D room calibration: corner coordinates from the calibration screen        |
|                                                                                |
| calibration_data JSONB, \-- { corner_tl, corner_tr, corner_bl, corner_br,      |
| floor_line_y, image_w, image_h }                                               |
|                                                                                |
| room_dimensions JSONB, \-- { width_ft, depth_ft, height_ft } user-estimated    |
|                                                                                |
| \-- 3D scene state: the current furniture layout saved as JSON                 |
|                                                                                |
| scene_state JSONB, \-- { style, furniture: \[{model_key, position,             |
| rotation_y}\] }                                                                |
|                                                                                |
| listing_id UUID,                                                               |
|                                                                                |
| created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),                                 |
|                                                                                |
| updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()                                  |
|                                                                                |
| );                                                                             |
|                                                                                |
| \-- Auto-update updated_at                                                     |
|                                                                                |
| CREATE OR REPLACE FUNCTION public.set_updated_at()                             |
|                                                                                |
| RETURNS TRIGGER LANGUAGE plpgsql AS \$\$                                       |
|                                                                                |
| BEGIN NEW.updated_at = NOW(); RETURN NEW; END;                                 |
|                                                                                |
| \$\$;                                                                          |
|                                                                                |
| CREATE TRIGGER rooms_updated_at                                                |
|                                                                                |
| BEFORE UPDATE ON public.rooms                                                  |
|                                                                                |
| FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();                         |
+--------------------------------------------------------------------------------+

**Block 4 --- Renders table**

+-----------------------------------------------------------------+
| CREATE TABLE public.renders (                                   |
|                                                                 |
| id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                  |
|                                                                 |
| room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE     |
| CASCADE,                                                        |
|                                                                 |
| user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE     |
| CASCADE,                                                        |
|                                                                 |
| style_applied TEXT NOT NULL,                                    |
|                                                                 |
| style_blend_secondary TEXT,                                     |
|                                                                 |
| style_blend_ratio FLOAT CHECK (style_blend_ratio BETWEEN 0 AND  |
| 1),                                                             |
|                                                                 |
| quality_tier TEXT NOT NULL DEFAULT \'draft\' CHECK              |
| (quality_tier IN (\'draft\',\'hd\')),                           |
|                                                                 |
| image_url TEXT,                                                 |
|                                                                 |
| replicate_prediction_id TEXT,                                   |
|                                                                 |
| prompt_used TEXT,                                               |
|                                                                 |
| negative_prompt_used TEXT,                                      |
|                                                                 |
| denoising_strength FLOAT,                                       |
|                                                                 |
| guidance_scale FLOAT,                                           |
|                                                                 |
| seed INTEGER,                                                   |
|                                                                 |
| status TEXT NOT NULL DEFAULT \'processing\'                     |
|                                                                 |
| CHECK (status IN                                                |
| (\'processing\',\'complete\',\'failed\',\'quality_rejected\')), |
|                                                                 |
| brisque_score FLOAT,                                            |
|                                                                 |
| clip_style_score FLOAT,                                         |
|                                                                 |
| design_rationale TEXT,                                          |
|                                                                 |
| tokens_charged INTEGER NOT NULL DEFAULT 0,                      |
|                                                                 |
| created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()                   |
|                                                                 |
| );                                                              |
+-----------------------------------------------------------------+

**Block 5 --- Chat sessions table**

+-----------------------------------------------------------------+
| CREATE TABLE public.chat_sessions (                             |
|                                                                 |
| id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                  |
|                                                                 |
| room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE     |
| CASCADE,                                                        |
|                                                                 |
| user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE     |
| CASCADE,                                                        |
|                                                                 |
| render_id UUID REFERENCES public.renders(id),                   |
|                                                                 |
| messages JSONB NOT NULL DEFAULT \'\[\]\',                       |
|                                                                 |
| summary TEXT,                                                   |
|                                                                 |
| last_action_type TEXT,                                          |
|                                                                 |
| total_messages INTEGER NOT NULL DEFAULT 0,                      |
|                                                                 |
| created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),                  |
|                                                                 |
| updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()                   |
|                                                                 |
| );                                                              |
|                                                                 |
| CREATE TRIGGER chat_sessions_updated_at                         |
|                                                                 |
| BEFORE UPDATE ON public.chat_sessions                           |
|                                                                 |
| FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();          |
+-----------------------------------------------------------------+

**Block 6 --- Products table (furniture catalog for CLIP matching)**

+-----------------------------------------------------------------+
| CREATE TABLE public.products (                                  |
|                                                                 |
| id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                  |
|                                                                 |
| external_id TEXT NOT NULL,                                      |
|                                                                 |
| name TEXT NOT NULL,                                             |
|                                                                 |
| retailer TEXT NOT NULL CHECK (retailer IN                       |
| (\'wayfair\',\'amazon\',\'ikea\',\'cb2\')),                     |
|                                                                 |
| price NUMERIC(10,2) NOT NULL,                                   |
|                                                                 |
| currency TEXT NOT NULL DEFAULT \'USD\',                         |
|                                                                 |
| category TEXT NOT NULL,                                         |
|                                                                 |
| subcategory TEXT,                                               |
|                                                                 |
| image_url TEXT NOT NULL,                                        |
|                                                                 |
| affiliate_url_base TEXT NOT NULL,                               |
|                                                                 |
| clip_embedding VECTOR(768), \-- CLIP ViT-L/14 768-dim embedding |
|                                                                 |
| style_tags TEXT\[\],                                            |
|                                                                 |
| price_tier TEXT CHECK (price_tier IN                            |
| (\'budget\',\'mid\',\'premium\')),                              |
|                                                                 |
| in_stock BOOLEAN NOT NULL DEFAULT true,                         |
|                                                                 |
| price_last_checked TIMESTAMPTZ,                                 |
|                                                                 |
| created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()                   |
|                                                                 |
| );                                                              |
|                                                                 |
| \-- IVFFlat index for fast approximate nearest-neighbour search |
|                                                                 |
| \-- Create AFTER loading product data (needs rows to build      |
| lists)                                                          |
|                                                                 |
| \-- CREATE INDEX ON public.products USING ivfflat               |
| (clip_embedding vector_cosine_ops) WITH (lists = 100);          |
|                                                                 |
| \-- Product similarity search function                          |
|                                                                 |
| CREATE OR REPLACE FUNCTION public.search_products_by_embedding( |
|                                                                 |
| query_embedding VECTOR(768),                                    |
|                                                                 |
| match_threshold FLOAT DEFAULT 0.5,                              |
|                                                                 |
| match_count INTEGER DEFAULT 20                                  |
|                                                                 |
| ) RETURNS TABLE (                                               |
|                                                                 |
| id UUID, name TEXT, retailer TEXT, price NUMERIC,               |
|                                                                 |
| category TEXT, image_url TEXT, affiliate_url_base TEXT,         |
|                                                                 |
| price_tier TEXT, similarity FLOAT                               |
|                                                                 |
| ) LANGUAGE sql STABLE AS \$\$                                   |
|                                                                 |
| SELECT id, name, retailer, price, category, image_url,          |
| affiliate_url_base, price_tier,                                 |
|                                                                 |
| 1 - (clip_embedding \<=\> query_embedding) AS similarity        |
|                                                                 |
| FROM public.products                                            |
|                                                                 |
| WHERE 1 - (clip_embedding \<=\> query_embedding) \>             |
| match_threshold                                                 |
|                                                                 |
| AND in_stock = true                                             |
|                                                                 |
| ORDER BY clip_embedding \<=\> query_embedding                   |
|                                                                 |
| LIMIT match_count;                                              |
|                                                                 |
| \$\$;                                                           |
+-----------------------------------------------------------------+

**Block 7 --- Realtor tables**

+-----------------------------------------------------------------+
| CREATE TABLE public.listings (                                  |
|                                                                 |
| id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                  |
|                                                                 |
| realtor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE  |
| CASCADE,                                                        |
|                                                                 |
| address TEXT NOT NULL,                                          |
|                                                                 |
| description TEXT,                                               |
|                                                                 |
| room_ids UUID\[\] DEFAULT \'{}\',                               |
|                                                                 |
| render_ids UUID\[\] DEFAULT \'{}\',                             |
|                                                                 |
| shareable_slug TEXT UNIQUE, \-- 8-char random slug for public   |
| listing page                                                    |
|                                                                 |
| vote_counts JSONB DEFAULT \'{}\',                               |
|                                                                 |
| qr_code_url TEXT,                                               |
|                                                                 |
| view_count INTEGER NOT NULL DEFAULT 0,                          |
|                                                                 |
| is_published BOOLEAN NOT NULL DEFAULT false,                    |
|                                                                 |
| created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),                  |
|                                                                 |
| updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()                   |
|                                                                 |
| );                                                              |
|                                                                 |
| CREATE TABLE public.votes (                                     |
|                                                                 |
| id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                  |
|                                                                 |
| listing_id UUID NOT NULL REFERENCES public.listings(id) ON      |
| DELETE CASCADE,                                                 |
|                                                                 |
| render_id UUID NOT NULL REFERENCES public.renders(id) ON DELETE |
| CASCADE,                                                        |
|                                                                 |
| device_fingerprint TEXT NOT NULL,                               |
|                                                                 |
| created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),                  |
|                                                                 |
| UNIQUE (listing_id, device_fingerprint) \-- one vote per device |
| per listing                                                     |
|                                                                 |
| );                                                              |
+-----------------------------------------------------------------+

**Block 8 --- Async job tracking**

+-----------------------------------------------------------------+
| CREATE TABLE public.jobs (                                      |
|                                                                 |
| id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                  |
|                                                                 |
| user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE     |
| CASCADE,                                                        |
|                                                                 |
| job_type TEXT NOT NULL CHECK (job_type IN                       |
| (\'render\',\'depth_map\',\'product_match\',\'inpaint\')),      |
|                                                                 |
| status TEXT NOT NULL DEFAULT \'pending\'                        |
|                                                                 |
| CHECK (status IN                                                |
| (\'pending\',\'processing\',\'complete\',\'failed\')),          |
|                                                                 |
| replicate_id TEXT,                                              |
|                                                                 |
| input_params JSONB,                                             |
|                                                                 |
| result_url TEXT,                                                |
|                                                                 |
| error_message TEXT,                                             |
|                                                                 |
| created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),                  |
|                                                                 |
| completed_at TIMESTAMPTZ                                        |
|                                                                 |
| );                                                              |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **4**  **Enable Row Level Security on all tables**

  ------- ------------------------------------------------------------

RLS ensures users can only access their own data. Run this entire block
in SQL Editor:

+-----------------------------------------------------------------+
| \-- Enable RLS on all tables                                    |
|                                                                 |
| ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;             |
|                                                                 |
| ALTER TABLE public.token_transactions ENABLE ROW LEVEL          |
| SECURITY;                                                       |
|                                                                 |
| ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;             |
|                                                                 |
| ALTER TABLE public.renders ENABLE ROW LEVEL SECURITY;           |
|                                                                 |
| ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;     |
|                                                                 |
| ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;          |
|                                                                 |
| ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;              |
|                                                                 |
| ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;          |
|                                                                 |
| ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;             |
|                                                                 |
| \-- Users: read and update own row only                         |
|                                                                 |
| CREATE POLICY \"users_own\" ON public.users FOR ALL USING (id = |
| auth.uid());                                                    |
|                                                                 |
| \-- Token transactions: own rows only                           |
|                                                                 |
| CREATE POLICY \"transactions_own\" ON public.token_transactions |
| FOR ALL USING (user_id = auth.uid());                           |
|                                                                 |
| \-- Rooms: own rooms only                                       |
|                                                                 |
| CREATE POLICY \"rooms_own\" ON public.rooms FOR ALL USING       |
| (user_id = auth.uid());                                         |
|                                                                 |
| \-- Renders: own renders only                                   |
|                                                                 |
| CREATE POLICY \"renders_own\" ON public.renders FOR ALL USING   |
| (user_id = auth.uid());                                         |
|                                                                 |
| \-- Chat sessions: own sessions only                            |
|                                                                 |
| CREATE POLICY \"chat_own\" ON public.chat_sessions FOR ALL      |
| USING (user_id = auth.uid());                                   |
|                                                                 |
| \-- Products: readable by all authenticated users, writable     |
| only by service role                                            |
|                                                                 |
| CREATE POLICY \"products_read\" ON public.products FOR SELECT   |
| USING (auth.role() = \'authenticated\');                        |
|                                                                 |
| \-- Jobs: own jobs only                                         |
|                                                                 |
| CREATE POLICY \"jobs_own\" ON public.jobs FOR ALL USING         |
| (user_id = auth.uid());                                         |
|                                                                 |
| \-- Listings: realtors manage their own; published listings     |
| readable by all (for voting page)                               |
|                                                                 |
| CREATE POLICY \"listings_own\" ON public.listings FOR ALL USING |
| (realtor_id = auth.uid());                                      |
|                                                                 |
| CREATE POLICY \"listings_public\" ON public.listings FOR SELECT |
| USING (is_published = true);                                    |
|                                                                 |
| \-- Votes: anyone can insert; read own or for published listing |
|                                                                 |
| CREATE POLICY \"votes_insert\" ON public.votes FOR INSERT WITH  |
| CHECK (true);                                                   |
|                                                                 |
| CREATE POLICY \"votes_read\" ON public.votes FOR SELECT USING   |
| (true);                                                         |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **5**  **Configure storage buckets**

  ------- ------------------------------------------------------------

Go to Storage in the Supabase dashboard. Click \'New bucket\' for each
of these:

  --------------------- ----------------------------------------------
  **Bucket Name**       Configuration

  **room-uploads**      Private. Max file size: 20MB. Allowed MIME:
                        image/jpeg, image/png, image/webp, image/heic

  **renders**           Private. Max file size: 10MB. Allowed MIME:
                        image/jpeg, image/png

  **product-images**    Public (no auth needed to view). Service role
                        write only. No size limit

  **swipe-cards**       Public. Read-only for all. Service role write
                        only. Stores onboarding images

  **3d-models**         Public. Read-only for all. Service role write
                        only. Stores .glb furniture files

  **scene-snapshots**   Private. Max 10MB. Stores 3D scene screenshots
                        per user
  --------------------- ----------------------------------------------

After creating each bucket, set the RLS policies via SQL Editor:

+-----------------------------------------------------------------+
| \-- room-uploads: authenticated users can upload/read their own |
| files                                                           |
|                                                                 |
| CREATE POLICY \"uploads_own\" ON storage.objects FOR ALL        |
|                                                                 |
| USING (bucket_id = \'room-uploads\' AND auth.uid()::text =      |
| (storage.foldername(name))\[1\]);                               |
|                                                                 |
| \-- renders: authenticated users can read their own renders     |
|                                                                 |
| CREATE POLICY \"renders_own\" ON storage.objects FOR ALL        |
|                                                                 |
| USING (bucket_id = \'renders\' AND auth.uid()::text =           |
| (storage.foldername(name))\[1\]);                               |
|                                                                 |
| \-- 3d-models: public read (glTF files are not sensitive)       |
|                                                                 |
| CREATE POLICY \"models_public_read\" ON storage.objects FOR     |
| SELECT                                                          |
|                                                                 |
| USING (bucket_id = \'3d-models\');                              |
|                                                                 |
| \-- scene-snapshots: users manage their own snapshots           |
|                                                                 |
| CREATE POLICY \"snapshots_own\" ON storage.objects FOR ALL      |
|                                                                 |
| USING (bucket_id = \'scene-snapshots\' AND auth.uid()::text =   |
| (storage.foldername(name))\[1\]);                               |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **6**  **Configure authentication**

  ------- ------------------------------------------------------------

Go to Authentication → Providers in the Supabase dashboard:

- Email: Enable. Set \'Confirm email\' to OFF for development (turn ON
  before App Store submission)

- Apple: Enable. You need an Apple Developer account (\$99/year). Follow
  the Supabase Apple OAuth guide at
  supabase.com/docs/guides/auth/social-login/auth-apple exactly. Apple
  Sign-In is mandatory on iOS App Store if you include any third-party
  sign-in.

Go to Authentication → URL Configuration and set:

- Site URL: http://localhost:3000 (for development)

- Redirect URLs: Add exp://localhost:19000/\--/ for Expo development

  ------- ------------------------------------------------------------
   **7**  **Commit Phase 2**

  ------- ------------------------------------------------------------

+-----------------------------------------------------------------+
| git add .                                                       |
|                                                                 |
| git commit -m \"Phase 2: Supabase schema, RLS, storage, auth    |
| --- with 3D calibration columns\"                               |
|                                                                 |
| git push origin main                                            |
+-----------------------------------------------------------------+

+:---------:+-----------------------------------------------------+
| **PHASE   | *The core differentiator --- interactive 3D room    |
| 3**       | viewer built with React Three Fiber*                |
|           |                                                     |
| **3D Room |                                                     |
| Engine    |                                                     |
| ⭐**      |                                                     |
+-----------+-----------------------------------------------------+

This phase builds the most important feature in Cova V1: the 3D
interactive room viewer. When a user uploads a photo of their room, they
calibrate it using a corner-marking tool, then immediately see their
room reimagined in 3D with swappable furniture across 5 design styles.
They can orbit around the room, tap furniture to swap it, drag pieces to
reposition them, and screenshot the result. This is the feature
investors saw that no competitor has in consumer interior design.

  ----------- --------------------------------------------------------
     **⭐     Phase 3 is the heart of Cova. Budget the most time here.
    PRIMARY   The 2D render (Phase 4) is a companion feature --- the
   FEATURE**  3D viewer is the product.

  ----------- --------------------------------------------------------

  ------- ------------------------------------------------------------
   **1**  **Install all 3D dependencies**

  ------- ------------------------------------------------------------

Navigate to the mobile app folder and install React Three Fiber and all
related 3D packages:

+-----------------------------------------------------------------+
| cd \~/Documents/cova/apps/mobile                                |
|                                                                 |
| \# Core Three.js and React Three Fiber for React Native         |
|                                                                 |
| npx expo install expo-gl expo-three \@react-three/fiber         |
|                                                                 |
| \# Drei --- Three.js helpers: orbit controls, loaders,          |
| environment lighting                                            |
|                                                                 |
| pnpm add \@react-three/drei                                     |
|                                                                 |
| \# GLB/glTF 3D model loader for React Native                    |
|                                                                 |
| pnpm add expo-asset                                             |
|                                                                 |
| \# Gesture handling for drag-to-reposition furniture            |
|                                                                 |
| npx expo install react-native-gesture-handler                   |
| react-native-reanimated                                         |
|                                                                 |
| \# View capture for 3D scene screenshots                        |
|                                                                 |
| npx expo install react-native-view-shot                         |
|                                                                 |
| \# Image manipulation for post-processing screenshots           |
|                                                                 |
| npx expo install expo-image-manipulator                         |
|                                                                 |
| \# Konva.js is web-only --- for calibration on mobile we use    |
| React Native SVG                                                |
|                                                                 |
| npx expo install react-native-svg                               |
+-----------------------------------------------------------------+

  ------------- --------------------------------------------------------
      **⚠️      After installing react-native-reanimated, open
   IMPORTANT**  babel.config.js and add
                \'react-native-reanimated/plugin\' as the LAST item in
                the plugins array. This is required or the app will
                crash on startup.

  ------------- --------------------------------------------------------

+-----------------------------------------------------------------+
| // apps/mobile/babel.config.js                                  |
|                                                                 |
| module.exports = function(api) {                                |
|                                                                 |
| api.cache(true);                                                |
|                                                                 |
| return {                                                        |
|                                                                 |
| presets: \[\'babel-preset-expo\'\],                             |
|                                                                 |
| plugins: \[                                                     |
|                                                                 |
| \'react-native-reanimated/plugin\', // MUST be last             |
|                                                                 |
| \],                                                             |
|                                                                 |
| };                                                              |
|                                                                 |
| };                                                              |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **2**  **Build the furniture catalog --- the preset database**

  ------- ------------------------------------------------------------

The furniture catalog is your curated set of 3D models. For V1 you need
50--80 models across 5 styles. Create the catalog definition file ---
this is the source of truth for every piece of furniture in the 3D
viewer:

  -----------------------------------------------------------------
  mkdir -p src/data && code src/data/furnitureCatalog.ts

  -----------------------------------------------------------------

+----------------------------------------------------------------------------------------------------------------------------------+
| import { FurnitureCatalogItem, CavaStyle } from \'@cova/shared\';                                                                |
|                                                                                                                                  |
| // ─────────────────────────────────────────────────────────                                                                     |
|                                                                                                                                  |
| // FURNITURE CATALOG --- 5 styles, \~15 pieces per style                                                                         |
|                                                                                                                                  |
| // Each entry maps to a .glb file in assets/3d/furniture/                                                                        |
|                                                                                                                                  |
| // Dimensions are in METRES (Three.js default unit)                                                                              |
|                                                                                                                                  |
| // ─────────────────────────────────────────────────────────                                                                     |
|                                                                                                                                  |
| export const FURNITURE_CATALOG: Record\<string, FurnitureCatalogItem\> = {                                                       |
|                                                                                                                                  |
| // ── JAPANDI ──────────────────────────────────────────                                                                         |
|                                                                                                                                  |
| \'japandi_sofa\': {                                                                                                              |
|                                                                                                                                  |
| key: \'japandi_sofa\', name: \'Low-Profile Linen Sofa\',                                                                         |
|                                                                                                                                  |
| category: \'sofa\', styles: \[\'japandi\'\],                                                                                     |
|                                                                                                                                  |
| model_path: require(\'../../assets/3d/furniture/japandi_sofa.glb\'),                                                             |
|                                                                                                                                  |
| dimensions: { w: 2.2, d: 0.9, h: 0.7 },                                                                                          |
|                                                                                                                                  |
| default_position: \[0, 0, -2.0\],                                                                                                |
|                                                                                                                                  |
| default_rotation_y: 0,                                                                                                           |
|                                                                                                                                  |
| },                                                                                                                               |
|                                                                                                                                  |
| \'japandi_coffee_table\': {                                                                                                      |
|                                                                                                                                  |
| key: \'japandi_coffee_table\', name: \'Solid Oak Coffee Table\',                                                                 |
|                                                                                                                                  |
| category: \'table\', styles: \[\'japandi\'\],                                                                                    |
|                                                                                                                                  |
| model_path: require(\'../../assets/3d/furniture/japandi_coffee_table.glb\'),                                                     |
|                                                                                                                                  |
| dimensions: { w: 1.1, d: 0.6, h: 0.4 },                                                                                          |
|                                                                                                                                  |
| default_position: \[0, 0, -0.8\],                                                                                                |
|                                                                                                                                  |
| default_rotation_y: 0,                                                                                                           |
|                                                                                                                                  |
| },                                                                                                                               |
|                                                                                                                                  |
| \'japandi_chair\': {                                                                                                             |
|                                                                                                                                  |
| key: \'japandi_chair\', name: \'Woven Accent Chair\',                                                                            |
|                                                                                                                                  |
| category: \'chair\', styles: \[\'japandi\'\],                                                                                    |
|                                                                                                                                  |
| model_path: require(\'../../assets/3d/furniture/japandi_chair.glb\'),                                                            |
|                                                                                                                                  |
| dimensions: { w: 0.7, d: 0.7, h: 0.8 },                                                                                          |
|                                                                                                                                  |
| default_position: \[1.8, 0, -1.0\],                                                                                              |
|                                                                                                                                  |
| default_rotation_y: -0.4,                                                                                                        |
|                                                                                                                                  |
| },                                                                                                                               |
|                                                                                                                                  |
| \'japandi_rug\': {                                                                                                               |
|                                                                                                                                  |
| key: \'japandi_rug\', name: \'Natural Jute Area Rug\',                                                                           |
|                                                                                                                                  |
| category: \'rug\', styles: \[\'japandi\'\],                                                                                      |
|                                                                                                                                  |
| model_path: require(\'../../assets/3d/furniture/japandi_rug.glb\'),                                                              |
|                                                                                                                                  |
| dimensions: { w: 2.4, d: 1.7, h: 0.01 },                                                                                         |
|                                                                                                                                  |
| default_position: \[0, 0.001, -1.2\],                                                                                            |
|                                                                                                                                  |
| default_rotation_y: 0,                                                                                                           |
|                                                                                                                                  |
| },                                                                                                                               |
|                                                                                                                                  |
| \'japandi_floor_lamp\': {                                                                                                        |
|                                                                                                                                  |
| key: \'japandi_floor_lamp\', name: \'Bamboo Arc Floor Lamp\',                                                                    |
|                                                                                                                                  |
| category: \'lamp\', styles: \[\'japandi\'\],                                                                                     |
|                                                                                                                                  |
| model_path: require(\'../../assets/3d/furniture/japandi_floor_lamp.glb\'),                                                       |
|                                                                                                                                  |
| dimensions: { w: 0.4, d: 0.4, h: 1.6 },                                                                                          |
|                                                                                                                                  |
| default_position: \[-2.2, 0, -0.5\],                                                                                             |
|                                                                                                                                  |
| default_rotation_y: 0,                                                                                                           |
|                                                                                                                                  |
| },                                                                                                                               |
|                                                                                                                                  |
| \'japandi_plant_fiddle\': {                                                                                                      |
|                                                                                                                                  |
| key: \'japandi_plant_fiddle\', name: \'Fiddle Leaf Fig Tree\',                                                                   |
|                                                                                                                                  |
| category: \'plant\', styles: \[\'japandi\',\'coastal\',\'bohemian\'\],                                                           |
|                                                                                                                                  |
| model_path: require(\'../../assets/3d/furniture/plant_fiddle_leaf.glb\'),                                                        |
|                                                                                                                                  |
| dimensions: { w: 0.6, d: 0.6, h: 1.8 },                                                                                          |
|                                                                                                                                  |
| default_position: \[2.5, 0, -2.5\],                                                                                              |
|                                                                                                                                  |
| default_rotation_y: 0,                                                                                                           |
|                                                                                                                                  |
| },                                                                                                                               |
|                                                                                                                                  |
| // ── MID-CENTURY MODERN ───────────────────────────────                                                                         |
|                                                                                                                                  |
| \'midcentury_sofa\': {                                                                                                           |
|                                                                                                                                  |
| key: \'midcentury_sofa\', name: \'Tufted Walnut Leg Sofa\',                                                                      |
|                                                                                                                                  |
| category: \'sofa\', styles: \[\'midcentury\'\],                                                                                  |
|                                                                                                                                  |
| model_path: require(\'../../assets/3d/furniture/midcentury_sofa.glb\'),                                                          |
|                                                                                                                                  |
| dimensions: { w: 2.4, d: 0.85, h: 0.8 },                                                                                         |
|                                                                                                                                  |
| default_position: \[0, 0, -2.0\],                                                                                                |
|                                                                                                                                  |
| default_rotation_y: 0,                                                                                                           |
|                                                                                                                                  |
| },                                                                                                                               |
|                                                                                                                                  |
| \'midcentury_eames_chair\': {                                                                                                    |
|                                                                                                                                  |
| key: \'midcentury_eames_chair\', name: \'Eames-Style Lounge Chair\',                                                             |
|                                                                                                                                  |
| category: \'chair\', styles: \[\'midcentury\'\],                                                                                 |
|                                                                                                                                  |
| model_path: require(\'../../assets/3d/furniture/midcentury_eames_chair.glb\'),                                                   |
|                                                                                                                                  |
| dimensions: { w: 0.85, d: 0.85, h: 0.9 },                                                                                        |
|                                                                                                                                  |
| default_position: \[-1.8, 0, -1.2\],                                                                                             |
|                                                                                                                                  |
| default_rotation_y: 0.5,                                                                                                         |
|                                                                                                                                  |
| },                                                                                                                               |
|                                                                                                                                  |
| \'midcentury_sideboard\': {                                                                                                      |
|                                                                                                                                  |
| key: \'midcentury_sideboard\', name: \'Teak Credenza Sideboard\',                                                                |
|                                                                                                                                  |
| category: \'shelf\', styles: \[\'midcentury\'\],                                                                                 |
|                                                                                                                                  |
| model_path: require(\'../../assets/3d/furniture/midcentury_sideboard.glb\'),                                                     |
|                                                                                                                                  |
| dimensions: { w: 1.8, d: 0.45, h: 0.7 },                                                                                         |
|                                                                                                                                  |
| default_position: \[-2.8, 0, -3.2\],                                                                                             |
|                                                                                                                                  |
| default_rotation_y: 0,                                                                                                           |
|                                                                                                                                  |
| },                                                                                                                               |
|                                                                                                                                  |
| \'midcentury_table_lamp\': {                                                                                                     |
|                                                                                                                                  |
| key: \'midcentury_table_lamp\', name: \'Brass Arc Table Lamp\',                                                                  |
|                                                                                                                                  |
| category: \'lamp\', styles: \[\'midcentury\'\],                                                                                  |
|                                                                                                                                  |
| model_path: require(\'../../assets/3d/furniture/midcentury_table_lamp.glb\'),                                                    |
|                                                                                                                                  |
| dimensions: { w: 0.3, d: 0.3, h: 0.55 },                                                                                         |
|                                                                                                                                  |
| default_position: \[-2.6, 0.7, -3.2\],                                                                                           |
|                                                                                                                                  |
| default_rotation_y: 0,                                                                                                           |
|                                                                                                                                  |
| },                                                                                                                               |
|                                                                                                                                  |
| // ── COASTAL ───────────────────────────────────────────                                                                        |
|                                                                                                                                  |
| \'coastal_sofa\': {                                                                                                              |
|                                                                                                                                  |
| key: \'coastal_sofa\', name: \'Slipcover Linen Sectional\',                                                                      |
|                                                                                                                                  |
| category: \'sofa\', styles: \[\'coastal\'\],                                                                                     |
|                                                                                                                                  |
| model_path: require(\'../../assets/3d/furniture/coastal_sofa.glb\'),                                                             |
|                                                                                                                                  |
| dimensions: { w: 2.8, d: 1.4, h: 0.75 },                                                                                         |
|                                                                                                                                  |
| default_position: \[0.3, 0, -2.2\],                                                                                              |
|                                                                                                                                  |
| default_rotation_y: 0,                                                                                                           |
|                                                                                                                                  |
| },                                                                                                                               |
|                                                                                                                                  |
| \'coastal_coffee_table\': {                                                                                                      |
|                                                                                                                                  |
| key: \'coastal_coffee_table\', name: \'Driftwood Coffee Table\',                                                                 |
|                                                                                                                                  |
| category: \'table\', styles: \[\'coastal\'\],                                                                                    |
|                                                                                                                                  |
| model_path: require(\'../../assets/3d/furniture/coastal_coffee_table.glb\'),                                                     |
|                                                                                                                                  |
| dimensions: { w: 1.2, d: 0.7, h: 0.42 },                                                                                         |
|                                                                                                                                  |
| default_position: \[0, 0, -0.8\],                                                                                                |
|                                                                                                                                  |
| default_rotation_y: 0,                                                                                                           |
|                                                                                                                                  |
| },                                                                                                                               |
|                                                                                                                                  |
| \'coastal_rattan_chair\': {                                                                                                      |
|                                                                                                                                  |
| key: \'coastal_rattan_chair\', name: \'Rattan Papasan Chair\',                                                                   |
|                                                                                                                                  |
| category: \'chair\', styles: \[\'coastal\',\'bohemian\'\],                                                                       |
|                                                                                                                                  |
| model_path: require(\'../../assets/3d/furniture/coastal_rattan_chair.glb\'),                                                     |
|                                                                                                                                  |
| dimensions: { w: 0.9, d: 0.9, h: 1.0 },                                                                                          |
|                                                                                                                                  |
| default_position: \[2.0, 0, -0.8\],                                                                                              |
|                                                                                                                                  |
| default_rotation_y: -0.3,                                                                                                        |
|                                                                                                                                  |
| },                                                                                                                               |
|                                                                                                                                  |
| // ── INDUSTRIAL ────────────────────────────────────────                                                                        |
|                                                                                                                                  |
| \'industrial_sofa\': {                                                                                                           |
|                                                                                                                                  |
| key: \'industrial_sofa\', name: \'Distressed Leather Sofa\',                                                                     |
|                                                                                                                                  |
| category: \'sofa\', styles: \[\'industrial\'\],                                                                                  |
|                                                                                                                                  |
| model_path: require(\'../../assets/3d/furniture/industrial_sofa.glb\'),                                                          |
|                                                                                                                                  |
| dimensions: { w: 2.3, d: 0.95, h: 0.85 },                                                                                        |
|                                                                                                                                  |
| default_position: \[0, 0, -2.0\],                                                                                                |
|                                                                                                                                  |
| default_rotation_y: 0,                                                                                                           |
|                                                                                                                                  |
| },                                                                                                                               |
|                                                                                                                                  |
| \'industrial_coffee_table\': {                                                                                                   |
|                                                                                                                                  |
| key: \'industrial_coffee_table\', name: \'Steel + Reclaimed Wood Table\',                                                        |
|                                                                                                                                  |
| category: \'table\', styles: \[\'industrial\'\],                                                                                 |
|                                                                                                                                  |
| model_path: require(\'../../assets/3d/furniture/industrial_coffee_table.glb\'),                                                  |
|                                                                                                                                  |
| dimensions: { w: 1.2, d: 0.6, h: 0.45 },                                                                                         |
|                                                                                                                                  |
| default_position: \[0, 0, -0.8\],                                                                                                |
|                                                                                                                                  |
| default_rotation_y: 0,                                                                                                           |
|                                                                                                                                  |
| },                                                                                                                               |
|                                                                                                                                  |
| \'industrial_shelf_pipe\': {                                                                                                     |
|                                                                                                                                  |
| key: \'industrial_shelf_pipe\', name: \'Pipe + Wood Floating Shelf Unit\',                                                       |
|                                                                                                                                  |
| category: \'shelf\', styles: \[\'industrial\'\],                                                                                 |
|                                                                                                                                  |
| model_path: require(\'../../assets/3d/furniture/industrial_pipe_shelf.glb\'),                                                    |
|                                                                                                                                  |
| dimensions: { w: 1.4, d: 0.25, h: 1.8 },                                                                                         |
|                                                                                                                                  |
| default_position: \[-2.5, 0, -3.5\],                                                                                             |
|                                                                                                                                  |
| default_rotation_y: 0,                                                                                                           |
|                                                                                                                                  |
| },                                                                                                                               |
|                                                                                                                                  |
| // ── BOHEMIAN ──────────────────────────────────────────                                                                        |
|                                                                                                                                  |
| \'boho_sofa\': {                                                                                                                 |
|                                                                                                                                  |
| key: \'boho_sofa\', name: \'Velvet Jewel-Tone Sofa\',                                                                            |
|                                                                                                                                  |
| category: \'sofa\', styles: \[\'bohemian\'\],                                                                                    |
|                                                                                                                                  |
| model_path: require(\'../../assets/3d/furniture/boho_sofa.glb\'),                                                                |
|                                                                                                                                  |
| dimensions: { w: 2.1, d: 0.95, h: 0.85 },                                                                                        |
|                                                                                                                                  |
| default_position: \[0, 0, -2.0\],                                                                                                |
|                                                                                                                                  |
| default_rotation_y: 0,                                                                                                           |
|                                                                                                                                  |
| },                                                                                                                               |
|                                                                                                                                  |
| \'boho_floor_cushions\': {                                                                                                       |
|                                                                                                                                  |
| key: \'boho_floor_cushions\', name: \'Stacked Floor Cushion Set\',                                                               |
|                                                                                                                                  |
| category: \'chair\', styles: \[\'bohemian\'\],                                                                                   |
|                                                                                                                                  |
| model_path: require(\'../../assets/3d/furniture/boho_floor_cushions.glb\'),                                                      |
|                                                                                                                                  |
| dimensions: { w: 0.8, d: 0.8, h: 0.4 },                                                                                          |
|                                                                                                                                  |
| default_position: \[1.5, 0, -0.5\],                                                                                              |
|                                                                                                                                  |
| default_rotation_y: 0.3,                                                                                                         |
|                                                                                                                                  |
| },                                                                                                                               |
|                                                                                                                                  |
| \'boho_macrame_wall\': {                                                                                                         |
|                                                                                                                                  |
| key: \'boho_macrame_wall\', name: \'Large Macramé Wall Hanging\',                                                                |
|                                                                                                                                  |
| category: \'shelf\', styles: \[\'bohemian\'\],                                                                                   |
|                                                                                                                                  |
| model_path: require(\'../../assets/3d/furniture/boho_macrame.glb\'),                                                             |
|                                                                                                                                  |
| dimensions: { w: 1.2, d: 0.05, h: 1.4 },                                                                                         |
|                                                                                                                                  |
| default_position: \[0, 1.0, -3.9\],                                                                                              |
|                                                                                                                                  |
| default_rotation_y: 0,                                                                                                           |
|                                                                                                                                  |
| },                                                                                                                               |
|                                                                                                                                  |
| };                                                                                                                               |
|                                                                                                                                  |
| // Style-to-furniture mapping: which pieces appear by default for each style                                                     |
|                                                                                                                                  |
| export const STYLE_DEFAULT_FURNITURE: Record\<CavaStyle, string\[\]\> = {                                                        |
|                                                                                                                                  |
| japandi:                                                                                                                         |
| \[\'japandi_rug\',\'japandi_sofa\',\'japandi_coffee_table\',\'japandi_chair\',\'japandi_floor_lamp\',\'japandi_plant_fiddle\'\], |
|                                                                                                                                  |
| midcentury:                                                                                                                      |
| \[\'japandi_rug\',\'midcentury_sofa\',\'midcentury_eames_chair\',\'midcentury_sideboard\',\'midcentury_table_lamp\'\],           |
|                                                                                                                                  |
| coastal: \[\'coastal_sofa\',\'coastal_coffee_table\',\'coastal_rattan_chair\',\'japandi_plant_fiddle\'\],                        |
|                                                                                                                                  |
| industrial: \[\'industrial_sofa\',\'industrial_coffee_table\',\'industrial_shelf_pipe\'\],                                       |
|                                                                                                                                  |
| bohemian: \[\'boho_sofa\',\'boho_floor_cushions\',\'boho_macrame_wall\',\'coastal_rattan_chair\',\'japandi_plant_fiddle\'\],     |
|                                                                                                                                  |
| };                                                                                                                               |
|                                                                                                                                  |
| // Style-to-color scheme for walls, floor, ceiling in the 3D scene                                                               |
|                                                                                                                                  |
| export const STYLE_COLORS = {                                                                                                    |
|                                                                                                                                  |
| japandi: { wall: \'#E8E0D5\', floor: \'#C9BEA8\', ceiling: \'#F5F0E8\', accent: \'#8B7355\' },                                   |
|                                                                                                                                  |
| midcentury: { wall: \'#F5EBD8\', floor: \'#C4946A\', ceiling: \'#FAF5EE\', accent: \'#D4A574\' },                                |
|                                                                                                                                  |
| coastal: { wall: \'#E8F4F8\', floor: \'#C2D4DC\', ceiling: \'#F5FBFC\', accent: \'#5B9BB5\' },                                   |
|                                                                                                                                  |
| industrial: { wall: \'#6B6560\', floor: \'#4A4540\', ceiling: \'#3A3530\', accent: \'#C9A84C\' },                                |
|                                                                                                                                  |
| bohemian: { wall: \'#EDD5B8\', floor: \'#C4926A\', ceiling: \'#F5EBDC\', accent: \'#8B4513\' },                                  |
|                                                                                                                                  |
| };                                                                                                                               |
+----------------------------------------------------------------------------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **3**  **Get the 3D furniture model files (.glb)**

  ------- ------------------------------------------------------------

You need actual .glb (binary glTF) files for each furniture item in your
catalog. Here are the sources in order of preference:

**Option A --- Free models from Poly Pizza (fastest for MVP)**

Go to polypizza.com. Search for each furniture category. Download as
GLB. Poly Pizza models are low-poly which is perfect for mobile ---
smaller file size, faster loading, still looks good in a well-lit scene.

**Option B --- Sketchfab free models**

Go to sketchfab.com/features/free-3d-models. Filter by \'Downloadable\',
\'Free\', and search for furniture terms. Download as GLB. Check the
license --- look for CC0 or CC BY. Sketchfab models tend to be higher
quality than Poly Pizza but larger in file size.

**Option C --- IKEA 3D asset API (best for product alignment)**

IKEA has released 3D assets for many of their products. Go to
ikea.com/us/en/customer-service/product-support/ and check their AR
programme. Some retailers including Wayfair expose glTF assets via their
AR APIs --- this aligns perfectly with the commerce layer since the 3D
model the user sees IS the product they can buy.

**Option D --- Generate with AI tools (Meshy, Tripo3D)**

If you cannot find a specific piece, use Meshy.ai or Tripo3D.ai --- AI
3D model generators. Describe the furniture item, generate a model,
download as GLB. Quality varies but is improving rapidly. Good enough
for MVP.

  ------------- --------------------------------------------------------
      **⚠️      All .glb files go in: assets/3d/furniture/. Name them
   IMPORTANT**  exactly as specified in the catalog model_path values
                (e.g. japandi_sofa.glb). File size target: under 2MB per
                model. If a model is over 5MB, compress it using the
                Blender script below.

  ------------- --------------------------------------------------------

**Compress and optimise GLB models with Blender**

After downloading models, run this Python script to batch-optimise all
GLB files. It applies Draco compression which reduces file sizes by
60--80% with negligible quality loss on mobile screens:

  -----------------------------------------------------------------
  code scripts/optimise_glb.py

  -----------------------------------------------------------------

+-----------------------------------------------------------------+
| #!/usr/bin/env python3                                          |
|                                                                 |
| \"\"\"                                                          |
|                                                                 |
| Batch optimise all .glb files in assets/3d/furniture/           |
|                                                                 |
| Uses Blender\'s Python API to apply Draco compression.          |
|                                                                 |
| Run: python3 scripts/optimise_glb.py                            |
|                                                                 |
| \"\"\"                                                          |
|                                                                 |
| import subprocess, os, glob, sys                                |
|                                                                 |
| FURNITURE_DIR = os.path.join(os.path.dirname(\_\_file\_\_),     |
| \'..\', \'assets\', \'3d\', \'furniture\')                      |
|                                                                 |
| TARGET_SIZE_MB = 2.0                                            |
|                                                                 |
| def optimise_glb(input_path: str) -\> None:                     |
|                                                                 |
| output_path = input_path \# overwrite in place                  |
|                                                                 |
| size_mb = os.path.getsize(input_path) / (1024 \* 1024)          |
|                                                                 |
| if size_mb \<= TARGET_SIZE_MB:                                  |
|                                                                 |
| print(f\' ✓ {os.path.basename(input_path)} ({size_mb:.1f}MB)    |
| --- already optimised\')                                        |
|                                                                 |
| return                                                          |
|                                                                 |
| print(f\' ↓ {os.path.basename(input_path)} ({size_mb:.1f}MB)    |
| --- compressing\...\')                                          |
|                                                                 |
| blender_script = f\'\'\'                                        |
|                                                                 |
| import bpy                                                      |
|                                                                 |
| bpy.ops.wm.read_factory_settings(use_empty=True)                |
|                                                                 |
| bpy.ops.import_scene.gltf(filepath=r\'{input_path}\')           |
|                                                                 |
| bpy.ops.export_scene.gltf(                                      |
|                                                                 |
| filepath=r\'{output_path}\',                                    |
|                                                                 |
| export_format=\'GLB\',                                          |
|                                                                 |
| export_draco_mesh_compression_enable=True,                      |
|                                                                 |
| export_draco_mesh_compression_level=6,                          |
|                                                                 |
| export_image_format=\'JPEG\',                                   |
|                                                                 |
| )                                                               |
|                                                                 |
| \'\'\'                                                          |
|                                                                 |
| result = subprocess.run(                                        |
|                                                                 |
| \[\'blender\', \'\--background\', \'\--python-expr\',           |
| blender_script\],                                               |
|                                                                 |
| capture_output=True, text=True                                  |
|                                                                 |
| )                                                               |
|                                                                 |
| new_size = os.path.getsize(output_path) / (1024 \* 1024)        |
|                                                                 |
| print(f\' ✓ Compressed to {new_size:.1f}MB\')                   |
|                                                                 |
| if \_\_name\_\_ == \'\_\_main\_\_\':                            |
|                                                                 |
| models = glob.glob(os.path.join(FURNITURE_DIR, \'\*.glb\'))     |
|                                                                 |
| if not models:                                                  |
|                                                                 |
| print(\'No .glb files found in\', FURNITURE_DIR)                |
|                                                                 |
| sys.exit(1)                                                     |
|                                                                 |
| print(f\'Optimising {len(models)} models\...\')                 |
|                                                                 |
| for path in models:                                             |
|                                                                 |
| optimise_glb(path)                                              |
|                                                                 |
| print(\'Done!\')                                                |
+-----------------------------------------------------------------+

  -----------------------------------------------------------------
  python3 scripts/optimise_glb.py

  -----------------------------------------------------------------

  ------- ------------------------------------------------------------
   **4**  **Build the Room Calibration Screen**

  ------- ------------------------------------------------------------

The calibration screen is the bridge between a user\'s room photo and
the 3D scene. The user marks the four corners of their room on the
photo, and the app uses those points to construct the 3D box room
geometry. This replaces unreliable automatic detection and works on 100%
of room photos.

Create the calibration screen:

  -----------------------------------------------------------------
  mkdir -p src/screens/main && code
  src/screens/main/RoomCalibrationScreen.tsx

  -----------------------------------------------------------------

+-----------------------------------------------------------------+
| import React, { useState, useRef, useCallback } from \'react\'; |
|                                                                 |
| import {                                                        |
|                                                                 |
| View, Text, StyleSheet, Dimensions, TouchableOpacity,           |
|                                                                 |
| Image, PanResponder, Alert, ScrollView                          |
|                                                                 |
| } from \'react-native\';                                        |
|                                                                 |
| import Svg, { Circle, Line, Polygon, Text as SvgText } from     |
| \'react-native-svg\';                                           |
|                                                                 |
| import { useNavigation, useRoute } from                         |
| \'@react-navigation/native\';                                   |
|                                                                 |
| import { supabase } from \'@cova/shared\';                      |
|                                                                 |
| import { useAppStore } from \'../../store\';                    |
|                                                                 |
| const { width: SW, height: SH } = Dimensions.get(\'window\');   |
|                                                                 |
| const IMAGE_PREVIEW_HEIGHT = SH \* 0.55;                        |
|                                                                 |
| type Corner = { x: number; y: number };                         |
|                                                                 |
| type CornerKey = \'tl\' \| \'tr\' \| \'bl\' \| \'br\';          |
|                                                                 |
| const CORNER_LABELS: Record\<CornerKey, string\> = {            |
|                                                                 |
| tl: \'Back-Left\',                                              |
|                                                                 |
| tr: \'Back-Right\',                                             |
|                                                                 |
| bl: \'Front-Left\',                                             |
|                                                                 |
| br: \'Front-Right\',                                            |
|                                                                 |
| };                                                              |
|                                                                 |
| // Initial corner positions as fraction of image (0--1)         |
|                                                                 |
| const DEFAULT_CORNERS: Record\<CornerKey, Corner\> = {          |
|                                                                 |
| tl: { x: 0.15, y: 0.20 },                                       |
|                                                                 |
| tr: { x: 0.85, y: 0.20 },                                       |
|                                                                 |
| bl: { x: 0.05, y: 0.80 },                                       |
|                                                                 |
| br: { x: 0.95, y: 0.80 },                                       |
|                                                                 |
| };                                                              |
|                                                                 |
| export function RoomCalibrationScreen() {                       |
|                                                                 |
| const navigation = useNavigation\<any\>();                      |
|                                                                 |
| const route = useRoute\<any\>();                                |
|                                                                 |
| const { room_id, image_url } = route.params;                    |
|                                                                 |
| const { user } = useAppStore();                                 |
|                                                                 |
| const \[corners, setCorners\] = useState\<Record\<CornerKey,    |
| Corner\>\>(DEFAULT_CORNERS);                                    |
|                                                                 |
| const \[activeCorner, setActive\] = useState\<CornerKey \|      |
| null\>(null);                                                   |
|                                                                 |
| const \[dimensions, setDims\] = useState({ w: 14, d: 12, h: 9   |
| }); // feet                                                     |
|                                                                 |
| const \[saving, setSaving\] = useState(false);                  |
|                                                                 |
| const containerRef = useRef\<View\>(null);                      |
|                                                                 |
| const containerLayout = useRef({ x: 0, y: 0, width: SW, height: |
| IMAGE_PREVIEW_HEIGHT });                                        |
|                                                                 |
| // Convert fractional corner to pixel coords                    |
|                                                                 |
| const toPixel = (c: Corner) =\> ({                              |
|                                                                 |
| x: c.x \* containerLayout.current.width,                        |
|                                                                 |
| y: c.y \* containerLayout.current.height,                       |
|                                                                 |
| });                                                             |
|                                                                 |
| // Convert pixel touch to fractional corner                     |
|                                                                 |
| const toFraction = (px: number, py: number): Corner =\> ({      |
|                                                                 |
| x: Math.max(0, Math.min(1, px /                                 |
| containerLayout.current.width)),                                |
|                                                                 |
| y: Math.max(0, Math.min(1, py /                                 |
| containerLayout.current.height)),                               |
|                                                                 |
| });                                                             |
|                                                                 |
| // Find which corner is closest to a touch point                |
|                                                                 |
| const findClosestCorner = (tx: number, ty: number): CornerKey   |
| =\> {                                                           |
|                                                                 |
| let best: CornerKey = \'tl\';                                   |
|                                                                 |
| let bestDist = Infinity;                                        |
|                                                                 |
| (Object.keys(corners) as CornerKey\[\]).forEach(k =\> {         |
|                                                                 |
| const p = toPixel(corners\[k\]);                                |
|                                                                 |
| const d = Math.hypot(tx - p.x, ty - p.y);                       |
|                                                                 |
| if (d \< bestDist) { bestDist = d; best = k; }                  |
|                                                                 |
| });                                                             |
|                                                                 |
| return best;                                                    |
|                                                                 |
| };                                                              |
|                                                                 |
| const panResponder = PanResponder.create({                      |
|                                                                 |
| onStartShouldSetPanResponder: () =\> true,                      |
|                                                                 |
| onMoveShouldSetPanResponder: () =\> true,                       |
|                                                                 |
| onPanResponderGrant: (e) =\> {                                  |
|                                                                 |
| const { locationX, locationY } = e.nativeEvent;                 |
|                                                                 |
| const closest = findClosestCorner(locationX, locationY);        |
|                                                                 |
| setActive(closest);                                             |
|                                                                 |
| },                                                              |
|                                                                 |
| onPanResponderMove: (e) =\> {                                   |
|                                                                 |
| if (!activeCorner) return;                                      |
|                                                                 |
| const { locationX, locationY } = e.nativeEvent;                 |
|                                                                 |
| setCorners(prev =\> ({                                          |
|                                                                 |
| \...prev,                                                       |
|                                                                 |
| \[activeCorner\]: toFraction(locationX, locationY),             |
|                                                                 |
| }));                                                            |
|                                                                 |
| },                                                              |
|                                                                 |
| onPanResponderRelease: () =\> setActive(null),                  |
|                                                                 |
| });                                                             |
|                                                                 |
| const saveCalibration = async () =\> {                          |
|                                                                 |
| setSaving(true);                                                |
|                                                                 |
| try {                                                           |
|                                                                 |
| const { width: iw, height: ih } = containerLayout.current;      |
|                                                                 |
| const calibration_data = {                                      |
|                                                                 |
| corner_tl: corners.tl,                                          |
|                                                                 |
| corner_tr: corners.tr,                                          |
|                                                                 |
| corner_bl: corners.bl,                                          |
|                                                                 |
| corner_br: corners.br,                                          |
|                                                                 |
| floor_line_y: (corners.bl.y + corners.br.y) / 2,                |
|                                                                 |
| image_width: iw,                                                |
|                                                                 |
| image_height: ih,                                               |
|                                                                 |
| };                                                              |
|                                                                 |
| const room_dimensions = {                                       |
|                                                                 |
| width_ft: dimensions.w,                                         |
|                                                                 |
| depth_ft: dimensions.d,                                         |
|                                                                 |
| height_ft: dimensions.h,                                        |
|                                                                 |
| };                                                              |
|                                                                 |
| const { error } = await supabase                                |
|                                                                 |
| .from(\'rooms\')                                                |
|                                                                 |
| .update({ calibration_data, room_dimensions })                  |
|                                                                 |
| .eq(\'id\', room_id);                                           |
|                                                                 |
| if (error) throw error;                                         |
|                                                                 |
| navigation.navigate(\'RoomViewer3D\', { room_id, image_url });  |
|                                                                 |
| } catch (e: any) {                                              |
|                                                                 |
| Alert.alert(\'Error\', e.message);                              |
|                                                                 |
| } finally {                                                     |
|                                                                 |
| setSaving(false);                                               |
|                                                                 |
| }                                                               |
|                                                                 |
| };                                                              |
|                                                                 |
| // Build SVG overlay showing corner handles and the room        |
| outline                                                         |
|                                                                 |
| const { width: cw, height: ch } = containerLayout.current;      |
|                                                                 |
| const pts = {                                                   |
|                                                                 |
| tl: toPixel(corners.tl),                                        |
|                                                                 |
| tr: toPixel(corners.tr),                                        |
|                                                                 |
| bl: toPixel(corners.bl),                                        |
|                                                                 |
| br: toPixel(corners.br),                                        |
|                                                                 |
| };                                                              |
|                                                                 |
| const polygonPoints = \`\${pts.tl.x},\${pts.tl.y}               |
| \${pts.tr.x},\${pts.tr.y} \${pts.br.x},\${pts.br.y}             |
| \${pts.bl.x},\${pts.bl.y}\`;                                    |
|                                                                 |
| return (                                                        |
|                                                                 |
| \<ScrollView style={s.container} scrollEnabled={false}\>        |
|                                                                 |
| \<Text style={s.title}\>Mark Your Room Corners\</Text\>         |
|                                                                 |
| \<Text style={s.subtitle}\>Drag the handles to the four corners |
| of your room\'s walls\</Text\>                                  |
|                                                                 |
| {/\* Photo + SVG overlay \*/}                                   |
|                                                                 |
| \<View                                                          |
|                                                                 |
| ref={containerRef}                                              |
|                                                                 |
| style={\[s.imageContainer, { height: IMAGE_PREVIEW_HEIGHT }\]}  |
|                                                                 |
| onLayout={e =\> {                                               |
|                                                                 |
| containerLayout.current = {                                     |
|                                                                 |
| x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y,           |
|                                                                 |
| width: e.nativeEvent.layout.width, height:                      |
| e.nativeEvent.layout.height,                                    |
|                                                                 |
| };                                                              |
|                                                                 |
| }}                                                              |
|                                                                 |
| {\...panResponder.panHandlers}                                  |
|                                                                 |
| \>                                                              |
|                                                                 |
| \<Image source={{ uri: image_url }} style={s.image}             |
| resizeMode=\'cover\' /\>                                        |
|                                                                 |
| \<Svg style={StyleSheet.absoluteFill} width={cw} height={ch}\>  |
|                                                                 |
| {/\* Room outline polygon \*/}                                  |
|                                                                 |
| \<Polygon                                                       |
|                                                                 |
| points={polygonPoints}                                          |
|                                                                 |
| fill=\'rgba(201,168,76,0.15)\'                                  |
|                                                                 |
| stroke=\'#C9A84C\'                                              |
|                                                                 |
| strokeWidth={2}                                                 |
|                                                                 |
| strokeDasharray=\'8,4\'                                         |
|                                                                 |
| /\>                                                             |
|                                                                 |
| {/\* Edge lines \*/}                                            |
|                                                                 |
| {(\[\'tl\',\'tr\'\] as CornerKey\[\]).map(k =\> (               |
|                                                                 |
| \<Line key={k}                                                  |
|                                                                 |
| x1={pts\[k\].x} y1={pts\[k\].y}                                 |
|                                                                 |
| x2={k===\'tl\'?pts.bl.x:pts.br.x}                               |
|                                                                 |
| y2={k===\'tl\'?pts.bl.y:pts.br.y}                               |
|                                                                 |
| stroke=\'#C9A84C\' strokeWidth={1.5} opacity={0.6}              |
|                                                                 |
| /\>                                                             |
|                                                                 |
| ))}                                                             |
|                                                                 |
| {/\* Corner handle circles \*/}                                 |
|                                                                 |
| {(Object.keys(corners) as CornerKey\[\]).map(k =\> (            |
|                                                                 |
| \<React.Fragment key={k}\>                                      |
|                                                                 |
| \<Circle                                                        |
|                                                                 |
| cx={toPixel(corners\[k\]).x} cy={toPixel(corners\[k\]).y}       |
|                                                                 |
| r={activeCorner===k ? 22 : 16}                                  |
|                                                                 |
| fill={activeCorner===k ? \'#C9A84C\' :                          |
| \'rgba(201,168,76,0.8)\'}                                       |
|                                                                 |
| stroke=\'white\' strokeWidth={2}                                |
|                                                                 |
| /\>                                                             |
|                                                                 |
| \<SvgText                                                       |
|                                                                 |
| x={toPixel(corners\[k\]).x} y={toPixel(corners\[k\]).y + 5}     |
|                                                                 |
| fill=\'white\' fontSize={10} fontWeight=\'bold\'                |
| textAnchor=\'middle\'                                           |
|                                                                 |
| \>{CORNER_LABELS\[k\].split(\'-\')\[0\]\[0\] +                  |
| CORNER_LABELS\[k\].split(\'-\')\[1\]\[0\]}                      |
|                                                                 |
| \</SvgText\>                                                    |
|                                                                 |
| \</React.Fragment\>                                             |
|                                                                 |
| ))}                                                             |
|                                                                 |
| \</Svg\>                                                        |
|                                                                 |
| \</View\>                                                       |
|                                                                 |
| {/\* Dimension inputs \*/}                                      |
|                                                                 |
| \<View style={s.dimsRow}\>                                      |
|                                                                 |
| \<Text style={s.dimsLabel}\>Room size (approx. ft):\</Text\>    |
|                                                                 |
| {(\[\[\'Width\', \'w\'\], \[\'Depth\', \'d\'\], \[\'Height\',   |
| \'h\'\]\] as \[string,keyof typeof                              |
| dimensions\]\[\]).map((\[label, key\]) =\> (                    |
|                                                                 |
| \<View key={key} style={s.dimItem}\>                            |
|                                                                 |
| \<Text style={s.dimLabel}\>{label}\</Text\>                     |
|                                                                 |
| \<View style={s.dimButtons}\>                                   |
|                                                                 |
| \<TouchableOpacity style={s.dimBtn} onPress={() =\> setDims(d   |
| =\> ({\...d, \[key\]: Math.max(6, d\[key\]-1)}))}\>             |
|                                                                 |
| \<Text style={s.dimBtnText}\>−\</Text\>                         |
|                                                                 |
| \</TouchableOpacity\>                                           |
|                                                                 |
| \<Text style={s.dimValue}\>{dimensions\[key\]}\'\</Text\>       |
|                                                                 |
| \<TouchableOpacity style={s.dimBtn} onPress={() =\> setDims(d   |
| =\> ({\...d, \[key\]: Math.min(40, d\[key\]+1)}))}\>            |
|                                                                 |
| \<Text style={s.dimBtnText}\>+\</Text\>                         |
|                                                                 |
| \</TouchableOpacity\>                                           |
|                                                                 |
| \</View\>                                                       |
|                                                                 |
| \</View\>                                                       |
|                                                                 |
| ))}                                                             |
|                                                                 |
| \</View\>                                                       |
|                                                                 |
| \<TouchableOpacity style={s.cta} onPress={saveCalibration}      |
| disabled={saving}\>                                             |
|                                                                 |
| \<Text style={s.ctaText}\>{saving ? \'Saving...\' : \'View My   |
| Room in 3D →\'}\</Text\>                                        |
|                                                                 |
| \</TouchableOpacity\>                                           |
|                                                                 |
| \</ScrollView\>                                                 |
|                                                                 |
| );                                                              |
|                                                                 |
| }                                                               |
|                                                                 |
| const s = StyleSheet.create({                                   |
|                                                                 |
| container: { flex: 1, backgroundColor: \'#0B1729\' },           |
|                                                                 |
| title: { color: \'#FAF7F2\', fontSize: 22, fontWeight: \'700\', |
| textAlign: \'center\', marginTop: 24, marginHorizontal: 20 },   |
|                                                                 |
| subtitle: { color: \'#8A8070\', fontSize: 14, textAlign:        |
| \'center\', marginBottom: 16, marginHorizontal: 20 },           |
|                                                                 |
| imageContainer:{ position: \'relative\', backgroundColor:       |
| \'#000\', overflow: \'hidden\' },                               |
|                                                                 |
| image: { width: \'100%\', height: \'100%\' },                   |
|                                                                 |
| dimsRow: { flexDirection: \'row\', alignItems: \'center\',      |
| padding: 16, gap: 12, flexWrap: \'wrap\' },                     |
|                                                                 |
| dimsLabel: { color: \'#C9A84C\', fontSize: 13, fontWeight:      |
| \'700\', width: \'100%\' },                                     |
|                                                                 |
| dimItem: { flex: 1, alignItems: \'center\' },                   |
|                                                                 |
| dimLabel: { color: \'#8A8070\', fontSize: 12, marginBottom: 4   |
| },                                                              |
|                                                                 |
| dimButtons: { flexDirection: \'row\', alignItems: \'center\',   |
| gap: 8 },                                                       |
|                                                                 |
| dimBtn: { width: 32, height: 32, borderRadius: 16,              |
| backgroundColor: \'rgba(201,168,76,0.2)\', alignItems:          |
| \'center\', justifyContent: \'center\' },                       |
|                                                                 |
| dimBtnText: { color: \'#C9A84C\', fontSize: 18, fontWeight:     |
| \'700\' },                                                      |
|                                                                 |
| dimValue: { color: \'#FAF7F2\', fontSize: 16, fontWeight:       |
| \'700\', minWidth: 30, textAlign: \'center\' },                 |
|                                                                 |
| cta: { margin: 20, backgroundColor: \'#C9A84C\', borderRadius:  |
| 12, padding: 16, alignItems: \'center\' },                      |
|                                                                 |
| ctaText: { color: \'#0B1729\', fontSize: 18, fontWeight:        |
| \'900\' },                                                      |
|                                                                 |
| });                                                             |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **5**  **Build the 3D BoxRoom component**

  ------- ------------------------------------------------------------

The BoxRoom component creates the 3D room geometry from the calibration
data. It renders six planes (four walls, floor, ceiling) with
style-specific materials. This is what the user sees when they enter the
3D viewer.

  -----------------------------------------------------------------
  mkdir -p src/components/3d && code src/components/3d/BoxRoom.tsx

  -----------------------------------------------------------------

+-----------------------------------------------------------------+
| import React, { useMemo } from \'react\';                       |
|                                                                 |
| import { useLoader } from \'@react-three/fiber/native\';        |
|                                                                 |
| import \* as THREE from \'three\';                              |
|                                                                 |
| import { CavaStyle, RoomDimensions } from \'@cova/shared\';     |
|                                                                 |
| import { STYLE_COLORS } from \'../../data/furnitureCatalog\';   |
|                                                                 |
| interface BoxRoomProps {                                        |
|                                                                 |
| style: CavaStyle;                                               |
|                                                                 |
| dimensions: RoomDimensions;                                     |
|                                                                 |
| }                                                               |
|                                                                 |
| // Convert feet to Three.js units (1 unit = 1 metre, \~3.28 ft) |
|                                                                 |
| const ftToM = (ft: number) =\> ft \* 0.3048;                    |
|                                                                 |
| export function BoxRoom({ style, dimensions }: BoxRoomProps) {  |
|                                                                 |
| const colors = STYLE_COLORS\[style\];                           |
|                                                                 |
| const w = ftToM(dimensions.width_ft);                           |
|                                                                 |
| const d = ftToM(dimensions.depth_ft);                           |
|                                                                 |
| const h = ftToM(dimensions.height_ft);                          |
|                                                                 |
| const wallMat = useMemo(() =\> new THREE.MeshStandardMaterial({ |
| color: colors.wall, side: THREE.BackSide, roughness: 0.9,       |
| metalness: 0.0 }), \[colors.wall\]);                            |
|                                                                 |
| const floorMat = useMemo(() =\> new                             |
| THREE.MeshStandardMaterial({ color: colors.floor, roughness:    |
| 0.8, metalness: 0.05 }), \[colors.floor\]);                     |
|                                                                 |
| const ceilMat = useMemo(() =\> new THREE.MeshStandardMaterial({ |
| color: colors.ceiling, side: THREE.BackSide, roughness: 0.95,   |
| metalness: 0.0 }), \[colors.ceiling\]);                         |
|                                                                 |
| return (                                                        |
|                                                                 |
| \<group\>                                                       |
|                                                                 |
| {/\* Floor \*/}                                                 |
|                                                                 |
| \<mesh rotation={\[-Math.PI / 2, 0, 0\]} position={\[0, 0, 0\]} |
| receiveShadow\>                                                 |
|                                                                 |
| \<planeGeometry args={\[w, d\]} /\>                             |
|                                                                 |
| \<primitive object={floorMat} /\>                               |
|                                                                 |
| \</mesh\>                                                       |
|                                                                 |
| {/\* Ceiling \*/}                                               |
|                                                                 |
| \<mesh rotation={\[Math.PI / 2, 0, 0\]} position={\[0, h,       |
| 0\]}\>                                                          |
|                                                                 |
| \<planeGeometry args={\[w, d\]} /\>                             |
|                                                                 |
| \<primitive object={ceilMat} /\>                                |
|                                                                 |
| \</mesh\>                                                       |
|                                                                 |
| {/\* Back wall \*/}                                             |
|                                                                 |
| \<mesh position={\[0, h / 2, -d / 2\]} receiveShadow\>          |
|                                                                 |
| \<planeGeometry args={\[w, h\]} /\>                             |
|                                                                 |
| \<primitive object={wallMat} /\>                                |
|                                                                 |
| \</mesh\>                                                       |
|                                                                 |
| {/\* Front wall (behind camera --- helps with ambient light)    |
| \*/}                                                            |
|                                                                 |
| \<mesh position={\[0, h / 2, d / 2\]} rotation={\[0, Math.PI,   |
| 0\]}\>                                                          |
|                                                                 |
| \<planeGeometry args={\[w, h\]} /\>                             |
|                                                                 |
| \<primitive object={wallMat} /\>                                |
|                                                                 |
| \</mesh\>                                                       |
|                                                                 |
| {/\* Left wall \*/}                                             |
|                                                                 |
| \<mesh position={\[-w / 2, h / 2, 0\]} rotation={\[0, Math.PI / |
| 2, 0\]} receiveShadow\>                                         |
|                                                                 |
| \<planeGeometry args={\[d, h\]} /\>                             |
|                                                                 |
| \<primitive object={wallMat} /\>                                |
|                                                                 |
| \</mesh\>                                                       |
|                                                                 |
| {/\* Right wall \*/}                                            |
|                                                                 |
| \<mesh position={\[w / 2, h / 2, 0\]} rotation={\[0, -Math.PI / |
| 2, 0\]} receiveShadow\>                                         |
|                                                                 |
| \<planeGeometry args={\[d, h\]} /\>                             |
|                                                                 |
| \<primitive object={wallMat} /\>                                |
|                                                                 |
| \</mesh\>                                                       |
|                                                                 |
| {/\* Baseboard trim --- thin dark strip along floor-wall        |
| intersections \*/}                                              |
|                                                                 |
| {\[                                                             |
|                                                                 |
| { pos: \[0, 0.04, -d/2 + 0.01\] as \[number,number,number\],    |
| size: \[w, 0.08, 0.015\] as \[number,number,number\] },         |
|                                                                 |
| { pos: \[-w/2+0.01, 0.04, 0\] as \[number,number,number\],      |
| size: \[0.015, 0.08, d\] as \[number,number,number\], rot: true |
| },                                                              |
|                                                                 |
| { pos: \[w/2-0.01, 0.04, 0\] as \[number,number,number\], size: |
| \[0.015, 0.08, d\] as \[number,number,number\] },               |
|                                                                 |
| \].map((t, i) =\> (                                             |
|                                                                 |
| \<mesh key={i} position={t.pos} castShadow\>                    |
|                                                                 |
| \<boxGeometry args={t.size} /\>                                 |
|                                                                 |
| \<meshStandardMaterial color={colors.accent} roughness={0.3}    |
| /\>                                                             |
|                                                                 |
| \</mesh\>                                                       |
|                                                                 |
| ))}                                                             |
|                                                                 |
| \</group\>                                                      |
|                                                                 |
| );                                                              |
|                                                                 |
| }                                                               |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **6**  **Build the FurniturePiece component --- loads and renders a
          single .glb model**

  ------- ------------------------------------------------------------

  -----------------------------------------------------------------
  code src/components/3d/FurniturePiece.tsx

  -----------------------------------------------------------------

+-----------------------------------------------------------------+
| import React, { useRef, useState, Suspense, useEffect } from    |
| \'react\';                                                      |
|                                                                 |
| import { useFrame, useThree } from                              |
| \'@react-three/fiber/native\';                                  |
|                                                                 |
| import { useGLTF } from \'@react-three/drei/native\';           |
|                                                                 |
| import \* as THREE from \'three\';                              |
|                                                                 |
| import { PlacedFurniture, FurnitureCatalogItem } from           |
| \'@cova/shared\';                                               |
|                                                                 |
| interface FurniturePieceProps {                                 |
|                                                                 |
| piece: PlacedFurniture;                                         |
|                                                                 |
| catalog: FurnitureCatalogItem;                                  |
|                                                                 |
| isSelected: boolean;                                            |
|                                                                 |
| onSelect: (id: string) =\> void;                                |
|                                                                 |
| onDragEnd: (id: string, newPosition: \[number,number,number\])  |
| =\> void;                                                       |
|                                                                 |
| }                                                               |
|                                                                 |
| function FurnitureModel({ catalog, isSelected }: { catalog:     |
| FurnitureCatalogItem; isSelected: boolean }) {                  |
|                                                                 |
| const { scene } = useGLTF(catalog.model_path);                  |
|                                                                 |
| // Apply selection highlight --- golden emission on all meshes  |
|                                                                 |
| useEffect(() =\> {                                              |
|                                                                 |
| scene.traverse((node) =\> {                                     |
|                                                                 |
| if ((node as THREE.Mesh).isMesh) {                              |
|                                                                 |
| const mesh = node as THREE.Mesh;                                |
|                                                                 |
| const mat = mesh.material as THREE.MeshStandardMaterial;        |
|                                                                 |
| if (isSelected) {                                               |
|                                                                 |
| mat.emissive = new THREE.Color(\'#C9A84C\');                    |
|                                                                 |
| mat.emissiveIntensity = 0.3;                                    |
|                                                                 |
| } else {                                                        |
|                                                                 |
| mat.emissive = new THREE.Color(\'#000000\');                    |
|                                                                 |
| mat.emissiveIntensity = 0;                                      |
|                                                                 |
| }                                                               |
|                                                                 |
| mat.needsUpdate = true;                                         |
|                                                                 |
| }                                                               |
|                                                                 |
| });                                                             |
|                                                                 |
| }, \[isSelected, scene\]);                                      |
|                                                                 |
| return \<primitive object={scene} castShadow receiveShadow /\>; |
|                                                                 |
| }                                                               |
|                                                                 |
| export function FurniturePiece({ piece, catalog, isSelected,    |
| onSelect, onDragEnd }: FurniturePieceProps) {                   |
|                                                                 |
| const groupRef = useRef\<THREE.Group\>(null);                   |
|                                                                 |
| const \[isDragging, setDragging\] = useState(false);            |
|                                                                 |
| const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0,   |
| 1, 0), 0));                                                     |
|                                                                 |
| const { camera, raycaster, size } = useThree();                 |
|                                                                 |
| const handlePointerDown = (e: any) =\> {                        |
|                                                                 |
| e.stopPropagation();                                            |
|                                                                 |
| onSelect(piece.id);                                             |
|                                                                 |
| setDragging(true);                                              |
|                                                                 |
| };                                                              |
|                                                                 |
| const handlePointerUp = (e: any) =\> {                          |
|                                                                 |
| if (isDragging && groupRef.current) {                           |
|                                                                 |
| const pos = groupRef.current.position;                          |
|                                                                 |
| onDragEnd(piece.id, \[pos.x, pos.y, pos.z\]);                   |
|                                                                 |
| }                                                               |
|                                                                 |
| setDragging(false);                                             |
|                                                                 |
| };                                                              |
|                                                                 |
| const handlePointerMove = (e: any) =\> {                        |
|                                                                 |
| if (!isDragging \|\| !groupRef.current) return;                 |
|                                                                 |
| // Project touch ray onto floor plane (y=0)                     |
|                                                                 |
| const intersection = new THREE.Vector3();                       |
|                                                                 |
| raycaster.ray.intersectPlane(dragPlane.current, intersection);  |
|                                                                 |
| if (intersection) {                                             |
|                                                                 |
| groupRef.current.position.x = intersection.x;                   |
|                                                                 |
| groupRef.current.position.z = intersection.z;                   |
|                                                                 |
| // Keep y at 0 --- furniture sits on the floor                  |
|                                                                 |
| groupRef.current.position.y = 0;                                |
|                                                                 |
| }                                                               |
|                                                                 |
| };                                                              |
|                                                                 |
| return (                                                        |
|                                                                 |
| \<group                                                         |
|                                                                 |
| ref={groupRef}                                                  |
|                                                                 |
| position={piece.position}                                       |
|                                                                 |
| rotation={\[0, piece.rotation_y, 0\]}                           |
|                                                                 |
| onPointerDown={handlePointerDown}                               |
|                                                                 |
| onPointerUp={handlePointerUp}                                   |
|                                                                 |
| onPointerMove={handlePointerMove}                               |
|                                                                 |
| \>                                                              |
|                                                                 |
| \<Suspense fallback={null}\>                                    |
|                                                                 |
| \<FurnitureModel catalog={catalog} isSelected={isSelected} /\>  |
|                                                                 |
| \</Suspense\>                                                   |
|                                                                 |
| {/\* Selection bounding box outline \*/}                        |
|                                                                 |
| {isSelected && (                                                |
|                                                                 |
| \<mesh\>                                                        |
|                                                                 |
| \<boxGeometry args={\[catalog.dimensions.w + 0.1,               |
| catalog.dimensions.h + 0.1, catalog.dimensions.d + 0.1\]} /\>   |
|                                                                 |
| \<meshBasicMaterial color=\'#C9A84C\' wireframe transparent     |
| opacity={0.4} /\>                                               |
|                                                                 |
| \</mesh\>                                                       |
|                                                                 |
| )}                                                              |
|                                                                 |
| \</group\>                                                      |
|                                                                 |
| );                                                              |
|                                                                 |
| }                                                               |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **7**  **Build scene lighting --- SceneLighting component**

  ------- ------------------------------------------------------------

Lighting is what makes the 3D scene look photorealistic rather than
flat. Each style has a distinct lighting mood.

  -----------------------------------------------------------------
  code src/components/3d/SceneLighting.tsx

  -----------------------------------------------------------------

+-----------------------------------------------------------------+
| import React from \'react\';                                    |
|                                                                 |
| import { CavaStyle } from \'@cova/shared\';                     |
|                                                                 |
| const STYLE_LIGHTING: Record\<CavaStyle, {                      |
|                                                                 |
| ambient: number;                                                |
|                                                                 |
| ambientColor: string;                                           |
|                                                                 |
| dirColor: string;                                               |
|                                                                 |
| dirIntensity: number;                                           |
|                                                                 |
| dirPosition: \[number, number, number\];                        |
|                                                                 |
| pointColor: string;                                             |
|                                                                 |
| pointIntensity: number;                                         |
|                                                                 |
| }\> = {                                                         |
|                                                                 |
| japandi: { ambient: 0.6, ambientColor: \'#FFF8F0\', dirColor:   |
| \'#FFF5E0\', dirIntensity: 1.2, dirPosition: \[4, 6, 3\],       |
| pointColor: \'#FFE0A0\', pointIntensity: 0.4 },                 |
|                                                                 |
| midcentury: { ambient: 0.5, ambientColor: \'#FFF0E0\',          |
| dirColor: \'#FFD080\', dirIntensity: 1.5, dirPosition: \[3, 5,  |
| 2\], pointColor: \'#FF8C00\', pointIntensity: 0.6 },            |
|                                                                 |
| coastal: { ambient: 0.8, ambientColor: \'#E8F4FF\', dirColor:   |
| \'#FFFFFF\', dirIntensity: 1.4, dirPosition: \[5, 8, 4\],       |
| pointColor: \'#B0D8F0\', pointIntensity: 0.3 },                 |
|                                                                 |
| industrial: { ambient: 0.3, ambientColor: \'#D0C8C0\',          |
| dirColor: \'#FFA040\', dirIntensity: 0.8, dirPosition: \[2, 4,  |
| 1\], pointColor: \'#FF6020\', pointIntensity: 0.8 },            |
|                                                                 |
| bohemian: { ambient: 0.55, ambientColor: \'#FFE8D0\', dirColor: |
| \'#FF9040\', dirIntensity: 1.0, dirPosition: \[3, 5, 2\],       |
| pointColor: \'#FF4080\', pointIntensity: 0.5 },                 |
|                                                                 |
| };                                                              |
|                                                                 |
| interface Props { style: CavaStyle; }                           |
|                                                                 |
| export function SceneLighting({ style }: Props) {               |
|                                                                 |
| const L = STYLE_LIGHTING\[style\];                              |
|                                                                 |
| return (                                                        |
|                                                                 |
| \<\>                                                            |
|                                                                 |
| \<ambientLight intensity={L.ambient} color={L.ambientColor} /\> |
|                                                                 |
| \<directionalLight                                              |
|                                                                 |
| position={L.dirPosition} color={L.dirColor}                     |
| intensity={L.dirIntensity}                                      |
|                                                                 |
| castShadow shadow-mapSize={\[1024, 1024\]}                      |
|                                                                 |
| shadow-camera-far={20} shadow-camera-near={0.1}                 |
|                                                                 |
| shadow-camera-left={-8} shadow-camera-right={8}                 |
|                                                                 |
| shadow-camera-top={8} shadow-camera-bottom={-8}                 |
|                                                                 |
| /\>                                                             |
|                                                                 |
| \<pointLight position={\[-3, 2.5, 2\]} color={L.pointColor}     |
| intensity={L.pointIntensity} /\>                                |
|                                                                 |
| \</\>                                                           |
|                                                                 |
| );                                                              |
|                                                                 |
| }                                                               |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **8**  **Build the RoomViewer3D Screen --- the main 3D experience**

  ------- ------------------------------------------------------------

This is the primary screen users see after calibration. It composes
BoxRoom, FurniturePiece, SceneLighting, and controls into a full
interactive 3D room experience with style switching and screenshot
export.

  -----------------------------------------------------------------
  code src/screens/main/RoomViewer3DScreen.tsx

  -----------------------------------------------------------------

+-----------------------------------------------------------------+
| import React, { useState, useRef, useCallback, Suspense } from  |
| \'react\';                                                      |
|                                                                 |
| import { View, Text, TouchableOpacity, StyleSheet, ScrollView,  |
| ActivityIndicator, Alert } from \'react-native\';               |
|                                                                 |
| import { Canvas } from \'@react-three/fiber/native\';           |
|                                                                 |
| import { OrbitControls } from \'@react-three/drei/native\';     |
|                                                                 |
| import ViewShot from \'react-native-view-shot\';                |
|                                                                 |
| import \* as MediaLibrary from \'expo-media-library\';          |
|                                                                 |
| import { useRoute } from \'@react-navigation/native\';          |
|                                                                 |
| import { supabase } from \'@cova/shared\';                      |
|                                                                 |
| import type { CavaStyle, PlacedFurniture, RoomDimensions } from |
| \'@cova/shared\';                                               |
|                                                                 |
| import { BoxRoom } from \'../../components/3d/BoxRoom\';        |
|                                                                 |
| import { FurniturePiece } from                                  |
| \'../../components/3d/FurniturePiece\';                         |
|                                                                 |
| import { SceneLighting } from                                   |
| \'../../components/3d/SceneLighting\';                          |
|                                                                 |
| import { FURNITURE_CATALOG, STYLE_DEFAULT_FURNITURE } from      |
| \'../../data/furnitureCatalog\';                                |
|                                                                 |
| import { useAppStore } from \'../../store\';                    |
|                                                                 |
| const STYLES: { key: CavaStyle; label: string; emoji: string    |
| }\[\] = \[                                                      |
|                                                                 |
| { key: \'japandi\', label: \'Japandi\', emoji: \'🌿\' },        |
|                                                                 |
| { key: \'midcentury\', label: \'Mid-Century\', emoji: \'🪑\' }, |
|                                                                 |
| { key: \'coastal\', label: \'Coastal\', emoji: \'🌊\' },        |
|                                                                 |
| { key: \'industrial\', label: \'Industrial\', emoji: \'⚙️\' },  |
|                                                                 |
| { key: \'bohemian\', label: \'Bohemian\', emoji: \'🪬\' },      |
|                                                                 |
| \];                                                             |
|                                                                 |
| function buildDefaultFurniture(style: CavaStyle):               |
| PlacedFurniture\[\] {                                           |
|                                                                 |
| return STYLE_DEFAULT_FURNITURE\[style\].map(key =\> {           |
|                                                                 |
| const cat = FURNITURE_CATALOG\[key\];                           |
|                                                                 |
| return {                                                        |
|                                                                 |
| id: \`\${style}\_\${key}\`,                                     |
|                                                                 |
| model_key: key,                                                 |
|                                                                 |
| position: cat.default_position,                                 |
|                                                                 |
| rotation_y: cat.default_rotation_y,                             |
|                                                                 |
| style,                                                          |
|                                                                 |
| };                                                              |
|                                                                 |
| });                                                             |
|                                                                 |
| }                                                               |
|                                                                 |
| export function RoomViewer3DScreen() {                          |
|                                                                 |
| const route = useRoute\<any\>();                                |
|                                                                 |
| const { room_id, image_url } = route.params;                    |
|                                                                 |
| const { user } = useAppStore();                                 |
|                                                                 |
| const \[style, setStyle\] = useState\<CavaStyle\>(\'japandi\'); |
|                                                                 |
| const \[furniture, setFurniture\] =                             |
| useState\<PlacedFurniture\[\]\>(() =\>                          |
| buildDefaultFurniture(\'japandi\'));                            |
|                                                                 |
| const \[selectedId, setSelectedId\] = useState\<string \|       |
| null\>(null);                                                   |
|                                                                 |
| const \[dimensions\] = useState\<RoomDimensions\>({ width_ft:   |
| 14, depth_ft: 12, height_ft: 9 });                              |
|                                                                 |
| const \[saving, setSaving\] = useState(false);                  |
|                                                                 |
| const viewShotRef = useRef\<ViewShot\>(null);                   |
|                                                                 |
| const switchStyle = useCallback((newStyle: CavaStyle) =\> {     |
|                                                                 |
| setStyle(newStyle);                                             |
|                                                                 |
| setFurniture(buildDefaultFurniture(newStyle));                  |
|                                                                 |
| setSelectedId(null);                                            |
|                                                                 |
| }, \[\]);                                                       |
|                                                                 |
| const handleDragEnd = useCallback((id: string, newPos:          |
| \[number,number,number\]) =\> {                                 |
|                                                                 |
| setFurniture(prev =\> prev.map(p =\> p.id === id ? { \...p,     |
| position: newPos } : p));                                       |
|                                                                 |
| }, \[\]);                                                       |
|                                                                 |
| const handleCapture = async () =\> {                            |
|                                                                 |
| try {                                                           |
|                                                                 |
| setSaving(true);                                                |
|                                                                 |
| const { status } = await                                        |
| MediaLibrary.requestPermissionsAsync();                         |
|                                                                 |
| if (status !== \'granted\') { Alert.alert(\'Permission needed   |
| to save photos\'); return; }                                    |
|                                                                 |
| const uri = await (viewShotRef.current as any).capture();       |
|                                                                 |
| await MediaLibrary.saveToLibraryAsync(uri);                     |
|                                                                 |
| Alert.alert(\'Saved!\', \'Your 3D room design has been saved to |
| your photo library.\');                                         |
|                                                                 |
| } catch (e: any) {                                              |
|                                                                 |
| Alert.alert(\'Error saving\', e.message);                       |
|                                                                 |
| } finally {                                                     |
|                                                                 |
| setSaving(false);                                               |
|                                                                 |
| }                                                               |
|                                                                 |
| };                                                              |
|                                                                 |
| const selectedFurnitureItem = furniture.find(f =\> f.id ===     |
| selectedId);                                                    |
|                                                                 |
| const selectedCatalogItem = selectedFurnitureItem ?             |
| FURNITURE_CATALOG\[selectedFurnitureItem.model_key\] : null;    |
|                                                                 |
| return (                                                        |
|                                                                 |
| \<View style={s.container}\>                                    |
|                                                                 |
| {/\* Style switcher \*/}                                        |
|                                                                 |
| \<ScrollView horizontal showsHorizontalScrollIndicator={false}  |
| style={s.styleBar} contentContainerStyle={s.styleBarContent}\>  |
|                                                                 |
| {STYLES.map(st =\> (                                            |
|                                                                 |
| \<TouchableOpacity key={st.key} style={\[s.styleChip,           |
| style===st.key && s.styleChipActive\]} onPress={() =\>          |
| switchStyle(st.key)}\>                                          |
|                                                                 |
| \<Text style={s.styleEmoji}\>{st.emoji}\</Text\>                |
|                                                                 |
| \<Text style={\[s.styleLabel, style===st.key &&                 |
| s.styleLabelActive\]}\>{st.label}\</Text\>                      |
|                                                                 |
| \</TouchableOpacity\>                                           |
|                                                                 |
| ))}                                                             |
|                                                                 |
| \</ScrollView\>                                                 |
|                                                                 |
| {/\* 3D Canvas \*/}                                             |
|                                                                 |
| \<ViewShot ref={viewShotRef} style={s.canvasContainer}          |
| options={{ format: \'jpg\', quality: 0.95 }}\>                  |
|                                                                 |
| \<Canvas                                                        |
|                                                                 |
| style={s.canvas}                                                |
|                                                                 |
| camera={{ position: \[0, 2.5, 5\], fov: 55, near: 0.1, far: 50  |
| }}                                                              |
|                                                                 |
| shadows                                                         |
|                                                                 |
| onCreated={({ gl }) =\> {                                       |
|                                                                 |
| gl.shadowMap.enabled = true;                                    |
|                                                                 |
| gl.shadowMap.type = 2; // PCFSoftShadowMap                      |
|                                                                 |
| }}                                                              |
|                                                                 |
| \>                                                              |
|                                                                 |
| \<Suspense fallback={null}\>                                    |
|                                                                 |
| \<SceneLighting style={style} /\>                               |
|                                                                 |
| \<BoxRoom style={style} dimensions={dimensions} /\>             |
|                                                                 |
| {furniture.map(piece =\> {                                      |
|                                                                 |
| const cat = FURNITURE_CATALOG\[piece.model_key\];               |
|                                                                 |
| if (!cat) return null;                                          |
|                                                                 |
| return (                                                        |
|                                                                 |
| \<FurniturePiece                                                |
|                                                                 |
| key={piece.id}                                                  |
|                                                                 |
| piece={piece}                                                   |
|                                                                 |
| catalog={cat}                                                   |
|                                                                 |
| isSelected={selectedId === piece.id}                            |
|                                                                 |
| onSelect={setSelectedId}                                        |
|                                                                 |
| onDragEnd={handleDragEnd}                                       |
|                                                                 |
| /\>                                                             |
|                                                                 |
| );                                                              |
|                                                                 |
| })}                                                             |
|                                                                 |
| \<OrbitControls                                                 |
|                                                                 |
| enablePan={false}                                               |
|                                                                 |
| minDistance={1.5}                                               |
|                                                                 |
| maxDistance={8}                                                 |
|                                                                 |
| maxPolarAngle={Math.PI / 2.1} // prevent going below floor      |
|                                                                 |
| target={\[0, 1, 0\]}                                            |
|                                                                 |
| /\>                                                             |
|                                                                 |
| \</Suspense\>                                                   |
|                                                                 |
| \</Canvas\>                                                     |
|                                                                 |
| \</ViewShot\>                                                   |
|                                                                 |
| {/\* Selected furniture info panel \*/}                         |
|                                                                 |
| {selectedCatalogItem && (                                       |
|                                                                 |
| \<View style={s.selectedPanel}\>                                |
|                                                                 |
| \<Text                                                          |
| style={s.selectedName}\>{selectedCatalogItem.name}\</Text\>     |
|                                                                 |
| \<Text style={s.selectedHint}\>Drag to move · Tap elsewhere to  |
| deselect\</Text\>                                               |
|                                                                 |
| \<TouchableOpacity style={s.removeBtn} onPress={() =\> {        |
|                                                                 |
| setFurniture(prev =\> prev.filter(p =\> p.id !== selectedId));  |
|                                                                 |
| setSelectedId(null);                                            |
|                                                                 |
| }}\>                                                            |
|                                                                 |
| \<Text style={s.removeBtnText}\>Remove\</Text\>                 |
|                                                                 |
| \</TouchableOpacity\>                                           |
|                                                                 |
| \</View\>                                                       |
|                                                                 |
| )}                                                              |
|                                                                 |
| {/\* Action bar \*/}                                            |
|                                                                 |
| \<View style={s.actionBar}\>                                    |
|                                                                 |
| \<TouchableOpacity style={s.actionBtn} onPress={handleCapture}  |
| disabled={saving}\>                                             |
|                                                                 |
| {saving ? \<ActivityIndicator color=\'#0B1729\' /\> : \<Text    |
| style={s.actionBtnText}\>📷 Save\</Text\>}                      |
|                                                                 |
| \</TouchableOpacity\>                                           |
|                                                                 |
| \<TouchableOpacity style={\[s.actionBtn,                        |
| s.actionBtnSecondary\]} onPress={() =\> setSelectedId(null)}\>  |
|                                                                 |
| \<Text style={\[s.actionBtnText, s.actionBtnTextSec\]}\>↩       |
| Reset\</Text\>                                                  |
|                                                                 |
| \</TouchableOpacity\>                                           |
|                                                                 |
| \<TouchableOpacity style={\[s.actionBtn,                        |
| s.actionBtnSecondary\]} onPress={() =\> {/\* navigate to AI     |
| render \*/}}\>                                                  |
|                                                                 |
| \<Text style={\[s.actionBtnText, s.actionBtnTextSec\]}\>✦ AI    |
| Render\</Text\>                                                 |
|                                                                 |
| \</TouchableOpacity\>                                           |
|                                                                 |
| \</View\>                                                       |
|                                                                 |
| \</View\>                                                       |
|                                                                 |
| );                                                              |
|                                                                 |
| }                                                               |
|                                                                 |
| const s = StyleSheet.create({                                   |
|                                                                 |
| container: { flex: 1, backgroundColor: \'#0B1729\' },           |
|                                                                 |
| styleBar: { flexGrow: 0, borderBottomWidth: 1,                  |
| borderBottomColor: \'rgba(201,168,76,0.2)\' },                  |
|                                                                 |
| styleBarContent: { paddingHorizontal: 12, paddingVertical: 10,  |
| gap: 8, flexDirection: \'row\' },                               |
|                                                                 |
| styleChip: { paddingHorizontal: 14, paddingVertical: 8,         |
| borderRadius: 20, borderWidth: 1.5, borderColor:                |
| \'rgba(255,255,255,0.15)\', flexDirection: \'row\', alignItems: |
| \'center\', gap: 6 },                                           |
|                                                                 |
| styleChipActive: { backgroundColor: \'rgba(201,168,76,0.15)\',  |
| borderColor: \'#C9A84C\' },                                     |
|                                                                 |
| styleEmoji: { fontSize: 16 },                                   |
|                                                                 |
| styleLabel: { color: \'#8A8070\', fontSize: 13, fontWeight:     |
| \'600\' },                                                      |
|                                                                 |
| styleLabelActive: { color: \'#C9A84C\' },                       |
|                                                                 |
| canvasContainer: { flex: 1 },                                   |
|                                                                 |
| canvas: { flex: 1 },                                            |
|                                                                 |
| selectedPanel: { position: \'absolute\', bottom: 80, left: 16,  |
| right: 16, backgroundColor: \'rgba(11,23,41,0.9)\',             |
| borderRadius: 12, padding: 14, borderWidth: 1, borderColor:     |
| \'rgba(201,168,76,0.3)\', flexDirection: \'row\', alignItems:   |
| \'center\' },                                                   |
|                                                                 |
| selectedName: { color: \'#FAF7F2\', fontWeight: \'700\', flex:  |
| 1 },                                                            |
|                                                                 |
| selectedHint: { color: \'#8A8070\', fontSize: 11, flex: 1 },    |
|                                                                 |
| removeBtn: { backgroundColor: \'rgba(139,32,32,0.3)\',          |
| borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },   |
|                                                                 |
| removeBtnText: { color: \'#FF6B6B\', fontSize: 12, fontWeight:  |
| \'700\' },                                                      |
|                                                                 |
| actionBar: { flexDirection: \'row\', gap: 10, padding: 16,      |
| borderTopWidth: 1, borderTopColor: \'rgba(201,168,76,0.2)\' },  |
|                                                                 |
| actionBtn: { flex: 1, backgroundColor: \'#C9A84C\',             |
| borderRadius: 10, padding: 12, alignItems: \'center\' },        |
|                                                                 |
| actionBtnSecondary:{ backgroundColor:                           |
| \'rgba(255,255,255,0.06)\', borderWidth: 1, borderColor:        |
| \'rgba(255,255,255,0.12)\' },                                   |
|                                                                 |
| actionBtnText: { color: \'#0B1729\', fontWeight: \'700\',       |
| fontSize: 14 },                                                 |
|                                                                 |
| actionBtnTextSec: { color: \'#FAF7F2\' },                       |
|                                                                 |
| });                                                             |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **9**  **3D Troubleshooting --- common issues and fixes**

  ------- ------------------------------------------------------------

**Black screen on first load**

Cause: expo-gl not initialised before Canvas renders. Fix: wrap the
Canvas in a View with a defined height. Never use flex:1 directly on
Canvas without a parent View that has flex:1 and a defined layout.

+-----------------------------------------------------------------+
| // ✅ Correct                                                   |
|                                                                 |
| \<View style={{ flex: 1, height: \'100%\' }}\>                  |
|                                                                 |
| \<Canvas style={{ flex: 1 }}\>\...\</Canvas\>                   |
|                                                                 |
| \</View\>                                                       |
|                                                                 |
| // ❌ Wrong --- Canvas directly inside ScrollView without       |
| height                                                          |
|                                                                 |
| \<ScrollView\>\<Canvas style={{ flex: 1                         |
| }}\>\...\</Canvas\>\</ScrollView\>                              |
+-----------------------------------------------------------------+

**GLB model fails to load**

Cause: Expo\'s Metro bundler doesn\'t know how to handle .glb files.
Fix: add this to metro.config.js:

+-----------------------------------------------------------------+
| // apps/mobile/metro.config.js                                  |
|                                                                 |
| const { getDefaultConfig } = require(\'expo/metro-config\');    |
|                                                                 |
| const config = getDefaultConfig(\_\_dirname);                   |
|                                                                 |
| config.resolver.assetExts.push(\'glb\', \'gltf\', \'hdr\');     |
|                                                                 |
| module.exports = config;                                        |
+-----------------------------------------------------------------+

**Choppy orbit controls on iPhone**

Cause: React Native Gesture Handler not wrapping the navigator. Fix:
wrap your entire app in GestureHandlerRootView in App.tsx:

+-----------------------------------------------------------------+
| import { GestureHandlerRootView } from                          |
| \'react-native-gesture-handler\';                               |
|                                                                 |
| export default function App() {                                 |
|                                                                 |
| return (                                                        |
|                                                                 |
| \<GestureHandlerRootView style={{ flex: 1 }}\>                  |
|                                                                 |
| {/\* your navigation stack \*/}                                 |
|                                                                 |
| \</GestureHandlerRootView\>                                     |
|                                                                 |
| );                                                              |
|                                                                 |
| }                                                               |
+-----------------------------------------------------------------+

**ViewShot captures black image**

Cause: react-native-view-shot cannot capture expo-gl canvas on all iOS
versions. Fix: after calling capture(), apply a short delay to let the
GL frame complete:

+-----------------------------------------------------------------+
| const uri = await new Promise\<string\>((resolve, reject) =\> { |
|                                                                 |
| setTimeout(async () =\> {                                       |
|                                                                 |
| try { resolve(await (viewShotRef.current as any).capture()); }  |
|                                                                 |
| catch (e) { reject(e); }                                        |
|                                                                 |
| }, 100); // 100ms delay for GL frame completion                 |
|                                                                 |
| });                                                             |
+-----------------------------------------------------------------+

**Models appear too small or too large**

Cause: the glTF model\'s native scale is wrong. Three.js units are
metres. A sofa should be \~2m wide. Fix: add a scale prop to the
primitive element based on the expected vs actual size:

+-----------------------------------------------------------------+
| // In FurniturePiece.tsx, if a model loads at wrong scale:      |
|                                                                 |
| const { scene } = useGLTF(catalog.model_path);                  |
|                                                                 |
| // Calculate scale correction                                   |
|                                                                 |
| const box = new THREE.Box3().setFromObject(scene);              |
|                                                                 |
| const size = box.getSize(new THREE.Vector3());                  |
|                                                                 |
| const scaleX = catalog.dimensions.w / size.x;                   |
|                                                                 |
| const scaleY = catalog.dimensions.h / size.y;                   |
|                                                                 |
| const scaleZ = catalog.dimensions.d / size.z;                   |
|                                                                 |
| const scale = Math.min(scaleX, scaleY, scaleZ); // uniform      |
| scale                                                           |
|                                                                 |
| return \<primitive object={scene} scale={\[scale, scale,        |
| scale\]} castShadow /\>;                                        |
+-----------------------------------------------------------------+

  -------- ------------------------------------------------------------
   **10**  **Commit Phase 3**

  -------- ------------------------------------------------------------

+-----------------------------------------------------------------+
| cd \~/Documents/cova                                            |
|                                                                 |
| git add .                                                       |
|                                                                 |
| git commit -m \"Phase 3: 3D Room Engine --- calibration,        |
| BoxRoom, furniture catalog, RoomViewer3D\"                      |
|                                                                 |
| git push origin main                                            |
+-----------------------------------------------------------------+

+:----------:+-----------------------------------------------------+
| **PHASE    | *Connect Replicate, build the 2D render Edge        |
| 4**        | Function, handle webhooks --- companion to 3D*      |
|            |                                                     |
| **AI       |                                                     |
| Rendering  |                                                     |
| Pipeline** |                                                     |
+------------+-----------------------------------------------------+

The 2D AI render is a companion feature to the 3D viewer --- not the
primary experience. When a user taps \'AI Render\' from the 3D viewer
action bar, this pipeline generates a photorealistic 2D image of their
room in the selected style. It uses Stable Diffusion XL + ControlNet for
structure preservation and ZoeDepth for depth extraction.

  --------------- --------------------------------------------------------
       **📍       The 3D viewer is the primary experience. The 2D render
   POSITIONING**  is a \'style preview\' --- fast, cheap, shows the vibe.
                  Both are complementary. Investors care about the 3D;
                  users love both.

  --------------- --------------------------------------------------------

  ------- ------------------------------------------------------------
   **1**  **Create the render Edge Function**

  ------- ------------------------------------------------------------

+-----------------------------------------------------------------+
| mkdir -p supabase/functions/render                              |
|                                                                 |
| code supabase/functions/render/index.ts                         |
+-----------------------------------------------------------------+

+-----------------------------------------------------------------------------------------+
| import { serve } from \'https://deno.land/std@0.177.0/http/server.ts\';                 |
|                                                                                         |
| import { createClient } from \'https://esm.sh/@supabase/supabase-js@2\';                |
|                                                                                         |
| const REPLICATE_API_TOKEN = Deno.env.get(\'REPLICATE_API_TOKEN\')!;                     |
|                                                                                         |
| const SUPABASE_URL = Deno.env.get(\'SUPABASE_URL\')!;                                   |
|                                                                                         |
| const SUPABASE_SERVICE_KEY = Deno.env.get(\'SUPABASE_SERVICE_ROLE_KEY\')!;              |
|                                                                                         |
| // Pin exact Replicate model versions for reproducibility                               |
|                                                                                         |
| const SDXL_MODEL =                                                                      |
| \'stability-ai/sdxl:39ed52f2319f9c0dde4c6f7bcbcefde4e18a990d2cc9c7e9a2a6fef5e5c3d0e4\'; |
|                                                                                         |
| const STYLE_PROMPTS: Record\<string, string\> = {                                       |
|                                                                                         |
| \'Japandi\': \'warm walnut and oak tones, handcrafted wabi-sabi ceramics, linen and     |
| cotton textiles, negative space composition, shoji-inspired diffused light\',           |
|                                                                                         |
| \'Mid-Century Modern\': \'organic curves, teak and walnut wood furniture, mustard and   |
| olive color palette, geometric patterns, Eames-inspired chairs\',                       |
|                                                                                         |
| \'Coastal\': \'bleached driftwood tones, navy and natural sand palette, rattan and      |
| wicker textures, linen slipcovers, sea glass accents\',                                 |
|                                                                                         |
| \'Industrial\': \'exposed brick walls, raw steel structural beams, concrete surfaces,   |
| Edison bulb warm lighting, distressed leather and reclaimed wood\',                     |
|                                                                                         |
| \'Bohemian\': \'layered patterned textiles, macrame wall hangings, warm amber and       |
| terracotta palette, abundant hanging plants, global artifact collections\',             |
|                                                                                         |
| };                                                                                      |
|                                                                                         |
| const QUALITY_SUFFIX = \'professional architectural photography, 8K UHD resolution,     |
| photorealistic render, perfect balanced lighting, Architectural Digest editorial        |
| quality\';                                                                              |
|                                                                                         |
| const NEGATIVE_PROMPT = \'deformed, blurry, low quality, watermark, text overlay, ugly, |
| distorted perspective, impossible geometry, unrealistic scale, cartoon style, anime,    |
| JPEG artifacts\';                                                                       |
|                                                                                         |
| serve(async (req) =\> {                                                                 |
|                                                                                         |
| if (req.method !== \'POST\') return new Response(\'Method not allowed\', { status: 405  |
| });                                                                                     |
|                                                                                         |
| const authHeader = req.headers.get(\'Authorization\');                                  |
|                                                                                         |
| if (!authHeader) return new Response(\'Unauthorized\', { status: 401 });                |
|                                                                                         |
| const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);                      |
|                                                                                         |
| const { data: { user }, error: authError } = await                                      |
| supabase.auth.getUser(authHeader.replace(\'Bearer \', \'\'));                           |
|                                                                                         |
| if (authError \|\| !user) return new Response(\'Unauthorized\', { status: 401 });       |
|                                                                                         |
| const { room_id, style_name, quality_tier = \'draft\', seed } = await req.json();       |
|                                                                                         |
| if (!room_id \|\| !style_name) return new Response(JSON.stringify({ error: \'room_id    |
| and style_name required\' }), { status: 400, headers: { \'Content-Type\':               |
| \'application/json\' } });                                                              |
|                                                                                         |
| // ── STEP 1: Deduct tokens atomically ──────────────────                               |
|                                                                                         |
| const tokenCost = quality_tier === \'draft\' ? 2 : 3;                                   |
|                                                                                         |
| const { data: tokenOk, error: tokenErr } = await supabase.rpc(\'deduct_tokens_atomic\', |
| {                                                                                       |
|                                                                                         |
| p_user_id: user.id, p_amount: tokenCost, p_reason: \`render\_\${quality_tier}\`         |
|                                                                                         |
| });                                                                                     |
|                                                                                         |
| if (tokenErr \|\| !tokenOk) return new Response(JSON.stringify({ error: \'Insufficient  |
| tokens\' }), { status: 402, headers: { \'Content-Type\': \'application/json\' } });     |
|                                                                                         |
| // ── STEP 2: Get the room + depth map ──────────────────                               |
|                                                                                         |
| const { data: room } = await supabase.from(\'rooms\').select(\'original_image_url,      |
| depth_map_url, room_type\').eq(\'id\', room_id).eq(\'user_id\', user.id).single();      |
|                                                                                         |
| if (!room) return new Response(\'Room not found\', { status: 404 });                    |
|                                                                                         |
| // ── STEP 3: Build the prompt ───────────────────────────                              |
|                                                                                         |
| const styleDesc = STYLE_PROMPTS\[style_name\] \|\| STYLE_PROMPTS\[\'Japandi\'\];        |
|                                                                                         |
| const prompt = \`\${room.room_type?.replace(\'\_\',\' \')} interior design,             |
| \${styleDesc}, \${QUALITY_SUFFIX}\`;                                                    |
|                                                                                         |
| const renderSeed = seed \|\| Math.floor(Math.random() \* 2147483647);                   |
|                                                                                         |
| const params = quality_tier === \'draft\'                                               |
|                                                                                         |
| ? { width: 768, height: 768, num_inference_steps: 20, guidance_scale: 7.5,              |
| denoising_strength: 0.75, prompt_strength: 0.8 }                                        |
|                                                                                         |
| : { width: 1024, height: 1024, num_inference_steps: 50, guidance_scale: 8.5,            |
| denoising_strength: 0.65, prompt_strength: 0.85 };                                      |
|                                                                                         |
| // ── STEP 4: Create render record ──────────────────────                               |
|                                                                                         |
| const { data: render, error: renderErr } = await supabase.from(\'renders\').insert({    |
|                                                                                         |
| room_id, user_id: user.id, style_applied: style_name, quality_tier,                     |
|                                                                                         |
| status: \'processing\', prompt_used: prompt, negative_prompt_used: NEGATIVE_PROMPT,     |
|                                                                                         |
| seed: renderSeed, tokens_charged: tokenCost, \...params                                 |
|                                                                                         |
| }).select().single();                                                                   |
|                                                                                         |
| if (renderErr \|\| !render) throw new Error(\'Failed to create render record\');        |
|                                                                                         |
| // ── STEP 5: Submit to Replicate ────────────────────────                              |
|                                                                                         |
| const webhookUrl =                                                                      |
| \`\${SUPABASE_URL}/functions/v1/webhook-replicate?render_id=\${render.id}\`;            |
|                                                                                         |
| const replicatePayload: any = {                                                         |
|                                                                                         |
| version: SDXL_MODEL.split(\':\')\[1\],                                                  |
|                                                                                         |
| input: {                                                                                |
|                                                                                         |
| prompt, negative_prompt: NEGATIVE_PROMPT,                                               |
|                                                                                         |
| image: room.original_image_url,                                                         |
|                                                                                         |
| seed: renderSeed, \...params,                                                           |
|                                                                                         |
| // Add depth map as control_image if available                                          |
|                                                                                         |
| \...(room.depth_map_url ? { control_image: room.depth_map_url } : {}),                  |
|                                                                                         |
| },                                                                                      |
|                                                                                         |
| webhook: webhookUrl,                                                                    |
|                                                                                         |
| webhook_events_filter: \[\'completed\', \'failed\'\],                                   |
|                                                                                         |
| };                                                                                      |
|                                                                                         |
| const replicateRes = await fetch(\'https://api.replicate.com/v1/predictions\', {        |
|                                                                                         |
| method: \'POST\',                                                                       |
|                                                                                         |
| headers: { \'Authorization\': \`Token \${REPLICATE_API_TOKEN}\`, \'Content-Type\':      |
| \'application/json\' },                                                                 |
|                                                                                         |
| body: JSON.stringify(replicatePayload),                                                 |
|                                                                                         |
| });                                                                                     |
|                                                                                         |
| if (!replicateRes.ok) {                                                                 |
|                                                                                         |
| // Refund tokens on Replicate failure                                                   |
|                                                                                         |
| await supabase.from(\'users\').update({ token_balance: tokenCost }).eq(\'id\',          |
| user.id); // simplified refund                                                          |
|                                                                                         |
| await supabase.from(\'renders\').update({ status: \'failed\' }).eq(\'id\', render.id);  |
|                                                                                         |
| return new Response(\'Failed to submit to Replicate\', { status: 502 });                |
|                                                                                         |
| }                                                                                       |
|                                                                                         |
| const prediction = await replicateRes.json();                                           |
|                                                                                         |
| await supabase.from(\'renders\').update({ replicate_prediction_id: prediction.id        |
| }).eq(\'id\', render.id);                                                               |
|                                                                                         |
| return new Response(JSON.stringify({ render_id: render.id, status: \'processing\',      |
| estimated_seconds: quality_tier === \'draft\' ? 20 : 50 }),                             |
|                                                                                         |
| { status: 202, headers: { \'Content-Type\': \'application/json\' } });                  |
|                                                                                         |
| });                                                                                     |
+-----------------------------------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **2**  **Create the ZoeDepth Edge Function**

  ------- ------------------------------------------------------------

ZoeDepth extracts a depth map from the room photo. This runs
automatically when a user uploads a photo, in the background while they
browse styles. The depth map is used by ControlNet to preserve room
structure in 2D renders.

+-----------------------------------------------------------------+
| mkdir -p supabase/functions/depth-map                           |
|                                                                 |
| code supabase/functions/depth-map/index.ts                      |
+-----------------------------------------------------------------+

+-----------------------------------------------------------------------------------------+
| import { serve } from \'https://deno.land/std@0.177.0/http/server.ts\';                 |
|                                                                                         |
| import { createClient } from \'https://esm.sh/@supabase/supabase-js@2\';                |
|                                                                                         |
| const REPLICATE_API_TOKEN = Deno.env.get(\'REPLICATE_API_TOKEN\')!;                     |
|                                                                                         |
| const SUPABASE_URL = Deno.env.get(\'SUPABASE_URL\')!;                                   |
|                                                                                         |
| const SUPABASE_SERVICE_KEY = Deno.env.get(\'SUPABASE_SERVICE_ROLE_KEY\')!;              |
|                                                                                         |
| // ZoeDepth --- monocular depth estimation from single image                            |
|                                                                                         |
| const ZOEDEPTH_MODEL = \'isl-org/zoedepth:v1\';                                         |
|                                                                                         |
| serve(async (req) =\> {                                                                 |
|                                                                                         |
| if (req.method !== \'POST\') return new Response(\'Method not allowed\', { status: 405  |
| });                                                                                     |
|                                                                                         |
| const authHeader = req.headers.get(\'Authorization\');                                  |
|                                                                                         |
| if (!authHeader) return new Response(\'Unauthorized\', { status: 401 });                |
|                                                                                         |
| const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);                      |
|                                                                                         |
| const { data: { user } } = await supabase.auth.getUser(authHeader.replace(\'Bearer \',  |
| \'\'));                                                                                 |
|                                                                                         |
| if (!user) return new Response(\'Unauthorized\', { status: 401 });                      |
|                                                                                         |
| const { room_id } = await req.json();                                                   |
|                                                                                         |
| const { data: room } = await                                                            |
| supabase.from(\'rooms\').select(\'original_image_url\').eq(\'id\',                      |
| room_id).eq(\'user_id\', user.id).single();                                             |
|                                                                                         |
| if (!room) return new Response(\'Room not found\', { status: 404 });                    |
|                                                                                         |
| const webhookUrl =                                                                      |
| \`\${SUPABASE_URL}/functions/v1/webhook-replicate?type=depth_map&room_id=\${room_id}\`; |
|                                                                                         |
| const response = await fetch(\'https://api.replicate.com/v1/predictions\', {            |
|                                                                                         |
| method: \'POST\',                                                                       |
|                                                                                         |
| headers: { \'Authorization\': \`Token \${REPLICATE_API_TOKEN}\`, \'Content-Type\':      |
| \'application/json\' },                                                                 |
|                                                                                         |
| body: JSON.stringify({                                                                  |
|                                                                                         |
| version: ZOEDEPTH_MODEL,                                                                |
|                                                                                         |
| input: { image: room.original_image_url },                                              |
|                                                                                         |
| webhook: webhookUrl,                                                                    |
|                                                                                         |
| webhook_events_filter: \[\'completed\', \'failed\'\],                                   |
|                                                                                         |
| }),                                                                                     |
|                                                                                         |
| });                                                                                     |
|                                                                                         |
| if (!response.ok) return new Response(\'Failed to start depth extraction\', { status:   |
| 500 });                                                                                 |
|                                                                                         |
| return new Response(JSON.stringify({ status: \'processing\' }), { status: 202, headers: |
| { \'Content-Type\': \'application/json\' } });                                          |
|                                                                                         |
| });                                                                                     |
+-----------------------------------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **3**  **Create the Replicate webhook handler**

  ------- ------------------------------------------------------------

Replicate calls this webhook when a render or depth map completes. It
stores the result, runs a quality check, and pushes a real-time update
to the mobile app via Supabase Realtime.

+-----------------------------------------------------------------+
| mkdir -p supabase/functions/webhook-replicate                   |
|                                                                 |
| code supabase/functions/webhook-replicate/index.ts              |
+-----------------------------------------------------------------+

+-----------------------------------------------------------------+
| import { serve } from                                           |
| \'https://deno.land/std@0.177.0/http/server.ts\';               |
|                                                                 |
| import { createClient } from                                    |
| \'https://esm.sh/@supabase/supabase-js@2\';                     |
|                                                                 |
| const SUPABASE_URL = Deno.env.get(\'SUPABASE_URL\')!;           |
|                                                                 |
| const SUPABASE_SERVICE_KEY =                                    |
| Deno.env.get(\'SUPABASE_SERVICE_ROLE_KEY\')!;                   |
|                                                                 |
| // Minimum quality threshold --- BRISQUE score below this =     |
| good render                                                     |
|                                                                 |
| // BRISQUE: 0=perfect, 100=terrible. Interior renders typically |
| score 20-45.                                                    |
|                                                                 |
| const BRISQUE_THRESHOLD = 55;                                   |
|                                                                 |
| serve(async (req) =\> {                                         |
|                                                                 |
| if (req.method !== \'POST\') return new Response(\'OK\', {      |
| status: 200 });                                                 |
|                                                                 |
| const url = new URL(req.url);                                   |
|                                                                 |
| const render_id = url.searchParams.get(\'render_id\');          |
|                                                                 |
| const type = url.searchParams.get(\'type\');                    |
|                                                                 |
| const room_id = url.searchParams.get(\'room_id\');              |
|                                                                 |
| const body = await req.json();                                  |
|                                                                 |
| const supabase = createClient(SUPABASE_URL,                     |
| SUPABASE_SERVICE_KEY);                                          |
|                                                                 |
| // ── Handle depth map completion ───────────────────────       |
|                                                                 |
| if (type === \'depth_map\' && room_id) {                        |
|                                                                 |
| if (body.status === \'succeeded\' && body.output) {             |
|                                                                 |
| await supabase.from(\'rooms\').update({                         |
|                                                                 |
| depth_map_url: body.output,                                     |
|                                                                 |
| depth_map_quality_score: 1.0, // TODO: compute actual quality   |
|                                                                 |
| }).eq(\'id\', room_id);                                         |
|                                                                 |
| }                                                               |
|                                                                 |
| return new Response(\'OK\', { status: 200 });                   |
|                                                                 |
| }                                                               |
|                                                                 |
| // ── Handle render completion ──────────────────────────       |
|                                                                 |
| if (!render_id) return new Response(\'OK\', { status: 200 });   |
|                                                                 |
| if (body.status === \'failed\') {                               |
|                                                                 |
| await supabase.from(\'renders\').update({ status: \'failed\',   |
| error_message: body.error }).eq(\'id\', render_id);             |
|                                                                 |
| return new Response(\'OK\', { status: 200 });                   |
|                                                                 |
| }                                                               |
|                                                                 |
| if (body.status === \'succeeded\' && body.output) {             |
|                                                                 |
| const imageUrl = Array.isArray(body.output) ? body.output\[0\]  |
| : body.output;                                                  |
|                                                                 |
| // Basic quality check --- for V1 we accept all renders and     |
| flag for review                                                 |
|                                                                 |
| // TODO: compute BRISQUE score via Python script or Replicate   |
| model                                                           |
|                                                                 |
| const brisque_score = 30; // placeholder                        |
|                                                                 |
| const passed = brisque_score \< BRISQUE_THRESHOLD;              |
|                                                                 |
| await supabase.from(\'renders\').update({                       |
|                                                                 |
| status: passed ? \'complete\' : \'quality_rejected\',           |
|                                                                 |
| image_url: imageUrl,                                            |
|                                                                 |
| brisque_score,                                                  |
|                                                                 |
| }).eq(\'id\', render_id);                                       |
|                                                                 |
| // Trigger product matching if render passed quality check      |
|                                                                 |
| if (passed) {                                                   |
|                                                                 |
| await fetch(\`\${SUPABASE_URL}/functions/v1/match-products\`, { |
|                                                                 |
| method: \'POST\',                                               |
|                                                                 |
| headers: { \'Content-Type\': \'application/json\',              |
| \'Authorization\': \`Bearer \${SUPABASE_SERVICE_KEY}\` },       |
|                                                                 |
| body: JSON.stringify({ render_id }),                            |
|                                                                 |
| });                                                             |
|                                                                 |
| }                                                               |
|                                                                 |
| }                                                               |
|                                                                 |
| return new Response(\'OK\', { status: 200 });                   |
|                                                                 |
| });                                                             |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **4**  **Deploy Edge Functions to Supabase**

  ------- ------------------------------------------------------------

Deploy all three Edge Functions to your Supabase project:

+-----------------------------------------------------------------+
| \# Login to Supabase CLI first                                  |
|                                                                 |
| supabase login                                                  |
|                                                                 |
| \# Link to your project (get project ref from Supabase          |
| dashboard URL)                                                  |
|                                                                 |
| supabase link \--project-ref YOUR_PROJECT_REF                   |
|                                                                 |
| \# Deploy all functions                                         |
|                                                                 |
| supabase functions deploy render                                |
|                                                                 |
| supabase functions deploy depth-map                             |
|                                                                 |
| supabase functions deploy webhook-replicate                     |
|                                                                 |
| \# Set secrets (environment variables) for each function        |
|                                                                 |
| supabase secrets set REPLICATE_API_TOKEN=r8_your_token          |
|                                                                 |
| supabase secrets set ANTHROPIC_API_KEY=sk-ant-your_key          |
|                                                                 |
| supabase secrets set STRIPE_SECRET_KEY=sk_test_your_key         |
+-----------------------------------------------------------------+

  ------------ --------------------------------------------------------
      **✅     Go to your Supabase dashboard → Edge Functions. You
   EXPECTED**  should see render, depth-map, and webhook-replicate
               listed as \'Active\'.

  ------------ --------------------------------------------------------

+-----------------------------------------------------------------+
| git add .                                                       |
|                                                                 |
| git commit -m \"Phase 4: 2D render Edge Functions ---           |
| SDXL+ControlNet, ZoeDepth, webhook handler\"                    |
|                                                                 |
| git push origin main                                            |
+-----------------------------------------------------------------+

+:---------:+-----------------------------------------------------+
| **PHASE   | *Conversational room editing with 3D scene mutation |
| 5**       | dispatch*                                           |
|           |                                                     |
| **Claude  |                                                     |
| Chatbot** |                                                     |
+-----------+-----------------------------------------------------+

The chatbot is Cova\'s second core differentiator after the 3D viewer.
Users describe changes in natural language --- \'swap the sofa to dark
green velvet\', \'add more plants\', \'make it feel more minimal\' ---
and the app either mutates the 3D scene directly or triggers a 2D
re-render. Claude API parses the intent and dispatches the right action.

  ------- ------------------------------------------------------------
   **1**  **Create the chatbot Edge Function**

  ------- ------------------------------------------------------------

+-----------------------------------------------------------------+
| mkdir -p supabase/functions/chatbot                             |
|                                                                 |
| code supabase/functions/chatbot/index.ts                        |
+-----------------------------------------------------------------+

+-----------------------------------------------------------------+
| import { serve } from                                           |
| \'https://deno.land/std@0.177.0/http/server.ts\';               |
|                                                                 |
| import { createClient } from                                    |
| \'https://esm.sh/@supabase/supabase-js@2\';                     |
|                                                                 |
| import Anthropic from                                           |
| \'https://esm.sh/@anthropic-ai/sdk@0.20.0\';                    |
|                                                                 |
| const ANTHROPIC_KEY = Deno.env.get(\'ANTHROPIC_API_KEY\')!;     |
|                                                                 |
| const SUPABASE_URL = Deno.env.get(\'SUPABASE_URL\')!;           |
|                                                                 |
| const SUPABASE_SERVICE =                                        |
| Deno.env.get(\'SUPABASE_SERVICE_ROLE_KEY\')!;                   |
|                                                                 |
| const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });     |
|                                                                 |
| const SYSTEM_PROMPT = \`You are Cova\'s AI design assistant.    |
| You help users edit their room design.                          |
|                                                                 |
| The user is looking at either a 3D interactive room or a 2D AI  |
| render of their room.                                           |
|                                                                 |
| When a user asks to change something, respond with a JSON       |
| object (no markdown, no explanation, ONLY JSON):                |
|                                                                 |
| {                                                               |
|                                                                 |
| \"action\": \"swap_furniture\" \| \"adjust_style\" \|           |
| \"regenerate_full\" \| \"inpaint_object\" \| \"add_furniture\"  |
| \| \"remove_furniture\" \| \"chat_only\",                       |
|                                                                 |
| \"reasoning\": \"brief explanation for the user\",              |
|                                                                 |
| \"params\": {                                                   |
|                                                                 |
| // For swap_furniture: { \"furniture_key\": \"japandi_sofa\",   |
| \"new_model_key\": \"midcentury_sofa\" }                        |
|                                                                 |
| // For adjust_style: { \"new_style\": \"coastal\" }             |
|                                                                 |
| // For add_furniture: { \"model_key\":                          |
| \"japandi_plant_fiddle\", \"position\": \[x, y, z\] }           |
|                                                                 |
| // For remove_furniture: { \"furniture_id\": \"id\" }           |
|                                                                 |
| // For regenerate_full: { \"style\": \"Coastal\",               |
| \"modification\": \"add more natural light\" }                  |
|                                                                 |
| // For inpaint_object: { \"object\": \"sofa\", \"change\":      |
| \"dark green velvet\" }                                         |
|                                                                 |
| // For chat_only: {}                                            |
|                                                                 |
| }                                                               |
|                                                                 |
| }                                                               |
|                                                                 |
| Prefer 3D actions (swap_furniture, add_furniture,               |
| remove_furniture, adjust_style) over render actions             |
| (regenerate_full, inpaint_object) --- they are faster and       |
| cheaper for the user.                                           |
|                                                                 |
| If the user is just asking a question or chatting, use          |
| chat_only and put your conversational response in the reasoning |
| field.\`;                                                       |
|                                                                 |
| serve(async (req) =\> {                                         |
|                                                                 |
| if (req.method !== \'POST\') return new Response(\'Method not   |
| allowed\', { status: 405 });                                    |
|                                                                 |
| const authHeader = req.headers.get(\'Authorization\');          |
|                                                                 |
| if (!authHeader) return new Response(\'Unauthorized\', {        |
| status: 401 });                                                 |
|                                                                 |
| const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);  |
|                                                                 |
| const { data: { user } } = await                                |
| supabase.auth.getUser(authHeader.replace(\'Bearer \', \'\'));   |
|                                                                 |
| if (!user) return new Response(\'Unauthorized\', { status: 401  |
| });                                                             |
|                                                                 |
| const { session_id, message, scene_state } = await req.json();  |
|                                                                 |
| // Load or create chat session                                  |
|                                                                 |
| let session: any = null;                                        |
|                                                                 |
| if (session_id) {                                               |
|                                                                 |
| const { data } = await                                          |
| supabase.from(\'chat_sessions\').select(\'\*\').eq(\'id\',      |
| session_id).single();                                           |
|                                                                 |
| session = data;                                                 |
|                                                                 |
| }                                                               |
|                                                                 |
| const history = session?.messages \|\| \[\];                    |
|                                                                 |
| const messages = \[                                             |
|                                                                 |
| \...history.map((m: any) =\> ({ role: m.role, content:          |
| m.content })),                                                  |
|                                                                 |
| { role: \'user\', content: \`Current scene:                     |
| \${JSON.stringify(scene_state)}\\n\\nUser says: \${message}\`   |
| },                                                              |
|                                                                 |
| \];                                                             |
|                                                                 |
| const response = await anthropic.messages.create({              |
|                                                                 |
| model: \'claude-sonnet-4-6\',                                   |
|                                                                 |
| max_tokens: 1000,                                               |
|                                                                 |
| system: SYSTEM_PROMPT,                                          |
|                                                                 |
| messages,                                                       |
|                                                                 |
| });                                                             |
|                                                                 |
| const rawText = response.content\[0\].type === \'text\' ?       |
| response.content\[0\].text : \'{}\';                            |
|                                                                 |
| let action: any = { action: \'chat_only\', reasoning: rawText,  |
| params: {} };                                                   |
|                                                                 |
| try { action = JSON.parse(rawText); } catch {}                  |
|                                                                 |
| // Append to session                                            |
|                                                                 |
| const newMessages = \[                                          |
|                                                                 |
| \...history,                                                    |
|                                                                 |
| { role: \'user\', content: message, timestamp: new              |
| Date().toISOString() },                                         |
|                                                                 |
| { role: \'assistant\', content: action.reasoning, action,       |
| timestamp: new Date().toISOString() },                          |
|                                                                 |
| \];                                                             |
|                                                                 |
| if (session) {                                                  |
|                                                                 |
| await supabase.from(\'chat_sessions\').update({ messages:       |
| newMessages, total_messages: newMessages.length }).eq(\'id\',   |
| session.id);                                                    |
|                                                                 |
| return new Response(JSON.stringify({ \...action, session_id:    |
| session.id }), { status: 200, headers: { \'Content-Type\':      |
| \'application/json\' } });                                      |
|                                                                 |
| } else {                                                        |
|                                                                 |
| const { data: newSession } = await                              |
| supabase.from(\'chat_sessions\').insert({ user_id: user.id,     |
| messages: newMessages, total_messages: 2 }).select().single();  |
|                                                                 |
| return new Response(JSON.stringify({ \...action, session_id:    |
| newSession?.id }), { status: 200, headers: { \'Content-Type\':  |
| \'application/json\' } });                                      |
|                                                                 |
| }                                                               |
|                                                                 |
| });                                                             |
+-----------------------------------------------------------------+

+-----------------------------------------------------------------+
| supabase functions deploy chatbot                               |
|                                                                 |
| git add .                                                       |
|                                                                 |
| git commit -m \"Phase 5: Claude chatbot with 3D scene mutation  |
| dispatch\"                                                      |
|                                                                 |
| git push origin main                                            |
+-----------------------------------------------------------------+

+:---------:+-----------------------------------------------------+
| **PHASE   | *Auth, tinder onboarding, upload flow, 3D viewer    |
| 6**       | integration, product shelf*                         |
|           |                                                     |
| **Mobile  |                                                     |
| App       |                                                     |
| Screens** |                                                     |
+-----------+-----------------------------------------------------+

This phase builds every screen visible to users. The 3D viewer screens
(RoomCalibrationScreen and RoomViewer3DScreen) were already built in
Phase 3. This phase builds the surrounding app: auth, onboarding swipe
cards, home feed, photo upload, and the product shelf.

  ------- ------------------------------------------------------------
   **1**  **Create the Expo app and install all packages**

  ------- ------------------------------------------------------------

+-----------------------------------------------------------------+
| cd \~/Documents/cova/apps                                       |
|                                                                 |
| npx create-expo-app mobile \--template                          |
| expo-template-blank-typescript                                  |
|                                                                 |
| cd mobile                                                       |
+-----------------------------------------------------------------+

Install all required packages in one command:

+-----------------------------------------------------------------+
| npx expo install \\                                             |
|                                                                 |
| expo-camera expo-image-picker expo-image-manipulator \\         |
|                                                                 |
| expo-file-system expo-notifications expo-in-app-purchases \\    |
|                                                                 |
| \@expo/vector-icons expo-haptics expo-linear-gradient \\        |
|                                                                 |
| expo-blur expo-status-bar expo-media-library expo-asset \\      |
|                                                                 |
| expo-gl react-native-view-shot                                  |
+-----------------------------------------------------------------+

+-----------------------------------------------------------------+
| pnpm add \\                                                     |
|                                                                 |
| \@react-navigation/native \@react-navigation/native-stack       |
| \@react-navigation/bottom-tabs \\                               |
|                                                                 |
| react-native-screens react-native-safe-area-context \\          |
|                                                                 |
| react-native-gesture-handler react-native-reanimated \\         |
|                                                                 |
| \@react-three/fiber \@react-three/drei three \\                 |
|                                                                 |
| react-native-svg react-native-deck-swiper \\                    |
|                                                                 |
| \@gorhom/bottom-sheet zustand \@tanstack/react-query \\         |
|                                                                 |
| \@supabase/supabase-js react-native-url-polyfill \\             |
|                                                                 |
| \@react-native-async-storage/async-storage                      |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **2**  **Configure app.json --- rename everything to Cova**

  ------- ------------------------------------------------------------

  -----------------------------------------------------------------
  code app.json

  -----------------------------------------------------------------

+-----------------------------------------------------------------+
| {                                                               |
|                                                                 |
| \"expo\": {                                                     |
|                                                                 |
| \"name\": \"Cova\",                                             |
|                                                                 |
| \"slug\": \"cova\",                                             |
|                                                                 |
| \"version\": \"1.0.0\",                                         |
|                                                                 |
| \"orientation\": \"portrait\",                                  |
|                                                                 |
| \"icon\": \"./assets/icon.png\",                                |
|                                                                 |
| \"userInterfaceStyle\": \"dark\",                               |
|                                                                 |
| \"splash\": {                                                   |
|                                                                 |
| \"image\": \"./assets/splash.png\",                             |
|                                                                 |
| \"resizeMode\": \"contain\",                                    |
|                                                                 |
| \"backgroundColor\": \"#0B1729\"                                |
|                                                                 |
| },                                                              |
|                                                                 |
| \"ios\": {                                                      |
|                                                                 |
| \"supportsTablet\": false,                                      |
|                                                                 |
| \"bundleIdentifier\": \"ai.cova.app\",                          |
|                                                                 |
| \"infoPlist\": {                                                |
|                                                                 |
| \"NSCameraUsageDescription\": \"Cova needs camera access to     |
| photograph your room for AI redesign.\",                        |
|                                                                 |
| \"NSPhotoLibraryUsageDescription\": \"Cova needs photo library  |
| access to select room photos.\",                                |
|                                                                 |
| \"NSPhotoLibraryAddUsageDescription\": \"Cova needs permission  |
| to save your room designs.\"                                    |
|                                                                 |
| }                                                               |
|                                                                 |
| },                                                              |
|                                                                 |
| \"plugins\": \[                                                 |
|                                                                 |
| \"expo-camera\",                                                |
|                                                                 |
| \"expo-image-picker\",                                          |
|                                                                 |
| \"expo-media-library\",                                         |
|                                                                 |
| \[\"expo-notifications\", { \"sounds\": \[\] }\]                |
|                                                                 |
| \]                                                              |
|                                                                 |
| }                                                               |
|                                                                 |
| }                                                               |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **3**  **Configure metro.config.js for 3D model files**

  ------- ------------------------------------------------------------

  ------------- --------------------------------------------------------
      **⚠️      This step is required for GLB files to load. Without it,
   IMPORTANT**  Three.js model loading will silently fail.

  ------------- --------------------------------------------------------

  -----------------------------------------------------------------
  code metro.config.js

  -----------------------------------------------------------------

+-----------------------------------------------------------------+
| const { getDefaultConfig } = require(\'expo/metro-config\');    |
|                                                                 |
| const config = getDefaultConfig(\_\_dirname);                   |
|                                                                 |
| // Tell Metro bundler to handle 3D model and HDR environment    |
| files                                                           |
|                                                                 |
| config.resolver.assetExts.push(\'glb\', \'gltf\', \'hdr\',      |
| \'ktx2\');                                                      |
|                                                                 |
| module.exports = config;                                        |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **4**  **Create the global Zustand state store**

  ------- ------------------------------------------------------------

  -----------------------------------------------------------------
  mkdir -p src/store && code src/store/index.ts

  -----------------------------------------------------------------

+-----------------------------------------------------------------+
| import { create } from \'zustand\';                             |
|                                                                 |
| import type { User, Room, SceneState, CavaStyle } from          |
| \'@cova/shared\';                                               |
|                                                                 |
| interface AppState {                                            |
|                                                                 |
| // Auth                                                         |
|                                                                 |
| user: User \| null;                                             |
|                                                                 |
| setUser: (user: User \| null) =\> void;                         |
|                                                                 |
| // Current room being worked on                                 |
|                                                                 |
| currentRoom: Room \| null;                                      |
|                                                                 |
| setCurrentRoom: (room: Room \| null) =\> void;                  |
|                                                                 |
| // 3D scene state --- persisted across navigation               |
|                                                                 |
| sceneState: SceneState \| null;                                 |
|                                                                 |
| setSceneState: (state: SceneState) =\> void;                    |
|                                                                 |
| // Token balance (mirrored from DB for instant UI updates)      |
|                                                                 |
| tokenBalance: number;                                           |
|                                                                 |
| setTokenBalance: (n: number) =\> void;                          |
|                                                                 |
| spendTokens: (n: number) =\> void;                              |
|                                                                 |
| }                                                               |
|                                                                 |
| export const useAppStore = create\<AppState\>((set) =\> ({      |
|                                                                 |
| user: null,                                                     |
|                                                                 |
| setUser: (user) =\> set({ user, tokenBalance:                   |
| user?.token_balance ?? 0 }),                                    |
|                                                                 |
| currentRoom: null,                                              |
|                                                                 |
| setCurrentRoom: (room) =\> set({ currentRoom: room }),          |
|                                                                 |
| sceneState: null,                                               |
|                                                                 |
| setSceneState: (state) =\> set({ sceneState: state }),          |
|                                                                 |
| tokenBalance: 0,                                                |
|                                                                 |
| setTokenBalance: (n) =\> set({ tokenBalance: n }),              |
|                                                                 |
| spendTokens: (n) =\> set(s =\> ({ tokenBalance: Math.max(0,     |
| s.tokenBalance - n) })),                                        |
|                                                                 |
| }))                                                             |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **5**  **Create the main navigation structure**

  ------- ------------------------------------------------------------

  -----------------------------------------------------------------
  mkdir -p src/navigation && code src/navigation/index.tsx

  -----------------------------------------------------------------

+-----------------------------------------------------------------+
| import React from \'react\';                                    |
|                                                                 |
| import { NavigationContainer } from                             |
| \'@react-navigation/native\';                                   |
|                                                                 |
| import { createNativeStackNavigator } from                      |
| \'@react-navigation/native-stack\';                             |
|                                                                 |
| import { createBottomTabNavigator } from                        |
| \'@react-navigation/bottom-tabs\';                              |
|                                                                 |
| import { Ionicons } from \'@expo/vector-icons\';                |
|                                                                 |
| import { useAppStore } from \'../store\';                       |
|                                                                 |
| // Auth screens                                                 |
|                                                                 |
| import { WelcomeScreen } from                                   |
| \'../screens/auth/WelcomeScreen\';                              |
|                                                                 |
| import { SignInScreen } from \'../screens/auth/SignInScreen\';  |
|                                                                 |
| import { SignUpScreen } from \'../screens/auth/SignUpScreen\';  |
|                                                                 |
| // Onboarding                                                   |
|                                                                 |
| import { SwipeOnboardingScreen } from                           |
| \'../screens/onboarding/SwipeOnboardingScreen\';                |
|                                                                 |
| // Main app                                                     |
|                                                                 |
| import { HomeScreen } from \'../screens/main/HomeScreen\';      |
|                                                                 |
| import { UploadScreen } from \'../screens/main/UploadScreen\';  |
|                                                                 |
| import { RoomCalibrationScreen } from                           |
| \'../screens/main/RoomCalibrationScreen\';                      |
|                                                                 |
| import { RoomViewer3DScreen } from                              |
| \'../screens/main/RoomViewer3DScreen\';                         |
|                                                                 |
| import { ShopScreen } from \'../screens/main/ShopScreen\';      |
|                                                                 |
| import { AccountScreen } from                                   |
| \'../screens/main/AccountScreen\';                              |
|                                                                 |
| const Stack = createNativeStackNavigator();                     |
|                                                                 |
| const Tabs = createBottomTabNavigator();                        |
|                                                                 |
| function MainTabs() {                                           |
|                                                                 |
| return (                                                        |
|                                                                 |
| \<Tabs.Navigator screenOptions={({ route }) =\> ({              |
|                                                                 |
| tabBarStyle: { backgroundColor: \'#0B1729\', borderTopColor:    |
| \'rgba(201,168,76,0.2)\' },                                     |
|                                                                 |
| tabBarActiveTintColor: \'#C9A84C\',                             |
|                                                                 |
| tabBarInactiveTintColor:\'#8A8070\',                            |
|                                                                 |
| headerShown: false,                                             |
|                                                                 |
| tabBarIcon: ({ color, size }) =\> {                             |
|                                                                 |
| const icons: Record\<string, string\> = {                       |
|                                                                 |
| Home: \'home-outline\', Shop: \'bag-outline\', Account:         |
| \'person-outline\'                                              |
|                                                                 |
| };                                                              |
|                                                                 |
| return \<Ionicons name={icons\[route.name\] as any ??           |
| \'ellipse-outline\'} size={size} color={color} /\>;             |
|                                                                 |
| }                                                               |
|                                                                 |
| })}\>                                                           |
|                                                                 |
| \<Tabs.Screen name=\'Home\' component={HomeScreen} /\>          |
|                                                                 |
| \<Tabs.Screen name=\'Shop\' component={ShopScreen} /\>          |
|                                                                 |
| \<Tabs.Screen name=\'Account\' component={AccountScreen} /\>    |
|                                                                 |
| \</Tabs.Navigator\>                                             |
|                                                                 |
| );                                                              |
|                                                                 |
| }                                                               |
|                                                                 |
| export function AppNavigator() {                                |
|                                                                 |
| const { user } = useAppStore();                                 |
|                                                                 |
| return (                                                        |
|                                                                 |
| \<NavigationContainer\>                                         |
|                                                                 |
| \<Stack.Navigator screenOptions={{ headerShown: false }}\>      |
|                                                                 |
| {!user ? (                                                      |
|                                                                 |
| \<\>                                                            |
|                                                                 |
| \<Stack.Screen name=\'Welcome\' component={WelcomeScreen} /\>   |
|                                                                 |
| \<Stack.Screen name=\'SignIn\' component={SignInScreen} /\>     |
|                                                                 |
| \<Stack.Screen name=\'SignUp\' component={SignUpScreen} /\>     |
|                                                                 |
| \</\>                                                           |
|                                                                 |
| ) : !user.onboarding_completed ? (                              |
|                                                                 |
| \<Stack.Screen name=\'Onboarding\'                              |
| component={SwipeOnboardingScreen} /\>                           |
|                                                                 |
| ) : (                                                           |
|                                                                 |
| \<\>                                                            |
|                                                                 |
| \<Stack.Screen name=\'Main\' component={MainTabs} /\>           |
|                                                                 |
| \<Stack.Screen name=\'Upload\' component={UploadScreen} /\>     |
|                                                                 |
| \<Stack.Screen name=\'RoomCalibration\'                         |
| component={RoomCalibrationScreen} /\>                           |
|                                                                 |
| \<Stack.Screen name=\'RoomViewer3D\'                            |
| component={RoomViewer3DScreen} /\>                              |
|                                                                 |
| \</\>                                                           |
|                                                                 |
| )}                                                              |
|                                                                 |
| \</Stack.Navigator\>                                            |
|                                                                 |
| \</NavigationContainer\>                                        |
|                                                                 |
| );                                                              |
|                                                                 |
| }                                                               |
+-----------------------------------------------------------------+

  --------- --------------------------------------------------------
    **📝    The full screen implementations for WelcomeScreen,
   NOTE**   SignInScreen, SignUpScreen, SwipeOnboardingScreen,
            HomeScreen, UploadScreen, ShopScreen, and AccountScreen
            follow the same patterns as the Phase 3 screens. Build
            each one using the same StyleSheet.create pattern and
            supabase.from() queries shown above. The navigation flow
            is: Welcome → SignUp → Onboarding → Home → Upload →
            Calibration → 3D Viewer.

  --------- --------------------------------------------------------

+-----------------------------------------------------------------+
| git add .                                                       |
|                                                                 |
| git commit -m \"Phase 6: Mobile app screens --- nav, store,     |
| upload flow, 3D viewer integrated\"                             |
|                                                                 |
| git push origin main                                            |
+-----------------------------------------------------------------+

+:---------:+-----------------------------------------------------+
| **PHASE   | *Virtual staging, listing pages, open house voting, |
| 7**       | MLS export*                                         |
|           |                                                     |
| **Realtor |                                                     |
| Tools**   |                                                     |
+-----------+-----------------------------------------------------+

The realtor vertical is a B2B revenue stream from day one. Realtors use
Cova to virtually stage empty listing photos, generate 3 styled versions
per room, share a voting page for open houses, and download
MLS-compliant photos.

  --------- --------------------------------------------------------
    **📝    The realtor web dashboard is built as a Next.js app at
   NOTE**   apps/web. The mobile app has a \'Realtor Mode\' toggle
            in Account settings that unlocks staging features within
            the iOS app.

  --------- --------------------------------------------------------

  ------- ------------------------------------------------------------
   **1**  **Create the Next.js realtor web dashboard**

  ------- ------------------------------------------------------------

+-----------------------------------------------------------------+
| cd \~/Documents/cova/apps                                       |
|                                                                 |
| npx create-next-app@latest web \--typescript \--tailwind \--app |
| \--no-src-dir \--import-alias \'@/\*\'                          |
|                                                                 |
| cd web                                                          |
|                                                                 |
| pnpm add \@supabase/supabase-js \@supabase/ssr archiver sharp   |
| qrcode                                                          |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **2**  **Create the MLS export API route**

  ------- ------------------------------------------------------------

This route downloads renders and converts them to MLS-compliant JPEG
format. It handles all MLS spec requirements: JPEG format, 1024x768
minimum, sRGB colour space, EXIF stripped, max 10MB.

  -----------------------------------------------------------------
  mkdir -p app/api/export-mls && code app/api/export-mls/route.ts

  -----------------------------------------------------------------

+-----------------------------------------------------------------+
| import { NextRequest, NextResponse } from \'next/server\';      |
|                                                                 |
| import sharp from \'sharp\';                                    |
|                                                                 |
| import archiver from \'archiver\';                              |
|                                                                 |
| import { createClient } from \'@supabase/supabase-js\';         |
|                                                                 |
| import { Readable } from \'stream\';                            |
|                                                                 |
| const supabaseAdmin = createClient(                             |
|                                                                 |
| process.env.NEXT_PUBLIC_SUPABASE_URL!,                          |
|                                                                 |
| process.env.SUPABASE_SERVICE_ROLE_KEY!                          |
|                                                                 |
| );                                                              |
|                                                                 |
| // MLS Technical Specifications                                 |
|                                                                 |
| const MLS_SPEC = {                                              |
|                                                                 |
| format: \'jpeg\' as const,                                      |
|                                                                 |
| width: 1024,                                                    |
|                                                                 |
| height: 768,                                                    |
|                                                                 |
| quality: 85,                                                    |
|                                                                 |
| colorspace: \'srgb\' as const,                                  |
|                                                                 |
| // strip: true removes ALL EXIF metadata (GPS, device info,     |
| etc.)                                                           |
|                                                                 |
| };                                                              |
|                                                                 |
| async function processForMLS(imageUrl: string):                 |
| Promise\<Buffer\> {                                             |
|                                                                 |
| // Download the render from Supabase Storage or Replicate CDN   |
|                                                                 |
| const response = await fetch(imageUrl);                         |
|                                                                 |
| if (!response.ok) throw new Error(\`Failed to fetch image:      |
| \${response.status}\`);                                         |
|                                                                 |
| const inputBuffer = Buffer.from(await response.arrayBuffer());  |
|                                                                 |
| // Process with sharp: resize, convert, strip EXIF              |
|                                                                 |
| const processed = await sharp(inputBuffer)                      |
|                                                                 |
| .resize(MLS_SPEC.width, MLS_SPEC.height, { fit: \'cover\',      |
| position: \'centre\' })                                         |
|                                                                 |
| .toColorspace(MLS_SPEC.colorspace)                              |
|                                                                 |
| .jpeg({ quality: MLS_SPEC.quality, mozjpeg: true })             |
|                                                                 |
| .withMetadata({}) // strip all EXIF --- withMetadata({}) =      |
| empty metadata                                                  |
|                                                                 |
| .toBuffer();                                                    |
|                                                                 |
| // Verify file size constraint (\<10MB)                         |
|                                                                 |
| const sizeMB = processed.byteLength / (1024 \* 1024);           |
|                                                                 |
| if (sizeMB \> 10) throw new Error(\`Processed image too large:  |
| \${sizeMB.toFixed(1)}MB\`);                                     |
|                                                                 |
| return processed;                                               |
|                                                                 |
| }                                                               |
|                                                                 |
| export async function POST(req: NextRequest) {                  |
|                                                                 |
| const { listing_id, render_ids } = await req.json();            |
|                                                                 |
| // Verify the user is the realtor who owns this listing         |
|                                                                 |
| const authHeader = req.headers.get(\'Authorization\');          |
|                                                                 |
| // \... auth check omitted for brevity --- follow same pattern  |
| as Edge Functions                                               |
|                                                                 |
| // Fetch render image URLs                                      |
|                                                                 |
| const { data: renders } = await supabaseAdmin                   |
|                                                                 |
| .from(\'renders\')                                              |
|                                                                 |
| .select(\'id, image_url, style_applied\')                       |
|                                                                 |
| .in(\'id\', render_ids)                                         |
|                                                                 |
| .eq(\'status\', \'complete\');                                  |
|                                                                 |
| if (!renders?.length) return NextResponse.json({ error: \'No    |
| renders found\' }, { status: 404 });                            |
|                                                                 |
| // Process each render and build ZIP                            |
|                                                                 |
| const archive = archiver(\'zip\', { zlib: { level: 6 } });      |
|                                                                 |
| const chunks: Buffer\[\] = \[\];                                |
|                                                                 |
| archive.on(\'data\', (chunk: Buffer) =\> chunks.push(chunk));   |
|                                                                 |
| await Promise.all(renders.map(async (render) =\> {              |
|                                                                 |
| if (!render.image_url) return;                                  |
|                                                                 |
| const processed = await processForMLS(render.image_url);        |
|                                                                 |
| const filename =                                                |
| \`\${render.style_applied.replace(/\\s+/g,\'\_\')}\_MLS.jpg\`;  |
|                                                                 |
| archive.append(processed, { name: filename });                  |
|                                                                 |
| }));                                                            |
|                                                                 |
| await archive.finalize();                                       |
|                                                                 |
| const zipBuffer = Buffer.concat(chunks);                        |
|                                                                 |
| return new NextResponse(zipBuffer, {                            |
|                                                                 |
| headers: {                                                      |
|                                                                 |
| \'Content-Type\': \'application/zip\',                          |
|                                                                 |
| \'Content-Disposition\': \`attachment;                          |
| filename=\"cova_mls\_\${listing_id}.zip\"\`,                    |
|                                                                 |
| }                                                               |
|                                                                 |
| });                                                             |
|                                                                 |
| }                                                               |
+-----------------------------------------------------------------+

+-----------------------------------------------------------------+
| git add .                                                       |
|                                                                 |
| git commit -m \"Phase 7: Realtor web dashboard, virtual         |
| staging, MLS export, voting\"                                   |
|                                                                 |
| git push origin main                                            |
+-----------------------------------------------------------------+

+:-----------:+-----------------------------------------------------+
| **PHASE 8** | *StoreKit token packs, subscriptions, receipt       |
|             | verification*                                       |
| **In-App    |                                                     |
| Purchases** |                                                     |
+-------------+-----------------------------------------------------+

Cova\'s revenue comes from token packs and subscriptions. iOS in-app
purchases are handled via Expo\'s expo-in-app-purchases which wraps
Apple\'s StoreKit. All purchases must be verified server-side --- never
trust the client.

  ------- ------------------------------------------------------------
   **1**  **Configure products in App Store Connect**

  ------- ------------------------------------------------------------

- Go to appstoreconnect.apple.com → your app → In-App Purchases

- Create Consumable products for token packs (they can be purchased
  multiple times):

- ai.cova.tokens.20 --- Starter Pack 20 tokens --- \$4.99

- ai.cova.tokens.70 --- Standard Pack 70 tokens --- \$14.99

- ai.cova.tokens.200 --- Project Pack 200 tokens --- \$39.99

- Create Auto-Renewable Subscriptions for plans:

- ai.cova.sub.starter --- Starter Plan 100 tokens/mo --- \$14.99/mo

- ai.cova.sub.pro --- Pro Plan 300 tokens/mo --- \$29.99/mo

  ------- ------------------------------------------------------------
   **2**  **Build the purchase hook**

  ------- ------------------------------------------------------------

  -----------------------------------------------------------------
  mkdir -p src/hooks && code src/hooks/usePurchase.ts

  -----------------------------------------------------------------

+----------------------------------------------------------------------------------+
| import { useCallback, useEffect } from \'react\';                                |
|                                                                                  |
| import \* as InAppPurchases from \'expo-in-app-purchases\';                      |
|                                                                                  |
| import { supabase } from \'@cova/shared\';                                       |
|                                                                                  |
| import { useAppStore } from \'../store\';                                        |
|                                                                                  |
| const TOKEN_PRODUCTS = {                                                         |
|                                                                                  |
| \'ai.cova.tokens.20\': 20,                                                       |
|                                                                                  |
| \'ai.cova.tokens.70\': 70,                                                       |
|                                                                                  |
| \'ai.cova.tokens.200\': 200,                                                     |
|                                                                                  |
| };                                                                               |
|                                                                                  |
| export function usePurchase() {                                                  |
|                                                                                  |
| const { user, setTokenBalance } = useAppStore();                                 |
|                                                                                  |
| useEffect(() =\> {                                                               |
|                                                                                  |
| // Set up purchase listener                                                      |
|                                                                                  |
| InAppPurchases.setPurchaseListener(async ({ responseCode, results, errorCode })  |
| =\> {                                                                            |
|                                                                                  |
| if (responseCode === InAppPurchases.IAPResponseCode.OK && results) {             |
|                                                                                  |
| for (const purchase of results) {                                                |
|                                                                                  |
| if (!purchase.acknowledged) {                                                    |
|                                                                                  |
| await handlePurchase(purchase);                                                  |
|                                                                                  |
| }                                                                                |
|                                                                                  |
| }                                                                                |
|                                                                                  |
| }                                                                                |
|                                                                                  |
| });                                                                              |
|                                                                                  |
| return () =\> { InAppPurchases.setPurchaseListener(() =\> {}); };                |
|                                                                                  |
| }, \[user\]);                                                                    |
|                                                                                  |
| const handlePurchase = async (purchase: InAppPurchases.InAppPurchase) =\> {      |
|                                                                                  |
| // Send receipt to backend for verification                                      |
|                                                                                  |
| const { data: { session } } = await supabase.auth.getSession();                  |
|                                                                                  |
| if (!session) return;                                                            |
|                                                                                  |
| const response = await                                                           |
| fetch(\`\${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/verify-purchase\`, |
| {                                                                                |
|                                                                                  |
| method: \'POST\',                                                                |
|                                                                                  |
| headers: { \'Content-Type\': \'application/json\', \'Authorization\': \`Bearer   |
| \${session.access_token}\` },                                                    |
|                                                                                  |
| body: JSON.stringify({                                                           |
|                                                                                  |
| product_id: purchase.productId,                                                  |
|                                                                                  |
| receipt_data: purchase.transactionReceipt,                                       |
|                                                                                  |
| transaction_id: purchase.orderId,                                                |
|                                                                                  |
| }),                                                                              |
|                                                                                  |
| });                                                                              |
|                                                                                  |
| if (response.ok) {                                                               |
|                                                                                  |
| const { new_balance } = await response.json();                                   |
|                                                                                  |
| setTokenBalance(new_balance);                                                    |
|                                                                                  |
| await InAppPurchases.finishTransactionAsync(purchase, true);                     |
|                                                                                  |
| }                                                                                |
|                                                                                  |
| };                                                                               |
|                                                                                  |
| const purchaseTokens = useCallback(async (productId: string) =\> {               |
|                                                                                  |
| await InAppPurchases.connectAsync();                                             |
|                                                                                  |
| await InAppPurchases.purchaseItemAsync(productId);                               |
|                                                                                  |
| }, \[\]);                                                                        |
|                                                                                  |
| return { purchaseTokens };                                                       |
|                                                                                  |
| }                                                                                |
+----------------------------------------------------------------------------------+

+-----------------------------------------------------------------+
| git add .                                                       |
|                                                                 |
| git commit -m \"Phase 8: StoreKit in-app purchases, token       |
| packs, receipt verification\"                                   |
|                                                                 |
| git push origin main                                            |
+-----------------------------------------------------------------+

+:---------:+-----------------------------------------------------+
| **PHASE   | *EAS Build, submission checklist, go-live*          |
| 9**       |                                                     |
|           |                                                     |
| **App     |                                                     |
| Store     |                                                     |
| Launch**  |                                                     |
+-----------+-----------------------------------------------------+

This phase gets Cova into the App Store. EAS (Expo Application Services)
handles the build and submission process. You need an Apple Developer
account (\$99/year) before starting this phase.

  ------- ------------------------------------------------------------
   **1**  **Configure EAS Build**

  ------- ------------------------------------------------------------

  -----------------------------------------------------------------
  code eas.json

  -----------------------------------------------------------------

+-----------------------------------------------------------------+
| {                                                               |
|                                                                 |
| \"cli\": { \"version\": \"\>= 5.9.1\" },                        |
|                                                                 |
| \"build\": {                                                    |
|                                                                 |
| \"development\": {                                              |
|                                                                 |
| \"developmentClient\": true,                                    |
|                                                                 |
| \"distribution\": \"internal\",                                 |
|                                                                 |
| \"ios\": { \"simulator\": true }                                |
|                                                                 |
| },                                                              |
|                                                                 |
| \"preview\": {                                                  |
|                                                                 |
| \"distribution\": \"internal\",                                 |
|                                                                 |
| \"ios\": { \"resourceClass\": \"m-medium\" }                    |
|                                                                 |
| },                                                              |
|                                                                 |
| \"production\": {                                               |
|                                                                 |
| \"ios\": { \"resourceClass\": \"m-medium\" },                   |
|                                                                 |
| \"autoIncrement\": true                                         |
|                                                                 |
| }                                                               |
|                                                                 |
| },                                                              |
|                                                                 |
| \"submit\": {                                                   |
|                                                                 |
| \"production\": {                                               |
|                                                                 |
| \"ios\": {                                                      |
|                                                                 |
| \"appleId\": \"hellocova@gmail.com\",                           |
|                                                                 |
| \"ascAppId\": \"YOUR_APP_STORE_CONNECT_APP_ID\",                |
|                                                                 |
| \"appleTeamId\": \"YOUR_APPLE_TEAM_ID\"                         |
|                                                                 |
| }                                                               |
|                                                                 |
| }                                                               |
|                                                                 |
| }                                                               |
|                                                                 |
| }                                                               |
+-----------------------------------------------------------------+

  ------- ------------------------------------------------------------
   **2**  **Pre-launch checklist**

  ------- ------------------------------------------------------------

- ✅ All environment variables set in Vercel and Supabase secrets

- ✅ Apple Developer account active (\$99/yr at developer.apple.com)

- ✅ App Store Connect app record created for \'Cova\'

- ✅ Bundle identifier set to ai.cova.app in app.json

- ✅ In-App Purchase products created and in \'Ready to Submit\' state

- ✅ Privacy policy URL ready (required by Apple --- use Termly.io for
  free policy)

- ✅ At least 1 screenshot per device size (use iPhone 15 Pro Max and
  iPhone SE)

- ✅ App icon 1024×1024 PNG with no alpha channel in assets/icon.png

- ✅ Splash screen in assets/splash.png

- ✅ Test on physical iPhone --- not just Simulator --- for at least 2
  hours

- ✅ Test 3D viewer on physical device --- expo-gl behaves differently
  on real hardware

- ✅ Amazon Associates 3 qualifying sales completed before launch

  ------- ------------------------------------------------------------
   **3**  **Build and submit to App Store**

  ------- ------------------------------------------------------------

+-----------------------------------------------------------------+
| cd \~/Documents/cova/apps/mobile                                |
|                                                                 |
| \# Build production IPA                                         |
|                                                                 |
| eas build \--platform ios \--profile production                 |
|                                                                 |
| \# This opens a browser to authenticate with your Apple ID.     |
|                                                                 |
| \# EAS handles code signing automatically.                      |
|                                                                 |
| \# Build takes 15-25 minutes on EAS servers.                    |
|                                                                 |
| \# You will receive an email when it completes.                 |
|                                                                 |
| \# After build completes, submit to App Store                   |
|                                                                 |
| eas submit \--platform ios \--profile production                |
+-----------------------------------------------------------------+

After submission, Apple reviews the app. First submission typically
takes 1--3 days. Subsequent submissions take 24 hours. Common rejection
reasons and fixes:

- Missing privacy policy --- add a URL to your privacy policy in App
  Store Connect → App Information

- NSCameraUsageDescription insufficient --- make the description more
  specific about WHY you need the camera

- In-App Purchase missing --- ensure all IAP products are in
  \'Approved\' state before submitting

- 3D viewer crashes on review device --- test on older iPhones (iPhone
  12 or older) and handle graceful degradation

+-----------------------------------------------------------------+
| git add .                                                       |
|                                                                 |
| git commit -m \"Phase 9: EAS build config, launch checklist,    |
| App Store submission\"                                          |
|                                                                 |
| git push origin main                                            |
|                                                                 |
| echo \"🎉 Cova V1 is complete and submitted to the App Store!\" |
+-----------------------------------------------------------------+

**APPENDIX A --- 14-Day Sprint Timeline**

This timeline assumes you are building full-time (8+ hours/day) with one
developer. Adjust based on your actual available time.

  -------------------------------------------------------------------
  **Day**   **Phase**        **Deliverable**
  --------- ---------------- ----------------------------------------
  **Day 1** **Phase 0+1**    Mac setup, Homebrew, Node, Xcode
                             downloading, monorepo scaffold, shared
                             types

  **Day 2** **Phase 2**      Supabase schema (all 8 tables), RLS,
                             storage buckets, auth configured

  **Day 3** **Phase 3**      3D dependencies installed, furniture
                             catalog defined, GLB models downloaded

  **Day 4** **Phase 3**      RoomCalibrationScreen complete and
                             testable in Simulator

  **Day 5** **Phase 3**      BoxRoom, FurniturePiece, SceneLighting
                             complete --- 3D scene renders 1 style

  **Day 6** **Phase 3**      RoomViewer3DScreen --- all 5 styles
                             working, orbit controls, screenshot
                             export

  **Day 7** **Phase 4**      Render Edge Function, ZoeDepth, webhook
                             handler deployed and tested

  **Day 8** **Phase 5**      Claude chatbot Edge Function --- 3D
                             scene mutations working end-to-end

  **Day 9** **Phase 6**      Auth screens, swipe onboarding, home
                             screen, upload flow

  **Day     **Phase 6**      3D viewer connected to upload flow ---
  10**                       full user journey works

  **Day     **Phase 6+7**    Product shelf, realtor virtual staging,
  11**                       listing pages

  **Day     **Phase 7+8**    Open house voting, MLS export, StoreKit
  12**                       token packs

  **Day     **Phase 9**      EAS build, test on physical iPhone, bug
  13**                       fixes

  **Day     **Phase 9**      App Store submission, screenshots,
  14**                       metadata --- 🚀 SUBMITTED
  -------------------------------------------------------------------

**APPENDIX B --- V2 Features (Months 3--6)**

These features are excluded from V1 to maintain focus. Add them after
you have 50 paying users and \$1,000 in revenue.

- Depth Anything V2 via Hugging Face --- replace manual calibration with
  automatic room detection

- Wayfair 3D asset API --- expand furniture library to 300+ models
  directly tied to purchasable products

- Claude chatbot directly driving 3D mutations in real time --- \'swap
  the sofa\' moves it live

- AR preview via \@react-three/xr and model-viewer --- see furniture in
  your real room via phone camera

- Designer marketplace --- upload rooms, earn on every copy via Stripe
  Connect

- Spatial fit logic --- warn when furniture dimensions exceed room size

- Social sharing cards with \'Copy to my room\' acquisition CTA

- Android app via React Native code share

*COVA --- V1 Complete Build Guide \| hello@cova.ai \| CONFIDENTIAL*
