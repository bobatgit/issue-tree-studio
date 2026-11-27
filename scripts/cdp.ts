/**
 * Minimal Chrome DevTools Protocol client for the visual gates.
 *
 * The two gate scripts need the same four things: a page opened at a fixed
 * size, a document seeded into sessionStorage before the app boots, values read
 * out of the page, and a screenshot. This file provides exactly those.
 *
 * It uses the WebSocket global that Node 22 ships, so there is no new
 * dependency, and it only ever talks to the local debugging port.
 */

export const CDP_PORT: string = process.env.CDP_PORT ?? "9222";
/**
 * Vite 5 binds `localhost`, which on this machine is IPv6 only, so the gate has
 * to try both loopback families before it gives up. Set APP_URL to skip the
 * search and pin one address.
 */
export const APP_URL: string = process.env.APP_URL ?? "";

const APP_CANDIDATES: string[] = APP_URL
  ? [APP_URL]
  : ["http://127.0.0.1:5173/", "http://[::1]:5173/", "http://localhost:5173/"];

/** Shown when one of the two moving parts is missing, instead of hanging. */
export const SETUP_HINT: string = [
  "The visual gates need two things running:",
  "",
  "  1. the app             npm run dev",
  `  2. a headless browser  msedge --headless=new --remote-debugging-port=${CDP_PORT} --user-data-dir=temp/edge-cdp about:blank`,
  "",
  "These gates are local only. CI has no browser, so it never runs them.",
].join("\n");

/** The app reports ready when it has left its loading state. */
const READY = "!!document.querySelector('.app') && !document.body.innerText.includes('Opening your trees')";

const WS_OPEN = 1;

export interface Metrics {
  fontSize: number;
  fontWeight: number;
  /** 0 when the computed line height is `normal`. */
  lineHeight: number;
  color: string;
  background: string;
  stroke: string;
  /** Left padding in CSS pixels, for checking an inset. */
  paddingLeft: number;
  /** Stroke width in SVG user units, as computed. 0 for a non-SVG element. */
  strokeWidth: number;
  /** The same stroke in CSS pixels, which is what the eye sees. */
  strokePx: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  text: string;
}

export interface OpenOptions {
  /** Source evaluated before the app boots, used to seed sessionStorage. */
  seed?: string;
  width?: number;
  height?: number;
  mobile?: boolean;
  /** Milliseconds to wait after the app reports ready, for layout to settle. */
  settle?: number;
  url?: string;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface CdpMessage {
  id?: number;
  method?: string;
  result?: unknown;
  error?: { message: string };
  params?: {
    type?: string;
    args?: { value?: unknown; description?: string }[];
    exceptionDetails?: { text?: string; exception?: { description?: string } };
  };
}

interface Target {
  id: string;
  webSocketDebuggerUrl: string;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

async function reachable(url: string, method = "GET"): Promise<boolean> {
  try {
    const response = await fetch(url, { method, signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

/** The first address the app actually answers on. */
async function resolveApp(): Promise<string | null> {
  for (const candidate of APP_CANDIDATES) {
    if (await reachable(candidate)) return candidate;
  }
  return null;
}

export class Page {
  readonly errors: string[] = [];

  private readonly socket: WebSocket;
  private readonly target: Target;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  private constructor(target: Target, socket: WebSocket) {
    this.target = target;
    this.socket = socket;
    socket.addEventListener("message", (event) => this.onMessage(String(event.data)));
  }

  /**
   * Open a fresh page at a fixed size, seed it, and wait until the app is
   * showing. Fails with the setup instruction when the browser or the app is
   * not reachable.
   */
  static async open(options: OpenOptions = {}): Promise<Page> {
    const {
      seed,
      width = 1440,
      height = 900,
      mobile = false,
      settle = 700,
      url,
    } = options;

    if (!(await reachable(`http://127.0.0.1:${CDP_PORT}/json/version`))) {
      throw new Error(`No debugging browser on port ${CDP_PORT}.\n\n${SETUP_HINT}`);
    }

    const address = url ?? (await resolveApp());
    if (!address) {
      throw new Error(
        `The app is not answering at ${APP_CANDIDATES.join(" or ")}.\n\n${SETUP_HINT}`,
      );
    }

    const created = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(address)}`, {
      method: "PUT",
    });
    if (!created.ok) {
      throw new Error(`The browser refused a new page: ${created.status} ${await created.text()}`);
    }
    const target = (await created.json()) as Target;

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    const page = new Page(target, socket);
    await page.opened();

    await page.send("Page.enable");
    await page.send("Runtime.enable");
    if (seed) await page.send("Page.addScriptToEvaluateOnNewDocument", { source: seed });
    await page.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile,
    });
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
    // Bust the document cache. A deployed page can be served from cache while its
    // hashed assets have changed, and a stale document points at the old bundle,
    // which makes a fixed bug look unfixed and an unfixed one look fixed.
    const fresh = `${address}${address.includes("?") ? "&" : "?"}gate=${Date.now()}`;
    await page.send("Page.navigate", { url: fresh });

    await page.waitFor(READY, 15000);
    await page.pause(settle);
    return page;
  }

  private opened(): Promise<void> {
    if (this.socket.readyState === WS_OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.socket.addEventListener("open", () => resolve(), { once: true });
      this.socket.addEventListener("error", () => reject(new Error("The debugging socket did not open.")), {
        once: true,
      });
    });
  }

  private onMessage(raw: string): void {
    let message: CdpMessage;
    try {
      message = JSON.parse(raw) as CdpMessage;
    } catch {
      return;
    }

    if (typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }

    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params?.exceptionDetails;
      this.errors.push(details?.exception?.description ?? details?.text ?? "uncaught exception");
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
      const parts = (message.params.args ?? []).map((arg) => String(arg.value ?? arg.description ?? ""));
      this.errors.push(parts.join(" "));
    }
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<T>(expression: string, awaitPromise = false): Promise<T> {
    const result = (await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise,
    })) as { result?: { value?: unknown }; exceptionDetails?: { text?: string; exception?: { description?: string } } };

    if (result.exceptionDetails) {
      const text =
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "evaluation failed";
      throw new Error(`In-page evaluation failed: ${text}`);
    }
    return result.result?.value as T;
  }

  /** Poll an expression until it returns true. */
  async waitFor(expression: string, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.evaluate<boolean>(expression)) return;
      await this.pause(100);
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${expression}`);
  }

  pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Computed style and box for each selector, in the order asked for. */
  async measure(selectors: string[]): Promise<Record<string, Metrics | null>> {
    const list = JSON.stringify(selectors);
    return this.evaluate<Record<string, Metrics | null>>(`(() => {
      const out = {};
      const round = (value) => Math.round(value * 100) / 100;
      for (const selector of ${list}) {
        const element = document.querySelector(selector);
        if (!element) { out[selector] = null; continue; }
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        const svg = element.ownerSVGElement || (element.tagName.toLowerCase() === "svg" ? element : null);
        let scale = 1;
        if (svg) {
          const reference = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal.width : 0;
          if (reference > 0 && svg.clientWidth > 0) scale = svg.clientWidth / reference;
        }
        const strokeWidth = svg ? round(Number.parseFloat(style.strokeWidth) || 0) : 0;
        out[selector] = {
          fontSize: round(Number.parseFloat(style.fontSize)),
          fontWeight: Number.parseInt(style.fontWeight, 10),
          lineHeight: style.lineHeight === "normal" ? 0 : round(Number.parseFloat(style.lineHeight)),
          color: style.color,
          background: style.backgroundColor,
          stroke: svg ? style.stroke : "",
          strokeWidth,
          strokePx: round(strokeWidth * scale),
          paddingLeft: Math.round(Number.parseFloat(style.paddingLeft) || 0),
          left: Math.round(box.left),
          top: Math.round(box.top),
          right: Math.round(box.right),
          bottom: Math.round(box.bottom),
          width: Math.round(box.width),
          height: Math.round(box.height),
          text: (element.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 80),
        };
      }
      return out;
    })()`);
  }

  /** Click the first element matching the selector, through the page. */
  async click(selector: string): Promise<void> {
    const clicked = await this.evaluate<boolean>(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      element.click();
      return true;
    })()`);
    if (!clicked) throw new Error(`Nothing to click for selector: ${selector}`);
    await this.pause(250);
  }

  /** The centre of the first element matching the selector, in viewport pixels. */
  private async centre(selector: string): Promise<{ x: number; y: number }> {
    const point = await this.evaluate<{ x: number; y: number } | null>(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
    })()`);
    if (!point) throw new Error(`Nothing matched selector: ${selector}`);
    return point;
  }

  /** Move a real pointer over the first element matching the selector. */
  async hover(selector: string): Promise<void> {
    const point = await this.centre(selector);
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y, buttons: 0 });
    await this.pause(250);
  }

  /**
   * Press and release at the centre of an element, as a person does.
   *
   * `element.click()` cannot be used for the diagram: an SVG element has no such
   * method, and a synthetic click would not exercise the pointer capture that decides
   * whether the click arrives at all.
   */
  async realClick(selector: string): Promise<void> {
    const point = await this.centre(selector);
    await this.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: point.x,
      y: point.y,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: point.x,
      y: point.y,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    await this.pause(300);
  }

  /**
   * Focus an element and press a real key on it.
   *
   * `rawKeyDown` rather than `keyDown`, so no character is inserted and Space does not
   * scroll the page: the handlers under test only care about the key event itself.
   */
  async key(selector: string, key: string): Promise<void> {
    const info = key === "Enter" ? { code: "Enter", keyCode: 13 } : { code: "Space", keyCode: 32 };
    const focused = await this.evaluate<boolean>(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      element.focus();
      return document.activeElement === element;
    })()`);
    if (!focused) throw new Error(`Could not focus: ${selector}`);
    await this.pause(150);
    await this.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key,
      code: info.code,
      windowsVirtualKeyCode: info.keyCode,
    });
    await this.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code: info.code,
      windowsVirtualKeyCode: info.keyCode,
    });
    await this.pause(300);
  }

  /** Press, move in steps, release: a real drag, for a pan. */
  async drag(selector: string, dx: number, dy: number): Promise<void> {
    const point = await this.centre(selector);
    // Record where the element stood, immediately before the press. A check that compared
    // the position against zero would pass on any earlier step that scrolled it, such as
    // the zoom, which keeps its focus point still and moves the scroll a long way.
    await this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      window.__dragBefore = element
        ? { left: element.scrollLeft, top: element.scrollTop }
        : { left: 0, top: 0 };
    })()`);
    await this.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: point.x,
      y: point.y,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    const steps = 6;
    for (let step = 1; step <= steps; step += 1) {
      await this.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: Math.round(point.x + (dx * step) / steps),
        y: Math.round(point.y + (dy * step) / steps),
        button: "left",
        buttons: 1,
      });
      await this.pause(30);
    }
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: point.x + dx,
      y: point.y + dy,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    await this.pause(300);
  }

  /** A real wheel over the first element matching the selector. */
  async wheel(selector: string, deltaY: number): Promise<void> {
    const point = await this.centre(selector);
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: point.x,
      y: point.y,
      deltaX: 0,
      deltaY,
    });
    await this.pause(400);
  }

  /**
   * Type real text at the end of an element's value, through the input domain.
   *
   * A synthetic KeyboardEvent would not move the caret, and the caret's visibility is
   * the behaviour under test, so the input has to be real.
   */
  async type(selector: string, text: string): Promise<void> {
    const ready = await this.evaluate<boolean>(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      element.focus();
      const length = (element.value || "").length;
      if (typeof element.setSelectionRange === "function") element.setSelectionRange(length, length);
      return true;
    })()`);
    if (!ready) throw new Error(`Nothing to type into for selector: ${selector}`);
    await this.pause(200);
    await this.send("Input.insertText", { text });
    await this.pause(400);
  }

  async screenshot(file: string): Promise<void> {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    await mkdir(path.dirname(file), { recursive: true });
    const shot = (await this.send("Page.captureScreenshot", { format: "png" })) as { data: string };
    await writeFile(file, Buffer.from(shot.data, "base64"));
  }

  async close(): Promise<void> {
    try {
      this.socket.close();
    } catch {
      // The socket is already gone; closing the target below is what matters.
    }
    await reachable(`http://127.0.0.1:${CDP_PORT}/json/close/${this.target.id}`);
  }
}
