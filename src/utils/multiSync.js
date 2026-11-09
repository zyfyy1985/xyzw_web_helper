/**
 * 多开协同：把源窗 canvas 上的一次真实手势，按【归一化坐标】在其他窗的 canvas 上重放。
 *
 * 为什么只在父页做：游戏页 iframe 与本站同源 → 父页能拿到 contentDocument、
 * 能读 canvas 的 getBoundingClientRect、能往 canvas 上 dispatchEvent。
 *
 * ★★ 只重放 mouse / touch，**绝不重放 pointer**。真实鼠标点击在 Chrome 里的顺序是
 *    pointerdown → mousedown → pointerup → mouseup；这个游戏的输入层只监听
 *    `#GameCanvas` 上的 mousedown/mousemove/mouseup/mousewheel（handler 是
 *    `getPointByEvent` → `cc.internal.inputManager.handleTouches*`），**没有 pointer 监听**。
 *    早先按「首个事件族锁定」的实现会被 pointerdown 锁成 pointer 族，于是只往别的窗发
 *    PointerEvent —— 引擎不认，同时 mouseup 因族不匹配被丢弃、手势永不结束，
 *    表现为「点了没反应，而且点第二次起彻底失灵」。探针当时只手动派发 MouseEvent，
 *    测的是 mouse 路径，所以没暴露。改回 mouse/touch 后与真实点击一致。
 *
 * 其余必须守住的规则：
 *  1. 只有 target 就是 GameCanvas 才广播 —— 游戏内的脚本面板（工具坞、盐场辅助…）
 *     是普通 DOM，天然被排除，不会出现「点面板把游戏按钮也点了」。
 *  2. 归一化用 canvas 的 rect，不用 iframe 的 rect（否则留白会带进误差）。
 *  3. mouse 与 touch 不能混发：锁死按下时那一族，其余族在整段手势里忽略
 *     （移动端浏览器会在 touchstart 之后补发 mousedown，不挡就会一次点两下）。
 *  4. 重放出去的事件打 __mirror 标记，接收端监听器首行丢弃，否则 A→B→A 回环。
 *  5. 拖拽期间父文档也监听 move/up：鼠标划出 iframe 后事件落在父页，
 *     只挂 iframe 会「拖一半断掉」。跨到别的窗时用「该窗 iframe rect + 局部坐标」
 *     还原绝对坐标，再按源窗的 canvas 归一化。
 *  6. 手势要有看门狗：万一 up 丢了（iframe 导航、窗口失焦），3 秒后自动放手，
 *     否则一次丢失会永久卡住后续所有点击。
 *  7. 捕获阶段监听（capture: true）：Cocos 的 canvas 监听会 stopPropagation，
 *     冒泡阶段挂 document 会收不到。
 */

const CANVAS_ID = "GameCanvas";
/* pointer 一律不接：游戏输入层只认 mouse/touch，重放 pointer 等于白发一遍 */
const DOWN = ["mousedown", "touchstart"];
const MOVE = ["mousemove", "touchmove"];
const UP = ["mouseup", "touchend", "touchcancel"];

/** 手势在 3s 内没有 up 就当丢了，强制放手（避免一次丢事件永久卡死） */
const GESTURE_TTL = 3000;

const familyOf = (type) => (type.indexOf("touch") === 0 ? "touch" : "mouse");

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 触点/鼠标点（touch 事件坐标在 changedTouches 里） */
function pointOf(e) {
  const t = e.changedTouches && e.changedTouches.length ? e.changedTouches[0] : null;
  if (t) return { x: t.clientX, y: t.clientY };
  return { x: e.clientX, y: e.clientY };
}

/**
 * @param {{
 *   getState: () => {enabled:boolean, panes:Array<{excluded:boolean, ready:boolean}>},
 *   onSource?: (index:number) => void,
 *   onRipple?: (index:number, x:number, y:number) => void,
 *   onBlocked?: (index:number) => void,
 * }} opts
 */
export function createSyncRouter(opts) {
  const panes = new Map();
  let gesture = null;
  /* 已发出 down、还没发出 up 的窗：万一 up 丢了，下次操作前补一发，救回引擎的「按下」态 */
  const dangling = new Map();
  /* 移动端在 touchend 之后会补发一次兼容 mousedown，不挡就会一次点击变两下 */
  let lastTouchEndAt = 0;

  const hostDoc = typeof document !== "undefined" ? document : null;

  /** 取某窗的几何：canvas 在 iframe 视口内的位置 + 折成页面绝对坐标 */
  function geom(index) {
    const rec = panes.get(index);
    if (!rec || !rec.doc) return null;
    let canvas = null;
    try {
      canvas = rec.doc.getElementById(CANVAS_ID);
    } catch (e) {
      return null;
    }
    if (!canvas) return null;
    let cr = null;
    let fr = null;
    try {
      cr = canvas.getBoundingClientRect();
      fr = rec.iframe.getBoundingClientRect();
    } catch (e) {
      return null;
    }
    if (!cr || cr.width < 2 || cr.height < 2 || !fr) return null;
    return {
      canvas,
      doc: rec.doc,
      win: rec.doc.defaultView,
      local: { left: cr.left, top: cr.top, w: cr.width, h: cr.height },
      abs: { left: fr.left + cr.left, top: fr.top + cr.top, w: cr.width, h: cr.height },
    };
  }

  /** 用页面绝对坐标归一化，再重放到其他窗 */
  function forward(type, absX, absY, srcEvent, exclude) {
    if (!gesture) return;
    const box = gesture.box;
    if (!box) return;
    const nx = clamp01((absX - box.left) / box.w);
    const ny = clamp01((absY - box.top) / box.h);
    gesture.nx = nx;
    gesture.ny = ny;

    const state = opts.getState();
    const list = state.panes || [];
    for (let j = 0; j < list.length; j++) {
      if (j === exclude) continue;
      const st = list[j];
      if (!st || st.excluded || !st.ready) continue;
      const g = geom(j);
      if (!g) continue;
      const lx = g.local.left + nx * g.local.w;
      const ly = g.local.top + ny * g.local.h;
      // 目标窗这个位置被脚本面板盖住了 → 不穿透（面板是普通 DOM，合成事件会绕过遮挡）
      let hit = null;
      try {
        hit = g.doc.elementFromPoint(lx, ly);
      } catch (e) {
        hit = null;
      }
      if (hit && hit !== g.canvas && !g.canvas.contains(hit)) {
        opts.onBlocked && opts.onBlocked(j);
        continue;
      }
      const ev = rebuild(g, type, lx, ly, srcEvent);
      if (!ev) continue;
      ev.__mirror = true;
      try {
        g.canvas.dispatchEvent(ev);
      } catch (e) {
        /* 构造失败不中断其他窗 */
        continue;
      }
      // 记账：down 发出去先记一笔，up 发出去了再销账（漏了就有兜底补发）
      if (type === "mousedown" || type === "touchstart") dangling.set(j, { family: gesture.family, x: lx, y: ly });
      else if (type === "mouseup" || type === "touchend" || type === "touchcancel") dangling.delete(j);
      /* 第 4 个参数是事件类型：宿主页靠它区分「按下 / 移动 / 抬起」。
         拖动时每一帧都有 move，宿主若按事件画提示点，一次滑动会留下几十个点
         （真机上实拍是一串白点），所以移动帧要不要画由宿主决定。 */
      opts.onRipple && opts.onRipple(j, lx, ly, type);
    }
  }

  /**
   * 补齐「只发过 down」的窗。目标窗引擎收到 down 后会一直认为鼠标还按着，
   * 之后所有 click 都被它的防抖吞掉 —— 必须补一发 up 才能救回来。
   */
  function flushDangling() {
    if (!dangling.size) return;
    dangling.forEach((d, j) => {
      const g = geom(j);
      if (g) {
        const type = d.family === "touch" ? "touchend" : "mouseup";
        const ev = rebuild(g, type, d.x, d.y, { button: 0, buttons: 0, detail: 1 });
        if (ev) {
          ev.__mirror = true;
          try {
            g.canvas.dispatchEvent(ev);
          } catch (e) {
            /* 窗已销毁 */
          }
        }
      }
    });
    dangling.clear();
  }

  /** 在目标窗里重建同族事件（必须用该窗自己的构造函数，否则 instanceof 不成立） */
  function rebuild(g, type, x, y, src) {
    const win = g.win;
    if (!win) return null;
    if (type.indexOf("touch") === 0) {
      const TouchCtor = win.Touch;
      if (!TouchCtor) return null;
      const touch = new TouchCtor({
        identifier: 1,
        target: g.canvas,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y,
        pageX: x,
        pageY: y,
        radiusX: 2,
        radiusY: 2,
        force: 1,
      });
      const ended = type === "touchend" || type === "touchcancel";
      const list = ended ? [] : [touch];
      return new win.TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: win,
        touches: list,
        targetTouches: list,
        changedTouches: [touch],
      });
    }
    const init = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: win,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      button: src.button | 0,
      buttons: src.buttons | 0,
      detail: src.detail | 0,
      ctrlKey: !!src.ctrlKey,
      shiftKey: !!src.shiftKey,
      altKey: !!src.altKey,
      metaKey: !!src.metaKey,
    };
    return new win.MouseEvent(type, init);
  }

  function beginAt(index, e) {
    if (e.__mirror) return;
    if (e.type === "mousedown" && Date.now() - lastTouchEndAt < 700) return;
    if (gesture && Date.now() - gesture.startedAt > GESTURE_TTL) gesture = null;
    if (gesture) return; // 单一路手势：没结束不接第二路
    const state = opts.getState();
    if (!state.enabled) return;
    const st = (state.panes || [])[index];
    if (!st || st.excluded) return;
    const g = geom(index);
    if (!g) return;
    if (e.target !== g.canvas) return; // 脚本面板/遮罩 → 只当本窗操作
    const p = pointOf(e);
    const absX = g.abs.left - g.local.left + p.x; // iframe 偏移 + 窗内坐标 = 页面绝对坐标
    const absY = g.abs.top - g.local.top + p.y;
    if (absX < g.abs.left - 2 || absY < g.abs.top - 2) return;
    if (absX > g.abs.left + g.abs.w + 2 || absY > g.abs.top + g.abs.h + 2) return;

    // 新的一次操作开始前，先把上一次可能卡住的「按下」态补齐
    flushDangling();
    gesture = {
      src: index,
      family: familyOf(e.type),
      box: g.abs,
      nx: (absX - g.abs.left) / g.abs.w,
      ny: (absY - g.abs.top) / g.abs.h,
      startedAt: Date.now(),
    };
    opts.onSource && opts.onSource(index);
    forward(e.type, absX, absY, e, index);
  }

  /** 某个窗的 iframe 文档收到事件：折成绝对坐标统一处理 */
  function fromPaneDoc(index, e, kind) {
    if (e.__mirror) return;
    if (kind === "down") {
      beginAt(index, e);
      return;
    }
    if (!gesture) return;
    if (familyOf(e.type) !== gesture.family) return;
    const rec = panes.get(index);
    if (!rec || !rec.iframe) return;
    let fr = null;
    try {
      fr = rec.iframe.getBoundingClientRect();
    } catch (err) {
      return;
    }
    const p = pointOf(e);
    forward(e.type, fr.left + p.x, fr.top + p.y, e, gesture.src);
    if (kind === "up") {
      if (familyOf(e.type) === "touch") lastTouchEndAt = Date.now();
      gesture = null;
    }
  }

  /** 父页收到事件：鼠标已经划出所有窗，直接用页面坐标 */
  function fromHost(e, kind) {
    if (!gesture || e.__mirror) return;
    if (familyOf(e.type) !== gesture.family) return;
    const p = pointOf(e);
    forward(e.type, p.x, p.y, e, gesture.src);
    if (kind === "up") {
      if (familyOf(e.type) === "touch") lastTouchEndAt = Date.now();
      gesture = null;
    }
  }

  function attach(index, iframe) {
    // ★★ 同一个 iframe、同一份 document 就不要再重绑：attach 会先 detach，
    //    而 detach 会把手势清掉。Vue 的函数 ref 每次重渲染都会回调一次，
    //    结果就是「按下后立刻丢手势」→ 目标窗只收到 mousedown、收不到 mouseup。
    const cur = panes.get(index);
    if (cur && cur.iframe === iframe && cur.doc && cur.doc === iframe.contentDocument) return;
    detach(index);
    const rec = { iframe, doc: null, off: null, onLoad: null };

    const onDown = (e) => fromPaneDoc(index, e, "down");
    const onMove = (e) => fromPaneDoc(index, e, "move");
    const onUp = (e) => fromPaneDoc(index, e, "up");

    rec.bind = () => {
      rec.unbind();
      let doc = null;
      try {
        doc = iframe.contentDocument;
      } catch (e) {
        doc = null;
      }
      rec.doc = doc;
      if (!doc) return;
      DOWN.forEach((t) => doc.addEventListener(t, onDown, true));
      MOVE.forEach((t) => doc.addEventListener(t, onMove, true));
      UP.forEach((t) => doc.addEventListener(t, onUp, true));
      rec.off = () => {
        DOWN.forEach((t) => doc.removeEventListener(t, onDown, true));
        MOVE.forEach((t) => doc.removeEventListener(t, onMove, true));
        UP.forEach((t) => doc.removeEventListener(t, onUp, true));
      };
    };
    rec.unbind = () => {
      if (rec.off) {
        try {
          rec.off();
        } catch (e) {
          /* 文档已销毁 */
        }
        rec.off = null;
      }
    };
    // iframe 导航（切号 / 重载）会换一份文档，旧监听随文档一起没了 → 重新绑
    rec.onLoad = () => {
      if (gesture && gesture.src === index) gesture = null;
      rec.bind();
    };
    iframe.addEventListener("load", rec.onLoad);
    rec.bind();
    panes.set(index, rec);
  }

  function detach(index) {
    const rec = panes.get(index);
    if (!rec) return;
    rec.unbind && rec.unbind();
    if (rec.onLoad && rec.iframe) rec.iframe.removeEventListener("load", rec.onLoad);
    panes.delete(index);
    dangling.delete(index);
    if (gesture && gesture.src === index) gesture = null;
  }

  // 父文档兜底：拖拽划出 iframe 后仍要跟着走
  const hostDownBound = [];
  const hostWin = typeof window !== "undefined" ? window : null;
  const resetGesture = () => {
    gesture = null;
    flushDangling();
  };
  /**
   * ★★ 真实点击落进 iframe 时，焦点会从父窗移进 iframe，**父窗会触发一次 blur**，
   *    时机正好在 mousedown 之后、mouseup 之前。以前在这里直接放手，就把这次手势的 up 丢了：
   *    目标窗只收到 down（引擎 `_mousePressed` 卡住），表现为「页面加载后第一次点击不协同」。
   *    焦点已在 iframe 内时不会再触发，所以只有第一次犯病。
   *    改成延后一拍：正常手势在这个窗口内就自己结束了；真的是失焦/切窗口，再兜底放手。
   */
  let blurTimer = 0;
  const resetGestureSoon = () => {
    if (!hostWin || blurTimer) return;
    blurTimer = hostWin.setTimeout(() => {
      blurTimer = 0;
      resetGesture();
    }, 800);
  };
  if (hostDoc) {
    const onMove = (e) => fromHost(e, "move");
    const onUp = (e) => fromHost(e, "up");
    MOVE.forEach((t) => hostDoc.addEventListener(t, onMove, true));
    UP.forEach((t) => hostDoc.addEventListener(t, onUp, true));
    hostDownBound.push([MOVE, onMove], [UP, onUp]);
    // 失焦：延后放手（见 resetGestureSoon 注释）；拖拽被系统中断则立即放手
    if (hostWin) {
      hostWin.addEventListener("blur", resetGestureSoon);
      hostWin.addEventListener("dragend", resetGesture);
    }
  }

  return {
    attach,
    detach,
    get gesture() {
      return gesture;
    },
    /** 探针用：在指定窗的 (nx, ny) 处走一遍真实链路（合成 mousedown 会触发本路由） */
    simulate(index, nx = 0.5, ny = 0.5) {
      const g = geom(index);
      if (!g || !g.win) return false;
      const x = g.local.left + nx * g.local.w;
      const y = g.local.top + ny * g.local.h;
      const mk = (type, buttons) =>
        new g.win.MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          view: g.win,
          clientX: x,
          clientY: y,
          screenX: x,
          screenY: y,
          button: 0,
          buttons,
        });
      g.canvas.dispatchEvent(mk("mousedown", 1));
      g.canvas.dispatchEvent(mk("mouseup", 0));
      return true;
    },
    /** 探针用：模拟真实浏览器的一次点击（pointer 先行，再补 mouse 兼容事件） */
    simulateReal(index, nx = 0.5, ny = 0.5) {
      const g = geom(index);
      if (!g || !g.win) return false;
      const x = g.local.left + nx * g.local.w;
      const y = g.local.top + ny * g.local.h;
      const base = {
        bubbles: true,
        cancelable: true,
        view: g.win,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y,
        button: 0,
      };
      const Ptr = g.win.PointerEvent;
      const mkPtr = (type, buttons) =>
        Ptr
          ? new Ptr(type, {
              ...base,
              buttons,
              pointerId: 1,
              pointerType: "mouse",
              isPrimary: true,
              pressure: buttons ? 0.5 : 0,
              width: 1,
              height: 1,
            })
          : null;
      const mkMouse = (type, buttons) => new g.win.MouseEvent(type, { ...base, buttons });
      const seq = [
        mkPtr("pointerdown", 1),
        mkMouse("mousedown", 1),
        mkPtr("pointerup", 0),
        mkMouse("mouseup", 0),
      ];
      seq.forEach((ev) => {
        if (ev) g.canvas.dispatchEvent(ev);
      });
      return true;
    },
    destroy() {
      panes.forEach((_, i) => detach(i));
      if (hostDoc) {
        hostDownBound.forEach(([types, fn]) =>
          types.forEach((t) => hostDoc.removeEventListener(t, fn, true))
        );
        if (hostWin) {
          hostWin.removeEventListener("blur", resetGestureSoon);
          hostWin.removeEventListener("dragend", resetGesture);
          if (blurTimer) hostWin.clearTimeout(blurTimer);
          blurTimer = 0;
        }
      }
      hostDownBound.length = 0;
      gesture = null;
    },
  };
}
