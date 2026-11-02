<template>
  <div class="m-pane">
    <!-- 二级分段 -->
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

    <!-- ============ 盐场匹配 ============ -->
    <template v-if="sub === 'match'">
      <!-- 查询 + 对手俱乐部操作合并为一张卡：标题行 / 日期行 / 提示 / 操作行 -->
      <div class="m-card">
        <div class="m-card-h">
          <span class="m-t">盐场匹配 <small class="m-tdate">{{ queryDate }}</small></span>
          <button class="m-link" :disabled="loading1" @click="fetchMatch">
            {{ loading1 ? "查询中…" : "查询" }}
          </button>
        </div>
        <div class="m-frow">
          <button type="button" class="m-dtag" @click="matchCalOpen = true">{{ queryDate }}</button>
          <span class="m-acts" v-if="matchList.length && !isExporting">
            <button class="m-act" @click="exportMatchXlsx">导出表格</button>
            <button class="m-act m-act-i" @click="exportMatch">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="m21 15-4.5-4.5L7 20"/></svg>
              导出图片
            </button>
          </span>
        </div>
        <p class="m-hint m-fhint">默认上周六；当天 21 点前查实时匹配，之后查上周战绩</p>
        <!-- 数据到位后再出现：对手数量 / 排序口径 + 编辑与排序操作 -->
        <template v-if="matchList.length">
          <div class="m-split"></div>
          <div class="m-chiprow m-subrow">
            <span class="m-more">对手 <b>{{ matchList.length }}</b> · {{ sortLabel }}</span>
            <span class="m-acts" v-if="!isExporting" style="margin-left: auto">
              <button class="m-btn m-btn-g m-chipbtn" :disabled="loading1 || !matchList.length" @click="toggleEditMode">
                {{ isEditMode ? "退出编辑" : "调整排名" }}
              </button>
              <button class="m-btn m-btn-g m-chipbtn" :disabled="loading1 || !matchList.length" @click="hcSort">红淬排序</button>
              <button
                v-if="scoreShow === 1"
                class="m-btn m-btn-g m-chipbtn"
                :disabled="loading1 || !matchList.length"
                @click="scoreSort"
              >积分排序</button>
            </span>
          </div>
        </template>
      </div>

      <div v-if="loading1" class="m-card"><p class="m-hint" style="text-align: center; padding: 18px 0">正在拉取匹配数据…</p></div>

      <div v-else-if="!matchList.length" class="m-card">
        <div class="m-empty">
          <div class="m-logo">🌊</div>
          <h3>暂无匹配数据</h3>
          <p>盐场时间（周六 21:00 - 周日 21:00）开放，其他时间可查上周六战绩</p>
        </div>
      </div>

      <template v-else>
        <!-- 导出区：公告 + 联盟标签 + 卡片（照抄旧版 exportDom = table-content，不含头部按钮） -->
        <div ref="exportMatchDom">
          <!-- 公告区（照抄 GameStatus ⑫ 手机端 announcement-section：左侧蓝竖线 + 两行文字） -->
          <div class="m-anno">
            <span class="m-anno-t">{{ saltAnnouncementText }}</span>
            <span class="m-anno-time">{{ getSaltFetchTimeText() }}</span>
          </div>
          <!-- 联盟标签栏（照抄 GameStatus ⑫：grid 自动换行 + 每联盟配色 + 计数徽标） -->
          <div class="m-atabs">
            <button
              v-for="a in allianceTabs"
              :key="a.value"
              class="m-atab"
              :class="[a.value === 'all' ? 'al-all' : allianceClass(a.value), { on: activeAlliance === a.value }]"
              @click="activeAlliance = a.value"
            >
              <span class="m-atab-t">{{ a.label === "all" ? "全部" : a.label }}</span>
              <span class="m-atab-c">{{ a.count }}</span>
            </button>
          </div>
          <div class="m-scards">
            <template v-for="(row, i) in groupedMatchRows" :key="row.id ?? i">
              <!-- 联盟组头（照抄 V2 分组行：X盟(N家)平均红淬Y红） -->
              <div v-if="row.__isGroupHeader" class="m-grprow">
                <span class="m-grp-t">{{ row.alliance }}（{{ row.count }}家）{{ row.count > 1 ? "平均红淬" : "红淬" }} {{ row.avgRedQuench }}红</span>
              </div>
              <!-- 俱乐部卡片（照抄 V2 salt-card 移动端卡片视图） -->
              <div v-else class="m-scard" :class="allianceClass(getMemberAlliance(row))">
                <div class="m-scard-head">
                  <input
                    v-if="isEditMode"
                    class="m-rank-input"
                    type="number"
                    min="1"
                    max="20"
                    v-model.number="manualRankings[row.id]"
                    @focus="handleRankFocus(row)"
                    @blur="handleRankBlur(row)"
                    @keydown.enter="(e) => e.target.blur()"
                  />
                  <span v-else class="m-scard-rank">#{{ getMemberRank(row) }}</span>
                  <img v-if="row.logo" :src="row.logo" class="m-scard-ava" alt="" />
                  <span v-else class="m-scard-ava m-scard-ava--ph">{{ (row.name || "?").charAt(0) }}</span>
                  <span class="m-scard-name">{{ row.name || "-" }}</span>
                  <span class="m-scard-server">{{ row.serverId || "-" }}</span>
                  <span v-if="isCurrentClub(row)" class="m-scard-badge">本俱乐部</span>
                  <span
                    class="m-scard-alliance"
                    :class="{ editable: isEditMode }"
                    @click="isEditMode && openAlliancePicker(row)"
                  >{{ getMemberAlliance(row) }}</span>
                </div>
                <div class="m-scard-line">
                  <span class="m-scard-label">公告</span>
                  <span class="m-scard-val is-muted">{{ row.announcement || "—" }}</span>
                </div>
                <div class="m-scard-grid m-scard-grid--1row">
                  <div class="m-scard-cell">
                    <span class="m-scard-label">红淬</span>
                    <span class="m-scard-val is-red">{{ row.redQuench || 0 }}</span>
                  </div>
                  <div class="m-scard-cell">
                    <span class="m-scard-label">战力</span>
                    <span class="m-scard-val is-power">{{ fmtPower(row.power) || 0 }}</span>
                  </div>
                  <div class="m-scard-cell">
                    <span class="m-scard-label">等级</span>
                    <span class="m-scard-val">{{ row.level || 30 }}</span>
                  </div>
                  <div
                    v-if="scoreShow === 1 && row.sRScore !== -1"
                    class="m-scard-cell"
                  >
                    <span class="m-scard-label">积分</span>
                    <span class="m-scard-val is-score">{{
                      formatScore(row.sRScore)
                    }}</span>
                  </div>
                </div>
                <div v-if="row.topHeroes?.length" class="m-scard-heros">
                  <span class="m-scard-label">前三车头</span>
                  <div class="m-scard-hero" v-for="h2 in row.topHeroes" :key="h2.id" @click="openSaltPlayer(h2)">
                    <img v-if="h2.headImg" :src="h2.headImg" class="m-scard-hava" alt="" />
                    <span v-else class="m-scard-hava m-scard-hava--ph">{{ (h2.name || "?").charAt(0) }}</span>
                    <span class="m-scard-hname">{{ h2.name || "未知" }}</span>
                    <span class="m-scard-beast">圣{{ h2.holyBeast || 0 }}</span>
                    <span class="m-scard-hmeta">
                      {{ fmtPower(h2.power) }}
                      <i class="m-scard-lineup" :style="lineupTagStyle(h2.lineupType)">{{ h2.lineupType || "其他" }}</i>
                      <b class="m-scard-hred">{{ h2.redQuench || 0 }}红</b>
                    </span>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </template>
    </template>

    <!-- ============ 周战绩 ============ -->
    <template v-else-if="sub === 'week'">
      <div class="m-card">
        <div class="m-card-h">
          <span class="m-t">本周盐场战绩</span>
          <span class="m-acts" v-if="!isExporting">
            <button class="m-link" :disabled="loadingWeek" @click="fetchWeek">
              {{ loadingWeek ? "查询中…" : "查询" }}
            </button>
            <button class="m-act m-act-i" :disabled="!weekList.length" @click="exportWeek">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="m21 15-4.5-4.5L7 20"/></svg>
              导出图片
            </button>
          </span>
        </div>
        <div class="m-frow">
          <button type="button" class="m-dtag" @click="weekCalOpen = true">{{ weekDate }}</button>
        </div>
        <p class="m-hint m-fhint">默认上周六，按击杀数降序</p>
      </div>
      <div v-if="weekList.length" ref="exportWeekDom" style="display: flex; flex-direction: column; gap: 12px">
        <div class="m-card">
          <!-- 战报头 + 总览数字带（版式照 11-01 用户给的参考图：抬头 + 右上胶囊 + 一行六格） -->
          <div class="m-rhead">
            <span class="m-rhead-main">
              <span class="m-rhead-t">{{ clubDisplayName }} 盐场周报</span>
              <span class="m-rhead-d">{{ queryDate }}</span>
            </span>
            <span class="m-rpill">参战 {{ weekList.length }} 人</span>
          </div>
          <div class="m-rstat">
            <div class="m-rstat-c"><span class="m-rstat-k">总人数</span><span class="m-rstat-v">{{ weekList.length }}</span></div>
            <div class="m-rstat-c"><span class="m-rstat-k">总击杀</span><span class="m-rstat-v is-kill">{{ weekTotalKills }}</span></div>
            <div class="m-rstat-c"><span class="m-rstat-k">总死亡</span><span class="m-rstat-v">{{ weekTotalDeaths }}</span></div>
            <div class="m-rstat-c"><span class="m-rstat-k">总攻城</span><span class="m-rstat-v is-build">{{ weekTotalBuilding }}</span></div>
            <div class="m-rstat-c"><span class="m-rstat-k">总复活丹</span><span class="m-rstat-v is-revive">{{ weekTotalRevives }}</span></div>
            <div class="m-rstat-c"><span class="m-rstat-k">总 K/D</span><span class="m-rstat-v is-kd">{{ weekTotalKD }}</span></div>
          </div>
        </div>
        <!-- 榜单：2 列 × 3 行六榜（版式照参考图：band 浅灰块 + 名次色 + 头像 + 右值） -->
        <div class="m-card">
          <div class="m-card-h"><span class="m-t">榜单</span><span class="m-more">各榜前 3</span></div>
          <div class="m-rk-grid">
            <div class="m-rk-card" v-for="b in weekRankBoards" :key="b.t">
              <div class="m-rk-t">{{ b.t }}</div>
              <div class="m-rk-row" v-for="(p, ti) in b.rows" :key="ti">
                <span class="m-rk-no" :class="'n' + (ti + 1)">{{ ti + 1 }}</span>
                <img v-if="p.headImg" :src="p.headImg" class="m-rk-ava" alt="" @error="onImgError" />
                <span v-else class="m-rk-ava m-rk-ava--ph">{{ (p.name || "?").charAt(0) }}</span>
                <span class="m-rk-nm">{{ p.name }}</span>
                <span class="m-rk-v">{{ b.val(p) }}</span>
              </div>
            </div>
          </div>
        </div>
        <!-- 成员明细：表格版（排名 / 成员 / 击杀 / 死亡 / 攻城 / 复活丹 / K/D） -->
        <div class="m-card">
          <div class="m-card-h">
            <span class="m-t">成员明细</span>
            <span class="m-acts" v-if="!isExporting">
              <button class="m-act" @click="exportWeekXlsx">导出表格</button>
              <button class="m-act m-act-i" @click="exportWeek">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="m21 15-4.5-4.5L7 20"/></svg>
                导出图片
              </button>
            </span>
          </div>
          <div class="m-rtable">
            <div class="m-rthead">
              <span>排名</span><span>成员</span><span>击杀</span><span>死亡</span><span>攻城</span><span>复活丹</span><span>K/D</span>
            </div>
            <div class="m-rtr" v-for="(p, i) in weekList" :key="p.roleId ?? i">
              <span class="m-rtd-no" :class="i < 3 ? 'n' + (i + 1) : ''">{{ i + 1 }}</span>
              <span class="m-rtd-nm">
                <img v-if="p.headImg" :src="p.headImg" class="m-rk-ava" alt="" @error="onImgError" />
                <span v-else class="m-rk-ava m-rk-ava--ph">{{ (p.name || "?").charAt(0) }}</span>
                <span class="m-rk-nm">{{ p.name }}</span>
                <span v-if="isMvpRow(p)" class="m-mvp-tag">MVP</span>
              </span>
              <span class="m-rtd-v is-kill">{{ p.winCnt || 0 }}</span>
              <span class="m-rtd-v">{{ p.loseCnt || 0 }}</span>
              <span class="m-rtd-v is-build">{{ p.buildingCnt || 0 }}</span>
              <span class="m-rtd-v is-revive">{{ reviveCntOf(p) }}</span>
              <span class="m-rtd-v is-kd">{{ kd(p) }}</span>
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="!loadingWeek" class="m-card"><p class="m-hint" style="text-align: center; padding: 18px 0">{{ weekFetched ? "该日期无战绩数据，可换日期再查" : "暂无数据，点「查询」拉取" }}</p></div>
    </template>

    <!-- ============ 月战绩 ============ -->
    <template v-else-if="sub === 'month'">
      <div class="m-card">
        <div class="m-card-h">
          <span class="m-t">本月盐场战绩</span>
          <span class="m-acts" v-if="!isExporting">
            <button class="m-link" :disabled="loadingMonth" @click="fetchMonth">
              {{ loadingMonth ? "查询中…" : "查询" }}
            </button>
            <button class="m-act m-act-i" :disabled="!monthRecords.length" @click="exportMonth">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="m21 15-4.5-4.5L7 20"/></svg>
              导出图片
            </button>
          </span>
        </div>
        <p class="m-hint" style="margin: 0">聚合本月各战斗日（周六 + 第四周周日）数据</p>
      </div>
      <div v-if="monthRecords.length" ref="exportMonthDom" style="display: flex; flex-direction: column; gap: 12px">
        <div class="m-card">
          <!-- 战报头 + 总览数字带（与周报同版式，只是口径是整月聚合） -->
          <div class="m-rhead">
            <span class="m-rhead-main">
              <span class="m-rhead-t">{{ clubDisplayName }} 盐场月报</span>
              <span class="m-rhead-d">{{ monthLabel }} · 共 {{ monthBattleDates.length }} 个战斗日</span>
            </span>
            <span class="m-rpill">参战 {{ monthStats.totalMembers }} 人</span>
          </div>
          <div class="m-rstat">
            <div class="m-rstat-c"><span class="m-rstat-k">总人数</span><span class="m-rstat-v">{{ monthStats.totalMembers }}</span></div>
            <div class="m-rstat-c"><span class="m-rstat-k">总击杀</span><span class="m-rstat-v is-kill">{{ monthStats.totalKills }}</span></div>
            <div class="m-rstat-c"><span class="m-rstat-k">总死亡</span><span class="m-rstat-v">{{ monthStats.totalDeaths }}</span></div>
            <div class="m-rstat-c"><span class="m-rstat-k">总攻城</span><span class="m-rstat-v is-build">{{ monthStats.totalBuilding }}</span></div>
            <div class="m-rstat-c"><span class="m-rstat-k">总复活丹</span><span class="m-rstat-v is-revive">{{ monthStats.totalResurrection }}</span></div>
            <div class="m-rstat-c"><span class="m-rstat-k">总 K/D</span><span class="m-rstat-v is-kd">{{ monthStatsTotalKD }}</span></div>
          </div>
        </div>
        <!-- 榜单：2 列 × 3 行六榜（与周报同版式） -->
        <div class="m-card">
          <div class="m-card-h"><span class="m-t">榜单</span><span class="m-more">各榜前 3</span></div>
          <div class="m-rk-grid">
            <div class="m-rk-card" v-for="b in monthRankBoards" :key="b.t">
              <div class="m-rk-t">{{ b.t }}</div>
              <div class="m-rk-row" v-for="(p, ti) in b.rows" :key="ti">
                <span class="m-rk-no" :class="'n' + (ti + 1)">{{ ti + 1 }}</span>
                <img v-if="p.headImg" :src="p.headImg" class="m-rk-ava" alt="" @error="onImgError" />
                <span v-else class="m-rk-ava m-rk-ava--ph">{{ (p.name || "?").charAt(0) }}</span>
                <span class="m-rk-nm">{{ p.name }}</span>
                <span class="m-rk-v">{{ b.val(p) }}</span>
              </div>
            </div>
          </div>
        </div>
        <!-- 成员明细：表格版 + 行内展开逐日（点一行展开，再点收起） -->
        <div class="m-card">
          <div class="m-card-h">
            <span class="m-t">成员明细</span>
            <span class="m-acts" v-if="!isExporting">
              <button class="m-act" :disabled="!monthSortedMembers.length" @click="exportMonthXlsx">导出表格</button>
              <button class="m-act m-act-i" @click="exportMonth">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="m21 15-4.5-4.5L7 20"/></svg>
                导出图片
              </button>
            </span>
          </div>
          <div class="m-rtable">
            <div class="m-rthead">
              <span>排名</span><span>成员</span><span>击杀</span><span>死亡</span><span>攻城</span><span>复活丹</span><span>K/D</span>
            </div>
            <template v-for="(m, i) in monthSortedMembers" :key="m.roleId ?? i">
              <div
                class="m-rtr"
                :class="{ 'is-tap': monthBattleDates.length }"
                @click="monthBattleDates.length && toggleMonthExpand(m.roleId)"
              >
                <span class="m-rtd-no" :class="i < 3 ? 'n' + (i + 1) : ''">{{ i + 1 }}</span>
                <span class="m-rtd-nm">
                  <img v-if="m.headImg" :src="m.headImg" class="m-rk-ava" alt="" @error="onImgError" />
                  <span v-else class="m-rk-ava m-rk-ava--ph">{{ (m.name || "?").charAt(0) }}</span>
                  <span class="m-rk-nm">{{ m.name }}</span>
                  <span v-if="isMonthMvpRow(m)" class="m-mvp-tag">MVP</span>
                </span>
                <span class="m-rtd-v is-kill">{{ m.totalWinCnt || 0 }}</span>
                <span class="m-rtd-v">{{ m.totalLoseCnt || 0 }}</span>
                <span class="m-rtd-v is-build">{{ m.totalBuildingCnt || 0 }}</span>
                <span class="m-rtd-v is-revive">{{ m.totalResurrection || 0 }}</span>
                <span class="m-rtd-v is-kd">{{ memberKd(m) }}</span>
              </div>
              <div v-if="monthExpanded === m.roleId" class="m-rsub">
                <div class="m-rsub-row" v-for="d in monthBattleDates" :key="d">
                  <span class="m-rsub-d">{{ formatShortDate(d) }}</span>
                  <span class="m-rsub-x">
                    击杀 {{ getMemberDailyStat(m, d, "winCnt") }} · 死亡 {{ getMemberDailyStat(m, d, "loseCnt") }} · 攻城 {{ getMemberDailyStat(m, d, "buildingCnt") }} · 复活丹 {{ Math.max((getMemberDailyStat(m, d, "loseCnt") || 0) - 6, 0) }}
                  </span>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
      <div v-else-if="!loadingMonth" class="m-card"><p class="m-hint" style="text-align: center; padding: 18px 0">{{ monthFetched ? "该区间无战绩数据，可换日期再查" : "暂无数据，点「查询」拉取" }}</p></div>
    </template>

    <!-- ============ 盐场地图 ============ -->
    <template v-else-if="sub === 'map'">
      <div v-if="!isAccessible" class="m-card">
        <div class="m-empty">
          <div class="m-logo">⏰</div>
          <h3>盐场暂未开放</h3>
          <p>开放时间：每月前四周的周六 19:55 - 21:00；每月第四周的周日 19:55 - 21:30。其他时间可查看历史战绩。</p>
        </div>
      </div>
      <div v-else ref="exportMapDom" style="display: flex; flex-direction: column; gap: 12px">
        <div class="m-card">
          <div class="m-card-h">
            <span class="m-t">盐场地图</span>
            <span class="m-more" :style="{ color: warConnected ? 'var(--m-green)' : 'var(--m-text3)' }">
              {{ warConnected ? (warJoined ? "已进入战场" : "已连接") : "未连接" }}
            </span>
          </div>
          <div class="m-kv"><span class="m-k">战场 ID</span><span class="m-v">{{ battlefieldId || "-" }}</span></div>
          <div class="m-kv"><span class="m-k">最后更新</span><span class="m-v">{{ lastUpdateTime || "-" }}</span></div>
          <div v-if="!isExporting" style="display: flex; gap: 8px; margin-top: 12px">
            <button class="m-btn m-btn-p" style="flex: 1" :disabled="warConnecting" @click="warConnect">{{ warConnecting ? "连接中…" : "连接战场" }}</button>
            <button class="m-btn m-btn-g" style="flex: 1" :disabled="!warConnected && !warJoined" @click="warStore.refreshData()">刷新</button>
            <button class="m-btn m-btn-g" style="flex: 1" @click="warDisconnect">断开</button>
          </div>
        </div>
        <div class="m-card">
          <div class="m-card-h">
            <span class="m-t">战场地图</span>
            <span class="m-acts" v-if="!isExporting">
              <button class="m-act" @click="zoomMapBy(-0.25)">－</button>
              <span class="m-more">{{ Math.round(mapZoom * 100) }}%</span>
              <button class="m-act" @click="zoomMapBy(0.25)">＋</button>
              <button class="m-act" @click="resetMapView">复位</button>
              <button class="m-act m-act-i" @click="exportMap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="m21 15-4.5-4.5L7 20"/></svg>
                导出图片
              </button>
            </span>
          </div>
          <div class="m-map-view" ref="mapViewportDom">
            <div class="m-map-stage" ref="mapStageDom">
              <canvas ref="legionWarMapDom"></canvas>
            </div>
          </div>
          <p class="m-hint" style="margin-top: 8px">单指拖动平移 · 双指捏合缩放 · 双击 2x/1x 切换 · 滚轮缩放</p>
        </div>
        <div class="m-card">
          <div class="m-card-h">
            <span class="m-t">战场俱乐部（{{ warLegionList.length }}）</span>
            <span class="m-more">红数 > 战力 > ID</span>
          </div>
          <template v-for="(group, gi) in mapAllianceGroups" :key="gi">
            <div class="m-grprow">
              <span class="m-grp-t">{{ gi }}（{{ group.length }}家）</span>
            </div>
            <div class="m-trow" v-for="lg in group" :key="lg.id">
              <span class="m-ib" :style="{ background: isCurrentClub(lg) ? 'var(--m-green)' : 'var(--m-band)' }">
                <span :style="{ color: isCurrentClub(lg) ? 'var(--m-card)' : 'var(--m-primary)', fontWeight: 500 }">{{ (lg.name || "?").charAt(0) }}</span>
              </span>
              <span class="m-body">
                <span class="m-nm">{{ lg.name }} <span v-if="isCurrentClub(lg)" class="m-tag done">本俱乐部</span></span>
                <span class="m-ds">红 {{ lg.redCount || 0 }} · 积分 {{ lg.score || 0 }} · 击杀 {{ lg.killCnt || 0 }} · 战力 {{ fmtPower(lg.power) }}</span>
              </span>
            </div>
          </template>
        </div>
      </div>
    </template>

    <!-- ============ 盐场战况 ============ -->
    <template v-else-if="sub === 'stat'">
      <div v-if="!isAccessible" class="m-card">
        <div class="m-empty">
          <div class="m-logo">⏰</div>
          <h3>盐场暂未开放</h3>
          <p>开放时间：每月前四周的周六 19:55 - 21:00；每月第四周的周日 19:55 - 21:30。其他时间可查看历史战绩。</p>
        </div>
      </div>
      <div v-if="isAccessible" class="m-card">
        <div class="m-card-h">
          <span class="m-t">盐场战况</span>
          <span class="m-acts" v-if="!isExporting">
            <button class="m-act" :disabled="!warConnected && !warJoined" @click="warStore.refreshData()">刷新数据</button>
            <button class="m-act" :disabled="warConnecting" @click="toggleBattlefieldEntry">{{ warJoined ? "已进入战场" : "进入战场" }}</button>
          </span>
        </div>
        <div class="m-kv"><span class="m-k">连接状态</span><span class="m-v" :style="{ color: warConnected ? 'var(--m-green)' : 'var(--m-text3)' }">{{ warConnected ? (warJoined ? "已进入战场" : "已连接") : "未连接" }}</span></div>
        <div class="m-kv"><span class="m-k">战场数据</span><span class="m-v">{{ battlefieldId ? "已成功获取战场数据" : "未获取到战场数据" }}</span></div>
        <div class="m-kv"><span class="m-k">更新时间</span><span class="m-v">{{ lastUpdateTime || "等待数据..." }}</span></div>
      </div>
      <div v-if="isAccessible" class="m-card" ref="exportStatDom">
        <div class="m-card-h">
          <span class="m-t">战况数据</span>
          <span class="m-acts" v-if="!isExporting">
            <button class="m-act" :disabled="!validData" @click="exportStatXlsx">导出表格</button>
            <button class="m-act m-act-i" :disabled="!legionData.length && !individualData.length && !allIndividualData.length" @click="exportStat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="m21 15-4.5-4.5L7 20"/></svg>
              导出图片
            </button>
          </span>
        </div>
        <div class="m-seg" style="margin-bottom: 12px">
          <button :class="{ on: statView === 'legion' }" @click="statView = 'legion'">俱乐部</button>
          <button :class="{ on: statView === 'individual' }" @click="statView = 'individual'">本队成员</button>
          <button :class="{ on: statView === 'all_individual' }" @click="statView = 'all_individual'">全部战况</button>
        </div>
        <!-- 战况卡片（照抄 LegionWarStatistics 移动端卡片视图：4 列网格） -->
        <template v-if="statView === 'legion'">
          <div class="m-scards">
            <div class="m-scard" v-for="(lg, i) in legionData" :key="lg.key ?? i">
              <div class="m-scard-head">
                <span class="m-scard-rank">#{{ i + 1 }}</span>
                <span class="m-scard-name">{{ lg.name }}</span>
                <span v-if="isCurrentClub(lg)" class="m-scard-badge" style="margin-left: auto">本俱乐部</span>
              </div>
              <div class="m-scard-grid m-scard-grid--4">
                <div class="m-scard-cell">
                  <span class="m-scard-label">积分</span>
                  <span class="m-scard-val is-score">{{ lg.score || 0 }}</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">击杀数</span>
                  <span class="m-scard-val is-kill">{{ lg.killCnt || 0 }}</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">免费复活</span>
                  <span class="m-scard-val">{{ lg.reviveCount || 0 }}/150</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">花费总丹</span>
                  <span class="m-scard-val">{{ lg.danCount || 0 }}</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">四圣</span>
                  <span class="m-scard-val">{{ lg.blessingCount || 0 }}个共{{ lg.blessingScore || 0 }}分</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">人数</span>
                  <span class="m-scard-val">{{ lg.participantsCount || 0 }}/30</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">红数</span>
                  <span class="m-scard-val is-red">{{ lg.redCount || 0 }}</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">战力</span>
                  <span class="m-scard-val is-power">{{ fmtPower(lg.power) }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
        <template v-else-if="statView === 'individual'">
          <div class="m-scards">
            <div class="m-scard" v-for="(p, i) in individualData" :key="p.key ?? i">
              <div class="m-scard-head">
                <span class="m-scard-rank">#{{ i + 1 }}</span>
                <span class="m-scard-name">{{ p.name }}</span>
              </div>
              <div class="m-scard-grid m-scard-grid--4">
                <div class="m-scard-cell">
                  <span class="m-scard-label">积分</span>
                  <span class="m-scard-val is-score">{{ p.score || 0 }}</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">击杀数</span>
                  <span class="m-scard-val is-kill">{{ p.kill || 0 }}</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">死亡次数</span>
                  <span class="m-scard-val is-death">{{ p.die || 0 }}</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">K/D</span>
                  <span class="m-scard-val">{{ p.kd }}</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">已复活次数</span>
                  <span class="m-scard-val">{{ p.revive || 0 }}/5</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">复活丹</span>
                  <span class="m-scard-val is-revive">{{ p.dan || 0 }}</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">刨地</span>
                  <span class="m-scard-val">{{ p.digGround || 0 }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="m-scards">
            <div class="m-scard" v-for="(p, i) in allIndividualData" :key="p.key ?? i">
              <div class="m-scard-head">
                <span class="m-scard-rank">#{{ i + 1 }}</span>
                <span class="m-scard-name">{{ p.name }}</span>
                <span class="m-scard-server" style="margin-left: auto">{{ p.clubName }}</span>
              </div>
              <div class="m-scard-grid m-scard-grid--4">
                <div class="m-scard-cell">
                  <span class="m-scard-label">积分</span>
                  <span class="m-scard-val is-score">{{ p.score || 0 }}</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">击杀数</span>
                  <span class="m-scard-val is-kill">{{ p.kill || 0 }}</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">死亡次数</span>
                  <span class="m-scard-val is-death">{{ p.die || 0 }}</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">K/D</span>
                  <span class="m-scard-val">{{ p.kd }}</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">已复活次数</span>
                  <span class="m-scard-val">{{ p.revive || 0 }}/5</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">复活丹</span>
                  <span class="m-scard-val is-revive">{{ p.dan || 0 }}</span>
                </div>
                <div class="m-scard-cell">
                  <span class="m-scard-label">刨地</span>
                  <span class="m-scard-val">{{ p.digGround || 0 }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
        <p v-if="!legionData.length && !individualData.length && !allIndividualData.length" class="m-hint" style="text-align: center; padding: 12px 0">暂无数据，请先连接战场</p>
      </div>
    </template>

    <!-- ============ 玩家信息 / 英雄详情（公共组件，与俱乐部成员共用） ============ -->
    <PlayerSheet
      v-model="saltPlayerSheet"
      :loading="queryLoading"
      :player="playerInfo"
      @open-hero="openHero"
    >
      <!-- 切磋整块（入口 + 进度 + 结果）都在最上面：打开车头信息即可发起，
           结果显示在「战力/服务器」信息块之上，不用滑到武将列表下面去找 -->
      <template #mid>
        <DuelBlock :player="playerInfo" />
      </template>
    </PlayerSheet>
    <HeroSheet v-model="heroSheet" :hero="currentHero" />

    <!-- ============ 联盟改派抽屉（编辑模式，照抄 V2 NSelect allianceOptions） ============ -->
    <div class="m-mask" :class="{ on: allianceSheetFor !== null }" @click="allianceSheetFor = null"></div>
    <div class="m-sheet" :class="{ on: allianceSheetFor !== null }">
      <div class="m-grab"></div>
      <h4>改派联盟</h4>
      <div class="m-sh-sub">{{ allianceSheetName }}</div>
      <div class="m-rlist">
        <button
          v-for="o in allianceOptions"
          :key="o.value"
          class="m-ritem"
          :class="{ on: manualAlliances[allianceSheetFor] === o.value }"
          @click="pickAlliance(o.value)"
        >
          {{ o.label }}
        </button>
      </div>
    </div>

    <!-- 日期选择：与蟠桃园同一个 components/DateCalendarSheet.vue（盐场只在周六/周日开放，未来日期禁用） -->
    <DateCalendarSheet
      v-model:show="matchCalOpen"
      :date="queryDate"
      :weekdays="[0, 6]"
      disable-future
      title="选择盐场匹配日期"
      @select="onPickMatchDate"
    />
    <DateCalendarSheet
      v-model:show="weekCalOpen"
      :date="weekDate"
      :weekdays="[0, 6]"
      disable-future
      title="选择战绩日期"
      @select="onPickWeekDate"
    />
  </div>
</template>

<script setup>
/* ============================================================
 * 盐场面板（移动端）
 * 数据逻辑照抄：
 *   · ClubWarrankV2.vue        盐场匹配（实时/历史两段链 + 联盟分组）
 *   · ClubBattleRecords.vue    周战绩 legionwar_getdetails
 *   · ClubMonthBattleRecords.vue 月战绩（当月周六 + 第四周周日并行）
 *   · LegionWarMap/Statistics  地图/战况（legionWarStore + validData）
 * 仅展示形式改为移动端。
 * ============================================================ */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import { storeToRefs } from "pinia";
import * as XLSX from "xlsx";
import { useTokenStore } from "@/stores/tokenStore";
import { useLegionWarStore } from "@/stores/legionWarStore";
import { getLastSaturday, formatTimestamp1, isLegionWarAccessible } from "@/utils/clubBattleUtils";
import { formatBattleRecordsForExport } from "@/utils/clubBattleUtils";
import { gettoday, allianceincludes, formatWarrankRecordsForExport } from "@/utils/clubWarrankUtils";
import { getLineupType, LINEUP_RULES } from "@/utils/HeroList";
import PlayerSheet from "../components/PlayerSheet.vue";
import HeroSheet from "../components/HeroSheet.vue";
import DuelBlock from "../components/DuelBlock.vue";
import DateCalendarSheet from "../components/DateCalendarSheet.vue";
import { usePlayerInfo } from "../components/usePlayerInfo";
import { getHeroInfo } from "../components/heroInfo";
import { formatPower } from "@/utils/legionWar";
import { HexGraph, roadPointList } from "@/utils/legionWar";
import { exportDomAsImage } from "@/mobile/utils/exportImage";

const message = useMessage();
const tokenStore = useTokenStore();
const warStore = useLegionWarStore();
const { selectedTokenId } = storeToRefs(tokenStore);
const {
  isConnected: warConnected,
  connecting: warConnecting,
  battlefieldId,
  lastUpdateTime,
  validData,
  legionDetails,
  isJoined: warJoined,
} = storeToRefs(warStore);

/* ---------- 子分段 ---------- */
const subs = [
  { key: "match", label: "匹配" },
  { key: "week", label: "周战绩" },
  { key: "month", label: "月战绩" },
  { key: "map", label: "地图" },
  { key: "stat", label: "战况" },
];
const sub = ref("match");

/* ============================================================
 * 一、盐场匹配（照抄 ClubWarrankV2.fetchBattleRecords1）
 * ============================================================ */
const loading1 = ref(false);
const battleRecords1 = ref(null);
const activeAlliance = ref("all");
const queryDate = ref(formatTimestamp1(getLastSaturday()));
/* 盐场匹配的日历抽屉（与蟠桃园同一个 DateCalendarSheet） */
const matchCalOpen = ref(false);
const currentClubInfo = ref(null);
const currentLegionInfo = computed(() => currentClubInfo.value?.info || null);


/* 日历里周日/周六以外和未来日期都是灰的，这里只负责落值和重新查询 */
const onPickMatchDate = (value) => {
  queryDate.value = value;
  clearSaltTableState();
  fetchMatch();
};

const fetchCurrentClubInfo = async (tokenId = selectedTokenId.value) => {
  if (!tokenId) return null;
  const wsStatus = tokenStore.getWebSocketStatus(tokenId);
  if (wsStatus !== "connected") return null;
  try {
    const result = await tokenStore.sendMessageWithPromise(
      tokenId,
      "legion_getinfo",
      {},
      10000,
    );
    if (selectedTokenId.value === tokenId && result) {
      currentClubInfo.value = result;
    }
    return result;
  } catch (error) {
    if (selectedTokenId.value === tokenId) {
      console.error("查询俱乐部信息失败:", error);
    }
    return null;
  }
};

const isCurrentClub = (row) => {
  if (!row) return false;
  const clubInfo = currentLegionInfo.value;
  if (!clubInfo) return false;
  const currentId = clubInfo.id ?? clubInfo.legionId;
  const rowId = row.id ?? row.legionId;
  if (currentId != null && rowId != null && String(currentId) === String(rowId)) {
    return true;
  }
  return Boolean(clubInfo.name && row.name && clubInfo.name === row.name);
};

/** 单个俱乐部的详情聚合（照抄 ClubWarrankV2 detailPromises） */
const fetchClubDetail = async (tokenId, club) => {
  try {
    const detail = await tokenStore.sendMessageWithPromise(
      tokenId,
      "legion_getinfobyid",
      { legionId: club.id },
      5000,
    );
    if (!detail) {
      return {
        ...club,
        redQuench: 0,
        power: 0,
        announcement: "未知",
        redno: 0,
        redno1: "0红",
        redno2: "0红",
        redno3: "0红",
        hb1: 0,
        hb2: 0,
        hb3: 0,
        topHeroes: [],
        level: 30,
      };
    }
    const topHeroes = [];
    for (const [roleId, memberData] of Object.entries(
      detail?.legionData?.members || {},
    )) {
      const tempRoleInfo = await tokenStore.sendMessageWithPromise(
        tokenId,
        "rank_getroleinfo",
        {
          bottleType: 0,
          includeBottleTeam: false,
          isSearch: false,
          roleId: roleId,
        },
        5000,
      );
      // 四圣数统计（照抄 V2：heroes 的 hB.active 有值即计数）
      let holyBeast = 0;
      for (const [heroId, heroData] of Object.entries(
        tempRoleInfo?.roleInfo?.heroes || {},
      )) {
        if (heroData.hB?.active !== undefined) {
          holyBeast++;
        }
      }
      topHeroes.push({
        id: roleId,
        name: memberData.name || memberData.custom?.name || "未知",
        headImg: memberData.headImg || memberData.custom?.headImg || "",
        power: tempRoleInfo?.roleInfo?.power || 0,
        redQuench: memberData.custom?.red_quench_cnt || 0,
        holyBeast: holyBeast,
        lineupType: getLineupType(
          getHeroInfo(tempRoleInfo?.roleInfo?.heroes || {}).heroList || [],
        ),
      });
    }
    // 按红淬数量降序排序，取前 3（照抄 V2）
    topHeroes.sort((a, b) => b.redQuench - a.redQuench);
    const top3Heroes = topHeroes.slice(0, 3);

    // 提取红淬数量数组 / 圣物数量数组（照抄 V2：供导出与车头展示）
    const redQuenchCounts = top3Heroes.map((hero) => hero.redQuench + "红");
    const HolyBeastNum = top3Heroes.map((hero) => hero.holyBeast);

    return {
      ...club,
      redQuench: detail?.legionData?.quenchNum || 0,
      power: detail?.legionData?.power || 0,
      announcement: detail?.legionData?.announcement || 0,
      redno: redQuenchCounts || 0,
      redno1: redQuenchCounts[0] || "0红",
      redno2: redQuenchCounts[1] || "0红",
      redno3: redQuenchCounts[2] || "0红",
      hb1: HolyBeastNum[0] || 0,
      hb2: HolyBeastNum[1] || 0,
      hb3: HolyBeastNum[2] || 0,
      topHeroes: top3Heroes,
      level: 30,
    };
  } catch (error) {
    console.error(`查询俱乐部${club.id}详情失败:`, error);
    return {
      ...club,
      redQuench: 0,
      power: 0,
      announcement: "未知",
      topHeroes: [],
      level: 30,
    };
  }
};

/** 联盟分组 + 最大联盟优先（照抄 ClubWarrankV2） */
const buildSortedList = (clubs) => {
  const clubsWithAlliance = clubs.map((club) => ({
    ...club,
    alliance: allianceincludes(club.announcement),
  }));
  const allianceStats = {};
  clubsWithAlliance.forEach((club) => {
    allianceStats[club.alliance] = (allianceStats[club.alliance] || 0) + 1;
  });
  let maxAlliance = "";
  let maxCount = 0;
  for (const [alliance, count] of Object.entries(allianceStats)) {
    if (count > maxCount) {
      maxCount = count;
      maxAlliance = alliance;
    }
  }
  const allianceGroups = {};
  clubsWithAlliance.forEach((club) => {
    if (!allianceGroups[club.alliance]) allianceGroups[club.alliance] = [];
    allianceGroups[club.alliance].push(club);
  });
  for (const alliance in allianceGroups) {
    allianceGroups[alliance].sort((a, b) => (b.redQuench || 0) - (a.redQuench || 0));
  }
  const sorted = [];
  if (maxAlliance && allianceGroups[maxAlliance]) {
    sorted.push(...allianceGroups[maxAlliance]);
    delete allianceGroups[maxAlliance];
  }
  for (const alliance of Object.keys(allianceGroups).sort()) {
    sorted.push(...allianceGroups[alliance]);
  }
  return sorted;
};

const fetchMatch = async (requestTokenId = selectedTokenId.value) => {
  if (!requestTokenId) {
    message.warning("请先选择游戏角色");
    return;
  }
  const tokenId = requestTokenId;
  const wsStatus = tokenStore.getWebSocketStatus(tokenId);
  if (wsStatus !== "connected") {
    message.error("WebSocket未连接，无法查询盐场匹配");
    return;
  }

  loading1.value = true;
  saltFetchStartTime.value = new Date();
  await fetchCurrentClubInfo(tokenId);
  if (selectedTokenId.value !== tokenId) {
    loading1.value = false;
    return;
  }

  try {
    let rankList = [];
    if (gettoday() === queryDate.value && new Date().getHours() < 21) {
      // 实时匹配：getbattlefield → getopponent → 逐俱乐部详情
      scoreShow.value = 1;
      const getbattlefield = await tokenStore.sendMessageWithPromise(
        tokenId,
        "legion_getbattlefield",
        {},
        10000,
      );
      if (!getbattlefield.info) {
        battleRecords1.value = null;
        message.warning(getbattlefield?.message || "未查询到盐场匹配数据");
        return;
      }
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        "legion_getopponent",
        {
          phase: getbattlefield.info.phase,
          battlefieldId: getbattlefield.info.battlefieldId,
        },
        10000,
      );
      if (!result?.opponentList) {
        battleRecords1.value = null;
        message.warning(result?.message || "未查询到盐场匹配数据");
        return;
      }
      rankList = await Promise.all(
        result.opponentList.map((club) => fetchClubDetail(tokenId, club)),
      );
    } else {
      // 历史日期：legion_getwarrank（无积分数据，隐藏积分排序）
      scoreShow.value = 0;
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        "legion_getwarrank",
        { date: queryDate.value },
        10000,
      );
      if (!result?.legionRankList) {
        battleRecords1.value = null;
        message.warning(result?.message || "未查询到盐场匹配数据");
        return;
      }
      result.legionRankList.forEach((club) => {
        club.sRScore = -1;
      });
      rankList = await Promise.all(
        result.legionRankList.map((club) => fetchClubDetail(tokenId, club)),
      );
    }
    if (selectedTokenId.value !== tokenId) return;
    battleRecords1.value = { legionRankList: buildSortedList(rankList) };
    message.success("盐场匹配数据加载成功");
  } catch (error) {
    if (selectedTokenId.value !== tokenId) return;
    console.error("查询失败:", error);
    message.error(`查询失败: ${error.message}`);
    battleRecords1.value = null;
  } finally {
    if (selectedTokenId.value === tokenId) {
      loading1.value = false;
    }
  }
};

const matchList = computed(() => battleRecords1.value?.legionRankList || []);

/* ---------- 公告区 / 取数时间（照抄 V2 saltAnnouncementText / saltFetchTimeText） ---------- */
const saltFetchStartTime = ref(null);
const formatDateTime = (date) => {
  const pad = (value) => String(value).padStart(2, "0");
  return (
    [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
    ].join("-") +
    " " +
    [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join(":")
  );
};
const getSaltFetchTimeText = () =>
  `数据获取时间：${formatDateTime(saltFetchStartTime.value || new Date())}`;
const saltAverageRedQuench = computed(() => {
  const list = matchList.value;
  const total = list.reduce((sum, member) => sum + Number(member.redQuench || 0), 0);
  return Math.round(total / 20);
});
const saltAnnouncementText = computed(() => {
  const dateText = formatTimestamp1(queryDate.value).replace(/\//g, "-");
  return `${dateText} 盐场分组 平均红淬：${saltAverageRedQuench.value}红`;
});

/* ---------- 红淬排名映射（照抄 V2 redQuenchRankings：按红淬降序的真实名次） ---------- */
const redQuenchRankings = computed(() => {
  if (!battleRecords1.value?.legionRankList) return {};
  const sortedByRedQuench = [...battleRecords1.value.legionRankList].sort(
    (a, b) => (b.redQuench || 0) - (a.redQuench || 0),
  );
  const rankMap = {};
  sortedByRedQuench.forEach((club, index) => {
    rankMap[club.id] = index + 1;
  });
  return rankMap;
});

/* ---------- 联盟 tab（照抄 V2：固定 6 项 + 全部，带计数） ---------- */
const allianceOptions = [
  { label: "大联盟", value: "大联盟" },
  { label: "梦盟", value: "梦盟" },
  { label: "正义联盟", value: "正义联盟" },
  { label: "龙盟", value: "龙盟" },
  { label: "曦盟", value: "曦盟" },
  { label: "未知联盟", value: "未知联盟" },
];
const getActiveAllianceCount = (alliance) =>
  matchList.value.filter((c) => getMemberAlliance(c) === alliance).length;
const allianceTabs = computed(() => [
  { label: "全部", value: "all", count: matchList.value.length },
  ...allianceOptions.map((o) => ({ ...o, count: getActiveAllianceCount(o.value) })),
]);

const filteredList = computed(() => {
  const list = sortedMatchList.value;
  if (activeAlliance.value === "all") return list;
  return list.filter((c) => getMemberAlliance(c) === activeAlliance.value);
});

/* ---------- 分组行（照抄 V2 groupedSaltTableData：联盟组头 + 组内平均红淬） ---------- */
const groupedMatchRows = computed(() => {
  const list = filteredList.value;
  if (!list.length) return [];
  const allianceOrder = allianceOptions.map((o) => o.value);
  const groups = new Map();
  list.forEach((member) => {
    const alliance = getMemberAlliance(member) || "未知联盟";
    if (!groups.has(alliance)) groups.set(alliance, []);
    groups.get(alliance).push(member);
  });
  const orderedAlliances = [
    ...allianceOrder.filter((a) => groups.has(a)),
    ...Array.from(groups.keys()).filter((a) => !allianceOrder.includes(a)),
  ];
  return orderedAlliances.flatMap((alliance) => {
    const members = groups.get(alliance);
    const totalRedQuench = members.reduce(
      (sum, member) => sum + (Number(member.redQuench) || 0),
      0,
    );
    const avgRedQuench = members.length ? Math.round(totalRedQuench / members.length) : 0;
    return [
      {
        id: `group-${alliance}`,
        __isGroupHeader: true,
        alliance,
        count: members.length,
        avgRedQuench,
      },
      ...members,
    ];
  });
});

/* ============================================================
 * 一补、排名调整编辑模式（照抄 V2 toggleEditMode / handleRankBlur / hcSort / scoreSort）
 * ============================================================ */
const currentSortType = ref("manual"); // manual-手动/默认，redQuench-红淬，score-积分
const sortLabel = computed(() => ({
  manual: "按名次顺序",
  redQuench: "按红淬降序",
  score: "按积分降序",
}[currentSortType.value] || "按名次顺序"));
const isEditMode = ref(false);
const manualRankings = ref({});
const manualAlliances = ref({});
const editingSortOrder = ref([]); // 编辑模式下的固定排序顺序
/* 切换日期时清空手动名次/改派/编辑态（照抄旧版 clearSaltTableState） */
const clearSaltTableState = () => {
  battleRecords1.value = null;
  activeAlliance.value = "all";
  currentSortType.value = "manual";
  isEditMode.value = false;
  manualRankings.value = {};
  manualAlliances.value = {};
  editingSortOrder.value = [];
};
const tempOldRanks = ref({}); // 暂存编辑前的排名
const scoreShow = ref(1); // 实时匹配有积分数据，历史战绩无（照抄 V2 ScoreShow）

const getMemberAlliance = (member) => {
  if (manualAlliances.value[member.id] !== undefined) {
    return manualAlliances.value[member.id];
  }
  return allianceincludes(member.announcement) || "未知联盟";
};

const getMemberRank = (member) => {
  if (manualRankings.value[member.id] !== undefined) {
    return manualRankings.value[member.id];
  }
  return redQuenchRankings.value[member.id];
};

const getMemberName = (id) => {
  const member = battleRecords1.value?.legionRankList.find(
    (m) => String(m.id) === String(id),
  );
  return member ? member.name : "未知俱乐部";
};

const toggleEditMode = () => {
  if (!isEditMode.value) {
    // 进入编辑模式
    if (battleRecords1.value?.legionRankList) {
      // 1. 初始化手动数据（如果未初始化）
      battleRecords1.value.legionRankList.forEach((member) => {
        if (manualRankings.value[member.id] === undefined) {
          manualRankings.value[member.id] = redQuenchRankings.value[member.id];
        }
        if (manualAlliances.value[member.id] === undefined) {
          manualAlliances.value[member.id] =
            allianceincludes(member.announcement) || "未知联盟";
        }
      });
      // 2. 锁定当前排序顺序（按当前规则排序后保存 ID 顺序）
      const currentList = [...battleRecords1.value.legionRankList].sort(
        (a, b) => {
          if (currentSortType.value === "manual") {
            return getMemberRank(a) - getMemberRank(b);
          } else if (currentSortType.value === "redQuench") {
            return (b.redQuench || 0) - (a.redQuench || 0);
          } else if (currentSortType.value === "score") {
            return (b.sRScore || 0) - (a.sRScore || 0);
          }
          return 0;
        },
      );
      editingSortOrder.value = currentList.map((m) => m.id);
    }
  } else {
    // 退出编辑模式：保存提示（照抄 V2）
    message.success("已保存调整");
  }
  isEditMode.value = !isEditMode.value;
};

const handleRankFocus = (member) => {
  tempOldRanks.value[member.id] = manualRankings.value[member.id];
};

const handleRankBlur = (member) => {
  const newRank = Number(manualRankings.value[member.id]);
  const oldRank = tempOldRanks.value[member.id];
  delete tempOldRanks.value[member.id];
  // 验证有效性，无效则恢复
  if (!newRank || newRank < 1 || newRank > 20) {
    manualRankings.value[member.id] = oldRank;
    message.warning("排名必须在 1-20 之间");
    return;
  }
  if (newRank === oldRank) return;
  // 查找占用新排名的俱乐部，交换排名
  const targetMemberId = Object.keys(manualRankings.value).find(
    (id) =>
      String(id) !== String(member.id) && manualRankings.value[id] === newRank,
  );
  if (targetMemberId) {
    manualRankings.value[targetMemberId] = oldRank;
    const targetName = getMemberName(targetMemberId);
    message.success(`排名已交换：${member.name} 与 ${targetName}`);
  }
  // 只要手动调整了排名，就切换回 manual 排序模式
  currentSortType.value = "manual";
};

const hcSort = () => {
  if (!battleRecords1.value?.legionRankList) return;
  const sortedList = [...battleRecords1.value.legionRankList].sort(
    (a, b) => (b.redQuench || 0) - (a.redQuench || 0),
  );
  sortedList.forEach((member, index) => {
    manualRankings.value[member.id] = index + 1;
  });
  currentSortType.value = "manual";
  if (isEditMode.value) {
    editingSortOrder.value = sortedList.map((m) => m.id);
  }
  message.success("已按红淬数量重置排名");
};

const scoreSort = () => {
  if (!battleRecords1.value?.legionRankList) return;
  const sortedList = [...battleRecords1.value.legionRankList].sort(
    (a, b) => (b.sRScore || 0) - (a.sRScore || 0),
  );
  sortedList.forEach((member, index) => {
    manualRankings.value[member.id] = index + 1;
  });
  currentSortType.value = "manual";
  if (isEditMode.value) {
    editingSortOrder.value = sortedList.map((m) => m.id);
  }
  message.success("已按积分重置排名");
};

/* ---------- 联盟配色类（照抄 GameStatus ⑫ 每联盟一色：solid/dark/tint/line 四变量） ---------- */
const allianceClass = (alliance) => {
  switch (alliance) {
    case "大联盟":
      return "al-large";
    case "梦盟":
      return "al-dream";
    case "正义联盟":
      return "al-justice";
    case "龙盟":
      return "al-dragon";
    case "曦盟":
      return "al-xi";
    case "未知联盟":
      return "al-unknown";
    default:
      return "al-other";
  }
};

/* 阵容标签样式（照抄 V2 getLineupTagStyle：LINEUP_RULES colorProps + 定宽胶囊） */
const lineupTagStyle = (lineupType) => {
  const rule = LINEUP_RULES.find((item) => item.name === lineupType);
  const colorProps = rule?.colorProps || {
    color: "#f5f5f5",
    textColor: "#666",
  };
  return {
    maxWidth: "46px",
    padding: "1px 4px",
    borderRadius: "8px",
    fontSize: "10px",
    fontWeight: "600",
    lineHeight: "14px",
    color: colorProps.textColor,
    background: colorProps.color,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flexShrink: "0",
  };
};

/* ---------- 联盟改派抽屉 ---------- */
const allianceSheetFor = ref(null);
const allianceSheetName = ref("");
const openAlliancePicker = (member) => {
  allianceSheetFor.value = member.id;
  allianceSheetName.value = member.name || "";
};
const pickAlliance = (value) => {
  if (allianceSheetFor.value != null) {
    manualAlliances.value[allianceSheetFor.value] = value;
    message.success("已改派联盟");
  }
  allianceSheetFor.value = null;
};

/* ---------- 匹配列表排序（照抄 V2 filteredLegionList：编辑快照/manual/红淬/积分） ---------- */
const sortedMatchList = computed(() => {
  if (!battleRecords1.value?.legionRankList) return [];
  return [...battleRecords1.value.legionRankList].sort((a, b) => {
    if (isEditMode.value) {
      return editingSortOrder.value.indexOf(a.id) - editingSortOrder.value.indexOf(b.id);
    }
    if (currentSortType.value === "manual") {
      return getMemberRank(a) - getMemberRank(b);
    } else if (currentSortType.value === "redQuench") {
      return (b.redQuench || 0) - (a.redQuench || 0);
    } else if (currentSortType.value === "score") {
      return (b.sRScore || 0) - (a.sRScore || 0);
    }
    return 0;
  });
});

/* ============================================================
 * 二补、对手信息 + 连续切磋（取数走公共 usePlayerInfo，展示走 PlayerSheet / HeroSheet）
 * ============================================================ */
const saltPlayerSheet = ref(false);
const heroSheet = ref(false);
const currentHero = ref(null);
const {
  loading: queryLoading,
  player: playerInfo,
  fetchPlayer,
} = usePlayerInfo();

/* 点武将 → 英雄抽屉 */
const openHero = (hero) => {
  currentHero.value = hero;
  heroSheet.value = true;
};

/* 头像加载失败回退官方图标（照抄旧版 NAvatar fallbackSrc） */
const onImgError = (e) => {
  e.target.src = "/icons/xiaoyugan.png";
};

/* 点车头 → 玩家抽屉（照抄旧版：查询成功后才打开，并防重入） */
const openSaltPlayer = async (hero) => {
  if (!hero?.id) {
    message.error("车头ID不存在，无法查询信息");
    return;
  }
  if (queryLoading.value) return;
  message.info(`正在查询车头信息: ${hero.name}`);
  const fetched = await fetchPlayer(hero.id);
  if (!fetched) return;
  saltPlayerSheet.value = true;
};

/* 连续切磋入口 / 进度 / 结果整块搬到 components/DuelBlock.vue（盐场、蟠桃共用） */

/* ============================================================
 * 二、周战绩（照抄 ClubBattleRecords style1 统计区）
 * ============================================================ */
const loadingWeek = ref(false);
const weekList = ref([]);
/* 是否已查过（区分「还没点查询」和「查了确实没有」） */
const weekFetched = ref(false);
const weekDate = ref(getLastSaturday());
/* 周战绩的日历抽屉（与蟠桃园同一个 DateCalendarSheet） */
const weekCalOpen = ref(false);

/* 日历里周日/周六以外和未来日期都是灰的，这里只负责落值和重新查询 */
const onPickWeekDate = (value) => {
  weekDate.value = value;
  fetchWeek();
};

const fetchWeek = async () => {
  const token = tokenStore.selectedToken;
  if (!token) {
    message.warning("请先选择游戏角色");
    return;
  }
  const tokenId = token.id;
  const wsStatus = tokenStore.getWebSocketStatus(tokenId);
  if (wsStatus !== "connected") {
    message.error("WebSocket未连接，无法查询战绩");
    return;
  }
  loadingWeek.value = true;
  if (!currentClubInfo.value) await fetchCurrentClubInfo(tokenId);
  try {
    const result = await tokenStore.sendMessageWithPromise(
      tokenId,
      "legionwar_getdetails",
      { date: weekDate.value },
      10000,
    );
    if (result && result.roleDetailsList) {
      weekList.value = [...result.roleDetailsList].sort(
        (a, b) => (b.winCnt || 0) - (a.winCnt || 0),
      );
      message.success("战绩加载成功，已按击杀数从高到低排序");
    } else {
      weekList.value = [];
      message.warning("未查询到战绩数据");
    }
  } catch (error) {
    console.error("查询战绩失败:", error);
    message.error("查询战绩失败: " + (error.message || "未知错误"));
    weekList.value = [];
  } finally {
    weekFetched.value = true;
    loadingWeek.value = false;
  }
};

/* ---------- 周战绩统计（照抄 BR totalKills/totalRevives/totalKD + 四个 Top3） ---------- */
const reviveCntOf = (p) => Math.max((p.loseCnt || 0) - 6, 0);
const weekTotalKills = computed(() =>
  weekList.value.reduce((sum, m) => sum + (m.winCnt || 0), 0),
);
const weekTotalDeaths = computed(() =>
  weekList.value.reduce((sum, m) => sum + (m.loseCnt || 0), 0),
);
const weekTotalRevives = computed(() =>
  weekList.value.reduce((sum, m) => sum + reviveCntOf(m), 0),
);
const weekTotalKD = computed(() => {
  const deaths = weekTotalDeaths.value;
  if (deaths === 0) return 0;
  return (weekTotalKills.value / deaths).toFixed(2);
});
const weekKillRank = computed(() =>
  [...weekList.value].sort((a, b) => (b.winCnt || 0) - (a.winCnt || 0)).slice(0, 3),
);
const weekOccupyRank = computed(() =>
  [...weekList.value].sort((a, b) => (b.buildingCnt || 0) - (a.buildingCnt || 0)).slice(0, 3),
);
const weekKdRank = computed(() =>
  [...weekList.value]
    .map((member) => ({ ...member, kd: parseFloat(kd(member)) }))
    .sort((a, b) => b.kd - a.kd)
    .slice(0, 3),
);
const weekReviveRank = computed(() =>
  [...weekList.value]
    .map((member) => ({ ...member, reviveCnt: reviveCntOf(member) }))
    .sort((a, b) => b.reviveCnt - a.reviveCnt)
    .slice(0, 3),
);
const weekMvp = computed(() => (weekList.value.length ? weekList.value[0] : null));
/* 战报抬头用的俱乐部名（优先本俱乐部详情，回退 store 里的 legionInfo）与月份 */
const clubDisplayName = computed(
  () => currentLegionInfo.value?.name || tokenStore.gameData?.legionInfo?.info?.name || "俱乐部",
);
const monthLabel = computed(() => {
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
});
/* 样式二补充：总攻城 / 总胜率 / 人均击杀 / 死亡榜 / 生存榜（照抄 BR style2） */
const weekTotalBuilding = computed(() =>
  weekList.value.reduce((sum, m) => sum + (m.buildingCnt || 0), 0),
);
const weekWinRate = computed(() => {
  const kills = weekTotalKills.value;
  const deaths = weekTotalDeaths.value;
  if (kills + deaths === 0) return "0.0";
  return ((kills / (kills + deaths)) * 100).toFixed(1);
});
const weekAvgKills = computed(() =>
  weekList.value.length ? (weekTotalKills.value / weekList.value.length).toFixed(1) : "0.0",
);
const weekDeathRank = computed(() =>
  [...weekList.value].sort((a, b) => (b.loseCnt || 0) - (a.loseCnt || 0)).slice(0, 3),
);
const weekSurvivalRank = computed(() =>
  [...weekList.value]
    .filter((p) => (p.winCnt || 0) > 0 || (p.buildingCnt || 0) > 0)
    .sort((a, b) => (a.loseCnt || 0) - (b.loseCnt || 0))
    .slice(0, 3)
    .map((p) => ({ ...p, survivalCnt: p.loseCnt || 0 })),
);

/* 六张榜单卡走同一份模板（11-01 改版）：t 标题 / rows 数据 / val 取值 */
const weekRankBoards = computed(() => [
  { t: "击杀前 3", rows: weekKillRank.value, val: (p) => p.winCnt || 0 },
  { t: "攻城前 3", rows: weekOccupyRank.value, val: (p) => p.buildingCnt || 0 },
  { t: "K/D 前 3", rows: weekKdRank.value, val: (p) => p.kd },
  { t: "复活丹前 3", rows: weekReviveRank.value, val: (p) => p.reviveCnt },
  { t: "死亡前 3", rows: weekDeathRank.value, val: (p) => p.loseCnt || 0 },
  { t: "生存前 3", rows: weekSurvivalRank.value, val: (p) => p.survivalCnt || 0 },
]);
/* 明细表里给 MVP 那个人挂徽标（周 MVP = 击杀榜第一，见 weekMvp） */
const isMvpRow = (p) => !!p && !!weekMvp.value && p.roleId === weekMvp.value.roleId;

/* ============================================================
 * 三、月战绩（照抄 ClubMonthBattleRecords：当月周六 + 第四周周日并行）
 * ============================================================ */
const loadingMonth = ref(false);
const monthRecords = ref([]);
const monthFetched = ref(false);

const getCurrentMonthBattleDates = () => {
  const dateObj = new Date();
  const dates = [];
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth();

  const saturdays = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  for (let i = firstDay.getDate(); i <= lastDay.getDate(); i++) {
    const currentDate = new Date(year, month, i);
    if (currentDate.getDay() === 6) {
      saturdays.push(currentDate);
    }
  }
  for (let i = 0; i < Math.min(4, saturdays.length); i++) {
    dates.push(saturdays[i]);
  }
  if (saturdays.length >= 4) {
    const fourthSaturday = saturdays[3];
    const fourthSunday = new Date(fourthSaturday);
    fourthSunday.setDate(fourthSunday.getDate() + 1);
    dates.push(fourthSunday);
  }
  const formattedDates = dates.map((date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}/${m}/${d}`;
  });
  const currentDate = new Date();
  const currentDateStr = `${currentDate.getFullYear()}/${String(
    currentDate.getMonth() + 1,
  ).padStart(2, "0")}/${String(currentDate.getDate()).padStart(2, "0")}`;
  return formattedDates.filter((date) => date <= currentDateStr);
};

const fetchBattleRecordsByDate = async (date) => {
  const token = tokenStore.selectedToken;
  if (!token) return null;
  const tokenId = token.id;
  const wsStatus = tokenStore.getWebSocketStatus(tokenId);
  if (wsStatus !== "connected") return null;
  try {
    const result = await tokenStore.sendMessageWithPromise(
      tokenId,
      "legionwar_getdetails",
      { date },
      10000,
    );
    if (result && result.roleDetailsList) {
      const sortedRoleDetailsList = [...result.roleDetailsList].sort(
        (a, b) => (b.winCnt || 0) - (a.winCnt || 0),
      );
      return { ...result, roleDetailsList: sortedRoleDetailsList, date };
    }
    return { roleDetailsList: [], date };
  } catch (error) {
    console.error("查询战绩失败:", error);
    return { roleDetailsList: [], date };
  }
};

const fetchMonth = async () => {
  const token = tokenStore.selectedToken;
  if (!token) {
    message.warning("请先选择游戏角色");
    return;
  }
  loadingMonth.value = true;
  if (!currentClubInfo.value) await fetchCurrentClubInfo(token.id);
  try {
    const dates = getCurrentMonthBattleDates();
    const results = await Promise.all(dates.map((d) => fetchBattleRecordsByDate(d)));
    monthRecords.value = results.filter(Boolean);
    message.success("本月战绩加载成功");
  } catch (error) {
    console.error("查询本月战绩失败:", error);
    message.error(`查询本月战绩失败: ${error.message}`);
    monthRecords.value = [];
  } finally {
    monthFetched.value = true;
    loadingMonth.value = false;
  }
};

/* ---------- 月战绩统计（照抄 MB monthlyStats / sortedMembers / getMemberDailyStat） ---------- */
const monthBattleDates = computed(() => monthRecords.value.map((r) => r.date));
const formatShortDate = (date) => date.split("/").slice(1).join("/");
const memberKd = (m) =>
  parseFloat(m.totalWinCnt && m.totalLoseCnt ? m.totalWinCnt / m.totalLoseCnt : 0).toFixed(2);

const monthAggregated = computed(() => {
  const memberStats = {};
  monthRecords.value.forEach((dailyRecords) => {
    if (dailyRecords && dailyRecords.roleDetailsList) {
      dailyRecords.roleDetailsList.forEach((member) => {
        if (!memberStats[member.roleId]) {
          memberStats[member.roleId] = {
            roleId: member.roleId,
            name: member.name,
            headImg: member.headImg,
            totalWinCnt: 0,
            totalLoseCnt: 0,
            totalResurrection: 0,
            totalBuildingCnt: 0,
            dailyRecords: {},
          };
        }
        memberStats[member.roleId].totalWinCnt += member.winCnt || 0;
        memberStats[member.roleId].totalLoseCnt += member.loseCnt || 0;
        memberStats[member.roleId].totalBuildingCnt += member.buildingCnt || 0;
        memberStats[member.roleId].totalResurrection += Math.max((member.loseCnt || 0) - 6, 0);
        memberStats[member.roleId].dailyRecords[dailyRecords.date] = member;
      });
    }
  });
  return memberStats;
});

const monthSortedMembers = computed(() =>
  Object.values(monthAggregated.value).sort((a, b) => b.totalWinCnt - a.totalWinCnt),
);

const monthStats = computed(() => {
  const members = Object.values(monthAggregated.value);
  return {
    totalMembers: members.length,
    totalKills: members.reduce((s, m) => s + m.totalWinCnt, 0),
    totalDeaths: members.reduce((s, m) => s + m.totalLoseCnt, 0),
    totalResurrection: members.reduce((s, m) => s + m.totalResurrection, 0),
    totalBuilding: members.reduce((s, m) => s + m.totalBuildingCnt, 0),
  };
});

const monthStatsTotalKD = computed(() => {
  const { totalKills, totalDeaths } = monthStats.value;
  if (!totalDeaths) return "0.00";
  return parseFloat(totalKills / totalDeaths).toFixed(2);
});

const monthMvp = computed(() =>
  monthSortedMembers.value.length ? monthSortedMembers.value[0] : null,
);
/* 样式二补充：总胜率 / 人均击杀 / 六个榜单（照抄 MB style2） */
const monthWinRate = computed(() => {
  const kills = monthStats.value.totalKills;
  const deaths = monthStats.value.totalDeaths;
  if (kills + deaths === 0) return "0.0";
  return ((kills / (kills + deaths)) * 100).toFixed(1);
});
const monthAvgKills = computed(() =>
  monthSortedMembers.value.length
    ? (monthStats.value.totalKills / monthSortedMembers.value.length).toFixed(1)
    : "0.0",
);
const monthKillRank = computed(() =>
  [...monthSortedMembers.value].sort((a, b) => (b.totalWinCnt || 0) - (a.totalWinCnt || 0)).slice(0, 3),
);
const monthOccupyRank = computed(() =>
  [...monthSortedMembers.value]
    .sort((a, b) => (b.totalBuildingCnt || 0) - (a.totalBuildingCnt || 0))
    .slice(0, 3),
);
const monthKdRank = computed(() =>
  [...monthSortedMembers.value].map((m) => ({ ...m, kd: memberKd(m) })).sort((a, b) => b.kd - a.kd).slice(0, 3),
);
const monthDeathRank = computed(() =>
  [...monthSortedMembers.value].sort((a, b) => (b.totalLoseCnt || 0) - (a.totalLoseCnt || 0)).slice(0, 3),
);
const monthReviveRank = computed(() =>
  [...monthSortedMembers.value]
    .sort((a, b) => (b.totalResurrection || 0) - (a.totalResurrection || 0))
    .slice(0, 3),
);
const monthSurvivalRank = computed(() =>
  [...monthSortedMembers.value]
    .filter((p) => (p.totalWinCnt || 0) > 0 || (p.totalBuildingCnt || 0) > 0)
    .sort((a, b) => (a.totalLoseCnt || 0) - (b.totalLoseCnt || 0))
    .slice(0, 3)
    .map((p) => ({ ...p, survivalCnt: p.totalLoseCnt || 0 })),
);

/* 月报六张榜单卡：与周报同一份结构，字段换成 total* */
const monthRankBoards = computed(() => [
  { t: "击杀前 3", rows: monthKillRank.value, val: (p) => p.totalWinCnt || 0 },
  { t: "攻城前 3", rows: monthOccupyRank.value, val: (p) => p.totalBuildingCnt || 0 },
  { t: "K/D 前 3", rows: monthKdRank.value, val: (p) => p.kd },
  { t: "复活丹前 3", rows: monthReviveRank.value, val: (p) => p.totalResurrection || 0 },
  { t: "死亡前 3", rows: monthDeathRank.value, val: (p) => p.totalLoseCnt || 0 },
  { t: "生存前 3", rows: monthSurvivalRank.value, val: (p) => p.survivalCnt || 0 },
]);
const isMonthMvpRow = (m) => !!m && !!monthMvp.value && m.roleId === monthMvp.value.roleId;

const getMemberDailyStat = (member, date, statType) => {
  if (member.dailyRecords && member.dailyRecords[date]) {
    return member.dailyRecords[date][statType] || 0;
  }
  return 0;
};

const monthExpanded = ref(null);
const toggleMonthExpand = (roleId) => {
  monthExpanded.value = monthExpanded.value === roleId ? null : roleId;
};

/* 月战绩 xlsx 导出（照抄 MB 成员聚合：逐日 + 本月总计） */
const exportMonthXlsx = () => {
  if (!monthSortedMembers.value.length) {
    message.warning("没有可导出的数据");
    return;
  }
  try {
    const dates = monthBattleDates.value;
    const header = ["排名", "成员", ...dates.flatMap((d) => [`${formatShortDate(d)}-击杀`, `${formatShortDate(d)}-死亡`, `${formatShortDate(d)}-攻城`, `${formatShortDate(d)}-复活丹`]), "本月击杀", "本月死亡", "本月攻城", "本月复活丹", "本月K/D"];
    const rows = monthSortedMembers.value.map((m, index) => {
      const row = [index + 1, m.name];
      dates.forEach((d) => {
        const lose = getMemberDailyStat(m, d, "loseCnt") || 0;
        row.push(
          getMemberDailyStat(m, d, "winCnt") || 0,
          lose,
          getMemberDailyStat(m, d, "buildingCnt") || 0,
          Math.max(lose - 6, 0),
        );
      });
      row.push(m.totalWinCnt || 0, m.totalLoseCnt || 0, m.totalBuildingCnt || 0, m.totalResurrection || 0, memberKd(m));
      return row;
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "本月战绩");
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const fileName = `盐场本月战绩_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.xlsx`;
    XLSX.writeFile(wb, fileName);
    message.success(`导出成功: ${fileName}`);
  } catch (error) {
    console.error("导出失败:", error);
    message.error("导出失败，请重试");
  }
};
/* ============================================================
 * 四、地图 / 战况（legionWarStore，照抄 LegionWarMap/Statistics 生命周期）
 * ============================================================ */
const statView = ref("legion");

const warConnect = async () => {
  try {
    await warStore.connect();
    message.success("战场已连接");
  } catch (e) {
    message.error(e.message || "连接失败");
  }
};
const warDisconnect = () => {
  warStore.disconnect();
};

/* 进入/退出战场（照抄 LegionWarStatistics toggleBattlefieldEntry） */
const toggleBattlefieldEntry = async () => {
  if (warJoined.value) {
    warStore.disconnect(true); // 强制断开
  } else {
    try {
      await warStore.connect();
    } catch (error) {
      message.error(error.message || "连接失败");
    }
  }
};

/* 俱乐部排序（照抄 LegionWarMap sortedLegions：红数 > 战力 > ID） */
const sortedLegions = computed(() => {
  if (!validData.value || !validData.value.legionInfo) return [];
  const list = Object.values(validData.value.legionInfo).map((legion) => {
    const detail = legionDetails.value[legion.id] || {};
    const alliance = detail.announcement
      ? allianceincludes(detail.announcement)
      : "未知联盟";
    const redCount =
      detail.quenchNum !== undefined ? detail.quenchNum : legion.redCount;
    return {
      ...legion,
      announcement: detail.announcement || "",
      alliance,
      redCount,
    };
  });
  return list.sort((a, b) => {
    if (b.redCount !== a.redCount) return b.redCount - a.redCount;
    if (b.power && a.power && b.power !== a.power) return b.power - a.power;
    return parseInt(a.id) - parseInt(b.id);
  });
});

const warLegionList = computed(() => sortedLegions.value);

/* 联盟分组（照抄 LegionWarMap allianceGroups） */
const mapAllianceGroups = computed(() => {
  const groups = {};
  ["大联盟", "梦盟", "正义联盟", "龙盟", "曦盟", "未知联盟"].forEach((type) => {
    groups[type] = [];
  });
  sortedLegions.value.forEach((legion) => {
    const alliance = legion.alliance;
    if (groups[alliance]) {
      groups[alliance].push(legion);
    } else {
      groups["未知联盟"].push(legion);
    }
  });
  // 只保留非空分组
  const result = {};
  Object.entries(groups).forEach(([k, v]) => {
    if (v.length) result[k] = v;
  });
  return result;
});

const legionData = computed(() => {
  if (!validData.value?.legionInfo) return [];
  return Object.values(validData.value.legionInfo)
    .map((item) => {
      const detail = legionDetails.value[item.id];
      const realRedCount = detail?.quenchNum !== undefined ? detail.quenchNum : item.redCount;
      const realPower = detail?.power !== undefined ? detail.power : item.power;
      return { ...item, redCount: realRedCount, power: realPower, key: item.id };
    })
    .sort((a, b) => b.score - a.score);
});

const individualData = computed(() => {
  if (!validData.value?.memberInfo) return [];
  const myLegionId = tokenStore.gameData?.roleInfo?.role?.legionId;
  return Object.values(validData.value.memberInfo)
    .filter((item) => item.legionId == myLegionId)
    .map((item, index) => ({
      ...item,
      key: index,
      kd: item.die > 0 ? (item.kill / item.die).toFixed(2) : item.kill.toFixed(2),
    }))
    .sort((a, b) => b.kill - a.kill);
});

/* 全部战况（照抄 LegionWarStatistics.allIndividualData：全场个人 + 俱乐部名） */
const allIndividualData = computed(() => {
  if (!validData.value?.memberInfo) return [];
  return Object.values(validData.value.memberInfo)
    .map((item, index) => {
      const legionInfo = validData.value.legionInfo?.[item.legionId];
      const clubName = legionInfo ? legionInfo.name : "未知俱乐部";
      return {
        ...item,
        key: item.id || index,
        clubName: clubName,
        kd: item.die > 0 ? (item.kill / item.die).toFixed(2) : item.kill.toFixed(2),
      };
    })
    .sort((a, b) => b.kill - a.kill);
});

/* ============================================================
 * 五、盐场地图 canvas（照抄 LegionWarMap drawCanvasContent + 移动端手势扩展）
 * ============================================================ */
const isAccessible = ref(isLegionWarAccessible());
const legionWarMapDom = ref(null);
const mapViewportDom = ref(null);
const mapStageDom = ref(null);

const dpr = window.devicePixelRatio || 1;
let hexSize = 12;
const gap = 3;
let hexWidth = 2 * hexSize;
let hexHeight = Math.sqrt(3) * hexSize;
const arr = Array.from({ length: 41 }, () =>
  Array.from({ length: 41 }, () => 0),
);
let leftMaxPoint = [0, 0];
let ctx = null;
let resizeHandler = null;

/* 颜色映射（照抄 LegionWarMap typeBg/typeLabel/allianceColors） */
const typeBg = (type) => {
  switch (type) {
    case 1: return "#4477CE";
    case 2: return "#D835D8";
    case 3: return "#F9B500";
    case 4: return "#D21E1E";
    case 5: return "#2B2B2B";
    case 6: return "#000000";
    case 9: return "#4477CE";
    default: return "#cccccc";
  }
};
const typeLabel = (type) => {
  switch (type) {
    case 1: return "小";
    case 2: return "中";
    case 3: return "大";
    case 4: return "本";
    case 5: return "城";
    case 6: return "核";
    default: return "";
  }
};
/* 地图六边形按联盟着色 —— 属于数据可视化区分色，不作 UI 装饰，
   故保留多色相；仅把桌面主题紫 #667eea 换回规范内的 navy。 */
/* ★ 这张表直接喂 drawHexagon → canvas，canvas 不认 var()，只能写字面色值。
   但要写「调色板里的字面值」：原来那批是 Naive / Material 的色，跟站内 token 不是一个体系。 */
const allianceColors = {
  大联盟: "#022879", // navy
  梦盟: "#067647", // -m-green
  正义联盟: "#0057d2", // -m-primary
  龙盟: "#b42318", // -m-red
  曦盟: "#475e75", // -m-text3
  未知联盟: "#b54708", // -m-amber
};
const drawHexagon = (x, y, color, type) => {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = ((2 * Math.PI) / 6) * i;
    const px = x + hexSize * Math.cos(angle);
    const py = y + hexSize * Math.sin(angle);
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    if (px >= leftMaxPoint[0]) leftMaxPoint[0] = px;
    if (py >= leftMaxPoint[1]) leftMaxPoint[1] = py;
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.stroke();
};
const drawText = (x, y, text, color = "#fff", fontSize = 10) => {
  ctx.fillStyle = color;
  ctx.font = `bold ${fontSize}px Microsoft Yahei`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
};

const drawCanvasContent = () => {
  if (!ctx) return;
  ctx.clearRect(0, 0, ctx.canvas.width / dpr, ctx.canvas.height / dpr);
  arr.forEach((row) => row.fill(0));
  let graph = HexGraph.getInstance();
  graph.removeAllNode();

  const canvasWidth = ctx.canvas.width / dpr;
  const canvasHeight = ctx.canvas.height / dpr;
  const horizontalStep = hexWidth * 0.75 + gap;
  const verticalStep = hexHeight + gap;
  const maxCols = Math.ceil(canvasWidth / horizontalStep) + 2;
  const maxRows = Math.ceil(canvasHeight / verticalStep) + 2;

  // 背景网格
  ctx.strokeStyle = "#e0e0e0";
  ctx.lineWidth = 1;
  for (let row = 0; row < maxRows; row++) {
    for (let col = 0; col < maxCols; col++) {
      const x = col * (hexWidth * 0.75) + hexSize + gap * col;
      const y = row * hexHeight + (col % 2 === 1 ? hexHeight / 2 : 0) + gap * row;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = ((2 * Math.PI) / 6) * i;
        const px = x + hexSize * Math.cos(angle);
        const py = y + hexSize * Math.sin(angle);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }

  ctx.save();
  ctx.translate(2 * (hexWidth * 0.75 + gap), -1 * (hexHeight + gap));

  graph.addNodeList(
    roadPointList.map((item) => {
      const realTimeNode = validData.value?.buildingData?.[item.id];
      const type = realTimeNode?.type || item.type;
      const belongsLegionId = realTimeNode ? realTimeNode.belongsLegionId : -1;
      return {
        id: item.id,
        type,
        belongsLegionId,
        hP: realTimeNode ? realTimeNode.hP : 0,
        maxHP: realTimeNode ? realTimeNode.maxHP : 0,
        point: realTimeNode ? realTimeNode.point : 0,
        belongsLegionInfo: validData.value?.legionInfo?.[belongsLegionId],
      };
    }),
  );

  const graphNodes = graph.getAllNodes();
  const nodesToDraw =
    graphNodes.length > 0
      ? graphNodes
      : roadPointList.map((item) => ({ ...item, type: item.type, belongsLegionId: -1 }));

  nodesToDraw.forEach((node) => {
    const [colStr, rowStr] = node.id.split("_");
    const col = parseInt(colStr);
    const row = parseInt(rowStr);
    if (!isNaN(col) && !isNaN(row)) {
      const x = col * (hexWidth * 0.75) + hexSize + gap * col;
      const y = row * hexHeight + (col % 2 === 1 ? hexHeight / 2 : 0) + gap * row;
      let bgColor = typeBg(node.type);
      const coreSurroundingPoints = ["19_16", "19_17", "20_16", "20_18", "21_16", "21_17"];
      if (coreSurroundingPoints.includes(node.id)) bgColor = "#cccccc";
      if (node.type === 6) bgColor = "#000000";
      drawHexagon(x, y, bgColor, node.type);
      if (node.type !== 9) {
        drawText(x, y, typeLabel(node.type), "#fff", 12);
      }
    }
  });

  // 俱乐部名称：【N红】名称 + 联盟色背景
  if (validData.value && validData.value.legionInfo) {
    Object.values(validData.value.legionInfo).forEach((legion) => {
      if (legion.strongholdId) {
        const [colStr, rowStr] = legion.strongholdId.split("_");
        const col = parseInt(colStr);
        const row = parseInt(rowStr);
        if (!isNaN(col) && !isNaN(row)) {
          const x = col * (hexWidth * 0.75) + hexSize + gap * col;
          const y = row * hexHeight + (col % 2 === 1 ? hexHeight / 2 : 0) + gap * row;
          const detail = legionDetails.value[legion.id] || {};
          const redCount =
            detail.quenchNum !== undefined ? detail.quenchNum : legion.redCount || 0;
          const nameStr = `【${redCount}红】${legion.name}`;
          const alliance = detail.announcement
            ? allianceincludes(detail.announcement)
            : "未知联盟";
          const allianceColor = allianceColors[alliance] || allianceColors["未知联盟"];
          ctx.font = "bold 12px Microsoft Yahei";
          const textWidth = ctx.measureText(nameStr).width;
          const padding = 10;
          const height = 24;
          const bgX = x - textWidth / 2 - padding / 2;
          const bgY = y - 32;
          const bgWidth = textWidth + padding;
          ctx.fillStyle = allianceColor;
          const r = 4;
          ctx.beginPath();
          ctx.moveTo(bgX + r, bgY);
          ctx.arcTo(bgX + bgWidth, bgY, bgX + bgWidth, bgY + height, r);
          ctx.arcTo(bgX + bgWidth, bgY + height, bgX, bgY + height, r);
          ctx.arcTo(bgX, bgY + height, bgX, bgY, r);
          ctx.arcTo(bgX + bgWidth, bgY, bgX, bgY, r);
          ctx.closePath();
          ctx.fill();
          drawText(x, bgY + height / 2, nameStr, "#fff", 12);
        }
      }
    });
  }
};

const resizeAndRedraw = () => {
  if (!legionWarMapDom.value) return;
  const canvas = legionWarMapDom.value;
  const container = canvas.parentElement;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  const w = container.clientWidth;
  const h = container.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const cols = 41;
  const rows = 41;
  const padding = 10;
  const availableW = w - padding * 2;
  const availableH = h - padding * 2;
  const sizeW = (availableW - (cols - 1) * gap) / (cols * 1.5 + 0.5);
  const sizeH =
    (availableH - (rows - 1) * gap) / (rows * Math.sqrt(3) + Math.sqrt(3) / 2);
  hexSize = Math.min(sizeW, sizeH);
  hexSize = Math.max(12, Math.min(hexSize, 30));
  hexWidth = 2 * hexSize;
  hexHeight = Math.sqrt(3) * hexSize;
  if (ctx) {
    ctx.scale(dpr, dpr);
    drawCanvasContent();
  }
};

const initializeCanvas = async () => {
  await nextTick();
  const canvas = legionWarMapDom.value;
  if (!canvas) return false;
  const context = canvas.getContext("2d");
  if (!context) return false;
  ctx = context;
  if (!resizeHandler) {
    resizeHandler = () => resizeAndRedraw();
    window.addEventListener("resize", resizeHandler);
  }
  resizeAndRedraw();
  return true;
};

/* ---------- 移动端手势：单指拖动 / 双指捏合 / 双击 / 滚轮 / 按钮缩放（照抄 LegionWarMap 扩展） ---------- */
const MAP_STAGE_W = 920;
const MAP_STAGE_H = 1000;
const MAP_ZOOM_MAX = 4;
const MAP_DEFAULT_ZOOM = 0.5;
const mapZoom = ref(1);
let mapPanX = 0;
let mapPanY = 0;
let mapViewBound = false;
let mapViewEl = null;
let mapViewCleanup = null;

const mapStageEl = () => mapStageDom.value;
const mapViewportEl = () => mapViewportDom.value;

const applyMapTransform = () => {
  const stage = mapStageEl();
  if (!stage) return;
  stage.style.transformOrigin = "0 0";
  stage.style.transform =
    "translate3d(" + mapPanX + "px, " + mapPanY + "px, 0) scale(" + mapZoom.value + ")";
};

const mapFitScale = () => {
  const vp = mapViewportEl();
  const stage = mapStageEl();
  if (!vp || !stage) return 1;
  const vw = vp.clientWidth;
  const vh = vp.clientHeight;
  if (!vw || !vh) return 1;
  return Math.min(vw / stage.offsetWidth, vh / stage.offsetHeight, 1);
};

const clampMapPan = () => {
  const vp = mapViewportEl();
  const stage = mapStageEl();
  if (!vp || !stage) return;
  const w = stage.offsetWidth * mapZoom.value;
  const h = stage.offsetHeight * mapZoom.value;
  const minX = Math.min(0, vp.clientWidth - w);
  const maxX = Math.max(0, vp.clientWidth - w);
  const minY = Math.min(0, vp.clientHeight - h);
  const maxY = Math.max(0, vp.clientHeight - h);
  mapPanX = Math.min(maxX, Math.max(minX, mapPanX));
  mapPanY = Math.min(maxY, Math.max(minY, mapPanY));
};

const setMapZoom = (next, focalX, focalY) => {
  const vp = mapViewportEl();
  if (!vp) return;
  const rect = vp.getBoundingClientRect();
  const from = mapZoom.value;
  const target = Math.min(MAP_ZOOM_MAX, Math.max(mapFitScale(), next));
  if (Math.abs(target - from) < 0.001) return;
  const fx = (focalX === undefined ? rect.left + rect.width / 2 : focalX) - rect.left;
  const fy = (focalY === undefined ? rect.top + rect.height / 2 : focalY) - rect.top;
  const ratio = target / from;
  mapPanX = fx - (fx - mapPanX) * ratio;
  mapPanY = fy - (fy - mapPanY) * ratio;
  mapZoom.value = target;
  clampMapPan();
  applyMapTransform();
};

const zoomMapBy = (delta) => setMapZoom(mapZoom.value + delta);

const resetMapView = () => {
  const vp = mapViewportEl();
  const stage = mapStageEl();
  mapZoom.value = MAP_DEFAULT_ZOOM;
  if (vp && stage) {
    mapPanX = (vp.clientWidth - stage.offsetWidth * mapZoom.value) / 2;
    mapPanY = (vp.clientHeight - stage.offsetHeight * mapZoom.value) / 2;
  } else {
    mapPanX = 0;
    mapPanY = 0;
  }
  clampMapPan();
  applyMapTransform();
};

const syncMapStage = () => {
  const stage = mapStageEl();
  if (!stage) return;
  const wantW = MAP_STAGE_W + "px";
  const wantH = MAP_STAGE_H + "px";
  if (stage.style.width !== wantW || stage.style.height !== wantH) {
    stage.style.width = wantW;
    stage.style.height = wantH;
    resizeAndRedraw();
  }
};

const bindMapGestures = () => {
  const vp = mapViewportEl();
  if (!vp) return;
  if (mapViewBound && mapViewEl === vp) return;
  if (mapViewCleanup) mapViewCleanup();
  mapViewEl = vp;
  mapViewBound = true;

  let panLast = null;
  let panMoved = false;
  let pinchLastDist = 0;
  let pinchLastMid = null;
  let lastTapAt = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  const distOf = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const midOf = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });

  const onTouchStart = (e) => {
    if (e.touches.length >= 2) {
      pinchLastDist = distOf(e.touches[0], e.touches[1]);
      pinchLastMid = midOf(e.touches[0], e.touches[1]);
      panLast = null;
      panMoved = true;
    } else if (e.touches.length === 1) {
      pinchLastDist = 0;
      pinchLastMid = null;
      panMoved = false;
      panLast = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };
  const onTouchMove = (e) => {
    if (e.touches.length >= 2) {
      e.preventDefault();
      const d = distOf(e.touches[0], e.touches[1]);
      const m = midOf(e.touches[0], e.touches[1]);
      if (pinchLastDist > 0 && Math.abs(d - pinchLastDist) > 0.5) {
        setMapZoom(mapZoom.value * (d / pinchLastDist), m.x, m.y);
      }
      if (pinchLastMid) {
        mapPanX += m.x - pinchLastMid.x;
        mapPanY += m.y - pinchLastMid.y;
        clampMapPan();
        applyMapTransform();
      }
      pinchLastDist = d;
      pinchLastMid = m;
      panMoved = true;
      return;
    }
    if (e.touches.length === 1 && panLast) {
      e.preventDefault();
      const t = e.touches[0];
      const dx = t.clientX - panLast.x;
      const dy = t.clientY - panLast.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) panMoved = true;
      mapPanX += dx;
      mapPanY += dy;
      panLast = { x: t.clientX, y: t.clientY };
      clampMapPan();
      applyMapTransform();
    }
  };
  const onTouchEnd = (e) => {
    if (e.touches.length === 0) {
      const now = Date.now();
      const last = panLast;
      if (last && !panMoved) {
        if (now - lastTapAt < 300 && Math.abs(lastTapX - last.x) < 30 && Math.abs(lastTapY - last.y) < 30) {
          setMapZoom(mapZoom.value >= 1.9 ? 1 : 2, last.x, last.y);
          lastTapAt = 0;
        } else {
          lastTapAt = now;
          lastTapX = last.x;
          lastTapY = last.y;
        }
      }
      panLast = null;
      panMoved = false;
      pinchLastDist = 0;
      pinchLastMid = null;
      return;
    }
    if (e.touches.length === 1) {
      panLast = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      pinchLastDist = 0;
      pinchLastMid = null;
    }
  };
  const onWheel = (e) => {
    e.preventDefault();
    setMapZoom(mapZoom.value * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY);
  };
  const onResize = () => {
    clampMapPan();
    applyMapTransform();
  };

  vp.addEventListener("touchstart", onTouchStart, { passive: true });
  vp.addEventListener("touchmove", onTouchMove, { passive: false });
  vp.addEventListener("touchend", onTouchEnd, { passive: true });
  vp.addEventListener("touchcancel", onTouchEnd, { passive: true });
  vp.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("resize", onResize);

  mapViewCleanup = () => {
    vp.removeEventListener("touchstart", onTouchStart);
    vp.removeEventListener("touchmove", onTouchMove);
    vp.removeEventListener("touchend", onTouchEnd);
    vp.removeEventListener("touchcancel", onTouchEnd);
    vp.removeEventListener("wheel", onWheel);
    window.removeEventListener("resize", onResize);
    mapViewBound = false;
    mapViewEl = null;
    mapViewCleanup = null;
  };
};

/* 数据变化重绘（照抄 LegionWarMap watch validData/legionDetails/isConnected） */
watch(
  validData,
  (newVal) => {
    if (newVal) nextTick(() => resizeAndRedraw());
  },
  { deep: true },
);
watch(
  legionDetails,
  () => {
    nextTick(() => resizeAndRedraw());
  },
  { deep: true },
);
watch(warConnected, (newVal) => {
  if (!newVal) nextTick(() => resizeAndRedraw());
});

/* 开放时间门在面板挂载后翻转时（如跨过 19:55）补一次画布初始化 */
watch(isAccessible, async (accessible) => {
  if (accessible && sub.value === "map") {
    await initializeCanvas();
    syncMapStage();
    bindMapGestures();
    resetMapView();
  }
});

/* ---------- 生命周期：子分段懒加载 + 地图/战况连接管理 ---------- */
/* 旧版每个子页都是 v-if 挂载，切到即重新拉取；这里同样每次切到都拉 */
watch(sub, (v, oldV) => {
  /* 开放时间门按旧版语义「每次进子页重算」（旧版是 v-if 重挂载，isAccessible 每次重新初始化） */
  isAccessible.value = isLegionWarAccessible();
  /* 切换子页回顶部（真实滚动容器是 .m-scroll，路由 scrollBehavior 管不到） */
  const sc = document.querySelector(".mobile-shell .m-scroll");
  if (sc) sc.scrollTop = 0;
  /* 离开地图/战况即断开战场连接（照抄两个旧组件的 onUnmounted disconnect） */
  if ((oldV === "map" || oldV === "stat") && v !== "map" && v !== "stat") {
    warStore.disconnect();
  }
  if (v === "match") {
    fetchMatch();
  } else if (v === "week") {
    fetchWeek();
  } else if (v === "month") {
    fetchMonth();
  } else if (v === "map" || v === "stat") {
    /* 未开放时不建立战场连接（照抄旧版 403 分支） */
    if (!isAccessible.value) return;
    if (!warConnected.value && !warConnecting.value) {
      warStore.connect().catch(() => {});
    }
    if (v === "map") {
      // 画布在 v-if 里，进地图段落后初始化 + 绑手势
      nextTick(async () => {
        if (!isAccessible.value) return;
        await initializeCanvas();
        syncMapStage();
        bindMapGestures();
        resetMapView();
      });
    }
  }
});
onMounted(() => {
  fetchMatch();
});
onUnmounted(() => {
  warStore.disconnect();
  if (resizeHandler) {
    window.removeEventListener("resize", resizeHandler);
    resizeHandler = null;
  }
  if (mapViewCleanup) mapViewCleanup();
});

/* 切换账号后重拉（照抄 ClubWarrankV2 watch selectedTokenId） */
watch(selectedTokenId, (newTokenId, oldTokenId) => {
  if (!newTokenId || newTokenId === oldTokenId) return;
  currentClubInfo.value = null;
  battleRecords1.value = null;
  weekList.value = [];
  monthRecords.value = [];
  monthExpanded.value = null;
  // 退出编辑模式并清空手动数据（照抄 V2 刷新时重置）
  isEditMode.value = false;
  editingSortOrder.value = [];
  manualRankings.value = {};
  manualAlliances.value = {};
  currentSortType.value = "manual";
  fetchCurrentClubInfo(newTokenId);
  /* 当前停留的子页立即用新账号重拉（旧版切账号后各子页重新挂载） */
  if (sub.value === "match") fetchMatch(newTokenId);
  else if (sub.value === "week") fetchWeek();
  else if (sub.value === "month") fetchMonth();
});

/* ---------- 导出图片（导出范式与文件名规则照抄旧组件） ---------- */
const exportMatchDom = ref(null);
const exportWeekDom = ref(null);
const exportMonthDom = ref(null);
const exportMapDom = ref(null);
const exportStatDom = ref(null);
const isExporting = ref(false);

const timeStamp = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

const runExport = async (dom, filename) => {
  if (!dom) {
    message.error("未找到要导出的内容");
    return;
  }
  try {
    isExporting.value = true;
    const loadingMsg = message.loading("正在生成图片，请稍候...", { duration: 0 });
    await exportDomAsImage(dom, filename);
    loadingMsg.destroy();
    message.success("图片导出成功");
  } catch (err) {
    console.error("DOM转图片失败：", err);
    loadingMsg.destroy();
    message.error("导出图片失败，请重试");
  } finally {
    isExporting.value = false;
  }
};

/* 盐场匹配信息（照抄 ClubWarrank / ClubWarrankV2 文件名） */
const exportMatch = () =>
  runExport(
    exportMatchDom.value,
    `${queryDate.value.replace("/", "年").replace("/", "月")}日盐场匹配信息.png`,
  );

/* 盐场战报（照抄 ClubBattleRecords 文件名，取本周查询日期） */
const exportWeek = () =>
  runExport(
    exportWeekDom.value,
    `${weekDate.value.replace("/", "年").replace("/", "月")}日盐场战报.png`,
  );

/* 本月战绩总览（照抄 ClubMonthBattleRecords 文件名） */
const exportMonth = () => {
  const now = new Date();
  const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  runExport(exportMonthDom.value, `${monthYear}月盐场战绩总览.png`);
};

/* 盐场地图（照抄 LegionWarMap 文件名；导出前临时复位缩放，避免 transform 比例拍进图片） */
const exportMap = async () => {
  const prevZoom = mapZoom.value;
  const prevX = mapPanX;
  const prevY = mapPanY;
  mapZoom.value = 1;
  mapPanX = 0;
  mapPanY = 0;
  applyMapTransform();
  await runExport(exportMapDom.value, `盐场地图_${timeStamp()}.png`);
  mapZoom.value = prevZoom;
  mapPanX = prevX;
  mapPanY = prevY;
  clampMapPan();
  applyMapTransform();
};

/* 盐场战况（照抄 LegionWarStatistics 文件名） */
const exportStat = () => {
  const modeName = statView.value === "legion" ? "俱乐部战况" : statView.value === "individual" ? "个人战况" : "全部战况";
  runExport(exportStatDom.value, `盐场${modeName}_${timeStamp()}.png`);
};

/* ---------- xlsx 表格导出（照抄旧版三处导出） ---------- */
/* 盐场匹配详情：10 列 + 联盟总计行（clubWarrankUtils.formatWarrankRecordsForExport 自带下载） */
const exportMatchXlsx = () => {
  if (!matchList.value.length) {
    message.warning("没有可导出的数据");
    return;
  }
  try {
    formatWarrankRecordsForExport(matchList.value, queryDate.value);
    message.success("导出成功");
  } catch (error) {
    console.error("导出失败:", error);
    message.error("导出失败，请重试");
  }
};

/* 周战绩：盐场 + 战斗明细双 sheet（clubBattleUtils.formatBattleRecordsForExport 自带下载） */
const exportWeekXlsx = () => {
  if (!weekList.value.length) {
    message.warning("没有可导出的数据");
    return;
  }
  try {
    formatBattleRecordsForExport(weekList.value, weekDate.value);
    message.success("导出成功");
  } catch (error) {
    console.error("导出失败:", error);
    message.error("导出失败，请重试");
  }
};

/* 战况三类导出（照抄 LegionWarStatistics.exportExcel） */
const getCurrentTimeByFormat = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};
const exportStatXlsx = () => {
  if (!validData.value) {
    message.warning("无数据可导出");
    return;
  }
  let dataToExport = [];
  let fileNamePrefix = "";
  if (statView.value === "legion") {
    fileNamePrefix = "俱乐部战况";
    dataToExport = legionData.value.map((item, index) => ({
      排名: index + 1,
      俱乐部名称: item.name,
      击杀数: item.killCnt,
      免费复活: `${item.reviveCount}/150`,
      积分: item.score,
      红数: item.redCount,
      战力: formatPower(item.power),
      人数: `${item.participantsCount}/30`,
      花费总丹: item.danCount,
      四圣: `${item.blessingCount}个共${item.blessingScore}分`,
    }));
  } else if (statView.value === "individual") {
    fileNamePrefix = "个人战况";
    dataToExport = individualData.value.map((item, index) => ({
      排名: index + 1,
      名称: item.name,
      击杀数: item.kill,
      死亡次数: item.die,
      已复活次数: `${item.revive}/5`,
      积分: item.score,
      刨地: item.digGround,
      复活丹: item.dan,
      "K/D": item.kd,
    }));
  } else {
    fileNamePrefix = "全部战况";
    dataToExport = allIndividualData.value.map((item, index) => ({
      排名: index + 1,
      名称: item.name,
      俱乐部: item.clubName,
      击杀数: item.kill,
      死亡次数: item.die,
      已复活次数: `${item.revive}/5`,
      积分: item.score,
      刨地: item.digGround,
      复活丹: item.dan,
      "K/D": item.kd,
    }));
  }
  if (dataToExport.length === 0) {
    message.warning("当前列表无数据");
    return;
  }
  const ws = XLSX.utils.json_to_sheet(dataToExport);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const fileName = `盐场${fileNamePrefix}_${getCurrentTimeByFormat()}.xlsx`;
  XLSX.writeFile(wb, fileName);
  message.success(`导出成功: ${fileName}`);
};

/* ---------- 展示辅助 ---------- */
/* 战力格式化统一走 legionWar.formatPower（照抄旧版各面板口径） */
const fmtPower = (n) => formatPower(Number(n || 0));
const kd = (p) =>
  parseFloat(p.winCnt && p.loseCnt ? p.winCnt / p.loseCnt : 0).toFixed(2);
/* 积分格式化（照抄 ClubWarrank.vue：无积分数据时显示 0） */
const formatScore = (Score) => (Score ? Score.toFixed(0).toString() : "0");
</script>

<script>
export default { name: "MobileSaltPanel" };
</script>

<style scoped>
/* ---------- 匹配卡：日期行 / 提示 / 分割线 / 操作行（合并查询与对手俱乐部） ---------- */
.m-tdate {
  font-size: 11.5px; font-weight: 600; color: var(--m-text3);
  font-variant-numeric: tabular-nums; margin-left: 4px;
}
.m-frow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.m-fhint { margin: 7px 0 0; font-size: 10.5px; line-height: 1.45; }
.m-split { height: 1px; background: var(--m-border); margin: 10px -14px; }
.m-subrow { align-items: center; justify-content: space-between; gap: 6px; }
.m-subrow .m-more { font-size: 11px; color: var(--m-text3); white-space: nowrap; }
.m-subrow .m-more b { color: var(--m-text); font-size: 12px; }
.m-subrow .m-acts { gap: 6px; }
.m-chipbtn { padding: 5px 9px; font-size: 11px; border-radius: 8px; white-space: nowrap; }
.m-finput {
  border: 1px solid var(--m-border);
  background: var(--m-bg);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--m-text);
  font-family: inherit;
}
.m-rank {
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--m-bg);
  border: 1px solid var(--m-border);
  color: var(--m-text2);
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.m-rank.top {
  background: var(--m-primary);
  border-color: transparent;
  color:var(--m-on-primary);
}
/* ============================================================
 * 盐场匹配卡片视图（照抄 GameStatus.vue ⑫~⑭ 手机端 salt-cards 适配段）
 *  · 公告区：左侧蓝竖线 + 两行文字
 *  · 联盟标签栏：grid 自动换行，每联盟一套 --tab-solid/dark/tint/line
 *  · 俱乐部卡片：描边取联盟色；字段一行等宽平分；前三车头独立行
 * ============================================================ */
/* 公告区 */
.m-anno {
  display: flex; flex-direction: column; gap: 2px;
  background: var(--m-card); border: 1px solid var(--m-border);
  border-left: 3px solid var(--m-primary); border-radius: 8px;
  padding: 8px 10px; margin-bottom: 10px;
}
.m-anno-t { font-size: 12px; font-weight: 700; color: var(--m-text); line-height: 1.5; }
.m-anno-time { font-size: 11px; font-weight: 500; color: var(--m-text3); line-height: 1.5; }
/* 联盟标签栏 */
.m-atabs {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
  gap: 6px; margin-bottom: 10px;
}
.m-atab {
  display: flex; align-items: center; justify-content: center; gap: 4px;
  min-width: 0; height: auto; padding: 7px 6px; border-radius: 8px;
  font-size: 12px; font-weight: 600; line-height: 1.2; white-space: nowrap;
  background: var(--tab-tint); border: 1px solid var(--tab-line); color: var(--tab-dark);
  font-family: inherit; cursor: pointer;
}
.m-atab.on {
  background: var(--tab-solid); border-color: var(--tab-solid); color:var(--m-on-primary);
}
.m-atab-t { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.m-atab-c {
  flex: none; font-size: 10px; font-weight: 700; line-height: 1;
  padding: 2px 5px; border-radius: 8px;
  background: var(--tab-tint); color: var(--tab-dark);
}
.m-atab.on .m-atab-c { background: rgba(255, 255, 255, 0.3); color:var(--m-on-primary); }
/* 每联盟配色（照抄 GameStatus ⑫ 色板） */
.al-large { --tab-solid:var(--m-green); --tab-dark:var(--m-green); --tab-tint:var(--m-green-soft); --tab-line: rgba(82, 196, 26, 0.32); }
.al-dream { --tab-solid:var(--m-amber); --tab-dark:var(--m-amber); --tab-tint:var(--m-amber-soft); --tab-line: rgba(250, 173, 20, 0.34); }
.al-justice { --tab-solid:var(--m-red); --tab-dark:var(--m-red); --tab-tint:var(--m-red-soft); --tab-line: rgba(245, 34, 45, 0.3); }
.al-dragon { --tab-solid:var(--m-primary); --tab-dark:var(--m-primary-deep); --tab-tint:var(--m-band-lavender); --tab-line: rgba(114, 46, 209, 0.3); }
.al-xi { --tab-solid:var(--m-green); --tab-dark:var(--m-green); --tab-tint:var(--m-green-soft); --tab-line: rgba(19, 194, 194, 0.32); }
.al-unknown, .al-other { --tab-solid:var(--m-text3); --tab-dark:var(--m-text3); --tab-tint:var(--m-bg); --tab-line:var(--m-border); }
.al-all { --tab-solid:var(--m-primary); --tab-dark:var(--m-primary-deep); --tab-tint:var(--m-primary-soft); --tab-line: rgba(22, 119, 255, 0.3); }
/* 暗色模式：tint 压深、dark 提亮，solid 保持辨识度 */
html[data-theme="dark"] .al-large { --tab-dark:var(--m-green-soft); --tab-tint: rgba(82, 196, 26, 0.16); --tab-line: rgba(82, 196, 26, 0.4); }
html[data-theme="dark"] .al-dream { --tab-dark:var(--m-amber-soft); --tab-tint: rgba(250, 173, 20, 0.16); --tab-line: rgba(250, 173, 20, 0.42); }
html[data-theme="dark"] .al-justice { --tab-dark:var(--m-red); --tab-tint: rgba(245, 34, 45, 0.16); --tab-line: rgba(245, 34, 45, 0.4); }
html[data-theme="dark"] .al-dragon { --tab-dark:var(--m-primary); --tab-tint: rgba(114, 46, 209, 0.2); --tab-line: rgba(114, 46, 209, 0.42); }
html[data-theme="dark"] .al-xi { --tab-dark:var(--m-green); --tab-tint: rgba(19, 194, 194, 0.16); --tab-line: rgba(19, 194, 194, 0.4); }
html[data-theme="dark"] .al-unknown, html[data-theme="dark"] .al-other { --tab-dark:var(--m-text3); --tab-tint: rgba(148, 163, 184, 0.14); --tab-line: rgba(148, 163, 184, 0.3); }
html[data-theme="dark"] .al-all { --tab-dark:var(--m-primary); --tab-tint: rgba(22, 119, 255, 0.18); --tab-line: rgba(22, 119, 255, 0.4); }
/* 卡片流通用类（m-scards/m-grprow/m-scard/m-scard-grid 等）已提升至 mobile.css 全局，
   供蟠桃 / 营地等面板共用；下方只保留盐场特有的类。 */
/* 区服灰块 */
.m-scard-server {
  flex: none; padding: 1px 6px; border-radius: 4px;
  background: var(--m-bg); color: var(--m-text2);
  font-size: 11px; font-weight: 600; line-height: 1.6; white-space: nowrap;
}
.m-scard-badge {
  flex: none; padding: 1px 6px; border-radius: 8px;
  font-size: 11px; font-weight: 700; color: var(--m-primary); background: var(--m-blue-soft);
  white-space: nowrap;
}
.m-scard-alliance {
  margin-left: auto; flex: none; padding: 1px 8px; border-radius: 8px;
  font-size: 11px; font-weight: 700; line-height: 1.6; white-space: nowrap;
  background: var(--tab-tint); color: var(--tab-dark); border: 1px solid var(--tab-line);
}
.m-scard-alliance.editable { cursor: pointer; }
/* 编辑模式排名输入 */
.m-rank-input {
  flex: none; width: 42px; height: 26px; border-radius: 4px;
  border: 1px solid var(--m-primary); background: var(--m-card);
  color: var(--m-text); font-size: 12px; font-weight: 700; text-align: center;
  font-family: inherit; padding: 0 2px;
}
/* ---------- 盐场战报版式（11-01 按用户参考图重做）
   结构：抬头 + 一行六格数字带 + 2 列×3 行榜单 + 成员明细表。
   配色不用参考图的紫/金，全部走站内变量：行动蓝只做强调，语义色固定
   （击杀红 / 攻城蓝 / 复活丹绿 / K/D 主色），浅灰底一律 --m-bg，分割线 --m-band。 ---------- */

/* 抬头：俱乐部 + 期间，右侧「参战 N 人」胶囊 */
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

/* 数字带：六格一行，格间一条竖线（整块 band 底，不做卡片套卡片） */
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
.m-rstat-v.is-build { color: var(--m-blue); }
.m-rstat-v.is-revive { color: var(--m-green); }
.m-rstat-v.is-kd { color: var(--m-primary); }

/* 榜单：2 列 × 3 行，卡内 band 底、无边框 */
.m-rk-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.m-rk-card { background: var(--m-bg); border-radius: var(--m-r-md); padding: 8px 9px; min-width: 0; }
.m-rk-t { font-size: 11px; font-weight: 700; color: var(--m-text3); margin-bottom: 5px; }
.m-rk-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; min-width: 0; }
.m-rk-no {
  flex: none; width: 14px; text-align: center;
  font-size: 11.5px; font-weight: 800; color: var(--m-text3);
  font-variant-numeric: tabular-nums;
}
/* 名次 1/2/3 = 金银铜（用户 11-01 明确：前面的名次不要跟主题色）
   ★ 暗色下必须 !important：App.vue 的 `html[data-theme="dark"] *{color:#fff}` 是 (0,1,1)，
     这两条虽然 (0,3,1) 更高，但 HMR/打包顺序里被后置时仍会翻车，加 !important 一次收口。 */
.m-rk-no.n1,
.m-rtd-no.n1 { color: #b8860b; }
.m-rk-no.n2,
.m-rtd-no.n2 { color: #6b7d8d; }
.m-rk-no.n3,
.m-rtd-no.n3 { color: #a9714b; }
html[data-theme="dark"] .m-rk-no.n1,
html[data-theme="dark"] .m-rtd-no.n1 { color: #ffd77a !important; }
html[data-theme="dark"] .m-rk-no.n2,
html[data-theme="dark"] .m-rtd-no.n2 { color: #c9d6e5 !important; }
html[data-theme="dark"] .m-rk-no.n3,
html[data-theme="dark"] .m-rtd-no.n3 { color: #e5b083 !important; }

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
/* 榜上的数值跟主题色走（用户 11-01 原话：「说的是后面的数字」）——
   原来这里是 --m-text 深黑，跟右侧一列数字挤在一起分不清主次 */
.m-rk-v { flex: none; font-size: 12px; font-weight: 700; color: var(--m-primary); font-variant-numeric: tabular-nums; }

/* 明细表：7 列固定宽，数值列右对齐 */
.m-rtable { margin-top: 2px; }
.m-rthead,
.m-rtr {
  display: grid;
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
.m-rtr.is-tap { cursor: pointer; }
.m-rtr.is-tap:active { background: var(--m-bg); }
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
.m-rtd-v.is-build { color: var(--m-blue); }
.m-rtd-v.is-revive { color: var(--m-green); }
.m-rtd-v.is-kd { color: var(--m-primary); }

/* MVP 徽标：跟在成员名字后面（用户 11-01 第二次调整，原先贴在行右上角会压住 K/D 数字） */
.m-mvp-tag {
  flex: none; height: 14px; padding: 0 5px; border-radius: 3px;
  display: inline-flex; align-items: center;
  font-size: 8px; font-weight: 800; letter-spacing: 0.3px; line-height: 1;
  color: var(--m-on-primary); background: var(--m-primary);
}
/* 暗色 --m-primary 是浅蓝 #6bc0ff，字必须回到 --m-on-primary（深色），
   否则被 App.vue 的通配 #fff 刷成「浅蓝底 + 白字」 */
html[data-theme="dark"] .m-mvp-tag { color: var(--m-on-primary) !important; }

/* 月报逐日展开：与表格同宽，缩进对齐成员列 */
.m-rsub { padding: 2px 4px 8px; border-bottom: 1px solid var(--m-band); }
.m-rsub-row { display: flex; align-items: baseline; gap: 8px; padding: 3px 0; }
.m-rsub-d {
  flex: none; width: 46px; font-size: 10.5px; font-weight: 700; color: var(--m-text3);
  font-variant-numeric: tabular-nums;
}
.m-rsub-x { flex: 1; min-width: 0; font-size: 11px; color: var(--m-text2); font-variant-numeric: tabular-nums; }

@media (max-width: 359px) {
  .m-rstat-v { font-size: 14px; }
  .m-rstat-k { font-size: 9.5px; }
  .m-rthead,
  .m-rtr { grid-template-columns: 26px minmax(0, 1fr) 28px 28px 28px 34px 34px; }
  .m-rk-nm { font-size: 11px; }
}
/* 月战绩逐日展开 */
.m-daylist { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.m-dayc {
  font-size: 10.5px; color: var(--m-text2); background: var(--m-bg);
  border: 1px solid var(--m-border); border-radius: 8px; padding: 3px 8px;
}
.m-dayc b { color: var(--m-text); margin-right: 6px; }
/* 盐场地图画布 */
.m-map-view {
  position: relative; width: 100%; height: 55vh; min-height: 320px;
  overflow: hidden; border-radius: 8px; border: 1px solid var(--m-border);
  background: var(--m-bg); touch-action: none;
}
.m-map-stage { position: absolute; left: 0; top: 0; will-change: transform; }
.m-map-stage canvas { display: block; }
/* 抽屉内头像/装备（照抄 ClubPanel） */
.m-sheet .m-trow .m-mava { width: 40px; height: 40px; border-radius: 8px; flex: none; overflow: hidden; }
.m-sheet .m-trow .m-mava img { width: 100%; height: 100%; object-fit: cover; }








/* 联盟选择列表（照抄 ApexPanel 期号列表） */
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
