# src/mobile/fork —— 桌面组件的移动端独立副本

## 这是什么

`src/mobile/**` 里所有「托管桌面组件」的界面，原本都是直接 `import "@/components/xxx.vue"`
和 `@/views/xxx.vue`。新版本上线要**整站删掉旧桌面端**，所以把这些组件的源码
**复制一份**放在这里，让移动端只依赖自己这份副本。

目录结构与 `src/` 完全镜像（`components/` + `views/` 两棵子树），因此**相对 import
一个都不用改**（`../Common/MyCard.vue` 在镜像里同样成立），只把 `@/components/`、
`@/views/` 这两个绝对前缀替换成 `@/mobile/fork/...`。

## 铁律

1. **禁止回引**。本目录内不允许出现 `from "@/components/…"`、`from "@/views/…"`。
   校验：`node test/_verify-fork-isolated.cjs`
2. **改样式改这里，不改 `src/components`**。桌面那份已经是被替换掉的旧版，
   在它身上改等于改了一个即将删除的文件。
3. 复制是**一次性快照**（2026-10-29）。桌面端后续改动不会同步过来；
   反过来这里的改动也不会回流桌面端。
4. 共享层保持引用、不复制：`@/utils`、`@/stores`、`@/api`、`@/hooks`。这些不是
   「界面」，删桌面 vue 时不受影响，重写 UI 时继续用。

## 依赖闭包（36 个文件 / 51,228 行）

- `components/` 35 个 .vue —— 含级联的 `Common/MyCard.vue`
- `views/` 4 个页面 + `boss_names.js`（BossTower 的数据源，约 1 万行）

## 移动端只改 CSS 的现状

宿主页面通过 `.m-desk` + `:deep()` 覆盖副本的样式（不在副本里写移动端样式）。
副本的 DOM 结构与类名和桌面原件逐字一致，所以这些 `:deep()` 选择器全部继续有效。
