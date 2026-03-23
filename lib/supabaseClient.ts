import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (process.env.NODE_ENV === "development" && (!url || !key)) {
  console.warn(
    "[supabase] 缺少 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_ANON_KEY，请检查环境变量。"
  );
}

/**
 * 浏览器端单例；使用 Cookie 持久化会话（@supabase/ssr），与 `middleware.ts` 中的服务端校验一致。
 * 若从旧版仅 localStorage 会话迁移过来，用户需重新登录一次。
 */
export const supabase = createBrowserClient(url ?? "", key ?? "");
