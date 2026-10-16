const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/**
 * Pulls every email address out of a CSV or plain-text file, wherever it sits
 * (any column, any separator), lower-cased and de-duplicated in file order.
 */
export function extractEmails(text: string) {
  return [...new Set((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))];
}

export function isEmail(value: string) {
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value.trim());
}
