/**
 * Regression tests for Area2Store — verifying that tab completion
 * correctly promotes extracted data to top-level store fields.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useArea2Store } from "@/lib/stores/area2Store";
import type { TabId } from "@/lib/types/area2";

function resetStore() {
  useArea2Store.getState().reset();
}

function prepareTab(tabId: TabId, extractedData: Record<string, unknown>) {
  const store = useArea2Store.getState();
  // Simulate chat completion: append a message, update extracted data, then mark complete
  store.appendTabMessage(tabId, "user", "test message");
  store.appendTabMessage(tabId, "assistant", "test response");
  store.updateTabExtractedData(tabId, extractedData as never);
  store.markTabComplete(tabId);
}

describe("Area2Store — tab data promotion", () => {
  beforeEach(resetStore);

  it("setBudget writes rangeMin, rangeMax, strategy directly (no longer via chat)", () => {
    // Budget now comes from step-5, not from chat tab completion
    useArea2Store.getState().setBudget({
      rangeMin: 2000,
      rangeMax: 8000,
      strategy: "hero-piece",
      hardCeiling: true,
    });

    const state = useArea2Store.getState();
    expect(state.budget).not.toBeNull();
    expect(state.budget?.rangeMin).toBe(2000);
    expect(state.budget?.rangeMax).toBe(8000);
    expect(state.budget?.strategy).toBe("hero-piece");
    expect(state.budget?.hardCeiling).toBe(true);
  });

  it("tech tab completion promotes hasTV and tvSizeInches", () => {
    prepareTab("tech", {
      hasTV: true,
      tvSizeInches: 65,
      tvMountType: "wall-mounted",
      audioSetup: "bookshelf-speakers",
    });

    const state = useArea2Store.getState();
    expect(state.techSpec).not.toBeNull();
    expect(state.techSpec?.hasTV).toBe(true);
    expect(state.techSpec?.tvSizeInches).toBe(65);
    expect(state.techSpec?.audioSetup).toBe("bookshelf-speakers");
  });

  it("sensory tab completion promotes throwCushionDensity and plants", () => {
    prepareTab("sensory", {
      throwCushionDensity: 4,
      plantPresence: "large-statement",
      plantSpecies: ["fiddle leaf fig"],
      hasRug: true,
      rugStyle: "hand-knotted wool",
    });

    const state = useArea2Store.getState();
    expect(state.sensoryProfile).not.toBeNull();
    expect(state.sensoryProfile?.throwCushionDensity).toBe(4);
    expect(state.sensoryProfile?.plantPresence).toBe("large-statement");
    expect(state.sensoryProfile?.hasRug).toBe(true);
  });

  it("art tab completion promotes visualDirection and gallery wall", () => {
    prepareTab("art", {
      visualDirection: "moody atmospheric abstract",
      galleryWall: true,
      frameStyle: "formal-dark",
      hasBookCollection: true,
    });

    const state = useArea2Store.getState();
    expect(state.artBrief).not.toBeNull();
    expect(state.artBrief?.hasArtDirection).toBe(true);
    expect(state.artBrief?.visualDirection).toBe("moody atmospheric abstract");
    expect(state.artBrief?.galleryWall).toBe(true);
  });

  it("identity tab completion promotes moodTarget and moodKeywords", () => {
    prepareTab("identity", {
      moodTarget: "calm and sophisticated",
      moodKeywords: ["serene", "warm", "curated"],
      culturalReference: "Japanese",
      culturalReferenceIntensity: "subtle",
    });

    const state = useArea2Store.getState();
    expect(state.identityBrief).not.toBeNull();
    expect(state.identityBrief?.moodTarget).toBe("calm and sophisticated");
    expect(state.identityBrief?.moodKeywords).toEqual([
      "serene",
      "warm",
      "curated",
    ]);
    expect(state.identityBrief?.culturalReference).toBe("Japanese");
  });

  it('minimumThresholdMet is true when budget set + "all" + one other tab complete', () => {
    // Budget from step-5
    useArea2Store.getState().setBudget({
      rangeMin: 1000,
      rangeMax: 5000,
      strategy: "even-quality",
      hardCeiling: false,
    });
    expect(useArea2Store.getState().minimumThresholdMet).toBe(false);

    // 'all' tab alone — not sufficient
    prepareTab("all", { visualDirection: "moody" });
    expect(useArea2Store.getState().minimumThresholdMet).toBe(false);

    // 'all' + 'sensory' — complete
    prepareTab("sensory", { throwCushionDensity: 3 });
    expect(useArea2Store.getState().minimumThresholdMet).toBe(true);
  });

  it("assembleRenderContext includes budget data from setBudget()", () => {
    const store = useArea2Store.getState();
    // Set required fields
    store.setRoom("test-room", "https://example.com/photo.jpg");
    store.setRoomContext({
      roomShape: "rectangular",
      estimatedDimensions: "14x18 ft",
      ceilingHeight: "standard-8ft",
      ceilingDetail: "",
      naturalLightDirection: "left",
      naturalLightQuality: "soft-diffused",
      windowCount: 2,
      windowSize: "medium",
      floorMaterial: "hardwood",
      floorColor: "honey oak",
      wallColor: "warm white",
      hasAccentWall: false,
      wallTexture: "smooth-matte",
      cameraAngle: "eye-level",
      focalLength: "standard",
      architecturalFeatures: [],
      dominantColors: ["white", "brown"],
      colorTemperature: "warm",
      existingStyleFingerprint: "warm neutral",
      surfaceTextures: "mixed",
      userNotes: "",
      aiConfidence: 0.8,
    });
    store.setRoomConstraints({
      wallPermanence: "own-anything-goes",
      physicalConstraints: [],
      bestLightTime: "morning",
      roomSize: "medium",
      whoUsesRoom: [],
      primaryFunction: ["living room"],
      hasPetsOrKids: false,
      storagePriority: "medium",
      offScreenPieces: "",
      styleDirectionDelta: { coziness: 0, colorBoldness: 0, traditionality: 0 },
    });
    store.setKeepMask({
      objects: [],
      depthMapUrl: "",
      rawDetectionCount: 0,
      detectionModelVersion: "test",
    });

    // Set budget via step-5 path
    useArea2Store.getState().setBudget({
      rangeMin: 3000,
      rangeMax: 10000,
      strategy: "hero-piece",
      hardCeiling: false,
    });
    // Complete 'all' + one other tab for minimumThresholdMet
    prepareTab("all", { visualDirection: "moody" });
    prepareTab("tech", { hasTV: true, tvSizeInches: 55 });

    const ctx = useArea2Store.getState().assembleRenderContext("test-user");
    expect(ctx).not.toBeNull();
    expect(ctx?.budget.rangeMin).toBe(3000);
    expect(ctx?.budget.rangeMax).toBe(10000);
    expect(ctx?.budget.strategy).toBe("hero-piece");
    expect(ctx?.techSpec.hasTV).toBe(true);
    expect(ctx?.techSpec.tvSizeInches).toBe(55);
    expect(ctx?.fluxPrompt).toBeTruthy();
    expect(ctx?.fluxPrompt).toContain("TV");
  });
});

describe("Area2Store — 4-tab structure", () => {
  beforeEach(resetStore);

  it("tab switch preserves messages across different tabs", () => {
    const store = useArea2Store.getState();

    // Add messages to 'all' tab
    store.appendTabMessage("all", "user", "hello all");
    store.appendTabMessage("all", "assistant", "hi from all");

    // Switch to 'products' and add messages
    store.appendTabMessage("products", "user", "hello products");
    store.appendTabMessage("products", "assistant", "hi from products");

    // Switch to 'tech' and add messages
    store.appendTabMessage("tech", "user", "hello tech");

    // Verify all tab messages are preserved
    const state = useArea2Store.getState();
    const allTab = state.tabStates.find((t) => t.tabId === "all");
    const productsTab = state.tabStates.find((t) => t.tabId === "products");
    const techTab = state.tabStates.find((t) => t.tabId === "tech");

    expect(allTab?.messages).toHaveLength(2);
    expect(allTab?.messages[0]?.content).toBe("hello all");
    expect(allTab?.messages[1]?.content).toBe("hi from all");

    expect(productsTab?.messages).toHaveLength(2);
    expect(productsTab?.messages[0]?.content).toBe("hello products");

    expect(techTab?.messages).toHaveLength(1);
    expect(techTab?.messages[0]?.content).toBe("hello tech");
  });

  it('markTabComplete with string ID "all" promotes all extracted fields (budget excluded)', () => {
    prepareTab("all", {
      hasTV: true,
      tvSizeInches: 55,
      smartLighting: true,
      throwCushionDensity: 3,
      plantPresence: "large-statement",
      hasArtDirection: true,
      visualDirection: "moody atmospheric",
      moodTarget: "calm",
      moodKeywords: ["serene"],
    });

    const state = useArea2Store.getState();

    // Budget is NOT promoted from chat — must come from step-5 setBudget()
    expect(state.budget).toBeNull();

    // Tech promoted
    expect(state.techSpec).not.toBeNull();
    expect(state.techSpec?.hasTV).toBe(true);
    expect(state.techSpec?.smartLighting).toBe(true);

    // Sensory promoted
    expect(state.sensoryProfile).not.toBeNull();
    expect(state.sensoryProfile?.throwCushionDensity).toBe(3);

    // Art promoted
    expect(state.artBrief).not.toBeNull();
    expect(state.artBrief?.hasArtDirection).toBe(true);
    expect(state.artBrief?.visualDirection).toBe("moody atmospheric");

    // Identity promoted
    expect(state.identityBrief).not.toBeNull();
    expect(state.identityBrief?.moodTarget).toBe("calm");
  });

  it('minimumThresholdMet requires budget + "all" + one other tab', () => {
    // Budget from step-5
    useArea2Store.getState().setBudget({
      rangeMin: 2000,
      rangeMax: 6000,
      strategy: "hero-piece",
      hardCeiling: false,
    });

    // Complete 'all' tab only — not sufficient (needs one other)
    prepareTab("all", { visualDirection: "moody" });
    expect(useArea2Store.getState().minimumThresholdMet).toBe(false);

    // Complete 'art' tab — now 'all' + one other + budget
    prepareTab("art", { visualDirection: "abstract", hasArtDirection: true });
    expect(useArea2Store.getState().minimumThresholdMet).toBe(true);
  });
});
