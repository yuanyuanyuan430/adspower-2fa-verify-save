# 自动操作与接口契约

供执行 Agent 按当前工具能力选用；方法名对应语义，不要求另一宿主使用 Codex 的命名空间。

| 阶段 | AdsPower MCP 语义 | 输入/检查 |
|---|---|---|
| 客户端/权限 | check_status | 真实 API 地址、当前工作空间权限；错误不当成正常返回 |
| 分组 | get_group_list / create_group | 名称精确匹配、必要分页；创建请求不明先查询 |
| 当前分配/恢复 | get_browser_list | 明确 group/profile filters；合并批次 ID 查询；只保留需要字段 |
| 新环境 | create_browser | group_id、name、账号、备注、代理、当前 fingerprint_config；返回后读回 |
| 已打开判断 | get_browser_active | 目标 profile_id/编号，不能用其他环境状态 |
| 启动 | open_browser | 目标 ID；不清缓存、换指纹或修改其他启动配置 |
| 会话绑定 | connect_browser_with_ws | 来自同一启动结果的 ws.puppeteer + userId + serialNumber |
| 浏览器 | navigate / evaluate_script / fill_input / click_element | 官方 HTTPS 来源、目标邮箱、最新 DOM、可见且唯一控件 |
| 保存 | update_browser | 只更新已确认对应账号的 fakey；当前非空值变化时暂停 |
| 验收 | 新 get_browser_list 查询/目标编辑页 | 完整密钥本地比较；关键字段未发生额外修改 |

新建的账号和代理认证信息只在必要创建字段中使用。原生平台有旧的顶层 username/password/fakey 和部分版本的 platform_account 对象，不能假设所有版本/多平台行为相同。按当前 API schema 与可验证更新契约选择一种，不猜字段覆盖语义。

## 登录状态与入口

- 已确认登录的正确账号，仍需绑定且没有实际拒绝时进入 Authenticator；额外要求短信/设备/人工验证或已经拒绝则标记正常需验证并停止该项。完整绑定允许用已提供的现有密码完成普通再次确认；登录测试遇再次确认提示则直接标记。未知/未登录先走普通入口，可选恢复信息提示跳过。
- 普通主页及 `/security` 可访问即能核对登录，不能推定 `/two-step-verification/authenticator` 已授权。已登录后实际拒绝或要求必须人工的追加验证，标记正常并停止该项验证，不再做菜单诊断；记录 login complete 和 2FA pending/verification_required。普通密码再次确认依本次范围：login 只标记，full_2fa_binding 可用已提供凭证自动完成，实际拒绝后不再重新认证。
- 工具连接可能选中启动页，先读取实际页面；用户重开环境后重新取得目标 ws。真实拒绝不通过重启/换 IP 反复尝试。
- 普通主页和安全页已核对正确身份，而 Authenticator 仍返回身份拒绝时，保留登录完成和绑定待验证两个状态；不能把敏感设置拒绝扩大为账号无法登录。用户建立的会话只能记为会话核对，不能记为 Agent 从头自动登录。

标记通过 get_tag_list/create_tag/update_browser 的当前契约完成；颜色查询/更新使用 get_tag_list/update_tag，默认色表见 SKILL.md。改色只传目标标签 ID 与 color，先确认名称和关联环境，修改后新查询读回；不更新环境配置。当前工具支持 tags_update_type="2" 追加，但会截断到 30 个；先算去重后总数，不允许原标签被截断。未知平台查对应追加语义，不固定跨机器 ID；新查询核对标签及未授权字段。没有登录证据只记流程待排查，不贴登录成功；登录后额外验证不能贴 2FA 已验证保存。

## 自动分配工具

`node scripts/allocate-proxies.mjs` 从 UTF-8 stdin 接收 JSON：

```json
{"account_count":10,"proxies":["192.0.2.1","192.0.2.2"],"usage":{"192.0.2.1":0,"192.0.2.2":0}}
```

这些是保留文档 IP，不是真实代理。支持代理对象的 `allocation_ip`、`proxy_host`、`host` 或 `ip`；支持数字 IPv4/IPv6、IPv4 的 `IP:PORT:USER:PASSWORD` 和带方括号的 IPv6 形式。函数只取分配 IP，不解析/重写认证字段。

- 输出 `assignments[i]` 是账号 i 使用的代理输入索引，不是代理凭证；null 项记录在 `unassigned_indexes`。
- 同 IP 的多个端口合并在同一组，上限 5；同组端口按输入轮换，IP 组优先当前使用最少者。
- usage 是调用者取得的完整获授权已有用量，或由既有协调额度转换的保守不可用名额；不是脚本自动查询出来的全局数。按环境 ID 去重后传入，每个可用 IP 要有明确计数。空对象代表没有已确认容量，所有 IP 都不可新增分配；已确认零用量必须逐 IP 写 0。脚本输出 known_usage_after 是按输入口径更新的计数，不单独证明全局实际用量。
- `allocation_ip` 应是已确认/约定的固定分配或出口 IP。动态出口、DNS 别名不能凭端口或名称视为独立 IP，也不能保证后续出口不变。
- 规划不原子预留容量；并发作业需要已有协调。脚本最多规划 10000 项/2000 代理条目，不表示获准自动运行如此大的 Google 批次。

## 验证码工具

`node scripts/totp.mjs --self-test` 仅用公开 RFC 测试密钥。私有 stdin 数据结构是 `{secret, algorithm?, digits?, period?, offset_seconds?}`；不要将真实 secret 放在命令行、示例文件、shell 历史或报告中。

输出 `{code, valid_for_seconds, algorithm, digits, period}`；它包含敏感的一次性码，应留在控制运行时。支持 SHA1/SHA256/SHA512、6/8 位，URI 按来源参数处理；时钟偏移仅允许已经确认的 ±300 秒范围。默认偏移为零。

可在 Node 控制器中导入 `computeOtp(input)` 并将返回 code 直接传给获准的填写接口，无需启动网页或剪贴板。没有 Node 的 JavaScript 宿主，通过自己的获准文件读取方式取得 HTML 中 `// UI` 前的公开纯计算核心，在允许的原生 Web Crypto 运行时使用；不能直接调用依赖 node:fs/node:vm 的 loadTotpApi()。本包复用唯一算法实现，没有另写 HMAC。

## 速度与恢复

- 先执行用户排除规则再处理凭证，只记录被排除的原始序号/原因，不保存其密码或附带密钥。已存在的同意图项复用，不新增代理用量；“原始输入序号”“创建序号”“系统环境编号”分别映射，排除一项不删除系统已有其他环境。
- 对尚未登录的新环境，直接使用本批已从官方网页观察验证的公开普通登录入口可减少介绍页往返；只保留必要公开 service/返回主页参数，不复用身份/会话签名参数。若普通链接把查询名写成 amp;continue，正规化为实际公开参数并重新检查目标来源；入口变化仍要完成账号身份和 Google 验证，不绕开人工要求。已知敏感拒绝的既有会话不因“复用”重复该敏感请求。
- 已知新启动页不做无用提前读取；DOM 空体/导航过渡有界等待，明确人机或外部要求立即 pending。只尝试网页提供的合法备选一次，不解验证码或反复重试。阶段计时记录真实覆盖范围；提交到保存响应可能包含 Google 等待，不能把它全部称为 API 耗时。恢复/诊断时间与正常冷启动分别统计。

- 核验已有密钥时不把“生成六位码”当作 Google 接受；若已有配置显示安全等待，保留当前密钥，记录本地自检与现场核验两个状态。没有现成可用 TOTP 挑战则等待平台允许，不能重绑已有验证器来伪装核验。官方允许的信任方法审批按当前界面和用户提供的可用因素处理；没有 Approve 不假设能加速，也不把不同账户统一安排固定七天到期。

- 先核对当前已下载内核与连接器参数版本的交集，使用本机有效配置；自动最新 UA 可能对应尚未下载的内核。新环境初始化时核对内核/UA一致，不能把另台电脑或已登录环境的身份复制过来。修改 random_ua 后现有 UA 可能保持旧值，必须读回；首次登录前完成必要启动配置初始化，不能把这种初始化用于实际拒绝后的换身份重试。
- 第一页可能给出总数/页数，后续页可能只给 list/page/page_size；保留首批元数据，去重校验完整覆盖，缺失字段不等于总数变化。
- 可将确定步骤合并为有边界的状态执行段；普通登录、额外身份要求、候选/提交/接受/保存分别记录。URL和DOM跳转不同步时等待，已提交的同一动作不重复点击；未知状态返回当前阶段。当前对话框恢复不重新导航，不复用取消/过期候选。输入框占位符按当前DOM和大小写变化核对。

- 配置 API 创建/写入/启动默认串行，保守间隔至少 1 秒；先合并查询。文档说明一般限速按账户档位为 2/5/10 次每秒，部分接口仍为 1 次每秒；只能在确认具体接口和部署限速后提高。该节流不套到每个浏览器点击上。
- 不把同一全局浏览器 MCP 会话用于并行账号；同一 profile_id 的绑定/保存过程也只有一个跨电脑、跨 Agent 的活动执行者。恢复前确认旧执行者停止；读前检查不提供原子 CAS，发现其他写入者时 blocked。纯计划/本地计算和无会话副作用的独立读取可按限速处理。
- Playwright 型工具用当前可见对话框和 `:visible`；其他引擎使用等价可见性。实际出现过两个同名 Next，其中隐藏按钮导致两次 30 秒等待，限定可见性已解决这一类错误。
- 导航中读脚本的 Execution context was destroyed 可能是正常页面跳转；重新读新页面，先判定是否成功/等待/拒绝，别重复提交。捕获错误时删除凭证、查询 token 和 WebSocket 地址，不直接打印完整工具正文。
- 创建/保存请求返回不明确时先查询是否已有副作用；返回 isError=false 仍可能正文是 Timeout，不用单一返回标记做完成判断。

主要接口依据：
- [AdsPower 新建环境 V2](https://localapi-doc-en.adspower.com/docs/New-Profile-V2)
- [AdsPower 更新环境 V2](https://localapi-doc-en.adspower.com/docs/Update-Profile-Info-V2)
- [AdsPower API 与限速](https://localapi-doc-en.adspower.com/docs/Rdw7Iu)
- [Playwright CDP 连接](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp)：该接法限 Chromium，和 Playwright 自有协议的能力不同，不保证所有高级特性。
- [Google：新登录方法的等待与审批](https://support.google.com/accounts/answer/17137073?hl=en)
- [Google：敏感操作身份确认](https://support.google.com/accounts/answer/7162782?hl=en)
