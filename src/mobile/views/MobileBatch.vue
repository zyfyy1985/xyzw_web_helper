<template>
  <div class="m-page m-batch">
    <!-- 定时任务已拆成独立页（/mobile/schedule），入口挪到首页六宫格，
         这里不再放中间那条入口卡 —— 直接从首页进即可。 -->

    <!-- 桌面 BatchDailyTasks 原组件：逻辑 / 取数 / 定时器 / 执行队列一行不改，
         外面套 .m-desk 做主题变量重映射 + n-card 压平 + 控件收口，
         窄屏修正（列堆叠 / 去 100vh / 内联浅色转 token）全部在 mobile.css 的 .m-batch 段里。 -->
    <div class="m-desk">
      <BatchDailyTasks mode="batch" />
    </div>
  </div>
</template>

<script setup>
import BatchDailyTasks from "@/mobile/fork/views/BatchDailyTasks.vue";
</script>

<script>
export default { name: "MobileBatch" };
</script>
