import { afterAll, afterEach, beforeAll, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { toHaveNoViolations } from "jest-axe";
import { server } from "./handlers/server";

expect.extend(toHaveNoViolations);

const hasDom = typeof window !== "undefined";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });

  if (!hasDom) {
    return;
  }

  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }

  const globalWithObserver = globalThis as typeof globalThis & {
    IntersectionObserver?: typeof IntersectionObserver;
    ResizeObserver?: typeof ResizeObserver;
  };

  if (!globalWithObserver.ResizeObserver) {
    class NoopResizeObserver implements ResizeObserver {
      observe = () => {};
      unobserve = () => {};
      disconnect = () => {};
    }

    globalWithObserver.ResizeObserver = NoopResizeObserver;
  }

  if (!globalWithObserver.IntersectionObserver) {
    class NoopIntersectionObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "";
      readonly scrollMargin = "";
      readonly thresholds: readonly number[] = [];
      observe = () => {};
      unobserve = () => {};
      disconnect = () => {};
      takeRecords = (): IntersectionObserverEntry[] => [];
    }

    globalWithObserver.IntersectionObserver = NoopIntersectionObserver;
  }

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }

  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () => new DOMRect();
  }

  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () =>
      Object.assign([], {
        item: () => null,
      }) as unknown as DOMRectList;
  }

  if (!Document.prototype.elementFromPoint) {
    Document.prototype.elementFromPoint = () => null;
  }
});

afterEach(() => {
  if (hasDom) {
    cleanup();
  }

  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
