<template>
  <!-- 键盘期间 style 会带 top/height，把整页摆到「可视视口」上，见 script 里的 syncViewport / pageStyle -->
  <div class="mm-page" :class="{ 'is-ime': !!lockH, 'is-full': fullOn >= 0 }" :style="pageStyle">
    <!-- ① 顶栏：一行装下「槽位 + 视图 + ⋮」
         不放返回箭头：手机有系统返回手势，页内再放一个只会占掉槽位宽度。
         槽位名固定截成两个字（超出的用 …），否则长名字会把视图切换挤出屏幕。 -->
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
          <span class="mm-chip-n">{{ chipName(i - 1) }}</span>
        </button>
      </div>

      <div class="mm-seg mm-seg-view" role="group" aria-label="视图">
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

      <button
        type="button"
        class="mm-bar-more"
        :class="{ on: topMenu }"
        aria-label="更多设置"
        :aria-expanded="topMenu"
        @click="topMenu = !topMenu"
      >
        ⋮
      </button>

      <!-- 顶栏 ⋮ 的小菜单：协同默认关，开关收在这里，不再占一整条控制栏 -->
      <div v-if="topMenu" class="mm-pop-mask" @click="topMenu = false"></div>
      <div v-if="topMenu" class="mm-pop">
        <div class="mm-pop-row">
          <span class="mm-pop-t">协同</span>
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
          </button>
        </div>
        <p class="mm-pop-hint" :class="{ 'is-warn': view !== 'multi' }">
          {{ popHint }}
        </p>
      </div>
    </header>

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

    <!-- 键盘几何自检：地址栏加 ?vvdbg=1 才出现（真机没有控制台，只能把读数画在屏幕上） -->
    <pre v-if="dbgOn" class="mm-dbg">{{ dbgText }}</pre>
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
/* 开数固定 4（2×2）：不再让用户选。2/3 开时格子大小不一、留白难看，
   而 2×2 在竖屏上刚好填满。旧配置里存的 2/3 一律按 4 处理。 */
const count = ref(4);
/* 默认单窗：手机竖屏上两块 480:940 只能各占 187×367，字根本看不清。
   多窗（同屏分格）保留为可选，切回去就是桌面那套 grid。 */
const view = ref(saved.view === "multi" ? "multi" : "single");
/* 协同默认关：多开时各号独立操作是常态，同步是需要显式开启的动作 */
const syncOn = ref(saved.sync === true);
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
/* 顶栏 ⋮ 的下拉菜单（现在只放协同开关） */
const topMenu = ref(false);
/* 下拉里那行说明：大窗模式下协同是不生效的，必须讲清楚，否则用户以为开了 */
const popHint = computed(() => {
  if (view.value !== "multi") return "大窗模式不协同：看不到其他窗，同步过去容易误操作";
  if (!syncOn.value) return "各窗独立，操作互不影响";
  return "一个窗的操作会同步到其它窗";
});

const viewOptions = [
  { label: "大窗", value: "single" },
  { label: "小窗", value: "multi" },
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
  const el = stage.value;
  if (!el) return;
  stageSize.w = el.clientWidth;
  stageSize.h = el.clientHeight;
}

/* ---------- 页面几何 = 可视区（键盘期间） ----------
 * .mm-page 是 position:fixed; inset:0，跟的是「布局视口」。键盘弹出时：
 *   · Android Chrome：布局视口一起变矮 → 舞台变矮；
 *   · iOS（Safari / Chrome 都是 WKWebView）：布局视口不动，浏览器把「可视视口」整体
 *     往上平移去露出游戏里的聊天输入框。页面只有一屏高，平移过去露出的是页面外的一片白，
 *     收键盘后 WKWebView 还不一定推回来 —— 用户实测：下方大片白、顶部角色 chip 不见了。
 * 做法：只要可视视口和布局视口对不上（键盘弹出，或残留的平移），就把 .mm-page 摆到
 * 「可视视口」上：top 抵消平移、height 取可视高度。页面 = 眼睛看到的那块，
 * 既没有露白的余量，也不指望浏览器事后帮我们复原。
 * 代价：键盘期间窗格整体变矮（游戏画面跟着缩）。这反过来是必须的 ——
 * 窗格比可视区高的话，输入框永远落在键盘后面，浏览器只会继续推页面。 */
const IME_MIN = 120; // 可视视口比基线矮这么多才算键盘（地址栏收起只差几十像素，别误判）
const vvH = ref(0); // visualViewport.height
const vvTop = ref(0); // visualViewport.offsetTop（iOS 平移可视视口时 > 0）
const lockH = ref(0); // 键盘前的可视高度；>0 就等于「键盘开着」
let baseH = 0;

/* ---------- 别让浏览器「滚」这几层（见 CSS 里 overflow: clip 的注释） ----------
 * 就算内核不认 overflow: clip，也不能让它把舞台滚走：哪一层被滚了就把哪一层归零。
 * 只认这三层 —— `.m-sheet` 自己是要滚的（账号列表长），别误伤。 */
const CLIP_LAYERS = ["mm-page", "mm-stage", "mm-pane"];
function onInnerScroll(e) {
  const t = e.target;
  if (!t || !t.classList) return;
  let hit = false;
  for (let i = 0; i < CLIP_LAYERS.length; i++) if (t.classList.contains(CLIP_LAYERS[i])) hit = true;
  if (!hit) return;
  if (t.scrollTop) t.scrollTop = 0;
  if (t.scrollLeft) t.scrollLeft = 0;
}
function resetClip() {
  for (let i = 0; i < CLIP_LAYERS.length; i++) {
    const els = document.querySelectorAll("." + CLIP_LAYERS[i]);
    for (let k = 0; k < els.length; k++) {
      if (els[k].scrollTop) els[k].scrollTop = 0;
      if (els[k].scrollLeft) els[k].scrollLeft = 0;
    }
  }
}

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
      /* 收键盘后把文档滚回原点：WKWebView 有时把页面推上去就不管了，
         不主动推回来，页面会停在「顶栏在屏幕外」的状态 */
      try {
        window.scrollTo(0, 0);
      } catch (e) {
        /* 忽略 */
      }
      resetClip();
      nextTick(measure); // 键盘收起：按真实高度重算一次
    }
    return;
  }
  if (!lockH.value) lockH.value = baseH;
}

const pageStyle = computed(() => {
  if (!lockH.value && vvTop.value <= 0) return {};
  return { top: vvTop.value + "px", bottom: "auto", height: vvH.value + "px" };
});

/* ---------- 键盘几何自检（地址栏加 ?vvdbg=1 才出现） ----------
 * 真机没有控制台，「键盘弹出后页面被推走」这类问题只能把读数画在屏幕上。
 * 第一行的版本号是有用的：手机上看到的还是旧画面时，先确认到底加载没加载新代码。 */
const DBG_TAG = "kbd-fix-5";
const dbgOn = (() => {
  try {
    return new URLSearchParams(location.search).has("vvdbg");
  } catch (e) {
    return false;
  }
})();
const dbgText = ref("");
let dbgTimer = 0;
let dbgMaxTop = 0;
let dbgMaxScroll = 0;

/* 游戏 iframe 内部读数：键盘期间外层页面已经正确，剩下要看的就是
   iframe 的 innerHeight / canvas 尺寸 / iframe 自己的滚动位置到底跟没跟上。 */
function dbgFrame(i) {
  try {
    const w = frames[i] && frames[i].contentWindow;
    if (!w) return `f${i} -`;
    const d = w.document;
    const c = d.querySelector("canvas");
    const cc = w.cc;
    let vis = "";
    try {
      const v = cc && cc.view && cc.view.getVisibleSize();
      if (v) vis = ` vis=${Math.round(v.width)}x${Math.round(v.height)}`;
    } catch (e) {
      /* 引擎没就绪 */
    }
    const cs = c ? w.getComputedStyle(c) : null;
    return [
      `f${i} inner=${w.innerWidth}x${w.innerHeight} vv=${Math.round((w.visualViewport && w.visualViewport.height) || 0)}`,
      ` scroll=${Math.round(w.scrollY || 0)} docH=${d.documentElement ? d.documentElement.scrollHeight : "-"}`,
      c
        ? ` canvas attr=${c.width}x${c.height} css=${Math.round(c.clientWidth)}x${Math.round(c.clientHeight)}${vis}`
        : ` canvas -`,
      cs ? ` cstyle=${cs.width}/${cs.height}/${cs.transform}` : "",
    ].join("\n");
  } catch (e) {
    return `f${i} 读取失败 ${e && e.message}`;
  }
}

/* 从窗格往上走 5 层，逐层打印 class / transform / rect.top —— 负的 top 只可能出在某一层 */
function dbgChain(el) {
  const out = [];
  let n = el;
  for (let k = 0; k < 5 && n; k++) {
    const cs = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    const tag = String(n.className || n.tagName || "?").split(" ")[0];
    out.push(` ${"·".repeat(k)}${tag} t=${cs.transform} y=${Math.round(r.top)}`);
    n = n.parentElement;
  }
  return out;
}

function startDbg() {  if (!dbgOn) return;
  const tick = () => {
    const vv = window.visualViewport;
    const el = document.querySelector(".mm-page");
    const r = el ? el.getBoundingClientRect() : null;
    const st = document.querySelector(".mm-stage");
    const sy = Math.round(window.scrollY || window.pageYOffset || 0);
    const vt = Math.round(vv ? vv.offsetTop : 0);
    dbgMaxTop = Math.max(dbgMaxTop, vt);
    dbgMaxScroll = Math.max(dbgMaxScroll, sy);
    const meta = document.querySelector('meta[name="viewport"]');
    const pane = document.querySelector(".mm-pane");
    const pr = pane ? pane.getBoundingClientRect() : null;
    const pcs = pane ? getComputedStyle(pane) : null;
    const head = document.querySelector(".mm-head");
    const hr = head ? head.getBoundingClientRect() : null;
    const sr = st ? st.getBoundingClientRect() : null;
    const fr = frames[focus.value] && frames[focus.value].getBoundingClientRect
      ? frames[focus.value].getBoundingClientRect()
      : null;
    dbgText.value = [
      `v ${DBG_TAG}`,
      `meta resizes-content=${meta && /resizes-content/.test(meta.content) ? 1 : 0}`,
      `inner=${window.innerHeight} vv=${vt}+${Math.round(vv ? vv.height : 0)} scale=${vv ? vv.scale : "-"}`,
      `scrollY=${sy} maxScroll=${dbgMaxScroll} maxVvTop=${dbgMaxTop}`,
      `lockH=${lockH.value} baseH=${baseH} stageSize=${stageSize.w}x${stageSize.h}`,
      `page=${r ? Math.round(r.top) : "-"}/${r ? Math.round(r.height) : "-"} stage=${sr ? `${Math.round(sr.top)}/${Math.round(sr.height)}` : "-"}`,
      `head=${hr ? `${Math.round(hr.top)}/${Math.round(hr.height)}` : "-"} paneRect=${pr ? `${Math.round(pr.left)},${Math.round(pr.top)} ${Math.round(pr.width)}x${Math.round(pr.height)}` : "-"}`,
      /* offsetTop 不吃 transform，也不吃可视视口平移：和 rect.top 对不上就是被变换/平移推走的 */
      pane
        ? `paneOff=${pane.offsetTop}/${pane.offsetLeft} inline="${pane.style.cssText}"`
        : "pane -",
      pcs ? `paneCS top=${pcs.top} pos=${pcs.position} tf=${pcs.transform}` : "",
      `f=${fr ? `${Math.round(fr.top)}/${Math.round(fr.height)}` : "-"}`,
      dbgFrame(focus.value),
      /* 往上走 5 层，把每层的 class / transform / rect.top 打出来：
         top 是算出来的（≥8）、offsetTop 是布局值、rect.top 是最终位置，三者对不上就出在这一层 */
      ...dbgChain(pane),
    ].join("\n");
  };
  tick();
  dbgTimer = window.setInterval(tick, 300);
  window.addEventListener("resize", tick);
}

/* ---------- 账号 ----------
   账号清单取自 gameTokens（账号的唯一真相），不是 bin_file_list（那只是「启动过」的缓存）。
   ★ 共享角色（`shared: true`，别人授权给我的）不列出来：多开是同源多 iframe 同时在线，
     每个窗格都要独立连同一个 ws 并广播输入，共享角色同连会与授权方互相顶号，
     而且它不是「我的账号」，不该出现在多开的选择器里（用户明确要求）。
   选完账号再按「打开游戏」那条路现场准备 BIN：IndexedDB 取原始 bin → 转 lx →
   写 localStorage['bin_data_<id>']，游戏侧 game-bridge-local.js 只认这个键。 */
const accounts = computed(() =>
  (gameTokens.value || [])
    .filter((t) => !t.shared)
    .map((t) => ({
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
/* 顶栏槽位名固定两个字，多的变省略号：4 个 chip + 视图切换 + ⋮ 要挤在一行里，
   名字一长（"小号甲"、"测试账号"）就会把右边的按钮顶出屏幕。
   用 Array.from 按码点切，避免把 emoji / 生僻字劈成半个。 */
const chipName = (i) => {
  const s = slots[i];
  if (!s || !s.binId) return "空";
  const cps = Array.from(slotName(i));
  return cps.length > 2 ? cps.slice(0, 2).join("") + "…" : cps.join("");
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
  topMenu.value = false; // 顶栏那个下拉收起来，别和窗格抽屉叠着
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
    /* 只有「小窗分格」时才真的转发。两种情况下必须关：
       · 全屏：这一窗铺满屏幕，操作本来就是专心玩这个号；
       · 大窗：各窗叠在同一个盒子上、非当前窗只是 opacity:0 —— 用户**看不见**别的号，
         却把点击同步过去，就是背着人在别的号上乱点，极易造成损失。
       开关本身仍可切换（记的是偏好），切回小窗立刻生效。 */
    enabled: syncOn.value && fullOn.value < 0 && view.value === "multi",
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
      persist();
    }
    /* 未命中 ⇒ 什么都不做。
     * 早期这里有一句 `slots[0] = { binId: qid, name: qid }`，等于「URL 上写什么就开什么」：
     * 共享角色本来由 `accounts` 的 !shared 过滤挡在门外（多开不允许用别人的号），
     * 这个分支正好把过滤整个绕过去。现在落进这里的只剩「持久化里残留的已删除 / 已撤销
     * 角色」—— 忽略即可，窗格留空让用户自己选。 */
  }
  window.addEventListener("keydown", onKeyDown);
  /* 真全屏可能被系统手势 / 返回键 / Esc（浏览器自己处理）退出，
     fullscreenchange 是唯一可靠的通知，必须听，否则页面停在「铺满但退不出去」。 */
  document.addEventListener("fullscreenchange", onFsChange);
  /* 输入法：visualViewport 的 resize 不一定触发 window.resize（iOS 只发 scroll），
     两个都听；scroll 用来跟住「浏览器把可视视口往上平移」带来的 offsetTop 变化。 */
  window.addEventListener("resize", syncViewport);
  /* 捕获阶段接所有 scroll：.mm-page/.mm-stage/.mm-pane 被浏览器滚动时要立刻归零 */
  document.addEventListener("scroll", onInnerScroll, true);
  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener("resize", syncViewport);
    vv.addEventListener("scroll", syncViewport);
  }
  syncViewport();
  startDbg();
});

function onKeyDown(e) {
  // Esc：桌面浏览器调试时先收抽屉，和全局弹窗习惯一致
  if (e.key === "Escape") {
    if (topMenu.value) topMenu.value = false;
    else if (menuShow.value) menuShow.value = false;
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
  if (dbgTimer) window.clearInterval(dbgTimer);
  document.removeEventListener("fullscreenchange", onFsChange);
  // 全屏状态下离开页面：先退全屏，否则下一个路由会卡在「无地址栏」的窗口里
  exitFs();
  ro && ro.disconnect();
  if (rafId) window.clearTimeout(rafId);
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("resize", syncViewport);
  document.removeEventListener("scroll", onInnerScroll, true);
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
    /* 实际生效状态：大窗 / 全屏时即使开着开关也不转发 */
    syncActive: syncOn.value && fullOn.value < 0 && view.value === "multi",
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
  /* ★★ 必须是 clip，不能只有 hidden：hidden 只是「不许滚动条出现」，它照样是个
     滚动容器 —— 键盘弹出时浏览器会顺着祖先链找能滚的容器去露出 iframe 里的输入框，
     于是把整个 .mm-page 滚上去（实测 401px：页面 rect 还是 y=0，舞台却跑到 y=-356，
     顶部 chip 被推出屏幕、底下露出一片背景色），而且收键盘后不滚回来。
     clip = 裁切 + 不是滚动容器，浏览器无从滚起。旧内核不认 clip 时退回 hidden，
     再由 onInnerScroll 把被滚的位置归零。 */
  overflow: hidden;
  overflow: clip;
  overscroll-behavior: none;
  background: var(--m-bg);
  color: var(--m-text);
  font-size: 13px;
}

/* PC 上收成「手机壳」宽度：这页刻意不套 .mobile-shell（真机上要铺满整屏），
   可桌面窗口里铺满 1800px 会把顶栏 chips、底部抽屉全拉成一条线。
   宽度对齐 --m-shell-w（body.m-mobile 在 ≥760px 时 = 430px，与 .mobile-shell 同一基准），
   左右描边也照着壳来。
   ★ 用 margin-left 居中，不用 transform：transform 会把 position:fixed 的后代
     （.mm-pop-mask / .mm-dbg）的包含块换成本元素，位置跟着页面而非视口。 */
@media (min-width: 760px) {
  .mm-page {
    left: 50%;
    right: auto;
    width: var(--m-shell-w, 430px);
    margin-left: calc(var(--m-shell-w, 430px) / -2);
    border-left: 1px solid var(--m-border);
    border-right: 1px solid var(--m-border);
  }
}

/* ---------- ① 顶栏 ---------- */
.mm-bar {
  position: relative;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 5px;
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
  /* 允许收缩：430 宽下 4 个 chip + 视图切换 + ⋮ 正好放下（名字是「2 字 + …」）；
     390 宽下差三十几像素，靠这里压掉一点名字宽度，而不是把第 4 个 chip 挤出屏幕 */
  flex: 0 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 6px;
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
  width: 14px;
  height: 14px;
  border-radius: var(--m-r-sm);
  background: var(--m-band);
  color: var(--m-text3);
  font-size: 10px;
  font-style: normal;
  line-height: 14px;
  text-align: center;
}
/* 名字固定两个字宽；空间不够时由 CSS 再收一点（JS 已经切到 2 字 + …，这里只兜底） */
.mm-chip-n {
  flex: 0 1 auto;
  min-width: 0;
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

/* ---------- ② 顶栏右侧：视图切换 / ⋮ / 协同下拉 ----------
 * 原来「大窗小窗 + 开数 + 协同」占了一整条控制栏；开数固定 4 之后整条都不要了，
 * 剩下的三样挤回顶栏一行：4 个 2 字 chip + 视图切换 + ⋮ 在 430 逻辑宽下刚好放得下。 */
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
  padding: 0 7px;
  white-space: nowrap;
  cursor: pointer;
}
.mm-seg > button.on {
  background: var(--m-primary);
  color: var(--m-on-primary);
  font-weight: 500;
}
.mm-bar-more {
  flex: none;
  width: 28px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--m-border);
  border-radius: var(--m-r-md);
  background: var(--m-card);
  color: var(--m-text2);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.mm-bar-more.on {
  border-color: var(--m-primary);
  background: var(--m-primary-soft);
  color: var(--m-primary-deep);
}
/* 下拉：贴在顶栏右下角，点外面关掉。mask 用 fixed 才能盖住整个页面 */
.mm-pop-mask {
  position: fixed;
  inset: 0;
  z-index: 30;
}
.mm-pop {
  position: absolute;
  top: calc(100% + 6px);
  right: 8px;
  z-index: 31;
  width: 190px;
  padding: 10px 12px;
  border: 1px solid var(--m-band);
  border-radius: var(--m-r-lg);
  background: var(--m-card);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
}
.mm-pop-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.mm-pop-t {
  font-size: 13px;
  color: var(--m-text) !important;
}
.mm-pop-hint {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--m-text3) !important;
}
/* 大窗模式下协同不生效：这句要用警示色，不能和普通说明一个灰 */
.mm-pop-hint.is-warn {
  color: var(--m-orange, #d46b08) !important;
}
/* 纯开关（没有文字标签了）：38×22 的胶囊 + 16px 滑块 */
.mm-sync {
  position: relative;
  flex: none;
  width: 38px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--m-border);
  border-radius: 999px;
  background: var(--m-band);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.mm-sync.on {
  border-color: var(--m-primary);
  background: var(--m-primary);
}
.mm-sync .mm-k {
  position: absolute;
  left: 2px;
  top: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s;
}
.mm-sync.on .mm-k {
  transform: translateX(16px);
}

/* ---------- ③ 舞台 / 窗格 ---------- */
.mm-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  overflow: clip; /* 同上：舞台也是祖先链上的一站，不许被浏览器滚 */
}
.mm-pane {
  position: absolute;
  display: flex;
  flex-direction: column;
  /* 这里保持 hidden（不用 clip）：clip 按 padding box 裁，圆角会被切成直角。
     窗格里 iframe 是 100% 铺满的，本来就没有可滚的溢出，真被滚了由 onInnerScroll 归零。 */
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
 * 顶栏整条摘掉（display:none），舞台自然占满 .mm-page；.mm-page 是
 * position:fixed; inset:0，高度就是「真正看得见的高度」（iOS 地址栏 / 手势条都已经扣掉），
 * 不读 screen.height 也不会踩 100vh 的坑。窗格仍是 stage 内的 px 绝对定位，只是 rect 换成整个舞台。
 * ★ 全屏时连窗格标题栏也摘掉（配 headH 返回 0），iframe 从 y=0 铺到屏幕底。
 * ★ 别改成把窗格 position:fixed：fixed 相对视口，iOS 上会按布局视口算（含地址栏），底部会被顶出去。 */
.mm-page.is-full .mm-bar {
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

/* 窄屏（≤359px）：顶栏更紧，chip 与视图切换各收一档，别把 ⋮ 挤出去 */
@media (max-width: 359px) {
  .mm-bar {
    gap: 4px;
    padding-left: 6px;
    padding-right: 6px;
  }
  .mm-slots {
    gap: 4px;
  }
  .mm-chip {
    gap: 4px;
    padding: 0 6px;
    font-size: 11px;
  }
  .mm-seg > button {
    padding: 0 6px;
    font-size: 11px;
  }
  .mm-bar-more {
    width: 26px;
  }
}

/* ---------- 键盘开着时：抽屉贴到键盘上沿 ----------
 * .mm-page 在键盘期间被摆到「可视视口」上（见 script 的 pageStyle），
 * 页面底边就是键盘上沿 ⇒ 抽屉照旧 bottom:0 就贴在键盘上，不需要任何偏移量。
 * 这里只把抽屉的高度上限收一收，别让它把整个可视区占满（留 12px 露出一点游戏）。 */
.mm-page.is-ime :deep(.m-sheet.on) {
  max-height: calc(100% - 12px);
}

/* ---------- 没打开的抽屉：靠「藏」而不是靠「挪」 ----------
 * mobile.css 里未打开的抽屉是 translateY(105%)，也就是往屏幕外挪自己高度的 105%，
 * 留出的余量只有 5%（一个 185px 高的短抽屉 ⇒ 9px）。键盘弹出时抽屉还会被整体抬高，
 * 而 105% 是抽屉自己的比例、跟抬高量没关系：抽屉比抬高量矮就落不下去 = 自己浮出来
 * （用户截图里「点游戏输入框，第 N 窗菜单自己冒出来」）。
 * 所以未打开的抽屉直接 visibility:hidden —— 抽屉不参与协同的命中测试（multiSync 只认窗格），
 * 隐藏它是安全的。延迟 0.32s 生效是为了保留关闭时那段下滑动画。 */
.mm-page :deep(.m-sheet:not(.on)) {
  visibility: hidden;
  transition: transform 0.32s cubic-bezier(0.2, 0.9, 0.3, 1), visibility 0s linear 0.32s;
}
.mm-page :deep(.m-sheet.on) {
  visibility: visible;
  transition: transform 0.32s cubic-bezier(0.2, 0.9, 0.3, 1), visibility 0s linear 0s;
}

/* 键盘几何自检浮层（?vvdbg=1）：不吃点击，只负责把读数画出来。
   用 absolute 而不是 fixed：PC 上页面只占手机壳那一条，fixed 会跑到窗口最左边去。 */
.mm-dbg {
  position: absolute;
  top: 56px;
  left: 6px;
  z-index: 60;
  margin: 0;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.72);
  color: #7cff8a;
  font: 10px/1.35 ui-monospace, Menlo, monospace;
  white-space: pre;
  overflow: hidden;
  max-width: calc(100vw - 12px);
  pointer-events: none;
}
</style>
