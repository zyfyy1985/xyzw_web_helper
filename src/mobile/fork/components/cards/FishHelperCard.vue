<template>
  <MyCard class="helper" :statusClass="{ active: state.isRunning }">
    <template #icon>
      <img :src="iconPath" alt="普通鱼竿图标" />
    </template>
    <template #title>
      <h3>钓鱼助手</h3>
    </template>
    <template #badge>
      <span>{{ state.isRunning ? "运行中" : "已停止" }}</span>
    </template>
    <template #default>
      <div class="container">
        <div class="list">
          <div class="item" v-for="item in dataList" :key="item.type">
            <img :src="item.img" :alt="item.type" />
            <div class="box-info">
              <div class="box-type">{{ item.type }}</div>
              <div class="box-count">数量：{{ item.count }}</div>
            </div>
          </div>
        </div>
        <div class="selects">
          <n-select v-model:value="type" :options="typeOptions" />
          <n-select v-model:value="number" :options="numberOptions" />
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
        @click="handleHelper"
      >
        {{ state.isRunning ? "运行中" : "开始钓鱼" }}
      </a-button>
    </template>
  </MyCard>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, watchEffect } from "vue";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import MyCard from "../Common/MyCard.vue";

const tokenStore = useTokenStore();
const message = useMessage();

const iconPath = computed(() => {
  return import.meta.env.BASE_URL + "fish/hjyg.png";
});

const roleInfo = computed(() => tokenStore.gameData?.roleInfo || null);

const dataList = computed(() => {
  const getImgPath = (path) =>
    import.meta.env.BASE_URL + path.replace(/^\//, "");
  return [
    {
      type: "普通鱼竿",
      img: getImgPath("/fish/ptyg.png"),
      count: roleInfo.value?.role?.items?.[1011]?.quantity || 0,
    },
    {
      type: "黄金鱼竿",
      img: getImgPath("/fish/hjyg.png"),
      count: roleInfo.value?.role?.items?.[1012]?.quantity || 0,
    },
  ];
});

const type = ref(1);
const typeOptions = [
  { label: "普通鱼竿", value: 1 },
  { label: "黄金鱼竿", value: 2 },
];

const number = ref(10);
const numberOptions = [
  { label: "10", value: 10 },
  { label: "20", value: 20 },
  { label: "50", value: 50 },
  { label: "80", value: 80 },
  { label: "100", value: 100 },
  { label: "160", value: 160 },
];

const state = ref({
  isRunning: false,
});

const handleHelper = async () => {
  if (!tokenStore.selectedToken) {
    message.warning("请先选择Token");
    return;
  }
  const tokenId = tokenStore.selectedToken.id;
  state.value.isRunning = true;
  message.info("钓鱼助手运行中");
  console.log("🚀 ~ handleHelper ~ type.value:", type.value);
  if (number.value >= 10) {
    const batches = Math.floor(number.value / 10);
    const remainder = number.value % 10;
    for (let i = 0; i < batches; i++) {
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        "artifact_lottery",
        { type: type.value, lotteryNumber: 10, newFree: true },
      );
    }
    if (remainder > 0) {
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        "artifact_lottery",
        {
          type: type.value,
          lotteryNumber: remainder,
          newFree: true,
        },
      );
    }
    await tokenStore.sendMessage(tokenId, "role_getroleinfo");
    // 更新活动进度
    tokenStore.sendMessage(tokenId, "activity_get");
    message.success("钓鱼完毕");
    state.value.isRunning = false;
    return;
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
