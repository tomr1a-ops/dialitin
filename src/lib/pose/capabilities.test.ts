import { describe, expect, test } from "vitest";
import {
  isWorkerScriptLoadFailure,
  posePathsToTry,
} from "@/lib/pose/capabilities";

describe("posePathsToTry", () => {
  test("tries Worker+GPU, then Worker+CPU, then main-thread GPU/CPU", () => {
    expect(
      posePathsToTry({
        moduleWorker: true,
        webgl: true,
        offscreenCanvas: true,
      }).map((path) => path.id),
    ).toEqual([
      "worker+GPU",
      "worker+CPU",
      "main-thread+GPU",
      "main-thread+CPU",
    ]);
  });

  test("skips GPU when WebGL is missing and skips workers when they cannot load", () => {
    expect(
      posePathsToTry({
        moduleWorker: true,
        webgl: false,
        offscreenCanvas: true,
      }).map((path) => path.id),
    ).toEqual(["worker+CPU", "main-thread+CPU"]);

    expect(
      posePathsToTry({
        moduleWorker: false,
        webgl: true,
        offscreenCanvas: false,
      }).map((path) => path.id),
    ).toEqual(["main-thread+GPU", "main-thread+CPU"]);
  });

  test("does not treat a GPU ModuleFactory failure as a worker-script miss", () => {
    expect(isWorkerScriptLoadFailure("ModuleFactory not set.")).toBe(false);
    expect(isWorkerScriptLoadFailure("Pose worker failed to load")).toBe(true);
  });
});
