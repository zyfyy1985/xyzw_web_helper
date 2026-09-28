/* 打开本地 HTML → 等 window.__RESULT__ → 打印（单进程） */
const fs = require("fs");
const path = require("path");
const { spawn, execSync, execFileSync } = require("child_process");
const WS = require(path.join(__dirname, "..", "..", "..", "node_modules", "ws"));

const FILE = process.argv[2];
const DIR = path.join(process.env.TEMP, "xyzw-patch", "cdp-eval");
fs.mkdirSync(DIR, { recursive: true });
const PORT = 9337;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function killPort() {
  try {
    const out = execSync("netstat -ano", { encoding: "utf8" });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (line.indexOf(":" + PORT) === -1 || !line.includes("LISTENING")) continue;
      const m = line.trim().match(/(\d+)\s*$/);
      if (m) pids.add(m[1]);
    }
    for (const pid of pids) {
      try { execFileSync("C:/Windows/System32/taskkill.exe", ["/PID", pid, "/T", "/F"], { stdio: "ignore" }); } catch (_) {}
    }
  } catch (_) {}
}

(async () => {
  killPort();
  await wait(300);
  const o = fs.openSync(path.join(DIR, "edge.log"), "a");
  const edge = spawn(
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    [
      "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      "--remote-allow-origins=*", "--remote-debugging-port=" + PORT,
      "--user-data-dir=" + path.join(DIR, "profile"), "--allow-file-access-from-files",
      "about:blank"
    ],
    { stdio: ["ignore", o, o], windowsHide: true }
  );
  let ver = null;
  for (let i = 0; i < 40 && !ver; i++) {
    await wait(400);
    try { ver = await (await fetch("http://127.0.0.1:" + PORT + "/json/version")).json(); } catch (_) {}
  }
  if (!ver) { console.log("EDGE 起不来"); process.exit(1); }
  const ws = new WS(ver.webSocketDebuggerUrl, { origin: "http://127.0.0.1:" + PORT });
  const pending = new Map();
  let id = 0, sessionId = null;
  const send = (m, p) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { res, rej });
    const msg = { id: i, method: m, params: p || {} };
    if (sessionId) msg.sessionId = sessionId;
    ws.send(JSON.stringify(msg));
  });
  ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  });
  await new Promise((r) => ws.on("open", r));
  const t = await send("Target.createTarget", { url: "about:blank" });
  sessionId = (await send("Target.attachToTarget", { targetId: t.targetId, flatten: true })).sessionId;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url: "file:///" + FILE.replace(/\\/g, "/") });
  let result;
  for (let i = 0; i < 60; i++) {
    await wait(500);
    const r = await send("Runtime.evaluate", { expression: "window.__RESULT__", awaitPromise: true, returnByValue: true });
    if (r.result && r.result.value !== undefined) { result = r.result.value; break; }
    if (r.exceptionDetails) { console.log("PAGE-ERR", JSON.stringify(r.exceptionDetails).slice(0, 400)); break; }
  }
  console.log("RESULT:", result === undefined ? "(超时无结果)" : JSON.stringify(result, null, 2));
  try { ws.close(); } catch (_) {}
  killPort();
  process.exit(0);
})();
