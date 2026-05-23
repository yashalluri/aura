// Voice mode — Twilio Voice webhook handling.
//
// Flow:
//   1. User calls TWILIO_VOICE_NUMBER → Twilio POSTs /voice/incoming
//   2. We TwiML-respond with <Gather input="speech"> to capture user audio.
//   3. Twilio transcribes via their service OR posts the audio URL — we
//      use ElevenLabs/Whisper depending on what's configured.
//   4. Twilio POSTs the speech result to /voice/process.
//   5. We feed the transcript through generateResponse, get bursts, join
//      them with natural pauses, return TwiML <Say> (Polly) or play an
//      ElevenLabs-generated audio file.
//
// Production wiring requires: Twilio account + voice-capable phone number,
// PUBLIC_BASE_URL reachable from Twilio, optionally ElevenLabs for better
// TTS. Without these, the routes 503 cleanly.

import OpenAI from "openai";
import { env } from "../env.js";
import * as api from "../lib/apiClient.js";
import { generateResponse } from "../llm/aura.js";
import { getHistory, addMessage } from "../lib/conversation.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export function isVoiceEnabled(): boolean {
  return Boolean(
    env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_VOICE_NUMBER,
  );
}

/**
 * TwiML for the initial answer: greet briefly then gather speech.
 */
export function greetingTwiML(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="3" speechTimeout="auto" action="/voice/process" method="POST" language="en-US">
    <Say voice="Polly.Joanna">${escapeXml("yo what's up")}</Say>
  </Gather>
  <Say voice="Polly.Joanna">${escapeXml("ok i'll text u")}</Say>
  <Hangup/>
</Response>`;
}

/**
 * Process a Twilio speech-recognition result. Returns TwiML that speaks
 * Aura's reply and gathers the next utterance. Hangs up when the LLM
 * returns nothing usable.
 */
export async function processSpeech(args: {
  fromPhone: string;
  speechResult: string;
  callSid: string;
}): Promise<string> {
  const { fromPhone, speechResult } = args;

  // Same path as inboundHandler but voice-flavored.
  const user = await api.getOrCreateUser(fromPhone);
  const [contacts, routines, history, memories] = await Promise.all([
    api.getContacts(user.id),
    api.getRoutines(user.id),
    getHistory(user.id),
    api.retrieveMemories(user.id, speechResult, 8).catch(() => [] as api.ApiMemory[]),
  ]);
  await addMessage(user.id, { role: "user", content: speechResult, timestamp: Date.now() });

  const auraResponse = await generateResponse(
    speechResult,
    user,
    contacts,
    routines,
    history,
    memories,
  );

  // For voice we collapse bursts into one fluid sentence with comma breaks
  // — bursts feel weird as audible pauses; comma cadence is more natural.
  const fluid = auraResponse.bursts.join(", ").trim();
  await addMessage(user.id, { role: "assistant", content: fluid, timestamp: Date.now() });

  if (!fluid) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml("yeah idk text me later")}</Say><Hangup/></Response>`;
  }

  // ElevenLabs path: pre-render audio, host the URL, <Play>. For v1
  // skeleton we use Twilio Polly (no extra account needed).
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(fluid)}</Say>
  <Gather input="speech" timeout="4" speechTimeout="auto" action="/voice/process" method="POST" language="en-US"/>
  <Say voice="Polly.Joanna">${escapeXml("ok ill text u")}</Say>
  <Hangup/>
</Response>`;
}

/**
 * If you connect ElevenLabs, this fetches a fluent TTS audio file and
 * returns it as base64. Production: cache to S3/R2 and return a URL, then
 * use <Play> in TwiML. v1 skeleton: function exists, not wired into the
 * /voice/process path yet.
 */
export async function synthesizeElevenLabs(text: string): Promise<Buffer | null> {
  if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_VOICE_ID) return null;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${env.ELEVENLABS_VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  );
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Whisper transcription — if you'd rather use Whisper than Twilio's STT.
 * Twilio's built-in `input="speech"` is decent and avoids a download round-trip,
 * so v1 uses it. This helper exists for paths that download Twilio recordings.
 */
export async function transcribeWithWhisper(audioBuffer: Buffer, filename = "audio.wav"): Promise<string | null> {
  try {
    const file = new File([audioBuffer], filename, { type: "audio/wav" });
    const res = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
    });
    return res.text ?? null;
  } catch (err) {
    console.error("whisper failed", err);
    return null;
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
