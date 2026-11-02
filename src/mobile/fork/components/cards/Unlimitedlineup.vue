<template>
  <MyCard class="lineup-saver" :statusClass="{ active: state.isRunning }">
    <template #icon>
      <img
        src="/icons/Ob7pyorzmHiJcbab2c25af264d0758b527bc1b61cc3b.png"
        alt="阵容图标"
      />
    </template>
    <template #title>
      <h3>云阵容</h3>
      <p>云端存阵容，一键切回</p>
    </template>
    <template #badge>
      <span>{{ state.isRunning ? "运行中" : `${currentTeamHeroes.length}/5 名武将` }}</span>
    </template>
    <template #default>
      <div class="lu">
        <!-- ================= 当前阵容 =================
             只读展示：这张卡不再提供上阵 / 下阵 / 更换 / 拖拽。
             站位顺序 = 游戏里的 battleTeamSlot，点某张武将卡看的是「装备淬炼详情」，
             真正的阵容改动请在游戏内做，这里只负责「存 / 取 / 应用」。 -->
        <section class="lu-blk">
          <div class="lu-hd">
            <div class="lu-hd-t">当前阵容</div>
            <div class="lu-hd-x">当前卡槽 · {{ currentTeamId }}号槽</div>
          </div>

          <div class="lu-heroes">
            <div
              v-for="slot in teamSlots"
              :key="'cur-' + slot.position"
              class="lu-hero"
              :class="{ 'is-empty': !slot.heroId }"
              @click="openHeroSheet(slot)"
            >
              <div class="lu-hero-pic">
                <template v-if="slot.heroId">
                  <div v-if="slotText(slot)" class="lu-hero-badge">
                    {{ slotText(slot) }}
                  </div>
                  <img
                    v-if="getHeroAvatar(slot.heroId)"
                    :src="getHeroAvatar(slot.heroId)"
                    :alt="getHeroName(slot.heroId) || ''"
                  />
                  <div v-else class="lu-hero-ph">
                    {{ (getHeroName(slot.heroId) || "武将").slice(0, 2) }}
                  </div>
                  <div class="lu-hero-lv">Lv.{{ slot.level || "?" }}</div>
                </template>
                <div v-else class="lu-hero-empty">+</div>
              </div>
              <div class="lu-hero-nm">
                {{
                  slot.heroId
                    ? getHeroName(slot.heroId) || `武将${slot.heroId}`
                    : "空位"
                }}
              </div>
              <div class="lu-hero-tg">
                {{ slot.heroId ? heroTagText(slot) : "" }}
              </div>
            </div>
          </div>

          <div class="lu-chips" v-if="lordWeaponName || petName">
            <div class="lu-chip">
              <div class="lu-chip-ic"><MIcon name="crown" :size="15" /></div>
              <div class="lu-chip-tx">
                <div class="lu-chip-k">主公玩具</div>
                <div class="lu-chip-v">{{ lordWeaponName || "未装备" }}</div>
              </div>
            </div>
            <div class="lu-chip">
              <div class="lu-chip-ic"><MIcon name="star" :size="15" /></div>
              <div class="lu-chip-tx">
                <div class="lu-chip-k">宠物</div>
                <div class="lu-chip-v">{{ petName || "未上阵" }}</div>
              </div>
            </div>
          </div>

          <button
            class="lu-save"
            :disabled="!currentTeamHeroes.length || loading"
            @click="saveCurrentLineup"
          >
            <MIcon name="check" :size="15" />
            <div class="lu-save-tx">保存当前阵容</div>
          </button>
        </section>

        <!-- ================= 已保存阵容 =================
             槽位切换 = 真的切游戏里的卡槽（presetteam_saveteam），
             因为 applyLineup 只在「阵容卡槽 == 当前卡槽」时才允许应用。 -->
        <section class="lu-blk">
          <div class="lu-hd">
            <div class="lu-hd-t">已保存阵容</div>
            <div class="lu-hd-x">共 {{ savedLineups.length }} 套</div>
          </div>

          <div class="lu-slotbar">
            <div class="lu-slots">
              <button
                v-for="t in availableTeams"
                :key="'slot-' + t"
                class="lu-slot"
                :class="{ on: selectedTeamTab === t, cur: currentTeamId === t }"
                :disabled="switchingTeamId !== null"
                @click="pickSlot(t)"
              >
                {{ t }}
              </button>
            </div>
            <button
              class="lu-iconbtn"
              :disabled="loading"
              title="刷新数据"
              @click="refreshTeamInfo()"
            >
              <MIcon name="refresh" :size="15" />
            </button>
          </div>

          <p class="lu-hint" v-if="selectedTeamTab !== currentTeamId || slotLineups.length">
            <template v-if="selectedTeamTab !== currentTeamId">
              正在看 {{ selectedTeamTab }} 号槽，点上方槽位可切过去
            </template>
            <template v-else>
              槽位 {{ currentTeamId }} · {{ slotLineups.length }} 套，点「应用」写回游戏
            </template>
          </p>

          <div v-if="!slotLineups.length" class="lu-empty">
            <div class="lu-empty-t">这个卡槽还没有阵容</div>
            <div class="lu-empty-s">
              先把游戏里想要的阵容摆好，再点上面的「保存当前阵容」
            </div>
          </div>

          <div v-else class="lu-list">
            <article
              class="lu-item"
              v-for="lineup in slotLineups"
              :key="lineup.id || lineup.savedAt"
            >
              <div class="lu-item-hd">
                <div class="lu-item-nm">{{ lineup.name }}</div>
                <div class="lu-item-tm">{{ formatTime(lineup.savedAt) }}</div>
              </div>

              <div class="lu-heroes is-mini">
                <div
                  v-for="slot in lineupSlots(lineup)"
                  :key="'l-' + slot.position"
                  class="lu-hero"
                  :class="{ 'is-empty': !slot.heroId }"
                  @click="openHeroSheet(slot)"
                >
                  <div class="lu-hero-pic">
                    <template v-if="slot.heroId">
                      <div v-if="slotText(slot)" class="lu-hero-badge">
                        {{ slotText(slot) }}
                      </div>
                      <img
                        v-if="getHeroAvatar(slot.heroId)"
                        :src="getHeroAvatar(slot.heroId)"
                        :alt="getHeroName(slot.heroId) || ''"
                      />
                      <div v-else class="lu-hero-ph">
                        {{ (getHeroName(slot.heroId) || "武将").slice(0, 2) }}
                      </div>
                      <div class="lu-hero-lv">Lv.{{ slot.level || "?" }}</div>
                    </template>
                    <div v-else class="lu-hero-empty">+</div>
                  </div>
                  <div class="lu-hero-nm">
                    {{
                      slot.heroId
                        ? getHeroName(slot.heroId) || `武将${slot.heroId}`
                        : "空位"
                    }}
                  </div>
                  <div class="lu-hero-tg">
                    {{ slot.heroId ? heroTagText(slot) : "" }}
                  </div>
                </div>
              </div>

              <div class="lu-chips is-mini" v-if="lineup.weaponId || lineup.petId">
                <div class="lu-chip">
                  <div class="lu-chip-ic"><MIcon name="crown" :size="14" /></div>
                  <div class="lu-chip-tx">
                    <div class="lu-chip-k">主公玩具</div>
                    <div class="lu-chip-v">
                      {{ weapon[lineup.weaponId] || "未装备" }}
                    </div>
                  </div>
                </div>
                <div class="lu-chip">
                  <div class="lu-chip-ic"><MIcon name="star" :size="14" /></div>
                  <div class="lu-chip-tx">
                    <div class="lu-chip-k">宠物</div>
                    <div class="lu-chip-v">
                      {{ petNameOf(lineup.petId) || "未上阵" }}
                    </div>
                  </div>
                </div>
              </div>

              <div class="lu-acts">
                <button
                  class="lu-act is-p"
                  :disabled="
                    lineup.applying ||
                    lineup.teamId !== currentTeamId ||
                    state.isRunning
                  "
                  @click="applyLineup(lineup)"
                >
                  {{ lineup.applying ? "应用中" : "应用" }}
                </button>
                <button
                  class="lu-act"
                  :disabled="lineup.teamId !== currentTeamId || loading"
                  @click="overwriteLineup(lineup)"
                >
                  覆盖当前
                </button>
                <button
                  class="lu-act"
                  @click="renameLineup(savedLineups.indexOf(lineup))"
                >
                  重命名
                </button>
                <button
                  class="lu-act is-d"
                  @click="deleteLineup(savedLineups.indexOf(lineup))"
                >
                  删除
                </button>
              </div>

              <button
                class="lu-more"
                :disabled="
                  !lineup.legionResearch ||
                  Object.keys(lineup.legionResearch).length === 0
                "
                @click="showTechModal(lineup)"
              >
                查看俱乐部科技配置
                <MIcon name="chevron" :size="13" />
              </button>
            </article>
          </div>

          <div class="lu-tools">
            <button class="lu-mini" @click="exportLineups">导出全部</button>
            <button class="lu-mini" @click="pickImportFile">导入文件</button>
            <input
              ref="importInput"
              type="file"
              accept=".json"
              hidden
              @change="onImportFile"
            />
          </div>
        </section>
      </div>

      <n-modal
        v-model:show="techModalVisible"
        preset="card"
        title="俱乐部科技"
        style="width: 700px; max-width: 90vw"
        :bordered="false"
      >
        <div v-if="selectedTechData" class="tech">
          <!-- 按职业分 tab（用户口径 11-01）：6 个职业各 14 项，平铺要滚三四屏 -->
          <div class="tech-tabs">
            <button
              v-for="type in TECH_TYPES"
              :key="'tt-' + type"
              class="tech-tab"
              :class="{ on: techTab === type }"
              @click="techTab = type"
            >
              {{ LEGION_TECH_TYPE_NAME[type] }}
            </button>
          </div>
          <div class="tech-grid">
            <div
              v-for="techId in LEGION_TECH_TYPE_MAP[techTab]"
              :key="techId"
              class="tech-row"
            >
              <div class="tech-name">{{ LEGION_TECH_NAME[techId] }}</div>
              <b
                class="tech-level"
                :class="{ max: (selectedTechData[techId] || 0) >= LEGION_TECH_MAX_LEVEL[techId] }"
              >
                {{ selectedTechData[techId] || 0 }}<em>/{{ LEGION_TECH_MAX_LEVEL[techId] }}</em>
              </b>
            </div>
          </div>
        </div>
        <div v-else class="no-tech-data">暂无科技数据</div>
      </n-modal>

      <!-- 武将详情：属性 + 洗练，从底部抽屉上来（用户口径 11-01：不要对话框）。
           当前阵容与已保存阵容共用这一个抽屉：已保存的条目自带 equipment，不用再取数。 -->
      <template v-if="heroSheetVisible">
        <div class="lu-mask" @click="closeHeroSheet"></div>
        <div class="lu-sheet">
          <div class="lu-sheet-hd">
            <div class="lu-sheet-av">
              <img
                v-if="getHeroAvatar(heroSheetHero?.heroId)"
                :src="getHeroAvatar(heroSheetHero?.heroId)"
                :alt="getHeroName(heroSheetHero?.heroId) || ''"
              />
              <div v-else class="lu-sheet-av-ph">
                {{ (getHeroName(heroSheetHero?.heroId) || "武将").slice(0, 2) }}
              </div>
            </div>
            <div class="lu-sheet-id">
              <div class="lu-sheet-nm">
                {{ getHeroName(heroSheetHero?.heroId) || `武将${heroSheetHero?.heroId}` }}
              </div>
              <div class="lu-sheet-sub">
                <template v-if="heroSheetHero?.level">Lv.{{ heroSheetHero.level }}</template>
                <template v-if="slotText(heroSheetHero)">
                  · {{ slotText(heroSheetHero) }}位
                </template>
                <template v-if="heroTagText(heroSheetHero)">
                  · {{ heroTagText(heroSheetHero) }}
                </template>
              </div>
            </div>
            <button class="lu-sheet-x" @click="closeHeroSheet">
              <MIcon name="close" :size="16" />
            </button>
          </div>

          <div class="lu-sheet-bd">
            <div class="lu-stats">
              <div class="lu-stat" v-for="s in heroSheetStats" :key="s.k">
                <div class="lu-stat-k">{{ s.k }}</div>
                <div class="lu-stat-v">{{ s.v }}</div>
              </div>
            </div>

            <div class="lu-sub-h">装备洗练</div>
            <div v-if="heroSheetEquip" class="lu-parts">
              <div class="lu-part" v-for="partId in [1, 2, 3, 4]" :key="partId">
                <div class="lu-part-hd">
                  <div class="lu-part-nm">{{ partMap[partId] }}</div>
                  <div class="lu-part-lv">
                    Lv.{{ heroSheetEquip[partId]?.level || 0 }}
                  </div>
                  <div class="lu-part-bn" v-if="equipBonusOf(heroSheetEquip, partId)">
                    +{{ equipBonusOf(heroSheetEquip, partId) }}
                    {{ EQUIP_BONUS_NAME[partId] }}
                  </div>
                </div>
                <div class="lu-quench">
                  <div
                    v-for="slot in equipSlotsOf(heroSheetEquip, partId)"
                    :key="slot.id"
                    class="lu-slot-c"
                    :class="{ empty: !slot.attrId }"
                  >
                    <div class="lu-slot-c-nm">
                      {{ slot.attrId ? getAttrName(slot.attrId) : "未淬炼" }}
                    </div>
                    <div class="lu-slot-c-v" v-if="slot.attrId">
                      +{{ slot.attrNum }}%
                    </div>
                    <div
                      class="lu-slot-dot"
                      v-if="slot.colorId"
                      :style="{ background: QUENCH_COLOR[slot.colorId] || 'transparent' }"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
            <div v-else-if="heroSheetLoading" class="lu-sheet-empty">读取装备中…</div>
            <div v-else class="lu-sheet-empty">
              这条存档没有记录装备洗练，重新保存一次就有了
            </div>
          </div>
        </div>
      </template>

      <!-- 应用进度：全程盖住屏幕，说清「进行到哪一步 / 下一步是什么」。
           用户口径（11-01）：过程提示不要顶部 toast，要弹层；步骤表对齐 云阵容.js。 -->
      <div v-if="applyPhase >= 0" class="lu-pg-mask">
        <div class="lu-pg">
          <div class="lu-pg-hd">
            <span class="lu-pg-t">{{ applyResult ? (applyResult === "ok" ? "应用完成" : "应用失败") : "正在应用阵容" }}</span>
            <span class="lu-pg-c">{{ applyPhase + 1 }}/{{ APPLY_PHASES.length }}</span>
          </div>
          <p class="lu-pg-nm">{{ applyLineupName }}</p>

          <template v-if="!applyResult">
            <div class="lu-pg-step">
              {{ applyPhaseLabel }}
              <em v-if="applyNote">{{ applyNote }}</em>
            </div>
            <div class="lu-pg-next">
              {{ applyNextLabel ? `下一步：${applyNextLabel}` : "最后一步" }}
            </div>
            <div class="lu-pg-bar"><i :style="{ width: applyPercent + '%' }"></i></div>
            <div class="lu-pg-pct">{{ applyPercent }}%</div>
          </template>

          <template v-else-if="applyResult === 'ok'">
            <div class="lu-pg-tags">
              <span v-for="s in applySummary" :key="s" class="lu-pg-tag">{{ s }}</span>
              <span v-if="!applySummary.length" class="lu-pg-tag">与存档一致，无需改动</span>
            </div>
            <button class="lu-pg-btn" @click="closeApplyProgress">完成</button>
          </template>

          <template v-else>
            <div class="lu-pg-err">{{ applyError }}</div>
            <button class="lu-pg-btn" @click="closeApplyProgress">关闭</button>
          </template>
        </div>
      </div>
    </template>
  </MyCard>
</template>

<script setup>
import { ref, computed, onMounted, watch, h } from "vue";
import { useMessage, useDialog, NInput } from "naive-ui";
import { confirmDanger, confirmAction } from "@/mobile/utils/confirm";
import { useTokenStore } from "@/stores/tokenStore";
import MyCard from "../Common/MyCard.vue";
import MIcon from "@/mobile/components/MIcon.vue";
import { PET_DICT } from "@/utils/PetList.js";
import {
  HERO_DICT,
  FishMap,
  PearlMap,
  LEGION_TECH_MAX_LEVEL,
  LEGION_TECH_TYPE_MAP,
  LEGION_TECH_RESET_TYPE_MAP,
  LEGION_TECH_TYPE_NAME,
  LEGION_TECH_NAME,
  getTechType,
  weapon,
} from "@/utils/HeroList.js";

const tokenStore = useTokenStore();
const message = useMessage();
const dialog = useDialog();

const loading = ref(false);
const switchingTeamId = ref(null);
const currentTeamId = ref(1);
const availableTeams = ref([1, 2, 3, 4, 5, 6]);
const currentTeamInfo = ref(null);
const presetTeamData = ref(null);
const savedLineups = ref([]);
const allHeroesData = ref({});
const roleHeroesData = ref({});
const artifactBooks = ref({});
const pearlMap = ref({});
let lastRefreshTime = 0;
const REFRESH_DEBOUNCE = 3000;
/* ★ 发包间隔对齐 `public/game/features/云阵容.js`（可读源 E:\xyzw_server\云阵容_readable.js）：
   那边 COMMAND_DELAY = 100。装备 / 鱼灵 / 鱼珠 / 玩具 / 宠物这些域游戏侧**没有**任何节流
   （全 bundle 的 `_readySendMsg` 只服务盐场），原来写 500ms 会把「应用阵容」拖到几十秒。 */
const COMMAND_DELAY = 100;
/* 俱乐部科技是唯一可能连发几十次的域（每级一次 research），单独再压一档 */
const RESEARCH_DELAY = 50;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatPower = (power) => {
  if (!power) return "0";
  if (power >= 100000000) {
    return (power / 100000000).toFixed(2) + "亿";
  }
  if (power >= 10000) {
    return (power / 10000).toFixed(2) + "万";
  }
  return power.toString();
};

const generateLineupId = () => {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const state = ref({
  isRunning: false,
});

/* 武将详情抽屉：属性 + 洗练。当前阵容的装备在 allHeroesData 里，
   已保存的条目自带 equipment ⇒ 绝大多数情况不用再取数。 */
const heroSheetVisible = ref(false);
const heroSheetHero = ref(null);
const heroSheetEquip = ref(null);
const heroSheetLoading = ref(false);

/* 洗练颜色：white/green/blue/purple/orange/red —— 直接拿 Hex，白孔在卡片上要看得见 */
const QUENCH_COLOR = {
  1: "#c9ced6",
  2: "#52c41a",
  3: "#1890ff",
  4: "#722ed1",
  5: "#fa8c16",
  6: "#f5222d",
};
const EQUIP_BONUS_KEY = {
  1: "quenchAttackExt",
  2: "quenchHpExt",
  3: "quenchDefenseExt",
  4: "quenchHpExt",
};
const EQUIP_BONUS_NAME = { 1: "攻击", 2: "血量", 3: "防御", 4: "血量" };

/* 已保存阵容里「正在看哪个卡槽」：可以和游戏当前卡槽不同（切过去要发 presetteam_saveteam） */
const selectedTeamTab = ref(1);
const techModalVisible = ref(false);
const selectedTechData = ref(null);
/* 俱乐部科技的 tab：6 个职业，14 项/职业 */
const TECH_TYPES = [1, 2, 3, 4, 5, 6];
const techTab = ref(1);
const importInput = ref(null);
/* 主公玩具 / 宠物：跟着当前卡槽走，用来填「当前阵容」下面那两颗胶囊 */
const currentTeamWeaponId = ref(null);
const currentPetId = ref(null);

const STORAGE_KEY = "saved_lineups";

const syncLegionResearch = async (tokenId, targetResearch) => {
  if (!targetResearch || Object.keys(targetResearch).length === 0) {
    return { success: true, message: "无科技数据需要同步" };
  }

  const roleInfo = await tokenStore.sendMessageWithPromise(
    tokenId,
    "role_getroleinfo",
    {},
  );
  await delay(RESEARCH_DELAY);
  const role = roleInfo?.role || roleInfo;
  const currentResearch = role?.legionResearch || {};

  const typesToReset = new Set();
  const typesToResetResearch = new Set();

  for (const type of [1, 2, 3, 4, 5, 6]) {
    const techIds = LEGION_TECH_RESET_TYPE_MAP[type];
    for (const techId of techIds) {
      const currentLevel = currentResearch[techId] || 0;
      const targetLevel = targetResearch[techId] || 0;
      if (
        currentLevel !== targetLevel &&
        (currentLevel > 0 || targetLevel > 0)
      ) {
        typesToResetResearch.add(type);
        break;
      }
    }
    const techIds2 = LEGION_TECH_TYPE_MAP[type];
    for (const techId of techIds2) {
      const currentLevel = currentResearch[techId] || 0;
      const targetLevel = targetResearch[techId] || 0;
      if (
        currentLevel !== targetLevel &&
        (currentLevel > 0 || targetLevel > 0)
      ) {
        typesToReset.add(type);
        break;
      }
    }
  }

  if (typesToResetResearch.size === 0 && typesToReset.size === 0) {
    return { success: true, message: "科技配置已匹配，无需调整" };
  }

  const errors = [];

  for (const type of typesToResetResearch) {
    try {
      await tokenStore.sendMessageWithPromise(tokenId, "legion_resetresearch", {
        advanced: false,
        type: type,
      });
    } catch (err) {}
    await delay(RESEARCH_DELAY);
  }

  const sortedTypes = [...typesToReset].sort((a, b) => a - b);
  console.log(sortedTypes);

  for (const type of sortedTypes) {
    const techIds2 = LEGION_TECH_TYPE_MAP[type];
    for (const techId of techIds2) {
      const targetLevel = targetResearch[techId] || 0;
      if (targetLevel > 0) {
        const maxLevel = LEGION_TECH_MAX_LEVEL[techId];
        const isMax = targetLevel >= maxLevel;
        if (isMax) {
          try {
            await tokenStore.sendMessageWithPromise(
              tokenId,
              "legion_research",
              {
                isMax: true,
                researchId: techId,
              },
            );
          } catch (err) {}
          await delay(RESEARCH_DELAY);
        } else {
          for (let i = 0; i < targetLevel; i++) {
            try {
              await tokenStore.sendMessageWithPromise(
                tokenId,
                "legion_research",
                {
                  isMax: false,
                  researchId: techId,
                },
              );
            } catch (err) {}
            await delay(RESEARCH_DELAY);
          }
        }
      }
    }
  }

  return { success: true, message: "科技配置已同步" };
};

const partMap = {
  1: "武器",
  2: "铠甲",
  3: "头冠",
  4: "坐骑",
};

const attrMap = {
  1: "攻击",
  2: "血量",
  3: "防御",
  4: "速度",
  5: "破甲",
  6: "破甲抵抗",
  7: "精准",
  8: "格挡",
  9: "减伤",
  10: "暴击",
  11: "暴击抵抗",
  12: "爆伤",
  13: "爆伤抵抗",
  14: "技能伤害",
  15: "免控",
  16: "眩晕免疫",
  17: "冰冻免疫",
  18: "沉默免疫",
  19: "流血免疫",
  20: "中毒免疫",
  21: "灼烧免疫",
};

const getFishInfo = (artifactId) => {
  if (!artifactId || artifactId === -1) return null;

  for (const [fishId, book] of Object.entries(artifactBooks.value)) {
    if (book.artifactId === artifactId) {
      const fishData = FishMap[fishId];
      if (fishData) {
        return {
          fishId: Number(fishId),
          name: fishData.name,
          artifactId: book.artifactId,
          star: book.claimedStar || 0,
        };
      }
    }
  }
  return null;
};

const getFishNameByArtifactId = (artifactId) => {
  const fishInfo = getFishInfo(artifactId);
  return fishInfo ? fishInfo.name : null;
};

const getFishNameById = (fishId) => {
  if (!fishId) return null;
  const fishData = FishMap[fishId];
  return fishData ? fishData.name : `鱼灵${fishId}`;
};

const getPearlSkillNameById = (skillId) => {
  if (!skillId) return null;
  const skillData = PearlMap[skillId];
  return skillData ? skillData.name : null;
};

const getPearlDataByArtifactId = (artifactId) => {
  if (!artifactId || artifactId === -1) return null;
  for (const [pearlId, pearlData] of Object.entries(pearlMap.value)) {
    if (pearlData.artifactId === artifactId) {
      return pearlData;
    }
  }
  return null;
};

const getPearlSkillNameByArtifactId = (artifactId) => {
  const pearlData = getPearlDataByArtifactId(artifactId);
  if (!pearlData || !pearlData.skillId) return null;
  const skillData = PearlMap[pearlData.skillId];
  return skillData ? skillData.name : null;
};

const currentTeamHeroes = computed(() => {
  if (!currentTeamInfo.value) return [];
  const teamInfo = currentTeamInfo.value;
  return Object.entries(teamInfo)
    .map(([key, hero]) => {
      const heroData = roleHeroesData.value[String(hero?.heroId || hero?.id)];
      return {
        position: hero?.battleTeamSlot ?? Number(key),
        heroId: hero?.heroId || hero?.id,
        level: hero?.level || null,
        artifactId: hero?.artifactId || null,
        attachmentUid: hero?.attachmentUid || null,
        power: heroData?.power || null,
        attack: heroData?.attack || null,
        hp: heroData?.hp || null,
        speed: heroData?.speed || null,
      };
    })
    .filter((h) => h.heroId)
    .sort((a, b) => a.position - b.position);
});

const getLineupsByTeamId = (teamId) => {
  return savedLineups.value.filter((lineup) => lineup.teamId === teamId);
};

/* 位移视图：固定 5 格，空位也画出来（参考图里就是 5 个坑，缺人留加号） */
const teamSlots = computed(() => {
  const out = [];
  for (let i = 0; i < 5; i++) {
    const hit = currentTeamHeroes.value.find((h) => Number(h.position) === i);
    out.push(hit || { position: i, heroId: null });
  }
  return out;
});

/* 已保存的阵容按数组顺序铺满 5 格：position 只是记录，不能因为对不上就少画一个人 */
const lineupSlots = (lineup) => {
  const list = Array.isArray(lineup?.heroes) ? lineup.heroes : [];
  const used = new Set();
  const out = [];
  for (let i = 0; i < 5; i++) {
    let hit = list.find((h) => Number(h.position) === i && !used.has(h));
    if (!hit) hit = list.find((h) => !used.has(h));
    if (hit) used.add(hit);
    /* position 统一按格子序号写：老存档里有 1 起算的，不能让左上角出现「6号」「0号」 */
    out.push(hit ? { ...hit, position: i } : { position: i, heroId: null });
  }
  return out;
};

/* 左上角那颗小药丸 = 站位（1号~5号），对应游戏里的 battleTeamSlot。
   ★ 用户口径（11-01）：标的是「几号位」，不是星级 —— 星级游戏里一眼能看到，站位才是阵容的骨架。 */
const slotText = (hero) =>
  hero?.heroId ? `${Number(hero.position ?? 0) + 1}号` : "";

/* 名字下面那行小字 = 鱼灵 · 珍珠技能。
   当前阵容从 artifactId 反查；已保存的阵容直接用存下来的 fishId / skillId。
   ★ 5 格并排在手机上只有 60px，「龙鱼·幽影·碎盾」这种全名必然被截成「龙鱼·幽影·…」（技能全丢），
     所以鱼名去掉「龙鱼·」前缀，只留后半截：「幽影·碎盾」，一眼能认。 */
const shortFishName = (name) => (name && name.includes("·") ? name.split("·").pop() : name);
const heroTagText = (hero) => {
  if (!hero?.heroId) return "";
  const fish = hero.fishId
    ? getFishNameById(hero.fishId)
    : getFishNameByArtifactId(hero.artifactId);
  const skill = hero.skillId
    ? getPearlSkillNameById(hero.skillId)
    : getPearlSkillNameByArtifactId(hero.artifactId);
  return [shortFishName(fish), skill].filter(Boolean).join("·");
};

const petNameOf = (petId) =>
  petId ? PET_DICT[petId]?.name || `宠物${petId}` : "";
const lordWeaponName = computed(() => weapon[currentTeamWeaponId.value] || "");
const petName = computed(() => petNameOf(currentPetId.value));
const slotLineups = computed(() => getLineupsByTeamId(selectedTeamTab.value));

/* 点槽位 = 真的把游戏切到那个卡槽（presetteam_saveteam）。
   applyLineup 只在「阵容卡槽 == 当前卡槽」时才允许写回，所以浏览别的槽位必须先切过去。 */
const pickSlot = async (teamId) => {
  if (switchingTeamId.value !== null) return;
  if (teamId === currentTeamId.value) {
    selectedTeamTab.value = teamId;
    return;
  }
  await switchTeam(teamId);
  selectedTeamTab.value = currentTeamId.value;
};

/* 导入沿用原来的 importLineups（它读 file.file） */
const pickImportFile = () => importInput.value?.click();
const onImportFile = (e) => {
  const file = e.target?.files?.[0];
  if (file) importLineups({ file: { file } });
  e.target.value = "";
};

const getHeroName = (heroId) => {
  if (!heroId) return null;
  return HERO_DICT[heroId]?.name || null;
};

const getHeroAvatar = (heroId) => {
  if (!heroId) return null;
  return HERO_DICT[heroId]?.avatar || null;
};

const formatTime = (timestamp) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const getAttrName = (attrId) => {
  return attrMap[attrId] || `属性${attrId}`;
};

const openHeroSheet = async (hero) => {
  if (!hero?.heroId) return;
  heroSheetHero.value = hero;
  heroSheetEquip.value = hero.equipment || null;
  heroSheetVisible.value = true;
  /* 存档里带了装备就直接用，别为了看一眼洗练再跑一趟 role_getroleinfo */
  if (heroSheetEquip.value) return;

  const token = tokenStore.selectedToken;
  if (!token) return;
  const tokenId = token.id;
  if (tokenStore.getWebSocketStatus(tokenId) !== "connected") return;

  const cached = allHeroesData.value[String(hero.heroId)]?.equipment;
  if (cached) {
    heroSheetEquip.value = cached;
    return;
  }

  heroSheetLoading.value = true;
  try {
    const roleInfo = await tokenStore.sendMessageWithPromise(
      tokenId,
      "role_getroleinfo",
      {},
    );
    const role = roleInfo?.role || roleInfo;
    allHeroesData.value = role?.heroes || {};
    heroSheetEquip.value =
      allHeroesData.value[String(hero.heroId)]?.equipment || null;
  } catch (error) {
    /* 取不到就只显示属性，下面会给一句提示 */
  } finally {
    heroSheetLoading.value = false;
  }
};

const closeHeroSheet = () => {
  heroSheetVisible.value = false;
  heroSheetHero.value = null;
  heroSheetEquip.value = null;
  heroSheetLoading.value = false;
};

/* 属性行：与存档条目存的字段一一对应（power / attack / hp / speed） */
const heroSheetStats = computed(() => {
  const h = heroSheetHero.value;
  if (!h) return [];
  /* 老存档只存了战力 ⇒ 缺的项画「—」，别写成 0 误导人 */
  return [
    { k: "战力", v: h.power ? formatPower(h.power) : "—" },
    { k: "攻击", v: h.attack ? formatPower(h.attack) : "—" },
    { k: "血量", v: h.hp ? formatPower(h.hp) : "—" },
    { k: "速度", v: h.speed ? String(h.speed) : "—" },
  ];
});

const equipBonusOf = (equip, partId) =>
  Number(equip?.[partId]?.[EQUIP_BONUS_KEY[partId]] || 0);

/* 一个部位固定 5 孔：没淬炼的也画出来，5 个并排才齐整 */
const equipSlotsOf = (equip, partId) => {
  const quenches = equip?.[partId]?.quenches || {};
  const out = [];
  for (let i = 1; i <= 5; i++) {
    const slot = quenches[i] || quenches[String(i)] || null;
    out.push({
      id: i,
      attrId: slot?.attrId || null,
      attrNum: slot?.attrNum || 0,
      isLocked: !!(slot?.isLocked || slot?.locked),
      colorId: slot?.colorId || 0,
    });
  }
  return out;
};
const loadSavedLineups = () => {
  try {
    const token = tokenStore.selectedToken;
    if (!token) return;
    const key = `${STORAGE_KEY}_${token.id}`;
    const data = localStorage.getItem(key);
    if (data) {
      savedLineups.value = JSON.parse(data);
    } else {
      savedLineups.value = [];
    }
  } catch (e) {
    console.error("加载保存的阵容失败:", e);
    savedLineups.value = [];
  }
};

const saveLineupsToStorage = () => {
  try {
    const token = tokenStore.selectedToken;
    if (!token) return;
    const key = `${STORAGE_KEY}_${token.id}`;
    localStorage.setItem(key, JSON.stringify(savedLineups.value));
  } catch (e) {
    console.error("保存阵容到缓存失败:", e);
    message.error("保存阵容失败");
  }
};

const refreshTeamInfo = async (silent = false) => {
  const now = Date.now();
  if (now - lastRefreshTime < REFRESH_DEBOUNCE) {
    return;
  }
  lastRefreshTime = now;

  const token = tokenStore.selectedToken;
  if (!token) {
    message.warning("请先选择Token");
    return;
  }

  const tokenId = token.id;
  const status = tokenStore.getWebSocketStatus(tokenId);
  if (status !== "connected") {
    message.error("WebSocket未连接，无法获取数据");
    return;
  }

  loading.value = true;
  try {
    let presetTeamResult = await tokenStore.sendMessageWithPromise(
      tokenId,
      "presetteam_getinfo",
      {},
    );

    const teamsFromGame =
      presetTeamResult?.presetTeamInfo?.presetTeamInfo || {};
    const gameTeamIds = Object.keys(teamsFromGame)
      .filter((k) => /^\d+$/.test(k))
      .map(Number)
      .sort((a, b) => a - b);
    const availableTeamIds = gameTeamIds.length
      ? gameTeamIds
      : [1, 2, 3, 4, 5, 6];

    let targetTeamId = presetTeamResult?.presetTeamInfo?.useTeamId || 1;
    if (!availableTeamIds.includes(targetTeamId)) {
      targetTeamId = availableTeamIds[0];
    }

    const currentIndex = availableTeamIds.indexOf(targetTeamId);
    const otherTeamId =
      availableTeamIds[currentIndex === 0 ? 1 : currentIndex - 1] ||
      availableTeamIds[0];

    if (otherTeamId !== targetTeamId && availableTeamIds.length > 1) {
      await tokenStore.sendMessageWithPromise(tokenId, "presetteam_saveteam", {
        teamId: otherTeamId,
      });

      await delay(COMMAND_DELAY);

      await tokenStore.sendMessageWithPromise(tokenId, "presetteam_saveteam", {
        teamId: targetTeamId,
      });

      await delay(COMMAND_DELAY);
    }

    presetTeamResult = await tokenStore.sendMessageWithPromise(
      tokenId,
      "presetteam_getinfo",
      {},
    );
    await delay(COMMAND_DELAY);

    const roleInfo = await tokenStore.sendMessageWithPromise(
      tokenId,
      "role_getroleinfo",
      {},
    );
    await delay(COMMAND_DELAY);
    const role = roleInfo?.role || roleInfo;
    roleHeroesData.value = role?.heroes || {};
    allHeroesData.value = role?.heroes || {};
    artifactBooks.value = role?.artifactBooks || {};
    pearlMap.value = role?.pearlMap || {};

    presetTeamData.value = presetTeamResult?.presetTeamInfo;

    if (presetTeamResult) {
      tokenStore.$patch((state) => {
        state.gameData = {
          ...(state.gameData ?? {}),
          presetTeam: presetTeamResult,
        };
      });
    }

    if (presetTeamData.value) {
      const updatedTeamsFromGame = presetTeamData.value.presetTeamInfo || {};
      currentTeamId.value = presetTeamData.value.useTeamId || 1;
      availableTeams.value = availableTeamIds;

      const currentTeam =
        updatedTeamsFromGame[currentTeamId.value] ||
        updatedTeamsFromGame[String(currentTeamId.value)];
      currentTeamInfo.value = currentTeam?.teamInfo || {};
      currentTeamWeaponId.value = currentTeam?.weapon?.weaponId || null;
      currentPetId.value = role?.pet?.petId || null;
      /* 刷完把列表切回游戏当前槽位：否则会停在别的槽位上看空列表 */
      selectedTeamTab.value = currentTeamId.value;
    }

    /* 自动刷新（挂载 / 连上 / 应用收尾）别弹顶部提示，只有手动点刷新才说一句 */
    if (!silent) message.success("数据已刷新");
  } catch (error) {
    message.error(`获取数据失败: ${error.message}`);
  } finally {
    loading.value = false;
  }
};

/* ★ 取一份「当前阵容」快照：5 人站位 + 鱼灵/珍珠 + 玩具/宠物 + 俱乐部科技。
   「保存当前阵容」和「覆盖当前」是同一次取数，别再各写一份。 */
const collectCurrentLineup = async () => {
  const token = tokenStore.selectedToken;
  if (!token) {
    message.warning("请先选择Token");
    return null;
  }
  const tokenId = token.id;
  if (tokenStore.getWebSocketStatus(tokenId) !== "connected") {
    message.error("WebSocket未连接，无法读取阵容");
    return null;
  }

  const roleInfo = await tokenStore.sendMessageWithPromise(
    tokenId,
    "role_getroleinfo",
    {},
  );
  await delay(COMMAND_DELAY);
  const role = roleInfo?.role || roleInfo;
  const roleHeroes = role?.heroes || {};
  const pearlDataMap = role?.pearlMap || {};
  const books = role?.artifactBooks || {};

  const preset = await tokenStore.sendMessageWithPromise(
    tokenId,
    "presetteam_getinfo",
    {},
  );
  await delay(COMMAND_DELAY);
  const presetInfo = preset?.presetTeamInfo?.presetTeamInfo || {};
  const teamData =
    presetInfo[currentTeamId.value] || presetInfo[String(currentTeamId.value)];
  const teamInfo = teamData?.teamInfo || {};

  /* 鱼灵：artifactBooks 是 fishId → { artifactId }，这里翻成 artifactId → fishId */
  const fishAssignments = {};
  for (const [fishId, book] of Object.entries(books)) {
    if (book.artifactId && book.artifactId !== -1) {
      fishAssignments[book.artifactId] = Number(fishId);
    }
  }

  const heroes = currentTeamHeroes.value.map((hero) => {
    const heroData = roleHeroes[String(hero.heroId)];
    const heroArtifactId = heroData?.artifactId || null;
    const heroPearlId = heroData?.pearlId || null;
    const pearlData = pearlDataMap[heroPearlId];
    return {
      position: hero.position,
      heroId: hero.heroId,
      level: teamInfo[hero.position]?.level || hero.level || null,
      equipment: heroData?.equipment || null,
      fishId: heroArtifactId ? fishAssignments[heroArtifactId] || null : null,
      pearlId: heroPearlId,
      skillId: pearlData?.skillId || null,
      slotMap: pearlData?.slotMap || null,
      power: heroData?.power || null,
      attack: heroData?.attack || null,
      hp: heroData?.hp || null,
      speed: heroData?.speed || null,
    };
  });

  return {
    heroes,
    weaponId: teamData?.weapon?.weaponId || null,
    petId: role?.pet?.petId || null,
    legionResearch: role?.legionResearch || {},
  };
};

const saveCurrentLineup = async () => {
  if (currentTeamHeroes.value.length === 0) {
    message.warning("当前阵容为空，无法保存");
    return;
  }
  if (loading.value) return;

  loading.value = true;
  try {
    const snap = await collectCurrentLineup();
    if (!snap) return;

    const lineupName = `阵容${currentTeamId.value} · ${formatTime(Date.now())}`;
    savedLineups.value.unshift({
      id: generateLineupId(),
      name: lineupName,
      heroes: snap.heroes,
      teamId: currentTeamId.value,
      savedAt: Date.now(),
      applying: false,
      legionResearch: snap.legionResearch,
      weaponId: snap.weaponId,
      petId: snap.petId,
    });
    saveLineupsToStorage();
    message.success(`已保存：${lineupName}`);
  } catch (error) {
    message.error(`保存阵容失败: ${error.message}`);
  } finally {
    loading.value = false;
  }
};

/* 覆盖当前：把这条存档重写成游戏里正在用的阵容（名字 / 时间戳保留，方便对着同一套反复调） */
const overwriteLineup = (lineup) => {
  if (lineup.teamId !== currentTeamId.value) {
    message.warning(`这条是 ${lineup.teamId} 号槽的存档，先切到该槽位再覆盖`);
    return;
  }
  confirmAction(dialog, {
    title: "覆盖为当前阵容",
    content: "这条存档会被游戏里正在用的阵容替换掉，原来的记录不会保留。",
    positiveText: "覆盖",
    details: [
      { label: "存档", value: lineup.name },
      { label: "来源", value: `${currentTeamId.value} 号槽 · 当前阵容` },
    ],
    onPositiveClick: async () => {
      if (loading.value) return;
      loading.value = true;
      try {
        const snap = await collectCurrentLineup();
        if (!snap) return;
        lineup.heroes = snap.heroes;
        lineup.legionResearch = snap.legionResearch;
        lineup.weaponId = snap.weaponId;
        lineup.petId = snap.petId;
        lineup.savedAt = Date.now();
        lineup.applying = false;
        saveLineupsToStorage();
        message.success(`已用当前阵容覆盖：${lineup.name}`);
      } catch (error) {
        message.error(`覆盖失败: ${error.message}`);
      } finally {
        loading.value = false;
      }
    },
  });
};

const LEVEL_ORDER_THRESHOLDS = [
  { level: 100, order: 1 },
  { level: 200, order: 2 },
  { level: 300, order: 3 },
  { level: 500, order: 4 },
  { level: 700, order: 5 },
  { level: 900, order: 6 },
  { level: 1100, order: 7 },
  { level: 1300, order: 8 },
  { level: 1500, order: 9 },
  { level: 1800, order: 10 },
  { level: 2100, order: 11 },
  { level: 2400, order: 12 },
  { level: 2800, order: 13 },
  { level: 3200, order: 14 },
  { level: 3600, order: 15 },
  { level: 4000, order: 16 },
  { level: 4500, order: 17 },
  { level: 5000, order: 18 },
  { level: 5500, order: 19 },
];

const UPGRADE_OPTIONS = [50, 10, 5, 1];

const getNextOrderLevel = (currentLevel) => {
  for (const threshold of LEVEL_ORDER_THRESHOLDS) {
    if (currentLevel < threshold.level) {
      return threshold.level;
    }
  }
  return null;
};

const getOrder = (level) => {
  let order = 0;
  for (const threshold of LEVEL_ORDER_THRESHOLDS) {
    if (level >= threshold.level) {
      order = threshold.order;
    } else {
      break;
    }
  }
  return order;
};

const applyHeroLevel = async (
  tokenId,
  heroId,
  targetLevel,
  currentLevel,
  currentOrder = 0,
  slot = -1,
) => {
  if (!targetLevel || targetLevel <= 0)
    return { success: true, message: "无目标等级" };

  let actualCurrentLevel = currentLevel;
  let actualCurrentOrder = currentOrder;

  if (actualCurrentLevel > targetLevel) {
    if (slot >= 0) {
      try {
        await tokenStore.sendMessageWithPromise(tokenId, "hero_gobackbattle", {
          slot,
        });
      } catch (err) {}
      await delay(COMMAND_DELAY);
    }

    try {
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        "hero_rebirth",
        {
          heroId,
        },
      );
      if (result?.role?.heroes?.[heroId]?.level !== undefined) {
        actualCurrentLevel = result.role.heroes[heroId].level;
      } else {
        actualCurrentLevel = 1;
      }
      if (result?.role?.heroes?.[heroId]?.order !== undefined) {
        actualCurrentOrder = result.role.heroes[heroId].order;
      } else {
        actualCurrentOrder = 0;
      }
    } catch (err) {}
    await delay(COMMAND_DELAY);

    if (slot >= 0) {
      try {
        await tokenStore.sendMessageWithPromise(tokenId, "hero_gointobattle", {
          heroId,
          slot,
        });
      } catch (err) {}
      await delay(COMMAND_DELAY);
    }
  }

  const expectedOrder = getOrder(actualCurrentLevel);
  if (actualCurrentOrder < expectedOrder) {
    try {
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        "hero_heroupgradeorder",
        {
          heroId,
        },
      );
      if (result?.role?.heroes?.[heroId]?.order !== undefined) {
        actualCurrentOrder = result.role.heroes[heroId].order;
      } else {
        actualCurrentOrder = expectedOrder;
      }
    } catch (err) {}
    await delay(COMMAND_DELAY);
  }

  if (actualCurrentLevel >= targetLevel) {
    return { success: true, message: "等级已达标" };
  }

  while (actualCurrentLevel < targetLevel) {
    const nextOrderLevel = getNextOrderLevel(actualCurrentLevel);
    const maxAllowed = nextOrderLevel
      ? nextOrderLevel - actualCurrentLevel
      : targetLevel - actualCurrentLevel;
    const remaining = targetLevel - actualCurrentLevel;
    const stepLimit = Math.min(maxAllowed, remaining);

    let upgradeNum = 1;
    for (const num of UPGRADE_OPTIONS) {
      if (num <= stepLimit) {
        upgradeNum = num;
        break;
      }
    }

    try {
      await tokenStore.sendMessageWithPromise(
        tokenId,
        "hero_heroupgradelevel",
        {
          heroId,
          upgradeNum,
        },
      );
      actualCurrentLevel += upgradeNum;
    } catch (err) {}
    await delay(COMMAND_DELAY);

    if (nextOrderLevel && actualCurrentLevel >= nextOrderLevel) {
      try {
        const result = await tokenStore.sendMessageWithPromise(
          tokenId,
          "hero_heroupgradeorder",
          {
            heroId,
          },
        );
        if (result?.role?.heroes?.[heroId]?.order !== undefined) {
          actualCurrentOrder = result.role.heroes[heroId].order;
        } else {
          actualCurrentOrder++;
        }
      } catch (err) {}
      await delay(COMMAND_DELAY);
    }
  }

  return { success: true, message: `等级已升至 ${actualCurrentLevel}` };
};

/* ============================================================
 * 应用进度（阶段表对齐 public/game/features/云阵容.js）
 * 过程提示放弹层里：顶部 toast 会被游戏画面盖住，而且看不出进度。
 * ============================================================ */
const APPLY_PHASES = [
  { key: "read", label: "读取当前数据" },
  { key: "equip", label: "装备借调" },
  { key: "team", label: "上阵位重排" },
  { key: "level", label: "武将等级" },
  { key: "fish", label: "鱼灵 / 鱼珠" },
  { key: "skill", label: "鱼珠技能" },
  { key: "tech", label: "俱乐部科技" },
  { key: "weapon", label: "玩具（武器）" },
  { key: "final", label: "收尾刷新" },
];

const applyPhase = ref(-1); // -1 = 没在应用
const applyNote = ref("");
const applyResult = ref(""); // "" | "ok" | "err"
const applyError = ref("");
const applySummary = ref([]);
const applyLineupName = ref("");

const applyPhaseLabel = computed(() => APPLY_PHASES[applyPhase.value]?.label || "");
const applyNextLabel = computed(() => APPLY_PHASES[applyPhase.value + 1]?.label || "");
const applyPercent = computed(() =>
  Math.round((Math.max(applyPhase.value, 0) / APPLY_PHASES.length) * 100),
);

const setApplyPhase = (key, note = "") => {
  const i = APPLY_PHASES.findIndex((p) => p.key === key);
  if (i >= 0) applyPhase.value = i;
  applyNote.value = note || "";
};

const startApplyProgress = (name) => {
  applyLineupName.value = name || "";
  applyPhase.value = 0;
  applyNote.value = "";
  applyResult.value = "";
  applyError.value = "";
  applySummary.value = [];
};

const finishApplyProgress = (ok, payload) => {
  if (ok) {
    applySummary.value = payload || [];
    applyResult.value = "ok";
  } else {
    applyError.value = payload || "未知错误";
    applyResult.value = "err";
  }
};

const closeApplyProgress = () => {
  applyPhase.value = -1;
  applyResult.value = "";
  applyNote.value = "";
  applyError.value = "";
  applySummary.value = [];
};

const applyLineup = async (lineup) => {
  const token = tokenStore.selectedToken;
  if (!token) {
    message.warning("请先选择Token");
    return;
  }

  const tokenId = token.id;
  const status = tokenStore.getWebSocketStatus(tokenId);
  if (status !== "connected") {
    message.error("WebSocket未连接，无法应用阵容");
    return;
  }

  if (lineup.teamId !== currentTeamId.value) {
    message.warning(
      `此阵容仅适用于阵容槽位 ${lineup.teamId}，当前槽位为 ${currentTeamId.value}`,
    );
    return;
  }

  lineup.applying = true;
  state.value.isRunning = true;
  startApplyProgress(lineup.name);
  /* 应用结果按域累计，收尾时拼成一行结论（原来的逐条 toast 全部并进弹层） */
  const stats = { level: 0, fish: 0, skill: 0, tech: 0, weapon: 0 };

  const getTeamHeroes = (teamInfo) => {
    if (!teamInfo) return [];
    return Object.entries(teamInfo)
      .map(([key, hero]) => ({
        position: hero?.battleTeamSlot ?? Number(key),
        heroId: hero?.heroId || hero?.id,
        artifactId: hero?.artifactId || null,
        attachmentUid: hero?.attachmentUid || null,
      }))
      .filter((h) => h.heroId)
      .sort((a, b) => a.position - b.position);
  };

  const compareEquipment = (targetEquip, currentEquip) => {
    if (!targetEquip || !currentEquip) return false;

    const targetQuenches = targetEquip.quenches || {};
    const currentQuenches = currentEquip.quenches || {};

    for (const [key, targetQ] of Object.entries(targetQuenches)) {
      if (!targetQ.isLocked) continue;

      const currentQ = currentQuenches[key];
      if (!currentQ) return false;

      if (
        currentQ.colorId !== targetQ.colorId ||
        currentQ.attrId !== targetQ.attrId ||
        currentQ.attrNum !== targetQ.attrNum ||
        !currentQ.isLocked
      ) {
        return false;
      }
    }

    return true;
  };

  const buildHeroToEquipmentMap = (heroes) => {
    const map = {};
    for (const [id, hero] of Object.entries(heroes)) {
      const equip1 = hero.equipment?.[1];
      if (equip1) {
        map[Number(id)] = equip1;
      }
    }
    return map;
  };

  const findCurrentHeroByEquipment = (targetEquip, heroToEquipment) => {
    for (const [heroId, heroEquip] of Object.entries(heroToEquipment)) {
      if (compareEquipment(targetEquip, heroEquip)) {
        return Number(heroId);
      }
    }
    return null;
  };

  const fetchLatestData = async (teamId = null) => {
    const roleInfo = await tokenStore.sendMessageWithPromise(
      tokenId,
      "role_getroleinfo",
      {},
    );
    await delay(COMMAND_DELAY);
    const presetTeam = await tokenStore.sendMessageWithPromise(
      tokenId,
      "presetteam_getinfo",
      {},
    );
    await delay(COMMAND_DELAY);
    const heroes = roleInfo?.role?.heroes || roleInfo?.heroes || {};
    const pearlMapData = roleInfo?.role?.pearlMap || roleInfo?.pearlMap || {};
    const artifactBooksData =
      roleInfo?.role?.artifactBooks || roleInfo?.artifactBooks || {};
    roleHeroesData.value = heroes;
    const targetTeamId = teamId || currentTeamId.value;
    const team =
      presetTeam?.presetTeamInfo?.presetTeamInfo?.[targetTeamId] ||
      presetTeam?.presetTeamInfo?.presetTeamInfo?.[String(targetTeamId)];
    return {
      heroes,
      teamInfo: team?.teamInfo || {},
      pearlMap: pearlMapData,
      artifactBooks: artifactBooksData,
    };
  };

  const isIgnorableError = (err) => {
    const msg = err.message || "";
    return msg.includes("200020");
  };

  try {
    const targetHeroes = [...lineup.heroes];

    setApplyPhase("read");
    let { heroes, teamInfo } = await fetchLatestData();
    let currentHeroes = getTeamHeroes(teamInfo);

    let heroToEquipment = buildHeroToEquipmentMap(heroes);

    const currentHeroIds = new Set(currentHeroes.map((h) => h.heroId));
    const targetHeroIds = new Set(targetHeroes.map((h) => h.heroId));

    setApplyPhase("equip", `${targetHeroes.length} 名武将`);
    for (const targetHero of targetHeroes) {
      const targetEquip = targetHero.equipment?.[1];
      if (!targetEquip) continue;

      const currentHolderId = findCurrentHeroByEquipment(
        targetEquip,
        heroToEquipment,
      );

      if (currentHolderId && currentHolderId !== targetHero.heroId) {
        const holderInTeam = currentHeroIds.has(currentHolderId);
        const targetInTeam = currentHeroIds.has(targetHero.heroId);

        if (!holderInTeam && !targetInTeam) {
          const emptySlot = currentHeroes.length < 5 ? currentHeroes.length : 0;
          try {
            await tokenStore.sendMessageWithPromise(
              tokenId,
              "hero_gointobattle",
              {
                heroId: currentHolderId,
                slot: emptySlot,
              },
            );
          } catch (err) {
            continue;
          }
          await delay(COMMAND_DELAY);

          try {
            await tokenStore.sendMessageWithPromise(
              tokenId,
              "hero_gointobattle",
              {
                heroId: targetHero.heroId,
                slot: emptySlot + 1,
              },
            );
          } catch (err) {}
          await delay(COMMAND_DELAY);
        }

        try {
          const targetHeroCurrentEquip = heroToEquipment[targetHero.heroId];
          const currentHolderCurrentEquip = heroToEquipment[currentHolderId];

          await tokenStore.sendMessageWithPromise(tokenId, "hero_exchange", {
            heroId: currentHolderId,
            targetHeroId: targetHero.heroId,
          });

          // 交换后更新映射
          if (currentHolderCurrentEquip) {
            heroToEquipment[targetHero.heroId] = currentHolderCurrentEquip;
          } else {
            delete heroToEquipment[targetHero.heroId];
          }

          if (targetHeroCurrentEquip) {
            heroToEquipment[currentHolderId] = targetHeroCurrentEquip;
          } else {
            delete heroToEquipment[currentHolderId];
          }
        } catch (err) {}
        await delay(COMMAND_DELAY);
      }
    }

    await delay(COMMAND_DELAY);
    const data1 = await fetchLatestData();
    await delay(COMMAND_DELAY);
    heroes = data1.heroes;
    heroToEquipment = buildHeroToEquipmentMap(heroes);
    currentHeroes = getTeamHeroes(data1.teamInfo);
    currentHeroIds.clear();
    currentHeroes.forEach((h) => currentHeroIds.add(h.heroId));

    setApplyPhase("team", `${targetHeroes.length} 个站位`);
    // Find a purple hero (color=1) with level=1 and all equipment level=1
    const purpleLevel1Hero = Object.entries(heroes).find(([id, hero]) => {
      if (hero.color !== 1 || hero.level !== 1) return false;
      const equipment = hero.equipment || {};
      return [1, 2, 3, 4].every((slot) => {
        const equip = equipment[String(slot)];
        return equip && equip.level === 1;
      });
    });
    // 如果找到紫色等级为1的英雄，将其移动到位置5的空位
    if (purpleLevel1Hero) {
      const [heroId, heroData] = purpleLevel1Hero;
      console.log(
        `Found purple level 1 hero: ${heroId}, all equipment level are 1`,
      );
      try {
        await tokenStore.sendMessageWithPromise(tokenId, "hero_gointobattle", {
          heroId: heroId,
          slot: 4,
        });
      } catch (err) {}
      await delay(COMMAND_DELAY);
    }
    //下掉1，2，3，4位置的英雄
    for (let slot = 0; slot < 4; slot++) {
      try {
        await tokenStore.sendMessageWithPromise(tokenId, "hero_gobackbattle", {
          slot: slot,
        });
      } catch (err) {}
      await delay(COMMAND_DELAY);
    }
    //上阵目标英雄到目标位置上
    for (const targetHero of targetHeroes) {
      try {
        await tokenStore.sendMessageWithPromise(tokenId, "hero_gointobattle", {
          heroId: targetHero.heroId,
          slot: targetHero.position,
        });
      } catch (err) {}
      await delay(COMMAND_DELAY);
    }

    // Check if there's any target hero for slot 4
    const hasSlot4Hero = targetHeroes.some((hero) => hero.position === 4);
    if (!hasSlot4Hero) {
      // If no target hero for slot 4, remove the hero in slot 4
      try {
        await tokenStore.sendMessageWithPromise(tokenId, "hero_gobackbattle", {
          slot: 4,
        });
      } catch (err) {}
      await delay(COMMAND_DELAY);
    }

    const hasLevelData = lineup.heroes.some((h) => h.level && h.level > 0);
    if (hasLevelData) {
      setApplyPhase("level");
      const levelData = await fetchLatestData();
      const currentHeroesData = levelData.heroes;

      let levelApplied = 0;
      for (const targetHero of targetHeroes) {
        if (!targetHero.level || targetHero.level <= 0) continue;

        const heroData = currentHeroesData[String(targetHero.heroId)];
        const currentLevel = heroData?.level || 1;
        const currentOrder = heroData?.order || 0;

        if (currentLevel !== targetHero.level) {
          const result = await applyHeroLevel(
            tokenId,
            targetHero.heroId,
            targetHero.level,
            currentLevel,
            currentOrder,
            targetHero.position,
          );

          if (result.success) {
            levelApplied++;
          } else {
          }
        }
      }

      if (levelApplied > 0) {
        stats.level = levelApplied;
      }
    }

    const hasFishData = lineup.heroes.some((h) => h.pearlId || h.fishId);
    if (hasFishData) {
      setApplyPhase("fish");
      const fishData = await fetchLatestData();
      const currentHeroes = fishData.heroes;
      const pearlMap = fishData.pearlMap || {};
      const artifactBooks = fishData.artifactBooks || {};

      const artifactToHero = {};
      for (const [heroId, hero] of Object.entries(currentHeroes)) {
        if (hero.artifactId && hero.artifactId !== -1) {
          artifactToHero[hero.artifactId] = Number(heroId);
        }
      }

      const fishToArtifact = {};
      for (const [fishId, book] of Object.entries(artifactBooks)) {
        if (book.artifactId && book.artifactId !== -1) {
          fishToArtifact[Number(fishId)] = book.artifactId;
        }
      }

      let fishApplied = 0;
      for (const targetHero of targetHeroes) {
        if (!targetHero.fishId && !targetHero.pearlId) continue;

        let artifactId = null;
        let pearlId = targetHero.pearlId || 0;

        if (targetHero.fishId) {
          artifactId = fishToArtifact[targetHero.fishId];
        }

        if (!artifactId && targetHero.pearlId) {
          const pearlData = pearlMap[targetHero.pearlId];
          if (pearlData?.artifactId && pearlData.artifactId !== -1) {
            artifactId = pearlData.artifactId;
          }
        }

        if (!artifactId) continue;

        const currentHolderId = artifactToHero[artifactId];

        if (currentHolderId === targetHero.heroId) {
          continue;
        }

        // Check if target hero currently holds any artifact
        const targetHeroCurrentArtifactId = Object.entries(artifactToHero).find(
          ([artId, heroId]) => heroId === targetHero.heroId,
        )?.[0];

        if (targetHeroCurrentArtifactId) {
          delete artifactToHero[targetHeroCurrentArtifactId];
        }

        if (currentHolderId) {
          try {
            await tokenStore.sendMessageWithPromise(
              tokenId,
              "artifact_unload",
              {
                heroId: currentHolderId,
              },
            );
            delete artifactToHero[artifactId];
          } catch (err) {}

          await delay(COMMAND_DELAY);
        }
        try {
          await tokenStore.sendMessageWithPromise(tokenId, "artifact_load", {
            heroId: targetHero.heroId,
            itemId: artifactId,
            pearlId: pearlId,
          });
          fishApplied++;
          artifactToHero[artifactId] = targetHero.heroId;
        } catch (err) {}
        await delay(COMMAND_DELAY);
      }

      if (fishApplied > 0) {
        stats.fish = fishApplied;
      }

      setApplyPhase("skill");
      let skillApplied = 0;
      const skillData = await fetchLatestData();
      const latestPearlMap = skillData.pearlMap || {};

      const pearlIdsToHandle = targetHeroes
        .filter((h) => h.pearlId)
        .map((h) => h.pearlId);

      // Step 1: Unload skills from all relevant pearls
      // 1. Collect target skill IDs from targetHeroes
      const targetSkillIds = new Set(
        targetHeroes.filter((h) => h.skillId).map((h) => h.skillId),
      );

      // 2. Collect all pearl IDs that need to be unloaded
      const pearlsToUnload = new Set();

      // Add pearlIdsToHandle (pearls with targetHero.pearlId)
      pearlIdsToHandle.forEach((pearlId) => pearlsToUnload.add(pearlId));

      // Add pearls that contain targetSkillIds
      Object.entries(latestPearlMap).forEach(([pid, pearlData]) => {
        if (pearlData?.skillId && targetSkillIds.has(pearlData.skillId)) {
          pearlsToUnload.add(Number(pid));
        }
      });

      // 3. Unload skills from collected pearls
      for (const pearlId of pearlsToUnload) {
        const currentPearlData = latestPearlMap[pearlId];
        const currentSkillId = currentPearlData?.skillId || null;

        if (currentSkillId) {
          try {
            await tokenStore.sendMessageWithPromise(
              tokenId,
              "pearl_unloadskill",
              {
                pearlId: pearlId,
              },
            );
            latestPearlMap[pearlId].skillId = null;
          } catch (err) {}
          await delay(COMMAND_DELAY);
        }
      }

      // Step 2: Replace skills for pearlIdsToHandle
      for (const pearlId of pearlIdsToHandle) {
        const targetHero = targetHeroes.find((h) => h.pearlId === pearlId);
        const targetSkillId = targetHero?.skillId || null;

        if (!targetSkillId) continue;

        try {
          await tokenStore.sendMessageWithPromise(
            tokenId,
            "pearl_replaceskill",
            {
              pearlId: pearlId,
              skillId: targetSkillId,
            },
          );
          skillApplied++;
        } catch (err) {}
        await delay(COMMAND_DELAY);
      }

      if (skillApplied > 0) {
        stats.skill = skillApplied;
      }
    }

    if (
      lineup.legionResearch &&
      Object.keys(lineup.legionResearch).length > 0
    ) {
      setApplyPhase("tech");
      const syncResult = await syncLegionResearch(
        tokenId,
        lineup.legionResearch,
      );
      if (syncResult.success) {
        if (syncResult.message !== "科技配置已匹配，无需调整") {
          stats.tech = 1;
        }
      }
    }

    if (lineup.weaponId !== undefined && lineup.weaponId !== null) {
      setApplyPhase("weapon");
      const currentPresetTeam = await tokenStore.sendMessageWithPromise(
        tokenId,
        "presetteam_getinfo",
        {},
      );
      const currentPresetInfo =
        currentPresetTeam?.presetTeamInfo?.presetTeamInfo ||
        currentPresetTeam?.presetTeamInfo ||
        {};
      const currentTeamData =
        currentPresetInfo[currentTeamId.value] ||
        currentPresetInfo[String(currentTeamId.value)];
      const currentWeaponId = currentTeamData?.weapon?.weaponId || null;

      if (currentWeaponId !== lineup.weaponId) {
        try {
          await tokenStore.sendMessageWithPromise(
            tokenId,
            "lordweapon_changedefaultweapon",
            {
              weaponId: lineup.weaponId,
            },
          );
          stats.weapon = 1;
        } catch (err) {}
        await delay(COMMAND_DELAY);
      }
    }

    setApplyPhase("final");
    lastRefreshTime = 0;
    await refreshTeamInfo(true);

    const summary = [];
    if (stats.level) summary.push(`等级 ${stats.level}`);
    if (stats.fish) summary.push(`鱼灵 ${stats.fish}`);
    if (stats.skill) summary.push(`鱼珠 ${stats.skill}`);
    if (stats.tech) summary.push("俱乐部科技");
    if (stats.weapon) summary.push("玩具");
    finishApplyProgress(true, summary);
  } catch (error) {
    finishApplyProgress(false, error.message);
  } finally {
    lineup.applying = false;
    state.value.isRunning = false;
  }
};

const showTechModal = (lineup) => {
  selectedTechData.value = lineup.legionResearch || null;
  /* 打开就落在「练得最多的那个职业」上，别每次都从战士开始翻 */
  const data = selectedTechData.value || {};
  let bestType = 1;
  let bestSum = -1;
  for (const type of TECH_TYPES) {
    let sum = 0;
    for (const id of LEGION_TECH_TYPE_MAP[type]) sum += data[id] || 0;
    if (sum > bestSum) {
      bestSum = sum;
      bestType = type;
    }
  }
  techTab.value = bestType;
  techModalVisible.value = true;
};

const renameLineup = (index) => {
  const currentName = savedLineups.value[index].name;
  let newName = currentName;
  dialog.create({
    title: "重命名阵容",
    content: () =>
      h(NInput, {
        defaultValue: currentName,
        onInput: (val) => {
          newName = val;
        },
        placeholder: "请输入阵容名称",
      }),
    positiveText: "确定",
    negativeText: "取消",
    onPositiveClick: () => {
      if (newName && newName.trim()) {
        savedLineups.value[index].name = newName.trim();
        saveLineupsToStorage();
        message.success("阵容名称已更新");
      }
    },
  });
};

const deleteLineup = (index) => {
  confirmDanger(dialog, {
    title: "删除阵容",
    content: `确定要删除阵容「${savedLineups.value[index].name}」吗？`,
    onPositiveClick: () => {
      savedLineups.value.splice(index, 1);
      saveLineupsToStorage();
      message.success("阵容已删除");
    },
  });
};

const exportLineups = async () => {
  const token = tokenStore.selectedToken;
  if (!token) {
    message.warning("请先选择Token");
    return;
  }

  const tokenId = token.id;
  const status = tokenStore.getWebSocketStatus(tokenId);
  if (status !== "connected") {
    message.error("WebSocket未连接，无法导出");
    return;
  }

  try {
    const roleInfo = await tokenStore.sendMessageWithPromise(
      tokenId,
      "role_getroleinfo",
      {},
    );
    const role = roleInfo?.role || roleInfo;
    const roleId = role?.roleId || role?.id;

    if (!roleId) {
      message.error("无法获取角色ID");
      return;
    }

    const exportData = {
      roleId: roleId,
      exportTime: Date.now(),
      lineups: savedLineups.value,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `阵容配置_${roleId}_${new Date().toLocaleDateString().replace(/\//g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);

    message.success(`已导出 ${savedLineups.value.length} 个阵容`);
  } catch (error) {
    message.error(`导出失败: ${error.message}`);
  }
};

const importLineups = async ({ file }) => {
  const token = tokenStore.selectedToken;
  if (!token) {
    message.warning("请先选择Token");
    return;
  }

  const tokenId = token.id;
  const status = tokenStore.getWebSocketStatus(tokenId);
  if (status !== "connected") {
    message.error("WebSocket未连接，无法导入");
    return;
  }

  try {
    const roleInfo = await tokenStore.sendMessageWithPromise(
      tokenId,
      "role_getroleinfo",
      {},
    );
    const role = roleInfo?.role || roleInfo;
    const currentRoleId = role?.roleId || role?.id;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importData = JSON.parse(e.target.result);

        if (!importData.roleId || !importData.lineups) {
          message.error("无效的阵容文件格式");
          return;
        }

        const processImport = (lineupsToImport) => {
          const existingIds = new Set(savedLineups.value.map((l) => l.id));
          const newLineups = [];
          const duplicateLineups = [];

          for (const lineup of lineupsToImport) {
            if (lineup.id && existingIds.has(lineup.id)) {
              duplicateLineups.push(lineup);
            } else {
              newLineups.push({
                ...lineup,
                id: lineup.id || generateLineupId(),
                savedAt: Date.now(),
                applying: false,
              });
            }
          }

          if (duplicateLineups.length > 0) {
            confirmAction(dialog, {
              title: "发现重复阵容",
              content: `发现 ${duplicateLineups.length} 个已存在的阵容，是否覆盖？`,
              positiveText: "覆盖",
              negativeText: "跳过重复",
              onPositiveClick: () => {
                for (const dupLineup of duplicateLineups) {
                  const index = savedLineups.value.findIndex(
                    (l) => l.id === dupLineup.id,
                  );
                  if (index !== -1) {
                    savedLineups.value[index] = {
                      ...dupLineup,
                      savedAt: Date.now(),
                      applying: false,
                    };
                  }
                }
                savedLineups.value = [...savedLineups.value, ...newLineups];
                saveLineupsToStorage();
                message.success(
                  `已导入 ${newLineups.length + duplicateLineups.length} 个阵容`,
                );
              },
              onNegativeClick: () => {
                savedLineups.value = [...savedLineups.value, ...newLineups];
                saveLineupsToStorage();
                message.success(
                  `已导入 ${newLineups.length} 个阵容，跳过 ${duplicateLineups.length} 个重复`,
                );
              },
            });
          } else {
            savedLineups.value = [...savedLineups.value, ...newLineups];
            saveLineupsToStorage();
            message.success(`已导入 ${newLineups.length} 个阵容`);
          }
        };

        if (importData.roleId !== currentRoleId) {
          confirmAction(dialog, {
            title: "角色不匹配",
            content: `该阵容文件来自其他角色，是否继续导入？`,
            positiveText: "导入",
            onPositiveClick: () => {
              processImport(importData.lineups);
            },
          });
        } else {
          processImport(importData.lineups);
        }
      } catch (parseError) {
        message.error("解析文件失败，请检查文件格式");
      }
    };
    reader.readAsText(file.file);
  } catch (error) {
    message.error(`导入失败: ${error.message}`);
  }
};

const switchTeam = async (teamId) => {
  if (teamId === currentTeamId.value) return;

  const token = tokenStore.selectedToken;
  if (!token) {
    message.warning("请先选择Token");
    return;
  }

  const tokenId = token.id;
  const status = tokenStore.getWebSocketStatus(tokenId);
  if (status !== "connected") {
    message.error("WebSocket未连接，无法切换阵容");
    return;
  }

  switchingTeamId.value = teamId;
  state.value.isRunning = true;

  try {
    await tokenStore.sendMessageWithPromise(tokenId, "presetteam_saveteam", {
      teamId,
    });

    await delay(COMMAND_DELAY);

    currentTeamId.value = teamId;
    message.success(`已切换到阵容 ${teamId}`);

    await refreshTeamInfo(true);
  } catch (error) {
    message.error(`切换阵容失败: ${error.message}`);
  } finally {
    switchingTeamId.value = null;
    state.value.isRunning = false;
  }
};

watch(
  () => tokenStore.selectedToken,
  (newToken, oldToken) => {
    if (newToken && newToken.id !== oldToken?.id) {
      loadSavedLineups();
      currentTeamInfo.value = null;
      presetTeamData.value = null;
      allHeroesData.value = {};
      currentTeamId.value = 1;

      const status = tokenStore.getWebSocketStatus(newToken.id);
      if (status === "connected") {
        refreshTeamInfo(true);
      }
    }
  },
);

watch(
  () =>
    tokenStore.selectedToken
      ? tokenStore.getWebSocketStatus(tokenStore.selectedToken.id)
      : null,
  (newStatus, oldStatus) => {
    if (
      newStatus === "connected" &&
      oldStatus !== "connected" &&
      tokenStore.selectedToken
    ) {
      setTimeout(() => {
        refreshTeamInfo(true);
      }, 500);
    }
  },
);

onMounted(() => {
  loadSavedLineups();

  const token = tokenStore.selectedToken;
  if (token) {
    const status = tokenStore.getWebSocketStatus(token.id);
    if (status === "connected") {
      refreshTeamInfo(true);
    }
  }
});
</script>

<style scoped lang="scss">
/* ============================================================
 * 云阵容（11-01 按用户给的参考图重做）
 * 结构：一块「当前阵容」+ 一块「已保存阵容」，同一张 MyCard 内上下排，
 * 中间用一条 band 分隔，不再有工具栏 / 拖拽 / 弹窗里塞列表。
 * 配色只用移动端 token：--m-text/text2/text3、--m-bg、--m-card、--m-band、--m-primary。
 * 文字一律放 div（不是 span）：App.vue 的暗色规则对 span 有 !important 白字，
 * 而这里的「应用」要显式吃 --m-on-primary。
 * ============================================================ */
.lu {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ---------- 区块头 ---------- */
.lu-blk + .lu-blk {
  padding-top: 15px;
  border-top: 1px solid var(--m-band);
}
.lu-hd {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.lu-hd-t {
  font-size: 13px;
  font-weight: 700;
  color: var(--m-text);
  line-height: 1.3;
}
.lu-hd-x {
  flex: none;
  font-size: 11px;
  color: var(--m-text3);
  line-height: 1.3;
}

/* ---------- 五宫格武将 ---------- */
.lu-heroes {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
}
.lu-hero {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  cursor: pointer;
}
.lu-hero.is-empty {
  cursor: default;
}
.lu-hero-pic {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: var(--m-r-sm);
  overflow: hidden;
  background: var(--m-bg);
}
.lu-hero-pic img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.lu-hero-ph {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--m-text3);
}
.lu-hero-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  line-height: 1;
  color: var(--m-text3);
  background: var(--m-bg);
  border-radius: var(--m-r-sm);
  box-shadow: inset 0 0 0 1px var(--m-border);
}
/* 左上角星级：参考图那颗绿色小药丸，压在头像上，不占布局 */
.lu-hero-badge {
  position: absolute;
  z-index: 2;
  top: 0;
  left: 0;
  padding: 0 4px;
  height: 14px;
  line-height: 14px;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: rgba(15, 118, 62, 0.9);
  border-bottom-right-radius: var(--m-r-sm);
}
/* 底部等级条：渐变而不是纯色，头像亮的时候文字也压得住 */
.lu-hero-lv {
  position: absolute;
  z-index: 2;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 1px 0 2px;
  text-align: center;
  font-size: 10px;
  font-weight: 500;
  line-height: 1.2;
  color: #fff;
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.74) 0%,
    rgba(0, 0, 0, 0.32) 70%,
    rgba(0, 0, 0, 0) 100%
  );
}
.lu-hero-nm {
  font-size: 11px;
  font-weight: 500;
  line-height: 1.25;
  color: var(--m-text);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lu-hero-tg {
  font-size: 10px;
  line-height: 1.25;
  color: var(--m-text3);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 已保存阵容里的那排：留一份就行，行高与上面一致，只把字号再收一档 */
.lu-heroes.is-mini .lu-hero-nm {
  font-size: 10.5px;
}
.lu-heroes.is-mini .lu-hero-tg {
  font-size: 9.5px;
}

/* ---------- 玩具 / 宠物 ---------- */
.lu-chips {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 12px;
}
.lu-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 7px 9px;
  background: var(--m-bg);
  border-radius: var(--m-r-sm);
}
.lu-chip-ic {
  flex: none;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--m-r-sm);
  background: var(--m-card);
  color: var(--m-primary);
}
.lu-chip-tx {
  min-width: 0;
}
.lu-chip-k {
  font-size: 10px;
  line-height: 1.2;
  color: var(--m-text3);
}
.lu-chip-v {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
  color: var(--m-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lu-chips.is-mini {
  margin-top: 10px;
  gap: 6px;
}
.lu-chips.is-mini .lu-chip {
  padding: 6px 8px;
}
.lu-chips.is-mini .lu-chip-ic {
  width: 22px;
  height: 22px;
}
.lu-chips.is-mini .lu-chip-v {
  font-size: 11.5px;
}

/* ---------- 保存当前阵容 ---------- */
.lu-save {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 40px;
  margin-top: 12px;
  padding: 0;
  border: 1px solid var(--m-primary);
  border-radius: var(--m-r-sm);
  background: var(--m-primary-soft);
  color: var(--m-primary);
  font-family: inherit;
  transition: background 0.12s;
}
.lu-save:active {
  background: var(--m-band);
}
.lu-save[disabled] {
  opacity: 0.45;
}
.lu-save-tx {
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
}

/* ---------- 卡槽切换 ---------- */
.lu-slotbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.lu-slots {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
}
/* 卡槽数量是游戏给的（可能只有 3 个）：用 flex 均分，别写死 6 列留一排空位 */
.lu-slot {
  flex: 1 1 0;
  min-width: 0;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: var(--m-r-sm);
  background: var(--m-bg);
  color: var(--m-text2);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
}
/* 选中的槽位 + 游戏当前槽位：两个状态可以同时成立，
   所以用「底色」和「内描边」两套视觉，别互相覆盖 */
.lu-slot.on {
  background: var(--m-primary-soft);
  color: var(--m-primary);
  font-weight: 700;
}
.lu-slot.cur {
  box-shadow: inset 0 0 0 1px var(--m-primary);
}
.lu-slot[disabled] {
  opacity: 0.5;
}
.lu-iconbtn {
  flex: none;
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: var(--m-r-sm);
  background: var(--m-bg);
  color: var(--m-text2);
}
.lu-iconbtn:active {
  background: var(--m-band);
}
.lu-iconbtn[disabled] {
  opacity: 0.5;
}
.lu-hint {
  margin: 0 0 10px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--m-text3);
}

/* ---------- 已保存的阵容卡 ---------- */
.lu-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lu-item {
  padding: 11px 11px 12px;
  border-radius: var(--m-r-md);
  background: var(--m-bg);
}
.lu-item-hd {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 9px;
}
.lu-item-nm {
  min-width: 0;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--m-text);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lu-item-tm {
  flex: none;
  font-size: 10.5px;
  color: var(--m-text3);
}

/* 四个动作：等宽四列，窄屏靠 minmax(0,1fr) + 省略号兜住，别写死宽度 */
.lu-acts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-top: 11px;
}
.lu-act {
  height: 32px;
  padding: 0 2px;
  border: 1px solid var(--m-border);
  border-radius: var(--m-r-sm);
  background: var(--m-card);
  color: var(--m-text2);
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lu-act:active {
  background: var(--m-band);
}
.lu-act.is-p {
  border-color: var(--m-primary);
  background: var(--m-primary);
  color: var(--m-on-primary);
  font-weight: 700;
}
.lu-act.is-d {
  color: var(--m-red);
}
.lu-act[disabled] {
  opacity: 0.45;
}
.lu-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 100%;
  height: 28px;
  margin-top: 6px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--m-text3);
  font-family: inherit;
  font-size: 11px;
  line-height: 1;
}
.lu-more[disabled] {
  opacity: 0.4;
}

/* ---------- 空态 / 导入导出 ---------- */
.lu-empty {
  padding: 20px 14px;
  border-radius: var(--m-r-md);
  background: var(--m-bg);
  text-align: center;
}
.lu-empty-t {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--m-text2);
  line-height: 1.4;
}
.lu-empty-s {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--m-text3);
}
.lu-tools {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 10px;
}
.lu-mini {
  height: 30px;
  padding: 0;
  border: 1px dashed var(--m-border);
  border-radius: var(--m-r-sm);
  background: transparent;
  color: var(--m-text3);
  font-family: inherit;
  font-size: 11.5px;
  line-height: 1;
}
.lu-mini:active {
  background: var(--m-bg);
}

/* ============================================================
 * 武将详情抽屉（从底部上来）
 * 桌面组件里这块是 n-modal；手机上改成抽屉：不遮住半屏以上内容，
 * 关闭键在手指够得到的地方，也不跟 Naive 的弹窗样式打架。
 * ============================================================ */
.lu-mask {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: rgba(0, 0, 0, 0.42);
}
.lu-sheet {
  position: fixed;
  left: 50%;
  bottom: 0;
  z-index: 71;
  transform: translateX(-50%);
  width: var(--m-shell-w, 100vw);
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
  background: var(--m-card);
  border-radius: 14px 14px 0 0;
}
.lu-sheet-hd {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--m-band);
}
.lu-sheet-av {
  flex: none;
  width: 42px;
  height: 42px;
  border-radius: var(--m-r-sm);
  overflow: hidden;
  background: var(--m-bg);
}
.lu-sheet-av img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.lu-sheet-av-ph {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--m-text3);
}
.lu-sheet-id {
  flex: 1 1 auto;
  min-width: 0;
}
.lu-sheet-nm {
  font-size: 15px;
  font-weight: 700;
  color: var(--m-text);
  line-height: 1.25;
}
.lu-sheet-sub {
  margin-top: 2px;
  font-size: 11px;
  color: var(--m-text3);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lu-sheet-x {
  flex: none;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: var(--m-r-sm);
  background: var(--m-bg);
  color: var(--m-text2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.lu-sheet-bd {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-top: 12px;
}

/* 属性四格：字段与存档条目一致（战力 / 攻击 / 血量 / 速度） */
.lu-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.lu-stat {
  min-width: 0;
  padding: 8px 10px;
  background: var(--m-bg);
  border-radius: var(--m-r-sm);
}
.lu-stat-k {
  font-size: 10.5px;
  color: var(--m-text3);
  line-height: 1.2;
}
.lu-stat-v {
  margin-top: 2px;
  font-size: 13px;
  font-weight: 700;
  color: var(--m-text);
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
}
.lu-sub-h {
  margin: 16px 0 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--m-text3);
}

/* 洗练：四个部位，每个部位一行 5 孔（没淬炼的留空框） */
.lu-parts {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lu-part {
  padding: 10px;
  background: var(--m-bg);
  border-radius: var(--m-r-sm);
}
.lu-part-hd {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}
.lu-part-nm {
  font-size: 12px;
  font-weight: 700;
  color: var(--m-text);
}
.lu-part-lv {
  font-size: 11px;
  color: var(--m-text3);
}
.lu-part-bn {
  margin-left: auto;
  font-size: 11px;
  font-weight: 500;
  color: var(--m-primary);
}
.lu-quench {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 5px;
}
.lu-slot-c {
  position: relative;
  min-width: 0;
  padding: 6px 2px 5px;
  border-radius: var(--m-r-sm);
  background: var(--m-card);
  text-align: center;
}
.lu-slot-c.empty {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--m-border);
}
.lu-slot-c-nm {
  font-size: 10px;
  line-height: 1.2;
  color: var(--m-text2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lu-slot-c.empty .lu-slot-c-nm {
  color: var(--m-text3);
}
.lu-slot-c-v {
  margin-top: 2px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--m-text);
  font-variant-numeric: tabular-nums;
}
/* 淬炼品质：右上角一颗小圆点，不占布局也不跟文字抢空间 */
.lu-slot-dot {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
}
.lu-sheet-empty {
  padding: 18px 0;
  text-align: center;
  font-size: 12px;
  line-height: 1.6;
  color: var(--m-text3);
}

/* ---------- 应用进度弹层（阶段 / 下一步 / 进度条） ---------- */
.lu-pg-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 22px;
  background: rgba(0, 0, 0, 0.45);
}
.lu-pg {
  width: 100%;
  max-width: 320px;
  padding: 16px 16px 14px;
  border-radius: 14px;
  background: var(--m-card);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.28);
}
.lu-pg-hd {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.lu-pg-t {
  font-size: 14px;
  font-weight: 600;
  color: var(--m-text);
}
.lu-pg-c {
  font-size: 11px;
  color: var(--m-text3);
  font-variant-numeric: tabular-nums;
}
.lu-pg-nm {
  margin: 4px 0 12px;
  font-size: 12px;
  color: var(--m-text2);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.lu-pg-step {
  font-size: 13px;
  font-weight: 600;
  color: var(--m-text);
}
.lu-pg-step em {
  margin-left: 6px;
  font-style: normal;
  font-weight: 400;
  font-size: 12px;
  color: var(--m-text2);
}
.lu-pg-next {
  margin-top: 4px;
  font-size: 12px;
  color: var(--m-text3);
}
.lu-pg-bar {
  margin-top: 10px;
  height: 6px;
  border-radius: 3px;
  background: var(--m-band);
  overflow: hidden;
}
.lu-pg-bar i {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--m-primary);
  transition: width 0.18s ease;
}
.lu-pg-pct {
  margin-top: 6px;
  text-align: right;
  font-size: 11px;
  color: var(--m-text3);
  font-variant-numeric: tabular-nums;
}
.lu-pg-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 2px 0 14px;
}
.lu-pg-tag {
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--m-band);
  font-size: 11px;
  color: var(--m-text2);
}
.lu-pg-err {
  margin: 2px 0 14px;
  font-size: 12px;
  line-height: 1.6;
  color: #d03050;
  word-break: break-all;
}
.lu-pg-btn {
  width: 100%;
  height: 36px;
  border: 0;
  border-radius: var(--m-r-sm);
  background: var(--m-primary);
  font-size: 13px;
  font-weight: 600;
  color: #fff;
}
.lu-pg-btn:active {
  opacity: 0.86;
}

/* ---------- 俱乐部科技（按职业分 tab） ----------
   6 个职业 × 14 项，平铺要滚三四屏；参考图是一屏一个职业。
   弹窗虽然 teleport 到 body，scoped 的 data-v 仍挂在元素上，样式照常生效。 */
.tech {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.tech-tabs {
  display: flex;
  gap: 6px;
}
.tech-tab {
  flex: 1 1 0;
  min-width: 0;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: var(--m-r-sm);
  background: var(--m-bg);
  color: var(--m-text2);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
}
.tech-tab.on {
  background: var(--m-primary-soft);
  color: var(--m-primary);
  font-weight: 700;
}
.tech-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 12px;
}
.tech-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
  height: 30px;
  border-bottom: 1px solid var(--m-band);
}
.tech-name {
  min-width: 0;
  font-size: 11.5px;
  color: var(--m-text2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tech-level {
  flex: none;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--m-text);
  font-variant-numeric: tabular-nums;
}
.tech-level em {
  font-style: normal;
  font-weight: 400;
  color: var(--m-text3);
}
/* 满级换行动色：一眼看出哪几项已经点不动了 */
.tech-level.max {
  color: var(--m-primary);
}
.tech-level.max em {
  color: var(--m-primary);
  opacity: 0.55;
}
.no-tech-data {
  padding: 24px 0;
  text-align: center;
  font-size: 12.5px;
  color: var(--m-text3);
}
</style>
