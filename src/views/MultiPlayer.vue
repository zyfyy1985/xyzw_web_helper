<template>
  <div class="mp-page">
    <!-- 工具条：账号槽 + 布局 + 协同开关 -->
    <header class="mp-bar">
      <div class="mp-bar-left">
        <span class="mp-brand">多开</span>
        <div class="mp-slots">
          <button
            v-for="i in count"
            :key="i"
            type="button"
            class="mp-chip"
            :class="{ 'is-focus': focus === i - 1, 'is-empty': !slots[i - 1].binId }"
            @click="onChip(i - 1)"
          >
            <span class="mp-chip-i">{{ i }}</span>
            <span class="mp-chip-n">{{ slots[i - 1].binId ? slotName(i - 1) : "空" }}</span>
          </button>
        </div>
      </div>
      <div class="mp-bar-right">
        <span class="mp-lab">布局</span>
        <div class="mp-seg" role="group" aria-label="布局">
          <button
            v-for="o in modeOptions"
            :key="o.value"
            type="button"
            class="mp-seg-b"
            :class="{ 'is-on': mode === o.value }"
            :title="o.title || o.label"
            @click="mode = o.value"
          >
            {{ o.label }}
          </button>
        </div>
        <span class="mp-lab">数量</span>
        <div class="mp-seg" role="group" aria-label="数量">
          <button
            v-for="o in countOptions"
            :key="o.value"
            type="button"
            class="mp-seg-b is-num"
            :class="{ 'is-on': count === o.value }"
            :title="o.label"
            @click="count = o.value"
          >
            {{ o.value }}
          </button>
        </div>
        <div class="mp-sync" :class="{ 'is-on': syncOn }" :title="syncTitle">
          <button
            type="button"
            class="mp-toggle"
            :class="{ 'is-on': syncOn }"
            role="switch"
            :aria-checked="syncOn"
            :aria-label="syncTitle"
            @click="syncOn = !syncOn"
          >
            <i class="mp-toggle-k"></i>
          </button>
          <span>协同</span>
          <i class="mp-ver">{{ SYNC_VER }}</i>
          <em v-if="syncOn">{{ heldAlt ? "按住 Alt 临时独立" : "点一个窗，其余同步" }}</em>
          <em v-else>各窗独立操作</em>
        </div>
        <button type="button" class="mp-btn" :class="{ 'is-on': diagOn }" @click="toggleDiag">
          {{ diagOn ? "关诊断" : "诊断" }}
        </button>
        <button type="button" class="mp-btn" :class="{ 'is-on': isFullscreen }" @click="toggleFullscreen">
          {{ isFullscreen ? "退出全屏" : "全屏" }}
        </button>
        <button type="button" class="mp-btn" @click="goBack">返回</button>
      </div>
    </header>

    <!-- 舞台：按布局算出的格子绝对定位，等比缩放 -->
    <div ref="stage" class="mp-stage">
      <div
        v-for="(pane, i) in layout.panes"
        :key="i"
        class="mp-pane"
        :class="{ 'is-focus': focus === i, 'is-idle': excluded.includes(i) }"
        :style="{
          left: pane.x + 'px',
          top: pane.y + 'px',
          width: pane.w + 'px',
          height: pane.h + 'px',
        }"
      >
        <div class="mp-head" @pointerdown="focus = i">
          <span class="mp-dot" :class="{ 'is-on': ready[i] }"></span>
          <span class="mp-name">{{ slots[i].binId ? slotName(i) : "未绑定账号" }}</span>
          <span v-if="focus === i" class="mp-tag">主控</span>
          <span v-if="excluded.includes(i)" class="mp-tag is-off">已断开</span>
          <span class="mp-grow"></span>
          <button
            v-if="slots[i].binId"
            type="button"
            class="mp-ico mp-menu-btn"
            :class="{ 'is-on': paneMenu === i }"
            title="脚本：内置脚本管理 / 脚本设置"
            @click.stop="togglePaneMenu(i)"
          >
            ⚙
          </button>
          <button
            type="button"
            class="mp-ico"
            :class="{ 'is-off': excluded.includes(i) }"
            :title="excluded.includes(i) ? '加入协同' : '不参与协同'"
            @click.stop="toggleExcluded(i)"
          >
            {{ excluded.includes(i) ? "断开" : "协同" }}
          </button>
          <button
            v-if="slots[i].binId"
            type="button"
            class="mp-ico"
            title="重载本窗"
            @click.stop="reloadPane(i)"
          >
            ↻
          </button>
          <button
            v-if="slots[i].binId"
            type="button"
            class="mp-ico"
            title="清空本窗"
            @click.stop="clearSlot(i)"
          >
            ×
          </button>
        </div>

        <div class="mp-body">
          <iframe
            v-if="slots[i].binId"
            :key="slots[i].binId + ':' + reloadTick[i]"
            :ref="(el) => bindFrame(i, el)"
            :src="srcOf(i)"
            class="mp-frame"
            allow="fullscreen; autoplay"
            @load="onFrameLoad(i)"
          ></iframe>
          <button v-else type="button" class="mp-empty" @click="openPicker(i)">
            <b>＋</b>
            <span>添加账号</span>
          </button>

          <!-- 选账号：在本窗格里居中（不是全页居中），尺寸跟着格子收 -->
          <div v-if="pickerShow && pickerSlot === i" class="mp-picker" @click.self="closePicker">
            <div class="mp-picker-card">
              <div class="mp-picker-hd">
                <span class="mp-picker-title">选择账号</span>
                <button type="button" class="mp-picker-x" aria-label="关闭" @click="closePicker">
                  ×
                </button>
              </div>
              <div class="mp-picker-list">
                <div v-if="!accounts.length" class="mp-picker-empty">
                  还没有账号：先去「Token 导入」添加，再回来选。
                </div>
                <button
                  v-for="a in accounts"
                  :key="a.id"
                  type="button"
                  class="mp-pick-row"
                  :disabled="(usedIds.has(String(a.id)) && String(slots[i].binId) !== String(a.id)) || !!pickBusy"
                  @click="pickAccount(a, i)"
                >
                  <span class="mp-pick-ava">{{ (a.name || "?").charAt(0) }}</span>
                  <span class="mp-pick-txt">
                    <span class="mp-pick-name">{{ a.name }}</span>
                    <span v-if="a.remark" class="mp-pick-remark">{{ a.remark }}</span>
                  </span>
                  <span v-if="pickBusy === a.id" class="mp-pick-used">准备中…</span>
                  <span v-else-if="usedIds.has(String(a.id))" class="mp-pick-used">
                    已在第 {{ usedSlotOf(a.id) + 1 }} 窗
                  </span>
                </button>
              </div>
              <div v-if="pickErr" class="mp-picker-err">{{ pickErr }}</div>
            </div>
          </div>
        </div>

        <!-- ⚙ 菜单：内置脚本管理 + 工具坞那份工具清单 -->
        <div v-if="paneMenu === i" class="mp-menu" @click.stop>
          <button type="button" class="mp-menu-item" @click="openScriptManage(i)">
            <span class="mp-menu-ico is-script">脚</span>
            <span class="mp-menu-nm">内置脚本管理</span>
          </button>
          <div class="mp-menu-sep"></div>
          <div class="mp-menu-label">脚本设置</div>
          <div v-if="!paneTools.length" class="mp-menu-empty">该窗还没有可用的工具</div>
          <button
            v-for="t in paneTools"
            :key="t.id"
            type="button"
            class="mp-menu-item"
            @click="openTool(i, t.id)"
          >
            <span class="mp-menu-ico" :style="{ background: t.color || '#5f6470' }">{{ t.char }}</span>
            <span class="mp-menu-nm">{{ t.name }}</span>
            <i v-if="t.on !== null" class="mp-menu-dot" :class="{ 'is-on': t.on }"></i>
          </button>
        </div>
      </div>

      <!-- 诊断面板：只看数字，判断「事件到底进没进目标窗的引擎」 -->
      <div v-if="diagOn" class="mp-diag">
        <div class="mp-diag-hd">
          协同 {{ SYNC_VER }} · 下行 {{ diag.sent }} · 最近 {{ diag.last || "—" }}
        </div>
        <div v-for="i in count" :key="i" class="mp-diag-row">
          <span>窗{{ i }}</span>
          <span>{{ ready[i - 1] ? "就绪" : "未就绪" }}</span>
          <span>引擎收 下{{ diag.down[i - 1] }} 起{{ diag.up[i - 1] }}</span>
        </div>
      </div>

      <!-- 落点反馈：协同真正打到目标窗时的圈 -->
      <div class="mp-ripples">
        <span
          v-for="r in ripples"
          :key="r.id"
          class="mp-ripple"
          :style="{ left: r.x + 'px', top: r.y + 'px' }"
        ></span>
      </div>
    </div>

    <!-- 内置脚本管理：作用于当前窗格的账号，保存后重载该窗生效 -->
    <BuiltinScriptDialog
      v-model:show="scriptShow"
      :token-id="scriptToken"
      confirm-text="保存并重载"
      @start="onScriptSaved"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { computeLayout } from "@/utils/multiLayout";
import { createSyncRouter } from "@/utils/multiSync";
import { convertBinToLx } from "@/utils/gameLauncher";
import useIndexedDB from "@/hooks/useIndexedDB";
import { gameTokens } from "@/stores/tokenStore";
import BuiltinScriptDialog from "@/components/BuiltinScriptDialog.vue";

const route = useRoute();
const router = useRouter();

const HEAD_H = 22;
const CFG_KEY = "h5_multi_open";

/* ---------- 配置 ---------- */
function readCfg() {
  try {
    const raw = JSON.parse(localStorage.getItem(CFG_KEY) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch (e) {
    return {};
  }
}

const saved = readCfg();
const count = ref(Math.min(4, Math.max(2, Number(saved.count) || 2)));
const mode = ref(saved.mode === "rows" || saved.mode === "cols" ? saved.mode : "auto");
const syncOn = ref(saved.sync !== false); // 默认开
const excluded = ref(Array.isArray(saved.excluded) ? saved.excluded.slice() : []);

const slots = reactive(
  Array.from({ length: 4 }, (_, i) => {
    const s = (saved.slots || [])[i];
    return s && s.binId ? { binId: s.binId, name: s.name || "Token" } : { binId: "", name: "" };
  })
);
const reloadTick = reactive([0, 0, 0, 0]);
const ready = reactive([false, false, false, false]);
const focus = ref(0);
const heldAlt = ref(false);
const ripples = ref([]);
const isFullscreen = ref(false);

const modeOptions = [
  { label: "自动", value: "auto" },
  { label: "上下", value: "rows" },
  { label: "左右", value: "cols" },
];
const countOptions = [
  { label: "2 开", value: 2 },
  { label: "3 开", value: 3 },
  { label: "4 开", value: 4 },
];

/* 协同实现版本：页面上能直接看到，用来确认浏览器跑的不是旧缓存
   v2 → 去掉 pointer 族重放；v3 → 修「按下后立刻丢手势」导致只发 down 不发 up；
   v4 → 父窗 blur 延后放手，修「加载后第一次点击不协同」 */
const SYNC_VER = "v4";

const diagOn = ref(false);
const diag = reactive({ sent: 0, last: "", down: [0, 0, 0, 0], up: [0, 0, 0, 0] });

/** 给每个窗的引擎输入层挂计数器：证明「事件有没有真的进这个窗」 */
function hookPaneCounter(i) {
  const w = frames[i] && frames[i].contentWindow;
  let im = null;
  try {
    im = w && w.cc && (w.cc.internal && w.cc.internal.inputManager ? w.cc.internal.inputManager : w.cc.inputManager);
  } catch (e) {
    im = null;
  }
  if (!im || im.__mpHooked) return;
  im.__mpHooked = true;
  const b = im.handleTouchesBegin.bind(im);
  const e2 = im.handleTouchesEnd.bind(im);
  im.handleTouchesBegin = function (...args) {
    diag.down[i] += 1;
    return b.apply(im, args);
  };
  im.handleTouchesEnd = function (...args) {
    diag.up[i] += 1;
    return e2.apply(im, args);
  };
}
function toggleDiag() {
  diagOn.value = !diagOn.value;
  if (!diagOn.value) return;
  for (let i = 0; i < 4; i++) if (slots[i].binId) hookPaneCounter(i);
}

const syncTitle = computed(() =>
  syncOn.value ? "点任意一个窗，其他窗在相同位置执行同一操作" : "各窗互不影响"
);

/* ---------- 账号 ----------
   账号清单来自 gameTokens（gameTokens 才是账号的唯一真相），不是 bin_file_list。
   bin_file_list 只是「已经启动过一次」的派生缓存，没进过游戏的账号不在里面。
   选完账号再按「打开游戏」那条路把 BIN 准备好：IndexedDB 取原始 bin → 转 lx →
   写 localStorage['bin_data_<id>']（游戏侧 game-bridge-local.js 就认这个键）。 */
const accounts = computed(() =>
  (gameTokens.value || []).map((t) => ({
    id: String(t.id),
    name: t.name || "Token",
    remark: t.remark || "",
  }))
);
const usedIds = computed(() => {
  const m = new Map();
  slots.forEach((s, i) => {
    if (s.binId) m.set(String(s.binId), i);
  });
  return m;
});
const usedSlotOf = (id) => (usedIds.value.has(String(id)) ? usedIds.value.get(String(id)) : -1);
const slotName = (i) => slots[i].name || slots[i].binId || "Token";

const { getArrayBuffer } = useIndexedDB();

/** 把一个 token 的 BIN 落成游戏能读的 localStorage 键；返回 false 表示没有凭据 */
async function ensureBin(token) {
  const id = String(token.id);
  if (localStorage.getItem("bin_data_" + id)) return true;
  let buf = await getArrayBuffer(id);
  if (!buf) buf = await getArrayBuffer(token.name);
  if (!buf) return false;
  const hex = Array.from(convertBinToLx(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  localStorage.setItem("bin_data_" + id, hex);
  // 与 Dashboard「打开游戏」保持一致：顺手登记进 bin_file_list（切换面板/游戏内都读它）
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem("bin_file_list") || "[]");
  } catch (e) {
    list = [];
  }
  if (!Array.isArray(list)) list = [];
  if (!list.find((x) => String(x.id) === id)) {
    list.push({
      id,
      name: token.name || "Token",
      byteLength: buf.byteLength,
      size: (buf.byteLength / 1024).toFixed(1) + " KB",
      order: list.length,
    });
    localStorage.setItem("bin_file_list", JSON.stringify(list));
  }
  return true;
}

const pickerShow = ref(false);
const pickerSlot = ref(0);
const pickBusy = ref("");
const pickErr = ref("");
function openPicker(i) {
  pickerSlot.value = i;
  pickErr.value = "";
  pickBusy.value = "";
  pickerShow.value = true;
}
function closePicker() {
  pickerShow.value = false;
  pickBusy.value = "";
}
async function pickAccount(a, i = pickerSlot.value) {
  const id = String(a.id);
  const same = String(slots[i].binId) === id;
  if (!same && usedIds.value.has(id)) return;
  pickErr.value = "";
  pickBusy.value = id;
  try {
    const ok = await ensureBin(a);
    if (!ok) {
      pickErr.value = `「${a.name}」没有本地登录凭据（BIN），请先在 Token 管理里重新导入一次`;
      return;
    }
    slots[i] = { binId: id, name: a.name || "Token" };
    focus.value = i;
    pickerShow.value = false;
    persist();
  } catch (e) {
    pickErr.value = "准备登录数据失败：" + (e && e.message ? e.message : e);
  } finally {
    pickBusy.value = "";
  }
}

/* ---------- 窗格 ⚙：内置脚本管理 + 脚本设置 ----------
   工具坞在多开模式下不挂 UI（见 features/工具坞.js），入口搬到窗格头部：
   · 内置脚本管理 → 该账号启用哪些内置脚本（h5_enabled_features 按 tokenId 存）
   · 脚本设置     → 工具坞那份工具清单（describe/open），点了让面板在该窗里展开 */
const paneMenu = ref(-1);
const paneTools = ref([]);
const scriptShow = ref(false);
const scriptToken = ref("");
const scriptSlot = ref(-1);

function readDock(i) {
  try {
    const w = frames[i] && frames[i].contentWindow;
    const dock = w && w.__XYZW_DOCK__;
    if (!dock) return [];
    if (typeof dock.describe === "function") return dock.describe() || [];
    if (typeof dock.list === "function") return (dock.list() || []).map((id) => ({ id, name: id }));
    return [];
  } catch (e) {
    return [];
  }
}
function togglePaneMenu(i) {
  if (paneMenu.value === i) {
    paneMenu.value = -1;
    return;
  }
  paneTools.value = readDock(i);
  paneMenu.value = i;
}
function openTool(i, id) {
  paneMenu.value = -1;
  try {
    const dock = frames[i] && frames[i].contentWindow.__XYZW_DOCK__;
    if (dock && typeof dock.open === "function") dock.open(id);
  } catch (e) {
    /* 窗还没就绪，忽略 */
  }
}
function openScriptManage(i) {
  paneMenu.value = -1;
  scriptSlot.value = i;
  scriptToken.value = String(slots[i].binId || "");
  scriptShow.value = true;
}
/** 脚本开关改了要重载该窗才生效（脚本是页面加载时注入的） */
function onScriptSaved() {
  if (scriptSlot.value >= 0) reloadPane(scriptSlot.value);
}
function onDocDown(e) {
  if (paneMenu.value < 0) return;
  const t = e.target;
  if (t && t.closest && t.closest(".mp-menu,.mp-menu-btn")) return;
  paneMenu.value = -1;
}

/* ---------- 布局 ---------- */
const stage = ref(null);
const stageSize = reactive({ w: 0, h: 0 });
const layout = computed(() =>
  computeLayout({
    count: count.value,
    width: stageSize.w,
    height: stageSize.h,
    mode: mode.value,
  })
);

function measure() {
  const el = stage.value;
  if (!el) return;
  stageSize.w = el.clientWidth;
  stageSize.h = el.clientHeight;
}

let ro = null;
onMounted(() => {
  measure();
  if (typeof ResizeObserver !== "undefined" && stage.value) {
    ro = new ResizeObserver(measure);
    ro.observe(stage.value);
  }
  // 入口带 bin_id：直接放进第 1 窗
  const qid = route.query.bin_id ? String(route.query.bin_id) : "";
  if (qid && !slots[0].binId) {
    const hit = accounts.value.find((a) => String(a.id) === qid);
    slots[0] = { binId: qid, name: hit ? hit.name : qid };
    persist();
  }
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  document.addEventListener("pointerdown", onDocDown, true);
  document.addEventListener("fullscreenchange", onFsChange);
});

function persist() {
  try {
    localStorage.setItem(
      CFG_KEY,
      JSON.stringify({
        count: count.value,
        mode: mode.value,
        sync: syncOn.value,
        excluded: excluded.value,
        slots: slots.map((s) => ({ binId: s.binId, name: s.name })),
      })
    );
  } catch (e) {
    /* 隐私模式写不进去，不挡使用 */
  }
}

watch([count, mode, syncOn, excluded], persist, { deep: true });
// 减少开数后，主控可能指向已被移除的窗
watch(count, (n) => {
  if (focus.value >= n) focus.value = 0;
});

/* ---------- iframe ---------- */
const frames = [0, 0, 0, 0];
const srcOf = (i) => {
  const base = import.meta.env.BASE_URL + "game/index.html";
  const q = new URLSearchParams({ bin_id: String(slots[i].binId), multi: "1", pane: String(i) });
  return `${base}?${q.toString()}`;
};

function bindFrame(i, el) {
  // ★★ 函数 ref 在每次重渲染都会再调一次（换「主控」标签就会触发重渲染）。
  //    不挡住的话 sync.attach 会先 detach → gesture 被清空 → 紧接着的 mouseup 被丢弃，
  //    目标窗引擎永远停在「按下」态，之后所有点击都被引擎自己吞掉。
  if (el && frames[i] === el) return;
  frames[i] = el || null;
  if (!el) {
    sync.detach(i);
    ready[i] = false;
    return;
  }
  sync.attach(i, el);
}

/* 单窗可能只有 260px 宽，功能面板本身是 300~360px 固定宽 → 只做宽度收敛，不隐藏 */
const PANE_STYLE_ID = "mp-pane-style";
const PANE_CSS =
  "#acctSwitchPanel,#salt-mark-attack-panel,#lh-lineup-panel,#peach-helper-panel," +
  "#salt-peach-auto-panel{max-width:calc(100vw - 20px)!important;}";

function injectPaneStyle(i) {
  const doc = frames[i] && frames[i].contentDocument;
  if (!doc || doc.getElementById(PANE_STYLE_ID)) return;
  const st = doc.createElement("style");
  st.id = PANE_STYLE_ID;
  st.textContent = PANE_CSS;
  (doc.head || doc.documentElement).appendChild(st);
}

/* ---------- 掐掉游戏自己的「点击任意位置全屏」 ----------
 * 游戏首次进入会挂一个「点一下进全屏」的手势（cc.screen.requestFullScreen 之类），
 * 单开时是对的，多开时会把整页顶成全屏 —— 所有窗格被挤成一屏，布局全废。
 * 做法：在这一窗**自己的 realm** 里把 requestFullscreen 打成 no-op。
 *   · 改 Element.prototype，不是 documentElement 实例：游戏多半是 canvas.requestFullscreen()；
 *   · 只影响 iframe 内部，父页 /multi 自己的整页全屏（返回键退）互不干扰。 */
function patchFrameFullscreen(i) {
  let w = null;
  try {
    w = frames[i] && frames[i].contentWindow;
  } catch (e) {
    return;
  }
  if (!w || w.__mpFsOff) return;
  try {
    const noop = () => Promise.resolve();
    const kill = (obj, name) => {
      if (!obj || !(name in obj)) return;
      try {
        Object.defineProperty(obj, name, { value: noop, configurable: true, writable: true });
      } catch (e) {
        /* 不可写就跳过 */
      }
    };
    const proto = w.Element && w.Element.prototype;
    kill(proto, "requestFullscreen");
    kill(proto, "webkitRequestFullscreen");
    kill(proto, "webkitRequestFullScreen");
    kill(proto, "mozRequestFullScreen");
    kill(proto, "msRequestFullscreen");
    kill(w.document.documentElement, "requestFullscreen");
    w.__mpFsOff = true;
  } catch (e) {
    /* 跨域 / 已卸载：忽略 */
  }
}

function onFrameLoad(i) {
  ready[i] = false;
  patchFrameFullscreen(i); // 一加载就掐，别等 cc 就绪
  let tries = 0;
  const probe = () => {
    if (tries++ > 60) return;
    const w = frames[i] && frames[i].contentWindow;
    let ok = false;
    try {
      ok = !!(w && w.cc && w.document.getElementById("GameCanvas"));
    } catch (e) {
      ok = false;
    }
    if (!ok) {
      window.setTimeout(probe, 300);
      return;
    }
    ready[i] = true;
    injectPaneStyle(i);
    /* 第二道锁：引擎 cc.screen.enableAutoFullScreen 会在全屏被拒后往 canvas 挂一次性 touchend，
       用户「点任意地方」就再试一次全屏 —— 这就是首次进入点一下就全屏的来源。 */
    try {
      const w = frames[i] && frames[i].contentWindow;
      const scr = w && w.cc && w.cc.screen;
      if (scr && typeof scr.disableAutoFullScreen === "function") scr.disableAutoFullScreen();
    } catch (e) {
      /* 引擎还没起来 / 跨域：忽略，靠 API 补丁兜底 */
    }
    if (diagOn.value) hookPaneCounter(i);
  };
  window.setTimeout(probe, 300);
}

function reloadPane(i) {
  ready[i] = false;
  reloadTick[i] += 1;
  persist();
}

function clearSlot(i) {
  slots[i] = { binId: "", name: "" };
  ready[i] = false;
  persist();
}

function onChip(i) {
  focus.value = i;
  if (!slots[i].binId) openPicker(i);
}

function toggleExcluded(i) {
  const k = excluded.value.indexOf(i);
  if (k >= 0) excluded.value.splice(k, 1);
  else excluded.value.push(i);
  persist();
}

/* ---------- 声音：一律不碰 ----------
 * 这里原来做过「只让主控窗出声」：每 2.5s 把主控窗 setMusicVolume/setEffectsVolume 设回 1，
 * 别的窗设 0。问题出在引擎的实现上（src/xyzw/cocos2d-js-min.js）：
 *   setMusicVolume(v)  { this._music.volume = v; this.setVolume(this._music.id, v) }
 *   setEffectsVolume(v){ this._effect.volume = v; for (var i in a) if (i !== musicId) setVolume(i, v) }
 * 也就是「记下音量 + 立刻改正在播放的实例」。游戏内关声音是它自己的 SoundManager 逐实例
 * setVolume(id, 0) 做的，我们这一发设回 1 就把刚关掉的声音又调起来了
 * ⇒ 用户在设置里关掉也没用，每 2.5 秒又响（用户报的「游戏声音关不掉」就是这个）。
 * 结论：多开不做任何音量干预，以游戏内设置为准。要「只主控出声」只能做成显式开关，
 * 且只能往小调（静音别的窗），永远不许把任何窗的音量调大。
 */

/* ---------- 协同 ---------- */
let rafId = 0;
const sync = createSyncRouter({
  getState: () => ({
    enabled: syncOn.value && !heldAlt.value,
    panes: [0, 1, 2, 3].map((i) => ({
      excluded: excluded.value.includes(i),
      ready: !!ready[i],
    })),
  }),
  onSource: (i) => {
    focus.value = i;
  },
  onRipple: (i, x, y, type) => {
    // 诊断计数按「事件条数」算，拖动时每一帧都要记
    if (diagOn.value) {
      diag.sent += 1;
      diag.last = `窗${i + 1} (${Math.round(x)},${Math.round(y)})`;
    }
    /* 但视觉提示只在「按下」这一帧画一次：拖动时每帧一个点会连成一条白线
       （真机上滑一下就留一串点）。永远只留最新那一个。 */
    if (type !== "mousedown" && type !== "touchstart") return;
    const pane = layout.value.panes[i];
    if (!pane) return;
    const id = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    ripples.value = [{ id, x: pane.x + x, y: pane.y + HEAD_H + y }];
    if (rafId) return;
    rafId = window.setTimeout(() => {
      rafId = 0;
      ripples.value = [];
    }, 320);
  },
});

function onKeyDown(e) {
  if (e.key === "Alt" && !heldAlt.value) heldAlt.value = true;
  // Esc：先收小菜单，再收选账号（和全局弹窗习惯一致）
  if (e.key === "Escape") {
    if (paneMenu.value >= 0) paneMenu.value = -1;
    else if (pickerShow.value) closePicker();
  }
}
function onKeyUp(e) {
  if (e.key === "Alt") heldAlt.value = false;
}

/* ---------- 全屏 ---------- */
function onFsChange() {
  isFullscreen.value = !!document.fullscreenElement;
  nextTick(measure);
}
function toggleFullscreen() {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else stage.value && stage.value.requestFullscreen();
  } catch (e) {
    /* 被策略拦了就算了 */
  }
}

function goBack() {
  if (window.history.length > 1) router.back();
  else router.push("/admin/dashboard");
}

onBeforeUnmount(() => {
  ro && ro.disconnect();
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
  document.removeEventListener("pointerdown", onDocDown, true);
  document.removeEventListener("fullscreenchange", onFsChange);
  sync.destroy();
  // 账号切换面板挂在本页 body 上（单开时由 GamePlayer 负责清理），多开页自己收
  try {
    const c = window.__ACCT_SWITCH__;
    if (c && typeof c.destroy === "function") c.destroy();
  } catch (e) {
    /* 无面板时忽略 */
  }
});

/* 探针入口：node test/_probe-multisync.cjs http://localhost:3000/multi 时读它 */
window.__MULTI_DEBUG__ = {
  simulate: (i, nx, ny) => sync.simulate(i, nx, ny),
  /* 按真实浏览器顺序（pointerdown → mousedown → pointerup → mouseup）打一次点击，
     探针用它才算「等价于用户真点了一下」 */
  simulateReal: (i, nx, ny) => sync.simulateReal(i, nx, ny),
  state: () => ({
    count: count.value,
    mode: mode.value,
    syncOn: syncOn.value,
    focus: focus.value,
    ready: [ready[0], ready[1], ready[2], ready[3]],
    layout: layout.value,
  }),
};
</script>

<style scoped>
.mp-page {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #0f1115;
  color: #e8eaef;
  font-size: 13px;
}

.mp-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 42px;
  padding: 0 12px;
  background: #16191f;
  border-bottom: 1px solid #262b33;
  flex-shrink: 0;
  /* 窄窗横滚而不是把文字挤成竖排 */
  overflow-x: auto;
  overflow-y: hidden;
}
.mp-bar-left,
.mp-bar-right,
.mp-bar-left > *,
.mp-bar-right > * {
  flex: 0 0 auto;
}
.mp-bar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.mp-brand {
  white-space: nowrap;
  font-weight: 500;
  font-size: 13px;
  color: #e8eaef;
  letter-spacing: 0.04em;
}
.mp-slots {
  display: flex;
  gap: 6px;
}
.mp-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid #2b313a;
  background: #1c2027;
  color: #b9c0cc;
  font-size: 12px;
  cursor: pointer;
  max-width: 108px;
}
.mp-chip-i {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  background: #2b313a;
  color: #9aa3b2;
  font-size: 10px;
  line-height: 14px;
  text-align: center;
  flex-shrink: 0;
}
.mp-chip-n {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mp-chip.is-focus {
  border-color: #0057d2;
  background: #14243c;
  color: #e8eaef;
}
.mp-chip.is-focus .mp-chip-i {
  background: #0057d2;
  color: #fff;
}
.mp-chip.is-empty {
  border-style: dashed;
  color: #6b7480;
}

.mp-bar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}
.mp-lab {
  font-size: 11px;
  color: #6b7480;
  white-space: nowrap;
}
/* 分段控件：和 .mp-chip 同一套深色底，选中的用蓝底蓝边，不用 naive 的白下拉 */
.mp-seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  border: 1px solid #2b313a;
  background: #1c2027;
}
.mp-seg-b {
  height: 20px;
  min-width: 34px;
  padding: 0 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #9aa3b2;
  font-size: 11px;
  line-height: 20px;
  cursor: pointer;
  white-space: nowrap;
}
.mp-seg-b.is-num {
  min-width: 24px;
  padding: 0 6px;
}
.mp-seg-b:hover {
  color: #d5dae3;
}
.mp-seg-b.is-on {
  background: #14335c;
  color: #9dc4f0;
  box-shadow: inset 0 0 0 1px #1d5fa8;
}
.mp-sync span {
  white-space: nowrap;
}
/* 自绘开关：naive 的 switch 默认绿色，和这一屏的蓝色强调色不搭 */
.mp-toggle {
  position: relative;
  flex: 0 0 auto;
  width: 28px;
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: #3a4250;
  cursor: pointer;
  transition: background 0.15s;
}
.mp-toggle.is-on {
  background: #0057d2;
}
.mp-toggle-k {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s;
}
.mp-toggle.is-on .mp-toggle-k {
  transform: translateX(12px);
}
/* 工具条右侧的文字按钮：替代 naive quaternary（在深色底上会灰得看不见） */
.mp-btn {
  height: 24px;
  padding: 0 8px;
  border-radius: 5px;
  border: 1px solid transparent;
  background: transparent;
  color: #9aa3b2;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}
.mp-btn:hover {
  background: #1c2027;
  border-color: #2b313a;
  color: #d5dae3;
}
.mp-btn.is-on {
  color: #7fb0ea;
  border-color: #1d5fa8;
  background: #14335c;
}
.mp-sync {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 10px 3px 6px;
  border-radius: 6px;
  border: 1px solid #2b313a;
  background: #1c2027;
  font-size: 12px;
  color: #b9c0cc;
}
.mp-sync.is-on {
  border-color: #1d5fa8;
  color: #dbe6f5;
}
.mp-sync em {
  font-style: normal;
  font-size: 11px;
  color: #7d8695;
  white-space: nowrap;
}
.mp-sync.is-on em {
  color: #6b9bd8;
}

.mp-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.mp-pane {
  position: absolute;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  overflow: hidden;
  background: #000;
  box-shadow: 0 0 0 1px #262b33;
}
.mp-pane.is-focus {
  box-shadow: 0 0 0 1px #0057d2;
}
.mp-pane.is-idle {
  opacity: 0.66;
}

.mp-head {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 6px;
  background: #16191f;
  color: #9aa3b2;
  font-size: 11px;
  flex-shrink: 0;
  user-select: none;
}
.mp-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4a5262;
  flex-shrink: 0;
}
.mp-dot.is-on {
  background: #1d9e75;
}
.mp-name {
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #d5dae3;
}
.mp-tag {
  padding: 0 5px;
  height: 14px;
  line-height: 14px;
  border-radius: 3px;
  background: #14335c;
  color: #7fb0ea;
  font-size: 10px;
}
.mp-tag.is-off {
  background: #3a2a1a;
  color: #d9a15b;
}
.mp-grow {
  flex: 1;
}
.mp-ico {
  height: 16px;
  padding: 0 5px;
  border-radius: 3px;
  border: 1px solid transparent;
  background: transparent;
  color: #7d8695;
  font-size: 10px;
  line-height: 14px;
  cursor: pointer;
}
.mp-ico:hover {
  border-color: #333a45;
  color: #d5dae3;
}
.mp-ico.is-off {
  color: #d9a15b;
}

.mp-body {
  position: relative;
  flex: 1;
  min-height: 0;
}
.mp-frame {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
  background: #000;
}
.mp-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed #2f3742;
  border-radius: 6px;
  margin: 8px;
  background: #12151b;
  color: #6b7480;
  font-size: 12px;
  cursor: pointer;
}
.mp-empty b {
  font-size: 20px;
  font-weight: 400;
  color: #4f5b6b;
}
.mp-empty:hover {
  border-color: #0057d2;
  color: #9aa3b2;
}

.mp-ver {
  font-style: normal;
  font-size: 10px;
  color: #6b9bd8;
  background: #14335c;
  border-radius: 3px;
  padding: 0 4px;
}
.mp-diag {
  position: absolute;
  left: 8px;
  bottom: 8px;
  z-index: 20;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(12, 14, 18, 0.86);
  border: 1px solid #2b313a;
  color: #cfd6e0;
  font: 11px/1.6 ui-monospace, Consolas, monospace;
  pointer-events: none;
}
.mp-diag-hd {
  color: #8ea7c4;
  margin-bottom: 2px;
}
.mp-diag-row {
  display: flex;
  gap: 10px;
}

.mp-ripples {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.mp-ripple {
  position: absolute;
  width: 22px;
  height: 22px;
  margin: -11px 0 0 -11px;
  border-radius: 50%;
  border: 1.5px solid rgba(0, 87, 210, 0.85);
  background: rgba(0, 87, 210, 0.12);
  /* 一次手势只闪一下（拖动帧不画点），所以给它一个放大淡出，而不是干等到 320ms 才消失 */
  animation: mp-ping 0.32s ease-out forwards;
}
@keyframes mp-ping {
  from {
    transform: scale(0.7);
    opacity: 1;
  }
  to {
    transform: scale(1.25);
    opacity: 0;
  }
}

/* 选账号：整块覆盖在本宫格上，卡片按格子宽高收敛（窄窗也不溢出） */
.mp-picker {
  position: absolute;
  inset: 0;
  z-index: 8;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  background: rgba(8, 10, 14, 0.5);
}
.mp-picker-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: min(320px, 100%);
  max-height: 100%;
  background: #fff;
  color: #1f2329;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}
.mp-picker-hd {
  display: flex;
  align-items: center;
  height: 34px;
  padding: 0 6px 0 12px;
  border-bottom: 1px solid #eef0f3;
  flex-shrink: 0;
}
.mp-picker-title {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
}
.mp-picker-x {
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #8a8f99;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}
.mp-picker-x:hover {
  background: #f2f3f5;
  color: #1f2329;
}
.mp-picker-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  overflow-y: auto;
  min-height: 0;
}
.mp-picker-empty {
  padding: 12px 8px;
  font-size: 12px;
  line-height: 1.6;
  color: #8a8f99;
  text-align: center;
}
.mp-picker-err {
  padding: 6px 10px;
  font-size: 11px;
  line-height: 1.5;
  color: #c0392b;
  background: #fdf0ee;
  border-top: 1px solid #f7dcd7;
}
.mp-pick-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: #f7f8fa;
  cursor: pointer;
  text-align: left;
}
.mp-pick-row:hover:not(:disabled) {
  border-color: #0057d2;
  background: #eef4fd;
}
.mp-pick-row:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.mp-pick-ava {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #e6f1fb;
  color: #185fa5;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 500;
  flex: 0 0 auto;
}
.mp-pick-txt {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.mp-pick-name {
  font-size: 12px;
  color: #1f2329;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mp-pick-remark {
  font-size: 10px;
  color: #8a8f99;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mp-pick-used {
  flex: 0 0 auto;
  font-size: 10px;
  color: #8a8f99;
}

/* ⚙ 菜单 */
.mp-menu {
  position: absolute;
  top: 24px;
  right: 4px;
  z-index: 12;
  min-width: 132px;
  max-width: calc(100% - 8px);
  padding: 4px;
  border-radius: 8px;
  border: 1px solid #2b313a;
  background: #1a1e25;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}
.mp-menu-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #d5dae3;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}
.mp-menu-item:hover {
  background: #232a33;
}
.mp-menu-ico {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 10px;
  background: #5f6470;
}
.mp-menu-ico.is-script {
  background: #0057d2;
}
.mp-menu-nm {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mp-menu-sep {
  height: 1px;
  margin: 4px 2px;
  background: #262b33;
}
.mp-menu-label {
  padding: 2px 6px 4px;
  font-size: 10px;
  color: #6b7480;
}
.mp-menu-empty {
  padding: 4px 6px;
  font-size: 10px;
  color: #6b7480;
}
.mp-menu-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4a5262;
  flex: 0 0 auto;
}
.mp-menu-dot.is-on {
  background: #1d9e75;
}
.mp-ico.is-on {
  border-color: #0057d2;
  color: #7fb0ea;
}
/* 窄窗（<780px）：标签与账号名收起，只留编号与控件，避免工具条被挤成竖排 */
@media (max-width: 1180px) {
  .mp-sync em {
    display: none;
  }
}
@media (max-width: 780px) {
  .mp-bar {
    gap: 8px;
    padding: 0 8px;
    overflow-x: auto;
  }
  .mp-brand {
    display: none;
  }
  .mp-chip {
    padding: 0 8px;
  }
  .mp-chip-n {
    display: none;
  }
  .mp-sync em {
    display: none;
  }
  .mp-lab {
    display: none;
  }
  .mp-seg-b {
    min-width: 30px;
    padding: 0 6px;
  }
  /* 窗格只有百来像素宽时，头部按钮要一起瘦下来，否则 ⚙ 会被挤出去 */
  .mp-head {
    gap: 2px;
    padding: 0 3px;
  }
  .mp-name {
    max-width: 32%;
  }
  .mp-ico {
    padding: 0 3px;
  }
}
</style>
