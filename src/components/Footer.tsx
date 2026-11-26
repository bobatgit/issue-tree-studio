/**
 * The one frame every view shares.
 *
 * The state of this view sits on the left and the app's build on the right, so
 * the three views read as one application rather than three, and the build is
 * reachable from anywhere. One class serves all three, so they cannot drift
 * apart the way the legend and the section labels did.
 */

import type { PropsWithChildren } from "react";
import { BUILD_STAMP, REPO_URL } from "../lib/appInfo";

interface Props {
  /** An extra class for a state of the view, such as the markdown over-cap colour. */
  tone?: string;
}

export function Footer({ children, tone = "" }: PropsWithChildren<Props>) {
  return (
    <div className={`markdown-foot ${tone}`.trim()}>
      {children}
      <span className="spacer" />
      <a
        className="footer-build"
        href={`${REPO_URL}/releases`}
        target="_blank"
        rel="noreferrer"
        title="App build. Open releases for the change list."
      >
        {BUILD_STAMP}
      </a>
    </div>
  );
}
