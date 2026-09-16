# Agent 间通信协议：MCP、A2A、ACP 与 ANP 介绍与对比

---

## 目录

1. [为什么需要 Agent 通信协议](#1-为什么需要-agent-通信协议)
2. [协议全景与对比](#2-协议全景与对比)
3. [MCP — Model Context Protocol](#3-mcp--model-context-protocol)
4. [A2A — Agent-to-Agent Protocol](#4-a2a--agent-to-agent-protocol)
5. [ACP — Agent Communication Protocol](#5-acp--agent-communication-protocol)
6. [ANP — Agent Network Protocol](#6-anp--agent-network-protocol)
7. [OpenAI Threads 模型](#7-openai-threads-模型)
8. [组合使用：构建完整 Multi-Agent 系统](#8-组合使用构建完整-multi-agent-系统)
9. [关键设计原则](#9-关键设计原则)
10. [选型建议](#10-选型建议)

---

## 1. 为什么需要 Agent 通信协议

### 1.1 单个 Agent 的局限

一个 LLM Agent 本质上是一个"思考—行动"循环：接收输入，调用工具，返回结果。但随着任务复杂度上升，单个 Agent 面临三个瓶颈：

- **上下文窗口有限**：复杂任务的中间状态超出单次对话能承载的量
- **专业能力分散**：一个 Agent 不可能同时精通代码、设计、数据分析
- **并发执行困难**：需要同时执行多个子任务时，单 Agent 只能串行

### 1.2 Multi-Agent 系统的通信需求

当系统从单 Agent 演进为多 Agent 协作时，立刻出现三类通信需求：

```
类型        说明                          例子
────────────────────────────────────────────────────────
工具调用     Agent 调用外部能力             查数据库、写文件、搜索网页
任务委派     Agent 把子任务交给另一个 Agent  Orchestrator → Worker
状态同步     多个 Agent 共享执行上下文       进度通知、中间结果传递
```

### 1.3 协议解决什么问题

没有统一协议时，每对 Agent 之间都需要自定义接口，导致：

- 接口格式不一致，集成成本高
- 无法跨团队、跨厂商复用 Agent
- 错误处理、权限控制各自为政
- Agent 发现（Discovery）无从实现

协议的价值：**提供一套所有参与方都遵守的"语言"**，让 Agent 生态像微服务一样互联互通。

---

## 2. 协议全景与对比

### 2.1 分层视角

不同协议解决不同层次的问题，彼此互补而非竞争：

```
┌─────────────────────────────────────────────┐
│              应用层（业务逻辑）               │
├─────────────────────────────────────────────┤
│     任务协作层：A2A、ACP                      │  ← Agent ↔ Agent
├─────────────────────────────────────────────┤
│     工具调用层：MCP                           │  ← Agent ↔ 工具/资源
├─────────────────────────────────────────────┤
│     网络发现层：ANP                           │  ← Agent 注册与发现
├─────────────────────────────────────────────┤
│     传输层：HTTP、WebSocket、stdio             │
└─────────────────────────────────────────────┘
```

### 2.2 协议对比一览

| 协议 | 发起方 | 发布时间 | 核心定位 | 传输方式 | 消息格式 | 成熟度 |
|------|--------|----------|----------|----------|----------|--------|
| **MCP** | Anthropic | 2024.11 | Agent ↔ 工具/资源 | stdio / HTTP+SSE | JSON-RPC 2.0 | 生产可用 |
| **A2A** | Google | 2025.04 | Agent ↔ Agent 任务协作 | HTTP / SSE | JSON-RPC 2.0 | Beta |
| **ACP** | IBM BeeAI | 2025.03 | Agent ↔ Agent REST 通信 | REST HTTP | JSON | Beta |
| **ANP** | 开源社区 | 2025.05 | Agent 去中心化发现与通信 | HTTP / DID | JSON-LD | 实验性 |
| **OpenAI Threads** | OpenAI | 2023.11 | 单 Agent 对话状态管理 | REST HTTP | JSON | 生产可用 |

---

## 3. MCP — Model Context Protocol

### 3.1 设计背景

MCP 由 Anthropic 于 2024 年 11 月开源，核心问题是：**如何让 LLM 安全、标准化地访问外部世界**。

在 MCP 之前，每个 AI 应用都要自己实现工具调用的序列化、权限控制、错误处理逻辑。MCP 将这一层抽出来标准化，形成通用的"插头-插座"规范——工具由独立的 MCP Server 提供，与具体的 LLM 解耦。

### 3.2 架构：三个角色

```
┌──────────────────────────────────────────────┐
│                Host（宿主应用）                │
│     如：Claude Desktop、IDE 插件              │
│                                              │
│   ┌────────────┐     ┌────────────┐          │
│   │ MCP Client │     │ MCP Client │          │
│   └─────┬──────┘     └─────┬──────┘          │
└─────────┼─────────────────┼─────────────────┘
          │ stdio / HTTP     │ stdio / HTTP
          ↓                  ↓
   ┌────────────┐     ┌────────────┐
   │ MCP Server │     │ MCP Server │
   │ （文件系统）│     │ （数据库）  │
   └────────────┘     └────────────┘
```

| 角色 | 职责 |
|------|------|
| **Host** | 拥有 LLM 的宿主程序，管理整体流程 |
| **Client** | Host 内部的连接管理模块，与 Server 一一对应 |
| **Server** | 独立进程，对外暴露工具、资源、提示模板 |

### 3.3 三类能力

MCP Server 可以向 Agent 暴露三类能力：

**① Tools（工具）** — Agent 可主动调用的函数

```json
{
  "name": "execute_sql",
  "description": "在数据库中执行 SQL 查询",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "SQL 语句" },
      "database": { "type": "string", "enum": ["prod", "staging"] }
    },
    "required": ["query"]
  }
}
```

**② Resources（资源）** — Agent 可读取的数据源，类似文件 URI

```json
{
  "uri": "file:///project/config.yaml",
  "name": "项目配置文件",
  "mimeType": "application/yaml"
}
```

**③ Prompts（提示模板）** — 可复用、参数化的提示片段

```json
{
  "name": "code_review",
  "description": "代码审查提示模板",
  "arguments": [
    { "name": "language", "description": "编程语言", "required": true }
  ]
}
```

### 3.4 连接生命周期

MCP 连接分为三个阶段：

```
① 握手阶段
   Client ──initialize──────────────→ Server   （声明协议版本和能力）
   Client ←──initialize response──── Server   （Server 返回支持的能力）
   Client ──initialized（通知）──────→ Server   （握手完成）

② 能力发现阶段
   Client ──tools/list──────────────→ Server
   Client ←──tools/list response──── Server

③ 使用阶段
   Client ──tools/call──────────────→ Server
   Client ←──tools/call response──── Server
   Client ←──（SSE 进度推送）──────── Server   （长时任务）
```

### 3.5 消息格式：JSON-RPC 2.0

MCP 完全基于 JSON-RPC 2.0，所有消息分四类：

**请求（Request）**
```json
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": { "city": "上海", "unit": "celsius" }
  }
}
```

**成功响应（Response）**
```json
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "result": {
    "content": [{ "type": "text", "text": "上海今日晴，32°C，湿度 78%" }],
    "isError": false
  }
}
```

**错误响应（Error）**
```json
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": { "detail": "city 字段不能为空" }
  }
}
```

**单向通知（Notification）** — 无需响应
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/progress",
  "params": { "progressToken": "task-123", "progress": 60, "total": 100 }
}
```

> **关键字段说明**  
> `id`：请求唯一标识，响应时原样返回，用于匹配异步响应  
> `method`：操作名称，格式为 `资源/动作`  
> `isError`：工具执行是否出错（区别于协议本身的错误）

### 3.6 传输方式

| 传输方式 | 适用场景 | 原理 |
|----------|----------|------|
| **stdio** | 本地工具（文件系统、代码执行） | Host fork 子进程，通过 stdin/stdout 通信 |
| **HTTP + SSE** | 远程服务、微服务部署 | POST 发送请求，GET /sse 长连接接收推送 |
| **WebSocket** | 需要全双工实时通信 | 单连接双向通信 |

---

## 4. A2A — Agent-to-Agent Protocol

### 4.1 设计背景

A2A 由 Google 于 2025 年 4 月发布，专门解决 **Agent 之间如何互相委派和协作**。

MCP 解决的是"Agent 调用工具"，A2A 解决的是"Agent 调用另一个 Agent"。一句话区分：

> MCP：Agent → 工具  
> A2A：Agent → Agent

**核心设计理念：**
- 每个 Agent 通过 **Agent Card** 公开自己的能力，可被动态发现
- 所有交互围绕 **Task** 展开，任务有完整的生命周期状态机
- 消息支持多模态（文本、文件、结构化数据）
- 长时任务通过 SSE 流式推送进度，不强制同步等待

### 4.2 架构：Client Agent 与 Remote Agent

```
                  发现阶段
         GET /.well-known/agent.json
                     │
┌──────────────┐     │      ┌──────────────────┐
│ Client Agent │─────────→  │   Remote Agent   │
│  （发起方）   │  tasks/send│    （执行方）      │
│              │←────────── │                  │
└──────────────┘ Task Result└──────────────────┘
```

### 4.3 Agent Card — Agent 的能力名片

每个 A2A Agent 在 `/.well-known/agent.json` 暴露自描述文件，供其他 Agent 发现和了解其能力：

```json
{
  "name": "CodeReviewAgent",
  "description": "专业代码审查 Agent，支持多种语言",
  "url": "https://code-review.example.com",
  "version": "2.1.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": true,
    "stateTransitionHistory": true
  },
  "authentication": {
    "schemes": ["Bearer"]
  },
  "skills": [
    {
      "id": "review_python",
      "name": "Python 代码审查",
      "description": "检查风格、安全性和性能问题",
      "tags": ["python", "security"],
      "inputModes": ["text", "file"],
      "outputModes": ["text"]
    }
  ]
}
```

> **关键字段说明**  
> `capabilities.streaming`：是否支持 SSE 流式输出  
> `capabilities.pushNotifications`：是否支持 Webhook 回调  
> `skills`：Agent 具体能做什么，供 Orchestrator 决策时参考  
> `inputModes / outputModes`：支持的输入输出类型

### 4.4 Task — 任务的完整生命周期

Task 是 A2A 的核心数据结构，状态机如下：

```
submitted ──→ working ──→ completed
                │
                ├──→ input-required ──→ working（Client 补充信息后继续）
                │
                ├──→ failed
                └──→ canceled
```

Task 对象示例：

```json
{
  "id": "task-f47ac10b-58cc",
  "sessionId": "session-abc-123",
  "status": {
    "state": "working",
    "message": {
      "role": "agent",
      "parts": [{ "type": "text", "text": "正在分析代码，已完成 60%..." }]
    },
    "timestamp": "2026-06-30T10:30:00Z"
  },
  "artifacts": [],
  "history": [
    { "state": "submitted", "timestamp": "2026-06-30T10:29:55Z" },
    { "state": "working",   "timestamp": "2026-06-30T10:29:56Z" }
  ]
}
```

> **关键字段说明**  
> `sessionId`：关联同一会话内的多个任务，保持上下文连续性  
> `artifacts`：任务产出物，完成后填充  
> `history`：状态变更历史，便于调试和审计

### 4.5 多模态消息体（Message Parts）

A2A 消息支持在同一条消息中混合多种内容类型：

```json
{
  "role": "user",
  "parts": [
    {
      "type": "text",
      "text": "请审查这段代码是否有安全问题"
    },
    {
      "type": "file",
      "file": {
        "name": "main.py",
        "mimeType": "text/x-python",
        "bytes": "aW1wb3J0IG9z..."
      }
    },
    {
      "type": "data",
      "data": { "strictMode": true, "checkSecurity": true }
    }
  ]
}
```

### 4.6 三种交互模式

**① 同步模式**（短任务，秒级完成）
```
Client ──tasks/send──────────────────→ Server
Client ←──Task (state: completed)───── Server
```

**② 流式订阅模式**（长任务，实时推送进度）
```
Client ──tasks/sendSubscribe─────────→ Server  （建立 SSE 连接）
Client ←──event: submitted────────────         （状态推送）
Client ←──event: working──────────────         （进度更新）
Client ←──event: working (中间输出)───         
Client ←──event: completed────────────         （最终结果，连接关闭）
```

**③ 补充信息模式**（Agent 需要更多上下文）
```
Client ──tasks/send──────────────────→ Server
Client ←──Task (state: input-required)─ Server  （Agent 暂停，等待补充）
Client ──tasks/send（携带原 taskId）──→ Server  （Client 提供补充信息）
Client ←──Task (state: completed)────── Server
```

### 4.7 API 端点规范

所有请求发往统一入口，通过 `method` 字段区分操作：

| JSON-RPC 方法 | 说明 |
|--------------|------|
| `tasks/send` | 发送任务，同步等待结果 |
| `tasks/sendSubscribe` | 发送任务，SSE 流式接收 |
| `tasks/get` | 查询任务当前状态 |
| `tasks/cancel` | 取消任务 |
| `tasks/pushNotification/set` | 配置 Webhook 回调地址 |
| `tasks/resubscribe` | 断线后重新订阅 SSE |

---

## 5. ACP — Agent Communication Protocol

### 5.1 设计背景

ACP 由 IBM Research 和 BeeAI 社区于 2025 年 3 月提出，目标是提供一个**极简、语言无关的 Agent 通信标准**。

与 A2A 基于 JSON-RPC 不同，ACP 完全遵循 REST 风格。核心理念：任何能发 HTTP 请求的客户端都能无缝集成，无需了解 JSON-RPC 方言。

**与 A2A 的差异：**

| 维度 | A2A | ACP |
|------|-----|-----|
| 接口风格 | JSON-RPC（单端点） | REST（多端点） |
| 学习成本 | 需了解 JSON-RPC | 标准 HTTP，门槛低 |
| 工具兼容性 | 需专用客户端 | curl、Postman 直接用 |
| 状态管理 | Server 维护 Task 状态 | 无状态，Run 即结果 |

### 5.2 资源模型

ACP 围绕 Agent 和 Run 两个资源组织：

```
/agents                        列出所有可用 Agent
/agents/{agent_id}             查看 Agent 详情与能力
/agents/{agent_id}/runs        创建一次运行（发起任务）
/runs/{run_id}                 查询运行状态
/runs/{run_id}/events          订阅运行事件流（SSE）
```

### 5.3 消息格式

**发起一次运行（POST /agents/{id}/runs）**

```json
{
  "input": [
    {
      "role": "user",
      "parts": [
        {
          "content_type": "text/plain",
          "content": "生成一份 Q2 销售数据分析报告"
        },
        {
          "content_type": "application/json",
          "content": "{\"quarter\": \"Q2\", \"year\": 2026}"
        }
      ]
    }
  ],
  "config": {
    "max_tokens": 4096
  }
}
```

**运行结果（Run 对象）**

```json
{
  "run_id": "run-7f3a9c12",
  "agent_id": "report-writer",
  "status": "completed",
  "created_at": "2026-06-30T10:00:00Z",
  "completed_at": "2026-06-30T10:00:15Z",
  "output": [
    {
      "role": "agent",
      "parts": [
        {
          "content_type": "text/plain",
          "content": "## Q2 2026 销售分析报告\n\n..."
        }
      ]
    }
  ],
  "usage": { "input_tokens": 512, "output_tokens": 1024 }
}
```

> **关键字段说明**  
> `content_type`：使用标准 MIME 类型，与 Web 生态完全对齐  
> `config`：运行时参数，每次可覆盖 Agent 默认配置  
> `usage`：Token 消耗，便于计费和限流

### 5.4 流式响应（SSE 事件流）

长任务通过订阅 `/runs/{run_id}/events` 实时接收进度：

```
event: run.started
data: {"run_id": "run-xxx", "status": "in_progress"}

event: message.delta
data: {"role": "agent", "parts": [{"content_type": "text/plain", "content": "正在分析"}]}

event: message.delta
data: {"role": "agent", "parts": [{"content_type": "text/plain", "content": "Q2 数据..."}]}

event: run.completed
data: {"run_id": "run-xxx", "status": "completed", "output": [...]}
```

---

## 6. ANP — Agent Network Protocol

### 6.1 设计背景

MCP 和 A2A 都假设你**已经知道对方 Agent 的地址**。但在开放网络中，如何发现一个你从未接触过的 Agent？ANP 解决的正是这个问题。

ANP 由开源社区于 2025 年 5 月提出，借鉴了 Web 的 DNS 发现机制和 **去中心化身份（DID）** 技术，目标是构建一个无需中央注册中心、Agent 可以互相发现和信任的网络。

### 6.2 核心概念

#### DID — 去中心化身份标识符

每个 ANP Agent 拥有一个全球唯一的 DID，格式如下：

```
did:web:agent.example.com:agents:data-analyst
 │    │        │                   │
方法  域名    主机地址              Agent 路径
```

DID 与域名绑定，任何人都可以通过标准流程解析和验证，无需中央机构。

#### Agent 描述文档（JSON-LD）

ANP 使用 JSON-LD 格式描述 Agent，包含身份、能力和通信端点：

```json
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://agent-network-protocol.com/context/v1"
  ],
  "id": "did:web:example.com:agents:data-analyst",
  "name": "Data Analyst Agent",
  "service": [
    {
      "id": "#a2a",
      "type": "A2AService",
      "serviceEndpoint": "https://example.com/agents/data-analyst"
    }
  ],
  "capabilities": [
    {
      "type": "DataAnalysis",
      "inputFormats": ["text/csv", "application/json"],
      "outputFormats": ["text/markdown"]
    }
  ],
  "verificationMethod": [
    {
      "id": "#key-1",
      "type": "Ed25519VerificationKey2020",
      "publicKeyMultibase": "z6MkhaXgBZDvotDkL5257..."
    }
  ]
}
```

> **关键字段说明**  
> `service`：实际通信端点，支持指向 A2A 或 ACP 服务  
> `verificationMethod`：公钥，用于验证 Agent 身份，防止伪造  
> `capabilities`：语义化能力描述，机器可读

### 6.3 Agent 发现流程

```
1. 已知对方 DID：did:web:example.com:agents:data-analyst

2. 将 DID 解析为 HTTPS URL：
   https://example.com/.well-known/did.json
   （或 https://example.com/agents/data-analyst/did.json）

3. 获取 DID 文档，找到 serviceEndpoint

4. 验证签名，建立信任关系

5. 通过 serviceEndpoint 发起通信（使用 A2A 或 ACP）
```

### 6.4 ANP 在协议栈中的位置

ANP 是**补充层**，而非竞争协议：

```
ANP      → 负责"找到谁"（发现 + 身份验证）
A2A/ACP  → 负责"怎么说话"（任务通信）
MCP      → 负责"调用什么工具"（工具执行）
```

---

## 7. OpenAI Threads 模型

### 7.1 设计定位

OpenAI Assistants API 的 Threads 模型解决的是**单个 Assistant 内部的对话状态管理**，并非 Agent 间通信协议，但在构建 Multi-Agent 系统时经常作为每个 Agent 的内部记忆层使用。

### 7.2 核心概念

```
Assistant（角色 + 工具配置）
    │
    ├── Thread（对话历史容器）
    │       ├── Message（user）
    │       ├── Message（assistant）
    │       └── Message（user）
    │
    └── Run（在 Thread 上触发一次 Assistant 执行）
            ├── queued → in_progress → completed
            └── requires_action（需调用工具时暂停，等待结果）
```

**核心流程：**
1. 创建 Thread（对话容器）
2. 向 Thread 追加 Message
3. 创建 Run，触发 Assistant 执行
4. 若 Run 状态变为 `requires_action`，说明 Assistant 需要调用外部工具
5. 提交工具执行结果，Run 继续，直到 `completed`

### 7.3 消息格式

```json
// 向 Thread 添加消息
{
  "role": "user",
  "content": "分析这份销售报告",
  "attachments": [
    {
      "file_id": "file-abc123",
      "tools": [{ "type": "file_search" }]
    }
  ]
}

// 触发执行（Run）
{
  "assistant_id": "asst_xxx",
  "instructions": "用中文回答，重点关注异常数据"
}

// 需要工具调用时，Run 暂停
{
  "status": "requires_action",
  "required_action": {
    "type": "submit_tool_outputs",
    "submit_tool_outputs": {
      "tool_calls": [
        {
          "id": "call-zzz",
          "type": "function",
          "function": {
            "name": "get_sales_data",
            "arguments": "{\"period\": \"Q2_2026\"}"
          }
        }
      ]
    }
  }
}
```

### 7.4 在 Multi-Agent 系统中的定位

Threads 适合作为每个 Agent 的**内部记忆**，而非 Agent 间通信的媒介：

```
Orchestrator Agent  （拥有自己的 Thread A）
       │
       │ [A2A 协议]
       ↓
  Worker Agent      （拥有自己的 Thread B）
       │
       │ [MCP 协议]
       ↓
   Tool Server
```

---

## 8. 组合使用：构建完整 Multi-Agent 系统

### 8.1 各层协议分工

实际生产系统中，MCP 和 A2A 通常同时使用，各司其职：

```
用户请求
    ↓
Orchestrator Agent
    ├─[A2A]──→ ResearchAgent（负责搜索资料）
    │               └─[MCP]──→ web_search、web_fetch 工具
    │
    ├─[A2A]──→ AnalysisAgent（负责数据分析）
    │               └─[MCP]──→ python_executor、database 工具
    │
    └─[A2A]──→ WriterAgent（负责撰写报告）
                    └─[MCP]──→ file_write、template_render 工具
```

**分工逻辑：**
- A2A 负责"任务派发"：Orchestrator 把子任务分配给专业 Agent
- MCP 负责"能力执行"：各 Agent 通过工具完成具体操作

### 8.2 典型工作流

以"撰写市场分析报告"为例，完整流程如下：

```
① Orchestrator 接收用户需求，通过 LLM 拆解任务

② 并发发起（A2A tasks/sendSubscribe）：
   - ResearchAgent：搜索行业资料
   - AnalysisAgent：查询内部数据库

③ 两个 Agent 各自通过 MCP 调用工具执行任务
   - SSE 实时推送进度给 Orchestrator

④ Orchestrator 收集两个 Agent 的 Artifact
   整合后通过 A2A 发给 WriterAgent

⑤ WriterAgent 调用 MCP file_write 工具落盘

⑥ Orchestrator 返回最终结果给用户
```

### 8.3 ANP 的加入时机

当系统需要**对外开放或接入第三方 Agent** 时，引入 ANP：

```
外部 Agent（未知地址）
    │
    │ DID 解析（ANP 发现层）
    ↓
找到 serviceEndpoint
    │
    │ A2A / ACP（任务通信层）
    ↓
内部 Orchestrator
```

---

## 9. 关键设计原则

### 9.1 幂等性

Task ID 应由 **Client 生成**（UUID），相同 ID 重复发送返回相同结果。这保证了网络抖动时安全重试，不会产生重复执行。

### 9.2 异步优先

超过 5 秒的任务不应同步等待。两种异步模式选择：

| 场景 | 推荐方式 |
|------|----------|
| 需要实时进度展示 | SSE 流式订阅（`tasks/sendSubscribe`） |
| 不在线、回调触发 | Webhook 推送（`pushNotification`） |
| 简单轮询 | 定时 `tasks/get` 查询状态 |

### 9.3 错误分类处理

```
可重试错误：网络超时、限流（429）→ 指数退避重试
不可重试错误：参数错误（400/422）→ 直接返回，修正后再发
业务错误：任务 failed → 检查 status.message，决定是否重试
```

### 9.4 权限最小化

每个 Agent 只暴露必要的 skill，避免过度授权：

- ResearchAgent：只开放搜索类工具
- AnalysisAgent：只开放数据读取工具，不能写入
- WriterAgent：只开放文件写入工具

### 9.5 上下文隔离

合理设计 sessionId 的粒度：

```
sessionId = 新 UUID（每次任务独立）   → 完全隔离，互不干扰
sessionId = userId（用户维度）        → 同一用户跨任务共享历史
sessionId = workflowId（流程维度）    → 同一工作流内共享状态
```

---

## 10. 选型建议

### 10.1 按场景选型

```
你的场景                              推荐协议
──────────────────────────────────────────────────────
Agent 需要调用本地工具（文件、命令行）  MCP（stdio）
Agent 需要调用远程 API / 数据库        MCP（HTTP+SSE）
Orchestrator 调度多个 Worker Agent     A2A
需要与现有 REST 服务集成               ACP
需要跨组织发现和信任第三方 Agent        ANP
单个 Assistant 的内部记忆管理          OpenAI Threads
```

### 10.2 渐进式落地路径

不必一次引入所有协议，按需逐步扩展：

```
第一步：引入 MCP
  → 让 Agent 能够使用工具
  → 生态最成熟，SDK 完善，上手成本最低

第二步：引入 A2A
  → 系统变复杂后拆分专业 Agent
  → 解决单 Agent 能力边界和上下文瓶颈

第三步：引入 ANP（可选）
  → 有对外开放或接入第三方 Agent 的需求时
  → 目前生态较早期，慎重评估
```

### 10.3 技术栈速查

| 语言 | MCP | A2A | ACP |
|------|-----|-----|-----|
| Python | `pip install mcp` | `pip install a2a-sdk` | `pip install beeai-framework` |
| TypeScript | `npm install @modelcontextprotocol/sdk` | `npm install @a2a/sdk` | `npm install @beeai/framework` |

**主流框架集成支持：**

| 框架 | 协议支持 |
|------|----------|
| LangChain | MCP、A2A 适配器 |
| LlamaIndex | MCP 工具调用 |
| CrewAI | 原生 Multi-Agent，协议无关 |
| AutoGen（微软） | Multi-Agent 协作，协议无关 |

---

## 附录：协议消息速查

### MCP 核心方法

| 方法 | 方向 | 说明 |
|------|------|------|
| `initialize` | C→S | 握手，交换能力声明 |
| `tools/list` | C→S | 获取工具列表 |
| `tools/call` | C→S | 调用工具 |
| `resources/list` | C→S | 获取资源列表 |
| `resources/read` | C→S | 读取资源内容 |
| `prompts/list` | C→S | 获取提示模板列表 |
| `notifications/progress` | S→C | 进度推送（单向） |

### A2A 核心方法

| 方法 | 说明 |
|------|------|
| `tasks/send` | 同步发送任务，等待完成 |
| `tasks/sendSubscribe` | 发送任务，SSE 流式接收进度 |
| `tasks/get` | 查询任务当前状态 |
| `tasks/cancel` | 取消进行中的任务 |
| `tasks/pushNotification/set` | 配置 Webhook 回调 |
| `tasks/resubscribe` | 断线后重新订阅 SSE |

### ACP 核心端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/agents` | 列出所有 Agent |
| GET | `/agents/{id}` | 查看 Agent 详情 |
| POST | `/agents/{id}/runs` | 创建 Run（发起任务） |
| GET | `/runs/{id}` | 查询 Run 状态 |
| GET | `/runs/{id}/events` | 订阅 Run 事件流（SSE） |
| DELETE | `/runs/{id}` | 取消 Run |

---
