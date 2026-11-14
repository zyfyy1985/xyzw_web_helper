/**
 * 底部栏（战斗 / 俱乐部 那排 tab）位置自愈 + 画面内诊断。
 *
 * 病根（游戏侧写法，不是我们的样式）：
 *   1) HomeScene.onFixShow 里 `_originBottomY || (= ui.m_bottomBar.y)` —— 底部栏的 y 只采一次；
 *   2) `_showBttomBarAni` 是全仓唯一写 m_bottomBar.y 的地方，每次都把按钮摆回这个缓存值；
 *   3) 面板会按当时的可见高度反过来改写 UI 容器高度（`t.parent.height = 可见高 - 187 - 安全区`），
 *      全屏/退全屏也会改；游戏侧没有任何一处会重算落点；
 *   4) 收起动画被打断、显示事件没跑到时，按钮会永远留在画面之外（收起位）。
 * ⇒ 落点一旦和当前布局不一致，按钮就永久错位，只有重进游戏才会重采。
 *
 * 这个补丁「看一步、干一步」：每拍最多只有一个分支动手，动完立刻 return，不会互相抢。
 * 日常真正干活的是 ② 和 ④，① 只是试探，③⑤ 是兜底。
 *
 *   ⓿ 学基准：连续 3 拍「停住 + 自洽」才认，取中位数，并记进 localStorage（h5_bb_gap）。
 *      学不到（落点本身被采坏了）就在 5 秒后接管：沿用记录里的基准，一次都没量到过才贴
 *      容器底（0，会差 4px）。★ 记录必须跨页面：多开切窗格/刷新都算新页面，不记就退回 0。
 *      gap0 = 落点 - 容器高。实测手机是 +4，正常绝不该超过 ±24。
 *   ① 重排：容器高与 UIFitScreen 按视口算出的期望高差 > 8px → 广播 onScreenResize，
 *      让游戏自己把容器算回去。每处漂移最多 3 次。（部分皮肤下 `t.height = m_container.height`，
 *      这时重排改不动，真正跟上的是 ②。）
 *   ② 跟随：容器高度变了 → 落点 = 容器高 + gap0，按钮跟着摆。全屏/退全屏靠这条。
 *   ③ 展开：游戏意图=显示、但按钮停在收起位超过 750ms → 摆回落点。
 *   ④ 摆回：按钮既不在落点、也不在收起位、也不在「落点~收起位」这段动画区间 →
 *      连续 2 拍都这样才认定被别的代码丢了，按落点摆回。一局最多 5 次。
 *   ⑤ 校基准：落点离「容器高 + gap0」超过 16px 且持续 750ms（进场时就漂了 / 被手动改坏）
 *      → 按基准重算落点，一局最多 2 次；差超过 300px 认为基准不可信，不动手。
 *
 *   ★ 为什么基准要「从进场状态学」而不是自己算几何：
 *     实测手机是「容器高 1403 / 按钮高 160 / 游戏自己的落点 1407」—— 落点比容器底还低 4px。
 *     任何「容器高 - 按钮高」的公式都会把它往上推 160px，那正是错位的长相。
 *     所以只记 gap0 = 落点 - 容器高，之后永远用 容器高 + gap0 当目标，绝对几何一个都不猜。
 *
 *   ★★ 但不能「进场第一拍就学」：点「最大化」的过渡里容器高每帧都在变，而游戏的落点是
 *      更早一刻从按钮上抓的（`_originBottomY ||=` 只采一次，之后永不再采）。
 *      两个不同时刻的数相减会得到 -150 这种垃圾（真值 +4），按钮被顶高 154px，
 *      而且 ⑤ 会拿这个垃圾基准当真理去「纠正」，于是永远自愈不了。
 *      ⇒ 三条闸：① 连续 3 拍容器高与按钮 y 都没动（停住了）② 按钮停在落点或收起位
 *        （不在动画区间）③ |落点 - 容器高| ≤ 24（两个数自洽）。面板开着（意图=收起）时不学。
 *
 * 画面内诊断面板（手机上没控制台）：
 *   · ★ 不主动弹：进主城、自愈动手时都只把数字安静地存着，玩家想看时自己连点三下；
 *   · 左上角 72×72 内连点三下调出、再点三下收起（只点一两下不误触）—— 唯一入口；
 *   · 打开后每拍跟着刷新，带「重排 / 摆回 / 自测」三个按钮；修不好时面板里会多一行 ⚠；
 *   · `window.__bbShow()` 是三连击的程序版（回归测试用），页面上没有按钮调它。
 *
 * 要整体停用：删掉 index.html 里引用本文件的那行 <script>。
 */
(function () {
  'use strict';

  var VERSION = 'v12';
  var TICK = 250;            // 轮询间隔：只读几个数字，开销可忽略
  var TOLERANCE = 8;         // 容器高度差超过这么多像素才算跑偏
  var MAX_REFIT = 3;         // 同一处漂移最多重排几次
  var MAX_SNAP = 5;          // 一局最多「按落点摆回」几次
  var MAX_ALIGN = 2;         // 一局最多「按基准重算落点」几次
  var GAP_SLACK = 16;        // 落点偏离基准超过这么多像素才算真的漂了
  var MAX_ALIGN_SHIFT = 300; // 一次最多挪这么多；再大说明基准不可信，只记不动
  var GAP_BAND = 24;         // 基准（落点 - 容器高）超过这个数就算不可信 —— 真机是 +4
  var LEARN_TICKS = 3;       // 连续几拍「静 + 自洽」才认基准
  var LEARN_DEADLINE = 20;   // 5 秒还学不到就按兜底接管（20 × 250ms）
  var GAP_KEY = 'h5_bb_gap'; // 量到的基准记在这 —— 页面重载/换窗格后不必从 0 重来
  var WARM_DELAY = 12000;    // 登录数据就绪后再等这么久才碰 UI 模块（同 战斗增强.js）
  var WARM_MAX = 240;        // 等登录数据最多等这么久（500ms × 240 = 2 分钟）就照常暖机

  var proxy = null;
  var refitLeft = MAX_REFIT;
  var snapLeft = MAX_SNAP;
  var alignLeft = MAX_ALIGN;
  var goodGap = loadGap();   // 上次量到的「合格」基准（跨页面），自己学不到时用它兜底
  var warmed = false;        // 暖机完成才允许调 __require
  var uiReady = false;       // UI 根与主面板都在（玩家真的进主城了）
  var warmTries = 0;
  var ticks = 0;
  var fires = { refit: 0, shift: 0, snap: 0, orphan: 0, align: 0, show: 0 };

  function req(name) {
    try {
      return typeof window.__require === 'function' ? window.__require(name) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 就绪口径对齐 `features/战斗增强.js`（那边真机四象限验过）：
   * `__require` 在游戏初始化早期被调用会把模块工厂提前跑掉，打乱初始化顺序。
   * ⇒ 判据不用秒表：① cc 场景在；② 登录数据就绪（ServerData.ROLE.roleId，核心模块，
   *   远早于 UI 模块）；③ 再等 12s 缓冲；④ 才碰 HomeScene 这些 UI 模块。
   */
  function gameLoaded() {
    var scene =
      window.cc && window.cc.director && typeof window.cc.director.getScene === 'function'
        ? window.cc.director.getScene()
        : null;
    if (!scene) return false;
    var SD = req('ServerData');
    return !!(SD && SD.ROLE && SD.ROLE.roleId);
  }

  function scheduleWarm() {
    if (warmed) return;
    (function step() {
      if (warmed) return;
      warmTries += 1;
      // 2 分钟还读不到登录数据就当作「已经在玩、只是读不到」，照样暖机
      if (!gameLoaded() && warmTries < WARM_MAX) {
        window.setTimeout(step, 500);
        return;
      }
      window.setTimeout(function () {
        warmed = true;
      }, WARM_DELAY);
    })();
  }

  function uiManager() {
    var m = req('index-ui');
    return (m && m.UIManager && m.UIManager.instance) || null;
  }

  /** 开闸条件：暖机完成 + UI 根与主面板都在（保证按钮已经摆过一次，落点可信） */
  function gameReady() {
    if (!warmed) return false;
    if (uiReady) return true;
    var mgr = uiManager();
    if (!mgr || !mgr._root || !mgr.mainPanelProxy) return false;
    uiReady = true;
    return true;
  }

  /**
   * 挂住游戏自己的「显示/收起底部栏」意图。游戏只有一处会收起它：
   * HomeScene._showBttomBarAni(false)（由 BottomBarShowFeature 的 onShow/onHide 通过
   * GlobalSignal.EventPlayHomeBottomBar 派发）。挂住才知道按钮停在收起位时该不该展开。
   */
  function hookHome(C) {
    if (!C || !C.prototype) return false;
    var proto = C.prototype;
    if (proto.__bbHooked) return true;
    var orig = proto._showBttomBarAni;
    if (typeof orig !== 'function') return false;
    proto.__bbHooked = true;
    proto._showBttomBarAni = function (show) {
      try {
        this.__bbWant = show === false ? 0 : 1;
      } catch (e) {}
      return orig.apply(this, arguments);
    };
    return true;
  }

  function homeProxy() {
    if (proxy && proxy.ui) {
      // 代理可能已经被重登/切场景销毁过，节点不在就重新取
      var node = proxy.ui.node;
      if (!node || !window.cc || typeof window.cc.isValid !== 'function' || window.cc.isValid(node)) {
        return proxy;
      }
      proxy = null;
    }
    var m = req('HomeScene');
    var C = m && (m.HomeScene || m.default);
    var idx = req('index-ui');
    if (!C || !idx || typeof idx.GET_PROXY !== 'function') return null;
    hookHome(C);
    var p = null;
    try {
      p = idx.GET_PROXY(C);
    } catch (e) {
      return null;
    }
    if (!p || !p.ui) return null;
    proxy = p;
    return p;
  }

  function barOf(p) {
    var ui = p && p.ui;
    return (ui && ui.m_bottomBar) || null;
  }

  /** UIFitScreen._onResize 里那套 `l = viewportRect.height / scaleX - notchSize` */
  function expectedHeight() {
    try {
      var v = window.cc && window.cc.view;
      if (!v || typeof v.getViewportRect !== 'function') return 0;
      var rect = v.getViewportRect();
      var sx = typeof v.getScaleX === 'function' ? v.getScaleX() : 1;
      var mgr = uiManager();
      var notch = (mgr && mgr.notchSize) || 0;
      if (!rect || !(rect.height > 0) || !(sx > 0)) return 0;
      return Math.round(rect.height / sx - notch);
    } catch (e) {
      return 0;
    }
  }

  /**
   * 目标落点 = 容器高 + gap0。基准锚在容器高上：按钮是 UI 根的子节点，游戏自己也只在
   * 容器底附近摆它（实测非全屏 1407=1403+4、全屏 1510=1506+4）。
   */
  function targetOrigin(p, exp, H) {
    var g0 = p && typeof p.__bbG0 === 'number' ? p.__bbG0 : null;
    if (g0 === null) return 0;
    var base = H > 0 ? H : exp;
    if (!(base > 0)) return 0;
    return Math.round(base + g0);
  }

  /** 把容器高度算法重新广播一次（游戏自己的 UIFitScreen 会收） */
  function refit() {
    var mgr = uiManager();
    if (!mgr || !mgr.onScreenResize || typeof mgr.onScreenResize.dispatch !== 'function') return false;
    try {
      mgr.onScreenResize.dispatch();
      return true;
    } catch (e) {
      return false;
    }
  }

  /** 三个样本取中位数（防单拍抖动） */
  function med(a) {
    var b = a.slice().sort(function (x, y) {
      return x - y;
    });
    return b[(b.length / 2) | 0];
  }

  /** 上次量到的基准（越界/坏数据当没有） */
  function loadGap() {
    try {
      var v = parseFloat(window.localStorage.getItem(GAP_KEY));
      if (isFinite(v) && Math.abs(v) <= GAP_BAND) return Math.round(v);
    } catch (e) {}
    return null;
  }

  /** 记住这次量到的基准 */
  function saveGap(g) {
    try {
      window.localStorage.setItem(GAP_KEY, String(g));
    } catch (e) {}
  }

  /**
   * 装基准 + 把落点和按钮摆到「容器高 + 基准」。
   * forced = 兜底接管（样本不合格）：沿用 goodGap，一个都没量到过才贴容器底(0)。
   */
  function learnGap(p, gap, H, origin, barY, barH, forced) {
    var had = goodGap;
    p.__bbG0 = gap;
    p.__bbH = H;
    p.__bbS = null;
    // 面板上标出来源：本次学的什么都不显示；沿用记录 / 无记录贴底各标一句
    p.__bbGapSrc = forced ? (had === null ? '贴底' : '沿用') : '';
    if (!forced) {
      goodGap = gap;
      saveGap(gap);
    }
    var to = H + gap;
    if (Math.abs(origin - to) > 2) {
      p._originBottomY = to;
      // 收起态跟着摆到「落点 + 按钮高」，别让它浮出来；动画中途不碰
      if (Math.abs(barY - (origin + barH)) <= 2) p.ui.m_bottomBar.y = to + barH;
      else if (Math.abs(barY - origin) <= 2) p.ui.m_bottomBar.y = to;
      note(
        '基准重算 ' + (gap > 0 ? '+' : '') + gap + '（落点 ' + to +
        (forced ? (had === null ? '，无记录先贴底' : '，沿用上次') : '') + '）'
      );
    }
  }

  function check() {
    if (!gameReady()) return;
    var p = homeProxy();
    if (!p) return;
    var ui = p.ui;
    var bar = barOf(p);
    var H = Math.round(ui.height || 0);
    if (!bar || !(H > 0)) return;

    var exp = expectedHeight();
    var origin = Math.round(p._originBottomY || 0);
    var barY = Math.round(bar.y || 0);
    var barH = Math.round(bar.height || 0);
    var shown = origin > 0 && Math.abs(barY - origin) <= 2;
    var hidden = origin > 0 && Math.abs(barY - (origin + barH)) <= 2;
    // 游戏意图：1 = 要显示，0 = 要收起，undefined = 钩子还没被调用过
    var want = p.__bbWant;

    // ⓿ 学基准。必须排在 ① 之前（全屏下容器高与画面高本来就不一致，① 会一直重排 return）。
    //   ★ 不能第一拍就学：点「最大化」/ 开面板 / 播动画时，容器高与落点不在同一时刻，
    //     两个数相减毫无意义（实测学到 -150，真值 +4，按钮被顶高 154px）。
    //   ⇒ 要求连续 LEARN_TICKS 拍「停住 + 自洽」才认，取中位数。
    if (!p.__bbH) {
      var gapRaw = origin > 0 ? origin - H : null;
      var quiet = p.__bbLH === H && p.__bbLB === barY; // 这一拍布局没动
      var settle = shown || hidden;                    // 停在落点或收起位（不在动画区间）
      p.__bbLH = H;
      p.__bbLB = barY;
      p.__bbTries = (p.__bbTries || 0) + 1;
      // 进场时栏就是显示着的 ⇒ 默认意图 = 要显示（钩子要等游戏下一次调用才有值）
      if (typeof p.__bbWant !== 'number' && shown) p.__bbWant = 1;
      want = p.__bbWant;
      // 面板开着（意图=收起）时容器高是面板写的，这时学一定错 ⇒ 只等不学
      if (want !== 0 && quiet && settle && gapRaw !== null && Math.abs(gapRaw) <= GAP_BAND) {
        p.__bbS = p.__bbS || [];
        p.__bbS.push(gapRaw);
        if (p.__bbS.length > LEARN_TICKS) p.__bbS.shift();
        if (p.__bbS.length === LEARN_TICKS) {
          learnGap(p, med(p.__bbS), H, origin, barY, barH, false);
          return;
        }
      } else {
        p.__bbS = null;
      }
      // 等满 5 秒还学不到 ⇒ 落点本身是坏的，按兜底接管（有上次合格的就用它）
      if (p.__bbTries >= LEARN_DEADLINE && want !== 0 && quiet) {
        learnGap(p, goodGap === null ? 0 : goodGap, H, origin, barY, barH, true);
      }
      return;
    }

    // ① 容器跑偏就重排（每处漂移最多 MAX_REFIT 次，回到正常后重新计数）
    if (exp > 0) {
      if (Math.abs(H - exp) <= TOLERANCE) {
        refitLeft = MAX_REFIT;
      } else if (refitLeft > 0) {
        refitLeft -= 1;
        refit();
        fires.refit += 1;
        return;
      }
    }

    var target = targetOrigin(p, exp, H);

    // ② 画面/容器高度变了 → 落点按基准跟过去
    if (H !== p.__bbH) {
      var d = H - p.__bbH;
      p.__bbH = H;
      if (Math.abs(d) > 600) return; // 一屏级别的跳变，别猜
      var nextOrigin = target > 0 ? target : origin + d;
      if (origin > 0) p._originBottomY = nextOrigin;
      // 意图明确要显示时，不管按钮当拍站在哪都摆到新落点上
      if (want === 1 || shown) bar.y = nextOrigin;
      else if (hidden) bar.y = nextOrigin + barH; // 收起态：跟着走，别让它浮出来
      fires.shift += 1;
      note('底栏跟到落点 ' + nextOrigin + '（本拍 ' + (d > 0 ? '+' : '') + d + '）');
      return;
    }

    // ③ 游戏要求显示，但按钮还停在收起位（收起动画被打断 / 显示事件没跑到）
    if (want === 1 && hidden && origin > 0) {
      p.__bbHideT = (p.__bbHideT || 0) + 1;
      if (p.__bbHideT >= 3) {
        p.__bbHideT = 0;
        bar.y = origin;
        fires.show += 1;
        note('底栏被收起后没回来，已展开');
      }
      return;
    }
    p.__bbHideT = 0;

    // ⑤ 落点相对基准漂了 → 连续 3 拍（750ms）才动手，一局最多 2 次
    if (!(origin > 0) || !(target > 0)) return;
    if (Math.abs(origin - target) <= GAP_SLACK) {
      p.__bbGap = 0;
      return;
    }
    if (!(shown || hidden)) {
      p.__bbGap = 0;
      return;
    }
    if (Math.abs(origin - target) > MAX_ALIGN_SHIFT) return; // 基准本身不可信，别动
    p.__bbGap = (p.__bbGap || 0) + 1;
    if (p.__bbGap < 3 || alignLeft <= 0) return;
    p.__bbGap = 0;
    alignLeft -= 1;
    p._originBottomY = target;
    bar.y = hidden ? target + barH : target; // 收起态摆到落点+按钮高，不会浮出来
    fires.align += 1;
    note('已按进场基准摆回落点 ' + (target - origin) + 'px');
  }

  /**
   * ④ 按钮停在「既不在落点、也不在收起位」的地方 —— 有别的代码把它丢在那儿了。
   * 连续两拍（≈500ms）都是这样才认定不是动画路过，按游戏的落点摆回去。
   */
  function watchOrphan() {
    if (!gameReady()) return;
    var p = proxy;
    if (!p || !p.ui) return;
    // 基准还没装上 ⇒ 学习期只当旁观者，别抢布局（否则会把过渡态当成「被丢了」拽回去）
    if (!p.__bbH) return;
    var bar = barOf(p);
    if (!bar) return;
    var origin = Math.round(p._originBottomY || 0);
    var barY = Math.round(bar.y || 0);
    if (!(origin > 0)) return;

    var barH = Math.round(bar.height || 0);
    var shown = Math.abs(barY - origin) <= 2;
    var hidden = Math.abs(barY - (origin + barH)) <= 2;
    // 收起位不归这里管（是「玩家开着面板」还是「显示事件没跑到」由 ③ 判）
    if (shown || hidden) {
      p.__bbOdd = 0;
      return;
    }
    // 落在「落点 ~ 收起位」之间 = 正在播放收起/展开动画，别插手
    if (barY > origin && barY < origin + barH) {
      p.__bbOdd = 0;
      return;
    }
    p.__bbOdd = (p.__bbOdd || 0) + 1;
    if (p.__bbOdd < 2 || snapLeft <= 0) return;

    snapLeft -= 1;
    p.__bbOdd = 0;
    bar.y = origin;
    fires.snap += 1;
  }

  /* ============================================================
   * 画面内诊断面板（★ 不主动弹：只有左上角连点三下才出来）
   * ============================================================ */
  var box = null;
  var boxPin = false;
  var stuck = 0;
  var noteText = ''; // 最近一次自愈动作（面板关着也存着，开的时候一起显示）
  var warn = '';     // 持续偏且自己修不回来时的告警行

  function makeBtn(label, fn) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText =
      'flex:0 0 auto;min-width:46px;height:32px;padding:0 10px;border-radius:6px;' +
      'border:1px solid rgba(130,255,160,.7);background:rgba(255,255,255,.16);color:#e9ffe9;' +
      'font:12px/1 ui-monospace,Menlo,Consolas,monospace;' +
      'touch-action:manipulation;-webkit-tap-highlight-color:transparent;';
    b.addEventListener(
      'click',
      function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        try {
          fn();
        } catch (err) {}
        return false;
      },
      false
    );
    return b;
  }

  function ensureBox() {
    if (box && box.parentNode) return box;
    if (!document.body) return null;
    box = document.createElement('div');
    box.id = '__bbbox';
    box.style.cssText =
      'position:fixed;left:6px;top:6px;z-index:2147483647;max-width:90%;' +
      'padding:6px 8px 8px;border-radius:8px;background:rgba(0,0,0,.78);color:#fff;' +
      'font:11px/1.5 ui-monospace,Menlo,Consolas,monospace;display:none;text-align:left;' +
      'box-shadow:0 2px 10px rgba(0,0,0,.45);user-select:none;-webkit-user-select:none;' +
      'touch-action:manipulation;-webkit-tap-highlight-color:transparent;';
    var txt = document.createElement('div');
    txt.id = '__bbtxt';
    txt.style.cssText = 'white-space:pre;margin:0 0 6px;';
    box.appendChild(txt);
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;';
    row.appendChild(
      makeBtn('重排', function () {
        refitLeft = MAX_REFIT;
        refit();
        note('已重排');
      })
    );
    row.appendChild(
      makeBtn('摆回', function () {
        manualRealign();
      })
    );
    row.appendChild(
      makeBtn('自测', function () {
        selfTest();
      })
    );
    row.appendChild(
      makeBtn('×', function () {
        hideBox();
      })
    );
    box.appendChild(row);
    document.body.appendChild(box);
    return box;
  }

  function viewInfo() {
    try {
      var v = window.cc && window.cc.view;
      var f = v && typeof v.getFrameSize === 'function' ? v.getFrameSize() : null;
      var vs = v && typeof v.getVisibleSize === 'function' ? v.getVisibleSize() : null;
      var c = document.querySelector ? document.querySelector('canvas') : null;
      return (
        '画 ' + (f ? Math.round(f.width) + 'x' + Math.round(f.height) : '?') +
        ' 视 ' + (vs ? Math.round(vs.width) + 'x' + Math.round(vs.height) : '?') +
        ' css ' + (c ? Math.round(c.clientWidth || 0) + 'x' + Math.round(c.clientHeight || 0) : '?')
      );
    } catch (e) {
      return '画 ? 视 ? css ?';
    }
  }

  function gapText(p) {
    var g = p && typeof p.__bbG0 === 'number' ? p.__bbG0 : null;
    if (g === null) return '?'; // 还没学到（过渡中 / 面板开着）
    // 后缀写明来源：'' = 本次亲测，'沿用' = 记录里的，'贴底' = 无记录先贴容器底
    return (g > 0 ? '+' : '') + g + (p && p.__bbGapSrc ? '(' + p.__bbGapSrc + ')' : '');
  }

  function readout() {
    var p = proxy;
    var bar = barOf(p);
    if (!p || !p.ui || !bar) {
      return '底栏监控 ' + VERSION + '\n尚未进入主城（等游戏加载 / 暖机 ' + warmTries + '）';
    }
    var H = Math.round(p.ui.height || 0);
    var origin = Math.round(p._originBottomY || 0);
    var barY = Math.round(bar.y || 0);
    var exp = expectedHeight();
    var target = targetOrigin(p, exp, H);
    var off = origin > 0 && barY !== origin ? barY - origin : 0; // 按钮离落点多远（0 = 站对了）
    var mgr = uiManager();
    var rootH = mgr && mgr._root ? Math.round(mgr._root.height || 0) : 0;
    var want = p.__bbWant;
    var s =
      '底栏监控 ' + VERSION +
      '\n' + viewInfo() +
      '\n根层 ' + rootH + ' / 容器 ' + H + ' / 根y ' + Math.round(p.ui.y || 0) +
      '\n落点 ' + origin + ' / 目标 ' + target + ' / 基准 ' + gapText(p) +
      '\n按钮 ' + barY + ' / 偏 ' + (off > 0 ? '+' : '') + off +
      ' / 意图 ' + (want === 1 ? '显示' : want === 0 ? '收起' : '未知') +
      '\n修 ' + fires.refit + '/' + fires.shift + '/' + fires.align + '/' + fires.snap + '/' + fires.show +
      ' · 拍 ' + ticks;
    if (warn) s += '\n' + warn;
    if (noteText) s += '\n' + noteText;
    return s;
  }

  /** 重画面板（只在已经决定要显示时调，自己不会把面板拉出来） */
  function paint() {
    var el = ensureBox();
    if (!el) return false;
    var txt = document.getElementById('__bbtxt');
    if (txt) txt.textContent = readout();
    el.style.display = 'block';
    return true;
  }

  function showBox() {
    if (!paint()) return;
    boxPin = true;
  }

  function hideBox() {
    boxPin = false;
    if (box && box.parentNode) box.style.display = 'none';
  }

  /**
   * 记一条「最近动作」。★ 绝不主动弹面板：关着就只存着，等玩家自己连点三下看。
   * 面板开着时顺手刷一次，让数字/文案立刻跟上（4 次/秒的 tick 也会刷）。
   */
  function note(text) {
    noteText = text || '';
    if (boxPin) paint();
  }

  /** 三连击的程序版（页面上没有按钮调它，留给回归测试 / 排查时用） */
  window.__bbShow = function () {
    showBox();
  };

  /** 摆回：按进场基准把落点与按钮一起摆回去（健康时是空操作） */
  function manualRealign() {
    var p = homeProxy();
    var bar = barOf(p);
    if (!p || !p.ui || !bar) {
      note('还没进主城，摆回无效');
      return;
    }
    refitLeft = MAX_REFIT;
    alignLeft = MAX_ALIGN;
    snapLeft = MAX_SNAP;
    refit();
    var t2 = targetOrigin(p, expectedHeight(), Math.round(p.ui.height || 0));
    if (t2 > 0) {
      bar.y = t2;
      p._originBottomY = t2;
      note('已按进场基准摆回 ' + t2);
    } else {
      note('还没学到基准（刚进主城再试一次）');
    }
  }

  /** 自测：把容器高度 +80，1.2 秒内看游戏能不能自己算回去；无论成败都还原三处 */
  function selfTest() {
    var p = homeProxy();
    var ui = p && p.ui;
    var bar = barOf(p);
    if (!ui || !bar) {
      note('还没进主城，自测无效');
      return;
    }
    var h0 = Math.round(ui.height || 0);
    var bar0 = Math.round(bar.y || 0);
    var origin0 = Math.round(p._originBottomY || 0);
    refitLeft = MAX_REFIT;
    ui.height = h0 + 80;
    note('自测中…（约 1 秒）');
    window.setTimeout(function () {
      var h1 = Math.round(ui.height || 0);
      var back = Math.abs(h1 - h0) <= TOLERANCE;
      var intact =
        back &&
        Math.abs(Math.round(p._originBottomY || 0) - origin0) <= 2 &&
        Math.abs(Math.round(bar.y || 0) - bar0) <= 2;
      if (!intact) {
        // 绝不让自测把游戏留在更坏的状态
        try {
          ui.height = h0;
        } catch (e) {}
        if (origin0 > 0) p._originBottomY = origin0;
        try {
          bar.y = bar0;
        } catch (e) {}
      }
      note(intact ? '自测通过：容器能自己算回去' : '自测未通过，已还原原值');
    }, 1200);
  }

  /** 左上角连点三下 = 调出/收起（手机上唯一不需要键盘的入口） */
  (function bindCornerTap() {
    var hits = [];
    function onTap(e) {
      var pt = null;
      if (e.changedTouches && e.changedTouches.length) pt = e.changedTouches[0];
      else if (typeof e.clientX === 'number') pt = e;
      if (!pt) return;
      if (!(pt.clientX >= 0 && pt.clientX <= 72 && pt.clientY >= 0 && pt.clientY <= 72)) return;
      var now = Date.now();
      hits.push(now);
      if (hits.length > 3) hits.shift();
      if (hits.length === 3 && now - hits[0] <= 900) {
        hits.length = 0;
        if (box && boxPin) hideBox();
        else showBox();
      }
    }
    document.addEventListener('ontouchstart' in window ? 'touchend' : 'click', onTap, true);
  })();

  /** 持续偏且自己修不回来 → 只准备一行告警；★ 不弹面板，玩家自己连点三下才看得到 */
  function status() {
    if (!uiReady) {
      stuck = 0;
      warn = '';
      return;
    }
    var p = proxy;
    var bar = barOf(p);
    if (!p || !p.ui || !bar) return;
    var H = Math.round(p.ui.height || 0);
    var origin = Math.round(p._originBottomY || 0);
    var target = targetOrigin(p, expectedHeight(), H);
    if (!(target > 0) || !(origin > 0)) return;
    var off = origin - target;
    if (Math.abs(off) <= GAP_SLACK) {
      stuck = 0;
      warn = '';
      return;
    }
    stuck += 1;
    if (stuck >= 8) warn = '⚠ 底栏偏 ' + off + 'px，没自动修好（可点「摆回」，或截图发给作者）';
  }

  function tick() {
    ticks += 1;
    try {
      check();
    } catch (e) {}
    try {
      watchOrphan();
    } catch (e) {}
    try {
      status();
    } catch (e) {}
    // 面板开着才跟着刷数字；关着就什么都不做，绝不自作主张弹出来
    try {
      if (boxPin) paint();
    } catch (e) {}
  }

  // 视口一变（地址栏、窗格尺寸、旋转、键盘）先立刻巡一次，再靠轮询兜底
  ['resize', 'orientationchange'].forEach(function (ev) {
    window.addEventListener(ev, tick, false);
  });
  window.addEventListener('monster:h5-viewport-change', tick, false);


  scheduleWarm();
  window.setInterval(tick, TICK);
})();
