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
    loadSelectedFeatures: function () {
      return Promise.resolve();
    },
    shouldDeferBoot: function () {
      return false;
    },
    showAuthorizationError: function () {}
  };

  console.log('[GameBridge] 本地桥已就绪');
})();
