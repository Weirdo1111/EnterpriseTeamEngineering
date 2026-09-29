# Backend 登录系统

当前已合并密码、邮箱和人脸登录，以及 main 的病历、AI 和知识库接口。沿用 Express、mysql2、Argon2id 和 JWT。

## 当前进度与范围

- 密码：验证数据库中的 Argon2id 哈希，签发 JWT。
- 邮箱：根据用户名查找管理员预设邮箱，异步发送验证码；前端支持请求验证码、倒计时、输入 6 位码并登录。
- 登录状态：前端保存真实 token；进入受保护页面前调用 `/api/auth/me` 获取当前身份和角色。旧 demo token 不再有效，不再提供 Demo Role 选择。
- 人脸：账号 + 摄像头拍照，由 Express 调用腾讯云 VerifyFace，使用数据库保存的 PersonId；严格验证云端结果后复用原 JWT 签发。未登记、未配置或验证失败均不能登录。
- **短信认证因尚未找到合适平台，真实服务接入暂时搁置。** 保留短信接口和校验逻辑，发送始终关闭，Twilio 不再使用。
- 本地模拟发送已删除：没有邮件 console 模式、短信私有收件箱或读取测试码命令；验证码不会在接口响应或常规日志中出现。
- 账号由内部管理，无注册、用户自行绑定／修改邮箱或手机号接口。
- 按本轮要求删除 backend 自动化测试和专用测试脚本；前端测试、RAG 评估及数据集下载／导入工具保留；专用数据集 smoke test 脚本一并删除。CI 运行前端测试和前后端构建。

服务端同时挂载 `/api/auth`、`/api/records`、`/api/ai` 和 `/api/rag`。业务接口沿用后端角色和数据范围校验；启动时检查认证表及业务表。仅有三张认证表的本地数据库尚不足以运行合并后的完整后端。

## 数据库初始化：供其他协作者导入

`database/auth-initial.sql` 是本地实际数据库导出的私有快照，不随本次 Git 提交发布；协作者需通过内部授权渠道取得该文件后才能执行下方导入命令。快照包含：

1. `users` 完整结构和三个现有账号：`doctor1`（doctor）、`doctor2`（seniorDoctor）、`doctor3`（admin）。
2. `auth_login_codes` 共用验证码／持久化发送队列表结构。
3. `auth_rate_limits` 持久化限流表结构。

**账号 ID、姓名、密码哈希、邮箱、手机号、角色、状态和创建时间均保留原值。** 导入后使用原密码，SQL 中没有可还原的明文密码。文件包含真实联系方式及密码哈希，仅应提供给获授权协作者，不应公开发布。文件不包含历史验证码、发送任务、限流数据或其他业务表。

要求 MySQL 8.0+。从项目根目录导入到一个新的空数据库（数据库名可自行选择）：

```bash
mysql -u YOUR_ADMIN -p -e 'CREATE DATABASE doctor_platform_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci'
mysql -u YOUR_ADMIN -p doctor_platform_demo < backend/database/auth-initial.sql
```

然后将协作者的 `backend/.env` 中 `MYSQL_DATABASE` 设置为 `doctor_platform_demo`。首次导入已经包含认证表，不必再运行登录迁移。初始化文件不覆盖现有表，不应重复导入到已有业务数据的库。

**已有数据库升级**仍使用原来的迁移，不导入初始化快照：

```bash
mysql -u YOUR_ADMIN -p doctor_platform -e 'SHOW CREATE TABLE users\G'
mysql -u YOUR_ADMIN -p doctor_platform < backend/migrations/001-login-codes.sql
mysql -u YOUR_ADMIN -p doctor_platform < backend/migrations/005-auth-tencent-face.sql
```

实际 `users.id` 为有符号 BIGINT。迁移验证该类型，按需补充可空联系方式并建立认证表，不重置账号。仓库的 `001_core_schema.sql` 使用无符号 BIGINT，属于另一套业务建表方案，不能直接与此认证初始化组合执行；本轮按约定没有修改它及相关业务外键。

## 启动后端

```bash
cd backend
npm ci
[ -f .env ] || cp .env.example .env
```

编辑 `.env`（所有 YOUR_... 均需替换）：

```dotenv
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=YOUR_MYSQL_USER
MYSQL_PASSWORD=YOUR_MYSQL_PASSWORD
MYSQL_DATABASE=doctor_platform_demo
JWT_SECRET=YOUR_INDEPENDENT_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
AUTH_CODE_SECRET=YOUR_OTHER_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
NODE_ENV=development
PORT=3000
AUTH_DELIVERY_MODE=provider
RESEND_API_KEY=YOUR_RESEND_API_KEY
EMAIL_FROM=YOUR_RESEND_ALLOWED_SENDER_ADDRESS
SMS_DELIVERY_MODE=disabled
```

两个密钥分别执行 `openssl rand -hex 32` 生成；已有有效配置可继续沿用，不要提交实际密钥。邮件使用 Resend HTTP API，不读取 SMTP 配置；发件地址需要得到服务商允许，收件地址来自 `users.email`。如尚未配置邮件服务，可将 `AUTH_DELIVERY_MODE` 设置为 `disabled`，密码登录仍可使用，邮件发送不可用。

旧配置须移除 `SMS_TEST_INBOX_DIR`，将 `SMS_DELIVERY_MODE=local-inbox` 改为 `disabled`；`AUTH_DELIVERY_MODE=console` 改为 `provider` 或 `disabled`。旧模拟模式会明确报错，不会悄悄恢复模拟发送。无需配置任何 `TWILIO_*` 变量。

编译并启动完整后端：

```bash
npm run build
npm start
```

默认监听 `http://127.0.0.1:3000`，自动运行持久化发送队列。合并后保留 `main` 的 `officeparser`、`minisearch`、Helmet 和密码登录限流依赖，请重新执行 `npm ci`。`build:auth` 为兼容已有启动命令保留，当前入口也包含业务路由，因此不再是仅认证模块的构建。

## 一键启动前后端与使用

项目根目录的 `.env.local` 设置：

```dotenv
VITE_AUTH_API_BASE_URL=http://127.0.0.1:3000
VITE_API_BASE_URL=
```

认证地址独立配置，避免为了真实登录将其他演示模块切到未开放的业务 API。`VITE_API_BASE_URL` 是原有业务开关；如果团队已经配置真实业务后端，应保留它。没有设置独立认证地址时会沿用原业务地址；两者都为空则请求同源 `/api/auth/...`，需要部署环境配置反向代理。

```bash
npm ci
npm run dev
```

根目录 `npm run dev` 会先执行后端入口构建，再同时启动 Express 和 Vite；请先完成上述后端依赖安装、数据库和环境变量配置，并停止单独运行的后端，避免 3000 端口冲突。按 Ctrl+C 会停止两个服务，任一服务退出也会停止另一服务。后端源码或 `.env` 修改后需重新运行该命令；前端仍支持 Vite 热更新。仅需前端时使用 `npm run dev:frontend`。

访问终端显示的前端地址，默认 `http://127.0.0.1:5173/login`。后端允许 localhost／127.0.0.1 的 5173 端口来源。

- Password：输入数据库用户名和原密码。
- Email Verification：输入用户名并请求验证码，到该账号预设邮箱收件，再输入 6 位码。页面上的“已受理”不代表发送成功。普通用户不能在页面指定或修改收件邮箱。
- Facial Verification：输入账号，开启摄像头并允许权限，确认画面只有本人后点击“VerifyFace”；账号须先在腾讯云登记并完成服务端映射。
- 成功后使用后端姓名和角色，刷新页面会重新验证会话；退出会清理本地状态。未经认证或过期的 token 无法通过路由守卫。

修改前端环境变量后需重启 Vite，修改后端 `.env` 后需重启后端。真实邮件收件仍需使用你配置的服务商账户进行联调，不应把接口受理成功当作实际投递成功。

## API 约定

| 接口 | 请求 | 响应 |
| --- | --- | --- |
| `POST /api/auth/login` | `{account,password}` | `{token,user}` |
| `POST /api/auth/code/request` | `{account,channel:"email"}` | 202 `{status:"accepted",message}`，不返回验证码、联系方式或账号存在状态 |
| `POST /api/auth/code/login` | `{account,channel:"email",code}` | `{token,user}` |
| `GET /api/auth/me` | `Authorization: Bearer TOKEN` | `{user}`，重读当前账号角色和状态 |
| `POST /api/auth/logout` | Bearer token | `{success:true}`，客户端清除 token |

验证码接口仍接受 sms 渠道，但默认不可用，返回 503（触发限流时可先返回 429）。前端不显示短信登录。

user 仅含 id、account、name、role；超出 JS 安全整数范围的 ID 使用字符串。JWT 为 HS256、有效期 2 小时，subject 使用精确用户 ID。角色由数据库确定，不接受前端自选角色。`createAuthenticated` 导出同一认证中间件，供其他后端模块后续复用。

退出不会服务端撤销已签发 JWT；token 自然过期，停用账号则立即无法通过 `/me`。生产部署使用 HTTPS，并按真实代理地址配置 Express 信任范围，不能无条件信任 `X-Forwarded-For`；当前默认使用直连 IP 限流。

## 验证码与发送状态

- 后台生成 6 位随机码，有效期 5 分钟，数据库只存 HMAC 摘要，单次使用，最多 5 次错误尝试。
- 同账号同渠道每 60 秒 1 次、每小时 5 次发送请求；同 IP 每小时 30 次发送请求、每 10 分钟 60 次验证。限流持久化且跨重启有效。
- 新码作废同账号同渠道旧码；联系方式更改后，旧联系方式对应的码失效。
- 不存在、停用或未设联系方式的账号使用统一受理响应；异步失败仅记录内部状态，防止通过同步发送结果枚举账号。
- 400：格式错误；401：凭据错误或验证码无效／过期／已用／超尝试；429：限流；503：发送渠道未配置；500：内部故障。
- 发送成功状态仅表示服务商接受提交，不保证最终到达邮箱。failed／pending／queued 等状态不能登录。事务锁保证并发只能消费一次；中断的发送任务租约到期后失败关闭，不自动重发不确定的外部请求。

内部管理员可排查队列，不读取明文验证码：

```sql
SELECT id, user_id, channel, created_at, delivery_status
FROM auth_login_codes
ORDER BY created_at DESC LIMIT 50;
```

## 内部账号管理

从 `backend/` 执行：

```bash
npm run create-user
npm run delete-user -- USERNAME
```

创建脚本录入用户名、姓名、邮箱、手机号、角色和密码，存储 Argon2id 哈希。删除脚本显示账号信息并要求输入 `DELETE USERNAME`；账号和验证码任务在同一事务中删除，被业务外键引用时拒绝删除并回滚。脚本不清理无外键的业务逻辑关联，必要时应由管理员停用账号。

管理员通过受控数据库操作管理 `email`／`phone`，空值使用 NULL，手机号使用 E.164 格式。运行账号需要 users SELECT 以及认证表 SELECT/INSERT/UPDATE；管理脚本另需相应 INSERT／DELETE 权限。


## 腾讯云人脸验证登录

### 接口与安全边界

新增 `POST /api/auth/face/login`，JSON 仅允许 `{account,image}`，image 是不带 data URL 前缀的 JPEG／PNG Base64。前端通过摄像头生成 JPEG，长边缩至最多 960 像素；离开页面、切换登录方式或拍照完成会关闭摄像头。只能在 localhost 或 HTTPS 安全上下文请求摄像头权限。

Express 根据用户名读取 active 用户及 `users.tencent_person_id`。拒绝客户端 PersonId、role、permissions、Url 等额外字段；云端验证结束后再次读取账号状态、角色和映射，成功响应仍为现有 `{token,user}`。公开 user 不包含 PersonId。

腾讯云接口固定为 `iai.tencentcloudapi.com` 的 **VerifyFace / 2020-03-03**，使用 TC3-HMAC-SHA256 后端签名，不依赖前端云 SDK。**API Version 与算法模型版本不同**：人员库须为 **3.0**，VerifyFace 从人员库继承算法版本，不能在登录参数中临时指定。只有 HTTP 成功、无云端 Error、`IsMatch === true`、模型版本为 `3.0`、有效数值 Score 达到服务端阈值时才通过。默认阈值 60，配置只允许 60～100，固定 `QualityControl=3`，云调用 8 秒超时、不自动重试。参考 [VerifyFace 官方文档](https://cloud.tencent.com/document/api/867/44983) 和 [TC3 签名说明](https://cloud.tencent.com/document/api/213/30654)。

这是一张照片的人脸匹配，**不具备活体检测能力**；VerifyFace 对多人照片使用最大人脸，测试时应确保仅本人入镜。不能将当前功能描述成已防范照片／视频重放的正式活体认证。

- 人脸 JSON 请求上限 3 MiB，Base64 上限 2,800,000 字符，拒绝压缩请求体、URL 图片及非规范 Base64；云端负责实际解码和质量判断。其他认证请求仍为 16 KiB。
- 复用 `auth_rate_limits`：同账号每 5 分钟最多 15 次有效格式尝试，同 IP 每 5 分钟最多 15 次请求；包含失败、未知账号和成功尝试，不因重启或成功而重置。账号大小写／重音别名按 MySQL 排序规则共享配额，并发计数使用事务锁。
- 账号不存在、停用、未登记、照片不匹配、云端失败，对外统一 401 提示；不返回具体原因、相似度或 PersonId。格式错误 400，体积超限 413，限流 429，账号限流 `Retry-After: 300`，IP 限流 `Retry-After: 300`。一致响应不等于保证所有分支耗时一致。
- 后端只记录固定事件码、云错误码及 RequestId，不记录照片、Base64、账号输入、云端原始错误消息、SecretId 或 SecretKey。图片不落盘、不入库。

### 演示配置与后续安全计划

人脸认证同账号、同 IP 分别 **5 分钟最多 15 次**，超出返回 429；成功和失败都计数，重启后端不会清除限流。需要在后端配置腾讯云密钥，前端不能保存密钥。

本次演示按**临时凭证有效期一天（24 小时）**安排使用；实际过期时间以腾讯云签发结果为准，并非所有腾讯云密钥都固定一天有效。临时凭证需同时配置 SecretId、SecretKey 和 `TENCENT_SESSION_TOKEN`，到期后更换整套凭证并重启后端；项目目前不会自动续期，也不会自行将长期密钥设为一天过期。腾讯云允许的临时凭证时长取决于签发身份，参见[官方临时密钥说明](https://cloud.tencent.com/document/faq/436/56637)。

后续任务会考虑添加人机验证码等安全措施，并评估活体检测和防重放；这些措施目前尚未实现，现有照片匹配不能替代活体认证。

### 已有数据库迁移

先备份，再从项目根目录执行：

```bash
mysql -u YOUR_ADMIN -p doctor_platform < backend/migrations/005-auth-tencent-face.sql
```

迁移可重跑，只新增可空的 `tencent_person_id VARCHAR(64)` 和唯一索引，不改用户 ID、密码或角色。NULL 表示未登记，不影响密码／邮箱登录。初始化 SQL 已包含字段，但所有人脸映射均为空；真实映射和人脸数据不写入共享初始化快照。

### 控制台登记：先使用已有的 doctor_platform 人员库

你已创建人员库 ID `doctor_platform` 和 PersonId `doctor1`。请在云端确认它们位于预期地域，且人员库算法模型确为 **3.0**。

1. 登录腾讯云人脸识别控制台，进入人员管理，打开 `doctor_platform`，核对模型版本和已登记的 `doctor1` 照片。
2. 若控制台未提供模型选择或详细信息，使用控制台内 [API Explorer](https://console.cloud.tencent.com/api/explorer?Product=iai&Version=2020-03-03&Action=GetGroupInfo) 查询 `GroupId=doctor_platform`。已有 2.0 库不能靠 VerifyFace 参数变成 3.0，应创建新的 3.0 库后重新登记，不要删除已有库来强行重建。
3. 尚未建库的协作者可调用 [CreateGroup](https://cloud.tencent.com/document/api/867/45015)，选择地域，填写 GroupId、GroupName，显式设置 `FaceModelVersion="3.0"`。
4. 在人员库中创建人员并上传经本人同意的清晰正面照片。也可使用 [CreatePerson](https://cloud.tencent.com/document/api/867/45014)，填写 GroupId、PersonId、PersonName 和照片，确认返回模型版本为 3.0。其他医生应使用各自独立的 PersonId；不要把同一个人的照片登记到不同医生账号。
5. 登记成功后，由内部管理员把返回／指定的 PersonId 映射到对应 MySQL 用户。PersonId 是腾讯云账号内的标识，VerifyFace 不需要 GroupId；后台不会接收浏览器指定的任何云端身份。

你当前的明确映射为 MySQL 用户 `doctor1` → 腾讯云 PersonId `doctor1`。手动部署时可执行：

```sql
UPDATE users SET tencent_person_id = 'doctor1'
WHERE username = 'doctor1' AND (tencent_person_id IS NULL OR tencent_person_id = 'doctor1');
SELECT id, username, role, status, tencent_person_id FROM users;
```

不要自动为 doctor2／doctor3 填入尚未登记的 PersonId。先在控制台登记本人，再逐个设置对应映射。暂不开发面向用户的人脸登记页面；账号删除脚本也不会删除云端 Person，退场时由管理员分别处理映射及云端人员资源。

### 后端配置

仅编辑本机 `backend/.env`，不要粘贴密钥到聊天、终端命令、前端环境或 Git：

```dotenv
TENCENT_FACE_ENABLED=true
TENCENT_SECRET_ID=YOUR_BACKEND_ONLY_SECRET_ID
TENCENT_SECRET_KEY=YOUR_BACKEND_ONLY_SECRET_KEY
TENCENT_FACE_REGION=YOUR_GROUP_REGION
TENCENT_FACE_THRESHOLD=60
# 使用临时凭证时填写配套 token，否则留空
TENCENT_SESSION_TOKEN=
```

运行时云凭据只需调用 VerifyFace 的权限；云端登记由管理员的控制台权限完成。未配置或未启用时人脸登录失败关闭，密码和邮箱仍按原方式工作。修改后重新运行 `npm run build:auth`、`npm start`。前端继续沿用 `VITE_AUTH_API_BASE_URL`，不新增任何云密钥配置。

### 验证与当前限制

```bash
# 项目根目录
npm test
npm run build
npm run build --prefix backend
```

backend 自动化测试已按要求删除，不再提供 test:face、test:face:db 或 test:integration 命令。真人识别、邮箱投递与云服务异常仍需在配置完成后人工联调；不能以构建通过代替真实云端识别成功。

### 合并后的数据库部署限制

认证迁移 `001-login-codes.sql` 要求已有 `users.id` 为 BIGINT SIGNED，业务建表 `001_core_schema.sql` 的用户外键为 BIGINT UNSIGNED，两者不可直接混用。认证迁移含 MySQL 客户端的 DELIMITER 指令，现有 `npm run migrate` 的 mysql2 执行器不能直接解析；其文件排序还会先执行认证迁移。因此不要直接对现有数据库运行全部迁移。部署前需由团队统一用户 ID 类型、确认迁移顺序及执行方式，备份后再实施。本次代码合并不执行或重写数据库迁移。

## Medical record API

All endpoints require `Authorization: Bearer TOKEN`.

```text
GET    /api/records
GET    /api/records/:id
POST   /api/records
PATCH  /api/records/:id
POST   /api/records/:id/submit
POST   /api/records/:id/orders
PATCH  /api/records/:id/orders/:orderId
POST   /api/records/:id/orders/:orderId/stop
POST   /api/records/:id/reviews
POST   /api/ai/record-draft
POST   /api/ai/consultation-summary
POST   /api/ai/similar-cases
POST   /api/ai/order-check
GET    /api/rag/documents
GET    /api/rag/ingestion-jobs
POST   /api/rag/query
```

Every mutation includes `expectedVersion`. A stale version returns HTTP 409 rather than overwriting another session. The backend enforces role permissions and state transitions independently of the frontend.

Ordinary doctors can only list, read, or modify records they created. Senior doctors and administrators can read all records, while only senior doctors can review or archive them. Successful record/order mutations and their audit entries commit in the same database transaction.

The doctor's AI Assistant has four workflows: editable record draft, source-faithful consultation summary, synthetic similar-case retrieval with relevant guidance, and proposed-order review. The record draft does not create diagnoses or orders automatically; an assistant draft cannot be submitted while its diagnosis remains `Pending physician assessment`. The order checker accepts structured ingredient, approval number, route, dose, frequency, current medicines, allergies, and eGFR. It detects exact ingredient allergies and a narrow preliminary amoxicillin-versus-penicillin warning. For non-commercial coursework, run `npm run ddinter:prepare` to download a pinned, checksummed DDInter 2.0 interaction index before starting the backend. The dataset is stored locally and is not committed. Interaction checks require a confirmed current medication list and uniquely resolved generic ingredients. Product-specific cross-allergy, renal dose, and geriatric rules still require a locally reviewed Mainland China catalog; the assistant never clears a prescription. See [medication knowledge integration](docs/medication-knowledge.md). Similar-case records are synthetic examples, not treatment evidence.

For the three bundled demo consultations, the record-draft and summary routes can call the Ark chat model to produce concise text with source excerpts. Only server-owned synthetic text is sent: the patient ID, fictional name, consultation ID, complaint, history, and every message must exactly match the fixture, and physician notes must be empty. Other records stay on the local rule-based path. Invalid model citations, altered measurements, omitted measured statements, and provider failures fall back to recorded text. Creating a record draft is one action in the AI Assistant; the draft still needs physician review, diagnosis, and orders before submission. Real patient data must not be enabled for model generation without an authorized server-side patient repository and organization-approved data-processing controls.

To use the backend from Vite, create a root `.env.local` containing:

```text
VITE_API_BASE_URL=http://127.0.0.1:3000
```

Without this variable, the frontend intentionally uses local demo adapters.

Run `npm run build` to check backend compilation. Backend automated test scripts have been removed.

## RAG knowledge base

Configure the Ark credentials and model IDs in `backend/.env`:

```text
AI_API_KEY=replace_with_your_ark_api_key
AI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
AI_CHAT_MODEL=doubao-seed-2-0-lite-260428
AI_EMBEDDING_MODEL=doubao-embedding-vision-251215
AI_EMBEDDING_DIMENSIONS=1024
```

After applying migrations and building the backend, import PDF, PPTX, DOCX, or Synthea FHIR R4 JSON documents:

```bash
npm run build
npm run ingest -- "C:\path\requirements.pptx" "C:\path\guide.pdf"
```

The importer stores only extracted text, citation metadata, and vectors in MariaDB. Original files and local paths are not copied into the database. Each import has a persistent checkpoint in `knowledge_ingestion_jobs`; failed imports resume from stored chunk embeddings, and the previous ready document remains available until the replacement commits atomically. Authenticated clinicians can query `POST /api/rag/query`; all queries are audited. If the chat model is rate limited, the endpoint returns ranked source evidence with `generationMode: "retrieval-only"` instead of inventing an answer.

Queries are isolated by an explicit retrieval scope. Omitting `scope` remains backward-compatible and selects only project documents:

```json
{ "question": "What is required for medical record review?", "scope": "project" }
{ "question": "How should fall risk be screened?", "scope": "clinical-guideline" }
{ "question": "Summarize recorded conditions", "scope": "synthetic-patient", "documentId": "KD-..." }
```

`synthetic-patient` requires one document ID and retrieves only that patient plus approved clinical guidance. Low-evidence questions and requests for diagnosis, prescriptions, or medication doses return `answerDecision: "abstained"` without calling the chat model. Every response includes `scope`, `evidenceStatus`, and `clinicianReviewRequired`.

### Curated open datasets

The repository includes a reviewable source catalog at `data/dataset-catalog.json`. It contains CDC STEADI, eight Synthea synthetic records, three Chinese NHC guidance documents, and two WHO guidelines. These are coursework references with mixed rights, not a uniformly open-licensed or commercially cleared medical database. See `docs/clinical-guidance-sources.md` before reuse.

```bash
npm run datasets:fetch
npm run migrate
npm run build
npm run datasets:ingest
```

Select clinical PDFs without re-downloading or importing patient samples:

```bash
npm run datasets:fetch -- --clinical
npm run datasets:ingest -- --clinical
# Select one document; repeat --source= for more than one.
npm run datasets:ingest -- --source=nhc-diabetes-diet-2023
```

The five new PDFs use page-preserving chunks (`clinical-pages-v1`) to retain short headings and bullets without one embedding request per PDF text block. Sparse text extraction is rejected; scanned guidelines require a text edition or validated OCR. Existing CDC/project benchmark documents retain their original chunks. Guidelines remain isolated from project PPTs and synthetic patients. New documents become available to existing similar-case guidance retrieval after ingestion, but this does not add a question-answering page or attach guideline facts to a patient's record.

Downloaded files are gitignored; the fetch receipt records checksums locally. The FHIR importer excludes names, addresses, contact details, identifiers, and exact birth dates before embedding. It stores publisher, source URL, license, category, and synthetic-data status alongside each document. `AI_EMBED_DELAY_MS` defaults to 1200 ms to reduce embedding RPM pressure and can be tuned for the provider quota.

Run the reviewable retrieval benchmark, or include answer generation metrics:

```bash
npm run eval:rag
npm run eval:rag -- --generate
```

The benchmark definitions and interpretation notes are in `docs/rag-evaluation.md`. It compares the original fragment ranking with source-page aggregation using identical query embeddings and human-authored relevance labels.

The evaluator also compares an experimental local full-text reranker and adaptive evidence selector (`retrievalPrecisionCandidate`). It reports fixed-cutoff precision/recall at 1, 3, 5, and 8, sparse-label ceilings, actual-returned precision, mean result counts, and empty-result rates without altering the original labels. Keep the default `RAG_RETRIEVAL_STRATEGY=source-group` until complete-corpus evaluation and manual recall review support rollout. To opt into the candidate afterward, set `RAG_RETRIEVAL_STRATEGY=precision` in the backend environment and restart. Responses and audit logs identify the active strategy. See `docs/rag-evaluation.md` for validation limits.

See `docs/production-readiness.md` for implemented safety controls, data-source decisions, and the release-blocking work that remains before any commercial or clinical deployment.
