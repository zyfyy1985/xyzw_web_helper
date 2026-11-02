<template>
  <n-config-provider :theme-overrides="dashboardOverrides">
    <n-modal
      :show="show"
      @update:show="(v) => emit('update:show', v)"
      preset="card"
      title="内置脚本"
      style="width: 26rem; max-width: 92vw"
      size="small"
      :bordered="false"
    >
      <template #header-extra>
        <span class="opened-badge">
          已开启 {{ checkedIds.length }} / {{ scriptList.length }}
        </span>
      </template>

      <div class="script-list">
        <div
          v-for="f in scriptList"
          :key="f.id"
          class="script-item"
          :class="{ checked: checkedIds.includes(f.id) }"
          @click="toggle(f.id)"
        >
          <div class="script-info">
            <div class="script-name-row">
              <span class="script-name">{{ f.name }}</span>
              <span v-if="f.version" class="script-ver">v{{ f.version }}</span>
            </div>
            <div class="script-desc">{{ f.description || f.id }}</div>
          </div>
          <n-checkbox
            :checked="checkedIds.includes(f.id)"
            @click.stop
            @update:checked="toggle(f.id)"
          />
        </div>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <n-button size="large" @click="emit('update:show', false)">
            取消
          </n-button>
          <n-button type="primary" size="large" @click="onStart">
            启动 H5
          </n-button>
        </div>
      </template>
    </n-modal>
  </n-config-provider>
</template>

<script setup>
import { ref, watch } from "vue";
import { selectedTokenId } from "@/stores/tokenStore";
import {
  FEATURE_SCRIPTS,
  fetchFeatureScripts,
  getEnabledFeatures,
  pruneEnabledFeatures,
  setEnabledFeatures,
} from "@/utils/featureScripts";

const props = defineProps({
  show: { type: Boolean, default: false },
});
const emit = defineEmits(["update:show", "start"]);

/* themeOverrides 会被 Naive 在 JS 里二次计算（派生 hover/pressed/soft），塞 var() 算不出来，
   只能给字面色值。所以每次打开时从 documentElement 读一次当前生效的 --m-primary*：
   主题换肤换的是 CSS 变量，写死 #0057d2 会让这个弹窗在别的皮肤下还是蓝的。 */
const readVar = (name, fallback) =>
  (getComputedStyle(document.documentElement).getPropertyValue(name) || "").trim() || fallback;
const buildOverrides = () => {
  const primary = readVar("--m-primary", "#0057d2");
  const deep = readVar("--m-primary-deep", "#0040b0");
  return {
    common: {
      primaryColor: primary,
      primaryColorHover: deep,
      primaryColorPressed: deep,
      primaryColorSuppl: deep,
    },
  };
};
// 与移动端行动色一致（取代 naive 默认的绿色）
const dashboardOverrides = ref(buildOverrides());

const checkedIds = ref([]);
// 脚本清单：优先线上（tokenid 命中白名单才含受限脚本），失败自动回退本地
const scriptList = ref(FEATURE_SCRIPTS.slice());

// 每次打开时拉取线上清单 → 清掉已失效的勾选 → 恢复剩余勾选
watch(
  () => props.show,
  async (v) => {
    if (!v) return;
    /* 打开这一刻重算一次主色：皮肤可能在页面里刚被换过（本弹窗是懒渲染的，setup 只跑一次） */
    dashboardOverrides.value = buildOverrides();
    checkedIds.value = getEnabledFeatures(
      scriptList.value.map((f) => f.id),
      selectedTokenId.value
    );
    const list = await fetchFeatureScripts(selectedTokenId.value);
    scriptList.value = list;
    const ids = list.map((f) => f.id);
    // 勾选过但已不在清单里的脚本（如 tokenid 失效后受限脚本被剔除）→ 取消勾选
    pruneEnabledFeatures(ids, selectedTokenId.value);
    checkedIds.value = getEnabledFeatures(ids, selectedTokenId.value);
  },
  { immediate: true }
);

const toggle = (id) => {
  const i = checkedIds.value.indexOf(id);
  if (i >= 0) checkedIds.value.splice(i, 1);
  else checkedIds.value.push(id);
};

// 启动：写入勾选记录，再由父页面执行原有的打开游戏逻辑
const onStart = () => {
  setEnabledFeatures([...checkedIds.value], selectedTokenId.value);
  emit("update:show", false);
  emit("start", [...checkedIds.value]);
};
</script>

<style scoped>
.opened-badge {
  font-size: 12px;
  color: var(--primary-color);
  background: rgba(102, 126, 234, 0.1);
  border: 1px solid rgba(102, 126, 234, 0.35);
  border-radius: var(--m-r-lg);
  padding: 2px 10px;
  white-space: nowrap;
}

.script-list {
  max-height: 56vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md, 16px);
  padding-right: 2px;
}

.script-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md, 16px);
  padding: 12px 14px;
  border:1px solid var(--border-light, var(--m-border));
  border-radius: var(--border-radius-large, 12px);
  background:var(--bg-primary, var(--m-card));

  cursor: pointer;
  transition: all var(--transition-normal, 0.3s ease);
}

.script-item:hover {

  transform: translateY(-2px);
}

.script-item.checked {
  border-color: rgba(102, 126, 234, 0.5);
  background: rgba(102, 126, 234, 0.05);
}

.script-info {
  flex: 1;
  min-width: 0;
}

.script-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm, 8px);
}

.script-name {
  font-size: 14px;
  font-weight: 600;
  color:var(--text-primary, var(--m-text2));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.script-ver {
  flex-shrink: 0;
  font-size: 11px;
  color:var(--text-tertiary, var(--m-text3));
  background:var(--bg-secondary, var(--m-bg));
  border:1px solid var(--border-light, var(--m-border));
  border-radius: var(--m-r-lg);
  padding: 1px 8px;
}

.script-desc {
  margin-top: 2px;
  font-size: 12px;
  color:var(--text-secondary, var(--m-text3));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dialog-footer {
  display: flex;
  gap: 12px;
}

.dialog-footer .n-button {
  flex: 1;
}
</style>
