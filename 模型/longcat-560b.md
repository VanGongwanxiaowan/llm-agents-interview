karminski-牙医
@karminski3
·
Sep 1
美团新发布的大模型 longcat-560b 技术解析

给大家带来 longcat-flash-chat-560b-a18.6-31.3B 技术解析.

首先模型最大的特色是引入了动态的计算预分配机制, 能根据token重要性激活 18.6B-31.3B 的参数范围. 这样做的好处是能一定程度上提升输出速度. 以及平均激活量会下降到27B.

为了防止抖动, 还搞了一个特殊的控制专家来确保计算负载均衡 (PID专家).

另外, 训练上也有创新, 使用了 Shortcut-connected MoE (ScMoE) 来提升流水线密集程度, 以及模型的 Agent 能力也是经过强化的.

当然需要点赞的点还有, 这个是MIT协议的, 更宽松一些.

<img width="914" height="2048" alt="image" src="https://github.com/user-attachments/assets/984d84ea-c1a5-4f98-b4f8-4fcb9982cc81" />
