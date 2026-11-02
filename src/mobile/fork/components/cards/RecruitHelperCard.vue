<template>
  <MyCard class="helper" :statusClass="{ active: state.isRunning }">
    <template #icon>
      <img :src="iconPath" alt="招募图标" />
    </template>
    <template #title>
      <h3>招募助手</h3>
    </template>
    <template #badge>
      <span>{{ state.isRunning ? "运行中" : "已停止" }}</span>
    </template>
    <template #default>
      <div class="container">
        <div class="list">
          <div
            class="item"
            v-for="item in dataList"
            :key="item.type"
            :data-testid="`recruit-count-${item.itemId}`"
          >
            <img :src="item.img" :alt="item.type" />
            <div class="box-info">
              <div class="box-type">{{ item.type }}</div>
              <div class="box-count">数量：{{ item.count }}</div>
            </div>
          </div>
        </div>
        <div class="selects">
          <n-select
            v-model:value="number"
            :options="numberOptions"
            :disabled="state.isRunning"
            data-testid="recruit-number-select"
          />
        </div>
      </div>
    </template>
    <template #action>
      <a-button
        type="primary"
        :disabled="state.isRunning"
        secondary
        size="small"
        block
        data-testid="recruit-start-button"
        @click="handleHelper"
      >
        {{ state.isRunning ? "运行中" : "开始招募" }}
      </a-button>
    </template>
  </MyCard>
</template>

<script setup>
import { ref, computed } from "vue";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import {
  HELPER_BATCH_DELAY_MS,
  HELPER_COMMAND_TIMEOUT_MS,
  getErrorMessage,
  runInventoryVerifiedGameCommand,
} from "@/utils/helperTaskRunner";
import MyCard from "../Common/MyCard.vue";

const tokenStore = useTokenStore();
const message = useMessage();

const iconPath = computed(() => import.meta.env.BASE_URL + "icons/zml.png");

const roleInfo = computed(() => tokenStore.gameData?.roleInfo || null);

const dataList = computed(() => {
  const getImgPath = (path) =>
    import.meta.env.BASE_URL + path.replace(/^\//, "");
  return [
    {
      type: "招募令",
      itemId: 1001,
      img: getImgPath("/icons/zml.png"),
      count: roleInfo.value?.role?.items?.[1001]?.quantity || 0,
    },
  ];
});

const number = ref(10);
const numberOptions = [
  { label: "10", value: 10 },
  { label: "50", value: 50 },
  { label: "100", value: 100 },
  { label: "200", value: 200 },
  { label: "400", value: 400 },
];

const state = ref({
  isRunning: false,
});

const handleHelper = async () => {
  if (state.value.isRunning) {
    return;
  }

  if (!tokenStore.selectedToken) {
    message.warning("请先选择Token");
    return;
  }
  const tokenId = tokenStore.selectedToken.id;
  const selectedNumber = number.value;

  state.value.isRunning = true;
  message.info("招募助手运行中");

  try {
    await runInventoryVerifiedGameCommand({
      tokenStore,
      tokenId,
      cmd: "hero_recruit",
      itemId: 1001,
      total: selectedNumber,
      timeout: HELPER_COMMAND_TIMEOUT_MS,
      delayMs: HELPER_BATCH_DELAY_MS,
      createParams: (amount) => ({ recruitType: 1, recruitNumber: amount }),
      queryInventory: () => tokenStore.sendGetRoleInfo(tokenId),
    });

    await tokenStore.sendMessage(tokenId, "role_getroleinfo");
    // 更新活动进度
    tokenStore.sendMessage(tokenId, "activity_get");
    message.success("招募完毕");
  } catch (error) {
    message.error(`招募失败：${getErrorMessage(error)}`);
  } finally {
    state.value.isRunning = false;
  }
};
</script>

<style scoped lang="scss">
/* 工具卡内容区（移动端）
   设计口径对齐站内卡片：卡内分区用 band 灰块，不上边框、不做卡片套卡片；
   数值用 tabular-nums，名称让位给数量（11.5 vs 12 + 700）。 */
.container {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0;
}

/* 库存格：等宽列，列数由 item 数量决定（宝箱 4、钓鱼 2、招募 1） */
.list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
  gap: 8px;
}

.item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 9px 4px 8px;
  border-radius: var(--m-r-md);
  background: var(--m-bg);
  min-width: 0;

  > img {
    width: 34px;
    height: 34px;
    object-fit: contain;
  }
}

.box-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  width: 100%;
  min-width: 0;
}

/* ★ 只有一个道具时（招募令）不要跟着 grid 拉成整条宽带再居中——
   那样会变成「一大块灰底中间飘着一个小图标」。改成横排左对齐，
   和宝箱卡的「总积分条」同一口径：图标在左、名称与数量在右。 */
.item:only-child {
  flex-direction: row;
  justify-content: flex-start;
  gap: 10px;
  padding: 11px 12px;

  .box-info {
    align-items: flex-start;
    width: auto;
  }

  .box-count {
    font-size: 13px;
  }
}

.box-type {
  max-width: 100%;
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.3;
  color: var(--m-text2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.box-count {
  font-size: 12px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--m-text);
  font-variant-numeric: tabular-nums;
}

/* 选择行：两个控件等宽平分 */
.selects {
  display: flex;
  align-items: center;
  gap: 8px;

  > * {
    flex: 1 1 0;
    min-width: 0;
  }
}
</style>
