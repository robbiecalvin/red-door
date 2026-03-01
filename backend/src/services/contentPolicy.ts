const DISALLOWED_KID_VARIATION_PATTERN =
  /(^|[^a-z0-9])k+[\W_]*[i1!|l]+[\W_]*d+(?:[\W_]*(?:s|z|do|dos|dy|die|dies))?(?=$|[^a-z0-9])/i;

export function containsDisallowedKidVariation(value: string): boolean {
  if (value.trim().length === 0) return false;
  return DISALLOWED_KID_VARIATION_PATTERN.test(value);
}
