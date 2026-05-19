import { imessage } from "spectrum-ts/providers/imessage";
import type { Channel, OutboundResult } from "@aura/shared";
import { getSpectrumApp } from "../spectrum.js";

export const iMessageChannel: Channel = {
  kind: "imessage",

  async send(toPhone: string, text: string): Promise<OutboundResult> {
    const app = await getSpectrumApp();
    const im = imessage(app);
    const user = await im.user(toPhone);
    const space = await im.space(user);
    await space.send(text);
    return { sentAt: new Date() };
  },

  async sendMedia(
    _toPhone: string,
    _mediaUrl: string,
    _body?: string,
  ): Promise<OutboundResult> {
    // Stub. Voice memos (Phase 8) and multi-modal (Phase 9) will implement this
    // against spectrum-ts's attachment() ContentBuilder.
    throw new Error("sendMedia not implemented yet");
  },
};
