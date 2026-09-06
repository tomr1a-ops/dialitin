import type { ClubFamily } from "@/lib/admin/test-swings";

const CLUB_PATTERNS: Array<{ family: ClubFamily; patterns: RegExp[] }> = [
  {
    family: "driver",
    patterns: [/\bdriver\b/i, /\b1[\s-]?wood\b/i, /\boff the tee\b/i],
  },
  {
    family: "wood_hybrid",
    patterns: [/\bwood\b/i, /\bhybrid\b/i, /\b3[\s-]?wood\b/i, /\b5[\s-]?wood\b/i],
  },
  {
    family: "long_iron",
    patterns: [
      /\b7[\s-]?iron\b/i,
      /\b6[\s-]?iron\b/i,
      /\b5[\s-]?iron\b/i,
      /\b4[\s-]?iron\b/i,
      /\blong iron\b/i,
    ],
  },
  {
    family: "short_iron",
    patterns: [/\b8[\s-]?iron\b/i, /\b9[\s-]?iron\b/i, /\bshort iron\b/i],
  },
  {
    family: "wedge",
    patterns: [/\bwedge\b/i, /\bpw\b/i, /\bsw\b/i, /\blw\b/i, /\bchip\b/i],
  },
];

/** Infer club family from video title; unknown clips seed no band. */
export function clubFamilyFromTitle(title: string): ClubFamily | "unknown" {
  for (const entry of CLUB_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(title))) {
      return entry.family;
    }
  }
  return "unknown";
}

export function isKnownClubFamily(
  value: string | null | undefined,
): value is ClubFamily {
  return (
    value === "driver" ||
    value === "wood_hybrid" ||
    value === "long_iron" ||
    value === "short_iron" ||
    value === "wedge"
  );
}
