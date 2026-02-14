/**
 * Encode a list of wowhead IDs to a base64 string for URL sharing
 */
export function encodeWishlist(ids: number[]): string {
  if (ids.length === 0) return '';

  const json = JSON.stringify({ ids: ids.sort((a, b) => a - b) });
  // Use btoa for base64 encoding (works in browser)
  return btoa(json);
}

/**
 * Decode a base64 string back to a list of wowhead IDs
 */
export function decodeWishlist(encoded: string): number[] {
  if (!encoded) return [];

  try {
    const json = atob(encoded);
    const data = JSON.parse(json);

    if (data && Array.isArray(data.ids)) {
      return data.ids.filter((id: unknown): id is number =>
        typeof id === 'number' && id > 0 && Number.isInteger(id)
      );
    }

    return [];
  } catch {
    console.warn('Failed to decode wishlist URL:', encoded);
    return [];
  }
}

/**
 * Generate a shareable URL for the wishlist
 */
export function generateWishlistUrl(ids: number[]): string {
  const encoded = encodeWishlist(ids);
  if (!encoded) return window.location.origin + '/wishlist';

  return `${window.location.origin}/wishlist?items=${encoded}`;
}

/**
 * Parse wowhead IDs from URL search params
 */
export function parseWishlistFromUrl(searchParams: URLSearchParams): number[] {
  const items = searchParams.get('items');
  if (!items) return [];

  return decodeWishlist(items);
}
