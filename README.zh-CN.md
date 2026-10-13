# Stintwork

[English](README.md) | 简体中文

源码与问题反馈：[GitHub](https://github.com/tzrea1-Q/stintwork)。

独自维护项目时，Stintwork 可以帮你用自己已安装的编程智能体，从一个想法一路做到代码合并。工作在本地按阶段推进，每轮都有任务简报和交接说明，下一轮可以换一个智能体接着做。项目要做什么、有哪些约定和决策，都留在仓库里。

```bash
cd /path/to/your/project
npx stintwork
```

在你自己的项目 Git 仓库中运行，而不是 Stintwork 仓库；npx 会从 npm 为你下载 Stintwork。

Stintwork 会启动本地服务器，在终端显示地址并打开浏览器。工作项的工作树创建在项目目录旁的 `<project>-worktrees/<slug>` 中。

**状态：** v0.1，仅限本地使用。Claude Code 和 Codex 已通过 ACP 验证。Grok Build 为实验性支持，尚未完成端到端验证。

Stintwork 已发布到 npm。[入门指南](docs/getting-started.md)（英文）带你从创建第一个工作项开始，一直做到合并。

## 环境要求

- Node.js 22.12 或更新版本，以及 Git。

### 配置智能体

Stintwork 使用你自己安装的智能体 CLI 和已有的登录状态：每个想让 Stintwork 使用的智能体，都需要你安装其 CLI，确保能通过 PATH 找到，并完成登录。

| 智能体 | CLI | 登录命令 | 状态 |
|---|---|---|---|
| Claude Code | `claude` | `claude auth login` | 已通过 ACP 验证 |
| Codex | `codex` | `codex login` | 已通过 ACP 验证 |
| Grok Build | `grok` | `grok login` | 实验性支持，尚未完成端到端验证 |

Stintwork 内置 Claude Code 和 Codex 的 ACP 适配器，但不包含它们的 CLI 或登录状态，也不处理你的凭据。开始前至少配置好一个智能体；也可以配置多个，为每个阶段或每轮工作选择一个，在两轮工作之间切换。

检测到 CLI 未安装或尚未登录时，该智能体会在选择列表中被禁用，并显示安装或登录提示；需要登录的智能体还会出现在 **Needs you** 中，显示登录命令和 **Refresh agent availability**（刷新智能体可用状态）按钮。

CLI 支持 `--no-open`、`--help` 和 `--version`。加上 `--no-open` 后不会自动打开浏览器，需要自行打开终端显示的地址。按 Ctrl+C 停止服务器。

## 核心概念

- **工作项（work item）：** 要做的一项功能、要修的一个缺陷，或一次小改动。相关文件放在 `.scratch/<slug>/`。
- **阶段（stage）与关卡（gate）：** 工作流由多个阶段组成。每个阶段都要通过关卡才能继续，条件可能是你批准、检查通过，或代码合并。
- **一轮工作（stint）：** 一个智能体在某个阶段做的一轮工作，也可以只处理其中一张工单。开始前收到任务简报（brief），结束时留下交接说明（handoff），说明做到哪里、还有什么没解决、建议下一步做什么。如果有未提交的改动，Stintwork 会将它们提交为检查点（checkpoint）。
- **记忆变更提议（memory proposal）：** 智能体对项目记忆文件的修改，由你决定接受还是拒绝。
- **已交付（Shipped）：** 代码已经合并，不是仅仅结束了一轮工作或通过了某个关卡。

## 一项工作怎么完成

1. **创建工作项。** 按 `c`，或用 ⌘K 或 Ctrl+K 打开命令面板，选择 **Create work item**（创建工作项）。填好标题、想做什么和所用的工作流，也可以选择里程碑。创建时会自动提交一次。
2. **按阶段推进。** 每个阶段都要满足关卡条件。智能体结束一轮工作，不代表这个阶段已经通过。
3. **让智能体接着做。** 先预览任务简报，再启动智能体。下一轮会收到上一轮的交接说明，以及之后有哪些文件发生了变化。你可以更换智能体；有未解决的问题，就写开发者备注，供下一轮参考。
4. **评审并检查。** 所有评审意见都要修复，或由你决定接受。配置的检查必须通过，评审和检查结果不能过时，记忆变更提议也必须全部处理完，才能通过评审。
5. **合并代码。** 在 Ship 阶段选择 **Merge locally**（本地合并），也可以通过 `gh` 创建并合并拉取请求。推送前需要你明确确认。合并后，工作项才算已交付。

## 功能

- **看板：** Pipeline 视图按阶段展示工作项。**Needs you**（待你处理）队列集中显示问题、权限请求、关卡批准请求和记忆变更提议。
- **项目设置：** 看板顶部的 **Setup**（项目设置）按钮会预览要新增或修改的文件。选好要应用的变更，确认后会提交一次。它也会检查各智能体能否找到阶段所需的技能，显示已找到、缺失或无法判断，但不会替你安装技能。
- **每轮的权限：** 可以选择 **Ask**（询问）、**Edit freely**（自由编辑）或 **Autonomous**（自主执行）。启动前请读任务简报预览中针对所选智能体的权限警告。这些级别受智能体自身能力限制，不能作为独立的安全边界。
- **自定义工作流：** **Customise**（自定义）会把内置工作流复制到 `.stintwork/workflows/`，之后可以自行编辑 YAML。
- **路线图：** 用 **Edit roadmap**（编辑路线图）修改里程碑和所属工作项，每次编辑会提交一次。

内置工作流如下，阶段名称与界面一致：

- **Feature**（功能）：Clarify → Spec → Tickets → Implement → Review → Ship。
- **Bug**（缺陷）：Diagnose → Fix → Review → Ship。
- **Quick**（小改动）：Do → Review → Ship。

## 项目文件

规格说明、工单、关卡批准记录和评审决定都保存在项目中。工作项创建工作树后，请在工作树里编辑相关文件，侧边面板会显示路径。

| 路径 | 内容 |
|---|---|
| `.scratch/<slug>/` | `spec.md`、`issues/NN-*.md`、`workflow.yaml`、`review.yaml` |
| `.stintwork/roadmap.md` | 里程碑及其工作项 |
| `.stintwork/config` | `permissionLevel` 和本地 `checks` |
| `.stintwork/workflows/` | 自定义工作流 YAML |
| `.stintwork/local/` | 不纳入 Git 的每轮工作日志和交接说明 |

智能体修改 `GLOSSARY.md`、`docs/adr/` 或 `AGENTS.md` 后，这些修改会作为记忆变更提议交给你，供你接受或拒绝。

## 仓库内容

参与开发时可以参考这些文件和目录：

| 路径 | 说明 |
|---|---|
| [`docs/getting-started.md`](docs/getting-started.md)（英文） | 从创建第一个工作项到合并代码 |
| [`docs/plan.md`](docs/plan.md)（英文） | 架构、里程碑和后续计划 |
| [`GLOSSARY.md`](GLOSSARY.md)（英文） | 产品术语 |
| [`docs/adr/`](docs/adr/)（英文） | 决策记录 |
| [`docs/brief.md`](docs/brief.md)（英文） | 产品简报和范围 |
| [`docs/research/2026-10-09-spikes.md`](docs/research/2026-10-09-spikes.md)（英文） | ACP、任务简报和交接说明的验证记录 |
| [`prototype/`](prototype/)（英文） | 仅作设计参考的原型，正式界面选择了 Pipeline 视图 |
| [`spikes/acp-probe/`](spikes/acp-probe/)（英文） | ACP 能力检查 |

### 参与开发 Stintwork

日常使用无需克隆或构建 Stintwork。参与开发 Stintwork 时，先在 Stintwork 源码目录中用 pnpm 构建，再切换到你自己的项目 Git 仓库中运行：

```bash
cd /path/to/stintwork
pnpm install
pnpm build
cd /path/to/your/project
node /path/to/stintwork/dist/bin.js
```

请用实际的绝对路径替换示例中的路径。

采用 [Apache-2.0](LICENSE) 许可证。
