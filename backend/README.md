# Backend 登录系统

继续使用 Express 5、mysql2、Argon2id、JWT；无注册、联系方式自助修改、人脸数据或人脸认证接口。本轮仅修改后端和数据库，前端仍是原来的演示登录，尚未接入这些接口。

## 当前完成进度

| 模块 | 当前状态 |
| --- | --- |
| 密码登录 | 已实现 Argon2id 校验、JWT 签发、`/api/auth/me` 身份及当前角色／状态检查 |
| 邮箱验证码登录 | 已实现预设邮箱、异步发送队列、验证码登录；支持本地 console 测试及 Resend 适配器，真实收件需配置后联调 |
| 短信验证码登录 | 接口、校验及本地私有收件箱测试已实现；**因尚未找到合适的短信平台，真实短信认证接入暂时搁置**，默认关闭，Twilio 已停用 |
| 数据库 | 已提供兼容现有用户的迁移，共用验证码／发送队列表和持久化限流表 |
| 内部账号管理 | 已提供交互式创建账号、预设联系方式及按用户名确认删除脚本；无用户自助注册或修改联系方式接口 |
| 前端对接 | 尚未完成，当前通过 HTTP 请求测试后端；后续接入说明见下文 |
| 人脸认证 | 暂缓，未创建人脸数据表或模拟认证 |

已有验证记录：后端构建通过，单元测试 12 项通过，MySQL 集成测试 22 项通过（含父测试项）；覆盖本地短信读取命令 → JWT → `/me`。这些结果不代表真实邮件／短信投递已完成联调。下文提供自动化命令，以及密码、邮箱和本地短信的手动测试方法。

## 实际表结构与迁移

本地 `SHOW CREATE TABLE doctor_platform.users` 实测：`id BIGINT` **有符号**、`username VARCHAR(50)` 唯一、`password_hash VARCHAR(255)`、`name VARCHAR(100)`、可空 `email VARCHAR(100)`、`role VARCHAR(30)`、`status VARCHAR(20)`、`created_at TIMESTAMP`；InnoDB、utf8mb4_0900_ai_ci。并非没有邮箱字段。仓库此前没有建表 SQL、`backend/.env` 或发送服务配置。

先备份数据库，再针对实际数据库执行（密码通过交互输入，不写在命令参数里）：

```bash
mysql -u YOUR_ADMIN -p doctor_platform -e 'SHOW CREATE TABLE users\G'
mysql -u YOUR_ADMIN -p doctor_platform < backend/migrations/001-login-codes.sql
```

迁移面向 MySQL 8.0+：验证 `users.id` 为有符号 BIGINT，保留原邮箱、密码和用户数据；只在字段缺失时新增可空 `email`／`phone`。新增一张共用验证码／持久化发送队列表 `auth_login_codes`，以及供所有进程共享的限流辅助表 `auth_rate_limits`。没有配置联系方式的老账号继续使用密码登录。迁移可重复执行；MySQL DDL 会隐式提交，若中途失败，检查错误并修复后重跑。若 `id` 类型不同，迁移会明确报错，先按真实定义调整外键，不能强改用户 ID 类型。若已有同名自建认证表，先人工核对结构，`IF NOT EXISTS` 不会更新其结构。

运行账号只需用户表 SELECT（包括读取字段元数据），以及认证表 SELECT/INSERT/UPDATE；创建用户的内部脚本另需 INSERT。迁移账号另需 DDL 与 CREATE ROUTINE 权限。清理任务需 DELETE。

## 运行

```bash
cd backend
npm ci
[ -f .env ] || cp .env.example .env
# 配置 MySQL、JWT_SECRET、AUTH_CODE_SECRET（两个独立随机密钥，至少 32 字符）
# 分别执行 openssl rand -hex 32 生成，禁止把实际密钥提交到版本库
npm run build
npm start
```

启动会检查所需字段和认证表，并自动启动轻量后台队列工作进程。默认只监听 `127.0.0.1:3000`；前端开发来源允许 localhost/127.0.0.1:5173。生产应由 HTTPS 反向代理转发。当前不信任 `X-Forwarded-For`，默认按连接源 IP 限流；部署在代理后应在 `server.ts` 中仅信任实际代理 IP，并由代理覆盖转发头，不能直接设置 `trust proxy=true`。否则代理后的所有用户共享一个 IP 限额。

`npm run create-user` 是内部交互脚本，录入用户名、姓名、可选邮箱、可选 E.164 手机号、角色和密码。Argon2id 密码哈希保持不变。管理员可通过受控数据库操作更新 `email`／`phone`；空值使用 NULL，手机号例 `+8613800000000`。不能将不受信任的请求参数拼接到 SQL。修改联系方式后，之前发往旧联系方式的验证码失效。

## 发送服务：真实短信已停用

**短信认证因尚未找到合适平台，真实服务接入暂时搁置；当前没有真实短信发送路径。** 保留接口和本地测试能力，以便之后接入。Twilio 调用已经移除，`TWILIO_ACCOUNT_SID`、`TWILIO_AUTH_TOKEN`、`TWILIO_FROM` 即使残留也不会读取，不需要配置。不要将真实手机号或供应商密钥加入版本库。

- **密码**：维持原有 Argon2 + JWT 登录，与短信开关无关。
- **邮箱**：继续使用 `AUTH_DELIVERY_MODE=provider`、`RESEND_API_KEY`、`EMAIL_FROM` 的 Resend 适配器；也保留原有开发邮箱 `console` 模式。`AUTH_DELIVERY_MODE` 现在只控制邮箱。原来使用真实邮箱的配置不要改成 disabled。
- **短信默认关闭**：`SMS_DELIVERY_MODE=disabled`（缺省值）。短信请求和短信验证码登录返回 503；过频时仍可能优先返回 429。密码和邮箱不受影响。关闭后此前签发的短信码也不能用来登录；不会撤销已正常签发的 JWT。
- **本地短信流程测试**：显式设置 `NODE_ENV=development`、`SMS_DELIVERY_MODE=local-inbox` 和 `SMS_TEST_INBOX_DIR`。MySQL 主机必须为 `127.0.0.1`、`localhost` 或 `::1`；后端仍只绑定 `127.0.0.1`。此模式不发送网络请求，不需要 Twilio，也不把短信码写入普通服务日志。
- **生产环境**：必须保持短信 disabled。`NODE_ENV=production`（或 test、staging、未设置）与 local-inbox 组合会拒绝启动；无效 SMS 模式同样拒绝启动。

测试收件目录必须已经存在、为绝对路径、位于仓库外、属于当前 macOS/Linux 用户、权限 700，且不能是符号链接。每条测试消息以挑战 UUID 命名，文件权限 600，仅含挑战 ID、6 位验证码和有效期，不含手机号。数据库仍只保存验证码摘要。可通过本机管理员命令 `npm run --silent sms-test-code -- USERNAME` 读取；没有读取测试码的 HTTP 接口或前端页面。读取命令也检查开发开关、目录权限、数据库中该账号最新短信挑战的发送／使用／过期／尝试状态。该命令不消耗验证码，最终认证仍由登录接口完成。

目录不可写、权限变化或其他写入错误会让后台任务变成 failed，不能登录。公开请求仍统一返回 **202 accepted：数据库已受理，不代表真实发送成功**。测试模式中的 sent 仅表示私有收件文件写入成功。邮件模式中 sent 表示服务商接受提交；不保证最终投递。对外不会暴露具体账号的投递结果。

**未来接入短信服务**：在 `src/auth/delivery.ts` 的 `CodeSender` 边界增加供应商适配器，并明确配置生产短信模式和对应测试；不能让 provider、console 或旧 Twilio 变量隐式开启真实短信。短信路由、预设联系方式、数据库队列和验证码校验无需重新设计。

## API（前端后续接入）

| 接口 | 请求 JSON | 成功响应 |
| --- | --- | --- |
| `POST /api/auth/login` | `{"account":"username","password":"password"}` | `{token,user}` |
| `POST /api/auth/code/request` | `{"account":"username","channel":"email"}`，或 `sms` | 202 accepted，明确不表示发送成功；不包含验证码、联系方式或账号是否存在 |
| `POST /api/auth/code/login` | `{"account":"username","channel":"sms","code":"123456"}` | 与密码登录相同的 `{token,user}` |
| `GET /api/auth/me` | Bearer token | `{user}`，每次重读当前角色／状态 |
| `POST /api/auth/logout` | Bearer token | `{success:true}` |

验证码接口拒绝额外的 email／phone／role 等字段。JWT 使用 HS256、有效期 2 小时，subject 保留精确 BIGINT 字符串；JSON user 超出 JS 安全整数范围的 ID 返回字符串。对外 user 仅包含 id、account、name、role，不返回哈希、邮箱、手机号。退出沿用原语义：客户端丢弃 token，已签发 JWT 在过期前仍有效；禁用账号后 `/me` 会拒绝访问。

验证码 6 位、在后台即将发送时随机生成、5 分钟过期；排队阶段没有验证码（code_hash 为 NULL），生成后数据库只存 HMAC-SHA256 摘要（绑定随机挑战 ID），另存接收地址摘要以检测管理员修改。每个验证码最多验证 5 次；事务行锁保证并发请求只能消费一次。新验证码作废同账号同渠道的旧码；渠道互不通用，queued／processing／pending／failed／suppressed 均不可登录，只有 sent 且未使用、未过期的码可登录。

限流持久化在 MySQL，跨进程／重启有效：同账号每渠道 60 秒最多请求 1 次、1 小时最多 5 次；同 IP 每小时最多请求 30 次、每 10 分钟最多验证 60 次。未知账号也消耗限额。所有输入（包括未知账号）均按 users.username 的实际 MySQL 排序规则生成限流键，大小写／重音等价别名共享限额。限额从窗口首次请求起计。格式错误返回 400；账号不存在、停用、未配置联系方式与正常账号的请求响应一致，且都持久化队列记录（未知账号 user_id 为 NULL）；无效／过期／已用／超次数的码统一返回 401；请求过频 429；渠道全局未配置为 503；数据库故障为 500。投递失败只写内部状态，公开受理接口不等待发送服务、不返回具体账号／投递错误原因。

后台每秒检查队列，使用 `FOR UPDATE SKIP LOCKED` 抢占任务；多个后端进程可同时运行。尚未开始的任务在重启后继续处理，排队超过 5 分钟的请求作废。已开始任务具有 60 秒租约；工作进程崩溃或数据库状态写回失败时，租约到期将任务标记 failed，不自动重发结果不确定的外部请求。用户可在限额允许后重新请求；即使服务商已收到但状态未写回，此码也不能登录。未配置联系方式／禁用／联系方式已变更的任务会 suppressed，不发送。此流程只保证持久化受理与失败关闭，不承诺外部服务的“恰好投递一次”。

管理员可直接查询内部状态（没有公开账号状态查询接口）：

```sql
SELECT delivery_status, COUNT(*) AS total
FROM auth_login_codes WHERE created_at >= NOW() - INTERVAL 1 DAY
GROUP BY delivery_status;
-- 仅内部排查失败请求，不包含验证码或联系方式
SELECT id, user_id, channel, created_at, delivery_status
FROM auth_login_codes WHERE delivery_status='failed'
ORDER BY created_at DESC LIMIT 50;
```

可由内部定时任务分批清理（保留期可调整）：

```sql
DELETE FROM auth_login_codes WHERE expires_at < NOW() - INTERVAL 7 DAY LIMIT 1000;
DELETE FROM auth_rate_limits WHERE expires_at < NOW() - INTERVAL 1 DAY LIMIT 1000;
```

## 验证

```bash
cd backend
npm run build
npm test
# 独立随机临时库，自动清理；该测试账号需要 CREATE/DROP DATABASE 权限
MYSQL_TEST_USER=root npm run test:integration
```

集成测试默认通过 `/tmp/mysql.sock` 连接本机，也可用 `MYSQL_TEST_SOCKET`；TCP 可用 `MYSQL_TEST_HOST`／`MYSQL_TEST_PORT`，凭据使用 `MYSQL_TEST_USER`／`MYSQL_TEST_PASSWORD`。测试不会读写应用账号数据，不会真实发送邮件／短信。覆盖迁移重跑与失败恢复、旧用户保留、超大 ID、双渠道登录、预设地址、重复／过期／错误／跨渠道验证码、发送失败、联系方式变更、并发单次消费、Unicode 别名与累计限流、角色刷新、队列重启恢复、多工作进程抢占和租约中断失效。邮件真实投递需要提供配置后另做联调；短信真实投递当前停用。新增本地短信私有收件箱和 CLI → JWT → /me 集成测试。

## macOS：密码与邮件登录测试

先完成上面的数据库迁移与运行配置。以下命令在 macOS 默认 zsh 中执行，使用专用本地测试账号；`YOUR_...` 必须替换为自己的配置，不要提交 `.env` 或真实密钥。

### 1. 配置本地邮件模拟并创建账号

在 `backend/.env` 设置，保留现有 MySQL、JWT_SECRET 和 AUTH_CODE_SECRET：

```dotenv
NODE_ENV=development
AUTH_DELIVERY_MODE=console
```

该模式不发送真实邮件，无需 Resend 配置。**邮件测试码会以 `[DEVELOPMENT TEST ONLY]` 标记打印到后端终端**，与短信私有收件箱方式不同；不要采集或分享这些测试日志。生产环境拒绝启用 console。短信开关独立，无需修改。

在 `backend/` 执行 `npm run create-user`，按提示创建 `email.test.doctor`，角色填 `doctor`，邮箱填测试占位地址 `doctor@example.com`，手机号可留空，密码自行设置。已有专用测试账号时，管理员可在本地数据库执行：

```sql
UPDATE users SET email = 'doctor@example.com'
WHERE username = 'email.test.doctor';
SELECT id, username, email, role, status
FROM users WHERE username = 'email.test.doctor';
```

确认账号存在且 status 为 active。邮箱只由内部管理员预设，登录请求不能指定接收邮箱。

终端 A 在 `backend/` 启动（修改 .env 后需重启）：

```bash
npm run build
npm start
```

### 2. 测试密码登录

终端 B 执行，交互输入测试密码，避免将密码直接写入命令历史：

```zsh
read -s 'TEST_PASSWORD?请输入测试账号密码：'
printf '\n'
TEST_PASSWORD="$TEST_PASSWORD" node -e 'process.stdout.write(JSON.stringify({account:"email.test.doctor",password:process.env.TEST_PASSWORD}))' |
  curl -i -X POST http://127.0.0.1:3000/api/auth/login \
    -H 'Content-Type: application/json' --data-binary @-
unset TEST_PASSWORD
```

预期 200 和 `{token,user}`；错误密码返回 401。不要分享返回的 JWT。

### 3. 请求邮件验证码

```bash
curl -i -X POST http://127.0.0.1:3000/api/auth/code/request \
  -H 'Content-Type: application/json' \
  -d '{"account":"email.test.doctor","channel":"email"}'
```

预期 **202 accepted，仅表示受理**。等待约 1 秒，终端 A 应出现：

```text
[DEVELOPMENT TEST ONLY] email login code: 123456
```

数字仅为示例。不存在、停用或没有预设邮箱的账号也可能返回相同 202，但不会生成可用测试码。请求中的 account 是用户名，不是邮箱地址。

### 4. 验证码登录与 /me

在终端 B 输入实际收到的码：

```zsh
read 'EMAIL_CODE?请输入邮件验证码：'
LOGIN_JSON="$(curl -fsS -X POST http://127.0.0.1:3000/api/auth/code/login \
  -H 'Content-Type: application/json' \
  -d "{\"account\":\"email.test.doctor\",\"channel\":\"email\",\"code\":\"$EMAIL_CODE\"}")"
TOKEN="$(printf '%s' "$LOGIN_JSON" | node -e 'const x=JSON.parse(require("fs").readFileSync(0,"utf8"));if(!x.token)process.exit(1);process.stdout.write(x.token)')"
curl -i http://127.0.0.1:3000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

预期登录和 `/me` 均为 200；`/me` 返回 `{user}`，包含 id、account、name、role。

### 5. 异常与限流检查

重复提交刚才成功使用的验证码，预期 401：

```bash
curl -i -X POST http://127.0.0.1:3000/api/auth/code/login \
  -H 'Content-Type: application/json' \
  -d "{\"account\":\"email.test.doctor\",\"channel\":\"email\",\"code\":\"$EMAIL_CODE\"}"
```

| 检查 | 操作及预期 |
| --- | --- |
| 错误码 | 申请新码，提交与之不同的 6 位数字，返回 401；累计 5 次错误后，正确码也返回 401 |
| 过期 | 申请新码，记录后执行 `sleep 305`，再提交该码，返回 401 |
| 发送限流 | 同账号同渠道 60 秒内重复请求，返回 429；每小时最多 5 次，同 IP 每小时最多 30 次 |
| 验证限流 | 同 IP 每 10 分钟最多 60 次验证，超限返回 429 |
| 格式错误 | code 为 `"abc"`，或请求额外携带 email 接收地址字段，返回 400 |
| 未认证 | 不带 Bearer token 请求 `/api/auth/me`，返回 401 |

各场景使用新码时注意发送间隔；新码会作废旧码。429 的 `Retry-After: 60` 不保证小时限额已恢复。测试后执行 `unset EMAIL_CODE TOKEN LOGIN_JSON`。

### 6. 测试真实邮件收件（可选）

现有代码使用 Resend HTTP 适配器，不读取 SMTP 配置。在 `backend/.env` 设置：

```dotenv
AUTH_DELIVERY_MODE=provider
RESEND_API_KEY=YOUR_RESEND_API_KEY
EMAIL_FROM=YOUR_RESEND_ALLOWED_SENDER_ADDRESS
```

由管理员将该测试账号的 users.email 设置为自己能收件的邮箱，使用服务商允许的发件地址，重启后重复步骤 3、4，从邮箱取得验证码。provider 模式不打印邮件验证码。202 不保证真实投递成功；没有收到时，检查上文内部队列状态 SQL 及服务商发送记录。无效凭据等异步发送失败会使任务 failed，不能使用该任务登录。未配置服务时不能用 console 测试结果代替真实收件验证。

## 后续前端修改详情（本轮未修改）

1. `src/views/LoginView.vue`：三种方式改为密码／邮箱／短信；三者都输入用户名。验证码模式仅提交 account、channel，验证码登录再加 code；使用 6 位验证码输入与发送倒计时，将 202 明确显示为“请求已受理，不代表发送成功”，不要显示“验证码已发送”；展示 400／401／429／503 提示。移除预填密码、假图形验证码、模拟短信、人脸模拟、手选角色。
2. `src/stores/auth.ts`：改成异步调用真实 API；保存后端 token 和 user，姓名／角色来自后端，不再生成 demo token，也不信任本地保存的角色。三种登录复用同一个成功处理。退出清理 token 和用户状态。
3. `src/router/index.ts`：路由判断前通过 `/api/auth/me` 验证已存 token 并刷新角色；401 清除登录态并转回登录；网络／服务异常展示重试，不能误当作已授权。保留现有角色判断，页面重新加载不能仅凭 token 非空通过。
4. 建议新增 `src/services/auth.ts` 封装这些请求与错误；`vite.config.ts` 配置 `/api` 开发代理到 3000，生产用同源反向代理。增加对应 store／路由／登录交互测试，再运行前端 build 和 test。

现有患者模块仍是浏览器本地演示数据。路由角色守卫仅负责界面访问；后续真实业务 API 也必须在后端强制校验角色与数据范围。

## 按用户名删除账号（内部管理）

在项目根目录或 `backend/` 下执行：

```bash
npm run delete-user -- doctor.demo
# 也可不带用户名，按交互提示输入
npm run delete-user
```

读取 `backend/.env`，先显示数据库及账号 ID、姓名、角色；必须输入 `DELETE doctor.demo` 才执行永久删除。用户名要求精确匹配；取消或账号不存在不会删除数据。账号及其验证码／排队任务在同一事务中删除，保留其他账号的数据与共享限流记录。需要数据库 SELECT、DELETE 权限；脚本会锁定用户行并再次检查确认时的 ID，防止误删同名重建账号。

如账号被病历、医嘱、审核或审计等其他外键关联数据引用，会拒绝删除并回滚，即使该外键允许级联删除；应改为由管理员停用账号。脚本不清理没有数据库外键的逻辑关联数据。已经在外部供应商发送中的消息无法撤回，但删除账号后无法再用验证码或原 JWT 通过后端认证。

测试：在 `backend/` 运行 `MYSQL_TEST_USER=root npm run test:delete-user`。只创建并清理随机临时数据库，不删除业务数据库的账号。

## macOS：完整测试短信登录（不使用 Twilio）

以下从项目根目录开始，使用一个专门的本地测试账号 `sms.test.doctor`。本节 SQL 仅用于本地开发数据库；所有 `YOUR_...` 都需替换。请求接收方始终由数据库预设手机号决定，不能在 HTTP 请求中传手机号。

### 1. 配置本地环境和私有收件目录

```bash
cd backend
# 仅在尚无 .env 时复制，不覆盖已有邮件或数据库配置
[ -f .env ] || cp .env.example .env
mktemp -d "${TMPDIR%/}/ete-sms.XXXXXX"
```

把最后命令输出的绝对目录复制到 `backend/.env`。目录不要放在仓库、前端 public 或常规日志目录中。需要以下设置：

```dotenv
NODE_ENV=development
SMS_DELIVERY_MODE=local-inbox
SMS_TEST_INBOX_DIR=/YOUR/ABSOLUTE/PRIVATE/TEMP/DIRECTORY
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=YOUR_LOCAL_MYSQL_USER
MYSQL_PASSWORD=YOUR_LOCAL_MYSQL_PASSWORD
MYSQL_DATABASE=doctor_platform
JWT_SECRET=YOUR_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
AUTH_CODE_SECRET=YOUR_OTHER_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
PORT=3000
```

两个密钥分别运行 `openssl rand -hex 32` 生成；如果已有有效配置，继续使用即可。不要提交 `.env`。保留现有 `AUTH_DELIVERY_MODE`、`RESEND_API_KEY`、`EMAIL_FROM`；只测试短信且暂未配置邮箱时，可以使用 `AUTH_DELIVERY_MODE=disabled`。无需设置任何 Twilio 变量。修改配置后需重启后端。

### 2. 检查迁移并设置测试医生手机号

已经执行过迁移就无需重复执行。尚未迁移时，从 `backend/` 执行：

```bash
mysql -h 127.0.0.1 -u YOUR_LOCAL_MYSQL_USER -p doctor_platform < migrations/001-login-codes.sql
```

创建专用账号：

```bash
npm run create-user
```

按提示填 `sms.test.doctor`、姓名、可选邮箱、**仅测试用的 E.164 格式占位号码**（例如 `+15555550123`）、角色 `doctor`，以及自己的测试密码。这里不会实际发送短信，不需要真实手机号。

已有测试账号时，管理员可执行：

```bash
mysql -h 127.0.0.1 -u YOUR_LOCAL_MYSQL_USER -p doctor_platform
```

```sql
UPDATE users SET phone = '+15555550123'
WHERE username = 'sms.test.doctor';
SELECT id, username, phone, role, status
FROM users WHERE username = 'sms.test.doctor';
```

确认账号存在、角色为 doctor、status 为 active。如果需要调整，只调整这个专用测试账号；不要批量修改现有账号。

### 3. 构建和启动

终端 A，在 `backend/`：

```bash
npm ci
npm run build
npm start
```

应看到监听 `http://127.0.0.1:3000` 的提示。**服务日志不会显示短信验证码。** 队列工作进程通常每秒取一次任务；202 返回时文件可能尚未写好。

### 4. 请求和读取验证码

终端 B，也进入同一项目的 `backend/`。使用 `.env` 中相同的配置，避免另外设置冲突的 shell 环境变量：

```bash
curl -i -X POST http://127.0.0.1:3000/api/auth/code/request \
  -H 'Content-Type: application/json' \
  -d '{"account":"sms.test.doctor","channel":"sms"}'
```

应为 **202**，body 为 accepted 条件提示，没有验证码或手机号。不存在／停用／未配置手机号的账号也可能得到同样的 202，但不会生成可用的测试短信。

等待约 1 秒后执行；如提示没有可用短信码，再等一两秒重试读取，不要重复请求发送：

```bash
SMS_CODE="$(npm run --silent sms-test-code -- sms.test.doctor)"
printf '本地测试短信验证码：%s\n' "$SMS_CODE"
```

命令会显示 6 位验证码。它是本地管理员主动读取测试收件箱，不是服务日志；不要把输出纳入日志采集或提交。普通登录接口无法读取它。

### 5. 错误验证码、成功登录、me 和重复使用

先生成一个保证不同的 6 位错误码：

```bash
WRONG_CODE="$(SMS_CODE="$SMS_CODE" node -e 'console.log(String((Number(process.env.SMS_CODE)+1)%1000000).padStart(6,"0"))')"
curl -i -X POST http://127.0.0.1:3000/api/auth/code/login \
  -H 'Content-Type: application/json' \
  -d "{\"account\":\"sms.test.doctor\",\"channel\":\"sms\",\"code\":\"$WRONG_CODE\"}"
```

应为 **401**，`Invalid or expired code`，并累计一次尝试。然后用正确码登录并提取 JWT：

```bash
LOGIN_JSON="$(curl -fsS -X POST http://127.0.0.1:3000/api/auth/code/login \
  -H 'Content-Type: application/json' \
  -d "{\"account\":\"sms.test.doctor\",\"channel\":\"sms\",\"code\":\"$SMS_CODE\"}")"
TOKEN="$(printf '%s' "$LOGIN_JSON" | node -e 'const x=JSON.parse(require("fs").readFileSync(0,"utf8"));if(!x.token)process.exit(1);process.stdout.write(x.token)')"
curl -i http://127.0.0.1:3000/api/auth/me -H "Authorization: Bearer $TOKEN"
```

登录应返回 200 和 `{token,user}`；`/me` 应返回 **200** 和真实数据库账号信息。接着重用刚才验证码：

```bash
curl -i -X POST http://127.0.0.1:3000/api/auth/code/login \
  -H 'Content-Type: application/json' \
  -d "{\"account\":\"sms.test.doctor\",\"channel\":\"sms\",\"code\":\"$SMS_CODE\"}"
```

应为 **401**。不带 token 的 `/me` 也应为 401。已使用的码无法再通过读取命令取得；保存在 shell 变量中的旧码同样无法重新认证。

### 6. 发送限流、过期、尝试次数

**发送限流**：对同一账号连续执行步骤 4 的请求两次（新一轮前确保距上一次至少 60 秒），第一次通常 202，第二次 **429**。限额是每账号每渠道 60 秒 1 次、1 小时 5 次；同 IP 每小时 30 次。读取本地文件不消耗发送次数。429 的 `Retry-After: 60` 不代表小时限额已恢复；不要清空限流表绕过规则。

**过期**：距上次发送至少 60 秒后，重新执行步骤 4，请求并保存一个新 `SMS_CODE`，不要立即登录。然后：

```bash
sleep 305
curl -i -X POST http://127.0.0.1:3000/api/auth/code/login \
  -H 'Content-Type: application/json' \
  -d "{\"account\":\"sms.test.doctor\",\"channel\":\"sms\",\"code\":\"$SMS_CODE\"}"
```

应为 **401**。有效期从 worker 生成码开始计时，文件与数据库均检查过期。

**五次错误上限**：再申请并读取一个未过期新码，重新生成 `WRONG_CODE`（步骤 5），连续提交五次：

```bash
for attempt in 1 2 3 4 5; do
  curl -s -o /dev/null -w '%{http_code}\n' \
    -X POST http://127.0.0.1:3000/api/auth/code/login \
    -H 'Content-Type: application/json' \
    -d "{\"account\":\"sms.test.doctor\",\"channel\":\"sms\",\"code\":\"$WRONG_CODE\"}"
done
```

五次均应为 401。随后用正确 `SMS_CODE` 登录仍应 401。同 IP 每 10 分钟最多 60 次验证；达到 IP 限额后返回 429。不要用固定错误码代替 `WRONG_CODE`，随机验证码可能恰好相同。

**其他错误**：`code` 传 `"abc"` 返回 400；请求中附带任意 `phone` 字段返回 400；关闭 `SMS_DELIVERY_MODE` 并重启后，短信接口返回 503（已有超限时可先返回429）；把 NODE_ENV 改成 production 而保留 local-inbox，启动直接报错，不会启用测试短信。

### 7. 测试后清理

停止后端，将 `SMS_DELIVERY_MODE` 恢复 disabled 并重启。测试文件会保留到你主动清理；在 Finder 中删除步骤 1 创建的那个专用临时目录，清空当前终端的 `SMS_CODE`、`WRONG_CODE`、`TOKEN`、`LOGIN_JSON`：

```bash
unset SMS_CODE WRONG_CODE TOKEN LOGIN_JSON
```

不要把私有测试收件目录指向常规日志、共享目录或网站静态目录。正式部署只保留 disabled；邮箱现有配置继续独立生效。
