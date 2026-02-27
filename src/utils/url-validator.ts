/**
 * URL Validator Utility
 */

export function validateRegistryUrl(url: string): string {
  const defaultUrl = "https://pypi.org";
  if (!url || typeof url !== "string") {
    return defaultUrl;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return url;
    }
  } catch {
    // Fallback to default
  }

  return defaultUrl;
}
