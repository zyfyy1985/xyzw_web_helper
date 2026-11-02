import { createRouter, createWebHistory } from 'vue-router'
import * as autoRoutes from "vue-router/auto-routes";
import { useTokenStore } from '@/stores/tokenStore'
import { useAuthStore } from '@/stores/auth'
import { isNowInLegionWarTime } from "@/utils/clubBattleUtils"
import { isMobileMode } from "@/mobile/uiMode"

const generatedRoutes = autoRoutes.routes ?? [];

const my_routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/Home.vue'),
    meta: {
      title: '首页',
      requiresToken: false,
      requiresAuth: false
    }
  },
  {
    path: '/tokens',
    name: 'TokenImport',
    component: () => import('@/views/TokenImport/index.vue'),
    meta: {
      title: 'Token管理',
      requiresToken: false
    },
    props: route => ({
      token: route.query.token,
      name: route.query.name,
      server: route.query.server,
      wsUrl: route.query.wsUrl,
      api: route.query.api,
      auto: route.query.auto === 'true'
    })
  },
  {
    path: '/game',
    name: 'GamePlayer',
    component: () => import('@/views/GamePlayer.vue'),
    meta: {
      title: '游戏',
      requiresToken: true
    },
    props: route => ({
      bin_id: route.query.bin_id
    })
  },
  {
    name: 'DefaultLayout',
    path: '/admin',
    component: () => import('@/layout/DefaultLayout.vue'),
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: {
          title: '控制台',
          requiresToken: true
        }
      },
      {
        path: 'game-features',
        name: 'GameFeatures',
        component: () => import('@/views/GameFeatures.vue'),
        meta: {
          title: '游戏功能',
          requiresToken: true
        }
      },
      {
        path: 'message-test',
        name: 'MessageTest',
        component: () => import('@/components/Test/MessageTester.vue'),
        meta: {
          title: '消息测试',
          requiresToken: true
        }
      },
      {
        path: 'legion-war',
        name: 'LegionWar',
        component: () => import('@/views/LegionWar.vue'),
        meta: {
          title: '实时盐场',
          requiresToken: true
        }
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('@/views/Profile.vue'),
        meta: {
          title: '个人设置',
          requiresToken: true
        }
      },
      {
        path: 'daily-tasks',
        name: 'DailyTasks',
        component: () => import('@/views/DailyTasks.vue'),
        meta: {
          title: '日常任务',
          requiresToken: true
        }
      },
      {
        path: 'batch-daily-tasks',
        name: 'BatchDailyTasks',
        component: () => import('@/views/BatchDailyTasks.vue'),
        meta: {
          title: '批量日常',
          requiresToken: true,
          // KOFA 定时任务（Apify Actor）无登录访问：任务列表/游戏Token均在
          // 访问者本地存储，陌生人打开只有空壳界面，无数据可拿
          requiresAuth: false
        }
      },
      {
        path: 'PushingLevels',
        name: 'PushingLevels',
        component: () => import('@/views/PushingLevels.vue'),
        meta: {
          title: '主线推关',
          requiresToken: true
        }
      },
      // 增加自动路由引用
      ...generatedRoutes,
    ]
  },
  {
    path: '/websocket-test',
    name: 'WebSocketTest',
    component: () => import('@/components/Test/WebSocketTester.vue'),
    meta: {
      title: 'WebSocket测试',
      requiresToken: true
    }
  },
  // ============ 新版移动端界面（与旧版并行，设置里开关切换） ============
  // 登录 / 注册（移动端样式）：不套 MobileLayout —— 未登录时没有顶栏和 tabbar，
  // 单独一条顶层路由，自己撑 .mobile-shell。必须排在 /mobile 之前读起来才顺。
  {
    path: '/mobile/login',
    name: 'MobileLogin',
    component: () => import('@/mobile/views/MobileLogin.vue'),
    meta: { title: '登录', requiresAuth: false }
  },
  {
    path: '/mobile/register',
    name: 'MobileRegister',
    component: () => import('@/mobile/views/MobileRegister.vue'),
    meta: { title: '注册', requiresAuth: false }
  },
  {
    path: '/mobile',
    component: () => import('@/mobile/MobileLayout.vue'),
    redirect: '/mobile/home',
    children: [
      {
        path: 'home',
        name: 'MobileHome',
        component: () => import('@/mobile/views/MobileHome.vue'),
        meta: { title: '首页', requiresToken: false }
      },
      {
        path: 'club',
        name: 'MobileClubPage',
        component: () => import('@/mobile/views/club/ClubPage.vue'),
        // 与旧版 /admin/game-features 一致：玩法页需要游戏 Token（无 Token 会跳 /tokens）
        meta: { title: '玩法', requiresToken: true }
      },
      {
        path: 'tools',
        name: 'MobileTools',
        component: () => import('@/mobile/views/MobileTools.vue'),
        // 工具全部以选中账号运行，与玩法页同一条 Token 门槛
        meta: { title: '工具', requiresToken: true }
      },
      {
        path: 'me',
        name: 'MobileMe',
        component: () => import('@/mobile/views/MobileMe.vue'),
        meta: { title: '我的', requiresToken: false }
      },
      {
        path: 'batch',
        name: 'MobileBatch',
        component: () => import('@/mobile/views/MobileBatch.vue'),
        // 托管桌面 /admin/batch-daily-tasks：批量执行要选中账号，与玩法页同一条 Token 门槛
        meta: { title: '批量任务', requiresToken: true }
      },
      {
        path: 'schedule',
        name: 'MobileSchedule',
        component: () => import('@/mobile/views/MobileSchedule.vue'),
        // 定时任务：从批量任务页顶部入口进。与批量页是同一个组件（mode="schedule"），
        // 调度器跟着页面挂载走 —— 这一页开着才会到点执行，和原来的行为一致。
        meta: { title: '定时任务', requiresToken: true }
      },
      {
        path: 'tokens',
        name: 'MobileTokens',
        component: () => import('@/mobile/views/MobileTokens.vue'),
        // 移动版 Token 管理（替换直接跳桌面 /tokens）。requiresToken: false ——
        // 没有 Token 时本页就是「导入入口」，不能自己把自己拦掉。
        meta: { title: 'Token 管理', requiresToken: false }
      },
      {
        path: 'ws-test',
        name: 'MobileWsTest',
        component: () => import('@/mobile/views/MobileWsTest.vue'),
        // 消息测试（托管桌面 WebSocketTester）：要选角色发命令，无 Token 直接带去导入页
        meta: { title: '消息测试', requiresToken: true }
      }
    ]
  },
  // 登录 / 注册（公开页面）
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: {
      title: '登录',
      requiresAuth: false
    }
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/Register.vue'),
    meta: {
      title: '注册',
      requiresAuth: false
    }
  },
  // 兼容旧路由，重定向到新的token管理页面
  {
    path: '/game-roles',
    redirect: '/tokens'
  },
  // 增加自动路由引用
  ...generatedRoutes,
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFound.vue'),
    meta: {
      title: '页面不存在',
      requiresAuth: false
    }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes: my_routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    } else {
      return { top: 0 }
    }
  }
})

// 热更新路由
autoRoutes.handleHotUpdate?.(router);

// 导航守卫
router.beforeEach(async (to, from, next) => {
  const tokenStore = useTokenStore()
  const authStore = useAuthStore()

  // 移动端壳内只有 /mobile/* 可达，兜底目标不能再用 /admin/dashboard 或 /tokens
  const mobileMode = isMobileMode()
  const HOME_PATH = mobileMode ? '/mobile/home' : '/admin/dashboard'
  const TOKENS_PATH = mobileMode ? '/mobile/tokens' : '/tokens'
  const LOGIN_PATH = mobileMode ? '/mobile/login' : '/login'
  const REGISTER_PATH = mobileMode ? '/mobile/register' : '/register'

  // 新版移动端界面开启时：/admin 下的旧版入口统一进入移动端壳
  // （旧版页面与逻辑原样保留，关掉开关即恢复）
  if (mobileMode && to.path.startsWith('/admin')) {
    next('/mobile/home')
    return
  }

  // 桌面版登录/注册页在移动模式下改走移动端样式（深链、书签、401 兜底都会落到这里）
  if (mobileMode && (to.path === '/login' || to.path === '/register')) {
    next(to.path === '/login' ? LOGIN_PATH : REGISTER_PATH)
    return
  }

  // 设置页面标题
  document.title = to.meta.title ? `${to.meta.title} - XYZW 游戏管理系统` : 'XYZW 游戏管理系统'

  // 恢复登录态（首次从本地缓存即时恢复，并后台向账号服务校验）
  await authStore.initAuth()

  // 移动模式下不再渲染桌面落地页（首页 / 也是 PWA 的 start_url）：
  // 已登录进壳，未登录进移动端登录页。必须放在 initAuth 之后判，
  // 否则冷启动时本地 token 还没恢复，会把已登录的人误送到登录页。
  if (mobileMode && to.path === '/') {
    next(authStore.isAuthenticated ? HOME_PATH : LOGIN_PATH)
    return
  }

  // 登录门槛：除显式声明 requiresAuth:false 的页面外，一律要求登录
  if (to.meta.requiresAuth !== false && !authStore.isAuthenticated) {
    next({
      path: LOGIN_PATH,
      query: to.fullPath && to.fullPath !== '/' ? { redirect: to.fullPath } : {}
    })
    return
  }

  // 已登录时不再停留在登录 / 注册页（桌面版与移动版一起判）
  if (
    (to.name === 'Login' || to.name === 'Register' ||
      to.name === 'MobileLogin' || to.name === 'MobileRegister') &&
    authStore.isAuthenticated
  ) {
    next(HOME_PATH)
    return
  }

  if (to.name === "LegionWar" && !isNowInLegionWarTime()) {
    // if(to.name==="LegionWar"&&isNowInLegionWarTime()){
    next(HOME_PATH);
    return;
  }
  // 检查是否需要Token
  // if (to.meta.requiresToken  && tokenStore.getWebSocketStatus(tokenStore.selectedToken.id)=="disconnected") {
  if (to.meta.requiresToken && !tokenStore.hasTokens) {
    next(TOKENS_PATH)
  } else if (to.path === '/' && tokenStore.hasTokens) {
    // 首页重定向逻辑
    if (tokenStore.selectedToken) {
      next(HOME_PATH)
    } else {
      next(TOKENS_PATH)
    }
  } else {
    next()
  }
})



export default router
