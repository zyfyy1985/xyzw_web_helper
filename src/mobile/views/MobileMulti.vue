<template>
  <div class="mm-page">
    <!-- ① 顶栏：只剩槽位（点账号名即切换窗格，点空格子开选账号抽屉）
         不放返回箭头：手机有系统返回手势，页内再放一个只会占掉槽位宽度 -->
    <header class="mm-bar">
      <div class="mm-slots">
        <button
          v-for="i in count"
          :key="i"
          type="button"
          class="mm-chip"
          :class="{ 'is-focus': focus === i - 1, 'is-empty': !slots[i - 1].binId }"
          @click="onChip(i - 1)"
        >
          <i class="mm-chip-i">{{ i }}</i>
          <span class="mm-chip-n">{{ slots[i - 1].binId ? slotName(i - 1) : "空" }}</span>
        </button>
      </div>
    </header>

    <!-- ② 控制条：视图 / 数量 / 协同。手机只有 430 逻辑宽，刻意收成两条，
         全部塞一行会需要横滚（横滚条在手机上没人会发现） -->
    <div class="mm-ctrl">
      <div class="mm-seg" role="group" aria-label="视图">
        <button
          v-for="o in viewOptions"
          :key="o.value"
          type="button"
          :class="{ on: view === o.value }"
          @click="view = o.value"
        >
          {{ o.label }}
        </button>
      </div>
      <div class="mm-seg" role="group" aria-label="数量">
        <button
          v-for="o in countOptions"
          :key="o.value"
          type="button"
          :class="{ on: count === o.value }"
          @click="count = o.value"
        >
          {{ o.value }}
        </button>
      </div>
      <button
        type="button"
        class="mm-sync"
        :class="{ on: syncOn }"
        role="switch"
        :aria-checked="syncOn"
        :aria-label="syncOn ? '协同已开启，当前窗的操作会同步到其他窗' : '协同已关闭，各窗独立'"
        @click="syncOn = !syncOn"
      >
        <i class="mm-k"></i>
        <span class="mm-sync-t">协同</span>
      </button>
    </div>

    <!-- ③ 舞台
         单窗（默认）：所有窗格叠在同一个「最大等比盒子」上，只有 focus 那个可见，
           其余 opacity:0 —— 不能用 visibility/display 藏，多开协同要靠 elementFromPoint
           判断目标窗这个位置有没有被脚本面板盖住，visibility:hidden 的元素不参与命中测试，
           会让「转发给看不见的窗」全部被误判成被遮挡。
         多窗：回到 computeLayout 的分格。 -->
    <div ref="stage" class="mm-stage">
      <div
        v-for="(pane, i) in layout.panes"
        :key="i"
        class="mm-pane"
        :class="{
          'is-focus': focus === i,
          'is-idle': excluded.includes(i),
          'is-hidden': view === 'single' && focus !== i,
          'is-dragging': dragDx !== 0,
        }"
        :style="{
          left: pane.x + 'px',
          top: pane.y + 'px',
          width: pane.w + 'px',
          height: pane.h + 'px',
          transform: dragShift(i),
        }"
      >
        <div
          class="mm-head"
          :class="{ 'is-single': view === 'single' }"
          @click="focus = i"
          @pointerdown="onHeadDown"
        >
          <i class="mm-dot" :class="{ on: ready[i] }"></i>
          <span class="mm-name">{{ slots[i].binId ? slotName(i) : "未绑定" }}</span>
          <span v-if="focus === i" class="mm-tag">主控</span>
          <span v-if="excluded.includes(i)" class="mm-tag is-off">断开</span>
          <i class="mm-grow"></i>
          <button
            type="button"
            class="mm-more"
            :class="{ on: menuShow && menuSlot === i }"
            aria-label="脚本与工具"
            @click.stop="openMenu(i)"
          >
            ⋮
          </button>
        </div>

        <div class="mm-body">
          <iframe
            v-if="slots[i].binId"
            :key="slots[i].binId + ':' + reloadTick[i]"
            :ref="(el) => bindFrame(i, el)"
            :src="srcOf(i)"
            class="mm-frame"
            allow="fullscreen; autoplay"
            @load="onFrameLoad(i)"
          ></iframe>
          <button v-else type="button" class="mm-empty" @click="openPicker(i)">
            <i class="mm-empty-plus">＋</i>
            <span class="mm-empty-t">添加账号</span>
          </button>
        </div>
      </div>

      <!-- 落点反馈：协同真正打到别的窗时闪一圈，证明事件进了那个窗 -->
      <div class="mm-ripples">
        <span
          v-for="r in ripples"
          :key="r.id"
          class="mm-ripple"
          :style="{ left: r.x + 'px', top: r.y + 'px' }"
        ></span>
      </div>
    </div>

    <!-- ④ 选账号：底部抽屉（全宽 44px 行，符合手机点按尺寸） -->
    <div class="m-mask" :class="{ on: pickerShow }" @click="closePicker"></div>
    <div class="m-sheet" :class="{ on: pickerShow }">
      <div class="m-grab"></div>
      <h4>第 {{ pickerSlot + 1 }} 窗 · 选择账号</h4>
      <div class="m-sh-sub">账号来自 Token 管理，选中即准备登录数据（BIN）</div>
      <button
        v-for="a in accounts"
        :key="a.id"
        type="button"
        class="mm-arow"
        :disabled="(usedIds.has(a.id) && usedSlotOf(a.id) !== pickerSlot) || !!pickBusy"
        @click="pickAccount(a, pickerSlot)"
      >
        <i class="mm-ava">{{ (a.name || "?").charAt(0) }}</i>
        <span class="mm-atxt">
          <span class="mm-aname">{{ a.name }}</span>
          <span v-if="a.remark" class="mm-aremark">{{ a.remark }}</span>
        </span>
        <i v-if="pickBusy === a.id" class="mm-aused">准备中…</i>
        <i v-else-if="usedIds.has(a.id) && usedSlotOf(a.id) !== pickerSlot" class="mm-aused">
          第 {{ usedSlotOf(a.id) + 1 }} 窗
        </i>
        <MIcon v-else name="chevron" :size="14" class="mm-arrow" />
      </button>
      <p v-if="!accounts.length" class="mm-hint mm-hint-in">
        还没有账号：先去「我的 → Token 管理」导入，再回来选。
      </p>
      <p v-if="pickErr" class="mm-err">{{ pickErr }}</p>
      <button class="m-btn m-btn-p m-btn-block mm-sheet-ft" @click="goTokens">去 Token 管理</button>
    </div>

    <!-- ⑤ 窗格菜单：工具坞在多开模式下不挂 UI，入口全部收到这里 -->
    <div class="m-mask" :class="{ on: menuShow }" @click="menuShow = false"></div>
    <div class="m-sheet" :class="{ on: menuShow }">
      <div class="m-grab"></div>
      <h4>第 {{ menuSlot + 1 }} 窗</h4>
      <div class="m-sh-sub">{{ menuName }} · 脚本与工具</div>

      <button type="button" class="mm-row" @click="openScriptManage">
        <i class="mm-ri is-script">脚</i>
        <span class="mm-rn">内置脚本管理</span>
        <MIcon name="chevron" :size="14" class="mm-arrow" />
      </button>

      <div class="mm-rlabel">脚本设置</div>
      <button
        v-for="t in paneTools"
        :key="t.id"
        type="button"
        class="mm-row"
        @click="openTool(t.id)"
      >
        <i class="mm-ri" :style="{ background: t.color || '#5f6470' }">{{ t.char || "·" }}</i>
        <span class="mm-rn">{{ t.name }}</span>
        <i v-if="t.on === true || t.on === false" class="mm-dot" :class="{ on: t.on }"></i>
      </button>
      <p v-if="!paneTools.length" class="mm-hint mm-hint-in">
        该窗还没有可用的工具，等游戏加载完成后再进来
      </p>

      <div class="mm-rsep"></div>
      <button type="button" class="mm-row" @click="changeAccount">
        <span class="mm-rn">更换账号</span>
      </button>
      <button type="button" class="mm-row" @click="toggleExcluded(menuSlot)">
        <span class="mm-rn">{{ excluded.includes(menuSlot) ? "加入协同" : "不参与协同" }}</span>
      </button>
      <button type="button" class="mm-row" @click="reloadPane(menuSlot)">
        <span class="mm-rn">重载本窗</span>
      </button>
      <button type="button" class="mm-row is-danger" @click="clearSlot(menuSlot)">
        <span class="mm-rn">清空本窗</span>
      </button>
    </div>

    <!-- 内置脚本管理：作用于本窗格账号，保存后重载该窗才生效 -->
    <BuiltinScriptDialog
      v-model:show="scriptShow"
      :token-id="scriptToken"
      confirm-text="保存并重载"
      @start="onScriptSaved"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { computeLayout } from "@/utils/multiLayout";
import { createSyncRouter } from "@/utils/multiSync";
import { convertBinToLx } from "@/utils/gameLauncher";
import useIndexedDB from "@/hooks/useIndexedDB";
import { gameTokens } from "@/stores/tokenStore";
import MIcon from "@/mobile/components/MIcon.vue";
import BuiltinScriptDialog from "@/mobile/fork/components/BuiltinScriptDialog.vue";

const route = useRoute();
const router = useRouter();

/* 窗格头部高度（落点圆点要加上它才是画面内的坐标）：单窗模式下头部是拖动/翻页手柄，更高一档 */
const HEAD_H = 24;
const HEAD_H_SINGLE = 32;
/* 手机端配置与桌面分开存：桌面可能存着 4 开 + 已绑定的槽位，手机上直接沿用会挤成
   四块 130px；两边各记各的开数与槽位，互不干扰。 */
const CFG_KEY = "h5_multi_open_m";

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
/* 默认单窗：手机竖屏上两块 480:940 只能各占 187×367，字根本看不清。
   多窗（同屏分格）保留为可选，切回去就是桌面那套 grid。 */
const view = ref(saved.view === "multi" ? "multi" : "single");
const syncOn = ref(saved.sync !== false); // 默认开：多开的默认意图就是同步操作
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
const ripples = ref([]);

const viewOptions = [
  { label: "大窗", value: "single" },
  { label: "小窗", value: "multi" },
];
const countOptions = [
  { label: "2 开", value: 2 },
  { label: "3 开", value: 3 },
  { label: "4 开", value: 4 },
];

/* ---------- 布局 ----------
 * 两种视图共用 computeLayout（严格 480:940，只缩放不拉伸）：
 *   · 单窗 → 按 count=1 算出一个「最大的等比盒子」，然后把每个窗格都摆到同一个盒子上叠着，
 *     只让 focus 那个可见。叠在同一位置是刻意的：各窗 canvas 的 rect 完全一致，
 *     协同的归一化坐标就是 1:1，转发到看不见的窗时不会错位。
 *   · 多窗 → 原样用 auto（竖容器上下 / 横容器左右，横屏自动翻成左右）。 */
const stage = ref(null);
const stageSize = reactive({ w: 0, h: 0 });
const layout = computed(() => {
  const single = view.value === "single";
  const base = computeLayout({
    count: single ? 1 : count.value,
    width: stageSize.w,
    height: stageSize.h,
    mode: "auto",
  });
  const box = base.panes[0];
  if (!single || !box) return base;
  return { ...base, panes: Array.from({ length: count.value }, () => box) };
});

/* 头部高度：单窗 32（够手指按 ‹ › 与拖动翻页），多窗 24（格子窄，只放得下一行小字） */
const headH = computed(() => (view.value === "single" ? HEAD_H_SINGLE : HEAD_H));

function measure() {
  const el = stage.value;
  if (!el) return;
  stageSize.w = el.clientWidth;
  stageSize.h = el.clientHeight;
}

/* ---------- 账号 ----------
   账号清单取自 gameTokens（账号的唯一真相），不是 bin_file_list（那只是「启动过」的缓存）。
   选完账号再按「打开游戏」那条路现场准备 BIN：IndexedDB 取原始 bin → 转 lx →
   写 localStorage['bin_data_<id>']，游戏侧 game-bridge-local.js 只认这个键。 */
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
const slotName = (i) => {
  const s = slots[i];
  return s ? s.name || s.binId || "Token" : "-";
};

const { getArrayBuffer } = useIndexedDB();

/** 把一个 token 的 BIN 落成游戏能读的 localStorage 键；返回 false 表示本地没有凭据 */
async function ensureBin(token) {
  const id = String(token.id);
  if (localStorage.getItem("bin_data_" + id)) return true;
  let buf = await getArrayBuffer(id);
  if (!buf) buf = await getArrayBuffer(token.name);
  if (!buf) return false;
  const hex = Array.from(convertBinToLx(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  localStorage.setItem("bin_data_" + id, hex);
  // 与「打开游戏」一致：顺手登记进 bin_file_list（切换面板 / 游戏内都读它）
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
  if (String(slots[i].binId) !== id && usedIds.value.has(id)) return;
  pickErr.value = "";
  pickBusy.value = id;
  try {
    const ok = await ensureBin(a);
    if (!ok) {
      pickErr.value = `「${a.name}」没有本地登录凭据（BIN），请先到 Token 管理里重新导入一次`;
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
function goTokens() {
  pickerShow.value = false;
  router.push("/mobile/tokens");
}

/* ---------- 窗格菜单：内置脚本管理 + 脚本设置 ----------
   工具坞在 ?multi=1 下不注入任何 UI（features/工具坞.js），入口搬到窗格菜单：
   · 内置脚本管理 → 该账号启用哪些内置脚本（按 tokenId 存）
   · 脚本设置     → 工具坞那份工具清单（describe / open），点了让面板在该窗里展开 */
const menuShow = ref(false);
const menuSlot = ref(-1);
const paneTools = ref([]);
const scriptShow = ref(false);
const scriptToken = ref("");
const scriptSlot = ref(-1);

const menuName = computed(() => (menuSlot.value >= 0 ? slotName(menuSlot.value) : ""));

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
function openMenu(i) {
  if (!slots[i].binId) {
    openPicker(i);
    return;
  }
  focus.value = i;
  menuSlot.value = i;
  paneTools.value = readDock(i);
  menuShow.value = true;
}
function openTool(id) {
  const i = menuSlot.value;
  menuShow.value = false;
  try {
    const dock = frames[i] && frames[i].contentWindow.__XYZW_DOCK__;
    if (dock && typeof dock.open === "function") dock.open(id);
  } catch (e) {
    /* 窗还没就绪，忽略 */
  }
}
function openScriptManage() {
  const i = menuSlot.value;
  menuShow.value = false;
  scriptSlot.value = i;
  scriptToken.value = String(slots[i] && slots[i].binId ? slots[i].binId : "");
  scriptShow.value = true;
}
/** 脚本是页面加载时注入的，改了勾选必须重载该窗才生效 */
function onScriptSaved() {
  if (scriptSlot.value >= 0) reloadPane(scriptSlot.value);
}
function changeAccount() {
  const i = menuSlot.value;
  menuShow.value = false;
  if (i >= 0) openPicker(i);
}

/* ---------- 持久化 ---------- */
function persist() {
  try {
    localStorage.setItem(
      CFG_KEY,
      JSON.stringify({
        count: count.value,
        view: view.value,
        sync: syncOn.value,
        excluded: excluded.value,
        slots: slots.map((s) => ({ binId: s.binId, name: s.name })),
      })
    );
  } catch (e) {
    /* 隐私模式写不进去，不挡使用 */
  }
}
watch([count, view, syncOn, excluded], persist, { deep: true });
// 减少开数后，主控 / 菜单可能指向已经被移除的窗
watch(count, (n) => {
  if (focus.value >= n) focus.value = 0;
  if (menuSlot.value >= n) menuShow.value = false;
});

/* ---------- 单窗翻页 ----------
 * 手机屏幕上「左右滑动」本身是游戏手势（会落到 canvas 里），所以滑动的热区只能是
 * 我们自己拥有的那条窗格头部：头部的 pointer 拖动 = 翻页，游戏画面里的滑动照旧给游戏。
 * 头部还有 ‹ › 两个按钮，给不习惯滑的人。 */
const dragDx = ref(0);
let dragFrom = null;

/** 只让「当前窗」跟着手指偏移，别的窗不动；偏移量取 0.55 折减，避免拖出屏幕 */
function dragShift(i) {
  if (view.value !== "single" || focus.value !== i || !dragDx.value) return "";
  return `translateX(${dragDx.value}px)`;
}

function step(d) {
  const n = count.value;
  if (n < 2) return;
  focus.value = (focus.value + d + n) % n;
  applyAudio();
}

function onHeadDown(e) {
  if (view.value !== "single") return;
  // ⋮ 自己处理点击，别把它的按下当成翻页起点
  if (e.target && e.target.closest && e.target.closest(".mm-more")) return;
  dragFrom = { x: e.clientX, y: e.clientY, lock: 0 };
  window.addEventListener("pointermove", onHeadMove);
  window.addEventListener("pointerup", onHeadUp);
  window.addEventListener("pointercancel", onHeadUp);
}
function onHeadMove(e) {
  if (!dragFrom) return;
  const dx = e.clientX - dragFrom.x;
  const dy = e.clientY - dragFrom.y;
  if (!dragFrom.lock && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
    // 先判方向：竖向是在滚/误触，直接放弃这次拖动
    dragFrom.lock = Math.abs(dx) > Math.abs(dy) ? 1 : -1;
  }
  if (dragFrom.lock !== 1) return;
  dragDx.value = Math.max(-64, Math.min(64, dx * 0.55));
}
function onHeadUp() {
  const moved = dragDx.value;
  dragFrom = null;
  dragDx.value = 0;
  window.removeEventListener("pointermove", onHeadMove);
  window.removeEventListener("pointerup", onHeadUp);
  window.removeEventListener("pointercancel", onHeadUp);
  if (Math.abs(moved) >= 26) step(moved < 0 ? 1 : -1);
}

/* ---------- iframe ---------- */
const frames = [0, 0, 0, 0];
const srcOf = (i) => {
  const base = import.meta.env.BASE_URL + "game/index.html";
  const q = new URLSearchParams({ bin_id: String(slots[i].binId), multi: "1", pane: String(i) });
  return `${base}?${q.toString()}`;
};

function bindFrame(i, el) {
  // ★ 函数 ref 每次重渲染都会再调一次：不挡住的话 attach 会先 detach → 手势被清空 →
  //   紧随其后的 mouseup 被丢弃，目标窗引擎永远停在「按下」态（桌面版踩过这个坑）。
  if (el && frames[i] === el) return;
  frames[i] = el || null;
  if (!el) {
    sync.detach(i);
    ready[i] = false;
    return;
  }
  sync.attach(i, el);
}

/* 窗格可能只有 130px 宽，功能面板本身是 300~360px 固定宽 → 只收敛宽度，不隐藏 */
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

function onFrameLoad(i) {
  ready[i] = false;
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
    applyAudio();
  };
  window.setTimeout(probe, 300);
}

function reloadPane(i) {
  if (i < 0) return;
  ready[i] = false;
  reloadTick[i] += 1;
  persist();
}
function clearSlot(i) {
  if (i < 0) return;
  slots[i] = { binId: "", name: "" };
  ready[i] = false;
  menuShow.value = false;
  persist();
}
function onChip(i) {
  focus.value = i;
  if (!slots[i].binId) openPicker(i);
}
function toggleExcluded(i) {
  if (i < 0) return;
  const k = excluded.value.indexOf(i);
  if (k >= 0) excluded.value.splice(k, 1);
  else excluded.value.push(i);
  menuShow.value = false;
  persist();
}

/* ---------- 声音：只让主控窗出声（两块游戏同时响是没法用的） ---------- */
let muteTimer = null;
function setPaneAudio(i, on) {
  const w = frames[i] && frames[i].contentWindow;
  const ae = w && w.cc && w.cc.audioEngine;
  if (!ae) return;
  try {
    if (typeof ae.setMusicVolume === "function") ae.setMusicVolume(on ? 1 : 0);
    if (typeof ae.setEffectsVolume === "function") ae.setEffectsVolume(on ? 1 : 0);
  } catch (e) {
    /* 引擎版本差异，忽略 */
  }
}
function applyAudio() {
  for (let i = 0; i < 4; i++) {
    if (!slots[i].binId || !ready[i]) continue;
    setPaneAudio(i, i === focus.value);
  }
}

/* ---------- 协同 ---------- */
let rafId = 0;
const sync = createSyncRouter({
  getState: () => ({
    enabled: syncOn.value,
    panes: [0, 1, 2, 3].map((i) => ({
      excluded: excluded.value.includes(i),
      ready: !!ready[i],
    })),
  }),
  onSource: (i) => {
    focus.value = i;
  },
  onRipple: (i, x, y, type) => {
    /* ★ 只在「按下」这一帧画一个点。真机上一次滑动会转发几十个 touchmove，
       每帧都画就是一条白点拖尾（用户截图里就是这个）。
       抬起也不画：手势结束时再冒一个点反而像乱跳。永远只留最新那一个。 */
    if (type !== "mousedown" && type !== "touchstart") return;
    const pane = layout.value.panes[i];
    if (!pane) return;
    const id = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    ripples.value = [{ id, x: pane.x + x, y: pane.y + headH.value + y }];
    if (rafId) return;
    rafId = window.setTimeout(() => {
      rafId = 0;
      ripples.value = [];
    }, 320);
  },
});

/* ---------- 生命周期 ---------- */
let ro = null;
onMounted(async () => {
  /* 本页是全屏路由（不套 MobileLayout），但移动端弹窗样式（body.m-mobile .n-modal…）
     靠这个类限域；MobileLayout 已先卸载，这里补上，离开时摘掉。 */
  document.body.classList.add("m-mobile");
  measure();
  if (typeof ResizeObserver !== "undefined" && stage.value) {
    ro = new ResizeObserver(measure);
    ro.observe(stage.value);
  }
  // 入口带 bin_id（首页用当前选中账号带入）：直接放进第 1 窗，并先把 BIN 准备好
  const qid = route.query.bin_id ? String(route.query.bin_id) : "";
  if (qid && !slots[0].binId) {
    const hit = accounts.value.find((a) => String(a.id) === qid);
    if (hit) {
      await ensureBin(hit);
      slots[0] = { binId: hit.id, name: hit.name };
    } else {
      slots[0] = { binId: qid, name: qid };
    }
    persist();
  }
  window.addEventListener("keydown", onKeyDown);
  muteTimer = window.setInterval(applyAudio, 2500);
});

function onKeyDown(e) {
  // Esc：桌面浏览器调试时先收抽屉，和全局弹窗习惯一致
  if (e.key === "Escape") {
    if (menuShow.value) menuShow.value = false;
    else if (pickerShow.value) closePicker();
    else goBack();
  }
}

/* 页面上没有返回箭头（手机系统返回手势就够）；这个函数留给 Esc 和以后可能的入口 */
function goBack() {
  if (window.history.length > 1) router.back();
  else router.push("/mobile/home");
}

onBeforeUnmount(() => {
  document.body.classList.remove("m-mobile");
  ro && ro.disconnect();
  if (muteTimer) window.clearInterval(muteTimer);
  if (rafId) window.clearTimeout(rafId);
  window.removeEventListener("keydown", onKeyDown);
  // 翻页拖到一半就离开页面：监听是挂在 window 上的，必须自己摘
  window.removeEventListener("pointermove", onHeadMove);
  window.removeEventListener("pointerup", onHeadUp);
  window.removeEventListener("pointercancel", onHeadUp);
  dragFrom = null;
  sync.destroy();
  // 账号切换面板挂在本页 body 上（单开时由 GamePlayer 负责收），多开页自己收
  try {
    const c = window.__ACCT_SWITCH__;
    if (c && typeof c.destroy === "function") c.destroy();
  } catch (e) {
    /* 无面板时忽略 */
  }
});

/* 探针入口：node test/_probe-multisync.cjs <url>/mobile/multi 时读它 */
window.__MULTI_DEBUG__ = {
  simulate: (i, nx, ny) => sync.simulate(i, nx, ny),
  simulateReal: (i, nx, ny) => sync.simulateReal(i, nx, ny),
  state: () => ({
    count: count.value,
    view: view.value,
    syncOn: syncOn.value,
    focus: focus.value,
    ready: [ready[0], ready[1], ready[2], ready[3]],
    layout: layout.value,
  }),
};
</script>

<script>
export default { name: "MobileMulti" };
</script>

<style scoped lang="scss">
/* 全屏页：不套 MobileLayout（顶栏/底栏各占 44/56px，多开要的是画面）。
   用 position:fixed 而不是 100vh：iOS 上 100vh 会把地址栏算进来。 */
.mm-page {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  overscroll-behavior: none;
  background: var(--m-bg);
  color: var(--m-text);
  font-size: 13px;
}

/* ---------- ① 顶栏 ---------- */
.mm-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
  padding: 6px 8px;
  padding-top: calc(6px + env(safe-area-inset-top));
  background: var(--m-card);
  border-bottom: 1px solid var(--m-band);
}
.mm-slots {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.mm-slots::-webkit-scrollbar {
  display: none;
}
.mm-chip {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  max-width: 116px;
  padding: 0 10px;
  border: 1px solid var(--m-border);
  border-radius: var(--m-r-md);
  background: var(--m-card);
  color: var(--m-text2);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.mm-chip-i {
  flex: none;
  width: 15px;
  height: 15px;
  border-radius: var(--m-r-sm);
  background: var(--m-band);
  color: var(--m-text3);
  font-size: 10px;
  font-style: normal;
  line-height: 15px;
  text-align: center;
}
.mm-chip-n {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: inherit !important;
}
.mm-chip.is-focus {
  border-color: var(--m-primary);
  background: var(--m-primary-soft);
  color: var(--m-primary-deep);
}
.mm-chip.is-focus .mm-chip-i {
  background: var(--m-primary);
  color: var(--m-on-primary);
}
.mm-chip.is-empty {
  border-style: dashed;
  color: var(--m-text3);
}

/* ---------- ② 控制条 ---------- */
.mm-ctrl {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  height: 42px;
  padding: 0 8px;
  background: var(--m-bg);
  border-bottom: 1px solid var(--m-band);
}
.mm-seg {
  display: flex;
  flex: 0 0 auto;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--m-border);
  border-radius: var(--m-r-md);
  background: var(--m-card);
}
.mm-seg > button {
  border: none;
  border-radius: var(--m-r-sm);
  background: none;
  color: var(--m-text2);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.2;
  height: 26px;
  padding: 0 9px;
  white-space: nowrap;
  cursor: pointer;
}
.mm-seg > button.on {
  background: var(--m-primary);
  color: var(--m-on-primary);
  font-weight: 500;
}
.mm-sync {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
  margin-left: auto;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--m-border);
  border-radius: var(--m-r-md);
  background: var(--m-card);
  color: var(--m-text3);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.mm-sync.on {
  border-color: var(--m-primary);
  background: var(--m-primary-soft);
  color: var(--m-primary-deep);
}
.mm-sync .mm-k {
  position: relative;
  width: 26px;
  height: 15px;
  border-radius: 999px;
  background: var(--m-border);
  transition: background 0.15s;
}
.mm-sync .mm-k::after {
  content: "";
  position: absolute;
  left: 2px;
  top: 2px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s;
}
.mm-sync.on .mm-k {
  background: var(--m-primary);
}
.mm-sync.on .mm-k::after {
  transform: translateX(11px);
}
.mm-sync-t {
  color: inherit !important;
}

/* ---------- ③ 舞台 / 窗格 ---------- */
.mm-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.mm-pane {
  position: absolute;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--m-r-md);
  /* 窗格底走主题色，不是 #000：空窗态的 .mm-empty 内缩 3px，垫黑底会在浅色主题下
     变成一圈 3px 的黑框（游戏画面由 iframe 自己铺黑，不需要这里兜） */
  background: var(--m-bg);
  box-shadow: 0 0 0 1px var(--m-border);
}
.mm-pane.is-focus {
  box-shadow: 0 0 0 1px var(--m-primary);
}
.mm-pane.is-idle {
  opacity: 0.6;
}
/* 单窗：非当前窗只是「不可见」，不是「不存在」—— opacity 仍然参与命中测试，
   elementFromPoint 在它自己的文档里照样能返回 canvas，协同才能判断有没有被面板挡住。
   visibility / display 都不行，会让转发被误判成「被遮挡」而整轮丢弃。 */
.mm-pane.is-hidden {
  opacity: 0;
  pointer-events: none;
  z-index: 1;
}
.mm-pane.is-focus {
  z-index: 2;
}
/* 翻页拖动：跟手期间关掉过渡，松手回位再打开 */
.mm-pane {
  transition: transform 0.16s ease-out;
}
.mm-pane.is-dragging {
  transition: none;
}
.mm-head {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
  height: 24px;
  padding: 0 2px 0 6px;
  background: var(--m-card);
  font-size: 11px;
  user-select: none;
  cursor: pointer;
  /* 头部的横向拖动是翻页手势，不能被浏览器当成滚动/长按 */
  touch-action: none;
}
/* 单窗：头部同时是翻页手柄（横向拖动），高度抬到 32 才够手指按 */
.mm-head.is-single {
  height: 32px;
  padding: 0 4px 0 10px;
  font-size: 12px;
}
.mm-head.is-single .mm-name {
  max-width: 52%;
}
.mm-head.is-single .mm-more {
  width: 28px;
  height: 26px;
  font-size: 16px;
  line-height: 24px;
}
.mm-dot {
  flex: none;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--m-border);
}
.mm-dot.on {
  background: var(--m-green);
}
.mm-name {
  max-width: 46%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--m-text2) !important;
}
.mm-tag {
  flex: none;
  padding: 0 4px;
  height: 13px;
  line-height: 13px;
  border-radius: 2px;
  background: var(--m-primary-soft);
  color: var(--m-primary-deep) !important;
  font-size: 9px;
}
.mm-tag.is-off {
  background: var(--m-amber-soft);
  color: var(--m-amber) !important;
}
.mm-grow {
  flex: 1;
}
.mm-more {
  flex: none;
  width: 22px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: none;
  color: var(--m-text3);
  font-size: 14px;
  line-height: 18px;
  cursor: pointer;
}
.mm-more.on {
  background: var(--m-primary-soft);
  color: var(--m-primary-deep);
}
.mm-body {
  position: relative;
  flex: 1;
  min-height: 0;
}
.mm-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #000;
}
.mm-empty {
  position: absolute;
  inset: 3px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px dashed var(--m-border);
  border-radius: var(--m-r-sm);
  background: var(--m-card);
  color: var(--m-text3);
  font-family: inherit;
  cursor: pointer;
}
.mm-empty-plus {
  font-size: 17px;
  font-style: normal;
  line-height: 1;
}
.mm-empty-t {
  color: inherit !important;
  font-size: 11px;
}

/* ---------- 落点圈 ---------- */
.mm-ripples {
  position: absolute;
  inset: 0;
  /* 窗格现在有 z-index（隐藏窗 z1 / 当前窗 z2），落点圈必须再抬一层，否则被画面盖住 */
  z-index: 5;
  pointer-events: none;
}
.mm-ripple {
  position: absolute;
  width: 20px;
  height: 20px;
  margin: -10px 0 0 -10px;
  border-radius: 50%;
  border: 1.5px solid var(--m-primary);
  background: transparent;
  /* 一次手势只闪一下：320ms 内放大淡出，然后由 JS 清掉。
     拖动帧不再画点（见 onRipple），所以不会出现一串白点 */
  animation: mm-ping 0.32s ease-out forwards;
}
@keyframes mm-ping {
  from {
    transform: scale(0.6);
    opacity: 0.9;
  }
  to {
    transform: scale(1.3);
    opacity: 0;
  }
}

/* ---------- ④ 选账号行 ---------- */
.mm-arow {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 46px;
  padding: 6px 2px;
  border: none;
  border-bottom: 1px solid var(--m-band);
  background: none;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.mm-arow[disabled] {
  opacity: 0.45;
}
.mm-ava {
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: var(--m-r-md);
  background: var(--m-primary);
  color: var(--m-on-primary);
  font-size: 12px;
  font-style: normal;
  line-height: 30px;
  text-align: center;
}
.mm-atxt {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.mm-aname {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--m-text) !important;
}
.mm-aremark {
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--m-text3) !important;
}
.mm-aused {
  flex: none;
  font-size: 11px;
  font-style: normal;
  color: var(--m-text3) !important;
}
.mm-arrow {
  flex: none;
  color: var(--m-text3);
}
.mm-err {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--m-red) !important;
}
.mm-sheet-ft {
  margin-top: 12px;
}

/* ---------- ⑤ 窗格菜单行 ---------- */
.mm-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 0 2px;
  border: none;
  border-bottom: 1px solid var(--m-band);
  background: none;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.mm-row.is-danger .mm-rn {
  color: var(--m-red) !important;
}
.mm-ri {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: var(--m-r-sm);
  background: #5f6470;
  color: #fff;
  font-size: 10px;
  font-style: normal;
}
.mm-ri.is-script {
  background: var(--m-primary);
}
.mm-rn {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--m-text2) !important;
}
.mm-rlabel {
  padding: 10px 2px 4px;
  font-size: 11px;
  color: var(--m-text3) !important;
}
.mm-rsep {
  height: 8px;
  margin: 6px -16px;
  background: var(--m-bg);
}
.mm-hint-in {
  margin: 8px 0 4px;
  color: var(--m-text3) !important;
}

/* 抽屉里的大标题 / 副标题同样要压过 App.vue 暗色通配（span/div/h4 都是 !important） */
.mm-page :deep(.m-sheet h4) {
  color: var(--m-text) !important;
}
.mm-page :deep(.m-sheet .m-sh-sub) {
  color: var(--m-text3) !important;
}

/* 窄屏（≤359px）控制条再收一档，避免三段控件换行 */
@media (max-width: 359px) {
  .mm-ctrl {
    gap: 5px;
    padding: 0 6px;
  }
  .mm-seg > button {
    padding: 0 7px;
    font-size: 11px;
  }
  .mm-sync {
    padding: 0 8px;
  }
}
</style>
