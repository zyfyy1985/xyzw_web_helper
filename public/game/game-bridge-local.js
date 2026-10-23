/**
 * 本地 GameBridge（替代怪兽启动器的服务端会话桥）
 * 数据来源：URL ?bin_id= / localStorage('current_bin_id') + localStorage('bin_data_<id>')
 * bin 以 hex 存储，getBinData() 统一返回 base64，供 qiefu / monster_script atob 后解密。
 */
(function () {
  'use strict';

  // 微信 PC 小游戏环境伪装（qiefu 注入请求头时读取）
  window.__WECHAT_REFERER__ =
    'https://servicewechat.com/wx0840558555a454ed/326/page-frame.html';
  window.__WECHAT_UA__ =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF WindowsWechat(0x63090a13) UnifiedPCWindowsWechat(0xf254186b) XWEB/19481';

  function getBinId() {
    var params = new URLSearchParams(window.location.search);
    return (
      params.get('bin_id') ||
      params.get('id') ||
      localStorage.getItem('current_bin_id')
    );
  }

  function hexToBytes(hex) {
    var matches = hex.match(/.{1,2}/g);
    if (!matches) return new Uint8Array(0);
    var bytes = new Uint8Array(matches.length);
    for (var i = 0; i < matches.length; i++) {
      bytes[i] = parseInt(matches[i], 16);
    }
    return bytes;
  }

  function bytesToBase64(bytes) {
    var binary = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(
        null,
        bytes.subarray(i, Math.min(i + chunk, bytes.length))
      );
    }
    return btoa(binary);
  }

  // localStorage 里的 bin(hex) → base64
  function getBinData() {
    try {
      var id = getBinId();
      if (!id) {
        console.warn('[GameBridge] 未找到 bin_id（URL 参数或 current_bin_id）');
        return null;
      }
      var hex = localStorage.getItem('bin_data_' + id);
      if (!hex || hex.length < 2) {
        console.warn('[GameBridge] bin 数据不存在: bin_data_' + id);
        return null;
      }
      console.log('[GameBridge] 读取 bin 成功，id:', id);
      return bytesToBase64(hexToBytes(hex));
    } catch (e) {
      console.error('[GameBridge] getBinData 失败:', e);
      return null;
    }
  }

  // 切服目标区（?server_id=），不指定则返回 null，脚本按 bin 原始区服登录
  function getTargetServerId() {
    var params = new URLSearchParams(window.location.search);
    return params.get('server_id') || null;
  }

  // ============ 内置功能脚本 ============
  // 勾选记录由前端「打开游戏」对话框写入（key: h5_enabled_features，值 { [tokenid]: id[] }）
  // 本清单 = featureScripts.js 的 FEATURE_SCRIPTS + 「工具坞.js」+ 受限脚本。
  // ⚠️「工具坞.js」不在前端勾选清单里（它是入口容器，由本文件强制前置注入，见下方
  //    loadSelectedFeatures），但写在这里才能通过 known[id] 校验、不被当脏数据剔除。
  // ⚠️ ALWAYS_FEATURES 里的默认加载脚本同样必须写在这里，理由同上。
  var BUILTIN_FEATURES = [
    '工具坞.js',
    '模拟战斗.js',
    '竞技助手.js',
    '盐场视距.js',
    '自动蟠桃.js',
    '长按连点.js',
    '账号切换.js',
    '盐场辅助.js',
    '云阵容.js',
    '蟠桃辅助.js',
    '盐场辅助Pro.js',
    '战斗增强.js',
  ];
  var FEATURE_STORAGE_KEY = 'h5_enabled_features';
  // 用户未做过选择时的默认开启项（与前端 src/utils/featureScripts.js 保持一致）
  var DEFAULT_FEATURES = ['账号切换.js'];
  // 默认加载脚本：不受勾选控制，无论记录里有没有都注入。
  // 与前端 src/utils/featureScripts.js 的 ALWAYS_FEATURES 必须保持一致（`always: true`）。
  var ALWAYS_FEATURES = ['竞技助手.js'];
  var featurePromises = {};

  /** 读取当前 token 的勾选记录；缺失 / 损坏 / 旧扁平格式时返回默认项（仅「账号切换」） */
  function getEnabledFeatures() {
    var binId = getBinId();
    if (!binId) {
      console.warn('[GameBridge] 无 bin_id，内置脚本按默认项处理');
      return DEFAULT_FEATURES.slice();
    }
    try {
      var raw = localStorage.getItem(FEATURE_STORAGE_KEY);
      if (raw === null || raw === '') return DEFAULT_FEATURES.slice();
      var map = JSON.parse(raw);
      if (!map || typeof map !== 'object' || Array.isArray(map)) {
        console.warn('[GameBridge] 勾选记录格式不符（旧扁平格式或损坏），按默认项处理');
        return DEFAULT_FEATURES.slice();
      }
      var list = map[binId];
      if (!Array.isArray(list)) return DEFAULT_FEATURES.slice();
      var known = {};
      BUILTIN_FEATURES.forEach(function (id) {
        known[id] = true;
      });
      var valid = list.filter(function (id) {
        return typeof id === 'string' && known[id];
      });
      return valid.filter(function (id, i) {
        return valid.indexOf(id) === i; // 去重
      });
    } catch (e) {
      console.warn('[GameBridge] 内置脚本记录无效，按默认项处理:', e);
      return DEFAULT_FEATURES.slice();
    }
  }

  function normalizeFeatureId(name) {
    var id = String(name == null ? '' : name).trim();
    if (!/^[^/\\]+\.js$/i.test(id) || id.length > 256) {
      throw new Error('H5 功能 ID 无效: ' + id);
    }
    return id;
  }

  /** 加载单个内置脚本：features/<name>，与官方 web-bridge 行为一致 */
  function loadFeature(name) {
    var id;
    try {
      id = normalizeFeatureId(name);
    } catch (e) {
      return Promise.reject(e);
    }
    if (featurePromises[id]) return featurePromises[id];

    var p = new Promise(function (resolve, reject) {
      var el = document.createElement('script');
      var url = new URL('features/' + encodeURIComponent(id), window.location.href);
      if (window.__H5_BUILD_VERSION__) {
        url.searchParams.set('v', String(window.__H5_BUILD_VERSION__));
      }
      el.async = true;
      el.src = url.href;
      el.onload = function () {
        el.remove();
        console.log('[GameBridge] 内置脚本已加载:', id);
        resolve(id);
      };
      el.onerror = function () {
        el.remove();
        reject(new Error('加载 H5 功能失败: ' + id));
      };
      (document.head || document.documentElement).appendChild(el);
    })['catch'](function (err) {
      // 单个脚本失败不阻断后续脚本
      console.warn('[GameBridge] ' + err.message);
      return null;
    });

    featurePromises[id] = p;
    return p;
  }

  /** 按当前 token 的勾选依次加载内置脚本（仍返回 Promise，兼容 h5-bootstrap） */
  function loadSelectedFeatures() {
    var enabled = getEnabledFeatures();
    // 「工具坞」是各功能入口的统一容器，必须最先加载，
    // 其余脚本才能在启动时向它注册入口。用户没勾它也强制前置注入。
    var DOCK = '工具坞.js';
    var head = [];
      if (enabled.indexOf(DOCK) === -1) head.push(DOCK);
      ALWAYS_FEATURES.forEach(function (id) {
        if (enabled.indexOf(id) === -1) head.push(id);
      });
    var ordered = head.length ? head.concat(enabled) : enabled;
    console.log(
      '[GameBridge] 加载内置脚本 (' + ordered.length + '): ' + ordered.join(', ')
    );
    return ordered.reduce(function (chain, name) {
      return chain.then(function () {
        return loadFeature(name);
      });
    }, Promise.resolve());
  }

  window.GameBridge = {
    // h5-bootstrap 等待的就绪态：本地无授权，直接就绪
    ready: Promise.resolve(),

    getBinData: getBinData,
    getTargetServerId: getTargetServerId,
    targetServerId: null,

    // 选区回调：记录即可
    onServerIdChange: function (serverId) {
      console.log('[GameBridge] 玩家选择服务器:', serverId);
      try {
        localStorage.setItem('current_server_id', String(serverId));
      } catch (e) {}
    },

    setClipboard: function (text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(String(text)).catch(function () {});
      }
    },

    // 启动阶段上报 / 授权脚本下发 / 错误遮罩：本地版全部空实现
    reportBootStage: function (stage) {
      console.log('[GameBridge] boot stage:', stage);
    },
    loadFeature: loadFeature,
    loadSelectedFeatures: loadSelectedFeatures,
    shouldDeferBoot: function () {
      return false;
    },
    showAuthorizationError: function () {}
  };

  console.log('[GameBridge] 本地桥已就绪');
})();
