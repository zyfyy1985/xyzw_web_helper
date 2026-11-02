<template>
  <!-- 分组管理：底部抽屉。账号选择器（TokenPicker）标题行右侧的「管理分组」就是开这个。
       跟 TokenPicker 一样全站只有一份实现 —— 批量任务那份是写在页面里的，等它迁移过来就统一。
       版式照 DESIGN.md：白卡面 + band 分区 + 唯一行动蓝，控件 8px 圆角、无药丸、无阴影。
       定位用 fixed：这一层可能挂在 .m-scroll 里（会被 overflow 裁掉），fixed 不受影响；
       桌面端 .mobile-shell 有 transform ⇒ fixed 的包含块自动变成那条 430px 的壳，左右也不会跑到屏幕外。 -->
  <div class="gm-mask" :class="{ on: show }" @click="close" />
  <div class="gm-sheet" :class="{ on: show }" role="dialog" aria-label="分组管理">
    <div class="gm-grab" />
    <div class="gm-title">分组管理</div>
    <div class="gm-sub">分组只用来快速勾选账号，删分组不会删掉账号本身。</div>

    <div class="gm-body">
      <!-- ── 新建 ── -->
      <section class="gm-sec">
        <div class="gm-sec-t">新建分组</div>
        <input
          v-model="newName"
          class="gm-input"
          type="text"
          maxlength="12"
          autocomplete="off"
          placeholder="分组名称（最多 12 字）"
          @keyup.enter="createGroup"
        />
        <div class="gm-swatches">
          <button
            v-for="c in COLORS"
            :key="c"
            type="button"
            class="gm-swatch"
            :class="{ on: newColor === c }"
            :style="{ background: c }"
            :aria-label="`颜色 ${c}`"
            @click="newColor = c"
          />
        </div>

        <div class="gm-acc">
          <div class="gm-acc-h">
            <span class="gm-acc-t">包含账号</span>
            <span class="gm-acc-n">{{ picked.length }} / {{ tokens.length }}</span>
            <button type="button" class="gm-mini" @click="toggleAll('new')">
              {{ allPicked ? "取消全选" : "全选" }}
            </button>
          </div>
          <div class="gm-list">
            <label v-for="t in tokens" :key="t.id" class="gm-row">
              <input
                type="checkbox"
                class="gm-cb"
                :checked="picked.includes(t.id)"
                @change="togglePick('new', t.id, $event.target.checked)"
              />
              <span class="gm-nm">{{ t.name || t.id }}</span>
            </label>
            <div v-if="!tokens.length" class="gm-empty">还没有账号</div>
          </div>
        </div>

        <button type="button" class="gm-pb" @click="createGroup">创建分组</button>
      </section>

      <!-- ── 已有分组 ── -->
      <section class="gm-sec">
        <div class="gm-sec-t">
          已有分组<span v-if="groups.length" class="gm-sec-n">{{ groups.length }}</span>
        </div>

        <div v-if="!groups.length" class="gm-empty">还没有分组，上面新建一个</div>

        <div v-for="g in groups" :key="g.id" class="gm-group">
          <template v-if="editingId === g.id">
            <input
              v-model="editName"
              class="gm-input"
              type="text"
              maxlength="12"
              autocomplete="off"
              placeholder="分组名称"
            />
            <div class="gm-swatches">
              <button
                v-for="c in COLORS"
                :key="c"
                type="button"
                class="gm-swatch"
                :class="{ on: editColor === c }"
                :style="{ background: c }"
                :aria-label="`颜色 ${c}`"
                @click="editColor = c"
              />
            </div>
            <div class="gm-acc">
              <div class="gm-acc-h">
                <span class="gm-acc-t">组内账号</span>
                <span class="gm-acc-n">{{ editPicked.length }} / {{ tokens.length }}</span>
              </div>
              <div class="gm-list">
                <label v-for="t in tokens" :key="t.id" class="gm-row">
                  <input
                    type="checkbox"
                    class="gm-cb"
                    :checked="editPicked.includes(t.id)"
                    @change="togglePick('edit', t.id, $event.target.checked)"
                  />
                  <span class="gm-nm">{{ t.name || t.id }}</span>
                </label>
              </div>
            </div>
            <div class="gm-acts">
              <button type="button" class="gm-ob" @click="cancelEdit">取消</button>
              <button type="button" class="gm-pb gm-pb--sm" @click="saveEdit">保存</button>
            </div>
          </template>

          <template v-else>
            <div class="gm-line">
              <span class="gm-dot" :style="{ background: g.color }" />
              <span class="gm-gname">{{ g.name }}</span>
              <span class="gm-gcount">{{ countOf(g) }} 个</span>
              <button type="button" class="gm-mini" @click="startEdit(g)">编辑</button>
              <button type="button" class="gm-mini gm-mini--danger" @click="removeGroup(g)">
                删除
              </button>
            </div>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useMessage, useDialog } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import { confirmDanger } from "@/mobile/utils/confirm";

/* 调色板：与批量任务的分组色一致（第 1 支是行动蓝，新建默认） */
const COLORS = [
  "#0057d2",
  "#067647",
  "#b54708",
  "#b42318",
  "#022879",
  "#13c2c2",
  "#eb2f96",
  "#fa8c16",
];

const props = defineProps({
  show: { type: Boolean, default: false },
  /** 可选成员 = 账号数组（[{ id, name }]） */
  tokens: { type: Array, default: () => [] },
});
const emit = defineEmits(["update:show"]);

const message = useMessage();
const dialog = useDialog();
const tokenStore = useTokenStore();

const groups = computed(() => tokenStore.tokenGroups || []);

const newName = ref("");
const newColor = ref(COLORS[0]);
const picked = ref([]);

const editingId = ref(null);
const editName = ref("");
const editColor = ref(COLORS[0]);
const editPicked = ref([]);

const allPicked = computed(
  () => props.tokens.length > 0 && picked.value.length >= props.tokens.length,
);

/* 每次打开都回到「新建」初始态，不用上次残留的名字 */
watch(
  () => props.show,
  (on) => {
    if (!on) return;
    newName.value = "";
    newColor.value = COLORS[0];
    picked.value = [];
    editingId.value = null;
  },
);

const close = () => emit("update:show", false);

const countOf = (group) => (group.tokenIds || []).filter((id) => props.tokens.some((t) => t.id === id)).length;

function togglePick(scope, tokenId, checked) {
  const list = scope === "edit" ? editPicked : picked;
  if (checked) {
    if (!list.value.includes(tokenId)) list.value = [...list.value, tokenId];
  } else {
    list.value = list.value.filter((id) => id !== tokenId);
  }
}

function toggleAll(scope) {
  const list = scope === "edit" ? editPicked : picked;
  if (scope === "new" && allPicked.value) {
    picked.value = [];
    return;
  }
  list.value = props.tokens.map((t) => t.id);
}

function createGroup() {
  const name = newName.value.trim();
  if (!name) {
    message.warning("请输入分组名称");
    return;
  }
  const group = tokenStore.createTokenGroup(name, newColor.value);
  picked.value.forEach((tokenId) => tokenStore.addTokenToGroup(group.id, tokenId));
  message.success(`分组「${name}」已创建`);
  newName.value = "";
  newColor.value = COLORS[0];
  picked.value = [];
}

function startEdit(group) {
  editingId.value = group.id;
  editName.value = group.name;
  editColor.value = group.color || COLORS[0];
  editPicked.value = [...(group.tokenIds || [])];
}

function cancelEdit() {
  editingId.value = null;
}

function saveEdit() {
  const group = groups.value.find((g) => g.id === editingId.value);
  if (!group) return;
  const name = editName.value.trim();
  if (!name) {
    message.warning("请输入分组名称");
    return;
  }

  tokenStore.updateTokenGroup(group.id, { name, color: editColor.value });

  /* 成员按差集收口：先把新勾的加进去，再把取消勾的摘掉 —— 只更新有变化的那部分 */
  const before = new Set(group.tokenIds || []);
  const after = new Set(editPicked.value);
  editPicked.value.forEach((tokenId) => {
    if (!before.has(tokenId)) tokenStore.addTokenToGroup(group.id, tokenId);
  });
  (group.tokenIds || []).forEach((tokenId) => {
    if (!after.has(tokenId)) tokenStore.removeTokenFromGroup(group.id, tokenId);
  });

  message.success("分组已保存");
  editingId.value = null;
}

function removeGroup(group) {
  confirmDanger(dialog, {
    title: "删除分组",
    content: "组内账号不会被删除，只是从这个分组里移除。",
    details: [
      { label: "分组", value: group.name },
      { label: "组内账号", value: `${countOf(group)} 个` },
    ],
    onPositiveClick: () => {
      tokenStore.deleteTokenGroup(group.id);
      if (editingId.value === group.id) editingId.value = null;
      message.success("分组已删除");
    },
  });
}
</script>

<style scoped>
/* ---------- 遮罩 + 抽屉（fixed：见文件头说明） ---------- */
.gm-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(10, 18, 35, 0.45);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s;
}
.gm-mask.on {
  opacity: 1;
  pointer-events: auto;
}
.gm-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 61;
  display: flex;
  flex-direction: column;
  max-height: 88%;
  padding: 8px 16px calc(16px + env(safe-area-inset-bottom));
  border-radius: var(--m-r-lg) var(--m-r-lg) 0 0;
  background: var(--m-card);
  transform: translateY(102%);
  transition: transform 0.32s cubic-bezier(0.2, 0.9, 0.3, 1);
}
.gm-sheet.on {
  transform: translateY(0);
}
.gm-grab {
  flex: none;
  width: 36px;
  height: 4px;
  margin: 4px auto 12px;
  border-radius: 2px;
  background: var(--m-border);
}
.gm-title {
  flex: none;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--m-text) !important;
}
.gm-sub {
  flex: none;
  margin-top: 3px;
  margin-bottom: 12px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--m-text3) !important;
}
/* 抽屉主体：只有这一层滚，标题与说明常驻 */
.gm-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

/* ---------- 区块 ---------- */
.gm-sec {
  padding: 14px 0;
}
.gm-sec + .gm-sec {
  border-top: 1px solid var(--m-border);
}
.gm-sec-t {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
  margin-bottom: 10px;
  color: var(--m-text2) !important;
}
.gm-sec-n {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: var(--m-r-sm);
  background: var(--m-bg);
  font-size: 10.5px;
  font-weight: 500;
  color: var(--m-text3) !important;
  font-variant-numeric: tabular-nums;
}

/* ---------- 输入 / 色块 ---------- */
.gm-input {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: none;
  border-radius: var(--m-r-md);
  background: var(--m-bg);
  font-family: inherit;
  font-size: 13px;
  color: var(--m-text2) !important;
  -webkit-appearance: none;
  appearance: none;
}
.gm-input::placeholder {
  color: var(--m-text3) !important;
}
.gm-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0;
}
/* 色块不做正圆（规范里只有视频播放键是圆），4px 圆角的小方块 */
.gm-swatch {
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--m-r-sm);
  cursor: pointer;
  position: relative;
}
.gm-swatch.on {
  box-shadow: inset 0 0 0 2px var(--m-card), inset 0 0 0 4px var(--m-text);
}

/* ---------- 成员多选 ---------- */
.gm-acc {
  padding: 10px 12px;
  border-radius: var(--m-r-md);
  background: var(--m-bg);
}
.gm-acc-h {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.gm-acc-t {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--m-text2) !important;
}
.gm-acc-n {
  font-size: 11px;
  color: var(--m-text3) !important;
  font-variant-numeric: tabular-nums;
}
.gm-list {
  max-height: 168px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.gm-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  cursor: pointer;
}
.gm-cb {
  flex: none;
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--m-primary);
}
.gm-nm {
  min-width: 0;
  font-size: 12.5px;
  line-height: 1.4;
  color: var(--m-text2) !important;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gm-empty {
  padding: 12px 0;
  text-align: center;
  font-size: 12px;
  color: var(--m-text3) !important;
}

/* ---------- 分组行 ---------- */
.gm-group {
  padding: 10px 0;
  border-bottom: 1px solid var(--m-border);
}
.gm-group:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.gm-line {
  display: flex;
  align-items: center;
  gap: 8px;
}
.gm-grow {
  display: flex;
  align-items: center;
  gap: 8px;
}
.gm-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: var(--m-r-sm);
}
.gm-gname {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--m-text2) !important;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gm-gcount {
  flex: none;
  font-size: 11px;
  color: var(--m-text3) !important;
  font-variant-numeric: tabular-nums;
}
.gm-acts {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
}

/* ---------- 按钮（抽屉内基线 32 / 36） ---------- */
.gm-mini {
  flex: none;
  height: 26px;
  padding: 0 9px;
  border: none;
  border-radius: var(--m-r-sm);
  background: var(--m-bg);
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--m-text2) !important;
  cursor: pointer;
}
.gm-acc-h .gm-mini {
  /* band 底上的小按钮：同色底等于没有按钮，抬到卡片白面 */
  background: var(--m-card);
}
.gm-mini--danger {
  color: var(--m-red) !important;
  background: var(--m-red-soft);
}
.gm-pb {
  width: 100%;
  height: 36px;
  margin-top: 12px;
  border: none;
  border-radius: var(--m-r-md);
  background: var(--m-primary);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  color: var(--m-on-primary) !important;
  cursor: pointer;
}
.gm-pb--sm {
  width: auto;
  margin-top: 0;
  padding: 0 16px;
}
.gm-ob {
  flex: none;
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--m-hairline);
  border-radius: var(--m-r-md);
  background: var(--m-card);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  color: var(--m-primary-deep) !important;
  cursor: pointer;
}
html[data-theme="dark"] .gm-ob {
  color: var(--m-primary) !important;
}
.gm-group .gm-acts {
  margin-top: 10px;
}
.gm-group .gm-swatches {
  margin: 10px 0;
}
</style>
