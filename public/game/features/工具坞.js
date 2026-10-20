// @name         工具坞
// @version      1.0.6
// @description  把各功能脚本的入口收进右上角一个翡翠青圆钮（白色魔法棒图标）：点开弹出菜单
//               （账号切换 / 云阵容 / 蟠桃辅助 / 盐场辅助），屏幕只留 1 个图标。
//
// ── 为什么需要它 ───────────────────────────────────────────────────────
//   各功能脚本各自往屏幕右上角钉一个悬浮入口（圆的、胶囊的都有），形态尺寸颜色
//   都不统一，还默认都钉 top:8 right:8 → 天然重叠。本脚本提供一个统一入口。
//
// ── 挂载位置（关键设计）────────────────────────────────────────────────
//   功能脚本由 game-bridge 注入【游戏 iframe 文档】，而游戏进入时自动最大化 = 真·全屏
//   API，全屏只渲染 iframe 内容 → 挂父窗口的东西会被盖住。因此工具坞**挂在 iframe
//   文档**（也就是自己的 document），这样全屏/非全屏都可见。
//
// ── 注册协议（各功能脚本主动注册，工具坞不主动找功能）─────────────────
//   window.__XYZW_DOCK__.register({
//     id:      'peach',         // 唯一标识
//     name:    '蟠桃辅助',      // 菜单里显示的文字
//     char:    '蟠',            // 圆图标里的字
//     color:   '#1D9E75',       // 圆图标底色
//     order:   30,              // 排序权重（小的在上）
//     open:    () => {...},     // 点菜单项时调用 → 展开该功能面板
//     enabled: () => true,      // 可选：返回开关状态，菜单项右侧显示状态小点
//   });
//   注册时机：功能脚本可在工具坞就绪前先 register（内部排队，就绪后统一渲染）。
//
// ── 交互 ───────────────────────────────────────────────────────────────
//   · 点圆钮 → 展开 / 收起菜单；点菜单项 → 调该功能 open() 并收起菜单
//   · 双击圆钮 → 游戏窗口最大化 / 还原（游戏 iframe 内部全屏，与进游戏自动最大化同路径）
//   · 点菜单/圆钮以外区域 → 收起；Esc → 收起
//   · 菜单项右侧小点：有 enabled 的功能，开=绿点，关=灰点（无 enabled 不显示点）
//   · 圆钮可拖动，位置存 localStorage('xyzw_dock_pos')，多账号共用
(function () {
  'use strict';

  if (window.__XYZW_DOCK__) return; // 已安装（iframe 重载后重新注入属正常）

  var VERSION = '1.0.6';
  var DOCK_ID = 'xyzw-dock';
  var MENU_ID = 'xyzw-dock-menu';
  var STYLE_ID = 'xyzw-dock-style';
  var POS_KEY = 'xyzw_dock_pos';

  var SIZE = 38; // 圆钮直径
  var MARGIN = 8; // 距屏幕边缘

  // 已注册项：{ id, name, char, color, order, open, enabled }
  var items = [];
  var registered = {}; // id -> true，去重
  var uiReady = false;

  var btn = null;
  var menu = null;
  var openFlag = false; // 菜单是否展开

  // ── 工具 ─────────────────────────────────────────────────────────────
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── 按钮图标（魔法棒 = 辅助 / 强化）──────────────────────────────────
  // 用内联 SVG 而不是汉字「辅」：38px 里塞一个汉字既挤又糊，矢量图标在任何
  // DPI 下都清晰。坐标按 40×40 设计稿、以原点为中心绘制，靠 CSS 撑满按钮，
  // 所以改 SIZE 只影响按钮直径，不用重算图标。
  var ICON_SVG =
    '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">' +
    '<g transform="translate(20,20)">' +
    '<line x1="-2.2" y1="-2.2" x2="9" y2="9" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M-7.6,-14 L-5.7,-9.5 L-1.2,-7.6 L-5.7,-5.7 L-7.6,-1.2 L-9.5,-5.7 L-14,-7.6 L-9.5,-9.5 Z" fill="#ffffff"/>' +
    '<circle cx="9.4" cy="-6.4" r="1.5" fill="#ffffff"/>' +
    '<circle cx="-5.4" cy="9.4" r="1.3" fill="#ffffff"/>' +
    '</g></svg>';

  // ── 样式（单引号，禁双引号 —— 与项目 UI_CSS 约定一致）─────────────────
  var CSS = [
    '#' + DOCK_ID + '{position:fixed;z-index:2147483600;width:' + SIZE + 'px;height:' + SIZE + 'px;',
    'box-sizing:border-box;padding:0;border:0;border-radius:50%;',
    'background:#12886b;color:#ffffff;cursor:pointer;',
    'display:flex;align-items:center;justify-content:center;',
    // 翡翠青是暖棕游戏画面上唯一的冷色块（色相分离最彻底）；2px 内描边 + 深色外晕
    // 负责把边缘从杂乱的沙色背景里抠出来，光靠底色对比在明暗交界处会糊掉。
    'box-shadow:0 3px 10px rgba(0,0,0,.5),inset 0 0 0 2px rgba(255,255,255,.45);',
    'user-select:none;-webkit-user-select:none;',
    'touch-action:none;-webkit-touch-callout:none;}',
    '#' + DOCK_ID + ' svg{display:block;width:100%;height:100%;}',
    '#' + DOCK_ID + '.dragging{cursor:grabbing;opacity:.9;}',
    '#' + DOCK_ID + '[hidden]{display:none;}',
    // 菜单
    '#' + MENU_ID + '{position:fixed;z-index:2147483600;min-width:150px;',
    'background:#ffffff;border:1px solid #d0d3d9;border-radius:12px;',
    'box-shadow:0 6px 24px rgba(0,0,0,.18);overflow:hidden;padding:4px;',
    "font:13px/1.4 -apple-system,'Segoe UI','Microsoft YaHei',sans-serif;text-align:left;}",
    '#' + MENU_ID + '[hidden]{display:none;}',
    '#' + MENU_ID + ' .dk-item{display:flex;align-items:center;gap:9px;padding:8px 10px;',
    'border-radius:8px;cursor:pointer;color:#1f2328;}',
    '#' + MENU_ID + ' .dk-item:hover{background:#f4f5f7;}',
    '#' + MENU_ID + ' .dk-ico{width:22px;height:22px;border-radius:50%;flex:0 0 auto;',
    'display:flex;align-items:center;justify-content:center;color:#ffffff;',
    'font-size:11px;font-weight:600;}',
    '#' + MENU_ID + ' .dk-name{flex:1;white-space:nowrap;}',
    '#' + MENU_ID + ' .dk-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto;background:#c4c8cf;}',
    '#' + MENU_ID + ' .dk-dot.on{background:#22c55e;}',
    '#' + MENU_ID + ' .dk-empty{padding:10px;color:#8a8f99;font-size:12px;text-align:center;}',
  ].join('');

  // 注入前自审：CSS 文本里绝不能出现双引号（字体族名一律用单引号）。
  // 一个游离的双引号会让引号总数变奇数 → 解析器认定字符串未闭合、从那里吃到
  // 样式表末尾、后面所有规则失效（本项目真机踩过：面板正常但图标被挤到屏外）。
  function cssAudit(text) {
    var quotes = (text.match(/"/g) || []).length;
    var p = 0;
    for (var i = 0; i < text.length; i++) {
      if (text[i] === '{') p++;
      else if (text[i] === '}') p--;
    }
    return { quotes: quotes, braces: p };
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var audit = cssAudit(CSS);
    if (audit.quotes !== 0 || audit.braces !== 0) {
      console.error(
        '[工具坞] CSS 自审未过：双引号 ' + audit.quotes + ' / 括号净差 ' + audit.braces,
      );
      return;
    }
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  // ── 游戏窗口最大化（双击圆钮 / api.toggleFullscreen）──────────────────
  //   全屏请求必须发在【自己所在的游戏 iframe 文档】上（对 document.documentElement），
  //   也就是和「进游戏自动最大化」走同一条路径 —— 游戏页面自带 viewport-fit=cover +
  //   安全区处理，浏览器按它的 viewport 做沉浸式全屏，状态栏区域会被游戏画面盖住。
  //   ⚠️ 不能全屏宿主侧的 iframe 元素 / documentElement（v1.0.4 / v1.0.5 都踩过）：
  //      · 全屏 iframe 元素 → 按父文档 viewport 处理，父页面没有 viewport-fit=cover，
  //        顶部留一条状态栏高度的黑边（真机截图确认）；
  //      · 全屏宿主 documentElement → 只是整页全屏，宿主 SPA 顶栏还占着屏。
  //   还原要先判断全屏元素到底在哪份文档（游戏文档 / 宿主文档），命中哪份退哪份。
  function hostWin() {
    try {
      if (window.parent && window.parent !== window && window.parent.document) return window.parent;
    } catch (e) {}
    return window;
  }
  /** 当前生效的全屏所在文档；无全屏返回 null */
  function fsActiveDoc() {
    // ① 自己所在文档（= 游戏 iframe 内部元素全屏，进图自动最大化就是这条）
    if (document.fullscreenElement || document.webkitFullscreenElement) return document;
    // ② 宿主文档（父页面直接全屏了 iframe 元素 / documentElement）
    var hd = hostWin().document;
    if (hd !== document && (hd.fullscreenElement || hd.webkitFullscreenElement)) return hd;
    return null;
  }
  /** iframe 拿不到 fullscreen 权限时的兜底：全屏宿主侧的游戏 iframe 元素 */
  function fallbackHostFullscreen() {
    var hd = hostWin().document;
    if (hd === document) return;
    var target = null;
    try {
      target = hd.querySelector('iframe.game-iframe') || hd.querySelector('iframe');
    } catch (e) {}
    target = target || hd.documentElement;
    var rq = target.requestFullscreen || target.webkitRequestFullscreen;
    if (!rq) return;
    try {
      var q = rq.call(target);
      if (q && q['catch']) q['catch'](function () {});
    } catch (e) {}
  }
  function toggleFullscreen() {
    var active = fsActiveDoc();
    if (active) {
      var ex = active.exitFullscreen || active.webkitExitFullscreen;
      if (ex) {
        try {
          var p = ex.call(active);
          if (p && p['catch']) p['catch'](function () {});
        } catch (e) {}
      }
      return;
    }
    var el = document.documentElement;
    var rq = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!rq) {
      fallbackHostFullscreen();
      return;
    }
    try {
      var q = rq.call(el);
      if (q && q['catch']) q['catch'](fallbackHostFullscreen);
    } catch (e) {
      fallbackHostFullscreen();
    }
  }

  // ── 位置 ─────────────────────────────────────────────────────────────
  function loadPos() {
    try {
      var raw = JSON.parse(window.localStorage.getItem(POS_KEY) || 'null');
      if (raw && typeof raw.x === 'number' && typeof raw.y === 'number') return raw;
    } catch (e) {}
    return null;
  }
  function savePos(x, y) {
    try {
      window.localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(x), y: Math.round(y) }));
    } catch (e) {}
  }
  function applyPos() {
    if (!btn) return;
    var p = loadPos();
    var vw = window.innerWidth || 9999;
    var vh = window.innerHeight || 9999;
    var x = p ? p.x : vw - SIZE - MARGIN;
    var y = p ? p.y : MARGIN;
    x = Math.max(MARGIN, Math.min(x, vw - SIZE - MARGIN));
    y = Math.max(MARGIN, Math.min(y, vh - SIZE - MARGIN));
    btn.style.left = x + 'px';
    btn.style.top = y + 'px';
    if (menu) positionMenu(x, y);
  }
  function positionMenu(bx, by) {
    if (!menu) return;
    var vw = window.innerWidth || 9999;
    var vh = window.innerHeight || 9999;
    var mw = menu.offsetWidth || 160;
    var mh = menu.offsetHeight || 4;
    // 默认向下展开；底部空间不够则向上
    var top = by + SIZE + 6;
    if (top + mh > vh - MARGIN) top = Math.max(MARGIN, by - mh - 6);
    // 右对齐到圆钮右缘，左边界兜底
    var left = bx + SIZE - mw;
    left = Math.max(MARGIN, Math.min(left, vw - mw - MARGIN));
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  // ── 菜单渲染 ─────────────────────────────────────────────────────────
  function renderMenu() {
    if (!menu) return;
    menu.innerHTML = '';
    if (!items.length) {
      menu.appendChild(el('div', 'dk-empty', '暂无可用的功能入口'));
      return;
    }
    items.forEach(function (it) {
      var row = el('div', 'dk-item');
      var ico = el('span', 'dk-ico', it.char || '·');
      ico.style.background = it.color || '#5f6470';
      row.appendChild(ico);
      row.appendChild(el('span', 'dk-name', it.name || it.id));
      if (typeof it.enabled === 'function') {
        var on = false;
        try {
          on = !!it.enabled();
        } catch (e) {}
        row.appendChild(el('span', 'dk-dot' + (on ? ' on' : '')));
      }
      row.addEventListener('click', function (ev) {
        ev.stopPropagation();
        setOpen(false);
        try {
          if (typeof it.open === 'function') it.open();
        } catch (e) {
          console.warn('[工具坞] 打开「' + (it.name || it.id) + '」失败:', e);
        }
      });
      menu.appendChild(row);
    });
  }

  function setOpen(v) {
    openFlag = !!v;
    if (!menu) return;
    if (openFlag) {
      renderMenu();
      menu.hidden = false;
      var r = btn ? btn.getBoundingClientRect() : { left: 0, top: 0 };
      positionMenu(r.left, r.top);
    } else {
      menu.hidden = true;
    }
  }

  // ── 拖动（拖完吞掉 click，避免误展开）────────────────────────────────
  var dragged = false;
  // 单击要等一个 dblclick 判定期再执行：否则双击会先「展开菜单 → 收起菜单」闪一下，
  // 再执行最大化。200ms 内的第二次点击 → 取消单击、交给 dblclick。
  var CLICK_DELAY = 200;
  var clickTimer = null;
  function cancelClickTimer() {
    if (clickTimer) {
      window.clearTimeout(clickTimer);
      clickTimer = null;
    }
  }
  function installDrag() {
    var start = null;
    var origin = null;
    var moved = false;
    btn.addEventListener('pointerdown', function (ev) {
      if (ev.button != null && ev.button !== 0) return;
      var r = btn.getBoundingClientRect();
      start = { x: ev.clientX, y: ev.clientY };
      origin = { left: r.left, top: r.top };
      moved = false;
      btn.classList.add('dragging');
      try {
        btn.setPointerCapture(ev.pointerId);
      } catch (e) {}
    });
    btn.addEventListener('pointermove', function (ev) {
      if (!start) return;
      var dx = ev.clientX - start.x;
      var dy = ev.clientY - start.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      moved = true;
      var vw = window.innerWidth || 9999;
      var vh = window.innerHeight || 9999;
      var x = Math.max(MARGIN, Math.min(origin.left + dx, vw - SIZE - MARGIN));
      var y = Math.max(MARGIN, Math.min(origin.top + dy, vh - SIZE - MARGIN));
      btn.style.left = x + 'px';
      btn.style.top = y + 'px';
      if (openFlag) positionMenu(x, y);
      ev.preventDefault();
    });
    function end(ev) {
      if (!start) return;
      start = null;
      btn.classList.remove('dragging');
      if (moved) {
        dragged = true;
        var r = btn.getBoundingClientRect();
        savePos(r.left, r.top);
      }
      try {
        btn.releasePointerCapture(ev.pointerId);
      } catch (e) {}
    }
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (dragged) {
        dragged = false;
        return;
      }
      // 第二次点击（双击的第二次）由 dblclick 接管，这里只取消待执行的单击
      if (clickTimer) {
        cancelClickTimer();
        return;
      }
      clickTimer = window.setTimeout(function () {
        clickTimer = null;
        setOpen(!openFlag);
      }, CLICK_DELAY);
    });
    btn.addEventListener('dblclick', function (ev) {
      ev.stopPropagation();
      ev.preventDefault();
      // 第二次 click 已在上面取消了待执行单击，这里只需收菜单 + 切全屏
      setOpen(false);
      toggleFullscreen();
    });
  }

  // ── 构建 UI ──────────────────────────────────────────────────────────
  function buildUi() {
    if (uiReady || !document.body) return false;
    injectStyle();

    btn = el('button');
    btn.id = DOCK_ID;
    btn.type = 'button';
    btn.setAttribute('aria-label', '功能入口：单击展开菜单，双击最大化游戏');
    btn.setAttribute('title', '单击展开菜单 · 双击最大化游戏 · 可拖动');
    btn.innerHTML = ICON_SVG;
    document.body.appendChild(btn);
    installDrag();
    applyPos();

    menu = el('div');
    menu.id = MENU_ID;
    menu.hidden = true;
    document.body.appendChild(menu);
    menu.addEventListener('click', function (ev) {
      ev.stopPropagation();
    });

    // 点击别处收起
    document.addEventListener('click', function () {
      if (openFlag) setOpen(false);
    });
    document.addEventListener('keydown', function (ev) {
      if (ev && ev.key === 'Escape' && openFlag) setOpen(false);
    });
    window.addEventListener('resize', applyPos);

    uiReady = true;
    renderMenu();
    return true;
  }

  function boot() {
    if (typeof document === 'undefined') return;
    if (document.body) {
      buildUi();
      return;
    }
    try {
      if (typeof document.addEventListener === 'function') {
        document.addEventListener('DOMContentLoaded', buildUi, { once: true });
      }
      window.setTimeout(buildUi, 500);
    } catch (e) {}
  }

  // ── 对外接口 ─────────────────────────────────────────────────────────
  var api = {
    version: VERSION,
    /** 注册一个功能入口；重复 id 覆盖旧的 */
    register: function (item) {
      if (!item || !item.id) return;
      if (registered[item.id]) {
        // 覆盖：先移除旧项
        items = items.filter(function (x) {
          return x.id !== item.id;
        });
      }
      registered[item.id] = true;
      items.push({
        id: String(item.id),
        name: item.name || String(item.id),
        char: item.char || '·',
        color: item.color || '#5f6470',
        order: typeof item.order === 'number' ? item.order : 99,
        open: item.open,
        enabled: item.enabled,
      });
      // 稳定排序：order 小的在上
      items.sort(function (a, b) {
        return a.order - b.order;
      });
      if (uiReady) {
        renderMenu();
        if (openFlag) positionMenu(0, 0);
      }
      return api;
    },
    /** 注销一个入口 */
    unregister: function (id) {
      if (!id) return;
      items = items.filter(function (x) {
        return x.id !== id;
      });
      delete registered[id];
      if (uiReady) renderMenu();
    },
    /** 已注册入口 id 列表（自检 / 测试用） */
    list: function () {
      return items.map(function (x) {
        return x.id;
      });
    },
    /** 展开 / 收起菜单 */
    toggle: function () {
      setOpen(!openFlag);
    },
    /** 游戏窗口最大化 / 还原（双击圆钮走的就是这里） */
    toggleFullscreen: toggleFullscreen,
    close: function () {
      setOpen(false);
    },
    isOpen: function () {
      return openFlag;
    },
  };

  window.__XYZW_DOCK__ = api;
  boot();
  console.log('[工具坞] v' + VERSION + ' 已就绪');
})();
