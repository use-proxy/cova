**COVA**

*tinder for your home*

**Master Strategy Document**

V1 Product Specification \| Confidential

Pranav Goel & Daksh Parikh

hellocova@gmail.com \| ai.cova.app

Supabase Project: xdeacbmkdwqrwxonqaqh

**Table of Contents**

**1. Product Vision**

**1.1 The One-Line Pitch**

Cova is Tinder for your home --- an AI-powered interior design app that
learns your style through swipes, renders your actual room in that
style, and lets you buy every product in the render with one tap.

**1.2 The Problem We Solve**

Interior design has a visualisation gap. A homeowner who wants to
redesign their living room faces three unsolvable problems with existing
tools:

1.  They cannot visualise their actual room in a new style before
    committing thousands of dollars to furniture and renovation.

2.  They do not know the vocabulary of design --- they cannot say
    \'Japandi\' or \'Coastal\' --- so they cannot communicate what they
    want to AI tools, designers, or retailers.

3.  Even when they find inspiration online, there is no path from \'I
    love this look\' to \'these are the exact products I need to buy for
    my specific room at my budget\'.

Existing tools fail at all three levels simultaneously:

- Professional design software (SketchUp, AutoCAD, Revit): solves the
  visualisation problem but requires years of training. Inaccessible to
  consumers.

- AI room redesign apps (RoomGPT, Interior AI, Decoratly): fast and
  cheap but use generic room templates, produce flat 2D transformations
  with no spatial accuracy, and have zero commerce integration.

- Inspiration platforms (Pinterest, Houzz, Instagram): enormous content
  libraries but zero path from inspiration to purchase, and no way to
  apply inspiration to your specific room.

- Retailer AR tools (IKEA Kreativ, Wayfair View in Room): limited to one
  retailer\'s catalog, no style personalisation, no room geometry
  accuracy beyond basic.

**The Gap:** No product in the market delivers accurate room geometry +
silent style learning + photorealistic render + direct commerce in a
single consumer mobile app. Cova owns this intersection entirely.

**1.3 Mission Statement**

To make professional-quality interior design accessible to every person
--- regardless of budget, design knowledge, or experience --- by
combining AI, 3D visualisation, and personalised style discovery in a
single seamless mobile experience.

**1.4 Vision Statement (3-Year)**

Cova becomes the default starting point for any home design decision. A
homeowner buying a new sofa opens Cova first to see it in their room
before visiting a store. A renter moving into a new apartment scans
every room and gets a fully styled render before unpacking. A realtor
stages every listing virtually before photography. Cova is the bridge
between imagining a space and living in it.

**1.5 Target Users**

**Primary Consumer (V1)**

  --------------- -------------------------------------------------------
  **Dimension**   **Profile**

  Age             22--45

  Life stage      Homeowner, recent mover, renter redecorating, first
                  apartment

  Design          Low to medium --- browses Pinterest and Instagram for
  knowledge       inspiration but does not know design terminology

  Pain point      Cannot visualise how a new style or piece of furniture
                  will look in their specific room before spending money

  Behaviour       Spends 30+ minutes per week browsing home design
                  content. Has saved hundreds of images on Pinterest. Has
                  never hired a designer.

  Device          iPhone (primary). iPad secondary.

  Income          \$40,000--\$120,000 household income. Budget-conscious
                  but willing to spend on the right piece.
  --------------- -------------------------------------------------------

**Secondary Consumer (V1)**

Interior design enthusiasts aged 25--50 who actively follow design
accounts, regularly redecorate, and treat home design as a hobby. Higher
budget, higher engagement, more renders per session. These users become
Cova\'s organic evangelists on social media.

**B2B User --- Realtor (V2)**

Real estate agents, stagers, and property developers who need to
virtually stage vacant properties, generate listing renders in multiple
styles, and present design options to buyers at open houses. High
willingness to pay for a professional tool that saves them photography
and staging costs.

**1.6 Core Value Proposition**

  -------------- ----------------------------------- ------------------------------------
  **Pillar**     **What Cova Delivers**              **Why No Competitor Can Match It**

  Spatial        AI renders constrained to real room Competitors use generic room
  Accuracy       geometry via Apple RoomPlan LiDAR   templates. Cova\'s renders show your
                 scanning or Depth Anything V2 depth actual walls, your actual window,
                 estimation                          your actual proportions.

  Style          Tinder-style swipe quiz builds a    Every competitor requires style
  Intelligence   mathematical style fingerprint      selection menus. Cova\'s quiz works
  Without        without ever asking the user to     for users who just know what they
  Vocabulary     name a style                        like when they see it.

  Photorealism   FLUX ControlNet Union Pro 2.0 with  Basic AI redesign tools produce
                 depth + Canny edge control produces painterly or obviously AI-looking
                 architectural-photography-quality   results. Cova targets render quality
                 renders                             indistinguishable from professional
                                                     staging photography.

  Commerce       OpenCLIP visual matching finds the  Inspiration platforms show you rooms
  Integration    exact purchasable product that      you can never recreate. Cova shows
                 matches each rendered piece.        you the room AND sells you every
                 One-tap affiliate checkout.         piece in it.

  Full           Scan → Style → Render → Shop in one Every competitor handles one piece
  End-to-End     seamless app session, never leaving of the flow. Cova is the only
  Flow           the app                             product that closes all four steps.
  -------------- ----------------------------------- ------------------------------------

**2. Design & UI Philosophy**

**2.1 The v0 + Cursor Toolchain**

Cova\'s UI is built using a two-tool approach that separates visual
design from business logic:

  ----------- --------------- ------------------ -------------------------
  **Tool**    **Role**        **Used For**       **Not Used For**

  v0 (Vercel) Primary UI      All screen         3D engine, backend logic,
              generation tool layouts, component state management,
                              design,            navigation wiring
                              animations, visual 
                              polish, the Tinder 
                              swipe experience,  
                              dashboard cards,   
                              all user-facing UI 

  Cursor (AI  Logic and       Three.js/R3F 3D    Screen visual design,
  IDE)        wiring layer    room engine,       component styling
                              Supabase Edge      
                              Functions, Zustand 
                              store, navigation  
                              structure, wiring  
                              v0 components to   
                              real data          
  ----------- --------------- ------------------ -------------------------

The workflow for every screen is:

4.  Generate the complete visual component in v0 with a detailed prompt
    describing layout, interactions, animations, and brand colours.

5.  Export the v0 output (React/JSX with Tailwind or inline styles).

6.  Paste into Cursor. Cursor adapts it for React Native (converting web
    CSS to StyleSheet, Tailwind classes to RN equivalents).

7.  Cursor wires the adapted component to Zustand state, Supabase
    queries, and React Navigation.

**Why v0 first:** v0 produces significantly higher visual quality UI
than Cursor alone. Cursor is excellent at logic and architecture but
produces mediocre default styling. v0 is trained on thousands of
beautiful UI patterns. Using both tools in sequence produces
professional-grade results.

**2.2 Brand Identity**

  ------------- --------------------- ------------------------------------
  **Element**   **Value**             **Usage**

  Primary       #1B3A2D (Dark Forest  App backgrounds, headers, tab bar,
  Colour        Green)                primary buttons, all dark surfaces

  Accent Colour #C47B3C (Copper Gold) CTAs, active states, icons,
                                      highlights, price text, token
                                      balance

  Background    #F5F0E8 (Warm Cream)  Screen backgrounds, card
                                      backgrounds, light surfaces

  Text Primary  #1A1A1A (Near Black)  Body text on light backgrounds

  Text          #888888 (Mid Grey)    Subtitles, metadata, timestamps
  Secondary                           

  Text On Dark  #FFFFFF (White)       Text on green or dark backgrounds

  Error         #CC3333 (Red)         Error states, low balance warnings,
                                      destructive actions

  Success       #2E7D32 (Forest       Success states, confirmation
                Green)                messages

  Font          SF Pro (iOS system    No custom font imports --- uses iOS
                default)              system font throughout

  Border Radius 12--28px              Cards: 16px. Buttons: 28px (pill).
                                      Modal sheets: 20px top corners.

  Shadow        iOS shadow system     Cards: shadowOffset {0,4},
                                      shadowOpacity:0.12, shadowRadius:12
  ------------- --------------------- ------------------------------------

**2.3 Screen-by-Screen UI Tool Assignment**

  --------------------------- ----------- -------------------- -----------------------
  **Screen**                  **Primary   **v0 Scope**         **Cursor Scope**
                              Tool**                           

  SplashScreen                v0          Logo animation,      Auth state check,
                                          button reveal, full  navigation routing
                                          layout               

  AuthScreen                  v0          Apple/Google/Email   Supabase auth calls,
                                          buttons, form        nonce generation, error
                                          layout, error        handling
                                          states, loading      
                                          states               

  StyleQuizScreen             v0          Tinder card stack,   Supabase card fetch,
                                          swipe animations,    Zustand quiz state,
                                          card design,         termination logic
                                          progress indicator,  
                                          neutral button       

  HomeScreen                  v0          Room card design,    Room data fetch,
                                          empty state,         navigation to room, new
                                          Suggested For You    room flow
                                          cards, header,       
                                          pull-to-refresh UI   

  RoomCaptureScreen           v0          Method selection     Camera permissions,
                                          cards, camera UI     expo-camera, depth map
                                          overlay, calibration API call
                                          handles, progress    
                                          stages               

  RoomViewer3DScreen          Cursor only N/A --- Three.js     Full 3D engine,
                                          canvas, not          PanResponder, furniture
                                          generatable by v0    interaction

  RenderViewScreen            v0 + Cursor Loading progress UI, Render polling, image
                                          render overlay HUD,  pan/zoom, Edge Function
                                          action buttons       calls
                                          layout               

  ShopScreen                  v0          Cart card design,    Supabase cart fetch,
                                          tab bar, empty       affiliate URL opening
                                          state, checkout CTA  

  ProfileScreen               v0          All section cards,   Supabase data fetch,
                                          style blend          delete account Edge
                                          visualisation,       Function
                                          settings rows        

  TokenShopScreen             v0          Pack cards, coming   StoreKit integration,
                                          soon overlay,        handle-purchase Edge
                                          balance display, IAP Function
                                          UI                   

  RealtorHomeScreen           v0          Property cards, vote Supabase property
                                          analytics preview,   fetch, navigation
                                          FAB button           

  VirtualStagingScreen        v0          Style selection      Batch render
                                          grid, progress       triggering, parallel
                                          indicators per       Edge Function calls
                                          render, results      
                                          comparison           

  VotingPageAnalyticsScreen   v0          Vote bar charts,     Supabase Realtime
                                          real-time update     subscription, vote
                                          animations, toggle   count updates
                                          controls             
  --------------------------- ----------- -------------------- -----------------------

**2.4 UI Design Principles**

**Immersion First**

The render view is always full screen. No chrome, no nav bars, no white
space. The user is inside their room. Any controls that appear do so as
a transient overlay that fades after 3 seconds of inactivity. This is
the single most important UX rule in the app --- the moment a UI element
intrudes on the render, the magic is broken.

**Dark by Default**

The primary app experience uses the dark forest green palette. Light
cream backgrounds are used for data-heavy screens (profile, shop,
settings) where readability matters more than atmosphere. The 3D viewer
and render view are always dark.

**No Design Vocabulary Exposure**

The words Japandi, Coastal, Bohemian, Mid-Century Modern, and Minimalist
never appear in any user-facing UI element except the Profile → Style
section, where they are shown as plain English descriptions (\'Ocean
Breeze\', \'Zen Garden\', \'Boho Spirit\', \'Mid-Century\', \'Pure
Lines\'). The quiz, the render, the product panel, and the chat
assistant never reference these internal labels.

**Gesture Native**

Every primary action uses a gesture: swipe to like/dislike in the quiz,
swipe to reveal the product panel, swipe to pan the render, pinch to
zoom, long press for product info. Buttons are secondary confirmation
mechanisms, not primary interaction patterns.

**Progressive Disclosure**

New users see only what they need for the current step. The full feature
set reveals itself as they progress through the flow. The first session
is laser-focused on one outcome: see your room rendered beautifully.

**3. Feature Specifications --- All 12 Features**

**Feature 1 --- Splash Screen & Onboarding**

Status: V1 \| UI Tool: v0 \| Logic Tool: Cursor

**Splash Screen**

- Full-screen #1B3A2D background

- Cova logo SVG: gold arch mark + \'cova\' wordmark (weight 300,
  letter-spacing 8, #C47B3C) + \'tinder for your home\' italic tagline
  (#C47B3C, letter-spacing 2)

- Logo fades in over 2 seconds using Animated.timing (opacity 0→1,
  Easing.out(Easing.ease))

- After fade: Sign In and Create Account buttons animate up from bottom
  with Animated.spring

- Returning authenticated users detected before animation --- redirected
  to HomeScreen after 500ms logo display

**New User Onboarding Flow**

- Room type selection screen: 7 options shown as icon + label grid cards

- Style Fingerprint Quiz (Feature 3)

- Room Capture (Feature 4)

- First AI render auto-triggered → user lands in render view

**Navigation**

- Bottom tabs: Rooms, Shop, Profile, Discover (placeholder)

- Token balance pill: top right of every screen, always visible

**Feature 2 --- Authentication**

Status: V1 \| UI Tool: v0 \| Logic Tool: Cursor \| Backend: Supabase
Auth

- Apple Sign In (primary --- required by App Store when any social login
  is present). Uses expo-apple-authentication. Nonce-verified via
  SHA-256. Private email relay supported.

- Google Sign In (secondary). Uses expo-auth-session OAuth 2.0 flow. No
  password stored.

- Email + Password (tertiary). Inline form validation. Toggle between
  Sign In and Create Account.

- All three providers create a Supabase Auth session. Auto-creates users
  table row via database trigger on first sign-in.

- Post-auth: new users go to onboarding. Returning users go to
  HomeScreen.

**Feature 3 --- Style Fingerprint Quiz (Tinder Implementation)**

Status: V1 \| UI Tool: v0 (PRIMARY) \| Logic Tool: Cursor \| This is
Cova\'s #1 differentiator

**v0 owns this screen entirely.** The Tinder card stack, swipe physics,
card reveal animations, progress indicator, and the entire visual
experience are generated by v0. Cursor only handles the Supabase data
fetch and Zustand state updates.

**Instruction Screen**

- Shown once before first card --- never appears during swiping

- Swipe right = love it \| Swipe left = skip it \| Neutral button =
  unsure

- Skip button (top corner) --- only shown here, never on cards

- Skip applies default equal-weight style blend, navigates to Room
  Capture

**Card Stack Visual**

- 3 cards visible simultaneously: top card full opacity, card 2 slightly
  scaled down (scale 0.95) and offset up 8px, card 3 scaled further
  (scale 0.90) and offset up 16px

- Stacking creates the illusion of a thick deck --- satisfying Tinder
  feel

- Top card has full drop shadow. Cards behind have no shadow (reduces
  visual noise).

**Swipe Mechanics**

- PanResponder on top card --- tracks dx, dy of finger position

- Card rotates as it\'s dragged: rotation = dx \* 0.08 degrees (max ±20
  degrees)

- LOVE badge (green, heart icon) fades in on right side as dx increases
  past 40px

- PASS badge (subtle grey, X icon) fades in on left side as dx decreases
  past -40px

- Release threshold: if \|dx\| \> 120px, commit the swipe. Otherwise
  spring back.

- Commit animation: card flies to ±500px x with Animated.timing 220ms,
  next card scales up with spring

**Adaptive Algorithm**

- Each card tagged with style_weights JSON: e.g. { coastal: 0.8,
  japandi: 0.15, minimalist: 0.05 }

- Swipe right: multiply each tag weight by 1.3, normalise all 5 style
  weights to sum to 1.0

- Swipe left: multiply each tag weight by 0.7, normalise

- After each right swipe: next 2 cards biased toward the growing
  dominant style

- Algorithm always interjects a contrast card every 4 swipes to probe
  other preferences

- Result example: { coastal: 0.62, japandi: 0.28, bohemian: 0.06,
  mid_century: 0.03, minimalist: 0.01 }

**Termination**

- Minimum 10 cards before early termination possible

- Terminate early if: top style weight \>= 0.65 AND gap between top two
  \>= 0.20

- Force terminate at: 3 minutes elapsed OR all available cards shown

- On termination: save style_blend to room and user, navigate to Room
  Capture

**Swipe Cards**

- Pre-generated using FLUX text-to-image in a one-time batch script
  before launch

- 25 cards per style per room type = 875 total cards (5 styles × 7 room
  types × 25)

- Stored in Supabase swipe_cards bucket, metadata in swipe_cards table

- No style names, labels, categories, or tags visible on or near any
  card

**Feature 4 --- Room Capture**

Status: V1 \| UI Tool: v0 \| Logic Tool: Cursor

**Method A --- RoomPlan LiDAR (iPhone 12 Pro+)**

- Swift wrapper generated by Cursor: RoomPlanModule.swift +
  RoomPlanModule.m

- Files dragged into Xcode --- no Swift written by hand

- AR overlays show walls, doors, windows detected in real time

- Output: exact parametric room dimensions, door and window positions

- Populates 3D viewer geometry and FLUX render depth map precisely

**Method B --- Photo Capture (All iPhones)**

- expo-camera in-app camera, single photo from doorway perspective

- 4-corner drag calibration overlay defines room boundary

- Depth Anything V2 via Replicate generates depth map from photo

- Width/Depth/Height sliders for manual dimension correction

**Method C --- Library Upload (All iPhones)**

- expo-image-picker selects existing room photo

- Same calibration and depth estimation flow as Method B

**Post-Capture**

- Loading screen: \'Setting up your room\...\' with animated progress
  stages

- First render auto-triggered --- user lands in render view on
  completion

**Feature 5 --- 3D Room Viewer**

Status: V1 \| UI Tool: Cursor only (Three.js --- v0 cannot generate 3D)
\| HUD elements: v0

**Tech Stack (All Pinned)**

- Three.js: 0.155.0 --- PINNED

- \@react-three/fiber: 8.17.10 --- PINNED

- \@react-three/drei: 9.88.0 --- PINNED

- \@react-three/postprocessing: 2.15.0

**Camera**

- Position: doorway eye level --- theta:0, phi:1.25, radius:4.5

- All camera values in useRef --- never useState (prevents gesture
  conflicts)

- NEVER use OrbitControls --- crashes expo-gl. Custom PanResponder
  camera only.

- Camera clamped inside room at all times --- no white space ever
  visible

- Canvas background = ceiling colour for the active style

**Scene**

- BoxRoom: PBR-textured floor, walls, ceiling (no front wall --- camera
  enters from there)

- PBR textures from Polyhaven (CC0): floor normal, roughness, AO maps

- HDRI environment lighting from Polyhaven at 1K resolution per style

- SSAO via \@react-three/postprocessing: natural darkening in corners
  and under furniture

- Directional light from window plane on back wall with shadow casting

- Architectural trim: crown molding, baseboards, door frame at entrance

**Furniture Interaction**

- Tap: select piece --- shows selection ring (gold torus at floor level)

- Drag: moves along floor plane, clamped to room bounds

- Rotate: 45-degree increments

- Delete with confirmation + Undo

- Long press: product info sheet

- \'+\' button: furniture catalog bottom sheet filtered by room type +
  style

- 2D floor plan toggle: orthographic top-down view

**Feature 6 --- AI Render**

Status: V1 \| Loading/HUD UI: v0 \| Pipeline logic: Cursor \| PRIMARY
PRODUCT EXPERIENCE

**This IS the product.** The AI render is not a feature --- it is the
reason Cova exists. The user does not tap a Render button. After room
capture, the render is automatically triggered. The user lands inside a
photorealistic first-person walkthrough of their own room.

**Render Pipeline**

- Model: FLUX ControlNet Union Pro 2.0 via Replicate API

- Control inputs: depth map (spatial accuracy) + Canny edge map
  (structural accuracy)

- Prompt: dynamically constructed from style_blend weights ---
  higher-weighted styles contribute more prominent prompt language

- Resolution: 1024×1024 minimum

- Processing time: 15--40 seconds depending on Replicate queue

**Progress Stages (v0 UI)**

- \'Analyzing your room\...\' (0--5s)

- \'Applying your style\...\' (5--15s)

- \'Generating render\...\' (15--30s)

- \'Adding finishing touches\...\' (30--50s)

- \'Done!\' → render appears

**Render View UX**

- Full screen render image, resizeMode cover

- Single finger swipe: pan the image (simulated first-person
  look-around)

- Pinch: zoom in/out, max 2.5×

- Tap: show/hide HUD overlay (fades after 3s)

- Nothing selectable or draggable --- pure immersive experience

**Actions from Render View**

- Regenerate: new render (free V1, 2 tokens V2)

- Before/After: split slider comparing original photo vs render

- Save: saves to Camera Roll with permission prompt

- Share: iOS share sheet

- Chat: opens AI Design Assistant panel

- Shop: opens CLIP-matched product panel

**Budget Slider**

- Shown before first render: \$500 / \$1,000 / \$2,500 / \$5,000 /
  \$10,000 / No limit

- Filters CLIP-matched product results in real time

- Adjustable at any time from product panel

**Feature 7 --- AI Design Assistant**

Status: V1 \| UI Tool: v0 \| Logic Tool: Cursor \| Model: Claude Sonnet
4 Vision

- Floating gold chat bubble bottom right of render view

- Tap: chat panel slides up from bottom (60% of screen height,
  translucent backdrop)

- User taps any area of the render image to reference that location
  (coordinates passed to Claude)

- Claude context: render image (base64 vision), room dimensions and
  type, style_blend, chat history, tap coordinates, budget

- Chat messages completely free --- tokens only on Regenerate

- Chat history persists for full room session

- Claude never mentions FLUX, ControlNet, Replicate, or any technical
  rendering terms in responses

**Feature 8 --- Product Shopping & CLIP Matching**

Status: V1 \| UI Tool: v0 \| Logic Tool: Cursor \| PRIMARY V1 REVENUE

**Product Panel**

- Pull tab on left edge of render view --- always visible

- Swipe right or tap to reveal panel sliding in from left

- Each card: product photo, name, price, retailer badge, Add to Cart,
  View Similar

- Add All to Cart button at top

- Budget slider adjusts visible products in real time

**CLIP Matching Pipeline**

- Render image passed to OpenCLIP ViT-H-14 via Replicate --- produces
  1024-dim embedding

- pgvector cosine similarity search against products table HNSW index

- Results filtered by room_type, style_tags, and budget

- Top 15 matches returned per render

**Commerce**

- Checkout via affiliate-tagged URL opened in Linking.openURL or
  expo-web-browser

- Wayfair Partner Network: 5--7% commission

- Amazon Associates: 3--5% commission

- V1 catalog: 500--1,000 manually curated products

- Post-launch: Wayfair + Amazon APIs auto-grow catalog to 10,000+

**Feature 9 --- Dashboard & Home Screen**

Status: V1 \| UI Tool: v0 \| Logic Tool: Cursor

- Full-width room cards with latest render as card background

- Room name, type, and last-edited date on each card

- Tap card: navigate directly back into that room\'s render view

- \'+\' card: triggers new room creation flow

- Token balance pill top right always visible

- Suggested For You: inspiration rooms filtered by style_blend

- \'Recreate this room\' button on inspiration cards: Coming Soon in V1

- \'Use previous style?\' prompt on second room creation

**Feature 10 --- Token Economy**

Status: Infrastructure built V1 --- dormant until post-launch activation

**V1 is completely free.** Token balance shows 999 and never decrements.
The full infrastructure --- database tables, balance tracking, deduction
logic, StoreKit IAP --- is fully built but controlled by a single
tokens_enabled flag per user. One SQL statement activates the economy
for all users post-launch.

  ----------------- ----------------- ----------------- -----------------------------
  **Token Pack**    **Tokens**        **Price**         **Product ID**

  Starter           10                \$2.99            ai.cova.app.tokens.starter

  Standard          30                \$7.99            ai.cova.app.tokens.standard

  Pro               75                \$17.99           ai.cova.app.tokens.pro

  Power             200               \$39.99           ai.cova.app.tokens.power
  ----------------- ----------------- ----------------- -----------------------------

- Draft render: 2 tokens

- HD render: 3 tokens

- Chat messages: free

- Style quiz retake: free

- First render (new room): free

**Feature 11 --- Realtor Mode**

Status: V2 (built in full in Phase 8)

- Activated when user.account_type === \'realtor\'

- RealtorHomeScreen replaces HomeScreen for realtor accounts

- Virtual Staging: upload vacant room photo, generate furnished listing
  renders in multiple styles simultaneously

- QR Code Generation: each property gets a unique QR code linking to a
  public voting page

- Public Voting Page: served by a Supabase Edge Function --- open house
  guests scan QR, vote on design options

- Vote Analytics: real-time Supabase Realtime subscription on vote
  counts

- Branded Output: realtor agency logo watermarked on renders

- B2B subscription: manual onboarding during beta, Stripe in V3

**Feature 12 --- Profile & Settings**

Status: V1 \| UI Tool: v0 \| Logic Tool: Cursor

- Account: photo, name, email, change password, sign out, delete account
  (GDPR-compliant full purge)

- My Rooms: compact list of all rooms

- Render Gallery: grid of all renders, save/share/delete per render

- Style Profile: visual style blend chart, plain-English style labels,
  retake quiz

- Shopping: cart, saved products, budget preference

- Tokens: balance, transaction history, Get More Tokens (dormant V1)

- Settings: notifications, units (ft/m), appearance, privacy policy,
  terms, app version

**Privacy & Security (Non-Negotiable)**

- RLS on all Supabase tables --- enforced at database level, not
  application level

- All user photos and renders in private Supabase storage buckets

- No user data used to train any AI model

- All API keys in Supabase Edge Function secrets --- never in client
  code

- Apple Sign In private email relay supported

- App Tracking Transparency prompt on first launch

- Delete account: purges all rows across all tables + all storage files

**4. Technical Architecture**

**4.1 System Architecture Overview**

Cova is a React Native iOS app with a Supabase backend. All AI calls go
through Supabase Edge Functions --- the app never calls Replicate or
Anthropic directly. This keeps all API keys server-side and allows rate
limiting, usage tracking, and token gating in a single place.

  ----------------- ------------------------------ ---------------------------------
  **Layer**         **Technology**                 **Version / Config**

  Mobile App        React Native + Expo SDK 52     iOS only --- V1

  UI Generation     v0 (Vercel) + Cursor           v0 for visual, Cursor for RN
                    adaptation                     adaptation and wiring

  3D Engine         Three.js + React Three Fiber + 0.155.0 / 8.17.10 / 9.88.0 ---
                    Drei                           ALL PINNED

  Post-Processing   \@react-three/postprocessing   2.15.0 --- SSAO, bloom

  State Management  Zustand + immer                Latest stable

  Navigation        React Navigation 6             Bottom tabs + stack

  Backend           Supabase                       PostgreSQL 15 + pgvector + Auth +
                                                   Storage + Edge Functions

  Edge Functions    Deno (Supabase native)         TypeScript, no Node.js imports

  AI Rendering      FLUX ControlNet Union Pro 2.0  Replicate API

  Depth Estimation  Depth Anything V2              Replicate API --- server-side in
                                                   render-room Edge Function

  AI Assistant      Claude Sonnet 4 Vision         Anthropic API --- via chat-room
                                                   Edge Function

  Product           OpenCLIP ViT-H-14              Replicate API --- 1024-dim
  Embeddings                                       vectors

  Vector Search     pgvector (cosine, HNSW index)  Supabase extension

  LiDAR Scanning    Apple RoomPlan                 Cursor-generated Swift wrapper
                                                   --- 2 files dragged into Xcode

  Auth              Supabase Auth                  Apple ID + Google OAuth +
                                                   Email/Password

  Storage           Supabase Storage               4 private buckets: room-photos,
                                                   renders, swipe-cards, assets

  Payments          Apple StoreKit                 expo-in-app-purchases --- dormant
                                                   V1

  Affiliate         Wayfair Partner Network +      Affiliate-tagged URLs via
                    Amazon Associates              Linking.openURL

  Monorepo          pnpm workspaces                Root: cova, apps/mobile,
                                                   packages/shared

  Language          TypeScript strict mode         Throughout --- no \'any\'
  ----------------- ------------------------------ ---------------------------------

**4.2 Version Lock Table**

⚠ These versions are locked for the entire V1 build. Do not upgrade any
locked package without testing the full dependency chain. Any upgrade
can cause silent runtime failures in the 3D engine.

  --------------------- ------------------ ---------------------------------
  **Package**           **Locked Version** **Lock Reason**

  expo                  \~52.0.49          Stable SDK 52 --- all native
                                           modules tested at this version

  react                 18.3.1 EXACT ---   Must exactly match react-dom ---
                        no caret           any mismatch crashes at runtime

  react-dom             18.3.1 EXACT ---   Must exactly match react --- any
                        no caret           mismatch crashes at runtime

  \@react-three/fiber   8.17.10 --- no     8.18+ breaks expo-gl
                        caret              compatibility on iOS

  \@react-three/drei    9.88.0 --- no      Later versions have unresolvable
                        caret              peer dep conflicts with R3F 8.17

  three                 0.155.0 --- no     0.156+ introduces breaking
                        caret              geometry and material API changes

  node                  20.x (never 22+)   Required by Expo SDK 52 build
                                           toolchain
  --------------------- ------------------ ---------------------------------

Required pnpm overrides in root package.json to prevent hoisting of
wrong versions:

\"pnpm\": { \"overrides\": { \"react\": \"18.3.1\", \"react-dom\":
\"18.3.1\", \"three\": \"0.155.0\" } }

**4.3 Monorepo Structure**

cova/ ← monorepo root

├── apps/mobile/ ← React Native Expo app

│ ├── src/

│ │ ├── screens/ ← all screen components

│ │ ├── components/ ← reusable UI components

│ │ ├── components/3d/ ← Three.js/R3F components

│ │ ├── navigation/ ← React Navigation structure

│ │ ├── store/ ← Zustand store with all slices

│ │ ├── hooks/ ← useRender, useAuth, etc.

│ │ ├── lib/ ← supabase.ts client

│ │ ├── data/ ← furnitureCatalog.ts

│ │ └── modules/ ← RoomPlanModule.ts bridge

│ ├── modules/ ← RoomPlanModule.swift + .m

│ ├── assets/3d/furniture/ ← GLB furniture models

│ └── assets/textures/ ← PBR maps + HDRI files

├── packages/shared/src/ ← shared TypeScript types

└── supabase/ ← migrations + Edge Functions

**4.4 Edge Functions Reference**

  -------------------- ------------ ---------- -------------------------------------
  **Function**         **Method**   **Auth**   **Purpose**

  render-room          POST         Required   Start FLUX ControlNet render + handle
                                               depth estimation server-side

  get-render-status    GET          Required   Poll Replicate prediction, save
                                               completed image to storage

  clip-embed           POST         Required   Compute 1024-dim OpenCLIP embedding
                                               for a render image

  match-products       POST         Required   pgvector cosine similarity search ---
                                               find visually matching products

  chat-room            POST         Required   Claude Sonnet 4 Vision response with
                                               room context and render image

  handle-purchase      POST         Required   Verify Apple StoreKit receipt, credit
                                               tokens to user

  delete-account       POST         Required   Full GDPR deletion --- all DB rows,
                                               all storage files, auth user

  activate-realtor     POST         Required   Validate realtor activation code,
                                               upgrade account_type

  create-voting-page   POST         Required   Create QR voting page + design
                                               options for realtor property

  submit-vote          POST         Public     Record a buyer vote on a design
                                               option (no auth required)

  vote-page            GET          Public     Serve complete HTML voting page to
                                               open house guests by slug
  -------------------- ------------ ---------- -------------------------------------

**4.5 Database Schema --- All Tables**

  ---------------------- ------------------------- ---------------------------- -----------------
  **Table**              **Key Columns**           **RLS Policy**               **Purpose**

  users                  id, email, full_name,     users_select_own,            User profiles,
                         style_blend (jsonb),      users_update_own             global style
                         token_balance,                                         fingerprints,
                         tokens_enabled,                                        token state
                         account_type                                           

  rooms                  id, user_id, name,        rooms_own (all)              Room metadata per
                         room_type, style_blend,                                user
                         dimensions_json, budget,                               
                         latest_render_url                                      

  renders                id, room_id, user_id,     renders_own (all)            AI render history
                         image_url, prompt_used,                                and metadata
                         status, tokens_used,                                   
                         replicate_prediction_id                                

  furniture_placements   id, room_id,              placements_via_room          3D furniture
                         furniture_catalog_id,                                  positions per
                         position_x, position_y,                                room
                         rotation_y, scale                                      

  products               id, name, price,          products_public_read         Product catalog
                         retailer, affiliate_url,                               with CLIP
                         category, room_types\[\],                              embeddings
                         style_tags\[\],                                        
                         image_url, clip_embedding                              
                         (vector 1024)                                          

  cart_items             id, user_id, product_id,  cart_own (all)               Shopping cart per
                         quantity                                               user

  chat_messages          id, room_id, user_id,     chat_own (all)               AI chatbot
                         role, content, image_url,                              conversation
                         tap_x, tap_y                                           history

  swipe_cards            id, image_url, room_type, swipe_cards_public_read      Style quiz card
                         style_weights (jsonb),                                 metadata
                         batch_name, active                                     

  token_transactions     id, user_id, amount,      transactions_own (all)       Token
                         type, description,                                     debit/credit
                         render_id                                              ledger

  properties             id, user_id, address,     properties_own (all)         Realtor property
                         status, listing_url                                    listings

  voting_pages           id, property_id, user_id, voting_pages_public_read +   Realtor QR voting
                         title, qr_code_url,       owner                        pages
                         public_slug, active                                    

  design_options         id, voting_page_id,       design_options_public_read   Design options
                         render_id, label,                                      within a voting
                         vote_count                                             page

  votes                  id, design_option_id,     votes_public_insert,         Individual buyer
                         voter_session, created_at votes_public_read            votes ---
                                                                                anonymous by
                                                                                session
  ---------------------- ------------------------- ---------------------------- -----------------

**5. AI Stack**

**5.1 AI Model Selection Rationale**

  ---------------- --------------- --------------- ------------------------------
  **AI Layer**     **Model**       **Provider**    **Why This Model**

  Photorealistic   FLUX ControlNet Replicate API   Best spatial control via
  Rendering        Union Pro 2.0                   dual-input ControlNet (depth +
                                                   Canny). Output quality closest
                                                   to professional staging
                                                   photography among all tested
                                                   models. Outperforms SDXL,
                                                   Midjourney v6, and DALL-E 3
                                                   for interior rendering with
                                                   spatial constraints.

  Depth Estimation Depth Anything  Replicate API   State-of-the-art monocular
                   V2                              depth from single image.
                                                   Outperforms MiDaS and ZoeDepth
                                                   on indoor scenes. Runs
                                                   server-side in render-room
                                                   Edge Function --- no
                                                   client-side processing.

  Design Assistant Claude Sonnet 4 Anthropic API   Best vision + reasoning
                   Vision                          combination for interior
                                                   design context. Understands
                                                   spatial references (tap
                                                   coordinates), room
                                                   proportions, style
                                                   descriptions, and budget
                                                   constraints simultaneously.
                                                   Superior to GPT-4V for
                                                   conversational design advice.

  Product Matching OpenCLIP        Replicate API   1024-dimensional visual
                   ViT-H-14                        embeddings. Best open-source
                                                   CLIP variant for furniture and
                                                   decor visual similarity.
                                                   Combined with pgvector HNSW
                                                   cosine search enables
                                                   sub-100ms product matching at
                                                   10,000+ product scale.

  Room             Claude Haiku    Anthropic API   Fast, cheap room type
  Classification   Vision                          identification from photo.
                                                   Used to validate user-selected
                                                   room type. Haiku sufficient
                                                   for this simple classification
                                                   task.

  Quiz Card        FLUX Schnell    Replicate API   Fastest FLUX variant for batch
  Generation                                       image generation. Used in
                                                   one-time pre-launch script to
                                                   generate 875 swipe card
                                                   images. Not used at runtime.

  3D Room Engine   Three.js        npm             Industry standard for
                   r0.155.0 +      (client-side)   web/mobile 3D. R3F provides
                   R3F + Drei                      React declarative wrapper.
                                                   SSAO, HDRI, PBR textures all
                                                   supported at this version.
  ---------------- --------------- --------------- ------------------------------

**5.2 AI Cost Model**

  ---------------- ------------------ ----------------- -----------------------
  **Operation**    **Model**          **Estimated       **Frequency**
                                      Cost**            

  Render           FLUX ControlNet    \$0.05--\$0.10    Per user regeneration
  generation       Union Pro 2.0                        

  Depth estimation Depth Anything V2  \$0.01--\$0.02    Per room capture

  CLIP embedding   OpenCLIP ViT-H-14  \$0.005--\$0.01   Per completed render

  Product search   pgvector query     \< \$0.001        Per render (DB compute
                                                        only)

  Chat message     Claude Sonnet 4    \$0.01--\$0.05    Per chat session
                   Vision                               

  Room             Claude Haiku       \< \$0.001        Per room capture
  classification   Vision                               

  Quiz card        FLUX Schnell       \$0.002/card ×    One-time batch:
  generation                          875               \~\$1.75 total
  ---------------- ------------------ ----------------- -----------------------

Estimated total AI cost per new user onboarding (first room, first
render, first chat): approximately \$0.15--\$0.25. This is covered many
times over by a single affiliate purchase (average commission \$15--45
on typical furniture purchases).

**6. Business Model**

**6.1 Revenue Streams**

**Stream 1 --- Affiliate Commerce (Primary V1 Revenue)**

Every product in the render is linked to a real retailer via an
affiliate URL. When a user completes a purchase on the retailer\'s site,
Cova earns a commission. Zero friction for the user --- they browse,
tap, and buy. Cova earns without charging the user.

  -------------- ---------------- ---------------- -----------------------------
  **Retailer**   **Program**      **Commission**   **Integration**

  Wayfair        Wayfair Partner  5--7%            Partner Network API
                 Network                           post-launch + manual V1

  Amazon         Amazon           3--5%            Amazon PA-API post-launch +
                 Associates                        manual V1

  IKEA           Rakuten/CJ       3--5%            Manual affiliate links V1
                 affiliate                         

  CB2 / Crate &  Direct agreement 5--8%            Manual affiliate links V1
  Barrel                                           

  Article        Direct agreement 5--8%            Manual affiliate links V1

  West Elm       Direct agreement 5--8%            Manual affiliate links V1

  Pottery Barn   Direct agreement 5--8%            Manual affiliate links V1
  -------------- ---------------- ---------------- -----------------------------

**Stream 2 --- Token Economy (Post-Launch)**

Full token infrastructure built in V1 but dormant. Activates with a
single SQL statement. Draft renders cost 2 tokens, HD renders cost 3
tokens. Token packs sold via Apple StoreKit IAP.

  ----------- ------------ ----------- ---------------- ---------------------------
  **Pack**    **Tokens**   **Price**   **Cost/Token**   **Gross Margin vs \$0.08
                                                        Render Cost**

  Starter     10           \$2.99      \$0.299          \~73%

  Standard    30           \$7.99      \$0.266          \~70% (after Apple 30% cut)

  Pro         75           \$17.99     \$0.240          \~67%

  Power       200          \$39.99     \$0.200          \~60%
  ----------- ------------ ----------- ---------------- ---------------------------

**Stream 3 --- Realtor Subscription (V2)**

Monthly B2B subscription for real estate professionals. Unlimited
renders, virtual staging, QR voting, branded output. Manual onboarding
during beta. Stripe integration in V3. Pricing TBD at V2 planning
(\$49/month or \$399/year proposed).

**6.2 Unit Economics at Scale**

  ------------------------ ------------------ ------------- -------------------
  **Metric**               **Conservative**   **Target**    **Optimistic**

  Monthly active users     5,000              15,000        40,000
  (MAU) at 6 months                                         

  Renders per active user  2                  4             8
  per month                                                 

  Affiliate conversion     1%                 3%            6%
  rate (views → purchase)                                   

  Average affiliate order  \$150              \$300         \$600
  value                                                     

  Average affiliate        \$7.50             \$15          \$30
  commission (5%)                                           

  Monthly affiliate        \$11,250           \$67,500      \$480,000
  revenue at target MAU                                     

  Token revenue            \$1,500            \$9,000       \$36,000
  (post-activation, 10% of                                  
  MAU paying)                                               

  Total monthly revenue    \$12,750           \$76,500      \$516,000
  (6-month target)                                          
  ------------------------ ------------------ ------------- -------------------

**6.3 Competitive Moat**

Cova\'s defensibility comes from four compounding advantages:

8.  Data flywheel: every swipe in the style quiz improves the
    algorithm\'s understanding of what visual patterns correspond to
    which purchasing behaviour. This data is proprietary and grows with
    every user.

9.  Style fingerprint: the mathematical style_blend object per user
    becomes more accurate over time as users interact with more rooms.
    This creates switching costs --- a user\'s style profile on Cova has
    value that cannot be easily transferred to a competitor.

10. CLIP product matching: as the product catalog grows to 10,000+ items
    and accumulates real purchase data, the matching engine improves.
    Products with high purchase-to-view ratios get boosted. This is a
    dataset no new entrant can replicate quickly.

11. Retailer relationships: affiliate agreements, especially direct ones
    with CB2, Article, and West Elm, create exclusive or preferential
    terms over time that are difficult for a new competitor to match.

**7. Build Tool Strategy**

**7.1 The Three-Tool Stack**

Cova is built using three AI-powered tools, each responsible for a
distinct layer of the product:

  ----------- --------------------- ------------------ ---------------------
  **Tool**    **What It Does**      **What It Cannot   **Screens /
                                    Do**               Components**

  v0 (Vercel) Generates             Does not           Every user-facing
              pixel-perfect React   understand React   screen except
              UI components from    Native ---         RoomViewer3DScreen.
              natural language      generates web      All reusable UI
              descriptions. Trained React with         components: cards,
              on thousands of       Tailwind. Cannot   buttons, inputs,
              production UI         generate 3D        panels, modals.
              patterns. Produces    scenes. Cannot     
              components with       write Supabase     
              excellent default     queries or Zustand 
              styling, animations,  state.             
              and interaction                          
              states.                                  

  Cursor (AI  Writes logic-heavy    Produces mediocre  3D engine
  IDE)        code from detailed    visual styling     (Three.js/R3F),
              natural language      without v0         Supabase migrations,
              prompts. Understands  foundation. Should all 11 Edge
              the full project      not be asked to    Functions, Zustand
              context via           design screens     store, navigation,
              .cursorrules and file from scratch.      RoomPlan Swift
              indexing. Adapts v0                      module, wiring v0
              output to React                          components to data.
              Native. Writes Edge                      
              Functions in Deno.                       

  Supabase    Provides PostgreSQL,  Supabase is a      All database
  (Backend)   pgvector, Auth,       platform not a     operations, storage,
              Storage, and Edge     coding tool ---    auth, and server-side
              Function hosting with but the SQL Editor AI orchestration.
              zero infrastructure   and Edge Function  
              management.           deploy CLI are     
                                    used throughout    
                                    the build.         
  ----------- --------------------- ------------------ ---------------------

**7.2 v0 Workflow in Detail**

v0 (v0.dev) is Vercel\'s AI UI generation product. It accepts a text
prompt and produces a complete React component with styling. Here is the
exact workflow for each screen:

12. Open v0.dev. Write a detailed prompt for the screen. Include: exact
    layout description, component hierarchy, colours (#1B3A2D, #C47B3C,
    #F5F0E8), animation behaviour, interaction states, all text content,
    and any specific reference to Tinder-style or iOS-native patterns.

13. v0 generates the component. Preview it in the v0 interface. Iterate
    with follow-up prompts if the layout needs adjusting.

14. Copy the generated component code from v0.

15. Paste into Cursor. Tell Cursor: \'This component was generated by v0
    for web. Adapt it for React Native Expo: convert all HTML elements
    to RN equivalents (View, Text, Image, ScrollView, TouchableOpacity,
    FlatList), convert all CSS/Tailwind to StyleSheet.create(), replace
    Tailwind colour classes with explicit hex values, add proper
    TypeScript types, and wire up \[specific state/navigation/data
    sources\].\'

16. Cursor adapts the component and wires it to live data.

17. Test on physical iPhone via Expo Dev Client.

**7.3 v0 Prompt Templates by Screen Type**

**Template: Tinder-Style Card Screen**

v0 PROMPT TEMPLATE --- Tinder Card Screen: Create a mobile-first React
component for a style discovery quiz screen. The entire background is
#1B3A2D (dark forest green). In the center of the screen, show a stack
of 3 cards. The top card is full size and fully opaque. The second card
is visible slightly behind (scale 0.95, translateY -8px). The third card
is barely visible (scale 0.90, translateY -16px). This creates a
satisfying deck-of-cards depth effect. The top card is a full-bleed
image card with rounded corners (borderRadius 20px). No text labels on
the cards. Just the image. As the user drags the top card: - It rotates
slightly in the drag direction (max ±15 degrees) - A \'LOVE\' badge
(green rounded pill with a heart, bottom-left of the card) fades in when
dragged right - A \'PASS\' badge (grey rounded pill with an X,
bottom-right) fades in when dragged left Below the card stack, show a
single \'Neutral\' button --- outlined pill button, white text, no fill
background. Centred. At the very bottom, show a thin progress bar in
cream (#F5F0E8) showing quiz progress. At the top of the screen: a thin
progress indicator row with the current step. Colours: background
#1B3A2D, accents #C47B3C, text white. No other colours.

**Template: Dashboard with Cards**

v0 PROMPT TEMPLATE --- Room Dashboard: Create a mobile home screen
dashboard. Light warm cream background (#F5F0E8). Header: dark forest
green (#1B3A2D) top bar, \'cova\' wordmark left-aligned in copper gold
(#C47B3C, weight 300), a pill-shaped token balance badge right-aligned
(dark green background, gold coin icon + number). Main content is a
vertical scroll. First section: \'My Rooms\'. Horizontal scrolling row
of large room cards. Each card is full-width minus 48px horizontal
padding, portrait aspect ratio. The card is a full-bleed image (latest
render as background). Gradient overlay at bottom (transparent →
rgba(0,0,0,0.7)). Room name bottom-left in white bold 20px. Room type
badge bottom-right (small pill, dark green, cream text). The last card
in the row is a dashed border card with a centred \'+\' icon and \'New
Room\' text in dark green. Second section below: \'Suggested For You\'
with a subtitle \'Based on your style\'. Vertical list of full-width
image cards, height 200px each. Each has a style match badge top-right.
Overall aesthetic: premium mobile app, iOS-native feel, warm and
inviting.

**7.4 Phase-by-Phase Tool Assignment**

  --------------- --------------------- ------------- ----------------------------
  **Phase**       **Primary Tool**      **Secondary   **What Changes vs Previous
                                        Tool**        Guides**

  Phase 0:        Manual (terminal)     ---           No change
  Environment                                         
  Setup                                               

  Phase 1:        Cursor                ---           No change
  Monorepo                                            
  Scaffold                                            

  Phase 2:        Cursor                ---           No change
  Supabase                                            
  Backend                                             

  Phase 2.5: 3D   Manual (download)     Cursor        No change
  Assets                                (catalog TS)  

  Phase 3: Expo   Cursor                ---           No change
  App Foundation                                      

  Phase 4: 3D     Cursor only           ---           No change --- 3D cannot use
  Room Engine                                         v0

  Phase 5: AI     Cursor (logic)        ---           No change --- pipeline logic
  Render Pipeline                                     not visual

  Phase 6:        v0 (visual) + Cursor  ---           CHANGED --- every screen now
  Complete UI     (wiring)                            has v0 prompt first, then
  Screens                                             Cursor wiring prompt

  Phase 7: Token  v0                    ---           CHANGED --- TokenShopScreen
  Economy UI      (TokenShopScreen) +                 visual from v0
                  Cursor (StoreKit)                   

  Phase 8:        v0 (screens) + Cursor ---           CHANGED --- realtor screens
  Realtor Mode UI (logic)                             visual from v0

  Phase 9: App    Manual                ---           No change
  Store                                               
  Submission                                          
  --------------- --------------------- ------------- ----------------------------

**8. V1 vs V2 Feature Roadmap**

**8.1 V1 --- App Store Launch**

  ---------------------- ---------------- --------------------- ---------------------------
  **Feature**            **V1 Status**    **UI Tool**           **Notes**

  Splash & Onboarding    Complete         v0 + Cursor           Full flow, auth routing,
                                                                room type selection

  Auth                   Complete         v0 + Cursor           All three providers via
  (Apple/Google/Email)                                          Supabase Auth

  Style Fingerprint Quiz Complete         v0 (PRIMARY) + Cursor Tinder card stack, adaptive
                                                                algorithm, termination
                                                                logic

  Room Capture ---       Complete         v0 + Cursor           Camera, upload, 4-corner
  Photo/Library                                                 calibration, server-side
                                                                depth map

  Room Capture ---       Complete         Cursor only           Cursor-generated Swift
  RoomPlan                                                      wrapper dragged into Xcode

  3D Room Viewer         Complete         Cursor only           PBR, HDRI, SSAO, full
                                                                furniture interaction

  AI Render (FLUX        Complete         v0 (HUD) + Cursor     Auto-triggered,
  ControlNet)                             (pipeline)            first-person walkthrough

  AI Chatbot (Claude     Complete         v0 (panel) + Cursor   Tap-to-reference, session
  Vision)                                 (API)                 history, free

  Product Shopping       Complete         v0 (panel) + Cursor   Visual matching, affiliate
  (CLIP)                                  (CLIP)                checkout, budget slider

  Dashboard & HomeScreen Complete         v0 + Cursor           Room cards, new room flow,
                                                                Suggested For You

  ShopScreen             Complete         v0 + Cursor           Cart, saved, affiliate
                                                                checkout

  ProfileScreen          Complete         v0 + Cursor           All sections, style blend
                                                                viz, delete account

  Token Economy          Infrastructure   v0                    Activates post-launch via
                         built, dormant   (TokenShopScreen) +   SQL
                                          Cursor                

  Realtor Mode           Built in full    v0 + Cursor           Full realtor dashboard,
                         (Phase 8)                              virtual staging, QR voting

  Discover Tab           Placeholder      v0                    Coming Soon --- V2
                         visible                                marketplace

  Swipe Card Generation  One-time         Cursor                875 cards pre-generated via
  Script                 pre-launch                             FLUX Schnell

  Product Catalog        Pre-launch       Cursor (script)       500--1,000 products
  Seeding                                                       manually curated
  ---------------------- ---------------- --------------------- ---------------------------

**8.2 V2 Features**

  --------------- --------------------- -------------- -------------------------
  **Feature**     **Description**       **Priority**   **Revenue Impact**

  Android App     React Native is       High           2× addressable market
                  already                              
                  cross-platform.                      
                  RoomPlan replaced by                 
                  ARCore depth API.                    

  Discover Tab    Community feed of     High           Engagement + retention
                  user-submitted rooms,                driver
                  browse and recreate                  
                  with permission.                     

  Style Switching Tap a style chip to   High           More renders per session
  in Render       regenerate in a new                  → more token revenue
                  style, same room                     
                  geometry.                            

  Recreate        Apply another user\'s Medium         Viral feature --- social
  Inspiration     style fingerprint to                 sharing driver
  Room            your own room scan.                  

  AI Chatbot      Chat detects design   Medium         More renders per session
  Auto-Regen      change requests and                  → more token revenue
                  auto-triggers render.                

  Retailer API    Wayfair + Amazon APIs High           Direct affiliate revenue
  Auto-Sync       auto-grow catalog to                 increase
                  10,000+ products                     
                  nightly.                             

  Social Sharing  Branded before/after  Medium         Organic acquisition
  Cards           cards for Instagram                  channel
                  Stories and TikTok.                  

  Web App         Browser version for   Medium         New user segment (desktop
                  desktop users. Same                  designers)
                  Supabase backend.                    

  Weighted Chat   Token cost            Low            Token economy
  Tokens          proportional to                      optimisation
                  Claude input                         
                  complexity.                          

  Multi-Room      Connect rooms into a  Low            Engagement depth
  Design          home project with                    
                  shared style.                        

  Stripe Payment  Web-based IAP for     High (for      Unlocks realtor recurring
  Web             non-iOS users and     realtor)       revenue
                  realtor                              
                  subscriptions.                       
  --------------- --------------------- -------------- -------------------------

**9. Competitive Analysis**

**9.1 Competitor Matrix**

  ---------------- ----------------- ---------------------- ---------------------------
  **Competitor**   **Strength**      **Weakness**           **Cova\'s Advantage**

  IKEA Kreativ     Accurate room     IKEA-only catalog, no  Multi-retailer catalog,
                   scanning, real    style personalisation  adaptive style learning
                   IKEA products,    quiz, no AI style      without vocabulary, FLUX
                   free, strong      learning, no           render quality vs IKEA\'s
                   brand trust       third-party retailers  basic 3D

  Houzz            Enormous product  No AI render, no room  AI render, spatial
                   catalog (9M+      geometry capture,      accuracy, consumer-grade
                   products),        overwhelming interface simplicity, swipe-based
                   professional      for consumers, no      style discovery
                   design community, style quiz             
                   strong SEO                               

  RoomGPT /        Fast and cheap,   No real room geometry  Real room dimensions, FLUX
  Decoratly /      wide awareness,   (generic templates),   ControlNet quality, CLIP
  Reimagine        simple UX         flat 2D style          product matching, adaptive
                                     transfer, no product   style quiz
                                     commerce, no style     
                                     learning               

  Planner 5D       Strong 3D floor   Complex UX (designed   Consumer simplicity,
                   plan tools, large for                    photorealistic AI render,
                   user base,        semi-professionals),   silent style learning,
                   desktop + mobile  no photorealistic      commerce integration
                                     render, no style quiz, 
                                     no CLIP matching       

  Interior AI      Better render     Photo upload only (no  Full scan-to-shop pipeline,
                   quality than most room capture), no      Claude chatbot, style
                   consumer tools,   commerce integration,  learning, CLIP product
                   growing user base no style fingerprint,  matching
                                     static experience      

  Pinterest /      Massive content   Zero path from         Your actual room, your
  Instagram        library,          inspiration to         actual purchasable
                   extremely high    purchase, no           products, your actual style
                   engagement,       room-specific          fingerprint
                   powerful visual   visualisation, no      
                   discovery         personalised 3D        

  Archi AI         Quick             No room geometry       Consumer-first UX, swipe
                   architectural     capture, limited style style learning, CLIP
                   visualisations,   options, no product    commerce
                   multiple room     commerce, targeted at  
                   types             architects             

  AI Room Planner  Adobe brand       Requires design        Zero design knowledge
  (Adobe)          trust,            knowledge, no          required, mobile-native,
                   integration with  consumer-grade         complete consumer pipeline
                   Creative Cloud    simplicity, no style   
                                     quiz, no mobile-first  
  ---------------- ----------------- ---------------------- ---------------------------

**9.2 Positioning Statement**

**Cova\'s position:** For homeowners and renters who want to redesign
their space but don\'t know where to start, Cova is the AI interior
design app that learns your style through swipes, renders your actual
room, and sells you every product in the render. Unlike RoomGPT which
produces generic flat images, or Houzz which requires design vocabulary
and offers no render, Cova delivers the complete journey from \'I want a
new look\' to \'here\'s what to buy\' in a single session.

**10. Golden Rules**

These rules are absolute. They apply to every prompt in v0, every prompt
in Cursor, every Edge Function, every UI decision:

18. Never show style names to users in the quiz, render view, product
    panel, or chat. Japandi, Coastal, Bohemian --- internal labels only.
    Profile screen may use plain-English equivalents.

19. Never change version-locked packages. expo (\~52.0.49), react
    (18.3.1), react-dom (18.3.1), \@react-three/fiber (8.17.10),
    \@react-three/drei (9.88.0), three (0.155.0). See Section 4.2.

20. Never use OrbitControls. It crashes expo-gl. Only the custom
    PanResponder CameraController is permitted in the 3D viewer.

21. Never allow white space outside the room in the 3D viewer or render
    view. Camera always clamped inside room. Canvas background always
    matches ceiling colour.

22. Never store API keys in client code. Only EXPO_PUBLIC_SUPABASE_URL
    and EXPO_PUBLIC_SUPABASE_ANON_KEY in the client .env. All other keys
    in Supabase Edge Function secrets.

23. Never skip RLS. Row Level Security must be enabled and policy
    verified on every Supabase table before any data is written to it.

24. Never charge tokens in V1. tokens_enabled = false for all users.
    Balance shows 999, never decrements. Token economy activates
    post-launch via SQL.

25. Always use v0 first for screen UI. Never ask Cursor to design a
    screen\'s visual layout from scratch. v0 produces higher quality UI.
    Cursor adapts and wires.

26. Always test on a physical iPhone after every phase. The iOS
    simulator does not accurately represent expo-gl, RoomPlan, camera,
    or gesture behaviour.

27. Always provide a pre-seeded demo account for App Store review.
    Reviewers cannot take real room photos. Pre-populate rooms and
    renders for the testreviewer@cova.ai account.

28. Never use useEffect for data fetching. All data operations go
    through Zustand store actions. Components subscribe to store state.

29. Always handle all three states in every UI component: loading
    (skeleton or spinner), error (message + retry), empty
    (illustration + CTA). No component should ever be in an unhandled
    state.

**11. Launch Plan**

**11.1 Pre-Launch Checklist**

**Technical**

- All 9 phases complete and validation checklists passing

- Production EAS build submitted to TestFlight

- 5-day minimum TestFlight beta with external testers

- All API keys verified as server-side only

- RLS verified on all tables

- Delete account flow verified (GDPR)

- App Tracking Transparency implemented and tested

- Swipe card generation script run: 875 cards in DB

- Product catalog seeded: minimum 500 products with CLIP embeddings

- Demo account pre-seeded for App Review

**App Store**

- Screenshots uploaded for 6.7in, 6.5in, 5.5in device sizes

- App preview video (30 seconds) uploaded

- All metadata complete: description, keywords, category, age rating

- All 4 IAP products submitted to App Store Connect

- Privacy policy and Terms of Service live at public URLs

- Apple Sign In is first button on AuthScreen

- Restore Purchases button visible in TokenShopScreen

**Business**

- Wayfair Partner Network affiliate application approved

- Amazon Associates application approved

- Privacy policy updated to disclose Replicate and Anthropic data
  processing

- Support email address configured (support@cova.ai or
  hellocova@gmail.com)

**11.2 Day One Monitoring**

  ------------------ ---------------------- -----------------------------
  **Metric to        **Where to Check**     **Alert Threshold**
  Monitor**                                 

  Render failure     Supabase → renders     \> 10% failure rate →
  rate               table: SELECT status,  investigate Replicate API
                     COUNT(\*) FROM renders 
                     GROUP BY status        

  Edge Function      Supabase Dashboard →   Any 500 errors in production
  errors             Edge Functions → Logs  

  New user signups   Supabase → users       Monitor for sign-in errors
                     table: SELECT          
                     COUNT(\*) FROM users   
                     WHERE created_at \>    
                     NOW()-INTERVAL \'1     
                     day\'                  

  Render completion  Replicate dashboard →  Average \> 45s → check queue
  time               Predictions            depth

  Storage growth     Supabase → Storage →   Alert if approaching plan
                     Usage                  limits

  Affiliate clicks   Wayfair + Amazon       Track CTR from product panel
                     affiliate dashboards   

  App Store reviews  App Store Connect →    Any 1-star reviews in first
                     Ratings and Reviews    48 hours
  ------------------ ---------------------- -----------------------------

**11.3 Token Economy Activation Decision**

The token economy activates when Cova reaches a validated product-market
fit threshold. Suggested activation criteria:

- 500+ monthly active users with at least 3 sessions each

- Average render completion rate \>= 90% (reliable pipeline)

- Average of 2+ regenerations per room (users value the render enough to
  regenerate)

- D7 retention \>= 20% (users returning after one week)

- App Store rating \>= 4.2 stars

When all five criteria are met, activation requires one SQL statement
and zero code changes.

**12. Appendix --- Accounts & Credentials Reference**

  ---------------- ------------------ -----------------------------------
  **Service**      **Purpose**        **Credentials Location**

  Apple Developer  iOS distribution,  developer.apple.com --- Team ID in
  Program          Apple Sign In, App Xcode Signing
                   Store              

  Supabase         Backend platform   Project URL + keys in
                                      apps/mobile/.env and Edge Function
                                      secrets

  Replicate        FLUX, Depth        API token in Supabase Edge Function
                   Anything, OpenCLIP secrets as REPLICATE_API_TOKEN

  Anthropic        Claude Sonnet 4    API key in Supabase Edge Function
                   Vision chatbot     secrets as ANTHROPIC_API_KEY

  Google Cloud     Google OAuth 2.0   Client ID in Supabase Auth
  Console                             settings + app.json

  Wayfair Partner  Affiliate commerce Affiliate tag in product
  Network                             affiliate_url column

  Amazon           Affiliate commerce Affiliate tag (cova-20 or similar)
  Associates                          in product affiliate_url column

  App Store        App Store          Apple ID at
  Connect          management, IAP,   appstoreconnect.apple.com
                   TestFlight         

  EAS (Expo)       Cloud iOS builds   Configured via eas.json + eas login

  v0.dev           UI component       Vercel account at v0.dev
                   generation         
  ---------------- ------------------ -----------------------------------

**13. Appendix --- Environment Variables**

  ------------------------------- ------------------ ---------------- -----------------------
  **Variable**                    **File /           **Visibility**   **Source**
                                  Location**                          

  EXPO_PUBLIC_SUPABASE_URL        apps/mobile/.env   Client-safe (RLS Supabase → Settings →
                                                     protects data)   API → Project URL

  EXPO_PUBLIC_SUPABASE_ANON_KEY   apps/mobile/.env   Client-safe (RLS Supabase → Settings →
                                                     protects data)   API → anon/public key

  SUPABASE_SERVICE_ROLE_KEY       Supabase Edge      Server only ---  Supabase → Settings →
                                  Function secrets   NEVER in client  API → service_role key
                                  ONLY                                

  REPLICATE_API_TOKEN             Supabase Edge      Server only      replicate.com → Account
                                  Function secrets                    → API Tokens
                                  ONLY                                

  ANTHROPIC_API_KEY               Supabase Edge      Server only      console.anthropic.com →
                                  Function secrets                    API Keys
                                  ONLY                                

  APPLE_SHARED_SECRET             Supabase Edge      Server only      App Store Connect → App
                                  Function secrets                    Information → Shared
                                  ONLY                                Secret
  ------------------------------- ------------------ ---------------- -----------------------

Document Version 2.0 \| Cova Master Strategy \| Updated with v0 UI
strategy \| Pranav Goel & Daksh Parikh \| hellocova@gmail.com
