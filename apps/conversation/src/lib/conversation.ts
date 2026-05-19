export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

const MAX_MESSAGES = 20;
const EXPIRE_MS = 4 * 60 * 60 * 1000; // 4 hours — conversations reset after inactivity

const store = new Map<string, Message[]>();

export function getHistory(phone: string): Message[] {
  const msgs = store.get(phone);
  if (!msgs) return [];

  // Expire old conversations
  const last = msgs[msgs.length - 1];
  if (last && Date.now() - last.timestamp > EXPIRE_MS) {
    store.delete(phone);
    return [];
  }
  return msgs;
}

export function addMessage(phone: string, msg: Message): void {
  let msgs = store.get(phone);
  if (!msgs) {
    msgs = [];
    store.set(phone, msgs);
  }
  msgs.push(msg);
  // Keep last N messages
  if (msgs.length > MAX_MESSAGES) {
    msgs.splice(0, msgs.length - MAX_MESSAGES);
  }
}

export function clearHistory(phone: string): void {
  store.delete(phone);
}
