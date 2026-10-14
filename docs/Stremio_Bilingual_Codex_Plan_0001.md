# 0001 · Stremio Web 中英双语定制版
## 从 Fork、开发、测试到个人发布的 Codex 执行文档

**文档版本：** 1.0  
**核查日期：** 2026-10-14  
**使用者：** Ethan  
**执行者：** Codex  
**交付目标：** 一个可以实际打开、使用原有插件、查看中英双语影视资料并完成播放验证的独立 Web 版本。  
**当前状态：** 本文是执行规范，不代表已创建仓库、修改代码、构建或部署。文中的新增模块、接口和脚本均为待实现要求；已核查的上游事实标注来源编号。

---

## 0. 直接交给 Codex 的任务指令

请把本文作为这项独立项目的执行规范，从读取上游源码和建立 Fork 开始，完成开发、测试、提交、部署及使用说明，不要只返回一份新的计划。

目标是在 Stremio Web 中，让电影与电视剧的标题、剧情简介同时显示中文和英文。该效果必须覆盖 Cinemeta 和其他能够可靠识别影片的目录，不得要求用户每次切换到 TMDB 专属目录才能看见双语。保留上游的账号、插件、播放、字幕、片库和观看进度机制。

默认采用最小改动方案：**Fork 官方 `Stremio/stremio-web`，保留现有 React 界面与 Rust/WASM 核心，在 React 显示层增加双语资料补充层；用一个 Cloudflare Worker 同源提供静态前端和 TMDB 查询接口；先发布私人预览版，再发布个人稳定版。** 不创建新的播放器，不改 Rust 核心，不接入 Uncut，不购买域名，不先做原生 App。

按本文的阶段顺序执行。缺少 TMDB 凭证、云端权限或用户真实浏览器会话时，继续完成不依赖这些条件的工作，明确报告哪一项受阻，不得把模拟数据、构建通过或 HTTP 200 当成完整成功。只能在实际通过相应检查后标记 PASS（通过）。

本文中的项目名、路径是建议默认值。创建前先检查现有资源，避免覆盖；账号、域名、Worker ID 等必须通过实际环境读取，不能猜测。所有修改仅限本项目及其专属新资源。保留用户原来的 Stremio 安装和现有配置。

---

## 1. 产品目标与第一版范围

### 1.1 用户要看到什么

电影或电视剧卡片显示两种语言的标题，例如英文标题在上、中文标题在下。空间较窄时可采用 `English / 中文` 的文本组合，但两种语言都应可见，不允许只放在鼠标悬停提示中。

详情页显示独立的双语文字标题，以及两段可阅读、可展开的中英文简介。默认标题英文在前、中文在后；简介中文在前、英文在后。保留原有海报、背景图、评分、上映信息及操作按钮。

**双语显示不是切换界面语言，也不是把英文替换成中文。** 两种语言应同时存在；用户应能在设置里关闭增强，立即恢复原版显示。

### 1.2 第一版必须覆盖的页面

| 位置 | 必须达到的效果 |
|---|---|
| 首页及目录卡片 | 进入可视区域后自动补充双语标题，不依赖悬停 |
| Discover（发现） | 列表卡片双语；选中预览里的标题及简介双语 |
| 搜索结果 | 已有结果的标题双语，点击仍进入原有正确影片 |
| 片库及继续观看 | 双语标题，不改变已收藏、已观看和播放进度 |
| 电影详情 | 双语文字标题和完整双语简介 |
| 电视剧详情 | 剧名与剧集总简介双语 |
| 已选中的单集 | 能可靠匹配单集时显示该集双语标题/简介，不用整部剧简介冒充单集简介 |
| 移动端预览/底部面板 | 不能只改桌面组件而漏掉移动端实际使用的展示入口 |

对于上游还有其他影视资料展示位置，例如日历中的单集预览，Codex 必须在扫描后列出是否复用已修改组件。若没有覆盖，应明确写入限制，不得宣称“全局覆盖所有页面”。

### 1.3 第一版不做什么

不重写片源或下载系统，不改字幕匹配，不做双语字幕合成，不翻译资源文件名、编码参数或第三方插件返回的技术说明，不改变演员人名、分辨率、音轨信息及链接目的地。不加入付费 AI、推荐系统、完整中文搜索引擎或复杂数据库。

**“搜索结果能够显示中文”不等于“输入任意中文片名都能搜索到”。** 第一版保留原有搜索逻辑；中文搜索扩展属于后续独立功能，不得混入本次完成声明。

定制只作用于本 Fork 的 Web/PWA 界面。登录同一个 Stremio 账号，并不会让官方电视、手机或桌面客户端也自动获得双语界面。

---

## 2. 已核查的技术基线

截至核查日，上游 Release（发布版本）页面显示最新版本为 `v5.0.0-beta.42`，发布于 2026-10-12，对应提交：

```text
9d1d526591b4c076c7307a1ba9ec056d483f169a
```

第一版建议以这个已发布标签作为可重现基线，而不是每天移动的 `development` 分支。执行时先检查标签仍对应上述提交；如必须更换基线，说明原因并重新记录完整提交号。该版本名称仍含 beta，不应称为经过本项目验证的“稳定上游”。[S01]

| 项目 | 核查结果 |
|---|---|
| 官方仓库 | `Stremio/stremio-web` |
| 上游开发分支 | `development` |
| Node.js 要求 | `>=22` |
| 包管理器要求 | `pnpm >=11`；该标签声明 `pnpm@11.8.0` |
| 开发命令 | `pnpm start` |
| 生产构建 | `pnpm run build` |
| 测试与检查 | `pnpm test`、`pnpm run lint` |
| 打包工具 | Webpack，不是 Vite |
| 生产输出目录 | `build/`，不是 `dist/` |
| 前端路由 | `HashRouter`，保留 `/#/...` 路由 |
| 核心依赖 | `@stremio/stremio-core-web`，无需为本功能自行重编 Rust |

以上来自上游包文件、构建配置与入口源码。[S02][S03][S04]

**两个不得照抄错误的地方：** README 写开发地址为 HTTP，但已核查的 Webpack 配置使用 `server: 'https'`。必须以实际启动输出为准，预计为 `https://localhost:8080`，不要把证书提示误判成代码坏了。也不要使用 `VITE_*` 环境变量配置这个项目。[S03][S05]

上游构建通过 `git rev-parse HEAD` 生成资源路径。因此应在真实 Git 工作目录中构建，并在最终提交后重新构建发布包。不能把较早工作区生成的 `build/` 当成新提交的产物。[S03]

---

## 3. 架构决策

### 3.1 数据与播放分开

```text
Ethan 的浏览器 / 安装后的 PWA
  ├─ 原 Stremio Web 界面
  │    ├─ 原核心 → 原账号、目录、插件、片库、观看状态
  │    └─ 原播放器 → 原片源、字幕、可用的本地播放服务
  │
  └─ 新增双语显示层
       └─ 同源 /api/bilingual/v1/...
            └─ 本项目 Cloudflare Worker
                 ├─ 限定的 TMDB 查询
                 └─ 仅缓存公开影视元数据
```

Cloudflare Worker 同时托管 `build/` 静态文件和小型资料接口。它不接收、保存或转发影片文件，不承担转码，不代理任意第三方 URL，也不保存 Stremio 的账号令牌。[S13]

### 3.2 不覆盖原始资料对象

保留 Stremio 原始 `meta`（影视资料）及其 `id`、`type`、`videoId`、`deepLinks`、动作参数。新建独立的显示数据结构，渲染时读取补充结果。

禁止全局拦截 `fetch`，禁止通过 Service Worker（浏览器缓存服务）篡改插件响应，禁止修改所有目录数据的 `name` 再写回片库，禁止为了显示中文改变片源查询的 ID。

特别注意：已核查的详情页会把原始资料对象交给 `AddToLibrary`（加入片库）操作。应保留这一行为，不能把增强后的展示对象误传进去。[S08]

### 3.3 不依赖插件优先级

无论影片来自 Cinemeta、TMDB 目录还是其他已安装插件，只要取得可靠的影片身份，就可以在显示层补充资料。本项目不要求卸载 Cinemeta，不自动安装、卸载或重排用户插件。

无可靠身份的第三方自定义内容保持原样，这是兼容性边界，不是通过“按名字猜一部电影”来掩盖的问题。

---

## 4. 前置检查与资源边界

Codex 先检查当前目录、Git 状态、系统与工具版本，再开始写入。用户主环境是 Mac；具体 macOS 版本、CPU 架构、Stremio 安装路径以实际读取为准。

```bash
pwd
git status --short 2>/dev/null || true
sw_vers
uname -m
git --version
gh --version
node --version
pnpm --version
```

GitHub 和 Cloudflare 使用用户已经授权的连接或本机登录。只有无法从现有授权确定目标时，才列出需用户完成的操作。不要读取或输出访问令牌，不执行 `gh auth token`，不把带凭证的远程 URL 写入日志。

需要用户提供的外部材料主要是 **TMDB API Read Access Token（接口只读访问令牌）**，以及发布时所需的 Cloudflare 登录/Access 授权。没有真实 TMDB 凭证，仍应完成本地模拟测试，但不能声称在线中文资料已验证。TMDB 的应用级 Bearer（请求头令牌）认证有官方说明。[S12]

资源约束：本项目默认只需要一个 GitHub Fork、两个独立 Worker 实例（预览/个人使用）及各自的 Access 访问控制。不创建 R2、D1、Neon、Firebase、域名或账号级安全策略。不要更改 Uncut 或其他现有项目。

GitHub 对公开仓库的正式 Fork 也是公开的。**私人的使用入口和公开的源码仓库是两回事。** 所以仓库可以公开，但绝不能包含凭证、账号资料、观看记录或私人配置。[S17]

---

## 5. 阶段 A：创建 Fork 与干净基线

### 5.1 仓库和分支

建议 Fork 名称为 `stremio-web-bilingual`；个人发布分支为 `personal-main`；功能分支为 `codex/bilingual-metadata-v1`。保留 `upstream` 指向官方仓库，`origin` 指向用户自己的 Fork。

先检查当前 GitHub 登录身份及该用户是否已经有这个 Fork。若已存在且确为本项目，读取后复用；若同名资源属于其他项目，停止创建步骤并报告冲突，不覆盖或删除。

以下命令仅适用于“目标 Fork 和本地目录均不存在”的首次初始化。不得整段重复执行到现有仓库：

```bash
# 先确认当前 GitHub 登录身份是用户打算使用的账号。
OWNER="$(gh api user --jq .login)"
FORK_NAME="stremio-web-bilingual"

mkdir -p "$HOME/Projects"
cd "$HOME/Projects"

# 创建正式 Fork，随后显式克隆，避免混淆克隆目录。
gh repo fork Stremio/stremio-web \
  --fork-name "$FORK_NAME" \
  --clone=false \
  --remote=false

gh repo clone "$OWNER/$FORK_NAME" "$FORK_NAME"
cd "$FORK_NAME"

# gh 对 Fork 通常会配置 upstream；必须检查结果。
git remote -v

# 防止后续 gh pr create 默认向官方仓库提 PR。
gh repo set-default "$OWNER/$FORK_NAME"

git fetch upstream --tags
BASE_TAG="v5.0.0-beta.42"
git rev-parse "${BASE_TAG}^{commit}"

# 仅在核对提交号且 personal-main 尚不存在后执行。
git switch -c personal-main "$BASE_TAG"
git push -u origin personal-main

# 日常开发放在独立 worktree，主目录保持干净。
git worktree add -b codex/bilingual-metadata-v1 \
  "../stremio-web-bilingual-work" origin/personal-main
```

如果 `upstream` 不存在，核对后再添加官方远程；不要无条件覆盖已存在的远程。GitHub CLI 对 Fork 默认远程及默认 PR 仓库的行为见官方说明。[S16]

### 5.2 在未改功能前跑原版

在新工作目录中读取 `package.json`、锁文件、已有开发规范和 CI。使用其声明的 pnpm 版本，不无故重生成锁文件，不升级全部依赖。已有 pnpm/Corepack 不可用时，通过用户现有 Node 版本管理方式解决；不要默认用 `sudo` 改全局环境。

```bash
cd "$HOME/Projects/stremio-web-bilingual-work"
pnpm install --frozen-lockfile
pnpm run build
pnpm exec jest --runInBand
pnpm run lint
git diff --check
pnpm start
```

上述命令直接使用本项目依赖中的 Jest，避免包管理器转发参数产生歧义。执行时仍应先核对上游实际测试配置。记录原版的测试、构建和 lint 基线。原版已有失败必须与新代码引入的失败区分，禁止删除测试或放宽规则来制造绿色结果。

在真实 Chrome 中确认原版能加载目录、打开一部电影详情和一部剧集详情。先使用访客模式，不自动注册账号或使用用户密码。

**阶段 A 完成标准：** Fork/远程/基线提交明确，原版可构建，浏览器基础页面可运行，原有异常已记录。

---

## 6. 阶段 B：定位真实渲染入口，先完成最小实验

### 6.1 已核查的关键文件

| 文件 | 作用与改动方向 |
|---|---|
| `src/components/MetaItem/MetaItem.js` | 海报卡片的文字标题、提示及相关操作入口 |
| `src/components/MetaPreview/MetaPreview.js` | 资料预览，包括 Logo、文字标题和简介 |
| `src/routes/MetaDetails/MetaDetails.js` | 详情页的影片/剧集/单集数据及动作传递 |
| `src/index.js` | React 入口、HashRouter 和核心 Provider |
| `webpack.config.js` | Webpack、WASM 资源、构建产物和浏览器缓存服务 |

这些是已核查入口，不是“只改这几个文件就一定全部覆盖”的承诺。[S03][S04][S06][S07][S08]

Codex 必须继续搜索这些组件的调用者、移动端预览组件、剧集列表以及实际设置页。用 `rg` 定位，不要根据本文猜测不存在的文件名：

```bash
rg -n 'MetaItem|MetaPreview|MetaPreviewSheet' src
rg -n 'video\.overview|description|episode|season' src/routes
rg -n 'localStorage|useSettings|Settings' src
rg -n 'service-worker|GenerateSW|Workbox|WebUpdateScreen' src webpack.config.js
```

已核查的 `MetaItem` 并没有明确声明通用影片 `id` 属性。应从拥有真实数据的调用方显式传入新的身份属性，不要把卡片标题当 ID，也不要默认 `dataset` 或 URL 中一定有完整身份。新增属性必须在组件中被消费，不能泄漏为无效 HTML 属性。[S06]

### 6.2 Logo 是必测项目

`MetaPreview` 在存在 `logo` 时会渲染图片，只在缺失或失败时显示文字标题。因此，仅仅替换 `name` 很可能无法让用户看见中文。[S07]

双语模式下增加始终可见的文字标题区。Logo 可以保留为装饰，但不得成为唯一标题；不要改海报颜色、背景图或整体设计。关闭增强后，原始布局和行为应恢复。

### 6.3 最小实验要求

先使用少量测试数据打通一个电影详情页和一个剧集详情页，再接入真实 TMDB。必须证明：原资料仍可显示；新增中英文标题均可见；简介是两个独立区块；原片源列表和链接不变；双语接口失败时页面仍可使用。

使用合成测试文本，不把开发期间伪造的简介当真实影视数据发布。测试标记只能存在于测试环境和测试夹具中。

**阶段 B 完成标准：** 显示方案得到真实页面验证，且未修改核心数据/动作；随后才铺开所有页面。

---

## 7. 阶段 C：实现 TMDB 双语资料服务

### 7.1 数据来源与查询流程

电影与电视剧分别处理。对于 IMDb ID，调用 TMDB `/find/{external_id}?external_source=imdb_id`，从符合类型的结果中选择匹配项；不能简单使用响应里的第一个结果。[S09]

取得 TMDB ID 后，分别请求：

```text
电影：
GET /3/movie/{tmdbId}?language=en-US
GET /3/movie/{tmdbId}?language=zh-CN

电视剧：
GET /3/tv/{tmdbId}?language=en-US
GET /3/tv/{tmdbId}?language=zh-CN
```

电影标题通常读取 `title`，电视剧读取 `name`；简介读取 `overview`。支持语言参数不代表每部作品都一定有相应翻译。[S10][S11]

第一版默认简体中文 `zh-CN`。配置结构可预留 `zh-TW`，但没有实测前不要展示一个实际不起作用的繁体选项。不自动把台湾或香港译名冒充大陆译名。

### 7.2 身份识别规则

支持标准 IMDb 标识以及在当前实际插件中验证过的 TMDB 标识格式。对 `tmdb:123` 之类标识，必须结合明确类型；不能把裸数字一概认为 TMDB ID。

未知 ID、缺失 ID、直播频道、YouTube 或其他自定义内容保持原样。第一版不使用模糊片名搜索自动绑定影片，也不让 AI 猜 ID。

同一 ID 的 `movie` 和 `series` 必须隔离缓存。不得改变 Stremio 原本用于查询片源、字幕或单集的 ID。

### 7.3 单集处理

按父剧集身份和实际 `season`、`episode` 匹配。可在用户展开某一季时获取该季中英文资料，避免一口气请求所有季、所有集。[S11]

`season=0` 是可能存在的特别篇，不得用真假值判断误删。动漫、特别篇或不同数据库的季集编号对不上时，退回原资料，不强行对应。

已核查的详情页会优先展示选中单集的 `video.overview`。增强层必须知道当前显示的是“整部剧”还是“某一集”，防止把整部剧简介显示在单集简介位置。[S08]

### 7.4 建议接口契约

下面是本项目新增接口，**不是上游已有 API**：

```text
GET /api/health
GET /api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN
GET /api/bilingual/v1/season?type=series&id={parentId}&season=1&zh=zh-CN
```

优先实现有限数量的单对象请求和共享队列，不为第一版强行设计大型批处理接口。下列结构是建议契约；允许按现有代码风格调整，但需要保留字段来源、缺失状态和原始身份：

```typescript
type SupportedType = 'movie' | 'series';

type LocalizedText = {
  text: string | null;
  requestedLocale: string;
  effectiveLocale: string | null;
  source: 'tmdb' | null;
  status: 'available' | 'missing' | 'unverified-fallback';
};

type BilingualMeta = {
  schemaVersion: 1;
  identity: {
    stremioType: SupportedType;
    stremioId: string;
    tmdbId: number | null;
  };
  matchStatus: 'matched' | 'unmatched' | 'unsupported';
  title: { en: LocalizedText; zh: LocalizedText };
  overview: { en: LocalizedText; zh: LocalizedText };
  fetchedAt: string;
};
```

这里没有把原插件简介发给 Worker 的要求。原始资料留在前端用于退回显示，减少额外数据传输。

有效但无法匹配的身份可返回 HTTP 200 与 `unmatched`。参数无效返回 400；依赖不可用返回 503；上游失败按实际类型返回 502/504；命中限流返回 429。所有进入本 Worker 的 API 错误都应返回结构化 JSON，不返回网页。

### 7.5 翻译缺失与重复文本

`original_title` 和 `original_name` 指原语言名称，**不等于英文名称**。日语电影的原名不能被贴上“English”标签。

中英文标题相同可以合并显示一份，不能为了形式凑出两个一样的标题。中文请求如果实际返回英文兜底内容，也不能将其标成已完成中文翻译。

简介按字段独立退回：缺中文时保留已有英文和原简介，并给出低干扰的缺失提示；缺英文时显示现有中文/原简介。不显示 `undefined`、不等待无限加载、不自动编造内容。对于无法判断语言的原插件内容，标为“原始简介”，不强行标注英文。

### 7.6 缓存、并发和限流

先使用前端内存缓存和 Worker Cache API；第一版不强制引入持久数据库。建议初始缓存策略是成功结果 24 小时、确实未匹配结果 30 分钟；超时及 5xx 不长期缓存。这是本项目初始参数，不是 TMDB 官方建议，需要符合执行时有效的数据使用条款。

缓存键至少包括协议版本、身份类型、ID、中文地区和资料粒度。单集或季资料必须加季集维度。客户端同一个键的并行请求合并为一个任务。

前端仅为可视卡片及少量相邻卡片加载资料；默认最多 4 个并发元数据任务，详情页优先。后台对 TMDB 请求设超时和有限重试；尊重 429 与重试等待，不在每次组件重渲染时重复查询。TMDB 明确存在限流，不能把阈值当作固定不变的服务承诺。[S12]

Cloudflare Access 负责私人入口控制，不能用 CORS（跨域访问限制）或前端隐藏按钮替代身份保护。缓存只存规范化的公开影视资料，不能缓存账号会话、Access 登录页面或用户请求头。[S15]

---

## 8. 阶段 D：完成前端双语显示与设置

### 8.1 建议新增模块

按现有模块导出、样式和测试方式组织。以下为职责建议，不是已存在的路径：

```text
src/ 现有目录下的 bilingual 模块
  identity                 身份解析及类型校验
  client                   请求、错误处理、请求合并
  cache                    内存缓存及过期逻辑
  useBilingualMetadata     供页面调用的数据 Hook
  settings                 本地显示偏好
  BilingualTitle           双语标题组件
  BilingualOverview        双语简介组件

worker/
  index.ts                 API 路由与静态资源入口
  tmdb.ts                  固定域名的 TMDB 查询
  metadata.ts              数据规范化、匹配与来源标记
  cache.ts                 公开资料缓存
  tests/                   Worker 测试
```

避免一次把上游全部改成 TypeScript 或新建大型状态管理系统。上游 JS/TS、LESS 的现有使用方式应保留。新增 Worker 的类型检查需要单独可执行，不能因为 Webpack 能打包就认定类型正确。

### 8.2 设置项

新增“影视资料双语显示”设置，默认开启。提供关闭开关、标题顺序、简介顺序，以及“清除双语资料缓存”。偏好只保存到本域名的本地存储；不能改写 Stremio 的云端用户 schema（数据结构）。

关闭功能后，应停止发起新请求并恢复原版显示。清缓存只操作本功能自己的命名空间，不清除账号登录、插件配置、观看进度或其他浏览器存储。不同设备不会自动同步这组新偏好，使用说明中需写明。

### 8.3 页面行为

先显示原资料，再补充双语，不让译文请求阻塞海报、目录、片源或播放。切换影片、语言设置或快速滚动时，必须防止旧请求结果写到新影片上。

卡片的标题、无障碍名称和文字提示保持一致；不修改点击目标、键盘导航、菜单动作、播放按钮或已观看标记。长标题应截断并可查看完整文本，但不能永远把第二语言裁没。

详情简介允许分别展开。移动端、桌面和紧凑预览都需要检查；不能只往一个组件塞两段文字后让布局溢出。

新增 Hook 必须遵守 React 调用规则，不能被放进现有条件返回之后。多个页面共享请求服务，避免每个组件各自维护一份互不一致的查询实现。

### 8.4 内容和隐私安全

影视资料按文本渲染，不用 `dangerouslySetInnerHTML` 插入外部简介。新增 Worker 不接收 Stremio 密码、认证令牌、插件私密安装地址或观看记录。

不将 TMDB 凭证放到浏览器、Webpack 环境替换、仓库、截图、日志或 source map（源码映射文件）中。保留上游账号与 API 的正常使用方式，不新建账号代理。原项目的监控配置需审核，不额外向上游或第三方发送新增私有诊断数据。[S03][S04]

**阶段 D 完成标准：** 目标页面实际覆盖、双语开关有效、失败可退回、所有原业务身份和动作保持不变。

---

## 9. 阶段 E：本地端到端验证

### 9.1 凭证放置

本地凭证放在未提交的 `.dev.vars` 中，并通过 Worker 读取。Cloudflare 官方支持这种本地开发方式，不得放在 `wrangler` 的公开 `vars` 中。[S14]

先确认 `.gitignore` 忽略 `.dev.vars*`、私有 `.env*`、`.wrangler/` 和私密测试输出；只允许不含值的示例文件例外。

可以让用户在本机执行下面的安全输入脚本。它不会把值写进命令行或终端输出，已有文件会被拒绝覆盖：

```bash
python3 - <<'PY'
import getpass
import json
import os
from pathlib import Path

path = Path('.dev.vars')
if path.exists():
    raise SystemExit('.dev.vars 已存在；请保留并使用现有安全配置。')
token = getpass.getpass('输入 TMDB API Read Access Token：').strip()
if not token:
    raise SystemExit('未输入令牌，未创建文件。')
fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w', encoding='utf-8') as handle:
    handle.write('TMDB_READ_TOKEN=' + json.dumps(token) + '\n')
print('已创建本地凭证文件，内容未显示。')
PY
```

没有安全交互终端或凭证管理渠道时，Codex 不应把秘密输入步骤转成聊天明文索取。

### 9.2 用接近部署环境的方式测试

在实现 Worker 配置并锁定 Wrangler 版本后：

```bash
pnpm run build
pnpm exec wrangler dev \
  --config wrangler.preview.jsonc \
  --ip 127.0.0.1 \
  --port 8787 \
  --var BILINGUAL_METADATA_ENABLED:true
```

本地集成测试默认访问启动命令实际显示的地址，通常是 `http://127.0.0.1:8787`。这是 Worker 同源预览，和上游 Webpack 的 HTTPS 开发服务器是两条不同路径。不要把两者端口/协议混写。[S18]

日常快速开发可以使用 `pnpm start`，但需要 Codex 明确配置同源 API 的开发代理。生产模式仍使用相对路径 `/api/...`，不能把 `localhost:8787` 打进发布包。没有必要为了这一点换掉 Webpack。

### 9.3 自动化与真实浏览器

新增测试应覆盖身份解析、双语数据规范化、缓存隔离、缺失字段、API 超时、限流、非法输入、单集匹配及显示开关。沿用上游已有测试工具，不要建立重复的大型测试框架。

真实运行验证以用户 Mac 上正常的 Chrome 会话为准，使用执行环境实际可用的浏览器自动化工具。没有该能力时提供明确的人工验收步骤。无头浏览器测试可以补充，但不能用它冒充用户真实设备的账号登录或本地播放服务测试；不导出浏览器 cookie/session/storageState（会话存储快照）。

若没有真实浏览器控制能力，输出 `REAL_BROWSER_VERIFICATION_BLOCKED` 并交付已完成代码与可复现步骤；不能伪造截图或 PASS。

### 9.4 必须执行的测试矩阵

| 检查 | 通过条件 |
|---|---|
| Cinemeta 电影 | 不换插件，仍出现双语标题/简介 |
| 其他目录中的同一影片 | 指向相同身份，双语一致且不重复请求 |
| 有 Logo 的详情页 | 仍有可见的双语文字标题 |
| 搜索、发现、片库、继续观看 | 每个位置都有实际检查证据 |
| 电视剧与选中单集 | 不混淆整剧简介和单集简介 |
| 特别篇 season 0 | 不因真假值判断被误处理 |
| 无中文、无英文、两边都缺 | 退回明确，不卡住页面 |
| 未知插件 ID、直播内容 | 保留原显示，不错误匹配电影 |
| 长标题、中文标点、移动端窄屏 | 第二语言可见，按钮不被挤出 |
| 快速切换页面/语言 | 无上一部影片数据串入 |
| 关闭双语 | 原版表现恢复，停止新增查询 |
| 元数据 API 断开/返回 429 或 5xx | 原资料和播放入口仍可用 |
| 连续滚动目录 | 并发有界，不请求整库所有影片 |
| Access 会话过期 | 不把登录 HTML 当 JSON，提示重新进入应用 |
| 加入片库/取消、已观看切换 | 原 ID、原动作保持正确 |
| 播放、暂停、拖动进度、选择字幕 | 使用有权访问的真实测试视频完成验证 |
| 热更新后的旧浏览器标签/PWA | 不出现旧 JS 搭配新资源的永久白屏 |
| 账号、令牌和构建包检查 | 无新增秘密泄漏 |

影片样本可使用熟悉的电影和电视剧，具体身份通过 TMDB 响应核对后记录。电影资料能查询，不代表已经取得影片播放权限或可用片源。

---

## 10. 阶段 F：配置 Cloudflare 托管

### 10.1 只增加必要的发布依赖

在基线构建完成后，再加入一个经核查并锁定版本的 Wrangler 开发依赖和必要 Worker 类型/测试依赖。不要在每次发布时无条件运行 `wrangler@latest`，不要初始化一个全新 React/Vite 工程替换本 Fork。

新增 `wrangler.preview.jsonc` 与 `wrangler.personal.jsonc`。二者指向相同代码和 `build/`，但 Worker 名不同。以下是**首次安全启动用的预览配置模板**：

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "stremio-bilingual-preview",
  "main": "worker/index.ts",
  "compatibility_date": "2026-10-14",
  "workers_dev": true,
  "preview_urls": false,
  "assets": {
    "directory": "./build",
    "binding": "ASSETS",
    "run_worker_first": ["/api", "/api/*"]
  },
  "vars": {
    "BILINGUAL_METADATA_ENABLED": "false"
  }
}
```

个人配置默认名称为 `stremio-bilingual-personal`。创建前确认这些名称没有被其他项目使用；账户 ID、真实 URL 和版本 ID 从部署结果读取，不预先编造。

模板不是完整业务代码。Codex 必须实现路由分发、参数校验、TMDB 请求、缓存与错误返回后再使用。`BILINGUAL_METADATA_ENABLED` 是字符串，必须以 `=== 'true'` 等明确方式解析，不能把字符串 `'false'` 当真值。

### 10.2 路由与静态资源

保留 HashRouter，所以第一版通常无需开启无条件 SPA（单页应用）回退。API 由 Worker 先处理，其他请求交给 `env.ASSETS.fetch(request)`。[S04][S13]

不得把 `/api/...`、不存在的 `.js` 或 `.wasm` 请求一律返回 `index.html`。缺失资源应该真实失败，不能给出 HTTP 200 的 HTML 冒充 JavaScript 或 JSON。

检查构建中的 Web Worker、WASM、样式和 manifest 均有正确路径与 MIME（内容类型）。WASM 文件应作为二进制资源提供。保持上游提交号目录结构，不能随意把资源扁平化。

`index.html`、manifest 和浏览器缓存服务的更新策略要能及时取得新版本。带提交号的静态资源可长期缓存，但发布前必须确认同一资源 URL 不会被不同内容覆盖。

### 10.3 浏览器缓存服务与登录

上游生产构建会生成浏览器缓存服务，并包含更新逻辑。保留其机制，审核新增 API 不被缓存页面回退拦截，不缓存登录、认证响应或错误页。[S03][S04]

不要为了处理一个旧缓存问题而清除用户整个浏览器配置。需要恢复时只操作本项目域名和本项目缓存，尽量保留账号及插件状态。

对 Access 拦截导致的重定向或非 JSON 响应，前端先检查状态、重定向与内容类型，再决定是否解析。不要让 `Unexpected token '<'` 导致页面永久加载。

---

## 11. 阶段 G：提交、预览发布与个人上线

### 11.1 先提交，再从干净目录构建

每个有意义的阶段完成后做限定范围提交。不得 `git add .` 或 `git add -A`，不得从有无关修改的工作区发布。建议阶段提交分别覆盖双语服务、UI 接入、测试及部署配置。

PR 必须明确指向用户自己的 Fork，不默认发给 Stremio 官方：

```bash
# 文件名按实际修改白名单填写，不要照抄不存在的文件。
git status --short
git diff --stat
git diff --check

git add <本阶段实际修改的文件白名单>
git commit -m "feat: add bilingual movie and series metadata"
git push -u origin codex/bilingual-metadata-v1

gh pr create \
  --repo "$OWNER/stremio-web-bilingual" \
  --base personal-main \
  --head codex/bilingual-metadata-v1 \
  --title "Add bilingual metadata to the personal web client" \
  --body-file <实际存在的PR说明文件>
```

上面的尖括号是待 Codex 替换的参数说明，不可原样交给 shell 执行。最终 README 必须给出无需占位符猜测的实际命令。

检查通过后合入个人分支。第一次可以保持轻量 CI：构建、现有检查和新增关键测试；不复制上游所有自动发版、翻译、部署或计费工作流，不开启所有推送自动上线。

发布应读取合并后的完整提交号，创建新的干净 detached worktree（分离发布工作目录），然后重新安装锁定依赖、检查、构建。不要把功能分支合并前的旧 `build/` 直接部署。

以下命令要求先把本次已检查、已合并的完整提交号设为 `APPROVED_SHA`；不能直接把未知的最新提交当作已批准版本。该变量只包含公开 Git 提交号，不是凭证：

```bash
# 在本项目仓库内执行，先按本次实际验收记录设置 APPROVED_SHA。
: "${APPROVED_SHA:?请先设置本次已检查并合并的完整提交号}"
git fetch origin personal-main
RELEASE_SHA="$(git rev-parse "${APPROVED_SHA}^{commit}")"
git merge-base --is-ancestor "$RELEASE_SHA" origin/personal-main || exit 1
RELEASE_DIR="$HOME/Projects/stremio-bilingual-release-$RELEASE_SHA"

# 目录已存在时先检查，不删除重建，不覆盖已有工作区。
if [ -e "$RELEASE_DIR" ]; then
  printf '%s\n' '发布目录已存在，请检查并复用正确目录，或选择新目录。'
else
  git worktree add --detach "$RELEASE_DIR" "$RELEASE_SHA"
fi
```

进入该发布目录后，确认 HEAD 与 `RELEASE_SHA` 一致、`git status --porcelain` 无输出，再执行下节构建。部署前再次检查没有新增源码差异；不能在这个发布目录临时改一行代码然后跳过提交。

### 11.2 先启动无凭证、功能关闭的预览实例

从干净已提交源码执行：

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm exec wrangler deploy --config wrangler.preview.jsonc --dry-run
pnpm exec wrangler deploy --config wrangler.preview.jsonc
```

首次部署时模板里的功能开关保持 `false`，且不上传 TMDB 凭证。接口应返回可识别的“未启用”状态，不访问 TMDB。

### 11.3 给这一个 Worker 开启私人访问

在 Cloudflare 中选择**这个预览 Worker**，进入 Access，保护其所有流量，并设置仅允许 Ethan 的已验证身份。具体邮箱从本人确认或现有正确的账户信息读取，不能猜。

**禁止点击“Protect all Workers”改变整个账号的访问策略。** 只保护本项目的预览和个人 Worker，不影响其他应用。Cloudflare 当前提供单 Worker 级别保护，覆盖其关联入口；静态资源和 API 都需要在匿名测试中验证。[S15]

先检查匿名用户确实不能访问，再上传凭证。若缺少 Access 管理权限，保持功能关闭且无凭证，继续交付本地版本，不发布一个人人都能消耗 TMDB 配额的接口。

### 11.4 安全设置 Secret，再启用双语服务

```bash
pnpm exec wrangler secret put TMDB_READ_TOKEN \
  --config wrangler.preview.jsonc
```

通过安全提示输入或授权的秘密管理渠道提供值，禁止把值直接写在命令参数里。**`wrangler secret put` 会创建新版本并立即部署，属于线上变更，不是单纯写入配置。** 必须针对正确 Worker，并记录这次操作。[S14]

确认 Access、Secret 和接口安全边界后，把预览配置开关改成 `true`，提交，再从该新提交干净构建/部署。凭证不跟随公开配置提交。

### 11.5 预览验收不能只看首页 200

完成 Access 登录后，检查首页、真实目录、电影/剧集详情和双语请求。确认浏览器实际加载了最新提交对应的资源，不是旧缓存。

认证后的 `/api/health` 返回 JSON；认证后的未知 `/api/...` 返回 JSON 404；没有权限时 Access 返回的登录跳转或 403 是外层保护行为，不应误判为业务接口的 SPA 回退。

为同一个上游片源比较 Fork 前后请求的影片/剧集身份，确认没有因双语层改变。运行完整测试矩阵中的核心项并保留脱敏证据。

### 11.6 发布个人稳定入口

预览通过后，用 `wrangler.personal.jsonc` 建立个人 Worker，按相同顺序处理：首次关闭功能且无凭证部署 → 单 Worker Access 保护 → 验证匿名拦截 → 设置 Secret → 提交启用配置 → 干净构建发布。

最终启用个人配置后产生的新提交，应先在预览环境再验证一次，之后让个人环境使用同一提交产物。不得在个人上线时偷偷夹带未验证的新功能。

返回实际部署生成的 HTTPS URL；不需要先买域名或绑定 Uncut 域名。可创建 `bilingual-v0.1.0` 标签指向已验收提交，供维护和回滚使用。

---

## 12. Ethan 最后怎么用

### 12.1 主要使用方式：浏览器与 PWA

打开最终个人 HTTPS 地址，先完成私人入口的 Access 登录，再通过 Stremio 原有登录页面登录自己的账号。账号登录和 Access 登录不是同一层认证。

检查已有插件、片库和观看状态是否正常读取。不要为了测试而重置插件列表。上游具备账号同步和可安装 PWA 能力，但 Fork 域名下的首次登录与现有账号兼容性仍必须实际验证。[S05]

使用 Chrome 提供的安装入口将该网站安装成独立窗口。给 manifest 的显示名称加上清晰的双语/个人版标识，避免和官方客户端混淆。实际是否出现安装入口以及安装后的行为，以用户浏览器验证为准。

打开本版本的双语设置，确认开启。以后应从该网址或安装后的 PWA 进入，而不是官方 Web 地址。

### 12.2 播放能力必须单独验证

**部署 Web 前端不等于部署了完整播放服务。** 官方说明 Stremio Web 独立运行受浏览器媒体支持限制；Stremio Service 或正在运行的桌面客户端可以提供配套本地服务。[S19]

在 Ethan 的 Mac 上优先复用已经运行的官方桌面服务；没有可用服务再使用官方 Stremio Service。不要同时启动多个抢占端口的服务，不自动安装一个未经核查的第三方替代后端。

在定制版设置里检查实际 Streaming Server（播放服务）状态为 Online，并使用当前服务实际公布/配置的地址。不要猜端口，也不能把本机 `localhost` 地址当作其他设备能访问的服务器地址。

自定义 HTTPS 域名连接本机服务可能遇到局域网访问许可、CORS、证书或协议问题。Chrome 对本地网络请求有权限限制，Codex 必须在真实浏览器里验证，不得靠关闭浏览器安全功能解决。[S20]

用用户有权访问的视频验证播放、暂停、拖动、音轨和字幕。能看见“Online”仍不代表所有编码格式都能播放。视频测试失败时，应区分“上游本来不支持”“本机服务不可达”“Fork 引入退化”，不能一概归咎于双语代码。

第一版不保证 iPhone、Apple TV 或其他设备访问 Mac 本地服务。跨设备播放、远程服务和额外原生包装都不属于本次默认范围。

### 12.3 可选：让桌面壳打开定制界面

官方旧 Qt 壳的 README 确实列出 `--webui-url=` 参数，但不能因此保证 Ethan 当前安装的 macOS 客户端支持相同参数和通信接口。[S21]

这是可选验证，不是 Web 交付的前置条件。Codex 先识别实际安装版本、可执行文件和参数支持；验证可用后，才提供该设备对应的启动命令。命令可能形如：

```bash
# 仅在确认当前客户端支持这个参数之后使用。
# PERSONAL_URL 必须是部署时实际返回的 HTTPS 地址。
open -a "Stremio" --args "--webui-url=${PERSONAL_URL}"
```

已运行的应用可能不接受新参数，应提示用户正常退出后再启动；不要强制结束其正在播放的进程。验证失败就继续使用 PWA，不为此默认重编 Qt/Rust、修改官方安装包、禁用系统安全机制或申请 Apple 开发者证书。

---

## 13. 回滚与后续更新

### 13.1 三层恢复方式

最轻恢复：在设置里关闭双语显示，继续使用原资料。若整个 Fork 不可用，直接回到用户原来的官方 Stremio，原安装不应被本项目破坏。

服务端恢复：将双语服务开关关闭，经过记录后部署，客户端自动退回原资料。此操作不能清除片库或账号信息。

版本恢复：使用预先记录的、属于该个人 Worker 的已验证 Version ID（版本标识）回滚：

```bash
pnpm exec wrangler rollback "$PREVIOUS_GOOD_VERSION_ID" \
  --config wrangler.personal.jsonc
```

回滚是立即生效的部署操作。必须先核对 Worker 名称和版本归属；不能使用未经记录的 ID，也不建议省略 ID 让工具自动猜上一版。[S18]

回滚后重新检查资源加载、双语接口、Access 和 PWA 更新。Worker 代码回滚不是 Git、Access 策略、秘密轮换与浏览器缓存的统一回滚，需分别确认。必要时从已验证标签重新干净构建部署，仍不得清空用户全部浏览器存储。

### 13.2 跟进上游

首次完成后，维护自己的 `personal-main`，不要把其硬重置成上游分支。

更新步骤：`git fetch upstream --tags` → 阅读新发布说明 → 从个人分支建立更新分支 → 合并选择的上游标签 → 处理双语层冲突 → 运行测试矩阵 → 预览 → 个人发布。不要自动跟随上游每一次开发提交。

优先把双语逻辑集中在独立模块，减少上游更新冲突。每次更新尤其复查 MetaItem/MetaPreview 调用链、单集简介、Logo、WASM 资源路径、播放器和缓存服务。

---

## 14. AI 补译只作为后续独立阶段

第一版先用 TMDB 已有多语言资料，缺失就明确退回，不把 AI 当成上线前提。

后续若要补译，可以在服务器上为缺失字段加入可关闭的模型调用：只翻译现有简介、不创作额外情节；缓存与输入文本版本绑定；标识“AI 翻译”；限制调用预算；不能把机翻片名冒充正式发行译名，也不能拿原语言标题自动充当英文标题。

不新增 AI 凭证、不启用计费模型、不接入 Agent 平台，除非用户另行授权这一阶段。本次不应出现“为了双语片名先搭一个多智能体系统”的扩展。

---

## 15. 许可证、数据署名和发布边界

保留上游 GPL-2.0 许可、版权及相关声明。修改后的文件按许可要求记录修改信息；不要给整个衍生客户端改成 MIT 或专有许可。分发构建产物时提供相应版本可获得的完整源代码、构建说明及许可。[S22]

公开托管的前端会向浏览器发送 JavaScript，不能以“只是一个网页”为由省略客户端源码和许可处理。最直接的做法是在 About（关于）中链接本 Fork 与对应发布版本，并明确不是 Stremio 官方发布；具体对外商业分发仍需核对完整适用条款。

TMDB 要求相应数据署名、批准的标识及指定声明。Codex 按执行时的官方要求在 About/Credits（关于/致谢）中落实，不冒称得到 TMDB 官方认证。其非商业使用条件与商业授权应分别看待，不能由“能拿到 API Key”推出“任何商业用途都免费”。[S12]

本项目只改变资料呈现，不提供新影视资源、绕过付费限制或预装未经用户授权的片源。测试使用用户有权访问的内容。

---

## 16. 最终交付清单与验收报告

Codex 最终需要交付：Fork 地址、个人分支及完整提交号、上游基线、已合并 PR、实际个人访问 URL、预览 URL、各 Worker 的版本/部署标识、启动/构建/发布/回滚命令，以及真实浏览器的验证结果。

仓库内至少保留简明的本项目 README、本文或对应任务规范、脱敏的最终验收记录。不要为一个个人 Fork 建几十份互相矛盾的架构文档。

建议新增统一脚本 `test:bilingual`、`typecheck:worker`、`verify:personal`，但**这些脚本现在并不存在**，必须由 Codex 实现后才能在报告里列为已运行。总验证脚本应明确编排实际存在的构建、测试、检查和 Worker 部署预检。

最终报告使用下列格式，并填真实结果：

```text
项目：Stremio Web Bilingual
上游标签与完整提交：
Fork / 个人分支 / 完整提交：
预览地址：
个人地址：
Cloudflare 账户与 Worker：只列非秘密标识
部署 Version ID / Deployment ID：

构建：PASS / FAIL
原有测试：PASS / BASELINE_FAILURE / FAIL
新增双语测试：PASS / FAIL
新增 Worker 类型检查：PASS / FAIL
真实 Chrome 双语显示：PASS / BLOCKED / FAIL
原账号与插件兼容：PASS / BLOCKED / FAIL
Mac 实际播放及字幕：PASS / BLOCKED / FAIL
PWA 安装与更新：PASS / BLOCKED / FAIL
匿名访问拦截：PASS / FAIL
秘密泄漏检查：PASS / FAIL
Git 工作区：CLEAN / DIRTY

已覆盖页面：
明确未覆盖页面或 ID 类型：
需用户操作的剩余步骤：只列无法代做的具体步骤
回滚命令与已验证目标版本：
```

**完整成功的定义：** 用户能打开自己的入口、登录、看到真实的中英双语资料，并在目标 Mac 上完成有权限内容的播放与字幕验证。没有登录条件或播放环境时，可以交付“代码完成/部署完成”，但整体状态必须标为 PARTIAL（部分完成），不能宣称已经完整可用。

---

## 17. 官方核查来源

以下来源用于锁定上游事实和基础设施约束。项目架构、字段契约、缓存参数和阶段安排是本文提出的实现方案，不是官方已提供的双语功能。执行时应以锁定提交的文件及当前有效服务条款为准。

**[S01] Stremio 发布版本和基线提交。**  
`https://github.com/Stremio/stremio-web/releases`  
`https://github.com/Stremio/stremio-web/commit/9d1d526591b4c076c7307a1ba9ec056d483f169a`

**[S02] 锁定标签的包管理器、脚本和运行环境。**  
`https://raw.githubusercontent.com/Stremio/stremio-web/v5.0.0-beta.42/package.json`

**[S03] Webpack、build 输出目录、HTTPS 开发服务器和资源构建。**  
`https://raw.githubusercontent.com/Stremio/stremio-web/v5.0.0-beta.42/webpack.config.js`

**[S04] HashRouter、React/Core Provider 和应用入口。**  
`https://raw.githubusercontent.com/Stremio/stremio-web/v5.0.0-beta.42/src/index.js`

**[S05] 上游 README：架构、PWA、账号同步与开发说明。**  
`https://github.com/Stremio/stremio-web`  
`https://raw.githubusercontent.com/Stremio/stremio-web/development/README.md`

**[S06] MetaItem 卡片组件。** 核查了 development 文件；实际实施需对照锁定标签复核。  
`https://raw.githubusercontent.com/Stremio/stremio-web/development/src/components/MetaItem/MetaItem.js`

**[S07] 锁定标签的 MetaPreview：Logo 与文字/简介显示。**  
`https://raw.githubusercontent.com/Stremio/stremio-web/v5.0.0-beta.42/src/components/MetaPreview/MetaPreview.js`

**[S08] 锁定标签的 MetaDetails：片库动作与单集简介优先。**  
`https://raw.githubusercontent.com/Stremio/stremio-web/v5.0.0-beta.42/src/routes/MetaDetails/MetaDetails.js`

**[S09] TMDB 外部 ID 查询。**  
`https://developer.themoviedb.org/reference/find-by-id`

**[S10] TMDB 语言、电影和电视剧资料。**  
`https://developer.themoviedb.org/docs/languages`  
`https://developer.themoviedb.org/reference/movie-details`  
`https://developer.themoviedb.org/reference/tv-series-details`

**[S11] TMDB 季与单集多语言资料。**  
`https://developer.themoviedb.org/reference/tv-season-details`  
`https://developer.themoviedb.org/reference/tv-episode-translations`

**[S12] TMDB 认证、限流、署名与非商业使用条件。**  
`https://developer.themoviedb.org/docs/authentication-application`  
`https://developer.themoviedb.org/docs/rate-limiting`  
`https://developer.themoviedb.org/docs/faq`

**[S13] Cloudflare Worker 静态资源及 Worker 优先路由。**  
`https://developers.cloudflare.com/workers/static-assets/`  
`https://developers.cloudflare.com/workers/static-assets/routing/worker-script/`

**[S14] Cloudflare Secret、本地 .dev.vars 和设置 Secret 的部署行为。**  
`https://developers.cloudflare.com/workers/configuration/secrets/`

**[S15] Cloudflare 单 Worker 的 Access 保护及边界。**  
`https://developers.cloudflare.com/workers/configuration/cloudflare-access/`

**[S16] GitHub CLI 的 Fork、克隆和默认远程行为。**  
`https://cli.github.com/manual/gh_repo_fork`  
`https://cli.github.com/manual/gh_repo_clone`

**[S17] GitHub Fork 的可见性。**  
`https://docs.github.com/en/pull-requests/reference/forks`

**[S18] Wrangler 开发、部署、命令行变量与版本回滚。**  
`https://developers.cloudflare.com/workers/wrangler/commands/workers/`

**[S19] 官方 Stremio Service 的作用与桌面服务复用。** 官方说明发表于 2023 年，具体当前安装行为仍需实测。  
`https://blog.stremio.com/using-stremio-service/`

**[S20] Chrome 本地网络访问权限。**  
`https://developer.chrome.com/blog/local-network-access`  
`https://chromestatus.com/feature/5152728072060928`

**[S21] 官方旧 Qt 桌面壳的可选 webui-url 参数。**  
`https://raw.githubusercontent.com/Stremio/stremio-shell/master/README.md`

**[S22] Stremio Web 所附 GPL-2.0 许可。** 实施时保留锁定基线中的完整原许可。  
`https://raw.githubusercontent.com/Stremio/stremio-web/development/LICENSE.md`


## 18. 本次执行补充与验收记录

### 2026-10-14：本地执行与阶段 A

- 用户已确认本地开发并明确开始执行原文的开发、测试及个人发布范围。TMDB 凭证只通过安全 Terminal 隐藏输入传递。
- Fork：`https://github.com/ethankw/stremio-web-bilingual`；基线 `v5.0.0-beta.42` / `9d1d526591b4c076c7307a1ba9ec056d483f169a`。
- 主仓库 `/Users/ethan/Projects/stremio-web-bilingual`；开发工作树 `/Users/ethan/Projects/stremio-web-bilingual-work`。`origin` 指向个人 Fork，`upstream` 指向官方；PR 默认目标设为个人 Fork。
- 上游完整历史约 1.7 GB，本次以标签浅克隆开始，后续按需获取上游版本。`personal-main` 已从该标签创建并推送；功能分支为 `codex/bilingual-metadata-v1`。
- 当前 gh 不支持给显式仓库参数同时传 `--remote=false`；阶段 A 改用 `gh repo fork Stremio/stremio-web --fork-name stremio-web-bilingual --clone=false`。
- 工具：macOS ARM，Node 22.23.2；使用项目声明的 pnpm 11.8.0 冻结锁文件安装，未改锁文件。
- 未改源码基线：生产构建 PASS（2 条体积警告）；Jest 3 套件 / 70 测试 PASS；lint PASS（0 错误、263 条原有警告）；Git 干净、diff 检查 PASS。
- 真实 Chrome 访客模式：原版首页目录、电影 The Kid (`tt0012349`) 的 Logo、简介及原片源入口、Ted Lasso (`tt10986410`) 的剧集详情与单集列表均已观察。此项不是账号、双语或播放验收。
- 原版预览 `http://localhost:18431`。本机 Chrome 对 `127.0.0.1` 地址曾连接超时，localhost 正常；没有修改浏览器安全设置。
- Cloudflare 浏览器登录已由用户完成；现有账户已有 Zero Trust Free 和管理权限，未创建 Worker，未改变其他项目或账户级 Access。

### 经当前官方文档核对的实现修正

- Access 后的 Worker 不能依赖 Cloudflare Cache API。因此保留受限前端内存缓存、请求合并；服务端若使用内存缓存，其容量、TTL 和冷启动行为须明确。不添加数据库或 KV。参考：`https://developers.cloudflare.com/workers/runtime-apis/cache/`。
- TMDB 的 language 参数不能独立证明字段语言。读取精确翻译条目证明地区与语言；缺失字段保持缺失，不用原语言片名冒充英文。
- 未在真实插件中核实的 TMDB 标识格式保持 unsupported；不按名字或裸数字猜身份。IMDb 匹配按 movie/series 对应数组筛选，歧义退回原资料。
- 增加选中单集的精确接口；使用原始 video.season / video.episode，保留特别篇 season 0，不能把整剧简介用于单集。
- 发布、Access、Secret 的原文顺序保持；原始任务及开始开发确认已授权本项目专属正常发布步骤。额外账户级变更、付费资源和其他项目变更不在授权范围。

### 阶段 B：最小显示实验通过

- 新增受限双语客户端、共享四并发队列、有界缓存、独立本地偏好与可展开简介组件；原始 meta/动作对象不变。
- 合成夹具只存在于 `tests/fixtures/bilingual-preview.py`，仅可服务本项目 build/，不会由 Webpack 打入个人发布包。所有合成字段均有明确 `[TEST]` / `[测试]` 标记。
- 真实 Chrome (`http://localhost:18432`) 已验证电影/剧集双语标题与双段简介、Logo 不遮文字、单集独立显示、分别收起简介、503 保留原资料/片源入口、清除本功能缓存、关闭后恢复原版 Logo/SUMMARY 显示。影片/片源链接的原 ID 与原参数保持一致。
- 构建 PASS（相同 2 条上游体积警告）；原有与新增 Jest 共 4 套件 / 80 测试 PASS；lint 仍为 0 错误、263 条原有警告；diff 检查 PASS。
- 此阶段只证明合成数据的显示与退回行为，不证明真实 TMDB、正式账号、播放、PWA 安装或任何云端发布。
- 用户通过 Terminal 完成本项目 TMDB 凭证输入；仅核对 `.dev.vars` 存在、0600 权限和 Git 忽略，未显示值、未上传。
- 浏览器设置观察到现有 Stremio 服务版本 4.21.2、状态 Online。实际播放和字幕验收仍未执行。
