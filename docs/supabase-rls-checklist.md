# Supabase RLS 与约束核对清单

在 **Supabase Dashboard → Authentication / Table Editor → Policies** 中按表核对。以下为与本应用前端假设一致的检查项；具体 policy SQL 需按你库中的列名与 `users_profile` 结构微调。

## 1. `users_profile`

- [ ] 用户仅能 `SELECT` 自己的 `user_id = auth.uid()` 行（或等价 JWT claim）。
- [ ] 总部是否允许 `INSERT/UPDATE` 他人 profile（仅管理员场景）；若不允许，应用内「开户」流程是否走 service role / Edge Function。

## 2. `employees`

- [ ] **店长 `store_manager`**：`INSERT`/`UPDATE` 的 `WITH CHECK` 是否限制 `current_store_id`、`home_store_id` 等于 `users_profile.store_id`（或仅允许写入本店）。
- [ ] **HQ / finance**：是否允许全表或按业务规则读写。
- [ ] **唯一约束**：`phone`、`id_card` 在数据库层 `UNIQUE`（应用层查重不能替代）。
- [ ] **`user_id`（可选）**：列 `user_id uuid` 指向 `auth.users`，见 `scripts/employees_user_id_setup.sql`。写入时建议 `user_id IS NULL OR user_id = auth.uid()`；用户需能 `SELECT` 自己 `user_id = auth.uid()` 的员工行（用于 `/me` 展示绑定档案）。

## 3. `store_staff_pool`

- [ ] **HQ / finance**：是否具备对该表的 `SELECT` + `INSERT` + `UPDATE` + `DELETE`（或 `FOR ALL`）权限。
- [ ] **店长**：是否允许对本店 `store_id = users_profile.store_id` 的 `INSERT`、`UPDATE(status)`、`UPSERT`（冲突键 `store_id, employee_id`）；**禁止**写入其他门店。
- [ ] **店长 `SELECT`**：仅本店行（或与应用筛选一致）。

## 4. `monthly_workdays`

- [ ] **店长**：`WITH CHECK (store_id = users_profile.store_id)`（或等价），禁止跨店写入。
- [ ] **唯一约束**：`(month, store_id, employee_id)` 唯一；与代码中重复键重试逻辑一致。

## 5. `insurance_requests`

- [ ] 店长：仅能向本店 `store_id` 插入；仅能查看本店申请。
- [ ] HQ：可查看/更新全表或待处理状态（与 `app/insurance/page.tsx` 中 `status`、`processed_by` 更新一致）。

## 6. `employee_insurance`

- [ ] HQ（或指定角色）可 `INSERT` 保单行；店长是否只读或不可见，按业务定。

---

## 可选：policy 方向（示例骨架，勿直接复制）

```sql
-- 示例：店长仅能写本店 monthly_workdays（需替换真实函数名/列名）
-- CREATE POLICY "store_manager_write_own_store_mw"
-- ON monthly_workdays FOR INSERT TO authenticated
-- WITH CHECK (
--   store_id = (SELECT store_id FROM users_profile WHERE user_id = auth.uid())
-- );
```

实际编写前请在 SQL 编辑器确认：`users_profile` 主键列名、`role` 取值（`hq` / `finance` / `store_manager`）与是否使用 JWT 自定义声明。
