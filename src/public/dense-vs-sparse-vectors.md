# 稠密向量与稀疏向量：两种表示方式的原理、差异与选择

> 向量有两种截然不同的"形态"——稠密向量（Dense Vector）和稀疏向量（Sparse Vector）。它们各自擅长不同的事，理解二者是构建高质量检索系统的前提。

---

## 从一个检索问题出发

假设你的知识库里存了一篇文章，其中有这样一句话：

> "HNSW 索引在构建时使用随机层级分配策略。"

用户提问：**"HNSW 用什么策略分配层级？"**

用语义嵌入（稠密向量）检索时，模型可能把"层级分配"理解成一个宽泛的"图结构优化"话题，反而把其他相关度较低的段落排在了前面——因为它**不一定能精确命中"随机层级分配"这个专有术语**。

这就是稠密向量的盲区。而稀疏向量恰好擅长处理这种情况。

---

## 稠密向量（Dense Vector）

### 是什么

稠密向量是由神经网络（Embedding 模型）生成的**固定维度、几乎每个分量都非零**的向量。

```python
# text-embedding-3-small 生成的向量（1536 维，几乎所有值都非零）
dense_vec = [0.0234, -0.0871, 0.1432, -0.0023, 0.0567, -0.1234, ...]
#            ↑ 非零   ↑ 非零   ↑ 非零   ↑ 非零   ...（1536 个值，极少为 0）

# 稠密程度：非零比例接近 100%
```

"稠密"描述的是向量的结构特征：**大部分维度都有值，没有空洞**。

### 它在编码什么

稠密向量的每一个维度**没有人类可读的含义**。向量是模型训练出来的，每个维度是若干语义特征的混合表达，无法单独解释。

但整体上，它编码了**上下文语义**——同义词、近义词、语义相关的表达，在向量空间中会聚集在一起。

```python
from openai import OpenAI
import numpy as np

client = OpenAI()

def get_dense(text):
    return client.embeddings.create(
        input=text, model="text-embedding-3-small"
    ).data[0].embedding

def cosine_sim(a, b):
    a, b = np.array(a), np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

# 稠密向量捕捉语义等价
v1 = get_dense("这部电影真好看")
v2 = get_dense("这个片子非常精彩")   # 同义改写
v3 = get_dense("今天股市暴跌")       # 话题无关

print(cosine_sim(v1, v2))  # 示例输出：0.92  ← 语义高度相似，即使词汇完全不同
print(cosine_sim(v1, v3))  # 示例输出：0.18  ← 话题无关，相似度低
```

这是稠密向量最核心的能力：**即使用词完全不同，只要语义相近，向量距离就近。**

### 局限性

```python
# 稠密向量可能"泛化过头"的例子
v_hnsw    = get_dense("HNSW 随机层级分配")
v_general = get_dense("图结构索引优化方法")
v_unrelated = get_dense("随机森林决策树")

print(cosine_sim(v_hnsw, v_general))    # 示例输出：0.79  ← 泛化命中（有用）
print(cosine_sim(v_hnsw, v_unrelated))  # 示例输出：0.61  ← 误召回（"随机"这个词带来了干扰）
```

对于专有名词（`HNSW`、`gRPC`、产品型号、人名）、精确术语匹配的需求，稠密向量有时会因为"语义泛化"而把不相关结果拉高。

---

## 稀疏向量（Sparse Vector）

### 是什么

稀疏向量的维度对应**词汇表中的词**，向量的值表示这个词对文档的重要程度。维度极高（通常几万到几十万），但**绝大多数维度为 0**——一篇文章只包含词汇表中极少量的词。

```python
# 假设词汇表只有 5 个词：["猫", "狗", "今天", "HNSW", "索引"]
# 文本："HNSW 是一种高效索引"

sparse_vec = {
    "今天": 0,       # 文中没有出现 → 0
    "猫":   0,       # 文中没有出现 → 0
    "狗":   0,       # 文中没有出现 → 0
    "HNSW": 2.31,   # 出现，且重要（TF-IDF / BM25 权重）
    "索引": 1.87,   # 出现，重要性略低
}

# 实际词汇表有几万个词，绝大多数维度是 0
# 稀疏程度：非零比例通常 < 0.1%
```

"稀疏"描述的正是这个特征：**几乎全是零，只有出现过的词才有非零值**。

### 经典算法：BM25

BM25（Best Match 25）是最广泛使用的稀疏检索算法，是传统全文搜索（Elasticsearch、Lucene）的核心。它的权重公式综合考虑了三个因素：

```text
BM25 权重 = TF 分量 × IDF 分量

TF 分量（词频因子）：
  - 词在文档中出现越多，权重越高
  - 但有上限，避免"重复堆词"刷分
  - 公式：tf(t,d) / (tf(t,d) + k1 × (1 - b + b × dl/avgdl))
    - k1：控制词频饱和速度（通常 1.2~2.0）
    - b：控制文档长度归一化强度（通常 0.75）
    - dl：当前文档长度，avgdl：平均文档长度

IDF 分量（逆文档频率）：
  - 越罕见的词，权重越高（区分度更强）
  - 公式：log((N - df + 0.5) / (df + 0.5) + 1)
    - N：文档总数
    - df：包含该词的文档数
```

用一个直觉例子理解：

```text
文档：10000 篇技术文章

词：  "的"    出现在 9999 篇  → IDF ≈ 0（太普遍，没区分度）
词：  "索引"  出现在 500 篇   → IDF ≈ 3（有一定区分度）
词：  "HNSW"  出现在 12 篇    → IDF ≈ 7（罕见，区分度强）

结论：搜索"HNSW 索引"时，"HNSW" 这个词的贡献权重远大于"索引"
```

### 用代码生成稀疏向量

```python
# 使用 rank_bm25 库演示 BM25 稀疏向量的生成
# pip install rank-bm25

from rank_bm25 import BM25Okapi

# 语料库（实际场景是你的知识库文档）
corpus = [
    "HNSW 索引使用随机层级分配策略",
    "向量检索支持近似最近邻搜索",
    "BM25 是经典的稀疏检索算法",
    "今天天气非常晴朗适合出门",
    "稠密向量由神经网络模型生成",
]

# 分词（中文需要先用 jieba 等分词，这里用空格模拟）
tokenized_corpus = [doc.split() for doc in corpus]

# 建立 BM25 索引
bm25 = BM25Okapi(tokenized_corpus)

# 查询："HNSW 层级分配"
query = "HNSW 层级分配".split()
scores = bm25.get_scores(query)

for doc, score in zip(corpus, scores):
    print(f"得分 {score:.3f} | {doc}")

# 示例输出：
# 得分 3.241 | HNSW 索引使用随机层级分配策略   ← 词汇精确命中，得分最高
# 得分 0.521 | 向量检索支持近似最近邻搜索       ← 部分相关
# 得分 0.000 | 今天天气非常晴朗适合出门         ← 无词汇重叠，得分为 0
```

BM25 的核心特征一目了然：**词汇必须出现才能得分，完全没有词汇重叠则得分为零。**

### 现代稀疏向量：SPLADE

传统 BM25 基于词汇表的精确匹配，SPLADE（Sparse Lexical and Expansion Model）用神经网络对稀疏向量做了升级，让它也具备一定的**语义扩展能力**。

```text
BM25（传统稀疏）：
  输入："买手机"
  向量非零项：{"买": 1.2, "手机": 2.1}
  → 只能匹配包含"买"或"手机"的文档

SPLADE（神经稀疏）：
  输入："买手机"
  向量非零项：{"买": 1.1, "手机": 2.0, "购买": 0.8, "智能手机": 0.7, "iPhone": 0.3, ...}
  → 模型自动做了词汇扩展，能匹配"购买智能手机"这类表达
```

SPLADE 保留了稀疏向量的高效性和可解释性，同时弥补了纯词汇匹配的语义缺口。

---

## 核心差异对比

### 结构差异直观对比

```text
同一句话："HNSW 是一种向量索引算法"

稠密向量（1536 维，几乎全非零）：
[0.023, -0.087, 0.143, 0.056, -0.023, 0.091, -0.034, 0.078, ...]
 ↑每个维度都有值，无人类可读含义，维度少但语义丰富

稀疏向量（50000 维，绝大多数为 0）：
{"HNSW": 3.21, "向量": 1.87, "索引": 2.14, "算法": 1.56}
 ↑只有出现过的词有值，维度直接对应词汇，可解释，但极度稀疏
```

### 全面对比表

| 维度 | 稠密向量 | 稀疏向量 |
|------|----------|----------|
| **生成方式** | 神经网络（Embedding 模型） | 统计算法（BM25）或神经稀疏模型（SPLADE） |
| **典型维度数** | 768 ～ 3072（几乎全非零） | 30,000 ～ 100,000+（非零占比 < 0.1%） |
| **语义理解** | 强，能理解同义词、近义词 | 弱（BM25）/ 中等（SPLADE） |
| **精确匹配** | 弱，专有名词可能被泛化 | 强，词汇必须出现才得分 |
| **OOV 问题** | 无，模型处理未登录词 | 有，词汇表外的词得分为 0 |
| **可解释性** | 低，维度无含义 | 高，维度直接对应词汇 |
| **存储效率** | 低（全量浮点数） | 高（只存非零项） |
| **检索速度** | 需 ANN 近似搜索 | 倒排索引，精确且快 |
| **跨语言能力** | 多语言模型支持跨语言检索 | 依赖分词，跨语言差 |
| **代表工具** | OpenAI Embedding、sentence-transformers | Elasticsearch/BM25、SPLADE |

### 各自的"死穴"举例

```text
场景：检索"PyTorch 2.0 的 torch.compile 接口变更"

稠密向量的问题：
  → "torch.compile" 是专有 API 名，模型可能把它泛化成"编译优化"的语义
  → 结果：召回了一堆讲"编译器优化原理"的文章，而非 PyTorch 的具体接口文档

稀疏向量的问题：
  → 用户换了个说法："PyTorch 的图编译功能怎么用？"
  → "torch.compile" 没出现在查询词中 → BM25 得分为 0 → 完全漏掉

结论：两种方式各有盲区，单用任一种都有损失。
```

---

## 混合检索（Hybrid Search）

### 为什么要混合

稠密向量捕捉**语义相关性**，稀疏向量捕捉**词汇精确性**。两者互补：

```text
查询："transformer 的 multi-head attention 具体实现"

稠密向量找到：
  ✓ "自注意力机制的工作原理"（语义相关，但词汇不完全匹配）
  ✗ 可能漏掉精确匹配的代码实现片段

稀疏向量找到：
  ✓ 所有包含 "multi-head attention" 字面量的文档
  ✗ 漏掉描述"多头注意力"的中文文档

混合结果：
  ✓ 既覆盖语义相关的内容，又精确命中术语
```

### RRF 融合算法

混合检索的核心问题是：如何把两套不同尺度的得分合并成一个排序？

**RRF（Reciprocal Rank Fusion，倒数排名融合）** 是最常用的方案，不依赖分数绝对值，只看排名位置：

```python
def rrf_score(rank: int, k: int = 60) -> float:
    """
    rank：文档在某个结果列表中的排名（从 1 开始）
    k：平滑参数，通常取 60，防止排名靠前的结果过度主导
    """
    return 1.0 / (k + rank)

def hybrid_search(query, dense_results, sparse_results, top_k=5):
    """
    dense_results：稠密检索结果列表 [(doc_id, score), ...]，按得分降序
    sparse_results：稀疏检索结果列表 [(doc_id, score), ...]，按得分降序
    """
    scores = {}

    # 稠密向量的 RRF 得分
    for rank, (doc_id, _) in enumerate(dense_results, start=1):
        scores[doc_id] = scores.get(doc_id, 0) + rrf_score(rank)

    # 稀疏向量的 RRF 得分
    for rank, (doc_id, _) in enumerate(sparse_results, start=1):
        scores[doc_id] = scores.get(doc_id, 0) + rrf_score(rank)

    # 按 RRF 总分排序
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return ranked[:top_k]

# 示例
dense_results  = [("doc_A", 0.92), ("doc_B", 0.85), ("doc_C", 0.71)]
sparse_results = [("doc_C", 8.3),  ("doc_A", 6.1),  ("doc_D", 5.9)]

results = hybrid_search("HNSW 层级分配", dense_results, sparse_results)
# doc_A：在稠密排名 1（0.0164）+ 稀疏排名 2（0.0161）= 0.0325
# doc_C：在稠密排名 3（0.0159）+ 稀疏排名 1（0.0164）= 0.0323
# doc_B：仅在稠密排名 2（0.0161）= 0.0161
# doc_D：仅在稀疏排名 3（0.0156）= 0.0156
print(results)
# [('doc_A', 0.0325), ('doc_C', 0.0323), ('doc_B', 0.0161), ('doc_D', 0.0156)]
```

RRF 的优势：**不需要对稠密分数（余弦相似度 0～1）和稀疏分数（BM25 绝对值 0～10+）做归一化**，只看排名，天然规避了量纲不统一的问题。

### 使用 Qdrant 实现混合检索

```python
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, SparseVectorParams,
    PointStruct, SparseVector,
    NamedVector, NamedSparseVector
)

client = QdrantClient(":memory:")

# 创建同时支持稠密和稀疏向量的集合
client.create_collection(
    collection_name="hybrid_docs",
    vectors_config={
        "dense": VectorParams(size=1536, distance=Distance.COSINE)
    },
    sparse_vectors_config={
        "sparse": SparseVectorParams()
    }
)

# 写入文档（需要同时提供稠密和稀疏向量）
def text_to_sparse(text: str) -> SparseVector:
    """简化版稀疏向量生成（实际应使用 BM25 或 SPLADE）"""
    words = text.split()
    # 用词的哈希值作为维度索引（仅供演示，实际用词汇表）
    indices = [hash(w) % 30000 for w in set(words)]
    values  = [1.0] * len(indices)
    return SparseVector(indices=indices, values=values)

documents = [
    "HNSW 索引使用随机层级分配策略",
    "向量检索支持近似最近邻搜索",
    "今天天气非常晴朗适合出门",
]

points = [
    PointStruct(
        id=i,
        vector={
            "dense":  get_dense(doc),          # 稠密向量
            "sparse": text_to_sparse(doc),     # 稀疏向量
        },
        payload={"text": doc}
    )
    for i, doc in enumerate(documents)
]
client.upsert(collection_name="hybrid_docs", points=points)

# 混合检索查询
query = "HNSW 层级分配"
dense_results  = client.search(
    collection_name="hybrid_docs",
    query_vector=NamedVector(name="dense", vector=get_dense(query)),
    limit=10
)
sparse_results = client.search(
    collection_name="hybrid_docs",
    query_vector=NamedSparseVector(
        name="sparse", vector=text_to_sparse(query)
    ),
    limit=10
)

# 用 RRF 融合两个结果列表
dense_list  = [(r.id, r.score) for r in dense_results]
sparse_list = [(r.id, r.score) for r in sparse_results]
final = hybrid_search(query, dense_list, sparse_list, top_k=3)
print(final)
```

### 使用 Elasticsearch 实现混合检索

Elasticsearch 8.x 原生支持混合检索，不需要外部 RRF 融合步骤——`knn`（稠密向量）和 `match`（BM25 全文）可以在同一个请求里发出，由 ES 内置的 RRF 排序器完成融合。

**前提条件：** Elasticsearch 8.8+ 并安装 Python 客户端 `elasticsearch>=8.8`。

#### 第一步：创建索引

索引 mapping 中同时声明 `dense_vector` 字段（稠密）和普通 `text` 字段（稀疏/BM25）：

```python
from elasticsearch import Elasticsearch

es = Elasticsearch("http://localhost:9200")

index_name = "hybrid_docs"

# 删除旧索引（开发阶段方便重建）
if es.indices.exists(index=index_name):
    es.indices.delete(index=index_name)

es.indices.create(
    index=index_name,
    body={
        "mappings": {
            "properties": {
                "text": {
                    "type": "text",          # BM25 全文检索字段
                    "analyzer": "ik_max_word"  # 中文分词（需安装 ik 插件）
                    # 英文场景可省略 analyzer，使用默认 standard
                },
                "dense_vector": {
                    "type": "dense_vector",  # 稠密向量字段
                    "dims": 1536,            # 必须与 Embedding 模型维度一致
                    "index": True,           # 开启 HNSW 索引，支持 knn 检索
                    "similarity": "cosine"   # 距离度量方式
                }
            }
        }
    }
)
```

#### 第二步：写入文档

每条文档同时存储原始文本（供 BM25 使用）和稠密向量（供 knn 使用）：

```python
documents = [
    "HNSW 索引使用随机层级分配策略",
    "向量检索支持近似最近邻搜索",
    "BM25 是经典的稀疏检索算法",
    "今天天气非常晴朗适合出门",
    "稠密向量由神经网络模型生成",
]

for i, doc in enumerate(documents):
    es.index(
        index=index_name,
        id=i,
        document={
            "text": doc,
            "dense_vector": get_dense(doc)   # 调用上文定义的 get_dense()
        }
    )

es.indices.refresh(index=index_name)  # 刷新索引，确保数据可查
```

#### 第三步：混合检索（knn + match + RRF）

ES 8.8 引入的 `sub_searches` + `rank.rrf` 是原生混合检索的标准写法，一次请求同时跑 knn 和 BM25，由 ES 内部完成 RRF 融合排序：

```python
query = "HNSW 层级分配"
query_vec = get_dense(query)

response = es.search(
    index=index_name,
    body={
        "sub_searches": [
            # 稠密向量：knn 近似最近邻检索
            {
                "knn": {
                    "field": "dense_vector",
                    "query_vector": query_vec,
                    "k": 10,                  # 候选集大小
                    "num_candidates": 50      # HNSW 探索节点数，越大越准但越慢
                }
            },
            # 稀疏向量：BM25 全文检索
            {
                "query": {
                    "match": {
                        "text": query
                    }
                }
            }
        ],
        # 内置 RRF 融合：k=60 与上文手写版一致
        "rank": {
            "rrf": {
                "rank_constant": 60,   # 对应 rrf_score 中的 k 参数
                "window_size": 50      # 每路结果参与融合的最大条数
            }
        },
        "size": 5   # 最终返回 top 5
    }
)

for hit in response["hits"]["hits"]:
    print(f"得分：{hit['_score']:.4f} | {hit['_source']['text']}")

# 示例输出（RRF 融合后的排序）：
# 得分：0.0325 | HNSW 索引使用随机层级分配策略   ← 稠密 + 稀疏双路命中，RRF 分最高
# 得分：0.0161 | 向量检索支持近似最近邻搜索       ← 仅稠密命中
# 得分：0.0156 | BM25 是经典的稀疏检索算法        ← 仅稀疏命中
```

#### Qdrant vs Elasticsearch 混合检索对比

| 维度 | Qdrant | Elasticsearch |
|------|--------|---------------|
| **稀疏向量支持** | 原生 `sparse_vector` 字段，可存 SPLADE 权重 | `text` 字段 BM25，或 `sparse_vector`（8.11+）|
| **RRF 融合** | 需客户端手动实现（或用内置 Query API） | 内置 `rank.rrf`，一次请求完成 |
| **部署复杂度** | 轻量，单进程启动 | 依赖 JVM，资源占用较高 |
| **中文分词** | 依赖外部分词预处理 | 可安装 ik 插件原生支持 |
| **已有基础设施** | 新引入 | 已有 ES 集群可直接复用 |
| **适合场景** | 新建向量检索项目 | 已有 ES 全文索引，追加语义能力 |

> **选型建议**：如果团队已在使用 Elasticsearch 做全文搜索，直接在现有集群上开启 `dense_vector` 字段并使用 `sub_searches + rank.rrf` 是改造成本最低的混合检索方案；如果是从零开始构建向量检索系统，Qdrant 更轻量直接。

---

## 场景选型指南

### 优先选稠密向量的场景

- **语义搜索**：用户用不同措辞描述同一需求（"怎么减肥" vs "如何瘦身"）
- **问答系统**：问题和答案的用词往往不同，需要跨越词汇鸿沟
- **跨语言检索**：多语言 Embedding 模型支持不同语言查同一内容
- **推荐系统**：基于内容相似度做文章、商品、用户推荐
- **图文检索**：CLIP 等多模态模型统一图片和文字的嵌入空间

### 优先选稀疏向量的场景

- **专有名词检索**：产品型号（iPhone 16 Pro）、API 名称（`torch.compile`）、人名、地名
- **代码搜索**：函数名、变量名、错误信息的精确匹配
- **法律/医疗文档**：术语精确性要求极高，不容许语义泛化
- **日志检索**：精确匹配错误码、IP 地址、TraceID
- **已有 Elasticsearch 基础设施**：改造成本低，直接利用现有全文索引

### 优先选混合检索的场景

- **企业知识库 / RAG**：既有通用问答（需语义），又有术语/产品名检索（需精确）
- **电商搜索**：既理解"便宜的运动鞋"（语义），又精确匹配品牌型号（词汇）
- **学术论文检索**：既要语义相关，又要精确命中作者名、论文标题关键词
- **客服系统**：用户描述模糊，但又夹杂产品型号、订单号等精确信息

```text
决策树：

是否需要精确匹配专有名词 / 术语？
    ├─ 是 → 是否同时需要语义理解？
    │           ├─ 是 → 混合检索（Hybrid Search）
    │           └─ 否 → 稀疏向量（BM25）
    └─ 否 → 稠密向量（Dense Embedding）
```

---

## 存储与性能对比

### 存储占用

```python
import sys

# 稠密向量（1536 维 float32）
dense_vec = [0.023] * 1536
dense_bytes = 1536 * 4  # float32 = 4 字节
print(f"稠密向量大小：{dense_bytes} bytes = {dense_bytes/1024:.1f} KB")
# 输出：稠密向量大小：6144 bytes = 6.0 KB

# 稀疏向量（50000 维，假设 100 个非零项）
sparse_nonzero = 100
sparse_bytes = sparse_nonzero * (4 + 4)  # 每个非零项：索引(int32) + 值(float32)
print(f"稀疏向量大小（100个非零项）：{sparse_bytes} bytes = {sparse_bytes/1024:.2f} KB")
# 输出：稀疏向量大小：800 bytes = 0.78 KB

# 100 万条数据的存储对比
n = 1_000_000
print(f"\n100万条向量存储：")
print(f"稠密：{n * dense_bytes / 1024**3:.1f} GB")   # 约 5.7 GB
print(f"稀疏：{n * sparse_bytes / 1024**3:.2f} GB")  # 约 0.75 GB
```

稀疏向量在存储上有显著优势，尤其当文档数量巨大时。

### 检索性能

| 操作 | 稠密向量 | 稀疏向量 |
|------|----------|----------|
| **索引结构** | HNSW 图索引 | 倒排索引 |
| **查询复杂度** | O(log N)（近似） | O(词频 × 匹配文档数） |
| **精确召回率** | 95% ～ 99%（近似） | 100%（精确） |
| **冷启动速度** | 需要构建图索引，较慢 | 倒排索引增量更新快 |
| **内存占用** | 高（图结构驻留内存） | 低（稀疏存储） |

---

## 总结

稠密向量和稀疏向量不是竞争关系，而是**互补的工具**。

| | 稠密向量 | 稀疏向量 |
|--|----------|----------|
| **核心能力** | 语义理解、同义词匹配 | 词汇精确匹配、术语检索 |
| **致命弱点** | 专有名词泛化、可解释性差 | 词汇鸿沟、跨语言无能为力 |
| **生产建议** | 作为默认基础能力 | 补充精确召回，尤其有专有名词时 |
| **最佳组合** | 混合检索（Hybrid Search）+ RRF 融合 | 同左 |

构建 RAG 或语义检索系统时，**混合检索是兼顾召回率与精确率的工程最优解**。稠密向量负责理解用户意图，稀疏向量负责不漏掉关键词——两者共同保障检索质量的上限。

---

## 参考资料

- [SPLADE 论文](https://arxiv.org/abs/2107.05720) — Sparse Lexical and Expansion Model for First Stage Ranking
- [BM25 算法原文](https://dl.acm.org/doi/10.1561/1500000019) — The Probabilistic Relevance Framework: BM25 and Beyond
- [Qdrant 混合检索文档](https://qdrant.tech/documentation/concepts/hybrid-queries/) — Hybrid Search 官方实践指南
- [Pinecone：Dense vs Sparse Vectors](https://www.pinecone.io/learn/sparse-dense/) — 稠密与稀疏向量的工程对比
- [RRF 论文](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf) — Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods
- [Elasticsearch Hybrid Search 官方文档](https://www.elastic.co/guide/en/elasticsearch/reference/current/knn-search.html) — knn + BM25 + RRF 混合检索使用指南~~
