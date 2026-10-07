# AdsPower 2FA 验证与保存技能 (adspower-2fa-verify-save)

本项目是遵循 [Agent Skills 规范](https://agentskills.io/specification) 的可复用自动化技能包（v2.6），适用于由具备 AdsPower Local API/MCP 以及浏览器自动化控制能力的 AI Agent 执行。

仓库地址：`yuanyuanyuan430/adspower-2fa-verify-save`

技能提供 Google 账号环境创建与复用、每 IP 容量规划、普通登录状态验收、两步验证器（TOTP）生成填入提交、Google 结果核验以及密钥回存与二次读回的完整闭环。

> **架构声明**：
> 1. 本项目不是独立的黑盒登录机器人。全链路必须由具备对应宿主接口权限的执行 Agent 调度执行。
> 2. 内置的辅助脚本（CLI）仅负责本地离线计算 TOTP 验证码与代理容量规划，不包含网络请求或凭证爬取。
> 3. 本流程完全基于标准 TOTP 算法与 AdsPower 接口，**不依赖 1Password、系统剪贴板或任何第三方在线 2FA 网站**。

---

## 目录结构

```text
.
├── SKILL.md                          # 技能主指令与核心执行规范 (v2.6)
├── agents/
│   └── openai.yaml                   # 适配 Agent 平台的元数据声明
├── assets/
│   └── totp.html                     # 离线单页 TOTP 参考核心与应急纯计算源码
├── references/
│   ├── automation-contract.md        # AdsPower MCP 接口语义与自动化操作契约
│   └── portability-and-evidence.md   # 运行环境迁移条件、兼容矩阵与实测证据记录
└── scripts/
    ├── allocate-proxies.mjs          # 代理容量规划工具（每 IP 最多 5 账号，离线纯计算）
    ├── check-totp.mjs                # 综合测试套件（RFC 向量、容量算法、参数回归）
    └── totp.mjs                      # 本地 TOTP 核心计算脚本（私有 stdin 交互）
```

---

## 核心业务链路

全链路在获授权的单执行者环境中顺序运行，包含以下阶段：

1. **输入与授权检查**：从指定的 AdsPower 环境备注中读取账号凭证（`邮箱----密码----恢复邮箱`），或按本次输入授权新建环境；核对唯一 ID 与意图范围。
2. **代理容量规划**：按“每个 IP 最多分配 5 个账号”规划代理池。若可用 IP 数量小于账号数，但在总剩余容量范围内，自动复用已确认容量的 IP；无须反复人工打断。
3. **环境创建或复用**：根据命名模板创建环境，或复用已有环境；确保内核版本与生成 User-Agent 相互匹配，写入分配代理与备注。
4. **登录状态验收**：通过官方入口访问，区分普通登录与后续安全操作。未登录环境先完成普通密码及恢复邮箱确认，核对账号身份。
5. **直达 Authenticator**：已确认正确账号登录且无实际身份拒绝时，直接进入 Authenticator 设置界面；没有验证器时才提取独立 Base32 密钥并建立候选版本，已有验证器按真实挑战核验。
6. **同运行时提交验证码**：在当前执行运行时内调用本地 TOTP 算法生成 6 位动态验证码，在同一操作周期内填入并点击提交。
7. **Google 接受确认**：明确检测到 Google 界面显示成功记录（如 `Your authenticator / Added just now`）方确认接受。
8. **密钥回存与完整读回**：确认接受后，调用 AdsPower 接口将同一候选密钥保存至对应环境的 `fakey` 字段；随后发起新查询完整读回，校验密钥与未授权字段完全一致。

### 异常分支与人工确认边界

- **追加验证判定**：登录成功后，实际身份拒绝或必须人工的追加验证记为“登录成功、后续需验证（正常）”，2FA 保持 `pending`；完整绑定范围中的普通密码再次确认可使用已提供凭证自动完成。仅登录测试遇再次确认时直接标记，不把安全操作拒绝当作账号登录失败。
- **未登录先排查**：若未成功登录，归入“流程待排查”，优先核对页面状态与接口实现，不盲目判定凭证失效。
- **遇到人工挑战立即暂停**：若遇到 Google 人机验证（CAPTCHA）、手机短信验证、实体安全密钥或移动设备弹窗审批，立即停止该项自动化并等待人工处理，**严禁自动绕过或强行重试**。
- **不保证全部自动通过**：受网络环境、代理风控评级及 Google 动态策略影响，自动化流程不承诺所有账号均能 100% 免人工通过。

---

## 标签与颜色规范

执行过程中，状态标签更新遵循严格的事实依据与去重规则。预设颜色如下：

| 标签名称 | AdsPower 颜色 | 适用事实与规则 |
|---|---|---|
| **登录成功** | `green` | 页面已确认正确 Google 账号已正常登录 |
| **登录后需验证（正常）** | `lightGreen` | 账号已成功登录，但后续进入安全设置或 Authenticator 时需要额外身份核验；2FA 保持 pending |
| **2FA已验证保存** | `purple` | **核心完成标准**：必须同时满足（1）Google 明确接受当前动态码 +（2）同一密钥写入保存 +（3）新查询完整读回一致 |
| **登录流程待排查** | `orange` | 尚未确认成功登录，保留现场报错信息或未通过原因 |
| **2FA未配置** | `orange` | 账号已确认当前未绑定 Authenticator，且未保存有效密钥 |
| **2FA密钥已保存（待核验）** | `yellow` | 环境已存在保存的密钥，但没有与该密钥对应的 Google 现场接受证据；已有真实历史验收不因本次未重复挑战而降级 |
| **验证器安全等待** | `yellow` | Google 界面明确提示当前处于安全等待保护期（Security Wait） |

> **关键约束**：只有当“Google 明确接受”、“同一密钥成功回存”以及“发起独立新查询完整读回完全一致”三项事实全部成立时，方可赋予 `purple`（2FA已验证保存）标签。

---

## 安全边界与防护原则

- **不重置已有配置**：遇到已有 Authenticator 的账号，不默认重置或更换验证器；优先在真实挑战中核验现有密钥。
- **不擅自开启总开关**：流程仅负责 Authenticator 密钥绑定与记录，**默认不自动开启 Google 账号的两步验证总开关**；需要改变总开关时须有单独明确任务授权。
- **不盲目更换指纹/代理**：遭遇风控拒绝时，不自动轮换代理或重置指纹以试图绕过检测。
- **敏感数据处理**：
  - 真实账号、密码、密钥、验证码、代理认证信息只留在获授权运行时或用户明确要求的 AdsPower 字段中，不写入交付文档、日志、报告或代码仓库。
  - 本仓库代码与示例均使用公开 RFC 测试向量与占位参数，不包含任何真实业务数据。

---

## 平台兼容性与运行环境

| 运行环境组合 | 支持状态 | 说明 |
|---|---|---|
| **macOS + 本机 Agent + AdsPower MCP** | **已完整实跑验证** | 涵盖新建环境、代理分配、登录验收、2FA 绑定与完整读回的全链路真实测试。 |
| **Windows / Linux + 兼容 Agent** | **具备可移植性设计** | 代码与规范使用跨平台标准接口（Local API / 标准 WebCrypto / 无固定操作系统快捷键），但尚未在该组合完成完整业务实跑。 |
| **其他 Agent / CLI 宿主** | **需重新验收** | 需宿主具备 AdsPower 客户端连接与浏览器会话控制能力。 |

### 新机器部署前置条件

不得认为“仅复制代码即可实现全自动”。在新机器上运行前必须满足：
1. **AdsPower 客户端就绪**：客户端保持登录，拥有目标工作空间读写权限，Local API 正常开启。
2. **浏览器内核与连接器匹配**：已下载可用版本的 SunBrowser/Chromium 内核，且该版本在当前连接器支持列表中。
3. **Node.js 运行时**：需 Node.js 18+（或具备原生 WebCrypto 的 JavaScript 运行时）。
4. **系统时钟校准**：TOTP 算法依赖标准时间戳，系统时间必须准确；脚本支持已经确认的最大 ±300 秒校准参数，不可用于盲猜偏移。
5. **执行 SOP**：先执行本地自检命令，再做只读预检（查询分组与代理用量），通过后先跑单个授权样本，确认无误再开展批量。

---

## 安装与获取

本技能包为标准 Agent Skills 目录结构，可通过 Git 克隆到用户级技能目录：

```bash
# 仅当目标路径不存在时进行 clone；切勿直接 rm -rf 覆盖已有开发环境
if [ ! -d "$HOME/.agents/skills/adspower-2fa-verify-save" ]; then
  git clone https://github.com/yuanyuanyuan430/adspower-2fa-verify-save.git "$HOME/.agents/skills/adspower-2fa-verify-save"
fi
```

- 若宿主已有本技能的历史版本，请依据宿主自身的技能更新机制进行更新，避免覆盖本地工作区。
- 其他 Agent 按自身技能加载机制载入本目录，并配置获准的 AdsPower 工具；首次完整执行另行验收。
- 切勿在脚本或配置中硬编码具体机器路径、固定进程端口或固定指纹版本号。

---

## 本地自检命令

本包提供的测试脚本仅依赖 Node.js 标准库（`node:fs`、`node:crypto`、`node:vm`），无任何外部 npm 依赖包。

运行 RFC 6238 标准测试向量自检：
```bash
node scripts/totp.mjs --self-test
```
预期输出：`PASS: local TOTP core; no account data, network or clipboard used.`

运行完整测试套件（涵盖 18 个 RFC 测试向量、stdin 私有传输隔离、代理分配与 IPv6 处理）：
```bash
node scripts/check-totp.mjs
```
预期输出：`PASS: 18 RFC vectors, TOTP CLI/offset/input privacy, pending-copy Clear regression, per-IP capacity/balancing/IPv6/known usage, and both portable CLI entries.`

> **隐私提示**：`totp.mjs` 正常调用时通过私有标准输入（stdin）接收 JSON，例如 `{"secret":"<BASE32_KEY>"}`。输出的一次性密码属于敏感凭证，应保留在受控自动化会话内，切勿通过命令行参数直接传递。

---

## Agent 任务调度提示示例

向支持本技能的 AI Agent 派发任务时，推荐使用清晰的边界与占位参数，例如：

```markdown
请调用 adspower-2fa-verify-save 技能执行以下批次任务：
- 目标分组：【示例业务分组_2026】
- 环境命名模板：demo-acc-{index}
- 代理池：使用指定已授权代理池（遵循每 IP 最多 5 账号规则，不足自动复用剩余容量）
- 凭证范围：仅处理本次授权提供的 5 个账号（排除序号 2 的账号，不予导入和处理）
- 验收标准：
  1. 普通登录通过并核对身份；
  2. 若遇必须人工的验证（人机/短信）请标记后停止该项；
  3. 可进入 Authenticator 时自动完成 2FA 绑定，Google 确认接受后回存 fakey 并读回一致；
  4. 严格按照规范打标，只有三项全部满足才标记 purple。
```

---

## 相关文档

- 技能定义规范：[SKILL.md](SKILL.md)
- 接口与操作契约：[references/automation-contract.md](references/automation-contract.md)
- 兼容性分析与实测证据：[references/portability-and-evidence.md](references/portability-and-evidence.md)

*注：实际执行耗时受页面网络响应、Google 风控检查及重试等待影响。本技能完整保留各阶段耗时与诊断记录，不承诺固定耗时（如 42 秒）或虚构提速比例。*
