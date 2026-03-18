**COVA**

*tinder for your home*

**Build Guide --- Part 1**

Phases 0 through 5

Phase 0: Environment Setup \| Phase 1: Monorepo Scaffold

Phase 2: Supabase Backend \| Phase 2.5: 3D Assets

Phase 3: Expo App Foundation \| Phase 4: 3D Room Engine \| Phase 5: AI
Render Pipeline

Pranav Goel & Daksh Parikh \| hellocova@gmail.com

**Table of Contents**

**How to Use This Guide**

This document contains every Cursor prompt, terminal command, SQL
migration, and configuration decision needed to build Cova from scratch
through Phase 5. Read and execute each phase in sequence --- do not skip
ahead.

**Cursor Prompts**

Every Cursor prompt is displayed in a green bordered box labeled CURSOR
PROMPT. Copy the full prompt verbatim into Cursor\'s chat panel. Do not
paraphrase or summarise --- the prompts are written to include all
context, edge cases, and constraints Cursor needs to produce correct
code on the first attempt. Cursor operates in Composer mode (Cmd+I)
unless stated otherwise.

**Terminal Commands**

Terminal commands are shown in monospace grey boxes. Run them exactly as
written from the directory specified in the preceding text. When no
directory is mentioned, run from \~/Desktop/cova (the monorepo root).

**Validation Checkpoints**

Each phase ends with a numbered validation checklist. Do not proceed to
the next phase until every checkpoint passes on a physical iPhone. The
iOS Simulator does not accurately simulate expo-gl, RoomPlan, or camera
behaviour and will give false positives.

**Error Handling Philosophy**

This guide anticipates the most common errors at each phase. When you
encounter an error:

1.  Read the full terminal or Xcode error --- the specific line number
    and package name are always present.

2.  Check the Version Lock table (Phase 1.2) first. Most errors are
    version mismatches caused by pnpm hoisting.

3.  Check the Error & Fix table at the end of the relevant phase
    section.

4.  For Supabase Edge Function errors, open the Supabase dashboard →
    Edge Functions → Logs.

5.  For 3D viewer errors, add console.log before the failing useFrame or
    useGLTF call to narrow the component.

6.  If none of the above resolves the issue, search the exact error
    string in the Expo SDK 52 GitHub issues.

⚠ WARNING: NEVER upgrade these packages mid-build: expo (\~52.0.49),
react (18.3.1 exact), react-dom (18.3.1 exact), \@react-three/fiber
(8.17.10), \@react-three/drei (9.88.0), three (0.155.0). Any upgrade
without full regression testing will break the build.

**Phase Overview & Estimated Time**

  ----------- ---------------- --------- --------------------------------------
  **Phase**   **Name**         **Est.    **Key Deliverable**
                               Time**    

  Phase 0     Environment      2--3      All tools installed, all accounts
              Setup            hours     created, iPhone trusted in Xcode

  Phase 1     Monorepo         1--2      pnpm workspace, shared types,
              Scaffold         hours     .cursorrules, .cursorignore

  Phase 2     Supabase Backend 3--5      10 tables with RLS, 4 storage buckets,
                               hours     5 Edge Functions deployed

  Phase 2.5   3D Assets        2--4      GLB furniture models, PBR textures,
                               hours     HDRI files, furniture catalog TS file

  Phase 3     Expo App         2--4      All deps at locked versions,
              Foundation       hours     navigation, Supabase client, Zustand
                                         store, Dev Client build

  Phase 4     3D Room Engine   4--6      PBR room, HDRI lighting, SSAO,
                               hours     furniture drag/select/rotate, camera
                                         PanResponder

  Phase 5     AI Render        3--5      Room capture, depth map, FLUX render,
              Pipeline         hours     product CLIP matching,
                                         RenderViewScreen
  ----------- ---------------- --------- --------------------------------------

**PHASE 0 Environment Setup**

*Install all tools, create all accounts, configure Xcode and your iPhone
for development*

**Phase 0: Environment Setup**

Phase 0 must be completed exactly once before any code is written. Every
tool and account created here is required throughout the entire build.
Work through each section in order.

**0.1 macOS Tool Installation**

Install every tool in this exact order. Do not install them in parallel
--- some depend on the previous tool being present.

**Step 1 --- Xcode**

Install Xcode 15 or later from the Mac App Store. This is a large
download (10+ GB) --- start it first.

After installation completes, open Xcode once. Accept the license
agreement when prompted. Then install the command-line tools:

xcode-select \--install

If the command-line tools are already installed, you will see:
\'xcode-select: error: command line tools are already installed\'. That
is fine --- proceed.

**Step 2 --- Homebrew**

/bin/bash -c \"\$(curl -fsSL
https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"

After installation, add Homebrew to your PATH if it is not automatically
added. Apple Silicon Macs:

echo \'eval \"\$(/opt/homebrew/bin/brew shellenv)\"\' \>\> \~/.zshrc &&
source \~/.zshrc

Intel Macs: Homebrew is installed to /usr/local/bin which is already in
PATH.

**Step 3 --- Node.js 20.x**

⚠ WARNING: Do NOT use Node 22 or higher. Expo SDK 52 requires Node 20.x.
Using a different version causes subtle build failures.

brew install node@20

echo \'export PATH=\"/opt/homebrew/opt/node@20/bin:\$PATH\"\' \>\>
\~/.zshrc

source \~/.zshrc

node \--version \# Must output v20.x.x

npm \--version \# Must output 10.x.x

**Step 4 --- pnpm**

npm install -g pnpm@latest

pnpm \--version \# Should output 8.x or 9.x

**Step 5 --- Expo CLI & EAS CLI**

npm install -g expo-cli eas-cli

expo \--version \# Verify installed

eas \--version \# Verify installed

**Step 6 --- Supabase CLI**

brew install supabase/tap/supabase

supabase \--version \# Should output 1.x

**Step 7 --- Cursor IDE**

Download and install Cursor from https://cursor.sh --- this is the AI
code editor used for all Cursor prompts throughout this guide. Open it
and sign in with your account. In Cursor Settings, enable Composer mode
(Cmd+I shortcut).

**Step 8 --- Optional but Recommended**

brew install watchman \# Prevents Metro file-watch issues on large
projects

npm install -g gltf-transform/cli \# For optimising oversized GLB models

**0.2 Account Creation**

  --------------- ------------------ ------------------------------ --------------------
  **Service**     **Purpose**        **URL**                        **Priority**

  Apple Developer iOS device         developer.apple.com            Required immediately
  Program         testing, Apple                                    (\$99/yr)
                  Sign In, App Store                                
                  submission                                        

  Supabase        Database, auth,    supabase.com                   Required immediately
                  storage, edge                                     (free tier)
                  functions                                         

  Replicate       FLUX renders,      replicate.com                  Required immediately
                  Depth Anything V2,                                (add \$20 credit)
                  CLIP embeddings                                   

  Anthropic       Claude Sonnet 4    console.anthropic.com          Required immediately
                  Vision for chatbot                                (add \$20 credit)

  Google Cloud    Google OAuth 2.0   console.cloud.google.com       Required immediately
  Console         for Google Sign In                                (free)

  Wayfair Partner Affiliate product  wayfair.com/partnernetwork     Apply now ---
  Network         links and                                         approval 1-2 weeks
                  commissions                                       

  Amazon          Affiliate product  affiliate-program.amazon.com   Apply now ---
  Associates      links and                                         approval 1-2 weeks
                  commissions                                       
  --------------- ------------------ ------------------------------ --------------------

📝 NOTE: Apply for Wayfair and Amazon affiliate programs on Day 1 of
development, even though they are not needed until Phase 5. Approval
takes 1-2 weeks.

**0.3 Supabase Project Creation**

7.  Go to supabase.com → New Project.

8.  Project name: cova

9.  Database password: generate a strong password (minimum 20 characters
    with special characters). Save it in a password manager --- you will
    need it for the Supabase CLI.

10. Region: US East 1 (or your nearest region).

11. Wait for the project to finish provisioning (\~60 seconds).

12. Go to Project Settings → API. Copy and save these three values
    securely:

- Project URL: https://\[your-project-id\].supabase.co

- Project Reference ID: the string before .supabase.co

- anon (public) key: the long JWT string under \'Project API keys\'

- service_role (secret) key: the long JWT string --- NEVER put this in
  client code

13. Go to Database → Extensions. Search for \'vector\'. Click Enable.
    This activates pgvector for CLIP embeddings.

14. Go to Database → Extensions. Search for \'uuid-ossp\'. Click Enable.

**0.4 Google OAuth Setup**

15. Go to console.cloud.google.com → New Project → name it \'cova\'.

16. Go to APIs & Services → OAuth consent screen → External → fill in
    app name \'Cova\'.

17. Go to APIs & Services → Credentials → Create Credentials → OAuth 2.0
    Client ID → iOS.

18. Bundle ID: ai.cova.app

19. Copy the Client ID --- you will use it in Phase 3.

20. In Supabase: Authentication → Providers → Google → paste the Client
    ID and Client Secret.

**0.5 iOS Device Setup**

21. Connect your iPhone to your Mac via USB.

22. Unlock your iPhone and tap \'Trust\' when the \'Trust This
    Computer?\' prompt appears.

23. Open Xcode → Window → Devices and Simulators. Your iPhone should
    appear in the left panel. If it shows \'Unpaired\', click the
    warning icon and follow the pairing instructions.

24. In Xcode → Settings → Accounts, add your Apple ID. Select your
    Personal Team or the paid Developer team if you have enrolled.

25. Install Expo Go from the App Store on your iPhone. This is used for
    basic testing before the native Dev Client build in Phase 3.

⚠ WARNING: Expo Go cannot test RoomPlan, expo-gl (Three.js), or
camera-related features accurately. Always do final validation with the
Expo Dev Client native build from Phase 3.

**0.6 API Keys Reference Card**

Create a secure note in your password manager with these values. You
will reference them throughout the build:

  ------------------------------- ----------------------- ---------------------------
  **Variable Name**               **Where to Find It**    **Used In**

  EXPO_PUBLIC_SUPABASE_URL        Supabase → Settings →   apps/mobile/.env
                                  API → Project URL       

  EXPO_PUBLIC_SUPABASE_ANON_KEY   Supabase → Settings →   apps/mobile/.env
                                  API → anon/public key   

  SUPABASE_SERVICE_ROLE_KEY       Supabase → Settings →   Supabase Edge Function
                                  API → service_role key  secrets only

  REPLICATE_API_TOKEN             replicate.com → Account Supabase Edge Function
                                  → API Tokens            secrets only

  ANTHROPIC_API_KEY               console.anthropic.com → Supabase Edge Function
                                  API Keys                secrets only

  GOOGLE_CLIENT_ID                Google Cloud Console →  apps/mobile src + Supabase
                                  Credentials             Auth
  ------------------------------- ----------------------- ---------------------------

**0.7 Phase 0 Validation Checklist**

26. node \--version outputs v20.x.x

27. pnpm \--version outputs 8.x or 9.x

28. supabase \--version outputs 1.x or higher

29. Xcode 15+ is installed and was opened at least once (license
    accepted)

30. Supabase project is created, pgvector and uuid-ossp extensions are
    enabled

31. All API keys saved securely --- Project URL, anon key, service_role
    key, Replicate token, Anthropic key

32. Google Cloud OAuth 2.0 Client ID created for iOS bundle ID
    ai.cova.app

33. iPhone is trusted in Xcode Devices and Simulators panel

34. Wayfair and Amazon affiliate applications submitted

**PHASE 1 Monorepo Scaffold**

*Create the pnpm workspace, shared TypeScript types, Cursor
configuration, and directory structure*

**Phase 1: Monorepo Scaffold**

Phase 1 creates the complete project structure. The monorepo layout
separates the mobile app from shared types, making it easy to add a web
app or backend utilities later without refactoring.

**1.1 Create Directory Structure**

mkdir -p \~/Desktop/cova

cd \~/Desktop/cova

pnpm init

Create the workspace configuration file at
\~/Desktop/cova/pnpm-workspace.yaml:

packages:

\- \'apps/\*\'

\- \'packages/\*\'

Create all required directories:

mkdir -p apps/mobile

mkdir -p packages/shared/src

mkdir -p assets/3d/furniture/ready

mkdir -p assets/textures/floor

mkdir -p assets/textures/walls

mkdir -p assets/textures/ceiling

mkdir -p assets/textures/hdri

mkdir -p supabase/migrations

mkdir -p supabase/functions

**1.2 Root package.json --- Version Locks**

Replace the contents of \~/Desktop/cova/package.json with the following.
The pnpm overrides block is the most important part --- it prevents pnpm
from hoisting incorrect transitive dependency versions of react,
react-dom, and three.

{

\"name\": \"cova\",

\"version\": \"1.0.0\",

\"private\": true,

\"scripts\": {

\"mobile\": \"pnpm \--filter mobile start\",

\"mobile:ios\": \"pnpm \--filter mobile run ios\",

\"build:ios\": \"pnpm \--filter mobile run eas:build:ios\"

},

\"pnpm\": {

\"overrides\": {

\"react\": \"18.3.1\",

\"react-dom\": \"18.3.1\",

\"three\": \"0.155.0\"

}

}

}

⚠ WARNING: These pnpm overrides are non-negotiable. Without them, pnpm
will hoist a newer version of three.js or react from a transitive
dependency, which silently breaks the 3D engine in ways that are very
hard to diagnose.

**1.3 Shared Types Package**

Create \~/Desktop/cova/packages/shared/package.json:

{

\"name\": \"@cova/shared\",

\"version\": \"1.0.0\",

\"main\": \"src/index.ts\",

\"types\": \"src/index.ts\"

}

**Cursor Prompt --- Shared Types**

CURSOR PROMPT: Create two TypeScript files for the Cova monorepo shared
types package. File 1: packages/shared/src/types.ts Define and export
these TypeScript types: 1. RoomType = \'living_room\' \| \'bedroom\' \|
\'dining_room\' \| \'home_office\' \| \'kitchen\' \| \'bathroom\' \|
\'entryway\' 2. StyleName = \'coastal\' \| \'japandi\' \| \'bohemian\'
\| \'mid_century\' \| \'minimalist\' 3. StyleBlend = Record\<StyleName,
number\> (values are 0-1 weights that sum to 1.0) 4. FurnitureCategory =
\'seating\' \| \'tables\' \| \'lighting\' \| \'storage\' \| \'decor\' \|
\'plants\' \| \'beds\' 5. RoomDimensions = { width: number; depth:
number; height: number; unit: \'ft\' \| \'m\' } 6. User = { id: string;
email: string; full_name: string \| null; avatar_url: string \| null;
style_blend: StyleBlend \| null; token_balance: number; account_type:
\'consumer\' \| \'realtor\'; tokens_enabled: boolean } 7. Room = { id:
string; user_id: string; name: string; room_type: RoomType; style_blend:
StyleBlend; dimensions: RoomDimensions; budget: number; status:
\'active\' \| \'archived\'; render_count: number; latest_render_url:
string \| null; created_at: string; updated_at: string } 8.
FurniturePiece = { id: string; catalog_id: string; name: string;
category: FurnitureCategory; glb_path: string; position: { x: number; y:
number }; rotation_y: number; scale: number; color_override: string \|
null; width: number; depth: number; height: number } 9.
FurnitureCatalogItem = { id: string; name: string; category:
FurnitureCategory; room_types: RoomType\[\]; style_tags: StyleName\[\];
glb_path: string; thumbnail_url: string; width: number; depth: number;
height: number; price_range: \'budget\' \| \'mid\' \| \'premium\' \|
\'luxury\'; colors: string\[\] } 10. Product = { id: string; name:
string; description: string \| null; price: number; retailer: string;
affiliate_url: string; category: FurnitureCategory; room_types:
RoomType\[\]; style_tags: StyleName\[\]; image_url: string;
width_inches: number \| null; depth_inches: number \| null;
height_inches: number \| null } 11. Render = { id: string; room_id:
string; user_id: string; image_url: string \| null; prompt_used: string
\| null; status: \'pending\' \| \'processing\' \| \'completed\' \|
\'failed\'; tokens_used: number; created_at: string } 12. ChatMessage =
{ id: string; room_id: string; role: \'user\' \| \'assistant\'; content:
string; image_url: string \| null; tap_x: number \| null; tap_y: number
\| null; created_at: string } 13. SwipeCard = { id: string; image_url:
string; room_type: RoomType; style_weights: Partial\<StyleBlend\>;
active: boolean } 14. CartItem = { id: string; product: Product;
quantity: number; added_at: string } File 2:
packages/shared/src/index.ts Export everything from \'./types\'.

**1.4 .cursorrules File**

Create \~/Desktop/cova/.cursorrules. Cursor reads this file before every
prompt in the project, so every generated file respects these
conventions automatically:

CURSOR PROMPT: Create the file .cursorrules at
\~/Desktop/cova/.cursorrules with this exact content: \# Cova --- tinder
for your home \# iOS AI-powered interior design app \# Bundle ID:
ai.cova.app \## CRITICAL VERSION LOCKS --- NEVER CHANGE expo: \~52.0.49
react: 18.3.1 EXACT --- no caret react-dom: 18.3.1 EXACT --- no caret
\@react-three/fiber: 8.17.10 EXACT --- no caret \@react-three/drei:
9.88.0 EXACT --- no caret three: 0.155.0 EXACT --- no caret node: 20.x
(never 22+) \## Architecture - Monorepo: pnpm workspaces. Root cova/,
apps/mobile/, packages/shared/ - App: React Native + Expo SDK 52, iOS
only for V1 - State: Zustand with immer middleware --- never useState
for global state - Navigation: React Navigation 6 --- bottom tabs +
stack - Backend: Supabase --- all external calls go through Edge
Functions - Never put API keys in client code --- only Supabase anon key
and URL in .env - Never use useEffect for data fetching --- use Zustand
store actions - Always handle loading, error, and empty states in UI
components - TypeScript strict mode throughout --- never use \'any\' -
Import shared types from \'@cova/shared\' \## 3D Rules - NEVER use
OrbitControls --- it crashes expo-gl. Use CameraController with
PanResponder. - Camera always clamped inside room. No white space ever
visible. - Canvas background color must match ceiling material color. -
All camera values in useRef --- never useState (prevents gesture
re-render conflicts). - Furniture floor plane rotation: \[-Math.PI/2,
-piece.rotation_y, 0\], position \[0, 0.002, 0\] - GLB models: useGLTF
with Suspense wrapper at parent level \## Supabase Rules - RLS enabled
on all tables before any data is written - Edge Functions runtime: Deno
--- never import Node.js modules - Storage buckets: room-photos,
renders, swipe-cards, assets (all private) - Service role key only in
Edge Function secrets --- never in client code \## UI / Style - Primary:
#1B3A2D (dark forest green) - Accent: #C47B3C (copper gold) -
Background: #F5F0E8 (warm cream) - Never show style names (Japandi,
Coastal etc) in any user-facing UI - Font: System default (SF Pro on
iOS) - Never use white space behind the 3D room viewer

**1.5 .cursorignore File**

Create \~/Desktop/cova/.cursorignore to prevent Cursor from indexing
large binary files:

node_modules/

.expo/

ios/

android/

assets/3d/

assets/textures/

\*.glb

\*.gltf

\*.hdr

\*.png

\*.jpg

\*.jpeg

\*.webp

dist/

build/

.git/

**1.6 Install Root Dependencies**

cd \~/Desktop/cova

pnpm install

This should complete quickly since the root has no dependencies yet. The
purpose is to initialise the pnpm lockfile.

**1.7 Phase 1 Validation Checklist**

35. \~/Desktop/cova/pnpm-workspace.yaml exists and lists apps/\* and
    packages/\*

36. \~/Desktop/cova/package.json has pnpm.overrides for react 18.3.1,
    react-dom 18.3.1, three 0.155.0

37. \~/Desktop/cova/.cursorrules exists and contains version lock
    section

38. \~/Desktop/cova/.cursorignore exists

39. packages/shared/src/types.ts exports all 14 type definitions

40. packages/shared/src/index.ts re-exports from types.ts

41. pnpm install completes without errors from the repo root

**PHASE 2 Supabase Backend**

*10 database tables with RLS, pgvector product embeddings, 4 storage
buckets, 5 Edge Functions*

**Phase 2: Supabase Backend**

Phase 2 builds the complete backend. The database schema, storage
configuration, and Edge Functions must be fully working before any app
code is written --- the app calls these functions, so they need to exist
first.

**2.1 Link Supabase CLI to Your Project**

cd \~/Desktop/cova

supabase init

supabase login

supabase link \--project-ref YOUR_PROJECT_REFERENCE_ID

📝 NOTE: YOUR_PROJECT_REFERENCE_ID is the string in your Supabase
project URL before .supabase.co. Example: if your URL is
https://xdeacbmkdwqrwxonqaqh.supabase.co, the reference ID is
xdeacbmkdwqrwxonqaqh

**2.2 Database Migrations**

Create each migration file exactly as specified. Migrations are applied
in numerical order. Run supabase db push after creating all files.

**Migration 001 --- Enable Extensions**

Create
\~/Desktop/cova/supabase/migrations/20240001000000_extensions.sql:

\-- Enable pgvector for 1024-dimensional CLIP product embeddings

CREATE EXTENSION IF NOT EXISTS vector;

\-- Enable UUID generation

CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";

**Migration 002 --- Users Table**

Create \~/Desktop/cova/supabase/migrations/20240002000000_users.sql:

CREATE TABLE public.users (

id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

email TEXT NOT NULL,

full_name TEXT,

avatar_url TEXT,

style_blend JSONB NOT NULL DEFAULT \'{}\',

account_type TEXT NOT NULL DEFAULT \'consumer\'

CHECK (account_type IN (\'consumer\', \'realtor\')),

token_balance INTEGER NOT NULL DEFAULT 999,

tokens_enabled BOOLEAN NOT NULL DEFAULT false,

created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY \"users_select_own\" ON public.users

FOR SELECT USING (auth.uid() = id);

CREATE POLICY \"users_update_own\" ON public.users

FOR UPDATE USING (auth.uid() = id);

\-- Auto-create profile row when a new auth user signs up

CREATE OR REPLACE FUNCTION public.handle_new_user()

RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path =
public AS \$\$

BEGIN

INSERT INTO public.users (id, email, full_name, avatar_url)

VALUES (

NEW.id,

COALESCE(NEW.email, \'\'),

NEW.raw_user_meta_data -\>\> \'full_name\',

NEW.raw_user_meta_data -\>\> \'avatar_url\'

);

RETURN NEW;

END;

\$\$;

CREATE TRIGGER on_auth_user_created

AFTER INSERT ON auth.users

FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

**Migration 003 --- Rooms Table**

Create \~/Desktop/cova/supabase/migrations/20240003000000_rooms.sql:

CREATE TABLE public.rooms (

id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

name TEXT NOT NULL DEFAULT \'My Room\',

room_type TEXT NOT NULL

CHECK (room_type IN (\'living_room\',\'bedroom\',\'dining_room\',

\'home_office\',\'kitchen\',\'bathroom\',\'entryway\')),

style_blend JSONB NOT NULL DEFAULT \'{}\',

dimensions_json JSONB NOT NULL DEFAULT

\'{\"width\":16,\"depth\":14,\"height\":9,\"unit\":\"ft\"}\',

budget INTEGER NOT NULL DEFAULT 2500,

status TEXT NOT NULL DEFAULT \'active\'

CHECK (status IN (\'active\', \'archived\')),

render_count INTEGER NOT NULL DEFAULT 0,

latest_render_url TEXT,

created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY \"rooms_own\" ON public.rooms

FOR ALL USING (auth.uid() = user_id);

**Migration 004 --- Renders Table**

Create \~/Desktop/cova/supabase/migrations/20240004000000_renders.sql:

CREATE TABLE public.renders (

id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,

user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

image_url TEXT,

prompt_used TEXT,

style_applied TEXT,

status TEXT NOT NULL DEFAULT \'pending\'

CHECK (status IN (\'pending\',\'processing\',\'completed\',\'failed\')),

render_type TEXT NOT NULL DEFAULT \'draft\'

CHECK (render_type IN (\'draft\', \'hd\')),

tokens_used INTEGER NOT NULL DEFAULT 0,

replicate_prediction_id TEXT,

created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

ALTER TABLE public.renders ENABLE ROW LEVEL SECURITY;

CREATE POLICY \"renders_own\" ON public.renders

FOR ALL USING (auth.uid() = user_id);

**Migration 005 --- Furniture Placements**

Create
\~/Desktop/cova/supabase/migrations/20240005000000_furniture_placements.sql:

CREATE TABLE public.furniture_placements (

id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,

furniture_catalog_id TEXT NOT NULL,

position_x FLOAT NOT NULL DEFAULT 0,

position_y FLOAT NOT NULL DEFAULT 0,

rotation_y FLOAT NOT NULL DEFAULT 0,

scale FLOAT NOT NULL DEFAULT 1,

color_override TEXT,

created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

ALTER TABLE public.furniture_placements ENABLE ROW LEVEL SECURITY;

CREATE POLICY \"placements_via_room\" ON public.furniture_placements

FOR ALL USING (

EXISTS (

SELECT 1 FROM public.rooms

WHERE rooms.id = room_id AND rooms.user_id = auth.uid()

)

);

**Migration 006 --- Products Table**

Create \~/Desktop/cova/supabase/migrations/20240006000000_products.sql:

CREATE TABLE public.products (

id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

name TEXT NOT NULL,

description TEXT,

price INTEGER NOT NULL, \-- in cents

retailer TEXT NOT NULL,

affiliate_url TEXT NOT NULL,

category TEXT NOT NULL,

room_types TEXT\[\] NOT NULL DEFAULT \'{}\',

style_tags TEXT\[\] NOT NULL DEFAULT \'{}\',

image_url TEXT NOT NULL,

width_inches FLOAT,

depth_inches FLOAT,

height_inches FLOAT,

clip_embedding vector(1024),

active BOOLEAN NOT NULL DEFAULT true,

created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

\-- Products are public read (anyone can browse catalog)

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY \"products_public_read\" ON public.products

FOR SELECT USING (active = true);

\-- HNSW index for fast cosine similarity search

CREATE INDEX ON public.products

USING hnsw (clip_embedding vector_cosine_ops)

WITH (m = 16, ef_construction = 64);

**Migration 007 --- Cart Items**

Create
\~/Desktop/cova/supabase/migrations/20240007000000_cart_items.sql:

CREATE TABLE public.cart_items (

id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE
CASCADE,

quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity \> 0),

added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

UNIQUE (user_id, product_id)

);

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY \"cart_own\" ON public.cart_items

FOR ALL USING (auth.uid() = user_id);

**Migration 008 --- Chat Messages**

Create
\~/Desktop/cova/supabase/migrations/20240008000000_chat_messages.sql:

CREATE TABLE public.chat_messages (

id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,

user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

role TEXT NOT NULL CHECK (role IN (\'user\', \'assistant\')),

content TEXT NOT NULL,

image_url TEXT,

tap_x FLOAT,

tap_y FLOAT,

created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY \"chat_own\" ON public.chat_messages

FOR ALL USING (auth.uid() = user_id);

**Migration 009 --- Swipe Cards**

Create
\~/Desktop/cova/supabase/migrations/20240009000000_swipe_cards.sql:

CREATE TABLE public.swipe_cards (

id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

image_url TEXT NOT NULL,

room_type TEXT NOT NULL,

style_weights JSONB NOT NULL DEFAULT \'{}\',

batch_name TEXT,

active BOOLEAN NOT NULL DEFAULT true,

created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

\-- Public read --- quiz cards are not user-specific

ALTER TABLE public.swipe_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY \"swipe_cards_public_read\" ON public.swipe_cards

FOR SELECT USING (active = true);

**Migration 010 --- Token Transactions**

Create
\~/Desktop/cova/supabase/migrations/20240010000000_token_transactions.sql:

CREATE TABLE public.token_transactions (

id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

amount INTEGER NOT NULL, \-- positive = credit, negative = debit

type TEXT NOT NULL

CHECK (type IN
(\'purchase\',\'render_draft\',\'render_hd\',\'bonus\',\'refund\')),

description TEXT,

render_id UUID REFERENCES public.renders(id),

created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY \"transactions_own\" ON public.token_transactions

FOR ALL USING (auth.uid() = user_id);

**2.3 Apply Migrations**

cd \~/Desktop/cova

supabase db push

Expected output: each migration file listed with status \'Applying
migration\' followed by success. If any migration fails, fix it and run
supabase db push again --- it will skip migrations already applied.

⚠ WARNING: If supabase db push reports a connection error, verify you
have run \'supabase link\' with the correct project reference ID, and
that your internet connection is active.

Verify in Supabase dashboard → Table Editor that all 10 tables are
present: users, rooms, renders, furniture_placements, products,
cart_items, chat_messages, swipe_cards, token_transactions. Also check
that the waitlist table is absent (it is not in V1 --- ignore it if
mentioned elsewhere).

**2.4 Storage Buckets**

Create four private storage buckets in Supabase dashboard → Storage →
New Bucket:

  ------------- ------------- ----------- ----------------------------------
  **Bucket      **Public?**   **File Size **Allowed MIME Types**
  Name**                      Limit**     

  room-photos   Private (No)  10 MB       image/jpeg, image/png, image/heic,
                                          image/webp

  renders       Private (No)  20 MB       image/jpeg, image/png

  swipe-cards   Private (No)  5 MB        image/jpeg, image/png, image/webp

  assets        Private (No)  100 MB      model/gltf-binary, image/\*
  ------------- ------------- ----------- ----------------------------------

After creating each of the user-specific buckets (room-photos and
renders), add an RLS storage policy. In Supabase dashboard → Storage →
\[bucket name\] → Policies → New Policy → For full customization. Use
this SQL template, replacing BUCKETNAME:

CREATE POLICY \"BUCKETNAME_user_isolation\"

ON storage.objects FOR ALL

USING (

bucket_id = \'BUCKETNAME\'

AND auth.uid()::text = (storage.foldername(name))\[1\]

);

📝 NOTE: The storage path convention for all user uploads is:
{user_id}/{filename}. The RLS policy above checks that the first folder
in the path matches the authenticated user\'s ID. Never store files at
the root of a private bucket.

**2.5 Edge Functions**

Create all five Edge Functions. Edge Functions run on the Deno runtime
--- do not import any Node.js modules. All imports must use
Deno-compatible URLs or the npm: specifier.

**render-room Edge Function**

Create the directory and prompt Cursor to write the function:

mkdir -p supabase/functions/render-room

CURSOR PROMPT: Create supabase/functions/render-room/index.ts as a
Supabase Edge Function (Deno runtime, TypeScript). This function starts
an AI render job for a room. IMPORTANT: Deno runtime only. No Node.js
imports. Use \'import { serve } from
\"https://deno.land/std@0.168.0/http/server.ts\"\' and \'import {
createClient } from \"https://esm.sh/@supabase/supabase-js@2\"\'.
Request: POST with JSON body: { room_id: string, image_base64: string,
// room photo as base64 data URL depth_map_base64: string, // depth map
as base64 data URL style_blend: Record\<string, number\>, room_type:
string, render_type: \'draft\' \| \'hd\' } Response: { render_id:
string, prediction_id: string, status: \'processing\' } Logic: 1. Parse
Authorization header. Use createClient with service role key. Call
supabase.auth.getUser(token) to verify auth. Return 401 if unauthorized.
2. Fetch the user row to check tokens_enabled and token_balance. 3. If
tokens_enabled is true: check balance \>= 2 for draft or \>= 3 for hd.
Return 402 { error: \'Insufficient tokens\' } if low. 4. Build the FLUX
prompt from style_blend. Sort styles by weight descending. Top style
gets primary description, secondary style gets \'with subtle X
influences\'. Include: \'Photorealistic interior photograph,
\[room_type\], \[style descriptions\], professional architectural
photography, 8k resolution, perfect soft lighting, warm natural light
through windows\'. Style prompt fragments: - coastal: \'coastal style,
light natural textures, white and blue palette, natural driftwood, linen
fabrics, nautical accents, airy and bright\' - japandi: \'japandi style,
clean minimal lines, natural wood and stone, muted earth tones, zen calm
atmosphere, functional simplicity\' - bohemian: \'bohemian style, rich
warm colors, layered textiles, mixed patterns, plants and natural
elements, eclectic collected feel\' - mid_century: \'mid-century modern
style, clean organic shapes, warm wood tones, bold accent colors,
retro-futurist furniture\' - minimalist: \'minimalist style, pure clean
lines, neutral white and grey palette, maximum negative space, hidden
storage, serene\' 5. Call Replicate API to start a FLUX ControlNet
prediction: POST https://api.replicate.com/v1/predictions Headers:
Authorization: Token \$REPLICATE_API_TOKEN Body: { version:
\'xlabs-ai/flux-dev-controlnet:latest\', input: { prompt:
constructedPrompt, control_image: depth_map_base64, control_type:
\'depth\', num_inference_steps: render_type === \'hd\' ? 40 : 28,
guidance_scale: 3.5, controlnet_conditioning_scale: 0.6, width: 1024,
height: 1024 } } 6. Insert a row into the renders table: { room_id,
user_id, status: \'processing\', render_type, replicate_prediction_id:
prediction.id, prompt_used: constructedPrompt } 7. If tokens_enabled,
update user token_balance and insert a token_transactions row. 8. Return
{ render_id, prediction_id, status: \'processing\' }. Add CORS headers
to all responses: \'Access-Control-Allow-Origin\': \'\*\'
\'Access-Control-Allow-Headers\': \'authorization, x-client-info,
apikey, content-type\' Handle OPTIONS preflight request with 200
response.

**get-render-status Edge Function**

mkdir -p supabase/functions/get-render-status

CURSOR PROMPT: Create supabase/functions/get-render-status/index.ts as a
Supabase Edge Function (Deno runtime). This function polls the status of
a Replicate prediction and, when complete, saves the render image to
Supabase storage. Request: GET with query params ?render_id=UUID
Logic: 1. Parse auth from Authorization header. Verify user. 2. Fetch
the render row from Supabase using render_id. Verify the render belongs
to the authenticated user. 3. Call Replicate GET
https://api.replicate.com/v1/predictions/{replicate_prediction_id} 4.
Handle each Replicate status: status === \'succeeded\': a. Download the
output image URL from prediction.output\[0\] b. Fetch the image bytes c.
Upload to Supabase storage renders bucket at path:
{user_id}/{render_id}.jpg d. Get the public URL using
supabase.storage.from(\'renders\').getPublicUrl(path) --- note: even
though bucket is private, use a signed URL:
supabase.storage.from(\'renders\').createSignedUrl(path, 3600) e. Update
renders table: { status: \'completed\', image_url: signedUrl } f. Update
rooms table: { latest_render_url: signedUrl, render_count:
render_count + 1 } g. Return { status: \'completed\', image_url:
signedUrl } status === \'failed\' or \'canceled\': a. Update renders
table: { status: \'failed\' } b. Return { status: \'failed\', error:
prediction.error } status === \'processing\' or \'starting\': a. Return
{ status: \'processing\', image_url: null } 5. Add CORS headers. Handle
OPTIONS.

**clip-embed Edge Function**

mkdir -p supabase/functions/clip-embed

CURSOR PROMPT: Create supabase/functions/clip-embed/index.ts as a
Supabase Edge Function (Deno runtime). This function computes a
1024-dimensional CLIP embedding for an image, used for visual product
matching. Request: POST with JSON body: { image_url?: string,
image_base64?: string } Provide either image_url or image_base64.
Logic: 1. Verify auth. 2. Call Replicate API to run OpenCLIP: POST
https://api.replicate.com/v1/predictions { version:
\'andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a\',
input: { inputs: image_url \|\| image_base64 } } 3. Poll
https://api.replicate.com/v1/predictions/{id} every 1 second until
status is \'succeeded\' or \'failed\'. 4. On success: the output is a
JSON array of { embedding: number\[\] }. Extract
embedding\[0\].embedding. 5. Return { embedding: number\[\] } --- the
1024-dim float array. Return 500 on failure with error message. Add CORS
headers. Handle OPTIONS.

**match-products Edge Function**

mkdir -p supabase/functions/match-products

CURSOR PROMPT: Create supabase/functions/match-products/index.ts as a
Supabase Edge Function (Deno runtime). This function finds the most
visually similar products to an AI render using pgvector cosine
similarity. Request: POST with JSON body: { render_embedding:
number\[\], // 1024-dim CLIP vector room_type: string, style_blend:
Record\<string, number\>, budget: number, // max price in cents, 0 = no
limit limit?: number // default 15 } Logic: 1. Verify auth. 2. If
render_embedding is null or empty, return { products: \[\] }. 3. Use
supabase with service role to run a raw SQL query: SELECT id, name,
description, price, retailer, affiliate_url, category, room_types,
style_tags, image_url, width_inches, depth_inches, height_inches, 1 -
(clip_embedding \<=\> \$1::vector) AS similarity FROM public.products
WHERE active = true AND \$2 = ANY(room_types) AND (\$3 = 0 OR price \<=
\$3) ORDER BY clip_embedding \<=\> \$1::vector LIMIT \$4 Parameters:
\[JSON.stringify(render_embedding), room_type, budget, limit \|\| 15\]
4. Return { products: rows } sorted by similarity descending. Add CORS
headers. Handle OPTIONS.

**chat-room Edge Function**

mkdir -p supabase/functions/chat-room

CURSOR PROMPT: Create supabase/functions/chat-room/index.ts as a
Supabase Edge Function (Deno runtime). This function handles one message
turn in the AI design assistant chat. Request: POST with JSON body: {
room_id: string, message: string, render_image_base64?: string, tap_x?:
number, tap_y?: number, chat_history: Array\<{ role: \'user\' \|
\'assistant\', content: string }\> } Logic: 1. Verify auth from
Authorization header. 2. Fetch the room from Supabase: id, room_type,
dimensions_json, style_blend, budget. 3. Build the system prompt: \'You
are Cova, an expert and enthusiastic AI interior designer. You are
looking at a photorealistic AI render of the user\'s \[room_type\]. The
room is approximately \[width\] ft wide, \[depth\] ft deep, and
\[height\] ft tall. The user\'s design style leans toward \[top style
description in plain English --- e.g. \"coastal with japandi accents\"
based on style_blend\]. Their total room budget is \$\[budget formatted
with commas\]. Help them make specific, achievable design improvements.
Be warm, encouraging, and concise. Focus on what will make the biggest
visual impact. Never mention AI, FLUX, ControlNet, or any technical
rendering terms.\' If tap_x and tap_y are provided, append to system
prompt: \'The user has indicated a specific area of the room ---
approximately \[tap_x\]% from the left and \[tap_y\]% from the top of
the image. Focus your response on that particular area or element.\' 4.
Build the Claude API messages array: - Start with chat_history - Add the
new user message. If render_image_base64 is provided, make the last user
message a vision message: { role: \'user\', content: \[ { type:
\'image\', source: { type: \'base64\', media_type: \'image/jpeg\', data:
render_image_base64 } }, { type: \'text\', text: message } \]}
Otherwise: { role: \'user\', content: message } 5. Call Anthropic API:
POST https://api.anthropic.com/v1/messages Headers: x-api-key:
\$ANTHROPIC_API_KEY, anthropic-version: 2023-06-01 Body: { model:
\'claude-sonnet-4-20250514\', max_tokens: 1024, system: systemPrompt,
messages } 6. Extract response text from data.content\[0\].text. 7.
Insert user message to chat_messages table (role: \'user\', content:
message, tap_x, tap_y). 8. Insert assistant message to chat_messages
table (role: \'assistant\', content: responseText). 9. Return {
response: responseText }. Add CORS headers. Handle OPTIONS.

**2.6 Deploy All Edge Functions**

cd \~/Desktop/cova

supabase functions deploy render-room

supabase functions deploy get-render-status

supabase functions deploy clip-embed

supabase functions deploy match-products

supabase functions deploy chat-room

Each deployment should output: \'Deployed Function render-room on
project \[id\]\'. Check Supabase dashboard → Edge Functions to confirm
all five are listed as Active.

**2.7 Set Edge Function Secrets**

In Supabase dashboard → Edge Functions → Manage Secrets, add these three
secrets:

  --------------------------- --------------------------------------------
  **Secret Name**             **Value Source**

  REPLICATE_API_TOKEN         replicate.com → Account Settings → API
                              Tokens

  ANTHROPIC_API_KEY           console.anthropic.com → API Keys

  SUPABASE_SERVICE_ROLE_KEY   Supabase → Project Settings → API →
                              service_role key
  --------------------------- --------------------------------------------

⚠ WARNING: SUPABASE_SERVICE_ROLE_KEY and ANTHROPIC_API_KEY must NEVER
appear in any client-side code, any .env file committed to git, or any
React Native source file. They exist only as Supabase Edge Function
secrets.

**2.8 Common Phase 2 Errors & Fixes**

  --------------------- ---------------- ------------------------------------------------------
  **Error**             **Cause**        **Fix**

  supabase db push:     Migration was    Run: supabase db reset (dev only --- deletes all
  \'relation already    partially        data). Or manually drop the offending table in
  exists\'              applied          Supabase SQL editor.
                        previously       

  supabase db push:     pgvector not     Enable pgvector in Supabase dashboard → Extensions
  \'extension           enabled before   first, then run supabase db push.
  \"vector\" does not   migration 001    
  exist\'               runs             

  Edge Function deploy: Node.js import   Replace all \'require()\' or \'import from node:\*\'
  \'SyntaxError:        used in Deno     with Deno CDN imports like \'https://esm.sh/\...\'
  Unexpected token\'    function         

  Edge Function: 401    Authorization    Extract token: const token =
  Unauthorized on all   header not being req.headers.get(\'Authorization\')?.replace(\'Bearer
  requests              read             \', \'\')

  chat-room: Claude     Anthropic API    Ensure header: \'anthropic-version: 2023-06-01\' and
  returns error 400     version header   model: \'claude-sonnet-4-20250514\'
                        missing or wrong 
                        model string     

  render-room:          base64 image     Ensure image_base64 starts with
  Replicate 422         missing data URL \'data:image/jpeg;base64,\' before sending to
  Unprocessable Entity  prefix           Replicate

  Storage upload fails  RLS policy path  Ensure file path is exactly: {user_id}/{filename} with
  with 403              format mismatch  no leading slash
  --------------------- ---------------- ------------------------------------------------------

**2.9 Phase 2 Validation Checklist**

42. supabase db push completes --- all 10 tables visible in Supabase
    Table Editor

43. pgvector extension enabled --- run: SELECT \* FROM pg_extension
    WHERE extname = \'vector\'; --- returns one row

44. HNSW index created on products.clip_embedding

45. All 4 storage buckets created and set to Private

46. RLS storage policies applied to room-photos and renders buckets

47. All 5 Edge Functions deployed and showing as Active in dashboard

48. All 3 Edge Function secrets set (REPLICATE_API_TOKEN,
    ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY)

49. Test unauthenticated call to render-room returns 401: curl -X POST
    https://YOUR_PROJECT.supabase.co/functions/v1/render-room -H
    \'Content-Type: application/json\' -d \'{}\' --- expected response:
    {\"error\":\"Unauthorized\"}

**PHASE 2.5 3D Furniture Assets & PBR Textures**

*Download GLB models, PBR texture sets, HDRI environment maps, and
generate the furniture catalog TypeScript file*

**Phase 2.5: 3D Assets**

Phase 2.5 is a content phase, not a coding phase. It assembles all the
3D furniture models, PBR surface textures, and HDRI environment maps
that the 3D room engine needs in Phase 4. This can be done in parallel
with Phase 3 if you have two team members.

**2.5.1 GLB Furniture Models**

All furniture models must be in GLB format (binary glTF). Required
sources --- all free licenses:

  --------------- -------------------------------------------- ------------- -----------------------
  **Source**      **URL**                                      **License**   **Best For**

  Polyhaven       polyhaven.com/models                         CC0 (Public   High-quality PBR
  Models                                                       Domain)       furniture

  Sketchfab Free  sketchfab.com (filter: Free Download)        CC BY 4.0 or  Wide variety of styles
                                                               CC0           

  Kenney.nl       kenney.nl/assets/furniture-kit               CC0 (Public   Low-poly, great for
                                                               Domain)       placeholder

  KhronosGroup    github.com/KhronosGroup/glTF-Sample-Models   CC0 / various Technically correct
  glTF Samples                                                               reference models

  Google Poly     github.com/nicktindall/cyclopedia-assets     Apache 2.0    Varied collection of
  Archive                                                                    objects
  --------------- -------------------------------------------- ------------- -----------------------

Required GLB files for V1 launch --- download at least these pieces per
category:

  -------------- -------------------------- ---------------------------------
  **Category**   **Required Pieces          **Filename Convention**
                 (Minimum)**                

  Seating        sofa_modern,               category_descriptor.glb
                 sofa_sectional,            
                 armchair_accent,           
                 armchair_lounge,           
                 dining_chair_wood          

  Beds           bed_king, bed_queen,       bed_size.glb
                 bed_single,                
                 headboard_upholstered      

  Tables         coffee_table_round,        table_type.glb
                 coffee_table_rect,         
                 dining_table_6seat,        
                 side_table, desk_simple    

  Lighting       floor_lamp_arc,            lamp_type.glb
                 floor_lamp_tripod,         
                 table_lamp_ceramic,        
                 pendant_light,             
                 ceiling_light              

  Storage        bookshelf_tall,            storage_type.glb
                 bookshelf_low,             
                 dresser_6drawer, wardrobe, 
                 tv_stand, sideboard        

  Decor          plant_fiddle_leaf,         decor_type.glb
                 plant_pothos,              
                 plant_cactus, rug_area,    
                 mirror_round, mirror_arch  
  -------------- -------------------------- ---------------------------------

Destination directory: \~/Desktop/cova/assets/3d/furniture/ready/

⚠ WARNING: GLB files must be under 5 MB each. Large files cause slow
load times on mobile. To optimise an oversized model: npx gltf-transform
optimize input.glb output.glb \--texture-compress webp

**2.5.2 PBR Texture Sets**

Download from polyhaven.com/textures at 1K resolution (2K if device
performance permits --- test on device). For each texture set download:
diffuse/color, normal, roughness, and ambient occlusion maps.

  --------------------- -------------------------- ----------------------------
  **Polyhaven Texture   **Destination Folder**     **Room Surface**
  Set**                                            

  Wood Floor Planks 02  assets/textures/floor/     Default room floor

  Herringbone Parquet   assets/textures/floor/     Alternative floor ---
                                                   mid-century style

  White Plaster         assets/textures/walls/     Default wall surface

  Cream Plaster         assets/textures/walls/     Coastal/Japandi wall variant

  Painted Plaster Beige assets/textures/walls/     Bohemian wall variant

  White Wooden Ceiling  assets/textures/ceiling/   Default ceiling surface
  --------------------- -------------------------- ----------------------------

**2.5.3 HDRI Environment Maps**

Download from polyhaven.com/hdris at 1K resolution (.hdr format):

  ------------------ ------------------------- ---------------------------------
  **Polyhaven HDRI   **Filename to Save As**   **Style Assignment**
  Name**                                       

  Sunset Fairway     sunset_fairway_1k.hdr     coastal --- warm golden outdoor
                                               light

  Small Empty Room   small_empty_room_1k.hdr   japandi --- soft diffuse interior
                                               light

  Colorful Studio    colorful_studio_1k.hdr    bohemian --- warm mixed color
                                               lighting

  Loft Hall          loft_hall_1k.hdr          mid_century --- warm ambient loft
                                               light

  Grey Room          grey_room_1k.hdr          minimalist --- clean neutral
                                               diffuse
  ------------------ ------------------------- ---------------------------------

Destination directory: \~/Desktop/cova/assets/textures/hdri/

**2.5.4 Furniture Catalog TypeScript File**

**Cursor Prompt --- Furniture Catalog**

CURSOR PROMPT: Create apps/mobile/src/data/furnitureCatalog.ts. This
file exports the furniture catalog --- the list of all furniture pieces
available in the 3D room viewer. First, import the FurnitureCatalogItem
type from \'@cova/shared\'. Export a constant FURNITURE_CATALOG:
FurnitureCatalogItem\[\] array. Create entries for the following pieces
(use actual filenames from assets/3d/furniture/ready/ if they differ ---
these are target names): \-\-- SEATING \-\-- { id: \'sofa-modern-01\',
name: \'Modern Sectional Sofa\', category: \'seating\', room_types:
\[\'living_room\'\], style_tags: \[\'minimalist\',\'mid_century\'\],
glb_path: require(\'../../assets/3d/furniture/ready/sofa_modern.glb\'),
width: 8, depth: 3.5, height: 2.8, price_range: \'mid\', colors:
\[\'#F5F0E8\',\'#8B7355\',\'#1B3A2D\',\'#C8C8C8\'\] } { id:
\'armchair-accent-01\', name: \'Accent Armchair\', category:
\'seating\', room_types: \[\'living_room\',\'bedroom\'\], style_tags:
\[\'coastal\',\'bohemian\'\], glb_path:
require(\'../../assets/3d/furniture/ready/armchair_accent.glb\'), width:
3, depth: 3, height: 3.2, price_range: \'mid\', colors:
\[\'#C47B3C\',\'#1B3A2D\',\'#F5F0E8\',\'#8B8B8B\'\] } { id:
\'dining-chair-01\', name: \'Wood Dining Chair\', category: \'seating\',
room_types: \[\'dining_room\',\'kitchen\'\], style_tags:
\[\'japandi\',\'mid_century\',\'minimalist\'\], glb_path:
require(\'../../assets/3d/furniture/ready/dining_chair_wood.glb\'),
width: 1.8, depth: 2, height: 3, price_range: \'budget\', colors:
\[\'#8B7355\',\'#5C3D1E\',\'#F5F5F5\'\] } \-\-- BEDS \-\-- { id:
\'bed-king-01\', name: \'King Platform Bed\', category: \'beds\',
room_types: \[\'bedroom\'\], style_tags: \[\'minimalist\',\'japandi\'\],
glb_path: require(\'../../assets/3d/furniture/ready/bed_king.glb\'),
width: 7, depth: 7.5, height: 2, price_range: \'mid\', colors:
\[\'#8B7355\',\'#1B3A2D\',\'#F5F0E8\'\] } { id: \'bed-queen-01\', name:
\'Queen Upholstered Bed\', category: \'beds\', room_types:
\[\'bedroom\'\], style_tags: \[\'coastal\',\'bohemian\'\], glb_path:
require(\'../../assets/3d/furniture/ready/bed_queen.glb\'), width: 6,
depth: 7, height: 2.5, price_range: \'mid\', colors:
\[\'#C8B89A\',\'#E8DFD0\',\'#1B3A2D\'\] } \-\-- TABLES \-\-- { id:
\'coffee-table-01\', name: \'Round Coffee Table\', category: \'tables\',
room_types: \[\'living_room\'\], style_tags:
\[\'japandi\',\'minimalist\',\'coastal\'\], glb_path:
require(\'../../assets/3d/furniture/ready/coffee_table_round.glb\'),
width: 3.5, depth: 3.5, height: 1.5, price_range: \'budget\', colors:
\[\'#8B7355\',\'#5C3D1E\',\'#C8C8C8\'\] } { id: \'dining-table-01\',
name: \'6-Person Dining Table\', category: \'tables\', room_types:
\[\'dining_room\',\'kitchen\'\], style_tags:
\[\'mid_century\',\'japandi\',\'minimalist\'\], glb_path:
require(\'../../assets/3d/furniture/ready/dining_table_6seat.glb\'),
width: 6, depth: 3, height: 2.5, price_range: \'mid\', colors:
\[\'#8B7355\',\'#5C3D1E\',\'#FFFFFF\'\] } \-\-- LIGHTING \-\-- { id:
\'floor-lamp-01\', name: \'Arc Floor Lamp\', category: \'lighting\',
room_types: \[\'living_room\',\'bedroom\',\'home_office\'\], style_tags:
\[\'mid_century\',\'minimalist\'\], glb_path:
require(\'../../assets/3d/furniture/ready/floor_lamp_arc.glb\'), width:
2, depth: 2, height: 7, price_range: \'mid\', colors:
\[\'#C47B3C\',\'#1B3A2D\',\'#C8C8C8\',\'#FFFFFF\'\] } { id:
\'pendant-01\', name: \'Pendant Light\', category: \'lighting\',
room_types: \[\'dining_room\',\'kitchen\',\'bedroom\'\], style_tags:
\[\'coastal\',\'bohemian\',\'japandi\'\], glb_path:
require(\'../../assets/3d/furniture/ready/pendant_light.glb\'), width:
1.5, depth: 1.5, height: 2, price_range: \'budget\', colors:
\[\'#C8B89A\',\'#5C3D1E\',\'#C8C8C8\'\] } \-\-- STORAGE \-\-- { id:
\'bookshelf-01\', name: \'Tall Bookshelf\', category: \'storage\',
room_types: \[\'living_room\',\'bedroom\',\'home_office\'\], style_tags:
\[\'minimalist\',\'japandi\',\'mid_century\'\], glb_path:
require(\'../../assets/3d/furniture/ready/bookshelf_tall.glb\'), width:
3, depth: 1, height: 7, price_range: \'budget\', colors:
\[\'#8B7355\',\'#FFFFFF\',\'#1B3A2D\',\'#5C3D1E\'\] } { id:
\'dresser-01\', name: \'6-Drawer Dresser\', category: \'storage\',
room_types: \[\'bedroom\'\], style_tags:
\[\'minimalist\',\'japandi\',\'mid_century\'\], glb_path:
require(\'../../assets/3d/furniture/ready/dresser_6drawer.glb\'), width:
4, depth: 1.5, height: 3, price_range: \'mid\', colors:
\[\'#8B7355\',\'#FFFFFF\',\'#5C3D1E\'\] } \-\-- DECOR \-\-- { id:
\'plant-fiddle-01\', name: \'Fiddle Leaf Fig\', category: \'plants\',
room_types:
\[\'living_room\',\'bedroom\',\'dining_room\',\'home_office\'\],
style_tags: \[\'coastal\',\'bohemian\',\'japandi\',\'minimalist\'\],
glb_path:
require(\'../../assets/3d/furniture/ready/plant_fiddle_leaf.glb\'),
width: 2, depth: 2, height: 6, price_range: \'budget\', colors: \[\] } {
id: \'rug-area-01\', name: \'Area Rug\', category: \'decor\',
room_types: \[\'living_room\',\'bedroom\',\'dining_room\'\], style_tags:
\[\'bohemian\',\'coastal\',\'mid_century\'\], glb_path:
require(\'../../assets/3d/furniture/ready/rug_area.glb\'), width: 8,
depth: 6, height: 0.05, price_range: \'budget\', colors:
\[\'#C47B3C\',\'#1B3A2D\',\'#C8B89A\',\'#8B7355\'\] } Also export a
helper function: getFurnitureForRoom(roomType: RoomType, styleBlend:
StyleBlend, priceRange?: string): FurnitureCatalogItem\[\] This function
returns all catalog items matching the roomType, sorted by style match
score (sum of style_blend weights for each matching style tag),
optionally filtered by price_range.

**2.5.5 Phase 2.5 Validation Checklist**

50. assets/3d/furniture/ready/ contains at least 30 GLB files

51. All GLB files are under 5 MB (check with: ls -lh
    assets/3d/furniture/ready/)

52. assets/textures/floor/, walls/, ceiling/ each contain texture files

53. assets/textures/hdri/ contains 5 .hdr files named per the table
    above

54. furnitureCatalog.ts compiles with no TypeScript errors: cd
    apps/mobile && npx tsc \--noEmit

**PHASE 3 Expo App Foundation**

*All dependencies at locked versions, Metro config, navigation, Supabase
client, Zustand store, Dev Client build*

**Phase 3: Expo App Foundation**

Phase 3 creates the complete Expo mobile app structure. Every dependency
is installed at its locked version. After this phase, the app will
launch on a physical iPhone via Expo Dev Client with working navigation.

**3.1 Create Expo App in Monorepo**

cd \~/Desktop/cova

npx create-expo-app apps/mobile \--template blank-typescript

Verify the Expo SDK version in apps/mobile/package.json shows expo:
\'\~52.0.49\'. If it shows a different version, manually edit it before
proceeding.

**3.2 Install All Dependencies at Locked Versions**

Run these commands from \~/Desktop/cova/apps/mobile/:

cd apps/mobile

\# Install exact React versions (remove existing ones first)

pnpm remove react react-dom

pnpm add react@18.3.1 react-dom@18.3.1

\# Three.js ecosystem --- ALL PINNED, no caret

pnpm add three@0.155.0

pnpm add \@react-three/fiber@8.17.10

pnpm add \@react-three/drei@9.88.0

pnpm add \@react-three/postprocessing@2.15.0

\# Expo native modules

npx expo install expo-camera

npx expo install expo-image-picker

npx expo install expo-apple-authentication

npx expo install expo-auth-session expo-web-browser

npx expo install expo-in-app-purchases

npx expo install expo-linking

npx expo install expo-file-system

npx expo install expo-asset

\# Navigation

pnpm add \@react-navigation/native@\^6
\@react-navigation/bottom-tabs@\^6 \@react-navigation/stack@\^6

npx expo install react-native-screens react-native-safe-area-context

npx expo install react-native-gesture-handler

npx expo install react-native-reanimated

\# State management

pnpm add zustand immer

\# Supabase client

pnpm add \@supabase/supabase-js

npx expo install \@react-native-async-storage/async-storage

\# Shared package

pnpm add \@cova/shared@workspace:\*

**3.3 Verify Version Locks in package.json**

Open apps/mobile/package.json and verify these exact strings --- no
carets, no tildes:

\"three\": \"0.155.0\"

\"@react-three/fiber\": \"8.17.10\"

\"@react-three/drei\": \"9.88.0\"

\"react\": \"18.3.1\"

\"react-dom\": \"18.3.1\"

⚠ WARNING: If any of these have a \^ prefix, remove it. A caret on
three@\^0.155.0 would allow pnpm to install 0.156, which has breaking
geometry API changes.

**3.4 Metro Configuration**

**Cursor Prompt --- metro.config.js**

CURSOR PROMPT: Create apps/mobile/metro.config.js for Expo SDK 52 with
Three.js 0.155.0 support. The file must: 1. Import getDefaultConfig from
\'expo/metro-config\' 2. Get the default config: const config =
getDefaultConfig(\_\_dirname) 3. Add to config.resolver.assetExts:
\'glb\', \'gltf\', \'hdr\' 4. Add watchFolders:
\[path.resolve(\_\_dirname, \'../../packages/shared\')\] 5. Add to
config.resolver.extraNodeModules: { \'@cova/shared\':
path.resolve(\_\_dirname, \'../../packages/shared/src/index.ts\') } 6.
Ensure Three.js resolves correctly by adding to
resolver.resolverMainFields: \[\'react-native\', \'browser\', \'main\'\]
7. Export config as module.exports Import path from \'path\' at the top.
This must work with Expo SDK 52.

**3.5 Babel Configuration**

**Cursor Prompt --- babel.config.js**

CURSOR PROMPT: Create apps/mobile/babel.config.js for Expo SDK 52. The
file must: 1. Use babel-preset-expo as the base preset 2. Add
babel-plugin-module-resolver to resolve \@cova/shared: alias: {
\'@cova/shared\': \'../../packages/shared/src/index.ts\' } 3. Add
react-native-reanimated/plugin as the LAST plugin in the plugins array
4. Return the config as module.exports = function(api) {
api.cache(true); return {\...} } This must work with Expo SDK 52 and
react-native-reanimated.

**3.6 app.json Configuration**

**Cursor Prompt --- app.json**

CURSOR PROMPT: Update apps/mobile/app.json with the complete Cova app
configuration: - name: \'Cova\' - slug: \'cova\' - version: \'1.0.0\' -
orientation: \'portrait\' - scheme: \'cova\' - icon:
\'./assets/icon.png\' - splash: background color #1B3A2D, image
./assets/splash.png, resizeMode \'contain\' - ios.bundleIdentifier:
\'ai.cova.app\' - ios.supportsTablet: false - ios.infoPlist:
NSCameraUsageDescription: \'Cova needs camera access to scan your room
for 3D modeling.\' NSPhotoLibraryUsageDescription: \'Cova needs photo
library access to import your room photo.\'
NSUserTrackingUsageDescription: \'Cova uses this to improve your design
recommendations.\' - ios.entitlements: {
\'com.apple.developer.applesignin\': \[\'Default\'\] } - plugins:
\[\'expo-apple-authentication\', \'expo-camera\', \'expo-image-picker\',
\'@react-native-async-storage/async-storage\'\] - extra.eas.projectId:
leave as placeholder string \'YOUR_EAS_PROJECT_ID\' -
userInterfaceStyle: \'dark\'

**3.7 .env File**

Create apps/mobile/.env with your Supabase credentials:

EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co

EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

Create apps/mobile/.env.example (safe to commit to git):

EXPO_PUBLIC_SUPABASE_URL=

EXPO_PUBLIC_SUPABASE_ANON_KEY=

Add .env to apps/mobile/.gitignore if not already present.

**3.8 Supabase Client**

**Cursor Prompt --- Supabase Client**

CURSOR PROMPT: Create apps/mobile/src/lib/supabase.ts. Imports: -
createClient from \'@supabase/supabase-js\' - AsyncStorage from
\'@react-native-async-storage/async-storage\' Create and export the
Supabase client: const supabaseUrl =
process.env.EXPO_PUBLIC_SUPABASE_URL! const supabaseAnonKey =
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY! export const supabase =
createClient(supabaseUrl, supabaseAnonKey, { auth: { storage:
AsyncStorage, autoRefreshToken: true, persistSession: true,
detectSessionInUrl: false, }, }) Also export a helper: export async
function callEdgeFunction\<T\>(functionName: string, body: object):
Promise\<T\> { const { data: { session } } = await
supabase.auth.getSession() const response = await fetch(
\`\${supabaseUrl}/functions/v1/\${functionName}\`, { method: \'POST\',
headers: { \'Content-Type\': \'application/json\', \'Authorization\':
\`Bearer \${session?.access_token}\`, \'apikey\': supabaseAnonKey, },
body: JSON.stringify(body), } ) if (!response.ok) { const error = await
response.json() throw new Error(error.error \|\| \`Edge function error:
\${response.status}\`) } return response.json() }

**3.9 Zustand Store**

**Cursor Prompt --- Zustand Store**

CURSOR PROMPT: Create the complete Zustand store for Cova at
apps/mobile/src/store/index.ts. Use Zustand with immer middleware.
Create a single store using create(immer(\...)) that combines all
slices. Imports needed: - create from \'zustand\' - immer from
\'zustand/middleware/immer\' - supabase, callEdgeFunction from
\'../lib/supabase\' - All shared types from \'@cova/shared\' Store shape
and actions: \-\-- AUTH SLICE \-\-- State: { user: User \| null,
session: any \| null, authLoading: boolean } Actions: initAuth(): void
--- call supabase.auth.getSession() and
supabase.auth.onAuthStateChange() to set user and session. Listen for
sign-in/out events. signInWithApple(): Promise\<void\> --- use
expo-apple-authentication signInAsync with FULL_NAME and EMAIL scopes.
Pass the nonce and identity token to supabase.auth.signInWithIdToken({
provider: \'apple\', token, nonce }). Handle errors including user
cancellation (code ERR_REQUEST_CANCELED --- do not treat as error, just
return). signInWithGoogle(): Promise\<void\> --- use expo-auth-session
Google provider. Exchange code for tokens. Pass id_token to
supabase.auth.signInWithIdToken({ provider: \'google\', token }).
signInWithEmail(email: string, password: string): Promise\<void\> ---
call supabase.auth.signInWithPassword({ email, password }). Throw on
error. signUpWithEmail(email: string, password: string, fullName:
string): Promise\<void\> --- call supabase.auth.signUp({ email,
password, options: { data: { full_name: fullName } } }). Throw on error.
signOut(): Promise\<void\> --- call supabase.auth.signOut(). Reset all
store state. \-\-- ROOM SLICE \-\-- State: { currentRoom: Room \| null,
rooms: Room\[\], roomsLoading: boolean } Actions: fetchRooms():
Promise\<void\> --- query Supabase rooms table ordered by updated_at
desc. createRoom(roomType: RoomType, name: string): Promise\<Room\> ---
insert new room row, return it. updateRoom(id: string, updates:
Partial\<Room\>): Promise\<void\> --- update room row.
setCurrentRoom(room: Room): void --- set currentRoom in store. \-\--
QUIZ SLICE \-\-- State: { styleBlend: StyleBlend, swipeHistory:
Array\<{cardId: string, direction: string}\>, quizComplete: boolean }
Default styleBlend: { coastal: 0.2, japandi: 0.2, bohemian: 0.2,
mid_century: 0.2, minimalist: 0.2 } Actions: swipeRight(card:
SwipeCard): void --- increase weights for card\'s style_weights,
normalise so all weights sum to 1. swipeLeft(card: SwipeCard): void ---
decrease weights for card\'s style_weights, normalise. swipeNeutral():
void --- no weight change, just record in swipeHistory.
calculateConfidence(): number --- return max(styleBlend values) as
confidence score. completeQuiz(): void --- set quizComplete true,
persist styleBlend to current room and user profile. resetQuiz(): void
--- reset to equal weights, clear history. \-\-- FURNITURE SLICE \-\--
State: { placedFurniture: FurniturePiece\[\], selectedFurnitureId:
string \| null, actionHistory: FurniturePiece\[\]\[\] } Actions:
addFurniture(item: FurnitureCatalogItem): void --- add piece at center
of room. removeFurniture(id: string): void --- remove from
placedFurniture, push to actionHistory. updateFurniturePosition(id:
string, x: number, y: number): void. updateFurnitureRotation(id: string,
delta: number): void --- add delta to rotation_y. selectFurniture(id:
string \| null): void. undoLastAction(): void --- restore from
actionHistory. loadFurnitureForRoom(roomId: string): Promise\<void\> ---
fetch furniture_placements from Supabase. saveFurniturePlacement(piece:
FurniturePiece): Promise\<void\> --- upsert to furniture_placements.
\-\-- RENDER SLICE \-\-- State: { currentRender: Render \| null,
renders: Render\[\], renderStatus:
\'idle\'\|\'loading\'\|\'processing\'\|\'complete\'\|\'error\',
renderProgressStage: string, renderError: string \| null } Actions:
startRender(params: { roomId: string, imageBase64: string,
depthMapBase64: string, styleBlend: StyleBlend, roomType: RoomType,
renderType: \'draft\'\|\'hd\' }): Promise\<void\>
pollRenderStatus(renderId: string): Promise\<void\> fetchRenders(roomId:
string): Promise\<void\> setRenderStatus(status: string, stage?:
string): void \-\-- CART SLICE \-\-- State: { cartItems: CartItem\[\],
matchedProducts: Product\[\] } Actions: addToCart(product: Product):
Promise\<void\> removeFromCart(productId: string): Promise\<void\>
fetchCart(): Promise\<void\> setMatchedProducts(products: Product\[\]):
void \-\-- CHAT SLICE \-\-- State: { messages: ChatMessage\[\],
chatLoading: boolean } Actions: sendMessage(params: { roomId: string,
content: string, renderImageBase64?: string, tapX?: number, tapY?:
number }): Promise\<void\> clearChat(): void loadChatHistory(roomId:
string): Promise\<void\>

**3.10 Navigation Structure**

**Cursor Prompt --- Navigation**

CURSOR PROMPT: Create the complete React Navigation structure for Cova.
All files in apps/mobile/src/navigation/. Create these files: 1.
RootNavigator.tsx --- top-level navigator: - Uses NavigationContainer -
Checks auth state from Zustand store - Shows SplashScreen component
while authLoading is true - Routes to AuthNavigator if user is null -
Routes to MainNavigator if user is logged in 2. AuthNavigator.tsx ---
stack navigator: - Initial route: AuthScreen - Routes: AuthScreen 3.
MainNavigator.tsx --- bottom tab navigator: - Tab bar style:
backgroundColor #1B3A2D, activeTintColor #C47B3C, inactiveTintColor
rgba(255,255,255,0.5), height 60, paddingBottom 8 - Tab 1: HomeStack
(icon: house shape, label: \'Rooms\') - Tab 2: ShopScreen (icon: bag
shape, label: \'Shop\') - Tab 3: ProfileScreen (icon: person shape,
label: \'Profile\') - Tab 4: DiscoverScreen (icon: compass shape, label:
\'Discover\', disabled --- shows Coming Soon alert on tap) - Use simple
View-based SVG icons rather than icon libraries to avoid extra
dependencies 4. HomeStack.tsx --- stack navigator for room flow: - Home
(HomeScreen) - Room (RoomNavigator) --- passes room_id in params -
NewRoom (NewRoomFlow) 5. RoomNavigator.tsx --- stack navigator: -
RoomCapture (RoomCaptureScreen) - StyleQuiz (StyleQuizScreen) - Viewer3D
(RoomViewer3DScreen) - RenderView (RenderViewScreen) 6. Create
placeholder screen files (just a full-screen View with screen name as
Text in the center) for: AuthScreen, HomeScreen, ShopScreen,
ProfileScreen, DiscoverScreen, RoomCaptureScreen, StyleQuizScreen,
RoomViewer3DScreen, RenderViewScreen All files must use TypeScript with
proper navigation param types.

**3.11 App.tsx Entry Point**

**Cursor Prompt --- App.tsx**

CURSOR PROMPT: Rewrite apps/mobile/App.tsx as the root entry point:
import React, { useEffect } from \'react\' import {
GestureHandlerRootView } from \'react-native-gesture-handler\' import {
SafeAreaProvider } from \'react-native-safe-area-context\' import
RootNavigator from \'./src/navigation/RootNavigator\' import { useStore
} from \'./src/store\' export default function App() { const initAuth =
useStore(state =\> state.initAuth) useEffect(() =\> { initAuth() },
\[\]) return ( \<GestureHandlerRootView style={{ flex: 1 }}\>
\<SafeAreaProvider\> \<RootNavigator /\> \</SafeAreaProvider\>
\</GestureHandlerRootView\> ) } The GestureHandlerRootView must be the
outermost wrapper for react-native-gesture-handler to work correctly.

**3.12 Build Expo Dev Client**

For all 3D and camera testing, you need the Expo Dev Client --- a custom
native build that supports all native modules. Build it now:

cd apps/mobile

npx expo prebuild \--platform ios \--clean

This generates the ios/ directory. Open the Xcode workspace:

open ios/cova.xcworkspace

In Xcode: select your physical iPhone from the device dropdown at the
top. Press Cmd+R to build and install. The first build takes 10-20
minutes. You will see the Expo Dev Client app appear on your iPhone when
it completes.

⚠ WARNING: If the build fails with \'error: No account for identifier
ai.cova.app\', go to Xcode → Signing & Capabilities → Team and select
your Apple Developer team. Xcode will auto-generate a provisioning
profile.

⚠ WARNING: If the build fails with pod install errors, run: cd
apps/mobile/ios && pod install \--repo-update, then rebuild.

✓ TIP: After the Dev Client is installed on your iPhone, you only need
to run npx expo start \--dev-client from apps/mobile/ for future
development. Full rebuilds are only needed when adding new native
modules.

**3.13 Common Phase 3 Errors & Fixes**

  ----------------------------- -------------------------- ------------------------------------
  **Error**                     **Cause**                  **Fix**

  \'react\' version conflict in A transitive dep requires  Run: pnpm why react --- identify
  pnpm install                  a different React version  conflicting package. The root pnpm
                                                           overrides should override it. If
                                                           not, add the conflicting package to
                                                           overrides too.

  \'three\' version conflict    A transitive dep wants     Ensure pnpm.overrides has three:
                                newer Three.js             \'0.155.0\' in root package.json.
                                                           Run pnpm install from repo root.

  Metro: Unable to resolve      Module resolver not        Verify both configs have the
  \'@cova/shared\'              configured in              \@cova/shared alias pointing to
                                babel.config.js or         ../../packages/shared/src/index.ts
                                metro.config.js            

  Xcode build: \'No such module Pod not installed after    Run: cd ios && pod install, then
  expo-apple-authentication\'   adding native module       rebuild

  App crashes on launch with    GestureHandlerRootView     Ensure GestureHandlerRootView is the
  gesture handler error         missing or not outermost   first wrapper in App.tsx

  Supabase client: \'Invalid    EXPO_PUBLIC_SUPABASE_URL   Verify .env has full URL including
  URL\'                         not set or wrong format    https:// and no trailing slash

  Navigation: screen not found  Route name doesn\'t match  TypeScript navigation types help
  error                         navigator definition       catch this --- ensure all route
                                                           names are consistent
  ----------------------------- -------------------------- ------------------------------------

**3.14 Phase 3 Validation Checklist**

55. pnpm install completes with no errors from \~/Desktop/cova/

56. All locked package versions confirmed in apps/mobile/package.json
    (no carets on three, R3F, Drei, react, react-dom)

57. npx expo start \--dev-client launches Metro bundler without errors

58. App launches on physical iPhone via Expo Dev Client

59. Bottom tab navigation shows 4 tabs: Rooms, Shop, Profile, Discover

60. Tapping Discover tab shows Coming Soon alert

61. All placeholder screens render without crashing

62. Supabase client initialises without network errors (check Metro
    terminal output)

**PHASE 4 3D Room Engine**

*BoxRoom with PBR textures, HDRI lighting, SSAO, FurniturePiece
drag/select/rotate, CameraController with PanResponder*

**Phase 4: 3D Room Engine**

Phase 4 builds the complete 3D room viewer. This is the most technically
complex phase. Read all the architectural warnings before writing any
code.

**4.1 Critical Architecture Rules**

⚠ WARNING: NEVER use OrbitControls from \@react-three/drei or
three/examples/jsm. OrbitControls calls domElement.style which does not
exist in expo-gl and causes an immediate crash: \'Cannot set properties
of undefined (setting style)\'. The only camera system permitted is the
custom PanResponder + useFrame implementation defined in Section 4.5.

⚠ WARNING: NEVER store camera position values in useState. State changes
cause component re-renders which conflict with PanResponder gesture
callbacks. All camera state lives in useRef values that are updated
directly in onPanResponderMove and read in useFrame.

⚠ WARNING: NEVER allow white space outside the room. The Three.js Canvas
must have its clear color set to match the ceiling colour. If the camera
exits the room boundary the user sees the clear colour, not white. But
better --- always clamp the camera radius so it cannot reach the walls.

📝 NOTE: The Canvas must have gl={{ preserveDrawingBuffer: true }} for
the before/after render save-to-camera-roll feature to work in Phase 5.

📝 NOTE: All furniture drag logic uses a THREE.Plane at y=0 (floor
plane) intersected with the scene raycaster. The furniture moves along
this plane when dragged.

**4.2 BoxRoom Component**

**Cursor Prompt --- BoxRoom.tsx**

CURSOR PROMPT: Create apps/mobile/src/components/3d/BoxRoom.tsx. Props:
{ width: number; depth: number; height: number; style: StyleName } This
component renders the room as a set of mesh planes with PBR materials
--- no ceiling (user is inside looking around), no front wall (that\'s
the doorway the camera enters from). Surface colours per style: const
STYLE_PALETTE = { coastal: { floor: \'#C8B89A\', walls: \'#E8DFD0\',
ceiling: \'#F5F0E8\', trim: \'#FFFFFF\', emissive: \'#FFF8F0\' },
japandi: { floor: \'#8B7355\', walls: \'#D4CAB8\', ceiling: \'#EDE8DF\',
trim: \'#F0EDE6\', emissive: \'#FFFAF5\' }, bohemian: { floor:
\'#A0785A\', walls: \'#D4B896\', ceiling: \'#E8D5B7\', trim:
\'#C8A882\', emissive: \'#FFF5E8\' }, mid_century:{ floor: \'#8B6914\',
walls: \'#C8A870\', ceiling: \'#E8D098\', trim: \'#5C3D1E\', emissive:
\'#FFF0D0\' }, minimalist: { floor: \'#D0D0D0\', walls: \'#E8E8E8\',
ceiling: \'#F5F5F5\', trim: \'#FFFFFF\', emissive: \'#FFFFFF\' }, } Mesh
layout (all using PlaneGeometry + MeshStandardMaterial): 1. Floor:
rotation={\[-Math.PI/2, 0, 0\]}, position={\[0, 0, 0\]}, args={\[width,
depth\]}, receiveShadow 2. Ceiling: rotation={\[Math.PI/2, 0, 0\]},
position={\[0, height, 0\]}, args={\[width, depth\]} 3. BackWall:
position={\[0, height/2, -depth/2\]}, args={\[width, height\]},
receiveShadow 4. LeftWall: position={\[-width/2, height/2, 0\]},
rotation={\[0, Math.PI/2, 0\]}, args={\[depth, height\]} 5. RightWall:
position={\[width/2, height/2, 0\]}, rotation={\[0, -Math.PI/2, 0\]},
args={\[depth, height\]} NOTE: No front wall --- the camera enters from
z = +depth/2 side. For each surface use: \<meshStandardMaterial
color={palette\[surface\]} roughness={0.7} metalness={0.0} /\> Load PBR
texture maps with useLoader for floor: const \[floorColorMap,
floorNormalMap, floorRoughMap\] = useLoader(THREE.TextureLoader, \[
require(\'../../../assets/textures/floor/wood_floor_diff_1k.jpg\'),
require(\'../../../assets/textures/floor/wood_floor_nor_1k.jpg\'),
require(\'../../../assets/textures/floor/wood_floor_rough_1k.jpg\'), \])
Set texture.repeat = new THREE.Vector2(width/4, depth/4) and wrapS/wrapT
= THREE.RepeatWrapping. Fall back to solid colour if texture load fails
(wrap in try/catch or use ErrorBoundary). Window plane on back wall: a
small emissive plane mesh (1.5 x 2.5 units) at position \[0, height \*
0.55, -depth/2 + 0.01\] with emissiveIntensity 0.5. This simulates a
window letting in light. Directional light from window:
\<directionalLight position={\[0, height \* 0.8, -depth/2 + 1\]}
intensity={1.5} castShadow shadow-mapSize-width={512}
shadow-mapSize-height={512} target-position={\[0, 0, 0\]} /\>
Architectural trim (thin BoxGeometry meshes): - Crown molding: 4 box
meshes at ceiling-wall junctions, dimensions \[width or depth, 0.1,
0.1\] - Baseboards: 4 box meshes at floor-wall junctions, dimensions
\[width or depth, 0.15, 0.08\] - Door frame at front centre: two
vertical boxes and one horizontal box forming the entrance frame All
trim uses palette.trim colour.

**4.3 SceneLighting Component**

**Cursor Prompt --- SceneLighting.tsx**

CURSOR PROMPT: Create apps/mobile/src/components/3d/SceneLighting.tsx.
Props: { style: StyleName } The HDRI file map: const HDRI_MAP:
Record\<StyleName, any\> = { coastal:
require(\'../../../assets/textures/hdri/sunset_fairway_1k.hdr\'),
japandi:
require(\'../../../assets/textures/hdri/small_empty_room_1k.hdr\'),
bohemian:
require(\'../../../assets/textures/hdri/colorful_studio_1k.hdr\'),
mid_century:require(\'../../../assets/textures/hdri/loft_hall_1k.hdr\'),
minimalist: require(\'../../../assets/textures/hdri/grey_room_1k.hdr\'),
} The hemisphere light sky/ground colours: const HEMI_COLORS:
Record\<StyleName, { sky: string; ground: string }\> = { coastal: { sky:
\'#FFD9A0\', ground: \'#C8B89A\' }, japandi: { sky: \'#EDE8DF\', ground:
\'#8B7355\' }, bohemian: { sky: \'#D4B896\', ground: \'#8B6914\' },
mid_century:{ sky: \'#E8D098\', ground: \'#5C3D1E\' }, minimalist: {
sky: \'#F5F5F5\', ground: \'#D0D0D0\' }, } Render: 1. \<ambientLight
intensity={0.4} /\> 2. \<hemisphereLight
skyColor={HEMI_COLORS\[style\].sky}
groundColor={HEMI_COLORS\[style\].ground} intensity={0.6} /\> 3. Wrap in
a try block: \<Environment files={HDRI_MAP\[style\]} background={false}
/\> from \@react-three/drei. If Environment throws or HDRI fails to
load, fall back to just the ambient and hemisphere lights --- do not
crash the scene. Wrap the Environment in React\'s error boundary or use
a conditional render with a state flag set by an error handler.

**4.4 FurniturePiece Component**

**Cursor Prompt --- FurniturePiece.tsx**

CURSOR PROMPT: Create apps/mobile/src/components/3d/FurniturePiece.tsx.
Props: { piece: FurniturePiece isSelected: boolean onSelect: (id:
string) =\> void onPositionChange: (id: string, x: number, z: number)
=\> void roomWidth: number roomDepth: number } The component: 1. Loads
the GLB model: const { scene } = useGLTF(piece.glb_path) The parent
RoomViewer3DScreen wraps all FurniturePiece instances in \<Suspense
fallback={null}\> so no loading state needed here. 2. Clones the scene
to avoid sharing materials: const clonedScene = useMemo(() =\>
scene.clone(true), \[scene\]) 3. If piece.color_override is set,
traverse clonedScene and update all MeshStandardMaterial.color values:
clonedScene.traverse(child =\> { if (child.isMesh && child.material) {
child.material = child.material.clone()
child.material.color.set(piece.color_override) } }) 4. Apply castShadow
to all meshes: clonedScene.traverse(child =\> { if (child.isMesh)
child.castShadow = true }) 5. Wrap in a group: \<group
position={\[piece.position.x, 0, piece.position.y\]} rotation={\[0,
piece.rotation_y, 0\]} onPointerDown={(e) =\> { e.stopPropagation();
onSelect(piece.id) }} \> \<primitive object={clonedScene} /\>
{isSelected && \<SelectionRing width={piece.width} depth={piece.depth}
/\>} \</group\> 6. Create SelectionRing as a local component: A flat
torus (or thin cylinder) at y=0.01, radius based on max(piece.width,
piece.depth)/2, color #C47B3C, wireframe or emissive. Alternatively: a
thin flat box at y=0.005 slightly larger than the piece footprint. 7.
Drag handling: Track drag state with useRef (never useState). Create a
THREE.Plane at y=0 for floor intersection. In onPointerMove event, if
this piece is selected: - Cast ray against the floor plane using
event.ray.intersectPlane - Clamp result: x in \[-(roomWidth/2 -
piece.width/2), (roomWidth/2 - piece.width/2)\], z in \[-(roomDepth/2 -
piece.depth/2), (roomDepth/2 - piece.depth/2)\] - Call
onPositionChange(piece.id, clampedX, clampedZ) Note: onPointerDown must
call e.stopPropagation() to prevent the touch from also being handled as
a camera gesture.

**4.5 CameraController Component**

**Cursor Prompt --- CameraController.tsx**

CURSOR PROMPT: Create
apps/mobile/src/components/3d/CameraController.tsx. This component
controls the camera using useFrame. All values stored in useRef ---
NEVER useState. The component is called with forwardRef so the parent
can call methods on it: const CameraController = forwardRef(function
CameraController(props, ref) { const thetaRef = useRef(0) // horizontal
angle, -PI to PI const phiRef = useRef(1.25) // vertical angle, 0.3 to
PI/2 - 0.05 const radiusRef = useRef(4.5) // zoom radius, 1.5 to 6.0
const { camera } = useThree() useImperativeHandle(ref, () =\> ({
handlePan(dx: number, dy: number) { thetaRef.current -= dx \* 0.005
phiRef.current = Math.max(0.3, Math.min(Math.PI / 2 - 0.05,
phiRef.current + dy \* 0.005)) }, handleZoom(scaleDelta: number) {
radiusRef.current = Math.max(1.5, Math.min(6.0, radiusRef.current /
scaleDelta)) } })) useFrame(() =\> { const theta = thetaRef.current
const phi = phiRef.current const radius = radiusRef.current
camera.position.x = radius \* Math.sin(phi) \* Math.sin(theta)
camera.position.y = radius \* Math.cos(phi) camera.position.z = radius
\* Math.sin(phi) \* Math.cos(theta) camera.lookAt(0, 1.2, 0) }) return
null }) export default CameraController export type
CameraControllerHandle = { handlePan: (dx: number, dy: number) =\> void;
handleZoom: (scale: number) =\> void }

**4.6 RoomViewer3DScreen**

**Cursor Prompt --- RoomViewer3DScreen.tsx**

CURSOR PROMPT: Create
apps/mobile/src/screens/main/RoomViewer3DScreen.tsx --- the complete 3D
room viewer screen. This is the most complex screen. Read every detail
carefully. ARCHITECTURE: - A View with flex:1 and
backgroundColor:\'#1B3A2D\' is the outer container - A PanResponder is
attached to an absoluteFill View overlay (z-index higher than Canvas) -
The Canvas (from \@react-three/fiber) is beneath the PanResponder View -
HUD elements are absolutely positioned over both KEY REFS: const
cameraRef = useRef\<CameraControllerHandle\>(null) const selectedIdRef =
useRef\<string \| null\>(null) // MUST be ref, not state const
isDraggingRef = useRef(false) const lastTouchRef = useRef({ x: 0, y: 0
}) const pinchStartDistRef = useRef(0) const \[forceUpdate,
setForceUpdate\] = useState(0) // used to trigger re-render when
selection changes PANRESPONDER CONFIG: const panResponder =
useRef(PanResponder.create({ onStartShouldSetPanResponder: () =\> true,
onMoveShouldSetPanResponder: (\_, gs) =\> { // Only intercept camera
movement when no furniture is selected return selectedIdRef.current ===
null && (Math.abs(gs.dx) \> 2 \|\| Math.abs(gs.dy) \> 2) },
onPanResponderGrant: (e) =\> { const touches = e.nativeEvent.touches if
(touches.length === 1) { lastTouchRef.current = { x: touches\[0\].pageX,
y: touches\[0\].pageY } } else if (touches.length === 2) { const dx =
touches\[1\].pageX - touches\[0\].pageX const dy = touches\[1\].pageY -
touches\[0\].pageY pinchStartDistRef.current = Math.sqrt(dx \* dx + dy
\* dy) } }, onPanResponderMove: (e) =\> { const touches =
e.nativeEvent.touches if (touches.length === 1 && selectedIdRef.current
=== null) { const dx = touches\[0\].pageX - lastTouchRef.current.x const
dy = touches\[0\].pageY - lastTouchRef.current.y
cameraRef.current?.handlePan(dx, dy) lastTouchRef.current = { x:
touches\[0\].pageX, y: touches\[0\].pageY } } else if (touches.length
=== 2) { const dx = touches\[1\].pageX - touches\[0\].pageX const dy =
touches\[1\].pageY - touches\[0\].pageY const dist = Math.sqrt(dx \*
dx + dy \* dy) if (pinchStartDistRef.current \> 0) {
cameraRef.current?.handleZoom(dist / pinchStartDistRef.current) }
pinchStartDistRef.current = dist } }, onPanResponderRelease: () =\> {
isDraggingRef.current = false }, })).current CANVAS: The Canvas must be
inside a View with flex:1 and must NOT be inside the PanResponder view
(they are siblings in the layout): \<View
style={StyleSheet.absoluteFill}\> \<Canvas style={{ flex: 1 }} gl={{
preserveDrawingBuffer: true }} camera={{ fov: 75, near: 0.1, far: 50 }}
\> \<color attach=\'background\' args={\[CEILING_COLOR_FOR_STYLE\]} /\>
\<Suspense fallback={null}\> \<SceneLighting style={activeStyle} /\>
\<BoxRoom width={roomWidth} depth={roomDepth} height={roomHeight}
style={activeStyle} /\> {placedFurniture.map(piece =\> (
\<FurniturePiece key={piece.id} piece={piece}
isSelected={selectedIdRef.current === piece.id}
onSelect={handleSelectFurniture}
onPositionChange={handleFurniturePositionChange} roomWidth={roomWidth}
roomDepth={roomDepth} /\> ))} \</Suspense\> \<CameraController
ref={cameraRef} /\> \<EffectComposer\> \<SSAO radius={0.05}
intensity={15} luminanceInfluence={0.6} /\> \</EffectComposer\>
\</Canvas\> \</View\> \<View style={StyleSheet.absoluteFill}
{\...panResponder.panHandlers} pointerEvents=\'box-none\'\> {/\* HUD
elements here --- pointerEvents=\'box-none\' lets touches pass through
to Canvas \*/} \</View\> HUD ELEMENTS (absolutely positioned, all in the
PanResponder overlay View): 1. Style chips row (top, padding 16 from top
safe area, horizontal scroll): Five small pill buttons, one per style
name (shown as descriptive words NOT style names: \'Ocean Breeze\',
\'Zen Garden\', \'Boho Spirit\', \'Mid-Century\', \'Pure Lines\').
Active style highlighted with #C47B3C border. Tap switches activeStyle
state. 2. Furniture selection panel (bottom, only when
selectedIdRef.current !== null): A row of 4 buttons: Rotate Left (\<),
Rotate Right (\>), Delete (trash icon), Done (checkmark). Rotate: calls
updateFurnitureRotation(selectedId, Math.PI/4) or (-Math.PI/4) Delete:
shows confirmation Alert, on confirm calls removeFurniture(selectedId),
clears selectedIdRef, triggers forceUpdate Done: sets
selectedIdRef.current = null, triggers setForceUpdate(n=\>n+1) 3. Add
furniture button (bottom right, when no furniture selected): gold \'+\'
circle button. Opens AddFurnitureModal. 4. Render button (bottom center,
prominent gold pill): calls navigation.navigate(\'RenderView\', { roomId
}) 5. 2D toggle button (top right): switches between 3D Canvas view and
2D floor plan SVG 6. 2D floor plan view (shown when 2D mode active,
replaces Canvas): A simple top-down SVG view using React Native\'s
built-in view layout (not SVG library). Room outline as a bordered View.
Furniture footprints as small coloured View rectangles positioned with
absolute layout. Positions mapped from 3D coordinates to screen
coordinates. HANDLERS: handleSelectFurniture(id: string):
selectedIdRef.current = id; setForceUpdate(n=\>n+1)
handleFurniturePositionChange(id, x, z): updateFurniturePosition(id, x,
z) NAVIGATION PARAMS: roomId (string) Load room data and furniture
placements in useEffect on mount using Zustand actions.

**4.7 Common Phase 4 Errors & Fixes**

  ------------------------------ ------------------- --------------------------------------
  **Error**                      **Cause**           **Fix**

  \'Cannot set properties of     OrbitControls       Search entire codebase for
  undefined (setting style)\'    included somewhere  \'OrbitControls\'. Remove all
                                                     references. Only CameraController is
                                                     permitted.

  White space visible outside    Canvas clear color  Add \<color attach=\'background\'
  room walls                     not set or camera   args={\[ceilingColor\]} /\> inside
                                 radius too large    Canvas. Verify CameraController max
                                                     radius is 6.0 and room dimensions
                                                     match BoxRoom.

  Furniture dragging also        PanResponder        Ensure onMoveShouldSetPanResponder
  rotates camera                 intercepts touches  returns false when
                                 when furniture      selectedIdRef.current !== null
                                 selected            

  Camera freezes after selecting selectedIdRef never In handleDone: selectedIdRef.current =
  furniture                      reset to null after null; setForceUpdate(n =\> n + 1)
                                 Done                

  GLB file not found error       Metro assetExts     Add \'glb\' and \'gltf\' to assetExts
                                 missing \'glb\'     in metro.config.js

  HDRI Environment crashes the   HDR file too large  Download 1K resolution only. If still
  app                            for mobile memory   crashing, remove Environment and use
                                                     only hemisphereLight.

  Furniture appears at wrong     GLB model origin    Add position={\[0, 0, 0\]} to the
  height                         not at floor level  group and test --- some GLBs need a Y
                                                     offset.

  SSAO from                      Version mismatch    Ensure
  \@react-three/postprocessing   with R3F 8.17       \@react-three/postprocessing@2.15.0.
  crashes                                            If still crashing, temporarily remove
                                                     EffectComposer to confirm.

  Pinch zoom very jumpy          pinchStartDistRef   Reset pinchStartDistRef to current
                                 not reset per touch distance at the end of each move
                                 event               event, not just on grant.

  Furniture selection ring       Selection ring      Set ring y position to 0.01 (slightly
  invisible                      geometry at y=0     above floor plane)
                                 intersects with     
                                 floor               
  ------------------------------ ------------------- --------------------------------------

**4.8 Phase 4 Validation Checklist**

63. 3D room renders with no white space on physical iPhone

64. One-finger swipe rotates the camera view left/right and up/down

65. Two-finger pinch zooms without the camera exiting the room

66. Furniture pieces appear in the room

67. Tapping a piece selects it --- selection ring appears at its feet

68. Dragging a selected piece moves it along the floor, clamped at walls

69. Rotate Left/Right buttons turn the piece 45 degrees

70. Delete button removes piece after confirmation

71. Done button deselects piece and re-enables camera movement

72. SSAO effect is visible in corners and under furniture (subtle
    darkening)

73. Style chips at top switch wall/floor colours

74. 2D floor plan toggle shows overhead layout

75. Render button navigates to the placeholder RenderViewScreen

**PHASE 5 AI Render Pipeline**

*Room capture, depth estimation, FLUX ControlNet render, product CLIP
matching, RenderViewScreen*

**Phase 5: AI Render Pipeline**

Phase 5 connects the room capture flow, the FLUX ControlNet render
pipeline, and the product matching engine into a complete end-to-end
experience. After this phase, the app delivers its primary value
proposition.

**5.1 Pipeline Architecture**

  ---------- ------------------- ------------------ -----------------------------
  **Step**   **Action**          **Technology**     **Duration**

  1          User captures room  expo-camera or     30s--3min
             (photo/RoomPlan)    RoomPlan native    
                                 module             

  2          App computes depth  Depth Anything V2  3--8 seconds
             map from room photo via Replicate API  

  3          App calls           Supabase Edge      15--40 seconds
             render-room Edge    Function +         
             Function            Replicate FLUX     

  4          App polls           Supabase Edge      15--40 seconds
             get-render-status   Function +         
             every 3s            Replicate polling  

  5          Render image stored Supabase Storage   \< 1 second
             in Supabase         renders bucket     

  6          CLIP embedding      clip-embed Edge    5--10 seconds
             computed for render Function +         
                                 OpenCLIP           

  7          Products            match-products     \< 1 second
             CLIP-matched to     Edge Function +    
             render regions      pgvector           

  8          User sees           RenderViewScreen   Instant
             photorealistic                         
             render                                 
  ---------- ------------------- ------------------ -----------------------------

**5.2 useRender Hook**

**Cursor Prompt --- useRender.ts**

CURSOR PROMPT: Create apps/mobile/src/hooks/useRender.ts --- the hook
that manages the full render lifecycle. This hook is called from
RenderViewScreen and RoomCaptureScreen. Export a hook that returns: {
startRender: (params: RenderParams) =\> Promise\<void\> renderStatus:
string renderProgressStage: string renderProgress: number // 0-100
currentRender: Render \| null renderError: string \| null } All state is
read from and written to Zustand RenderSlice. The hook just orchestrates
the calls. startRender(params: { roomId: string roomType: RoomType
styleBlend: StyleBlend imageBase64: string depthMapBase64: string
renderType: \'draft\' \| \'hd\' }) logic: 1. Set status \'loading\',
stage \'Analyzing your room\...\' 2. Call
callEdgeFunction(\'render-room\', params) On success: extract {
render_id, prediction_id } On error: set status \'error\', set
renderError to error message, return 3. Set stage \'Applying your
style\...\' 4. Start pollRenderStatus(render_id)
pollRenderStatus(renderId: string): 1. Set status \'processing\' 2.
const startTime = Date.now() 3. Start an interval every 3000ms: a. Call
callEdgeFunction with GET: instead use fetch directly with the render_id
as query param b. Compute elapsed = (Date.now() - startTime) / 1000 c.
Update renderProgress: Math.min(95, (elapsed / 40) \* 100) d. Update
stage based on elapsed: 0-5s: \'Analyzing your room\...\' 5-15s:
\'Applying your style\...\' 15-30s: \'Generating render\...\' 30-50s:
\'Adding finishing touches\...\' 50s+: \'Almost there\...\' e. If
response.status === \'completed\': clear interval, set status
\'complete\', renderProgress 100, currentRender with image_url. Call
fetchMatchedProducts(image_url). f. If response.status === \'failed\':
clear interval, set status \'error\', renderError \'Render failed.
Please try again.\' 4. Timeout: if elapsed \> 120s and still processing,
clear interval, set error \'Render timed out. Please try again.\'
fetchMatchedProducts(imageUrl: string): 1. Call
callEdgeFunction(\'clip-embed\', { image_url: imageUrl }) 2. Get
embedding from response 3. Call callEdgeFunction(\'match-products\', {
render_embedding: embedding, room_type, style_blend, budget, limit: 15
}) 4. Call Zustand setMatchedProducts(products)

**5.3 RoomCaptureScreen**

**Cursor Prompt --- RoomCaptureScreen.tsx**

CURSOR PROMPT: Create apps/mobile/src/screens/main/RoomCaptureScreen.tsx
--- the room photo capture and calibration screen. STATE: type
CaptureStep = \'method-select\' \| \'camera\' \| \'calibration\' \|
\'processing\' const \[step, setStep\] =
useState\<CaptureStep\>(\'method-select\') const \[capturedImageUri,
setCapturedImageUri\] = useState\<string \| null\>(null) const
\[cameraPermission, requestPermission\] = useCameraPermissions() // from
expo-camera const \[corners, setCorners\] = useState({ tl:
{x:0.1,y:0.1}, tr: {x:0.9,y:0.1}, bl: {x:0.1,y:0.9}, br: {x:0.9,y:0.9}
}) const \[dimensions, setDimensions\] = useState({ width: 16, depth:
14, height: 9 }) const \[processingStage, setProcessingStage\] =
useState(\'\') STEP 1 --- Method Selection (step === \'method-select\'):
Full screen with dark green background #1B3A2D. Header text: \'Capture
Your Room\' Subtext: \'Choose how to bring your room into Cova\' Three
option cards: - Option A: \'3D Scan\' (LiDAR) --- primary, large, gold
border. Subtext: \'Best quality --- iPhone 12 Pro and later\'. On tap:
check if RoomPlan is available (import from
\'../modules/RoomPlanModule\' with try/catch for unavailability). If
available, trigger scan. If unavailable, show Alert: \'LiDAR scanning
requires iPhone 12 Pro or later. Please use a photo instead.\' - Option
B: \'Take Photo\' --- secondary. On tap: check camera permission. If not
granted, call requestPermission(). If granted, setStep(\'camera\'). -
Option C: \'Upload Photo\' --- secondary. On tap: use
ImagePicker.launchImageLibraryAsync({ mediaTypes: \'Images\', quality:
0.9, base64: true }). On success:
setCapturedImageUri(result.assets\[0\].uri), setStep(\'calibration\').
If camera permission denied: show explanation screen with \'Open
Settings\' button using Linking.openSettings(). STEP 2 --- Camera (step
=== \'camera\'): Full screen expo-camera CameraView. Capture button at
bottom center (gold circle). Back button top left. OnCapture: await
ref.takePictureAsync({ base64: true, quality: 0.9 }).
setCapturedImageUri(photo.uri). setStep(\'calibration\'). STEP 3 ---
Calibration (step === \'calibration\'): Display capturedImageUri full
screen using Image component. Overlay four draggable corner handles
(PanResponder per handle). Each handle is a small 24x24 circular View
positioned at corners\[key\].x \* imageWidth and corners\[key\].y \*
imageHeight. Handles are dragged with PanResponder: update corners state
as percentage of image dimensions. Below image: three labelled sliders
(using Slider from \@react-native-community/slider or a simple custom
slider): - Width: 5-30 ft, value dimensions.width - Depth: 5-30 ft,
value dimensions.depth - Height: 6-16 ft, value dimensions.height Label
each slider with current value in ft. \'Done\' button: gold pill button.
OnPress: setStep(\'processing\'), then call handleProcessCapture(). STEP
4 --- Processing (step === \'processing\'): Dark green background with
animated progress indicator. Text shows processingStage. Stages: 1.
\'Reading your room\...\' (while calling Depth Anything V2) 2. \'Setting
up 3D space\...\' 3. \'Starting your design\...\' (while calling
render-room) On completion: navigate to RenderViewScreen.
handleProcessCapture() function: 1. setProcessingStage(\'Reading your
room\...\') 2. Convert capturedImageUri to base64 data URL 3. Call
Replicate API directly (or via a simple fetch to the Replicate API) to
run Depth Anything V2: POST https://api.replicate.com/v1/predictions
Note: Replicate API token must NOT be in client code --- instead call a
Supabase Edge Function \'get-depth-map\' that proxies the Replicate call
and returns the depth map image. OR use the existing render-room Edge
Function which accepts depth_map_base64 as an optional parameter and
generates it server-side if not provided. IMPLEMENTATION: Simplify for
V1 --- the render-room Edge Function handles depth estimation
server-side. The client just sends the room photo base64 and the Edge
Function calls Depth Anything V2 internally before calling FLUX. Update
render-room to accept { image_base64, style_blend, room_type,
render_type } without requiring depth_map_base64. 4.
setProcessingStage(\'Starting your design\...\') 5. Call startRender({
roomId, roomType, styleBlend, imageBase64, renderType: \'draft\' }) 6.
Navigate to RenderViewScreen with roomId

**5.4 RenderViewScreen**

**Cursor Prompt --- RenderViewScreen.tsx**

CURSOR PROMPT: Create apps/mobile/src/screens/main/RenderViewScreen.tsx
--- the AI render view screen. This screen is the PRIMARY PRODUCT
EXPERIENCE. It shows a photorealistic AI render as a full-screen
immersive view. NAVIGATION PARAMS: { roomId: string } STATE: - The
render state comes from Zustand RenderSlice - panOffset:
Animated.ValueXY for simulated look-around - zoom: Animated.Value for
image scale - showControls: boolean (show HUD, fades after 3s of no
interaction) - showBeforeAfter: boolean - Show product panel: boolean
LOADING STATE (renderStatus is \'loading\' or \'processing\'): Full
screen dark green background. Center: animated pulsing circle
(Animated.loop on opacity/scale). Below: renderProgressStage text in
cream color. ProgressBar: a thin horizontal bar animating from 0 to
renderProgress width. COMPLETE STATE (renderStatus is \'complete\'): 1.
RENDER IMAGE: Full screen Animated.Image with the render image_url.
resizeMode=\'cover\' PanResponder on a full-screen absoluteFill View: -
Single finger: pan the image (translate X and Y) - Limit pan so image
edge never goes beyond screen edge: clamp panOffset based on image vs
screen dimensions - Pinch: scale the image, min 1.0, max 2.5 - Tap
(without drag): toggle showControls, reset 3s fade timer 2. HUD CONTROLS
(visible when showControls, fades via Animated opacity): Top bar (safe
area aware): - Back button (top left): navigate back - Room name
(center): from room data - Token balance (top right): gold coin + number
Bottom action row: - Save:
MediaLibrary.saveToLibraryAsync(render.image_url). Request permission if
needed. - Share: Share.share({ url: render.image_url }) - Chat: open
ChatPanel (inline component sliding up from bottom) - Shop: show product
panel (toggle showProductPanel) - Regenerate (center, gold pill): calls
startRender again with same params, resets render state to loading
Before/After toggle button (top right or floating): When tapped:
showBeforeAfter = true --- renders BeforeAfterSlider component over the
render image 3. BEFORE/AFTER SLIDER: When showBeforeAfter is true,
render BeforeAfterSlider with: beforeImageUri = room\'s original
captured photo URI afterImageUri = render.image_url Tap outside slider
area to close. 4. PRODUCT PANEL (left pull tab): A small gold vertical
tab on the left edge, always visible. Tap or swipe right: slides in a
panel from the left (Animated translateX). Panel shows matched products
from Zustand cartSlice.matchedProducts. Each product card: thumbnail,
name, price formatted as \'\$X,XXX\', retailer, Add to Cart button.
\'Add All\' button at top of panel. Budget slider: adjusts room budget
in real time, calls Zustand updateRoom. Tap cart item: opens
affiliate_url in Linking.openURL() (or preferably in an InAppBrowser if
expo-web-browser is available). 5. CHAT BUBBLE (bottom right): Gold
floating circle button. Tap: expands ChatPanel (sliding up from bottom,
height 60% of screen). ChatPanel receives render image for vision
context. ERROR STATE (renderStatus is \'error\'): Center message:
renderError text. Retry button: calls startRender again. Back button. On
mount: load current room from Zustand. If status is \'idle\' and a
previous render exists for this room, load it. If no render exists,
navigate back to RoomCapture.

**5.5 BeforeAfterSlider Component**

**Cursor Prompt --- BeforeAfterSlider.tsx**

CURSOR PROMPT: Create apps/mobile/src/components/BeforeAfterSlider.tsx.
Props: { beforeImageUri: string; afterImageUri: string; onClose: () =\>
void; style?: ViewStyle } The component shows two images (before =
original room photo, after = AI render) with a draggable vertical
divider. Implementation: - Container: absolute fill, dark
semi-transparent background - Both images: absolute fill, same
dimensions - \'after\' image: full width, full height, always visible -
\'before\' image: clipped to show only the left portion --- use
overflow:hidden on a View with width = sliderX - sliderX:
Animated.Value, default = screen width / 2 - Divider: a thin white
vertical line at sliderX position - Handle: a circular view centered on
the divider line, contains left/right arrow icons - PanResponder on the
handle: updates sliderX on move, clamped to \[20, screenWidth - 20\] -
Label \'BEFORE\' on left side, \'AFTER\' on right side - Close button
(X) top right: calls onClose - Animate in with opacity transition on
mount

**5.6 ChatPanel Component**

**Cursor Prompt --- ChatPanel.tsx**

CURSOR PROMPT: Create apps/mobile/src/components/ChatPanel.tsx. Props: {
roomId: string; renderImageBase64?: string; onClose: () =\> void } A
bottom-sheet panel (slides up from bottom, height 60% of screen)
containing the AI design assistant chat. LAYOUT: - Container:
absoluteFill with semi-transparent background overlay - Panel: slides up
with Animated.spring on mount. White/cream background #F5F0E8. Rounded
top corners (borderTopLeftRadius: 20, borderTopRightRadius: 20). -
Header: \'AI Design Assistant\' title, close (X) button, swipe-down
handle bar. - Messages list: FlatList with inverted=false, scrolls to
bottom on new message. - Input row at bottom: TextInput + Send button
(gold arrow). KeyboardAvoidingView wraps the input. MESSAGES DISPLAY:
Each message bubble: - User: right-aligned, gold background #C47B3C,
white text - Assistant: left-aligned, white background, dark text, small
\'Cova\' label above Loading indicator while chatLoading is true: three
animated dots. TAP-TO-REFERENCE: A small instruction text above the
input: \'Tap the render to reference a specific area\' When user taps
the render image (passed via onTapRender callback from parent), store
tap coordinates as percentages. Show a small location pin icon on the
input bar when a tap reference is active. Clear tap reference after
message is sent. SEND LOGIC: On send: call Zustand sendMessage({ roomId,
content: inputText, renderImageBase64, tapX, tapY }) Clear input, clear
tap reference. Scroll to bottom after response arrives. Loads chat
history for the roomId on mount via Zustand loadChatHistory.

**5.7 Common Phase 5 Errors & Fixes**

  --------------------- ------------------------ ------------------------------------
  **Error**             **Cause**                **Fix**

  render-room returns   Bearer token not         Use callEdgeFunction helper which
  401                   included in Edge         auto-includes session token. Verify
                        Function call            supabase.auth.getSession() returns a
                                                 valid session.

  Replicate returns 422 image_base64 missing the Ensure base64 strings start with
  Unprocessable Entity  data URL prefix          \'data:image/jpeg;base64,\' before
                                                 passing to Edge Functions

  Render polls          Replicate prediction     Check Replicate dashboard for
  indefinitely, never   silently failed or wrong prediction status. Verify model
  completes             model version            version string in render-room
                                                 function matches the currently
                                                 deployed FLUX ControlNet model.

  FLUX render output    ControlNet depth         Increase
  looks nothing like    conditioning scale too   controlnet_conditioning_scale to 0.7
  the room              low                      or 0.8 in render-room function.

  match-products        Products table empty or  Verify products table has data:
  returns empty array   CLIP embedding dimension SELECT COUNT(\*) FROM products.
                        mismatch                 Verify clip_embedding is
                                                 vector(1024) not vector(512).

  Product panel shows   Product image_url is     Ensure Image component uses
  no images             from retailer CDN with   resizeMode=\'contain\' and the
                        CORS headers             affiliate product images are
                                                 accessible URLs.

  Before/After slider   Room photo aspect ratio  Constrain both images to the same
  images misaligned     different from render    dimensions using a fixed container
                        output                   with overflow:hidden

  Chat sends but gets   ANTHROPIC_API_KEY secret Verify secret in Supabase Edge
  no response           not set or wrong Claude  Function secrets. Model must be
                        model string             \'claude-sonnet-4-20250514\'.

  Depth Anything V2     Replicate cold start on  Add retry logic in render-room: if
  times out             rarely-used models       Depth Anything fails, use a flat
                                                 depth map fallback and proceed with
                                                 FLUX render anyway

  Camera permission     Linking.openSettings()   Use
  denied and Settings   not working on some iOS  Linking.openURL(\'app-settings:\')
  link broken           versions                 as fallback
  --------------------- ------------------------ ------------------------------------

**5.8 Phase 5 Validation Checklist**

76. Camera permission prompt appears on first visit to RoomCaptureScreen

77. Take Photo option opens camera and captures photo

78. Upload option opens photo library and imports photo

79. 4-corner calibration handles are draggable on the captured photo

80. Width/Depth/Height sliders update labels in real time

81. Tapping Done shows the processing screen with animated stages

82. Progress stages cycle through in sequence as render processes

83. Completed render appears as a full-screen immersive image

84. Single-finger swipe pans the render image

85. Pinch gesture zooms the render image, clamped at 2.5x

86. Save button saves render to Camera Roll (permission prompt appears
    first time)

87. Before/After slider slides smoothly between original photo and AI
    render

88. Product pull tab is visible on left edge

89. Product panel slides in from left with matched products

90. Add to Cart adds product to cart (visible in Shop tab)

91. Chat bubble is visible in bottom right

92. Chat panel slides up on tap

93. Sending a message receives an AI response about the room

94. Regenerate button triggers a new render and resets to loading state

Phase 5 complete. The core end-to-end Cova experience is now functional:
room capture → AI render → product shopping → AI chat. Proceed to Build
Guide Part 2 for Phases 6--9 (Complete UI, Payments, App Store
submission).

Document Version 1.0 \| Cova Build Guide Part 1 --- Phases 0--5 \|
Pranav Goel & Daksh Parikh \| hellocova@gmail.com

---

**COVA**

*tinder for your home*

**Build Guide --- Part 2**

Phases 6 through 9

Phase 6: Complete UI Screens \| Phase 7: Token Economy & Payments

Phase 8: Realtor Mode \| Phase 9: App Store Submission

Pranav Goel & Daksh Parikh \| hellocova@gmail.com

**Table of Contents**

**How to Use This Guide**

This is Part 2 of the Cova Build Guide. Part 1 covered Phases 0--5
(environment setup through AI render pipeline). This guide covers Phases
6--9: the complete UI screens, token economy and payments, Realtor Mode,
and App Store submission.

By the end of this guide you will have a fully shippable V1 app with all
12 features built, all screens complete, token infrastructure dormant
and ready to activate, and an accepted App Store submission.

**Prerequisites**

All of the following must be working before starting Phase 6:

- Phase 0--5 complete and all Phase 5 validation checkpoints passing on
  physical iPhone

- 3D room viewer renders with furniture, SSAO, HDRI lighting

- AI render pipeline working end-to-end: capture → FLUX render → product
  matching

- Chat panel communicates with Claude Sonnet 4 Vision

- Supabase backend fully deployed: 10 tables, 5 Edge Functions, 4
  storage buckets

**Phase Overview & Estimated Time**

  ----------- ---------------- --------- -------------------------------------
  **Phase**   **Name**         **Est.    **Key Deliverable**
                               Time**    

  Phase 6     Complete UI      6--10     All 12 screens complete, style quiz,
              Screens          hours     auth, home, shop, profile, swipe card
                                         generation script

  Phase 7     Token Economy &  3--5      StoreKit IAP integration, token shop
              Payments         hours     screen, dormant economy
                                         infrastructure, one-line activation

  Phase 8     Realtor Mode     4--8      Full realtor dashboard, virtual
                               hours     staging, QR codes, voting pages, B2B
                                         subscription

  Phase 9     App Store        2--4      EAS build, TestFlight, App Store
              Submission       hours     Connect metadata, privacy policy, App
                                         Review submission
  ----------- ---------------- --------- -------------------------------------

**PHASE 6 Complete UI Screens**

*SplashScreen, AuthScreen, StyleQuizScreen, HomeScreen, ShopScreen,
ProfileScreen, swipe card generation, RoomPlan native module*

**Phase 6: Complete UI Screens**

Phase 6 replaces every placeholder screen from Phase 3 with its
complete, production-ready implementation. Work through each screen in
order --- later screens depend on earlier ones being functional.

**6.1 SplashScreen**

**Design Spec**

- Full-screen background: #1B3A2D (dark forest green)

- Cova logo (SVG: gold arch mark + \'cova\' wordmark + \'tinder for your
  home\' italic tagline) fades in over 2 seconds using Animated API

- After logo fade completes (2s), Sign In and Create Account buttons
  animate up from the bottom using Animated.spring

- Returning authenticated users are detected before the splash animates
  --- if a session exists they are redirected immediately to HomeScreen
  without seeing any buttons

**Cursor Prompt --- SplashScreen.tsx**

CURSOR PROMPT: Create apps/mobile/src/screens/auth/SplashScreen.tsx.
This is the first screen users see. It handles both returning and new
users. On mount: 1. Start a 2-second logo fade-in animation using
Animated.Value(0) → Animated.timing to 1, duration 2000ms, easing
Easing.out(Easing.ease). 2. Simultaneously check auth state from Zustand
store (user !== null means returning user). 3. If user is already
authenticated when component mounts: skip the button animation entirely
and navigate to \'Home\' stack after a 500ms delay (enough time for the
logo to be visible briefly). 4. If user is NOT authenticated: after the
2s logo fade, trigger Animated.spring on buttonTranslateY from 80 to 0
and buttonOpacity from 0 to 1. LAYOUT: - Outer: View with flex:1,
backgroundColor:\'#1B3A2D\', justifyContent:\'center\',
alignItems:\'center\' - Logo container: Animated.View with
opacity={logoOpacity} in the center of the screen - Logo SVG: render as
a View containing: - The arch mark (a simple golden semicircle SVG path
or a gold Image asset) - \'cova\' text: fontSize:56, fontWeight:\'300\',
color:\'#C47B3C\', letterSpacing:8 - \'tinder for your home\':
fontSize:16, color:\'#C47B3C\', fontStyle:\'italic\', marginTop:8,
letterSpacing:2 - Button container: Animated.View at the bottom of the
screen, style position:\'absolute\', bottom:60, width:\'100%\',
paddingHorizontal:32 - opacity={buttonOpacity}, transform=\[{translateY:
buttonTranslateY}\] - \'Create Account\' button: full-width,
backgroundColor:\'#C47B3C\', borderRadius:28, height:56, centered text
\'Create Account\' in white, fontSize:17, fontWeight:\'600\' - \'Sign
In\' button: full-width, marginTop:12, backgroundColor:\'transparent\',
borderWidth:1, borderColor:\'rgba(255,255,255,0.4)\', borderRadius:28,
height:56, centered text \'Sign In\' in white - Both buttons navigate to
AuthScreen, passing mode: \'signup\' or \'signin\' The logo SVG arch
mark: use a React Native View with borderTopLeftRadius and
borderTopRightRadius set to half the width, creating a rounded arch
shape. Color:#C47B3C. Dimensions: 64x32 (width x height). Position above
the wordmark.

**6.2 AuthScreen**

**Design Spec**

- Dark green background #1B3A2D throughout

- Three sign-in options in order: Apple Sign In (primary, full width
  gold button), Google Sign In (secondary, outlined), Email/Password
  (tertiary, minimal)

- Toggle between Sign In and Create Account modes

- Inline validation on email and password fields

- Loading state on each button while auth is processing

- Error message displayed below buttons on failure

**Cursor Prompt --- AuthScreen.tsx**

CURSOR PROMPT: Create apps/mobile/src/screens/auth/AuthScreen.tsx.
Navigation params: { mode: \'signin\' \| \'signup\' } STATE: const
\[mode, setMode\] = useState(params.mode \|\| \'signin\') const \[email,
setEmail\] = useState(\'\') const \[password, setPassword\] =
useState(\'\') const \[fullName, setFullName\] = useState(\'\') const
\[loading, setLoading\] =
useState\<\'apple\'\|\'google\'\|\'email\'\|null\>(null) const \[error,
setError\] = useState\<string\|null\>(null) LAYOUT: -
KeyboardAvoidingView with behavior=\'padding\', flex:1,
backgroundColor:\'#1B3A2D\' - ScrollView with contentContainerStyle
justifyContent:\'center\', minHeight of screen - Top section: \'cova\'
wordmark and tagline (smaller than splash, centered) - Mode toggle: two
text links side by side --- \'Sign In\' and \'Create Account\', active
one has gold color #C47B3C, inactive has rgba(255,255,255,0.5) BUTTONS
SECTION: 1. Apple Sign In button: Height:56, borderRadius:28,
backgroundColor:\'#FFFFFF\', flexDirection:\'row\',
alignItems:\'center\', justifyContent:\'center\' Apple logo icon (black
apple SVG) on left, text \'Continue with Apple\' in black, fontSize:17
Loading: replace content with ActivityIndicator (black) OnPress:
setLoading(\'apple\') try { await signInWithApple() } catch (e) { if
(e.code !== \'ERR_REQUEST_CANCELED\') setError(e.message) } finally {
setLoading(null) } 2. Google Sign In button: MarginTop:12, height:56,
borderRadius:28, backgroundColor:\'transparent\', borderWidth:1.5,
borderColor:\'rgba(255,255,255,0.3)\' Google \'G\' colored logo on left,
text \'Continue with Google\' in white OnPress: same pattern with
signInWithGoogle 3. Divider: \'--- or ---\' centered text in
rgba(255,255,255,0.4), marginVertical:20 4. Email field: TextInput, dark
semi-transparent background rgba(255,255,255,0.1), borderRadius:12,
height:52, paddingHorizontal:16, color:\'#FFFFFF\',
placeholderTextColor:\'rgba(255,255,255,0.5)\', placeholder:\'Email
address\', keyboardType:\'email-address\', autoCapitalize:\'none\' 5. If
mode === \'signup\': Full name TextInput (same styling), above email
field 6. Password field: same styling, secureTextEntry:true,
placeholder:\'Password\', returnKeyType:\'done\' Password requirements
note (signup mode only): small text \'Minimum 8 characters\' in
rgba(255,255,255,0.4) 7. Email submit button: marginTop:16, same
dimensions as Apple button, backgroundColor:\'#C47B3C\', text \'Sign
In\' or \'Create Account\' OnPress: Validate email format (regex),
validate password length \>= 8 If invalid: setError(\'Please enter a
valid email and password\') Else: setLoading(\'email\') try { if mode
=== \'signup\': await signUpWithEmail(email, password, fullName) else:
await signInWithEmail(email, password) } catch (e) { setError(e.message)
} finally { setLoading(null) } ERROR DISPLAY: Animated error message
below buttons: red-tinted background, error text, auto-dismisses after 4
seconds FOOTER: Privacy Policy and Terms of Service links at bottom of
screen Linking.openURL to the respective URLs from app config On
successful auth, Zustand auth state changes and RootNavigator
automatically routes to MainNavigator.

**6.3 StyleQuizScreen**

**Design Spec**

- Full-screen swipe card experience. Dark green background.

- Cards fill most of the screen with rounded corners and drop shadow

- Swipe right animation: card flies right with rotation, green glow

- Swipe left animation: card flies left with rotation, red glow (subtle)

- Neutral button below card: taps card up slightly and loads next

- Progress indicator at top: minimal dots or thin progress bar

- No style names shown anywhere --- ever

**Cursor Prompt --- StyleQuizScreen.tsx**

CURSOR PROMPT: Create apps/mobile/src/screens/main/StyleQuizScreen.tsx.
Navigation params: { roomType: RoomType, roomId: string } This screen
implements the Tinder-style style fingerprint quiz. DATA: On mount,
fetch swipe cards from Supabase filtered by room_type matching the nav
param: const { data: cards } = await
supabase.from(\'swipe_cards\').select(\'\*\').eq(\'room_type\',
roomType).eq(\'active\', true).order(\'created_at\') STATE: const
\[cards, setCards\] = useState\<SwipeCard\[\]\>(\[\]) const
\[currentIndex, setCurrentIndex\] = useState(0) const
\[showInstructions, setShowInstructions\] = useState(true) const
\[quizStartTime\] = useState(Date.now()) const position = useRef(new
Animated.ValueXY()).current const rotation = position.x.interpolate({
inputRange: \[-200, 0, 200\], outputRange: \[\'-15deg\', \'0deg\',
\'15deg\'\] }) const rightOpacity = position.x.interpolate({ inputRange:
\[0, 100\], outputRange: \[0, 1\], extrapolate: \'clamp\' }) const
leftOpacity = position.x.interpolate({ inputRange: \[-100, 0\],
outputRange: \[1, 0\], extrapolate: \'clamp\' }) INSTRUCTION SCREEN
(shown first, before any cards): Centered overlay on dark background: -
\'cova\' wordmark - \'Discover your style\' heading - Three lines of
instruction text with icons: heart (swipe right to love it), X (swipe
left to skip it), circle (neutral if unsure) - \'Get Started\' gold
button that dismisses instructions - Small \'Skip\' text link in top
right corner → calls handleSkip() handleSkip(): save default
equal-weight style blend to currentRoom, navigate to RoomCapture screen
CAR STACK: Show top 3 cards stacked (slight scale and translateY offset
for cards behind): \<View style={{ flex: 1 }}\> {\[currentIndex+2,
currentIndex+1, currentIndex\].map((idx, stackPos) =\> ( idx \<
cards.length && \<CardView key={cards\[idx\].id} card={cards\[idx\]}
isTop={stackPos===2} \... /\> ))} \</View\> Top card has PanResponder
for swipe gesture. PANRESPONDER on top card: onPanResponderMove:
Animated.event(\[null, { dx: position.x, dy: position.y }\], {
useNativeDriver: false }) onPanResponderRelease: (\_, gs) =\> { if
(gs.dx \> 120) handleSwipeRight() else if (gs.dx \< -120)
handleSwipeLeft() else Animated.spring(position, { toValue: {x:0,y:0},
useNativeDriver: false }).start() } ANIMATIONS: handleSwipeRight(): 1.
Animated.timing position.x to 500, duration 250 2. Call Zustand
swipeRight(currentCard) 3. Check termination conditions 4. Reset
position, advance currentIndex handleSwipeLeft(): Same but x to -500,
call swipeLeft TERMINATION CONDITIONS (check after each swipe): 1. swipe
count \>= 10 AND calculateConfidence() \>= 0.65 2. Time elapsed \>
180000ms (3 minutes) 3. currentIndex \>= cards.length - 1 If any
condition met: call completeQuiz() then navigate to RoomCapture
INDICATOR OVERLAYS on top card: - Right side: Animated.View with
opacity=rightOpacity, green rounded badge with heart icon \'LOVE\' -
Left side: Animated.View with opacity=leftOpacity, red/grey rounded
badge with X icon \'PASS\' BELOW CARD: - \'Neutral\' button: outlined
pill, \'Not sure\' text. OnPress: swipeNeutral(), advance index. -
Progress: thin bar at very bottom showing swipes done / estimated total
(20) CARD COMPONENT (CardView): - Image from card.image_url filling the
card - Rounded corners borderRadius:20, overflow:hidden - Subtle
gradient overlay at bottom (dark to transparent) --- for future use - NO
text labels, NO style names - Dimensions: screen width - 48, height:
(screen width - 48) \* 1.35 (portrait aspect ratio)

**6.4 HomeScreen (Dashboard)**

**Cursor Prompt --- HomeScreen.tsx**

CURSOR PROMPT: Create apps/mobile/src/screens/main/HomeScreen.tsx ---
the main dashboard. On mount: call fetchRooms() from Zustand. Subscribe
to auth state. LAYOUT: SafeAreaView with backgroundColor:\'#F5F0E8\'
HEADER: Row with paddingHorizontal:20, paddingTop:16, paddingBottom:8 -
Left: \'cova\' wordmark in dark green - Right: Token balance pill ---
gold coin icon (●) + token count text, backgroundColor:\'#1B3A2D\',
borderRadius:20, paddingHorizontal:12, paddingVertical:6 If
roomsLoading: show skeleton cards (grey animated shimmer) If
rooms.length === 0: empty state - Centered illustration (simple SVG
house shape) - \'Your rooms will appear here\' text - \'Create your
first room\' gold button → startNewRoom() If rooms.length \> 0:
SectionList or ScrollView: SECTION 1 --- \'My Rooms\': Horizontal scroll
of room cards (snapToInterval). Each card: - Width: screenWidth - 48,
height: (screenWidth - 48) \* 0.65 - Background: ImageBackground with
source={{ uri: room.latest_render_url \|\| undefined }} - If no render
yet: solid backgroundColor:\'#2D5A44\', centered placeholder icon -
Gradient overlay at bottom - Room name: white, fontSize:20,
fontWeight:\'600\', bottom-left - Room type badge: pill, bottom-right -
Date: small text below name - Tap: setCurrentRoom(room), navigate to
RoomViewer3D or RenderView depending on whether render exists - \'+\'
card at end: dashed border, centered \'+\' icon and \'New Room\' text,
tap → startNewRoom() startNewRoom(): navigate to NewRoomFlow which asks
for room type then starts the onboarding flow SECTION 2 --- \'Suggested
For You\': Label with \'Based on your style\' subtitle Vertical list of
inspiration cards: Each card: full width, height:200, ImageBackground -
Card shows AI-generated inspiration room image - \'Your Style Match\'
badge (shows top style as plain English description) - \'Recreate This
Room\' button at bottom right → shows Coming Soon Alert in V1 Data:
fetch from a static curated array or a Supabase query on swipe_cards
filtered by user style_blend top keys PULL-TO-REFRESH: refresh rooms
data NEW ROOM FLOW: When user taps \'+\' or \'Create first room\': 1.
Show room type picker modal (ActionSheet or Modal): 7 room type options
as a grid of icon+label tiles 2. On room type selected: call
createRoom(roomType, \'My \' + roomTypeName) 3. Check if user has a
saved style_blend already - If yes: show Alert \'Use your previous
style?\' with two options: \'Yes, use it\' (skip quiz → go to
RoomCapture) and \'No, discover new\' (go to StyleQuiz) - If no style
saved: go directly to StyleQuiz 4. Navigate to StyleQuiz or RoomCapture
accordingly

**6.5 ShopScreen**

**Cursor Prompt --- ShopScreen.tsx**

CURSOR PROMPT: Create apps/mobile/src/screens/main/ShopScreen.tsx ---
the shopping tab. This screen is the standalone shop tab, separate from
the product panel inside the render view. TABS at top of screen
(horizontal tab bar, custom styled): - \'Cart\' tab - \'Saved\' tab -
\'Orders\' tab (V2 placeholder --- shows Coming Soon) CART TAB: Header
row: \'My Cart\' title, \'Clear All\' text button (right) If
cartItems.length === 0: Empty state: bag icon, \'Your cart is empty\',
\'Start designing a room to add products\' subtext, \'Go to Rooms\'
button If cartItems.length \> 0: FlatList of cart item cards: Each card
(horizontal layout): - Product thumbnail: 80x80, borderRadius:8 - Right
side: product name (fontSize:16, fontWeight:\'600\'), retailer badge
pill, price formatted (\'\$1,299\'), Remove (X) button top right -
\'Shop at \[Retailer\]\' button: gold outlined pill, opens affiliate_url
via Linking.openURL() TOTAL SUMMARY at bottom (sticky): Divider, \'Cart
Total\' label, sum of all product prices formatted \'Check Out All\'
gold button: opens first product\'s affiliate_url, then prompts user to
open each retailer separately Note: We cannot do a real combined
checkout across retailers --- each retailer URL opens separately in the
browser. SAVED TAB: FlatList of saved/wishlisted products (stored
locally in Zustand --- persist to Supabase user preferences) Same card
style as cart \'Add to Cart\' button instead of Remove Fetch cart on
mount: fetchCart() Token balance shown in header right (consistent with
all screens)

**6.6 ProfileScreen**

**Cursor Prompt --- ProfileScreen.tsx**

CURSOR PROMPT: Create apps/mobile/src/screens/main/ProfileScreen.tsx ---
the profile and settings screen. LAYOUT: SafeAreaView,
backgroundColor:\'#F5F0E8\' ScrollView HEADER SECTION: - User avatar:
circular image (80x80, from user.avatar_url) or initials placeholder -
Full name (large, bold) - Email (small, grey) - \'Edit Profile\' text
link ACCOUNT CARD (styled section card, white background,
borderRadius:16, shadow): Section label: \'Account\' List rows (each
with icon, label, right chevron or value): - \'Full Name\' → navigate to
EditProfileScreen (inline text input) - \'Email\' → read-only display -
\'Password\' → \'Change Password\' → sends reset email via
supabase.auth.resetPasswordForEmail() - \'Sign Out\' → confirmation
Alert then signOut() - \'Delete Account\' → destructive confirmation
Alert with two-step confirm, then deleteAccount() deleteAccount(): 1.
Show Alert: \'This will permanently delete all your rooms, renders, and
data. This cannot be undone.\' 2. On confirm: call a Supabase Edge
Function \'delete-account\' that: - Deletes all user storage files from
all buckets (room-photos/{user_id}/, renders/{user_id}/) - Deletes all
user rows from all tables (cascades via FK on delete) - Calls
supabase.auth.admin.deleteUser(user_id) 3. Call signOut() locally MY
ROOMS CARD: Section label: \'My Rooms\' Compact list of all rooms with
type icon and latest render thumbnail Tap → navigate to that room RENDER
GALLERY CARD: Section label: \'Render Gallery\' \'View All Renders\' row
→ navigate to RenderGalleryScreen Preview: 3 latest render thumbnails in
a horizontal row STYLE PROFILE CARD: Section label: \'My Style\' Visual
style blend: horizontal bar chart showing the 5 style weights as
coloured segments Style names shown as plain English labels (only in
profile, where context is clear): \'Ocean Breeze 60%\', \'Zen Garden
30%\', etc. \'Retake Style Quiz\' button → confirmation Alert, then
navigate to StyleQuiz for current room SHOPPING CARD: Section label:
\'Shopping\' \'Saved Products\' row → navigate to saved tab of
ShopScreen \'Budget Preference\' row → shows current default budget, tap
to edit with picker \'Order History\' row → V2 placeholder, Coming Soon
TOKENS CARD: Section label: \'Tokens\' \'Balance: 999 tokens\' row (V1
--- always shows 999) \'Get More Tokens\' row → navigate to
TokenShopScreen (built in Phase 7, shows coming soon in V1 if token
phase not yet complete) \'Transaction History\' row → navigate to
TokenHistoryScreen SETTINGS CARD: Section label: \'Settings\'
\'Notifications\' → toggle push notification permission \'Units\' → ft /
m picker \'Appearance\' → Light / Dark mode toggle (apply to app
navigator theme) \'Privacy Policy\' → Linking.openURL() \'Terms of
Service\' → Linking.openURL() \'App Version\' → static text from
expo-constants Constants.expoConfig.version

**6.7 RenderGalleryScreen**

**Cursor Prompt --- RenderGalleryScreen.tsx**

CURSOR PROMPT: Create
apps/mobile/src/screens/main/RenderGalleryScreen.tsx. Shows a grid of
all AI renders across all rooms for the current user. LAYOUT:
SafeAreaView, dark green header, cream body Header: \'My Renders\'
title, back button Body: FlatList with numColumns:2,
ItemSeparatorComponent spacer Each grid item: - Square aspect ratio
(half screen width, minus gaps) - Image from render.image_url,
resizeMode:\'cover\' - On tap: open full-screen image viewer modal (use
a simple Modal with Image at full screen + close button) - Long press:
show action sheet --- Save to Camera Roll, Share, Delete Render Delete
render: soft delete (set active=false in DB), remove from local state
Save to camera roll: MediaLibrary.saveToLibraryAsync(render.image_url)
Share: Share.share({ url: render.image_url }) Filters at top: \'All
Rooms\' default + one chip per room name --- tap to filter by room Sort:
latest first by default Fetch all renders on mount: SELECT \* FROM
renders WHERE user_id = auth.uid() ORDER BY created_at DESC Group by
room_id for room filter chips

**6.8 Swipe Card Generation Script**

The style quiz needs 20-30 AI-generated room photos per style per room
type, pre-generated before launch and stored in Supabase. This is a
one-time batch script run from the command line.

**Cursor Prompt --- generate-swipe-cards.ts**

CURSOR PROMPT: Create scripts/generate-swipe-cards.ts --- a Node.js
script that generates all swipe card images for the style quiz and
uploads them to Supabase. This script runs once before launch: npx
ts-node scripts/generate-swipe-cards.ts CONFIG at top of file: const
CARDS_PER_STYLE_PER_ROOM = 25 const ROOM_TYPES: RoomType\[\] =
\[\'living_room\', \'bedroom\', \'dining_room\', \'home_office\',
\'kitchen\', \'bathroom\', \'entryway\'\] const STYLES: StyleName\[\] =
\[\'coastal\', \'japandi\', \'bohemian\', \'mid_century\',
\'minimalist\'\] STYLE PROMPTS (used for FLUX text-to-image): const
STYLE_PROMPTS: Record\<StyleName, string\[\]\> = { coastal: \[ \'Coastal
living room with white walls, natural linen sofa, driftwood coffee
table, sheer curtains, ocean blue accents, woven seagrass rug, natural
light streaming through large windows, professional interior
photography\', \'Beach house bedroom with white and sand tones, rattan
headboard, linen bedding, wooden nightstands, soft morning light,
organic textures throughout\', \... (at least 5 variants per style to
create variety) \], japandi: \[\...\], bohemian: \[\...\], mid_century:
\[\...\], minimalist: \[\...\], } ROOM TYPE MODIFIERS appended to each
prompt: const ROOM_MODIFIERS: Record\<RoomType, string\> = {
living_room: \'cozy living room space, sofa, coffee table, ambient
lighting\', bedroom: \'serene bedroom, bed as focal point, soft
lighting, bedside tables\', dining_room: \'elegant dining room, dining
table and chairs, pendant lighting above table\', home_office:
\'productive home office, desk setup, good task lighting, organized
shelving\', kitchen: \'beautiful kitchen, clean countertops, warm
lighting, open shelving or cabinets\', bathroom: \'spa-like bathroom,
clean lines, natural materials, warm towels, good lighting\', entryway:
\'welcoming entryway, console table, mirror, hooks or storage, good
first impression\', } STYLE WEIGHT TAGS --- each card gets these
internal weights (not shown to user): const STYLE_WEIGHTS:
Record\<StyleName, Partial\<Record\<StyleName, number\>\>\> = { coastal:
{ coastal: 0.8, minimalist: 0.15, japandi: 0.05 }, japandi: { japandi:
0.8, minimalist: 0.15, coastal: 0.05 }, bohemian: { bohemian: 0.8,
mid_century: 0.15, coastal: 0.05 }, mid_century:{ mid_century: 0.8,
bohemian: 0.1, minimalist: 0.1 }, minimalist: { minimalist: 0.85,
japandi: 0.15 }, } SCRIPT LOGIC: For each roomType, for each style, for
each card index (0 to CARDS_PER_STYLE_PER_ROOM): 1. Select a prompt:
STYLE_PROMPTS\[style\]\[index % prompts.length\] + \', \' +
ROOM_MODIFIERS\[roomType\] Append: \', 8k resolution, professional
architectural photography, award-winning interior design, bright and
airy, sharp focus\' 2. Call Replicate API to run FLUX schnell (fast
text-to-image): POST https://api.replicate.com/v1/predictions { version:
\'black-forest-labs/flux-schnell\', input: { prompt, width: 768, height:
1024, num_outputs: 1 } } 3. Poll until status === \'succeeded\' (check
every 2s) 4. Download the output image 5. Upload to Supabase storage
bucket \'swipe-cards\' at path: {style}/{roomType}/card\_{index}.jpg 6.
Insert a row into swipe_cards table: { image_url: storageUrl, room_type:
roomType, style_weights: STYLE_WEIGHTS\[style\], batch_name:
\'v1_launch\', active: true } 7. Log progress:
\'\[living_room\]\[coastal\] Card 3/25 generated\' Add rate limiting:
sleep 500ms between Replicate calls to avoid rate limit errors. Add
retry: if Replicate call fails, retry up to 3 times with exponential
backoff. Add resume: before generating, check how many cards already
exist for each style+room combination in the database --- skip those
that are already done. Required env vars read from .env file:
REPLICATE_API_TOKEN=\... NEXT_PUBLIC_SUPABASE_URL=\...
SUPABASE_SERVICE_ROLE_KEY=\... Export a main() function and call it at
the bottom.

**6.9 RoomPlan Native Module (Swift Wrapper)**

The RoomPlan feature requires two Swift files that wrap Apple\'s
RoomPlan API for React Native. These files are generated by Cursor and
then manually dragged into Xcode --- no Swift code is written by hand.

**Cursor Prompt --- RoomPlanModule.swift**

CURSOR PROMPT: Create apps/mobile/modules/RoomPlanModule.swift --- a
Swift class that wraps Apple\'s RoomPlan API for use in React Native.
This file uses the RoomCaptureSession API available in iOS 16+ on
LiDAR-equipped devices. The module must: 1. Import RoomPlan, React 2.
Define a class RoomPlanModule: NSObject, RoomPlanModuleProtocol 3. Have
an \@objc static func requiresMainQueueSetup() -\> Bool { return true }
4. Implement a startScan() method that: a. Creates a RoomCaptureSession
b. Sets delegate to self c. Starts capture with a
RoomCaptureSession.Configuration d. Sends \'RoomPlanScanStarted\' event
to JavaScript via RCTEventEmitter 5. Implement stopScan() method that:
a. Stops the RoomCaptureSession b. Calls finalizeResults on the session
6. Conform to RoomCaptureSessionDelegate: -
captureSession(\_:didAdd:error:) --- send progress events to JS -
captureSession(\_:didProvide:) --- called when scan completes. Convert
CapturedRoom to JSON: { walls: \[{ width, height, transform }\], doors:
\[{ width, height, transform }\], windows: \[{ width, height, transform
}\], floors: \[{ dimensions }\] } Send \'RoomPlanScanComplete\' event
with this JSON to JS - captureSession(\_:didFail:) --- send
\'RoomPlanScanFailed\' event with error message 7. Implement
isAvailable() method: returns true if the device supports RoomPlan (iOS
16+, LiDAR). Check with RoomCaptureSession.isSupported. Also create
apps/mobile/modules/RoomPlanModule.m --- the Objective-C bridge file:
#import \<React/RCTBridgeModule.h\> #import \<React/RCTEventEmitter.h\>
\@interface RCT_EXTERN_MODULE(RoomPlanModule, RCTEventEmitter)
RCT_EXTERN_METHOD(startScan) RCT_EXTERN_METHOD(stopScan)
RCT_EXTERN_METHOD(isAvailable:(RCTPromiseResolveBlock)resolve
rejecter:(RCTPromiseRejectBlock)reject) \@end And create
apps/mobile/src/modules/RoomPlanModule.ts --- the TypeScript interface:
import { NativeModules, NativeEventEmitter } from \'react-native\' const
{ RoomPlanModule } = NativeModules export const roomPlanEmitter = new
NativeEventEmitter(RoomPlanModule) export default { isAvailable: ():
Promise\<boolean\> =\> RoomPlanModule.isAvailable(), startScan: (): void
=\> RoomPlanModule.startScan(), stopScan: (): void =\>
RoomPlanModule.stopScan(), onScanComplete: (callback: (data:
RoomScanData) =\> void) =\>
roomPlanEmitter.addListener(\'RoomPlanScanComplete\', callback),
onScanProgress: (callback: (data: any) =\> void) =\>
roomPlanEmitter.addListener(\'RoomPlanScanStarted\', callback),
onScanFailed: (callback: (error: string) =\> void) =\>
roomPlanEmitter.addListener(\'RoomPlanScanFailed\', callback), } export
type RoomScanData = { walls: any\[\]; doors: any\[\]; windows: any\[\];
floors: any\[\] }

📝 NOTE: After Cursor generates these two files (RoomPlanModule.swift
and RoomPlanModule.m), open Xcode (open ios/cova.xcworkspace),
right-click the cova group in the Project Navigator, select \'Add Files
to cova\', and add both files. Then run npx expo prebuild \--platform
ios and rebuild the Dev Client.

**6.10 Common Phase 6 Errors & Fixes**

  ---------------------- ------------------- ---------------------------------
  **Error**              **Cause**           **Fix**

  Apple Sign In:         User dismissed the  Catch this specific error code
  ERR_REQUEST_CANCELED   Apple Sign In sheet and do NOT show an error message
                                             --- it is expected user behaviour

  Apple Sign In fails    Nonce mismatch      Generate nonce with
  with \'Invalid         between client and  crypto.getRandomValues, hash with
  credentials\'          Supabase            SHA-256, pass rawNonce to
                                             Supabase and hashedNonce to Apple

  Google Sign In         expo-auth-session   Add \'cova://\' to the Google
  redirects to browser   not configured for  Cloud Console authorized redirect
  instead of in-app      native flow         URIs. Use makeRedirectUri with
  sheet                                      native:true.

  Swipe cards not        swipe_cards table   Run the generate-swipe-cards.ts
  loading                is empty (script    script. For development, seed
                         not run yet)        5-10 cards manually in Supabase
                                             dashboard.

  StyleQuiz shows wrong  room_type filter    Verify the query:
  room type cards        not applied to      .eq(\'room_type\', roomType) ---
                         Supabase query      check that RoomType enum values
                                             match DB column values exactly
                                             (use underscores: \'living_room\'
                                             not \'Living Room\')

  RoomPlan module not    Swift files not     Open ios/cova.xcworkspace in
  found                  added to Xcode      Xcode, right-click cova group,
                         project             Add Files to cova. Select both
                                             .swift and .m files. Rebuild.

  RoomPlan crashes with  Device does not     Always check isAvailable() before
  \'RoomCaptureSession   have LiDAR or iOS   calling startScan(). Show Method
  not supported\'        \< 16               B/C capture options on
                                             unsupported devices.

  Home screen room cards latest_render_url   Show placeholder background
  show no image          is null for new     colour for rooms without a
                         rooms               render. Only show ImageBackground
                                             when latest_render_url is not
                                             null.

  Profile style blend    style_blend JSON    Ensure all 5 style keys are
  chart renders wrong    keys do not match   always present in style_blend
                         StyleName type      JSON --- initialise with all 5 at
                                             0.2 each as default
  ---------------------- ------------------- ---------------------------------

**6.11 Phase 6 Validation Checklist**

1.  Splash screen logo fades in over 2 seconds on fresh install

2.  Returning user bypasses splash and goes straight to HomeScreen

3.  Apple Sign In works on physical device (must be tested on device,
    not simulator)

4.  Google Sign In opens OAuth sheet and completes sign-in

5.  Email sign up creates account and navigates to HomeScreen

6.  Email sign in works for existing account

7.  New user flow: room type selection → style quiz → room capture →
    render view

8.  Style quiz swipe cards load (requires swipe cards in DB or
    generate-swipe-cards.ts has been run)

9.  Swipe right/left animations work smoothly

10. Quiz terminates at confidence threshold or time limit

11. HomeScreen shows room cards with latest render as background

12. \'+\' card starts new room flow

13. \'Use previous style?\' prompt appears on second room creation

14. ShopScreen shows cart items from product matching

15. ProfileScreen shows all sections with correct user data

16. Style blend visualisation shows correct weights

17. Sign out works and returns to SplashScreen

18. Delete account confirmation dialog appears with two-step confirm

**PHASE 7 Token Economy & Payments**

*StoreKit IAP integration, TokenShopScreen, token deduction logic,
one-line activation switch*

**Phase 7: Token Economy & Payments**

Phase 7 builds the complete token economy and payment infrastructure. In
V1, everything is dormant --- users see 999 tokens and never spend any.
But the full infrastructure is ready: one SQL update activates it
post-launch without a code change or App Store resubmission.

**7.1 Token Economy Architecture**

The token economy is designed around a single feature flag in the
database:

UPDATE users SET tokens_enabled = true WHERE id = \'all\';

When tokens_enabled = false (V1 launch state): all token checks in Edge
Functions are skipped, balance shows 999, no deductions occur. When
tokens_enabled = true: full economy activates --- renders cost tokens,
low balance blocks renders, users must purchase more.

  -------------------- ------------------ ---------------------------------
  **Component**        **V1 State**       **Post-Activation State**

  token_balance column Always 999         Real balance, decrements on
                                          render

  Token balance UI     Shows 999          Shows real balance, gold when \>
                                          10, orange when \< 10, red when
                                          \< 3

  Render token check   Skipped            2 tokens for draft, 3 for HD ---
                                          blocks if insufficient

  TokenShopScreen      Shows \'Coming     Fully functional IAP purchase
                       Soon\' overlay     flow

  token_transactions   No rows inserted   Full debit/credit ledger
  table                                   

  Apple StoreKit       Products           IAP sheet presented on purchase
                       registered but not tap
                       shown              
  -------------------- ------------------ ---------------------------------

**7.2 Apple StoreKit Product Registration**

Before writing any code, register the IAP products in App Store Connect:

19. Go to App Store Connect → Your App → Features → In-App Purchases

20. Create four Consumable products with these Product IDs:

- ai.cova.app.tokens.starter --- 10 tokens --- \$2.99

- ai.cova.app.tokens.standard --- 30 tokens --- \$7.99

- ai.cova.app.tokens.pro --- 75 tokens --- \$17.99

- ai.cova.app.tokens.power --- 200 tokens --- \$39.99

21. For each product: add a display name, description, and screenshot.
    These are reviewed by Apple.

22. Set pricing in the Pricing and Availability section for each
    product.

23. Submit each product for review --- they are reviewed alongside the
    app.

📝 NOTE: IAP products do not need to be approved before you can test
them in development with a Sandbox Apple ID account. But they must be
submitted before the first App Store submission.

**7.3 Token Shop Screen**

**Cursor Prompt --- TokenShopScreen.tsx**

CURSOR PROMPT: Create apps/mobile/src/screens/main/TokenShopScreen.tsx.
In V1 this screen shows a \'Coming Soon\' overlay but all logic is fully
built beneath it. STATE: const \[products, setProducts\] =
useState\<IAPProduct\[\]\>(\[\]) const \[purchasing, setPurchasing\] =
useState\<string\|null\>(null) const \[tokensEnabled\] = useState(false)
// Read from user.tokens_enabled in production IAP PRODUCT DEFINITIONS
(static): const TOKEN_PACKS = \[ { id: \'ai.cova.app.tokens.starter\',
tokens: 10, price: \'\$2.99\', label: \'Starter\', popular: false }, {
id: \'ai.cova.app.tokens.standard\', tokens: 30, price: \'\$7.99\',
label: \'Standard\', popular: true }, { id: \'ai.cova.app.tokens.pro\',
tokens: 75, price: \'\$17.99\', label: \'Pro\', popular: false }, { id:
\'ai.cova.app.tokens.power\', tokens: 200, price: \'\$39.99\', label:
\'Power\', popular: false }, \] On mount: 1. Call
InAppPurchases.connectAsync() from expo-in-app-purchases 2. Call
InAppPurchases.getProductsAsync(TOKEN_PACKS.map(p =\> p.id)) 3. Store
returned products (includes App Store prices in local currency) 4. Set
up purchase listener: InAppPurchases.setPurchaseListener(handlePurchase)
handlePurchase(result): 1. If result.responseCode ===
IAPResponseCode.OK: a. Extract purchase token and product ID from
result.results\[0\] b. Verify purchase server-side: call Edge Function
\'handle-purchase\' with { product_id, purchase_token, platform: \'ios\'
} c. Edge Function credits tokens and inserts token_transaction row d.
On success: update local token balance in Zustand store e. Show success
Alert: \'Tokens added! Your balance is now X tokens.\' 2. If
result.responseCode === IAPResponseCode.USER_CANCELED: do nothing 3. If
other error: show error Alert LAYOUT: SafeAreaView,
backgroundColor:\'#1B3A2D\' Header: back button, \'Get Tokens\' title,
current balance top right BALANCE CARD: Centered card with current token
balance large (fontSize:48, color:\'#C47B3C\'), \'tokens remaining\'
subtitle, brief explanation of what tokens do TOKEN PACK CARDS: FlatList
of 4 cards, each: - backgroundColor: ri===1 (Standard, popular) ?
\'#C47B3C\' : \'rgba(255,255,255,0.1)\' - \'MOST POPULAR\' badge on
Standard pack - Token count large (e.g. \'30 tokens\'), pack label,
price - \'Each render costs 2--3 tokens\' note - \'Buy\' button:
backgroundColor:\'#FFFFFF\', color:\'#1B3A2D\' or inverted for popular -
On buy: setPurchasing(pack.id),
InAppPurchases.purchaseItemAsync(pack.id) WHAT TOKENS PAY FOR section:
Small explainer: icon + \'Draft render --- 2 tokens\', icon + \'HD
render upgrade --- 1 additional token\', icon + \'Chat messages ---
Free\' RESTORE PURCHASES button at bottom (App Store requires this)
Calls InAppPurchases.getPurchaseHistoryAsync() COMING SOON OVERLAY: If
!tokensEnabled: render an absolutely positioned overlay over the whole
screen: - Semi-transparent backdrop: rgba(27,58,45,0.95) - Centered
card: lock icon, \'Tokens Coming Soon\' heading, \'All features are free
during our launch period. Token purchasing will be available in an
upcoming update.\' body text, \'Got it\' button that navigates back On
unmount: InAppPurchases.disconnectAsync()

**7.4 handle-purchase Edge Function**

mkdir -p supabase/functions/handle-purchase

**Cursor Prompt --- handle-purchase Edge Function**

CURSOR PROMPT: Create supabase/functions/handle-purchase/index.ts as a
Supabase Edge Function (Deno runtime). This function verifies an Apple
IAP purchase receipt server-side and credits tokens to the user\'s
account. Request: POST with JSON body: { product_id: string,
purchase_token: string, platform: \'ios\', transaction_id: string }
Logic: 1. Verify user is authenticated. 2. Map product_id to token
amount: const TOKEN_AMOUNTS: Record\<string, number\> = {
\'ai.cova.app.tokens.starter\': 10, \'ai.cova.app.tokens.standard\': 30,
\'ai.cova.app.tokens.pro\': 75, \'ai.cova.app.tokens.power\': 200, } 3.
Check for duplicate transaction: query token_transactions for a row with
description LIKE \'%transaction_id%\'. If found, return 409 Conflict to
prevent double-crediting. 4. Verify the receipt with Apple\'s
verification server: POST https://buy.itunes.apple.com/verifyReceipt
(production) Body: { receipt-data: purchase_token, password:
APPLE_SHARED_SECRET } If Apple returns status 21007 (sandbox receipt
sent to production), retry with
https://sandbox.itunes.apple.com/verifyReceipt If Apple returns status
!== 0, return 400 Bad Request. 5. On valid receipt: a. Increment user
token_balance by TOKEN_AMOUNTS\[product_id\] b. Insert a
token_transactions row: { user_id, amount: TOKEN_AMOUNTS\[product_id\],
type: \'purchase\', description: \'Apple IAP: \' + product_id + \'
transaction:\' + transaction_id } 6. Return { success: true,
new_balance: updatedBalance, tokens_added: amount } Environment
variables needed: APPLE_SHARED_SECRET (from App Store Connect → App
Information → App-Specific Shared Secret) Add CORS headers. Handle
OPTIONS.

Deploy the new function:

supabase functions deploy handle-purchase

Add the secret in Supabase dashboard → Edge Functions → Manage Secrets:

APPLE_SHARED_SECRET=your_app_specific_shared_secret_from_app_store_connect

**7.5 Token Balance UI Component**

**Cursor Prompt --- TokenBalancePill.tsx**

CURSOR PROMPT: Create apps/mobile/src/components/TokenBalancePill.tsx
--- a reusable token balance display used in the header of every screen.
Props: { balance: number; onPress?: () =\> void } Renders a pill-shaped
button: - backgroundColor:\'#1B3A2D\', borderRadius:20,
paddingHorizontal:12, paddingVertical:6 - Row layout: gold circle icon
(●, fontSize:14, color:\'#C47B3C\') + balance number + \'tokens\'
label - fontSize:14, color:\'#FFFFFF\' - Color changes based on balance:
\> 20: color:#FFFFFF (normal) 5-20: color:\'#FFA500\' (orange warning)
\< 5: color:\'#FF4444\' (red --- low) If tokens_enabled is false (V1):
always show 999 in normal white regardless of actual balance - Tap:
navigate to TokenShopScreen (if onPress provided) - Subtle pulse
animation when balance is \< 5 (Animated.loop on opacity 1→0.6→1)

**7.6 Token Activation Procedure**

When Cova is ready to activate the token economy post-launch, execute
this single SQL query in the Supabase SQL Editor:

\-- STEP 1: Enable tokens for all users

UPDATE public.users SET tokens_enabled = true;

\-- STEP 2: Reset all balances to a launch gift amount

UPDATE public.users SET token_balance = 10;

\-- STEP 3: Insert credit transactions for the gift

INSERT INTO public.token_transactions (user_id, amount, type,
description)

SELECT id, 10, \'bonus\', \'Launch gift --- thanks for being an early
user!\'

FROM public.users;

⚠ WARNING: These three statements activate the full token economy for
all users simultaneously. Test thoroughly in a staging Supabase project
before running in production. There is no automated rollback --- to
revert, set tokens_enabled = false again and reset balances.

**7.7 Common Phase 7 Errors & Fixes**

  ------------------------------- ----------------------- ----------------------------------------
  **Error**                       **Cause**               **Fix**

  IAP products not loading        App Store Connect       Verify Product IDs exactly match the
                                  products not submitted  strings in TOKEN_PACKS array. Products
                                  or wrong Product IDs    must be in \'Ready to Submit\' state in
                                                          App Store Connect.

  InAppPurchases.connectAsync()   expo-in-app-purchases   Add \'expo-in-app-purchases\' to plugins
  crash                           not installed or not in array in app.json. Rebuild Dev Client.
                                  app.json plugins        

  handle-purchase returns 409     transaction_id check    Make the duplicate check more specific:
  Conflict on first purchase      finding false matches   WHERE description = \'Apple IAP: \' \|\|
                                                          product_id \|\| \' transaction:\' \|\|
                                                          transaction_id (exact match)

  Apple receipt verification      purchase_token is not a Ensure you are passing
  fails with status 21002         valid base64 receipt    result.results\[0\].transactionReceipt
                                                          to handle-purchase, not the product ID

  Token balance not updating      Zustand store not       After successful handle-purchase call,
  after purchase                  refreshed after Edge    fetch updated user from Supabase and
                                  Function returns        update Zustand auth.user.token_balance

  Coming Soon overlay not showing tokensEnabled read from Read tokensEnabled directly from Zustand
                                  stale state             user state: useStore(state =\>
                                                          state.user?.tokens_enabled ?? false)
  ------------------------------- ----------------------- ----------------------------------------

**7.8 Phase 7 Validation Checklist**

24. TokenShopScreen shows Coming Soon overlay in V1 mode

25. Token balance pill shows 999 on all screens

26. Token balance pill colour is white (not orange/red) since
    tokens_enabled is false

27. handle-purchase Edge Function deployed and returns 401 for
    unauthenticated requests

28. Sandbox IAP purchase tested with a Sandbox Apple ID (Settings → App
    Store → Sandbox Account on iPhone)

29. Successful IAP purchase credits tokens to user balance

30. Duplicate purchase prevention works: running the same transaction_id
    twice returns 409

31. Restore Purchases button calls getPurchaseHistoryAsync without
    crashing

32. SQL activation script tested on a staging project

**PHASE 8 Realtor Mode**

*Full V2 feature: realtor dashboard, virtual staging, QR code voting,
B2B subscription*

**Phase 8: Realtor Mode**

Realtor Mode is Cova\'s B2B revenue stream and V2 flagship feature. It
is built in full here --- not deferred. The realtor experience runs
alongside the consumer experience in the same app, gated behind an
account_type check.

**8.1 Architecture Overview**

Realtor Mode is activated when user.account_type === \'realtor\'.
Realtors see a different HomeScreen with property management tools. All
realtor functionality uses the same Supabase backend with additional
tables and Edge Functions.

  --------------- --------------------- ----------------------------------
  **Realtor       **Description**       **Technical Component**
  Feature**                             

  Realtor         Property management   RealtorHomeScreen replacing
  Dashboard       home screen --- lists HomeScreen for realtor accounts
                  properties and        
                  renders               

  Virtual Staging Upload a vacant room  Same FLUX ControlNet pipeline,
                  photo and AI-render   special empty-room prompt
                  it furnished for      
                  listing               

  Listing Renders Multiple style        Batch render triggering --- 3-5
                  variants of the same  styles per room in parallel
                  room for listing      
                  comparison            

  QR Code         Each property gets a  qrcode npm package, stored in
  Generation      QR code linking to a  Supabase storage
                  public voting page    

  Public Voting   Buyers scan QR code   Expo web or a simple
  Page            and vote on design    Supabase-hosted static page with
                  options at an open    voting UI
                  house                 

  Vote Analytics  Realtor sees vote     Votes table in Supabase, real-time
                  counts per design     subscription
                  option per property   

  B2B             Monthly recurring     StoreKit auto-renewable
  Subscription    subscription for      subscription or Stripe for web
                  unlimited renders     

  Branded Output  Renders include       Image compositing in the
                  realtor agency        get-render-status Edge Function
                  branding overlaid on  
                  image                 
  --------------- --------------------- ----------------------------------

**8.2 Additional Database Tables for Realtor Mode**

**Migration 011 --- Properties**

Create supabase/migrations/20240011000000_properties.sql:

CREATE TABLE public.properties (

id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

address TEXT NOT NULL,

description TEXT,

listing_url TEXT,

status TEXT NOT NULL DEFAULT \'active\'

CHECK (status IN (\'active\',\'sold\',\'archived\')),

created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY \"properties_own\" ON public.properties

FOR ALL USING (auth.uid() = user_id);

**Migration 012 --- Voting Pages**

Create supabase/migrations/20240012000000_voting_pages.sql:

CREATE TABLE public.voting_pages (

id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE
CASCADE,

user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

title TEXT NOT NULL DEFAULT \'Which design do you prefer?\',

description TEXT,

qr_code_url TEXT,

public_slug TEXT UNIQUE NOT NULL,

active BOOLEAN NOT NULL DEFAULT true,

created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

CREATE TABLE public.design_options (

id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

voting_page_id UUID NOT NULL REFERENCES public.voting_pages(id) ON
DELETE CASCADE,

render_id UUID NOT NULL REFERENCES public.renders(id),

label TEXT NOT NULL,

style_name TEXT,

vote_count INTEGER NOT NULL DEFAULT 0,

display_order INTEGER NOT NULL DEFAULT 0

);

CREATE TABLE public.votes (

id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

design_option_id UUID NOT NULL REFERENCES public.design_options(id) ON
DELETE CASCADE,

voter_session TEXT NOT NULL,

created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

UNIQUE (design_option_id, voter_session) \-- one vote per session per
option

);

\-- Voting pages are publicly readable by slug

ALTER TABLE public.voting_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY \"voting_pages_public_read\" ON public.voting_pages FOR
SELECT USING (active = true);

CREATE POLICY \"voting_pages_owner\" ON public.voting_pages FOR ALL
USING (auth.uid() = user_id);

ALTER TABLE public.design_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY \"design_options_public_read\" ON public.design_options
FOR SELECT USING (true);

ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY \"votes_public_insert\" ON public.votes FOR INSERT WITH
CHECK (true);

CREATE POLICY \"votes_public_read\" ON public.votes FOR SELECT USING
(true);

Apply new migrations:

supabase db push

**8.3 Realtor Account Upgrade**

**Cursor Prompt --- Realtor Upgrade Flow**

CURSOR PROMPT: Create
apps/mobile/src/screens/realtor/RealtorUpgradeScreen.tsx. This screen is
shown when a consumer account user taps \'Switch to Realtor Mode\' in
their Profile screen. CONTENT: - Hero section: illustration of a realtor
showing a tablet with room renders to clients - \'Cova for Realtors\'
heading - Value props list (each with icon): Unlimited AI renders for
all your listings Multiple style variants per room for buyer comparison
QR code voting pages for open house engagement Professional branded
render output Dedicated realtor dashboard - PRICING SECTION: Monthly
plan card: \'\$49/month\' large, \'Unlimited renders, all features\',
\'Start Free Trial\' button Annual plan card (highlighted \'Best
Value\'): \'\$399/year\' (save \$189), same features, \'Start Free
Trial\' button Both plans: 7-day free trial, cancel anytime - \'Start
Free Trial\' button: In V1 (before Stripe integration): show a Calendly
or email-based signup: Alert: \'Realtor subscriptions are being
onboarded manually during our beta period. Email us at realtors@cova.ai
to get set up --- we will activate your account within 24 hours.\' Then
open: Linking.openURL(\'mailto:realtors@cova.ai?subject=Realtor Mode
Request\') In V2 (with Stripe): trigger Stripe Checkout via
expo-web-browser - \'Already have realtor access? Activate\' link: Shows
a text input to enter an activation code On submit: call Edge Function
\'activate-realtor\' with { code } Edge Function: check code against a
realtor_codes table, if valid update user.account_type to \'realtor\'
Back button navigates back to Profile

**8.4 Realtor Home Screen**

**Cursor Prompt --- RealtorHomeScreen.tsx**

CURSOR PROMPT: Create
apps/mobile/src/screens/realtor/RealtorHomeScreen.tsx. This screen
replaces HomeScreen for users where user.account_type === \'realtor\'.
The RootNavigator should detect account_type and route to
RealtorHomeScreen instead of HomeScreen in the Rooms tab. LAYOUT:
SafeAreaView, dark green header, cream body HEADER: - \'Cova for
Realtors\' with small \'PRO\' badge - Token balance (realtor accounts
have unlimited renders but show tokens anyway) - \'Add Property\' +
button SECTION 1 --- Active Properties: FlatList of property cards (full
width, height:140): Each card shows: - Property address (large) - Status
badge (Active / Sold) - Thumbnail grid: up to 4 render thumbnails in a
2x2 grid, each from different style variants - \'3 design options\'
count badge - QR code icon button (generates or opens existing QR code
for this property) - Tap card → PropertyDetailScreen SECTION 2 ---
Recent Renders: Horizontal scroll of the 10 most recent renders across
all properties SECTION 3 --- Voting Activity: Cards for active voting
pages showing recent vote activity \'X votes in last 24 hours\' Tap →
VotingPageAnalyticsScreen FAB (Floating Action Button) bottom right: \'+
New Staging\' gold button → VirtualStagingScreen

**8.5 Virtual Staging Screen**

**Cursor Prompt --- VirtualStagingScreen.tsx**

CURSOR PROMPT: Create
apps/mobile/src/screens/realtor/VirtualStagingScreen.tsx. This screen
allows realtors to virtually stage a vacant or lived-in room for a
listing. FLOW: 1. Property selection: picker showing the realtor\'s
properties. Or \'New Property\' to create one. 2. Room type selection
(same 7 options as consumer flow) 3. Photo capture (same as consumer
RoomCaptureScreen --- use the shared component) 4. Style selection for
listing: Instead of quiz, realtor sees the 5 style options as labelled
cards with a sample image each. IMPORTANT: style names ARE shown to
realtors (they are professionals), unlike consumer flow. Realtor can
select 1-5 styles to generate simultaneously. 5. Budget range selection:
\$500-\$2,000 / \$2,000-\$5,000 / \$5,000-\$10,000 / Luxury (\$10,000+)
(Used for product matching tier only --- not shown in renders) 6.
Generate: triggers 1 render per selected style in parallel (maximum 5
concurrent) RENDER BATCH LOGIC: For each selected style: 1. Construct a
style-specific prompt. For staging, append: \'The room appears to be
vacant or needs staging. Add tasteful, on-trend furniture appropriate
for a real estate listing. The goal is to help buyers visualise living
in this space. Professional staging photography quality.\' 2. Call
render-room Edge Function with the specific style\'s blend 3. Show
progress per render: 5 progress bars/indicators, one per selected style
RESULTS SCREEN (after all renders complete): - Horizontal scroll of
render results, one per style - Each with style label, render image,
\'Use for listing\' button - Comparison mode: tap any two renders to see
them side by side (same BeforeAfterSlider component) - \'Create Voting
Page\' button: takes selected renders to VotingPageSetupScreen -
\'Download All\' button: saves all renders to camera roll BRANDING
OVERLAY: If user has uploaded a logo in their realtor profile, the
get-render-status Edge Function should composite the logo watermark in
the bottom-right corner of each render image before saving to storage.
Add a logo_url parameter to the render-room call and handle compositing
in get-render-status using the sharp library (available in Deno via
npm:sharp or a Canvas-based alternative).

**8.6 QR Code & Voting Page**

**Cursor Prompt --- VotingPageSetupScreen.tsx**

CURSOR PROMPT: Create
apps/mobile/src/screens/realtor/VotingPageSetupScreen.tsx. Navigation
params: { propertyId: string, renderIds: string\[\] } This screen lets
realtors set up a public voting page for open house design feedback.
FORM FIELDS: - Title: text input, default \'Which design fits your
lifestyle?\' - Description: multiline text input, optional - Design
option labels: one text input per render (e.g. \'Option A - Modern
Coastal\', \'Option B - Zen Retreat\') - Active toggle: turn voting
on/off ON SUBMIT: 1. Generate a unique public_slug: property address
slugified + random 4-char suffix 2. Call a Supabase Edge Function
\'create-voting-page\' with the form data and render IDs 3. Edge
Function: a. Insert voting_pages row b. Insert design_options rows (one
per render) c. Generate QR code image pointing to
https://vote.cova.ai/{public_slug} Use a QR code generation API:
https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=URL d.
Download the QR code PNG and upload to Supabase storage \'assets\'
bucket at path: qr-codes/{voting_page_id}.png e. Return {
voting_page_id, qr_code_url, public_url } 4. Navigate to
QRCodeDisplayScreen Create
apps/mobile/src/screens/realtor/QRCodeDisplayScreen.tsx: - Shows the
generated QR code image (full size, centered) - Public voting URL below
(tap to copy) - \'Save QR Code\' button: saves QR code image to camera
roll - \'Share\' button: shares the public URL via iOS share sheet -
\'Print\' button: opens the QR code in a print-optimised web view via
expo-web-browser - \'View Votes\' button: navigates to
VotingPageAnalyticsScreen - Preview of the public voting page URL:
https://vote.cova.ai/{slug}

**8.7 Public Voting Page**

The public voting page (visited by open house guests via QR scan) is a
web page --- not part of the React Native app. It is served from a
Supabase Edge Function that renders HTML.

**Cursor Prompt --- vote-page Edge Function**

CURSOR PROMPT: Create supabase/functions/vote-page/index.ts as a
Supabase Edge Function (Deno runtime). This function serves a full HTML
voting page for open house guests who scan the QR code. Request: GET
with path /{slug} Logic: 1. Extract the slug from the URL path 2. Query
Supabase for the voting_page with matching public_slug and active=true
3. If not found: return 404 HTML page 4. Query design_options for this
voting_page, order by display_order 5. For each design_option, query the
render.image_url 6. Return a complete HTML page (full HTML string,
Content-Type: text/html) HTML PAGE DESIGN: - Mobile-optimised
(max-width:420px, centred on desktop) - Background: #1B3A2D - \'cova\'
wordmark header in gold - Property address subtitle - Voting title and
description - Design option cards: each shows the render image
full-width, option label below - Vote button below each option: large
gold button \'Vote for This\' On click (JavaScript): POST to
/functions/v1/submit-vote with { design_option_id, voter_session }
voter_session: generated from localStorage.getItem(\'voter_session\')
\|\| crypto.randomUUID() stored in localStorage After vote: disable all
vote buttons, show \'Thanks for voting!\' message, show live vote
counts - Realtor branding section at bottom if realtor has agency name
set Create supabase/functions/submit-vote/index.ts: Request: POST {
design_option_id, voter_session } Logic: 1. Check for duplicate: SELECT
FROM votes WHERE design_option_id = \$1 AND voter_session = \$2. If
exists, return 409. 2. INSERT into votes 3. Increment
design_options.vote_count 4. Return { success: true, total_votes:
updated_count }

**8.8 Voting Analytics Screen**

**Cursor Prompt --- VotingPageAnalyticsScreen.tsx**

CURSOR PROMPT: Create
apps/mobile/src/screens/realtor/VotingPageAnalyticsScreen.tsx.
Navigation params: { votingPageId: string } This screen shows real-time
vote analytics for a property\'s design voting page. DATA LOADING: On
mount and on pull-to-refresh: 1. Fetch voting_page by id 2. Fetch
design_options with vote_counts for this page 3. Subscribe to real-time
Supabase changes on design_options table for this voting_page_id:
supabase.channel(\'votes\').on(\'postgres_changes\', { event:
\'UPDATE\', schema: \'public\', table: \'design_options\', filter:
\'voting_page_id=eq.\' + votingPageId }, handleUpdate).subscribe()
LAYOUT: Header: property address, \'Live Votes\' subtitle, green live
indicator dot SUMMARY STATS row: - Total votes across all options -
Leading option name - Hours active OPTION RESULTS: For each
design_option: - Render image thumbnail (80x80 on left) - Option label -
Vote count large - Horizontal bar: width as % of total votes, gold
fill - \'Leading\' badge on top option ACTIONS: - Toggle voting
active/inactive (for realtor to close voting after open house) - Share
page link - Export results as PDF (V2 placeholder) Real-time updates:
when Supabase subscription fires, update vote counts with smooth
Animated width transition on the bars.

**8.9 Common Phase 8 Errors & Fixes**

  --------------------- ---------------- -----------------------------------------------------------------------------------------
  **Error**             **Cause**        **Fix**

  account_type check    User object in   After activate-realtor Edge Function succeeds, re-fetch user from Supabase: await
  not routing to        Zustand not      supabase.from(\'users\').select(\'\*\').eq(\'id\', user.id).single() and update Zustand
  RealtorHomeScreen     updated after    store
                        account upgrade  

  Voting page not       vote-page Edge   Deploy: supabase functions deploy vote-page. The function receives the full URL ---
  accessible at slug    Function not     extract slug from the URL path.
  URL                   deployed or slug 
                        routing not set  
                        up               

  QR code image not     qrserver.com API Test QR URL:
  loading               blocked by Expo  https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https://vote.cova.ai/test
                        network policy   --- if blocked, use a different QR generation library like \'qrcode\' npm package to
                                         generate locally

  Batch renders fail    Multiple         Add a 500ms delay between each render-room call. Or use Promise.allSettled instead of
  after first one       concurrent       Promise.all so one failure doesn\'t cancel others.
  completes             Replicate        
                        predictions hit  
                        rate limit       

  Real-time vote        Supabase         In Supabase dashboard → Database → Replication: ensure the design_options table is
  subscription not      Realtime not     enabled for realtime.
  triggering            enabled on       
                        design_options   
                        table            

  submit-vote returns   voter_session    Ensure voter_session is read from localStorage before generating a new one: const session
  409 for all voters    not persisted    = localStorage.getItem(\'cova_voter_session\') \|\| crypto.randomUUID();
                        between page     localStorage.setItem(\'cova_voter_session\', session)
                        loads            
  --------------------- ---------------- -----------------------------------------------------------------------------------------

**8.10 Phase 8 Validation Checklist**

33. account_type === \'realtor\' routes to RealtorHomeScreen

34. RealtorUpgradeScreen shows pricing and sends email on CTA tap

35. VirtualStagingScreen captures a vacant room photo

36. Selecting 3 styles generates 3 renders in parallel with individual
    progress indicators

37. VotingPageSetupScreen creates a voting page and generates a QR code

38. QR code saves to camera roll and shares correctly

39. Visiting the QR URL in Safari on iPhone shows the HTML voting page

40. Voting on the web page increments vote counts in Supabase

41. VotingPageAnalyticsScreen shows real-time vote counts updating

42. Toggling voting active/inactive on the analytics screen affects the
    public page

**PHASE 9 App Store Submission**

*EAS production build, TestFlight beta, App Store Connect setup, privacy
policy, App Review, launch*

**Phase 9: App Store Submission**

Phase 9 prepares Cova for the App Store. This phase is mostly process
and configuration, not code. Work through every item methodically ---
App Review rejections on technicalities waste 1-3 days each.

**9.1 Pre-Submission Code Checklist**

Complete every item before building the production binary:

**Security Checks**

- Confirm no API keys exist in any file in apps/mobile/src/ --- only
  EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env

- Confirm service role key and Replicate/Anthropic keys are only in
  Supabase Edge Function secrets

- Run: grep -r \'sk-ant\' apps/mobile/src/ --- should return nothing

- Run: grep -r \'REPLICATE\' apps/mobile/src/ --- should return nothing

- Run: grep -r \'service_role\' apps/mobile/src/ --- should return
  nothing

**RLS Verification**

In Supabase SQL Editor, verify RLS is enabled on every table:

SELECT tablename, rowsecurity FROM pg_tables

WHERE schemaname = \'public\'

ORDER BY tablename;

Every row must show rowsecurity = true. If any show false, enable RLS
before submitting.

**Privacy & Legal**

- Privacy policy live at a public URL (required by Apple)

- Terms of service live at a public URL

- Both URLs are linked in ProfileScreen → Settings

- Both URLs are referenced in App Store Connect

- Delete account flow verified: deletes all data from all tables and
  storage

- No user data shared with third parties without disclosure in privacy
  policy (Replicate API call sends room photos --- must be disclosed)

- App Tracking Transparency prompt implemented and tested

**App Store Guidelines Compliance**

- Apple Sign In implemented and shown as the first/primary sign-in
  option (required when any other social login is present)

- All in-app purchases use StoreKit --- no web checkout for digital
  goods within the app

- Restore Purchases button exists in TokenShopScreen

- No misleading screenshots --- App Store screenshots show the actual
  app UI

- Age rating: 4+ is appropriate --- no objectionable content

**9.2 EAS Build Configuration**

EAS (Expo Application Services) handles cloud builds for the App Store.
Configure it now:

cd apps/mobile

eas login

eas build:configure

This creates apps/mobile/eas.json. Update it with the correct build
profiles:

{

\"cli\": { \"version\": \"\>= 5.0.0\" },

\"build\": {

\"development\": {

\"developmentClient\": true,

\"distribution\": \"internal\",

\"ios\": { \"simulator\": false }

},

\"preview\": {

\"distribution\": \"internal\",

\"ios\": { \"buildConfiguration\": \"Release\" }

},

\"production\": {

\"distribution\": \"store\",

\"ios\": { \"buildConfiguration\": \"Release\" }

}

},

\"submit\": {

\"production\": {

\"ios\": {

\"appleId\": \"your_apple_id@email.com\",

\"ascAppId\": \"YOUR_APP_STORE_CONNECT_APP_ID\",

\"appleTeamId\": \"YOUR_TEAM_ID\"

}

}

}

}

**9.3 App Store Connect Setup**

Before building, set up the app listing in App Store Connect:

43. Go to appstoreconnect.apple.com → My Apps → \'+\' (New App)

44. Platform: iOS

45. Name: Cova

46. Primary Language: English (US)

47. Bundle ID: ai.cova.app (must match apps/mobile/app.json)

48. SKU: cova-ios-v1 (any unique string)

49. User Access: Full Access

In the App Information section:

- Subtitle: tinder for your home

- Category: Lifestyle (Primary), Shopping (Secondary)

- Age Rating: 4+

- Privacy Policy URL: your live privacy policy URL

In the Pricing and Availability section:

- Price: Free

- Availability: All territories

**9.4 App Store Screenshots**

Apple requires screenshots at specific sizes. Required sizes for
2024/2025 App Store:

  ------------------ ---------------- --------------- -------------------------
  **Device Size**    **Resolution**   **Required?**   **Notes**

  6.7 inch (iPhone   1290 x 2796 px   Required        iPhone 16 Pro Max frame
  15 Pro Max)                                         

  6.5 inch (iPhone   1284 x 2778 px   Required for    Can reuse 6.7 inch scaled
  14 Plus)                            legacy          

  5.5 inch (iPhone 8 1242 x 2208 px   Required for    Older device
  Plus)                               legacy          compatibility

  iPad Pro 12.9 (3rd 2048 x 2732 px   Only if iPad    Cova is iPhone-only in V1
  gen)                                supported       
  ------------------ ---------------- --------------- -------------------------

Required screenshots --- 3 to 10 images per device size:

50. Splash screen with logo (dark green background, gold logo)

51. Style quiz in progress --- showing a beautiful room card mid-swipe

52. AI render view --- photorealistic render of a coastal living room

53. Before/after slider --- original room photo vs AI render side by
    side

54. Product shopping panel --- products matched to the render

55. Chat assistant --- conversation about changing the sofa

56. Home dashboard --- room cards with render backgrounds

Take screenshots on the physical iPhone with the app in
production-quality state. Use the iPhone\'s built-in screenshot
function. Optionally add device frames using a tool like
Screenshot.rocks.

**9.5 App Preview Video (Optional but Recommended)**

A 30-second app preview video dramatically improves conversion on the
App Store. Record with QuickTime Player (File → New Movie Recording →
iPhone Camera) or use screen recording on the device. Required specs:

- Format: H.264 .mov or .mp4

- Length: 15-30 seconds

- Resolution: matches device size (1290x2796 for 6.7 inch)

- No audio required, but ambient music can be added

Recommended content sequence:

57. 0s: Cova splash screen

58. 3s: Style quiz --- rapid 3 swipes with satisfying animations

59. 8s: Room capture --- photo taken, calibration overlaid

60. 12s: Loading screen with progress stages

61. 16s: Render reveal --- render fades in replacing the room photo

62. 20s: Product panel slides in showing matched products

63. 24s: Chat interaction --- user sends message, AI responds

64. 28s: Before/after slider reveal

**9.6 App Store Metadata**

**App Description (4000 character limit)**

Write this directly in App Store Connect. Suggested draft:

Design your dream room --- without lifting a finger. Cova is the AI
interior design app that learns your style through swipes, scans your
actual room, and shows you a photorealistic render of your redesigned
space. Then it finds the exact products to buy to make it real. HOW IT
WORKS: 1. Swipe through rooms you love and don\'t love. Cova quietly
learns your style --- no design vocabulary needed. 2. Scan your room
with your iPhone camera. Cova captures the exact dimensions and layout.
3. See your room reimagined. A stunning AI render shows you your
redesigned space in photorealistic quality. 4. Shop it. Every piece in
your render is matched to a real product you can buy --- right from the
app. WHAT MAKES COVA DIFFERENT: • Your actual room --- not a generic
template. The AI render is constrained to your real room\'s geometry. •
Your actual style --- discovered through swipes, not described with
words. • Your actual products --- matched to your render by visual AI
and your budget. FEATURES: • AI style discovery quiz --- Tinder-style
swipes build your aesthetic fingerprint • Room scanning --- photo
capture or LiDAR 3D scan (iPhone 12 Pro and later) • 3D room viewer ---
arrange furniture before you render • Photorealistic AI renders --- FLUX
ControlNet with depth-accurate results • AI design assistant --- chat
about your room with design-aware AI • Smart product matching --- CLIP
visual AI finds products that match your render • Shopping integration
--- Wayfair, Amazon, IKEA, CB2, and more • Budget control --- filter
everything to your price range FREE DURING LAUNCH --- All features are
free while we\'re getting started.

**Keywords (100 character limit --- comma separated)**

interior design,AI room,home decor,furniture,room makeover,home
design,room planner,AI interior

**What\'s New in Version 1.0**

Introducing Cova --- AI-powered interior design. Design your room,
discover your style, shop it.

**9.7 Production Build & TestFlight**

Build the production binary using EAS:

cd apps/mobile

eas build \--platform ios \--profile production

This uploads your code to EAS servers and builds it in the cloud. Takes
20-40 minutes. When complete, EAS provides a download link for the .ipa
file and optionally submits it directly to App Store Connect.

To submit directly via EAS:

eas submit \--platform ios \--latest

Alternatively, download the .ipa and upload manually via Transporter
(Mac App Store).

📝 NOTE: If EAS build fails with \'podspec error\', run npx expo
prebuild \--clean locally first to verify the Podfile generates
correctly, then push to EAS.

After the build uploads to App Store Connect, go to TestFlight:

65. In App Store Connect → TestFlight → select your build

66. Add required export compliance answers: No encryption (if your app
    does not use additional encryption beyond HTTPS)

67. Under \'External Testing\': Add up to 10,000 external testers via
    email or a public TestFlight link

68. Fill in the \'Beta App Description\' and \'Feedback Email\'

69. Submit for Beta App Review (takes 1-2 days, quicker than full App
    Review)

**9.8 App Review Submission**

After TestFlight testing is satisfactory, submit for App Store Review:

70. In App Store Connect → Your App → iOS App → select the version

71. Upload screenshots for all required device sizes

72. Optionally upload the app preview video

73. Fill in the Version Information:

- What\'s New: V1.0.0 launch text

- App Review Information: notes for the reviewer explaining the AI
  render feature and why camera/photo library permissions are needed

- Demo Account: create a test account (testreviewer@cova.ai) in Supabase
  Auth with sample rooms and renders already created --- the reviewer
  needs to see the app working without needing to take a real photo

74. Confirm all IAP products are submitted (in the \'Prepare for
    Submission\' checklist)

75. Confirm privacy policy URL is entered

76. Click \'Submit for Review\'

⚠ WARNING: App Review rejects the most common issues: (1) Apple Sign In
missing or not primary --- verify it is the first button. (2) Restore
Purchases button missing in IAP screen --- verify it exists. (3) Privacy
policy not accessible --- test the URL is live and loads in Safari
before submitting. (4) Crash on launch for reviewer --- always provide a
working demo account.

**9.9 App Review Demo Account Setup**

Create a demo account that the App Reviewer can use without taking real
room photos. This is critical --- reviewers cannot take photos of their
Apple review environment.

In Supabase dashboard, run this SQL to set up the demo account:

\-- First create the auth user via Supabase Auth dashboard, get the UUID

\-- Then seed demo data:

\-- Insert demo rooms

INSERT INTO public.rooms (user_id, name, room_type, style_blend,
dimensions_json, budget)

VALUES

(\'DEMO_USER_UUID\', \'My Living Room\', \'living_room\',

\'{\"coastal\":0.6,\"japandi\":0.3,\"bohemian\":0.05,\"mid_century\":0.03,\"minimalist\":0.02}\',

\'{\"width\":16,\"depth\":14,\"height\":9,\"unit\":\"ft\"}\', 2500),

(\'DEMO_USER_UUID\', \'Master Bedroom\', \'bedroom\',

\'{\"japandi\":0.7,\"minimalist\":0.2,\"coastal\":0.05,\"bohemian\":0.03,\"mid_century\":0.02}\',

\'{\"width\":14,\"depth\":12,\"height\":9,\"unit\":\"ft\"}\', 1500);

Also pre-populate renders for these rooms so the reviewer lands directly
in a render view. Upload two pre-generated render images to the renders
bucket and insert render rows with status \'completed\'.

**9.10 Post-Submission Monitoring**

After submission, monitor App Review status in App Store Connect →
Activity. Reviews typically take 1-3 business days for first submission
and 1-2 days for updates.

**Common Rejection Reasons & Responses**

  ------------------ --------------- ----------------------------------------
  **Rejection        **Guideline**   **Response Action**
  Reason**                           

  Apple Sign In not  4.8 Sign in     Move Apple Sign In to be the first and
  prominently        with Apple      largest button on AuthScreen
  displayed                          

  Missing Restore    3.1.1 In-App    Verify Restore Purchases button exists
  Purchases          Purchase        in TokenShopScreen --- it must be
                                     visible without scrolling

  Privacy policy not 5.1 Privacy     Ensure URL works, policy discloses room
  accessible or      Policy          photo processing via third-party AI
  incomplete                         (Replicate/Anthropic)

  App crashes on     2.1 App         Provide pre-seeded demo account with
  reviewer\'s device Completeness    renders. Test on iPhone 11/12 (most
                                     common review device)

  Camera usage       5.1 Privacy     Update NSCameraUsageDescription to be
  description        Policy          specific: \'Cova uses your camera to
  insufficient                       capture your room for 3D modeling and AI
                                     design rendering\'

  In-app purchase    3.1.1 In-App    Provide a note that IAPs are in Sandbox
  not testable       Purchase        mode. The reviewer needs to use the demo
                                     account to see the TokenShopScreen.

  Push notifications 4.5.4 Push      Either implement notifications or remove
  not implemented    Notifications   the capability from Xcode Signing &
  after declaring                    Capabilities
  them                               
  ------------------ --------------- ----------------------------------------

**9.11 Launch Day Checklist**

On the day of approval and launch:

**Immediate (within 1 hour of approval)**

77. In App Store Connect: set \'Manually Release\' to \'Release Update\'
    to go live

78. Verify app appears in App Store search for \'Cova\' --- can take up
    to 1 hour to propagate

79. Test the live App Store build end-to-end on a fresh device (sign out
    of all test accounts first)

80. Monitor Supabase Edge Function logs for errors in the first hour

81. Check Replicate dashboard for render prediction volume and error
    rates

**Within 24 Hours**

82. Post launch announcement on social channels

83. Seed product catalog to 500 minimum products (run the product
    seeding script)

84. Monitor Supabase storage usage --- first renders will populate the
    renders bucket

85. Check Supabase database row counts --- new users should be creating
    rows in users table

86. Send welcome email to any pre-launch waitlist signups

87. Verify affiliate URLs are working: test one product from each
    retailer (Wayfair, Amazon)

**Within 1 Week**

88. Review first user sessions in Supabase --- which rooms are being
    created most?

89. Monitor render failure rate in the renders table: SELECT status,
    COUNT(\*) FROM renders GROUP BY status

90. Check chat_messages for any common questions that suggest UX
    confusion

91. Review App Store ratings (first reviews may appear within days)

92. Decide on token economy activation timeline based on retention data

**9.12 Product Seeding Script**

**Cursor Prompt --- seed-products.ts**

CURSOR PROMPT: Create scripts/seed-products.ts --- a script to populate
the products table with the initial 500-1,000 curated product catalog.
Run with: npx ts-node scripts/seed-products.ts The script: 1. Reads
product data from a local JSON file scripts/products.json (you will
populate this manually with real affiliate product data) 2. For each
product, calls the clip-embed Edge Function to generate a 1024-dim CLIP
embedding from the product image_url 3. Inserts the product row into the
products table with the embedding 4. Logs progress: \'\[32/500\]
Inserting: Modern Coastal Sofa --- Wayfair\' products.json schema: \[ {
\"name\": \"Modern Coastal Sofa\", \"description\": \"3-seat linen sofa
with solid oak legs\", \"price\": 129900, \"retailer\": \"Wayfair\",
\"affiliate_url\": \"https://wayfair.com/\...?refid=cova_affiliate\",
\"category\": \"seating\", \"room_types\": \[\"living_room\"\],
\"style_tags\": \[\"coastal\", \"minimalist\"\], \"image_url\":
\"https://\...\", \"width_inches\": 84, \"depth_inches\": 38,
\"height_inches\": 34 }, \... \] The script should: - Process in batches
of 10 to avoid rate limiting - Skip products that already have a row in
the products table (check by name + retailer combo) - Log a summary at
the end: \'500 products seeded, 23 skipped (already exist), 2 failed
(CLIP error)\' After running: verify with SELECT COUNT(\*) FROM
products; --- should show 500+ Also seed Wayfair products manually:
browse wayfair.com for products in each category and style, copy the
product name, image URL, and product URL, and add them to products.json.
Target distribution: - 100 seating products - 80 tables products - 60
lighting products - 80 storage products - 60 bed/bedroom products - 60
decor/plants products - 60 home office products - Spread across all 5
styles and all price tiers

**9.13 Common Phase 9 Errors & Fixes**

  --------------------- ---------------- ---------------------------------
  **Error**             **Cause**        **Fix**

  EAS build fails: \'No Apple Developer  In Xcode → Preferences → Accounts
  signing certificate\' certificate not  → Manage Certificates → Create
                        created or       Distribution certificate. Or let
                        expired          EAS manage credentials: eas
                                         credentials

  EAS build fails:      Local pod        Run: cd ios && pod install && cd
  \'Podfile.lock        versions differ  .. then commit the updated
  mismatch\'            from EAS build   Podfile.lock
                        environment      

  App crashes on        Architecture     Build with eas build \--platform
  reviewer\'s iPhone    difference       ios \--profile production --- EAS
  but not yours         (arm64 vs        builds for both architectures
                        x86_64)          

  Transporter rejects   Minimum iOS      In app.json:
  .ipa: \'Invalid       version not set  ios.deploymentTarget: \'16.0\'.
  binary\'              correctly        Rebuild.

  App Review: \'We were Demo account has Pre-populate rooms and renders
  unable to review your no pre-seeded    for the demo account using SQL
  app because it        data             INSERT statements in Supabase.
  crashed\'                              

  App Review: \'Your    Missing          Add all required
  app appeared to       Info.plist entry NSUsageDescription keys to
  access                                 app.json ios.infoPlist. Rebuild
  privacy-sensitive                      and resubmit.
  data without                           
  displaying a purpose                   
  string\'                               

  TestFlight build not  Build still      Wait 30 minutes. Check if export
  appearing in          processing or    compliance questionnaire appeared
  TestFlight            export           in App Store Connect. Answer No
                        compliance not   encryption if applicable.
                        answered         
  --------------------- ---------------- ---------------------------------

**9.14 Phase 9 Validation Checklist**

93. All security checks pass: no API keys in source code

94. RLS enabled on all Supabase tables

95. Privacy policy and terms of service live at public URLs

96. Delete account verified: purges all data from all tables and buckets

97. App Tracking Transparency prompt appears on first launch

98. Apple Sign In is first and largest button on AuthScreen

99. Restore Purchases button visible in TokenShopScreen

100. EAS production build completes without errors

101. TestFlight build installs on device and all features work

102. Screenshots uploaded for all required device sizes

103. App Store Connect metadata complete: description, keywords,
     category

104. All IAP products submitted to App Review in App Store Connect

105. Demo account created with pre-seeded rooms and renders

106. App submitted for App Store Review

107. Launch day monitoring plan in place

**Appendix A: Post-Launch V2 Feature Backlog**

These features are documented for V2 planning. None of these are built
in V1 or V2 Realtor Mode. They are the natural next steps after
validated product-market fit.

  ------------------- ------------------- -------------- ------------------------------
  **V2 Feature**      **Description**     **Priority**   **Technical Notes**

  Discover Tab        Community feed of   High           Public visibility toggle on
                      user-submitted                     rooms. Supabase public read
                      rooms with                         policy. Featured curations by
                      permission. Browse,                Cova team.
                      like, and recreate                 
                      rooms from other                   
                      users.                             

  Style Switching in  Tap a style chip in High           Same render-room pipeline,
  Render              the render view to                 different style prompt. Save
                      regenerate the                     multiple renders per room by
                      render in a new                    style.
                      style, preserving                  
                      room geometry.                     

  Recreate            Apply another       Medium         Copy style_blend from source
  Inspiration Room    user\'s style                      room. Trigger render with that
                      fingerprint to your                blend on current room\'s
                      own room scan.                     geometry.

  AI Chatbot          Chatbot detects     Medium         Claude response includes a
  Auto-Regeneration   when user asks for                 structured action block: {
                      a change (e.g.                     action: \'regenerate\',
                      \'change the sofa                  modifications: \[\...\] }.
                      to blue\') and                     Parse and trigger render.
                      automatically                      
                      triggers a                         
                      regeneration.                      

  Multi-Room Design   Connect multiple    Low            Projects table grouping rooms.
                      rooms in one                       Shared style_blend across
                      project. See all                   rooms in a project.
                      rooms together as a                
                      home.                              

  Android App         React Native is     High           RoomPlan → ARCore for
                      already                            LiDAR-equivalent scanning on
                      cross-platform.                    Android Pro devices.
                      Only RoomPlan (iOS                 
                      only) needs a                      
                      substitute: use                    
                      ARCore depth API on                
                      Android.                           

  Social Sharing      Shareable           Medium         Image compositing:
  Cards               before/after cards                 before/after side by side with
                      with Cova branding                 Cova logo and QR code.
                      for Instagram                      Generate in Edge Function.
                      Stories, TikTok.                   

  Retailer API        Automated product   High           Scheduled Supabase Edge
  Auto-Sync           catalog growth via                 Function runs nightly. Fetches
                      Wayfair Partner                    new products, computes CLIP
                      Network API and                    embeddings, inserts rows.
                      Amazon Product                     
                      Advertising API.                   

  Weighted Chat       Charge tokens       Low            Count input tokens in Claude
  Tokens              proportional to                    API call. Deduct from balance
                      message complexity                 proportionally. tokens_enabled
                      (image input = more                gate.
                      tokens).                           

  Web App             Browser-based       Medium         React (not React Native) with
                      version for desktop                Three.js web renderer. Same
                      users. Same                        Edge Functions. Stripe for web
                      Supabase backend.                  IAP.
  ------------------- ------------------- -------------- ------------------------------

**Appendix B: Full Dependency Reference**

Complete list of all packages used in the Cova mobile app, at locked
versions:

  -------------------------------------------- -------------- ---------------------------------
  **Package**                                  **Version**    **Purpose**

  expo                                         \~52.0.49      React Native app framework and
                                                              build toolchain

  react                                        18.3.1         UI library --- must match
                                                              react-dom exactly

  react-dom                                    18.3.1         Web compatibility layer --- must
                                                              match react exactly

  react-native                                 \~0.76.x (Expo Core mobile primitives
                                               managed)       

  three                                        0.155.0        3D engine --- PINNED, do not
                                                              upgrade

  \@react-three/fiber                          8.17.10        React renderer for Three.js ---
                                                              PINNED

  \@react-three/drei                           9.88.0         Three.js helpers --- PINNED

  \@react-three/postprocessing                 2.15.0         SSAO and other post-processing
                                                              effects

  \@supabase/supabase-js                       \^2.x          Supabase client for auth,
                                                              database, storage

  \@react-native-async-storage/async-storage   Expo managed   Supabase session persistence

  \@react-navigation/native                    \^6.x          Navigation container

  \@react-navigation/bottom-tabs               \^6.x          Bottom tab navigator

  \@react-navigation/stack                     \^6.x          Stack navigator

  react-native-screens                         Expo managed   Navigation performance

  react-native-safe-area-context               Expo managed   Safe area handling for
                                                              notch/Dynamic Island

  react-native-gesture-handler                 Expo managed   Gesture system for PanResponder
                                                              and R3F

  react-native-reanimated                      Expo managed   Animated API performance layer

  zustand                                      \^4.x          State management

  immer                                        \^10.x         Immutable state updates for
                                                              Zustand

  expo-camera                                  Expo managed   Room photo capture

  expo-image-picker                            Expo managed   Photo library access

  expo-apple-authentication                    Expo managed   Apple Sign In

  expo-auth-session                            Expo managed   Google OAuth flow

  expo-web-browser                             Expo managed   OAuth redirect handling + in-app
                                                              browser

  expo-in-app-purchases                        Expo managed   Apple StoreKit IAP

  expo-file-system                             Expo managed   File read/write for image
                                                              processing

  expo-asset                                   Expo managed   Local asset loading (GLB,
                                                              textures)

  expo-linking                                 Expo managed   Deep links and Settings URL

  expo-media-library                           Expo managed   Save renders to camera roll

  expo-constants                               Expo managed   App version and build info

  \@cova/shared                                workspace:\*   Shared TypeScript types across
                                                              monorepo
  -------------------------------------------- -------------- ---------------------------------

**Appendix C: Supabase Edge Functions Reference**

  -------------------- ------------- ------------ ---------------------------------
  **Function**         **Method**    **Auth       **Purpose**
                                     Required**   

  render-room          POST          Yes          Start FLUX ControlNet render via
                                                  Replicate API

  get-render-status    GET           Yes          Poll render status and save
                       ?render_id=                completed image to storage

  clip-embed           POST          Yes          Compute 1024-dim CLIP embedding
                                                  for a render image

  match-products       POST          Yes          pgvector cosine similarity search
                                                  against product catalog

  chat-room            POST          Yes          Claude Sonnet 4 Vision chatbot
                                                  response for a room

  handle-purchase      POST          Yes          Verify Apple IAP receipt and
                                                  credit tokens to user

  delete-account       POST          Yes          Full GDPR account deletion ---
                                                  all data, all storage, auth user

  activate-realtor     POST          Yes          Validate realtor activation code
                                                  and upgrade account type

  create-voting-page   POST          Yes          Create QR voting page for realtor
                                                  property

  submit-vote          POST          No (public)  Record a vote on a design option

  vote-page            GET /{slug}   No (public)  Serve HTML voting page to open
                                                  house guests
  -------------------- ------------- ------------ ---------------------------------

**Appendix D: Environment Variables Reference**

  ------------------------------- ------------------ ---------------- -----------------------
  **Variable**                    **Location**       **Visibility**   **Value Source**

  EXPO_PUBLIC_SUPABASE_URL        apps/mobile/.env   Client --- safe  Supabase → Settings →
                                                     to expose        API → Project URL

  EXPO_PUBLIC_SUPABASE_ANON_KEY   apps/mobile/.env   Client --- safe  Supabase → Settings →
                                                     to expose (RLS   API → anon/public
                                                     protected)       

  SUPABASE_SERVICE_ROLE_KEY       Supabase Edge      Server only ---  Supabase → Settings →
                                  Function secrets   NEVER in client  API → service_role
                                  only               code             

  REPLICATE_API_TOKEN             Supabase Edge      Server only      replicate.com → Account
                                  Function secrets                    → API Tokens
                                  only                                

  ANTHROPIC_API_KEY               Supabase Edge      Server only      console.anthropic.com →
                                  Function secrets                    API Keys
                                  only                                

  APPLE_SHARED_SECRET             Supabase Edge      Server only      App Store Connect → App
                                  Function secrets                    Information → Shared
                                  only                                Secret
  ------------------------------- ------------------ ---------------- -----------------------

Document Version 1.0 \| Cova Build Guide Part 2 --- Phases 6--9 \|
Pranav Goel & Daksh Parikh \| hellocova@gmail.com
