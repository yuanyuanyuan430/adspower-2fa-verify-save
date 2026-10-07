# 运行条件、迁移与验证边界

## 需要什么

完整流程由具有 AdsPower 和浏览器控制能力、且获准处理指定账号的执行 Agent 驱动。两项 CLI 负责 TOTP 计算和代理容量规划，不单独完成 Google 登录或绑定；本地 HTML 是可选手动验证码工具。

主流程使用当前 AdsPower Local API/MCP、明确 profile_id 的浏览器会话和 DOM/角色定位，没有 macOS 快捷键、固定坐标、机器路径、端口、指纹版本或 Codex 私有命名空间依赖。agents/openai.yaml 是可选界面元数据；其他 Agent 按自己的技能安装机制读取 SKILL.md 和相对资源。

| 环境 | 条件 | 已验证边界 |
|---|---|---|
| macOS + 当前执行 Agent + AdsPower MCP | 已有允许的 API 与浏览器控制 | 真实样本已完成创建、普通登录、验证码提交、Google 接受、同密钥保存和完整读回 |
| Windows/Linux + 对应执行 Agent | AdsPower 权限、浏览器控制、TOTP 运行时、可达 Google | 采用可迁移接口设计；尚未在该组合完整实跑 |
| 其他兼容 Agent Skills/MCP 的本机 Agent | 自身技能加载、AdsPower 工具与审批策略 | 完整链路需在该宿主重新验收 |
| Node 18+ 终端 | 正确 UTF-8 stdin 与准确系统时间 | 可独立运行两项辅助 CLI；没有整个浏览器流程 |
| 普通浏览器 | 本地 Web Crypto 可用 | HTML 仅供本地手动计算；不是完整自动化 |
| 云端 Agent | 已授权通道连接 AdsPower 所在机器 | 云容器 localhost 不是用户电脑，复制仓库不能代替连接配置 |

## 新电脑首次运行

1. 安装当前平台的 AdsPower，登录正确工作空间，确认客户端在线和 Local API 权限。
2. 读取本机真实 API 地址和认证方式，使用已经授权的本机或远端连接；不复制另一电脑的端口、凭证、路径或进程信息。
3. 使用宿主当前支持的 MCP/浏览器驱动配置，不覆盖用户其他工具配置，不自动安装新依赖。确认可绑定指定 SunBrowser/Chromium 会话；需要图形界面或无头能力时先验证支持。
4. Node 18+ 运行自检：node scripts/totp.mjs --self-test 和 node scripts/check-totp.mjs。没有 Node 时可在允许的原生 Web Crypto 运行时复用本包公开核心。系统时钟必须准确。
5. 做只读工作空间、目标分组、环境、代理用量、兼容内核及会话预检；从本机已下载且当前连接器接受的内核中选择，核对 UA 匹配。
6. 先执行一个明确授权的业务样本并核对保存读回，再扩大到本次授权批次。不要把格式检查、MCP 启动或本地算法检查当作完整链路通过。

不同电脑、IP、代理状态、Google 身份验证条件、客户端版本、工作空间权限及多作业竞争都可能影响运行。正确账号登录后仍要求追加验证时，login 可完成而 2FA pending；未确认登录则保留真实流程问题。工具或权限限制记 blocked，不伪造完成，不绕过人工要求。

## 公开检查与真实业务验收

scripts/check-totp.mjs 用公开 RFC 测试向量和保留文档 IP 检查：

- SHA1/SHA256/SHA512 的 18 个标准 TOTP 向量、前导零、时间周期和 URI 参数；
- CLI 私有 stdin、UTF-8 分块输入、错误消息不回显输入、导入与时钟校准；
- 本地 HTML 不联网、不保存密钥，以及清除与待完成复制动作的状态一致性；
- 每 IP 容量、IPv4/IPv6 与 mapped 地址合并、同 IP 多端口、已知用量、未知容量不按零分配。

这些可重复的本地检查验证辅助工具，不证明 Google 风控通过、工作空间写权限或另一操作系统完整验收。完整绑定必须逐项具有当前 Google 接受、同一密钥保存和完整新查询读回证据。Google 两步验证总开关单独记录，不能从验证器已添加推定开启。

真实执行中的阶段计时、诊断、重试和人工等待保留在私有业务回执；公开包不包含账号、环境编号、工作空间 ID、对话 ID、代理认证、实际密钥、验证码或业务批次记录。已登录复用、人工暂停、入口试验和普通冷启动分开统计，不保证固定耗时，也不根据不同账号推算提速比例。

## 来源

- [Agent Skills 标准](https://agentskills.io/specification)
- [OpenAI：Skill 与 MCP 的角色](https://developers.openai.com/plugins/concepts/skills)
- [AdsPower 官方 MCP 设置](https://help.adspower.com/docs/MCP)
- [AdsPower 官方 API 使用与权限](https://help.adspower.com/docs/api)
- [Google：敏感操作身份确认](https://support.google.com/accounts/answer/7162782?hl=en)
- [Google：新登录方法的等待与审批](https://support.google.com/accounts/answer/17137073?hl=en)
