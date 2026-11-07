export type SoundName =
  | "move"
  | "capture"
  | "castle"
  | "check"
  | "promote"
  | "illegal"
  | "gameEnd";

interface Tone {
  frequency: number;
  /** Seconds from the moment the cue starts. */
  at: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
}

/**
 * Cues are synthesised rather than loaded so the app ships no audio files and
 * stays instant offline. Each is a short, dry knock in the wooden-board register.
 */
const CUES: Record<SoundName, Tone[]> = {
  move: [{ frequency: 196, at: 0, duration: 0.09, gain: 0.32 }],
  capture: [
    { frequency: 132, at: 0, duration: 0.13, gain: 0.38 },
    { frequency: 88, at: 0.01, duration: 0.11, gain: 0.22, type: "square" },
  ],
  castle: [
    { frequency: 196, at: 0, duration: 0.08, gain: 0.28 },
    { frequency: 174, at: 0.1, duration: 0.09, gain: 0.28 },
  ],
  check: [
    { frequency: 587, at: 0, duration: 0.1, gain: 0.2 },
    { frequency: 784, at: 0.08, duration: 0.14, gain: 0.2 },
  ],
  promote: [
    { frequency: 523, at: 0, duration: 0.09, gain: 0.18 },
    { frequency: 659, at: 0.07, duration: 0.09, gain: 0.18 },
    { frequency: 880, at: 0.14, duration: 0.16, gain: 0.18 },
  ],
  illegal: [{ frequency: 92, at: 0, duration: 0.12, gain: 0.24, type: "square" }],
  gameEnd: [
    { frequency: 392, at: 0, duration: 0.16, gain: 0.22 },
    { frequency: 294, at: 0.14, duration: 0.16, gain: 0.22 },
    { frequency: 196, at: 0.28, duration: 0.3, gain: 0.22 },
  ],
};

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  // Browsers suspend the context until a gesture; every cue follows one.
  if (context.state === "suspended") void context.resume();
  return context;
}

export function playSound(name: SoundName): void {
  const ctx = getContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  for (const tone of CUES[name]) {
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();

    oscillator.type = tone.type ?? "triangle";
    oscillator.frequency.setValueAtTime(tone.frequency, now + tone.at);

    envelope.gain.setValueAtTime(0.0001, now + tone.at);
    envelope.gain.exponentialRampToValueAtTime(tone.gain, now + tone.at + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + tone.at + tone.duration);

    oscillator.connect(envelope).connect(ctx.destination);
    oscillator.start(now + tone.at);
    oscillator.stop(now + tone.at + tone.duration + 0.02);
  }
}
