「LLM, Async Decoding」论文

Learning to Keep a Promise: Scaling Language Model Decoding Parallelism with Learned Asynchronous Decoding

融合自然语言与机器语言，在模糊与精确之间，PASTA 让大语言模型突破逐字阻塞，实现异步 decoding。

Excellent paper! 

作者提出 PASTA (Parallel Structure Annotation)，试图从根本上解决 LLM 解码效率问题。

背景：LLM decoding 的 bottleneck
LLM 的 autoregressive 解码有着苛刻条件：必须先生成第 t 个 token，再连同全部历史 context 回送模型，才能生成第 t + 1 个 token。这导致没有并行能力。

因此，在推理阶段，即便 GPU/TPU 并行能力强大，绝大多数算力仍在等待“下一个 token 的条件”到位，硬件利用率低下。

方法：PASTA 的两大组件
- PASTA-Lang   混合关键标记的结构化标注语言
- PASTA Interpreter  运行时识别标记 → 启动 / 合并并行线程

Pasta-Lang 三个关键标记：
- <promise/>        “这里稍后填充独立子任务的结果”
- <async …>…</async>        包裹可并行生成的片段
- <sync/>        主线程等待所有异步线程完成再继续

比如我们要LLM执行一个research 任务，“总结中国，日本各自的近代史， 然后对比总结”：

主线程：
<promise topic="中国近代史"/>  
<promise topic="日本近代史"/>  
<sync/>  对比总结：

子线程：
<async topic="中国近代史">
中国近代史始于……
</async>
<async topic="日本近代史">
日本近代史……
</async>

看到这里，你会明白PASTA的本质是一种新语言，把模糊的人类的自然语言变为更结构化的偏机器的语言。

Sturcture annotation language，如同XML, 可以非常方便的把不同的块扔给GPU做并行计算， 让LLM更加适应异步非阻塞计算场景。

为了让LLM学会如何构建这种新的语言结构和decoding方式，作者采用 SFT + PPO两次微调模型得到一系列“更快 / 更准”版本，供不同场景取舍。

在表现上，在真实基准测试任务(AlpacaEval)测试，速度速度拨档，几何平均 1.21 × ~ 1.93 × 加速；同时保持品质基本不掉。

一些思考：
人类阅读速度远慢于模型生成；因此Chatbot的串行生成方式在多数情况下，latency完全可以接受。

但LLM作为计算代理时，它应该“像计算机一样并行，异步思考和计算”。

PASTA 把模糊的人类语言升级为更加精确和容易被机器理解的机构化语言，在token level上，为 LLM 打下了通向parallelism的基础。

当我们回顾LLM的scaling law，语料、参数、算力的尺度渐近饱和。但如同作者所说，parallelism 成为让 LLM 继续scale的第四维。

Inspiring!

https://arxiv.org/abs/2502.11517
