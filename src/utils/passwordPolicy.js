/**
 * 密码强度策略（前端唯一真源）
 *
 * 规则：8-64 位，且必须**同时包含**大写字母、小写字母和数字。
 * 与后端 `E:\xyzw_server\shared\auth.js` 的 `passwordStrengthError()` 严格对齐 ——
 * 改这里就必须同步改那边（`test/verify-password-policy.cjs` 会逐条比对两边的常量与正则）。
 *
 * ⚠️ 只在「注册」和「修改密码」两处强制。
 *   登录页**不要**套这两条规则：老账号可能是 6 位弱密码，前端拦下来会把人锁死在门外；
 *   后端登录接口同样不做强度校验。
 */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;

const HAS_LOWER = /[a-z]/;
const HAS_UPPER = /[A-Z]/;
const HAS_DIGIT = /[0-9]/;

/** 长度是否合规。空值放行 —— 「必填」交给 required 规则，避免同一处弹两条提示 */
export function isPasswordLengthOk(value) {
  if (!value) return true;
  const s = String(value);
  return s.length >= PASSWORD_MIN && s.length <= PASSWORD_MAX;
}

/** 是否同时含大写、小写、数字。空值放行（同上） */
export function isPasswordComplexityOk(value) {
  if (!value) return true;
  const s = String(value);
  return HAS_LOWER.test(s) && HAS_UPPER.test(s) && HAS_DIGIT.test(s);
}

/**
 * naive-ui 表单规则片段，直接展开进 rules 数组：
 *   password: [{ required: true, message: "请输入密码" }, ...passwordRules()]
 * @param {string|string[]} trigger 触发时机，默认 ["input", "blur"]
 */
export function passwordRules(trigger = ["input", "blur"]) {
  return [
    {
      validator: (_rule, value) => isPasswordLengthOk(value),
      message: `密码长度需 ${PASSWORD_MIN}-${PASSWORD_MAX} 位`,
      trigger,
    },
    {
      validator: (_rule, value) => isPasswordComplexityOk(value),
      message: "密码需同时包含大写字母、小写字母和数字",
      trigger,
    },
  ];
}
