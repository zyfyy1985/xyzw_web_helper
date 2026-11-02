<template>
  <div class="m-pane" ref="exportDom">
    <!-- 功能条（照抄旧版 function-section：样式 radio + 日期 + 刷新 + 导出） -->
    <div class="m-card">
      <div class="m-card-h">
        <span class="m-vs-row">
          <img src="/icons/1733492491706152.png" alt="蟠桃图标" style="width: 22px; height: 22px" />
          <span class="m-t">蟠桃园战绩<small class="m-hint" style="display: block; font-weight: 400">查看蟠桃园对战详细数据</small></span>
        </span>
        <span class="m-acts" v-if="!isExporting">
          <button class="m-act" :disabled="loading" @click="fetchBattleRecords">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
            刷新
          </button>
          <button class="m-act m-act-i" :disabled="!battleRecords || loading" @click="handleExport">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="m21 15-4.5-4.5L7 20"/></svg>
            导出
          </button>
        </span>
      </div>
      <!-- 样式固定为旧版样式二（用户要求：去掉三档切换） -->
      <button class="m-dtag" @click="calOpen = true">{{ queryDate }}</button>
      <p class="m-hint" style="margin: 8px 0 0">仅周日可查；K/D = 击杀 / 复活；成员明细按击杀降序</p>
    </div>

    <p v-if="loading" class="m-hint" style="text-align: center; padding: 18px 0">正在加载战绩数据…</p>

    <template v-else-if="battleRecords && battleRecords.ownClub && battleRecords.opponentClub">
      <!-- 对战头部（照抄旧版：{date} {own} VS {opp} 蟠桃大会对战战绩） -->
      <div class="m-card">
        <div class="m-card-h">
          <span class="m-t">{{ queryDate }} · {{ battleRecords.ownClub.name }} VS {{ battleRecords.opponentClub.name }}</span>
          <span class="m-more">蟠桃大会对战战绩</span>
        </div>
        <div class="m-vs">
          <div class="m-vs-c">
            <div class="m-vs-row">
              <span class="m-clogo m-clogo-s">
                <img v-if="battleRecords.ownClub.logo" :src="battleRecords.ownClub.logo" alt="" />
                <span v-else>{{ (battleRecords.ownClub.name || "?").charAt(0) }}</span>
              </span>
              <span class="m-vs-nm">{{ battleRecords.ownClub.name }}</span>
            </div>
            <div class="m-vs-id">ID: {{ battleRecords.ownClub.id }} · {{ battleRecords.ownClub.serverId }}服</div>
            <div class="m-vs-st">{{ battleRecords.ownClub.memberCount }}人 | {{ battleRecords.ownClub.quenchNum }}红 | 总战力 {{ formatPower(battleRecords.ownClub.totalPower) }}</div>
          </div>
          <div class="m-vs-badge">VS</div>
          <div class="m-vs-c">
            <div class="m-vs-row">
              <span class="m-clogo m-clogo-s">
                <img v-if="battleRecords.opponentClub.logo" :src="battleRecords.opponentClub.logo" alt="" />
                <span v-else>{{ (battleRecords.opponentClub.name || "?").charAt(0) }}</span>
              </span>
              <span class="m-vs-nm">{{ battleRecords.opponentClub.name }}</span>
            </div>
            <div class="m-vs-id">ID: {{ battleRecords.opponentClub.id }} · {{ battleRecords.opponentClub.serverId }}服</div>
            <div class="m-vs-st">{{ battleRecords.opponentClub.memberCount }}人 | {{ battleRecords.opponentClub.quenchNum }}红 | 总战力 {{ formatPower(battleRecords.opponentClub.totalPower) }}</div>
          </div>
        </div>
      </div>

      <!-- 我方 / 敌方 tab（照抄旧版移动端 br-side-tabs） -->
      <div class="m-seg">
        <button :class="{ on: recordSide === 'own' }" @click="recordSide = 'own'">我方战绩</button>
        <button :class="{ on: recordSide === 'opponent' }" @click="recordSide = 'opponent'">敌方战绩</button>
      </div>

      <!-- 有俱乐部但该侧无参战记录（旧版此处整片空白，无任何提示） -->
      <div v-if="!hasSideData" class="m-card">
        <div class="m-empty" style="padding: 24px 0">
          <div class="m-logo">🍑</div>
          <h3>{{ recordSide === "own" ? "我方" : "敌方" }}无参战记录</h3>
          <p>{{ sideClub?.name || "该俱乐部" }} 当日无成员出战，可切换另一侧或更换日期</p>
        </div>
      </div>

      <template v-else>
      <!-- 战报头 + 数字带（版式照「盐场周报」：抬头 + 右上参战胶囊 + 一行六格数字带）
           原来这里是一张卡里摆 5 个 m-stat 小块，再跟 4 张独立的 TOP3 卡；
           用户 11-02 要求「敌我双方战绩都改成跟盐场周战绩中的周报风格一致」，
           于是整体换成周报那套：抬头 → 六格数字带 → 2 列 × N 榜的小榜卡。 -->
      <div class="m-card">
        <div class="m-rhead">
          <span class="m-rhead-main">
            <span class="m-rhead-t">{{ recordSide === "own" ? "我方" : "敌方" }} · {{ sideClub.name }}</span>
            <span class="m-rhead-d">{{ queryDate }} 蟠桃大会</span>
          </span>
          <span class="m-rpill">参战 {{ sideClub.memberCount || 0 }} 人</span>
        </div>
        <div class="m-rstat">
          <div class="m-rstat-c"><span class="m-rstat-k">总击杀</span><span class="m-rstat-v is-kill">{{ sideClub.totalKills || 0 }}</span></div>
          <div class="m-rstat-c"><span class="m-rstat-k">总复活</span><span class="m-rstat-v is-revive">{{ sideClub.totalRevives || 0 }}</span></div>
          <div class="m-rstat-c"><span class="m-rstat-k">总 K/D</span><span class="m-rstat-v is-kd">{{ sideClub.totalKD || 0 }}</span></div>
          <div class="m-rstat-c"><span class="m-rstat-k">总战力</span><span class="m-rstat-v">{{ formatPower(sideClub.totalPower) }}</span></div>
          <div class="m-rstat-c"><span class="m-rstat-k">人均击杀</span><span class="m-rstat-v is-kill">{{ avgKills }}</span></div>
          <div class="m-rstat-c"><span class="m-rstat-k">参战</span><span class="m-rstat-v">{{ sideClub.memberCount || 0 }} 人</span></div>
        </div>
      </div>

      <!-- 榜单：2 列 × 2 行（击杀 / K/D / 复活 / 连杀），与周报的六榜小卡同一结构 -->
      <div class="m-card">
        <div class="m-card-h"><span class="m-t">榜单</span><span class="m-more">各榜前 3</span></div>
        <div class="m-rk-grid">
          <div class="m-rk-card" v-for="b in sideBoards" :key="b.t">
            <div class="m-rk-t">{{ b.t }}</div>
            <div class="m-rk-row" v-for="(p, ti) in b.rows" :key="ti">
              <span class="m-rk-no" :class="'n' + (ti + 1)">{{ ti + 1 }}</span>
              <img
                v-if="p.roleInfo?.headImg"
                :src="p.roleInfo.headImg"
                class="m-rk-ava"
                alt=""
                @error="onImgError"
              />
              <span v-else class="m-rk-ava m-rk-ava--ph">{{ (p.roleInfo?.name || "?").charAt(0) }}</span>
              <span class="m-rk-nm">{{ p.roleInfo?.name || "未知" }}</span>
              <span class="m-rk-v">{{ b.val(p) }}</span>
            </div>
            <div v-if="!b.rows.length" class="m-rk-empty">暂无</div>
          </div>
        </div>
      </div>

      <!-- 成员明细：表格版，与「盐场周报」的成员明细同一套版式
           （7 列固定宽、数值右对齐、前三名次加粗）。
           原来这里是卡片流（每人一张卡 + 5 个数值格），用户 11-02 要求
           「这个战绩的列表跟盐场周报的列表保持一个风格」，故换成周报那张表。 -->
      <div class="m-card">
        <div class="m-card-h">
          <span class="m-t">{{ recordSide === "own" ? "我方" : "敌方" }}成员明细</span>
          <span class="m-more">按击杀降序</span>
        </div>
        <div class="m-rtable">
          <div class="m-rthead">
            <span>排名</span><span>成员</span><span>击杀</span><span>连杀</span><span>抢船</span><span>复活</span><span>K/D</span>
          </div>
          <div class="m-rtr" v-for="(p, i) in sideClub.godRank" :key="'g' + (p.roleInfo?.roleId ?? i)">
            <span class="m-rtd-no" :class="i < 3 ? 'n' + (i + 1) : ''">{{ i + 1 }}</span>
            <span class="m-rtd-nm">
              <img v-if="p.roleInfo?.headImg" :src="p.roleInfo.headImg" class="m-rk-ava" alt="" @error="onImgError" />
              <span v-else class="m-rk-ava m-rk-ava--ph">{{ (p.roleInfo?.name || "?").charAt(0) }}</span>
              <span class="m-rk-nm">{{ p.roleInfo?.name || "未知" }}</span>
            </span>
            <span class="m-rtd-v is-kill">{{ p.killCnt || 0 }}</span>
            <span class="m-rtd-v">{{ p.mCKCnt || 0 }}</span>
            <span class="m-rtd-v is-occupy">{{ p.carCnt || 0 }}</span>
            <span class="m-rtd-v is-revive">{{ p.reviveCnt || 0 }}</span>
            <span class="m-rtd-v is-kd">{{ p.kd }}</span>
          </div>
        </div>
      </div>
      </template>
    </template>

    <div v-else-if="!loading" class="m-card">
      <div class="m-empty" style="padding: 30px 0">
        <div class="m-logo">🍑</div>
        <h3>暂无战绩数据</h3>
        <p>点右上角「刷新」拉取所选周日的对战战绩</p>
      </div>
    </div>

    <!-- 周日历抽屉：与盐场 / 蟠桃园信息共用 components/DateCalendarSheet.vue -->
    <DateCalendarSheet
      v-model:show="calOpen"
      :date="queryDate"
      :weekdays="[0]"
      disable-future
      @select="selectDate"
    />
  </div>
</template>

<script setup>
/* ============================================================
 * 蟠桃园战绩（移动端）
 * 数据逻辑照抄 src/components/Club/PeachBattleRecords.vue：
 *   · 命令 legion_getpayloadtask / legion_getpayloadrecord
 *          legion_getinfobyid ×2 / legion_getpayloadkillrecord
 *   · K/D = killCnt / reviveCnt（复活作分母，照抄）
 *   · 5 榜单：killRank / kdRank / reviveRank / killStreakRank / godRank
 *   · formatPower 为 toFixed(2)（与蟠桃园信息面板的 toFixed(1) 不同，照抄）
 *   · 导出文件名：${date}日蟠桃园战报.png
 * 仅展示形式改为移动端。
 * ============================================================ */
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import { exportDomAsImage } from "@/mobile/utils/exportImage";
import DateCalendarSheet from "../components/DateCalendarSheet.vue";

const message = useMessage();
const tokenStore = useTokenStore();

/* ---------- 日期助手（照抄 PeachBattleRecords） ---------- */
const getLastSunday = () => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const hour = today.getHours();
  let daysToSubtract = 0;
  if (dayOfWeek === 0) {
    daysToSubtract = hour < 18 ? 7 : 0;
  } else {
    daysToSubtract = dayOfWeek;
  }
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() - daysToSubtract);
  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth() + 1).padStart(2, "0");
  const d = String(targetDate.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
};

const formatPower = (power) => {
  if (!power) return "0";
  if (power >= 100000000) return (power / 100000000).toFixed(2) + "亿";
  if (power >= 10000) return (power / 10000).toFixed(2) + "万";
  return power.toString();
};

const formatDateToShort = (dateStr) => {
  if (!dateStr) return "";
  const parts = String(dateStr).split("/");
  if (parts.length !== 3) return String(dateStr);
  const [year, month, day] = parts;
  return year.slice(2) + month + day;
};

/* ---------- 状态（照抄） ---------- */
const exportDom = ref(null);
const isExporting = ref(false);
const loading = ref(false);
const battleRecords = ref(null);
const queryDate = ref(getLastSunday());
const recordSide = ref("own");
/* 周日历抽屉开关：抽成 DateCalendarSheet 后由面板自己持有（2026-10-31 补回，之前漏声明导致点日期无反应） */
const calOpen = ref(false);


const selectDate = (value) => {
  calOpen.value = false;
  fetchBattleRecordsByDate(value);
};

/* ---------- 数据拉取（照抄 fetchBattleRecords） ---------- */
const fetchBattleRecordsByDate = (val) => {
  if (val !== undefined && val !== null) {
    queryDate.value = val;
  } else {
    queryDate.value = getLastSunday();
  }
  fetchBattleRecords();
};

const fetchBattleRecords = async () => {
  if (!tokenStore.selectedToken) {
    message.warning("请先选择游戏角色");
    return;
  }
  const tokenId = tokenStore.selectedToken.id;
  const wsStatus = tokenStore.getWebSocketStatus(tokenId);
  if (wsStatus !== "connected") {
    message.error("WebSocket未连接，无法查询战绩");
    return;
  }
  loading.value = true;
  try {
    const payloadTaskRes = await tokenStore.sendMessageWithPromise(tokenId, "legion_getpayloadtask", {}, 10000);
    if (!payloadTaskRes) {
      message.error("未获取到对战俱乐部");
      return;
    }
    const firstLegionId = payloadTaskRes.firstLegionId;
    const payloadrecord = await tokenStore.sendMessageWithPromise(tokenId, "legion_getpayloadrecord", {}, 10000);
    if (!payloadrecord) {
      message.error("未获取到对战俱乐部");
      return;
    }
    const shortDate = formatDateToShort(queryDate.value);
    if (!payloadrecord.enemyLegionMap || !payloadrecord.enemyLegionMap[shortDate]) {
      message.warning(`未找到日期 ${queryDate.value} 的对战记录`);
      battleRecords.value = null;
      return;
    }
    const secondLegionId = payloadrecord.enemyLegionMap[shortDate].id;
    if (!firstLegionId || !secondLegionId) {
      message.error("未获取到对战俱乐部ID");
      return;
    }
    const firstLegionIdInfo = await tokenStore.sendMessageWithPromise(
      tokenId,
      "legion_getinfobyid",
      { legionId: firstLegionId },
      10000,
    );
    const secondLegionIdInfo = await tokenStore.sendMessageWithPromise(
      tokenId,
      "legion_getinfobyid",
      { legionId: secondLegionId },
      10000,
    );
    const result = await tokenStore.sendMessageWithPromise(
      tokenId,
      "legion_getpayloadkillrecord",
      { date: formatDateToShort(queryDate.value) },
      10000,
    );
    if (!result) {
      message.error("未获取到对战俱乐部战绩");
      return;
    }

    const ownRecords =
      result.recordsMap && result.recordsMap[Number(firstLegionId)]
        ? [...result.recordsMap[Number(firstLegionId)]]
        : [];
    const opponentRecords =
      result.recordsMap && result.recordsMap[Number(secondLegionId)]
        ? [...result.recordsMap[Number(secondLegionId)]]
        : [];

    const calculateKD = (player) => {
      const killCnt = player.killCnt || 0;
      const reviveCnt = player.reviveCnt || 0;
      return reviveCnt > 0 ? parseFloat((killCnt / reviveCnt).toFixed(2)) : 0;
    };

    const processedOwnRecords = ownRecords.map((player) => ({ ...player, kd: calculateKD(player) }));
    const processedOpponentRecords = opponentRecords.map((player) => ({ ...player, kd: calculateKD(player) }));

    const ownKillRank = [...processedOwnRecords].sort((a, b) => (b.killCnt || 0) - (a.killCnt || 0));
    const ownKdRank = [...processedOwnRecords].sort((a, b) => b.kd - a.kd);
    const ownReviveRank = [...processedOwnRecords].sort((a, b) => (b.reviveCnt || 0) - (a.reviveCnt || 0));
    const ownKillStreakRank = [...processedOwnRecords].sort((a, b) => (b.mCKCnt || 0) - (a.mCKCnt || 0));
    const ownGodRank = [...processedOwnRecords].sort((a, b) => (b.killCnt || 0) - (a.killCnt || 0));

    const opponentKillRank = [...processedOpponentRecords].sort((a, b) => (b.killCnt || 0) - (a.killCnt || 0));
    const opponentKdRank = [...processedOpponentRecords].sort((a, b) => b.kd - a.kd);
    const opponentReviveRank = [...processedOpponentRecords].sort((a, b) => (b.reviveCnt || 0) - (a.reviveCnt || 0));
    const opponentKillStreakRank = [...processedOpponentRecords].sort((a, b) => (b.mCKCnt || 0) - (a.mCKCnt || 0));
    const opponentGodRank = [...processedOpponentRecords].sort((a, b) => (b.killCnt || 0) - (a.killCnt || 0));

    const ownTotalKills = processedOwnRecords.reduce((sum, p) => sum + (p.killCnt || 0), 0);
    const ownTotalRevives = processedOwnRecords.reduce((sum, p) => sum + (p.reviveCnt || 0), 0);
    const ownTotalKD = ownTotalRevives > 0 ? parseFloat((ownTotalKills / ownTotalRevives).toFixed(2)) : 0;
    const ownTotalPower = processedOwnRecords.reduce((sum, p) => sum + (p.roleInfo?.power || 0), 0);

    const opponentTotalKills = processedOpponentRecords.reduce((sum, p) => sum + (p.killCnt || 0), 0);
    const opponentTotalRevives = processedOpponentRecords.reduce((sum, p) => sum + (p.reviveCnt || 0), 0);
    const opponentTotalKD = opponentTotalRevives > 0 ? parseFloat((opponentTotalKills / opponentTotalRevives).toFixed(2)) : 0;
    const opponentTotalPower = processedOpponentRecords.reduce((sum, p) => sum + (p.roleInfo?.power || 0), 0);

    battleRecords.value = {
      ownClub: {
        id: firstLegionId,
        name: firstLegionIdInfo?.legionData?.name || "我方俱乐部",
        level: firstLegionIdInfo?.legionData?.level || 0,
        power: firstLegionIdInfo?.legionData?.power || 0,
        serverId: firstLegionIdInfo?.legionData?.serverId || "",
        logo: firstLegionIdInfo?.legionData?.logo || "",
        quenchNum: firstLegionIdInfo?.legionData?.quenchNum || 0,
        announcement: firstLegionIdInfo?.legionData?.announcement || "",
        memberCount: processedOwnRecords.length,
        totalPower: ownTotalPower,
        totalKills: ownTotalKills,
        totalRevives: ownTotalRevives,
        totalKD: ownTotalKD,
        killRank: ownKillRank,
        kdRank: ownKdRank,
        reviveRank: ownReviveRank,
        killStreakRank: ownKillStreakRank,
        godRank: ownGodRank,
      },
      opponentClub: {
        id: secondLegionId,
        name: secondLegionIdInfo?.legionData?.name || "敌方俱乐部",
        level: secondLegionIdInfo?.legionData?.level || 0,
        power: secondLegionIdInfo?.legionData?.power || 0,
        serverId: secondLegionIdInfo?.legionData?.serverId || "",
        logo: secondLegionIdInfo?.legionData?.logo || "",
        quenchNum: secondLegionIdInfo?.legionData?.quenchNum || 0,
        announcement: secondLegionIdInfo?.legionData?.announcement || "",
        memberCount: processedOpponentRecords.length,
        totalPower: opponentTotalPower,
        totalKills: opponentTotalKills,
        totalRevives: opponentTotalRevives,
        totalKD: opponentTotalKD,
        killRank: opponentKillRank,
        kdRank: opponentKdRank,
        reviveRank: opponentReviveRank,
        killStreakRank: opponentKillStreakRank,
        godRank: opponentGodRank,
      },
    };

    message.success("战绩加载成功");
  } catch (error) {
    console.error("查询战绩失败:", error);
    message.error(`查询失败: ${error.message}`);
    battleRecords.value = null;
  } finally {
    loading.value = false;
  }
};

/* ---------- 导出（文件名照抄：${date}日蟠桃园战报.png） ---------- */
const handleExport = async () => {
  if (!battleRecords.value) {
    message.warning("没有可导出的数据");
    return;
  }
  let loadingMsg = null;
  try {
    isExporting.value = true;
    loadingMsg = message.loading("正在生成图片，请稍候...", { duration: 0 });
    await nextTick();
    const filename = `${String(queryDate.value).replace("/", "年").replace("/", "月")}日蟠桃园战报.png`;
    /* ★ flatten：这一页和蟠桃园信息一样，内容比一屏长、又挂在 .m-scroll 这个滚动容器里。
       不摊平时 html2canvas 按「滚动祖先的可视区」裁剪，中间的成员卡会整段留白、
       末尾只画出半张（用户 11-02 在蟠桃园信息上遇到的就是这个）。
       与切磋结果导出（DuelBlock）走同一条路：克隆体摊平到屏外容器再画。 */
    await exportDomAsImage(exportDom.value, filename, { flatten: true });
    message.success("导出成功");
  } catch (error) {
    console.error("导出失败:", error);
    message.error("导出失败，请重试");
  } finally {
    loadingMsg?.destroy?.();
    isExporting.value = false;
  }
};

/* ---------- 展示辅助 ---------- */
const sideClub = computed(() =>
  recordSide.value === "own" ? battleRecords.value?.ownClub : battleRecords.value?.opponentClub,
);
/* 该侧是否有参战记录（旧版无此判断，空榜单会整片空白） */
const hasSideData = computed(() => {
  const c = sideClub.value;
  if (!c) return false;
  return (c.memberCount || 0) > 0 || (c.killRank?.length || 0) > 0;
});
/* 样式说明已写死在模板（样式固定为二） */
/* 人均击杀（照抄旧版：totalKills/memberCount.toFixed(1)） */
const avgKills = computed(() => {
  const c = sideClub.value;
  if (!c || !c.memberCount) return "0";
  return ((c.totalKills || 0) / c.memberCount).toFixed(1);
});
/* 四个榜的前 3：结构统一成「标题 + 取数函数」，模板里一张小榜卡循环出来。
   取数只读 sideClub 上已有的排序数组（fetchBattleRecords 已经排好序），不再另算一份。 */
const sideBoards = computed(() => {
  const c = sideClub.value;
  if (!c) return [];
  return [
    { t: "击杀榜", rows: (c.killRank || []).slice(0, 3), val: (p) => p.killCnt || 0 },
    { t: "K/D 榜", rows: (c.kdRank || []).slice(0, 3), val: (p) => p.kd },
    { t: "复活榜", rows: (c.reviveRank || []).slice(0, 3), val: (p) => p.reviveCnt || 0 },
    { t: "连杀榜", rows: (c.killStreakRank || []).slice(0, 3), val: (p) => p.mCKCnt || 0 },
  ];
});
const onImgError = (e) => {
  e.target.style.display = "none";
};

/* 父级切回本子页时重新查询（等价旧版 v-if 重挂载） */
defineExpose({ refresh: () => fetchBattleRecords() });

/* ---------- 挂载即拉取（照抄 onMounted） ---------- */
onMounted(() => {
  fetchBattleRecords();
});
</script>

<script>
export default { name: "MobilePeachBattlePanel" };
</script>

<style scoped>
/* ============================================================
 * 战报版式（.m-rhead / .m-rstat / .m-rk-*）
 * 与「盐场周报」（SaltPanel）同一套视觉，用户 11-02 要求敌我两侧都照它改。
 * ★ 这里是**逐条抄过来的一份**，不是全局类：SaltPanel 那份写在它自己的 scoped 里，
 *   两页互不影响。改动时两处一起改，取值不要各自发挥 —— 粗心改了单边，两页翻着看就不一样了。
 *   配色仍走站内变量：击杀红 / 复活绿 / K/D 主色，浅底 --m-bg，格间线 --m-border。
 * ============================================================ */
.m-rhead { display: flex; align-items: center; gap: 10px; }
.m-rhead-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.m-rhead-t {
  font-size: 16px; font-weight: 700; color: var(--m-text); line-height: 1.3;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.m-rhead-d { font-size: 11px; color: var(--m-text3); font-variant-numeric: tabular-nums; }
.m-rpill {
  flex: none; height: 24px; padding: 0 10px; border-radius: 999px;
  display: inline-flex; align-items: center;
  font-size: 11px; font-weight: 700; color: var(--m-primary); background: var(--m-primary-soft);
}

/* 数字带：六格一行，格间一条竖线（整块 band 底，不再卡套卡） */
.m-rstat {
  display: grid; grid-template-columns: repeat(6, minmax(0, 1fr));
  margin-top: 12px; border-radius: var(--m-r-md); background: var(--m-bg); overflow: hidden;
}
.m-rstat-c { padding: 9px 2px; text-align: center; min-width: 0; border-left: 1px solid var(--m-border); }
.m-rstat-c:first-child { border-left: none; }
.m-rstat-k {
  display: block; font-size: 10px; line-height: 1.3; color: var(--m-text3);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.m-rstat-v {
  display: block; margin-top: 3px; font-size: 16px; font-weight: 700; line-height: 1.15;
  color: var(--m-text); font-variant-numeric: tabular-nums;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.m-rstat-v.is-kill { color: var(--m-red); }
.m-rstat-v.is-revive { color: var(--m-green); }
.m-rstat-v.is-kd { color: var(--m-primary); }

/* 榜单：2 列 × 2 行小卡，卡内 band 底、无边框 */
.m-rk-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.m-rk-card { background: var(--m-bg); border-radius: var(--m-r-md); padding: 8px 9px; min-width: 0; }
.m-rk-t { font-size: 11px; font-weight: 700; color: var(--m-text3); margin-bottom: 5px; }
.m-rk-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; min-width: 0; }
.m-rk-no {
  flex: none; width: 14px; text-align: center;
  font-size: 11.5px; font-weight: 800; color: var(--m-text3);
  font-variant-numeric: tabular-nums;
}
/* 名次 1/2/3 = 金银铜，跟周报一致（暗色下 !important，别被 App.vue 的 *{color:#fff} 刷白） */
.m-rk-no.n1 { color: #b8860b; }
.m-rk-no.n2 { color: #6b7d8d; }
.m-rk-no.n3 { color: #a9714b; }
html[data-theme="dark"] .m-rk-no.n1 { color: #ffd77a !important; }
html[data-theme="dark"] .m-rk-no.n2 { color: #c9d6e5 !important; }
html[data-theme="dark"] .m-rk-no.n3 { color: #e5b083 !important; }
.m-rk-ava {
  flex: none; width: 18px; height: 18px; border-radius: 5px;
  object-fit: cover; background: var(--m-card);
}
.m-rk-ava--ph {
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 700; color: var(--m-primary); background: var(--m-card);
}
.m-rk-nm {
  flex: 1; min-width: 0; font-size: 11.5px; color: var(--m-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.m-rk-v { flex: none; font-size: 12px; font-weight: 700; color: var(--m-primary); font-variant-numeric: tabular-nums; }
.m-rk-empty { padding: 6px 0; font-size: 11.5px; color: var(--m-text3); }

/* ============================================================
 * 成员明细表（.m-rtable / .m-rthead / .m-rtr / .m-rtd-*）
 * 同样是从 SaltPanel 的周报表逐条抄来的一份（列宽、行距、配色一模一样），
 * 只多了一条 .is-occupy（抢船琥珀色，本页沿用它原来的语义色）。
 * ★ 两边改一处要一起改，列宽别各自发挥 —— 否则两页翻着看会错位。
 * ============================================================ */
.m-rtable { margin-top: 2px; }
.m-rthead,
.m-rtr {
  display: grid;
  /* 排名 / 成员 / 击杀 / 连杀 / 抢船 / 复活 / K/D —— 与周报同为 7 列 */
  grid-template-columns: 30px minmax(0, 1fr) 30px 30px 30px 40px 38px;
  align-items: center; gap: 4px;
}
.m-rthead {
  padding: 6px 4px; margin-bottom: 2px; border-radius: var(--m-r-sm);
  background: var(--m-bg);
  font-size: 10.5px; font-weight: 700; color: var(--m-text3);
}
.m-rthead span { text-align: right; }
.m-rthead span:nth-child(1),
.m-rthead span:nth-child(2) { text-align: left; }
.m-rtr {
  padding: 7px 4px;
  border-bottom: 1px solid var(--m-band);
}
.m-rtr:last-child { border-bottom: none; }
.m-rtd-no { font-size: 11px; color: var(--m-text3); font-variant-numeric: tabular-nums; }
.m-rtd-no.n1,
.m-rtd-no.n2,
.m-rtd-no.n3 { font-weight: 700; }
.m-rtd-nm { display: flex; align-items: center; gap: 5px; min-width: 0; }
.m-rtd-v {
  text-align: right; font-size: 12px; font-weight: 700; color: var(--m-text);
  font-variant-numeric: tabular-nums;
}
.m-rtd-v.is-kill { color: var(--m-red); }
.m-rtd-v.is-occupy { color: var(--m-amber); }
.m-rtd-v.is-revive { color: var(--m-green); }
.m-rtd-v.is-kd { color: var(--m-primary); }

@media (max-width: 359px) {
  .m-rthead,
  .m-rtr { grid-template-columns: 26px minmax(0, 1fr) 28px 28px 28px 34px 34px; }
  .m-rk-nm { font-size: 11px; }
}

.m-dtag {
  border: 1px solid var(--m-blue);
  background: var(--m-blue-soft);
  color: var(--m-blue);
  font-size: 13px;
  font-weight: 700;
  border-radius: var(--m-r-sm);
  padding: 7px 16px;
  font-family: inherit;
  letter-spacing: 0;
}
.m-vs { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center; }
.m-vs-c { min-width: 0; }
.m-vs-row { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; min-width: 0; }
.m-clogo-s { width: 26px; height: 26px; border-radius: 8px; flex: none; }
.m-clogo-s img { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; }
.m-vs-nm { font-size: 13px; font-weight: 700; color: var(--m-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-vs-id { font-size: 10.5px; color: var(--m-text3); font-weight: 700; }
.m-vs-st { font-size: 11px; color: var(--m-text2); font-weight: 700; margin-top: 2px; }
.m-vs-badge {
  width: 34px; height: 34px; border-radius: var(--m-r-md); flex: none;
  display: flex; align-items: center; justify-content: center;
  font-size: 11.5px; font-weight: 700; color:var(--m-on-primary);
  background: var(--m-primary);
}
</style>
