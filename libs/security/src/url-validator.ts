/**
 * SSRF URL Validator — libs/security/src/url-validator.ts
 *
 * Validates that a URL is safe to fetch as an external image resource.
 * Blocks private IP ranges, localhost, and cloud metadata endpoints.
 * Allows only explicitly safelisted CDN/storage domains.
 */

export class SsrfBlockedError extends Error {
  constructor(url: string, reason: string) {
    super(`SSRF protection blocked URL "${url}": ${reason}`);
    this.name = 'SsrfBlockedError';
  }
}

// ── Blocked hostname patterns ─────────────────────────────────────────────────

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '0.0.0.0',
  '::1',
  '169.254.169.254', // AWS/GCP/Azure IMDS
  'metadata.google.internal',
  '100.100.100.200',  // Alibaba Cloud IMDS
]);

/**
 * Private / link-local IPv4 CIDR ranges to block:
 *   10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16
 */
function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false; // Not a valid dotted-decimal IPv4
  }
  const [a, b] = parts;
  return (
    a === 10 ||                          // 10.0.0.0/8
    a === 127 ||                         // 127.0.0.0/8 (loopback)
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) ||          // 192.168.0.0/16
    (a === 169 && b === 254)             // 169.254.0.0/16 (link-local / IMDS)
  );
}

// ── Allowed external domains ──────────────────────────────────────────────────

/**
 * Exact hostname suffixes that are permitted for external image fetching.
 * A hostname is allowed if it equals a safelisted entry OR ends with a
 * safelisted entry preceded by a dot (e.g. "cdn.shopify.com" for ".shopify.com").
 */
const ALLOWED_HOSTNAME_SUFFIXES = [
  // Shopify CDN
  'cdn.shopify.com',
  'shopifycdn.com',
  'shopifycloud.com',
  'cdn.shopifycloud.com',
  // Cloudflare R2 / public CDN
  'r2.dev',
  'r2.cloudflarestorage.com',
  'cloudflare.com',
  // Virtual-Trail own assets
  'virtual-trail.com',
  'virtual-trail.pages.dev',
  'onrender.com',
  // Unsplash (used for mock mode only, safe to retain)
  'images.unsplash.com',
];

function isAllowedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return ALLOWED_HOSTNAME_SUFFIXES.some(
    (suffix) => lower === suffix || lower.endsWith(`.${suffix}`)
  );
}

// ── Main validator ─────────────────────────────────────────────────────────────

/**
 * Validates that a URL is safe to fetch as an external image source.
 *
 * Throws {@link SsrfBlockedError} if the URL is:
 * - Not using http or https
 * - Targeting a private/loopback IP range
 * - Targeting a blocked hostname (e.g. cloud metadata endpoints)
 * - Not on the domain allowlist
 *
 * @param rawUrl - The URL string to validate
 * @throws {SsrfBlockedError} when the URL is blocked
 */
export function validateExternalImageUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError(rawUrl, 'URL is malformed and cannot be parsed');
  }

  // 1. Only allow http and https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfBlockedError(rawUrl, `Protocol "${parsed.protocol}" is not permitted`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Reject explicitly blocked hostnames (metadata endpoints, etc.)
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new SsrfBlockedError(rawUrl, `Hostname "${hostname}" is explicitly blocked`);
  }

  // 3. Reject private / loopback IPv4 addresses
  if (isPrivateIpv4(hostname)) {
    throw new SsrfBlockedError(rawUrl, `Hostname "${hostname}" resolves to a private IP range`);
  }

  // 4. Reject raw IPv6 addresses (bracket notation) — too broad to safely allowlist
  if (parsed.hostname.startsWith('[')) {
    throw new SsrfBlockedError(rawUrl, 'IPv6 addresses are not permitted');
  }

  // 5. Enforce domain allowlist
  if (!isAllowedHostname(hostname)) {
    throw new SsrfBlockedError(
      rawUrl,
      `Hostname "${hostname}" is not on the approved domain allowlist`
    );
  }
}
