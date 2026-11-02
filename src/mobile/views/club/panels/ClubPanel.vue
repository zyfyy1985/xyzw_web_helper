<template>
  <div class="m-pane">
    <!-- 未加入俱乐部 -->
    <div v-if="!club" class="m-card">
      <div class="m-empty">
        <div class="m-logo">🛡️</div>
        <h3>{{ info ? "尚未加入任何俱乐部" : "尚未获取俱乐部信息" }}</h3>
        <p>{{ info ? "加入俱乐部后可查看成员、战绩与盐场匹配信息" : "进入页面会自动拉取；长时间为空请点下方刷新" }}</p>
        <button class="m-btn m-btn-p" @click="refreshClub">刷新俱乐部信息</button>
      </div>
    </div>

    <!-- 俱乐部信息 -->
    <template v-else>
      <!-- 二级分段：概览 / 成员 / 历史战绩 / 怪异塔信息 -->
      <div class="m-seg">
        <button
          v-for="s in subs"
          :key="s.key"
          :class="{ on: sub === s.key }"
          @click="sub = s.key"
        >
          {{ s.label }}
        </button>
      </div>

      <!-- 俱乐部信息（概览：身份行 + 签到 + 四项统计并成一张卡） -->
      <div class="m-card" v-show="sub === 'overview'">
        <div class="m-card-h m-head-id">
          <span class="m-clogo">
            <img v-if="club.logo" :src="club.logo" alt="" @error="onImgError" />
            <span v-else>{{ (club.name || "?").charAt(0) }}</span>
          </span>
          <span class="m-cinfo">
            <span class="m-cnm">{{ club.name || "我的俱乐部" }}</span>
            <span class="m-cmeta">
              <span class="m-cmeta-i">ID {{ club.id ?? "-" }}</span>
              <span v-if="club.serverId" class="m-cmeta-i">服务器 {{ club.serverId - 27 }}</span>
              <span class="m-cmeta-i">成员 {{ memberCount }}</span>
            </span>
          </span>
          <span class="m-cacts">
            <button class="m-link" @click="refreshClub">刷新</button>
            <button
              class="m-pill"
              :class="{ done: legionSignedIn }"
              :disabled="legionSignedIn"
              @click="signInLegion"
            >
              {{ legionSignedIn ? "已签到" : "签到" }}
            </button>
          </span>
        </div>
        <!-- 统计数据（对齐旧版 n-statistic 四项，不多不少）：四宫格共用一块底，内部分隔线 -->
        <div class="m-stats m-stats--flat">
          <div class="m-stat">
            <span class="m-stat-k">战力</span>
            <span class="m-stat-v">{{ fmtPower(overview.power) }}</span>
          </div>
          <div class="m-stat">
            <span class="m-stat-k">红淬</span>
            <span class="m-stat-v" style="color: var(--m-red)">{{ overview.redQuench }}</span>
          </div>
          <div class="m-stat">
            <span class="m-stat-k">当前 Boss</span>
            <span class="m-stat-v">{{ overview.currentBossId ?? 0 }}</span>
          </div>
          <div class="m-stat">
            <span class="m-stat-k">Boss 剩余血量</span>
            <span class="m-stat-v">{{ overview.currentHP || "0" }}</span>
          </div>
        </div>
      </div>

      <!-- Boss 击杀情况（照抄旧版概览 tab：已击杀/遗漏 + 可展开遗漏 Boss 列表） -->
      <div class="m-card" v-show="sub === 'overview'">
        <div class="m-card-h">
          <span class="m-t">Boss 击杀</span>
          <span class="m-boss-num">{{ bossReady ? `${bossKilled} / 150` : "— / 150" }}</span>
          <span class="m-boss-miss">遗漏 <b>{{ bossReady ? overview.unfoughtBosses.length : "—" }}</b></span>
        </div>
        <div class="m-pbar"><i :style="{ width: bossRate + '%' }"></i></div>
        <div class="m-pbar-foot">
          <span class="m-hint">已完成 {{ bossRate }}%</span>
          <button class="m-link" @click="bossExpand = !bossExpand">
            {{ bossExpand ? "收起遗漏列表" : "展开遗漏 Boss 列表" }}
          </button>
        </div>
        <div v-if="bossExpand && overview.unfoughtBosses.length" class="m-boss-grid">
          <span class="m-boss-chip" v-for="b in overview.unfoughtBosses" :key="b">{{ b }}</span>
        </div>
        <p v-else-if="bossExpand" class="m-hint" style="margin: 8px 0 0">已全部击杀，太猛了 🎉</p>
      </div>

      <!-- 公告（照抄旧版公告卡） -->
      <div class="m-card" v-if="club.announcement" v-show="sub === 'overview'">
        <div class="m-card-h"><span class="m-t">公告</span></div>
        <p class="m-anno">{{ club.announcement }}</p>
      </div>

      <!-- 会长（照抄旧版会长卡：头像 + 名字 + ID） -->
      <div class="m-card" v-if="leader" v-show="sub === 'overview'">
        <div class="m-card-h"><span class="m-t">会长</span></div>
        <div class="m-cline">
          <img v-if="leader.headImg" :src="leader.headImg" class="m-clava" alt="" @error="onImgError" />
          <span v-else class="m-clava m-clava--ph" :style="{ background: avatarBg(leader) }">{{ (leader.name || "?").charAt(0) }}</span>
          <span class="m-cnm" style="font-size: 13px">{{ leader.name }}</span>
          <span class="m-cmeta m-cline-id">ID {{ leader.roleId }}</span>
        </div>
      </div>

      <!-- 申请管理（会长/副会长可见） -->
      <div v-if="canKick" class="m-card" v-show="sub === 'overview'">
        <div class="m-card-h">
          <span class="m-t">申请管理</span>
          <button class="m-link" :disabled="loadingApply" @click="getApplyList">
            {{ loadingApply ? "获取中…" : "获取申请列表" }}
          </button>
        </div>
        <p v-if="loadingApply" class="m-hint" style="margin: 0">正在获取申请列表…</p>
        <template v-else-if="applyList.length">
          <div class="m-trow" v-for="ap in applyList" :key="ap.roleId">
            <span class="m-ib" style="background: var(--m-primary-deep)">
              <img v-if="ap.headImg" :src="ap.headImg" style="width: 36px; height: 36px; border-radius: 8px; object-fit: cover" />
              <span v-else>{{ (ap.name || "?").charAt(0) }}</span>
            </span>
            <span class="m-body">
              <span class="m-nm">{{ ap.name }} <span class="m-tag job">ID:{{ ap.roleId }}</span> <span class="m-tag job">Lv.{{ ap.level || 0 }}</span></span>
              <span class="m-ds">
                战力 {{ fmtPower(ap.power) }}<template v-if="ap.serverId"> · 服务器 {{ ap.serverId }}</template><template v-if="ap.applyReason"> · 申请留言：{{ ap.applyReason }}</template>
              </span>
            </span>
            <span class="m-rt">
              <button class="m-btn m-btn-gr" style="padding: 6px 10px; font-size: 11.5px" @click="approveApply(ap.roleId)">通过</button>
              <button class="m-btn m-btn-g" style="padding: 6px 10px; font-size: 11.5px" @click="rejectApply(ap.roleId)">拒绝</button>
            </span>
          </div>
          <div style="display: flex; gap: 8px; margin-top: 10px">
            <button class="m-btn m-btn-gr" style="flex: 1" :disabled="applyBusy" @click="approveAll">一键通过</button>
            <button class="m-btn m-btn-g" style="flex: 1" :disabled="applyBusy" @click="rejectAll">一键拒绝</button>
          </div>
        </template>
        <p v-else-if="hasFetchedApply" class="m-hint" style="margin: 0">暂无申请。</p>
        <p v-else class="m-hint" style="margin: 0">点右上角「获取申请列表」拉取。</p>
      </div>

      <!-- 成员列表 -->
      <div class="m-card" ref="membersDom" v-show="sub === 'members'">
        <div class="m-card-h">
          <span class="m-t">俱乐部成员（{{ memberCount }}）</span>
          <span class="m-acts" v-if="!isExporting">
            <button class="m-link" :disabled="batchLoading" @click="fetchAllMembersLineup">
              {{ batchLoading ? "获取中…" : "获取阵容" }}
            </button>
            <button class="m-act m-act-i" :disabled="!topMembers.length" @click="handleExportImage">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="m21 15-4.5-4.5L7 20"/></svg>
              导出图片
            </button>
          </span>
        </div>
        <div v-if="!isExporting" style="display: flex; gap: 8px; margin-bottom: 10px">
          <button class="m-btn m-btn-g" :style="{ flex: 1, color: filterNoRedQuench ? 'var(--m-primary)' : '', borderColor: filterNoRedQuench ? 'var(--m-primary)' : '' }" @click="filterNoRedQuench = !filterNoRedQuench">
            0 红玩家
          </button>
          <button class="m-btn m-btn-g" :style="{ flex: 1, color: filterRedQuenchDropped ? 'var(--m-primary)' : '', borderColor: filterRedQuenchDropped ? 'var(--m-primary)' : '' }" @click="filterRedQuenchDropped = !filterRedQuenchDropped">
            红淬降低
          </button>
        </div>
        <p v-if="batchLoading" class="m-hint" style="margin: 0 0 4px">正在自动获取成员阵容信息…</p>
        <!-- 成员卡片（照抄盐场「本月战绩」卡片形式，严格两行：身份行 + 三字段行） -->
        <div class="m-scards">
          <div class="m-scard" v-for="(m, i) in topMembers" :key="m.roleId" @click="openPlayer(m)">
            <div class="m-scard-head m-mhead">
              <span class="m-scard-rank">
                <template v-if="!isExporting && i < 3">{{ i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉" }}</template>
                <template v-else>{{ i + 1 }}</template>
              </span>
              <img v-if="m.headImg" :src="m.headImg" class="m-scard-ava" alt="" @error="onImgError" />
              <span v-else class="m-scard-ava m-scard-ava--ph">{{ (m.name || "?").charAt(0) }}</span>
              <span class="m-mname">
                <span class="m-mname-t">{{ m.name }}</span>
                <span class="m-mid">ID {{ m.roleId }}</span>
              </span>
              <span class="m-tag job" style="flex: none">{{ jobLabel(m.job) }}</span>
              <span class="m-mright">
                <i v-if="m.lineupType" class="m-scard-lineup" :style="lineupStyle(m.lineupType)">{{ m.lineupType }}</i>
                <i v-else class="m-scard-lineup m-scard-lineup--none">-</i>
                <button
                  v-if="canKick && m.job !== 1 && !isExporting"
                  class="m-kick"
                  @click.stop="kickMember(m.roleId, m.name)"
                >
                  踢出
                </button>
              </span>
            </div>
            <div class="m-scard-grid m-scard-grid--1row">
              <div class="m-scard-cell">
                <span class="m-scard-label">战力</span>
                <span class="m-scard-val is-power">{{ fmtPower(m.power || m.custom?.s_power) }}</span>
              </div>
              <div class="m-scard-cell">
                <span class="m-scard-label">红淬</span>
                <span class="m-scard-val is-red">{{ redQuenchlabel(m.custom?.red_quench_cnt || 0) }}</span>
              </div>
              <div class="m-scard-cell">
                <span class="m-scard-label">最高红淬</span>
                <span class="m-scard-val">{{ maxRedOf(m) ? redQuenchlabel(maxRedOf(m)) : "—" }}</span>
              </div>
            </div>
          </div>
        </div>
        <p v-if="!topMembers.length" class="m-hint" style="margin: 8px 0 0; text-align: center">暂无成员数据</p>
      </div>
      <!-- 历史战绩：show:lazy 语义——首次进入才挂载并拉取，之后只切显示不重拉 -->
      <ClubHistoryPanel v-if="shown.history" v-show="sub === 'history'" />
      <!-- 怪异塔信息：同样首次进入才挂载（面板 onMounted 自己发 evotower_getlegionjoinmembers） -->
      <div v-if="shown.tower" v-show="sub === 'tower'" class="m-subtower">
        <WeirdTowerPanel />
      </div>
    </template>

    <!-- 玩家信息抽屉 / 英雄详情抽屉（公共组件，与盐场车头共用）
         #mid 插连续切磋：同一份 DuelBlock，盐场 / 蟠桃 / 榜单 / 切磋面板都是这个用法 -->
    <PlayerSheet
      v-model="playerSheet"
      :loading="queryLoading"
      :player="playerInfo"
      @open-hero="openHero"
    >
      <template #mid>
        <DuelBlock :player="playerInfo" />
      </template>
    </PlayerSheet>
    <HeroSheet v-model="heroSheet" :hero="currentHero" />
  </div>
</template>

<script setup>
/* ============================================================
 * 俱乐部面板（移动端）
 * 数据逻辑照抄 src/components/Club/ClubInfo.vue：
 *   · 数据源 tokenStore.gameData.legionInfo
 *   · 命令：legion_getinfo / legion_signin / legion_applylist
 *            legion_agree / legion_ignore / legion_kickout
 *            rank_getroleinfo
 * 仅展示形式改为移动端。
 * ============================================================ */
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useMessage, useDialog } from "naive-ui";
import { confirmDanger } from "@/mobile/utils/confirm";
import { useTokenStore } from "@/stores/tokenStore";
import { exportDomAsImage } from "@/mobile/utils/exportImage";
import { getLineupType, LINEUP_RULES } from "@/utils/HeroList";
import ClubHistoryPanel from "./ClubHistoryPanel.vue";
import WeirdTowerPanel from "./WeirdTowerPanel.vue";
import PlayerSheet from "../components/PlayerSheet.vue";
import HeroSheet from "../components/HeroSheet.vue";
import DuelBlock from "../components/DuelBlock.vue";
import { usePlayerInfo } from "../components/usePlayerInfo";
import { getHeroInfo } from "../components/heroInfo";

const tokenStore = useTokenStore();
const message = useMessage();
const dialog = useDialog();

/* ---------- 二级分段：概览 / 成员 / 历史战绩 / 怪异塔信息 ---------- */
const subs = [
  { key: "overview", label: "概览" },
  { key: "members", label: "成员" },
  { key: "history", label: "历史战绩" },
  { key: "tower", label: "怪异塔信息" },
];
const sub = ref("overview");
/* show:lazy 语义：首次进入即挂载（面板 onMounted 自动拉取），之后只切显示不重拉 */
const shown = ref({ overview: true, members: false, history: false, tower: false });
const bossExpand = ref(false);
watch(sub, (v) => {
  shown.value[v] = true;
  // 切换视图回顶部（对齐旧版 tab 切换的体感）
  const sc = document.querySelector(".mobile-shell .m-scroll");
  if (sc) sc.scrollTop = 0;
  // 照抄旧版 watch(activeTab)：切到成员页且无任何阵容数据时自动拉取
  if (v === "members" && !batchLoading.value) {
    const hasLineup = members.value.some((m) => m.lineupType);
    if (!hasLineup) {
      fetchAllMembersLineup();
    }
  }
});

/* ---------- 成员列表导出图片（照抄 ClubInfo.handleExportImage） ---------- */
const membersDom = ref(null);
const isExporting = ref(false);

const handleExportImage = async () => {
  if (!membersDom.value) {
    message.error("未找到要导出的内容");
    return;
  }

  let loadingMsg = null;
  try {
    isExporting.value = true;
    loadingMsg = message.loading("正在生成图片，请稍候...", { duration: 0 });

    // 等待Vue更新DOM（移除操作按钮）
    await nextTick();

    const dateStr = new Date().toLocaleDateString().replace(/\//g, "-");
    const filename = `俱乐部成员信息_${dateStr}.png`;
    await exportDomAsImage(membersDom.value, filename);

    message.success("图片导出成功");
  } catch (err) {
    console.error("DOM转图片失败：", err);
    message.error("导出图片失败，请重试");
  } finally {
    loadingMsg?.destroy?.();
    isExporting.value = false;
  }
};

/* ---------- 数据（照抄 ClubInfo） ---------- */
const info = computed(() => tokenStore.gameData?.legionInfo || null);
const club = computed(() => info.value?.info || null);

const membersObj = computed(() => club.value?.members || {});
const members = computed(() => Object.values(membersObj.value || {}));
const memberCount = computed(() => members.value.length);

const leader = computed(() => {
  const lid = club.value?.leaderId;
  if (!lid) return null;
  return members.value.find((m) => Number(m.roleId) === Number(lid)) || null;
});

const filterNoRedQuench = ref(false);
const filterRedQuenchDropped = ref(false);

const topMembers = computed(() => {
  let list = [...members.value];
  if (filterNoRedQuench.value) {
    list = list.filter((m) => {
      const heroList = m.currentHeroList || [];
      return heroList.some((hero) => {
        const slot = hero.battleTeamSlot;
        if (slot == null || slot < 0) return false;
        return Number(hero.red || 0) === 0;
      });
    });
  }
  if (filterRedQuenchDropped.value) {
    list = list.filter((m) => {
      const currentRed = Number(m.custom?.red_quench_cnt || 0);
      let storedMap = {};
      try {
        storedMap = JSON.parse(localStorage.getItem("maxRedQuench") || "{}");
      } catch (e) {
        storedMap = {};
      }
      const maxRed = Number(m.maxRedQuench ?? storedMap[m.roleId] ?? 0);
      return maxRed > 0 && currentRed < maxRed;
    });
  }
  return list.sort((a, b) => {
    // 1. 职位排序：会长(1) > 副会长(2) > 成员(0)
    const jobA = a.job === 0 ? 99 : a.job;
    const jobB = b.job === 0 ? 99 : b.job;
    if (jobA !== jobB) return jobA - jobB;

    // 2. 红淬排序：降序
    const redA = Number(a.custom?.red_quench_cnt || 0);
    const redB = Number(b.custom?.red_quench_cnt || 0);
    if (redA !== redB) return redB - redA;

    // 3. 战力排序：降序（兜底）
    const powerA = Number(a.power || a.custom?.s_power || 0);
    const powerB = Number(b.power || b.custom?.s_power || 0);
    return powerB - powerA;
  });
});

const getAndUpdateMaxRedQuench = (roleId, currentRed) => {
  const key = "maxRedQuench";
  let storedMap = {};
  try {
    storedMap = JSON.parse(localStorage.getItem(key) || "{}");
  } catch (e) {
    storedMap = {};
  }
  const stored = Number(storedMap[roleId] || 0);
  if (currentRed > stored) {
    storedMap[roleId] = currentRed;
    localStorage.setItem(key, JSON.stringify(storedMap));
    return currentRed;
  }
  return stored;
};

/* ---------- 批量获取成员阵容（照抄） ---------- */
const batchLoading = ref(false);
const fetchAllMembersLineup = async () => {
  if (batchLoading.value) return;
  const token = tokenStore.selectedToken;
  if (!token) return;

  const wsStatus = tokenStore.getWebSocketStatus(token.id);
  if (wsStatus !== "connected") {
    message.error("WebSocket未连接，无法获取阵容信息");
    return;
  }

  const memberList = members.value;
  if (!memberList.length) return;

  batchLoading.value = true;
  const loadingMsg = message.loading("正在获取成员阵容信息...", { duration: 0 });

  const memberIds = memberList.map((m) => m.roleId);
  const chunkSize = 5;

  try {
    for (let i = 0; i < memberIds.length; i += chunkSize) {
      const chunk = memberIds.slice(i, i + chunkSize);
      const promises = chunk.map(async (roleId) => {
        try {
          const roleRes = await tokenStore.sendMessageWithPromise(
            token.id,
            "rank_getroleinfo",
            {
              roleId: Number(roleId),
              includeBottleTeam: false,
              isSearch: false,
              bottleType: 0,
              includeHero: true,
              includeHeroDetail: true,
              includePearl: true,
            },
            5000,
          );

          if (roleRes && roleRes.roleInfo) {
            let heroList = [];
            let currentRed = 0;
            if (roleRes.roleInfo.heroes) {
              const res = getHeroInfo(roleRes.roleInfo.heroes);
              heroList = res.heroList;
              currentRed = res.redCount || 0;
            }

            const lineupType = getLineupType(heroList);

            if (
              tokenStore.gameData?.legionInfo?.info?.members &&
              tokenStore.gameData.legionInfo.info.members[roleId]
            ) {
              tokenStore.gameData.legionInfo.info.members[roleId].lineupType =
                lineupType;
              tokenStore.gameData.legionInfo.info.members[
                roleId
              ].currentHeroList = heroList;
              const _maxRed = getAndUpdateMaxRedQuench(roleId, currentRed);
              tokenStore.gameData.legionInfo.info.members[roleId].maxRedQuench =
                _maxRed;
            }
          }
        } catch (e) {
          console.error(`Failed to fetch info for ${roleId}`, e);
        }
      });
      await Promise.all(promises);
    }
    message.success("阵容信息获取完成");
  } catch (error) {
    message.error(`获取失败: ${error.message}`);
  } finally {
    loadingMsg?.destroy?.();
    batchLoading.value = false;
  }
};

/* ---------- 玩家信息 / 英雄信息（公共模块，与盐场车头共用） ---------- */
const playerSheet = ref(false);
const heroSheet = ref(false);
const currentHero = ref(null);
const {
  loading: queryLoading,
  player: playerInfo,
  fetchPlayer,
} = usePlayerInfo();

/* 点成员 → 查询成功后才打开抽屉（照抄旧版：失败只 toast，不弹窗） */
const openPlayer = async (m) => {
  if (queryLoading.value) return;
  const fetched = await fetchPlayer(m.roleId);
  if (!fetched) return;
  playerSheet.value = true;
  /* 照抄旧版副作用：单点查看也把阵容类型回写到成员（点一次就出 chip） */
  const target = tokenStore.gameData?.legionInfo?.info?.members?.[m.roleId];
  if (target && fetched.lineupType) target.lineupType = fetched.lineupType;
};

/* 点武将 → 英雄抽屉 */
const openHero = (hero) => {
  currentHero.value = hero;
  heroSheet.value = true;
};

/* 头像加载失败回退官方图标（照抄旧版 NAvatar fallbackSrc） */
const onImgError = (e) => {
  e.target.src = "/icons/xiaoyugan.png";
};

/* ---------- 权限与签到（照抄） ---------- */
const currentMemberJob = computed(() => {
  const roleId = tokenStore.gameData?.roleInfo?.role?.roleId;
  if (!roleId) return 0;
  const currentMember = members.value.find(
    (m) => Number(m.roleId) === Number(roleId),
  );
  return currentMember?.job || 0;
});
const canKick = computed(() => [1, 2].includes(currentMemberJob.value));

const legionSignedIn = computed(() => {
  const ts = Number(
    tokenStore.gameData?.roleInfo?.role?.statisticsTime?.["legion:sign:in"] ||
      0,
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todaySec = Math.floor(today.getTime() / 1000);
  return ts > todaySec;
});

const signInLegion = () => {
  const token = tokenStore.selectedToken;
  if (!token || legionSignedIn.value) return;
  tokenStore.sendMessage(token.id, "legion_signin");
  tokenStore.sendMessage(token.id, "role_getroleinfo");
  message.info("俱乐部签到");
};

/* ---------- 踢人（照抄） ---------- */
const kickMember = (roleId, name) => {
  const token = tokenStore.selectedToken;
  if (!token) return;

  confirmDanger(dialog, {
    title: "踢出成员",
    content: `确定要踢出成员 ${name}（ID: ${roleId}）吗？`,
    positiveText: "踢出",
    onPositiveClick: () => {
      tokenStore.sendMessage(token.id, "legion_kickout", {
        roleId: Number(roleId),
      });
      if (tokenStore.gameData?.legionInfo?.info?.members) {
        delete tokenStore.gameData.legionInfo.info.members[roleId];
        setTimeout(() => {
          refreshClub();
        }, 1000);
      }
      message.info(`正在踢出成员 ID: ${roleId}`);
    },
  });
};

/* ---------- 申请列表（照抄） ---------- */
const loadingApply = ref(false);
const applyList = ref([]);
const hasFetchedApply = ref(false); // 未请求前不宣称「暂无申请」（照抄旧版 modal 语义）
const applyBusy = ref(false);       // 一键通过/拒绝请求中

const getApplyList = async () => {
  const token = tokenStore.selectedToken;
  if (!token) return;

  loadingApply.value = true;
  applyList.value = [];

  try {
    message.info("正在获取申请列表");
    const responseBody = await tokenStore.sendMessageWithPromise(
      token.id,
      "legion_applylist",
      {},
      10000,
    );
    hasFetchedApply.value = true;
    handleApplyListResp({ body: responseBody });
  } catch (error) {
    loadingApply.value = false;
    hasFetchedApply.value = true;
    message.error("获取申请列表失败: " + (error.message || "未知错误"));
    console.error("获取申请列表出错:", error);
  }
};

const handleApplyListResp = (session) => {
  const responseBody = session.body;
  if (responseBody) {
    if (Object.keys(responseBody).length === 0) {
      applyList.value = [];
      loadingApply.value = false;
      message.info("暂无申请");
      return;
    }
    if (typeof responseBody === "object") {
      if (Array.isArray(responseBody.roleList)) {
        const validRoles = responseBody.roleList.filter(
          (role) => role.roleId && role.name,
        );
        applyList.value = validRoles.map((role) => ({
          headImg: role.headImg,
          level: role.level,
          name: role.name,
          power: role.power,
          roleId: role.roleId,
          serverId: role.ext?.["server_id"] || "",
          applyReason: role.ext?.["legion_apply_reason"] || "",
        }));
        loadingApply.value = false;
        message.success(`获取到 ${validRoles.length} 个申请`);
      } else if (
        Array.isArray(responseBody.applyList) ||
        Array.isArray(responseBody.list) ||
        Array.isArray(responseBody.data)
      ) {
        const applyArray =
          responseBody.applyList || responseBody.list || responseBody.data;
        applyList.value = applyArray
          .filter((apply) => apply.roleId && apply.name)
          .map((apply) => ({
            ...apply,
            serverId: apply.ext?.["server_id"] || "",
            applyReason: apply.ext?.["legion_apply_reason"] || "",
          }));
        loadingApply.value = false;
        message.success(`获取到 ${applyList.value.length} 个申请`);
      } else if (Array.isArray(responseBody)) {
        applyList.value = responseBody
          .filter((apply) => apply.roleId && apply.name)
          .map((apply) => ({
            ...apply,
            serverId: apply.ext?.["server_id"] || "",
            applyReason: apply.ext?.["legion_apply_reason"] || "",
          }));
        loadingApply.value = false;
        message.success(`获取到 ${applyList.value.length} 个申请`);
      } else {
        applyList.value = [];
        loadingApply.value = false;
        message.info("暂无申请");
      }
    } else if (Array.isArray(responseBody)) {
      applyList.value = responseBody
        .filter((apply) => apply.roleId && apply.name)
        .map((apply) => ({
          ...apply,
          serverId: apply.ext?.["server_id"] || "",
          applyReason: apply.ext?.["legion_apply_reason"] || "",
        }));
      loadingApply.value = false;
      message.success(`获取到 ${applyList.value.length} 个申请`);
    } else {
      applyList.value = [];
      loadingApply.value = false;
      message.info("暂无申请");
    }
  } else {
    applyList.value = [];
    loadingApply.value = false;
    message.info("暂无申请");
  }
};

const approveApply = (roleId) => {
  const token = tokenStore.selectedToken;
  if (!token) return;
  tokenStore.sendMessage(token.id, "legion_agree", {
    roleId: Number(roleId),
  });
  applyList.value = applyList.value.filter((apply) => apply.roleId !== roleId);
  message.info(`已通过成员 ID: ${roleId} 的申请`);
  setTimeout(() => {
    refreshClub();
  }, 1000);
};

const rejectApply = (roleId) => {
  const token = tokenStore.selectedToken;
  if (!token) return;
  tokenStore.sendMessage(token.id, "legion_ignore", {
    roleId: Number(roleId),
  });
  applyList.value = applyList.value.filter((apply) => apply.roleId !== roleId);
  message.info(`已拒绝成员 ID: ${roleId} 的申请`);
};

const approveAll = () => {
  const token = tokenStore.selectedToken;
  if (!token || applyBusy.value) return;
  const count = applyList.value.length;
  if (count === 0) return;
  applyBusy.value = true;
  setTimeout(() => (applyBusy.value = false), 800);
  applyList.value.forEach((apply) => {
    tokenStore.sendMessage(token.id, "legion_agree", {
      roleId: Number(apply.roleId),
    });
  });
  applyList.value = [];
  message.success(`已通过所有 ${count} 个申请`);
  setTimeout(() => {
    refreshClub();
  }, 1000);
};

const rejectAll = () => {
  const token = tokenStore.selectedToken;
  if (!token || applyBusy.value) return;
  const count = applyList.value.length;
  if (count === 0) return;
  applyBusy.value = true;
  setTimeout(() => (applyBusy.value = false), 800);
  applyList.value.forEach((apply) => {
    tokenStore.sendMessage(token.id, "legion_ignore", {
      roleId: Number(apply.roleId),
    });
  });
  applyList.value = [];
  message.success(`已拒绝所有 ${count} 个申请`);
};

/* ---------- 概览与刷新（照抄） ---------- */
const overview = computed(() => {
  const i = info.value || {};
  const base = i.info || {};
  const boss = base.currentBoss || {};
  const stats = i.statistics || i.stat || {};

  const power = Number(base.power ?? i.power ?? base.s_power ?? i.s_power ?? 0);
  const dan = base.dan ?? i.dan ?? base.rank ?? i.rank ?? "-";
  const redQuench = Number(
    base.redQuenchCnt ??
      i.redQuenchCnt ??
      stats["red:quench"] ??
      stats["red_quench"] ??
      0,
  );
  const lastWarRank =
    stats["last:war:rank"] ??
    stats["lastWarRank"] ??
    stats["legion:last:war:rank"] ??
    "-";
  const noApply = Boolean(base.noApply ?? i.noApply);

  const currentHP = formatNumber(boss.currentHP || 0);
  const currentBossId = boss.bossId || 0;
  const unfoughtBosses = [];
  for (let k = 1; k <= 150; k++) {
    if (!tokenStore.gameData?.roleInfo?.role?.statistics?.[`lb:${k}`]) {
      unfoughtBosses.push(k);
    }
  }

  return { power, dan, redQuench, lastWarRank, noApply, currentHP, currentBossId, unfoughtBosses };
});

/* Boss 击杀进度（概览进度条用）：总数沿用旧版 150 */
const bossReady = computed(() => !!tokenStore.gameData?.roleInfo?.role?.statistics);
const bossKilled = computed(() => 150 - (overview.value.unfoughtBosses?.length || 0));
const bossRate = computed(() => ((bossKilled.value / 150) * 100).toFixed(1));

const refreshClub = () => {
  const token = tokenStore.selectedToken;
  if (!token) {
    message.warning("请先选择游戏角色");
    return;
  }
  if (tokenStore.getWebSocketStatus(token.id) !== "connected") {
    message.error("WebSocket未连接，无法获取俱乐部信息");
    return;
  }
  tokenStore.sendMessage(token.id, "legion_getinfo");

  // 照抄旧版：当前在成员页时也刷新阵容信息
  if (sub.value === "members") {
    fetchAllMembersLineup();
  }
};

/* ---------- 首次进入自动拉取 legion_getinfo（照抄 GameStatus:739-772） ---------- */
const fetchedLegionFor = ref(""); // 已拉取过的 tokenId（照抄 hasFetchedLegionOnce）
const ensureLegionInfo = () => {
  const tokenId = tokenStore.selectedToken?.id;
  if (!tokenId) return;
  if (tokenStore.getWebSocketStatus(tokenId) !== "connected") return;
  if (fetchedLegionFor.value === tokenId) return;
  fetchedLegionFor.value = tokenId;
  tokenStore.sendMessage(tokenId, "legion_getinfo");
};

onMounted(ensureLegionInfo);

/* 连接状态变化：连上就补拉（旧版由 GameStatus 的 watch 承担） */
watch(
  () => tokenStore.getWebSocketStatus(tokenStore.selectedToken?.id),
  (status) => {
    if (status === "connected") ensureLegionInfo();
  },
);

/* 切账号：清标记并重拉（旧版 GameStatus 同样会在连接回归时补拉） */
watch(
  () => tokenStore.selectedToken?.id,
  () => {
    fetchedLegionFor.value = "";
    ensureLegionInfo();
  },
);

/* 阵容类型配色（照抄旧版成员表 LINEUP_RULES + NTag colorProps 实色 chip） */
const lineupStyle = (type) => {
  const rule = LINEUP_RULES.find((r) => r.name === type);
  if (!rule) return { background: "var(--m-bg)", color: "var(--m-text2)" };
  return { background: rule.colorProps.color, color: rule.colorProps.textColor };
};

/* ---------- 展示辅助 ---------- */
const jobLabel = (job) => {
  if (job === 1) return "会长";
  if (job === 2) return "副会长";
  return "成员";
};
const redQuenchlabel = (n) => n + "红";
/* 最高红淬：本地无记录时回退 localStorage 存档（照抄旧版最高红淬列） */
const maxRedOf = (m) => {
  let storedMap = {};
  try {
    storedMap = JSON.parse(localStorage.getItem("maxRedQuench") || "{}");
  } catch (e) {
    storedMap = {};
  }
  return Number(m.maxRedQuench ?? storedMap[m.roleId] ?? 0);
};
const formatNumber = (num) => {
  const n = Number(num || 0);
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "兆";
  if (n >= 1e8) return (n / 1e8).toFixed(2) + "亿";
  if (n >= 1e4) return (n / 1e4).toFixed(2) + "万";
  return n.toLocaleString();
};
const fmtPower = formatNumber;
const avatarBg = (m) => {
  const grads = [
    "var(--m-ava-1)",
    "var(--m-ava-2)",
    "var(--m-ava-3)",
    "var(--m-ava-4)",
  ];
  return grads[(m?.name || "").length % grads.length];
};
</script>

<script>
export default { name: "MobileClubPanel" };
</script>

<style scoped>
/* ---------- 成员卡片：身份行（名字 + ID 竖排，右侧职务/阵容/踢出） ---------- */
.m-mhead { gap: 6px; }
/* 名字块：名字一行、ID 一行（避免单行 6 个元素把名字挤成几个像素）
   —— .m-mname / .m-mname-t / .m-mid 已提到 mobile.css 全局（蟠桃敌方成员也复用） */
.m-mright { flex: none; margin-left: auto; display: inline-flex; align-items: center; gap: 6px; }
.m-scard-lineup--none { background: var(--m-bg); color: var(--m-text3); }
.m-kick {
  flex: none; border: 1px solid var(--m-border); background: var(--m-card);
  border-radius: 4px; padding: 2px 6px;
  font-size: 11px; font-weight: 700; color: var(--m-red); line-height: 1.3;
}

/* ---------- 概览：身份行 / 四宫格 / Boss 进度 / 会长行 ---------- */
.m-head-id { align-items: center; }
.m-cinfo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.m-cnm {
  font-size: 15px; font-weight: 700; color: var(--m-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
/* 单行弱化元信息，替掉原来的黄/蓝/绿三色 chip（按项折行，不把「成员 30」拆开） */
.m-cmeta { font-size: 11px; color: var(--m-text3); line-height: 1.4; display: flex; flex-wrap: wrap; gap: 0 6px; }
.m-cmeta-i { white-space: nowrap; }
.m-cmeta-i + .m-cmeta-i::before { content: "·"; margin-right: 6px; }
.m-cacts { flex: none; display: flex; align-items: center; gap: 8px; }
/* 签到降级为轻量胶囊，不再独占整行 */
.m-pill {
  border: none; border-radius: var(--m-r-md); padding: 5px 11px;
  background: var(--m-primary); color:var(--m-on-primary);
  font-size: 12px; font-weight: 700; line-height: 1.3;
}
.m-pill.done { background: var(--m-bg); color: var(--m-text3); border: 1px solid var(--m-border); }
.m-pill[disabled] { pointer-events: none; }
/* 四宫格：一块底 + 内部细分割线（不再四张独立小卡） */
.m-stats--flat {
  gap: 0; overflow: hidden;
  background: var(--m-bg);
  border: 1px solid var(--m-border);
  border-radius: 8px;
}
.m-stats--flat .m-stat {
  background: none; border: none; border-radius: 4px;
  padding: 10px 12px;
}
.m-stats--flat .m-stat:nth-child(odd) { border-right: 1px solid var(--m-border); }
.m-stats--flat .m-stat:nth-child(-n + 2) { border-bottom: 1px solid var(--m-border); }
/* Boss 击杀：标题右侧计数 + 细进度条 */
.m-boss-num { flex: none; font-size: 12.5px; font-weight: 700; color: var(--m-text2); font-variant-numeric: tabular-nums; }

/* 怪异塔信息页签：页签名已经写着「怪异塔信息」，卡片头再重复一遍同名标题是噪音，
   只留右侧的刷新 / 导出图片（.m-t 原本 flex:1 把按钮推到右边，隐藏后要自己补 margin-auto）。 */
.m-subtower :deep(.m-card-h .m-t) { display: none; }
.m-subtower :deep(.m-card-h .m-acts) { margin-left: auto; }
.m-boss-miss { flex: none; font-size: 11.5px; color: var(--m-text3); }
.m-boss-miss b { color: var(--m-red); font-size: 12.5px; }
.m-pbar { height: 6px; border-radius: 4px; background: var(--m-bg); overflow: hidden; }
.m-pbar i { display: block; height: 100%; background: var(--m-primary); border-radius: 4px; transition: width 0.3s; }
.m-pbar-foot { display: flex; align-items: center; margin-top: 9px; }
.m-pbar-foot .m-hint { margin: 0; }
.m-pbar-foot .m-link { margin-left: auto; }
/* 会长行：头像 + 名字 + ID 各自独立间距 */
.m-cline { display: flex; align-items: center; gap: 8px; min-width: 0; }
.m-clava {
  flex: none; width: 26px; height: 26px; border-radius: var(--m-r-md);
  object-fit: cover; border: 1px solid var(--m-border);
}
.m-clava--ph { display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color:var(--m-on-primary); }
.m-cline-id { flex: none; white-space: nowrap; }

</style>
