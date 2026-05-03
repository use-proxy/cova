// apps/web/lib/measureBridge.ts
// Utilities for the iOS measurement bridge

export interface MeasurementParams {
  length: number | null; // feet
  width: number | null; // feet
  ceiling: number | null; // feet
  source: "shortcut" | null;
}

// Read measurement params from URL search params
export function parseMeasurementParams(
  searchParams: URLSearchParams,
): MeasurementParams {
  const length = searchParams.get("length");
  const width = searchParams.get("width");
  const ceiling = searchParams.get("ceiling");
  const source = searchParams.get("source");

  return {
    length: length ? parseFloat(length) : null,
    width: width ? parseFloat(width) : null,
    ceiling: ceiling ? parseFloat(ceiling) : null,
    source: source === "shortcut" ? "shortcut" : null,
  };
}

// Detect if device is iOS
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

// Detect if device is Android
export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/.test(navigator.userAgent);
}

// Detect if browser supports WebXR hit-test (Android Chrome)
export async function supportsWebXRMeasurement(): Promise<boolean> {
  if (!isAndroid()) return false;
  if (typeof navigator === "undefined") return false;
  if (!("xr" in navigator)) return false;
  try {
    const supported = await (
      navigator as Navigator & {
        xr: { isSessionSupported: (mode: string) => Promise<boolean> };
      }
    ).xr.isSessionSupported("immersive-ar");
    return supported;
  } catch {
    return false;
  }
}

// Build the Siri Shortcut deep link for iOS
// In production, this would be an iCloud shortcut link
// For MVP: link to the shortcut documentation page
export function getShortcutLink(): string {
  // Replace with actual iCloud shortcut link when shortcut is published
  return "https://www.icloud.com/shortcuts/placeholder";
}

// Build the Cova deep link that the shortcut opens
export function buildShortcutReturnUrl(
  baseUrl: string,
  measurements: Partial<MeasurementParams>,
): string {
  const params = new URLSearchParams();
  if (measurements.length) params.set("length", String(measurements.length));
  if (measurements.width) params.set("width", String(measurements.width));
  if (measurements.ceiling) params.set("ceiling", String(measurements.ceiling));
  params.set("source", "shortcut");
  return `${baseUrl}/design/step-4?${params.toString()}`;
}
