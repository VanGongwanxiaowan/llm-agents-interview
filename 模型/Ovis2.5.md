karminski-牙医
@karminski3
·
Aug 18
阿里国际数字贸易集团的AI团队 (AIDC-Al ) 刚刚发布了新模型—— Ovis2.5，分为9B和2B版本。

从模型卡上看这是个经济型的视觉推理模型，即在9B和2B这个规模内做到了不错的结果。

模型的特性有：

原生分辨率感知 — 使用的 NaViT 视觉编码器在无损平铺的情况下保留精细细节和全局结构。
深度推理能力 — 可选思考模式(可能复用了一部分Qwen3的特性？)，在线性 CoT 之外进行自我检查和修订。支持思考预算。
图表与文档 OCR — 在其规模上（9B/2B）达到最先进水平，用于复杂图表分析、文档理解（包括表格和表单）以及 OCR。
广泛任务覆盖 — 在图像推理、视频理解和 grounding 基准测试上展现出先进性能，展示出强大的通用多模态能力。

<img width="650" height="680" alt="image" src="https://github.com/user-attachments/assets/a12e9db8-02df-4212-a771-35d7dfced875" />

<img width="900" height="600" alt="image" src="https://github.com/user-attachments/assets/c2f6413a-d4d6-451a-8660-96c044030291" />
