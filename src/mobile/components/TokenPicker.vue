<template>
  <!-- 账号选择器：批量任务「账号列表」和「新增定时任务」向导第 1 步共用这一个组件。
       整块都归组件管 —— 标题、已选计数、管理分组按钮、分组快选插槽、排序、全选、账号行，
       两处只有一份实现；排序状态、齿轮打开的设置弹窗留在宿主（两边本来就有 sortConfig / openSettings）。 -->
  <div class="tk-picker">
    <div v-if="title || countText || manageLabel" class="tk-head">
      <span v-if="title" class="tk-title">{{ title }}</span>
      <div class="tk-head-right">
        <span v-if="countText" class="tk-count">{{ countText }}</span>
        <button
          v-if="manageLabel"
          type="button"
          class="tk-manage"
          @click="$emit('manage-groups')"
        >
          {{ manageLabel }}
        </button>
      </div>
    </div>

    <!-- 分组快选：两边同一套渲染（批量任务多显示每组人数和「一键清除」） -->
    <div v-if="groups.length" class="tk-groups">
      <div v-if="groupsTitle || clearGroupsLabel" class="tk-groups-head">
        <span class="tk-groups-title">{{ groupsTitle }}</span>
        <button
          v-if="clearGroupsLabel"
          type="button"
          class="tk-groups-clear"
          @click="$emit('clear-groups')"
        >
          {{ clearGroupsLabel }}
        </button>
      </div>
      <div class="tk-groups-list">
        <button
          v-for="group in groups"
          :key="group.id"
          type="button"
          class="tk-group"
          :class="{ 'is-on': groupSelectedIds.includes(group.id) }"
          :style="{ '--tk-group-color': group.color }"
          @click="$emit('toggle-group', group)"
        >
          {{ group.name
          }}<span v-if="groupCounts" class="tk-group-n">{{
            ` (${groupCounts[group.id] || 0})`
          }}</span>
        </button>
      </div>
    </div>

    <div class="tk-sort">
      <button
        v-for="opt in SORT_OPTIONS"
        :key="opt.field"
        type="button"
        class="tk-sort-btn"
        :class="{ 'is-active': sortConfig.field === opt.field }"
        @click="$emit('sort', opt.field)"
      >
        {{ opt.label
        }}<span v-if="sortConfig.field === opt.field" class="tk-sort-arrow">{{
          sortConfig.direction === "asc" ? " ↑" : " ↓"
        }}</span>
      </button>
    </div>

    <n-checkbox
      class="tk-all"
      :checked="allSelected"
      :indeterminate="partialSelected"
      @update:checked="toggleAll"
    >
      全选
    </n-checkbox>

    <!-- 限高 + 内部滚动由宿主给（向导里要保证步骤条和底部按钮始终可见） -->
    <div class="tk-list" :style="maxHeight ? { maxHeight } : undefined">
      <n-checkbox-group
        :value="modelValue"
        class="tk-grid"
        :style="{ '--tk-cols': gridCols }"
        @update:value="onUpdate"
      >
        <div v-for="token in items" :key="token.id" class="tk-row">
          <n-checkbox :value="token.id" class="tk-cb">
            {{ token.name }}
          </n-checkbox>
          <!-- 行尾状态点：只有宿主传了 statusOf 才渲染（主线推关用它显示 WebSocket 连接态） -->
          <i
            v-if="statusOf"
            class="tk-dot"
            :class="`is-${statusOf(token.id) || 'off'}`"
          />
          <button
            v-if="showSettings"
            type="button"
            class="tk-gear"
            :aria-label="`${token.name} 设置`"
            @click="$emit('open-settings', token)"
          >
            <n-icon :size="14"><Settings /></n-icon>
          </button>
        </div>
      </n-checkbox-group>
      <div v-if="items.length === 0" class="tk-empty">{{ emptyText }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { Settings } from "@vicons/ionicons5";

/* 排序项：与 TokenImport / 批量任务共用 sortConfig，字段名必须对得上 */
const SORT_OPTIONS = [
  { field: "name", label: "名称" },
  { field: "server", label: "服务器" },
  { field: "createdAt", label: "创建时间" },
  { field: "lastUsed", label: "最后使用" },
];

const props = defineProps({
  /** 区块标题（批量任务传「账号列表」，向导传「选择账号」）；空字符串则不渲染标题行 */
  title: { type: String, default: "" },
  /** 管理分组按钮文字；空字符串则按钮不渲染 */
  manageLabel: { type: String, default: "" },
  /** 头部右侧的计数文字，空字符串则不显示 */
  countText: { type: String, default: "" },
  /** 分组快选：{ id, name, color }[] */
  groups: { type: Array, default: () => [] },
  /** 已选中的分组 id */
  groupSelectedIds: { type: Array, default: () => [] },
  /** 每组账号数 { [groupId]: n }；不传则不显示括号里的数字 */
  groupCounts: { type: Object, default: null },
  /** 分组区标题（批量任务传「分组选择」，向导不传） */
  groupsTitle: { type: String, default: "" },
  /** 分组区右上角的清除按钮文字；不传则不渲染 */
  clearGroupsLabel: { type: String, default: "" },
  /** 账号数组（顺序由宿主的 sortedTokens 决定，组件不自己排） */
  items: { type: Array, default: () => [] },
  /** 已选账号 id */
  modelValue: { type: Array, default: () => [] },
  /** { field, direction } —— 只用于按钮高亮和箭头 */
  sortConfig: {
    type: Object,
    default: () => ({ field: "createdAt", direction: "asc" }),
  },
  /** 每行几个账号。手机上 3 列以上会把名字挤成竖线，所以夹在 1~2 */
  columns: { type: Number, default: 2 },
  /** 列表最大高度（如 "38vh"），不传则不限高 */
  maxHeight: { type: String, default: "" },
  emptyText: { type: String, default: "还没有账号" },
  /** 行尾齿轮：宿主没有「账号设置」可开时传 false（如主线推关），避免出现一颗点了没反应的按钮 */
  showSettings: { type: Boolean, default: true },
  /** 行尾状态点：传 (tokenId) => "ok" | "busy" | "err" | "off"；不传则不渲染那颗粒 */
  statusOf: { type: Function, default: null },
});

const emit = defineEmits([
  "update:modelValue",
  "sort",
  "open-settings",
  "manage-groups",
  "toggle-group",
  "clear-groups",
]);

const gridCols = computed(() =>
  Math.max(1, Math.min(2, Number(props.columns) || 1)),
);
const allSelected = computed(
  () =>
    props.items.length > 0 && props.modelValue.length >= props.items.length,
);
const partialSelected = computed(
  () =>
    props.modelValue.length > 0 && props.modelValue.length < props.items.length,
);

const toggleAll = (checked) => {
  emit("update:modelValue", checked ? props.items.map((t) => t.id) : []);
};
const onUpdate = (value) => emit("update:modelValue", value);
</script>

<style scoped>
.tk-picker {
  width: 100%;
  min-width: 0;
}

/* 头部：标题 + 计数 + 管理分组。
 * 尺寸全部照抄原卡片头实测值（标题 14.5/700、按钮 24px 高 / 8px 圆角 / 11.5px 字），
 * 组件内用原生 button 才能保证卡片里和弹窗里长得一模一样。 */
.tk-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.tk-title {
  min-width: 0;
  font-size: 14.5px;
  font-weight: 700;
  line-height: 20px;
  color: var(--m-text) !important;
}
.tk-head-right {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
.tk-count {
  font-size: 12px;
  line-height: 18px;
  color: var(--m-text3) !important;
  font-variant-numeric: tabular-nums;
}
.tk-manage {
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--m-r-md);
  background: var(--m-primary);
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 500;
  line-height: 24px;
  color: var(--m-on-primary) !important;
  cursor: pointer;
}
.tk-manage:active {
  background: var(--m-primary-deep);
}

/* 分组快选：带底色的一块，和账号列表之间靠 band 分区（不用边框） */
.tk-groups {
  margin-bottom: 12px;
  padding: 10px 12px;
  background: var(--m-band);
  border-radius: var(--m-r-md);
}
.tk-groups-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.tk-groups-title {
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
  color: var(--m-text2) !important;
}
.tk-groups-clear {
  flex: none;
  padding: 0;
  border: 0;
  background: none;
  font-family: inherit;
  font-size: 12.5px;
  line-height: 18px;
  color: var(--m-red) !important;
  cursor: pointer;
}
.tk-groups-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
/* 分组胶囊：未选是「描边 + 同色字」，选中是「同色实底 + 白字」—— 颜色由 --tk-group-color 传进来 */
.tk-group {
  padding: 7px 12px;
  border: 2px solid var(--tk-group-color, var(--m-border));
  border-radius: var(--m-r-md);
  background: transparent;
  font-family: inherit;
  font-size: 12.5px;
  line-height: 18px;
  color: var(--tk-group-color, var(--m-text2)) !important;
  cursor: pointer;
}
.tk-group.is-on {
  background: var(--tk-group-color);
  font-weight: 600;
  color:var(--m-on-primary) !important;
}
/* App.vue 暗色下 span 会被强制刷白，分组名后面的计数要跟着继承 */
.tk-group .tk-group-n {
  color: inherit !important;
}

/* 排序：4 等分。390 宽扣掉卡片内边距剩 ~338，每格 82px，11.5px 刚好放下「创建时间 ↑」。
 * 用原生 button 而不是 n-button：Naive 的 --n-height 由 size 决定，
 * 在 .m-desk 里还会被抬到 34px，在弹窗里又是另一个值 —— 两处对不齐。 */
.tk-sort {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
  margin-bottom: 10px;
}
.tk-sort-btn {
  min-height: 34px;
  padding: 0 2px;
  border: 1px solid var(--m-border);
  border-radius: var(--m-r-sm);
  background: var(--m-card);
  font-family: inherit;
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--m-text2);
  white-space: nowrap;
  cursor: pointer;
}
/* 「当前排序」是状态不是行动：浅蓝底 + 行动蓝字 + 1px 描边，不用实心蓝抢注意力。
 * 原生按钮 ⇒ 暗色下不会被 App.vue 那条「primary 按钮白字」规则打成隐形。 */
.tk-sort-btn.is-active {
  background: var(--m-primary-soft);
  border-color: var(--m-primary);
  color: var(--m-primary);
  font-weight: 500;
}

.tk-all {
  display: flex;
  width: 100%;
  padding: 2px 0 4px;
}

.tk-list {
  width: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.tk-grid {
  display: grid;
  grid-template-columns: repeat(var(--tk-cols, 1), minmax(0, 1fr));
  column-gap: 12px;
}
.tk-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 34px;
  padding: 3px 0;
  /* 账号行之间不画分隔线 —— 原「账号列表」就是靠间距分条，加线反而比原来多一层结构 */
}
.tk-cb {
  flex: 1 1 auto;
  min-width: 0;
}
/* 名字颜色/字号：App.vue 暗色下有一条 span{color:var(--m-on-primary)!important}，
 * 所以这里必须 !important 才压得住（否则暗色名字会变纯白）。 */
.tk-grid :deep(.n-checkbox__label) {
  font-size: 13px;
  line-height: 1.45;
  color: var(--m-text2) !important;
}
.tk-all :deep(.n-checkbox__label) {
  font-size: 12.5px;
  color: var(--m-text2) !important;
}
/* 行尾状态点：与顶栏账号头像上那颗同款（6px 方点 + 4px 圆角，规范里没有正圆）。
 * 颜色只借用语义色，不新起色相。 */
.tk-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: var(--m-r-sm);
  background: var(--m-text3);
}
.tk-dot.is-ok { background: var(--m-green); }
.tk-dot.is-busy {
  background: var(--m-amber);
  animation: tk-pulse 1.1s ease-in-out infinite;
}
.tk-dot.is-err { background: var(--m-red); }
.tk-dot.is-off { background: var(--m-border); }
@keyframes tk-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
.tk-gear {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: var(--m-r-md);
  background: transparent;
  color: var(--m-text2);
  cursor: pointer;
}
.tk-gear:active {
  background: var(--m-band);
}
.tk-empty {
  padding: 20px 0;
  text-align: center;
  font-size: 12.5px;
  line-height: 18px;
  color: var(--m-text3);
}

/* 超窄屏：2 列时每格只剩 ~123px，扣掉复选框 + 齿轮，「测试账号」这种 4 字名会折行 ⇒ 降 1 列 */
@media (max-width: 360px) {
  .tk-grid {
    grid-template-columns: 1fr;
  }
}
</style>
