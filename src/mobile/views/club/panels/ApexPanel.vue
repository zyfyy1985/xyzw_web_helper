<template>
  <div class="m-pane">
    <!-- 工具栏（照抄旧版 .toolbar：逐鹿盐山 / 赛季 / 期号下拉 / 历史期标签 / 当前期 / 进行阶段 / 刷新数据） -->
    <div class="m-card">
      <div class="m-card-h">
        <span class="m-tags">
          <span class="m-tag wait">逐鹿盐山</span>
          <span v-if="season > 0" class="m-tag run">{{ formatSeason(season) }}</span>
          <span v-if="selectedRoundEnded" class="m-tag">历史期 · 已结束</span>
          <span v-else-if="selectedRound" class="m-tag err">当前期</span>
          <span v-if="activeStageName && !selectedRoundEnded" class="m-tag done">{{ activeStageName }}</span>
        </span>
        <span class="m-acts">
          <button v-if="availableRounds.length" class="m-act" @click="roundSheet = true">
            第 {{ selectedRound || "-" }} 期 ▾
          </button>
          <button class="m-act m-act-i" :disabled="loading || !isConnected" @click="fetchAllData">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
            刷新数据
          </button>
        </span>
      </div>
    </div>

    <!-- 分步加载提示：只覆盖「连角色数据都还没有」的那几秒。
         后面补历史竞猜 / 赛程 / 助威榜时要排限流队列，可能十几秒，
         那三块各自出骨架与本卡「加载中…」，不再占用这条进度条。 -->
    <div v-if="loadStage === 'role'" class="m-card m-loadbar">
      <span class="m-spin"></span>
      <span class="m-t" style="margin: 0">{{ stageText }}</span>
      <span class="m-loadbar-hint">只差你的参战记录与重置时间</span>
    </div>

    <!-- 选择 / 进行 提醒条（照抄） -->
    <div v-if="selectedRound" class="m-card">
      <div class="m-card-h">
        <span class="m-t">
          {{ selectedRoundEnded ? `已选择：第 ${selectedRound} 期 · 历史期（已结束，只读）` : `已选择：第 ${selectedRound} 期 · 当前期` }}
        </span>
      </div>
      <template v-if="selectedRoundEnded">
        <p class="m-hint" style="margin: 0">该期已于 {{ selectedRoundEndText }} 结束，仅供回看，不提供助威 / 竞猜操作。</p>
      </template>
      <template v-else>
        <p class="m-hint" style="margin: 0">
          <template v-if="activeStageItem">
            进行中：<b>{{ activeStageName }}</b>
            <template v-if="activeStageItem.dateText && activeStageItem.dateText !== '待开启'">（{{ activeStageItem.dateText }}）</template>
          </template>
          <template v-else-if="nextStageItem">
            下一阶段：<b>{{ nextStageItem.label }}</b>
            <template v-if="nextStageItem.dateText && nextStageItem.dateText !== '待开启'">（{{ nextStageItem.dateText }}）</template>
          </template>
          <template v-else>该期当前没有进行中的阶段</template>
          <template v-if="otherCurrentRounds.length"> · 同期进行中还有第 {{ otherCurrentRounds.join("、") }} 期</template>
        </p>
      </template>
    </div>

    <!-- 连接状态提示（照抄） -->
    <div v-if="!isConnected" class="m-card">
      <div class="m-card-h"><span class="m-t">⚠️ WebSocket 未连接</span></div>
      <p class="m-hint" style="margin: 0">请先在 Token 管理中导入并连接游戏服务器。连接成功后会自动加载数据，也可手动点击「刷新数据」。</p>
    </div>

    <!-- 赛季更新提示（照抄） -->
    <div v-if="confStale" class="m-card">
      <div class="m-card-h"><span class="m-t">⚠️ 配置与当前赛季不匹配</span></div>
      <p class="m-hint" style="margin: 0">
        服务端赛季为第 {{ roleSeason }} 赛季，但本地配置快照未覆盖当前时间（不处于任何赛季窗口）。请以服务端最新配置重新生成 src/utils/apexStageMap.js。
      </p>
    </div>

    <!-- 兜底状态：只有「连本地配置都算不出赛季」时才走到这里
         （配置快照没覆盖当前时间 + 服务器数据还没到 / 已到但角色没参加） -->
    <template v-if="!confReady">
      <div v-if="!dataReady" class="m-card">
        <div class="m-card-h"><span class="m-t">正在确认赛季…</span></div>
        <div class="m-skel"><i></i><i></i><i></i></div>
        <p class="m-hint" style="margin: 10px 0 0">
          本地配置快照没有覆盖当前时间，需要等服务器返回角色赛季后才知道该显示哪一期。
        </p>
      </div>
      <div v-else class="m-card">
        <div class="m-empty" style="padding: 36px 0">
          <div class="m-logo">🏔️</div>
          <h3>{{ roleInfo.apexRoleInfo ? "当前不在逐鹿盐山赛季内" : "暂无逐鹿盐山数据" }}</h3>
          <p v-if="!roleInfo.apexRoleInfo">请点击「刷新数据」加载</p>
        </div>
      </div>
    </template>

    <!-- 子标签 + 四个子视图（照抄 activeSubTab）
         门槛只用 confReady：赛季/期号/阶段/当前赛程全来自本地配置，
         服务器数据（竞猜记录、助威榜、重置时间）在卡内单独判 dataReady。 -->
    <template v-if="confReady">
      <div class="m-seg">
        <button v-for="t in subTabs" :key="t.key" :class="{ on: activeSubTab === t.key }" @click="activeSubTab = t.key">
          {{ t.label }}
        </button>
      </div>

      <!-- ============ 总览 ============ -->
      <template v-if="activeSubTab === 'overview'">
        <div class="m-card">
          <div class="m-card-h"><span class="m-t">🐉 逐鹿盐山</span></div>
          <div class="m-banner-sub">
            {{ formatSeason(season) }} · 第 {{ selectedRound || "-" }} 期
            <span v-if="selectedRoundEnded" class="m-tag">历史期 · 只读</span>
            <template v-if="seasonConf">（{{ seasonConf.startDate }} ~ {{ seasonConf.endDate }}）</template>
          </div>
          <div class="m-stats" style="margin-top: 12px">
            <div class="m-stat"><span class="m-stat-k">参与竞猜期</span><span class="m-stat-v">{{ dataReady ? Object.keys(roleInfo.guessMap || {}).length : "—" }}</span></div>
            <div class="m-stat"><span class="m-stat-k">助威轮次</span><span class="m-stat-v">{{ dataReady ? Object.keys(roleInfo.voteMap || {}).length : "—" }}</span></div>
            <div class="m-stat"><span class="m-stat-k">助威道具</span><span class="m-stat-v">{{ dataReady ? supportItemCnt : "—" }}</span></div>
            <div class="m-stat"><span class="m-stat-k">当前期</span><span class="m-stat-v">{{ selectedRound || "-" }}</span></div>
          </div>
        </div>

        <div class="m-card">
          <div class="m-card-h"><span class="m-t">⏱ 第 {{ selectedRound || "-" }} 期阶段进度</span></div>
          <div class="m-tl">
            <div v-for="st in stageTimeline" :key="st.key" class="m-tl-n" :class="{ active: st.isActive, done: st.isEnded, disabled: !st.isEnable }">
              <span class="m-tl-dot">●</span>
              <span class="m-tl-b">
                <span class="m-tl-nm">
                  {{ st.label }}
                  <span v-if="st.isActive" class="m-tag err">进行中</span>
                  <span v-else-if="st.isEnded" class="m-tag done">已结束</span>
                </span>
                <span class="m-tl-dt">{{ st.dateText }}</span>
              </span>
            </div>
          </div>
        </div>

        <div class="m-card">
          <div class="m-card-h"><span class="m-t">重置卡片</span></div>
          <div class="m-stats">
            <div class="m-stat" v-for="rs in resetCards" :key="rs.label">
              <span class="m-stat-k">{{ rs.icon }} {{ rs.label }}</span>
              <span class="m-stat-v">{{ rs.value }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- ============ 赛程 ============ -->
      <template v-else-if="activeSubTab === 'schedule'">
        <div class="m-card">
          <div class="m-card-h"><span class="m-t">🗓 第 {{ selectedRound || "-" }} 期赛程</span></div>
          <p v-if="currentSchedule.length === 0" class="m-hint" style="text-align: center; padding: 18px 0">当前暂无进行中的赛程</p>
          <div v-else class="m-tl">
            <div v-for="(st, si) in currentSchedule" :key="'cs' + si" class="m-tl-n" :class="{ active: st.isToday, done: st.isPast }">
              <span class="m-tl-dot">●</span>
              <span class="m-tl-b">
                <span class="m-tl-nm">
                  {{ st.stageName }}
                  <span v-if="st.isToday" class="m-tag err">今日</span>
                  <span v-if="st.isPast" class="m-tag done">已过</span>
                </span>
                <span class="m-tl-dt">{{ st.dateText }}</span>
                <span class="m-tl-dt">赛程ID: {{ st.sids.join(", ") }}</span>
              </span>
            </div>
          </div>
        </div>
      </template>

      <!-- ============ 竞猜 ============ -->
      <template v-else-if="activeSubTab === 'bet'">
        <div v-if="actionCooldown.guess > 0" class="m-card">
          <div class="m-card-h"><span class="m-t">⚠️ 竞猜被服务器限流（200400）</span></div>
          <p class="m-hint" style="margin: 0">请 {{ actionCooldown.guess }} 秒后再试；间隔由自适应限流学习得到，连续成功后会自动缩短。</p>
        </div>

        <div class="m-card">
          <div class="m-card-h"><span class="m-t">🎯 {{ currentBetTitle }}</span></div>
          <div v-if="!dataReady || !loadedSources.bets || betsPending" class="m-skel"><i></i><i></i><i></i></div>
          <p v-else-if="currentBets.length === 0" class="m-hint" style="text-align: center; padding: 18px 0">当前期暂无淘汰赛竞猜阶段</p>
          <template v-else>
            <div v-for="grp in currentBets" :key="'cbg' + grp.scheduleId" class="m-grp">
              <div class="m-grp-h">
                <span class="m-grp-t">🏅 {{ grp.stageName }}</span>
                <span class="m-tag" :class="statusTagClass(grp.state)">{{ guessStatusText(grp.state) }}</span>
                <span v-if="grp.advanceNum > 0" class="m-tag job">已押 {{ grp.myBets.length }}/{{ grp.advanceNum }}</span>
              </div>
              <p v-if="grp.state === ApexScheduleStatus.None" class="m-hint" style="margin: 8px 0 0">{{ grp.openTip }}</p>
              <template v-else>
                <div v-for="(b, bi) in visibleBets(grp)" :key="`cb${grp.scheduleId}-${betPage(grp)}-${bi}`" class="m-match">
                  <div class="m-team" :class="{ win: b.team1Win }">
                    <span class="m-team-nm">
                      {{ b.team1Name }}
                      <span v-if="grp.myBets.includes(b.team1Id)" class="m-tag run">我押</span>
                    </span>
                    <span class="m-team-mt">战力 {{ (b.team1Power / POWER_UNIT).toFixed(1) }}亿 · 助威 {{ formatNumber(b.team1Cheer) }}</span>
                    <button
                      v-if="!grp.myBets.includes(b.team1Id)"
                      class="m-btn m-btn-gr"
                      style="padding: 6px 10px; font-size: 11.5px"
                      :disabled="!canBetRow(grp, b) || pendingGuessTeamId !== '' || actionCooldown.guess > 0"
                      :title="grp.betTip"
                      @click="doGuess(b.team1Id, b, grp)"
                    >
                      押 {{ b.team1Name.slice(0, BET_BTN_NAME_LEN) }}
                    </button>
                  </div>
                  <span class="m-match-vs">VS</span>
                  <div class="m-team right" :class="{ win: b.team2Win }">
                    <span class="m-team-nm">
                      {{ b.team2Name }}
                      <span v-if="grp.myBets.includes(b.team2Id)" class="m-tag run">我押</span>
                    </span>
                    <span class="m-team-mt">战力 {{ (b.team2Power / POWER_UNIT).toFixed(1) }}亿 · 助威 {{ formatNumber(b.team2Cheer) }}</span>
                    <button
                      v-if="!grp.myBets.includes(b.team2Id)"
                      class="m-btn m-btn-gr"
                      style="padding: 6px 10px; font-size: 11.5px"
                      :disabled="!canBetRow(grp, b) || pendingGuessTeamId !== '' || actionCooldown.guess > 0"
                      :title="grp.betTip"
                      @click="doGuess(b.team2Id, b, grp)"
                    >
                      押 {{ b.team2Name.slice(0, BET_BTN_NAME_LEN) }}
                    </button>
                  </div>
                </div>
                <div v-if="grp.state !== ApexScheduleStatus.None && betTotalPages(grp) > 1" class="m-pager">
                  <button class="m-btn m-btn-g" style="padding: 6px 10px; font-size: 11.5px" :disabled="betPage(grp) <= 0" @click="goBetPage(grp, -1)">上一页</button>
                  <span class="m-pager-t">第 {{ betPage(grp) + 1 }}/{{ betTotalPages(grp) }} 页 · 已加载 {{ grp.matches.length }} 场</span>
                  <button class="m-btn m-btn-g" style="padding: 6px 10px; font-size: 11.5px" :disabled="betPage(grp) + 1 >= betTotalPages(grp)" @click="goBetPage(grp, 1)">下一页</button>
                </div>
                <div v-else-if="grp.state !== ApexScheduleStatus.None" class="m-pager">
                  <span class="m-pager-t">共 {{ grp.matches.length }} 场对阵</span>
                </div>
              </template>
            </div>
          </template>
        </div>

        <p class="m-hint" style="margin: 4px 2px 0">{{ rateLimitText }}</p>
      </template>

      <!-- ============ 助威 ============ -->
      <template v-else-if="activeSubTab === 'vote'">
        <div v-if="actionCooldown.vote > 0" class="m-card">
          <div class="m-card-h"><span class="m-t">⚠️ 助威被服务器限流（200400）</span></div>
          <p class="m-hint" style="margin: 0">请 {{ actionCooldown.vote }} 秒后再试；间隔由自适应限流学习得到，连续成功后会自动缩短。</p>
        </div>

        <div class="m-card">
          <div class="m-card-h"><span class="m-t">📣 {{ currentRoundTitle }}</span></div>
          <div v-if="!dataReady || !loadedSources.vote || boardPending" class="m-skel"><i></i><i></i><i></i></div>
          <template v-else>
            <p v-if="!supportOpen" class="m-hint" style="margin: 0 0 8px">当前不在助威时间内（仅正式赛段 / 淘汰赛段可助威，且该期不能有已锁定或进行中的场次）。</p>
            <p v-if="currentVoteBoard.length === 0" class="m-hint" style="text-align: center; padding: 18px 0">当前暂无可助威的队伍</p>
            <div v-else class="m-vgrid">
              <div v-for="(t, ti) in currentVoteBoard" :key="'cv' + ti" class="m-vcard" :style="{ '--rank-color': rankColor(t.rank) }">
                <div class="m-vcard-r">#{{ t.rank }}</div>
                <div class="m-vcard-nm">{{ t.name }}</div>
                <div class="m-vcard-mt">战力 {{ (t.power / POWER_UNIT).toFixed(1) }}亿</div>
                <div class="m-pbar"><i :style="{ width: cheerPercent(t.cheerCnt, currentMaxCheer) }"></i></div>
                <div class="m-vcard-cn">
                  🔥 {{ formatNumber(t.cheerCnt) }}
                  <span v-if="t.level > 0" class="m-tag wait">Lv.{{ t.level }}</span>
                  <span v-if="t.myCnt > 0" class="m-vcard-my">我助威 {{ t.myCnt }} 次</span>
                </div>
                <button
                  class="m-btn m-btn-gr"
                  style="margin-top: 8px"
                  :disabled="t.isOut || !supportOpen || selectedRoundEnded || voteLoading || actionCooldown.vote > 0"
                  @click="openVoteDialog(t.teamId, t.name, selectedRound)"
                >
                  {{ t.isOut ? "已淘汰" : "🚀 助威" }}
                </button>
              </div>
            </div>
            <!-- 榜单分批拉：先给前 20 名，想看更多再点。原来一次性拉 200 条要排 12 条命令 -->
            <button
              v-if="currentVoteBoard.length && !voteBoardComplete"
              class="m-btn m-btn-g m-btn-block"
              style="margin-top: 10px; min-height: 40px"
              :disabled="boardPending"
              @click="fetchVoteBoard({ append: true })"
            >
              {{ boardPending ? "加载中…" : `加载更多（已显示 ${currentVoteBoard.length} 支）` }}
            </button>
          </template>
        </div>
      </template>
    </template>

    <!-- 期号选择抽屉（照抄 n-select roundOptions 分组） -->
    <div class="m-mask" :class="{ on: roundSheet }" @click="roundSheet = false"></div>
    <div class="m-sheet" :class="{ on: roundSheet }">
      <div class="m-grab"></div>
      <h4>选择期号</h4>
      <div class="m-sh-sub">只列当前进行中的期号</div>
      <template v-for="g in roundOptions" :key="g.key">
        <div class="m-csub" style="margin-top: 10px">{{ g.label }}</div>
        <div class="m-rlist">
          <button
            v-for="c in g.children"
            :key="c.value"
            class="m-ritem"
            :class="{ on: selectedRound === c.value }"
            @click="pickRound(c.value)"
          >
            {{ c.label }}
          </button>
        </div>
      </template>
    </div>

    <!-- 助威数量抽屉（照抄助威弹窗） -->
    <div class="m-mask" :class="{ on: voteSheet }" @click="voteSheet = false"></div>
    <div class="m-sheet" :class="{ on: voteSheet }">
      <div class="m-grab"></div>
      <h4>助威 {{ voteTargetName || "" }}</h4>
      <div class="m-sh-sub">
        为 {{ voteTargetName }} 助威，当前持有 <span class="m-tag run">{{ supportItemCnt }}</span> 个助威道具
      </div>
      <div class="m-vqty">
        <button class="m-btn m-btn-g" @click="voteChangeNum(-10)">-10</button>
        <button class="m-btn m-btn-g" @click="voteChangeNum(-1)">-1</button>
        <span class="m-vqty-n">{{ voteCnt }}</span>
        <button class="m-btn m-btn-g" @click="voteChangeNum(1)">+1</button>
        <button class="m-btn m-btn-g" @click="voteChangeNum(10)">+10</button>
        <button class="m-btn m-btn-g" @click="voteChangeNum(voteMaxCnt)">MAX</button>
      </div>
      <div style="display: flex; gap: 8px; margin-top: 14px">
        <button class="m-btn m-btn-g" style="flex: 1" @click="voteSheet = false">取消</button>
        <button class="m-btn m-btn-p" style="flex: 1" :disabled="actionCooldown.vote > 0 || voteLoading" @click="doVote">
          确认助威{{ actionCooldown.vote > 0 ? `（冷却 ${actionCooldown.vote}s）` : "" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
/* ============================================================
 * 逐鹿盐山（移动端）
 * 数据逻辑照抄 src/components/Apex/ApexChallenge.vue：
 *   · 配置/规则引擎/限流器原样 import @/utils/apexRules|apexStageMap|apexRateLimit
 *   · 命令 apex_getroleinfo / apex_getguesslist / apex_get64oppomap /
 *          apex_getvotelist / apex_guess / apex_vote（全部经 runApexAction）
 *   · 三类定时器：30s 轮询 / 15s clockTick / 1s 冷却倒计时
 * 旧版无导出功能，移动端同样不提供。
 * ============================================================ */
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import {
  ApexAction,
  apexCooldownLeft,
  apexEstText,
  isApexRateLimited,
  runApexAction,
} from "@/utils/apexRateLimit";
import {
  ApexRoundPhase,
  ApexScheduleStatus,
  ApexStageType,
  apexConstantConf,
  calibrateServerTime,
  canGuessNow,
  canGuessRow,
  checkNowInSeason,
  checkSupportInTime,
  getAdvanceNum,
  getAvailableRounds,
  getCurrentRounds,
  getCurrentSeason,
  getDateZeroTime,
  getGuessTabs,
  getInitialRound,
  getRoundEndTime,
  getRoundPhase,
  getRoundSchedules,
  getScheduleConf,
  getScheduleIdByStage,
  getSeasonConf,
  getStageInfoByRound,
  getStageName,
  getSupportGroupId,
  getSupportLevel,
} from "@/utils/apexRules";

const tokenStore = useTokenStore();
const message = useMessage();

/* ---------- 常量（照抄） ---------- */
const POWER_UNIT = 1e8;
const VOTE_BASE_CNT = 1;
const REQUEST_LIMIT = 3;
const FIRST_PAGES = 2;
const MAX_PAGES = 12;
const GUESS_PAGE_SIZE = 10;
const TIMEOUT_READ = 5000;
const TIMEOUT_QUERY = 6000;
const TIMEOUT_ACTION = 8000;
const POLL_INTERVAL = 30000;
const CLOCK_INTERVAL = 15000;
/* 连上之后还要等一下再发第一条命令：给游戏端 init 留时间。
 * 原来是 1500ms，但这一段全在「首屏空白」里 ⇒ 收到 400ms，失败还有 maxRetry 兜一次。 */
const WS_READY_DELAY = 400;
const BATTLE_WIN_1 = [1, "win1"];
const BATTLE_WIN_2 = [2, "win2"];
const BET_BTN_NAME_LEN = 6;
const VOTE_BOARD_MAX = apexConstantConf.rankShowNum || 200;
/* 助威榜首批只要这么多条（榜单每页约 10 条 ⇒ 2 条命令）。
   一屏最多显示 4 张卡，200 条既看不完、渲染也亏，还得多排 10 条命令。 */
const VOTE_FIRST_ROWS = 20;
const VOTE_FIRST_PAGES = 2;

/* ---------- 状态（照抄 2.1） ---------- */
const clockTick = ref(0);
const roleResetTime = ref({});
const activeSubTab = ref("overview");
const loading = ref(false);
/* 分步加载的可见进度：idle → role（等 apex_getroleinfo）→ lists（等对阵列 / 助威榜）→ done
 * 拆开的原因：一次 apex_getroleinfo 往返就要几秒，期间原来除了工具栏一片空白，
 * 而赛季 / 期号 / 阶段进度 / 当前赛程其实全在本地配置快照里，根本不用等服务器。 */
const loadStage = ref("idle");
/* 助威榜的首批状态：它要排一串请求，没回来就先出骨架 */
const boardPending = ref(false);
const hasAutoLoaded = ref(false);
const createEmptyRoleInfo = () => ({
  apexRoleInfo: null,
  group: {},
  buyRecord: {},
  resetTime: {},
  guessMap: {},
  guessClaimMap: {},
  voteMap: {},
});
const roleInfo = ref(createEmptyRoleInfo());
const currentVoteBoard = ref([]);
const voteBoardComplete = ref(true);
const currentBets = ref([]);
const selectedRound = ref(null);
const voteSheet = ref(false);
const roundSheet = ref(false);
const voteLoading = ref(false);
const voteTargetTeamId = ref("");
const voteTargetName = ref("");
const voteRound = ref(null);
const voteCnt = ref(VOTE_BASE_CNT);
const voteMaxCnt = ref(0);
const pendingGuessTeamId = ref("");
const actionCooldown = reactive({ guess: 0, vote: 0 });
const cooldownTimer = { guess: null, vote: null };
const fetchingStages = new Set();
const refreshSeq = ref(0);
let pollTimer = null;
let clockTimer = null;

/* ---------- computeds（照抄 2.2） ---------- */
const serverNowMs = computed(() => {
  void clockTick.value;
  return calibrateServerTime(Date.now(), roleResetTime.value?.day);
});

const isConnected = computed(() => {
  const token = tokenStore.selectedToken;
  return !!token && tokenStore.getWebSocketStatus(token.id) === "connected";
});

const roleSeason = computed(() => Number(roleInfo.value.resetTime?.season) || 0);

const season = computed(() => {
  const byConf = getCurrentSeason(serverNowMs.value);
  return getSeasonConf(byConf) ? byConf : roleSeason.value;
});

const seasonConf = computed(() => getSeasonConf(season.value));

/* 本地配置快照是否覆盖当前时间：只要它覆盖，赛季 / 期号 / 阶段进度 / 当前赛程
 * 就全都能在「一条网络往返都没回来」的时候先画出来。 */
const confReady = computed(() => season.value > 0);

/* 服务器角色数据是否已到（apex_getroleinfo 的返回）。竞猜记录、助威道具、重置时间
 * 只有它有，其余都靠本地配置 ⇒ 这两件事必须分开判，不能合成一个门。 */
const dataReady = computed(() => !!roleInfo.value.apexRoleInfo);

const stageText = computed(
  () =>
    ({
      role: "正在读取角色数据…",
    })[loadStage.value] || "",
);

/* 下面三块各自「还在补」的状态：对阵列经自适应限流器串行排队，动辄十几秒，
 * 绝不能拿一条总进度条把用户按在那儿 —— 谁没到就让谁自己出骨架。 */
const betsPending = computed(() =>
  currentBets.value.some((g) => g.loading && g.matches.length === 0),
);

const confStale = computed(
  () =>
    !!roleInfo.value.apexRoleInfo &&
    roleSeason.value > 0 &&
    !checkNowInSeason(serverNowMs.value).inSeason,
);

const availableRounds = computed(() =>
  season.value > 0 ? getAvailableRounds(season.value, serverNowMs.value) : [],
);

const supportItemCnt = computed(() => {
  const conf = getSeasonConf(roleSeason.value);
  if (!conf) return 0;
  const start = getDateZeroTime(conf.startDate);
  const end = getDateZeroTime(conf.endDate);
  const now = serverNowMs.value;
  if (!Number.isFinite(start) || !Number.isFinite(end) || now < start || now > end) return 0;
  return Number(roleInfo.value.apexRoleInfo?.voteItemCnt) || 0;
});

const currentRounds = computed(() => {
  void clockTick.value;
  return season.value > 0 ? getCurrentRounds(season.value, serverNowMs.value) : [];
});

const selectedRoundPhase = computed(() => {
  void clockTick.value;
  if (!selectedRound.value || season.value <= 0) return null;
  return getRoundPhase(selectedRound.value, season.value, serverNowMs.value);
});

const selectedRoundEnded = computed(
  () => selectedRoundPhase.value === ApexRoundPhase.Ended,
);

/* 只列「当前期」——已结束的期不再出现在选择器里。
 * 兜底：整季都结束（currentRounds 空）时退回全部可查看期，免得好不容易点开的抽屉是空的。 */
const roundOptions = computed(() => {
  const toOption = (r) => ({ label: `第${r}期`, value: r });
  const live = currentRounds.value;
  const rounds = live.length ? live : availableRounds.value;
  if (!rounds.length) return [];
  return [
    {
      type: "group",
      key: "current",
      label: live.length ? `当前期（${live.length}）` : `可查看期号（${rounds.length}）`,
      children: rounds.map(toOption),
    },
  ];
});

const stageInfo = computed(() => {
  void clockTick.value;
  if (!selectedRound.value || season.value <= 0) return null;
  return getStageInfoByRound(selectedRound.value, season.value, serverNowMs.value);
});

const STAGE_SEGMENT_NAME = {
  [ApexStageType.TaoTai]: "淘汰赛段",
  [ApexStageType.ZhengShi]: "正式赛段",
  [ApexStageType.YuXuan]: "预选赛段",
  [ApexStageType.HaiXuan]: "海选赛段",
  [ApexStageType.SignUp]: "报名",
};

const STAGE_PRIORITY = [
  ApexStageType.TaoTai,
  ApexStageType.ZhengShi,
  ApexStageType.YuXuan,
  ApexStageType.HaiXuan,
  ApexStageType.SignUp,
];

const activeStageName = computed(() => {
  const info = stageInfo.value;
  if (!info) return "";
  for (const key of STAGE_PRIORITY) {
    const s = info[key];
    if (s && s.isEnable && s.isStarted && !s.isEnded) {
      return key === ApexStageType.SignUp ? `${s.extra?.title || "报名"}中` : STAGE_SEGMENT_NAME[key];
    }
  }
  for (const key of STAGE_PRIORITY) {
    const s = info[key];
    if (s && !s.isStarted && Number.isFinite(s.startTime) && s.startTime > 0) {
      return `${STAGE_SEGMENT_NAME[key]}（待开始）`;
    }
  }
  return "";
});

const activeStageItem = computed(() => {
  void clockTick.value;
  const list = stageTimeline.value;
  for (const key of STAGE_PRIORITY) {
    const item = list.find((s) => s.key === key);
    if (item && item.isEnable && item.isActive) return item;
  }
  return null;
});

const nextStageItem = computed(() => {
  void clockTick.value;
  const list = stageTimeline.value;
  for (const key of STAGE_PRIORITY) {
    const item = list.find((s) => s.key === key);
    if (item && !item.isActive && !item.isEnded) return item;
  }
  return null;
});

const selectedRoundEndText = computed(() => {
  void clockTick.value;
  if (!selectedRound.value || season.value <= 0) return "";
  const ms = getRoundEndTime(selectedRound.value, season.value);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
});

const otherCurrentRounds = computed(() =>
  currentRounds.value.filter((r) => r !== selectedRound.value),
);

const supportOpen = computed(() => {
  void clockTick.value;
  if (!selectedRound.value || season.value <= 0) return false;
  return checkSupportInTime(selectedRound.value, season.value, serverNowMs.value);
});

const stageTimeline = computed(() => {
  const info = stageInfo.value;
  if (!info) return [];
  return [
    [ApexStageType.SignUp, "报名"],
    [ApexStageType.HaiXuan, "海选赛"],
    [ApexStageType.YuXuan, "预选赛"],
    [ApexStageType.ZhengShi, "正式赛"],
    [ApexStageType.TaoTai, "淘汰赛"],
  ].map(([key, label]) => {
    const s = info[key];
    return {
      key,
      label: s.extra?.title ? `${label}（${s.extra.title}）` : label,
      isEnable: s.isEnable,
      isEnded: s.isEnded,
      isActive: s.isStarted && !s.isEnded,
      dateText: s.isEnable ? `${s.startDate} ~ ${s.endDate}` : "待开启",
    };
  });
});

/* 日/周/月重置时间只有服务器知道 ⇒ 数据没到给「—」，别拿 "-" 冒充「没有」。
   注意「当前赛季」是本地的（getSeasonConf），不跟着 dataReady 走。 */
const resetCards = computed(() => [
  { label: "日重置", icon: "📅", value: dataReady.value ? roleInfo.value.resetTime?.day || "-" : "—" },
  { label: "周重置", icon: "🗓", value: dataReady.value ? roleInfo.value.resetTime?.week || "-" : "—" },
  { label: "月重置", icon: "🌙", value: dataReady.value ? roleInfo.value.resetTime?.month || "-" : "—" },
  { label: "当前赛季", icon: "👑", value: formatSeason(season.value) },
]);

const formatSeason = (val) => (val > 0 ? `第${val}赛季` : "-");

const formatRoundTitle = (prefix) =>
  selectedRound.value ? `${prefix} · 第${selectedRound.value}期` : prefix;
const currentRoundTitle = computed(() => formatRoundTitle("当前助威"));
const currentBetTitle = computed(() => formatRoundTitle("当前竞猜"));

const currentSchedule = computed(() => {
  if (!selectedRound.value || season.value <= 0) return [];
  const list = getRoundSchedules(selectedRound.value, season.value);
  if (!list.length) return [];
  const todayStr = roleResetTime.value?.day || "";
  const todayCmp = todayStr
    ? `20${todayStr.slice(0, 2)}/${todayStr.slice(2, 4)}/${todayStr.slice(4, 6)}`
    : "";
  const stageMap = new Map();
  for (const conf of list) {
    if (!stageMap.has(conf.stage)) {
      stageMap.set(conf.stage, {
        stage: conf.stage,
        stageName: getStageName(conf.stage),
        date: conf.date || "",
        sids: [],
      });
    }
    stageMap.get(conf.stage).sids.push(conf.id);
  }
  return [...stageMap.values()]
    .map((st) => ({
      ...st,
      isPast: !!todayCmp && !!st.date && st.date < todayCmp,
      isToday: !!todayCmp && st.date === todayCmp,
      dateText: st.date ? st.date.replace(/\//g, "-") : "待定",
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.stage - b.stage));
});

const voteScheduleId = computed(() => {
  const round = selectedRound.value;
  if (!round || season.value <= 0) return -1;
  const info = stageInfo.value;
  if (info?.[ApexStageType.TaoTai]?.isEnable) {
    return getScheduleIdByStage(ApexStageType.TaoTai, round, season.value);
  }
  if (info?.[ApexStageType.ZhengShi]?.isEnable) {
    return getScheduleIdByStage(ApexStageType.ZhengShi, round, season.value);
  }
  const tabs = getGuessTabs(round, season.value, serverNowMs.value);
  return tabs.length ? tabs[0].scheduleId : -1;
});

const currentMaxCheer = computed(() =>
  currentVoteBoard.value.reduce((m, t) => Math.max(m, t.cheerCnt || 0), 0),
);

const rateLimitText = computed(() => {
  void clockTick.value;
  return apexEstText();
});

/* ---------- 工具函数（照抄） ---------- */
const formatNumber = (n) => {
  if (n === null || n === undefined) return "0";
  return n >= 10000 ? `${(n / 10000).toFixed(1)}万` : String(n);
};

const mapLimit = async (items, limit, fn) => {
  const out = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
  }
  return out;
};

const guessStatusText = (state) =>
  ({
    [ApexScheduleStatus.None]: "未开启",
    [ApexScheduleStatus.Unlocked]: "竞猜开放中",
    [ApexScheduleStatus.Locked]: "阵容已锁定（仍可竞猜）",
    [ApexScheduleStatus.Fighting]: "比赛进行中",
    [ApexScheduleStatus.Completed]: "已结束",
  })[state] || "未知";

const guessStatusTag = (state) =>
  ({
    [ApexScheduleStatus.None]: "default",
    [ApexScheduleStatus.Unlocked]: "success",
    [ApexScheduleStatus.Locked]: "warning",
    [ApexScheduleStatus.Fighting]: "info",
    [ApexScheduleStatus.Completed]: "default",
  })[state] || "default";

const statusTagClass = (state) =>
  ({
    default: "",
    success: "done",
    warning: "wait",
    info: "run",
  })[guessStatusTag(state)] || "";

const buildOpenTip = (scheduleId) => {
  const conf = getScheduleConf(scheduleId);
  const dayZero = conf && getDateZeroTime(conf.date);
  if (!Number.isFinite(dayZero)) return "该阶段暂无配置";
  const fight = new Date(dayZero + conf.fightTime * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `该阶段竞猜尚未开放（${conf.date} ${pad(fight.getHours())}:${pad(fight.getMinutes())} 开赛）`;
};

const getMyVoteCnt = (teamId) =>
  Number(roleInfo.value.voteMap?.[selectedRound.value]?.[teamId]?.cnt) || 0;

const canBetRow = (grp, row) => grp.canBet && canGuessRow(grp.state, grp.stage, row);

const rankColor = (rank) => {
  if (rank === 1) return "#f5a623";
  if (rank === 2) return "#7f8fa6";
  if (rank === 3) return "#cd6133";
  return "#576574";
};

const cheerPercent = (cnt, max) =>
  max ? `${Math.max(4, Math.round((cnt / max) * 100))}%` : "0%";

const toTeamFields = (src) => {
  const t = src || {};
  return { Id: t.teamId || "-", Name: t.name || "未知", Power: t.power || 0 };
};

const toMatchRow = (pair) => {
  const [t1, t2] = pair || [];
  const s1 = toTeamFields(t1);
  const s2 = toTeamFields(t2);
  return {
    team1Id: s1.Id,
    team1Name: s1.Name,
    team1Power: s1.Power,
    team1Cheer: t1?.cheerCnt || 0,
    team1Win: t1?.isWin === true,
    team2Id: s2.Id,
    team2Name: s2.Name,
    team2Power: s2.Power,
    team2Cheer: t2?.cheerCnt || 0,
    team2Win: t2?.isWin === true,
  };
};

const startActionCooldown = (key, ms) => {
  const sec = Math.max(1, Math.ceil(ms / 1000));
  if (actionCooldown[key] < sec) actionCooldown[key] = sec;
  if (cooldownTimer[key]) return;
  cooldownTimer[key] = setInterval(() => {
    actionCooldown[key] -= 1;
    if (actionCooldown[key] <= 0) {
      actionCooldown[key] = 0;
      clearInterval(cooldownTimer[key]);
      cooldownTimer[key] = null;
    }
  }, 1000);
};

const stopActionCooldown = () => {
  for (const key of Object.keys(cooldownTimer)) {
    if (cooldownTimer[key]) {
      clearInterval(cooldownTimer[key]);
      cooldownTimer[key] = null;
    }
    actionCooldown[key] = 0;
  }
};

/* ---------- 数据拉取（照抄第 3 节） ---------- */
const fetchPagedList = async ({
  cmd,
  params,
  listKey,
  timeout,
  startIdx = 0,
  maxPages = MAX_PAGES,
  maxRows = Infinity,
}) => {
  const token = tokenStore.selectedToken;
  if (!token) return { rows: [], last: true };
  const rows = [];
  let last = false;
  for (let p = 0; p < maxPages && !last; p++) {
    let res;
    try {
      res = await runApexAction(
        ApexAction.READ,
        (queuedMs) =>
          tokenStore.sendMessageWithPromise(
            token.id,
            cmd,
            { ...params, idx: startIdx + rows.length },
            timeout + queuedMs,
          ),
        { maxRetry: 1 },
      );
    } catch (e) {
      /* 被限流：保留已拿到的行直接返回，last 仍是 false ⇒ 调用方可以稍后再补 */
      if (isApexRateLimited(e)) break;
      throw e;
    }
    const list = res?.[listKey] || [];
    if (!list.length) break;
    rows.push(...list);
    /* ★ last 只认服务端：本地上限（maxRows / maxPages）只用来「停」，
       不能顺手把它标成「已到底」—— 否则助威榜这种分批拉的列表，
       第一批撞上 maxRows 就会被判成没有下一页，「加载更多」点了也没用。 */
    if (res?.last === true) {
      last = true;
      break;
    }
    if (rows.length >= maxRows) break;
  }
  return { rows, last };
};

const fetchRoleInfo = async () => {
  const token = tokenStore.selectedToken;
  if (!token) return null;
  try {
    const res = await runApexAction(
      ApexAction.READ,
      (queuedMs) =>
        tokenStore.sendMessageWithPromise(token.id, "apex_getroleinfo", {}, TIMEOUT_READ + queuedMs),
      { maxRetry: 1 },
    );
    const ri = res?.apexRoleInfo;
    if (ri) {
      roleInfo.value.apexRoleInfo = ri;
      roleInfo.value.group = ri.group || {};
      roleInfo.value.buyRecord = ri.buyRecord || {};
      roleInfo.value.resetTime = ri.resetTime || {};
      roleResetTime.value = ri.resetTime || {};
      roleInfo.value.guessMap = ri.guessMap || {};
      roleInfo.value.guessClaimMap = ri.guessClaimMap || {};
      roleInfo.value.voteMap = ri.voteMap || {};
    }
    return res;
  } catch (e) {
    console.warn("apex_getroleinfo 失败:", e.message);
    return null;
  }
};

const syncSelectedRound = () => {
  const rounds = availableRounds.value;
  if (!rounds.length) {
    selectedRound.value = null;
    return;
  }
  if (rounds.includes(selectedRound.value)) return;
  selectedRound.value = getInitialRound(rounds, season.value, serverNowMs.value);
};

const fetchMatchesPage = async (grp) => {
  if (fetchingStages.has(grp.scheduleId)) return;
  fetchingStages.add(grp.scheduleId);
  grp.loading = true;
  try {
    const { rows, last } = await fetchPagedList({
      cmd: "apex_getguesslist",
      params: { scheduleId: grp.scheduleId },
      listKey: "apexGuessList",
      timeout: TIMEOUT_QUERY,
      startIdx: grp.matches.length,
      maxPages: FIRST_PAGES,
    });
    grp.matches.push(...rows.map(toMatchRow));
    grp.hasMore = !last && rows.length > 0;
    if (!rows.length) grp.exhausted = true;
  } catch (e) {
    if (isApexRateLimited(e)) {
      grp.hasMore = true;
    } else {
      grp.hasMore = false;
      grp.exhausted = true;
    }
  } finally {
    grp.loading = false;
    fetchingStages.delete(grp.scheduleId);
  }
};

const betTotalPages = (grp) => {
  const known = grp.advanceNum > 0 && !grp.exhausted ? grp.advanceNum : grp.matches.length;
  return Math.max(1, Math.ceil(known / GUESS_PAGE_SIZE));
};

const betPage = (grp) => Math.min(grp.page || 0, betTotalPages(grp) - 1);

const visibleBets = (grp) => {
  const start = betPage(grp) * GUESS_PAGE_SIZE;
  return grp.matches.slice(start, start + GUESS_PAGE_SIZE);
};

const ensureBetRows = async (grp, need) => {
  let guard = 0;
  while (grp.matches.length < need && !grp.exhausted && guard < MAX_PAGES) {
    const before = grp.matches.length;
    await fetchMatchesPage(grp);
    if (grp.matches.length === before) {
      grp.exhausted = true;
      break;
    }
    guard += 1;
  }
};

const goBetPage = async (grp, delta) => {
  const next = Math.min(Math.max(betPage(grp) + delta, 0), betTotalPages(grp) - 1);
  await ensureBetRows(grp, (next + 1) * GUESS_PAGE_SIZE);
  grp.page = Math.min(next, betTotalPages(grp) - 1);
};

const refreshCurrentBets = () => {
  const round = selectedRound.value;
  if (!round || season.value <= 0) {
    currentBets.value = [];
    return;
  }
  const guessMap = roleInfo.value.guessMap || {};
  currentBets.value = getGuessTabs(round, season.value, serverNowMs.value).map((tab) => {
    const prev = currentBets.value.find((g) => g.scheduleId === tab.scheduleId);
    const myBets = guessMap[tab.scheduleId] || [];
    const advanceNum = getAdvanceNum(round, season.value, tab.stage);
    const full = advanceNum > 0 && myBets.length >= advanceNum;
    const betTip =
      tab.state === ApexScheduleStatus.None
        ? "该场竞猜尚未开放"
        : tab.state === ApexScheduleStatus.Fighting
          ? "比赛进行中，已停止竞猜"
          : tab.state === ApexScheduleStatus.Completed
            ? "该场竞猜已结束"
            : full
              ? `该阶段最多可押 ${advanceNum} 支队伍，已押满`
              : "";
    const grp = {
      stage: tab.stage,
      scheduleId: tab.scheduleId,
      stageName: tab.title,
      state: tab.state,
      advanceNum,
      myBets,
      canBet: canGuessNow(tab.state) && !full,
      betTip,
      openTip: buildOpenTip(tab.scheduleId),
      matches: prev?.matches || [],
      hasMore: prev?.hasMore ?? true,
      exhausted: prev?.exhausted ?? false,
      page: prev?.page ?? 0,
      loading: false,
    };
    if (grp.state === ApexScheduleStatus.None) {
      grp.hasMore = false;
    } else if (grp.matches.length === 0 && grp.hasMore) {
      fetchMatchesPage(grp);
    }
    return grp;
  });
};

/* 助威榜：分批拉。
 * 榜单按助威数降序 ⇒ 第一名必在第一页，进度条基数（currentMaxCheer）不会因为
 * 后面没加载而失真。原来一上来就把 maxRows 设成 rankShowNum（200），
 * 每页一条命令、连发 12 条，光排队就 6~9 秒。 */
const fetchVoteBoard = async ({ append = false, rowsWanted = 0 } = {}) => {
  const round = selectedRound.value;
  if (!round || season.value <= 0 || !tokenStore.selectedToken) return;
  const groupId = getSupportGroupId(roleInfo.value.group, voteScheduleId.value);
  const target = append
    ? currentVoteBoard.value.length + VOTE_FIRST_ROWS
    : rowsWanted || VOTE_FIRST_ROWS;
  boardPending.value = true;
  try {
    const { rows, last } = await fetchPagedList({
      cmd: "apex_getvotelist",
      params: { groupId, round },
      listKey: "apexVoteList",
      timeout: TIMEOUT_READ,
      startIdx: append ? currentVoteBoard.value.length : 0,
      maxPages: VOTE_FIRST_PAGES,
      maxRows: Math.min(target, VOTE_BOARD_MAX),
    });
    const offset = append ? currentVoteBoard.value.length : 0;
    const mapped = rows.map((t, i) => ({
      rank: offset + i + 1,
      teamId: t.teamId || "-",
      name: t.name || "未知",
      cheerCnt: t.cheerCnt || 0,
      power: t.power || 0,
      isOut: t.isOut === true,
      level: getSupportLevel(t.cheerCnt || 0),
      myCnt: getMyVoteCnt(t.teamId),
      round,
    }));
    voteBoardComplete.value = last;
    currentVoteBoard.value = append ? [...currentVoteBoard.value, ...mapped] : mapped;
  } catch {
    // 请求失败（含限流）：保留上一次已加载的榜单，不清空
  } finally {
    boardPending.value = false;
  }
};

const fetchAllData = async () => {
  const token = tokenStore.selectedToken;
  if (!token) {
    message.warning("请先选择 Token");
    return;
  }
  if (!isConnected.value) {
    message.warning("WebSocket 未连接，请确保游戏已连接");
    return;
  }
  /* 先把本地就能算的那层摆上桌：赛季标签、期号、阶段进度、当前赛程。
     这几样全来自 apexStageMap.js 配置快照，一条网络请求都不用等。 */
  syncSelectedRound();
  loading.value = true;
  loadStage.value = "role";
  try {
    const res = await fetchRoleInfo();
    if (!res?.apexRoleInfo) {
      message.error("逐鹿盐山数据为空，该角色可能未参加活动");
      return;
    }
    /* 角色数据到手：总览的计数 / 重置时间一次到位，进度条到此收工 */
    syncSelectedRound();
    /* 刷新 = 用户明确要最新：清掉「已取过」标记，然后只重取当前这一页，
       其它页等点开时再按需拉（否则一按刷新就又是一串请求排限流队列）。 */
    loadedSources.bets = false;
    loadedSources.vote = false;
    hasAutoLoaded.value = true;
    loadStage.value = "done";
    loading.value = false;
    loadTabData(activeSubTab.value, { force: true });
  } catch (e) {
    message.error(`加载失败: ${e.message}`);
  } finally {
    loadStage.value = "done";
    loading.value = false;
  }
};

const refreshLiveData = async () => {
  if (!tokenStore.selectedToken || !isConnected.value) return;
  if (pendingGuessTeamId.value || voteLoading.value) return;
  const mySeq = ++refreshSeq.value;
  await fetchRoleInfo();
  if (refreshSeq.value !== mySeq) return;
  /* 30s 轮询只续「已经打开过的页」，没点开过的页不替它拉数据 */
  if (loadedSources.bets) refreshCurrentBets();
  /* 助威榜：按已展开的条数续拉，别把用户点出来的「更多」打回前 20 名 */
  if (loadedSources.vote) {
    fetchVoteBoard({ rowsWanted: Math.max(VOTE_FIRST_ROWS, currentVoteBoard.value.length) });
  }
};

const startPolling = () => {
  stopPolling();
  pollTimer = setInterval(refreshLiveData, POLL_INTERVAL);
  clockTimer = setInterval(() => {
    clockTick.value++;
  }, CLOCK_INTERVAL);
};

const stopPolling = () => {
  if (pollTimer) clearInterval(pollTimer);
  if (clockTimer) clearInterval(clockTimer);
  pollTimer = null;
  clockTimer = null;
  stopActionCooldown();
};

/* ---------- 交互动作（照抄第 4 节） ---------- */
const doGuess = async (teamId, row, grp) => {
  if (pendingGuessTeamId.value) {
    message.warning("上一笔竞猜请求处理中，请稍候");
    return;
  }
  if (actionCooldown.guess > 0) {
    message.warning(`竞猜被服务器限流，请 ${actionCooldown.guess} 秒后再试`);
    return;
  }
  if (!canBetRow(grp, row)) {
    message.warning(grp.betTip || "该场竞猜当前不可押注");
    return;
  }
  const token = tokenStore.selectedToken;
  if (!token) return;
  const name = row.team1Id === teamId ? row.team1Name : row.team2Name;
  pendingGuessTeamId.value = teamId;
  try {
    await runApexAction(
      ApexAction.GUESS,
      (queuedMs) =>
        tokenStore.sendMessageWithPromise(
          token.id,
          "apex_guess",
          { teamId },
          TIMEOUT_ACTION + queuedMs,
        ),
      {
        immediate: true,
        onWait: (ms) => startActionCooldown("guess", ms),
      },
    );
    message.success(`已竞猜 ${name}，等待开赛结果`);
    actionCooldown.guess = 0;
    await fetchRoleInfo();
    refreshCurrentBets();
  } catch (e) {
    if (isApexRateLimited(e)) {
      startActionCooldown("guess", apexCooldownLeft(ApexAction.GUESS));
      message.warning(`服务器限流（200400），请 ${actionCooldown.guess} 秒后再试`);
    } else {
      message.error(`竞猜请求失败: ${e.message}`);
    }
  } finally {
    pendingGuessTeamId.value = "";
  }
};

const openVoteDialog = (teamId, name, round) => {
  voteTargetTeamId.value = teamId;
  voteTargetName.value = name || "该队伍";
  voteRound.value = round;
  voteMaxCnt.value = supportItemCnt.value || 0;
  voteCnt.value = voteMaxCnt.value > 0 ? VOTE_BASE_CNT : 0;
  voteSheet.value = true;
};

const voteChangeNum = (delta) => {
  const max = voteMaxCnt.value;
  const min = max > 0 ? VOTE_BASE_CNT : 0;
  voteCnt.value = Math.max(min, Math.min(max, voteCnt.value + delta));
};

const doVote = async () => {
  const token = tokenStore.selectedToken;
  if (!token || !voteTargetTeamId.value) return;
  if (!voteRound.value) {
    message.warning("助威期数无效，请重新选择队伍");
    return;
  }
  if (actionCooldown.vote > 0) {
    message.warning(`助威被服务器限流，请 ${actionCooldown.vote} 秒后再试`);
    return;
  }
  if (!supportOpen.value) {
    message.warning("当前不在助威时间内");
    return;
  }
  if (voteCnt.value <= 0) {
    message.warning("请选择助威数量");
    return;
  }
  voteLoading.value = true;
  try {
    await runApexAction(
      ApexAction.VOTE,
      (queuedMs) =>
        tokenStore.sendMessageWithPromise(
          token.id,
          "apex_vote",
          { teamId: voteTargetTeamId.value, round: voteRound.value, voteCnt: voteCnt.value },
          TIMEOUT_ACTION + queuedMs,
        ),
      {
        immediate: true,
        onWait: (ms) => startActionCooldown("vote", ms),
      },
    );
    message.success(`已为 ${voteTargetName.value} 助威 ${voteCnt.value} 次`);
    voteSheet.value = false;
    actionCooldown.vote = 0;
    await fetchRoleInfo();
    /* 助威完只刷新「已经展示出来的那几条」，不把列表打回前 20 名 */
    fetchVoteBoard({ rowsWanted: Math.max(VOTE_FIRST_ROWS, currentVoteBoard.value.length) });
  } catch (e) {
    if (isApexRateLimited(e)) {
      startActionCooldown("vote", apexCooldownLeft(ApexAction.VOTE));
      message.warning(`服务器限流（200400），请 ${actionCooldown.vote} 秒后再试`);
    } else {
      message.error(`助威请求失败: ${e.message}`);
    }
  } finally {
    voteLoading.value = false;
  }
};

/* ---------- 期号选择（移动端交互） ---------- */
const pickRound = (v) => {
  roundSheet.value = false;
  selectedRound.value = v;
};

const subTabs = [
  { key: "overview", label: "🏆 总览" },
  { key: "schedule", label: "🗓 赛程" },
  { key: "bet", label: "🎯 竞猜" },
  { key: "vote", label: "📣 助威" },
];

/* ============ 按 tab 分步取数 ============
 * 每个子页的重数据各自一个「已取过」标记：
 *   · 总览：不需要额外请求，全部来自那一条 apex_getroleinfo（计数 / 重置时间 / 分组）
 *   · 竞猜：每个阶段一场 apex_getguesslist（当前对阵）+ 每个押过的场次一条（历史记录）
 *   · 赛程：每个场次一条 apex_get64oppomap（64 强对阵表）
 *   · 助威：一条 apex_getvotelist（可能翻页）
 * 原来拿到角色数据就把后面三类一次性全发出去 —— 停在总览也会排十几条，
 * 自适应限流器按 0.6s 串行，页面要等十几秒才「安静下来」。现在谁被点开才拉谁。 */
const loadedSources = reactive({ bets: false, vote: false });

const loadTabData = (tab, { force = false } = {}) => {
  if (!dataReady.value) return;
  if (tab === "bet") {
    if (force || !loadedSources.bets) {
      loadedSources.bets = true;
      refreshCurrentBets();
    }
    return;
  }
  if (tab === "vote") {
    if (force || !loadedSources.vote) {
      loadedSources.vote = true;
      fetchVoteBoard();
    }
  }
};

/* 切页签 / 角色数据刚到：都只补「当前这一页」 */
watch(activeSubTab, (tab) => loadTabData(tab));
watch(dataReady, (ready) => {
  if (ready) loadTabData(activeSubTab.value);
});

/* ---------- 生命周期与监听（照抄第 5 节） ---------- */
onMounted(() => {
  /* 先按本地配置把期号定下来（此时一条请求都没发）：
     season / availableRounds / initialRound 全是纯配置计算，不需要服务器。 */
  syncSelectedRound();
  if (isConnected.value && !hasAutoLoaded.value) fetchAllData();
  startPolling();
});

onUnmounted(stopPolling);

watch(selectedRound, (round, old) => {
  if (!round || round === old) return;
  currentVoteBoard.value = [];
  voteBoardComplete.value = true;
  currentBets.value = [];
  /* 期号一换，上一期的对阵 / 榜单全部作废：标记清零，只补当前这一页 */
  loadedSources.bets = false;
  loadedSources.vote = false;
  /* 角色数据没到就先别拉：getGuessTabs 是本地算的，会一口气发出好几条
     apex_getguesslist，既抢限流额度又拿不到 myBets。等角色数据到了由 dataReady 兜。 */
  if (!dataReady.value) return;
  loadTabData(activeSubTab.value, { force: true });
});

watch(
  () => isConnected.value,
  async (connected) => {
    if (connected && !hasAutoLoaded.value) {
      await new Promise((r) => setTimeout(r, WS_READY_DELAY));
      if (isConnected.value && !hasAutoLoaded.value) fetchAllData();
    }
  },
);

watch(
  () => tokenStore.selectedToken?.id,
  async (newId, oldId) => {
    if (!newId || newId === oldId) return;
    roleInfo.value = createEmptyRoleInfo();
    roleResetTime.value = {};
    currentVoteBoard.value = [];
    currentBets.value = [];
    selectedRound.value = null;
    pendingGuessTeamId.value = "";
    fetchingStages.clear();
    hasAutoLoaded.value = false;
    loadStage.value = "idle";
    loadedSources.bets = false;
    loadedSources.vote = false;
    stopPolling();
    /* 换号后同样先把本地配置那层补上，别让页面退回一片空白 */
    syncSelectedRound();
    if (isConnected.value) {
      await new Promise((r) => setTimeout(r, 500));
      fetchAllData();
      startPolling();
    }
  },
);
</script>

<script>
export default { name: "MobileApexPanel" };
</script>

<style scoped>
/* ---------- 分步加载：一行细条 + 骨架块 ---------- */
.m-loadbar { display: flex; align-items: center; gap: 8px; }
.m-loadbar .m-t { margin: 0; }
/* 转圈：只画半圈、靠 border-top 换色 —— 比整颗 spinner 组件轻，14px 小方块也不动布局 */
.m-spin {
  width: 14px; height: 14px; flex: none; box-sizing: border-box;
  border-radius: 50%;
  border: 2px solid var(--m-border);
  border-top-color: var(--m-primary);
  animation: m-spin 0.8s linear infinite;
}
.m-loadbar-hint { margin-left: auto; font-size: 11px; color: var(--m-text3); }
@media (max-width: 359px) {
  /* 320：这行提示折下去会把条子撑到 73px，比它提示的内容还显眼 ⇒ 直接不显示，
     状态文案本身已经说清在干什么了。 */
  .m-loadbar-hint { display: none; }
}
/* 骨架：三行递减的灰条，只表达「这里将来会有内容」，不塞假数据 */
.m-skel { display: flex; flex-direction: column; gap: 8px; padding: 4px 0; }
.m-skel i {
  display: block; height: 12px; border-radius: var(--m-r-sm);
  background: var(--m-band);
  animation: m-skel-pulse 1.3s ease-in-out infinite;
}
.m-skel i:nth-child(2) { width: 82%; }
.m-skel i:nth-child(3) { width: 62%; }
@keyframes m-spin { to { transform: rotate(360deg); } }
@keyframes m-skel-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

.m-banner-sub { font-size: 12.5px; font-weight: 700; color: var(--m-text2); display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
/* 阶段时间线 */
.m-tl { display: flex; flex-direction: column; }
.m-tl-n { display: flex; align-items: flex-start; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--m-border); }
.m-tl-n:last-child { border-bottom: none; }
.m-tl-dot { color: var(--m-text3); font-size: 9px; line-height: 1.6; flex: none; }
.m-tl-n.active .m-tl-dot { color: var(--m-red); }
.m-tl-n.done .m-tl-dot { color: var(--m-green); }
.m-tl-n.disabled { opacity: 0.45; }
.m-tl-b { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.m-tl-nm { font-size: 12.5px; font-weight: 700; color: var(--m-text); display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.m-tl-dt { font-size: 11px; color: var(--m-text3); }
/* 对阵行 */
.m-match { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--m-border); }
.m-match:last-child { border-bottom: none; }
.m-match-vs { font-size: 10.5px; font-weight: 700; color: var(--m-text3); flex: none; }
.m-team { min-width: 0; }
.m-team.right { text-align: right; }
.m-team-nm { display: flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 700; color: var(--m-text); flex-wrap: wrap; }
.m-team.right .m-team-nm { justify-content: flex-end; }
.m-team-mt { display: block; font-size: 10.5px; color: var(--m-text3); margin-top: 3px; }
.m-team.win .m-team-nm { color: var(--m-green); }
/* 竞猜分组 */
.m-grp { border: 1px solid var(--m-border); border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; }
.m-grp:last-child { margin-bottom: 0; }
.m-grp-h { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 4px; }
.m-grp-t { font-size: 12.5px; font-weight: 700; color: var(--m-text); }
/* 翻页条 */
.m-pager { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; }
.m-pager-t { font-size: 11px; color: var(--m-text3); text-align: center; flex: 1; }
/* 助威队伍卡 */
.m-vgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.m-vcard { border: 1px solid var(--m-border); border-radius: 8px; padding: 10px; min-width: 0; }
.m-vcard-r { font-size: 13px; font-weight: 700; color: var(--rank-color, var(--m-text3)); }
.m-vcard-nm { font-size: 12.5px; font-weight: 700; color: var(--m-text); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-vcard-mt { font-size: 10.5px; color: var(--m-text3); margin: 2px 0 6px; }
.m-vcard-cn { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; color: var(--m-text2); margin-top: 6px; }
.m-vcard-my { color: var(--m-primary); font-weight: 700; }
/* 助威数量 */
.m-vqty { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 12px; }
.m-vqty-n { min-width: 44px; text-align: center; font-size: 17px; font-weight: 700; color: var(--m-text); font-variant-numeric: tabular-nums; }
/* 期号列表 */
.m-rlist { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.m-ritem {
  border: 1px solid var(--m-border); background: var(--m-bg); color: var(--m-text);
  border-radius: var(--m-r-sm); padding: 7px 14px; font-size: 12.5px; font-weight: 700; font-family: inherit; cursor: pointer;
}
.m-ritem.on {
  background: var(--m-primary);
  border-color: transparent; color:var(--m-on-primary);
}
</style>
