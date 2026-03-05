# 排查 employees 表 home_store_id 插入为 null

前端已正确传了 `home_store_id`，若仍报错，按下面步骤在 Supabase 里排查。

---

## 步骤一：在 SQL 编辑器里跑检查脚本

1. 打开 **Supabase 控制台** → 你的项目。
2. 左侧点 **「SQL Editor」**。
3. 新建一个 Query，把项目里 **`scripts/check_employees_home_store.sql`** 的整段 SQL 复制进去，点 **Run**。
4. 看结果里的三块输出：
   - **触发器**：若有行，记下 `trigger_name` 和 `trigger_definition`，看是否在 INSERT 时改写了 `home_store_id`。
   - **表结构**：看 `home_store_id` 的 `column_default`、`is_nullable`。
   - **RLS 策略**：看是否有 INSERT 策略，以及 `with_check_expr` 是否和插入数据有关。

---

## 步骤二：查触发器（若有）

- 若步骤一里 **有** 触发器：
  - 在左侧 **Database → Triggers** 里找到 `employees` 表。
  - 点进每个触发器，看函数内容里是否对 `NEW.home_store_id` 赋值或置空。
- 若触发器里把 `home_store_id` 设成 null，改成保留传入值，例如：
  - 不要写 `NEW.home_store_id := NULL;`
  - 若需要默认值，可写：`NEW.home_store_id := COALESCE(NEW.home_store_id, 某个默认uuid);`

---

## 步骤三：查 RLS 策略

1. 左侧 **Authentication → Policies**，找到表 **employees**。
2. 看是否有 **INSERT** 策略（Operation = Insert）。
3. 若有 **WITH CHECK** 表达式，确认没有“只允许插入部分列”或把 `home_store_id` 排除的逻辑；RLS 一般不会改列值，这里主要是确认没有限制你传入的列。

---

## 步骤四：直接插一行测试（可选）

在 SQL Editor 里执行（把下面的 UUID 换成你 Console 里看到的 `home_store_id` 和 `contract_entity_id`、以及一个没占用的工号）：

```sql
INSERT INTO public.employees (
  emp_no,
  id_number,
  name,
  status,
  current_store_id,
  home_store_id,
  contract_entity_id
) VALUES (
  'TEST-PAYLOAD',
  'TEST-PAYLOAD',
  '测试',
  '试用期',
  '4a78d076-8409-4e65-9b18-xxxxxxxx',  -- 换成你的 current_store_id 完整 UUID
  '4a78d076-8409-4e65-9b18-xxxxxxxx',  -- 同上，home_store_id
  'cb7ede0b-1eac-4dxx-xxxx-xxxxxxxx'   -- 换成你的 contract_entity_id 完整 UUID
);
```

- 若 **报错**：错误信息会指向具体约束或触发器。
- 若 **成功**：说明用 SQL 直接插是正常的，问题更可能是 RLS 下“谁可以插”或应用层传参的细微差异（例如某次请求没带 `home_store_id`）。

---

## 小结

| 检查项     | 在哪里看                         | 要确认的 |
|------------|----------------------------------|----------|
| 触发器     | SQL 脚本结果 / Database → Triggers | 没有把 `home_store_id` 置空或覆盖 |
| 表结构     | SQL 脚本结果                     | `home_store_id` 允许非空、无错误默认值 |
| RLS 策略   | SQL 脚本结果 / Policies          | INSERT 策略允许你传入的列 |
| 直接插入   | SQL Editor 跑 INSERT             | 用完整 UUID 能否插入成功 |

把 **步骤一** 的 SQL 运行结果（尤其是触发器部分和 `home_store_id` 那一行的表结构）贴出来，我可以根据结果帮你写下一步要改的 SQL 或策略。
