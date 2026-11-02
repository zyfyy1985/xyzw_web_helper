<template>
  <div class="batch-daily-tasks">
    <div class="main-layout">
      <!-- Left Column -->
      <div class="left-column">
        <!-- 页头整块删掉：标题在移动壳的顶栏里已经有了，这里只剩一个 display:none 的 h2，
             却让「账号列表」卡多吃了 12px 的 margin-top（比定时任务页低一档）。
             4 个动作已经挪到账号列表下方排成一行（先选账号，再动手）。 -->

        <!-- 定时任务：页头条 + 卡片列表（2026-11-02 重做，用户要求「跟 Token 管理一样的卡片形式」）
             原来是「一张 n-card 里塞 N 条 hairline 分隔的列表行」—— 卡套卡、信息全挤在三行里，
             和账号页的卡片语言完全两套。现在一张任务一张卡，结构与 .m-tk-card 对齐：
               ① 首字图标块 + 名称 + 下次执行倒计时，右侧是启用开关
               ② 一条浅底信息行：调度表达式 · 账号数 · 任务数（对应账号卡的备注行）
               ③ 底部两个动作按钮：编辑（主）/ 删除（描边红字）
             数据与动作一个没改：仍然是 scheduledTasks + toggleTaskEnabled / editTask / deleteTask。 -->
        <div v-if="mode === 'schedule'" class="sched-page">
          <div class="sched-bar">
            <span class="sched-bar-t">定时任务</span>
            <button
              type="button"
              class="sched-add-btn"
              aria-label="新增定时任务"
              title="新增定时任务"
              @click="openTaskModal"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5.5v13M5.5 12h13"/></svg>
            </button>
          </div>

          <div
            v-for="task in scheduledTasks"
            :key="task.id"
            class="sched-card"
            :class="{ 'is-off': !task.enabled }"
          >
            <div class="sched-top">
              <span class="sched-ava">{{ (task.name || "任").charAt(0) }}</span>
              <span class="sched-id">
                <span class="sched-nm">{{ task.name }}</span>
                <span class="sched-sub">
                  <i class="sched-dot" />
                  <template v-if="task.enabled">
                    下次执行
                    <em :class="{ 'is-near': taskCountdowns[task.id]?.isNearExecution }">{{
                      taskCountdowns[task.id]?.formatted || "计算中…"
                    }}</em>
                  </template>
                  <template v-else>已暂停</template>
                </span>
              </span>
              <n-switch
                class="sched-sw"
                size="small"
                v-model:value="task.enabled"
                @update:value="toggleTaskEnabled(task.id, $event)"
              />
            </div>

            <div class="sched-info">
              <span class="sched-cron">{{
                task.runType === "daily" ? task.runTime : task.cronExpression
              }}</span>
              <span class="sched-sep">·</span>
              <span>{{ task.selectedTokens.length }} 账号</span>
              <span class="sched-sep">·</span>
              <span>{{ task.selectedTasks.length }} 任务</span>
            </div>

            <div class="sched-act">
              <button type="button" class="m-btn m-btn-p" @click="editTask(task)">编辑</button>
              <button type="button" class="m-btn m-btn-g sched-del" @click="deleteTask(task.id)">删除</button>
            </div>
          </div>

          <div v-if="scheduledTasks.length === 0" class="m-card sched-empty">
            <p class="sched-empty-t">还没有定时任务</p>
            <p class="sched-empty-d">建好一条，到点由服务端自动执行，不用守着这页</p>
            <button type="button" class="m-btn m-btn-p m-btn-block" @click="openTaskModal">
              新建第一个任务
            </button>
          </div>
        </div>

        <!-- Token Selection：整块（标题 / 管理分组 / 分组快选 / 排序 / 全选 / 账号行）
             都由 TokenPicker 渲染 —— 「新增定时任务」向导第 1 步引用的是同一个组件 -->
        <n-card class="token-list-card" v-if="mode !== 'schedule'">
          <TokenPicker
            v-model="selectedTokens"
            title="账号列表"
            manage-label="管理分组"
            :count-text="tokenPickCountText"
            :items="sortedTokens"
            :sort-config="sortConfig"
            :columns="batchSettings.tokenListColumns"
            :groups="tokenGroups"
            :group-selected-ids="selectedGroups"
            :group-counts="tokenGroupCounts"
            groups-title="分组选择"
            clear-groups-label="一键清除所有分组选择"
            @manage-groups="showGroupManageModal = true"
            @toggle-group="(g) => toggleGroupSelection(g.id)"
            @clear-groups="clearAllGroupSelection"
            @sort="toggleSort"
            @open-settings="openSettings"
          />
        </n-card>

        <!-- 4 个动作一排：先选账号再动手，所以放在账号列表下方。
             按 design.md 只有一支蓝 —— 一键日常是唯一实心主按钮，停止/任务模板/设置走中性按钮；
             原来那层 #f8f9fa 灰底 + 1px 边框的盒子也去掉（分层靠白底，不靠边框）。 -->
        <div class="batch-actions" v-if="mode !== 'schedule'">
          <n-button
            type="primary"
            :disabled="isRunning"
            @click="startBatch"
          >
            {{ isRunning ? "执行中..." : "一键日常" }}
          </n-button>
          <n-button :disabled="!isRunning || isStopping" @click="stopBatch">
            {{ isStopping ? "停止中…" : "停止" }}
          </n-button>
          <n-button @click="openTemplateManagerModal">任务模板</n-button>
          <n-button @click="openBatchSettings">
            <template #icon>
              <n-icon>
                <Settings />
              </n-icon>
            </template>
            设置
          </n-button>
        </div>

        <!-- Function List -->
        <n-card title="功能列表" style="margin-top: 16px" v-if="mode !== 'schedule'">
          <!-- 日志弹窗关掉后还得能再打开：卡片标题行右侧留一个小入口 -->
          <template #header-extra>
            <n-button size="tiny" class="log-entry-btn" @click="openLogModal">
              日志{{ logs.length ? ` (${logs.length})` : "" }}
            </n-button>
          </template>
          <n-tabs type="line" animated @click.capture="onPaneClick">
            <n-tab-pane name="daily" tab="日常">
              <n-space>
                <n-button
                  size="small"
                  @click="claimHangUpRewards"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  领取挂机
                </n-button>
                <n-button
                  size="small"
                  @click="batchAddHangUpTime"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  一键加钟
                </n-button>
                <n-button
                  size="small"
                  @click="resetBottles"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  重置罐子
                </n-button>
                <n-button
                  size="small"
                  @click="batchlingguanzi"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  一键领取罐子
                </n-button>
                <n-button
                  size="small"
                  @click="batchclubsign"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  一键俱乐部签到
                </n-button>
                <n-button
                  size="small"
                  @click="batchStudy"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  一键答题
                </n-button>
                <n-button
                  size="small"
                  @click="batcharenafight"
                  :disabled="
                    isRunning ||
                    selectedTokens.length === 0 ||
                    !isarenaActivityOpen
                  "
                >
                  一键竞技场战斗3次
                </n-button>
                <n-button
                  size="small"
                  @click="store_purchase"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  一键黑市采购
                </n-button>
                <n-button
                  size="small"
                  @click="collection_claimfreereward"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  一键领取珍宝阁
                </n-button>
                <n-button
                  size="small"
                  @click="batchGenieSweep"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  一键灯神扫荡
                </n-button>
                <n-popselect
                  :value="campChallengeMode"
                  :options="campChallengeModeOptions"
                  trigger="click"
                  @update:value="onCampChallengeModeChange"
                >
                  <n-button
                    size="small"
                    :disabled="isRunning || selectedTokens.length === 0"
                  >
                    营地挑战({{ campChallengeModeLabel }})
                  </n-button>
                </n-popselect>
                <n-button
                  size="small"
                  @click="batchXuanwuBlessing"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  一键玄武赐福
                </n-button>
              </n-space>
            </n-tab-pane>
            <n-tab-pane name="dungeon" tab="副本">
              <n-space>
                <n-button
                  size="small"
                  @click="climbTower"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  一键爬塔
                </n-button>
                <n-button
                  size="small"
                  @click="batchmengjing"
                  :disabled="
                    isRunning ||
                    selectedTokens.length === 0 ||
                    !ismengjingActivityOpen
                  "
                >
                  一键梦境
                </n-button>
                <n-button
                  size="small"
                  @click="skinChallenge"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  一键换皮闯关
                </n-button>
                <n-button
                  size="small"
                  @click="batchClaimPeachTasks"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  一键领取蟠桃园任务
                </n-button>
                <n-button
                  size="small"
                  @click="batchBuyDreamItems"
                  :disabled="
                    isRunning ||
                    selectedTokens.length === 0 ||
                    !ismengjingActivityOpen
                  "
                >
                  一键购买梦境商品
                </n-button>              
                <n-popselect
                  :value="footballPick"
                  :options="footballPickOptions"
                  trigger="click"
                  @update:value="onFootballPickChange"
                >
                  <n-button
                    size="small"
                    :disabled="isRunning || selectedTokens.length === 0"
                  >
                    一键竞猜({{ footballPickLabel }})
                  </n-button>
                </n-popselect>
                <n-button
                  size="small"
                  :disabled="isRunning || selectedTokens.length === 0"
                  @click="batchApexGuess()"
                >
                  逐鹿盐山竞猜
                </n-button>
              </n-space>
            </n-tab-pane>
            <n-tab-pane name="baoku" tab="宝库">
              <n-space>
                <n-button
                  size="small"
                  @click="batchbaoku13"
                  :disabled="
                    isRunning ||
                    selectedTokens.length === 0 ||
                    !isbaokuActivityOpen
                  "
                >
                  一键宝库前3层
                </n-button>
                <n-button
                  size="small"
                  @click="batchbaoku45"
                  :disabled="
                    isRunning ||
                    selectedTokens.length === 0 ||
                    !isbaokuActivityOpen
                  "
                >
                  一键宝库4,5层
                </n-button>
              </n-space>
            </n-tab-pane>
            <n-tab-pane name="weirdTower" tab="怪异塔">
              <n-space>
                <n-input-number
                  v-model:value="weirdTowerMaxClimb"
                  class="weird-tower-count-input"
                  size="small"
                  :min="1"
                  :precision="0"
                  :show-button="false"
                  placeholder="次数"
                  :disabled="isRunning"
                />
                <span class="weird-tower-count-unit">次</span>
                <n-button
                  size="small"
                  @click="climbWeirdTower"
                  :disabled="
                    isRunning ||
                    selectedTokens.length === 0 ||
                    !isWeirdTowerActivityOpen
                  "
                >
                  一键爬怪异塔
                </n-button>
                <n-button
                  size="small"
                  @click="batchUseItems"
                  :disabled="
                    isRunning ||
                    selectedTokens.length === 0 ||
                    !isWeirdTowerActivityOpen
                  "
                >
                  一键使用怪异塔道具
                </n-button>
                <n-button
                  size="small"
                  @click="batchMergeItems"
                  :disabled="
                    isRunning ||
                    selectedTokens.length === 0 ||
                    !isWeirdTowerActivityOpen
                  "
                >
                  一键怪异塔合成
                </n-button>
                <n-button
                  size="small"
                  @click="batchClaimFreeEnergy"
                  :disabled="
                    isRunning ||
                    selectedTokens.length === 0 ||
                    !isWeirdTowerActivityOpen
                  "
                >
                  一键领取怪异塔免费道具
                </n-button>
              </n-space>
            </n-tab-pane>
            <n-tab-pane name="resource" tab="资源">
              <n-space>
                <n-button
                  size="small"
                  @click="openHelperModal('box')"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  批量开箱
                </n-button>
                <n-button
                  size="small"
                  @click="openHelperModal('pointsBox')"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  按积分开箱
                </n-button>
                <n-button
                  size="small"
                  @click="batchClaimBoxPointReward"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  领取宝箱积分
                </n-button>
                <n-button
                  size="small"
                  @click="openHelperModal('fish')"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  批量钓鱼
                </n-button>
                <n-button
                  size="small"
                  @click="openHelperModal('recruit')"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  批量招募
                </n-button>
                <n-button
                  size="small"
                  @click="batchHeroUpgrade"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  一键英雄升星
                </n-button>
                <n-button
                  size="small"
                  @click="batchBookUpgrade"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  一键图鉴升星
                </n-button>
                <n-button
                  size="small"
                  @click="batchClaimStarRewards"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  一键领取图鉴奖励
                </n-button>
                <n-button
                  size="small"
                  @click="legion_storebuygoods"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  一键购买四圣碎片
                </n-button>
                <n-button
                  size="small"
                  @click="legionStoreBuySkinCoins"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  一键购买俱乐部5皮肤币
                </n-button>
              </n-space>
            </n-tab-pane>
            <n-tab-pane name="legacy" tab="功法">
              <n-space>
                <n-button
                  size="small"
                  @click="batchLegacyClaim"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  批量功法残卷领取
                </n-button>
                <n-button
                  size="small"
                  @click="showLegacyGiftModal = true"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  批量功法残卷赠送
                </n-button>
              </n-space>
            </n-tab-pane>
            <n-tab-pane name="monthly" tab="月度">
              <n-space>
                <n-button
                  size="small"
                  @click="batchTopUpFish"
                  :disabled="isRunning || selectedTokens.length === 0"
                >
                  一键钓鱼补齐
                </n-button>
                <n-button
                  size="small"
                  @click="batchTopUpArena"
                  :disabled="
                    isRunning ||
                    selectedTokens.length === 0 ||
                    !isarenaActivityOpen
                  "
                >
                  一键竞技场补齐
                </n-button>
                <n-button
                  size="small"
                  @click="openWarGuessModal"
                  :disabled="
                    isRunning ||
                    selectedTokens.length === 0 ||
                    !isWarGuessActivityOpen
                  "
                  :title="isWarGuessActivityOpen ? '' : warGuessActivityTip"
                >
                  月赛助威
                </n-button>
              </n-space>
            </n-tab-pane>
          </n-tabs>
        </n-card>
      </div>

      <!-- 执行日志：移动端不再常驻右栏（占掉半屏还得滚），改成弹窗 ——
           点任意功能按钮 / 一键日常时自动弹出，右上角可关闭；
           用户关掉后本轮不再自动打扰（点下一个任务会重新弹）。 -->
      <n-modal
        v-model:show="showLogModal"
        preset="card"
        class="m-log-modal"
        :title="
          currentRunningTokenName
            ? `正在执行: ${currentRunningTokenName}`
            : '执行日志'
        "
        style="width: 92%; max-width: 460px"
      >
        <template #header-extra>
          <div class="log-header-controls">
            <n-button size="tiny" @click="clearLogs">清空</n-button>
            <n-button size="tiny" @click="copyLogs">复制</n-button>
          </div>
        </template>
        <div class="log-toolbar">
          <n-checkbox v-model:checked="autoScrollLog" size="small">
            自动滚动
          </n-checkbox>
          <n-checkbox v-model:checked="filterErrorsOnly" size="small">
            只看错误
          </n-checkbox>
          <n-tag v-if="errorCount > 0" type="error" size="small">
            {{ errorCount }} 个错误
          </n-tag>
          <span class="log-count">
            {{ logs.length }}/{{ batchSettings.maxLogEntries || 1000 }}
          </span>
        </div>
        <n-progress
          type="line"
          :percentage="currentProgress"
          :indicator-placement="'inside'"
          processing
        />
        <div class="log-container" ref="logContainer">
          <div
            v-for="(log, index) in filteredLogs"
            :key="index"
            class="log-item"
            :class="log.type"
          >
            <span class="time">{{ log.time }}</span>
            <span class="message">{{ log.message }}</span>
          </div>
        </div>
      </n-modal>
    </div>

    <!-- Settings Modal -->
    <!-- 任务设置：按 design.md 重排 —— 11 行统一成「label 左 / 控件右」的 44px 行，
         阵容 / 自动执行 两节靠小节标题 + 间距分区，不画分隔线 -->
    <n-modal
      v-model:show="showSettingsModal"
      preset="card"
      :title="`任务设置 - ${currentSettingsTokenName}`"
      class="m-setmodal"
      style="width: 90%; max-width: 400px"
    >
      <div class="sm-body">
        <section class="sm-sec">
          <div class="sm-sec-title">阵容</div>
          <div class="sm-row">
            <span class="sm-label">竞技场阵容</span>
            <n-select
              v-model:value="currentSettings.arenaFormation"
              :options="formationOptions"
              class="sm-ctl"
            />
          </div>
          <div class="sm-row">
            <span class="sm-label">爬塔阵容</span>
            <n-select
              v-model:value="currentSettings.towerFormation"
              :options="formationOptions"
              class="sm-ctl"
            />
          </div>
          <div class="sm-row">
            <span class="sm-label">BOSS阵容</span>
            <n-select
              v-model:value="currentSettings.bossFormation"
              :options="formationOptions"
              class="sm-ctl"
            />
          </div>
          <div class="sm-row">
            <span class="sm-label">BOSS次数</span>
            <n-select
              v-model:value="currentSettings.bossTimes"
              :options="bossTimesOptions"
              class="sm-ctl"
            />
          </div>
        </section>

        <section class="sm-sec">
          <div class="sm-sec-title">自动执行</div>
          <div class="sm-row">
            <span class="sm-label">领罐子</span>
            <n-switch v-model:value="currentSettings.claimBottle" />
          </div>
          <div class="sm-row">
            <span class="sm-label">领挂机</span>
            <n-switch v-model:value="currentSettings.claimHangUp" />
          </div>
          <div class="sm-row">
            <span class="sm-label">竞技场</span>
            <n-switch v-model:value="currentSettings.arenaEnable" />
          </div>
          <div class="sm-row">
            <span class="sm-label">开宝箱</span>
            <n-switch v-model:value="currentSettings.openBox" />
          </div>
          <div class="sm-row">
            <span class="sm-label">领取邮件奖励</span>
            <n-switch v-model:value="currentSettings.claimEmail" />
          </div>
          <div class="sm-row">
            <span class="sm-label">黑市购买物品</span>
            <n-switch v-model:value="currentSettings.blackMarketPurchase" />
          </div>
          <div class="sm-row">
            <span class="sm-label">付费招募</span>
            <n-switch v-model:value="currentSettings.payRecruit" />
          </div>
        </section>
      </div>
      <div class="sm-foot">
        <n-button type="primary" @click="saveSettings">保存设置</n-button>
      </div>
    </n-modal>

    <!-- Task Template Modal -->
    <n-modal
      v-model:show="showTaskTemplateModal"
      preset="card"
      :title="currentTemplateId ? '编辑任务模板' : '任务模板设置'"
      class="m-setmodal"
      style="width: 90%; max-width: 400px"
    >
      <div class="sm-body">
        <section class="sm-sec">
          <div class="sm-sec-title">基础</div>
          <div class="sm-field">
            <span class="sm-label">模板名称</span>
            <n-input
              v-model:value="currentTemplateName"
              placeholder="给这套设置起个名字"
            />
          </div>
        </section>

        <section class="sm-sec">
          <div class="sm-sec-title">阵容</div>
          <div class="sm-row">
            <span class="sm-label">竞技场阵容</span>
            <n-select
              v-model:value="currentTemplate.arenaFormation"
              :options="formationOptions"
              class="sm-ctl"
            />
          </div>
          <div class="sm-row">
            <span class="sm-label">爬塔阵容</span>
            <n-select
              v-model:value="currentTemplate.towerFormation"
              :options="formationOptions"
              class="sm-ctl"
            />
          </div>
          <div class="sm-row">
            <span class="sm-label">BOSS阵容</span>
            <n-select
              v-model:value="currentTemplate.bossFormation"
              :options="formationOptions"
              class="sm-ctl"
            />
          </div>
          <div class="sm-row">
            <span class="sm-label">BOSS次数</span>
            <n-select
              v-model:value="currentTemplate.bossTimes"
              :options="bossTimesOptions"
              class="sm-ctl"
            />
          </div>
        </section>

        <section class="sm-sec">
          <div class="sm-sec-title">自动执行</div>
          <div class="sm-row">
            <span class="sm-label">领罐子</span>
            <n-switch v-model:value="currentTemplate.claimBottle" />
          </div>
          <div class="sm-row">
            <span class="sm-label">领挂机</span>
            <n-switch v-model:value="currentTemplate.claimHangUp" />
          </div>
          <div class="sm-row">
            <span class="sm-label">竞技场</span>
            <n-switch v-model:value="currentTemplate.arenaEnable" />
          </div>
          <div class="sm-row">
            <span class="sm-label">开宝箱</span>
            <n-switch v-model:value="currentTemplate.openBox" />
          </div>
          <div class="sm-row">
            <span class="sm-label">领取邮件奖励</span>
            <n-switch v-model:value="currentTemplate.claimEmail" />
          </div>
          <div class="sm-row">
            <span class="sm-label">黑市购买物品</span>
            <n-switch v-model:value="currentTemplate.blackMarketPurchase" />
          </div>
          <div class="sm-row">
            <span class="sm-label">付费招募</span>
            <n-switch v-model:value="currentTemplate.payRecruit" />
          </div>
        </section>
      </div>
      <div class="sm-foot">
        <n-button @click="showTaskTemplateModal = false">取消</n-button>
        <n-button type="primary" @click="saveTaskTemplate">保存模板</n-button>
      </div>
    </n-modal>

    <!-- Apply Template Modal -->
    <n-modal
      v-model:show="showApplyTemplateModal"
      preset="card"
      title="应用任务模板"
      class="m-setmodal m-tplap"
      style="width: 90%; max-width: 600px"
    >
      <div class="sm-body">
        <section class="sm-sec">
          <div class="sm-sec-title">模板</div>
          <div class="sm-field">
            <span class="sm-label">要应用的模板</span>
            <n-select
              v-model:value="selectedTemplateId"
              :options="taskTemplates"
              label-field="name"
              value-field="id"
              placeholder="请选择要应用的模板"
            />
          </div>
        </section>

        <section class="sm-sec">
          <div class="sm-sec-title">账号</div>
          <div class="ta-groups">
            <span class="ta-groups-k">按分组快速选择</span>
            <div class="ta-chips">
              <button
                v-for="group in tokenGroups"
                :key="group.id"
                type="button"
                class="ta-chip"
                :class="{ 'is-on': isGroupPicked(group.id) }"
                :style="{ '--gc': group.color || 'var(--m-primary)' }"
                @click="toggleGroupForApply(group.id)"
              >
                <i class="ta-chip-dot"></i>
                <span class="ta-chip-t">{{ group.name }}</span>
              </button>
              <span v-if="tokenGroups.length === 0" class="ta-chip is-off"
                >暂无分组</span
              >
            </div>
          </div>
          <div class="ta-bar">
            <n-checkbox
              :checked="isAllSelectedForApply"
              :indeterminate="isIndeterminateForApply"
              @update:checked="handleSelectAllForApply"
              >全选</n-checkbox
            >
            <span class="ta-count"
              >已选 {{ selectedTokensForApply.length }} /
              {{ sortedTokens.length }}</span
            >
          </div>
          <n-checkbox-group v-model:value="selectedTokensForApply">
            <n-grid :cols="2" :x-gap="12" :y-gap="8">
              <n-grid-item v-for="token in sortedTokens" :key="token.id">
                <n-checkbox :value="token.id">{{ token.name }}</n-checkbox>
              </n-grid-item>
            </n-grid>
          </n-checkbox-group>
        </section>
      </div>
      <div class="sm-foot">
        <n-button @click="showApplyTemplateModal = false">取消</n-button>
        <n-button
          type="primary"
          :disabled="!selectedTemplateId || selectedTokensForApply.length === 0"
          @click="applyTemplate"
          >应用模板</n-button
        >
      </div>
    </n-modal>

    <!-- Template Manager Modal -->
    <n-modal
      v-model:show="showTemplateManagerModal"
      preset="card"
      title="任务模板管理"
      class="m-tplm"
      style="width: 90%; max-width: 800px"
    >
      <div class="tm-body">
        <n-input
          v-model:value="templateSearchKeyword"
          placeholder="搜索模板"
          clearable
          class="tm-search"
        />
        <div class="tm-acts">
          <n-button type="primary" @click="openNewTemplateModal"
            >新增模板</n-button
          >
          <n-button @click="openApplyTemplateModal">应用模板</n-button>
        </div>
        <button type="button" class="tm-ref" @click="openAccountTemplateModal">
          <span class="tm-ref-k">查看账号模板引用</span>
          <span class="tm-ref-a">›</span>
        </button>

        <div class="tm-list">
          <div
            v-for="template in filteredTaskTemplates"
            :key="template.id"
            class="tm-row"
          >
            <div class="tm-main">
              <span class="tm-name">{{ template.name }}</span>
              <span class="tm-meta"
                >创建 {{ formatShortTime(template.createdAt) }}</span
              >
            </div>
            <div class="tm-ops">
              <button
                type="button"
                class="tm-op"
                @click="openEditTemplateModal(template)"
              >
                编辑
              </button>
              <button
                type="button"
                class="tm-op is-danger"
                @click="deleteTaskTemplate(template.id)"
              >
                删除
              </button>
            </div>
          </div>
          <div v-if="filteredTaskTemplates.length === 0" class="tm-empty">
            <span class="tm-empty-t">{{
              templateSearchKeyword.trim() ? "没有匹配的模板" : "暂无模板"
            }}</span>
            <span class="tm-empty-d">{{
              templateSearchKeyword.trim()
                ? "换个关键词再试一次"
                : "「新增模板」能把阵容和自动执行开关存成一套，之后一键套到任意账号"
            }}</span>
          </div>
        </div>
      </div>
    </n-modal>

    <!-- Account Template References Modal -->
    <n-modal
      v-model:show="showAccountTemplateModal"
      preset="card"
      title="账号模板引用查看"
      class="m-tplref"
      style="width: 90%; max-width: 800px"
    >
      <div class="tr-body">
        <div class="tr-head">
          <span class="tr-count"
            >共 {{ filteredAccountTemplates.length }} 个账号</span
          >
          <n-select
            v-model:value="selectedTemplateForFilter"
            :options="taskTemplates"
            label-field="name"
            value-field="id"
            placeholder="全部模板"
            class="tr-filter"
            @update:value="filterAccountTemplates"
          />
        </div>
        <div class="tr-list">
          <div
            v-for="item in filteredAccountTemplates"
            :key="item.tokenId"
            class="tr-row"
          >
            <span class="tr-name">{{ item.tokenName }}</span>
            <span class="tr-tag" :class="{ 'is-none': !item.templateId }">{{
              item.templateName
            }}</span>
          </div>
          <div v-if="filteredAccountTemplates.length === 0" class="tr-empty">
            暂无账号数据
          </div>
        </div>
      </div>
    </n-modal>

    <!-- Legacy Gift Modal -->
    <n-modal
      v-model:show="showLegacyGiftModal"
      preset="card"
      title="批量功法残卷赠送"
      style="width: 90%; max-width: 600px"
    >
      <div class="settings-content">
        <div class="settings-grid">
          <!-- 接收者ID输入 -->
          <div class="setting-item">
            <label class="setting-label">接收者ID</label>
            <n-space>
              <n-input-number
                v-model:value="recipientIdInput"
                placeholder="ID"
                :show-button="false"
                @update:value="clearRecipientError"
                style="width: 180px"
              />
              <n-input
                v-model:value="securityPassword"
                placeholder="请输入安全密码"
                type="password"
                @input="clearRecipientError"
                style="width: 180px"
              />
              <n-button
                type="primary"
                @click="queryRecipientInfo"
                :disabled="
                  !recipientIdInput || isQueryingRecipient || !securityPassword
                "
              >
                查询
              </n-button>
            </n-space>
            <n-text
              v-if="recipientIdError"
              type="error"
              style="margin-top: 5px; display: block"
            >
              {{ recipientIdError }}
            </n-text>
          </div>

          <!-- 接收者信息展示 -->
          <div class="setting-item" v-if="recipientInfo">
            <label class="setting-label">接收者信息</label>
            <div
              class="recipient-info"
              style="
                background: var(--m-bg);
                padding: 16px;
                border-radius: 8px;
                border: 1px solid var(--m-border);
                display: flex;
                align-items: flex-start;
                gap: 16px;
                transition: all 0.3s ease;
              "
            >
              <!-- 头像部分 -->
              <div
                class="avatar-container"
                style="
                  position: relative;
                  width: 80px;
                  height: 80px;
                  border-radius: var(--m-r-md);
                  overflow: hidden;
                  background: linear-gradient(135deg, var(--m-primary) 0%, var(--m-primary-deep) 100%);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  transition: all 0.3s ease;
                "
              >
                <img
                  v-if="recipientInfo.avatarUrl && !avatarLoadError"
                  :src="recipientInfo.avatarUrl"
                  alt="角色头像"
                  style="
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    transition: all 0.3s ease;
                  "
                  @error="handleAvatarError"
                  @load="handleAvatarLoad"
                />
                <!-- 头像加载失败或未设置时的 fallback -->
                <div
                  v-else
                  class="avatar-fallback"
                  style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    height: 100%;
                    color: white;
                    font-size: 24px;
                    font-weight: bold;
                    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                  "
                >
                  {{ (recipientInfo.name || "未知角色")[0] || "?" }}
                </div>
                <!-- 加载指示器 -->
                <div
                  v-if="isAvatarLoading"
                  class="avatar-loading"
                  style="
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: var(--m-r-md);
                  "
                >
                  <div
                    class="loading-spinner"
                    style="
                      width: 30px;
                      height: 30px;
                      border: 3px solid rgba(255, 255, 255, 0.3);
                      border-top: 3px solid white;
                      border-radius: var(--m-r-md);
                      animation: spin 1s linear infinite;
                    "
                  ></div>
                </div>
              </div>

              <!-- 角色信息部分 -->
              <div class="role-info" style="flex: 1; min-width: 0">
                <div
                  style="
                    margin-bottom: 12px;
                    font-size: 18px;
                    font-weight: bold;
                    color: var(--m-text);
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
                  "
                >
                  {{ recipientInfo.name || "未知角色" }}
                </div>
                <div
                  class="role-info-grid"
                  style="
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                  "
                >
                  <div class="info-item">
                    <div
                      class="info-label"
                      style="
                        font-size: 12px;
                        color: var(--m-text3);
                        margin-bottom: 2px;
                      "
                    >
                      角色ID
                    </div>
                    <div
                      class="info-value"
                      style="font-size: 14px; font-weight: 500; color: var(--m-text)"
                    >
                      {{ recipientInfo.roleId }}
                    </div>
                  </div>
                  <div class="info-item">
                    <div
                      class="info-label"
                      style="
                        font-size: 12px;
                        color: var(--m-text3);
                        margin-bottom: 2px;
                      "
                    >
                      服务器
                    </div>
                    <div
                      class="info-value"
                      style="font-size: 14px; font-weight: 500; color: var(--m-text)"
                    >
                      {{ recipientInfo.serverName }}
                    </div>
                  </div>
                  <div class="info-item">
                    <div
                      class="info-label"
                      style="
                        font-size: 12px;
                        color: var(--m-text3);
                        margin-bottom: 2px;
                      "
                    >
                      战力
                    </div>
                    <div
                      class="info-value"
                      style="font-size: 16px; font-weight: 600; color: var(--m-primary)"
                    >
                      {{ recipientInfo.power }} {{ recipientInfo.powerUnit }}
                    </div>
                  </div>
                  <div class="info-item">
                    <div
                      class="info-label"
                      style="
                        font-size: 12px;
                        color: var(--m-text3);
                        margin-bottom: 2px;
                      "
                    >
                      军团
                    </div>
                    <div
                      class="info-value"
                      style="font-size: 14px; font-weight: 500; color: var(--m-text)"
                    >
                      {{ recipientInfo.legionName || "无" }}
                    </div>
                  </div>
                  <div class="info-item" style="grid-column: 1 / -1">
                    <div
                      class="info-label"
                      style="
                        font-size: 12px;
                        color: var(--m-text3);
                        margin-bottom: 2px;
                      "
                    >
                      军团ID
                    </div>
                    <div
                      class="info-value"
                      style="font-size: 14px; font-weight: 500; color: var(--m-text)"
                    >
                      {{ recipientInfo.legionId || "无" }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 赠送数量 -->
          <div class="setting-item">
            <label class="setting-label">赠送数量</label>
            <n-input-number
              v-model:value="giftQuantity"
              :min="1"
              :max="1000"
              :step="1"
              placeholder="请输入赠送数量"
            />
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="modal-actions" style="margin-top: 20px; text-align: right">
          <n-button
            @click="showLegacyGiftModal = false"
            style="margin-right: 12px"
            >取消</n-button
          >
          <n-button
            type="primary"
            @click="confirmLegacyGift"
            :disabled="!recipientIdInput || !recipientInfo"
          >
            开始赠送
          </n-button>
        </div>
      </div>
    </n-modal>

    <!-- Helper Modal (开箱/钓鱼/招募/按积分开箱) -->
    <n-modal
      v-model:show="showHelperModal"
      preset="card"
      :title="helperModalTitle"
      style="width: 90%; max-width: 400px"
    >
      <div class="settings-content">
        <div class="settings-grid">
          <div class="setting-item" v-if="helperType === 'box'">
            <label class="setting-label">宝箱类型</label>
            <n-select
              v-model:value="helperSettings.boxType"
              :options="boxTypeOptions"
              size="small"
            />
          </div>
          <div class="setting-item" v-if="helperType === 'fish'">
            <label class="setting-label">鱼竿类型</label>
            <n-select
              v-model:value="helperSettings.fishType"
              :options="fishTypeOptions"
              size="small"
            />
          </div>
          <div class="setting-item" v-if="helperType === 'pointsBox'">
            <label class="setting-label">目标积分</label>
            <n-input-number
              v-model:value="helperSettings.targetPoints"
              :min="1"
              :max="1000000"
              :step="100"
              size="small"
              style="width: 100%"
            />
          </div>
          <n-alert
            v-if="helperType === 'pointsBox'"
            type="info"
            style="margin-bottom: 12px"
          >
            开箱优先级: 木质宝箱(保留200个) → 青铜宝箱 → 黄金宝箱 → 铂金宝箱<br />
            积分: 木质=1分, 青铜=10分, 黄金=20分, 铂金=50分
          </n-alert>
          <div class="setting-item" v-if="helperType !== 'pointsBox'">
            <label class="setting-label">消耗数量（10的倍数）</label>
            <n-input-number
              v-model:value="helperSettings.count"
              :min="10"
              :max="10000"
              :step="10"
              size="small"
            />
          </div>
        </div>
        <div class="modal-actions" style="margin-top: 20px; text-align: right">
          <n-button @click="showHelperModal = false" style="margin-right: 12px"
            >取消</n-button
          >
          <n-button type="primary" @click="executeHelper">开始执行</n-button>
        </div>
      </div>
    </n-modal>

    <!-- Dream Buy Modal -->
    <!-- 原来：蓝色 info 告示条 + 橙色实心「一键勾选金币商品」（橙 = 第二个行动色）+ 三列勾选网格；
         现在：说明收成一块 band，主行动唯一蓝，另两个退成次要键；商品按商人分节，
         节标题带「已选 / 总数」，网格 2 列 —— 勾选框与商品名之间有呼吸感，拇指也好点。 -->
    <n-modal
      v-model:show="showDreamBuyModal"
      preset="card"
      title="梦境商品购买配置"
      class="m-setmodal m-dreambuy"
      style="width: 90%; max-width: 600px"
    >
      <div class="db-body">
        <p class="db-note">
          只会购买下面勾选的商品；商店里刷出列表之外的商品不会买。
        </p>
        <div class="db-acts">
          <n-button type="primary" @click="selectGoldItems"
            >勾选金币商品</n-button
          >
          <n-button @click="selectAllItems">全选</n-button>
          <n-button @click="clearAllItems">清空</n-button>
        </div>
        <section class="db-sec" v-for="(merchant, id) in merchantConfig" :key="id">
          <div class="db-sec-title">
            <span class="db-sec-k">{{ merchant.name }}</span>
            <span class="db-sec-n"
              >{{ countPickedOf(id) }} / {{ merchant.items.length }}</span
            >
          </div>
          <n-grid :cols="2" :x-gap="12" :y-gap="0">
            <n-grid-item v-for="(item, index) in merchant.items" :key="index">
              <n-checkbox
                :value="`${id}-${index}`"
                :checked="dreamBuyList.includes(`${id}-${index}`)"
                @update:checked="
                  (checked) => toggleDreamItem(`${id}-${index}`, checked)
                "
              >
                {{ item }}
              </n-checkbox>
            </n-grid-item>
          </n-grid>
        </section>
      </div>
      <div class="sm-foot">
        <n-button @click="showDreamBuyModal = false">取消</n-button>
        <n-button type="primary" @click="saveDreamBuyConfig">保存配置</n-button>
      </div>
    </n-modal>

    <!-- Tasks List Modal -->
    <n-modal
      v-model:show="showTasksModal"
      preset="card"
      title="定时任务列表"
      style="width: 90%; max-width: 800px"
    >
      <div class="tasks-list" style="max-height: 600px; overflow-y: auto">
        <div
          v-for="task in scheduledTasks"
          :key="task.id"
          class="task-item"
          style="
            margin-bottom: 16px;
            padding: 12px;
            border: 1px solid var(--m-border);
            border-radius: 8px;
          "
        >
          <div
            style="
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 8px;
            "
          >
            <div style="font-weight: bold">{{ task.name }}</div>
            <n-switch
              v-model:value="task.enabled"
              @update:value="toggleTaskEnabled(task.id, $event)"
            >
            </n-switch>
          </div>
          <div style="margin-bottom: 4px">
            <span style="color: var(--m-text3)">运行类型：</span>
            <span>{{
              task.runType === "daily" ? "每天固定时间" : "Cron表达式"
            }}</span>
          </div>
          <div style="margin-bottom: 4px">
            <span style="color: var(--m-text3)">运行时间：</span>
            <span>{{
              task.runType === "daily" ? task.runTime : task.cronExpression
            }}</span>
          </div>
          <div style="margin-bottom: 4px">
            <span style="color: var(--m-text3)">下次执行：</span>
            <span
              :style="{
                fontWeight: 'bold',
                color: taskCountdowns[task.id]?.isNearExecution
                  ? 'var(--m-red)'
                  : 'var(--m-primary)',
              }"
            >
              {{
                task.enabled
                  ? taskCountdowns[task.id]?.formatted || "计算中..."
                  : "已禁用"
              }}
            </span>
          </div>
          <div style="margin-bottom: 4px">
            <span style="color: var(--m-text3)">选中账号：</span>
            <span>{{ task.selectedTokens.length }} 个</span>
          </div>
          <div style="margin-bottom: 8px">
            <span style="color: var(--m-text3)">选中任务：</span>
            <span>{{ task.selectedTasks.length }} 个</span>
          </div>
          <div style="display: flex; gap: 8px">
            <n-button size="tiny" @click="editTask(task)"> 编辑 </n-button>
            <n-button size="tiny" type="error" @click="deleteTask(task.id)">
              删除
            </n-button>
            <!-- 「立即执行」已去掉：任务由服务端调度执行，客户端不再本地跑一遍 -->
          </div>
        </div>
        <div
          v-if="scheduledTasks.length === 0"
          style="text-align: center; padding: 24px; color: var(--m-text3)"
        >
          暂无定时任务
        </div>
      </div>
    </n-modal>

    <!-- Task Modal：三步向导（1 选择账号 → 2 选择任务 → 3 设定时间）
         原来是一整页长表单，手机上要滚很久才能看到「保存」；拆成三步后每屏只放一组字段，
         底部固定「取消/返回 + 下一步/保存」。标题里的步骤条只做位置提示，可点回上一步。 -->
    <n-modal
      v-model:show="showTaskModal"
      preset="card"
      :title="editingTask ? '编辑定时任务' : '新增定时任务'"
      class="m-task-wizard"
      style="width: 90%; max-width: 600px"
    >
      <div class="tw-steps">
        <button
          v-for="s in taskStepList"
          :key="s.value"
          type="button"
          class="tw-step"
          :class="{ 'is-active': taskStep === s.value, 'is-done': taskStep > s.value }"
          @click="taskStep > s.value && (taskStep = s.value)"
        >
          <span class="tw-step-idx">{{ taskStep > s.value ? "✓" : s.value }}</span>
          <span class="tw-step-label">{{ s.label }}</span>
        </button>
      </div>

      <!-- ── 第 1 步：任务名称 + 选择账号 ── -->
      <div v-show="taskStep === 1" class="tw-pane">
        <div class="tw-field">
          <label class="tw-label">任务名称</label>
          <n-input
            v-model:value="taskForm.name"
            placeholder="请输入任务名称"
            @keyup.enter="goNextStep"
          />
        </div>

        <div class="tw-field">
          <!-- 与批量任务「账号列表」同一个组件：标题 / 管理分组 / 分组快选 / 排序 / 全选 / 行
               全部由组件渲染，这里只把单列 + 限高传进去 -->
          <TokenPicker
            v-model="taskForm.selectedTokens"
            title="选择账号"
            manage-label="管理分组"
            :count-text="`${taskForm.selectedTokens.length} / ${sortedTokens.length}`"
            :items="sortedTokens"
            :sort-config="sortConfig"
            :columns="1"
            max-height="38vh"
            :groups="tokenGroups"
            :group-selected-ids="taskScheduleSelectedGroupIds"
            :group-counts="tokenGroupCounts"
            groups-title="分组选择"
            clear-groups-label="一键清除所有分组选择"
            @manage-groups="showGroupManageModal = true"
            @toggle-group="toggleTaskGroup"
            @clear-groups="clearTaskGroups"
            @sort="toggleSort"
            @open-settings="openSettings"
          />
        </div>
      </div>

      <!-- ── 第 2 步：选择任务（分组 + 胶囊标签） ── -->
      <div v-show="taskStep === 2" class="tw-pane">
        <div class="tw-field-head">
          <label class="tw-label">选择任务</label>
          <span class="tw-count">{{ taskForm.selectedTasks.length }} 个已选</span>
        </div>
        <div class="tw-tools">
          <button type="button" class="tw-mini" @click="selectAllTasks">
            全选
          </button>
          <button type="button" class="tw-mini" @click="deselectAllTasks">
            全不选
          </button>
        </div>

        <div class="tw-cats">
          <button
            v-for="cat in taskCategoryTabs"
            :key="cat.name"
            type="button"
            class="tw-cat"
            :class="{ active: taskCategory === cat.name }"
            @click="taskCategory = cat.name"
          >
            {{ cat.label }}
          </button>
        </div>

        <div class="tw-chips">
          <button
            v-for="t in groupedAvailableTasks[taskCategory] || []"
            :key="t.value"
            type="button"
            class="tw-chip"
            :class="{ active: taskForm.selectedTasks.includes(t.value) }"
            @click="toggleTaskValue(t.value)"
          >
            {{ t.label }}
          </button>
        </div>
        <div
          v-if="!(groupedAvailableTasks[taskCategory] || []).length"
          class="tw-empty"
        >
          这个分组下没有任务
        </div>
      </div>

      <!-- ── 第 3 步：运行时间 ── -->
      <div v-show="taskStep === 3" class="tw-pane">
        <div class="schedule-header">
          <label class="tw-label">运行时间</label>
          <span class="schedule-summary">{{ scheduleSummary }}</span>
        </div>

        <div class="schedule-freqs">
          <button
            v-for="option in scheduleFreqOptions"
            :key="option.value"
            type="button"
            class="schedule-freq"
            :class="{ active: scheduleState.freq === option.value }"
            @click="applyScheduleFreq(option.value)"
          >
            {{ option.label }}
          </button>
        </div>

        <div v-if="scheduleState.freq === 'weekly'" class="schedule-weekdays">
          <button
            v-for="day in weekdayOptions"
            :key="day.value"
            type="button"
            class="schedule-weekday"
            :class="{ active: scheduleState.weekdays.includes(day.value) }"
            @click="toggleWeekday(day.value)"
          >
            周{{ day.label }}
          </button>
          <span class="schedule-links">
            <button type="button" @click="applyWeekdayPreset('work')">
              工作日
            </button>
            <button type="button" @click="applyWeekdayPreset('weekend')">
              周末
            </button>
            <button type="button" @click="applyWeekdayPreset('all')">
              每天
            </button>
          </span>
        </div>

        <div v-if="showScheduleTimeRow" class="schedule-time-row">
          <template v-if="scheduleState.freq === 'monthly'">
            <span class="schedule-inline-label">每月</span>
            <n-select
              v-model:value="scheduleState.dayOfMonth"
              :options="dayOfMonthOptions"
              size="small"
              style="width: 110px"
            />
          </template>
          <n-select
            v-model:value="scheduleState.hour"
            :options="hourOptions"
            size="small"
            style="width: 82px"
          />
          <span class="schedule-colon">:</span>
          <n-select
            v-model:value="scheduleState.minute"
            :options="minuteOptions"
            size="small"
            style="width: 82px"
          />
          <span class="schedule-links schedule-time-presets">
            <span class="schedule-inline-label">常用</span>
            <button
              v-for="preset in timePresets"
              :key="preset"
              type="button"
              :class="{ active: isPresetActive(preset) }"
              @click="applyTimePreset(preset)"
            >
              {{ preset }}
            </button>
          </span>
        </div>

        <div v-if="scheduleState.freq === 'hourly'" class="schedule-hourly">
          <div class="schedule-intervals">
            <button
              v-for="interval in intervalOptions"
              :key="interval"
              type="button"
              :class="{ active: scheduleState.interval === interval }"
              @click="scheduleState.interval = interval"
            >
              {{ interval }} 小时
            </button>
          </div>
          <div class="schedule-time-row">
            <span class="schedule-inline-label">在第</span>
            <n-select
              v-model:value="scheduleState.minute"
              :options="minuteOptions"
              size="small"
              style="width: 82px"
            />
            <span class="schedule-inline-label">分执行（从 0 点起算）</span>
          </div>
        </div>

        <div v-if="scheduleState.freq === 'custom'" class="schedule-custom">
          <n-input
            v-model:value="scheduleState.cronExpression"
            placeholder="分 时 日 月 周，例如 0 8 * * 1-5"
          />
          <div class="schedule-links schedule-cron-samples">
            <button
              v-for="sample in cronSamples"
              :key="sample.value"
              type="button"
              :class="{ active: scheduleNormalizedCron === sample.value }"
              @click="applyCronSample(sample.value)"
            >
              {{ sample.value }} · {{ sample.label }}
            </button>
          </div>
        </div>

        <div v-if="scheduleError" class="schedule-error">
          <n-text type="error">✗ {{ scheduleError }}</n-text>
        </div>
        <div v-else-if="schedulePreview.length" class="schedule-preview">
          <div class="schedule-preview-main">
            <span class="schedule-preview-tag">下次执行</span>
            <span class="schedule-preview-time">{{
              schedulePreview[0].label
            }}</span>
            <span class="schedule-preview-rel"
              >· {{ schedulePreview[0].relative }}</span
            >
          </div>
          <div class="schedule-preview-next">
            <span class="schedule-preview-tag">之后</span>
            <span
              v-for="(run, index) in schedulePreview.slice(1)"
              :key="index"
              class="schedule-preview-item"
            >
              {{ run.short }}
            </span>
          </div>
        </div>
      </div>

      <div class="tw-actions">
        <n-button v-if="taskStep === 1" @click="showTaskModal = false">
          取消
        </n-button>
        <n-button v-else @click="taskStep -= 1">上一步</n-button>
        <n-button v-if="taskStep < 3" type="primary" @click="goNextStep">
          下一步
        </n-button>
        <n-button v-else type="primary" @click="saveTask">保存</n-button>
      </div>
    </n-modal>

    <!-- Batch Settings Modal -->
    <!-- 22 个字段原来一屏竖排（手机上要滚两屏，找「战斗延迟」全凭盲滑），
         而且「数量」和「延迟」这种毫不相干的字段挤在同一条滚动轴里。
         改成 5 个分组页签：数量 / 赠送 / 延迟 / 连接 / 系统，每页 2~7 行；
         页签是「一排 5 等分」的格子（同批量页那排功能分类），不换行、不横滑。 -->
    <n-modal
      v-model:show="showBatchSettingsModal"
      preset="card"
      title="任务设置"
      class="m-setmodal m-bset"
      style="width: 90%; max-width: 700px"
    >
      <n-tabs v-model:value="batchSettingsTab" type="line" animated>
        <n-tab-pane name="count" tab="数量">
          <div class="sm-body">
            <section class="sm-sec">
              <div class="sm-sec-title">批量操作</div>
              <div class="sm-row">
                <span class="sm-label">开箱数量(10倍)</span>
                <n-input-number
                  v-model:value="batchSettings.boxCount"
                  :min="10"
                  :max="10000"
                  :step="10"
                  class="sm-num"
                />
              </div>
              <div class="sm-row">
                <span class="sm-label">钓鱼数量(10倍)</span>
                <n-input-number
                  v-model:value="batchSettings.fishCount"
                  :min="10"
                  :max="10000"
                  :step="10"
                  class="sm-num"
                />
              </div>
              <div class="sm-row">
                <span class="sm-label">招募数量(10倍)</span>
                <n-input-number
                  v-model:value="batchSettings.recruitCount"
                  :min="10"
                  :max="10000"
                  :step="10"
                  class="sm-num"
                />
              </div>
            </section>
            <section class="sm-sec">
              <div class="sm-sec-title">默认值与目标</div>
              <div class="sm-row">
                <span class="sm-label">默认宝箱类型</span>
                <n-select
                  v-model:value="batchSettings.defaultBoxType"
                  :options="boxTypeOptions"
                  class="sm-ctl"
                />
              </div>
              <div class="sm-row">
                <span class="sm-label">默认鱼竿类型</span>
                <n-select
                  v-model:value="batchSettings.defaultFishType"
                  :options="fishTypeOptions"
                  class="sm-ctl"
                />
              </div>
              <div class="sm-row">
                <span class="sm-label">按积分开箱目标</span>
                <n-input-number
                  v-model:value="batchSettings.targetBoxPoints"
                  :min="1"
                  :max="1000000"
                  :step="100"
                  class="sm-num"
                />
              </div>
              <div class="sm-row">
                <span class="sm-label">梦境商品购买配置</span>
                <n-button size="small" @click="openDreamBuyModal">点击配置</n-button>
              </div>
            </section>
          </div>
        </n-tab-pane>

        <n-tab-pane name="gift" tab="赠送">
          <div class="sm-body">
            <section class="sm-sec">
              <div class="sm-sec-title">功法赠送</div>
              <div class="sm-row">
                <span class="sm-label">接收者 ID</span>
                <n-input-number
                  v-model:value="batchSettings.receiverId"
                  placeholder="ID"
                  :show-button="false"
                  class="sm-num"
                />
              </div>
              <div class="sm-row">
                <span class="sm-label">密码</span>
                <n-input
                  v-model:value="batchSettings.password"
                  type="password"
                  placeholder="密码"
                  class="sm-num"
                />
              </div>
            </section>
            <p class="sm-note">用于把功法赠送给该账号下的角色；留空则跳过赠送。</p>
          </div>
        </n-tab-pane>

        <n-tab-pane name="delay" tab="延迟">
          <div class="sm-body">
            <section class="sm-sec">
              <div class="sm-sec-title">延迟（毫秒）</div>
              <div class="sm-row">
                <span class="sm-label">命令延迟</span>
                <n-input-number
                  v-model:value="batchSettings.commandDelay"
                  :min="100"
                  :max="2000"
                  :step="100"
                  class="sm-num"
                />
              </div>
              <div class="sm-row">
                <span class="sm-label">任务间延迟</span>
                <n-input-number
                  v-model:value="batchSettings.taskDelay"
                  :min="100"
                  :max="2000"
                  :step="100"
                  class="sm-num"
                />
              </div>
              <div class="sm-row">
                <span class="sm-label">操作延迟</span>
                <n-input-number
                  v-model:value="batchSettings.actionDelay"
                  :min="100"
                  :max="2000"
                  :step="100"
                  class="sm-num"
                />
              </div>
              <div class="sm-row">
                <span class="sm-label">战斗延迟</span>
                <n-input-number
                  v-model:value="batchSettings.battleDelay"
                  :min="100"
                  :max="2000"
                  :step="100"
                  class="sm-num"
                />
              </div>
              <div class="sm-row">
                <span class="sm-label">刷新延迟</span>
                <n-input-number
                  v-model:value="batchSettings.refreshDelay"
                  :min="500"
                  :max="3000"
                  :step="100"
                  class="sm-num"
                />
              </div>
              <div class="sm-row">
                <span class="sm-label">长延迟</span>
                <n-input-number
                  v-model:value="batchSettings.longDelay"
                  :min="1000"
                  :max="10000"
                  :step="500"
                  class="sm-num"
                />
              </div>
            </section>
            <p class="sm-note">数值越大执行越慢；出现点击丢失、任务空转时先调大前四项。</p>
          </div>
        </n-tab-pane>

        <n-tab-pane name="conn" tab="连接">
          <div class="sm-body">
            <section class="sm-sec">
              <div class="sm-sec-title">连接</div>
              <div class="sm-row">
                <span class="sm-label">最大并发数</span>
                <n-input-number
                  v-model:value="batchSettings.maxActive"
                  :min="1"
                  :max="20"
                  :step="1"
                  class="sm-num"
                />
              </div>
              <div class="sm-row">
                <span class="sm-label">连接超时(ms)</span>
                <n-input-number
                  v-model:value="batchSettings.connectionTimeout"
                  :min="1000"
                  :max="30000"
                  :step="1000"
                  class="sm-num"
                />
              </div>
              <div class="sm-row">
                <span class="sm-label">重连等待(ms)</span>
                <n-input-number
                  v-model:value="batchSettings.reconnectDelay"
                  :min="100"
                  :max="5000"
                  :step="100"
                  class="sm-num"
                />
              </div>
            </section>
            <p class="sm-note">并发越高越吃性能；账号多但设备吃力时退回 2~3。</p>
          </div>
        </n-tab-pane>

        <n-tab-pane name="system" tab="系统">
          <div class="sm-body">
            <section class="sm-sec">
              <div class="sm-sec-title">界面</div>
              <div class="sm-row">
                <span class="sm-label">列表每行数量</span>
                <n-input-number
                  v-model:value="batchSettings.tokenListColumns"
                  :min="1"
                  :max="10"
                  :step="1"
                  class="sm-num"
                />
              </div>
              <div class="sm-row">
                <span class="sm-label">最大日志条目</span>
                <n-input-number
                  v-model:value="batchSettings.maxLogEntries"
                  :min="100"
                  :max="5000"
                  :step="100"
                  class="sm-num"
                />
              </div>
            </section>
            <section class="sm-sec">
              <div class="sm-sec-title">定时刷新</div>
              <div class="sm-row">
                <span class="sm-label">定时刷新页面</span>
                <n-switch v-model:value="batchSettings.enableRefresh" />
              </div>
              <div class="sm-row" v-if="batchSettings.enableRefresh">
                <span class="sm-label">刷新间隔(分钟)</span>
                <n-input-number
                  v-model:value="batchSettings.refreshInterval"
                  :min="10"
                  :max="1440"
                  :step="30"
                  class="sm-num"
                />
              </div>
            </section>
          </div>
        </n-tab-pane>
      </n-tabs>
      <div class="sm-foot">
        <n-button @click="showBatchSettingsModal = false">取消</n-button>
        <n-button type="primary" @click="saveBatchSettings">保存设置</n-button>
      </div>
    </n-modal>

    <!-- War Guess Modal -->
    <n-modal
      v-model:show="showWarGuessModal"
      preset="card"
      title="月赛助威"
      style="width: 90%; max-width: 800px"
    >
      <div class="settings-content">
        <div class="settings-grid" style="display: block">
          <div
            style="
              margin-bottom: 16px;
              display: flex;
              align-items: center;
              gap: 12px;
            "
          >
            <span style="font-size: 16px">拍手器:</span>
            <n-input-number
              v-model:value="warGuessCoin"
              placeholder="拍手器"
              :min="1"
              :max="20"
              style="width: 120px"
            >
            </n-input-number>
            <n-button
              type="primary"
              @click="handleWarGuessCheer"
              :disabled="!selectedWarGuessLegionId || isRunning"
            >
              助威
            </n-button>
            <n-button @click="fetchWarGuessRank" :loading="warGuessLoading">
              刷新数据
            </n-button>
          </div>

          <n-data-table
            :columns="warGuessColumns"
            :data="warGuessList"
            :loading="warGuessLoading"
            :row-key="(row) => row.id"
            :checked-row-keys="
              selectedWarGuessLegionId ? [selectedWarGuessLegionId] : []
            "
            @update:checked-row-keys="
              (keys) => (selectedWarGuessLegionId = keys[0])
            "
            :row-props="warGuessRowProps"
            style="height: 400px; flex: 1"
            flex-height
          />
        </div>
        <div class="modal-actions" style="margin-top: 20px; text-align: right">
          <n-button @click="showWarGuessModal = false">关闭</n-button>
        </div>
      </div>
    </n-modal>

    <!-- 分组管理：整块按 design.md 重做 —— 白卡 + band 分区，只有一个行动蓝，
         章节用标题而不是挖空分隔线；账号选择改成单列 + 全选勾选框，和账号列表一个读法 -->
    <n-modal
      v-model:show="showGroupManageModal"
      preset="card"
      title="分组管理"
      class="m-group-modal"
      style="width: 90%; max-width: 560px"
    >
      <div class="gm-body">
        <!-- ── 创建新分组 ── -->
        <section class="gm-sec">
          <div class="gm-sec-title">创建新分组</div>

          <n-input
            v-model:value="newGroupName"
            placeholder="输入分组名称"
            @keyup.enter="createNewGroup"
          />

          <div class="gm-colors">
            <button
              v-for="color in groupColors"
              :key="color"
              type="button"
              class="gm-swatch"
              :class="{ 'is-on': newGroupColor === color }"
              :style="{ background: color }"
              :aria-label="`颜色 ${color}`"
              @click="newGroupColor = color"
            ></button>
          </div>

          <div class="gm-acc">
            <div class="gm-acc-head">
              <span class="gm-acc-title">包含账号</span>
              <span class="gm-acc-count">
                {{ newGroupSelectedTokens.length }} / {{ sortedTokens.length }}
              </span>
            </div>
            <n-checkbox
              class="gm-all"
              :checked="allNewGroupTokensSelected"
              :indeterminate="someNewGroupTokensSelected"
              @update:checked="toggleAllNewGroupTokens"
            >
              全选
            </n-checkbox>
            <n-checkbox-group
              v-model:value="newGroupSelectedTokens"
              class="gm-acc-list"
            >
              <div
                v-for="token in sortedTokens"
                :key="token.id"
                class="gm-acc-row"
              >
                <n-checkbox :value="token.id">{{ token.name }}</n-checkbox>
              </div>
            </n-checkbox-group>
          </div>

          <div class="gm-actions">
            <n-button type="primary" @click="createNewGroup">创建分组</n-button>
          </div>
        </section>

        <!-- ── 分组列表 ── -->
        <section class="gm-sec">
          <div class="gm-sec-title">
            分组列表<span v-if="tokenGroups.length" class="gm-sec-count">{{
              tokenGroups.length
            }}</span>
          </div>

          <div v-if="tokenGroups.length" class="gm-list">
            <div v-for="group in tokenGroups" :key="group.id" class="gm-item">
              <!-- 编辑中 -->
              <template v-if="editingGroupId === group.id">
                <n-input v-model:value="editingGroupName" placeholder="分组名称" />
                <div class="gm-colors">
                  <button
                    v-for="color in groupColors"
                    :key="color"
                    type="button"
                    class="gm-swatch"
                    :class="{ 'is-on': editingGroupColor === color }"
                    :style="{ background: color }"
                    @click="editingGroupColor = color"
                  ></button>
                </div>
                <div class="gm-actions">
                  <n-button size="small" @click="cancelEditGroup">取消</n-button>
                  <n-button size="small" type="primary" @click="saveEditGroup">
                    保存
                  </n-button>
                </div>
              </template>

              <!-- 展示 -->
              <template v-else>
                <div class="gm-item-head">
                  <span class="gm-dot" :style="{ background: group.color }"></span>
                  <span class="gm-name">{{ group.name }}</span>
                  <span class="gm-meta">
                    {{ getValidGroupTokenIds(group.id).length }} 个账号
                  </span>
                  <span class="gm-ops">
                    <button
                      type="button"
                      class="gm-op"
                      @click="startEditGroup(group.id)"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      class="gm-op gm-op-del"
                      @click="deleteGroup(group.id)"
                    >
                      删除
                    </button>
                  </span>
                </div>

                <div
                  v-if="getValidGroupTokenIds(group.id).length"
                  class="gm-tokens"
                >
                  <span
                    v-for="tokenId in getValidGroupTokenIds(group.id)"
                    :key="tokenId"
                    class="gm-token"
                  >
                    {{ tokens.find((t) => t.id === tokenId)?.name }}
                    <button
                      type="button"
                      class="gm-token-x"
                      @click="removeTokenFromSelectedGroup(group.id, tokenId)"
                    >
                      ×
                    </button>
                  </span>
                </div>

                <!-- 选完立刻清空：这个人已经在上面成为胶囊、也从选项里被剔掉了，
                     再留着选中态 Naive 找不到对应 option 就会把裸 id 回显出来 -->
                <n-select
                  v-if="getAddableTokens(group.id).length"
                  class="gm-add"
                  :value="null"
                  placeholder="添加账号到分组"
                  size="small"
                  filterable
                  :options="
                    getAddableTokens(group.id).map((t) => ({
                      label: t.name,
                      value: t.id,
                    }))
                  "
                  @update:value="
                    (tokenId) => {
                      if (tokenId) addTokenToSelectedGroup(group.id, tokenId);
                    }
                  "
                />
                <div v-else class="gm-add-done">账号已全部加入</div>
                
              </template>
            </div>
          </div>

          <div v-else class="gm-empty">暂无分组，先在上面创建一个</div>
        </section>
      </div>
    </n-modal>
  </div>
</template>

<script setup>
/* 移动端双入口：同一个组件既当「批量任务」页，也当「定时任务」页。
 * 只靠 mode 控制显示哪几块，执行引擎 / 调度器 / 定时器只有一份 ——
 * 拆成两个页面各复制一份逻辑的话，定时器会重复跑、任务会被执行两次。
 *   all      = 全部（默认，桌面端行为）
 *   batch    = 批量任务页：隐藏定时任务统计块（挪去独立页了）
 *   schedule = 定时任务页：只留定时任务统计 + 任务列表 + 执行日志 */
defineProps({
  mode: { type: String, default: "all" },
});

// Import required dependencies
import {
  ref,
  computed,
  nextTick,
  reactive,
  watch,
  onMounted,
  onBeforeUnmount,
  h,
} from "vue";
import { useTokenStore, gameTokens, tokenGroups } from "@/stores/tokenStore";
import { $emit } from "@/stores/events/index.ts";import { DailyTaskRunner } from "@/utils/dailyTaskRunner";
import { preloadQuestions } from "@/utils/studyQuestionsFromJSON.js";
import { useMessage, useDialog } from "naive-ui";
import { Settings } from "@vicons/ionicons5";
import TokenPicker from "@/mobile/components/TokenPicker.vue";
import { confirmDanger } from "@/mobile/utils/confirm";
import { DEFAULT_WEIRD_TOWER_MAX_CLIMB } from "@/utils/towerClimbLimit.js";

// Import batch task modules
import {
  // Constants
  boxTypeOptions,
  fishTypeOptions,
  formationOptions,
  bossTimesOptions,
  availableTasks,
  FISH_TARGET,
  ARENA_TARGET,
  taskColumns,
  defaultSettings,
  defaultBatchSettings,
  defaultTemplate,
  defaultTaskForm,
  defaultHelperSettings,
  // Cron utilities
  validateCronField,
  parseCronField,
  calculateNextExecutionTime,
  formatTimeDifference,
  matchesCronExpression,
  // Schedule builder（运行时间编辑器 <-> 既有数据格式）
  buildCronFromState,
  buildTaskSchedule,
  createScheduleState,
  describeSchedule,
  inferScheduleFromTask,
  normalizeCron,
  previewSchedule,
  validateScheduleState,
  SCHEDULE_CRON_SAMPLES,
  SCHEDULE_DAY_OPTIONS,
  SCHEDULE_HOUR_OPTIONS,
  SCHEDULE_INTERVALS,
  SCHEDULE_MINUTE_OPTIONS,
  SCHEDULE_TIME_PRESETS,
  SCHEDULE_WEEKDAYS,
  // Connection manager
  createConnectionManager,
  getActivityStatus,
  getTodayStartSec,
  isTodayAvailable,
  calculateMonthProgress,
  pickArenaTargetId,
  // Log utilities
  createLogManager,
  addTaskSaveLog,
  // Task factories
  createTasksHangUp,
  createTasksBottle,
  createTasksTower,
  createTasksItem,
  createTasksDungeon,
  createTasksArena,
  createTasksStore,
  createTasksLegacy,
  createTasksFootball,
  createTasksApex,
  createTasksCampChallenge,
  createTasksXuanwuBlessing,
} from "@/utils/batch";

import { merchantConfig, goldItemsConfig } from "@/utils/dreamConstants";

// Initialize token store, message service, and task runner
const tokenStore = useTokenStore();
const message = useMessage();
const dialog = useDialog();
const weirdTowerMaxClimb = ref(DEFAULT_WEIRD_TOWER_MAX_CLIMB);

// 排序配置（从localStorage读取，与TokenImport共享）
const savedSortConfig = localStorage.getItem("tokenSortConfig");
const sortConfig = ref(
  savedSortConfig
    ? JSON.parse(savedSortConfig)
    : {
        field: "createdAt", // 排序字段：name, server, createdAt, lastUsed
        direction: "asc", // 排序方向：asc, desc
      },
);

// 计算属性 - 从gameData中获取塔相关信息
const evoTowerInfo = computed(() => {
  const data = tokenStore.gameData?.evoTowerInfo || null;
  return data;
});

const weirdTowerData = computed(() => {
  return evoTowerInfo.value?.evoTower || null;
});

const currentTowerId = computed(() => {
  return weirdTowerData.value?.towerId || 0;
});

const towerEnergy = computed(() => {
  return weirdTowerData.value?.energy || 0;
});

// 排序后的游戏角色Token列表
const sortedTokens = computed(() => {
  return [...tokenStore.gameTokens].sort((tokenA, tokenB) => {
    let valueA, valueB;

    // 根据排序字段获取比较值
    switch (sortConfig.value.field) {
      case "name":
        valueA = tokenA.name?.toLowerCase() || "";
        valueB = tokenB.name?.toLowerCase() || "";
        break;
      case "server":
        valueA = tokenA.server?.toLowerCase() || "";
        valueB = tokenB.server?.toLowerCase() || "";
        break;
      case "createdAt":
        valueA = new Date(tokenA.createdAt || 0).getTime();
        valueB = new Date(tokenB.createdAt || 0).getTime();
        break;
      case "lastUsed":
        valueA = new Date(tokenA.lastUsed || 0).getTime();
        valueB = new Date(tokenB.lastUsed || 0).getTime();
        break;
      default:
        valueA = tokenA.name?.toLowerCase() || "";
        valueB = tokenB.name?.toLowerCase() || "";
    }

    // 根据排序方向比较值
    if (valueA < valueB) {
      return sortConfig.value.direction === "asc" ? -1 : 1;
    }
    if (valueA > valueB) {
      return sortConfig.value.direction === "asc" ? 1 : -1;
    }
    return 0;
  });
});

// 切换排序
const toggleSort = (field) => {
  if (sortConfig.value.field === field) {
    // 如果点击的是当前排序字段，则切换排序方向
    sortConfig.value.direction =
      sortConfig.value.direction === "asc" ? "desc" : "asc";
  } else {
    // 如果点击的是新的排序字段，则默认升序
    sortConfig.value.field = field;
    sortConfig.value.direction = "asc";
  }

  // 保存排序设置到localStorage
  localStorage.setItem("tokenSortConfig", JSON.stringify(sortConfig.value));
};

const tokens = computed(() => tokenStore.gameTokens);
const ismengjingActivityOpen = computed(() => {
  const day = new Date().getDay();
  return day === 0 || day === 1 || day === 3 || day === 4;
});
const isbaokuActivityOpen = computed(() => {
  const day = new Date().getDay();
  return day != 1 && day != 2;
});
const isarenaActivityOpen = computed(() => {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 22;
});
const getCurrentActivityWeek = computed(() => {
  const now = new Date();
  const start = new Date("2025-12-12T12:00:00"); // 起始时间：黑市周开始
  const weekDuration = 7 * 24 * 60 * 60 * 1000; // 一周毫秒数
  const cycleDuration = 3 * weekDuration; // 三周期毫秒数

  const elapsed = now - start;
  if (elapsed < 0) return null; // 活动开始前

  const cyclePosition = elapsed % cycleDuration;

  if (cyclePosition < weekDuration) {
    return "黑市周";
  } else if (cyclePosition < 2 * weekDuration) {
    return "招募周";
  } else {
    return "宝箱周";
  }
});

const isWeirdTowerActivityOpen = computed(() => {
  if (getCurrentActivityWeek.value !== "黑市周") return false;

  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  // 如果是周五，必须在12点之后
  if (day === 5) {
    return hour >= 12;
  }
  return true;
});

// 获取本月第四个周日的日期
const getFourthSundayOfMonth = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  // 当月第一天
  const firstDay = new Date(year, month, 1);
  const dayOfWeek = firstDay.getDay(); // 0-6

  // 计算第一个周日的日期 (1号是周日则为1，否则为 1 + 7 - dayOfWeek)
  let firstSundayDate = 1 + ((7 - dayOfWeek) % 7);

  // 仅针对2026年3月进行特殊处理
  if (year === 2026 && month === 2 && dayOfWeek === 0) {
    firstSundayDate = 8;
  }

  // 第四个周日 = 第一个周日 + 21天
  return new Date(year, month, firstSundayDate + 21);
};

const isWarGuessActivityOpen = computed(() => {
  const now = new Date();

  // 手动修正：2026年3月1日开放
  if (
    now.getFullYear() === 2026 &&
    now.getMonth() === 2 &&
    now.getDate() === 1
  ) {
    const hour = now.getHours();
    const minute = now.getMinutes();
    if (hour < 19 || (hour === 19 && minute <= 55)) return true;
  }

  const fourthSunday = getFourthSundayOfMonth();

  // 检查是否是今天
  if (now.getDate() !== fourthSunday.getDate()) return false;

  // 检查时间 00:00 - 19:55
  const hour = now.getHours();
  const minute = now.getMinutes();
  if (hour > 19 || (hour === 19 && minute > 55)) return false;

  return true;
});

const warGuessActivityTip = computed(() => {
  if (isWarGuessActivityOpen.value) return "";

  const fourthSunday = getFourthSundayOfMonth();
  const month = fourthSunday.getMonth() + 1;
  const date = fourthSunday.getDate();
  return `月赛助威仅在每月第四个周日 (${month}月${date}日) 00:00-19:55 开放`;
});

const selectedTokens = ref([]);
const tokenStatus = ref({}); // { tokenId: 'waiting' | 'running' | 'completed' | 'failed' }
const isRunning = ref(false);
const shouldStop = ref(false);
/* 「已请求停止、但还在等当前任务收尾」—— 用来把停止按钮变成「停止中…」并禁用，
 * 否则用户点完看到按钮还是红的下不去手点第二下，会以为没生效。 */
const isStopping = ref(false);

// =====================
// Token分组管理状态
// =====================
const showGroupManageModal = ref(false);
const showGroupSelectModal = ref(false);
const selectedGroups = ref([]); // 选中的分组ID列表

// TokenPicker 头部右侧的计数：只在有分组被选中时显示（和原来卡头那句提示一致）
const tokenPickCountText = computed(() =>
  selectedGroups.value.length > 0
    ? `已选 ${selectedGroups.value.length} 组 / ${selectedTokens.value.length} 个`
    : "",
);

// 分组快选里每组的人数（TokenPicker 只负责显示）
const tokenGroupCounts = computed(() => {
  const map = {};
  (tokenGroups.value || []).forEach((group) => {
    map[group.id] = getValidGroupTokenIds(group.id).length;
  });
  return map;
});
const newGroupName = ref("");
const newGroupColor = ref("#0057d2");
const newGroupSelectedTokens = ref([]); // 新建分组时选中的Token ID列表
const editingGroupId = ref(null);
const editingGroupName = ref("");
const editingGroupColor = ref("");
const taskScheduleSelectedGroupIds = ref([]); // 定时任务中通过分组按钮选中的分组ID列表
const groupColors = [
  "#0057d2", // 行动蓝（新建分组默认）
  "#067647", // 绿
  "#b54708", // 琥珀
  "#b42318", // 红
  "#022879", // 深蓝（原来那支紫不在调色板里）
  "#13c2c2", // 青色
  "#eb2f96", // 粉色
  "#fa8c16", // 赤红色
];

// ======================
// War Guess Feature
// ======================
const showWarGuessModal = ref(false);
const warGuessList = ref([]);
const warGuessLoading = ref(false);
const warGuessCoin = ref(20);
const selectedWarGuessLegionId = ref(null);
const currentGuessCount = ref(0);

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

const warGuessColumns = [
  {
    type: "selection",
    multiple: false,
  },
  { title: "ID", key: "id", width: 100 },
  {
    title: "头像",
    key: "logo",
    render(row) {
      return h("img", {
        src: row.logo,
        style: { width: "30px", height: "30px", borderRadius: "50%" },
      });
    },
    width: 60,
  },
  { title: "区服", key: "serverId", width: 80 },
  { title: "俱乐部", key: "name", width: 120 },
  {
    title: "战力",
    key: "power",
    render(row) {
      return formatPower(row.power);
    },
    width: 100,
  },
  { title: "红淬", key: "quenchNum" },
  { title: "已助威", key: "guessNum" },
  {
    title: "总热度",
    key: "totalNum",
    render(row) {
      return formatPower(row.totalNum || 0);
    },
    width: 100,
  },
];

const warGuessRowProps = (row) => {
  return {
    style: "cursor: pointer",
    onClick: () => {
      selectedWarGuessLegionId.value = row.id;
    },
  };
};

const openWarGuessModal = () => {
  showWarGuessModal.value = true;
  // Reset selection
  selectedWarGuessLegionId.value = null;
  warGuessList.value = [];

  // Auto fetch if tokens selected
  if (selectedTokens.value.length > 0) {
    fetchWarGuessRank();
  }
};

const fetchWarGuessRank = async () => {
  if (selectedTokens.value.length === 0) {
    message.warning("请先选择一个账号用于获取月赛助威数据");
    return;
  }

  const tokenId = selectedTokens.value[0];
  const token = tokens.value.find((t) => t.id === tokenId);

  warGuessLoading.value = true;
  try {
    addLog({
      time: new Date().toLocaleTimeString(),
      message: `正在使用 ${token.name} 获取月赛助威数据...`,
      type: "info",
    });

    // Ensure connection
    const status = tokenStore.getWebSocketStatus(tokenId);
    if (status !== "connected") {
      tokenStore.createWebSocketConnection(tokenId, token.token, token.wsUrl);
      await new Promise((r) => setTimeout(r, 2000)); // Wait for connection
    }

    // Fetch rank
    const res = await tokenStore.sendMessageWithPromise(
      tokenId,
      "warguess_getrank",
      { bfId: "" },
      5000,
    );

    if (res && res.list) {
      let list = [];
      if (Array.isArray(res.list)) {
        list = res.list;
      } else {
        list = Object.values(res.list);
      }

      // Sort by totalNum desc
      warGuessList.value = list
        .sort((a, b) => (b.totalNum || 0) - (a.totalNum || 0))
        .slice(0, 20);
    } else {
      message.warning("获取月赛助威数据为空");
    }
  } catch (error) {
    console.error("Fetch rank error:", error);
    message.error("获取月赛助威数据失败: " + error.message);
    addLog({
      time: new Date().toLocaleTimeString(),
      message: `获取月赛助威数据失败: ${error.message}`,
      type: "error",
    });
  } finally {
    warGuessLoading.value = false;
  }
};

const handleWarGuessCheer = async () => {
  if (!selectedWarGuessLegionId.value) {
    message.warning("请先选择一个俱乐部");
    return;
  }
  // Close modal
  showWarGuessModal.value = false;
  // Call the batch function
  await batchWarGuessCheer(selectedWarGuessLegionId.value, warGuessCoin.value);
};

// Settings Modal State
const showSettingsModal = ref(false);
const currentSettingsTokenId = ref(null);
const currentSettingsTokenName = ref("");
const currentSettings = reactive({
  arenaFormation: 1,
  towerFormation: 1,
  bossFormation: 1,
  bossTimes: 2,
  claimBottle: true,
  payRecruit: true,
  openBox: true,
  arenaEnable: true,
  claimHangUp: true,
  claimEmail: true,
  blackMarketPurchase: true,
});

// Task Template State
const showTaskTemplateModal = ref(false);
const showApplyTemplateModal = ref(false);
const showTemplateManagerModal = ref(false);
const showAccountTemplateModal = ref(false);
const taskTemplates = ref([]);
const selectedTemplateId = ref(null);
const selectedTokensForApply = ref([]);
const currentTemplateName = ref("");
const currentTemplateId = ref(null); // 用于编辑现有模板
const currentTemplate = reactive({
  arenaFormation: 1,
  towerFormation: 1,
  bossFormation: 1,
  bossTimes: 2,
  claimBottle: true,
  payRecruit: true,
  openBox: true,
  arenaEnable: true,
  claimHangUp: true,
  claimEmail: true,
  blackMarketPurchase: true,
});

// Account Template References
const accountTemplateReferences = ref([]);
const filteredAccountTemplates = ref([]);
const selectedTemplateForFilter = ref(null);

// Computed for Apply Template
const isAllSelectedForApply = computed(() => {
  return (
    selectedTokensForApply.value.length === sortedTokens.value.length &&
    sortedTokens.value.length > 0
  );
});

const isIndeterminateForApply = computed(() => {
  return (
    selectedTokensForApply.value.length > 0 &&
    selectedTokensForApply.value.length < sortedTokens.value.length
  );
});

// Computed for Template Manager
/* 移动端：搜索框原来既没有 v-model 也没有过滤逻辑（纯摆设），
   这里补上——按模板名做一次不区分大小写的包含匹配。 */
const templateSearchKeyword = ref("");
const filteredTaskTemplates = computed(() => {
  const kw = templateSearchKeyword.value.trim().toLowerCase();
  if (!kw) return taskTemplates.value;
  return taskTemplates.value.filter((t) =>
    String(t.name || "")
      .toLowerCase()
      .includes(kw)
  );
});

// Helper Modal State
const showHelperModal = ref(false);
const helperType = ref("box"); // 'box' | 'fish' | 'recruit'
const helperSettings = reactive({
  boxType: 2001,
  fishType: 1,
  count: 100,
  targetPoints: 1000,
});

const helperModalTitle = computed(() => {
  const titles = {
    box: "批量开宝箱",
    fish: "批量钓鱼",
    recruit: "批量招募",
    pointsBox: "按积分开箱",
  };
  return titles[helperType.value] || "批量助手";
});

// Batch Settings State
const showBatchSettingsModal = ref(false);

/* 任务设置页签：数量 / 赠送 / 延迟 / 连接 / 系统。
 * 打开时回到「数量」—— 记住上次停在哪一页反而容易让人以为改错了行。 */
const batchSettingsTab = ref("count");

const defaultDreamPurchaseList = [];
for (const merchantId in goldItemsConfig) {
  goldItemsConfig[merchantId].forEach((index) => {
    defaultDreamPurchaseList.push(`${merchantId}-${index}`);
  });
}

const batchSettings = reactive({
  dreamPurchaseList: defaultDreamPurchaseList,
  boxCount: 100,
  fishCount: 100,
  recruitCount: 100,
  defaultBoxType: 2001,
  defaultFishType: 1,
  targetBoxPoints: 1000,
  receiverId: "",
  password: "",
  tokenListColumns: 2,
  // 延迟配置（毫秒）
  commandDelay: 500, // 命令间延迟
  taskDelay: 500, // 任务间延迟
  actionDelay: 300, // 一般操作延迟（开箱、钓鱼、招募等）
  battleDelay: 500, // 战斗延迟（宝库、竞技场等）
  refreshDelay: 1000, // 刷新延迟
  longDelay: 3000, // 长延迟（功法赠送等）
  // 其他配置
  maxActive: 2,
  connectionTimeout: 10000,
  reconnectDelay: 1000,
  maxLogEntries: 1000,
  // 页面刷新配置
  enableRefresh: false,
  refreshInterval: 360, // 分钟
});

// Load batch settings from localStorage
const loadBatchSettings = () => {
  try {
    const saved = localStorage.getItem("batchSettings");
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.assign(batchSettings, parsed);
    }
  } catch (error) {
    console.error("Failed to load batch settings:", error);
  }
};

// Save batch settings to localStorage
const saveBatchSettings = () => {
  try {
    localStorage.setItem("batchSettings", JSON.stringify(batchSettings));
    message.success("定时批量任务设置已保存");
    showBatchSettingsModal.value = false;
  } catch (error) {
    console.error("Failed to save batch settings:", error);
    message.error("保存设置失败");
  }
};

// Open batch settings modal
const openBatchSettings = () => {
  loadBatchSettings();
  batchSettingsTab.value = "count";
  showBatchSettingsModal.value = true;
};

// Load settings on component mount
loadBatchSettings();

// ======================
// Legacy Gift Feature
// ======================

// Legacy Gift Modal State
const showLegacyGiftModal = ref(false);
const recipientIdInput = ref("");
const recipientIdError = ref("");
const recipientInfo = ref(null);
const isQueryingRecipient = ref(false);
const giftQuantity = ref(10);
const securityPassword = ref(""); // 安全密码
// 头像加载状态
const isAvatarLoading = ref(false);
const avatarLoadError = ref(false);

// ======================
// Scheduled Tasks Feature
// ======================

// Scheduled Tasks State Management
const scheduledTasks = ref([]); // List of all scheduled tasks
const showTaskModal = ref(false); // Control the visibility of the add/edit task modal
/* 三步向导状态：1 选择账号（名称 + 账号）→ 2 选择任务 → 3 设定时间 */
const taskStep = ref(1);
const taskStepList = [
  { value: 1, label: "选择账号" },
  { value: 2, label: "选择任务" },
  { value: 3, label: "设定时间" },
];
/* 第 2 步当前分组（与 taskGroupDefinitions 的 name 对应） */
const taskCategory = ref("daily");
/* 分组页签：定义里的分组 +「其他」（仅当确实有未分组任务时出现） */
const taskCategoryTabs = computed(() => {
  const tabs = taskGroupDefinitions.map((g) => ({
    name: g.name,
    label: g.label,
  }));
  if ((groupedAvailableTasks.value.other || []).length > 0) {
    tabs.push({ name: "other", label: "其他" });
  }
  return tabs;
});

/* 编辑老任务时，把第 2 步定位到它第一个已选任务所在的分组 */
const taskCategoryOfTask = (task) => {
  const selected = (task && task.selectedTasks) || [];
  for (const group of taskGroupDefinitions) {
    if (group.tasks.some((t) => selected.includes(t))) return group.name;
  }
  return "daily";
};

/* 下一步：先在当前步做校验，通过了才前进（不把校验都堆到最后一步的保存上） */
const goNextStep = () => {
  if (taskStep.value === 1) {
    if (!String(taskForm.name || "").trim()) {
      message.warning("请输入任务名称");
      return;
    }
    if (taskForm.selectedTokens.length === 0) {
      message.warning("请选择至少一个账号");
      return;
    }
  }
  if (taskStep.value === 2 && taskForm.selectedTasks.length === 0) {
    message.warning("请选择至少一个任务");
    return;
  }
  if (taskStep.value < 3) taskStep.value += 1;
};

/* 胶囊标签点选（不走 n-checkbox-group，方便做成 chip 流） */
const toggleTaskValue = (value) => {
  const index = taskForm.selectedTasks.indexOf(value);
  if (index > -1) taskForm.selectedTasks.splice(index, 1);
  else taskForm.selectedTasks.push(value);
};

/* 分组快选：整组加入 / 整组移除（原先是内联在模板里的长表达式，抽出来更好读）
 * ★ taskScheduleSelectedGroupIds 是 ref，必须走 .value ——
 *   之前漏了 .value（直接 .indexOf/.splice/.push），点分组会抛 TypeError，等于「点了没反应」。 */
const toggleTaskGroup = (group) => {
  const selected = taskScheduleSelectedGroupIds.value;
  const index = selected.indexOf(group.id);
  const groupTokenIds = getValidGroupTokenIds(group.id);

  if (index > -1) {
    selected.splice(index, 1);
    taskForm.selectedTokens = taskForm.selectedTokens.filter(
      (id) => !groupTokenIds.includes(id),
    );
    return;
  }

  selected.push(group.id);
  groupTokenIds.forEach((id) => {
    if (!taskForm.selectedTokens.includes(id)) taskForm.selectedTokens.push(id);
  });
};

/* 分组的「一键清除」：向导这边没有批量任务那套 selectedGroups，
 * 直接把已选分组连同它们带进来的账号一起撤掉 */
const clearTaskGroups = () => {
  taskScheduleSelectedGroupIds.value.forEach((gid) => {
    const groupTokenIds = getValidGroupTokenIds(gid);
    taskForm.selectedTokens = taskForm.selectedTokens.filter(
      (id) => !groupTokenIds.includes(id),
    );
  });
  taskScheduleSelectedGroupIds.value = [];
};
const showTasksModal = ref(false); // Control the visibility of the tasks list modal
const editingTask = ref(null); // Currently editing task
const taskForm = reactive({
  name: "", // Task name
  selectedTokens: [], // Selected token IDs
  selectedTasks: [], // Selected task function names
  enabled: true, // Whether the task is enabled
});

// 任务分组定义
const taskGroupDefinitions = [
  {
    name: "daily",
    label: "日常",
    tasks: [
      "startBatch",
      "claimHangUpRewards",
      "batchAddHangUpTime",
      "resetBottles",
      "batchlingguanzi",
      "batchclubsign",
      "batchStudy",
      "batcharenafight",
      "batchCampChallenge",
      "batchCampChallengePet",
      "batchCampClaimTasks",
      "store_purchase",
      "collection_claimfreereward",
      "batchGenieSweep",
      "batchXuanwuBlessing",
    ],
  },
  {
    name: "dungeon",
    label: "副本",
    tasks: [
      "climbTower",
      "batchmengjing",
      "skinChallenge",
      "batchClaimPeachTasks",
      "batchBuyDreamItems",
    ],
  },
  { name: "baoku", label: "宝库", tasks: ["batchbaoku13", "batchbaoku45"] },
  {
    name: "weirdTower",
    label: "怪异塔",
    tasks: [
      "climbWeirdTower",
      "batchUseItems",
      "batchMergeItems",
      "batchClaimFreeEnergy",
    ],
  },
  {
    name: "resource",
    label: "资源",
    tasks: [
      "batchOpenBox",
      "batchOpenBoxByPoints",
      "batchClaimBoxPointReward",
      "batchFish",
      "batchRecruit",
      "legion_storebuygoods",
    ],
  },
  {
    name: "legacy",
    label: "功法",
    tasks: ["batchLegacyClaim", "batchLegacyGiftSendEnhanced"],
  },
  {
    name: "monthly",
    label: "月度",
    tasks: ["batchTopUpFish", "batchTopUpArena"],
  },
];

// 计算属性，根据 taskGroupDefinitions 将 availableTasks 分组
const groupedAvailableTasks = computed(() => {
  const groups = {};
  taskGroupDefinitions.forEach((group) => {
    groups[group.name] = availableTasks.filter((task) =>
      group.tasks.includes(task.value),
    );
  });

  // 处理未分组的任务
  const groupedTaskValues = taskGroupDefinitions.flatMap((g) => g.tasks);
  const otherTasks = availableTasks.filter(
    (task) => !groupedTaskValues.includes(task.value),
  );
  if (otherTasks.length > 0) {
    groups["other"] = otherTasks;
  }

  return groups;
});

// 运行时间编辑器：只在内存里存在，落库仍由 buildTaskSchedule 产出旧格式
const scheduleState = reactive(createScheduleState());

const scheduleFreqOptions = [
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" },
  { value: "hourly", label: "每隔几小时" },
  { value: "custom", label: "自定义" },
];

const WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];
const weekdayOptions = SCHEDULE_WEEKDAYS.map((value) => ({
  value,
  label: WEEKDAY_NAMES[value],
}));
const hourOptions = SCHEDULE_HOUR_OPTIONS;
const minuteOptions = SCHEDULE_MINUTE_OPTIONS;
const dayOfMonthOptions = SCHEDULE_DAY_OPTIONS;
const intervalOptions = SCHEDULE_INTERVALS;
const timePresets = SCHEDULE_TIME_PRESETS;
const cronSamples = SCHEDULE_CRON_SAMPLES;

const pad2 = (value) => String(value).padStart(2, "0");

const scheduleSummary = computed(() => describeSchedule(scheduleState));
const scheduleCron = computed(() => buildCronFromState(scheduleState));
const scheduleNormalizedCron = computed(() => normalizeCron(scheduleCron.value));
const scheduleError = computed(() => validateScheduleState(scheduleState));
const schedulePreview = computed(() =>
  scheduleError.value ? [] : previewSchedule(scheduleCron.value, 5),
);
const showScheduleTimeRow = computed(() =>
  ["daily", "weekly", "monthly"].includes(scheduleState.freq),
);
const currentTimeText = computed(
  () => `${pad2(scheduleState.hour)}:${pad2(scheduleState.minute)}`,
);

const isPresetActive = (preset) => preset === currentTimeText.value;

const applyScheduleFreq = (freq) => {
  scheduleState.freq = freq;
};

const toggleWeekday = (day) => {
  const index = scheduleState.weekdays.indexOf(day);
  if (index > -1) {
    scheduleState.weekdays.splice(index, 1);
  } else {
    scheduleState.weekdays.push(day);
  }
};

const applyWeekdayPreset = (preset) => {
  if (preset === "work") {
    scheduleState.weekdays = [1, 2, 3, 4, 5];
  } else if (preset === "weekend") {
    scheduleState.weekdays = [0, 6];
  } else {
    scheduleState.weekdays = [1, 2, 3, 4, 5, 6, 0];
  }
};

const applyTimePreset = (preset) => {
  const [hour, minute] = preset.split(":").map(Number);
  scheduleState.hour = hour;
  scheduleState.minute = minute;
};

const applyCronSample = (expression) => {
  scheduleState.cronExpression = expression;
};


// ======================
// Scheduled Tasks Storage
// ======================

/* Track executing tasks for UI loading state —— 「立即执行」按钮已下线（任务改为服务端调度），
 * 这里保留 ref 只为避免其它地方被动改坏；UI 上已无引用。 */
const executingTaskIds = ref([]);

/* Manual execute task —— 已无 UI 入口（定时任务列表里的「立即执行」已删除）。
 * 保留函数体，需要临时本地跑一次时可在控制台调用。 */
const manualExecuteTask = async (task) => {
  if (executingTaskIds.value.includes(task.id)) return;

  // Reset stop flag if not running, to allow manual execution
  if (!isRunning.value && shouldStop.value) {
    shouldStop.value = false;
  }

  executingTaskIds.value.push(task.id);
  try {
    message.info(`开始执行任务: ${task.name}`);
    await executeScheduledTask(task);
    message.success(`任务 ${task.name} 执行完成`);
  } catch (e) {
    console.error(`执行任务 ${task.name} 失败:`, e);
    message.error(`任务 ${task.name} 执行失败`);
  } finally {
    executingTaskIds.value = executingTaskIds.value.filter(
      (id) => id !== task.id,
    );
  }
};

// Load scheduled tasks from localStorage
const loadScheduledTasks = () => {
  try {
    const saved = localStorage.getItem("scheduledTasks");

    if (saved) {
      const parsed = JSON.parse(saved);

      // Ensure we have an array
      scheduledTasks.value = Array.isArray(parsed) ? parsed : [];
    } else {
      scheduledTasks.value = [];
    }
  } catch (error) {
    console.error("Failed to load scheduled tasks:", error);
    scheduledTasks.value = [];
  }
};

// Save scheduled tasks to localStorage
const saveScheduledTasks = () => {
  try {
    const dataToSave = JSON.stringify(scheduledTasks.value);

    localStorage.setItem("scheduledTasks", dataToSave);
    // Verify save was successful
    const saved = localStorage.getItem("scheduledTasks");
  } catch (error) {
    console.error("Failed to save scheduled tasks:", error);
  }
};

// Open task modal for adding new task
const openTaskModal = () => {
  editingTask.value = null;
  Object.assign(taskForm, {
    name: "",
    selectedTokens: [],
    selectedTasks: [],
    enabled: true,
  });
  Object.assign(scheduleState, createScheduleState());
  taskScheduleSelectedGroupIds.value = [];
  taskStep.value = 1;
  taskCategory.value = "daily";
  showTaskModal.value = true;
};

// Edit existing task
const editTask = (task) => {
  editingTask.value = task;
  Object.assign(taskForm, {
    name: task.name || "",
    selectedTokens: [...(task.selectedTokens || [])],
    selectedTasks: [...(task.selectedTasks || [])],
    enabled: task.enabled !== false,
  });
  // 老数据反推：认不出的表达式落到「自定义」并原样回显
  Object.assign(scheduleState, inferScheduleFromTask(task));
  taskScheduleSelectedGroupIds.value = [];
  /* 编辑也从头走：老任务回填后，用户通常先确认名称与账号 */
  taskStep.value = 1;
  taskCategory.value = taskCategoryOfTask(task);
  showTaskModal.value = true;
};


// Save task (create or update)
const saveTask = () => {
  if (!taskForm.name) {
    message.warning("请输入任务名称");
    return;
  }

  // 运行时间校验（每周至少一天 / 自定义 Cron 语法）
  const scheduleErrorText = validateScheduleState(scheduleState);
  if (scheduleErrorText) {
    message.warning(scheduleErrorText);
    return;
  }

  if (taskForm.selectedTokens.length === 0) {
    message.warning("请选择至少一个账号");
    return;
  }

  if (taskForm.selectedTasks.length === 0) {
    message.warning("请选择至少一个任务");
    return;
  }

  // 落库字段仍只有 runType / runTime / cronExpression 三个
  const schedule = buildTaskSchedule(scheduleState);

  const taskData = {
    id: editingTask.value?.id || "task_" + Date.now(),
    name: taskForm.name,
    runType: schedule.runType,
    runTime: schedule.runTime,
    cronExpression: schedule.cronExpression,
    selectedTokens: [...taskForm.selectedTokens],
    selectedTasks: [...taskForm.selectedTasks],
    enabled: taskForm.enabled,
  };

  let isNew = !editingTask.value;

  if (editingTask.value) {
    // Update existing task
    const index = scheduledTasks.value.findIndex(
      (t) => t.id === editingTask.value.id,
    );
    if (index !== -1) {
      scheduledTasks.value[index] = taskData;
    }
  } else {
    // Add new task
    scheduledTasks.value.push(taskData);
  }

  saveScheduledTasks();

  // 同一时间的任务会依次执行，这里只提示、不阻断
  const conflictTask = scheduledTasks.value.find(
    (task) =>
      task.id !== taskData.id &&
      ((task.runType === "daily" &&
        taskData.runType === "daily" &&
        task.runTime === taskData.runTime) ||
        (task.runType === "cron" &&
          taskData.runType === "cron" &&
          normalizeCron(task.cronExpression) ===
            normalizeCron(taskData.cronExpression))),
  );
  if (conflictTask) {
    message.warning(
      `任务「${conflictTask.name}」的执行时间相同，两者会依次执行`,
    );
  }

  // Add log entry for task save
  addTaskSaveLog(taskData, isNew, addLog);

  showTaskModal.value = false;
  message.success("定时任务已保存");
};

// Delete task —— 任务由服务端调度，删掉就是删掉，必须先确认
const deleteTask = (taskId) => {
  const task = scheduledTasks.value.find((t) => t.id === taskId);
  if (!task) return;
  const accountCount = (task.selectedTokens || []).length;
  const taskCount = (task.selectedTasks || []).length;
  confirmDanger(dialog, {
    title: "删除定时任务",
    content: "删掉后不再按时间执行；账号和任务本身都保留。",
    details: [
      { label: "定时任务", value: task.name },
      { label: "涉及账号", value: `${accountCount} 个` },
      { label: "包含任务", value: `${taskCount} 项` },
    ],
    onPositiveClick: () => {
      scheduledTasks.value = scheduledTasks.value.filter((t) => t.id !== taskId);
      saveScheduledTasks();
      addLog({
        time: new Date().toLocaleTimeString(),
        message: `=== 定时任务 ${task.name} 已删除 ===`,
        type: "info",
      });
      message.success("定时任务已删除");
    },
  });
};

// Toggle task enabled state
const toggleTaskEnabled = (taskId, enabled) => {
  const task = scheduledTasks.value.find((t) => t.id === taskId);
  if (task) {
    task.enabled = enabled;
    saveScheduledTasks();
    message.success(`定时任务已${enabled ? "启用" : "禁用"}`);
    addLog({
      time: new Date().toLocaleTimeString(),
      message: `=== 定时任务 ${task.name} 已${enabled ? "启用" : "禁用"} ===`,
      type: "info",
    });
  }
};

// 注: addTaskSaveLog 已从 @/utils/batch 导入，调用时需传入 addLog

// 注: 运行时间交互逻辑见 scheduleState 定义处

// Select all tasks
const selectAllTasks = () => {
  taskForm.selectedTasks = availableTasks.map((task) => task.value);
};

// Deselect all tasks
const deselectAllTasks = () => {
  taskForm.selectedTasks = [];
};

// ======================
// Import/Export Config
// ======================

// Export all tokens and scheduled tasks configuration
const exportConfig = () => {
  try {
    // Get all valid token IDs
    const validTokenIds = new Set(tokens.value.map((t) => t.id));

    // Filter scheduled tasks: remove invalid token IDs from selectedTokens
    const filteredScheduledTasks = scheduledTasks.value
      .map((task) => ({
        ...task,
        selectedTokens:
          task.selectedTokens?.filter((tokenId) =>
            validTokenIds.has(tokenId),
          ) || [],
      }))
      .filter((task) => task.selectedTokens.length > 0); // Remove tasks with no valid tokens

    // Gather token settings
    const tokenSettings = [];
    tokens.value.forEach((token) => {
      const settings = localStorage.getItem(`daily-settings:${token.id}`);
      if (settings) {
        try {
          tokenSettings.push({
            tokenId: token.id,
            settings: JSON.parse(settings),
          });
        } catch (e) {
          console.warn(`Failed to parse settings for token ${token.id}`, e);
        }
      }
    });

    const exportData = {
      version: "1.1",
      exportTime: new Date().toISOString(),
      tokens: tokens.value.map((t) => ({
        id: t.id,
        name: t.name,
        token: t.token,
        server: t.server,
        wsUrl: t.wsUrl,
        remark: t.remark,
        importMethod: t.importMethod,
        sourceUrl: t.sourceUrl,
        upgradedToPermanent: true,
        upgradedAt: t.upgradedAt,
        updatedAt: t.updatedAt,
      })),
      scheduledTasks: filteredScheduledTasks,
      batchSettings: {
        boxCount: batchSettings.boxCount,
        fishCount: batchSettings.fishCount,
        recruitCount: batchSettings.recruitCount,
        defaultBoxType: batchSettings.defaultBoxType,
        defaultFishType: batchSettings.defaultFishType,
        commandDelay: batchSettings.commandDelay,
        taskDelay: batchSettings.taskDelay,
        actionDelay: batchSettings.actionDelay,
        battleDelay: batchSettings.battleDelay,
        refreshDelay: batchSettings.refreshDelay,
        longDelay: batchSettings.longDelay,
        maxActive: batchSettings.maxActive,
        tokenListColumns: batchSettings.tokenListColumns,
      },
      tokenSettings: tokenSettings,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `xyzw_config_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    message.success(
      `导出成功: ${exportData.tokens.length} 个账号, ${exportData.scheduledTasks.length} 个定时任务`,
    );
  } catch (error) {
    console.error("Export failed:", error);
    message.error("导出失败: " + error.message);
  }
};

// Import tokens and scheduled tasks configuration
const importConfig = async ({ file }) => {
  try {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importData = JSON.parse(e.target.result);

        // Validate structure
        if (
          !importData.version ||
          !importData.tokens ||
          !importData.scheduledTasks
        ) {
          message.error("无效的配置文件格式");
          return;
        }

        let importedTokens = 0;
        let importedTasks = 0;

        // Import tokens
        if (Array.isArray(importData.tokens)) {
          importData.tokens.forEach((token) => {
            // Check if token already exists
            const exists = gameTokens.value.some(
              (t) => t.token === token.token || t.id === token.id,
            );
            if (!exists && token.token) {
              // Add new token directly to gameTokens (useLocalStorage)
              gameTokens.value.push({
                id:
                  token.id ||
                  "token_" + Date.now() + Math.random().toString(36).slice(2),
                name: token.name || "",
                token: token.token,
                server: token.server || "",
                wsUrl: token.wsUrl || null,
                remark: token.remark || "",
                importMethod: "import",
                sourceUrl: token.sourceUrl || null,
                upgradedToPermanent: true,
                upgradedAt: token.upgradedAt || null,
                updatedAt: token.updatedAt || new Date().toISOString(),
                createdAt: new Date().toISOString(),
                lastUsed: new Date().toISOString(),
              });
              importedTokens++;
            }
          });
        }

        // Import scheduled tasks
        if (Array.isArray(importData.scheduledTasks)) {
          importData.scheduledTasks.forEach((task) => {
            // Check if task already exists
            const exists = scheduledTasks.value.some((t) => t.id === task.id);
            if (!exists && task.id) {
              scheduledTasks.value.push(task);
              importedTasks++;
            }
          });
          saveScheduledTasks();
        }

        // Import batch settings if provided
        if (importData.batchSettings) {
          Object.assign(batchSettings, importData.batchSettings);
          saveBatchSettings();
        }

        // Import token settings
        if (Array.isArray(importData.tokenSettings)) {
          importData.tokenSettings.forEach((item) => {
            if (item.tokenId && item.settings) {
              localStorage.setItem(
                `daily-settings:${item.tokenId}`,
                JSON.stringify(item.settings),
              );
            }
          });
        }

        message.success(
          `导入成功: ${importedTokens} 个新账号, ${importedTasks} 个新定时任务`,
        );
      } catch (parseError) {
        console.error("Parse error:", parseError);
        message.error("解析配置文件失败");
      }
    };
    reader.readAsText(file.file);
  } catch (error) {
    console.error("Import failed:", error);
    message.error("导入失败: " + error.message);
  }
};

// ======================
// Scheduled Tasks Countdown
// ======================

// 注: parseCronField, calculateNextExecutionTime, formatTimeDifference 已从 @/utils/batch 导入

// Task countdowns ref
const taskCountdowns = ref({});
const nextExecutionTimes = ref({});

// Update countdowns for all tasks
const updateCountdowns = () => {
  const now = Date.now();

  scheduledTasks.value.forEach((task) => {
    if (!task.enabled) {
      // Clear countdown for disabled tasks
      delete taskCountdowns.value[task.id];
      return;
    }

    if (
      !nextExecutionTimes.value[task.id] ||
      nextExecutionTimes.value[task.id] <= now
    ) {
      // Calculate next execution time if not set or passed
      nextExecutionTimes.value[task.id] = calculateNextExecutionTime(task);
    }

    if (nextExecutionTimes.value[task.id]) {
      const timeDiff = nextExecutionTimes.value[task.id] - now;
      taskCountdowns.value[task.id] = {
        remainingTime: Math.max(0, timeDiff),
        formatted: formatTimeDifference(Math.max(0, timeDiff)),
        isNearExecution: timeDiff < 5 * 60 * 1000, // Less than 5 minutes
      };
    }
  });
};

/* 「最短倒计时任务」这段删掉了：页头那行「即将执行：xxx（倒计时）」已下放到每条任务自己的
 * 「下次执行：」行，不再需要全局挑一条出来展示。桌面原件（src/views/BatchDailyTasks.vue）里还在用。 */

// Start countdown interval
let countdownInterval = null;

const startCountdown = () => {
  // Clear any existing interval
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }

  // Update countdowns immediately
  updateCountdowns();

  // Update countdowns every second
  countdownInterval = setInterval(updateCountdowns, 1000);
};

// ======================
// Scheduled Tasks Scheduler
// ======================

// Initialize scheduled tasks from localStorage
loadScheduledTasks();

// Watch for changes to scheduledTasks for debugging
watch(
  scheduledTasks,
  (newVal) => {
    // Reset countdowns when tasks change
    nextExecutionTimes.value = {};
    taskCountdowns.value = {};
    updateCountdowns();
  },
  { deep: true },
);


// Task scheduler variables - moved to component level scope
const intervalId = ref(null);
let lastTaskExecution = null;
let healthCheckInterval = null;
const pageLoadTime = Date.now();

// Health check for the scheduler
const healthCheck = () => {
  /* 原来这里还有一段「intervalId 没在跑就 startScheduler() 重启」，
   * 现在客户端不再启动调度器（任务由服务端执行），这段必须去掉，
   * 否则每 5 分钟就往控制台刷一条「调度器未运行」的 error。
   * 剩下的两件事仍然有用：isRunning 卡死兜底、可选的定时刷新页面。 */

  // Add a safety mechanism to prevent isRunning from being stuck
  if (isRunning.value) {
    const now = Date.now();
    const tenMinutesAgo = now - 10 * 60 * 1000; // 10 minutes ago
    if (lastTaskExecution && lastTaskExecution < tenMinutesAgo) {
      console.error(
        `[${new Date().toISOString()}] isRunning has been true for more than 10 minutes, resetting to false`,
      );
      isRunning.value = false;
      addLog({
        time: new Date().toLocaleTimeString(),
        message: "=== 检测到任务执行超时，已重置isRunning状态 ===",
        type: "warning",
      });
    }
  }

  // Check for page refresh
  if (batchSettings.enableRefresh && batchSettings.refreshInterval > 0) {
    const elapsedMinutes = (Date.now() - pageLoadTime) / 1000 / 60;
    if (elapsedMinutes >= batchSettings.refreshInterval) {
      if (!isRunning.value) {
        console.log(
          `[${new Date().toISOString()}] Refreshing page as scheduled (Interval: ${batchSettings.refreshInterval}m, Elapsed: ${elapsedMinutes.toFixed(1)}m)`,
        );
        window.location.reload();
      } else {
        console.log(
          `[${new Date().toISOString()}] Scheduled refresh postponed due to running task`,
        );
      }
    }
  }
};

/* ⚠ 已停用（2026-10-29）：任务改由服务端调度，这个「每 10 秒比对时间、命中就本地执行」
 * 的循环不再启动 —— 否则会和服务端重复执行。函数体原样保留，方便需要时恢复。
 * 倒计时展示走的是另一条链路（startCountdown → updateCountdowns），与本函数无关。 */
const startScheduler = () => {
  // Clear any existing interval first
  if (intervalId.value) {
    clearInterval(intervalId.value);
  }

  // Check every 10 seconds instead of 60 seconds for more timely task execution
  intervalId.value = setInterval(() => {
    try {
      const now = new Date();
      const currentTime = now.toLocaleTimeString("zh-CN", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      // Don't skip all tasks if isRunning is true, just skip individual task execution if already running
      const tasksToRun = scheduledTasks.value.filter((task) => task.enabled);

      if (tasksToRun.length === 0) {
        return;
      }

      tasksToRun.forEach((task) => {
        let shouldRun = false;
        let reason = "";

        if (task.runType === "daily") {
          // Check if current time matches the scheduled time
          const taskTime = task.runTime;
          const nowTime = now.toLocaleTimeString("zh-CN", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
          });
          shouldRun = nowTime === taskTime;
          reason = `currentTime=${nowTime}, taskTime=${taskTime}, match=${shouldRun}`;
        } else if (task.runType === "cron") {
          // Improved cron expression parsing using shared utility
          try {
            shouldRun = matchesCronExpression(task.cronExpression, now);
          } catch (error) {
            console.error(
              `[${new Date().toISOString()}] Error parsing cron expression ${task.cronExpression}:`,
              error,
            );
            addLog({
              time: currentTime,
              message: `=== 解析定时任务 ${task.name} 的Cron表达式失败: ${error.message} ===`,
              type: "error",
            });
            return;
          }
        }

        if (shouldRun) {
          // Check if the task was already executed in the last minute to avoid duplicate execution
          const taskExecutionKey = `${task.id}_${now.getDate()}_${now.getHours()}_${now.getMinutes()}`;
          const lastExecutionKey = localStorage.getItem(
            `lastTaskExecution_${task.id}`,
          );

          if (lastExecutionKey !== taskExecutionKey) {
            // Update last execution time
            localStorage.setItem(
              `lastTaskExecution_${task.id}`,
              taskExecutionKey,
            );

            // Execute the task
            lastTaskExecution = Date.now();
            executeScheduledTask(task);
          } else {
            // Only log once per minute to avoid spamming logs
            // But since we check every 10s, this might log multiple times if we don't track logged state
            // For now, we can skip logging "already executed" to keep logs clean
          }
        }
      });
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] Error in task scheduler:`,
        error,
      );
      addLog({
        time: new Date().toLocaleTimeString(),
        message: `=== 定时任务调度服务发生错误: ${error.message} ===`,
        type: "error",
      });
    }
  }, 10000); // Check every 10 seconds
};

// Token刷新等待处理函数
const handleTokenRefreshWaiting = (data) => {
  addLog({
    time: new Date().toLocaleTimeString(),
    message: `Token刷新限流等待中，预计等待 ${data.waitSeconds} 秒（队列: ${data.queueSize}）`,
    type: "warning",
  });
};

const stopScheduler = () => {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  // 移除Token刷新等待事件监听
  $emit.off("token:refresh:waiting", handleTokenRefreshWaiting);

  // Cleanup task scheduler intervals
  if (intervalId.value) {
    clearInterval(intervalId.value);
    intervalId.value = null;
    addLog({
      time: new Date().toLocaleTimeString(),
      message: "=== 定时任务调度服务已停止 ===",
      type: "info",
    });
  }

  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
};

// Debug: Log initial state when component mounts
onMounted(() => {
  // Start the task scheduler after all functions are initialized
  scheduleTaskExecution();
  // Start countdown timer
  startCountdown();
  loadTaskTemplates();
  // 监听Token刷新等待事件
  $emit.on("token:refresh:waiting", handleTokenRefreshWaiting);
  window.executeScheduledTask = executeScheduledTask;
  window.scheduledTasks = () => scheduledTasks.value;
  window.clearLogs = clearLogs;
  window.getLogs = () => logs.value;
  window.stopScheduler = stopScheduler;
});

// Cleanup countdown interval on unmount
onBeforeUnmount(() => {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  // 移除Token刷新等待事件监听
  $emit.off("token:refresh:waiting", handleTokenRefreshWaiting);

  // Cleanup task scheduler intervals
  if (intervalId.value) {
    clearInterval(intervalId.value);
    intervalId.value = null;
    addLog({
      time: new Date().toLocaleTimeString(),
      message: "=== 定时任务调度服务已停止 ===",
      type: "info",
    });
  }

  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
});

// Task scheduler - 只做健康兜底，不再负责「到点执行」
const scheduleTaskExecution = () => {
  /* 2026-10-29：定时任务已全部改为**服务端调度执行**，客户端不再到点自己跑一遍。
   * 原来这里会 startScheduler()：每 10 秒比对一次时间，命中就本地 executeScheduledTask，
   * 和服务端重复执行。倒计时展示不受影响（startCountdown 由 onMounted 单独调用）。
   * 若哪天要恢复客户端执行，在下面把 startScheduler() 加回来即可。 */
  /* 不再往日志里打一行「服务端调度」的说明 —— 这页本来就没有日志入口，
   * 打出来只是给开发者看的噪音。 */

  // Health check every 5 minutes instead of 1 hour for more frequent safety checks
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
  healthCheckInterval = setInterval(healthCheck, 5 * 60 * 1000);
};

// Verify task dependencies - 只验证基础依赖，WebSocket连接由具体任务函数处理
const verifyTaskDependencies = async (task) => {
  addLog({
    time: new Date().toLocaleTimeString(),
    message: `=== 开始验证定时任务 ${task.name} 的依赖 ===`,
    type: "info",
  });

  // Verify localStorage is available
  try {
    localStorage.setItem("test", "test");
    localStorage.removeItem("test");
    addLog({
      time: new Date().toLocaleTimeString(),
      message: "✅ localStorage可用",
      type: "info",
    });
  } catch (error) {
    addLog({
      time: new Date().toLocaleTimeString(),
      message: `❌ localStorage不可用: ${error.message}`,
      type: "error",
    });
    return false;
  }

  // Verify token store is available
  if (!tokenStore || !tokenStore.gameTokens) {
    addLog({
      time: new Date().toLocaleTimeString(),
      message: "❌ Token存储不可用",
      type: "error",
    });
    return false;
  }

  // Verify task functions exist
  for (const taskName of task.selectedTasks) {
    const taskFunction = eval(taskName);
    if (typeof taskFunction !== "function") {
      addLog({
        time: new Date().toLocaleTimeString(),
        message: `❌ 任务函数不存在: ${taskName}`,
        type: "error",
      });
      return false;
    }
  }

  // 直接使用所有选中的token，WebSocket连接由具体任务函数内部管理
  // ensureConnection函数会自动处理并行连接和连接池管理
  const connectedTokens = task.selectedTokens.map((tokenId) => {
    const tokenName =
      tokenStore.gameTokens.find((t) => t.id === tokenId)?.name || tokenId;
    return { id: tokenId, name: tokenName };
  });

  // Log connection status
  addLog({
    time: new Date().toLocaleTimeString(),
    message: `✅ 将使用 ${connectedTokens.length} 个账号执行任务`,
    type: "info",
  });

  // Store connected tokens for execution
  task.connectedTokens = connectedTokens.map((t) => t.id);

  addLog({
    time: new Date().toLocaleTimeString(),
    message: `=== 定时任务 ${task.name} 的依赖验证通过，将执行 ${connectedTokens.length} 个账号 ===`,
    type: "success",
  });
  return true;
};

// Execute a scheduled task with dependency verification
const executeScheduledTask = async (task) => {
  addLog({
    time: new Date().toLocaleTimeString(),
    message: `=== 开始执行定时任务: ${task.name} ===`,
    type: "info",
  });

  try {
    // Verify dependencies before executing task
    const dependenciesValid = await verifyTaskDependencies(task);
    if (!dependenciesValid) {
      addLog({
        time: new Date().toLocaleTimeString(),
        message: `=== 定时任务 ${task.name} 依赖验证失败，取消执行 ===`,
        type: "error",
      });
      return;
    }

    // Filter out tokens that don't exist in current tokens.value
    const availableTokens = (
      task.connectedTokens || task.selectedTokens
    ).filter((tokenId) => {
      return tokens.value.some((t) => t.id === tokenId);
    });

    const missingTokens = (task.connectedTokens || task.selectedTokens).filter(
      (tokenId) => {
        return !tokens.value.some((t) => t.id === tokenId);
      },
    );

    if (missingTokens.length > 0) {
      addLog({
        time: new Date().toLocaleTimeString(),
        message: `⚠️  跳过不存在的Token: ${missingTokens.join(", ")}`,
        type: "warning",
      });
    }

    if (availableTokens.length === 0) {
      addLog({
        time: new Date().toLocaleTimeString(),
        message: `=== 定时任务 ${task.name} 没有可用的Token，取消执行 ===`,
        type: "error",
      });
      return;
    }

    // Always use the latest selectedTokens from the task that exist in current tokens.value
    selectedTokens.value = [...availableTokens];

    // Execute selected tasks in parallel
    const taskPromises = task.selectedTasks.map(async (taskName) => {
      if (shouldStop.value) return;

      if (
        ["batchbaoku45", "batchbaoku13"].includes(taskName) &&
        !isbaokuActivityOpen.value
      ) {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `跳过任务: ${availableTasks.find((t) => t.value === taskName)?.label || taskName} (不在宝库开放时间)`,
          type: "warning",
        });
        return;
      }

      if (
        ["batchmengjing", "batchBuyDreamItems"].includes(taskName) &&
        !ismengjingActivityOpen.value
      ) {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `跳过任务: ${availableTasks.find((t) => t.value === taskName)?.label || taskName} (不在梦境开放时间)`,
          type: "warning",
        });
        return;
      }


      if (
        ["batchTopUpArena", "batcharenafight"].includes(taskName) &&
        !isarenaActivityOpen.value
      ) {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `跳过任务: ${availableTasks.find((t) => t.value === taskName)?.label || taskName} (不在竞技场开放时间)`,
          type: "warning",
        });
        return;
      }

      if (
        [
          "climbWeirdTower",
          "batchUseItems",
          "batchMergeItems",
          "batchClaimFreeEnergy",
        ].includes(taskName) &&
        !isWeirdTowerActivityOpen.value
      ) {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `跳过任务: ${availableTasks.find((t) => t.value === taskName)?.label || taskName} (不在怪异塔开放时间)`,
          type: "warning",
        });
        return;
      }

      addLog({
        time: new Date().toLocaleTimeString(),
        message: `执行任务: ${availableTasks.find((t) => t.value === taskName)?.label || taskName}`,
        type: "info",
      });

      // Call the task function dynamically
      const taskFunction = eval(taskName);
      if (typeof taskFunction === "function") {
        // For batch operations, pass isScheduledTask = true
        // 具体的batch任务函数内部会使用ensureConnection管理并行连接
        if (
          [
            "batchOpenBox",
            "batchOpenBoxByPoints",
            "batchFish",
            "batchRecruit",
            "batchLegacyGiftSendEnhanced",
          ].includes(taskName)
        ) {
          await taskFunction(true);
        } else {
          await taskFunction();
        }
      } else {
        addLog({
          time: new Date().toLocaleTimeString(),
          message: `任务函数不存在: ${taskName}`,
          type: "error",
        });
      }
    });

    // Wait for all tasks to complete
    await Promise.all(taskPromises);

    addLog({
      time: new Date().toLocaleTimeString(),
      message: `=== 定时任务执行完成: ${task.name} ===`,
      type: "success",
    });
  } catch (error) {
    addLog({
      time: new Date().toLocaleTimeString(),
      message: `=== 定时任务执行失败: ${error.message} ===`,
      type: "error",
    });
    console.error(
      `[${new Date().toISOString()}] Error executing scheduled task ${task.name}:`,
      error,
    );
  }
};

// 注: boxTypeOptions, fishTypeOptions 已从 @/utils/batch 导入

const openHelperModal = (type) => {
  helperType.value = type;
  showHelperModal.value = true;
};

// 批量功法残卷赠送相关方法
const clearRecipientError = () => {
  recipientIdError.value = "";
};

const validateRecipientId = (value) => {
  if (!value || value === "") {
    return true; // 允许为空，由按钮禁用控制
  }
  if (!Number.isInteger(Number(value)) || Number(value) <= 0) {
    recipientIdError.value = "请输入有效的数字ID";
    return false;
  }
  return true;
};

// 头像处理方法
const handleAvatarLoad = () => {
  isAvatarLoading.value = false;
  avatarLoadError.value = false;
};

const handleAvatarError = () => {
  isAvatarLoading.value = false;
  avatarLoadError.value = true;
};

const resetAvatarState = () => {
  isAvatarLoading.value = true;
  avatarLoadError.value = false;
};

const queryRecipientInfo = async () => {
  // 1. 输入验证
  if (!recipientIdInput.value || recipientIdInput.value === "") {
    recipientIdError.value = "请输入接收者ID";
    return;
  }

  const recipientId = Number(recipientIdInput.value);
  if (!Number.isInteger(recipientId) || recipientId <= 0) {
    recipientIdError.value = "请输入有效的数字ID";
    return;
  }

  // 2. 检查选中账号
  if (selectedTokens.value.length === 0) {
    recipientIdError.value = "请先选择要操作的角色";
    return;
  }

  // 3. 初始化状态
  isQueryingRecipient.value = true;
  recipientIdError.value = "";
  recipientInfo.value = null;
  // 重置头像状态
  resetAvatarState();

  const firstTokenId = selectedTokens.value[0];
  const token = tokens.value.find((t) => t.id === firstTokenId);

  // 记录开始查询
  addLog({
    time: new Date().toLocaleTimeString(),
    message: `=== 开始查询接收者信息: 使用账号 ${token.name} (ID: ${firstTokenId}) ===`,
    type: "info",
  });

  try {
    // 确保WebSocket连接
    addLog({
      time: new Date().toLocaleTimeString(),
      message: `正在建立WebSocket连接...`,
      type: "info",
    });

    // 使用现有的ensureConnection函数，它已经包含了重连机制
    await ensureConnection(firstTokenId);

    addLog({
      time: new Date().toLocaleTimeString(),
      message: `WebSocket连接成功`,
      type: "success",
    });

    // 发送查询命令
    addLog({
      time: new Date().toLocaleTimeString(),
      message: `正在发送查询命令，接收者ID: ${recipientId}`,
      type: "info",
    });

    // 延长超时时间到10秒，确保有足够时间处理
    const resp = await tokenStore.sendMessageWithPromise(
      firstTokenId,
      "rank_getroleinfo",
      {
        bottleType: 0,
        includeBottleTeam: false,
        isSearch: false,
        roleId: recipientId,
      },
      10000,
    );

    addLog({
      time: new Date().toLocaleTimeString(),
      message: `查询命令发送成功，正在处理响应...`,
      type: "info",
    });

    // 处理查询结果
    console.log("rank_getroleinfo 响应结果:", resp);

    // 兼容不同的响应结构
    const roleData = resp?.role || resp?.roleInfo;

    if (roleData) {
      // 构建完整的角色信息，移除等级和VIP字段
      recipientInfo.value = {
        roleId: roleData.roleId || roleData.role?.roleId,
        name: roleData.name || roleData.role?.name,
        // 添加头像URL
        avatarUrl:
          resp?.roleInfo?.headImg ||
          roleData?.headImg ||
          roleData?.role?.headImg ||
          "",
        // 战力转换为亿为单位
        power: (function (p) {
          const billion = 100000000;
          return (p / billion).toFixed(2);
        })(roleData.power || roleData.role?.power || 0),
        powerUnit: "亿",
        // 扩展更多角色信息
        serverName: roleData.serverName || roleData.role?.serverName || "",
        legionName: resp?.legionInfo?.name || "",
        legionId: resp?.legionInfo?.id || 0,
      };

      // 格式化角色名，处理特殊字符
      const displayName = recipientInfo.value.name || "未知角色";

      addLog({
        time: new Date().toLocaleTimeString(),
        message: `=== 查询成功: 找到角色 ${displayName} (ID: ${recipientInfo.value.roleId})，战力: ${recipientInfo.value.power}${recipientInfo.value.powerUnit} ===`,
        type: "success",
      });

      message.success("查询成功");
    } else {
      const errorMsg = "未找到该角色信息";
      recipientIdError.value = errorMsg;

      addLog({
        time: new Date().toLocaleTimeString(),
        message: `=== 查询失败: ${errorMsg} ===`,
        type: "error",
      });

      message.error(errorMsg);
    }
  } catch (error) {
    // 详细的错误处理
    console.error("查询接收者信息失败:", error);

    let errorMsg = "查询失败";
    let logType = "error";

    // 根据错误类型提供更友好的错误信息
    if (error.message.includes("连接失败")) {
      errorMsg = "WebSocket连接失败，请检查网络或账号状态";
    } else if (
      error.message.includes("timeout") ||
      error.message.includes("超时")
    ) {
      errorMsg = "查询超时，请稍后重试";
      logType = "warning";
    } else if (error.message.includes("200160")) {
      errorMsg = "功法系统未开启";
    } else {
      errorMsg = `查询失败: ${error.message}`;
    }

    recipientIdError.value = errorMsg;

    // 记录错误日志
    addLog({
      time: new Date().toLocaleTimeString(),
      message: `=== ${errorMsg} ===`,
      type: logType,
    });

    // 显示用户友好的错误提示
    message.error(errorMsg);
  } finally {
    isQueryingRecipient.value = false;

    /* 这条流程只查一次、不主动断连，但必须把 ensureConnection 可能占用的
       并发槽位还回去，否则查几次就把 maxActive 的额度吃光，
       后续批量会一直卡在等槽位。 */
    if (heldSlots.has(firstTokenId)) {
      releaseConnectionSlot();
      heldSlots.delete(firstTokenId);
    }

    // 记录查询完成
    addLog({
      time: new Date().toLocaleTimeString(),
      message: `=== 查询操作完成 ===`,
      type: "info",
    });
  }
};

const confirmLegacyGift = async () => {
  if (!recipientIdInput.value || !recipientInfo.value) {
    message.error("请先查询并确认接收者信息");
    return;
  }

  if (!securityPassword.value) {
    message.error("请输入安全密码");
    return;
  }

  // 调用增强版批量赠送功能
  await batchLegacyGiftSendEnhanced();

  // 关闭模态框
  showLegacyGiftModal.value = false;
  // 清空安全密码
  securityPassword.value = "";
};

const executeHelper = () => {
  if (helperType.value !== "pointsBox") {
    if (helperSettings.count % 10 !== 0 || helperSettings.count < 10) {
      message.warning("消耗数量必须是10的整数倍，最小为10");
      return;
    }
  }
  showHelperModal.value = false;
  if (helperType.value === "box") {
    batchOpenBox();
  } else if (helperType.value === "fish") {
    batchFish();
  } else if (helperType.value === "recruit") {
    batchRecruit();
  } else if (helperType.value === "pointsBox") {
    batchOpenBoxByPoints();
  }
};

// Dream Buy Modal Logic
const showDreamBuyModal = ref(false);
const dreamBuyList = ref([]);

const openDreamBuyModal = () => {
  // Load saved settings
  dreamBuyList.value = batchSettings.dreamPurchaseList || [];
  showDreamBuyModal.value = true;
};

const toggleDreamItem = (itemKey, checked) => {
  if (checked) {
    if (!dreamBuyList.value.includes(itemKey)) {
      dreamBuyList.value.push(itemKey);
    }
  } else {
    dreamBuyList.value = dreamBuyList.value.filter((k) => k !== itemKey);
  }
};

/* 每个商人已勾选多少个 —— 节标题右侧的「已选 / 总数」。
   原来只能靠肉眼数勾选框，18 个商品根本数不过来。 */
const countPickedOf = (id) => {
  const items = merchantConfig[id] ? merchantConfig[id].items : [];
  return items.filter((_, i) => dreamBuyList.value.includes(id + "-" + i)).length;
};

const saveDreamBuyConfig = () => {
  // Save settings
  batchSettings.dreamPurchaseList = [...dreamBuyList.value];
  saveBatchSettings();

  showDreamBuyModal.value = false;
  message.success("梦境购买配置已保存");
};

const selectGoldItems = () => {
  const newSelection = new Set(dreamBuyList.value);

  for (const merchantId in goldItemsConfig) {
    const items = goldItemsConfig[merchantId];
    items.forEach((index) => {
      newSelection.add(`${merchantId}-${index}`);
    });
  }

  dreamBuyList.value = Array.from(newSelection);
};

const selectAllItems = () => {
  const newSelection = new Set(dreamBuyList.value);

  for (const merchantId in merchantConfig) {
    const items = merchantConfig[merchantId].items;
    items.forEach((_, index) => {
      newSelection.add(`${merchantId}-${index}`);
    });
  }

  dreamBuyList.value = Array.from(newSelection);
};

const clearAllItems = () => {
  dreamBuyList.value = [];
};

// 注: formationOptions, bossTimesOptions 已从 @/utils/batch 导入

const loadSettings = (tokenId) => {
  try {
    const raw = localStorage.getItem(`daily-settings:${tokenId}`);
    const defaultSettings = {
      arenaFormation: 1,
      towerFormation: 1,
      bossFormation: 1,
      bossTimes: 2,
      claimBottle: true,
      payRecruit: true,
      openBox: true,
      arenaEnable: true,
      claimHangUp: true,
      claimEmail: true,
      blackMarketPurchase: true,
    };
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings;
  } catch (error) {
    console.error("Failed to load settings:", error);
    return null;
  }
};

const openSettings = (token) => {
  currentSettingsTokenId.value = token.id;
  currentSettingsTokenName.value = token.name;
  const saved = loadSettings(token.id);
  Object.assign(currentSettings, saved);
  showSettingsModal.value = true;
};

const saveSettings = () => {
  if (currentSettingsTokenId.value) {
    localStorage.setItem(
      `daily-settings:${currentSettingsTokenId.value}`,
      JSON.stringify(currentSettings),
    );
    message.success(`已保存 ${currentSettingsTokenName.value} 的设置`);
    showSettingsModal.value = false;
  }
};

// Task Template Functions
const openTaskTemplateModal = () => {
  // 加载模板列表
  loadTaskTemplates();
  // 重置当前模板
  Object.assign(currentTemplate, {
    arenaFormation: 1,
    towerFormation: 1,
    bossFormation: 1,
    bossTimes: 2,
    claimBottle: true,
    payRecruit: true,
    openBox: true,
    arenaEnable: true,
    claimHangUp: true,
    claimEmail: true,
    blackMarketPurchase: true,
  });
  currentTemplateName.value = "";
  showTaskTemplateModal.value = true;
};

const loadTaskTemplates = () => {
  const templates = localStorage.getItem("task-templates");
  const parsed = templates ? JSON.parse(templates) : [];
  taskTemplates.value = parsed;
  return parsed;
};

/* 模板列表的创建时间：toLocaleString() 出来是「2026/10/30 15:04:05」，
   在 40px 的行里会把模板名挤走，列表只需要「10/30 15:04」这种短读法 */
const formatShortTime = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return (
    p(d.getMonth() + 1) +
    "/" +
    p(d.getDate()) +
    " " +
    p(d.getHours()) +
    ":" +
    p(d.getMinutes())
  );
};

const openApplyTemplateModal = () => {
  // 加载模板列表
  loadTaskTemplates();
  // 重置选择
  selectedTemplateId.value = null;
  selectedTokensForApply.value = [];
  showApplyTemplateModal.value = true;
};

const handleSelectAllForApply = (checked) => {
  if (checked) {
    selectedTokensForApply.value = sortedTokens.value.map((token) => token.id);
  } else {
    selectedTokensForApply.value = [];
  }
};

/* 应用模板弹窗：分组快选是**开关**，不是「只加不减」——
   组内账号全勾上时再点一次，把这些账号取消掉（用户预期：点一下选、再点一下不选）。
   ★ 这里必须 .value：模板里 ref 会自动解包，提成 setup 函数后拿到的是 Ref 对象本身，
     直接 .includes 会抛「not a function」，点击分组毫无反应（上一版就是这个 bug）。 */
const isGroupPicked = (groupId) => {
  const ids = getValidGroupTokenIds(groupId);
  return ids.length > 0 && ids.every((id) => selectedTokensForApply.value.includes(id));
};

const toggleGroupForApply = (groupId) => {
  const ids = getValidGroupTokenIds(groupId);
  if (!ids.length) return;
  if (isGroupPicked(groupId)) {
    selectedTokensForApply.value = selectedTokensForApply.value.filter(
      (id) => !ids.includes(id),
    );
    return;
  }
  const next = new Set(selectedTokensForApply.value);
  ids.forEach((id) => next.add(id));
  selectedTokensForApply.value = Array.from(next);
};

const applyTemplate = () => {
  if (!selectedTemplateId.value || selectedTokensForApply.value.length === 0) {
    message.error("请选择模板和要应用的账号");
    return;
  }

  // 找到选中的模板
  const templates = loadTaskTemplates();
  const template = templates.find((t) => t.id === selectedTemplateId.value);
  if (!template) {
    message.error("模板不存在");
    return;
  }

  // 应用模板到选中的账号
  let successCount = 0;
  selectedTokensForApply.value.forEach((tokenId) => {
    // 保存账号设置时同时保存模板ID
    const accountSettings = {
      ...template.settings,
      templateId: template.id, // 记录模板ID
    };
    localStorage.setItem(
      `daily-settings:${tokenId}`,
      JSON.stringify(accountSettings),
    );
    successCount++;
  });

  message.success(`已成功应用模板到 ${successCount} 个账号`);
  showApplyTemplateModal.value = false;
};

// Template Manager Functions
const openTemplateManagerModal = () => {
  // 加载模板列表
  loadTaskTemplates();
  showTemplateManagerModal.value = true;
};

const openEditTemplateModal = (template) => {
  // 加载模板数据到当前编辑模板
  currentTemplateId.value = template.id;
  currentTemplateName.value = template.name;
  Object.assign(currentTemplate, template.settings);
  showTaskTemplateModal.value = true;
};

const updateTaskTemplate = () => {
  if (!currentTemplateName.value.trim()) {
    message.error("请输入模板名称");
    return;
  }

  // 找到并更新模板
  const templates = loadTaskTemplates();
  const templateIndex = templates.findIndex(
    (t) => t.id === currentTemplateId.value,
  );
  if (templateIndex === -1) {
    message.error("模板不存在");
    return;
  }

  // 更新模板
  templates[templateIndex] = {
    ...templates[templateIndex],
    name: currentTemplateName.value.trim(),
    settings: {
      ...currentTemplate,
    },
    updatedAt: new Date().toISOString(),
  };

  // 保存模板到localStorage
  localStorage.setItem("task-templates", JSON.stringify(templates));

  // 更新模板列表
  taskTemplates.value = templates;

  message.success(`已更新模板 "${templates[templateIndex].name}"`);
  showTaskTemplateModal.value = false;

  // 重置编辑状态
  resetTemplateForm();
};

/* 原来这里用的是浏览器原生 confirm()（白框 + 系统字体，和整站两套） */
const deleteTaskTemplate = (templateId) => {
  const tpl = (taskTemplates.value || []).find((t) => t.id === templateId);
  confirmDanger(dialog, {
    title: "删除任务模板",
    content: "已保存的定时任务不受影响，它们各自保留自己的设置。",
    details: tpl ? [{ label: "任务模板", value: tpl.name }] : undefined,
    onPositiveClick: () => {
      const templates = loadTaskTemplates();
      const filteredTemplates = templates.filter((t) => t.id !== templateId);
      localStorage.setItem("task-templates", JSON.stringify(filteredTemplates));
      taskTemplates.value = filteredTemplates;
      message.success("模板已删除");
    },
  });
};

const resetTemplateForm = () => {
  currentTemplateId.value = null;
  currentTemplateName.value = "";
  Object.assign(currentTemplate, {
    arenaFormation: 1,
    towerFormation: 1,
    bossFormation: 1,
    bossTimes: 2,
    claimBottle: true,
    payRecruit: true,
    openBox: true,
    arenaEnable: true,
    claimHangUp: true,
    claimEmail: true,
    blackMarketPurchase: true,
  });
};

const openAccountTemplateModal = () => {
  // 加载账号模板引用关系
  loadAccountTemplateReferences();
  showAccountTemplateModal.value = true;
};

const loadAccountTemplateReferences = () => {
  const templates = loadTaskTemplates();
  const references = [];

  // 遍历所有账号，获取其模板引用
  sortedTokens.value.forEach((token) => {
    const settingsStr = localStorage.getItem(`daily-settings:${token.id}`);
    if (settingsStr) {
      try {
        const settings = JSON.parse(settingsStr);
        const templateId = settings.templateId;
        const template = templates.find((t) => t.id === templateId);

        references.push({
          tokenId: token.id,
          tokenName: token.name,
          templateId: templateId,
          templateName: template ? template.name : "未引用模板",
        });
      } catch (e) {
        console.error(`解析账号 ${token.name} 的设置失败:`, e);
      }
    } else {
      // 没有设置的账号
      references.push({
        tokenId: token.id,
        tokenName: token.name,
        templateId: null,
        templateName: "未引用模板",
      });
    }
  });

  accountTemplateReferences.value = references;
  filteredAccountTemplates.value = references;
};

const filterAccountTemplates = () => {
  if (!selectedTemplateForFilter.value) {
    filteredAccountTemplates.value = accountTemplateReferences.value;
  } else {
    filteredAccountTemplates.value = accountTemplateReferences.value.filter(
      (item) => item.templateId === selectedTemplateForFilter.value,
    );
  }
};

const openNewTemplateModal = () => {
  // 重置表单，准备创建新模板
  resetTemplateForm();
  showTaskTemplateModal.value = true;
};

// 修改saveTaskTemplate函数，支持新增和编辑
const saveTaskTemplate = () => {
  if (!currentTemplateName.value.trim()) {
    message.error("请输入模板名称");
    return;
  }

  const templates = loadTaskTemplates();

  if (currentTemplateId.value) {
    // 更新现有模板
    updateTaskTemplate();
  } else {
    // 创建新模板
    const template = {
      id: Date.now().toString(),
      name: currentTemplateName.value.trim(),
      settings: {
        ...currentTemplate,
      },
      createdAt: new Date().toISOString(),
    };

    // 添加新模板
    templates.push(template);
    localStorage.setItem("task-templates", JSON.stringify(templates));

    // 更新模板列表
    taskTemplates.value = templates;

    message.success(`已保存模板 "${template.name}"`);
    showTaskTemplateModal.value = false;

    // 重置表单
    resetTemplateForm();
  }
};

const currentRunningTokenId = ref(null);
const currentProgress = ref(0);
const logs = ref([]);
const logContainer = ref(null);
/* 移动端：执行日志改成弹窗。点功能按钮 / 一键日常时自动打开，
 * 用户主动关掉后本轮不再自动弹（再点下一个任务会重新打开）。 */
const showLogModal = ref(false);
function openLogModal() {
  showLogModal.value = true;
}
/* 事件委托：批量功能列表里的按钮有 50+ 个，逐个绑 @click 不现实。
 * 在 <n-tabs> 上捕获点击，只认 .n-tab-pane 里的可点按钮（排除禁用态）。 */
function onPaneClick(e) {
  const btn = e.target && e.target.closest
    ? e.target.closest(".n-tab-pane .n-button")
    : null;
  if (!btn) return;
  if (btn.classList.contains("n-button--disabled")) return;
  openLogModal();
}
const autoScrollLog = ref(true);
const filterErrorsOnly = ref(false);
const errorCount = computed(() => {
  return logs.value.filter((log) => log.type === "error").length;
});

const filteredLogs = computed(() => {
  if (filterErrorsOnly.value) {
    return logs.value.filter((log) => log.type === "error");
  }
  return logs.value;
});

const currentRunningTokenName = computed(() => {
  const t = tokens.value.find((x) => x.id === currentRunningTokenId.value);
  return t ? t.name : "";
});

const getStatusType = (tokenId) => {
  const status = tokenStatus.value[tokenId];
  if (status === "completed") return "success";
  if (status === "failed") return "error";
  if (status === "running") return "info";
  return "default";
};

const getStatusText = (tokenId) => {
  const status = tokenStatus.value[tokenId];
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  if (status === "running") return "执行中";
  return "等待中";
};

// =====================
// Token分组管理相关方法
// =====================

/**
 * 创建新分组
 */
const createNewGroup = () => {
  if (!newGroupName.value.trim()) {
    message.warning("请输入分组名称");
    return;
  }

  const newGroup = tokenStore.createTokenGroup(
    newGroupName.value.trim(),
    newGroupColor.value,
  );

  // 添加选中的Token到新分组
  if (newGroupSelectedTokens.value.length > 0) {
    newGroupSelectedTokens.value.forEach((tokenId) => {
      tokenStore.addTokenToGroup(newGroup.id, tokenId);
    });
  }

  message.success("分组创建成功");
  newGroupName.value = "";
  newGroupColor.value = "#1677ff";
  newGroupSelectedTokens.value = [];
};

const allNewGroupTokensSelected = computed(
  () =>
    sortedTokens.value.length > 0 &&
    newGroupSelectedTokens.value.length >= sortedTokens.value.length,
);
const someNewGroupTokensSelected = computed(
  () =>
    newGroupSelectedTokens.value.length > 0 &&
    newGroupSelectedTokens.value.length < sortedTokens.value.length,
);
const toggleAllNewGroupTokens = (checked) => {
  if (checked) selectAllNewGroup();
  else deselectAllNewGroup();
};

const selectAllNewGroup = () => {
  newGroupSelectedTokens.value = sortedTokens.value.map((t) => t.id);
};

const deselectAllNewGroup = () => {
  newGroupSelectedTokens.value = [];
};

/**
 * 删除分组
 */
/* 删除确认：原来走浏览器原生 confirm()（白框 + 系统字体 + 夹在页面里，和整站风格两套）。
   改成 Naive 站内对话框：标题说清删的是哪个分组，正文点明「只删分组、不动账号」，
   确认键用危险色（删除不可逆），取消键留默认 —— 两个键同宽，拇指好点。 */
const deleteGroup = (groupId) => {
  const group = (tokenGroups.value || []).find((g) => g.id === groupId);
  const count = getValidGroupTokenIds(groupId).length;
  confirmDanger(dialog, {
    title: "删除分组",
    content: count
      ? "组内账号不会被删除，只是从这个分组里移除。"
      : "这个分组里还没有账号，删除后不可撤销。",
    details: [
      { label: "分组", value: group ? group.name : "当前分组" },
      { label: "组内账号", value: `${count} 个` },
    ],
    onPositiveClick: () => {
      tokenStore.deleteTokenGroup(groupId);
      message.success("分组已删除");
    },
  });
};

/**
 * 保存编辑的分组
 */
const saveEditGroup = () => {
  if (!editingGroupId.value) return;

  if (!editingGroupName.value.trim()) {
    message.warning("请输入分组名称");
    return;
  }

  tokenStore.updateTokenGroup(editingGroupId.value, {
    name: editingGroupName.value.trim(),
    color: editingGroupColor.value,
  });

  message.success("分组已更新");
  editingGroupId.value = null;
  editingGroupName.value = "";
  editingGroupColor.value = "";
};

/**
 * 开始编辑分组
 */
const startEditGroup = (groupId) => {
  const group = tokenGroups.value.find((g) => g.id === groupId);
  if (group) {
    editingGroupId.value = groupId;
    editingGroupName.value = group.name;
    editingGroupColor.value = group.color;
  }
};

/**
 * 取消编辑分组
 */
const cancelEditGroup = () => {
  editingGroupId.value = null;
  editingGroupName.value = "";
  editingGroupColor.value = "";
};

/**
 * 切换分组选择状态
 */
const toggleGroupSelection = (groupId) => {
  const index = selectedGroups.value.indexOf(groupId);
  if (index > -1) {
    selectedGroups.value.splice(index, 1);
  } else {
    selectedGroups.value.push(groupId);
  }

  // 更新selectedTokens
  updateSelectedTokensFromGroups();
};

/**
 * 根据选中的分组更新selectedTokens
 */
const updateSelectedTokensFromGroups = () => {
  const tokenIds = new Set();

  selectedGroups.value.forEach((groupId) => {
    const validTokenIds = tokenStore.getValidGroupTokenIds(groupId);
    validTokenIds.forEach((id) => tokenIds.add(id));
  });

  selectedTokens.value = Array.from(tokenIds);
};

/**
 * 一键清除所有分组选择
 */
const clearAllGroupSelection = () => {
  selectedGroups.value = [];
  selectedTokens.value = [];
};

/**
 * 添加token到分组
 */
const addTokenToSelectedGroup = (groupId, tokenId) => {
  tokenStore.addTokenToGroup(groupId, tokenId);
  message.success("已将token添加到分组");
};

/**
 * 从分组移除token
 */
const removeTokenFromSelectedGroup = (groupId, tokenId) => {
  tokenStore.removeTokenFromGroup(groupId, tokenId);
  message.success("已将token从分组移除");
};

/**
 * 获取分组中有效的token ID列表（用于模板中展示）
 */
const getValidGroupTokenIds = (groupId) => {
  return tokenStore.getValidGroupTokenIds(groupId);
};

/** 还能加进这个分组的账号（不在组里的）。全加完就没有可选项了 —— 下拉直接隐藏，
 *  否则 Naive 会弹一个空菜单写「No Data」，看着像坏了。 */
const getAddableTokens = (groupId) => {
  const ids = getValidGroupTokenIds(groupId);
  return (tokens.value || []).filter((t) => !ids.includes(t.id));
};

/**
 * 获取分组中的token列表
 */
const getGroupTokenList = (groupId) => {
  const tokenIds = tokenStore.getValidGroupTokenIds(groupId);
  return tokens.value.filter((t) => tokenIds.includes(t.id));
};

// 注: pickArenaTargetId, FISH_TARGET, ARENA_TARGET, getTodayStartSec, isTodayAvailable, calculateMonthProgress 已从 @/utils/batch 导入

const addLog = (log) => {
  // 添加日志数据到数组
  logs.value.push(log);

  // 限制logs数组大小，防止内存占用过大
  const maxLogEntries = batchSettings.maxLogEntries || 1000;
  if (logs.value.length > maxLogEntries) {
    logs.value = logs.value.slice(-maxLogEntries);
  }

  // 尝试DOM操作，但不依赖nextTick确保日志显示
  // 在后台运行时，浏览器可能会限制DOM操作
  try {
    if (logContainer.value && autoScrollLog.value) {
      // 直接尝试滚动，不使用nextTick
      logContainer.value.scrollTop = logContainer.value.scrollHeight;
    }
  } catch (error) {
    // 忽略DOM操作错误，确保日志数据仍然被记录
    console.warn("Failed to scroll log container:", error);
  }

  // 同时使用nextTick作为后备，确保在页面回到前台时能正确滚动
  nextTick(() => {
    try {
      if (logContainer.value && autoScrollLog.value) {
        logContainer.value.scrollTop = logContainer.value.scrollHeight;
      }
    } catch (error) {
      // 忽略错误
    }
  });
};

watch(autoScrollLog, (newValue) => {
  if (newValue && logContainer.value) {
    nextTick(() => {
      try {
        logContainer.value.scrollTop = logContainer.value.scrollHeight;
      } catch (error) {
        // 忽略DOM操作错误
        console.warn("Failed to scroll log container:", error);
      }
    });
  }
});

const copyLogs = () => {
  if (logs.value.length === 0) {
    message.warning("没有可复制的日志");
    return;
  }
  const logText = logs.value
    .map((log) => `${log.time} ${log.message}`)
    .join("\n");
  navigator.clipboard
    .writeText(logText)
    .then(() => {
      message.success("日志已复制到剪贴板");
    })
    .catch((err) => {
      message.error("复制日志失败: " + err.message);
    });
};

const clearLogs = () => {
  logs.value = [];
  message.success("日志已清空");
};

const waitForConnection = async (
  tokenId,
  timeout = batchSettings.connectionTimeout,
) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const status = tokenStore.getWebSocketStatus(tokenId);
    if (status === "connected") return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
};

// 全局连接队列控制 - 限制并发连接数
const connectionQueue = { active: 0 };

/* 本轮批量「自己建立的连接」与「自己占用的槽位」分别记账。
   关键：用户正在用的账号（例如当前账号）本来就 connected，
   它不是本次批量建立的，结束时不能关、也不能替它归还槽位，
   否则会把别处正占着的并发名额吐掉，或把用户的连接掐断。 */
const ownedConnections = new Set();
const heldSlots = new Set();

const waitForConnectionSlot = async () => {
  while (connectionQueue.active >= batchSettings.maxActive) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  connectionQueue.active++;
};

const releaseConnectionSlot = () => {
  if (connectionQueue.active > 0) {
    connectionQueue.active--;
  }
};

const ensureConnection = async (tokenId, maxRetries = 2) => {
  const latestToken = tokens.value.find((t) => t.id === tokenId);
  if (!latestToken) {
    throw new Error(`Token not found: ${tokenId}`);
  }

  let status = tokenStore.getWebSocketStatus(tokenId);
  let connected = status === "connected";

  if (!connected) {
    // 等待连接槽位，限制并发连接数
    await waitForConnectionSlot();
    heldSlots.add(tokenId);

    addLog({
      time: new Date().toLocaleTimeString(),
      message: `正在连接... (队列: ${connectionQueue.active}/${batchSettings.maxActive})`,
      type: "info",
    });

    tokenStore.createWebSocketConnection(
      tokenId,
      latestToken.token,
      latestToken.wsUrl,
    );
    connected = await waitForConnection(tokenId);
    if (connected) ownedConnections.add(tokenId);

    if (!connected && maxRetries > 0) {
      addLog({
        time: new Date().toLocaleTimeString(),
        message: `连接超时，尝试重连...`,
        type: "warning",
      });

      tokenStore.closeWebSocketConnection(tokenId);
      ownedConnections.delete(tokenId);
      await new Promise((r) => setTimeout(r, batchSettings.reconnectDelay));

      addLog({
        time: new Date().toLocaleTimeString(),
        message: `正在重连...`,
        type: "info",
      });

      const refreshedToken = tokens.value.find((t) => t.id === tokenId);
      tokenStore.createWebSocketConnection(
        tokenId,
        refreshedToken.token,
        refreshedToken.wsUrl,
      );

      connected = await waitForConnection(tokenId);
      if (connected) ownedConnections.add(tokenId);
    }

    if (!connected) {
      // 连接失败，释放槽位
      releaseConnectionSlot();
      heldSlots.delete(tokenId);
      throw new Error("连接失败 (重试后仍超时)");
    }
  }

  // 连接成功，槽位保持占用，直到任务完成后手动释放

  // Initialize Game Data (Critical for Battle Version and Session)
  try {
    // Fetch Role Info first (Standard flow)
    await tokenStore.sendMessageWithPromise(
      tokenId,
      "role_getroleinfo",
      {},
      5000,
    );

    // Fetch Battle Version
    const res = await tokenStore.sendMessageWithPromise(
      tokenId,
      "fight_startlevel",
      {},
      5000,
    );
    if (res?.battleData?.version) {
      tokenStore.setBattleVersion(res.battleData.version);
    }
  } catch (e) {
    addLog({
      time: new Date().toLocaleTimeString(),
      message: `初始化数据失败: ${e.message}`,
      type: "warning",
    });
  }

  return true;
};

const createTaskDeps = () => ({
  selectedTokens,
  tokens,
  tokenStatus,
  isRunning,
  shouldStop,
  ensureConnection,
  releaseConnectionSlot,
  connectionQueue,
  batchSettings,
  tokenStore,
  addLog,
  message,
  currentRunningTokenId,
  // 延迟配置
  delayConfig: {
    command: batchSettings.commandDelay,
    task: batchSettings.taskDelay,
    action: batchSettings.actionDelay,
    battle: batchSettings.battleDelay,
    refresh: batchSettings.refreshDelay,
    long: batchSettings.longDelay,
  },
  // 其他特定依赖
  logs,
  logContainer,
  autoScrollLog,
  nextTick,
  // 设置相关
  currentSettings,
  helperSettings,
  weirdTowerMaxClimb,
  // 功法赠送相关
  recipientIdInput,
  recipientInfo,
  securityPassword,
  giftQuantity,
  // 竞技场相关辅助函数
  pickArenaTargetId,
  getTodayStartSec,
  isTodayAvailable,
  calculateMonthProgress,
  // 配置加载函数
  loadSettings,
});

// 初始化任务模块
const tasksHangUp = createTasksHangUp(createTaskDeps());
const {
  claimHangUpRewards,
  batchAddHangUpTime,
  batchStudy,
  batchclubsign,
  batchWarGuessCheer,
} = tasksHangUp;

const tasksBottle = createTasksBottle(createTaskDeps());
const { resetBottles, batchlingguanzi } = tasksBottle;

const tasksTower = createTasksTower(createTaskDeps());
const {
  climbTower,
  climbWeirdTower,
  batchClaimFreeEnergy,
  skinChallenge,
  batchUseItems,
  batchMergeItems,
} = tasksTower;


const tasksItem = createTasksItem(createTaskDeps());
const {
  batchOpenBox,
  batchOpenBoxByPoints,
  batchClaimBoxPointReward,
  batchFish,
  batchRecruit,
  batchHeroUpgrade,
  batchBookUpgrade,
  batchClaimStarRewards,
  batchClaimPeachTasks,
  batchGenieSweep,
} = tasksItem;

const tasksDungeon = createTasksDungeon(createTaskDeps());
const { batchbaoku13, batchbaoku45, batchmengjing, batchBuyDreamItems } =
  tasksDungeon;

const tasksArena = createTasksArena(createTaskDeps());
const { batcharenafight, batchTopUpFish, batchTopUpArena } = tasksArena;

const tasksStore = createTasksStore(createTaskDeps());
const {
  legion_storebuygoods,
  legionStoreBuySkinCoins,
  store_purchase,
  collection_claimfreereward,
} = tasksStore;

const tasksLegacy = createTasksLegacy(createTaskDeps());
const { batchLegacyClaim, batchLegacyGiftSendEnhanced } = tasksLegacy;

const tasksFootball = createTasksFootball(createTaskDeps());
const { batchFootballBet } = tasksFootball;

const tasksApex = createTasksApex(createTaskDeps());
const { batchApexGuess } = tasksApex;

const tasksCampChallenge = createTasksCampChallenge(createTaskDeps());
const { batchCampChallenge, batchCampChallengePet, batchCampClaimTasks } = tasksCampChallenge;
const tasksXuanwuBlessing = createTasksXuanwuBlessing(createTaskDeps());
const { batchXuanwuBlessing } = tasksXuanwuBlessing;

// 营地挑战模式选择
const campChallengeMode = ref("pet");
const campChallengeModeOptions = [
  { label: "挑战宠物", value: "pet" },
  { label: "随机挑战人员", value: "random" },
  { label: "领取任务奖励", value: "claim" },
];
const campChallengeModeLabel = computed(() => {
  return campChallengeModeOptions.find((o) => o.value === campChallengeMode.value)?.label || "";
});
const onCampChallengeModeChange = async (val) => {
  campChallengeMode.value = val;
  if (val === "pet") {
    await batchCampChallengePet();
  } else if (val === "claim") {
    await batchCampClaimTasks();
  } else {
    await batchCampChallenge();
  }
};

// 盐杯竞猜 pick 选择
const footballPick = ref(3);
const footballPickOptions = [
  { label: "主胜", value: 1 },
  { label: "平局", value: 2 },
  { label: "客胜", value: 3 },
];
const footballPickLabel = computed(() => {
  return footballPickOptions.find((o) => o.value === footballPick.value)?.label || "";
});
const onFootballPickChange = async (val) => {
  footballPick.value = val;
  await batchFootballBet(val);
};

const startBatch = async () => {
  /* 按钮不再因为「没选账号」而变灰（灰着点不动、用户不知道差什么），
     改成可点 + 点了给一句明确提示。 */
  if (selectedTokens.value.length === 0) {
    message.warning("请先勾选一个账号，再执行一键日常");
    return;
  }

  openLogModal();
  isRunning.value = true;
  shouldStop.value = false;
  isStopping.value = false;
  // 每轮开始重置记账，避免上一轮（或其它流程）残留
  ownedConnections.clear();
  heldSlots.clear();
  // 不再重置logs数组，保留之前的日志
  // logs.value = [];

  // Reset status
  selectedTokens.value.forEach((id) => {
    tokenStatus.value[id] = "waiting";
  });

  // 并行执行任务，但通过connectionQueue限制并发连接数
  const taskPromises = selectedTokens.value.map(async (tokenId) => {
    if (shouldStop.value) return;

    tokenStatus.value[tokenId] = "running";

    let retryCount = 0;
    const MAX_RETRIES = 1;
    let success = false;

    while (retryCount <= MAX_RETRIES && !success) {
      if (shouldStop.value) break;

      const token = tokens.value.find((t) => t.id === tokenId);

      try {
        if (retryCount === 0) {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `=== 开始执行: ${token.name} ===`,
            type: "info",
          });
        } else {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `=== 尝试重试: ${token.name} (第${retryCount}次) ===`,
            type: "info",
          });
        }

        await ensureConnection(tokenId);

        // Create runner with delay settings
        const runner = new DailyTaskRunner(tokenStore, {
          commandDelay: batchSettings.commandDelay,
          taskDelay: batchSettings.taskDelay,
        });

        // Run tasks
        await runner.run(tokenId, {
          onLog: (log) => addLog(log),
          onProgress: (p) => {
            // 每个token维护自己的进度
          },
          /* 让「停止」在任务之间就能生效（引擎每个任务开始前问一次）。
             不传这个回调时引擎行为不变 —— 桌面端走的是另一种调用。 */
          shouldAbort: () => shouldStop.value,
        });

        success = true;
        tokenStatus.value[tokenId] = "completed";
        addLog({
          time: new Date().toLocaleTimeString(),
          message: shouldStop.value
            ? `=== ${token.name} 已停止 ===`
            : `=== ${token.name} 执行完成 ===`,
          type: shouldStop.value ? "warning" : "success",
        });
      } catch (error) {
        console.error(error);
        if (retryCount < MAX_RETRIES && !shouldStop.value) {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 执行出错: ${error.message}，等待3秒后重试...`,
            type: "warning",
          });
          // Wait for potential token refresh in store
          await new Promise((r) => setTimeout(r, 3000));
          retryCount++;
        } else {
          tokenStatus.value[tokenId] = "failed";
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 执行失败: ${error.message}`,
            type: "error",
          });
          /* 重试额度已用完必须跳出：之前没有 break，retryCount 卡在 MAX_RETRIES
             不再自增，while 条件恒真 ⇒ 这个账号会无限重连重跑，
             日志刷屏、连接反复开关，整批任务永远不结束。 */
          break;
        }
      } finally {
        /* 先还槽位再写日志，日志里的「队列 x/y」才是回收后的真实值 */
        if (heldSlots.has(tokenId)) {
          releaseConnectionSlot();
          heldSlots.delete(tokenId);
        }

        /* 只回收「本轮自己建立」的连接：账号在批量开始前就已经连着
           （典型是当前账号，用户正在用），跑完必须保留，不能掐断。 */
        if (ownedConnections.has(tokenId)) {
          tokenStore.closeWebSocketConnection(tokenId);
          ownedConnections.delete(tokenId);
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 连接已关闭  (队列: ${connectionQueue.active}/${batchSettings.maxActive})`,
            type: "info",
          });
        } else {
          addLog({
            time: new Date().toLocaleTimeString(),
            message: `${token.name} 保留原有连接（执行前已在连接中）`,
            type: "info",
          });
        }
      }
    }
  });

  // 等待所有任务完成
  await Promise.all(taskPromises);

  // 等待所有任务完成后再继续
  await new Promise((r) => setTimeout(r, 1000));

  isRunning.value = false;
  isStopping.value = false;
  currentRunningTokenId.value = null;
  if (shouldStop.value) message.warning("已停止执行");
  else message.success("批量任务执行结束");
};

/* ============ 整批跑完后把当前账号的连接接回来 ============
 * 各「一键 XX」任务收尾时会关掉自己用过的连接（`src/utils/batch/*` 共 44 处），
 * 其中就包括当前账号 —— 用户正在用的那条。逐个改断连逻辑太散，这里统一兜一道：
 *   整批结束（isRunning 落回 false）时，只要当前账号（`current_token` /
 *   `selectedToken`）没连着，就按 store 里存着的 token 重连一次。
 * 依据：每个会断连的模块都成对出现 `isRunning.value = true/false`（10/10、6/6…一一对应），
 * 所以盯 isRunning 这一个信号就能覆盖全部按钮，不必去碰那 44 处。
 * ★ 只处理当前账号，且只在「已断开」时动手：连着的账号不打扰。
 *
 * ★★ 必须等上一条连接彻底关干净再连（2026-11-02 用户报「重连总是失败，之后手动连也不成功」）：
 *   `closeWebSocketConnection` 是 fire-and-forget，内部 await 最多 5 秒才
 *   `delete wsConnections[tokenId]`。若紧接着就 create，新连接刚登记进表就被那条
 *   **还没收尾的关闭**删掉 —— 状态永远回不到 connected，外面还留一条没人管的 socket，
 *   服务端把它当已在线，之后手动连接也一律不成功，只能刷新页面。
 *   所以先等状态稳定在 disconnected，再建连接。
 */
const waitConnectionQuiet = async (tokenId, timeout = 8000) => {
  const start = Date.now();
  let quietSince = 0;
  while (Date.now() - start < timeout) {
    const st = tokenStore.getWebSocketStatus(tokenId);
    if (st === "connected") return "connected";
    if (st === "disconnected" || st === "error") {
      if (!quietSince) quietSince = Date.now();
      else if (Date.now() - quietSince >= 300) return "quiet";
    } else {
      // disconnecting / connecting：还在动，重新计时
      quietSince = 0;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return "timeout";
};

const restoreCurrentConnection = async () => {
  const cur = tokenStore.selectedToken;
  if (!cur) return;
  if (tokenStore.getWebSocketStatus(cur.id) === "connected") return;
  addLog({
    time: new Date().toLocaleTimeString(),
    message: `当前账号 ${cur.name} 的连接被任务关闭，正在自动重连…`,
    type: "info",
  });

  let ok = false;
  for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
    const quiet = await waitConnectionQuiet(cur.id);
    if (quiet === "connected") {
      ok = true;
      break;
    }
    // 8 秒还没关干净：宁可这轮不连，也不要在别人收尾时插一条进去（会变成孤儿连接）
    if (quiet === "timeout") continue;
    try {
      // token 可能在批处理里被刷新过，取最新的
      const fresh = tokenStore.gameTokens?.find((t) => t.id === cur.id) || cur;
      tokenStore.createWebSocketConnection(cur.id, fresh.token, fresh.wsUrl);
      ok = await waitForConnection(cur.id, 10000);
    } catch (e) {
      console.warn("[batch] 恢复当前账号连接失败:", e);
    }
    if (!ok) {
      // 半成品关掉、等它安静，再试最后一次
      tokenStore.closeWebSocketConnection(cur.id);
    }
  }

  addLog({
    time: new Date().toLocaleTimeString(),
    message: ok
      ? `当前账号 ${cur.name} 连接已恢复`
      : `当前账号 ${cur.name} 自动重连失败，请手动点「连接账号」`,
    type: ok ? "success" : "warning",
  });
};

watch(isRunning, async (running) => {
  if (running) return;
  await nextTick();
  // 期间又点了别的按钮：让下一轮自己收尾，别插队
  if (isRunning.value) return;
  await restoreCurrentConnection();
});

const stopBatch = () => {
  if (!isRunning.value || isStopping.value) return;
  shouldStop.value = true;
  isStopping.value = true;
  addLog({
    time: new Date().toLocaleTimeString(),
    message: "正在停止…（当前任务收尾后立即中断）",
    type: "warning",
  });
};
</script>

<style scoped>
.batch-daily-tasks {
  padding: 20px;
  height: 100vh;
  box-sizing: border-box;
  overflow: hidden;
}

.main-layout {
  display: flex;
  gap: 20px;
  height: 100%;
  overflow: hidden;
}

.left-column {
  flex: 1;
  overflow-y: auto;
  min-width: 0;
  padding-right: 8px;
}

.right-column {
  width: 400px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  height: 700px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.token-item {
  display: flex;
  align-items: center;
}

.log-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.custom-card-header {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.log-header-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: flex-end;
  flex-wrap: nowrap;
}

/* 定时任务 · 运行时间编辑器
 * 2026-10-30 按 design.md 收口：这套样式原本是绿主色（var(--m-green) / var(--m-green-soft) / var(--m-green-soft)）、
 * 999px 胶囊、以及选中态的 box-shadow —— 三条都和规范冲突：
 *   · 唯一行动色是 var(--m-primary)，不能有第二个 accent；
 *   · 圆角只有 0/4/8/12 四档，没有 pill；
 *   · 深度靠 band，不靠 shadow。
 * 选中态改用「primary-soft 底 + primary 边 + primary-deep 字」，去掉阴影。
 * ★ 这些是 scoped 样式，改的是移动端 fork 副本，桌面原件（src/views）保持原样。 */
.schedule-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

/* 「运行时间」和右边「每天 08:00」徽标必须同一水平线：
 * .tw-label 自带 6px 下边距（为块级流准备），在 flex 行里会被算进高度 ⇒ 文字整体偏高约 3px。
 * 这里清掉下边距，并给徽标一个和 label 相同的 18px 行高。 */
.schedule-header .tw-label {
  margin-bottom: 0;
}

.schedule-summary {
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  color: var(--m-primary-deep);
  background: var(--m-primary-soft);
  border-radius: var(--m-r-sm);
  padding: 2px 8px;
}

.schedule-freqs {
  display: flex;
  gap: 2px;
  padding: 3px;
  background: var(--m-bg);
  border-radius: var(--m-r-md);
  margin-bottom: 10px;
}

.schedule-freq {
  flex: 1;
  border: 0;
  background: transparent;
  border-radius: var(--m-r-sm);
  padding: 7px 2px;
  font-size: 12.5px;
  color: var(--m-text4);
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
}

.schedule-freq.active {
  background: var(--m-card);
  color: var(--m-primary-deep);
  font-weight: 600;
}

.schedule-weekdays,
.schedule-intervals {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 10px;
}

.schedule-weekday,
.schedule-intervals button {
  border: 1px solid var(--m-border);
  background: var(--m-card);
  color: var(--m-text2);
  border-radius: var(--m-r-md);
  padding: 4px 11px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  line-height: 1.6;
}

.schedule-weekday.active,
.schedule-intervals button.active {
  background: var(--m-primary-soft);
  border-color: var(--m-primary);
  color: var(--m-primary-deep);
  font-weight: 500;
}

.schedule-links {
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  margin-left: 4px;
}

.schedule-links button {
  border: 1px solid transparent;
  background: transparent;
  color: var(--m-primary);
  border-radius: var(--m-r-sm);
  padding: 2px 5px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  line-height: 1.6;
}

.schedule-time-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

/* 常用时间另起一行且不缩进：
 * 原来是 .schedule-links 的 margin-left 6px + 行内 gap，绕行后「常用」比上一行的「每月」
 * 右移 6px，两个标签对不齐。改 flex-basis:100% 强制独占一行，左边缘回到 0。 */
.schedule-time-presets {
  flex-basis: 100%;
  margin-left: 0;
  margin-top: 2px;
}

.schedule-time-presets button {
  border-color: var(--m-border);
  background: var(--m-card);
  color: var(--m-text2);
  padding: 4px 10px;
}

.schedule-time-presets button.active {
  background: var(--m-primary-soft);
  border-color: var(--m-primary);
  color: var(--m-primary-deep);
  font-weight: 500;
}

.schedule-colon {
  color: var(--m-text2);
  font-weight: 600;
}

.schedule-inline-label {
  font-size: 12px;
  color: var(--m-text3);
}

.schedule-hourly,
.schedule-custom {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* cron 表达式保留等宽：它是「代码字符串」，等宽帮助对齐 * 与数字，不属于排版系统的第二字族 */
.schedule-cron-samples button {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11.5px;
}

.schedule-error {
  padding: 8px 10px;
  background: var(--m-red-soft);
  border-radius: var(--m-r-sm);
  font-size: 12.5px;
}

/* 下次执行预览：用 band 底分组，而不是「浅蓝白 + 1px 边框」 */
.schedule-preview {
  padding: 10px 12px;
  background: var(--m-bg);
  border: 0;
  border-radius: var(--m-r-md);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.schedule-preview-main {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.schedule-preview-tag {
  font-size: 11.5px;
  color: var(--m-text3);
  background: var(--m-band);
  border-radius: var(--m-r-sm);
  padding: 1px 6px;
}

.schedule-preview-time {
  font-size: 14px;
  font-weight: 600;
  color: var(--m-primary);
}

.schedule-preview-rel {
  font-size: 12px;
  color: var(--m-text2);
}

.schedule-preview-next {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--m-text3);
}

.log-card :deep(.n-card__content) {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.log-header-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.log-container {
  flex: 1;
  overflow-y: auto;
  background:var(--m-bg);
  padding: 10px;
  border-radius: 4px;
  margin-top: 10px;
  font-family: monospace;
  min-height: 200px;
}

.log-item {
  margin-bottom: 4px;
  font-size: 12px;
}

.log-item.error {
  color: var(--m-red);
}

.log-item.success {
  color: var(--m-green);
}

.log-item.warning {
  color: var(--m-amber);
}

.log-item.info {
  color: var(--m-text2);
}

.time {
  color:var(--m-text3);
  margin-right: 8px;
}

.token-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 8px;
}

/* Settings Modal Styles */
.settings-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-label {
  font-size: 14px;
  color:var(--m-text3);
}

.setting-switches {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.switch-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom:1px solid var(--m-band);
}

.switch-row:last-child {
  border-bottom: none;
}

.switch-label {
  font-size: 14px;
  color:var(--m-text3);
}

.weird-tower-count-input {
  width: 86px;
  flex-shrink: 0;
}

.weird-tower-count-unit {
  display: inline-flex;
  align-items: center;
  height: 28px;
  color:var(--m-text3);
  font-size: 14px;
}

/* Responsive Design */
@media (max-width: 1200px) {
  .right-column {
    width: 380px;
  }
}

@media (max-width: 992px) {
  .batch-daily-tasks {
    height: auto;
    overflow: visible;
  }

  .main-layout {
    flex-direction: column;
    height: auto;
    overflow: visible;
  }

  .left-column {
    overflow-y: visible;
    padding-right: 0;
  }

  .right-column {
    width: 100%;
    height: auto;
    flex-shrink: 0;
  }

  .log-container {
    height: 300px;
    min-height: 300px;
  }
}

@media (max-width: 768px) {
  .batch-daily-tasks {
    padding: 12px;
    height: 100vh;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .main-layout {
    height: auto;
    overflow: visible;
    flex-direction: column;
  }

  .left-column {
    overflow: visible;
    padding-right: 0;
    flex: none;
    height: auto;
  }

  .right-column {
    height: auto;
    width: 100%;
    flex: none;
  }

  .page-header {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }

  .page-header .actions {
    display: flex;
    gap: 8px;
  }

  .log-card {
    height: auto !important;
  }

  .log-card :deep(.n-card__content) {
    flex: none !important;
    overflow: visible !important;
    display: block !important;
  }

  .log-container {
    height: 300px;
    min-height: 300px;
    flex: none !important;
  }

  .log-header-controls {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  /* 批量功法残卷赠送样式 */
  .recipient-info:hover {
    transform: translateY(-2px);

  }

  /* 头像悬停效果 */
  .avatar-container:hover {
    transform: scale(1.05);

  }

  /* 加载动画 */
  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }

    100% {
      transform: rotate(360deg);
    }
  }

  /* Token分组管理样式 */
  .group-tag {
    padding: 8px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.3s ease;
    user-select: none;
    text-align: center;
    font-weight: 500;
  }

  .group-tag:hover {
    transform: translateY(-2px);

  }

  .group-tag-selected {
    color: white;
    font-weight: 600;
  }

  /* 响应式设计 */
  @media (max-width: 600px) {
    .recipient-info {
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .avatar-container {
      margin-bottom: 12px;
    }
  }
}

/* ==================== Mobile 响应式增强 ==================== */
/* 让 page-header 内的两个子块在窄屏下逐行堆叠，
   内部状态/按钮组自然换行，标题不再被挤成竖排。 */
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  /* 标题 + 状态条 一组：内部允许换行 */
  .page-header-title-row {
    flex-wrap: wrap;
    gap: 10px;
  }

  .page-header-title-row h2 {
    flex-shrink: 0;
    margin: 0;
  }

  /* 状态面板允许换行、长文本可断行 */
  .page-header-info {
    flex-wrap: wrap;
    flex: 1 1 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  .page-header-info > div {
    min-width: 0;
    word-break: break-word;
    overflow-wrap: anywhere;
  }

  /* 状态面板里的按钮组允许换行 */
  .page-header-info-buttons {
    flex-wrap: wrap;
  }

  /* 右侧动作按钮区（开始/停止/模板/设置）也允许换行 */
  .page-header-actions {
    flex-wrap: wrap;
    justify-content: flex-start;
    box-sizing: border-box;
  }
}

/* 更窄屏（手机竖屏）进一步压缩间距 */
@media (max-width: 480px) {
  .batch-daily-tasks {
    padding: 8px !important;
  }

  .page-header-title-row h2 {
    font-size: 18px;
  }

  .page-header-info,
  .page-header-actions {
    padding: 6px 8px !important;
    gap: 8px !important;
  }

  /* token 长名称允许在任意位置断行，避免单字竖排 */
  .token-item {
    flex-wrap: wrap;
    min-width: 0;
  }

  .token-item span,
  .token-item .n-tag {
    word-break: break-word;
    overflow-wrap: anywhere;
  }

  /* 排序按钮组允许换行 */
  .sort-buttons {
    overflow-x: auto;
  }

  /* 日志头部控件在窄屏下换行 */
  .custom-card-header {
    gap: 6px;
  }

  .log-header-controls {
    flex-wrap: wrap;
    gap: 6px;
  }
}
</style>
