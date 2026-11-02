<template>
  <div class="m-card" ref="exportDom">
    <div class="m-card-h">
      <span class="m-t">俱乐部怪异塔信息</span>
      <span class="m-acts" v-if="!isExporting">
        <button class="m-act" :disabled="loading" @click="fetchWeirdTowerInfo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
          刷新
        </button>
        <button class="m-act m-act-i" :disabled="loading || !memberScores.length" @click="handleExport">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="m21 15-4.5-4.5L7 20"/></svg>
          导出图片
        </button>
      </span>
    </div>

    <p v-if="loading" class="m-hint" style="text-align: center; padding: 20px 0">正在加载怪异塔数据…</p>
    <template v-else-if="memberScores.length">
      <!-- 表头（对齐旧版四列：序号 / 头像 / 成员 / 层数） -->
      <div class="m-thead m-thead-w">
        <span class="m-th">序号</span>
        <span class="m-th m-th-c">头像</span>
        <span class="m-th">成员</span>
        <span class="m-th m-th-r">层数</span>
      </div>
      <div class="m-wrow" v-for="(row, i) in memberScores" :key="row.roleId">
        <span class="m-widx">{{ i + 1 }}</span>
        <span class="m-ib m-mava" :style="{ background: wtAvatarBg(row) }">
          <img v-if="row.headImg" :src="row.headImg" alt="" @error="onImgError" />
          <span v-else>{{ (row.name || "?").charAt(0) }}</span>
        </span>
        <span class="m-body">
          <span class="m-nm">{{ row.name || `ID ${row.roleId}` }}</span>
          <!-- 没有名字时上面已经显示 ID，这里不再重复（旧版两行都是 ID） -->
          <span v-if="row.name" class="m-ds">ID: {{ row.roleId }}</span>
        </span>
        <span class="m-floor">{{ row.towerCountconvert || "0-0" }}</span>
      </div>
    </template>
    <div v-else class="m-empty" style="padding: 30px 0">
      <div class="m-logo">🗼</div>
      <h3>暂无数据</h3>
      <p>点右上角「刷新」拉取俱乐部怪异塔数据</p>
    </div>
  </div>
</template>

<script setup>
/* ============================================================
 * 俱乐部怪异塔信息（移动端）
 * 数据逻辑照抄 src/components/Club/ClubWeirdTowerInfo.vue：
 *   · 命令 evotower_getlegionjoinmembers（10s 超时）
 *   · 与 gameData.legionInfo.info.members 合并补名字头像
 *   · handleEvotower 层数转换（towerId → 章-层）
 *   · 排序：爬塔数降序，相同按战力降序
 *   · 导出文件名：${gettoday()}日俱乐部怪异塔数据.png
 * 仅展示形式改为移动端。
 * ============================================================ */
import { onMounted, ref } from "vue";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import { gettoday } from "@/utils/clubWarrankUtils";
import { exportDomAsImage } from "@/mobile/utils/exportImage";

const message = useMessage();
const tokenStore = useTokenStore();

const loading = ref(false);
const memberScores = ref([]);
const exportDom = ref(null);
const isExporting = ref(false);

/* 头像底色（展示辅助，按 roleId 稳定散列） */
const wtAvatarBg = (row) => {
  const seed = Number(row.roleId || 0);
  const h = seed % 360;
  return `linear-gradient(135deg, hsl(${h}, 62%, 62%), hsl(${(h + 40) % 360}, 62%, 48%))`;
};

/* 头像加载失败回退官方图标（照抄旧版 NAvatar fallbackSrc） */
const onImgError = (e) => {
  e.target.src = "/icons/xiaoyugan.png";
};

/* ---------- 怪异塔层数转换（照抄 handleEvotower） ---------- */
const handleEvotower = (towerId) => {
  if (towerId === 0) {
    return "1-1";
  } else {
    // 每章10层，0-9为第1章，10-19为第2章，以此类推
    const chapter = Math.floor(towerId / 10) + 1;
    const floor = (towerId % 10) + 1;
    return `${chapter}-${floor}`;
  }
};

/* ---------- 获取爬塔数据（照抄 fetchWeirdTowerInfo） ---------- */
const fetchWeirdTowerInfo = async () => {
  if (!tokenStore.selectedToken) {
    message.warning("请先选择游戏角色");
    return;
  }

  const tokenId = tokenStore.selectedToken.id;

  const wsStatus = tokenStore.getWebSocketStatus(tokenId);
  if (wsStatus !== "connected") {
    message.error("WebSocket未连接，无法查询爬塔数据");
    return;
  }

  loading.value = true;

  try {
    const result = await tokenStore.sendMessageWithPromise(
      tokenId,
      "evotower_getlegionjoinmembers",
      {},
      10000,
    );

    // 获取所有俱乐部成员
    const clubMembers = tokenStore.gameData?.legionInfo?.info?.members || {};
    const allMembers = Object.values(clubMembers);

    let members = [];

    // 转换数据格式
    const participantMap = new Map();
    if (result && result.memberScores) {
      Object.entries(result.memberScores).forEach(([roleId, towerCount]) => {
        participantMap.set(parseInt(roleId), towerCount);
      });
    }

    if (allMembers.length > 0) {
      // 合并数据：优先使用俱乐部成员列表
      members = allMembers.map((member) => {
        const towerCount = participantMap.get(member.roleId) || 0;
        return {
          roleId: member.roleId,
          name: member.name,
          headImg: member.headImg,
          towerCount: towerCount,
          towerCountconvert: handleEvotower(towerCount),
          power: member.power,
        };
      });
    } else if (result && result.memberScores) {
      // 没有俱乐部成员信息（异常情况）：至少显示ID和层数
      members = Object.entries(result.memberScores).map(([roleId, towerCount]) => ({
        roleId: parseInt(roleId),
        towerCount: towerCount,
        towerCountconvert: handleEvotower(towerCount),
        /* 兜底分支没有成员名：留空，模板对空名显示一次「ID xxxx」即可
           （旧版这里塞 `ID:${roleId}`，导致名字位 + ID 位各显示一遍） */
        name: "",
        headImg: "",
        power: 0,
      }));
    }

    // 按爬塔数量从高到低排序，层数相同按战力
    members.sort((a, b) => {
      if (b.towerCount !== a.towerCount) {
        return b.towerCount - a.towerCount;
      }
      return (b.power || 0) - (a.power || 0);
    });

    memberScores.value = members;

    if (members.length > 0) {
      message.success("怪异塔数据加载成功，已按怪异塔数量从高到低排序");
    } else {
      message.warning("未查询到数据");
    }
  } catch (error) {
    console.error("查询怪异塔数据失败:", error);
    message.error(`查询失败: ${error.message}`);
    memberScores.value = [];
  } finally {
    loading.value = false;
  }
};

/* ---------- 导出图片（照抄 handleExport/exportToImage，文件名规则一致） ---------- */
const handleExport = async () => {
  if (!memberScores.value) {
    message.warning("没有可导出的数据");
    return;
  }

  let loadingMsg = null;
  try {
    isExporting.value = true;
    loadingMsg = message.loading("正在生成图片，请稍候...", { duration: 0 });
    await exportDomAsImage(exportDom.value, exportFilename());
    message.success("导出成功");
  } catch (error) {
    console.error("导出失败:", error);
    message.error("导出失败，请重试");
  } finally {
    loadingMsg?.destroy?.();
    isExporting.value = false;
  }
};

const exportFilename = () => {
  const dateStr = gettoday();
  return dateStr.replace("/", "年").replace("/", "月") + "日俱乐部怪异塔数据.png";
};

/* ---------- Inline 行为：挂载即拉取（照抄旧组件 onMounted inline） ---------- */
onMounted(() => {
  fetchWeirdTowerInfo();
});
</script>

<script>
export default { name: "MobileWeirdTowerPanel" };
</script>
