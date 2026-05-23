// Multimodal inbound — vision for forwarded images, Whisper for voice notes.
//
// Photon's space.send accepts text; the inbound message can be text, image,
// audio, or attachment. Sprint 1 only handled text; Sprint 11 routes
// non-text content through OpenAI vision/audio APIs and feeds the
// resulting transcript or description back into the normal text path.

import OpenAI from "openai";
import { env } from "../env.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const VISION_MODEL = "gpt-5.4-mini";
const WHISPER_MODEL = "whisper-1";

/**
 * Describe an image the user forwarded to Aura (e.g. a screenshot of a
 * text from someone else, a photo of a whiteboard, a picture of food).
 * Returned text is fed into the conversation pipeline as if the user
 * had typed it: "[shared photo: <description>] <optional caption>".
 */
export async function describeImage(opts: {
  imageUrl?: string;
  imageBase64?: string;
  caption?: string;
}): Promise<string | null> {
  if (!opts.imageUrl && !opts.imageBase64) return null;
  try {
    const imageSource = opts.imageBase64
      ? `data:image/jpeg;base64,${opts.imageBase64}`
      : opts.imageUrl!;
    const completion = await openai.chat.completions.create({
      model: VISION_MODEL,
      messages: [
        {
          role: "system",
          content: `You describe images for an AI texting assistant called Aura.
The image is something the user shared with their friend Aura. Common categories:
- a screenshot of a text from someone else (transcribe the visible messages)
- a photo of food, a place, an outfit, a meme
- a photo of a whiteboard / notes / handwritten content (transcribe)
- a meme or screenshot from social media
Describe IN ONE PARAGRAPH (max 60 words) what's in the image, including
transcribed text. Be specific. Don't preamble with "I see" — just describe.
If it's a text screenshot, format as: "screenshot from <sender>: <messages>".`,
        },
        {
          role: "user",
          content: [
            ...(opts.caption ? [{ type: "text" as const, text: `Caption: ${opts.caption}` }] : []),
            {
              type: "image_url" as const,
              image_url: { url: imageSource, detail: "low" as const },
            },
          ],
        },
      ],
      max_tokens: 200,
      temperature: 0.2,
    });
    return completion.choices[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    console.error("describeImage failed", err);
    return null;
  }
}

/**
 * Transcribe a voice note. Returns the transcript string.
 */
export async function transcribeAudio(opts: {
  audioBuffer: Buffer;
  filename?: string;
}): Promise<string | null> {
  try {
    const filename = opts.filename ?? "voice.m4a";
    const file = new File([opts.audioBuffer], filename, { type: "audio/mp4" });
    const res = await openai.audio.transcriptions.create({
      file,
      model: WHISPER_MODEL,
    });
    return res.text?.trim() ?? null;
  } catch (err) {
    console.error("transcribeAudio failed", err);
    return null;
  }
}

/**
 * Given a Photon inbound message, return the *text representation* that
 * should be fed into the LLM. Returns null when the content isn't
 * supported (e.g. an attachment type we don't handle).
 *
 * Adapter shape kept loose because Spectrum's exact discriminator naming
 * varies across SDK versions.
 */
export interface PhotonMessageContent {
  type: string; // "text" | "image" | "audio" | "attachment" | ...
  text?: string;
  url?: string;        // CDN URL for image/audio when Spectrum hosts
  base64?: string;     // alternative inline encoding
  caption?: string;    // accompanying text for non-text content
  mimeType?: string;
}

export async function normalizeInboundToText(content: PhotonMessageContent): Promise<string | null> {
  if (content.type === "text") {
    return content.text ?? null;
  }

  if (content.type === "image") {
    const description = await describeImage({
      imageUrl: content.url,
      imageBase64: content.base64,
      caption: content.caption,
    });
    if (!description) return null;
    return `[image shared] ${description}${content.caption ? `\nuser said: ${content.caption}` : ""}`;
  }

  if (content.type === "audio" || content.type === "voice") {
    if (!content.url && !content.base64) return null;
    let buf: Buffer | null = null;
    if (content.url) {
      try {
        const r = await fetch(content.url);
        if (!r.ok) return null;
        buf = Buffer.from(await r.arrayBuffer());
      } catch {
        return null;
      }
    } else if (content.base64) {
      buf = Buffer.from(content.base64, "base64");
    }
    if (!buf) return null;
    const transcript = await transcribeAudio({ audioBuffer: buf });
    if (!transcript) return null;
    return `[voice note] ${transcript}`;
  }

  // Unknown content type — surface a placeholder so memory has something
  // to anchor on but the LLM knows not to over-interpret.
  return `[unsupported attachment: ${content.type}]`;
}
