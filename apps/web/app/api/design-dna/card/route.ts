import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { StyleFingerprint } from "@/types/fingerprint";

type DimKey = keyof StyleFingerprint["dimensions"];

const NEUTRAL_MIDPOINT = 0.5;

const DIMENSION_META: Array<{
  key: DimKey;
  name: string;
  hiLabel: string;
  loLabel: string;
}> = [
  {
    key: "lightPreference",
    name: "Light",
    hiLabel: "Bright & Airy",
    loLabel: "Moody & Dramatic",
  },
  {
    key: "density",
    name: "Density",
    hiLabel: "Layered & Rich",
    loLabel: "Clean & Minimal",
  },
  {
    key: "colorTemperature",
    name: "Temperature",
    hiLabel: "Warm & Cozy",
    loLabel: "Cool & Crisp",
  },
  {
    key: "lineQuality",
    name: "Form",
    hiLabel: "Organic & Curved",
    loLabel: "Geometric & Angular",
  },
  {
    key: "era",
    name: "Era",
    hiLabel: "Classic & Timeless",
    loLabel: "Bold & Modern",
  },
  {
    key: "texture",
    name: "Texture",
    hiLabel: "Textured & Tactile",
    loLabel: "Smooth & Sleek",
  },
];

interface DnaAxis {
  name: string;
  value: number; // [0, 1]
  label: string;
  description: string;
}

interface DesignDnaCard {
  style_name: string;
  fingerprint: StyleFingerprint;
  axes: DnaAxis[];
  palette_descriptors: string[];
  summary: string;
}

function buildDnaCard(
  fingerprint: StyleFingerprint,
  styleName: string,
): DesignDnaCard {
  const d = fingerprint.dimensions;

  const axes: DnaAxis[] = DIMENSION_META.map(
    ({ key, name, hiLabel, loLabel }) => {
      const value = d[key];
      const dev = value - NEUTRAL_MIDPOINT;
      const isHigh = dev >= 0;
      const label = isHigh ? hiLabel : loLabel;
      const strength = Math.abs(dev); // distance from 0.5 in [0, 0.5]

      let description: string;
      if (strength < 0.1) {
        description = `Balanced ${name}`;
      } else if (strength < 0.25) {
        description = `Leans ${label}`;
      } else {
        description = `Strongly ${label}`;
      }

      return { name, value, label, description };
    },
  );

  // Derive palette descriptors from colorTemperature + lightPreference (both in [0,1])
  const temp = d.colorTemperature;
  const lum = d.lightPreference;
  const paletteDescriptors: string[] = [];

  if (temp >= 0.6 && lum >= 0.6)
    paletteDescriptors.push("warm ivory", "golden amber", "soft cream");
  else if (temp >= 0.6 && lum < 0.4)
    paletteDescriptors.push("burnt sienna", "deep terracotta", "rich ochre");
  else if (temp < 0.4 && lum >= 0.6)
    paletteDescriptors.push("icy white", "cool slate", "soft grey-blue");
  else if (temp < 0.4 && lum < 0.4)
    paletteDescriptors.push("charcoal", "deep navy", "graphite");
  else
    paletteDescriptors.push("warm neutral", "balanced tone", "versatile grey");

  // One-sentence summary
  const topAxes = axes
    .filter((a) => Math.abs(a.value - NEUTRAL_MIDPOINT) > 0.15)
    .sort(
      (a, b) =>
        Math.abs(b.value - NEUTRAL_MIDPOINT) -
        Math.abs(a.value - NEUTRAL_MIDPOINT),
    )
    .slice(0, 2)
    .map((a) => a.label.toLowerCase());

  const summary =
    topAxes.length >= 2
      ? `Your space leans ${topAxes[0]} with a ${topAxes[1]} sensibility.`
      : topAxes.length === 1
        ? `Your space has a ${topAxes[0]} character.`
        : "Your space has a balanced, versatile character.";

  return {
    style_name: styleName,
    fingerprint,
    axes,
    palette_descriptors: paletteDescriptors,
    summary,
  };
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      fingerprint: StyleFingerprint;
      style_name: string;
    };
    const { fingerprint, style_name } = body;

    if (!fingerprint || !fingerprint.dimensions) {
      return NextResponse.json(
        { error: "fingerprint must be a StyleFingerprint object" },
        { status: 400 },
      );
    }

    const card = buildDnaCard(fingerprint, style_name ?? "Curated Modern");

    return NextResponse.json(card);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
