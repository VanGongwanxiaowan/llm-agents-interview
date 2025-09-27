简单来讲，这个模型可以一定程度上替代动作捕捉，只需要上传一段参考视频，就能把图片中的人物的动作替换为参考视频中的动作。

这个模型是基于  Wan-I2V 构建的，通过修改输入构建方式，将参考图像输入、时间帧引导和环境信息（为了双模式兼容性）统一为共同的符号表示。对于身体运动控制，使用通过空间对齐合并的骨架信号。对于面部表情控制，利用从面部图像中提取的隐式特征作为驱动信号。此外，对于角色替换，还训练了一个辅助的 Relighting LoRA 来增强角色与新环境的融合。



模型地址：http://huggingface.co/Wan-AI/Wan2.2-Animate-14B

<img width="660" height="900" alt="image" src="https://github.com/user-attachments/assets/7fa92dfd-dd3a-4c9a-b654-b671e9af4e84" />
