/**
<<<<<<< HEAD
 * ambientRecorder.ts — Discrete 30-second ambient threat recorder
=======
 * ambientRecorder.ts — Discrete 15-second ambient threat recorder
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
 *
 * Design contract:
 *   1. beginAmbientCapture() — call the INSTANT a panic category is chosen.
 *      Recording starts immediately in background. Returns { attachToPanic }.
 *
 *   2. attachToPanic(panicId, token) — call once the backend returns panic_id.
 *      Waits for recording to finish then uploads silently. Fire-and-forget.
 *
 * Robustness guarantees:
 *   - Never throws — panic activation is unaffected by any recording failure.
 *   - staysActiveInBackground: true — survives the app being minimised
 *     immediately after category selection (the normal civil user flow).
 *   - Requests microphone permission (not just checks) so first-time use works
 *     without having previously opened the audio report screen.
 *   - Uses a custom 16kHz mono preset — LOW_QUALITY on Android uses 8kHz
<<<<<<< HEAD
 *     which is barely intelligible. 16kHz is phone-call quality at ~300KB/30s.
 *   - Restores audio mode after recording so subsequent audio playback works.
 *     Uses centralized AudioManager for consistent behavior across all sound
 *     sources, preventing audio session clashes between ambient recording,
 *     panic alarms, message alerts, and report playback.
 *   - Timeout safety: if recording hangs, a 35-second hard timeout resolves
=======
 *     which is barely intelligible. 16kHz is phone-call quality at ~150KB/15s.
 *   - Restores audio mode after recording so subsequent audio playback works.
 *   - Timeout safety: if recording hangs, a 20-second hard timeout resolves
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
 *     the promise with null so the upload step is not blocked forever.
 */

import { Audio } from 'expo-av';
import axios from 'axios';
import BACKEND_URL from './config';
<<<<<<< HEAD
import { setRecordingAudioMode, restorePlaybackAudioMode } from './AudioManager';

// FIX: was 15 s — security/panics.tsx labels the clip as "30s" to officers.
// Align the actual capture duration with the UI label.
const CAPTURE_DURATION_MS = 30_000;   // 30 seconds exactly
const HARD_TIMEOUT_MS     = 35_000;   // safety net — resolves null if recording hangs
=======

const CAPTURE_DURATION_MS = 15_000;   // 15 seconds exactly
const HARD_TIMEOUT_MS     = 20_000;   // safety net — resolves null if recording hangs
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3

// 16kHz mono — phone-call quality, ~150KB for 15 seconds
// Significantly better than LOW_QUALITY (8kHz) without the size of HIGH_QUALITY
const AMBIENT_RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
<<<<<<< HEAD
    bitRate: 32000,    // 32 kbps — intelligible speech, ~300KB for 30 seconds
=======
    bitRate: 32000,    // 32 kbps — intelligible speech, tiny file
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.LOW,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 32000,
    // linearPCM fields omitted — they only apply to PCM format, not AAC
  },
  web: {},
};

export interface AmbientCapture {
  attachToPanic: (panicId: string, authToken: string) => void;
}

export function beginAmbientCapture(): AmbientCapture {
  let resolveUri: (uri: string | null) => void;
  const uriPromise = new Promise<string | null>(res => { resolveUri = res; });

  _record().then(uri => resolveUri(uri)).catch(() => resolveUri(null));

  return {
    attachToPanic(panicId: string, authToken: string): void {
      _uploadWhenReady(uriPromise, panicId, authToken);
    },
  };
}

// ── Internal ──────────────────────────────────────────────────────────────────

<<<<<<< HEAD
// FIX: Uses centralized AudioManager helper for consistent behavior.
// Neutral audio mode restored after recording ends - allowsRecordingIOS: false
// releases the mic so the OS hands the audio session back to playback callers.
=======
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
async function _record(): Promise<string | null> {
  let recording: Audio.Recording | null = null;

  try {
    // ── Permission: request if not already granted ──────────────────────────
<<<<<<< HEAD
=======
    // We use requestPermissionsAsync (not just getPermissionsAsync) so that
    // first-time users — who haven't been through the audio report screen —
    // are prompted for mic access. If they deny, we return null silently so
    // panic activation still completes normally without any delay.
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      console.log('[AmbientRecorder] Mic permission not granted — skipping capture');
      return null;
    }

<<<<<<< HEAD
    // ── Audio mode — use centralized management ──────────────────────────
    await setRecordingAudioMode();
=======
    // ── Audio mode ──────────────────────────────────────────────────────────
    // Note: interruptionModeIOS was removed in expo-av v14+. Omit it entirely.
    await Audio.setAudioModeAsync({
      allowsRecordingIOS:    true,
      playsInSilentModeIOS:  true,
      staysActiveInBackground: true,   // MUST be true — user minimises app immediately
      shouldDuckAndroid:     true,
    });
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3

    // ── Start recording ─────────────────────────────────────────────────────
    const { recording: rec } = await Audio.Recording.createAsync(
      AMBIENT_RECORDING_OPTIONS,
<<<<<<< HEAD
      undefined,
      100
    );
    recording = rec;

    // ── Wait 30 seconds with hard timeout safety net ────────────────────────
=======
      undefined,   // no status callbacks needed
      100          // update interval irrelevant but required by type
    );
    recording = rec;

    // ── Wait 15 seconds with hard timeout safety net ────────────────────────
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
    await Promise.race([
      new Promise<void>(resolve => setTimeout(resolve, CAPTURE_DURATION_MS)),
      new Promise<void>(resolve => setTimeout(resolve, HARD_TIMEOUT_MS)),
    ]);

    // ── Stop and get URI ────────────────────────────────────────────────────
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI() ?? null;
    recording = null;

<<<<<<< HEAD
    // ── Restore audio mode — ALWAYS awaited so playback is never blocked ────
    // Uses centralized AudioManager helper for consistent behavior.
    await restorePlaybackAudioMode();
=======
    // ── Restore audio mode for playback ────────────────────────────────────
    // CRITICAL: reset ALL fields so subsequent playback (reports, security alarm)
    // is not blocked by the recording-mode audio session.
    await Audio.setAudioModeAsync({
      allowsRecordingIOS:      false,
      playsInSilentModeIOS:    true,
      staysActiveInBackground: false,
      shouldDuckAndroid:       false,
      playThroughEarpieceAndroid: false,
    }).catch(() => {});
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3

    return uri;

  } catch (_) {
<<<<<<< HEAD
    // Clean up recording if it was started
    if (recording) {
      try { await recording.stopAndUnloadAsync(); } catch (__) {}
      recording = null;
    }
    // ALWAYS restore audio mode — even on error — so subsequent playback works
    // Uses centralized AudioManager helper for consistent behavior.
    await restorePlaybackAudioMode();
=======
    // Clean up on any error
    if (recording) {
      try { await recording.stopAndUnloadAsync(); } catch (__) {}
    }
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS:      false,
        playsInSilentModeIOS:    true,
        staysActiveInBackground: false,
        shouldDuckAndroid:       false,
        playThroughEarpieceAndroid: false,
      });
    } catch (__) {}
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
    return null;
  }
}

async function _uploadWhenReady(
  uriPromise: Promise<string | null>,
  panicId: string,
  authToken: string,
): Promise<void> {
  try {
    const uri = await uriPromise;
    if (!uri || !panicId || panicId === 'unknown') return;

    const formData = new FormData();
    formData.append('audio', {
      uri,
      type: 'audio/m4a',
      name: `ambient_${panicId}_${Date.now()}.m4a`,
    } as any);

    await axios.post(
      `${BACKEND_URL}/api/panic/${panicId}/ambient-audio`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30_000,
      }
    );
  } catch (_) {
    // Completely silent — panic is unaffected by upload failure
  }
}
