<template>
  <div class="m-page m-tk">
    <!-- ============ 角色列表（页头条） ============
         原来这行只放一颗「添加」按钮，标题还得靠下面的卡片自己表达。
         现在收成一条：左边标题，右边两枚图标按钮 —— ＋ 添加 Token、⋯ 打开批量动作（⋯ 在最右）。
         批量动作（刷新 / 更新信息 / 导入导出 / 清理 / 断开 / 全部清除）原来占一整张卡摆在这行下面，
         都是低频重操作，收进抽屉按需点开。
         ★ 视觉照「定时任务」页那一条：同高圆角条 + 右侧图标按钮，不另立一套。 -->
    <div class="m-tk-bar">
      <span class="m-tk-bar-t">角色列表</span>
      <button class="m-tk-ibtn" aria-label="添加 Token" title="添加 Token" @click="openAdd">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5.5v13M5.5 12h13"/></svg>
      </button>
      <button class="m-tk-ibtn" aria-label="更多操作" title="更多操作" @click="bulkSheet = true">
        <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
      </button>
    </div>

    <!-- ============ 账号卡 ============ -->
    <div
      v-for="tk in gameTokens"
      :key="tk.id"
      class="m-card m-tk-card"
      :class="{ on: tk.id === selectedTokenId }"
    >
      <div class="m-tk-top">
        <span class="m-tk-ava">{{ initialOf(tk) }}</span>
        <span class="m-tk-id">
          <span class="m-tk-nm">
            {{ tk.name }}
            <span v-if="tk.server" class="m-tag" :class="statusOf(tk.id) === 'connected' ? 'done' : 'err'">{{ tk.server }}</span>
          </span>
          <span class="m-tk-sub">
            <i class="m-tk-dot" :class="statusOf(tk.id)" />{{ statusText(tk.id) }}
            <span v-if="tk.id === selectedTokenId" class="m-tk-cur">当前</span>
          </span>
        </span>
        <button class="m-tk-more" aria-label="更多操作" @click="openActions(tk)">
          <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
        </button>
      </div>

      <!-- 备注：点一下直接改（同旧版 inline 编辑） -->
      <div class="m-tk-remark" role="button" tabindex="0" @click="openEdit(tk)" @keydown.enter="openEdit(tk)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h10M4 10h7M4 15h13M4 20h6"/></svg>
        <span>{{ tk.remark || "点击添加备注" }}</span>
      </div>

      <div class="m-tk-meta">
        <span>创建 {{ fmtTime(tk.createdAt) }}</span>
        <span>最近 {{ fmtTime(tk.lastUsed) }}</span>
        <span class="m-tag" :class="isPermanent(tk) ? 'done' : 'wait'">{{ isPermanent(tk) ? "长期有效" : "临时存储" }}</span>
      </div>

      <div class="m-tk-act">
        <button class="m-btn m-btn-p" @click="enterConsole(tk)">控制台</button>
        <button class="m-btn m-btn-g" @click="toggleConn(tk)">
          {{ isLive(tk.id) ? "断开" : "连接" }}
        </button>
      </div>
    </div>

    <!-- ============ 空状态 ============ -->
    <div v-if="!gameTokens.length" class="m-card">
      <div class="m-empty">
        <div class="m-logo">◌</div>
        <h3>还没有导入任何账号</h3>
        <p>支持微信扫码、手机号验证码、BIN 多角色、手动粘贴四种方式。</p>
        <button class="m-btn m-btn-p m-btn-block" @click="openAdd">添加 Token</button>
      </div>
    </div>

    <!-- ============================================================
         批量动作（⋯ 抽屉）
         原来这是列表下方那张「数据与连接」卡，七行常驻占屏；现在是按需弹出的抽屉，
         内容和顺序与旧版「批量操作」下拉一一对应，一个没少。
         ============================================================ -->
    <div class="m-mask" :class="{ on: bulkSheet }" @click="bulkSheet = false"></div>
    <div class="m-sheet" :class="{ on: bulkSheet }">
      <div class="m-grab"></div>
      <h4>批量操作</h4>
      <div class="m-sh-sub">{{ gameTokens.length }} 个账号 · 只作用于本机数据</div>

      <div class="m-trow" role="button" tabindex="0" @click="bulk('refresh')" @keydown.enter="bulk('refresh')">
        <span class="m-body"><span class="m-nm">刷新所有 Token</span><span class="m-ds">仅刷新支持自动获取的那部分</span></span>
      </div>
      <div class="m-trow" role="button" tabindex="0" @click="bulk('info')" @keydown.enter="bulk('info')">
        <span class="m-body"><span class="m-nm">更新账号信息</span><span class="m-ds">逐个连接取最新名字 / 区服，约 3~5 秒一个</span></span>
      </div>
      <div class="m-trow" role="button" tabindex="0" @click="bulk('export')" @keydown.enter="bulk('export')">
        <span class="m-body"><span class="m-nm">导出 Token 备份</span><span class="m-ds">下载 JSON 到本机</span></span>
      </div>
      <div class="m-trow" role="button" tabindex="0" @click="bulk('import')" @keydown.enter="bulk('import')">
        <span class="m-body"><span class="m-nm">导入 Token 备份</span><span class="m-ds">从 JSON 文件恢复</span></span>
      </div>
      <div class="m-trow" role="button" tabindex="0" @click="bulk('clean')" @keydown.enter="bulk('clean')">
        <span class="m-body"><span class="m-nm">清理过期 Token</span><span class="m-ds">临时存储超过 24 小时未使用</span></span>
      </div>
      <div class="m-trow" role="button" tabindex="0" @click="bulk('disconnect')" @keydown.enter="bulk('disconnect')">
        <span class="m-body"><span class="m-nm">断开所有连接</span></span>
      </div>
      <div class="m-trow m-tk-danger" role="button" tabindex="0" @click="bulk('clear')" @keydown.enter="bulk('clear')">
        <span class="m-body"><span class="m-nm">清除所有 Token</span><span class="m-ds">不可恢复</span></span>
      </div>
    </div>

    <!-- ============================================================
         更多操作（单个账号）
         ============================================================ -->
    <div class="m-mask" :class="{ on: !!actTk }" @click="actTk = null"></div>
    <div class="m-sheet" :class="{ on: !!actTk }">
      <div class="m-grab"></div>
      <h4>{{ actTk?.name }}</h4>
      <div class="m-sh-sub">{{ actTk?.server || "未知区服" }} · {{ actTk ? statusText(actTk.id) : "" }}</div>

      <div class="m-trow" role="button" tabindex="0" @click="runAction('edit')" @keydown.enter="runAction('edit')">
        <span class="m-body"><span class="m-nm">编辑信息</span><span class="m-ds">名称 / Token / 区服 / WebSocket / 备注</span></span>
      </div>
      <div class="m-trow" role="button" tabindex="0" @click="runAction('copy')" @keydown.enter="runAction('copy')">
        <span class="m-body"><span class="m-nm">复制 Token</span></span>
      </div>
      <div
        v-if="actTk && gameTokens[0] && gameTokens[0].id !== actTk.id"
        class="m-trow"
        role="button"
        tabindex="0"
        @click="runAction('top')"
        @keydown.enter="runAction('top')"
      >
        <span class="m-body"><span class="m-nm">移到最前</span><span class="m-ds">账号列表与切换器里的顺序</span></span>
      </div>
      <div class="m-trow" role="button" tabindex="0" @click="runAction('bin')" @keydown.enter="runAction('bin')">
        <span class="m-body"><span class="m-nm">下载 BIN</span><span class="m-ds">按当前区服导出角色 BIN 文件</span></span>
      </div>
      <div class="m-trow" role="button" tabindex="0" @click="runAction('refresh')" @keydown.enter="runAction('refresh')">
        <span class="m-body">
          <span class="m-nm">{{ actTk && actTk.importMethod === "url" ? "从 URL 刷新" : "重新获取" }}</span>
          <span class="m-ds">用保存的登录凭据换一张新 Token</span>
        </span>
      </div>
      <div
        v-if="actTk && !isPermanent(actTk)"
        class="m-trow"
        role="button"
        tabindex="0"
        @click="runAction('upgrade')"
        @keydown.enter="runAction('upgrade')"
      >
        <span class="m-body"><span class="m-nm">升级为长期有效</span><span class="m-ds">不再因 24 小时未使用被自动清理</span></span>
      </div>
      <div class="m-trow m-tk-danger" role="button" tabindex="0" @click="runAction('delete')" @keydown.enter="runAction('delete')">
        <span class="m-body"><span class="m-nm">删除该账号</span><span class="m-ds">不可恢复</span></span>
      </div>
    </div>

    <!-- ============================================================
         添加 Token：4 种导入方式全部复用桌面原子组件（逻辑一行不改，只换外壳）
         ============================================================ -->
    <div class="m-mask" :class="{ on: addSheet }" @click="addSheet = false"></div>
    <div class="m-sheet" :class="{ on: addSheet }">
      <div class="m-grab"></div>
      <h4>添加 Token</h4>
      <div class="m-sh-sub">最多 {{ maxTokens }} 个账号 · 数据只存在本机</div>
      <div class="m-seg">
        <button :class="{ on: addTab === 'wxQrcode' }" @click="addTab = 'wxQrcode'">微信扫码</button>
        <button :class="{ on: addTab === 'mobile' }" @click="addTab = 'mobile'">手机号</button>
        <button :class="{ on: addTab === 'bin' }" @click="addTab = 'bin'">BIN 多角色</button>
        <button :class="{ on: addTab === 'manual' }" @click="addTab = 'manual'">手动粘贴</button>
      </div>
      <div class="m-desk m-tk-form">
        <WxQrcodeForm v-if="addTab === 'wxQrcode'" @cancel="addSheet = false" @ok="onImported" />
        <MobileTokenForm v-else-if="addTab === 'mobile'" @cancel="addSheet = false" @ok="onImported" />
        <BinTokenForm v-else-if="addTab === 'bin'" @cancel="addSheet = false" @ok="onImported" />
        <ManualTokenForm v-else @cancel="addSheet = false" @ok="onImported" />
      </div>
    </div>

    <!-- ============================================================
         编辑信息（字段与旧版 n-modal 完全一致）
         ============================================================ -->
    <div class="m-mask" :class="{ on: editSheet }" @click="editSheet = false"></div>
    <div class="m-sheet" :class="{ on: editSheet }">
      <div class="m-grab"></div>
      <h4>编辑 Token</h4>
      <div class="m-sh-sub">改错 Token 字符串会直接导致连接失败</div>

      <label class="m-tk-f">
        <span>名称 <i>*</i></span>
        <input v-model="edit.name" class="m-finput" placeholder="给账号起个名字" />
      </label>
      <label class="m-tk-f">
        <span>Token 字符串 <i>*</i></span>
        <textarea v-model="edit.token" class="m-finput m-tk-ta" rows="3" placeholder="粘贴 Token 字符串..." />
      </label>
      <label class="m-tk-f">
        <span>服务器</span>
        <input v-model="edit.server" class="m-finput" placeholder="如 14000服" />
      </label>
      <label class="m-tk-f">
        <span>WebSocket 地址</span>
        <input v-model="edit.wsUrl" class="m-finput" placeholder="ws://..." />
      </label>
      <label class="m-tk-f">
        <span>备注</span>
        <textarea v-model="edit.remark" class="m-finput m-tk-ta" rows="2" placeholder="添加备注信息..." />
      </label>

      <div class="m-tk-fbtns">
        <button class="m-btn m-btn-g" @click="editSheet = false">取消</button>
        <button class="m-btn m-btn-p" @click="saveEdit">保存</button>
      </div>
    </div>
  </div>
</template>

<script setup>
/* 移动端「Token 管理」——替换掉此前直接跳桌面 /tokens 的做法。
 * 数据与动作全部走 tokenStore / 与旧版同一个 utils，不新增接口：
 *   · 导入：直接复用桌面 TokenImport 的 4 个原子表单（wxqrcode / mobile / bin / manual），逻辑零改动
 *   · 连接 / 刷新 / 升级 / 删除 / 导出导入 / 清理：与旧版 TokenImport/index.vue 同名逻辑一一对应
 *   · 唯一的行为差异：「控制台」在旧版跳 /admin/dashboard，移动模式下该路由被守卫拦死，改跳 /mobile/home */
import { computed, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useDialog, useMessage } from "naive-ui";
import { confirmDanger, confirmAction } from "@/mobile/utils/confirm";
import { storeToRefs } from "pinia";

import WxQrcodeForm from "@/mobile/fork/views/TokenImport/wxqrcode.vue";
import MobileTokenForm from "@/mobile/fork/views/TokenImport/mobile.vue";
import BinTokenForm from "@/mobile/fork/views/TokenImport/bin.vue";
import ManualTokenForm from "@/mobile/fork/views/TokenImport/manual.vue";

import { MAX_GAME_TOKENS, useTokenStore } from "@/stores/tokenStore";
import { scheduleAuthUserRequest, transformToken } from "@/utils/token";
import {
  generateBinFromCombUser,
  refreshTokenFromCombUser,
  roleIndexFromServerId,
} from "@/utils/wechatForceLogout";
import { buildRoleBin, downloadBinFile, getBinPayload, getRoleBinFileName } from "@/utils/binFile";
import useIndexedDB from "@/hooks/useIndexedDB";

const router = useRouter();
const message = useMessage();
const dialog = useDialog();
const tokenStore = useTokenStore();
const { gameTokens, selectedTokenId } = storeToRefs(tokenStore);
const { getArrayBuffer, storeArrayBuffer, deleteArrayBuffer } = useIndexedDB();

const maxTokens = MAX_GAME_TOKENS;
const atLimit = computed(() => gameTokens.value.length >= maxTokens);
const refreshing = ref(new Set());

/* ---------- 展示辅助 ---------- */
const PERMANENT_METHODS = ["url", "bin", "wxQrcode", "mobile", "wxForceLogout"];
const isPermanent = (tk) => !!tk && (PERMANENT_METHODS.includes(tk.importMethod) || !!tk.upgradedToPermanent);
/* 头像块统一一个色（--m-primary，与顶栏头像同色）：
   原先按「名字长度 % 4」在 --m-ava-1..4 里挑，规则本身没有含义，结果三个字的「小小鱼」
   撞上 ava-4（近黑 navy），在一列蓝块里独一份 —— 看着像出了 bug。列表里的颜色不该暗示
   账号之间有区别，真要区分就靠左侧那条选中蓝线。 */
const initialOf = (tk) => (tk?.name || "咸").charAt(0);

const statusOf = (id) => tokenStore.getWebSocketStatus(id) || "disconnected";
const statusText = (id) => {
  const map = {
    connected: "已连接",
    connecting: "连接中…",
    disconnected: "已断开",
    error: "连接错误",
    disconnecting: "断开中…",
  };
  return map[statusOf(id)] || "未连接";
};
const isLive = (id) => ["connected", "connecting"].includes(statusOf(id));

function fmtTime(ts) {
  if (!ts) return "—";
  const t = typeof ts === "number" ? ts : Date.parse(ts);
  if (!t || Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 0) return "刚刚";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  const dt = new Date(t);
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`;
}

/* ---------- 连接 ---------- */
async function toggleConn(tk) {
  if (isLive(tk.id)) {
    tokenStore.closeWebSocketConnection(tk.id);
    message.success(`已断开 ${tk.name}`);
    return;
  }
  if (selectedTokenId.value !== tk.id) tokenStore.selectToken(tk.id);
  await tokenStore.createWebSocketConnection(tk.id, tk.token, tk.wsUrl);
  message.info(`正在连接 ${tk.name}…`);
}

/* 旧版 startTaskManagement：选中 + 进控制台。移动模式下 /admin/* 会被守卫踢回，改跳首页 */
function enterConsole(tk) {
  if (selectedTokenId.value !== tk.id) tokenStore.selectToken(tk.id);
  message.success(`正在进入 ${tk.name} 的控制台`);
  router.push("/mobile/home");
}

/* ============================================================
 * 单个账号的动作（更多操作 sheet）
 * ============================================================ */
const actTk = ref(null);
function openActions(tk) {
  actTk.value = tk;
}
function runAction(key) {
  const tk = actTk.value;
  if (!tk) return;
  actTk.value = null;
  if (key === "edit") openEdit(tk);
  else if (key === "copy") copyToken(tk);
  else if (key === "top") moveToTop(tk);
  else if (key === "bin") downloadTokenBin(tk);
  else if (key === "refresh") refreshOne(tk);
  else if (key === "upgrade") upgradeOne(tk);
  else if (key === "delete") removeOne(tk);
}

async function copyToken(tk) {
  try {
    await navigator.clipboard.writeText(tk.token);
    message.success("Token 已复制到剪贴板");
  } catch (e) {
    message.error("复制失败");
  }
}

/* 顺序调整：桌面版靠拖拽（handleDrop），手机上改成「移到最前」一项，
   落库方式与旧版一致 —— 直接写 gameTokens 数组 + 把排序切到 manual 并持久化。 */
function moveToTop(tk) {
  const list = [...gameTokens.value];
  const idx = list.findIndex((t) => t.id === tk.id);
  if (idx <= 0) return;
  const [item] = list.splice(idx, 1);
  list.unshift(item);
  tokenStore.gameTokens = list;
  try {
    const cfg = JSON.parse(localStorage.getItem("tokenSortConfig") || "{}");
    localStorage.setItem("tokenSortConfig", JSON.stringify({ ...cfg, field: "manual" }));
  } catch (e) {
    /* 旧配置读不出来就只写 field，不影响顺序本身 */
    localStorage.setItem("tokenSortConfig", JSON.stringify({ field: "manual" }));
  }
  message.success("已移到最前");
}

async function downloadTokenBin(tk) {
  try {
    let sourceBin;
    if (tk.combUser) {
      sourceBin = generateBinFromCombUser(tk.combUser, tk.serverId);
    } else {
      sourceBin = await getArrayBuffer(tk.id);
      if (!sourceBin) sourceBin = await getArrayBuffer(tk.name);
      if (!sourceBin) throw new Error("该账号未保存 BIN 登录凭据，无法下载");
    }
    const payload = getBinPayload(sourceBin);
    const serverId = tk.serverId ?? payload.serverId;
    if (serverId === undefined || serverId === null || serverId === "") {
      throw new Error("BIN 登录凭据缺少区服信息");
    }
    const bin = buildRoleBin(payload, serverId);
    const fileName = getRoleBinFileName({ serverId, roleId: tk.roleId ?? tk.id, name: tk.name });
    downloadBinFile(fileName, bin);
    message.success(`已开始下载：${fileName}`);
  } catch (e) {
    message.error(e.message || "下载 BIN 失败");
  }
}

function upgradeOne(tk) {
  confirmAction(dialog, {
    title: "升级为长期有效",
    content: `确认要把「${tk.name}」升级为长期有效吗？升级后不会因 24 小时未使用被自动清理。`,
    positiveText: "确认升级",
    onPositiveClick: () => {
      const ok = tokenStore.upgradeTokenToPermanent(tk.id);
      ok ? message.success("已升级为长期有效") : message.error("升级失败，可能已经是长期有效");
    },
  });
}

function removeOne(tk) {
  confirmDanger(dialog, {
    title: "删除 Token",
    content: `确定删除「${tk.name}」吗？此操作无法恢复。`,
    positiveText: "确定删除",
    onPositiveClick: async () => {
      await tokenStore.removeToken(tk.id);
      message.success("Token 已删除");
    },
  });
}

/* 刷新：与旧版 refreshToken 完全相同的四路分支（URL / combUser / 本地凭据 / 无自动刷新） */
async function refreshOne(tk) {
  if (refreshing.value.has(tk.id)) return;
  refreshing.value.add(tk.id);
  try {
    if (tk.importMethod === "url" && tk.sourceUrl) {
      const data = await scheduleAuthUserRequest(async () => {
        const isLocalUrl =
          tk.sourceUrl.startsWith(window.location.origin) ||
          tk.sourceUrl.startsWith("/") ||
          tk.sourceUrl.startsWith("http://localhost") ||
          tk.sourceUrl.startsWith("http://127.0.0.1");
        const response = isLocalUrl
          ? await fetch(tk.sourceUrl)
          : await fetch(tk.sourceUrl, { method: "GET", headers: { Accept: "application/json" }, mode: "cors" });
        if (!response.ok) throw new Error(`请求失败: ${response.status} ${response.statusText}`);
        const result = await response.json();
        if (!result.token) throw new Error("返回数据中未找到 token 字段");
        return result;
      });
      tokenStore.updateToken(tk.id, {
        token: data.token,
        server: data.server || tk.server,
        lastRefreshed: Date.now(),
      });
      message.success("Token 刷新成功");
    } else if (tk.combUser || tk.importMethod === "wxForceLogout") {
      if (!tk.combUser) throw new Error("该账号未保存 combUser，无法自动刷新");
      const refreshed = await refreshTokenFromCombUser(tk.combUser, {
        serverId: tk.serverId,
        roleIndex: tk.roleIndex,
        roleId: tk.roleId,
      });
      tokenStore.updateToken(tk.id, {
        token: refreshed.token,
        serverId: refreshed.role.serverId,
        roleId: refreshed.role.roleId,
        roleIndex: roleIndexFromServerId(refreshed.role.serverId),
        lastRefreshed: Date.now(),
      });
      message.success("Token 刷新成功");
    } else if (["wxQrcode", "bin", "mobile"].includes(tk.importMethod)) {
      let userToken = await getArrayBuffer(tk.id);
      let usedOldKey = false;
      if (!userToken) {
        userToken = await getArrayBuffer(tk.name);
        usedOldKey = true;
      }
      if (!userToken) throw new Error("本机未找到该账号的登录凭据，请重新导入");
      const newToken = await transformToken(userToken);
      tokenStore.updateToken(tk.id, { token: newToken, lastRefreshed: Date.now() });
      if (usedOldKey) {
        await storeArrayBuffer(tk.id, userToken);
        await deleteArrayBuffer(tk.name);
      }
      message.success("Token 刷新成功");
    } else {
      dialog.info({
        title: "无法自动刷新",
        content: `「${tk.name}」没有可用的自动刷新凭据，需要重新导入或直接重连。`,
        positiveText: "重新导入",
        negativeText: "重连",
        onPositiveClick: () => {
          addTab.value = "manual";
          addSheet.value = true;
        },
        onNegativeClick: () => toggleReconnect(tk),
      });
      return;
    }
    if (statusOf(tk.id) === "connected") toggleReconnect(tk);
  } catch (e) {
    message.error(e.message || "Token 刷新失败");
  } finally {
    refreshing.value.delete(tk.id);
  }
}

function toggleReconnect(tk) {
  tokenStore.closeWebSocketConnection(tk.id);
  setTimeout(() => tokenStore.createWebSocketConnection(tk.id, tk.token, tk.wsUrl), 500);
  message.info("正在尝试重新连接…");
}

/* ============================================================
 * 批量操作（页头 ⋯ 抽屉，对应旧版「批量操作」7 项）
 * ============================================================ */
const bulkSheet = ref(false);
/* 先关抽屉再执行：批量动作里多数会弹确认框（naive dialog 在 body 上），
   两层浮层叠着会分不清点的是哪个；关闭是纯 UI 状态，不会打断下面的 promise。 */
function bulk(key) {
  bulkSheet.value = false;
  if (key === "refresh") refreshAll();
  else if (key === "info") updateAllInfo();
  else if (key === "export") exportAll();
  else if (key === "import") importFile();
  else if (key === "clean") cleanExpired();
  else if (key === "disconnect") disconnectAll();
  else if (key === "clear") clearAll();
}

async function refreshAll() {
  if (!gameTokens.value.length) return message.warning("没有可刷新的 Token");
  const list = gameTokens.value.filter((t) =>
    ["url", "wxQrcode", "mobile", "wxForceLogout", "bin"].includes(t.importMethod),
  );
  if (!list.length) return message.warning("没有支持自动刷新的 Token");
  confirmAction(dialog, {
    title: "批量刷新 Token",
    content: `将依次刷新 ${list.length} 个支持自动获取的 Token，确定继续？`,
    positiveText: "开始刷新",
    onPositiveClick: async () => {
      let ok = 0,
        fail = 0;
      const tip = message.loading(`正在刷新 (0/${list.length})`, { duration: 0 });
      for (let i = 0; i < list.length; i++) {
        tip.content = `正在刷新 (${i + 1}/${list.length})：${list[i].name}`;
        try {
          await refreshOne(list[i]);
          ok++;
        } catch (e) {
          fail++;
        }
      }
      tip.destroy();
      fail === 0 ? message.success(`刷新完成，成功 ${ok} 个`) : message.warning(`完成：成功 ${ok} 个，失败 ${fail} 个`);
    },
  });
}

async function updateAllInfo() {
  if (!gameTokens.value.length) return message.warning("没有可更新的 Token");
  confirmAction(dialog, {
    title: "更新所有 Token 信息",
    content: "将逐个连接所有 Token 获取最新的角色名和区服，完成后自动断开，约 3~5 秒一个。",
    positiveText: "开始更新",
    onPositiveClick: async () => {
      let ok = 0,
        fail = 0;
      const total = gameTokens.value.length;
      const tip = message.loading(`正在更新 (0/${total})`, { duration: 0 });
      for (let i = 0; i < total; i++) {
        const tk = gameTokens.value[i];
        tip.content = `正在更新 (${i + 1}/${total})：${tk.name}`;
        try {
          await tokenStore.selectToken(tk.id);
          await new Promise((r) => setTimeout(r, 1000));
          tokenStore.closeWebSocketConnection(tk.id);
          ok++;
        } catch (e) {
          fail++;
        }
        if (i < total - 1) await new Promise((r) => setTimeout(r, 500));
      }
      tip.destroy();
      fail === 0 ? message.success(`全部更新完成，成功 ${ok} 个`) : message.warning(`完成：成功 ${ok} 个，失败 ${fail} 个`);
    },
  });
}

function exportAll() {
  try {
    const data = tokenStore.exportTokens();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `tokens_backup_${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    message.success("Token 数据已导出");
  } catch (e) {
    message.error("导出失败");
  }
}

function importFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const result = tokenStore.importTokens(JSON.parse(ev.target.result));
        result.success ? message.success(result.message) : message.error(result.message);
      } catch (err) {
        message.error("文件格式错误");
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

async function cleanExpired() {
  const count = await tokenStore.cleanExpiredTokens();
  message.success(`已清理 ${count} 个过期 Token`);
}

function disconnectAll() {
  gameTokens.value.forEach((tk) => tokenStore.closeWebSocketConnection(tk.id));
  message.success("所有连接已断开");
}

function clearAll() {
  confirmDanger(dialog, {
    title: "清除所有 Token",
    content: "确定清除所有 Token 吗？此操作无法恢复！",
    positiveText: "确定清除",
    onPositiveClick: async () => {
      await tokenStore.clearAllTokens();
      message.success("所有 Token 已清除");
    },
  });
}

/* ============================================================
 * 添加 / 编辑
 * ============================================================ */
const addSheet = ref(false);
const addTab = ref("wxQrcode");
function openAdd() {
  if (atLimit.value) {
    message.warning(`最多只能有 ${maxTokens} 个 Token，如需更换请先删除现有的`);
    return;
  }
  addSheet.value = true;
}
function onImported() {
  addSheet.value = false;
  message.success("账号已添加");
}

const editSheet = ref(false);
const edit = reactive({ id: "", name: "", token: "", server: "", wsUrl: "", remark: "" });
function openEdit(tk) {
  Object.assign(edit, {
    id: tk.id,
    name: tk.name || "",
    token: tk.token || "",
    server: tk.server || "",
    wsUrl: tk.wsUrl || "",
    remark: tk.remark || "",
  });
  editSheet.value = true;
}
function saveEdit() {
  if (!edit.name.trim()) return message.warning("请填写名称");
  if (!edit.token.trim()) return message.warning("请填写 Token 字符串");
  tokenStore.updateToken(edit.id, {
    name: edit.name.trim(),
    token: edit.token.trim(),
    server: edit.server,
    wsUrl: edit.wsUrl,
    remark: edit.remark,
  });
  message.success("Token 信息已更新");
  editSheet.value = false;
}
</script>

<style scoped lang="scss">
/* ---------- 页头条「角色列表」 ----------
 * 一根和定时任务页同款的白条：左标题 + 右侧两枚 30px 图标按钮（＋ 添加、⋯ 批量动作）。
 * 原来这里是右对齐的一颗实心蓝「添加」+ 列表下方一整张「数据与连接」卡；
 * 现在添加退成图标（它是本页唯一的入口动作，不必占一整颗实心按钮），批量动作收进抽屉。 */
/* 左右内边距必须与 .m-card 的 16px 对齐（不是常见的 12）：页头那颗 ⋯ 要和下面每张卡
   右上角的 ⋯ 落在同一条竖线上，标题也要和账号名左对齐。
   卡片的实际内容起点 = 16(page) + 3(border-left) + 13(padding-left) = 32，页头 = 16 + 16 = 32。 */
.m-tk-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  background: var(--m-card);
  border-radius: var(--m-r-lg);
}
.m-tk-bar-t {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 22px;
  color: var(--m-text);
}
.m-tk-ibtn {
  flex: none;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: var(--m-r-md);
  background: var(--m-bg);
  color: var(--m-text2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.m-tk-ibtn svg {
  width: 17px;
  height: 17px;
}

/* ---------- 账号卡 ---------- */
.m-tk-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* 当前账号：只加一条左侧 3px 行动色，不做整卡高亮（规范里 region 不靠底色区分） */
  border-left: 3px solid transparent;
  padding-left: 13px;
}
.m-tk-card.on {
  border-left-color: var(--m-primary);
}
.m-tk-top {
  display: flex;
  align-items: center;
  gap: 10px;
}
/* 头像块统一一支色，与顶栏头像（.m-ava 用 --m-primary）对齐。
   原先按名字长度取 --m-ava-1..4，三字名会落到近黑的 ava-4，一列里独一份像 bug。 */
.m-tk-ava {
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: var(--m-r-md);
  background: var(--m-primary);
  color: var(--m-on-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
}
.m-tk-id {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.m-tk-nm {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--m-text);
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.m-tk-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--m-text3);
}
.m-tk-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--m-r-sm);
  flex: none;
  background: var(--m-text3);
}
.m-tk-dot.connected { background: var(--m-green); }
.m-tk-dot.connecting,
.m-tk-dot.disconnecting { background: var(--m-amber); }
.m-tk-dot.error { background: var(--m-red); }
.m-tk-cur {
  color: var(--m-primary);
  font-weight: 500;
}
.m-tk-more {
  flex: none;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--m-r-md);
  background: var(--m-bg);
  color: var(--m-text3);
  display: flex;
  align-items: center;
  justify-content: center;
}
.m-tk-more:active { background: var(--m-band); }
.m-tk-more svg { width: 16px; height: 16px; }

/* 备注行：整行可点，点进去直接开编辑 sheet */
.m-tk-remark {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--m-bg);
  border-radius: var(--m-r-sm);
  font-size: 12px;
  line-height: 1.5;
  color: var(--m-text3);
  min-width: 0;
}
.m-tk-remark span {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.m-tk-remark svg {
  width: 13px;
  height: 13px;
  flex: none;
}

.m-tk-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--m-text3);
  font-variant-numeric: tabular-nums;
}

.m-tk-act {
  display: flex;
  gap: 8px;
}
.m-tk-act .m-btn {
  flex: 1;
  width: auto;
  padding: 9px 12px;
  font-size: 13px;
}

/* ---------- 危险动作 ---------- */
.m-tk-danger .m-nm {
  color: var(--m-red);
}

/* ---------- 添加 Token 表单容器：桌面子组件托管，只去外框 ---------- */
.m-tk-form {
  margin-top: 12px;
}
.m-tk-form :deep(.card-header),
.m-tk-form :deep(.form-actions) {
  background: none;
  border: none;
  padding-left: 0;
  padding-right: 0;
}

/* ---------- 编辑表单 ---------- */
.m-tk-f {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 10px;
}
.m-tk-f > span {
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--m-text3);
}
.m-tk-f > span i {
  color: var(--m-red);
  font-style: normal;
}
.m-tk-ta {
  resize: none;
  line-height: 1.5;
  font-family: inherit;
}
.m-tk-fbtns {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
.m-tk-fbtns .m-btn {
  flex: 1;
  width: auto;
}
</style>

<script>
export default { name: "MobileTokens" };
</script>
