# Night Arcana Tarot Web (V1)

暗黑风塔罗抽牌与解读网站实现，包含：
- 三页流程：提问页、抽卡页、解析页
- 问题输入（1-120 字）
- 提问后跳转到独立抽卡页面
- 立体悬浮卡牌环阵与边缘悬停旋转
- 选满三张后自动跳转到独立解析页
- 解析页自动翻牌并展示解读

## 运行方式

```bash
npm start
```

默认地址：[http://localhost:3000](http://localhost:3000)

页面路由：
- `/`：提问页
- `/draw.html`：抽卡页
- `/reading.html`：解析页

开发模式（自动重启）：

```bash
npm run dev
```

测试：

```bash
npm test
```

## 部署到公网

这个项目是一个单进程 Node.js 服务：
- Node 直接提供静态页面
- 同一个进程处理 `/api/*`
- 默认会话存储在内存里

这意味着它很适合先用单机或单容器部署，但暂时不适合直接横向扩容到多实例。

### 方案一：用 Docker 部署到云服务器

这是当前仓库最稳、最省心的方式，推荐优先使用。

1. 准备一台云主机
- 系统推荐 Ubuntu 22.04+
- 开放端口：`80`、`443`
- 如果要先直连测试，也可以临时开放 `3000`

2. 服务器安装 Docker

3. 把项目代码传到服务器后，在项目根目录执行：

```bash
docker build -t tarot-app .
docker run -d \
  --name tarot-app \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e HOST=0.0.0.0 \
  tarot-app
```

如果要启用讯飞星火 AI，再补环境变量：

```bash
docker run -d \
  --name tarot-app \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e HOST=0.0.0.0 \
  -e SPARK_API_PASSWORD="你的 APIPassword" \
  -e SPARK_MODEL="4.0Ultra" \
  -e AI_READING_TIMEOUT_MS="15000" \
  tarot-app
```

4. 验证服务

```bash
curl http://127.0.0.1:3000/healthz
```

返回 `{"ok":true}` 说明服务正常。

5. 用 Nginx 或 Caddy 做反向代理，并配置 HTTPS
- 域名指向你的服务器公网 IP
- 反向代理到 `http://127.0.0.1:3000`
- 证书推荐用 Let's Encrypt

Nginx 反向代理核心配置示意：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 方案二：直接部署到支持 Node 的平台

如果你不想自己维护服务器，可以选 Render、Railway、Fly.io 这类平台。

这类平台的关键点是：
- 启动命令：`npm start`
- Node 版本：`20+`
- 环境变量：按需配置 `SPARK_API_PASSWORD`、`SPARK_MODEL`、`AI_READING_TIMEOUT_MS`
- 健康检查路径：`/healthz`

注意：平台通常会注入 `PORT`，当前服务已经支持读取该变量。

### 域名与 HTTPS

公网可访问至少需要这几步：
- 购买域名
- 把域名 A 记录指向服务器公网 IP
- 配置反向代理
- 配置 HTTPS 证书

如果你使用云平台托管，很多平台可以直接自动签发 HTTPS。

### 当前项目上线前你需要知道的限制

1. 会话存在内存里
- 服务重启后，用户正在进行中的抽牌会话会丢失
- 多实例部署时，请求落到不同实例会导致会话不一致

2. 目前更适合单实例部署
- 现阶段建议 `1 台服务器 + 1 个 Node 进程` 或 `1 个 Docker 容器`

3. AI 能力依赖外部网络
- 如果服务器无法访问讯飞星火接口，系统会自动回退到本地模板解读
- 即使 AI 不可用，网站基本功能仍可访问

### 最小可行上线路径

如果你想最快把它发到公网，建议按这个顺序：

1. 买一台云服务器
2. 用 Docker 跑这个项目
3. 域名解析到服务器
4. 用 Nginx 反代到 `3000`
5. 配 HTTPS
6. 再决定是否接入星火 AI

## 接入讯飞星火 AI 解析

当前项目已经支持在解析页调用讯飞星火对模板结果进行增强。如果未配置星火密钥，系统会自动回退到本地模板解析，不影响网站使用。

推荐通过环境变量配置：

```bash
export SPARK_API_PASSWORD="你的 APIPassword"
export SPARK_MODEL="generalv3.5"
export AI_READING_TIMEOUT_MS="15000"
npm start
```

如果你使用的是 `Spark Ultra-32K`，建议改成：

```bash
export SPARK_API_PASSWORD="你的 Ultra APIPassword"
export SPARK_MODEL="4.0Ultra"
export AI_READING_TIMEOUT_MS="45000"
npm start
```

可选环境变量：
- `SPARK_API_URL`：默认 `https://spark-api-open.xf-yun.com/v1/chat/completions`
- `SPARK_MODEL`：默认 `generalv3.5`
- `AI_READING_TIMEOUT_MS`：默认 `15000`，当模型名包含 `Ultra` 时默认提高到 `45000`

说明：
- 当前实现走的是讯飞星火 HTTP 接口，而不是 WebSocket。
- HTTP 方案需要 `APIPassword`，不是 `APPID / APIKey / APISecret`。
- 如果你已经在聊天或截图里暴露过现有密钥，建议立刻去讯飞控制台重新生成一套新的凭证。

## 接口

### `POST /api/reading/start`
- 入参：`{ "question": "..." }`
- 出参：`{ "session_id": "...", "deck_seed": 12345 }`

### `POST /api/reading/{session_id}/select`
- 入参：`{ "card_id": 1 }`
- 出参：`{ "selected_count": 1, "is_complete": false }`

### `POST /api/reading/{session_id}/reveal`
- 入参：`{}`
- 出参：
  - `cards[3]`：牌名、正逆位、关键词、解释
  - `summary`
  - `risk`
  - `advice`（最多 3 条）
  - `analysis_source`：`spark` 或 `template`

## 前端状态机

- `idle`
- `question_submitted`
- `deck_animating`
- `drawing`
- `draw_complete`
- `revealing`
- `analysis_ready`

## 兼容性与降级

- 桌面端优先（Chrome/Safari/Edge 最新稳定版）
- 支持 `prefers-reduced-motion: reduce` 的动效降级
- 页面刷新或会话失效时显示恢复提示
