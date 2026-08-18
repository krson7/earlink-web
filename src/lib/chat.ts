export const MAX_CHAT_MESSAGE_LENGTH = 1000;
export const MAX_CHAT_RECONNECT_ATTEMPTS = 5;

export function createLocalMessageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}