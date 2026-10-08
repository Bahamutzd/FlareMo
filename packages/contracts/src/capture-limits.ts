// Plain capture limits, kept apart from the zod schemas in ./capture so the
// web app's startup code can read them without pulling zod into its first
// download.

export const CAPTURE_SAMPLE_RATE = 16_000;
export const CAPTURE_MAX_FRAME_BYTES = 6_400;
export const CAPTURE_MAX_TEXT = 90_000;
export const CAPTURE_MAX_DURATION_MS = 60 * 60_000;

// Batch (MiniMax) transcription (rollout §3, asr-minimax.md). The provider's
// hard limit is 500 s / 50 MB per request; clients slice below both, and the
// Worker proxy buffers at most one slice.
export const CAPTURE_BATCH_SLICE_MS = 480_000;
export const CAPTURE_BATCH_MAX_BYTES = 16 * 1024 * 1024;
