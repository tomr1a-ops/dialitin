const APEX_SITE_URL = "https://dialitin.ai";

export function getSiteUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fromEnv) {
    return canonicalizeSiteUrl(fromEnv);
  }
  return APEX_SITE_URL;
}

function canonicalizeSiteUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "www.dialitin.ai") {
      parsed.hostname = "dialitin.ai";
    }
    return parsed.origin;
  } catch {
    return url;
  }
}

export function getMagicLinkRedirectTo() {
  return `${getSiteUrl()}/admin/auth/callback`;
}
