<template>
  <div class="m-pane" ref="exportDom">
    <!-- 工具栏（照抄旧版 .toolbar：查询日期 + 一键切磋5次 + 导出图片 + 刷新） -->
    <div class="m-card">
      <div class="m-card-h">
        <span class="m-t">查询日期</span>
        <span class="m-acts" v-if="!isExporting">
          <button class="m-act" :disabled="!opponentMembers.length || batchDuelRunning" @click="handleBatchDuel">
            一键切磋5次
          </button>
          <button class="m-act m-act-i" :disabled="!opponentMembers.length" @click="handleExportImage">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="m21 15-4.5-4.5L7 20"/></svg>
            导出图片
          </button>
          <button class="m-act" :disabled="loading" @click="refreshByDate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
            刷新
          </button>
        </span>
      </div>
      <button type="button" class="m-dtag" @click="calOpen = true">{{ queryDate }}</button>
      <p class="m-hint" style="margin: 8px 0 0">仅周日可查；当天需 18:00 后才算本期对战</p>
    </div>

    <!-- 主标题 + VS 头部（照抄旧版 main-title / header-section） -->
    <template v-if="battleInfo">
      <h2 class="m-mtitle">{{ queryDate }} 蟠桃大会对战</h2>
      <div class="m-card">
        <div class="m-vs">
          <div class="m-vs-c">
            <div class="m-vs-row">
              <span class="m-clogo m-clogo-s">
                <img v-if="battleInfo.ownClub.logo" :src="battleInfo.ownClub.logo" alt="" />
                <span v-else>{{ (battleInfo.ownClub.name || "?").charAt(0) }}</span>
              </span>
              <span class="m-vs-nm">{{ battleInfo.ownClub.name || "未知" }}</span>
            </div>
            <div class="m-vs-id">ID: {{ battleInfo.ownClub.id }} · {{ battleInfo.ownClub.serverId }}服</div>
            <div class="m-vs-st">{{ battleInfo.ownClub.memberCount }}人 | {{ battleInfo.ownClub.quenchNum }}红 | {{ formatPower(battleInfo.ownClub.power) }}</div>
            <div class="m-vs-anno">{{ battleInfo.ownClub.announcement || "—" }}</div>
          </div>
          <div class="m-vs-badge">VS</div>
          <div class="m-vs-c">
            <div class="m-vs-row">
              <span class="m-clogo m-clogo-s">
                <img v-if="battleInfo.opponentClub.logo" :src="battleInfo.opponentClub.logo" alt="" />
                <span v-else>{{ (battleInfo.opponentClub.name || "?").charAt(0) }}</span>
              </span>
              <span class="m-vs-nm">{{ battleInfo.opponentClub.name || "未知" }}</span>
            </div>
            <div class="m-vs-id">ID: {{ battleInfo.opponentClub.id }} · {{ battleInfo.opponentClub.serverId }}服</div>
            <div class="m-vs-st">{{ battleInfo.opponentClub.memberCount }}人 | {{ battleInfo.opponentClub.quenchNum }}红 | {{ formatPower(battleInfo.opponentClub.power) }}</div>
            <div class="m-vs-anno">{{ battleInfo.opponentClub.announcement || "—" }}</div>
          </div>
        </div>
      </div>
    </template>

    <!-- 三态：loading / 数据 / 空 -->
    <div v-if="loading" class="m-card">
      <p class="m-hint" style="text-align: center; padding: 24px 0">正在加载敌方数据…</p>
    </div>
    <template v-else-if="opponentMembers.length > 0">
      <div class="m-card" ref="membersDom">
        <div class="m-card-h">
          <span class="m-t">敌方信息</span>
          <span class="m-more">报名：{{ battleInfo.opponentClub.enrolledCount }} / 已加载：{{ opponentMembers.length }}</span>
        </div>
        <div v-if="lineupStats.length" class="m-chiprow">
          <span class="m-chiprow-l">阵容统计：</span>
          <span v-for="item in lineupStats" :key="item.name" class="m-lu" :style="{ background: item.colorProps.color, color: item.colorProps.textColor }">
            {{ item.name }} ({{ item.count }})
          </span>
        </div>
        <!-- 成员卡片流（照抄旧版 PeachInfoV2 L146-253 salt-cards 版式：
             序号/头像/名字+ID/阵容类型chip(右上)/战力·红淬·珍卡·玩具 四格网格/
             宠物行/阵容(红数)[四圣等级]武将小卡/战斗模拟5次） -->
        <div class="m-scards">
          <div class="m-scard" v-for="(member, index) in opponentMembers" :key="member.id ?? index">
            <div class="m-scard-head">
              <span class="m-scard-rank">{{ index + 1 }}</span>
              <img
                v-if="member.headImg"
                :src="member.headImg"
                class="m-scard-ava"
                alt=""
                style="cursor: pointer"
                @click="fetchTargetInfo(member.id)"
                @error="onImgError"
              />
              <span v-else class="m-scard-ava m-scard-ava--ph" style="cursor: pointer" @click="fetchTargetInfo(member.id)">{{
                (member.name || "?").charAt(0)
              }}</span>
              <span class="m-mname">
                <span class="m-mname-t" style="cursor: pointer" @click="fetchTargetInfo(member.id)">{{ member.name }}</span>
                <span class="m-mid">ID {{ member.id }}</span>
              </span>
              <span class="m-lu pi-badge" :style="lineupTypeStyle(member.lineupType)">{{ member.lineupType }}</span>
            </div>
            <div class="m-scard-grid m-scard-grid--4">
              <div class="m-scard-cell">
                <span class="m-scard-label">战力</span>
                <span class="m-scard-val is-power">{{ formatPower(member.power) }}</span>
              </div>
              <div class="m-scard-cell">
                <span class="m-scard-label">红淬</span>
                <span class="m-scard-val is-red">{{ member.redQuench }}</span>
              </div>
              <div class="m-scard-cell">
                <span class="m-scard-label">珍卡</span>
                <span class="m-scard-val" :style="legacycolor[member.legacy] ? { color: legacycolor[member.legacy].value } : null">{{
                  legacycolor[member.legacy]?.name || "—"
                }}</span>
              </div>
              <div class="m-scard-cell">
                <span class="m-scard-label">玩具</span>
                <span class="m-scard-val pi-toy">{{ member.toyName || "—" }}</span>
              </div>
            </div>
            <div class="m-scard-line">
              <span class="m-scard-label">宠物</span>
              <span class="m-scard-val">
                <template v-if="member.pet">
                  <img v-if="member.pet.icon" :src="member.pet.icon" class="pi-pet-ic" loading="lazy" @error="onPetIconError" />
                  <b :style="member.pet.color ? { color: member.pet.color } : null">{{ member.pet.name }}</b>
                  <span v-if="member.pet.level"> Lv.{{ member.pet.level }}</span>
                </template>
                <span v-else>—</span>
              </span>
            </div>
            <div class="pi-lineup">
              <span class="m-scard-label">阵容(红数)[四圣等级]</span>
              <span v-if="!(member.heroList || []).length" class="pi-lineup-none">—</span>
              <div v-else class="pi-lineup-wrap">
                <div v-for="(hero, hi) in member.heroList" :key="hi" class="pi-hero">
                  <span class="pi-hero-n">
                    {{ hero.heroName }}<i class="pi-hero-r">({{ hero.red }})</i><i v-if="hero.HolyBeast" class="pi-hero-hb">圣{{ hero.HBlevel }}</i>
                  </span>
                  <span class="pi-hero-p">
                    <template v-if="hero.PearlInfo?.FishInfo?.name || hero.PearlInfo?.PearlSkill?.name">
                      <i v-if="hero.PearlInfo?.FishInfo?.name">{{ hero.PearlInfo.FishInfo.name }}</i>
                      <i v-if="hero.PearlInfo?.FishInfo?.name && hero.PearlInfo?.PearlSkill?.name">|</i>
                      <i v-if="hero.PearlInfo?.PearlSkill?.name">{{ hero.PearlInfo.PearlSkill.name }}</i>
                    </template>
                    <i v-else>—</i>
                  </span>
                </div>
              </div>
            </div>
            <div class="m-scard-line">
              <span class="m-scard-label">战斗模拟5次</span>
              <span class="m-scard-val">
                <b v-if="!battleSimResults[member.id]" class="m-sim-none">—</b>
                <b v-else-if="battleSimResults[member.id].status === 'pending'" class="m-sim-wait">等待中</b>
                <b v-else-if="battleSimResults[member.id].status === 'fighting'" class="m-sim-fight">战斗中…</b>
                <b v-else-if="battleSimResults[member.id].status === 'timeout'" class="m-sim-to">超时异常</b>
                <b v-else-if="battleSimResults[member.id].winRate === 0" class="m-sim-lose">胜率：0%</b>
                <b v-else>
                  <span class="m-sim-win" :class="simRateClass(battleSimResults[member.id].winRate)">胜率：{{ battleSimResults[member.id].winRate }}%</span>
                  <span v-if="battleSimResults[member.id].fullWinRate > 0" class="m-sim-full">满编：{{ battleSimResults[member.id].fullWinRate }}%</span>
                </b>
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>
    <div v-else class="m-card">
      <div class="m-empty" style="padding: 30px 0">
        <div class="m-logo">🍑</div>
        <h3>暂无敌方数据</h3>
        <p>点右上角「刷新」重新拉取</p>
      </div>
    </div>

    <!-- 周日历抽屉（共用组件：仅周日可点、可翻月、当月外灰显） -->
    <DateCalendarSheet
      v-model:show="calOpen"
      :date="queryDate"
      :weekdays="[0]"
      @select="onPickDate"
    />

    <!-- 玩家信息 / 英雄详情（公共组件：俱乐部成员、盐场车头、蟠桃对手共用） -->
    <PlayerSheet
      v-model="playerSheet"
      :loading="queryLoading"
      :player="playerInfo"
      @open-hero="openHero"
    >
      <!-- 切磋整块（入口 + 进度 + 结果）都在最上面，与盐场共用 components/DuelBlock.vue -->
      <template #mid>
        <DuelBlock :player="playerInfo" />
      </template>
    </PlayerSheet>
    <HeroSheet v-model="heroSheet" :hero="currentHero" />
  
  </div>
</template>

<script setup>
/* ============================================================
 * 蟠桃园信息（移动端）
 * 数据逻辑照抄 src/components/Club/PeachInfoV2.vue：
 *   · 命令 legion_getinfo / legion_getpayloadbf / legion_getpayloadtask
 *          legion_getpayloadrecord / legion_getpayloadkillrecord
 *          legion_getinfobyid / rank_getroleinfo / fight_startpvp
 *   · 一键切磋5次（400340 限频 11s 重试 + 15s 补跑）逐字保留
 *   · 导出文件名：蟠桃园敌方信息_${queryDate}.png
 * 仅展示形式改为移动端。
 * ============================================================ */
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import { exportDomAsImage } from "@/mobile/utils/exportImage";
import {
  HERO_DICT,
  HeroFillInfo,
  getLineupType,
  legacycolor,
  formatWeapon,
  LINEUP_RULES,
} from "@/utils/HeroList";
import { getShowPet } from "@/utils/PetList";
import PlayerSheet from "../components/PlayerSheet.vue";
import HeroSheet from "../components/HeroSheet.vue";
import DuelBlock from "../components/DuelBlock.vue";
import DateCalendarSheet from "../components/DateCalendarSheet.vue";
import { usePlayerInfo } from "../components/usePlayerInfo";

const message = useMessage();
const tokenStore = useTokenStore();

/* ---------- 日期助手（照抄 PeachInfoV2） ---------- */
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
  if (power >= 100000000) return (power / 100000000).toFixed(1) + "亿";
  if (power >= 10000) return (power / 10000).toFixed(1) + "万";
  return power.toString();
};

const formatDateToShort = (dateStr) => {
  if (!dateStr) return "";
  const parts = String(dateStr).split("/");
  if (parts.length !== 3) return String(dateStr);
  const [year, month, day] = parts;
  return year.slice(2) + month + day;
};

const isSundayBattleTime = () => {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();
  return day === 0 && ((hour >= 18 && hour < 20) || (hour === 20 && minute <= 30));
};

/* ---------- 状态（照抄 PeachInfoV2） ---------- */
const loading = ref(false);
const currentClubInfo = ref(null);
const club = computed(() => currentClubInfo.value?.info || {});
const exportDom = ref(null);
const membersDom = ref(null);
const isExporting = ref(false);
const selectedTokenId = computed(() => tokenStore.selectedToken?.id || "");
const battleInfo = ref(null);
const opponentMembers = ref([]);
const queryDate = ref(getLastSunday());
/* 周日历抽屉开关（日历本体是 components/DateCalendarSheet.vue） */
const calOpen = ref(false);
const playerSheet = ref(false);
const {
  loading: queryLoading,
  player: playerInfo,
  fetchPlayer,
} = usePlayerInfo();
const battleSimResults = ref({});
const batchDuelRunning = ref(false);
const heroSheet = ref(false);
const currentHero = ref(null);
/* 点武将 → 英雄抽屉 */
const openHero = (hero) => {
  currentHero.value = hero;
  heroSheet.value = true;
};

/* ---------- computeds（照抄） ---------- */
const lineupStats = computed(() => {
  const counts = new Map();
  opponentMembers.value.forEach((member) => {
    const type = member.lineupType || "未知";
    counts.set(type, (counts.get(type) || 0) + 1);
  });
  return Array.from(counts, ([name, count]) => ({
    name,
    count,
    colorProps: LINEUP_RULES.find((r) => r.name === name)?.colorProps || {
      color: "#e8e8e8",
      textColor: "#444",
    },
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh"));
});

/* 选中日期：关抽屉 + 按该日重新拉战绩（原来是 selectPeachCalendarDate 里的两行） */
const onPickDate = (value) => {
  fetchBattleRecordsByDate(value);
};

/* ---------- 数据拉取（照抄 fetchCurrentClubInfo / fetchBattleInfo） ---------- */
const fetchCurrentClubInfo = async (tokenId = selectedTokenId.value) => {
  if (!tokenStore.selectedToken) return null;
  const wsStatus = tokenStore.getWebSocketStatus(tokenId);
  if (wsStatus !== "connected") return null;
  try {
    const result = await tokenStore.sendMessageWithPromise(tokenId, "legion_getinfo", {}, 10000);
    if (selectedTokenId.value === tokenId && result) {
      currentClubInfo.value = result;
      return result;
    }
  } catch (error) {
    if (selectedTokenId.value === tokenId) {
      console.error("查询俱乐部信息失败:", error);
    }
  }
  return null;
};

const fetchBattleRecordsByDate = (val) => {
  if (val !== undefined && val !== null) {
    queryDate.value = val;
  } else {
    queryDate.value = getLastSunday();
  }
  battleInfo.value = null;
  opponentMembers.value = [];
  fetchBattleInfo();
};

/* 刷新按钮：旧版 @click 未传参即走 else 分支（重置为最近周日并重查） */
/* 刷新按钮：保留当前查询日期（旧 PeachInfo.vue 的 @click="fetchBattleInfo" 语义） */
const refreshByDate = () => {
  battleInfo.value = null;
  opponentMembers.value = [];
  fetchBattleInfo();
};

const fetchBattleInfo = async () => {
  if (!tokenStore.selectedToken) {
    message.warning("请先选择游戏角色");
    return;
  }
  const tokenId = tokenStore.selectedToken.id;
  const wsStatus = tokenStore.getWebSocketStatus(tokenId);
  if (wsStatus !== "connected") {
    message.error("WebSocket未连接，无法查询");
    return;
  }

  loading.value = true;
  opponentMembers.value = [];
  try {
    let opponentLegionId;
    let ownLegionId;
    let memberIds = [];
    let killRes;
    const shortDate = formatDateToShort(queryDate.value);
    const clubInfoResult = currentClubInfo.value || (await fetchCurrentClubInfo(tokenId));
    const ownClubInfo = clubInfoResult?.info;
    if (selectedTokenId.value !== tokenId) return;
    if (!ownClubInfo?.id) {
      message.error("未获取到当前账号俱乐部信息");
      return;
    }

    if (queryDate.value === getLastSunday() && isSundayBattleTime()) {
      // 周日 18:00-20:30 直播分支
      const res = await tokenStore.sendMessageWithPromise(tokenId, "legion_getpayloadbf", {}, 10000);
      if (!res || !res.legions) {
        message.error("未获取到战场信息");
        loading.value = false;
        return;
      }
      ownLegionId = ownClubInfo.id;
      opponentLegionId = res.legions[0].id;
      if (ownLegionId === opponentLegionId) {
        opponentLegionId = res.legions[1].id;
      }
      if (!opponentLegionId) {
        message.error("未获取到对战俱乐部ID");
        return;
      }
    } else {
      // 历史分支：task（结果不用）+ record + killrecord
      await tokenStore.sendMessageWithPromise(tokenId, "legion_getpayloadtask", {}, 10000);
      ownLegionId = ownClubInfo.id;
      const res = await tokenStore.sendMessageWithPromise(tokenId, "legion_getpayloadrecord", {}, 10000);
      if (!res || !res.enemyLegionMap) {
        message.warning("未获取到历史对战记录");
        loading.value = false;
        return;
      }
      const record = res.enemyLegionMap[shortDate];
      if (record) {
        opponentLegionId = record.id;
      } else {
        message.warning(`未找到 ${queryDate.value} 的对战记录`);
        loading.value = false;
        return;
      }
      if (!opponentLegionId) {
        message.error("未获取到对战俱乐部ID");
        return;
      }
    }

    killRes = await tokenStore.sendMessageWithPromise(
      tokenId,
      "legion_getpayloadkillrecord",
      { date: shortDate },
      10000,
    );
    if (killRes && killRes.recordsMap && killRes.recordsMap[opponentLegionId]) {
      memberIds = killRes.recordsMap[opponentLegionId].map((r) => r.roleInfo.roleId);
    }

    const ownLegionIdInfo = await tokenStore.sendMessageWithPromise(
      tokenId,
      "legion_getinfobyid",
      { legionId: ownLegionId },
      10000,
    );
    const clubInfoRes = await tokenStore.sendMessageWithPromise(
      tokenId,
      "legion_getinfobyid",
      { legionId: opponentLegionId },
      10000,
    );
    if (!clubInfoRes || !clubInfoRes.legionData) {
      message.error("无法获取对手俱乐部详情");
      loading.value = false;
      return;
    }
    console.debug("[蟠桃园信息] 对手 legionData 字段:", Object.keys(clubInfoRes.legionData), clubInfoRes.legionData);
    if (selectedTokenId.value !== tokenId) return;

    battleInfo.value = {
      ownClub: {
        id: ownLegionId,
        name: ownLegionIdInfo?.legionData?.name || "我方俱乐部",
        level: ownLegionIdInfo?.legionData?.level || 0,
        power: ownLegionIdInfo?.legionData?.power || 0,
        serverId: ownLegionIdInfo?.legionData?.serverId || "",
        logo: ownLegionIdInfo?.legionData?.logo || "",
        quenchNum: ownLegionIdInfo?.legionData?.quenchNum || 0,
        announcement: ownLegionIdInfo?.legionData?.announcement || "",
        memberCount: killRes.recordsMap[ownLegionId]?.length || 0,
      },
      opponentClub: {
        id: opponentLegionId,
        name: clubInfoRes?.legionData?.name || "敌方俱乐部",
        level: clubInfoRes?.legionData?.level || 0,
        power: clubInfoRes?.legionData?.power || 0,
        serverId: clubInfoRes?.legionData?.serverId || "",
        logo: clubInfoRes?.legionData?.logo || "",
        quenchNum: clubInfoRes?.legionData?.quenchNum || 0,
        announcement: clubInfoRes?.legionData?.announcement || "",
        memberCount: killRes.recordsMap[opponentLegionId]?.length || 0,
        enrolledCount: memberIds.length,
      },
    };

    if (memberIds.length === 0) {
      memberIds = Object.keys(clubInfoRes.legionData.members || {});
    }
    battleInfo.value.opponentClub.enrolledCount = memberIds.length;

    const totalMembers = memberIds.length;
    const chunkSize = 5;
    for (let i = 0; i < totalMembers; i += chunkSize) {
      const chunk = memberIds.slice(i, i + chunkSize);
      const promises = chunk.map(async (roleId) => {
        try {
          const roleRes = await tokenStore.sendMessageWithPromise(
            tokenId,
            "rank_getroleinfo",
            {
              roleId: parseInt(roleId),
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
            let totalRed = 0;
            const fishInfo = HeroFillInfo(roleRes.roleInfo);
            if (roleRes.roleInfo.heroes) {
              const heroes = Object.values(roleRes.roleInfo.heroes);
              heroList = heroes
                .map((h) => {
                  let heroRed = 0;
                  if (h.equipment) {
                    Object.values(h.equipment).forEach((eq) => {
                      if (eq.quenches) {
                        Object.values(eq.quenches).forEach((q) => {
                          if (q.colorId === 6) heroRed++;
                        });
                      }
                    });
                  }
                  totalRed += heroRed;
                  return {
                    heroId: h.heroId,
                    artifactId: h.artifactId || "",
                    heroName: HERO_DICT[h.heroId]?.name || "未知",
                    red: heroRed,
                    power: h.power,
                    battleTeamSlot: h.battleTeamSlot,
                    HolyBeast: h.hB?.active === true,
                    HBlevel: h.hB?.order || 0,
                    PearlInfo: fishInfo[h.artifactId] || {},
                  };
                })
                .sort((a, b) => a.battleTeamSlot - b.battleTeamSlot);
            }
            return {
              id: roleRes.roleInfo.roleId,
              name: roleRes.roleInfo.name,
              headImg: roleRes.roleInfo.headImg,
              power: roleRes.roleInfo.power,
              legacy: roleRes.roleInfo.legacy?.color || 0,
              redQuench: totalRed,
              heroList: heroList,
              lineupType: getLineupType(heroList),
              pet: getShowPet(roleRes),
              toyName: formatWeapon(roleRes.roleInfo.lordWeaponId) || "",
            };
          }
        } catch (e) {
          console.error(`Failed to fetch info for ${roleId}`, e);
          return null;
        }
      });
      const results = await Promise.all(promises);
      results.forEach((r) => {
        if (r) opponentMembers.value.push(r);
      });
    }

    if (selectedTokenId.value !== tokenId) return;
    opponentMembers.value.sort((a, b) => {
      if (b.redQuench !== a.redQuench) return b.redQuench - a.redQuench;
      return b.power - a.power;
    });
  } catch (error) {
    message.error(`获取数据失败: ${error.message}`);
    console.error(error);
  } finally {
    if (selectedTokenId.value === tokenId) {
      loading.value = false;
    }
  }
};

/* ---------- 对手信息（取数走公共 usePlayerInfo，展示走 PlayerSheet / HeroSheet） ---------- */
const fetchTargetInfo = async (roleId) => {
  if (!roleId) {
    message.error("玩家ID不存在，无法查询信息");
    return;
  }
  if (queryLoading.value) return;
  const fetched = await fetchPlayer(roleId);
  if (!fetched) return;
  playerSheet.value = true;
};
/* ---------- 一键切磋5次（照抄 handleBatchDuel，限频 400340 + 补跑逐字保留） ---------- */
const handleBatchDuel = async () => {
  if (!opponentMembers.value.length) {
    message.warning("请先加载对手列表");
    return;
  }
  if (!tokenStore.selectedToken) {
    message.warning("请先选择游戏角色");
    return;
  }
  const tokenId = tokenStore.selectedToken.id;
  const wsStatus = tokenStore.getWebSocketStatus(tokenId);
  if (wsStatus !== "connected") {
    message.error("WebSocket未连接，无法发起切磋");
    return;
  }

  batchDuelRunning.value = true;
  const init = {};
  opponentMembers.value.forEach((m) => {
    init[m.id] = { status: "pending", winRate: null, fullWinRate: null };
  });
  battleSimResults.value = init;

  const ROUNDS = 5;
  const RATE_LIMIT_CODE = 400340;
  const RETRY_SWEEP_DELAY = 15000;

  const doOneFight = async (roleId) => {
    try {
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        "fight_startpvp",
        { targetId: parseInt(roleId) },
        10000,
      );
      if (result && result.code === RATE_LIMIT_CODE) {
        console.warn("[一键切磋] 限频 400340，等待 11s 后重试");
        message.warning("触发限频，暂停11秒后重试…");
        await new Promise((r) => setTimeout(r, 11000));
        const retry = await tokenStore.sendMessageWithPromise(
          tokenId,
          "fight_startpvp",
          { targetId: parseInt(roleId) },
          10000,
        );
        if (retry && retry.code === RATE_LIMIT_CODE) return null;
        return retry;
      }
      return result;
    } catch (e) {
      const msg = e?.message || String(e);
      if (msg.includes(String(RATE_LIMIT_CODE))) {
        console.warn("[一键切磋] 限频异常，等待 11s 后重试");
        message.warning("触发限频，暂停11秒后重试…");
        await new Promise((r) => setTimeout(r, 11000));
        try {
          return await tokenStore.sendMessageWithPromise(
            tokenId,
            "fight_startpvp",
            { targetId: parseInt(roleId) },
            10000,
          );
        } catch {
          return null;
        }
      }
      console.warn(`[一键切磋] ${roleId} 单局异常`, e);
      return null;
    }
  };

  const runMember = async (roleId) => {
    battleSimResults.value = {
      ...battleSimResults.value,
      [roleId]: { status: "fighting", winRate: null, fullWinRate: null },
    };
    let wins = 0;
    let fullWins = 0;
    let timeout = false;
    for (let i = 0; i < ROUNDS; i++) {
      const result = await doOneFight(roleId);
      if (result === null) {
        timeout = true;
        break;
      }
      if (result && result.battleData) {
        const isWin = result.battleData.result?.isWin || false;
        let ourDie = 0;
        if (result.battleData.result?.sponsor?.teamInfo) {
          result.battleData.result.sponsor.teamInfo.forEach((item) => {
            if (item.hp == 0) ourDie++;
          });
        }
        if (isWin) {
          wins++;
          if (ourDie === 0) fullWins++;
        }
      }
      if (i < ROUNDS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    if (timeout) {
      battleSimResults.value = {
        ...battleSimResults.value,
        [roleId]: { status: "timeout", winRate: null, fullWinRate: null },
      };
      return false;
    }
    const winRate = Math.round((wins / ROUNDS) * 100);
    const fullWinRate = Math.round((fullWins / ROUNDS) * 100);
    battleSimResults.value = {
      ...battleSimResults.value,
      [roleId]: { status: "done", winRate, fullWinRate },
    };
    return true;
  };

  try {
    for (const member of opponentMembers.value) {
      await runMember(member.id);
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    const retryIds = opponentMembers.value
      .map((m) => m.id)
      .filter((id) => battleSimResults.value[id]?.status === "timeout");
    if (retryIds.length) {
      message.info(`补跑 ${retryIds.length} 个超时异常账号…`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_SWEEP_DELAY));
      let recovered = 0;
      for (const roleId of retryIds) {
        const ok = await runMember(roleId);
        if (ok) recovered++;
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      const stillFailed = retryIds.length - recovered;
      if (stillFailed > 0) {
        message.warning(`补跑完成：成功 ${recovered} 个，仍异常 ${stillFailed} 个`);
      } else {
        message.success(`补跑完成：${recovered} 个账号全部补齐`);
      }
    }
    message.success("一键切磋完成");
  } catch (e) {
    console.error("[一键挑战] 异常中止", e);
    message.error(`一键挑战中止: ${e.message}`);
  } finally {
    batchDuelRunning.value = false;
  }
};

/* ---------- 展示辅助 ---------- */
/* 头像加载失败回退官方图标（照抄旧版 NAvatar fallbackSrc） */
const onImgError = (e) => {
  e.target.src = "/icons/xiaoyugan.png";
};
const lineupTypeStyle = (type) => {
  const rule = LINEUP_RULES.find((r) => r.name === type);
  const p = rule?.colorProps || { color: "#f5f5f5", textColor: "#666" };
  return { background: p.color, color: p.textColor };
};
const simRateClass = (rate) => (rate >= 50 ? "sim-high" : "sim-low");
const onPetIconError = (e) => {
  e.target.style.display = "none";
};
const heroBg = (i) => {
  /* 同色相五档（--m-ava-1..5），保证相邻武将底色可区分又不引入第二强调色相；
     取变量是为了跟随主题换肤（原来是写死的五档蓝） */
  const grads = ["var(--m-ava-1)", "var(--m-ava-2)", "var(--m-ava-3)", "var(--m-ava-4)", "var(--m-ava-5)"];
  return grads[i % grads.length];
};

/* ---------- 导出图片（文件名照抄：蟠桃园敌方信息_${date}.png） ---------- */
const handleExportImage = async () => {
  if (!exportDom.value) {
    message.error("未找到要导出的内容");
    return;
  }
  let loadingMsg = null;
  try {
    isExporting.value = true;
    loadingMsg = message.loading("正在生成图片，请稍候...", { duration: 0 });
    await nextTick();
    const filename = `蟠桃园敌方信息_${String(queryDate.value).replace(/\//g, "-")}.png`;
    /* ★ flatten：导出目标是整块 .m-pane，长度远超一屏，而它又挂在 .m-scroll 这个滚动容器里。
       不摊平时 html2canvas 按滚动祖先的可视区裁剪 ⇒ 导出图中间整段留白、末尾只有半张卡
       （用户 11-02 反馈的现象）。摊平后克隆体挂到屏外容器、height:auto，与切磋结果导出同一条路。 */
    await exportDomAsImage(exportDom.value, filename, { flatten: true });
    message.success("图片导出成功");
  } catch (err) {
    console.error("DOM转图片失败：", err);
    message.error("导出图片失败，请重试");
  } finally {
    loadingMsg?.destroy?.();
    isExporting.value = false;
  }
};

/* 父级切回本子页时重新查询（等价旧版 v-if 重挂载） */
defineExpose({ refresh: () => refreshByDate() });

/* ---------- 生命周期（照抄） ---------- */
onMounted(() => {
  queryDate.value = getLastSunday();
  fetchCurrentClubInfo();
  fetchBattleInfo();
});

watch(selectedTokenId, (newTokenId, oldTokenId) => {
  if (!newTokenId || newTokenId === oldTokenId) return;
  currentClubInfo.value = null;
  battleInfo.value = null;
  opponentMembers.value = [];
  fetchCurrentClubInfo(newTokenId);
  fetchBattleInfo(newTokenId);
});
</script>

<script>
export default { name: "MobilePeachInfoPanel" };
</script>

<style scoped>

.m-mtitle { margin: 4px 2px 10px; font-size: 15px; font-weight: 700; color: var(--m-text); }
/* VS 头部 */
.m-vs { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center; }
.m-vs-c { min-width: 0; }
.m-vs-id { font-size: 10.5px; color: var(--m-text3); font-weight: 700; }
.m-vs-row { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; min-width: 0; }
.m-vs-sv { font-size: 10.5px; color: var(--m-text2); flex: none; font-weight: 700; }
.m-clogo-s { width: 26px; height: 26px; border-radius: 8px; flex: none; }
.m-clogo-s img { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; }
.m-vs-nm { font-size: 13px; font-weight: 700; color: var(--m-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-vs-st { font-size: 11px; color: var(--m-text2); font-weight: 700; }
.m-vs-anno { font-size: 10.5px; color: var(--m-text3); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-vs-badge {
  width: 34px; height: 34px; border-radius: var(--m-r-md); flex: none;
  display: flex; align-items: center; justify-content: center;
  font-size: 11.5px; font-weight: 700; color:var(--m-on-primary);
  background: var(--m-primary);
}
/* 阵容统计 chip 行 */
.m-chiprow { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 10px; }
.m-chiprow-l { font-size: 11.5px; font-weight: 700; color: var(--m-text2); }
/* 阵容类型 chip：贴卡片右上角（配色由 lineupTypeStyle 内联生成） */
.pi-badge {
  margin-left: auto; margin-top: 0; flex: none; max-width: 46%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* 玩具名：行动蓝（旧版为紫，规范禁第二强调色相） */
.pi-toy { color: var(--m-primary); }
/* 宠物图标 */
.pi-pet-ic { width: 18px; height: 18px; border-radius: 4px; vertical-align: -3px; margin-right: 3px; object-fit: cover; }
/* 阵容块：标签在上，武将小卡换行排列（照抄旧版 lineup-hero-card） */
.pi-lineup { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; min-width: 0; }
.pi-lineup-none { font-size: 12px; color: var(--m-text3); }
.pi-lineup-wrap { display: flex; flex-wrap: wrap; gap: 5px; min-width: 0; }
.pi-hero {
  display: flex; flex-direction: column; gap: 1px;
  background: var(--m-bg); border: 1px solid var(--m-border); border-radius: 8px;
  padding: 4px 8px; min-width: 0;
}
.pi-hero-n { font-size: 11px; font-weight: 700; color: var(--m-text); white-space: nowrap; }
.pi-hero-r { font-style: normal; color: var(--m-red); margin-left: 2px; }
.pi-hero-hb { font-style: normal; color: var(--m-green); margin-left: 4px; font-size: 10px; }
.pi-hero-p { font-size: 10px; color: var(--m-text2); white-space: nowrap; }
.pi-hero-p i { font-style: normal; }
/* 战斗模拟 5 次 */
.m-sim-none, .m-sim-wait, .m-sim-fight, .m-sim-to, .m-sim-lose, .m-sim-win, .m-sim-full { font-size: 11px; }
.m-sim-none { color: var(--m-text3); font-weight: 400; }
.m-sim-wait { color: var(--m-text2); font-weight: 700; }
.m-sim-fight { color: var(--m-blue); font-weight: 700; }
.m-sim-to { color: var(--m-amber); font-weight: 700; }
.m-sim-lose { color: var(--m-red); font-weight: 700; }
.m-sim-win { font-weight: 700; }
.m-sim-win.sim-high { color: var(--m-green); }
.m-sim-win.sim-low { color: var(--m-red); }
.m-sim-full { color: var(--m-blue); font-weight: 700; margin-left: 6px; }
</style>

