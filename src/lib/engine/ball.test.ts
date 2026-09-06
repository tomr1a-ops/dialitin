import { describe, expect, test } from "vitest";
import {
  classifyStartLine,
  findBallBlobAtAddress,
  type BallCentroid,
} from "@/lib/engine/ball";

function syntheticImage(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { data, width, height } as ImageData;
}

describe("findBallBlobAtAddress", () => {
  test("finds white ball on green turf", () => {
    const w = 400;
    const h = 600;
    const image = syntheticImage(w, h, (x, y) => {
      if ((x - 180) ** 2 + (y - 400) ** 2 < 10 ** 2) {
        return [245, 245, 240];
      }
      return [30, 120, 40];
    });
    const result = findBallBlobAtAddress({
      image,
      handNorm: { x: 0.48, y: 0.58 },
      stanceWidthPx: 100,
      imageWidth: w,
      imageHeight: h,
    });
    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.centroid.x).toBeGreaterThanOrEqual(0.44);
      expect(result.centroid.x).toBeLessThan(0.55);
      expect(result.quality).toBeGreaterThan(0.2);
    }
  });

  test("finds yellow ball on mat", () => {
    const w = 400;
    const h = 600;
    const image = syntheticImage(w, h, (x, y) => {
      if ((x - 180) ** 2 + (y - 400) ** 2 < 10 ** 2) {
        return [240, 220, 60];
      }
      return [180, 160, 140];
    });
    const result = findBallBlobAtAddress({
      image,
      handNorm: { x: 0.48, y: 0.58 },
      stanceWidthPx: 100,
      imageWidth: w,
      imageHeight: h,
    });
    expect(result.status).toBe("found");
  });

  test("reports not_found when no ball", () => {
    const w = 400;
    const h = 600;
    const image = syntheticImage(w, h, () => [30, 120, 40]);
    const result = findBallBlobAtAddress({
      image,
      handNorm: { x: 0.5, y: 0.6 },
      stanceWidthPx: 120,
      imageWidth: w,
      imageHeight: h,
    });
    expect(result.status).toBe("not_found");
  });
});

describe("classifyStartLine", () => {
  test("left start from synthetic track", () => {
    const track: BallCentroid[] = [
      { x: 0.5, y: 0.5 },
      { x: 0.48, y: 0.49 },
      { x: 0.46, y: 0.48 },
      { x: 0.44, y: 0.47 },
      { x: 0.42, y: 0.46 },
    ];
    const result = classifyStartLine({
      track,
      angle: null,
      imageWidth: 1080,
    });
    expect(result.line).toBe("left");
    expect(result.confidence).toBeGreaterThan(0.4);
  });

  test("zero confidence when fewer than 4 frames", () => {
    const track: BallCentroid[] = [
      { x: 0.5, y: 0.5 },
      { x: 0.48, y: 0.49 },
    ];
    const result = classifyStartLine({
      track,
      angle: null,
      imageWidth: 1080,
    });
    expect(result.confidence).toBe(0);
  });
});
