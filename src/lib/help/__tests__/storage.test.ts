/**
 * @jest-environment jsdom
 */
import {
  dismissIntro,
  isIntroDismissed,
  introKey,
  markTourCompleted,
  isTourCompleted,
  tourKey,
  resetIntro,
} from "../storage";

describe("help storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("intro key is versioned", () => {
    expect(introKey("/admin-v2/financing", 1)).toBe("help:intro:/admin-v2/financing:v1");
    expect(introKey("/admin-v2/financing", 2)).toBe("help:intro:/admin-v2/financing:v2");
  });

  it("dismissed intro becomes visible again on version bump", () => {
    dismissIntro("/admin-v2/projects", 1);
    expect(isIntroDismissed("/admin-v2/projects", 1)).toBe(true);
    expect(isIntroDismissed("/admin-v2/projects", 2)).toBe(false);
  });

  it("resetIntro removes the dismissed flag", () => {
    dismissIntro("/admin-v2/projects", 1);
    resetIntro("/admin-v2/projects", 1);
    expect(isIntroDismissed("/admin-v2/projects", 1)).toBe(false);
  });

  it("tour completion is versioned", () => {
    expect(tourKey("financing-add", 1)).toBe("help:tour:financing-add:completed:v1");
    markTourCompleted("financing-add", 1);
    expect(isTourCompleted("financing-add", 1)).toBe(true);
    expect(isTourCompleted("financing-add", 2)).toBe(false);
  });

  it("survives when localStorage throws (e.g. private mode)", () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = jest.fn(() => {
      throw new Error("QuotaExceeded");
    });
    expect(() => dismissIntro("/admin-v2/x", 1)).not.toThrow();
    window.localStorage.setItem = original;
  });
});
