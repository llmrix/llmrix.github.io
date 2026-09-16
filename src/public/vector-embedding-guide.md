---
title: "向量嵌入与向量检索：从原理到实践的完整指南"
category: Search
date: 2026-09-15 00:00:00
tags: [向量, Embedding, 向量检索, RAG]
summary: "从原理到实践完整讲解向量嵌入与向量检索，理解 RAG、语义搜索与推荐系统背后的核心机制。"
---

# 向量嵌入与向量检索：从原理到实践的完整指南

> 向量嵌入（Embedding）和向量检索（Vector Search）是现代 AI 应用的底层基础设施。理解它们，就理解了 RAG、语义搜索、推荐系统背后的核心机制。

---


计算机天生只懂数字，不懂语义。 你问它「猫和动物哪个更相关」，它没有答案——因为对计算机来说，`"猫"` 和 `"动物"` 都只是字符串，字符串之间没有远近，只有相等与不相等。

向量嵌入解决的正是这个问题：**把任意内容（文字、图片、音频）映射成一串数字，让"语义的远近"变成"数字的距离"。**

---

## 什么是向量嵌入

### 从二维坐标开始理解

想象一张二维地图，横轴代表「动物属性」，纵轴代表「家养属性」：

```text
纵轴（家养程度）
  ↑
1 │  猫 ●        狗 ●
  │
0 │  老虎 ●              苹果 ●
  │
  └──────────────────────────→ 横轴（动物属性）
     0         0.5         1
```

在这张图里：
- **猫** 的坐标是 `[0.9, 0.9]`（动物 + 家养）
- **狗** 的坐标是 `[0.95, 0.85]`（动物 + 家养）
- **老虎** 的坐标是 `[0.8, 0.1]`（动物 + 野生）
- **苹果** 的坐标是 `[0.05, 0.0]`（不是动物）

现在计算「猫和狗」的距离，比「猫和苹果」的距离，数字自然会告诉你：猫和狗更相近。

**向量嵌入做的就是这件事——只不过维度从 2 维变成了 768 维、1536 维甚至更高。** 更高的维度意味着可以同时编码更多语义属性，描述能力更强。

### 一个具体的嵌入示例

调用嵌入模型，输入文本，得到的是一个浮点数列表：

```python
# 输入
text = "今天天气真好"

# 输出（实际会有 1536 个数字，这里截取前 8 个）
embedding = [0.0234, -0.0871, 0.1432, -0.0023, 0.0567, -0.1234, 0.0891, -0.0345, ...]
```

这串数字本身没有人类可读的含义，但它在高维空间中的**位置**，精确地编码了「今天天气真好」这句话的语义。

> **核心直觉**：语义相似的内容，在高维空间中的坐标距离更近。

---

## 向量嵌入的处理过程

我们从原始文本输入，一步步拆解到嵌入向量的生成过程，并搞清楚每一步发生了什么。

### 第一步：文本分块（Chunking）

嵌入模型有 Token 数量上限（通常 512 ～ 8192 Token）。超出限制的文本需要先切割成较小的块，再分别嵌入。

**为什么分块策略很重要？**

分块的边界决定了每个向量"代表什么"。分块太小，单个向量缺乏上下文；分块太大，超出模型限制或语义被稀释。

```python
# 示例：按字符数分块，带重叠（overlap）
def chunk_text(text, chunk_size=500, overlap=50):
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap  # 向前移动时保留部分重叠，避免截断语义
    return chunks

text = "向量嵌入是将文本映射到高维空间的技术..." * 10
chunks = chunk_text(text)
# 输出：['向量嵌入是将文本映射到高维空间的技术...（前500字）', '...（重叠50字）...（501~950字）', ...]
```

重叠（overlap）的意义：假设一句关键信息恰好被切割在两块的边界，重叠窗口能确保这句话至少完整出现在某一块中，不会被割裂而丢失语义。

**常见分块策略对比：**

| 策略 | 做法 | 适用场景 | 缺点 |
|------|------|----------|------|
| 固定字符数 | 每 N 个字符切一刀 | 通用场景 | 可能截断句子 |
| 按句子/段落 | 以句号、换行为边界 | 文章、报告 | 块长度不均匀 |
| 语义分块 | 用模型检测语义边界 | 高质量 RAG | 成本较高 |
| 递归分块 | 优先段落 > 句子 > 字符 | 结构化文档 | 实现稍复杂 |

### 第二步：Token 化（Tokenization）

文本块在进入嵌入模型之前，需要先被转换成模型能理解的**Token ID 序列**。

**什么是 Token？**

Token 不等于字或词，而是模型词表（Vocabulary）中的最小单位。不同模型使用不同的分词方法（如 BPE、WordPiece）。

```python
# 以 tiktoken（OpenAI 的分词库）为例
import tiktoken

enc = tiktoken.get_encoding("cl100k_base")  # GPT-4 / text-embedding-3 使用的编码

text = "向量嵌入很有用"
tokens = enc.encode(text)
print(tokens)
# 输出：[37955, 37955, 11525, 43380, 58358, 27384]  ← 每个数字对应词表中的一个 Token

print(f"字符数：{len(text)}，Token 数：{len(tokens)}")
# 字符数：7，Token 数：6
```

> **注意**：中文的 Token 效率通常低于英文。一个中文字往往对应 1～3 个 Token，计算 Token 数量时需考虑这一点，避免超出模型的上下文限制。

### 第三步：模型前向传播（Forward Pass）

Token ID 序列被送入 Transformer 编码器，经过多层注意力机制处理后，输出一个**语义向量**。

这一步是黑盒中最核心的部分，理解其大致原理有助于判断嵌入质量：

```text
输入 Token 序列
       ↓
[Embedding Layer] ← 将每个 Token ID 映射为初始向量（词向量）
       ↓
[Transformer Block × N]
   ├─ Self-Attention：让每个 Token "看到"其他所有 Token，融合上下文
   └─ Feed-Forward：对每个位置做非线性变换，提取更深层特征
       ↓
[Pooling Layer] ← 把所有 Token 的输出向量压缩成一个向量
       ↓
输出：一个 d 维向量（d = 768 / 1536 / 3072 ...）
```

**Pooling 层在做什么？**

一段文本有多个 Token，每个 Token 都有自己的向量输出。Pooling 层负责把这些向量"压缩"成一个代表整段文本的向量：

```python
# 常见的 Pooling 方式（伪代码示意）

token_vectors = model_output  # shape: (seq_len, hidden_dim)，如 (128, 768)

# 方式 1：取 [CLS] Token 的向量（BERT 系模型常用）
sentence_vector = token_vectors[0]  # 第一个 Token 是特殊的 [CLS]，被训练为代表整句语义

# 方式 2：Mean Pooling（对所有 Token 向量取平均，sentence-transformers 常用）
sentence_vector = token_vectors.mean(axis=0)  # shape: (768,)
```

Mean Pooling 的直觉：每个 Token 都贡献一点信息，最终的句子向量是所有词义的"平均综合"。

### 第四步：归一化（Normalization）

大多数生产级嵌入模型在输出前会对向量做 **L2 归一化**，使向量的模长（magnitude）等于 1，变成一个单位向量。

```python
import numpy as np

# 未归一化的向量
raw_vector = np.array([0.3, -0.8, 0.5, 0.2])

# L2 归一化
norm = np.linalg.norm(raw_vector)         # 计算模长：√(0.3² + 0.8² + 0.5² + 0.2²) ≈ 0.99
normalized_vector = raw_vector / norm     # 每个分量除以模长

print(np.linalg.norm(normalized_vector))  # 输出：1.0
```

**归一化的意义**：归一化之后，余弦相似度（cosine similarity）等价于点积（dot product），检索计算更快，且消除了向量长度差异带来的干扰（长文本的向量模长天然更大，归一化使比较更公平）。

### 完整流程示例

以下是调用 OpenAI Embedding API 的完整最简示例，把上述步骤串联起来：

```python
from openai import OpenAI

client = OpenAI()

def get_embedding(text: str) -> list[float]:
    """对单段文本生成嵌入向量"""
    response = client.embeddings.create(
        input=text,
        model="text-embedding-3-small"  # 1536 维，性价比较高
    )
    return response.data[0].embedding

# 单条文本
vec = get_embedding("向量嵌入是什么")
print(f"向量维度：{len(vec)}")   # 1536
print(f"前 5 个值：{vec[:5]}")  # [0.023, -0.087, 0.143, ...]

# 批量文本（推荐，减少 API 调用次数）
texts = [
    "今天天气真好",
    "天气非常晴朗",
    "股票市场大跌",
]
response = client.embeddings.create(input=texts, model="text-embedding-3-small")
vectors = [item.embedding for item in response.data]
# vectors[0] 对应 texts[0]，以此类推
```

> **实践建议**：批量调用 API（一次传入多条文本）比逐条调用效率高得多，通常速度提升 5～10 倍，且费用相同。

---

## 向量匹配：相似度的计算

生成了向量之后，问题变成：**怎么衡量两个向量有多"像"？**

### 余弦相似度（Cosine Similarity）

最常用的相似度度量方式。它不关心向量的长度，只关心两个向量的**方向是否一致**。

```text
cos(θ) = (A · B) / (|A| × |B|)

结果范围：-1 到 1
  1  → 方向完全相同，语义一致
  0  → 方向垂直，语义无关
 -1  → 方向完全相反（实践中很少出现负值）
```

**用代码验证直觉：**

```python
import numpy as np

def cosine_similarity(a: list[float], b: list[float]) -> float:
    a, b = np.array(a), np.array(b)
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

# 获取三句话的向量
vec_cat    = get_embedding("猫是一种家养动物")
vec_dog    = get_embedding("狗是人类的好朋友")
vec_stock  = get_embedding("今日股市大盘下跌")

# 计算相似度
print(cosine_similarity(vec_cat, vec_dog))    # 示例输出：0.87  ← 较高（同为宠物话题）
print(cosine_similarity(vec_cat, vec_stock))  # 示例输出：0.21  ← 较低（话题完全不同）
```

数字直观地印证了直觉：**猫和狗的语义距离，远小于猫和股市的语义距离。**

### 欧氏距离（Euclidean Distance）

另一种度量方式，计算两点在空间中的直线距离：

```python
def euclidean_distance(a: list[float], b: list[float]) -> float:
    a, b = np.array(a), np.array(b)
    return np.linalg.norm(a - b)

# 距离越小，越相似
print(euclidean_distance(vec_cat, vec_dog))    # 示例输出：0.51
print(euclidean_distance(vec_cat, vec_stock))  # 示例输出：1.24
```

> **如何选择？** 向量已归一化时，余弦相似度和欧氏距离的排序结果等价，选哪个都行。实践中余弦相似度更主流，因为它对向量模长不敏感，且值域 [-1, 1] 更直觉。

### 相似度矩阵：批量理解语义关系

对多个文本两两计算相似度，可以直观地看到语义聚类：

```python
texts = [
    "猫是一种家养动物",    # 0
    "狗是人类的好朋友",    # 1
    "老虎生活在丛林中",    # 2
    "股票今天大涨",        # 3
    "基金收益如何",        # 4
]

# 批量获取向量
response = client.embeddings.create(input=texts, model="text-embedding-3-small")
vecs = [item.embedding for item in response.data]

# 计算相似度矩阵
n = len(texts)
matrix = [[round(cosine_similarity(vecs[i], vecs[j]), 2) for j in range(n)] for i in range(n)]

# 打印矩阵（示例值）
#          猫    狗    老虎  股票  基金
# 猫   [ 1.00, 0.87, 0.78, 0.21, 0.19 ]
# 狗   [ 0.87, 1.00, 0.75, 0.22, 0.20 ]
# 老虎 [ 0.78, 0.75, 1.00, 0.18, 0.17 ]
# 股票 [ 0.21, 0.22, 0.18, 1.00, 0.88 ]
# 基金 [ 0.19, 0.20, 0.17, 0.88, 1.00 ]
```

矩阵清晰地呈现出两个语义群：**动物群**（猫、狗、老虎之间相似度高）和**金融群**（股票、基金之间相似度高），两群之间的相似度很低。

---

## 向量检索：在大量向量中找最近邻

有了向量，有了相似度计算方法，下一步是解决**规模问题**：数据库里存了 100 万条向量，用户查询一条，如何快速找到最相似的 Top-K 条？

### 暴力搜索（Brute-Force）

最直接的方案：把查询向量和数据库里每一条向量都算一遍相似度，取最大的 K 个。

```python
def brute_force_search(query_vec, all_vecs, top_k=3):
    """暴力搜索最相似的 top_k 条"""
    scores = [(i, cosine_similarity(query_vec, vec)) for i, vec in enumerate(all_vecs)]
    scores.sort(key=lambda x: x[1], reverse=True)
    return scores[:top_k]
```

- **优点**：实现简单，结果精确（100% 召回）
- **缺点**：时间复杂度 O(N × d)，N = 向量数量，d = 向量维度。100 万条 × 1536 维，每次查询需要做 15 亿次乘法，延迟不可接受

### 近似最近邻（ANN）

生产场景用 **ANN（Approximate Nearest Neighbor，近似最近邻）** 算法，用少量精度换取百倍速度提升。

最主流的算法是 **HNSW（Hierarchical Navigable Small World）**，通俗理解：

```text
把向量组织成一张多层图，越高层的节点越少，覆盖范围越广

第 2 层（稀疏）：●───────────────●
第 1 层（中等）：●───●───────────●───●
第 0 层（完整）：●─●─●─●─●─●─●─●─●─●

检索时从顶层入口节点开始，贪心地向"更近的邻居"移动，
逐层下降，最终在底层找到近似最近邻

效果：O(log N) 的查询速度，精度通常在 95%~99%
```

### 使用向量数据库

向量数据库封装了 ANN 索引，提供存储、管理、检索一体化的服务。

**以 Qdrant（开源向量数据库）为例：**

```python
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

# 1. 连接数据库（本地内存模式，无需额外安装）
client = QdrantClient(":memory:")

# 2. 创建集合（相当于建一张表）
client.create_collection(
    collection_name="articles",
    vectors_config=VectorParams(
        size=1536,             # 向量维度，必须和嵌入模型一致
        distance=Distance.COSINE  # 距离度量方式
    )
)

# 3. 写入向量（假设已经用上文的 get_embedding 生成好了）
documents = [
    {"id": 1, "text": "猫是一种家养动物", "category": "动物"},
    {"id": 2, "text": "狗是人类的好朋友", "category": "动物"},
    {"id": 3, "text": "老虎生活在丛林中", "category": "动物"},
    {"id": 4, "text": "股票今天大涨",     "category": "金融"},
    {"id": 5, "text": "基金收益如何",     "category": "金融"},
]

points = [
    PointStruct(
        id=doc["id"],
        vector=get_embedding(doc["text"]),   # 生成向量
        payload={"text": doc["text"], "category": doc["category"]}  # 存储原始数据
    )
    for doc in documents
]
client.upsert(collection_name="articles", points=points)

# 4. 查询：找最相似的 2 条
query_text = "我想养一只宠物"
query_vec = get_embedding(query_text)

results = client.search(
    collection_name="articles",
    query_vector=query_vec,
    limit=2
)

for r in results:
    print(f"得分：{r.score:.3f} | 文本：{r.payload['text']}")

# 示例输出：
# 得分：0.831 | 文本：狗是人类的好朋友
# 得分：0.812 | 文本：猫是一种家养动物
```

---

## 端到端串起来：RAG 场景完整示例

将上述所有步骤组合成一个完整的 RAG（Retrieval-Augmented Generation，检索增强生成）流程：

```text
用户提问
   ↓
问题向量化（get_embedding）
   ↓
向量检索（search top-K）
   ↓
取出相关文本段落
   ↓
拼入 Prompt 发给 LLM
   ↓
LLM 结合上下文生成回答
```

```python
from openai import OpenAI

openai_client = OpenAI()

def rag_answer(user_question: str, top_k: int = 3) -> str:
    """完整的 RAG 流程：检索 + 生成"""

    # Step 1：问题向量化
    query_vec = get_embedding(user_question)

    # Step 2：向量检索
    results = client.search(
        collection_name="articles",
        query_vector=query_vec,
        limit=top_k
    )

    # Step 3：拼接检索到的上下文
    context = "\n".join(
        f"- {r.payload['text']} (相似度：{r.score:.2f})"
        for r in results
    )

    # Step 4：构造 Prompt，发给 LLM
    prompt = f"""根据以下参考信息回答用户问题。

参考信息：
{context}

用户问题：{user_question}

回答："""

    response = openai_client.chat.completions.create(
        model="claude-sonnet-4-6",
        messages=[{"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content

# 运行示例
answer = rag_answer("我想养一只小动物，推荐什么？")
print(answer)
# LLM 会结合检索到的「猫是家养动物」「狗是人类好朋友」这两段内容来回答
```

---

## 常见坑与注意事项

### 坑 1：嵌入模型不一致

写入时用 `text-embedding-3-small`，查询时换成了 `text-embedding-3-large`——这两个模型的向量空间完全不同，检索结果会乱。

> **规则**：写入和查询必须使用完全相同的嵌入模型。换模型就要重新生成所有向量。

### 坑 2：分块策略影响上限

分块切割了一句关键信息的上下文，导致检索召回率低。解决方案：调整 chunk_size 和 overlap，或改用语义分块。

### 坑 3：没有归一化直接用点积

部分数据库支持用点积（dot product）替代余弦相似度以加速查询，但前提是向量必须已归一化。OpenAI 的嵌入 API 默认已归一化；本地模型需要手动检查。

### 坑 4：向量维度设置错误

创建集合时指定的 `size` 必须和实际嵌入向量的维度一致。不一致时数据库会报错或写入失败，且错误信息有时不够直观。

### 坑 5：忽略过滤条件

向量检索支持在相似度搜索的同时加入结构化过滤（如只检索某个 category 的文档），不加过滤会从全量数据里检索，召回噪音更多：

```python
from qdrant_client.models import Filter, FieldCondition, MatchValue

results = client.search(
    collection_name="articles",
    query_vector=query_vec,
    query_filter=Filter(
        must=[FieldCondition(key="category", match=MatchValue(value="动物"))]
    ),
    limit=3
)
```

---

## 向量数据库选型参考

| 数据库 | 部署方式 | 适用场景 | 特点 |
|--------|----------|----------|------|
| Qdrant | 本地 / 云托管 | 中大型生产 | Rust 实现，性能强，过滤能力强 |
| Chroma | 本地嵌入 | 快速原型 / 本地开发 | 安装极简，Python 原生 |
| Pinecone | 纯云服务 | 无运维需求 | 托管全托，开箱即用 |
| pgvector | PostgreSQL 插件 | 已有 PG 基础设施 | 无需新增数据库，SQL 友好 |
| Weaviate | 本地 / 云托管 | 复杂语义检索 | 内置模块化 ML 流水线 |

---

## 总结

| 环节 | 做什么 | 核心要点 |
|------|--------|----------|
| 文本分块 | 把长文本切成小块 | 控制块大小，加 overlap |
| Token 化 | 文本 → Token ID 序列 | 注意模型 Token 上限 |
| 模型推理 | Token → 语义向量 | Transformer 编码 + Pooling |
| 归一化 | 统一向量模长为 1 | 消除长度干扰，加速计算 |
| 相似度计算 | 余弦相似度 / 欧氏距离 | 归一化后两者等价 |
| 向量检索 | ANN 找 Top-K 最近邻 | HNSW 是主流索引算法 |
| RAG 组合 | 检索 + 生成串联 | 模型一致性是关键约束 |

向量嵌入和检索的本质，是把"语言的理解"外包给了训练好的神经网络，再把"距离计算"变成一个高效的工程问题。理解了这条链路，就掌握了现代语义搜索和 RAG 系统的核心骨架。

---

## 参考资料

- [OpenAI Embeddings 官方文档](https://platform.openai.com/docs/guides/embeddings) — API 参数说明与最佳实践
- [Qdrant 官方文档](https://qdrant.tech/documentation/) — 向量数据库完整使用指南
- [sentence-transformers 文档](https://www.sbert.net/) — 开源本地嵌入模型库
- [HNSW 算法论文](https://arxiv.org/abs/1603.09320) — Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs
- [LangChain Text Splitters 文档](https://python.langchain.com/docs/concepts/text_splitters/) — 主流分块策略的工程实现参考
