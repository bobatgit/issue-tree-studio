/** Build identity and support links. */

export const APP_VERSION = __APP_VERSION__;
export const BUILD_SHA = __BUILD_SHA__;
export const BUILD_STAMP = `${APP_VERSION} · ${BUILD_SHA}`;

export const REPO_URL = "https://github.com/bobatgit/issue-tree-studio";
export const NEW_ISSUE_URL = `${REPO_URL}/issues/new/choose`;

export function browserMeta(): {
  url: string;
  userAgent: string;
  viewport: string;
  now: Date;
} {
  return {
    url: typeof window === "undefined" ? "unknown" : window.location.href,
    userAgent: typeof navigator === "undefined" ? "unknown" : navigator.userAgent,
    viewport: typeof window === "undefined" ? "unknown" : `${window.innerWidth} × ${window.innerHeight}`,
    now: new Date(),
  };
}
