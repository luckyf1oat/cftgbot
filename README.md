# CFTGBot - Telegram 入群验证机器人

基于 Cloudflare Workers + Turnstile 的 Telegram 群组人机验证机器人。

## 功能

- **人机验证**：新成员加入群组时自动禁言，发送验证按钮，完成 Turnstile 验证后自动解除禁言
- **超时踢出**：5 分钟未验证自动移出群组
- **自动清理**：验证完成后 10 秒自动删除验证消息
- **多 Bot 管理**：支持在同一 Worker 下管理多个 Telegram Bot
- **Web 管理后台**：设置密码登录，可视化添加/编辑/删除 Bot 配置
- **群组白名单**：可限制 Bot 仅对指定群组生效

## 前置要求

1. [Cloudflare 账号](https://dash.cloudflare.com/)
2. [Telegram Bot Token](https://t.me/BotFather) — 从 @BotFather 创建
3. [Cloudflare Turnstile Site Key 和 Secret Key](https://dash.cloudflare.com/?to=/:account/turnstile) — 在 Cloudflare Dashboard 中申请

## 快速开始

### 1. 创建 KV Namespace

在 Cloudflare Dashboard 中：
1. 进入 **Workers & Pages** → **KV**
2. 点击 **创建命名空间**
3. 命名空间名称：`CFTGBOT_KV`（或其他名字）
4. 创建后复制 **Namespace ID**

### 2. 配置 wrangler.toml

编辑 `wrangler.toml`，填入 KV Namespace ID：

```toml
[[kv_namespaces]]
binding = "KV"
id = "你的KV_NAMESPACE_ID"   # 替换此处
preview_id = ""
```

### 3. 部署

```bash
# 安装依赖
npm install

# 登录 Cloudflare（首次需要）
npx wrangler login

# 部署
npx wrangler deploy
```

### 4. 设置管理员密码

1. 访问部署后的 Worker 域名（例如 `https://cftgbot.你的用户名.workers.dev`）
2. 首次访问会自动跳转到 `/setup` 设置管理员密码
3. 设置成功后自动跳转到管理后台 `/dashboard`

### 5. 添加 Bot

在管理后台中：
1. 点击右下角 **+** 按钮
2. 填写 Bot 信息：
   - **Bot 名称**：自定义名称
   - **Bot Token**：从 @BotFather 获取
   - **Turnstile Site Key**：Cloudflare Turnstile Site Key
   - **Turnstile Secret Key**：Cloudflare Turnstile Secret Key
   - **管理群组 ID**（可选）：留空则对所有群组生效
3. 保存后系统自动为 Bot 设置 Webhook

### 6. 配置群组

1. 将 Bot 添加为目标群组的**管理员**
2. 确保 Bot 拥有以下权限：
   - 删除消息
   - 封禁用户
3. 新成员加入时 Bot 会自动开始验证流程

## 工作流程

```
用户加入群组
    ↓
Bot 检测到新成员 → 禁言用户
    ↓
Bot 发送验证消息（含"点击验证"按钮）
    ↓
用户点击按钮 → 打开验证网页
    ↓
用户完成 Turnstile 人机验证
    ↓
Bot 解除禁言 → 用户可发言
    ↓
10 秒后自动删除验证消息
```

## 项目结构

```
cftgbot/
├── package.json           # 项目配置
├── wrangler.toml          # Cloudflare Workers 配置
├── README.md              # 本文件
└── src/
    ├── index.js           # Worker 入口，路由分发
    ├── kv.js              # KV 存储封装（管理员、Bot 配置、验证状态）
    ├── turnstile.js       # Turnstile 验证 API 调用
    ├── telegram.js        # Telegram Bot API 封装
    ├── auth.js            # 管理员密码验证
    ├── admin-handler.js   # Web 管理后台（页面渲染 + API）
    ├── webhook.js         # Telegram Webhook 处理（成员加入、按钮回调）
    └── verify-handler.js  # 验证页面 + 验证回调处理
```

## 环境变量

所有配置均通过管理后台的 Web UI 管理，存储在 KV 中，无需设置环境变量。

## 路由

| 路径 | 说明 |
|---|---|
| `/setup` | 首次设置管理员密码 |
| `/login` | 管理员登录 |
| `/dashboard` | 管理后台 |
| `/verify` | 用户验证页面 |
| `/webhook/:botId` | Telegram Bot Webhook 回调 |
| `/api/setup` | 设置密码 API |
| `/api/login` | 登录 API |
| `/api/bots` | Bot 列表 / 添加 |
| `/api/bots/:id` | 编辑 / 删除 Bot |

## 自定义开发

```bash
# 本地开发
npx wrangler dev

# 部署
npx wrangler deploy

# 查看日志
npx wrangler tail
```

## 许可

MIT