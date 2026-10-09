// AGM rule: the client portal never sees guard identities. Report titles are
// built from the officer's name at submission time ("Daily Activity Report -
// Jane Doe"), so anything portal-facing must scrub the name back out.
export function scrubOfficerName(
  text: string,
  officerName: string | null | undefined,
): string {
  const name = officerName?.trim();
  if (!name || !text) return text;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    // "... - Jane Doe" suffix/infix: drop the separator with the name.
    .replace(new RegExp(`\\s*[-–—:]\\s*${escaped}`, "gi"), "")
    // Any other occurrence: neutral role instead of the identity.
    .replace(new RegExp(escaped, "gi"), "patrol officer")
    .trim();
}
