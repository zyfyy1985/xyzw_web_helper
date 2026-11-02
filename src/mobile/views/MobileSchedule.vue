<template>
  <div class="m-page m-batch m-schedule">
    <!-- 2026-10-30：页面标题「定时任务」也去掉 —— 从首页六宫格点进来，位置已经说明一切，
         副标题（到点自动跑…）和「即将执行」汇总行先后删掉后，这块只剩一个重复的标题。
         现在页面上直接是任务列表卡：卡头「定时任务列表」+ 右侧 + 就是这一页的全部栏头。 -->
    <!-- 与「批量任务」是同一个组件（fork/views/BatchDailyTasks.vue），
         靠 mode="schedule" 只渲染任务列表卡（含 + 新增）。
         ★ 客户端不再启动调度器（startScheduler 已停用），只保留每秒刷新的倒计时。 -->
    <div class="m-desk">
      <BatchDailyTasks mode="schedule" />
    </div>
  </div>
</template>

<script setup>
import BatchDailyTasks from "@/mobile/fork/views/BatchDailyTasks.vue";
</script>

<script>
export default { name: "MobileSchedule" };
</script>
