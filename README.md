# CFTGBot

运行在 Cloudflare Workers 上的 Telegram 群组入群验证机器人。新成员加入群组后会被临时限制发言，通过 Cloudflare Turnstile 人机验证后自动恢复群组默认权限；超过 5 分钟仍未完成验证的成员会被移出群组。

项目包含 Web 管理后台，可在同一个 Worker 中管理多个 Telegram Bot，无需单独部署数据库或服务器。

## 功能

- 新成员入群后自动禁言并发送验证按钮
- 使用 Cloudflare Turnstile 完成人机验证
- 验证成功后恢复群组默认权限并删除验证消息
- 5 分钟未验证自动移出，之后仍可重新加入
- 支持多个 Bot 和群组白名单
- Web 管理后台添加、编辑、删除 Bot
- 自动设置和更新 Telegram Webhook
- Cloudflare KV 持久化配置及验证状态
- Cron Trigger 定时清理过期验证

## 工作流程

```text
成员加入群组
    |
    v
Bot 临时限制成员发言
    |
    v
发送带验证按钮的群组消息
    |
    v
成员打开网页并完成 Turnstile
    |
    +-- 成功：恢复群组默认权限，删除验证消息
    |
    +-- 5 分钟超时：移出成员，删除验证消息
```

## 技术栈

- Cloudflare Workers
- Cloudflare KV
- Cloudflare Turnstile
- Cloudflare Cron Triggers
- Telegram Bot API
- 原生 JavaScript，无运行时依赖

## 部署前准备

你需要：

1. 一个 [Cloudflare 账号](https://dash.cloudflare.com/)
2. Node.js 18 或更高版本
3. 通过 [@BotFather](https://t.me/BotFather) 创建的 Telegram Bot Token
4. 一组 [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile) Site Key 和 Secret Key

Turnstile Widget 的允许主机名必须包含最终访问验证页的域名，例如 `cftgbot.example.workers.dev` 或绑定的自定义域名，否则客户端验证无法正常加载。

## 部署

### 1. 安装依赖并登录

```bash
npm install
npx wrangler login
```

### 2. 创建 KV Namespace

```bash
npx wrangler kv namespace create KV
```

命令会返回 Namespace ID。编辑 `wrangler.toml`，将其填入 KV 绑定：

```toml
name = "cftgbot"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "KV"
id = "你的 KV Namespace ID"

[triggers]
crons = ["*/1 * * * *"]
```

本地开发需要独立预览 KV 时，可创建 preview namespace，并将返回的 ID 配置为 `preview_id`。

### 3. 部署 Worker

```bash
npm run deploy
```

记下 Wrangler 输出的 Worker HTTPS 地址。Telegram Webhook 和 Turnstile 验证页都需要可公开访问的 HTTPS 域名。

### 4. 初始化管理后台

打开 Worker 地址。首次访问会进入 `/setup`：

1. 设置管理员密码
2. 使用密码登录
3. 进入 `/dashboard`

管理员密码设置后不能通过初始化接口覆盖。请妥善保管密码；当前项目未提供邮件找回流程。

### 5. 添加 Bot

在管理后台添加 Bot，并填写：

| 字段 | 说明 |
| --- | --- |
| Bot 名称 | 后台和验证页面显示的名称 |
| Bot Token | 从 `@BotFather` 获取的 Token |
| Turnstile Site Key | Turnstile Widget 的公开 Key |
| Turnstile Secret Key | 服务端验证使用的 Secret Key |
| 管理群组 ID | 可选，多个 ID 用英文逗号分隔；留空表示允许所有群组 |

保存时系统会验证 Bot Token，并自动将 Webhook 设置为：

```text
https://你的 Worker 域名/webhook/<botId>
```

如果后台显示 Webhook 设置失败，请检查 Token、Worker 公网可访问性和 Cloudflare 日志，然后在后台重新设置。

## 配置 Telegram 群组

1. 将 Bot 添加到目标群组
2. 将 Bot 提升为管理员
3. 至少授予“删除消息”和“封禁用户”权限

限制及恢复成员权限、移出超时成员均依赖“封禁用户”权限。Webhook 会订阅 `chat_member` 更新，因此 Bot 必须是管理员才能稳定接收入群成员状态变化。

若启用了群组白名单，请填写 Telegram 的真实 Chat ID。超级群组 ID 通常以 `-100` 开头，例如：

```text
-1001234567890
```

可以将 Bot 临时加入群组后，通过 Telegram Bot API 的更新信息或其他 Chat ID 查询工具获取该 ID。

## 本地开发

```bash
npm run dev
```

常用命令：

```bash
# 检查 Worker 是否可打包，不实际部署
npx wrangler deploy --dry-run

# 部署
npm run deploy

# 查看线上实时日志
npx wrangler tail
```

本地地址无法直接接收 Telegram Webhook。完整联调需要使用可公开访问的 HTTPS 隧道，并将 Webhook 指向隧道地址；仅调试管理后台时不需要 Telegram 回调。

## 路由

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/` | 根据初始化和登录状态跳转 |
| `GET` | `/setup` | 首次设置管理员密码 |
| `GET` | `/login` | 管理员登录 |
| `GET` | `/dashboard` | Bot 管理后台 |
| `GET/POST` | `/verify` | 显示并提交 Turnstile 验证 |
| `POST` | `/webhook/:botId` | 接收 Telegram Update |
| `POST` | `/api/setup` | 初始化管理员密码 |
| `POST` | `/api/login` | 管理员登录 |
| `GET/POST` | `/api/bots` | 查询或添加 Bot |
| `PUT/DELETE` | `/api/bots/:id` | 更新或删除 Bot |
| `POST` | `/api/bots/:id/webhook` | 重新设置 Webhook |

管理 API 由后台登录令牌保护。`/verify` 和 `/webhook/:botId` 是业务所需的公开端点。

## 数据存储

所有数据保存在 `KV` 绑定中，包括：

- 管理员密码摘要和短期登录令牌
- Bot Token、Turnstile Key 和群组白名单
- 待验证成员记录及过期清理队列

本项目无需额外环境变量。Bot Token 和 Turnstile Secret Key 会存入 KV，请限制 Cloudflare 账号及 KV Namespace 的访问权限，不要公开导出数据，也不要将真实凭据提交到 Git。

## 项目结构

```text
.
|-- package.json
|-- wrangler.toml
`-- src
    |-- index.js            # Worker 入口和定时清理
    |-- admin-handler.js    # 管理页面及管理 API
    |-- auth.js             # 密码摘要和登录令牌
    |-- kv.js               # KV 数据访问
    |-- telegram.js         # Telegram Bot API 封装
    |-- turnstile.js        # Turnstile 服务端校验
    |-- verify-handler.js   # 验证页面及提交处理
    |-- webhook.js          # 入群事件和按钮回调
    `-- router.js           # 通用轻量路由器
```

## 故障排查

### 新成员加入后没有验证消息

- 确认 Bot 是群组管理员
- 确认 Bot 有封禁用户和删除消息权限
- 确认该群组在白名单中，或将白名单留空
- 在管理后台重新设置 Webhook
- 使用 `npx wrangler tail` 检查 Worker 错误

### Turnstile 无法显示或始终失败

- 检查 Site Key 和 Secret Key 是否属于同一个 Widget
- 检查 Turnstile Widget 是否允许当前 Worker 或自定义域名
- 确认验证链接使用 HTTPS，且浏览器可以访问 Cloudflare Challenge

### 超时成员没有被移出

- 确认 `wrangler.toml` 中存在每分钟 Cron Trigger
- 确认部署后 Cloudflare Dashboard 中已显示 Cron Trigger
- 确认 Bot 有封禁用户权限
- 检查 Worker 的 scheduled event 日志

## 安全说明

- 管理后台密码、Bot Token 和 Turnstile Secret Key 均属于敏感信息
- 不要把线上 `wrangler.toml` 中的真实资源信息和任何 Token 分享到公共渠道
- 删除 Bot 时会同时删除其 Telegram Webhook
- 建议为 Cloudflare 账号启用多因素认证，并定期检查 Worker 和 KV 权限

## License

MIT