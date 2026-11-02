<template>
  <div class="m-pane" ref="exportDom">
    <!-- 工具栏（照抄旧版 .toolbar：日程 tag + 标题 + 阵营 radio + 导出长图 + 刷新战况） -->
    <div class="m-card">
      <div class="m-card-h">
        <span class="m-tags m-sched">
          <span class="m-tag m-sched-tag" :class="isMatchDay ? 'done' : 'wait'">{{ scheduleText }}</span>
        </span>
        <span class="m-acts" v-if="!exporting">
          <button class="m-act m-act-i" :disabled="currentMemberList.length === 0" @click="handleExportImage">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="m21 15-4.5-4.5L7 20"/></svg>
            导出长图
          </button>
          <button class="m-act" :disabled="loading" @click="fetchCampChallengeData">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
            刷新战况
          </button>
        </span>
      </div>
      <div class="m-camp-t">营地挑战（30人俱乐部对决）</div>
      <div class="m-seg" style="margin-top: 10px">
        <button :class="{ on: selectedSide === 'own' }" @click="selectedSide = 'own'">我方阵营阵容</button>
        <button :class="{ on: selectedSide === 'opponent' }" @click="selectedSide = 'opponent'">敌方阵营阵容</button>
      </div>
    </div>

    <!-- VS 看板（照抄） -->
    <template v-if="battleInfo">
      <div class="m-card">
        <div class="m-vs">
          <div class="m-vs-c">
            <div class="m-vs-id">ID: {{ battleInfo.ownClub.id }} · {{ battleInfo.ownClub.serverId ? battleInfo.ownClub.serverId + "服" : "本服" }}</div>
            <div class="m-vs-row">
              <span class="m-clogo m-clogo-s">
                <img v-if="battleInfo.ownClub.logo" :src="battleInfo.ownClub.logo" alt="" />
                <span v-else>{{ (battleInfo.ownClub.name || "?").charAt(0) }}</span>
              </span>
              <span class="m-vs-nm">{{ battleInfo.ownClub.name }}</span>
            </div>
            <div class="m-vs-st">{{ ownMembers.length }} 人 · {{ battleInfo.ownClub.quenchNum }} 红 · {{ formatPower(battleInfo.ownClub.power) }}</div>
            <div class="m-vs-anno">{{ battleInfo.ownClub.announcement }}</div>
          </div>
          <div class="m-vs-badge">VS</div>
          <div class="m-vs-c">
            <div class="m-vs-id">ID: {{ battleInfo.opponentClub.id }} · {{ battleInfo.opponentClub.serverId === "跨服" ? "跨服" : battleInfo.opponentClub.serverId + "服" }}</div>
            <div class="m-vs-row">
              <span class="m-clogo m-clogo-s">
                <img v-if="battleInfo.opponentClub.logo" :src="battleInfo.opponentClub.logo" alt="" />
                <span v-else>{{ (battleInfo.opponentClub.name || "?").charAt(0) }}</span>
              </span>
              <span class="m-vs-nm">{{ battleInfo.opponentClub.name || "敌方对阵公会" }}</span>
            </div>
            <div class="m-vs-st">{{ opponentMembers.length }} 人 · {{ battleInfo.opponentClub.quenchNum }} 红 · {{ formatPower(battleInfo.opponentClub.power) }}</div>
            <div class="m-vs-anno">{{ battleInfo.opponentClub.announcement }}</div>
          </div>
        </div>
        <div class="m-ranktext">{{ rankText }}</div>
      </div>
    </template>

    <!-- 统计双面板（照抄：当周对战信息 + 当天公会对战信息） -->
    <template v-if="battleInfo && rawClubData">
      <div class="m-card">
        <div class="m-card-h">
          <span class="m-t">当周对战信息</span>
          <span class="m-more">周更新制 · 第 {{ weeklyStats.phase }} 期</span>
        </div>
        <p class="m-hint" style="margin: 0 0 10px">周期: {{ weeklyStats.cycleRange }} (每周一刷新重置)</p>
        <div class="m-stats">
          <div class="m-stat"><span class="m-stat-k">公会本周总积分</span><span class="m-stat-v">{{ weeklyStats.weekScore }} 分</span></div>
          <div class="m-stat"><span class="m-stat-k">公会排位段位</span><span class="m-stat-v">{{ weeklyStats.danText }}</span></div>
          <div class="m-stat"><span class="m-stat-k">个人本周战功</span><span class="m-stat-v">{{ weeklyStats.personalScore }} 分 <small>Lv.{{ weeklyStats.personalLevel }}</small></span></div>
          <div class="m-stat"><span class="m-stat-k">个人本周战绩</span><span class="m-stat-v">{{ weeklyStats.weekAttackCnt }}战{{ weeklyStats.weekWinCnt }}胜 ({{ weeklyStats.weekWinRate }}%)</span></div>
        </div>
        <div v-if="matchDayList.length > 0" class="m-csub" style="margin-top: 12px">赛程速览</div>
        <div class="m-chiprow" v-if="matchDayList.length > 0">
          <button
            v-for="item in matchDayList"
            :key="item.day"
            class="m-dayc m-dayc--sched"
            :class="{ on: selectedMatchDay === item.day }"
            @click="handleMatchDayChange(item.day)"
          >
            <b>{{ item.label }}</b>
            <span>{{ item.name }}</span>
            <i>{{ formatPower(item.power) }}</i>
          </button>
        </div>
      </div>

      <div class="m-card">
        <div class="m-card-h">
          <span class="m-t">当天公会对战信息</span>
          <span class="m-tag" :class="isMatchDay ? 'done' : 'wait'">{{ isMatchDay ? "今日交战中" : "非排位日" }}</span>
        </div>
        <div class="m-kv"><span class="m-k">今日对决对手</span><span class="m-v">{{ weeklyStats.todayOpponentName }}</span></div>
        <div class="m-stats" style="margin-top: 10px">
          <div class="m-stat"><span class="m-stat-k">我方总体出手胜率</span><span class="m-stat-v">{{ todayCombatStats.ourClub.winRate }}%</span><span class="m-stat-d">{{ todayCombatStats.ourClub.wins }}胜 / {{ todayCombatStats.ourClub.totalAttacks }}刀</span></div>
          <div class="m-stat"><span class="m-stat-k">对手总体出手胜率</span><span class="m-stat-v">{{ todayCombatStats.oppClub.winRate }}%</span><span class="m-stat-d">{{ todayCombatStats.oppClub.wins }}胜 / {{ todayCombatStats.oppClub.totalAttacks }}刀</span></div>
          <div class="m-stat"><span class="m-stat-k">今日公会比分</span><span class="m-stat-v">{{ weeklyStats.dayScore }} vs {{ currentOppoDayScore }}</span></div>
          <div class="m-stat"><span class="m-stat-k">据点攻防态势</span><span class="m-stat-v">攻破 {{ weeklyStats.defeatedCount }}/{{ weeklyStats.totalDefenders }}</span><span class="m-stat-d">我方被破 {{ ownDefendDefeatedCount }}/{{ ownMembers.length }}</span></div>
        </div>
        <div class="m-pbar-wrap" style="margin-top: 12px">
          <div class="m-pbar-t">{{ weeklyStats.todayOpponentName }} 阵型击破进度 · 已攻破敌方 {{ weeklyStats.defeatedCount }} / {{ weeklyStats.totalDefenders }} 据点 ({{ weeklyStats.defeatedRate }}%)</div>
          <div class="m-pbar"><i :style="{ width: (Number(weeklyStats.defeatedRate) || 0) + '%' }"></i></div>
          <span class="m-pct">{{ weeklyStats.defeatedRate }}%</span>
        </div>
      </div>
    </template>

    <!-- 视图 tabs（照抄 activeViewTab） -->
    <template v-if="battleInfo && !loading">
      <div class="m-seg">
        <button v-for="t in viewTabs" :key="t.key" :class="{ on: activeViewTab === t.key }" @click="activeViewTab = t.key">
          {{ t.label }}
        </button>
      </div>

      <!-- ============ 今日据点沙盘 ============ -->
      <template v-if="activeViewTab === 'battleMap'">
        <div class="m-card">
          <div class="m-card-h">
            <span class="m-t">{{ selectedSide === "opponent" ? "敌方" : "我方" }}据点沙盘</span>
            <span class="m-more">总 {{ mapStats.total }} · 坚守 {{ mapStats.aliveCount }} · 已破 {{ mapStats.defeatedCount }}</span>
          </div>
          <div class="m-chiprow">
            <button class="m-dayc" :class="{ on: mapFilter === 'all' }" @click="mapFilter = 'all'">全部 ({{ mapStats.total }})</button>
            <button class="m-dayc" :class="{ on: mapFilter === 'alive' }" @click="mapFilter = 'alive'">仅坚守 ({{ mapStats.aliveCount }})</button>
            <button class="m-dayc" :class="{ on: mapFilter === 'defeated' }" @click="mapFilter = 'defeated'">仅击破 ({{ mapStats.defeatedCount }})</button>
          </div>
          <!-- 筛选与排序是两件事，必须在视觉上分开（原来是「筛选 / 提示 / 排序」三行挤在一起，
               排序三项还因为文案带括号说明被折成两行）：
               · 排序文案去掉括号说明，三项才排得下一行；补充说明进 title
               · 提示语下沉成卡末脚注，不再夹在两排 chip 中间把分组切碎 -->
          <div class="m-chiprow m-chiprow--sort">
            <button
              v-for="o in mapSortOptions"
              :key="o.value"
              class="m-dayc"
              :class="{ on: mapSort === o.value }"
              :title="o.desc"
              @click="mapSort = o.value"
            >
              {{ o.label }}
            </button>
          </div>
          <div class="m-slot" v-for="m in displayMapList" :key="(selectedSide === 'opponent' ? 'o' : 'w') + (m.id ?? m.slot)" @click="openDuelModal(m)">
            <span class="m-slot-no">#{{ m.slot }}</span>
            <span class="m-ib m-mava" :style="{ background: avatarBg(m) }">
              <img v-if="m.headImg" :src="m.headImg" alt="" @error="onImgError" />
              <span v-else>{{ (m.name || "?").charAt(0) }}</span>
            </span>
            <span class="m-body">
              <span class="m-nmline">
                <span class="m-nm">{{ m.name }}<small v-if="m.mirror">（镜像）</small></span>
                <span v-if="m.mirror" class="m-tag job">镜像</span>
                <span class="m-tag" :class="m.defeated ? 'err' : 'done'">{{ m.defeated ? "已攻破" : "坚守" }}</span>
                <span class="m-rt">战报流水 ›</span>
              </span>
              <span class="m-ds">
                战力 <b class="m-ds-v">{{ formatPower(m.power) }}</b>
                <i v-if="m.redQuench > 0" class="m-rdtag">{{ m.redQuench }} 红</i>
                <i class="m-lu m-lu--fg" :style="lineupStyle(m.lineupType)">{{ m.lineupType || "常规" }}</i>
              </span>
              <span class="m-ds">遭遇 {{ m.challengeCnt || 0 }} 次 · 防守成功 {{ m.failCnt || 0 }} 次</span>
            </span>
          </div>
          <p v-if="displayMapList.length" class="m-hint m-foothint">点击{{ selectedSide === "opponent" ? "对手" : "成员" }}可查看其被攻击防守战报</p>
        </div>
      </template>

      <!-- ============ 催刀督战 ============ -->
      <template v-else-if="activeViewTab === 'todayDetails'">
        <div class="m-card">
          <div class="m-card-h"><span class="m-t">今日比分</span></div>
          <div class="m-score">
            <div class="m-score-c">
              <span class="m-score-row">
                <span class="m-clogo m-clogo-s">
                  <img v-if="todayCombatStats.ourClub.logo" :src="todayCombatStats.ourClub.logo" alt="" />
                  <span v-else>{{ (todayCombatStats.ourClub.name || "?").charAt(0) }}</span>
                </span>
                <span class="m-score-nm">{{ todayCombatStats.ourClub.name }}</span>
              </span>
              <span class="m-score-v">{{ weeklyStats.dayScore }}</span>
              <span class="m-score-ds">出手 {{ todayCombatStats.ourClub.winRate }}% ({{ todayCombatStats.ourClub.wins }}胜/{{ todayCombatStats.ourClub.totalAttacks }}刀)</span>
              <span class="m-score-ds">防守 {{ todayCombatStats.ourClub.defWinRate }}% ({{ todayCombatStats.ourClub.defWins }}胜/{{ todayCombatStats.ourClub.defTotal }}次)</span>
              <span class="m-score-ds">攻破敌方 {{ weeklyStats.defeatedCount }}/{{ weeklyStats.totalDefenders }} 据点 ({{ weeklyStats.defeatedRate }}%)</span>
            </div>
            <div class="m-score-mid">
              <span class="m-vs-badge">VS</span>
              <span class="m-score-lead" :class="weeklyStats.dayScore >= currentOppoDayScore ? 'lead' : 'lag'">
                {{ weeklyStats.dayScore >= currentOppoDayScore ? `领先 ${weeklyStats.dayScore - currentOppoDayScore} 分` : `落后 ${currentOppoDayScore - weeklyStats.dayScore} 分` }}
              </span>
            </div>
            <div class="m-score-c">
              <span class="m-score-row">
                <span class="m-clogo m-clogo-s">
                  <img v-if="todayCombatStats.oppClub.logo" :src="todayCombatStats.oppClub.logo" alt="" />
                  <span v-else>{{ (todayCombatStats.oppClub.name || "?").charAt(0) }}</span>
                </span>
                <span class="m-score-nm">{{ todayCombatStats.oppClub.name }}</span>
              </span>
              <span class="m-score-v">{{ currentOppoDayScore }}</span>
              <span class="m-score-ds">出手 {{ todayCombatStats.oppClub.winRate }}% ({{ todayCombatStats.oppClub.wins }}胜/{{ todayCombatStats.oppClub.totalAttacks }}刀)</span>
              <span class="m-score-ds">防守 {{ todayCombatStats.oppClub.defWinRate }}% ({{ todayCombatStats.oppClub.defWins }}胜/{{ todayCombatStats.oppClub.defTotal }}次)</span>
              <span class="m-score-ds">敌方攻破我方 {{ ownDefendDefeatedCount }}/{{ ownMembers.length }} 据点</span>
            </div>
          </div>
          <div class="m-cmp">
            <div class="m-cmp-r"><span class="m-cmp-l">我方出手胜率</span><div class="m-pbar"><i :style="{ width: (Number(todayCombatStats.ourClub.winRate) || 0) + '%' }"></i></div><b>{{ todayCombatStats.ourClub.winRate }}%</b></div>
            <div class="m-cmp-r"><span class="m-cmp-l">敌方出手胜率</span><div class="m-pbar"><i :style="{ width: (Number(todayCombatStats.oppClub.winRate) || 0) + '%' }"></i></div><b>{{ todayCombatStats.oppClub.winRate }}%</b></div>
            <div class="m-cmp-r"><span class="m-cmp-l">我方防守胜率</span><div class="m-pbar"><i :style="{ width: (Number(todayCombatStats.ourClub.defWinRate) || 0) + '%' }"></i></div><b>{{ todayCombatStats.ourClub.defWinRate }}%</b></div>
            <div class="m-cmp-r"><span class="m-cmp-l">敌方防守胜率</span><div class="m-pbar"><i :style="{ width: (Number(todayCombatStats.oppClub.defWinRate) || 0) + '%' }"></i></div><b>{{ todayCombatStats.oppClub.defWinRate }}%</b></div>
          </div>
        </div>

        <div class="m-card">
          <div class="m-card-h">
            <span class="m-t">催刀台</span>
            <span class="m-tag" :class="attendanceStats.unattackedCount === 0 && attendanceStats.incompleteCount === 0 ? 'done' : 'wait'">满刀率 {{ attendanceStats.completedRate }}% ({{ attendanceStats.completedCount }}/{{ attendanceStats.total }})</span>
          </div>
          <div style="display: flex; gap: 8px; margin-bottom: 10px">
            <button class="m-btn m-btn-gr" style="flex: 1" :disabled="attendanceStats.unattackedCount === 0" @click="copyUnattackedList">
              复制未动刀名单 (0/3次 · {{ attendanceStats.unattackedCount }}人)
            </button>
            <button class="m-btn m-btn-g" style="flex: 1" :disabled="attendanceStats.incompleteCount === 0" @click="copyIncompleteList">
              复制未打满名单 (1~2/3次 · {{ attendanceStats.incompleteCount }}人)
            </button>
          </div>
          <div v-if="attendanceStats.unattackedCount > 0" class="m-preview">
            <div class="m-csub">0 刀未动（{{ attendanceStats.unattackedCount }} 人）</div>
            <!-- 名单不带战力：这排只回答「谁还没动刀」，塞进 115.55亿 之后每个 chip 都占满一行，
                 30 人就是 30 行；只留名字 + 次数，一行能排 2~3 个（10-31 实拍改） -->
            <div class="m-chiprow">
              <button v-for="m in attendanceStats.unattacked" :key="m.id" class="m-dayc m-dayc--mem" @click="openDuelModal(m)">
                {{ m.name }}<em>0/3次</em>
              </button>
            </div>
          </div>
          <div v-if="attendanceStats.incompleteCount > 0" class="m-preview">
            <div class="m-csub">未打满（{{ attendanceStats.incompleteCount }} 人）</div>
            <div class="m-chiprow">
              <button v-for="m in attendanceStats.incomplete" :key="m.id" class="m-dayc m-dayc--mem" @click="openDuelModal(m)">
                {{ m.name }}<em>{{ m.realAttackCnt || 0 }}/3次</em>
              </button>
            </div>
          </div>
          <p v-if="attendanceStats.unattackedCount === 0 && attendanceStats.incompleteCount === 0" class="m-hint" style="margin: 0">全员打满，太棒了 🎉</p>
        </div>

        <div class="m-card">
          <div class="m-card-h">
            <span class="m-t">今日战绩</span>
            <span class="m-more">{{ sortLabel(todaySortBy) }}</span>
          </div>
          <div class="m-chiprow">
            <button v-for="o in sortOptions" :key="o.value" class="m-dayc" :class="{ on: todaySortBy === o.value }" @click="todaySortBy = o.value">
              {{ o.label }}
            </button>
          </div>
          <div class="m-scards">
            <div class="m-scard" v-for="(m, idx) in sortedTodayMembers" :key="'t' + (m.id ?? m.slot)">
              <div class="m-scard-head">
                <span class="m-scard-rank">{{ m.rankIndex || idx + 1 }}</span>
                <span class="m-scard-ava m-scard-ava--ph" :style="{ background: avatarBg(m) }">
                  <img v-if="m.headImg" :src="m.headImg" alt="" @error="onImgError" />
                  <span v-else>{{ (m.name || "?").charAt(0) }}</span>
                </span>
                <span class="m-scard-name m-nmlink" @click="openDuelModal(m)">{{ m.name }}</span>
                <span v-if="m.mirror" class="m-tag job">镜像</span>
                <span class="m-scard-slot">#{{ m.slot || 1 }} 据点</span>
              </div>
              <div class="m-scard-grid">
                <div class="m-scard-cell">
                  <span class="m-scard-label">真实战力</span>
                  <span class="m-scard-val is-power">{{ formatPower(m.power) }}</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">今日战功贡献</span>
                  <span class="m-scard-val" :class="m.todayScore > 0 ? 'is-gain' : 'is-zero'">
                    {{ m.todayScore > 0 ? `+${m.todayScore}分` : "0分" }}
                  </span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">据点防守态势</span>
                  <span class="m-tag" :class="m.defeated ? 'err' : 'done'">{{ m.defeated ? "💥 已被攻破" : "🛡️ 坚守中" }}</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">今日出刀状态</span>
                  <span class="m-tag" :class="statusClass(m.attackStatusType)">{{ m.attackStatusText || "0/3 未出战" }}</span>
                </div>
              </div>
              <div class="m-scard-line">
                <span class="m-scard-label">防守交战记录</span>
                <span class="m-scard-val">遭遇 {{ m.challengeCnt || 0 }} 次 / 守住 {{ m.defWins || 0 }} 次 (胜率 {{ m.defWinRate || "—" }})</span>
              </div>
              <div class="m-scard-line">
                <span class="m-scard-label">今日出刀实绩</span>
                <span v-if="(m.realAttackCnt || 0) > 0" class="m-scard-val is-win">{{ m.attackWins || 0 }}胜 / {{ m.attackLosses || 0 }}负 (胜率 {{ m.attackWinRate || "—" }})</span>
                <span v-else class="m-scard-val is-muted">0刀</span>
              </div>
              <div class="m-scard-foot">
                <button class="m-btn m-btn-g" style="padding: 6px 10px; font-size: 11.5px" @click="openDuelModal(m)">战报流水</button>
              </div>
            </div>
            <p v-if="!sortedTodayMembers.length" class="m-hint" style="text-align: center; margin: 0">暂无数据</p>
          </div>
        </div>
      </template>

      <!-- ============ 当周大表 ============ -->
      <template v-else-if="activeViewTab === 'weekRoster'">
        <div class="m-card" v-if="groupRankData.length > 0">
          <div class="m-card-h"><span class="m-t">排位天梯榜</span></div>
          <div class="m-trow" v-for="(c, i) in groupRankData" :key="'gr' + i">
            <span class="m-medal" :class="i === 0 ? 'g1' : i === 1 ? 'g2' : i === 2 ? 'g3' : 'low'">{{ i < 3 ? ["🥇", "🥈", "🥉"][i] : "第 " + (i + 1) + " 名" }}</span>
            <span class="m-body">
              <span class="m-nm">
                {{ c.name || "未知俱乐部" }}
                <span v-if="c.id === battleInfo?.ownClub?.id" class="m-tag done">我方</span>
              </span>
              <span class="m-ds">{{ c.serverName || (c.serverId ? c.serverId + "服" : "跨服") }}</span>
            </span>
            <span class="m-rt"><b style="font-size: 14px">{{ c.score || 0 }}</b><small class="m-hint">本周积分</small></span>
          </div>
        </div>

        <div class="m-card">
          <div class="m-card-h">
            <span class="m-t">当周战绩</span>
            <span class="m-more">{{ sortLabel(weeklySortBy) }}</span>
          </div>
          <div class="m-chiprow">
            <button v-for="o in weeklySortOptions" :key="o.value" class="m-dayc" :class="{ on: weeklySortBy === o.value }" @click="weeklySortBy = o.value">
              {{ o.label }}
            </button>
          </div>
          <div class="m-scards">
            <div class="m-scard" v-for="(m, idx) in sortedWeeklyRoster" :key="'w' + (m.id ?? m.slot)">
              <div class="m-scard-head">
                <span class="m-scard-rank">第 {{ m.currentRank || idx + 1 }} 名</span>
                <span class="m-scard-ava m-scard-ava--ph" :style="{ background: avatarBg(m) }">
                  <img v-if="m.headImg" :src="m.headImg" alt="" @error="onImgError" />
                  <span v-else>{{ (m.name || "?").charAt(0) }}</span>
                </span>
                <span class="m-scard-name m-nmlink" @click="openDuelModal(m)">{{ m.name }}</span>
                <span v-if="m.mirror" class="m-tag job">镜像</span>
                <span class="m-scard-slot">#{{ m.slot || 1 }} 据点</span>
              </div>
              <div class="m-scard-grid">
                <div class="m-scard-cell">
                  <span class="m-scard-label">真实战力</span>
                  <span class="m-scard-val is-power">{{ formatPower(m.power) }}</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">红淬</span>
                  <span class="m-scard-val is-red">{{ m.redQuench || 0 }}</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">当周总战功</span>
                  <span class="m-scard-val is-score">{{ m.score || 0 }}分</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">本周遭遇挑战</span>
                  <span class="m-scard-val">{{ m.challengeCnt || 0 }}次</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">本周防守守住</span>
                  <span class="m-scard-val is-win">{{ m.defWins || 0 }}次</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">本周防守胜率</span>
                  <span class="m-scard-val" :class="parseFloat(m.defWinRate) >= 50 ? 'is-win' : 'is-warn'">{{ m.defWinRate }}</span>
                </div>
              </div>
              <div class="m-scard-foot">
                <button class="m-btn m-btn-g" style="padding: 6px 10px; font-size: 11.5px" @click="openDuelModal(m)">对战详情</button>
              </div>
            </div>
            <p v-if="!sortedWeeklyRoster.length" class="m-hint" style="text-align: center; margin: 0">暂无数据</p>
          </div>
        </div>
      </template>

      <!-- ============ 布阵大表 ============ -->
      <template v-else-if="activeViewTab === 'lineupTable'">
        <div class="m-card">
          <div class="m-card-h"><span class="m-t">流派分布</span></div>
          <div class="m-chiprow" v-if="lineupStats.length">
            <span v-for="item in lineupStats" :key="item.name" class="m-lu m-lu--fg" :style="{ background: item.colorProps.color, '--lu-fg': item.colorProps.textColor }">
              {{ item.name }} ({{ item.count }}人)
            </span>
          </div>
          <p v-else class="m-hint" style="margin: 0">暂无流派数据</p>
        </div>

        <div class="m-card">
          <div class="m-card-h"><span class="m-t">{{ selectedSide === "opponent" ? "敌方" : "我方" }}布阵</span><span class="m-more">共 {{ currentMemberList.length }} 人</span></div>
          <div class="m-scards">
            <div class="m-scard" v-for="(m, i) in currentMemberList" :key="'l' + (m.id ?? i)">
              <div class="m-scard-head">
                <span class="m-scard-rank">{{ i + 1 }}</span>
                <span class="m-scard-ava m-scard-ava--ph" :style="{ background: avatarBg(m) }">
                  <img v-if="m.headImg" :src="m.headImg" alt="" @error="onImgError" />
                  <span v-else>{{ (m.name || "?").charAt(0) }}</span>
                </span>
                <span class="m-mname">
                  <span class="m-scard-name m-nmlink" @click="openDuelModal(m)">{{ m.name }}</span>
                  <span class="m-mid">ID: {{ m.id }}</span>
                </span>
                <!-- 入口从卡片底部搬进头部：原来「对战详情」独占一行（32px + 间距），
                     挪到名字行右侧等于白捡一行高度，也不再每个卡片底部挂一颗按钮 -->
                <button class="m-headlink" @click="openDuelModal(m)">对战详情 ›</button>
              </div>
              <div class="m-scard-grid m-scard-grid--3">
                <div class="m-scard-cell">
                  <span class="m-scard-label">真实战力</span>
                  <span class="m-scard-val is-power">{{ formatPower(m.power) }}</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">红淬</span>
                  <span class="m-scard-val is-red">{{ m.redQuench }}</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">珍卡</span>
                  <span v-if="m.legacy && legacycolor[m.legacy]" class="m-tag" :style="{ color: legacycolor[m.legacy].value }">{{ legacycolor[m.legacy].name }}</span>
                  <span v-else class="m-scard-val is-muted">—</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">玩具</span>
                  <span class="m-scard-val">{{ m.toyName || "—" }}</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">阵容流派</span>
                  <span class="m-tag m-tag--fg" :style="lineupStyle(m.lineupType)">{{ m.lineupType || "常规" }}</span>
                </div>
              </div>
              <div class="m-scard-cell">
                <span class="m-scard-label">出战布阵 <i class="m-lcard-tip">1~5 号位</i></span>
                <div v-if="(m.heroList || []).length" class="m-pgrid">
                  <span class="m-pcard" v-for="(h, hi) in m.heroList" :key="hi">
                    <span class="m-pcard-n">{{ h.heroName }}<i class="m-pcard-r">({{ h.red }}红)</i><i v-if="h.HolyBeast" class="m-pcard-hb">圣{{ h.HBlevel }}</i></span>
                    <span class="m-pcard-p">{{ h.slotIndex }}号位 · Lv.{{ h.level }} · {{ h.star }}★</span>
                    <!-- 鱼灵只在真有名字时占行：原来越野时 5 个英雄全渲染「专属鱼灵」占位，
                         每张卡白多一行、5 张卡就多出半个屏 -->
                    <span v-if="h.PearlInfo?.FishInfo?.name" class="m-pcard-fish">{{ h.PearlInfo.FishInfo.name }}</span>
                  </span>
                </div>
                <span v-else class="m-scard-val is-muted">暂无出战布阵</span>
              </div>
            </div>
            <p v-if="!currentMemberList.length" class="m-hint" style="text-align: center; margin: 0">暂无数据</p>
          </div>
        </div>
      </template>
    </template>

    <!-- 加载态（照抄） -->
    <div v-if="loading" class="m-card">
      <p class="m-hint" style="text-align: center; padding: 24px 0">
        正在加载{{ selectedSide === "opponent" ? "敌方" : "我方" }}真实营地布阵数据 ({{ progressText }})…
      </p>
    </div>

    <!-- 空态（照抄）：仅当确实没有对阵数据时才整屏空态，避免与上方内容并存 -->
    <div v-if="!loading && !battleInfo" class="m-card">
      <div class="m-empty" style="padding: 30px 0">
        <div class="m-logo">⛺</div>
        <h3>{{ emptyHint }}</h3>
        <button class="m-btn m-btn-p" @click="fetchCampChallengeData">点击重新查询</button>
      </div>
    </div>

    <!-- 战报流水抽屉（照抄 openDuelModal 弹窗：进攻流水 / 防守流水） -->
    <div class="m-mask" :class="{ on: duelSheet }" @click="duelSheet = false"></div>
    <div class="m-sheet" :class="{ on: duelSheet }">
      <div class="m-grab"></div>
      <template v-if="targetPlayer">
        <h4>
          成员攻防战况流水 - {{ targetPlayer.name }}
          <span v-if="targetPlayer.mirror" class="m-tag job">（镜像据点）</span>
        </h4>
        <div class="m-sh-sub">ID: {{ targetPlayer.id }}</div>
        <div class="m-kv"><span class="m-k">真实战力 | 总红淬</span><span class="m-v">{{ formatPower(targetPlayer.power) }} | {{ targetPlayer.redQuench || 0 }}</span></div>
        <div class="m-kv"><span class="m-k">玩具 | 流派</span><span class="m-v">{{ targetPlayer.toyName || "无" }} | {{ targetPlayer.lineupType || "常规" }}</span></div>
        <div class="m-seg" style="margin: 12px 0">
          <button :class="{ on: duelTab === 'atk' }" @click="duelTab = 'atk'">进攻流水</button>
          <button :class="{ on: duelTab === 'def' }" @click="duelTab = 'def'">防守流水</button>
        </div>
        <p v-if="modalLoading" class="m-hint" style="text-align: center; padding: 18px 0">正在拉取对战战报流水…</p>
        <template v-else-if="duelTab === 'atk'">
          <div class="m-stats" style="margin-bottom: 10px">
            <div class="m-stat"><span class="m-stat-k">进攻总场次</span><span class="m-stat-v">{{ targetPlayerOffenseList.length }}</span></div>
            <div class="m-stat"><span class="m-stat-k">进攻成功</span><span class="m-stat-v" style="color: var(--m-green)">{{ targetPlayerOffenseWinCount }}</span></div>
            <div class="m-stat"><span class="m-stat-k">进攻失败</span><span class="m-stat-v" style="color: var(--m-red)">{{ targetPlayerOffenseLossCount }}</span></div>
            <div class="m-stat"><span class="m-stat-k">进攻胜率</span><span class="m-stat-v">{{ targetPlayerOffenseWinRate }}%</span></div>
          </div>
          <p v-if="!targetPlayerOffenseList.length" class="m-hint" style="text-align: center; padding: 12px 0">当前日期暂无进攻流水记录</p>
          <div class="m-trow" v-for="(r, i) in targetPlayerOffenseList" :key="'a' + i">
            <span class="m-ib" :style="{ background: avatarBg(r.targetRoleInfo) }">
              <img v-if="r.targetRoleInfo?.headImg" :src="r.targetRoleInfo.headImg" alt="" @error="onImgError" />
              <span v-else>{{ (r.targetRoleInfo?.name || "?").charAt(0) }}</span>
            </span>
            <span class="m-body">
              <span class="m-nm">{{ r.targetRoleInfo?.name || "未知" }} <span class="m-tag job">{{ r.targetRoleInfo?.legionName || "" }}</span></span>
              <span class="m-ds">{{ formatCombatTime(r.timestamp) }} · 战力 {{ formatPower(r.targetRoleInfo?.power || 0) }} · 难度 {{ r.difficulty ?? "-" }}</span>
            </span>
            <span class="m-rt"><span class="m-tag" :class="r.winFlag ? 'done' : 'err'">{{ r.winFlag ? "攻击成功" : "攻击失败" }}</span></span>
          </div>
        </template>
        <template v-else>
          <div class="m-stats" style="margin-bottom: 10px">
            <div class="m-stat"><span class="m-stat-k">防守总场次</span><span class="m-stat-v">{{ targetPlayerDefenseList.length }}</span></div>
            <div class="m-stat"><span class="m-stat-k">防守成功</span><span class="m-stat-v" style="color: var(--m-green)">{{ targetPlayerDefenseWinCount }}</span></div>
            <div class="m-stat"><span class="m-stat-k">防守失败</span><span class="m-stat-v" style="color: var(--m-red)">{{ targetPlayerDefenseLossCount }}</span></div>
            <div class="m-stat"><span class="m-stat-k">防守胜率</span><span class="m-stat-v">{{ targetPlayerDefenseWinRate }}%</span></div>
          </div>
          <p v-if="!targetPlayerDefenseList.length" class="m-hint" style="text-align: center; padding: 12px 0">当前日期暂无防守流水记录</p>
          <div class="m-trow" v-for="(r, i) in targetPlayerDefenseList" :key="'d' + i">
            <span class="m-ib" :style="{ background: avatarBg(r.targetRoleInfo) }">
              <img v-if="r.targetRoleInfo?.headImg" :src="r.targetRoleInfo.headImg" alt="" @error="onImgError" />
              <span v-else>{{ (r.targetRoleInfo?.name || "?").charAt(0) }}</span>
            </span>
            <span class="m-body">
              <span class="m-nm">{{ r.targetRoleInfo?.name || "未知" }} <span class="m-tag job">{{ r.targetRoleInfo?.legionName || "" }}</span></span>
              <span class="m-ds">{{ formatCombatTime(r.timestamp) }} · 战力 {{ formatPower(r.targetRoleInfo?.power || 0) }} · 难度 {{ r.difficulty ?? "-" }}</span>
            </span>
            <span class="m-rt"><span class="m-tag" :class="r.winFlag ? 'done' : 'err'">{{ r.winFlag ? "防守成功" : "防守失败" }}</span></span>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup>
/* ============================================================
 * 营地挑战（移动端）
 * 数据逻辑照抄 src/components/Club/CampChallenge.vue：
 *   · 命令 legion_getinfo / club_getinfo / club_gettargetteam
 *          （失败回退 role_gettargetteam）/ club_getattackrecord
 *          / club_getgrouprank / club_getdefenserecord
 *   · 纯只读面板，无任何写命令
 *   · failCnt = 攻击方失败次数；isWin = 记录归属者视角
 *   · club_getdefenserecord 仅当前比赛日可查（往日 200020），
 *     客户端按 phase 6 位码推算当日 00:00-24:00 窗口二次过滤
 *   · 导出文件名：营地挑战阵容_${我方|敌方}.png
 * 仅展示形式改为移动端。
 * ============================================================ */
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import { exportDomAsImage } from "@/mobile/utils/exportImage";
import { HERO_DICT, getLineupType, legacycolor, formatWeapon, LINEUP_RULES } from "@/utils/HeroList";

const tokenStore = useTokenStore();
const message = useMessage();

const DEFAULT_AVATAR = "/icons/xiaoyugan.png";

/* ---------- 展示辅助（照抄） ---------- */
const formatPower = (val) => {
  if (!val) return "0";
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "0";
  if (num >= 100000000) return (num / 100000000).toFixed(2) + "亿";
  if (num >= 10000) return (num / 10000).toFixed(1) + "万";
  return num.toLocaleString();
};

const formatCombatTime = (timestamp) => {
  if (!timestamp) return "—";
  const ms = timestamp > 10000000000 ? timestamp : timestamp * 1000;
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/* ---------- 状态（照抄 2.1） ---------- */
const exportDom = ref(null);
const selectedSide = ref("own");
const activeViewTab = ref("battleMap");
const mapFilter = ref("all");
const mapSort = ref("slot");
/* 排序项只留短名：带括号说明时三项在 390 视口放不下，会折成两行（10-31 实拍）。
   说明挪进 desc → 模板里塞 :title，桌面端悬停 / 长按仍看得到「挑软柿子」这类意图。 */
const mapSortOptions = [
  { label: "据点序号", value: "slot", desc: "按据点序号 #1 ~ #30 排列" },
  { label: "战力升序", value: "powerAsc", desc: "战力升序：先打最软的柿子" },
  { label: "战力降序", value: "powerDesc", desc: "战力降序：先看核心高战" },
];
const sortOptions = [
  { label: "贡献积分", value: "score" },
  { label: "出手胜率", value: "attackWinRate" },
  { label: "防守胜率", value: "defWinRate" },
];
/* 周榜排序项：出手胜率取的是「当日」出刀聚合（attackMap），周榜无此维度，
   旧版周榜也不展示该字段 —— 只在当榜（今日）提供 */
const weeklySortOptions = sortOptions.filter((o) => o.value !== "attackWinRate");
const sortLabel = (v) => (sortOptions.find((o) => o.value === v)?.label || "");
const todaySortBy = ref("score");
const weeklySortBy = ref("score");
const groupRankData = ref([]);
const loading = ref(false);
const exporting = ref(false);
const progressText = ref("0/0");
const matchDayList = ref([]);
const selectedMatchDay = ref(2);
const rawClubData = ref(null);
const rawSiegeData = ref(null);
const cachedAttackRecords = ref([]);
let currentFetchToken = 0;
const battleInfo = ref(null);
const ownMembers = ref([]);
const opponentMembers = ref([]);
const rankText = ref("营地挑战排位赛");
const emptyHint = ref("暂无营地挑战对阵数据");
const duelSheet = ref(false);
const duelTab = ref("atk");
const targetPlayer = ref(null);
const modalLoading = ref(false);
const playerAttackRecords = ref([]);
const playerDefenseRecords = ref([]);
const todayCombatStats = ref({
  loaded: false,
  ourClub: { name: "我方俱乐部", totalAttacks: 0, wins: 0, losses: 0, winRate: "0.0", defTotal: 0, defWins: 0, defLosses: 0, defWinRate: "0.0" },
  oppClub: { name: "匹配俱乐部", totalAttacks: 0, wins: 0, losses: 0, winRate: "0.0", defTotal: 0, defWins: 0, defLosses: 0, defWinRate: "0.0" },
});
const memberAttackStatsMap = ref(new Map());
const memberDefenseRecordsMap = ref(new Map());
const weeklyDefenseStatsMap = ref(new Map());

const viewTabs = [
  { key: "battleMap", label: "据点沙盘" },
  { key: "todayDetails", label: "催刀督战" },
  { key: "weekRoster", label: "当周大表" },
  { key: "lineupTable", label: "布阵" },
];

/* ---------- computeds（照抄 2.2） ---------- */
const targetPlayerOffenseList = computed(() => playerAttackRecords.value);
const targetPlayerOffenseWinCount = computed(
  () => playerAttackRecords.value.filter((r) => r.winFlag === true || r.winFlag === 1).length,
);
const targetPlayerOffenseLossCount = computed(
  () => playerAttackRecords.value.filter((r) => r.winFlag === false || r.winFlag === 0).length,
);
const targetPlayerOffenseWinRate = computed(() => {
  const total = targetPlayerOffenseList.value.length;
  return total ? ((targetPlayerOffenseWinCount.value / total) * 100).toFixed(1) : "0.0";
});
const targetPlayerDefenseList = computed(() => playerDefenseRecords.value);
const targetPlayerDefenseWinCount = computed(
  () => playerDefenseRecords.value.filter((r) => r.winFlag === true || r.winFlag === 1).length,
);
const targetPlayerDefenseLossCount = computed(
  () => playerDefenseRecords.value.filter((r) => r.winFlag === false || r.winFlag === 0).length,
);
const targetPlayerDefenseWinRate = computed(() => {
  const total = targetPlayerDefenseList.value.length;
  return total ? ((targetPlayerDefenseWinCount.value / total) * 100).toFixed(1) : "0.0";
});

const currentMemberList = computed(() =>
  selectedSide.value === "opponent" ? opponentMembers.value : ownMembers.value,
);

const isMatchDay = computed(() => {
  const day = new Date().getDay();
  return matchDayList.value.some((d) => d.day === day);
});

const scheduleText = computed(() => {
  const day = new Date().getDay();
  const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const currentDayName = dayNames[day];
  if (isMatchDay.value) return `今日${currentDayName}（排位比赛日）`;
  const matchDaysDesc = matchDayList.value.map((d) => d.label).join("、");
  return `今日${currentDayName}（非排位日${matchDaysDesc ? `，开放日：${matchDaysDesc}` : ""}）`;
});

const lineupStats = computed(() => {
  const counts = {};
  for (const m of currentMemberList.value) {
    const type = m.lineupType || "其他阵容";
    counts[type] = (counts[type] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, count]) => ({
      name,
      count,
      colorProps: LINEUP_RULES.find((r) => r.name === name)?.colorProps || { color: "#e8e8e8", textColor: "#444" },
    }))
    .sort((a, b) => b.count - a.count);
});

const weeklyStats = computed(() => {
  const club = rawClubData.value || {};
  const siege = rawSiegeData.value || {};
  const phaseStr = String(club.phase || "");

  let cycleRange = "周更新周期";
  const phaseDates = [];
  if (phaseStr.length === 6) {
    const y = 2000 + parseInt(phaseStr.slice(0, 2), 10);
    const m = parseInt(phaseStr.slice(2, 4), 10) - 1;
    const d = parseInt(phaseStr.slice(4, 6), 10);
    const monDate = new Date(y, m, d);
    const sunDate = new Date(y, m, d + 6);
    const fmt = (dt) =>
      `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")}`;
    cycleRange = `${fmt(monDate)} ~ ${fmt(sunDate)}`;
    for (const item of matchDayList.value) {
      const offset = item.day >= 1 ? item.day - 1 : item.day + 6;
      const matchDt = new Date(y, m, d + offset);
      const k = `${String(matchDt.getFullYear()).slice(-2)}${String(matchDt.getMonth() + 1).padStart(2, "0")}${String(matchDt.getDate()).padStart(2, "0")}`;
      phaseDates.push(k);
    }
  }

  const dan = club.dan || 0;
  const lastDan = club.lastDan || 0;
  const danDiff = dan - lastDan;
  const danDiffText = danDiff > 0 ? ` ↑+${danDiff}` : danDiff < 0 ? ` ↓${danDiff}` : " (持平)";
  const danText = `${dan}段 (上周${lastDan}段${danDiffText})`;

  const weekScore = club.weekScore || 0;
  const dayScore = club.dayScore || 0;

  // personalScore：取 club.members 中自己 roleId 的 score（Σmembers.score === club.weekScore 已实测；siege.score 是另一套口径）
  let personalScore = siege.score || 0;
  for (const m of Object.values(club.members || {})) {
    if (Number(m.roleId) === Number(siege.roleId)) {
      personalScore = m.score || 0;
      break;
    }
  }

  const attackMap = siege.attackMap || {};
  let weekAttackCnt = 0;
  let weekWinCnt = 0;
  const targetKeys = phaseDates.length > 0 ? phaseDates : Object.keys(attackMap);
  for (const k of targetKeys) {
    if (attackMap[k]) {
      weekAttackCnt += attackMap[k].attackCnt || 0;
      weekWinCnt += attackMap[k].aSuccessCnt || 0;
    }
  }
  const weekWinRate = weekAttackCnt > 0 ? ((weekWinCnt / weekAttackCnt) * 100).toFixed(1) : "0.0";

  const now = new Date();
  const todayKey = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const todayData = attackMap[todayKey] || {};
  const todayAttackCnt = todayData.attackCnt || 0;
  const todayWinCnt = todayData.aSuccessCnt || 0;
  const todayWinRate = todayAttackCnt > 0 ? ((todayWinCnt / todayAttackCnt) * 100).toFixed(1) : "0.0";

  const currentOppo = matchDayList.value.find((d) => d.day === selectedMatchDay.value) || matchDayList.value[0] || {};
  const oppDefenders = Object.values(currentOppo.defenders || {});
  const totalDefenders = oppDefenders.length || opponentMembers.value.length || 30;
  const defeatedCount = oppDefenders.filter((d) => d.defeated).length;
  const defeatedRate = totalDefenders > 0 ? ((defeatedCount / totalDefenders) * 100).toFixed(1) : "0.0";

  return {
    phase: phaseStr,
    cycleRange,
    dan,
    lastDan,
    danText,
    weekScore,
    dayScore,
    personalScore,
    personalLevel: siege.level || 1,
    weekAttackCnt,
    weekWinCnt,
    weekWinRate,
    todayAttackCnt,
    todayWinCnt,
    todayWinRate,
    todayOpponentName: currentOppo.name || "匹配对战俱乐部",
    totalDefenders,
    defeatedCount,
    defeatedRate,
  };
});

const displayMapList = computed(() => {
  let list = [...currentMemberList.value];
  if (mapFilter.value === "alive") {
    list = list.filter((m) => !m.defeated);
  } else if (mapFilter.value === "defeated") {
    list = list.filter((m) => m.defeated);
  }
  if (mapSort.value === "powerAsc") {
    list.sort((a, b) => (a.power || 0) - (b.power || 0));
  } else if (mapSort.value === "powerDesc") {
    list.sort((a, b) => (b.power || 0) - (a.power || 0));
  } else {
    list.sort((a, b) => (a.slot || 0) - (b.slot || 0));
  }
  return list;
});

const mapStats = computed(() => {
  const total = currentMemberList.value.length || 30;
  const defeatedCount = currentMemberList.value.filter((m) => m.defeated).length;
  const aliveCount = Math.max(0, total - defeatedCount);
  const defeatedRate = total > 0 ? ((defeatedCount / total) * 100).toFixed(1) : "0.0";
  return { total, defeatedCount, aliveCount, defeatedRate };
});

const ownDefendDefeatedCount = computed(() => ownMembers.value.filter((m) => m.defeated).length);

const currentOppoDayScore = computed(() => {
  const oppo = matchDayList.value.find((d) => d.day === selectedMatchDay.value);
  return oppo?.dayScore || 0;
});

const attendanceStats = computed(() => {
  const members = ownMembers.value;
  const total = members.length || 30;
  const unattacked = members.filter((m) => (m.realAttackCnt || 0) === 0);
  const incomplete = members.filter((m) => (m.realAttackCnt || 0) > 0 && (m.realAttackCnt || 0) < 3);
  const completed = members.filter((m) => (m.realAttackCnt || 0) >= 3);
  const completedCount = completed.length;
  const completedRate = total > 0 ? ((completedCount / total) * 100).toFixed(1) : "0.0";
  return {
    total,
    unattackedCount: unattacked.length,
    incompleteCount: incomplete.length,
    completedCount,
    completedRate,
    unattacked,
    incomplete,
    completed,
  };
});

const weeklyRosterRanked = computed(() => {
  const members = [...ownMembers.value];
  return members.map((m) => {
    const w =
      weeklyDefenseStatsMap.value.get(`${Number(m.id)}_${!!m.mirror}`) ||
      weeklyDefenseStatsMap.value.get(Number(m.id)) ||
      weeklyDefenseStatsMap.value.get(m.id);
    return {
      ...m,
      challengeCnt: w ? w.challengeCnt : 0,
      defWins: w ? w.defWins : 0,
      defLosses: w ? w.defLosses : 0,
      defWinRate: w ? w.defWinRate : "—",
      defWinRateNum: w ? w.defWinRateNum : -1,
    };
  });
});

const createRosterComparator = (sortBy, scoreKey = "score") => (a, b) => {
  if (sortBy === "score") {
    return (b[scoreKey] || 0) - (a[scoreKey] || 0) || (b.power || 0) - (a.power || 0);
  }
  if (sortBy === "attackWinRate") {
    const hasAtkA = (a.realAttackCnt || 0) > 0;
    const hasAtkB = (b.realAttackCnt || 0) > 0;
    if (hasAtkA && !hasAtkB) return -1;
    if (!hasAtkA && hasAtkB) return 1;
    if (!hasAtkA && !hasAtkB) return (b.power || 0) - (a.power || 0);
    const diffRate = (b.attackWinRateNum ?? -1) - (a.attackWinRateNum ?? -1);
    if (Math.abs(diffRate) > 0.001) return diffRate;
    const diffCnt = (b.realAttackCnt || 0) - (a.realAttackCnt || 0);
    if (diffCnt !== 0) return diffCnt;
    return (b[scoreKey] || 0) - (a[scoreKey] || 0) || (b.power || 0) - (a.power || 0);
  }
  // defWinRate
  const hasDefA = (a.challengeCnt || 0) > 0;
  const hasDefB = (b.challengeCnt || 0) > 0;
  if (hasDefA && !hasDefB) return -1;
  if (!hasDefA && hasDefB) return 1;
  if (!hasDefA && !hasDefB) return (b.power || 0) - (a.power || 0);
  const diffRate = (b.defWinRateNum ?? -1) - (a.defWinRateNum ?? -1);
  if (Math.abs(diffRate) > 0.001) return diffRate;
  const diffCnt = (b.challengeCnt || 0) - (a.challengeCnt || 0);
  if (diffCnt !== 0) return diffCnt;
  return (b.power || 0) - (a.power || 0);
};

const sortedTodayMembers = computed(() => {
  const list = [...ownMembers.value];
  list.sort(createRosterComparator(todaySortBy.value, "todayScore"));
  return list.map((item, idx) => ({ ...item, rankIndex: idx + 1 }));
});

const sortedWeeklyRoster = computed(() => {
  const list = [...weeklyRosterRanked.value];
  list.sort(createRosterComparator(weeklySortBy.value));
  return list.map((item, idx) => ({ ...item, currentRank: idx + 1 }));
});

const todayBattleStarted = computed(() => {
  const now = new Date();
  const todayKey = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  if ((rawSiegeData.value?.attackMap?.[todayKey]?.attackCnt || 0) > 0) return true;
  return (
    ownMembers.value.some((m) => (m.challengeCnt || 0) > 0) ||
    opponentMembers.value.some((m) => (m.challengeCnt || 0) > 0)
  );
});

/* ---------- 真实布阵拉取（照抄 fetchMemberRealLineup / fetchMembersInChunks） ---------- */
const fetchMemberRealLineup = async (tokenId, roleId, baseInfo = {}) => {
  try {
    let targetTeamRes = null;
    try {
      targetTeamRes = await tokenStore.sendMessageWithPromise(tokenId, "club_gettargetteam", { targetId: roleId }, 4000);
    } catch (e) {
      targetTeamRes = await tokenStore.sendMessageWithPromise(tokenId, "role_gettargetteam", { targetId: roleId }, 4000);
    }
    const roleBattleTeam = targetTeamRes?.roleBattleTeam;
    const teamInfo = targetTeamRes?.teamInfo;
    const role = roleBattleTeam?.role || teamInfo;
    const battleTeam = roleBattleTeam?.battleTeam || teamInfo?.team;

    let totalRedCount = 0;
    const heroesInTeam = [];
    if (battleTeam) {
      const slotKeys = Object.keys(battleTeam).sort((a, b) => Number(a) - Number(b));
      for (const slotKey of slotKeys) {
        const slotData = battleTeam[slotKey];
        const heroId = slotData.heroId || slotData.id;
        const heroRed = slotData.redQuenchCnt || 0;
        totalRedCount += heroRed;
        heroesInTeam.push({
          slotIndex: Number(slotKey) + 1,
          slotName: Number(slotKey) < 2 ? `前排${Number(slotKey) + 1}号位` : `后排${Number(slotKey) + 1}号位`,
          heroId,
          heroName: HERO_DICT[heroId]?.name || `武将${heroId}`,
          level: slotData.level || 6000,
          star: slotData.star || 30,
          attack: slotData.attack || 0,
          curHp: slotData.hp || slotData.curHp || 0,
          skin: slotData.useSkin || slotData.skin || 0,
          red: heroRed,
          battleTeamSlot: Number(slotKey),
        });
      }
    }
    const totalPower =
      heroesInTeam.reduce((sum, h) => sum + (h.attack || h.curHp || 0), 0) > 0
        ? role?.power || baseInfo?.power || 0
        : role?.power || baseInfo?.power || 0;
    return {
      slot: baseInfo?.slot || 1,
      id: roleId,
      name: role?.name || baseInfo?.name || `成员${roleId}`,
      headImg: role?.headImg || baseInfo?.headImg || DEFAULT_AVATAR,
      power: totalPower,
      legacy: baseInfo?.legacy || 0,
      redQuench: totalRedCount,
      toyName: formatWeapon(role?.weaponId || role?.lordWeaponId || baseInfo?.toyName) || "",
      petId: role?.petId || baseInfo?.petId || 0,
      legionName: role?.legionName || baseInfo?.legionName || "",
      heroList: heroesInTeam,
      lineupType: getLineupType(heroesInTeam),
      score: baseInfo?.score || 0,
      defeated: baseInfo?.defeated || false,
      challengeCnt: baseInfo?.challengeCnt || 0,
      failCnt: baseInfo?.failCnt || 0,
      mirror: !!baseInfo?.mirror,
    };
  } catch (e) {
    return {
      slot: baseInfo?.slot || 1,
      id: roleId,
      name: baseInfo?.name || `成员${roleId}`,
      headImg: baseInfo?.headImg || DEFAULT_AVATAR,
      power: baseInfo?.power || 0,
      legacy: 0,
      redQuench: 0,
      toyName: "",
      petId: baseInfo?.petId || 0,
      heroList: [],
      lineupType: "未知",
      score: baseInfo?.score || 0,
      defeated: baseInfo?.defeated || false,
      challengeCnt: baseInfo?.challengeCnt || 0,
      failCnt: baseInfo?.failCnt || 0,
      mirror: !!baseInfo?.mirror,
    };
  }
};

const fetchMembersInChunks = async (tokenId, items, chunkSize = 5) => {
  const results = [];
  const total = items.length;
  for (let i = 0; i < total; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    progressText.value = `${Math.min(i + chunkSize, total)}/${total}`;
    const chunkResults = await Promise.all(
      chunk.map((it) => fetchMemberRealLineup(tokenId, it.id, it.base)),
    );
    results.push(...chunkResults);
  }
  return results;
};

/* ---------- 主拉取（照抄 fetchCampChallengeData 11 步） ---------- */
const fetchCampChallengeData = async () => {
  if (!tokenStore.selectedToken) {
    message.warning("请先在上方选择一个已连接账号");
    return;
  }
  const tokenId = tokenStore.selectedToken.id;
  loading.value = true;
  emptyHint.value = "正在加载营地对阵信息...";

  try {
    // 1. 我方公会基础信息
    const ownClubRes = await tokenStore.sendMessageWithPromise(tokenId, "legion_getinfo", {}, 5000);
    const ownClubData = ownClubRes?.info || ownClubRes?.legionData || ownClubRes || {};
    const ownLegionId = ownClubData.id;

    // 2. 营地挑战全量活动数据
    const clubInfoRes = await tokenStore.sendMessageWithPromise(tokenId, "club_getinfo", {}, 8000);
    const clubData = clubInfoRes?.club || {};
    rawClubData.value = clubData;
    rawSiegeData.value = clubInfoRes?.siege || {};

    // 3. 解析比赛日列表
    const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const days = [];
    if (clubData.oppoMap) {
      for (const [dayKey, oppo] of Object.entries(clubData.oppoMap)) {
        const dayNum = Number(dayKey);
        days.push({
          day: dayNum,
          label: dayNames[dayNum] || `周${dayKey}`,
          name: oppo.name || `俱乐部${oppo.legionId}`,
          legionId: oppo.legionId,
          power: oppo.power || 0,
          viewId: oppo.viewId,
          dayScore: oppo.dayScore || 0,
          defenders: oppo.defenders || {},
          logo: oppo.logo || DEFAULT_AVATAR,
        });
      }
    }
    days.sort((a, b) => a.day - b.day);
    matchDayList.value = days;

    const currentDay = new Date().getDay();
    if (days.some((d) => d.day === currentDay)) {
      selectedMatchDay.value = currentDay;
    } else if (days.length > 0 && !days.some((d) => d.day === selectedMatchDay.value)) {
      selectedMatchDay.value = days[0].day;
    }

    // 4. 当前选定比赛日的对手俱乐部
    const currentOppo = days.find((d) => d.day === selectedMatchDay.value) || days[0] || {};
    const displayOppName = currentOppo.name || "匹配对战俱乐部";

    // 5. VS 看板
    battleInfo.value = {
      ownClub: {
        id: clubData.legionId || ownLegionId || "0",
        name: ownClubData.name || "我方俱乐部",
        serverId: ownClubData.serverId || "",
        logo: ownClubData.logo || DEFAULT_AVATAR,
        quenchNum: 0,
        power: clubData.power || ownClubData.power || 0,
        announcement: ownClubData.announcement || ownClubData.manifesto || "暂无公会公告",
      },
      opponentClub: {
        id: currentOppo.legionId || "未知",
        name: displayOppName,
        serverId: currentOppo.viewId ? `${currentOppo.viewId}` : "跨服",
        logo: currentOppo.logo || DEFAULT_AVATAR,
        quenchNum: 0,
        power: currentOppo.power || 0,
        announcement: "营地挑战匹配对战俱乐部",
      },
    };

    // 6. 双方 30 名成员基础列表
    const oppDefendersEntries = Object.entries(currentOppo.defenders || {});
    opponentMembers.value = oppDefendersEntries.map(([slotKey, d], idx) => ({
      slot: Number(slotKey) || idx + 1,
      id: d.roleId,
      name: d.name || `对手成员${idx + 1}`,
      headImg: d.headImg || DEFAULT_AVATAR,
      power: 0,
      score: d.score || 0,
      defeated: d.defeated || false,
      challengeCnt: d.challengeCnt || 0,
      failCnt: d.failCnt || 0,
      mirror: !!d.mirror,
      heroList: [],
      lineupType: "常规",
      redQuench: 0,
      legacy: 0,
      toyName: "",
      petId: d.petId || 0,
      legionName: displayOppName,
    }));

    const ownMembersEntries = Object.entries(clubData.members || {});
    ownMembers.value = ownMembersEntries.map(([slotKey, m], idx) => ({
      slot: Number(slotKey) || idx + 1,
      id: m.roleId,
      name: m.name || `我方成员${idx + 1}`,
      headImg: m.headImg || DEFAULT_AVATAR,
      power: 0,
      score: m.score || 0,
      defeated: m.defeated || false,
      challengeCnt: m.challengeCnt || 0,
      failCnt: m.failCnt || 0,
      mirror: !!m.mirror,
      heroList: [],
      lineupType: "常规",
      redQuench: 0,
      legacy: 0,
      toyName: "",
      petId: m.petId || 0,
      legionName: ownClubData.name || "我方俱乐部",
    }));

    selectedSide.value = "own";
    rankText.value = `营地挑战对决 · VS ${displayOppName}`;

    // 7. 先敌后我分批并发拉真实布阵
    if (opponentMembers.value.length > 0) {
      const oppDetailed = await fetchMembersInChunks(
        tokenId,
        opponentMembers.value.map((o) => ({ id: o.id, base: o })),
      );
      opponentMembers.value = oppDetailed;
      const totalOppRed = oppDetailed.reduce((s, m) => s + (m.redQuench || 0), 0);
      const totalOppPower = oppDetailed.reduce((s, m) => s + (m.power || 0), 0);
      battleInfo.value.opponentClub.quenchNum = totalOppRed;
      if (totalOppPower > 0) battleInfo.value.opponentClub.power = totalOppPower;
    }
    if (ownMembers.value.length > 0) {
      const ownDetailed = await fetchMembersInChunks(
        tokenId,
        ownMembers.value.map((o) => ({ id: o.id, base: o })),
      );
      ownMembers.value = ownDetailed;
      const totalOwnRed = ownDetailed.reduce((s, m) => s + (m.redQuench || 0), 0);
      const totalOwnPower = ownDetailed.reduce((s, m) => s + (m.power || 0), 0);
      battleInfo.value.ownClub.quenchNum = totalOwnRed;
      if (totalOwnPower > 0) battleInfo.value.ownClub.power = totalOwnPower;
    }

    // 8. 个人进攻战报（独立 try，失败不影响主流程）
    try {
      const atkRes = await tokenStore.sendMessageWithPromise(tokenId, "club_getattackrecord", {}, 5000);
      if (Array.isArray(atkRes?.records)) cachedAttackRecords.value = atkRes.records;
    } catch (e) {
      console.warn("未能拉取个人进攻战报:", e);
    }

    // 9. 排位天梯榜（独立 try）
    try {
      const grpRes = await tokenStore.sendMessageWithPromise(tokenId, "club_getgrouprank", {}, 5000);
      if (Array.isArray(grpRes?.rankList)) groupRankData.value = grpRes.rankList;
    } catch (e) {
      console.warn("未能拉取排位天梯榜:", e);
    }

    // 10. 汇总全员出刀与防守战报（独立 try）
    try {
      await aggregateAllMemberAttacks(tokenId, selectedMatchDay.value);
    } catch (e) {
      console.warn("未能聚合全员进攻战报:", e);
    }

    message.success(`营地挑战(${displayOppName})数据加载完成`);
  } catch (err) {
    emptyHint.value = `查询失败: ${err.message || "网络异常"}`;
    message.error(emptyHint.value);
  } finally {
    loading.value = false;
  }
};

/* ---------- 比赛日窗口过滤（照抄 getMatchDayRange / isRecordInMatchDay） ---------- */
const getMatchDayRange = (day) => {
  const phaseStr = String(rawClubData.value?.phase || "");
  if (phaseStr.length !== 6) return null;
  const y = 2000 + parseInt(phaseStr.slice(0, 2), 10);
  const m = parseInt(phaseStr.slice(2, 4), 10) - 1;
  const d = parseInt(phaseStr.slice(4, 6), 10);
  const offset = day >= 1 ? day - 1 : day + 6;
  const startMs = new Date(y, m, d + offset).setHours(0, 0, 0, 0);
  return { startMs, endMs: startMs + 24 * 60 * 60 * 1000 };
};

const isRecordInMatchDay = (ts, day) => {
  const range = getMatchDayRange(day);
  if (!range) return true;
  const n = Number(ts);
  const ms = n > 10000000000 ? n : n * 1000;
  return ms >= range.startMs && ms < range.endMs;
};

/* ---------- 双向聚合（照抄 aggregateAllMemberAttacks） ---------- */
const aggregateAllMemberAttacks = async (tokenId, day) => {
  const oppo = matchDayList.value.find((d) => d.day === day);
  if (!oppo || !oppo.defenders) return;

  const oppDefenders = Object.values(oppo.defenders);
  const ourDefenders = ownMembers.value;

  // 全实时策略：每次聚合前重置当周防守统计
  weeklyDefenseStatsMap.value = new Map();

  const ourStats = new Map();
  const defRecordsMap = new Map();

  let ourTotalAttacks = 0;
  let ourTotalWins = 0;
  let ourTotalLosses = 0;
  let oppTotalAttacks = 0;
  let oppTotalWins = 0;
  let oppTotalLosses = 0;

  // 1. 我方出手总数（不走 WS）：failCnt = 攻击方失败次数 = 据点防守成功次数
  for (const d of oppDefenders) {
    const cnt = d.challengeCnt || 0;
    const defSucc = d.failCnt || 0;
    ourTotalAttacks += cnt;
    ourTotalWins += Math.max(0, cnt - defSucc);
    ourTotalLosses += defSucc;
  }

  // 1b. 我方出刀明细（并发拉对手据点防守战报）
  const seenOppDefRecords = new Set();
  const oppDefPromise = Promise.all(
    oppDefenders.map(async (d) => {
      try {
        const defRes = await tokenStore.sendMessageWithPromise(
          tokenId,
          "club_getdefenserecord",
          { targetId: d.roleId, targetIsMirror: !!d.mirror },
          5000,
        );
        if (Array.isArray(defRes?.records)) {
          for (const r of defRes.records) {
            if (!isRecordInMatchDay(r.created, day)) continue;
            const recordKey =
              r.recordName || `${r.created}_${r.roleId}_${r.nodeId ?? d.slot ?? ""}_${r.isWin}`;
            if (seenOppDefRecords.has(recordKey)) continue;
            seenOppDefRecords.add(recordKey);

            // 对手据点记录中 isWin === false = 我方攻破成功
            const attackerWon = r.isWin === false;
            const attackerRoleId = r.roleId;
            let cur = ourStats.get(attackerRoleId);
            if (!cur) {
              cur = { roleId: attackerRoleId, name: r.name, attackCnt: 0, winCnt: 0, lossCnt: 0, attacks: [] };
              ourStats.set(attackerRoleId, cur);
            }
            cur.attackCnt++;
            if (attackerWon) cur.winCnt++;
            else cur.lossCnt++;
            cur.attacks.push({
              attackType: 1,
              winFlag: attackerWon,
              timestamp: r.created,
              difficulty: r.difficulty,
              nodeId: r.nodeId,
              targetRoleInfo: {
                roleId: d.roleId,
                name: d.name,
                legionName: oppo.name || "敌方俱乐部",
                headImg: d.headImg || DEFAULT_AVATAR,
                power: d.power,
              },
            });
          }
        }
      } catch (e) {
        // 忽略单据点拉取失败
      }
    }),
  );

  // 2. 敌方出刀明细 + 当周防守（并发拉我方据点防守战报）
  const seenOurDefRecords = new Set();
  const ourDefPromise = Promise.all(
    ourDefenders.map(async (m) => {
      try {
        const defRes = await tokenStore.sendMessageWithPromise(
          tokenId,
          "club_getdefenserecord",
          { targetId: m.id || m.roleId, targetIsMirror: !!m.mirror },
          5000,
        );
        if (Array.isArray(defRes?.records)) {
          const list = [];
          const w = { challengeCnt: 0, defWins: 0, defLosses: 0, defWinRate: "—", defWinRateNum: -1 };
          for (const r of defRes.records) {
            // 当周防守统计（不过滤日期）
            w.challengeCnt++;
            if (r.isWin === true) w.defWins++;
            else w.defLosses++;

            if (!isRecordInMatchDay(r.created, day)) continue;
            const recordKey =
              r.recordName || `${r.created}_${r.roleId}_${r.nodeId ?? m.slot ?? ""}_${r.isWin}`;
            if (!seenOurDefRecords.has(recordKey)) {
              seenOurDefRecords.add(recordKey);
              oppTotalAttacks++;
              const oppAttackerWon = r.isWin === false;
              if (oppAttackerWon) oppTotalWins++;
              else oppTotalLosses++;
            }
            const defenderWon = r.isWin === true;
            list.push({
              attackType: 0,
              winFlag: defenderWon,
              timestamp: r.created,
              difficulty: r.difficulty,
              nodeId: r.nodeId,
              targetRoleInfo: {
                roleId: r.roleId,
                name: r.name,
                legionName: r.legionName || oppo.name || "敌方俱乐部",
                headImg: r.headImg || DEFAULT_AVATAR,
                power: r.power,
              },
            });
          }
          list.sort((a, b) => b.timestamp - a.timestamp);
          const memberRoleId = m.id || m.roleId;
          defRecordsMap.set(`${memberRoleId}_${!!m.mirror}`, list);
          if (!m.mirror || !defRecordsMap.has(memberRoleId)) {
            defRecordsMap.set(memberRoleId, list);
          }
          w.defWinRate = w.challengeCnt > 0 ? ((w.defWins / w.challengeCnt) * 100).toFixed(1) + "%" : "—";
          w.defWinRateNum = w.challengeCnt > 0 ? (w.defWins / w.challengeCnt) * 100 : -1;
          weeklyDefenseStatsMap.value.set(`${memberRoleId}_${!!m.mirror}`, w);
          if (!m.mirror || !weeklyDefenseStatsMap.value.has(memberRoleId)) {
            weeklyDefenseStatsMap.value.set(memberRoleId, w);
          }
        }
      } catch (e) {
        // 忽略单据点拉取失败
      }
    }),
  );

  await Promise.all([oppDefPromise, ourDefPromise]);

  ourStats.forEach((entry) => {
    entry.attacks.sort((a, b) => b.timestamp - a.timestamp);
  });

  memberAttackStatsMap.value = ourStats;
  memberDefenseRecordsMap.value = defRecordsMap;

  const ourWinRate = ourTotalAttacks > 0 ? ((ourTotalWins / ourTotalAttacks) * 100).toFixed(1) : "0.0";
  const oppWinRate = oppTotalAttacks > 0 ? ((oppTotalWins / oppTotalAttacks) * 100).toFixed(1) : "0.0";
  // 我方防守胜率 = 对手进攻失败 / 对手进攻总次数；敌方防守胜率 = 我方进攻失败 / 我方进攻总次数
  const ourDefWinRate = oppTotalAttacks > 0 ? ((oppTotalLosses / oppTotalAttacks) * 100).toFixed(1) : "0.0";
  const oppDefWinRate = ourTotalAttacks > 0 ? ((ourTotalLosses / ourTotalAttacks) * 100).toFixed(1) : "0.0";

  todayCombatStats.value = {
    loaded: true,
    ourClub: {
      name: battleInfo.value?.ownClub?.name || "我方俱乐部",
      logo: battleInfo.value?.ownClub?.logo || "",
      totalAttacks: ourTotalAttacks,
      wins: ourTotalWins,
      losses: ourTotalLosses,
      winRate: ourWinRate,
      defTotal: oppTotalAttacks,
      defWins: oppTotalLosses,
      defLosses: oppTotalWins,
      defWinRate: ourDefWinRate,
    },
    oppClub: {
      name: oppo.name || "匹配俱乐部",
      logo: oppo.logo || "",
      totalAttacks: oppTotalAttacks,
      wins: oppTotalWins,
      losses: oppTotalLosses,
      winRate: oppWinRate,
      defTotal: ourTotalAttacks,
      defWins: ourTotalLosses,
      defLosses: ourTotalWins,
      defWinRate: oppDefWinRate,
    },
  };

  injectAttackStatsIntoOwnMembers();
};

/* ---------- 注入出刀/防守统计（照抄 injectAttackStatsIntoOwnMembers） ---------- */
const injectAttackStatsIntoOwnMembers = () => {
  ownMembers.value = ownMembers.value.map((m) => {
    const isMirror = !!m.mirror;
    // 镜像据点无主动出刀统计
    const stats = isMirror
      ? null
      : memberAttackStatsMap.value.get(Number(m.id)) || memberAttackStatsMap.value.get(m.id);

    const realAttackCnt = stats ? stats.attackCnt : 0;
    const attackWins = stats ? stats.winCnt : 0;
    const attackLosses = stats ? stats.lossCnt : 0;
    const attackWinRateNum = realAttackCnt > 0 ? (attackWins / realAttackCnt) * 100 : -1;
    const attackWinRate = realAttackCnt > 0 ? attackWinRateNum.toFixed(1) + "%" : "—";

    let attackStatusText = "0/3 未出战";
    let attackStatusType = "error";
    if (realAttackCnt === 0) {
      attackStatusText = "0/3 未出战";
      attackStatusType = "error";
    } else if (realAttackCnt < 3) {
      attackStatusText = `${realAttackCnt}/3 未打满`;
      attackStatusType = "warning";
    } else if (realAttackCnt === 3) {
      attackStatusText = "3/3 已打满";
      attackStatusType = "success";
    } else {
      attackStatusText = `${realAttackCnt}次 (满战)`;
      attackStatusType = "info";
    }

    const challengeCnt = m.challengeCnt || 0;
    const defWins = m.failCnt || 0;
    const defLosses = Math.max(0, challengeCnt - defWins);
    const defWinRateNum = challengeCnt > 0 ? (defWins / challengeCnt) * 100 : -1;
    const defWinRate = challengeCnt > 0 ? defWinRateNum.toFixed(1) + "%" : "—";

    const todayScore = todayBattleStarted.value ? m.score || 0 : 0;

    return {
      ...m,
      realAttackCnt,
      attackWins,
      attackLosses,
      attackWinRate,
      attackWinRateNum,
      attackStatusText,
      attackStatusType,
      challengeCnt,
      defLosses,
      defWins,
      defWinRate,
      defWinRateNum,
      todayScore,
    };
  });
};

/* ---------- 切换比赛日（照抄 handleMatchDayChange） ---------- */
const handleMatchDayChange = async (day) => {
  selectedMatchDay.value = day;
  const oppo = matchDayList.value.find((d) => d.day === day);
  if (!oppo || !oppo.defenders) return;
  const tokenId = tokenStore.selectedToken?.id;
  if (!tokenId) return;

  const fetchId = ++currentFetchToken;
  loading.value = true;

  try {
    // 1. 重拉 club_getinfo 刷新当日 challengeCnt/failCnt/score/defeated
    const clubInfoRes = await tokenStore.sendMessageWithPromise(tokenId, "club_getinfo", {}, 8000);
    if (currentFetchToken !== fetchId || selectedMatchDay.value !== day) return;
    const clubData = clubInfoRes?.club || {};
    rawClubData.value = clubData;
    rawSiegeData.value = clubInfoRes?.siege || {};
    const freshOwn = clubData.members || {};
    ownMembers.value = ownMembers.value.map((m) => {
      const fresh = freshOwn[m.id] || freshOwn[String(m.id)];
      if (!fresh) return m;
      return {
        ...m,
        score: fresh.score ?? m.score,
        defeated: fresh.defeated ?? m.defeated,
        challengeCnt: fresh.challengeCnt ?? 0,
        failCnt: fresh.failCnt ?? 0,
        mirror: fresh.mirror !== undefined ? !!fresh.mirror : m.mirror,
      };
    });

    // 2. 重建对手据点列表
    const oppDefendersEntries = Object.entries(oppo.defenders || {});
    const initialMembers = oppDefendersEntries.map(([slotKey, d], idx) => ({
      slot: Number(slotKey) || idx + 1,
      id: d.roleId,
      name: d.name || `对手成员${idx + 1}`,
      headImg: d.headImg || DEFAULT_AVATAR,
      power: 0,
      score: d.score || 0,
      defeated: d.defeated || false,
      challengeCnt: d.challengeCnt || 0,
      failCnt: d.failCnt || 0,
      mirror: !!d.mirror,
      heroList: [],
      lineupType: "常规",
      redQuench: 0,
      legacy: 0,
      toyName: "",
      petId: d.petId || 0,
      legionName: oppo.name,
    }));
    const oppClubObj = {
      id: oppo.legionId || "未知",
      name: oppo.name,
      serverId: oppo.viewId ? `${oppo.viewId}` : "跨服",
      logo: oppo.logo || DEFAULT_AVATAR,
      quenchNum: 0,
      power: oppo.power || 0,
      announcement: "营地挑战匹配对战俱乐部",
    };
    battleInfo.value.opponentClub = oppClubObj;
    opponentMembers.value = initialMembers;
    rankText.value = `营地挑战对决 · VS ${oppo.name}`;

    // 3. 拉取对手据点布阵与全量战报聚合
    if (initialMembers.length > 0) {
      const detailed = await fetchMembersInChunks(
        tokenId,
        initialMembers.map((o) => ({ id: o.id, base: o })),
      );
      if (currentFetchToken !== fetchId || selectedMatchDay.value !== day) return;
      const totalOppRed = detailed.reduce((s, m) => s + (m.redQuench || 0), 0);
      const totalOppPower = detailed.reduce((s, m) => s + (m.power || 0), 0);
      oppClubObj.quenchNum = totalOppRed;
      if (totalOppPower > 0) oppClubObj.power = totalOppPower;
      opponentMembers.value = detailed;
    }
    await aggregateAllMemberAttacks(tokenId, day);
  } catch (e) {
    console.warn("切换比赛日加载失败:", e);
  } finally {
    if (currentFetchToken === fetchId) loading.value = false;
  }
};

/* ---------- 复制名单（照抄 copyUnattackedList / copyIncompleteList） ---------- */
const copyToClipboard = (text, successMsg) => {
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      message.success(successMsg);
    });
  } else {
    const input = document.createElement("textarea");
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
    message.success(successMsg);
  }
};

const copyUnattackedList = () => {
  const unattacked = attendanceStats.value.unattacked;
  if (!unattacked.length) {
    message.success("太棒了！我方全员今日均已出战动刀！");
    return;
  }
  const names = unattacked.map((m) => m.name).join("、");
  const text = `【营地挑战今日催刀提醒（0刀未动）】\n截至目前，我方 0 刀未动成员（共${unattacked.length}人）：\n${names}\n请以上成员尽快上线使用免费挑战次数，为俱乐部争夺排位积分！`;
  copyToClipboard(text, `未动刀催刀名单已复制到剪贴板（共${unattacked.length}人）！`);
};

const copyIncompleteList = () => {
  const incomplete = attendanceStats.value.incomplete;
  if (!incomplete.length) {
    message.success("太棒了！我方出战成员均已打满 3 刀！");
    return;
  }
  const details = incomplete
    .map((m) => `${m.name}(已出战${m.realAttackCnt || 0}/3次，剩${3 - (m.realAttackCnt || 0)}次)`)
    .join("、");
  const text = `【营地挑战今日补刀提醒（未打满 3 刀）】\n截至目前，我方未打满免费次数成员（共${incomplete.length}人）：\n${details}\n请以上成员及时上线补满挑战次数，助力俱乐部积分登顶！`;
  copyToClipboard(text, `未打满补刀名单已复制到剪贴板（共${incomplete.length}人）！`);
};

/* ---------- 战报流水（照抄 openDuelModal） ---------- */
const openDuelModal = async (player) => {
  targetPlayer.value = player;
  duelSheet.value = true;
  duelTab.value = "atk";
  modalLoading.value = true;
  playerAttackRecords.value = [];
  playerDefenseRecords.value = [];

  try {
    const tokenId = tokenStore.selectedToken?.id;
    if (!tokenId) return;

    const isOpponent = selectedSide.value === "opponent";
    if (isOpponent) {
      // 敌方据点守军：拉其防守流水（我方哪些成员攻打了他）
      const defRes = await tokenStore.sendMessageWithPromise(
        tokenId,
        "club_getdefenserecord",
        { targetId: player.id, targetIsMirror: !!player.mirror },
        5000,
      );
      if (Array.isArray(defRes?.records)) {
        playerDefenseRecords.value = defRes.records
          .filter((r) => isRecordInMatchDay(r.created, selectedMatchDay.value))
          .map((r) => ({
            attackType: 0,
            winFlag: r.isWin === true,
            timestamp: r.created,
            difficulty: r.difficulty,
            nodeId: r.nodeId,
            targetRoleInfo: {
              roleId: r.roleId,
              name: r.name,
              legionName: r.legionName || battleInfo.value?.ownClub?.name || "我方俱乐部",
              headImg: r.headImg || DEFAULT_AVATAR,
              power: r.power,
            },
          }));
      }
      playerAttackRecords.value = [];
    } else {
      // 我方成员
      const isMirror = !!player.mirror;
      const roleIdNum = Number(player.id);
      // 1. 出手信息（镜像据点为虚拟据点，无主动出刀记录）
      if (isMirror) {
        playerAttackRecords.value = [];
      } else {
        const s = memberAttackStatsMap.value.get(roleIdNum) || memberAttackStatsMap.value.get(player.id);
        if (s && s.attacks.length > 0) {
          playerAttackRecords.value = s.attacks;
        } else if (
          roleIdNum === Number(tokenStore.selectedToken?.roleId) &&
          cachedAttackRecords.value.length > 0
        ) {
          playerAttackRecords.value = cachedAttackRecords.value
            .filter((r) => isRecordInMatchDay(r.created, selectedMatchDay.value))
            .map((r) => ({
              attackType: 1,
              winFlag: r.isWin === true,
              timestamp: r.created,
              difficulty: r.difficulty,
              nodeId: r.nodeId,
              targetRoleInfo: {
                roleId: r.roleId,
                name: r.name,
                legionName: r.legionName || battleInfo.value?.opponentClub?.name || "敌方俱乐部",
                headImg: r.headImg || DEFAULT_AVATAR,
                power: r.power,
              },
            }));
        } else {
          playerAttackRecords.value = [];
        }
      }
      // 2. 防守信息
      const cachedDef =
        memberDefenseRecordsMap.value.get(`${roleIdNum}_${!!player.mirror}`) ||
        memberDefenseRecordsMap.value.get(roleIdNum) ||
        memberDefenseRecordsMap.value.get(player.id);
      if (cachedDef && cachedDef.length > 0) {
        playerDefenseRecords.value = cachedDef;
      } else {
        const defRes = await tokenStore.sendMessageWithPromise(
          tokenId,
          "club_getdefenserecord",
          { targetId: player.id, targetIsMirror: !!player.mirror },
          5000,
        );
        if (Array.isArray(defRes?.records)) {
          playerDefenseRecords.value = defRes.records
            .filter((r) => isRecordInMatchDay(r.created, selectedMatchDay.value))
            .map((r) => ({
              attackType: 0,
              winFlag: r.isWin === true,
              timestamp: r.created,
              difficulty: r.difficulty,
              nodeId: r.nodeId,
              targetRoleInfo: {
                roleId: r.roleId,
                name: r.name,
                legionName: r.legionName || battleInfo.value?.opponentClub?.name || "敌方俱乐部",
                headImg: r.headImg || DEFAULT_AVATAR,
                power: r.power,
              },
            }));
        }
      }
    }
  } catch (e) {
    console.warn("拉取对战战报流水异常:", e);
  } finally {
    modalLoading.value = false;
  }
};

/* ---------- 导出长图（文件名照抄：营地挑战阵容_${我方|敌方}.png） ---------- */
const handleExportImage = async () => {
  if (!exportDom.value) return;
  exporting.value = true;
  const loadingMsg = message.loading("正在渲染长图，请稍候...", { duration: 0 });
  try {
    await nextTick();
    const filename = `营地挑战阵容_${selectedSide.value === "opponent" ? "敌方" : "我方"}.png`;
    await exportDomAsImage(exportDom.value, filename);
    message.success("长图导出成功！");
  } catch (err) {
    console.error("导出长图失败:", err);
    message.error("导出长图失败: " + (err.message || "未知错误"));
  } finally {
    loadingMsg?.destroy?.();
    exporting.value = false;
  }
};

/* ---------- 展示辅助 ---------- */
/* 流派彩色标签：暗色下 App.vue 的 html[data-theme="dark"] span{color:#fff!important} 会把字刷白，
   浅底（「常规」的 #e8e8e8）立刻变成白字白底看不见。内联 color 干不过 !important，
   所以把前景色同时塞进 --lu-fg，由 .m-lu--fg / .m-tag--fg 用同一次要性的规则取回来。 */
const lineupStyle = (type) => {
  const rule = LINEUP_RULES.find((r) => r.name === type);
  const cp = rule ? rule.colorProps : { color: "var(--m-bg)", textColor: "var(--m-text2)" };
  return { background: cp.color, color: cp.textColor, "--lu-fg": cp.textColor };
};
const statusClass = (t) => (t === "success" ? "done" : t === "warning" ? "wait" : t === "info" ? "run" : "err");
const avatarBg = (m) => {
  const grads = [
    "var(--m-ava-1)",
    "var(--m-ava-2)",
    "var(--m-ava-3)",
    "var(--m-ava-4)",
  ];
  return grads[(m?.name || "").length % grads.length];
};
const onImgError = (e) => {
  e.target.style.display = "none";
};

/* ---------- 生命周期（照抄） ---------- */
onMounted(() => {
  if (tokenStore.selectedToken) fetchCampChallengeData();
});

watch(
  () => tokenStore.selectedToken?.id,
  (newId) => {
    if (newId) fetchCampChallengeData();
  },
);
</script>

<script>
export default { name: "MobileCampPanel" };
</script>

<style scoped>
.m-camp-t { font-size: 13.5px; font-weight: 700; color: var(--m-text); margin-top: 4px; }
/* VS 看板 */
.m-vs { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center; }
.m-vs-c { min-width: 0; }
.m-vs-id { font-size: 10.5px; color: var(--m-text3); font-weight: 700; }
.m-vs-row { display: flex; align-items: center; gap: 6px; margin: 4px 0 3px; min-width: 0; }
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
.m-ranktext { text-align: center; font-size: 11px; font-weight: 700; color: var(--m-primary); margin-top: 10px; }
/* 赛程 chip */
.m-dayc {
  display: inline-flex; flex-direction: column; align-items: flex-start; gap: 1px;
  border: 1px solid var(--m-border); background: var(--m-bg); color: var(--m-text);
  border-radius: 8px; padding: 6px 10px; font-family: inherit; cursor: pointer; text-align: left; min-width: 0;
}
.m-dayc b { font-size: 11.5px; font-weight: 700; }
.m-dayc span { font-size: 10px; color: var(--m-text2); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-dayc i { font-style: normal; font-size: 10px; color: var(--m-text3); }
.m-dayc.on { border-color: var(--m-primary); background: var(--m-blue-soft); }
.m-dayc.on b { color: var(--m-primary); }
/* 顶部日程 tag：「今日周六（非排位日，开放日：周二、周三、周四）」在 390 视口放不下，
   原来把右侧「刷新战况」按钮挤出卡外（只剩半个图标）。改为 tag 侧让步、允许折两行。 */
.m-sched { flex: 1 1 auto; min-width: 0; margin-top: 0; }
.m-sched-tag { white-space: normal; line-height: 1.35; text-align: left; align-self: flex-start; }
/* 赛程速览：三个 chip 均分一行，俱乐部名允许折行（原来 max-width:120px + ellipsis 会把名字吃掉） */
.m-dayc--sched { flex: 1 1 calc(33.333% - 4px); }
.m-dayc--sched span { max-width: none; white-space: normal; overflow: visible; text-overflow: clip; line-height: 1.25; }
/* 据点卡：编号 + 头像 + 三行（名字/战力/遭遇），头像必须显式定性尺寸，
   否则 <img> 按原图渲染成上百像素（10-31 实拍过：头像占满半张卡、战力折行） */
.m-slot {
  display: flex; align-items: flex-start; gap: 10px; padding: 12px 0;
  border-bottom: 1px solid var(--m-border); cursor: pointer;
}
.m-slot:last-child { border-bottom: none; }
.m-slot-no {
  flex: none; width: 24px; padding-top: 13px;
  font-size: 12px; font-weight: 700; color: var(--m-primary); font-variant-numeric: tabular-nums;
}
.m-slot .m-mava {
  flex: none; width: 44px; height: 44px; overflow: hidden;
  border-radius: var(--m-r-md);
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; color: var(--m-on-primary);
}
.m-slot .m-mava img { width: 44px; height: 44px; object-fit: cover; border-radius: var(--m-r-md); display: block; }
.m-slot .m-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.m-nmline { display: flex; align-items: center; gap: 6px; min-width: 0; }
.m-nmline .m-nm {
  min-width: 0; font-size: 13px; font-weight: 700; color: var(--m-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.m-nmline .m-nm small { font-weight: 700; font-size: 11px; color: var(--m-text3); }
.m-rt { margin-left: auto; flex: none; font-size: 11px; font-weight: 700; color: var(--m-primary); }
.m-slot .m-ds {
  display: flex; flex-wrap: wrap; align-items: center; gap: 5px;
  font-size: 11px; line-height: 1.45; color: var(--m-text3);
}
.m-ds-v { font-size: 12px; font-weight: 700; color: var(--m-text); font-variant-numeric: tabular-nums; }
.m-slot .m-lu { margin-top: 0; font-size: 10.5px; padding: 1px 6px; }
.m-rdtag {
  display: inline-block; font-style: normal; font-size: 10px; font-weight: 700;
  color: var(--m-red); background: var(--m-red-soft); border-radius: 4px;
  padding: 1px 6px; font-variant-numeric: tabular-nums;
}
/* 比分横幅 */
.m-score { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center; }
.m-score-c { min-width: 0; }
.m-score-nm { display: block; font-size: 12px; font-weight: 700; color: var(--m-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-score-v { display: block; font-size: 24px; font-weight: 700; color: var(--m-primary); line-height: 1.2; font-variant-numeric: tabular-nums; }
.m-score-ds { display: block; font-size: 10.5px; color: var(--m-text3); margin-top: 2px; }
.m-score-mid { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.m-score-lead { font-size: 10.5px; font-weight: 700; border-radius: var(--m-r-sm); padding: 3px 9px; white-space: nowrap; }
.m-score-lead.lead { color: var(--m-green); background: var(--m-green-soft); }
.m-score-lead.lag { color: var(--m-red); background: var(--m-red-soft); }
/* 双对比条 */
.m-cmp { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.m-cmp-r { display: flex; align-items: center; gap: 8px; }
.m-cmp-l { font-size: 11px; color: var(--m-text2); font-weight: 700; flex: none; width: 76px; }
.m-cmp-r .m-pbar { flex: 1; }
.m-cmp-r b { font-size: 11.5px; font-weight: 700; color: var(--m-text); min-width: 40px; text-align: right; font-variant-numeric: tabular-nums; }
/* 催刀预览盒 */
.m-preview { border: 1px dashed var(--m-border); border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; }
.m-preview:last-child { margin-bottom: 0; }
.rate-hi { color: var(--m-green); }
.rate-lo { color: var(--m-amber); }
/* 名字链接 */
.m-nmlink { color: var(--m-primary); cursor: pointer; text-decoration: underline; }
/* 布阵小卡 */
/* 布阵五张武将卡：改固定两列 —— 原来 flex-wrap 按内容宽度排，5 张卡落在 3 行且宽度参差；
   固定两列后始终 2+2+1，配合下面「鱼灵仅在有名字时占行」把整卡从 ~470px 压到 ~270px */
.m-pgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; margin-top: 5px; }
.m-pcard {
  display: flex; flex-direction: column; gap: 1px;
  background: var(--m-bg); border: 1px solid var(--m-border); border-radius: 8px;
  padding: 4px 8px; min-width: 0;
}
.m-pcard-n { font-size: 11px; font-weight: 700; color: var(--m-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.m-pcard-r { font-style: normal; color: var(--m-red); margin-left: 2px; }
.m-pcard-hb { font-style: normal; color: var(--m-green); margin-left: 4px; font-size: 10px; }
.m-pcard-p { font-size: 10px; color: var(--m-text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ============================================================
 * 10-31 营地四 tab 收口（据点沙盘 / 催刀督战 / 当周大表 / 布阵）
 * ============================================================ */

/* chip 行与下方内容之间补间距：.m-chiprow 本身没有下边距，
   「今日战绩」「当周战绩」的排序 chip 会和第一张卡直接贴住（用户 10-31 反馈「tab 跟下方都挨在一起了」）。
   用相邻兄弟选择器而不是给 .m-chiprow 统一加 margin —— 流派分布卡里 chip 行本就是最后一个子元素，
   加了下边距等于给卡片底部白塞 10px。 */
.m-card > .m-chiprow + .m-scards { margin-top: 10px; }
/* 筛选行 → 排序行：同一区域里的两组，留一口气但不脱开 */
.m-card > .m-chiprow + .m-chiprow { margin-top: 6px; }
/* 筛选/排序 chip 收小一档：默认尺寸下「全部 (20) 仅坚守 (17) 仅击破 (3)」在 320 视口差一点排不下，
   折成两行；字号 12.5 + 内边距 5/9 后三个一行（390 上也更精致，不再显得笨重） */
.m-card > .m-chiprow .m-dayc { font-size: 12.5px; padding: 5px 9px; }
/* 卡末脚注（据点沙盘的「点击成员可查看…」，从两排 chip 中间下沉到底部） */
.m-foothint { margin: 10px 0 0; text-align: center; }

/* 名单 chip（催刀台 0 刀未动 / 未打满）：横排「名字 + 次数」，一行能落 2~3 个。
   原来是 .m-dayc 的 column 方向 + 括号里的战力，每个 chip 占满整行（30 人 = 30 行）。 */
.m-dayc--mem {
  flex-direction: row;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  font-size: 12px;
  line-height: 1.25;
  max-width: 100%;
  border-radius: var(--m-r-sm);
}
.m-dayc--mem em { font-style: normal; font-size: 10.5px; color: var(--m-text3); font-variant-numeric: tabular-nums; }

/* 卡片头右侧的文字入口（布阵卡的「对战详情 ›」，取代独占一行的底部按钮） */
.m-headlink {
  margin-left: auto;
  flex: none;
  border: none;
  background: none;
  padding: 0;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--m-primary);
  cursor: pointer;
}

/* 布阵字段三列：真实战力/红淬/珍卡/玩具/阵容流派 5 项从 3 行压到 2 行 */
.m-scard-grid--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }

/* 「出战布阵」后面的站位范围说明 */
.m-lcard-tip { font-style: normal; font-size: 10px; color: var(--m-text3); margin-left: 2px; }
/* 流派/标签的前景色：内联 color 会被 App.vue 暗色全局 span{color:#fff!important} 刷白，
   这里用 (0,2,0)+!important 压回去（见 lineupStyle 里 --lu-fg 的说明） */
.m-lu--fg,
.m-tag--fg { color: var(--lu-fg, currentColor) !important; }
</style>

<style scoped>
/* 比分横幅俱乐部 logo 行 */
.m-score-row { display: flex; align-items: center; gap: 6px; }
.m-score-row .m-clogo-s { width: 22px; height: 22px; border-radius: 4px; flex: none; }
.m-score-row .m-clogo-s img { width: 100%; height: 100%; border-radius: 4px; object-fit: cover; }
/* 击破进度条标题行（照抄旧版 progress-info） */
.m-pbar-t { display: block; font-size: 11px; color: var(--m-text2); margin-bottom: 5px; }
/* 布阵英雄卡鱼灵行（照抄旧版 hero-card-pearl） */
.m-pcard-fish { display: block; font-size: 10px; color: var(--m-text3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>

