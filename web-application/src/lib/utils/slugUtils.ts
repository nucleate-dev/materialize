const MIN_SLUG_LENGTH = 3;
const MAX_SLUG_LENGTH = 64;

export const normalizeSlug = (slug: string) =>
  slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

export const isValidSlug = (slug: string) =>
  slug.length >= MIN_SLUG_LENGTH &&
  slug.length <= MAX_SLUG_LENGTH &&
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

export const SLUG_RULES = {
  min: MIN_SLUG_LENGTH,
  max: MAX_SLUG_LENGTH,
};
