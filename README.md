# DeepSeek Search for FastGPT

使用 [DeepSeek 官方 Search API](https://api-docs.deepseek.com/zh-cn/guides/search/) 搜索网页，返回摘要、来源、评分及可选的网页正文，适用于联网问答和 RAG 工作流。

独立单工具插件，ID 为 `deepSeekSearch`，版本为 `0.1.0`。由社区维护。

## 配置

在 [DeepSeek 开放平台](https://platform.deepseek.com/api_keys) 创建 API Key，在 FastGPT 插件的密钥配置中填写 `apiKey`。密钥字段声明为 `isSecret: true`，无需填写 Base URL。

请求固定发送到 `POST https://api.deepseek.com/v1/tools/search`。搜索词、原始问题和可选的本地化 IP 会发送给 DeepSeek。计费和账号限速以[官方文档](https://api-docs.deepseek.com/zh-cn/guides/search/#计费)为准。

## 输入

| 参数 | 类型 | 必填 / 默认 | 说明 |
| --- | --- | --- | --- |
| `query` | string | 必填 | 1–128 个 Unicode 字符，不能全为空白。 |
| `count` | integer | `10` | 返回条数，范围 1–50。 |
| `oriQuestion` | string / null | 可选 | 触发搜索的原始问题，1–128 个 Unicode 字符；`null` 表示不提供。 |
| `localization` | string | `""` | 用于本地化结果的 IPv4 或 IPv6 地址；留空不指定。 |
| `needContent` | boolean | `false` | 是否返回网页正文；开启后响应可能较大。 |

`query` 支持 `site:`、`-site:`、`lang:`、`after:`、`before:`、排除关键词及引号精确短语，搜索语法原样传递。`oriQuestion` 和 `needContent` 分别映射为 API 的 `ori_question` 和 `need_content`。

```json
{
  "query": "DeepSeek site:github.com OR site:huggingface.co lang:zh after:2025",
  "count": 5,
  "oriQuestion": "有哪些 DeepSeek 开源项目？",
  "needContent": true
}
```

## 输出

返回 `{ "results": [...] }`，顺序与 DeepSeek 搜索结果一致。无匹配结果时返回空数组。

每条结果包含：

| 字段 | 说明 |
| --- | --- |
| `title`, `url` | 网页标题和链接。 |
| `snippet`, `summary` | 用于展示的短摘要、用于模型阅读的长摘要。 |
| `content` | 网页正文；未开启 `needContent` 或正文不可用时为空字符串。 |
| `rerank_score` | 0–3 的相关性评分。 |
| `authority` | 0–4 的网页权威等级，`-1` 表示未知。 |
| `site_name`, `site_icon`, `date` | 站点名称、图标及 UTC 发布时间；未知时为 `null`。 |

## 错误处理

发送请求前校验输入及密钥。请求包含读取响应正文在内最多等待 30 秒；不自动重试。HTTP 错误保留状态码，并对鉴权失败、余额不足、限流等情况给出处理提示。错误中不回显上游响应正文、请求头或底层网络错误。

## 开发与打包

需要 Node.js >=22.18.0 和 pnpm 10.28.2。依赖固定版本，并保留插件自己的锁文件，可脱离社区仓库独立构建。

```bash
pnpm install --frozen-lockfile
pnpm run type-check
pnpm test
pnpm run build
pnpm run check
pnpm run pack
```

安装包为 `deepSeekSearch.pkg`。测试通过模拟 HTTP 接口覆盖成功、参数边界、错误、空结果和超时，不需要真实密钥，不产生 API 费用。

真实调用可在本地创建被 Git 忽略的 `.secrets.local.json`，内容为包含 `apiKey` 的 JSON 对象，然后运行：

```bash
pnpm run debug --run --input '{"query":"DeepSeek API","count":3}' --secrets-file .secrets.local.json
```

请勿提交密钥文件。真实结果、账号权限及服务可用性需要使用有效的 DeepSeek API Key 验证。

## English

This community-maintained FastGPT tool calls the official DeepSeek Search endpoint with a user-supplied `apiKey`. It returns structured results including titles, URLs, short and long summaries, optional page content, relevance scores, authority tiers, and nullable site metadata. Query operators are passed through unchanged. Requests time out after 30 seconds and are not retried automatically. See the [official API reference](https://api-docs.deepseek.com/api/search) for the upstream contract.

## License and logo

Plugin code is licensed under Apache-2.0. The DeepSeek whale logo is from the [DeepSeek documentation favicon](https://api-docs.deepseek.com/zh-cn/img/favicon.svg); DeepSeek names and marks belong to their respective owner.
