// The message you just sent flies up out of the composer into the chat. The composer marks the text it
// sent; the matching new bubble (and only that one) plays the flight once.
let sent: { text: string; at: number } | null = null;

export function markSent(text: string) {
  sent = text.trim() ? { text: text.trim(), at: Date.now() } : null;
}

export function takeFlight(text: string): boolean {
  if (!sent || sent.text !== text.trim() || Date.now() - sent.at > 6000) return false;
  sent = null;
  return true;
}
