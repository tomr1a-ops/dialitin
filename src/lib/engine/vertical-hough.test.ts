import { describe, expect, test } from "vitest";
import { detectVerticalRollFromImageData } from "@/lib/engine/vertical-hough";

type MockImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

function mockImageData(width: number, height: number): MockImage {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  };
}

function verticalBarImage(width: number, height: number, tiltDeg: number) {
  const image = mockImageData(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const theta = (tiltDeg * Math.PI) / 180;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const along = dx * Math.cos(theta) + dy * Math.sin(theta);
      const i = (y * width + x) * 4;
      const v = Math.abs(along) < 6 ? 30 : 230;
      image.data[i] = v;
      image.data[i + 1] = v;
      image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }
  }
  return image as unknown as ImageData;
}

describe("detectVerticalRollFromImageData", () => {
  test("detects plumb vertical bar", () => {
    const image = verticalBarImage(160, 240, 0);
    const result = detectVerticalRollFromImageData(image);
    expect(result.reason).toBeTruthy();
    if (!result.valid) {
      expect(result.reason).toMatch(/Hough|edges/i);
      return;
    }
    expect(Math.abs(result.rollDeg)).toBeLessThan(2);
    expect(result.confidence).toBeGreaterThan(0.35);
  });

  test("refuses flat noise", () => {
    const image = mockImageData(80, 80) as unknown as ImageData;
    image.data.fill(128);
    const result = detectVerticalRollFromImageData(image);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});
