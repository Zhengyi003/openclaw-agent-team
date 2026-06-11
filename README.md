# OpenClaw Agent Team

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-brightgreen.svg)](https://www.apache.org/licenses/LICENSE-2.0)

这个目录就是当前真正对外发布的插件项目根目录，承载 OpenClaw Agent Team 这条产品线，并内含 Thou 原生 channel 的第一版实现边界。

首发公开边界只承诺三件事：

1. Recruit: 创建新的工作 agent。
2. Dismiss: 查看现有 agent 并删除不再需要的 agent。
3. Connect iPhone: 给 Thou 提供可直接粘贴的连接信息。

当前不承诺 group chat、meeting 入口，或完整 agent 控制台。

当前版本刻意只完成两件事：

1. 把 OpenClaw Agent Team 这层插件包的职责拆清楚。
2. 把代码结构对齐到当前 OpenClaw plugin-sdk 的 channel 插件模型。

它暂时没有完成真正的入站监听、设备握手、消息投递和 transcript 回流实现。现阶段可运行链路仍以外层开发工作台里的 sidecar 参考实现作为参照组。

## 首发前检查

发布前至少完成以下检查：

1. `npm run build`
2. `clawhub package publish <source> --family code-plugin --dry-run`
3. 手测 Agent Team 的 Recruit、Dismiss、Connect iPhone 三条主链

## Agent Team 排障

如果两天后再次遇到页面打不开，先按这个顺序排查：

1. 确认当前命中的 URL 仍是 `http://127.0.0.1:38127/agent-team/`。
2. 确认没有旧的本地预览进程继续占着 `38127`。
3. 若页面能打开但连接资料不刷新，重启宿主 gateway，而不只是重建当前插件包。
4. 若连接资料仍不可用，再检查 Tailscale 是否正常运行。

## V1 职责划分

- src/channel/base.ts：定义 Thou 作为 channel 插件的基础面，包括 meta、setup 入口、account/config 解析边界。
- src/channel/entry.ts：负责把安全策略、配对语义、出站边界挂到基础 channel 上。
- src/channel/setup.ts：setup-only 入口，只暴露 setup 所需的轻量表面。
- src/channel/accounts.ts：只负责把 channels.thou 配置解析为 ResolvedThouAccount，不处理运行时传输。
- src/setup/core.ts：只负责把 setup 输入写回 config，不承担 transport 实现。
- runtime.ts：只负责保存 OpenClaw runtime 引用。
- src/bridge/auth.ts：在 OpenClaw state 目录中为 Thou bridge 持久化 account 级 auth token。
- src/bridge/runtime.ts：把 Thou bridge 绑定到当前插件宿主 account lifecycle。
- src/bridge/server.ts：第一版真实 Thou WebSocket bridge，只处理设备鉴权与 outbound 投递。
- outbound.ts：现在既支持内存 sender，也支持真实的 Thou bridge sender。
- src/channel/transport.ts：明确声明“运输层仍未实现”，并集中放置当前阶段的边界告警。
- src/channel/types.ts：集中保存 Thou channel 第一版的配置和解析后类型。

## 当前边界判断

原生 plugin 在第一版应直接承接的职责：

- config/account 解析
- setup 输入和配置落盘
- dmPolicy / allowFrom 安全边界
- pairing 语义归位
- outbound 接口所有权

当前不应直接从 sidecar 生搬进 OpenClaw Agent Team 的职责：

- Thou 私有 auth.token 鉴权协议
- 自实现 Gateway WS 客户端细节
- 启动脚本、局域网 IP 展示和神奇配对码 UI

其中 `chat-start / chat.chunk / chat.done` 当前已经作为迁移期 bridge 协议被放进本项目的 `src/bridge/server.ts`，但它仍然只应被视为过渡 transport，而不是 Thou 长期 channel 接口的最终形态。

## 下一步

OpenClaw Agent Team 的下一个原子任务不是继续加更多占位字段，而是把 transport 分成真实模块：

1. inbound node/session binding
2. device pairing bootstrap
3. outbound delivery projection
4. transcript/session history 对齐

## 当前可做的局部验证

已提供一个不依赖完整 OpenClaw 宿主的本地脚本，用来验证 outbound delivery 的第一版真实 WebSocket bridge：

`npm run validate:outbound`

已提供一个依赖当前本机 Thou bridge + Gateway 的真实链路脚本，用来验证“创建新会话 -> 发送消息 -> sessions.list/chat.history 落到同一条 session”：

`npm run validate:session-routing`

它验证的不是“消息已经真的送到 iPhone”，而是：

1. 当前插件的 outbound 入口已经不再是纯报错占位。
2. assistant 文本和 media 文本都能通过真实 WebSocket bridge 发给一个已鉴权的 Thou 设备连接。
3. bridge sender 能返回稳定的 delivery result 结构，后续只需把当前 bridge 替换成更完整的 transport 生命周期即可。

`validate:session-routing` 额外验证的是：

1. bridge `sessions.create` 返回的新 session key，后续 `chat` 会继续显式写回同一条 key。
2. Gateway `sessions.list` 中能看到这条 Thou 设备自己的 dashboard session。
3. Gateway `chat.history` 与 bridge 流式回包都落在同一条 session，而不是回退到默认设备会话。

## 关于新增的 ws 依赖

这次新增的 `ws` 是 Node.js 侧的 WebSocket 运行库，只服务于当前插件项目里的两条代码路径：

1. `src/bridge/server.ts`：第一版真实 Thou bridge，需要在 Node 侧启动 WebSocket server 并向设备推送 `chat-start / chat.chunk / chat.done`。
2. `scripts/validate-outbound.ts`：端到端验证脚本需要用 WebSocket client 连接 bridge，模拟一个已鉴权的 Thou 设备。

它不是给 iOS 端安装的，也不是要求潜在用户手动额外执行“安装 ws”这一步。

如果未来以 npm 插件形式安装 `@zhengyi003/openclaw-agent-team`，`ws` 会作为该插件自己的 runtime dependency 一起被安装。
只有当前这种本地开发/本地目录联调场景，才需要在当前项目根目录里单独执行一次 `npm install`。

## 关于 Thou iOS 的 ATS 调整

当前 Thou bridge 仍使用 `ws://` 明文 WebSocket，而不是 `wss://`。因此：

1. 这属于 Thou iOS 客户端的网络策略问题，不属于 OpenClaw 插件宿主的额外安装动作。
2. 如果 Thou 的开发版/测试版仍直接连接 `ws://<host>:8080`，那么 iOS App 需要在工程里放宽 ATS，或者改成更细粒度的例外配置。
3. 如果未来 Thou 改成 `wss://`，或者发布版已经内置合适的 ATS 配置，那么潜在用户不需要手动改任何 Xcode 选项。

因此当前正确的边界是：

- `ws` 是插件 Node 运行时依赖。
- ATS 调整是 Thou App 工程配置。
- 它们都不应默认解释成“未来每个插件用户都要手动做的安装步骤”。
