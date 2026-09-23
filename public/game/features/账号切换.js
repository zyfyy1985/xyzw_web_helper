// @name         账号切换
// @version      1.1.0
// @description  游戏内账号切换登录器：白色浮层面板，显示当前登录账号与启动列表，
//               支持切换（当前窗口换号并重载游戏）/ 刷新（重开当前账号游戏）/
//               启动（新标签页打开该账号）/ 删除（仅移除 bin_file_list 条目与 bin_data 缓存，
//               不动 IndexedDB 与 Token 库；游戏中的账号不可删除）。
//
// ── 数据来源 ───────────────────────────────────────────────────────────
//   localStorage('bin_file_list')：启动列表 [{id,name,byteLength,size,order}]，
//     由控制台「打开游戏」时登记；localStorage('bin_data_<id>') 为对应 BIN(hex)。
//   ★ 本窗口账号（selfBinId）：优先读本页 URL 的 ?bin_id=（「启动」新开的标签页
//     由 GamePlayer 透传进 iframe），否则回退 localStorage('current_bin_id')。
//     这样多标签页互不干扰：新标签页的游戏与面板显示的都是 URL 指定的账号。
//   浏览器标签页标题同步为当前账号的角色名。
//
// ── 面板挂载（本脚本的关键设计）────────────────────────────────────────
//   功能脚本由 game-bridge 注入游戏页（GamePlayer 的 iframe 内）。若把面板画在
//   iframe 文档里，重载游戏 = 面板一起消失。因此：
//     · 游戏页在 /game iframe 里运行时（window.parent 同源可访问），面板 DOM 与
//       控制器 __ACCT_SWITCH__ 都挂到【父窗口】——iframe 重载只刷新游戏，面板不动；
//     · 面板按钮统一用 inline onclick，点击时在宿主窗口作用域解析 __ACCT_SWITCH__；
//       每次 boot 都用【新上下文】的控制器替换宿主上的旧引用（旧 iframe 销毁后旧闭包
//       不可靠），面板 DOM 本身不重建，避免闪烁；按钮全部操作宿主窗口 API；
//     · 独立打开 index.html（无父窗口）时退化为画在自己文档里，刷新会整页重载，
//       面板由本脚本在下次 boot 时重新注入（短暂消失属预期）。
// ── 按钮 / 交互 ─────────────────────────────────────────────────────────
//   −  面板最小化为悬浮小球（仅头像大小，状态存 localStorage 'xyzw_acct_switch_min'），
//      点击标题栏任意空白处也可最小化
//   ▢  整个游戏窗口 requestFullscreen（对 documentElement，全页保持可见）
//   切换  改写 current_bin_id → 带 bin_id 重载游戏 iframe（不弹"切换中"提示）；
//         目标缺 bin_data 时提示先去控制台打开一次
//   刷新（仅当前账号行）= 按本窗口账号重载游戏 iframe，凭据不变
//   启动  新标签页打开 /game?bin_id=<id>，不写 current_bin_id、不影响本窗口
//   删除  二次确认后从 bin_file_list 移除该条目并删 bin_data_<id>；本窗口账号行禁用
(function () {
  'use strict';

  var VERSION = '1.1.0';
  var MIN_KEY = 'xyzw_acct_switch_min';
  var PANEL_ID = 'acctSwitchPanel';
  var PILL_ID = 'acctSwitchPill';
  var CTRL_KEY = '__ACCT_SWITCH__';

  // ── 宿主窗口：优先父窗口（同源），否则自己 ──────────────────────────
  var twin = null;
  try {
    if (window.parent && window.parent !== window && window.parent.document) {
      twin = window.parent;
    }
  } catch (e) {
    twin = null;
  }
  var host = twin || window;
  var doc = host.document;
  var hostDoc = doc; // 宿主文档固定引用（全屏时 doc 会切到 iframe 文档）

  // ── 工具 ─────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function getList() {
    try {
      var raw = JSON.parse(host.localStorage.getItem('bin_file_list') || '[]');
      if (!Array.isArray(raw)) return [];
      return raw.slice().sort(function (a, b) {
        return (a.order || 0) - (b.order || 0);
      });
    } catch (e) {
      return [];
    }
  }
  function setList(list) {
    host.localStorage.setItem('bin_file_list', JSON.stringify(list));
  }
  // 本窗口账号：URL ?bin_id= 优先（新标签页由 GamePlayer 透传），回退 current_bin_id
  function selfBinId() {
    try {
      var q = new URLSearchParams(window.location.search);
      var fromUrl = q.get('bin_id') || q.get('id');
      if (fromUrl) return fromUrl;
    } catch (e) {}
    return host.localStorage.getItem('current_bin_id') || '';
  }
  function hasBinData(id) {
    var hex = host.localStorage.getItem('bin_data_' + id);
    return !!hex && hex.length >= 2;
  }
  function findItem(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(id)) return { item: list[i], idx: i };
    }
    return { item: null, idx: -1 };
  }
  function gameFrame() {
    return hostDoc.querySelector('iframe.game-iframe') || hostDoc.querySelector('iframe');
  }
  // 局部刷新：只重载游戏 iframe（可选带 bin_id），面板挂在宿主窗口不受影响
  function reloadGame(binId) {
    // 面板若在 iframe 文档（全屏搬入后未搬回），先搬回宿主：
    // 避免 iframe 重载把面板一起销毁（保持旧版「刷新只重载游戏、面板不动」）
    returnPanelToHost();
    var f = gameFrame();
    if (f && twin) {
      try {
        var url = new URL(f.src, host.location.href);
        var curUrl = String(f.contentWindow ? f.contentWindow.location.href : f.src);
        if (binId) {
          url.searchParams.set('bin_id', binId);
        }
        if (url.href !== curUrl) {
          f.contentWindow.location.replace(url.href);
        } else {
          f.contentWindow.location.reload();
        }
        return;
      } catch (e) {}
    }
    // 独立打开（无父窗口）的兜底：改自身 URL 后整页重载
    try {
      var self = new URL(host.location.href);
      if (binId) self.searchParams.set('bin_id', binId);
      if (self.href !== host.location.href) {
        host.location.replace(self.href);
        return;
      }
    } catch (e) {}
    host.location.reload();
  }
  function toast(msg) {
    var bar = doc.getElementById('acctSwitchMsg');
    if (!bar) return;
    bar.textContent = msg;
    bar.style.display = 'block';
    if (host.__acctSwitchMsgTimer) host.clearTimeout(host.__acctSwitchMsgTimer);
    host.__acctSwitchMsgTimer = host.setTimeout(function () {
      bar.style.display = 'none';
    }, 2600);
  }

  // ── 渲染（列表 + 当前账号区 + 悬浮球 + 标签页标题）──────────────────
  function render() {
    var list = getList();
    var selfId = selfBinId();
    var found = findItem(list, selfId);
    var cur = found.item;

    // 标签页标题 = 角色名
    try { host.document.title = cur ? cur.name || '游戏' : '游戏'; } catch (e) {}

    var countEl = doc.getElementById('acctSwitchCount');
    if (countEl) countEl.textContent = list.length + ' 个账号';

    var box = doc.getElementById('acctSwitchCur');
    if (box) {
      box.innerHTML =
        '<div class="as-avatar">' + esc(cur ? (cur.name || '?').charAt(0) : '?') + '</div>' +
        '<div class="as-cur-info">' +
          '<div class="as-cur-name">' + esc(cur ? cur.name : '当前账号') +
            '<span class="as-tag-live">本窗口游戏中</span>' +
          '</div>' +
        '</div>';
    }

    var listEl = doc.getElementById('acctSwitchList');
    if (listEl) {
      var html = '';
      for (var j = 0; j < list.length; j++) {
        var a = list[j];
        var isCur = j === found.idx;
        html +=
          '<div class="as-row' + (isCur ? ' as-row-cur' : '') + '">' +
            '<div class="as-avatar as-avatar-sm">' + esc((a.name || '?').charAt(0)) + '</div>' +
            '<div class="as-info">' +
              '<div class="as-name">' + esc(a.name || 'Token') +
                (isCur ? '<span class="as-tag-live">本窗口</span>' : '') +
              '</div>' +
            '</div>' +
            (isCur
              ? '<button class="as-btn as-btn-gray" disabled title="已在当前窗口游戏">游戏中</button>' +
                '<button class="as-btn as-btn-amber" onclick="__ACCT_SWITCH__.refresh()" title="重新打开该账号游戏">刷新</button>' +
                '<button class="as-btn as-btn-gray" disabled title="游戏中的账号不可删除">删除</button>'
              : '<button class="as-btn as-btn-blue" onclick="__ACCT_SWITCH__.switchAt(' + j + ')">切换</button>' +
                '<button class="as-btn as-btn-green" onclick="__ACCT_SWITCH__.launchAt(' + j + ')">启动</button>' +
                '<button class="as-btn as-btn-red" onclick="__ACCT_SWITCH__.removeAt(' + j + ')">删除</button>') +
          '</div>';
      }
      if (!list.length) {
        html = '<div class="as-empty">启动列表为空：在控制台「打开游戏」后账号会登记到这里</div>';
      }
      listEl.innerHTML = html;
    }

    var pillAva = doc.getElementById('acctSwitchPillAva');
    if (pillAva) pillAva.textContent = cur ? (cur.name || '?').charAt(0) : '?';
  }

  function applyMinState(min) {
    var panel = doc.getElementById(PANEL_ID);
    var pill = doc.getElementById(PILL_ID);
    if (panel) panel.style.display = min ? 'none' : 'block';
    if (pill) pill.style.display = min ? 'flex' : 'none'; // flex：保证头像与球心对齐
    if (min) applyPillPos();
  }

  // 悬浮球位置：存 localStorage('bin_tool_position') 的 acctSwitch 字段，
  // 与其他工具共用同一个键（对象分工具存，互不覆盖）
  function loadToolPos() {
    try {
      var raw = JSON.parse(host.localStorage.getItem('bin_tool_position') || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch (e) {
      return {};
    }
  }
  function savePillPos(x, y) {
    var all = loadToolPos();
    all.acctSwitch = { x: Math.round(x), y: Math.round(y) };
    host.localStorage.setItem('bin_tool_position', JSON.stringify(all));
  }
  function applyPillPos() {
    var pill = doc.getElementById(PILL_ID);
    if (!pill) return;
    var p = loadToolPos().acctSwitch;
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return;
    var maxX = (host.innerWidth || 9999) - 40;
    var maxY = (host.innerHeight || 9999) - 40;
    pill.style.left = Math.max(0, Math.min(p.x, maxX)) + 'px';
    pill.style.top = Math.max(0, Math.min(p.y, maxY)) + 'px';
    pill.style.right = 'auto';
  }

  // ── 全屏适配：最大化时把面板/悬浮球/样式搬进 iframe 文档 ─────────────
  // 实测（真机探针）：进入游戏自动最大化 = 真·全屏 API，
  // hostFS=iframe.game-iframe、iframeFS=body → top layer 只渲染全屏元素子树，
  // 宿主 body 上的面板/球必然被盖住 → 全屏期间搬进 iframe 文档，退出搬回。
  // doc 同步切换，控制器所有 getElementById 自动落到当前所在文档。
  function fsActiveDoc() {
    var f = gameFrame();
    try {
      var fd = f && f.contentDocument;
      if (!fd) return null;
      if (fd.fullscreenElement) return fd; // iframe 文档内部真全屏
      // 宿主侧全屏元素=游戏 iframe 元素：iframe 导航（刷新/切号）后全屏保持，
      // 新文档 fullscreenElement 为 null，但整份 iframe 内容仍在 top layer 里可见
      if (hostDoc.fullscreenElement && f && hostDoc.fullscreenElement === f) return fd;
    } catch (e) {}
    return null;
  }
  function overlayDoc() {
    // 面板当前所在文档：宿主优先，其次游戏 iframe 文档（全屏搬入后宿主查不到，
    // 必须两份文档都找，否则搬回逻辑永远不触发）
    var p = hostDoc.getElementById(PANEL_ID);
    if (p) return hostDoc;
    try {
      var f = gameFrame();
      var fd = f && f.contentDocument;
      if (fd && fd.getElementById(PANEL_ID)) return fd;
    } catch (e) {}
    return null;
  }
  // 面板搬回宿主（退出全屏 / 刷新切号前调用），doc 引用同步切回
  function returnPanelToHost() {
    var curDoc = overlayDoc();
    if (!curDoc || curDoc === hostDoc) return;
    var panel = curDoc.getElementById(PANEL_ID);
    var pill = curDoc.getElementById(PILL_ID);
    var style = curDoc.getElementById('acctSwitchStyle');
    if (style && hostDoc.head) hostDoc.head.appendChild(style);
    if (panel) hostDoc.body.appendChild(panel);
    if (pill) hostDoc.body.appendChild(pill);
    doc = hostDoc;
    try {
      var f = gameFrame();
      if (f && f.contentDocument && f.contentDocument.defaultView) {
        f.contentDocument.defaultView.__ACCT_SWITCH__ = undefined;
      }
    } catch (e) {}
  }
  function syncFullscreen() {
    var curDoc = overlayDoc();
    if (!curDoc) return; // 面板不存在（iframe 重载后重建中）
    var panel = curDoc.getElementById(PANEL_ID);
    var pill = curDoc.getElementById(PILL_ID);
    if (!panel || !pill) return;
    var fd = fsActiveDoc();
    if (fd && curDoc !== fd) {
      // 进全屏：样式+面板+球 搬进全屏元素（body），doc 切到 iframe 文档
      var fsEl = fd.fullscreenElement || fd.body;
      var style = curDoc.getElementById('acctSwitchStyle');
      if (style) fsEl.appendChild(style);
      fsEl.appendChild(panel);
      fsEl.appendChild(pill);
      doc = fd;
      try { fd.defaultView.__ACCT_SWITCH__ = host[CTRL_KEY]; } catch (e) {}
      if (pill.style.display !== 'none') applyPillPos();
    } else if (!fd && curDoc !== hostDoc) {
      // 退全屏：搬回宿主，doc 切回
      returnPanelToHost();
    }
  }
  function installFsSync() {
    // 全屏链路上每份文档都会收到 fullscreenchange（探针实测 @host/@iframe 均派发），
    // 宿主监听一份即可；boot 每次重跑先卸旧再挂新，避免监听叠加
    if (host.__acctFsSyncOnFs) {
      host.removeEventListener('fullscreenchange', host.__acctFsSyncOnFs);
      host.removeEventListener('webkitfullscreenchange', host.__acctFsSyncOnFs);
    }
    host.__acctFsSyncOnFs = function () { syncFullscreen(); };
    host.addEventListener('fullscreenchange', host.__acctFsSyncOnFs);
    host.addEventListener('webkitfullscreenchange', host.__acctFsSyncOnFs);
    // 挂载时可能已处于全屏（接管场景 / iframe 导航后全屏保持场景）
    syncFullscreen();
  }

  // ── 控制器（每次 boot 用新上下文替换宿主上的旧引用）─────────────────
  var ctrl = {
    version: VERSION,
    list: getList,
    currentId: selfBinId,
    sync: function () { render(); },

    switchAt: function (idx) {
      var item = getList()[idx];
      if (!item) return;
      if (String(item.id) === String(selfBinId())) return;
      if (!hasBinData(item.id)) {
        toast('「' + item.name + '」缺少本机 BIN 缓存，请先在控制台用它打开一次游戏');
        return;
      }
      host.localStorage.setItem('current_bin_id', item.id);
      render();
      reloadGame(item.id);
    },

    refresh: function () {
      reloadGame(selfBinId());
    },

    launchAt: function (idx) {
      var item = getList()[idx];
      if (!item) return;
      if (!hasBinData(item.id)) {
        toast('「' + item.name + '」缺少本机 BIN 缓存，请先在控制台用它打开一次游戏');
        return;
      }
      var url = host.location.origin + '/game?bin_id=' + encodeURIComponent(item.id);
      host.open(url, '_blank');
      toast('已在新标签页启动「' + item.name + '」');
    },

    removeAt: function (idx) {
      var item = getList()[idx];
      if (!item) return;
      if (String(item.id) === String(selfBinId())) {
        toast('游戏中的账号不可删除');
        return;
      }
      if (!host.confirm('从启动列表移除「' + item.name + '」？\n仅删除本机 bin_file_list 条目与 bin_data，Token 库不受影响。')) {
        return;
      }
      setList(getList().filter(function (x) { return String(x.id) !== String(item.id); }));
      try { host.localStorage.removeItem('bin_data_' + item.id); } catch (e) {}
      render();
      toast('已移除「' + item.name + '」（IndexedDB / Token 未动）');
    },

    minimize: function () {
      host.localStorage.setItem(MIN_KEY, '1');
      applyMinState(true);
    },
    restore: function () {
      if (ctrl.__skipClick) {
        ctrl.__skipClick = false; // 拖动结束后的 click 不当还原
        return;
      }
      host.localStorage.setItem(MIN_KEY, '0');
      applyMinState(false);
    },
    // 悬浮球拖动：pointermove 跟手，松手存 bin_tool_position；移动过则吞掉本次 click
    dragStart: function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      var pill = doc.getElementById(PILL_ID);
      if (!pill) return;
      e.preventDefault();
      var rect = pill.getBoundingClientRect();
      var offX = e.clientX - rect.left;
      var offY = e.clientY - rect.top;
      var startX = e.clientX;
      var startY = e.clientY;
      var moved = false;
      function onMove(ev) {
        if (Math.abs(ev.clientX - startX) > 4 || Math.abs(ev.clientY - startY) > 4) {
          moved = true;
        }
        var maxX = (host.innerWidth || 9999) - rect.width;
        var maxY = (host.innerHeight || 9999) - rect.height;
        var nx = Math.max(0, Math.min(ev.clientX - offX, maxX));
        var ny = Math.max(0, Math.min(ev.clientY - offY, maxY));
        pill.style.left = nx + 'px';
        pill.style.top = ny + 'px';
        pill.style.right = 'auto';
      }
      function onTouchMove(ev) {
        // 触屏兜底：阻止浏览器把按住拖动识别成滚动（否则触发 pointercancel 拖不动）
        ev.preventDefault();
      }
      function onUp() {
        doc.removeEventListener('pointermove', onMove);
        doc.removeEventListener('pointerup', onUp);
        doc.removeEventListener('pointercancel', onUp);
        doc.removeEventListener('touchmove', onTouchMove);
        if (moved) {
          ctrl.__skipClick = true;
          var r = pill.getBoundingClientRect();
          savePillPos(r.left, r.top);
        }
      }
      doc.addEventListener('pointermove', onMove);
      doc.addEventListener('pointerup', onUp);
      doc.addEventListener('pointercancel', onUp);
      doc.addEventListener('touchmove', onTouchMove, { passive: false });
    },
    fullscreen: function () {
      if (doc.fullscreenElement) {
        if (doc.exitFullscreen) doc.exitFullscreen();
      } else if (doc.documentElement.requestFullscreen) {
        doc.documentElement.requestFullscreen();
      }
    },

    // 离开游戏页时由宿主（GamePlayer onUnmounted）调用：清掉挂在 body 上的浮层，
    // 否则返回 dashboard 后悬浮球/面板会残留
    destroy: function () {
      [PANEL_ID, PILL_ID, 'acctSwitchStyle'].forEach(function (id) {
        var el = doc.getElementById(id);
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
      if (host.__acctFsSyncOnFs) {
        host.removeEventListener('fullscreenchange', host.__acctFsSyncOnFs);
        host.removeEventListener('webkitfullscreenchange', host.__acctFsSyncOnFs);
        host.__acctFsSyncOnFs = null;
      }
      if (host.__acctSwitchMsgTimer) host.clearTimeout(host.__acctSwitchMsgTimer);
      try { delete host[CTRL_KEY]; } catch (e) { host[CTRL_KEY] = undefined; }
    }
  };

  // ── 注入样式与面板 ───────────────────────────────────────────────────
  var css = [
    '#' + PANEL_ID + '{position:fixed;top:44px;right:8px;z-index:2147483000;width:300px;',
    'background:#ffffff;border:1px solid #d0d3d9;border-radius:12px;color:#1f2329;',
    "font:13px/1.5 -apple-system,'Segoe UI','Microsoft YaHei',sans-serif;text-align:left;",
    'box-shadow:0 4px 16px rgba(0,0,0,0.14);overflow:hidden;user-select:none;}',
    // 最小化悬浮球：仅头像大小，点击还原面板
    '#' + PILL_ID + '{position:fixed;top:8px;right:8px;z-index:2147483000;width:34px;height:34px;',
    'background:#ffffff;border:1px solid #d0d3d9;border-radius:50%;color:#1f2329;',
    "font:13px/1.5 -apple-system,'Segoe UI','Microsoft YaHei',sans-serif;text-align:left;",
    'box-shadow:0 4px 16px rgba(0,0,0,0.14);user-select:none;-webkit-user-select:none;',
    'touch-action:none;-webkit-touch-callout:none;',
    'display:none;align-items:center;justify-content:center;cursor:pointer;padding:0;}',
    '.as-head{display:flex;align-items:center;gap:8px;padding:9px 12px;',
    'background:#f7f8fa;border-bottom:1px solid #e6e8ec;}',
    '.as-dot{width:8px;height:8px;border-radius:50%;background:#1d9e75;flex-shrink:0;}',
    '.as-title{font-weight:600;font-size:13px;cursor:pointer;}',
    '.as-count{font-size:11px;color:#8a8f99;margin-left:auto;}',
    '.as-win{width:22px;height:22px;border-radius:5px;border:1px solid #d0d3d9;background:#fff;',
    'color:#5f6470;font-size:11px;cursor:pointer;line-height:1;padding:0;flex-shrink:0;}',
    '.as-cur{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#eaf3fb;',
    'border-bottom:1px solid #e6e8ec;}',
    '.as-avatar{width:38px;height:38px;border-radius:50%;background:#378add;color:#fff;',
    'display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;flex-shrink:0;}',
    '.as-avatar-sm{width:30px;height:30px;font-size:12px;background:#eaf1f9;color:#378add;}',
    '.as-row-cur .as-avatar-sm{background:#1d9e75;color:#fff;}',
    '.as-cur-info,.as-info{min-width:0;flex:1;}',
    '.as-cur-name,.as-name{font-weight:600;font-size:12px;display:flex;align-items:center;gap:5px;',
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.as-tag-live{font-size:9px;font-weight:400;padding:1px 6px;border-radius:8px;',
    'background:#0f6e56;color:#fff;flex-shrink:0;}',
    '.as-hint{padding:6px 12px 0;font-size:10px;color:#9aa0aa;}',
    '#' + PANEL_ID + ' .as-list{padding:4px 8px 8px;max-height:60vh;overflow-y:auto;}',
    '.as-row{display:flex;align-items:center;gap:6px;padding:7px 6px;border-radius:8px;}',
    '.as-row-cur{background:#eaf3fb;}',
    '.as-row+.as-row{margin-top:4px;}',
    '.as-btn{height:22px;padding:0 8px;border-radius:5px;font-size:11px;cursor:pointer;',
    'line-height:20px;flex-shrink:0;font-family:inherit;}',
    '.as-btn-blue{border:1px solid #185fa5;background:#185fa5;color:#fff;}',
    '.as-btn-green{border:1px solid #3b6d11;background:#3b6d11;color:#fff;}',
    '.as-btn-amber{border:1px solid #ba7517;background:#ba7517;color:#fff;}',
    '.as-btn-red{border:1px solid #a32d2d;background:#fff;color:#a32d2d;}',
    '.as-btn-gray{border:1px solid #d0d3d9;background:#f4f5f7;color:#b3b8c2;cursor:not-allowed;}',
    '.as-empty{padding:16px 12px;font-size:12px;color:#8a8f99;text-align:center;}',
    '#acctSwitchMsg{display:none;margin:0 8px 8px;padding:6px 8px;border-radius:6px;',
    'background:#eaf3fb;color:#185fa5;font-size:11px;}',
    '.as-pill-ava{width:26px;height:26px;border-radius:50%;background:#378add;color:#fff;',
    'display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0;}'
  ].join('\n');

  function injectPanel() {
    var style = doc.createElement('style');
    style.id = 'acctSwitchStyle';
    style.textContent = css;
    doc.head.appendChild(style);

    var panel = doc.createElement('section');
    panel.id = PANEL_ID;
    panel.innerHTML =
      '<div class="as-head">' +
        '<span class="as-dot"></span>' +
        '<span class="as-title" title="点击最小化面板" onclick="__ACCT_SWITCH__.minimize()">账号切换</span>' +
        '<span class="as-count" id="acctSwitchCount"></span>' +
        '<button class="as-win" title="面板最小化" onclick="__ACCT_SWITCH__.minimize()">−</button>' +
        '<button class="as-win" title="游戏窗口最大化" onclick="__ACCT_SWITCH__.fullscreen()">▢</button>' +
      '</div>' +
      '<div class="as-cur" id="acctSwitchCur"></div>' +
      '<div class="as-hint">切换=当前窗口换号并重载游戏 · 启动=新标签页打开</div>' +
      '<div class="as-list" id="acctSwitchList"></div>' +
      '<div id="acctSwitchMsg"></div>';
    doc.body.appendChild(panel);

    var pill = doc.createElement('section');
    pill.id = PILL_ID;
    pill.title = '拖动移动位置 · 点击打开账号切换面板';
    pill.setAttribute('onclick', '__ACCT_SWITCH__.restore()');
    pill.setAttribute('onpointerdown', '__ACCT_SWITCH__.dragStart(event)');
    pill.innerHTML = '<div class="as-pill-ava" id="acctSwitchPillAva">?</div>';
    doc.body.appendChild(pill);
  }



  if (host[CTRL_KEY] && doc.getElementById(PANEL_ID)) {
    // 已有面板：只换新控制器（旧 iframe 上下文即将销毁），重画当前账号标记
    host[CTRL_KEY] = ctrl;
    render();
    applyMinState(host.localStorage.getItem(MIN_KEY) === '1');
    installFsSync();
    console.log('[账号切换] v' + VERSION + ' 控制器已接管，面板复用');
    return;
  }

  // 全新安装：清掉可能存在的半套残留
  ['acctSwitchStyle', PANEL_ID, PILL_ID].forEach(function (id) {
    var old = doc.getElementById(id);
    if (old && old.parentNode) old.parentNode.removeChild(old);
  });
  host[CTRL_KEY] = ctrl;
  injectPanel();
  render();
  applyMinState(host.localStorage.getItem(MIN_KEY) === '1');
  installFsSync();
  console.log('[账号切换] 面板就绪 v' + VERSION + '（宿主=' + (twin ? 'parent' : 'self') + '）');
})();
