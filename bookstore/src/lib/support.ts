// In-app support chat. Rule-based bot (no LLM) that:
//   - acks the first message with a "we'll be right with you" canned reply
//   - escalates the moment a customer types "gap nguoi", "nguoi that",
//     "human", or "staff" - sets conversation.status = ESCALATED so the
//     staff queue sees it
// The full conversation is always readable by staff with the right
// permission, so escalation is a UI signal, not a data lock.

const ESCALATE = /(gặp người|gap nguoi|người thật|nguoi that|human|staff|nhân viên|nhan vien)/i;

export function shouldEscalate(text: string): boolean {
  return ESCALATE.test(text);
}

export function botReply(text: string): string {
  if (shouldEscalate(text)) {
    return "Ok, em chuyen cho nhan vien ho tro ngay. Cho em xin it phut nhe.";
  }
  // Canned: covers 80% of "how do I…" without an LLM. Anything else
  // bounces up the queue when the customer asks for a person.
  return "Cam on ban da lien he. Bo phan ho tro se phan hoi trong vong 30 phut trong gio hanh chinh. Neu can gap ngay, vui long goi hotline hoac nhan nut 'Gap nguoi' de duoc ho tro truc tiep.";
}

export function isFirstUserMessage(messageCount: number): boolean {
  // The first USER message in a thread is the opener. Bot replies to it.
  return messageCount === 0;
}
