export type DiffLine = {
  path: string;
  before: unknown;
  after: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function walk(before: unknown, after: unknown, path: string, out: DiffLine[]) {
  if (Object.is(before, after)) {
    return;
  }
  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      walk(before[key], after[key], path ? `${path}.${key}` : key, out);
    }
    return;
  }
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return;
  }
  out.push({ path: path || "(root)", before, after });
}

export function diffPayloads(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): DiffLine[] {
  const lines: DiffLine[] = [];
  walk(before, after, "", lines);
  return lines;
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "string") {
    return value === "" ? "—" : value;
  }
  return JSON.stringify(value);
}
