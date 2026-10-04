/** 081234569950 -> 0812****9950 (SPEC: never log full phone numbers). */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.length <= 8) return '****';
  return `${digits.slice(0, 4)}****${digits.slice(-4)}`;
}

/** nama@domain.com -> na***@domain.com */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!user || !domain) return '****';
  return `${user.slice(0, 2)}***@${domain}`;
}

const PHONE = /(?:\+62|62|0)8\d{7,12}/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/** Masks every phone number and email inside free text before it reaches application logs. */
export function maskPii(text: string): string {
  return text.replace(PHONE, (m) => maskPhone(m)).replace(EMAIL, (m) => maskEmail(m));
}
