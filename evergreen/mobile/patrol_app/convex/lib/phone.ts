/**
 * Termii rejects local-format numbers outright:
 *
 *   { "to": "09032950785" }
 *   -> 400 { "message": "Phone number is expected in international format." }
 *
 * Nobody types a number that way into an admin settings box, though — an
 * operations manager adding an emergency contact writes "09032950785", and
 * before this normalization that produced an emergency alert that was accepted
 * by the UI, stored, and then silently never delivered. For the panic button
 * that failure mode is the worst one available, so the conversion happens at the
 * single choke point every SMS passes through rather than at each call site.
 */

/** Country code assumed for local-format numbers. Nigeria unless overridden. */
function defaultCountryCode(): string {
  return process.env.SMS_DEFAULT_COUNTRY_CODE?.trim() || "234";
}

/**
 * Convert a phone number to the bare international format Termii expects
 * (digits only, country code first, no leading + or 00).
 *
 * Anything already international is passed through untouched, so a contact list
 * mixing "09032950785", "+234 903 295 0785" and "2349032950785" all resolve to
 * the same recipient.
 */
export function normalizePhoneNumber(raw: string): string {
  // Strip spaces, dashes, dots and parentheses — all common in typed numbers.
  let digits = raw.replace(/[\s\-().]/g, "");

  if (digits.startsWith("+")) {
    digits = digits.slice(1);
  } else if (digits.startsWith("00")) {
    // 00 is the international dialling prefix in most of Europe/Africa.
    digits = digits.slice(2);
  }

  // Drop anything that is still not a digit rather than passing junk to Termii.
  digits = digits.replace(/\D/g, "");
  if (!digits) return "";

  const cc = defaultCountryCode();

  // A national number written with the trunk prefix: 0803… -> 234803…
  if (digits.startsWith("0")) {
    return `${cc}${digits.replace(/^0+/, "")}`;
  }

  // Already carries the country code.
  if (digits.startsWith(cc)) {
    return digits;
  }

  // A Nigerian subscriber number with neither trunk prefix nor country code
  // ("9032950785" — 10 digits). Longer strings are assumed to be some other
  // country's international number and are left alone.
  if (digits.length === 10) {
    return `${cc}${digits}`;
  }

  return digits;
}
