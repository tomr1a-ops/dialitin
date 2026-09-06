/** Answer-key tier: prefill pro_label_fault_1 from title keywords. */

const FAULT_KEYWORD_MAP: Array<{ faultKey: string; patterns: RegExp[] }> = [
  { faultKey: "slice", patterns: [/\bslice\b/i, /\bslicing\b/i] },
  { faultKey: "early_extension", patterns: [/\bearly extension\b/i, /\bstand(?:ing)? up\b/i] },
  { faultKey: "sway", patterns: [/\bsway\b/i, /\bswaying\b/i, /\bslide\b/i] },
  {
    faultKey: "over_the_top",
    patterns: [/\bover the top\b/i, /\bott\b/i, /\bsteep\b/i],
  },
  {
    faultKey: "chicken_wing",
    patterns: [/\bchicken wing\b/i, /\belbow chicken\b/i],
  },
];

export function suggestedFaultFromTitle(title: string): string | null {
  for (const entry of FAULT_KEYWORD_MAP) {
    if (entry.patterns.some((pattern) => pattern.test(title))) {
      return entry.faultKey;
    }
  }
  return null;
}
