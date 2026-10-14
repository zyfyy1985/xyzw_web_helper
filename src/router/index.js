import { createRouter, createWebHistory } from 'vue-router'
import * as autoRoutes from "vue-router/auto-routes";
import { useTokenStore } from '@/stores/tokenStore'
import { useAuthStore } from '@/stores/auth'
import { isNowInLegionWarTime } from "@/utils/clubBattleUtils"

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
          requiresToken: true
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

  // 设置页面标题
  document.title = to.meta.title ? `${to.meta.title} - XYZW 游戏管理系统` : 'XYZW 游戏管理系统'

  // 恢复登录态（首次从本地缓存即时恢复，并后台向账号服务校验）
  await authStore.initAuth()

  // 登录门槛：除显式声明 requiresAuth:false 的页面外，一律要求登录
  if (to.meta.requiresAuth !== false && !authStore.isAuthenticated) {
    next({
      path: '/login',
      query: to.fullPath && to.fullPath !== '/' ? { redirect: to.fullPath } : {}
    })
    return
  }

  // 已登录时不再停留在登录 / 注册页
  if ((to.name === 'Login' || to.name === 'Register') && authStore.isAuthenticated) {
    next('/admin/dashboard')
    return
  }

  if (to.name === "LegionWar" && !isNowInLegionWarTime()) {
    // if(to.name==="LegionWar"&&isNowInLegionWarTime()){
    next('/admin/dashboard');
    return;
  }
  // 检查是否需要Token
  // if (to.meta.requiresToken  && tokenStore.getWebSocketStatus(tokenStore.selectedToken.id)=="disconnected") {
  if (to.meta.requiresToken && !tokenStore.hasTokens) {
    next('/tokens')
  } else if (to.path === '/' && tokenStore.hasTokens) {
    // 首页重定向逻辑
    if (tokenStore.selectedToken) {
      next('/admin/dashboard')
    } else {
      next('/tokens')
    }
  } else {
    next()
  }
})



export default router
