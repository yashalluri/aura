export type ChannelKind = "imessage" | "voice";

export interface InboundMessage {
  channel: ChannelKind;
  senderPhone: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: string;
  isIMessage?: boolean;
  receivedAt: Date;
}

export interface OutboundResult {
  providerSid?: string;
  sentAt: Date;
}

export interface Channel {
  kind: ChannelKind;
  send(toPhone: string, text: string): Promise<OutboundResult>;
  sendMedia(toPhone: string, mediaUrl: string, body?: string): Promise<OutboundResult>;
}
