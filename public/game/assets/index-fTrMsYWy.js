const configuredVersion = String(window.__H5_BUILD_VERSION__ || "").trim();
const h5BuildVersion = configuredVersion && configuredVersion !== "__H5_VERSION__" ? configuredVersion : String(new URLSearchParams(window.location.search).get("v") || "").trim();
const versionedUrl = (source) => {
  if (!h5BuildVersion) return source;
  const url = new URL(source, import.meta.url);
  url.searchParams.set("v", h5BuildVersion);
  return url.href;
};
const patchUrl = versionedUrl(new URL("../patchUrl.js", import.meta.url).href);
const settingsUrl = versionedUrl(new URL("../settingsUrl.js", import.meta.url).href);
const gameDefinesUrl = versionedUrl(new URL("../game-defines.5d92f.js", import.meta.url).href);
const mainUrl = versionedUrl(new URL("main-O3VH6N30.js", import.meta.url).href);
const cocosUrl = versionedUrl(new URL("cocos2d-js-min.a5841-D-mS0tKb.js", import.meta.url).href);
const mobileMemoryMode = /Android|iPhone|iPad|iPod|Mobile|MicroMessenger/i.test(navigator.userAgent || "") || navigator.maxTouchPoints > 0 && window.innerWidth <= 1024;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.charset = "utf-8";
    script.onload = () => resolve();
    script.onerror = (e) => reject(e);
    document.head.appendChild(script);
  });
}
function loadScriptsInOrder(sources) {
  if (mobileMemoryMode) {
    return sources.reduce((chain, src) => chain.then(() => loadScript(src)), Promise.resolve());
  }
  const pending = sources.map((src) => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.charset = "utf-8";
    // Dynamic scripts are async by default. Turning async off preserves
    // execution order while still allowing Chromium to download in parallel.
    script.async = false;
    script.onload = () => resolve();
    script.onerror = (e) => reject(e);
    document.head.appendChild(script);
  }));
  return Promise.all(pending);
}
(async () => {
  try {
    await loadScriptsInOrder([
      patchUrl,
      settingsUrl,
      gameDefinesUrl,
      mainUrl,
      cocosUrl,
    ]);
    window.GameBridge?.reportBootStage?.("engine-ready");
    let bootStarted = false;
    const startGame = () => {
      if (bootStarted || typeof window.boot !== "function") return;
      bootStarted = true;
      const splash = document.getElementById("splash");
      if (splash) splash.style.display = "none";
      window.boot();
    };
    window.__startMengwangGame = startGame;
    const shouldDefer = window.GameBridge?.shouldDeferBoot?.() === true;
    if (window.__mengwangStartRequested || !shouldDefer) {
      startGame();
    } else {
      window.GameBridge?.reportBootStage?.("engine-warmed");
      Promise.resolve(window.boot({ prewarmOnly: true })).catch((error) => {
        console.warn("Failed to prewarm game assets", error);
        window.GameBridge?.reportBootStage?.("prewarm-error");
      });
    }
  } catch (e) {
    console.error("Failed to load legacy scripts", e);
    throw e;
  }
})();
