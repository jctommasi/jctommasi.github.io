/* =============================================================================
 * scripts/shoot.mjs — headless screenshot driver for visual verification.
 * -----------------------------------------------------------------------------
 * Serves nothing itself: serve the PRODUCTION build first, e.g.
 *   npm run build
 *   python3 -m http.server 8080 --bind 0.0.0.0 --directory dist &
 * (or point it at the dev server URL) then:
 *   node scripts/shoot.mjs <out.png> [dark|light] [rm-on|rm-off] [url] [--move]
 *     out.png   where to save the screenshot
 *     scheme    prefers-color-scheme to emulate (default dark)
 *     rm-on     emulate prefers-reduced-motion: reduce (default)
 *     rm-off    emulate no-preference — NOTE this ALSO omits the
 *               --force-prefers-reduced-motion chrome flag; the flag overrides
 *               Emulation.setEmulatedMedia, so toggling the media feature alone
 *               is NOT enough (hard-won gotcha).
 *     url       page to shoot (default http://127.0.0.1:8080/ — EN root)
 *     --move    dispatch a mouse move across the hero before capturing (for
 *               parallax verification via CDP Input.dispatchMouseEvent)
 *
 * Binary: playwright's chrome-headless-shell (already on disk). Its shared-lib
 * deps live in /tmp/lf-libs (VOLATILE): if missing, re-extract the .debs (see
 * progress.txt "headless verify" note) or run `npx playwright install-deps`.
 * SwiftShader flags make WebGL render without a GPU. client:idle islands
 * hydrate headlessly; client:visible ones do NOT (zero-size IO bug).
 * ===========================================================================*/
import { spawn } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";

const CHS =
  "/home/ralph/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";
const LIBS = "/tmp/lf-libs/root/usr/lib/x86_64-linux-gnu";
const PORT = 9222;

const args = process.argv.slice(2).filter((a) => a !== "--move");
const MOVE = process.argv.includes("--move");
const OUT = args[0] || "/tmp/shot.png";
const SCHEME = args[1] || "dark";
const RM = (args[2] || "rm-on") === "rm-on";
const URL = args[3] || "http://127.0.0.1:8080/";

if (!existsSync(CHS)) {
  console.error("chrome-headless-shell missing at", CHS);
  process.exit(1);
}
if (!existsSync(LIBS)) {
  console.error(
    "WARN: " + LIBS + " missing (volatile /tmp) — chrome may fail to start; " +
      "re-extract the lib .debs or `npx playwright install-deps`.",
  );
}

const flags = [
  "--no-sandbox",
  `--remote-debugging-port=${PORT}`,
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
  "--hide-scrollbars",
  "--window-size=1440,900",
  "about:blank",
];
// The flag OVERRIDES Emulation.setEmulatedMedia — only pass it for rm-on.
if (RM) flags.splice(1, 0, "--force-prefers-reduced-motion");

const chrome = spawn(CHS, flags, {
  env: { ...process.env, LD_LIBRARY_PATH: LIBS },
  stdio: "ignore",
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPageTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await r.json();
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  throw new Error("chrome CDP not ready");
}

async function main() {
  const target = await getPageTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id).res(m.result);
      pending.delete(m.id);
    }
  });
  await new Promise((res) => ws.addEventListener("open", res, { once: true }));
  const send = (method, params = {}) =>
    new Promise((res) => {
      const mid = ++id;
      pending.set(mid, { res });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });

  await send("Page.enable");
  await send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-reduced-motion", value: RM ? "reduce" : "no-preference" },
      { name: "prefers-color-scheme", value: SCHEME },
    ],
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: URL });
  await sleep(5000); // real time: load + client:idle hydrate + WebGL paint
  if (MOVE) {
    // Sweep the pointer across the hero so parallax (if any) displaces things.
    for (const x of [300, 720, 1140]) {
      await send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x,
        y: 450,
      });
      await sleep(150);
    }
    await sleep(400);
  }
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(OUT, Buffer.from(data, "base64"));
  console.log("saved", OUT, `(scheme=${SCHEME} rm=${RM ? "on" : "off"}${MOVE ? " moved" : ""})`);
  ws.close();
  chrome.kill("SIGKILL");
  process.exit(0);
}

main().catch((e) => {
  console.error("ERR", e.message);
  chrome.kill("SIGKILL");
  process.exit(1);
});
