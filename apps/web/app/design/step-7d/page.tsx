"use client";

/**
 * Screen D — Tabbed chatbot.
 *
 * Four tabs share a single chat UI and a single /api/design-chat
 * endpoint. Each tab keeps its own message history, starter chips,
 * and completion status. The "Design My Room" CTA unlocks when
 * the All tab is complete AND at least one other tab is complete.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { flowLog } from "@/lib/debug/flow-logger";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { useArea2Store } from "@/lib/stores/area2Store";
import { persistRenderContext } from "@/lib/ai/renderContext/persist";
import { useRoomStore } from "@/lib/store/room";
import type {
  TabId,
  TechSpec,
  SensoryProfile,
  ArtBrief,
  IdentityBrief,
  RequestedProduct,
} from "@/lib/types/area2";

// ─── Tab labels + starters ────────────────────────────────────────────────────

type ChatTabId = "all" | "products" | "tech" | "art";

const TABS: { id: ChatTabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "products", label: "Products" },
  { id: "tech", label: "Tech" },
  { id: "art", label: "Art" },
];

const STARTERS: Record<ChatTabId, string[]> = {
  all: [
    "Let me tell you about my vibe",
    "Make it feel like a boutique hotel",
    "I want it cozy and warm",
  ],
  products: [
    "I have a specific sofa in mind",
    "Nothing specific, let the AI decide",
    "Let me paste a link",
  ],
  tech: [
    "I definitely want a TV",
    "Keep it minimal, no TV",
    "I'm into audio — suggest something",
  ],
  art: [
    "I want something related to a specific artist",
    "Show me some directions and I'll pick",
    "I'll upload a picture I love",
  ],
};

// Per-tab suggestion chips — shown above chat input, disappear after first message
const SUGGESTION_CHIPS: Record<ChatTabId, string[]> = {
  all: [
    "Make it feel more luxurious",
    "Keep it minimal and calm",
    "I want it to feel like a boutique hotel",
    "Make it cozy and warm",
    "Bold and maximalist",
    "Clean and Scandinavian-inspired",
  ],
  products: [
    "I want a sectional sofa",
    "Add a statement coffee table",
    "I love velvet accent chairs",
    "I need a large area rug",
    "Add open shelving",
    "I want linen curtains",
  ],
  tech: [
    'Add a 65" wall-mounted TV',
    "I want a Sonos soundbar",
    "Hidden cable management",
    "Smart lighting with scenes",
    "Wireless charging surfaces",
    "Projector instead of TV",
  ],
  art: [
    "Gallery wall with mixed frames",
    "One large statement piece",
    "Black and white photography",
    "Abstract colorful prints",
    "Botanical illustration prints",
    "Framed vintage maps",
  ],
};

const URL_RE = /https?:\/\/[^\s]+/i;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
}

type TabMessages = Record<ChatTabId, Message[]>;

// ─── Typing indicator component ───────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex gap-[6px] items-center p-3 px-4">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
          className="w-[7px] h-[7px] rounded-full bg-cova-gold"
        />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface InlineArt {
  messageIndex: number;
  urls: string[];
  selectedUrl?: string;
}

const EMPTY_TAB_MESSAGES: TabMessages = {
  all: [],
  products: [],
  tech: [],
  art: [],
};

export default function Step7DPage() {
  const router = useRouter();
  useEffect(() => { flowLog("page:mount", { page: "step-7d" }); }, []);
  const {
    roomId,
    tabStates,
    minimumThresholdMet,
    appendTabMessage,
    updateTabExtractedData,
    markTabComplete,
    setArtBrief,
    assembleRenderContext,
  } = useArea2Store();

  const setRoomContext = useArea2Store((s) => s.setRoomContext);
  const setKeepMask = useArea2Store((s) => s.setKeepMask);
  const setBudget = useArea2Store((s) => s.setBudget);
  const existingRoomContext = useArea2Store((s) => s.roomContext);
  const roomStoreId = useRoomStore((s) => s.roomId);
  const effectiveRoomId = roomId ?? roomStoreId;

  // Active tab — ephemeral UI state, not Zustand
  const [activeTab, setActiveTab] = useState<ChatTabId>("all");

  // Per-tab message history — component state, persisted to Supabase
  const [tabMessages, setTabMessages] = useState<TabMessages>({
    ...EMPTY_TAB_MESSAGES,
  });

  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [ctaError, setCtaError] = useState<string | null>(null);
  const [inlineArt, setInlineArt] = useState<Record<string, InlineArt[]>>({});
  const [artPolling, setArtPolling] = useState<{
    roomId: string;
    tabKey: ChatTabId;
    messageIndex: number;
  } | null>(null);
  const [pendingImage, setPendingImage] = useState<{
    base64: string;
    contentHash: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setHydrated(true), []);

  // Load roomContext, keepMask, and budget from Supabase into Area2Store if missing.
  useEffect(() => {
    if (existingRoomContext || !effectiveRoomId) return;
    const loadFromSupabase = async () => {
      const supabase = createBrowserClient();
      const { data: room } = await supabase
        .from("rooms")
        .select("room_context, keep_mask, render_context")
        .eq("id", effectiveRoomId)
        .single();
      if (room?.room_context) {
        setRoomContext(
          room.room_context as Parameters<typeof setRoomContext>[0],
        );
      }
      if (room?.keep_mask) {
        setKeepMask(room.keep_mask as Parameters<typeof setKeepMask>[0]);
      }
      // Rehydrate budget from render_context if the store's budget is null
      const currentBudget = useArea2Store.getState().budget;
      if (!currentBudget && room?.render_context) {
        const rc = room.render_context as {
          budget?: {
            rangeMin?: number;
            rangeMax?: number;
            strategy?: string;
            hardCeiling?: boolean;
            tier?: string;
          };
        };
        if (
          rc.budget &&
          typeof rc.budget.rangeMin === "number" &&
          typeof rc.budget.rangeMax === "number"
        ) {
          setBudget({
            rangeMin: rc.budget.rangeMin,
            rangeMax: rc.budget.rangeMax,
            strategy:
              (rc.budget.strategy as "even-quality") ?? "even-quality",
            hardCeiling: rc.budget.hardCeiling ?? false,
            ...(rc.budget.tier
              ? {
                  tier: rc.budget.tier as
                    | "essential"
                    | "elevated"
                    | "refined"
                    | "prestige"
                    | "signature",
                }
              : {}),
          });
        }
      }
    };
    loadFromSupabase().catch((e) =>
      console.warn("[step-7d] Failed to load room context:", e),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRoomId, existingRoomContext]);

  // Load design_chat_history from Supabase on mount
  useEffect(() => {
    if (!effectiveRoomId) return;
    const loadChatHistory = async () => {
      const supabase = createBrowserClient();
      const { data: room } = await supabase
        .from("rooms")
        .select("design_chat_history")
        .eq("id", effectiveRoomId)
        .single();
      if (
        room?.design_chat_history &&
        typeof room.design_chat_history === "object"
      ) {
        const loaded = room.design_chat_history as Partial<TabMessages>;
        const restored: TabMessages = {
          all: loaded.all ?? [],
          products: loaded.products ?? [],
          tech: loaded.tech ?? [],
          art: loaded.art ?? [],
        };
        setTabMessages(restored);
        // Also populate Zustand tabStates so API calls have history
        for (const tabId of ["all", "products", "tech", "art"] as ChatTabId[]) {
          for (const msg of restored[tabId]) {
            appendTabMessage(tabId as TabId, msg.role, msg.content);
          }
        }
      }
    };
    loadChatHistory().catch((e) =>
      console.warn("[step-7d] Failed to load chat history:", e),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRoomId]);

  // Save tabMessages to Supabase
  const persistChatHistory = useCallback(
    async (messages: TabMessages) => {
      if (!effectiveRoomId) return;
      const supabase = createBrowserClient();
      await supabase
        .from("rooms")
        .update({ design_chat_history: messages })
        .eq("id", effectiveRoomId)
        .then(({ error }) => {
          if (error)
            console.warn("[step-7d] Failed to persist chat history:", error);
        });
    },
    [effectiveRoomId],
  );

  // Poll for art generation results.
  useEffect(() => {
    if (!artPolling) return;
    const { roomId: pollingRoomId, tabKey, messageIndex } = artPolling;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/generate-art?roomId=${pollingRoomId}`);
        if (!res.ok) return;
        const data = (await res.json()) as { status: string; urls: string[] };
        if (data.status === "complete" && data.urls.length > 0) {
          setInlineArt((prev) => ({
            ...prev,
            [tabKey]: (prev[tabKey] ?? []).map((b) =>
              b.messageIndex === messageIndex ? { ...b, urls: data.urls } : b,
            ),
          }));
          const current = useArea2Store.getState().artBrief;
          setArtBrief({
            hasArtDirection: true,
            visualDirection: current?.visualDirection ?? "",
            colorPalette: [],
            mood: "",
            abstractionLevel: "semi-abstract",
            subjectMatter: "",
            frameStyle: "gallery-wrap",
            placement: "ai-decides",
            galleryWall: false,
            generatedOptions: data.urls,
            includesPersonalPhotos: false,
            hasBookCollection: false,
            hasVinylCollection: false,
            copyrightSafe: true,
          });
          setArtPolling(null);
        }
      } catch {
        // non-fatal, keep polling
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [artPolling, setArtBrief]);

  const activeHistory = tabMessages[activeTab];
  const activeExtracted = useMemo(
    () =>
      (tabStates.find((t) => t.tabId === activeTab)?.extractedData ??
        {}) as Record<string, unknown>,
    [tabStates, activeTab],
  );

  // Auto-scroll chat to bottom on new messages.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeHistory.length, activeTab]);

  const tabStatus = (id: ChatTabId) => {
    const t = tabStates.find((ts) => ts.tabId === id);
    if (!t) return "empty";
    if (t.isComplete) return "complete";
    if (t.messages.length > 0 || tabMessages[id].length > 0)
      return "in-progress";
    return "empty";
  };

  // Check if any sub-tabs (products, tech, art) have messages — for badge on All tab
  const subTabsHaveMessages =
    tabMessages.products.length > 0 ||
    tabMessages.tech.length > 0 ||
    tabMessages.art.length > 0;

  const handleImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const arrayBuffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const contentHash = hashArray
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++)
          binary += String.fromCharCode(bytes[i]!);
        const base64 = btoa(binary);
        setPendingImage({ base64, contentHash });
        if (!input) setInput("I want to share this image for inspiration.");
      } catch {
        // Ignore
      }
      e.target.value = "";
    },
    [input],
  );

  const sendMessage = async (override?: string) => {
    const text = (override ?? input).trim();
    if ((!text && !pendingImage) || sending) return;
    const effectiveText = text || "I shared an image.";
    const detectedUrl = effectiveText.match(URL_RE)?.[0];

    const imgData = pendingImage;
    setInput("");
    setPendingImage(null);

    const storedText = imgData
      ? `${effectiveText} [img-hash:${imgData.contentHash.slice(0, 8)}]`
      : effectiveText;

    // Update local tabMessages
    const updatedMessages = {
      ...tabMessages,
      [activeTab]: [
        ...tabMessages[activeTab],
        { role: "user" as const, content: storedText },
      ],
    };
    setTabMessages(updatedMessages);

    // Also update Zustand for extraction/API
    appendTabMessage(activeTab as TabId, "user", storedText);
    setSending(true);

    try {
      const res = await fetch("/api/design-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: effectiveText,
          activeTab,
          roomId: effectiveRoomId,
          tabHistory: tabStates,
          currentExtracted: activeExtracted,
          urlInput: detectedUrl,
          ...(imgData
            ? {
                imageAttachment: imgData.base64,
                contentHash: imgData.contentHash,
              }
            : {}),
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ detail: res.statusText })) as { error?: string; detail?: string };
        throw new Error(errBody.detail || errBody.error || `Chat request failed (${res.status})`);
      }
      const data = (await res.json()) as {
        reply: string;
        extractedData: Record<string, unknown>;
        tabComplete: boolean;
        scrapedProduct: unknown;
        shouldGenerateArt: boolean;
        artPrompt: string | null;
      };

      // Update local tabMessages with assistant reply
      const withReply: TabMessages = {
        ...updatedMessages,
        [activeTab]: [
          ...updatedMessages[activeTab],
          { role: "assistant" as const, content: data.reply },
        ],
      };
      setTabMessages(withReply);

      // Zustand sync
      appendTabMessage(activeTab as TabId, "assistant", data.reply);
      updateTabExtractedData(activeTab as TabId, data.extractedData as never);

      // Promote scraped product from a pasted URL into requestedProducts so
      // the compiler's "Specific products requested:" section sees it, even
      // if Claude never emits [TAB_COMPLETE].
      if (
        data.scrapedProduct &&
        typeof data.scrapedProduct === "object" &&
        typeof (data.scrapedProduct as { name?: unknown }).name === "string" &&
        (data.scrapedProduct as { name: string }).name.length > 0
      ) {
        const sp = data.scrapedProduct as {
          name: string;
          description?: string;
          brand?: string;
          price?: number;
          dimensions?: string;
          color?: string;
          imageUrl?: string;
          retailerUrl?: string;
        };
        const pastedUrl = detectedUrl ?? sp.retailerUrl ?? "";
        useArea2Store.getState().addRequestedProduct({
          id: crypto.randomUUID(),
          sourceType: "url",
          originalInput: pastedUrl,
          scrapedData: {
            name: sp.name,
            brand: sp.brand,
            price: sp.price,
            dimensions: sp.dimensions,
            color: sp.color,
            imageUrl: sp.imageUrl,
            retailerUrl: sp.retailerUrl ?? pastedUrl,
          },
          resolvedAs: "scraped",
          fluxDescription: sp.description ?? sp.name,
          placementIntent: "ai-decides",
          confirmedByUser: true,
        });
      }

      if (data.tabComplete) {
        markTabComplete(activeTab as TabId);
      }

      // Persist to Supabase after every assistant response
      persistChatHistory(withReply);

      if (data.shouldGenerateArt && effectiveRoomId) {
        const nextIndex = activeHistory.length + 1;
        const tabKey = activeTab;
        setInlineArt((prev) => ({
          ...prev,
          [tabKey]: [
            ...(prev[tabKey] ?? []),
            { messageIndex: nextIndex, urls: [] },
          ],
        }));
        setArtPolling({
          roomId: effectiveRoomId,
          tabKey,
          messageIndex: nextIndex,
        });
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      console.error("[step-7d] Chat error:", detail);
      const errorMsg = detail.includes("Unauthorized")
        ? "Your session expired. Please refresh the page and try again."
        : "Something went wrong on my end. Want to try that again?";
      const withError: TabMessages = {
        ...updatedMessages,
        [activeTab]: [
          ...updatedMessages[activeTab],
          { role: "assistant" as const, content: errorMsg },
        ],
      };
      setTabMessages(withError);
      appendTabMessage(activeTab as TabId, "assistant", errorMsg);
    } finally {
      setSending(false);
    }
  };

  const selectArt = (tabKey: ChatTabId, messageIndex: number, url: string) => {
    setInlineArt((prev) => ({
      ...prev,
      [tabKey]: (prev[tabKey] ?? []).map((block) =>
        block.messageIndex === messageIndex
          ? { ...block, selectedUrl: url }
          : block,
      ),
    }));
    const current = useArea2Store.getState().artBrief;
    if (current) {
      setArtBrief({ ...current, chosenArtImageUrl: url });
    }
  };

  const handleDesignMyRoom = async () => {
    setCtaError(null);
    if (!minimumThresholdMet || !effectiveRoomId) return;
    const supabase = createBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Safety flush: promote any pending chat-extracted data into the
    // renderContext fields, even if Claude never emitted [TAB_COMPLETE].
    // Mirrors markTabComplete()'s promotion logic so mid-conversation
    // CTAs don't silently drop tech/sensory/art/identity preferences.
    {
      const store = useArea2Store.getState();
      const tabsToFlush: TabId[] = [
        "all",
        "products",
        "tech",
        "art",
        "sensory",
        "identity",
      ];
      for (const tabId of tabsToFlush) {
        const tab = store.tabStates.find((t) => t.tabId === tabId);
        const extracted = tab?.extractedData as
          | Record<string, unknown>
          | undefined;
        if (!extracted || Object.keys(extracted).length === 0) continue;

        const fresh = useArea2Store.getState();

        if ((tabId === "all" || tabId === "tech") && !fresh.techSpec) {
          const base: TechSpec = {
            hasTV: false,
            audioSetup: "none",
            smartLighting: false,
            hasWorkFromHome: false,
            hasGamingSetup: false,
          };
          fresh.setTechSpec({ ...base, ...extracted } as TechSpec);
        }
        if ((tabId === "all" || tabId === "sensory") && !fresh.sensoryProfile) {
          const base: SensoryProfile = {
            throwCushionDensity: 2,
            plantPresence: "none",
            hasCandles: false,
            hasRug: false,
            windowTreatments: "none",
            hasDiffuser: false,
            overallDensity: "balanced",
          };
          fresh.setSensoryProfile({ ...base, ...extracted } as SensoryProfile);
        }
        if ((tabId === "all" || tabId === "art") && !fresh.artBrief) {
          const base: ArtBrief = {
            hasArtDirection: false,
            visualDirection: "",
            colorPalette: [],
            mood: "",
            abstractionLevel: "semi-abstract",
            subjectMatter: "",
            frameStyle: "gallery-wrap",
            placement: "ai-decides",
            galleryWall: false,
            includesPersonalPhotos: false,
            hasBookCollection: false,
            hasVinylCollection: false,
            copyrightSafe: true,
          };
          const merged = { ...base, ...extracted } as ArtBrief;
          merged.hasArtDirection =
            (extracted.hasArtDirection as boolean | undefined) ??
            (merged.visualDirection ? true : base.hasArtDirection);
          fresh.setArtBrief(merged);
        }
        if ((tabId === "all" || tabId === "identity") && !fresh.identityBrief) {
          const base: IdentityBrief = {
            moodTarget: "",
            moodKeywords: [],
            personalityTags: [],
          };
          fresh.setIdentityBrief({ ...base, ...extracted } as IdentityBrief);
        }
        // products tab: extractedData may contain an array of partial
        // RequestedProducts. Promote any that aren't already in the list.
        if (tabId === "products" && Array.isArray(extracted)) {
          const existing = fresh.requestedProducts;
          for (const raw of extracted as Partial<RequestedProduct>[]) {
            if (!raw || typeof raw !== "object") continue;
            const name = raw.fluxDescription ?? raw.originalInput;
            if (!name) continue;
            if (existing.some((p) => p.originalInput === raw.originalInput))
              continue;
            fresh.addRequestedProduct({
              id: raw.id ?? crypto.randomUUID(),
              sourceType: raw.sourceType ?? "description",
              originalInput: raw.originalInput ?? name,
              scrapedData: raw.scrapedData,
              resolvedAs: raw.resolvedAs ?? "ai-described",
              fluxDescription: raw.fluxDescription ?? name,
              placementIntent: raw.placementIntent ?? "ai-decides",
              placementHint: raw.placementHint,
              confirmedByUser: raw.confirmedByUser ?? true,
            });
          }
        }
      }
    }

    const ctx = assembleRenderContext(user.id);
    if (!ctx) {
      setCtaError("Complete the All tab to continue.");
      return;
    }
    const result = await persistRenderContext(effectiveRoomId, ctx, user.id);
    if (!result.success) {
      console.error("[Step 7d] persistRenderContext failed:", result.error);
      setCtaError(
        "Something went wrong saving your preferences. Please try again.",
      );
      return;
    }

    // Collect chat messages for context injection into the prompt compiler
    const tabStatesSnapshot = useArea2Store.getState().tabStates;
    const chatContext: Record<
      string,
      Array<{ role: string; content: string }>
    > = {};
    for (const tab of tabStatesSnapshot) {
      if (tab.messages && tab.messages.length > 0) {
        chatContext[tab.tabId] = tab.messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));
      }
    }

    // Fire redesign pipeline (non-blocking — pipeline writes directly to Supabase,
    // step-8a polls /api/rooms/status for progress)
    fetch("/api/pipeline/redesign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room_id: effectiveRoomId,
        chat_context: Object.keys(chatContext).length > 0 ? chatContext : null,
      }),
    }).catch((err) =>
      console.warn("[step-7d] Redesign pipeline trigger failed:", err),
    );

    router.push(`/design/step-8a?roomId=${effectiveRoomId}`);
  };

  if (!hydrated) return null;

  return (
    <div className="min-h-screen bg-cova-bg font-dm-sans flex flex-col">
      {/* Gold progress bar — fixed top */}
      <div className="fixed top-0 left-0 right-0 h-[3px] bg-[rgba(201,168,76,0.15)] z-[60]">
        <div className="h-full w-[86%] bg-cova-gold transition-all duration-[400ms] ease-out" />
      </div>

      {/* Frosted glass top bar */}
      <nav
        className="sticky top-0 z-50 h-14 flex items-center justify-between px-6"
        style={{
          background: "rgba(9,24,41,0.8)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(201,168,76,0.1)",
        }}
      >
        <span className="font-playfair italic text-xl text-cova-gold tracking-[0.05em]">
          Cova
        </span>
        <span className="font-semibold text-[15px] text-cova-ivory">
          Personalize
        </span>
        <span className="text-[13px] text-cova-muted">Step 7 of 7</span>
      </nav>

      {/* Tab bar */}
      <div
        className="flex overflow-x-auto flex-shrink-0 px-6"
        style={{ borderBottom: "1px solid rgba(201,168,76,0.1)" }}
      >
        {TABS.map((t) => {
          const status = tabStatus(t.id);
          const isActive = t.id === activeTab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={[
                "bg-transparent border-none whitespace-nowrap flex items-center gap-[6px] transition-all duration-200 ease-out cursor-pointer text-sm py-3 px-4",
                isActive
                  ? "text-cova-ivory font-semibold"
                  : "text-cova-muted font-normal",
              ].join(" ")}
              style={{
                borderBottom: `2px solid ${isActive ? "#C9A84C" : "transparent"}`,
              }}
            >
              {t.label}
              {/* Badge on All tab when sub-tabs have messages */}
              {t.id === "all" && subTabsHaveMessages && !isActive && (
                <span className="w-[6px] h-[6px] rounded-full bg-cova-gold/60 inline-block" />
              )}
              {status === "complete" && (
                <span className="text-cova-gold text-xs">✓</span>
              )}
              {status === "in-progress" && t.id !== "all" && (
                <span className="w-[6px] h-[6px] rounded-full bg-cova-gold inline-block" />
              )}
            </button>
          );
        })}
      </div>

      {/* Chat area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto py-4 px-6 max-w-[720px] mx-auto w-full"
      >
        {activeHistory.length === 0 ? (
          <div className="text-cova-muted text-sm font-dm-sans py-4">
            Tap a prompt below to begin, or type something yourself.
          </div>
        ) : (
          activeHistory.map((m, i) => {
            const isUser = m.role === "user";
            const art = (inlineArt[activeTab] ?? []).find(
              (b) => b.messageIndex === i,
            );
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={[
                  "flex mb-3",
                  isUser ? "justify-end" : "justify-start",
                ].join(" ")}
              >
                <div
                  className="max-w-[82%] rounded-xl p-3 px-4 text-cova-ivory text-[15px] whitespace-pre-wrap"
                  style={{
                    background: isUser
                      ? "rgba(255,255,255,0.07)"
                      : "rgba(255,255,255,0.04)",
                    border: `1px solid ${isUser ? "transparent" : "rgba(201,168,76,0.15)"}`,
                    borderLeft: isUser
                      ? "2px solid #C9A84C"
                      : "1px solid rgba(201,168,76,0.15)",
                  }}
                >
                  {m.content}
                  {art && art.urls.length === 0 && (
                    <div className="text-cova-muted text-xs mt-2">
                      Creating art options...
                    </div>
                  )}
                  {art && art.urls.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {art.urls.map((url) => {
                        const selected = art.selectedUrl === url;
                        return (
                          <button
                            key={url}
                            type="button"
                            onClick={() => selectArt(activeTab, i, url)}
                            className="bg-transparent rounded-lg p-0 cursor-pointer overflow-hidden"
                            style={{
                              border: `2px solid ${selected ? "#C9A84C" : "rgba(201,168,76,0.15)"}`,
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt="Art option"
                              className="w-full h-[160px] object-cover block"
                            />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })
        )}

        {/* Typing indicator */}
        {sending && (
          <div className="flex justify-start mb-3">
            <div
              className="rounded-xl"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(201,168,76,0.15)",
              }}
            >
              <TypingIndicator />
            </div>
          </div>
        )}
      </div>

      {/* Starter chips */}
      {activeHistory.length === 0 && (
        <div className="px-6 pb-3 max-w-[720px] mx-auto w-full flex flex-col gap-2">
          {STARTERS[activeTab].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => sendMessage(s)}
              disabled={sending}
              className={[
                "bg-transparent text-cova-ivory py-[10px] px-[14px] rounded-full text-sm text-left transition-all duration-200 ease-out",
                sending ? "cursor-not-allowed" : "cursor-pointer",
              ].join(" ")}
              style={{ border: "1px solid rgba(201,168,76,0.15)" }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Suggestion chips — disappear after first message in tab */}
      {activeHistory.length === 0 && (
        <div className="px-6 pb-2 max-w-[720px] mx-auto w-full overflow-x-auto">
          <div className="flex gap-2 flex-nowrap">
            {SUGGESTION_CHIPS[activeTab].map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => sendMessage(chip)}
                disabled={sending}
                className={[
                  "bg-transparent whitespace-nowrap text-[#F5F0E8] py-2 px-4 rounded-full text-sm transition-all duration-200 ease-out flex-shrink-0",
                  sending ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                ].join(" ")}
                style={{ border: "1px solid #C9A84C" }}
                onMouseEnter={(e) => {
                  if (!sending)
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "#C9A84C";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "transparent";
                }}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input bar */}
      <div
        className="py-3 px-6 max-w-[720px] mx-auto w-full flex-shrink-0 bg-cova-bg"
        style={{ borderTop: "1px solid rgba(201,168,76,0.15)" }}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
        />

        {/* Image attachment indicator */}
        {pendingImage && (
          <div className="mb-2 flex items-center gap-2 text-xs text-cova-gold">
            <span>Image ready to send</span>
            <button
              type="button"
              onClick={() => setPendingImage(null)}
              className="bg-transparent border-none text-cova-muted cursor-pointer text-xs"
            >
              Remove
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Image attach for All tab (identity conversations) */}
          {activeTab === "all" && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              title="Attach image (sentimental objects, inspiration photos)"
              className={[
                "bg-transparent rounded-full py-[11px] px-[13px] text-[13px] leading-none",
                sending ? "cursor-not-allowed" : "cursor-pointer",
                pendingImage ? "text-cova-gold" : "text-cova-muted",
              ].join(" ")}
              style={{
                border: `1px solid ${pendingImage ? "#C9A84C" : "rgba(201,168,76,0.15)"}`,
              }}
            >
              +img
            </button>
          )}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
            placeholder="Type a message…"
            className="flex-1 rounded-lg text-cova-ivory py-3 px-4 text-[15px] outline-none transition-[border-color] duration-[150ms] ease-out"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(201,168,76,0.15)",
            }}
            onFocus={(e) => {
              (e.target as HTMLInputElement).style.borderColor =
                "rgba(201,168,76,0.6)";
            }}
            onBlur={(e) => {
              (e.target as HTMLInputElement).style.borderColor =
                "rgba(201,168,76,0.15)";
            }}
          />
          <button
            type="button"
            onClick={() => sendMessage()}
            disabled={sending || (!input.trim() && !pendingImage)}
            className={[
              "border-none rounded-lg py-3 px-[14px] flex items-center justify-center",
              sending || (!input.trim() && !pendingImage)
                ? "cursor-not-allowed"
                : "cursor-pointer",
            ].join(" ")}
            style={{
              background:
                input.trim() || pendingImage
                  ? "#C9A84C"
                  : "rgba(201,168,76,0.15)",
              color:
                input.trim() || pendingImage
                  ? "#091829"
                  : "rgba(245,240,232,0.45)",
            }}
          >
            <ArrowRight size={18} />
          </button>
        </div>

        {/* Completion status row */}
        <div className="mt-3 text-cova-muted text-xs flex flex-wrap gap-2">
          {TABS.map((t) => {
            const done = tabStatus(t.id) === "complete";
            return (
              <span
                key={t.id}
                style={{ color: done ? "#6FCF97" : undefined }}
                className={done ? "" : "text-cova-muted"}
              >
                {t.label}
                {done ? " ✓" : ""}
              </span>
            );
          })}
        </div>

        {/* CTA error */}
        {ctaError && (
          <div className="mt-3 text-[#E87070] text-sm text-center">
            {ctaError}
          </div>
        )}

        {/* Design My Room CTA */}
        <motion.button
          type="button"
          onClick={handleDesignMyRoom}
          disabled={!minimumThresholdMet}
          whileHover={
            minimumThresholdMet
              ? { scale: 1.02, backgroundColor: "#D4B460" }
              : {}
          }
          whileTap={minimumThresholdMet ? { scale: 0.97 } : {}}
          transition={{ duration: 0.15 }}
          className={[
            "mt-3 w-full border-none rounded-lg py-[14px] px-5 text-[15px] font-semibold transition-all duration-200 ease-out",
            minimumThresholdMet ? "cursor-pointer" : "cursor-not-allowed",
          ].join(" ")}
          style={{
            background: minimumThresholdMet
              ? "#C9A84C"
              : "rgba(201,168,76,0.12)",
            color: minimumThresholdMet ? "#091829" : "rgba(245,240,232,0.45)",
          }}
        >
          {minimumThresholdMet
            ? "Design My Room →"
            : "Complete All + one more tab to continue"}
        </motion.button>

        {/* Helper text */}
        <p className="mt-2 text-[13px] text-cova-muted text-center">
          Your personalized redesign takes about 60 seconds.
        </p>
      </div>
    </div>
  );
}
