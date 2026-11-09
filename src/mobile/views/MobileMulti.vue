<template>
  <!-- style 里会带 --mm-ime-b（键盘高度）与键盘期间钉死的高度，见 script 里的 syncViewport -->
  <div class="mm-page" :class="{ 'is-ime': !!lockH, 'is-full': fullOn >= 0 }" :style="pageStyle">
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
          'is-hidden': view === 'single' && focus !== i && fullOn !== i,
          'is-full': fullOn === i,
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
          :class="{ 'is-single': view === 'single' || fullOn === i }"
          @click="focus = i"
          @pointerdown="onHeadDown"
        >
          <i class="mm-dot" :class="{ on: ready[i] }"></i>
          <span class="mm-name">{{ slots[i].binId ? slotName(i) : "未绑定" }}</span>
          <span v-if="focus === i" class="mm-tag">主控</span>
          <span v-if="excluded.includes(i)" class="mm-tag is-off">断开</span>
          <i class="mm-grow"></i>
          <!-- 全屏 / 退出全屏：这一窗铺满整块屏幕（iPhone 没有 Fullscreen API，靠布局铺满） -->
          <button
            type="button"
            class="mm-zoom"
            :class="{ on: fullOn === i }"
            :aria-label="fullOn === i ? '退出全屏' : '全屏这一窗'"
            @click.stop="toggleFull(i)"
          >
            <MIcon :name="fullOn === i ? 'shrink' : 'expand'" :size="fullOn === i ? 15 : 14" />
          </button>
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

      <!-- 回落全屏（iPhone / 无 Fullscreen API）：没有系统返回键可用，给一个悬浮退出钮。
           真全屏时不显示 —— 那种情况返回键 / 上滑手势本身就是出口。 -->
      <button
        v-if="fullOn >= 0 && !fsOn"
        type="button"
        class="mm-fs-exit"
        aria-label="退出全屏"
        @click="toggleFull(fullOn)"
      >
        <MIcon name="shrink" :size="16" />
      </button>
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
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
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
/* 全屏中的窗格下标；-1 = 没全屏。见下面 toggleFull 的注释 */
const fullOn = ref(-1);
const layout = computed(() => {
  const single = view.value === "single";
  const base = computeLayout({
    count: single ? 1 : count.value,
    width: stageSize.w,
    height: stageSize.h,
    mode: "auto",
  });
  const box = base.panes[0];
  const panes =
    !single || !box ? base.panes.slice() : Array.from({ length: count.value }, () => box);
  /* 全屏：把这一窗的 rect 直接换成整个舞台（顶栏/控制条已被 display:none 摘掉，
     舞台此时就是整块屏幕）。其它窗留在原位被盖住 —— 但仍在正常布局里，
     canvas 的 rect 有效，协同转发不受影响。 */
  if (fullOn.value >= 0 && panes[fullOn.value]) {
    panes[fullOn.value] = { x: 0, y: 0, w: stageSize.w, h: stageSize.h };
  }
  return { ...base, panes };
});

/* 头部高度：单窗 32（够手指按按钮与拖动翻页），多窗 24（格子窄，只放得下一行小字）；
   全屏 0 —— 头部整条摘掉，游戏画面顶到屏幕最上沿。 */
const headH = computed(() => {
  if (fullOn.value >= 0) return 0;
  return view.value === "single" ? HEAD_H_SINGLE : HEAD_H;
});

function measure() {
  // 键盘期间一律不重算：舞台被压矮时重算会把窗格整体缩小重排（画面跳一下）
  if (lockH.value) return;
  const el = stage.value;
  if (!el) return;
  stageSize.w = el.clientWidth;
  stageSize.h = el.clientHeight;
}

/* ---------- 软键盘（输入法）绝不参与布局 ----------
 * .mm-page 是 position:fixed; inset:0，尺寸跟的是「布局视口」，而输入法弹出压的是「可视视口」，
 * 两种浏览器的表现还不一样：
 *   · Android Chrome：布局视口一起被压矮 → .mm-stage 变矮 → ResizeObserver 重算
 *     → 所有窗格缩小重排，游戏画面「抖一下、位置全变」；
 *   · iOS / 只压可视视口：浏览器把可视视口往上平移，顶栏被推出屏幕，
 *     贴在底边的抽屉浮到屏幕中间 —— 用户截图里「窗格菜单跑到下方、位置错乱」就是这个。
 * 做法：把键盘弹出前的可用高度记成 baseH，键盘期间用它把 .mm-page 的高度钉死
 * （height: baseH），窗格因此一动不动；抽屉再按可视视口贴到键盘上沿，保证看得见、点得到。 */
const IME_MIN = 120; // 可视视口比基线矮这么多才算键盘（地址栏收起只差几十像素，别误判）
const vvH = ref(0); // visualViewport.height
const vvTop = ref(0); // visualViewport.offsetTop（iOS 会把可视视口往下平移）
const lockH = ref(0); // 键盘前的页面高度；>0 就等于「键盘开着」
let baseH = 0;

function syncViewport() {
  const vv = window.visualViewport;
  const h = Math.round(vv ? vv.height : window.innerHeight);
  const top = Math.round(vv ? vv.offsetTop : 0);
  vvH.value = h;
  vvTop.value = top;
  const ime = !!baseH && h < baseH - IME_MIN;
  if (!ime) {
    // 没键盘时基线跟着走：转屏、地址栏收起之类都能自愈
    baseH = h;
    if (lockH.value) {
      lockH.value = 0;
      nextTick(measure); // 键盘收起：按真实高度重算一次
    }
    return;
  }
  if (!lockH.value) lockH.value = baseH;
}

/* 抽屉要贴「可视区底边」：可视区底边在页面坐标里是 offsetTop + height，
   离钉死后的页面底边还差 lockH - (offsetTop + height)。
   Android 压布局视口时 offsetTop=0、height 变小；iOS 平移可视视口时 offsetTop 正好补上 ——
   同一个式子两边都对。 */
const imeBottom = computed(() =>
  lockH.value ? Math.max(0, Math.round(lockH.value - (vvTop.value + vvH.value))) : 0
);
const pageStyle = computed(() => {
  const s = { "--mm-ime-b": imeBottom.value + "px" };
  if (lockH.value) s.height = lockH.value + "px";
  return s;
});

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
}

/* ---------- 头部按钮：全屏 ----------
 * 两层叠加，缺一不可：
 *   ① 布局铺满（一定生效）：把顶栏和控制条摘掉、这一窗的 rect 换成整个舞台。
 *      全程 px 绝对定位，不碰 100vh / fixed —— .mm-page 是 position:fixed; inset:0，
 *      高度天然等于「真正看得见的高度」（地址栏/手势条已扣掉），比 screen.height 准。
 *   ② 浏览器全屏（有就用）：再调一次 document.documentElement.requestFullscreen，
 *      把地址栏、状态栏一并压掉，底部由系统提示「返回键 / 上滑退出全屏」。
 *      iPhone Safari 没有这套 API（或只对 video 开放）→ 自动只留 ①，视觉照样铺满。
 *
 * ★ 全屏元素必须是 documentElement 整页：拿 .mm-pane 去 requestFullscreen 会把
 *   抽屉/遮罩/落点反馈全盖在外面（top layer 只渲染全屏元素本身）。
 * ★ 全屏时**标题栏整条摘掉**：这一窗就是纯游戏画面，iframe 从 y=0 铺到屏幕底。
 *   ★ 全屏不做协同（getState 的 enabled 会临时置 false）：各窗 canvas 比例不同，
 *     按比例映射必然错位；全屏的语义就是「专心玩这一个号」。
 * ★ 协同不受影响（非全屏时）：forward 归一化用的是「源窗 canvas 的 rect → 目标窗自己的 canvas rect」，
 *   本来就按比例映射，不要求各窗等尺寸。
 * ★ 别把窗格改成 position:fixed 去铺满：fixed 相对布局视口，iOS 会把地址栏算进来，底部顶出屏幕。 */
const fsOn = ref(false); // 浏览器真全屏是否生效（决定要不要提示「返回键退出」）
const fsAvail =
  typeof document !== "undefined" && !!document.documentElement.requestFullscreen;

async function enterFs() {
  if (!fsAvail || document.fullscreenElement) return;
  try {
    // navigationUI:"hide" 让安卓 Chrome 把地址栏/状态栏一并收起（系统仍给「返回键退出」提示）
    await document.documentElement.requestFullscreen({ navigationUI: "hide" });
  } catch (e) {
    /* 被拒（iPhone / 非用户手势）→ 只留布局铺满，不报错 */
  }
}
function exitFs() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
/* 系统全屏状态变了：按返回键 / 上滑 / 系统手势退出，都要把「铺满」一起复位，
   否则画面会停在一个没有顶栏、也退不出去的状态。 */
function onFsChange() {
  fsOn.value = !!document.fullscreenElement;
  if (!fsOn.value && fullOn.value >= 0) fullOn.value = -1;
  nextTick(measure);
}

function toggleFull(i) {
  if (fullOn.value === i) {
    fullOn.value = -1;
    exitFs();
    nextTick(measure);
    return;
  }
  focus.value = i;
  fullOn.value = i;
  // 真全屏是异步的（要等 fullscreenchange），先按布局铺满画出来，视觉上不闪
  enterFs();
  // 顶栏/控制条被 display:none 摘掉后舞台会变高，立刻按新尺寸量一次，
  // 免得全屏第一帧还按旧舞台尺寸画（ResizeObserver 也会来，但这是同一帧内的事）
  nextTick(measure);
}

function onHeadDown(e) {
  if (view.value !== "single" || fullOn.value >= 0) return;
  // ⋮ / 最大化按钮自己处理点击，别把它们的按下当成翻页起点
  if (e.target && e.target.closest && e.target.closest(".mm-more, .mm-zoom")) return;
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

/* ---------- 掐掉游戏自己的「点击任意位置全屏」 ----------
 * 游戏首次进入会挂一个「点一下进全屏」的手势（cc.screen.requestFullScreen 之类），
 * 单开时是对的，多开时会把整页顶成全屏 —— 所有窗格被挤成一屏，布局全废。
 * 做法：在这一窗**自己的 realm** 里把 requestFullscreen 打成 no-op。
 *   · 改 Element.prototype，不是 documentElement 实例：游戏多半是 canvas.requestFullscreen()；
 *   · 只影响 iframe 内部，父页「全屏这一窗」用的还是真 API，互不干扰；
 *   · 只 patch 多开页（本页与桌面 /multi），单开 GamePlayer 不动。 */
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
    kill(w.document.documentElement, "requestFullscreen"); // 双保险：实例属性优先于原型
    w.__mpFsOff = true;
  } catch (e) {
    /* 跨域 / 已卸载：忽略 */
  }
}

function onFrameLoad(i) {
  ready[i] = false;
  // 一加载就掐，别等 cc 就绪 —— 游戏可能在很早就挂上那个点击手势
  patchFrameFullscreen(i);
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
    /* 第二道锁：引擎 cc.screen 有 enableAutoFullScreen —— 首次全屏被浏览器拒（没有用户手势）后，
       它会往 canvas 上挂一个一次性 touchend 监听，用户「点任意地方」时再试一次全屏。
       这正是"首次进入点一下就全屏"的来源。cc 就绪后直接把它关掉（它的官方开关）。 */
    try {
      const w = frames[i] && frames[i].contentWindow;
      const scr = w && w.cc && w.cc.screen;
      if (scr && typeof scr.disableAutoFullScreen === "function") scr.disableAutoFullScreen();
    } catch (e) {
      /* 引擎还没起来 / 跨域：忽略，靠上面的 API 补丁兜底 */
    }
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

/* ---------- 声音：一律不碰 ----------
 * 之前这里做过「只让主控窗出声」：每 2.5s 把主控窗 setMusicVolume/setEffectsVolume 设回 1。
 * 但引擎的实现是「记录音量 + 立刻 setVolume(当前实例, v)」——
 *    cc.audioEngine.setMusicVolume = function (v) { this._music.volume = v; this.setVolume(this._music.id, v) }
 * 也就是说这个调用会把**正在播放的音乐/音效直接改成新音量**。
 * 游戏内关声音是它自己的 SoundManager 逐实例调 setVolume(id, 0) 做的，被我们这一发设回 1
 * ⇒ 用户在设置里关掉也没用，每 2.5 秒又响（用户报的「声音关不掉」就是这个）。
 * 结论：多开不做任何音量干预，以游戏内设置为准。要「只主控出声」只能另做成显式开关，
 * 且只能静音别的窗、永远不许把任何窗的音量调大。
 */

/* ---------- 协同 ---------- */
let rafId = 0;
const sync = createSyncRouter({
  getState: () => ({
    /* 全屏时不协同：全屏窗 canvas 的比例与分格窗不同，按比例映射必然错位；
       而且全屏的语义就是「专心玩这一个号」，误转发到后景号反而危险。 */
    enabled: syncOn.value && fullOn.value < 0,
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
  /* 真全屏可能被系统手势 / 返回键 / Esc（浏览器自己处理）退出，
     fullscreenchange 是唯一可靠的通知，必须听，否则页面停在「铺满但退不出去」。 */
  document.addEventListener("fullscreenchange", onFsChange);
  /* 输入法：visualViewport 的 resize 不一定触发 window.resize（iOS 只发 scroll），
     两个都听；scroll 用来跟住「浏览器把可视视口往上平移」带来的 offsetTop 变化。 */
  window.addEventListener("resize", syncViewport);
  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener("resize", syncViewport);
    vv.addEventListener("scroll", syncViewport);
  }
  syncViewport();
});

function onKeyDown(e) {
  // Esc：桌面浏览器调试时先收抽屉，和全局弹窗习惯一致
  if (e.key === "Escape") {
    if (menuShow.value) menuShow.value = false;
    else if (pickerShow.value) closePicker();
    else if (fullOn.value >= 0) {
      fullOn.value = -1;
      exitFs();
    } else goBack();
  }
}

/* 页面上没有返回箭头（手机系统返回手势就够）；这个函数留给 Esc 和以后可能的入口 */
function goBack() {
  if (window.history.length > 1) router.back();
  else router.push("/mobile/home");
}

onBeforeUnmount(() => {
  document.body.classList.remove("m-mobile");
  document.removeEventListener("fullscreenchange", onFsChange);
  // 全屏状态下离开页面：先退全屏，否则下一个路由会卡在「无地址栏」的窗口里
  exitFs();
  ro && ro.disconnect();
  if (rafId) window.clearTimeout(rafId);
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("resize", syncViewport);
  const vv = window.visualViewport;
  if (vv) {
    vv.removeEventListener("resize", syncViewport);
    vv.removeEventListener("scroll", syncViewport);
  }
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
    full: fullOn.value,
    fs: fsOn.value,
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
/* ---------- 全屏 ----------
 * 顶栏 + 控制条整条摘掉（display:none），舞台自然占满 .mm-page；.mm-page 是
 * position:fixed; inset:0，高度就是「真正看得见的高度」（iOS 地址栏 / 手势条都已经扣掉），
 * 不读 screen.height 也不会踩 100vh 的坑。窗格仍是 stage 内的 px 绝对定位，只是 rect 换成整个舞台。
 * ★ 标题栏（.mm-head，32px）**保留**：账号名/主控标识要看得见，右侧小按钮就是退出入口，
 *   下方 iframe 从 y=32 开始。
 * ★ 别改成把窗格 position:fixed：fixed 相对视口，iOS 上会按布局视口算（含地址栏），底部会被顶出去。 */
.mm-page.is-full .mm-bar,
.mm-page.is-full .mm-ctrl {
  display: none;
}
.mm-pane.is-full {
  z-index: 3;
  border-radius: 0;
  box-shadow: none;
}
/* 全屏时标题栏整条摘掉，游戏画面顶到 y=0（配合 headH 返回 0） */
.mm-pane.is-full .mm-head {
  display: none;
}
/* 回落全屏的退出钮：只有没进真全屏（iPhone）时才出现 */
.mm-fs-exit {
  position: absolute;
  top: calc(8px + env(safe-area-inset-top));
  right: 10px;
  z-index: 6;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 15px;
  background: rgba(0, 0, 0, 0.42);
  color: #fff !important;
  cursor: pointer;
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
}
/* 真全屏（documentElement 进 top layer）：UA 会给 :fullscreen 加黑底并可能带 8px 边距，
   body/html 在这里对齐一次，免得画面缩一圈、四周露黑边。
   ★ 必须 :global —— scoped 会给选择器尾巴加 [data-v]，永远匹配不到 <html>。 */
:global(html:fullscreen),
:global(html:fullscreen body) {
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  background: #000 !important;
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
/* 最大化 / 还原：比 ⋮ 大一圈（这是窗格最常用的操作，得按得准）。
   按压反馈走全局 veil，不在这里自写 :active 叠底（全站只留那一条）。 */
.mm-zoom {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: none;
  color: var(--m-text3);
  cursor: pointer;
}
.mm-head.is-single .mm-zoom {
  width: 28px;
  height: 26px;
}
/* 全屏中：按钮保持高亮，提示「再点一下退出」 */
.mm-zoom.on {
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

/* ---------- 键盘开着时：抽屉贴到键盘上沿 ----------
 * 键盘期间 .mm-page 的高度被钉成键盘前的高度（见 script 的 syncViewport），
 * 所以抽屉不能再用「bottom:0 就贴屏幕底」来算 —— 页面底边可能已经缩到键盘后面了。
 * --mm-ime-b 是「可视区底边离页面底边还差多少」，键盘收起时是 0px、且 .is-ime 不在，
 * 完全回到 mobile.css 的默认行为。 */
.mm-page.is-ime :deep(.m-sheet) {
  bottom: var(--mm-ime-b, 0px);
  max-height: calc(100% - var(--mm-ime-b, 0px) - 12px);
}
.mm-page {
  --mm-ime-b: 0px;
}
</style>
