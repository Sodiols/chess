import { afterEach, vi } from "vitest";

// Logic suites run in node; only the component suites need the DOM shims below.
if (typeof document !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  afterEach(cleanup);

  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );

  // jsdom ships no Web Audio, and every move plays a cue.
  class SilentAudioContext {
    state = "running";
    currentTime = 0;
    destination = {};
    createOscillator() {
      return {
        type: "triangle",
        frequency: { setValueAtTime: () => {} },
        connect: () => ({ connect: () => {} }),
        start: () => {},
        stop: () => {},
      };
    }
    createGain() {
      return {
        gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        connect: () => ({ connect: () => {} }),
      };
    }
    resume() {
      return Promise.resolve();
    }
  }
  vi.stubGlobal("AudioContext", SilentAudioContext);

  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
    };
  }
}
