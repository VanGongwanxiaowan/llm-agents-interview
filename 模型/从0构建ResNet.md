https://medium.com/@g.anirudh15/implementing-resnet-from-scratch-a1bb437b5f05

<img width="1036" height="685" alt="image" src="https://github.com/user-attachments/assets/a66976fe-9e95-4fb4-99f6-3e8fa41f5701" />

# 网页总结：从零实现ResNet（基于PyTorch）
## 一、ResNet核心背景与价值
1. **提出时间与地位**：2015年被提出，是深度学习领域里程碑式的卷积神经网络（CNN）架构，为后续DenseNet、ResNext等现代CNN架构奠定基础，至今仍作为目标检测、图像分割等任务的骨干网络。
2. **核心解决问题**：此前深层神经网络存在“梯度消失/爆炸”问题，堆叠更多层后性能反而不如浅层网络；ResNet通过“残差块”设计突破这一限制，实现深层网络的有效训练。


## 二、ResNet核心原理
1. **残差块与跳跃连接（Skip Connection）**
    - **核心公式**：残差块输出为 \( h(x) = f(x) + x \)，其中 \( x \) 是块的输入，\( f(x) \) 是块内加权层（卷积、归一化等）的输出，\( f(x) = h(x) - x \) 被称为“残差”，网络实际优化的是残差，而非直接优化输出 \( h(x) \)。
    - **跳跃连接作用**：将输入 \( x \) 直接“跳过”块内部分层，与块输出相加，避免梯度在深层传播中衰减，简化训练过程。
2. **两种残差块设计**
    | 块类型 | 结构组成 | 通道扩展因子 | 适用场景 |
    |--------|----------|--------------|----------|
    | 基础块（Basic Block） | 2个3×3卷积层 + 批量归一化（BN）+ ReLU激活 | 1（无通道扩展） | 浅层ResNet（如ResNet18、ResNet34） |
    | 瓶颈块（BottleNeck Block） | 1×1卷积（降维）→ 3×3卷积（特征提取）→ 1×1卷积（升维）+ BN + ReLU | 4（最终通道数为中间层4倍） | 深层ResNet（如ResNet50、ResNet101），减少计算量 |
3. **下采样（Downsample）机制**：当卷积层步长（stride）>1时，输入 \( x \) 与块输出 \( f(x) \) 的形状（尺寸、通道数）不匹配，需通过1×1卷积+BN组成的下采样模块调整 \( x \) 形状，确保两者可相加。


<img width="1302" height="484" alt="image" src="https://github.com/user-attachments/assets/76a2d534-0144-44c3-aaf1-778779131f37" />

```
class BasicBlock(nn.Module):
  
  expansion=1 # expansion is 1 as there is no expansion factor is basic block
  
  def __init__(self, in_channels, out_channels, kernel_size=3, stride=1, downsample=None):
    
    super().__init__()

    self.conv1 = nn.Conv2d(in_channels=in_channels, out_channels=out_channels, kernel_size=3, padding=1, stride=1, bias=False) # 3x3 Conv Layer
    self.bn1 = nn.BatchNorm2d(num_features = out_channels)
    self.relu = nn.ReLU(inplace=True)
    self.conv2 = nn.Conv2d(in_channels=out_channels, out_channels=out_channels, kernel_size=3, padding=1, stride=1, bias=False)
    self.bn2 = nn.BatchNorm2d(num_features=out_channels)
    self.downsample = downsample
  
  def forward(self, x):

    identity = x
    x = self.conv1(x)
    x = self.bn1(x)
    x = self.relu(x)

    x = self.conv2(x)
    x = self.bn2(x)
    
    if self.downsample is not None:
      identity = self.downsample(x)
    
    x += identity
    
    return (self.relu(x))
```
## 三、PyTorch实现细节
### 1. 基础块（BasicBlock）代码核心
- 固定扩展因子为1，包含2个3×3卷积层，通过`downsample`参数接收下采样模块，前向传播中先计算块输出，再与调整后的输入（identity）相加，最后经ReLU激活。

### 2. 瓶颈块（BottleNeckBlock）代码核心
- 扩展因子为4，基础通道宽度（base_width）设为64，通过3个卷积层（1×1→3×3→1×1）实现“降维-提特征-升维”，其余逻辑与基础块一致。

```
class BottleNeckBlock(nn.Module):
  
  expansion = 4 

  def __init__(self, in_channels, out_channels, kernel_size=3, stride=1, downsample=None):

    super().__init__()

    base_width = 64

    width = int(out_channels * (base_width / 64.)) * 1

    self.conv1 = nn.Conv2d(in_channels=in_channels, out_channels=width, kernel_size=1, stride=stride, padding=1, bias=False)
    self.bn1 = nn.BatchNorm2d(num_features=width)
    self.conv2 = nn.Conv2d(in_channels=width, out_channels=width, kernel_size=3, stride=stride, padding=1, bias=False)
    self.bn2 = nn.BatchNorm2d(num_features = width)
    self.conv3 = nn.Conv2d(in_channels=width, out_channels=width * self.expansion , kernel_size=1, stride=stride, padding=1, bias=False)
    self.bn3 = nn.BatchNorm2d(num_features = width * self.expansion)
    self.relu = nn.ReLU(inplace=True)
    self.downsample = downsample
  
  def forward(self, x):

    identity = x

    x = self.conv1(x)
    x = self.bn1(x)
    x = self.relu(x)
    x = self.conv2(x)
    x = self.bn2(x)
    x = self.relu(x)
    x = self.conv3(x)
    x = self.bn3(x)
    if self.downsample is not None:
      identity = self.downsample(x)
    x+= identity

    return (self.relu(x))
```
### 3. ResNet整体架构（ResNet类）
- **ResNet Stem（茎部）**：先通过7×7卷积（步长2）、BN、ReLU激活，再经3×3最大池化（步长2），快速缩小特征图尺寸，减少后续残差块的计算量（早期层计算占比高，缩小尺寸可加速训练）。
- **残差块层（_make_layer函数）**：根据输入的块类型（block）、输出通道数、块数量（layers）生成残差块序列，首个块需判断是否添加下采样，后续块直接复用前一输出通道数。
- **分类头**：经自适应平均池化（AdaptiveAvgPool2d，输出2×2特征图）、展平（flatten）后，通过全连接层（Linear）映射到目标类别数（num_classes）。

```
class ResNet(nn.Module):

  def __init__(self, block, layers, num_classes):

    super().__init__()

    self.in_channels = 64

    # resnet stem
    self.conv1 = nn.Conv2d(in_channels=3, out_channels=self.in_channels, kernel_size=7, stride=2, padding=3, bias=False)
    self.bn1 = nn.BatchNorm2d(num_features = self.in_channels)
    self.relu = nn.ReLU(inplace=True)
    self.maxpool = nn.MaxPool2d(kernel_size=3, stride=2, padding=1)

    #res-blocks
    self.layer1 = self._make_layer(block, 64, layers[0])
    self.layer2 = self._make_layer(block, 128, layers[1], stride=2)
    self.layer3 = self._make_layer(block, 256, layers[2], stride=2)
    self.layer4 = self._make_layer(block, 512, layers[3], stride=2)

    #classifier block
    self.adppool = nn.AdaptiveAvgPool2d((2,2))
    self.classifier = nn.Linear(in_features=512 * block.expansion, out_features = num_classes)

  def _make_layer(self, block, out_channels, blocks, stride=1):

    downsample = None

    if stride!=1 or self.in_channels != out_channels * block.expansion:

      downsample = nn.Sequential(
          nn.Conv2d(in_channels=self.in_channels, out_channels=out_channels * block.expansion, kernel_size=1, stride=stride, bias=False),
          nn.BatchNorm2d(num_features=out_channels * block.expansion)
    )

    layers=[]
    
    layers.append(block(self.in_channels, out_channels, stride, downsample))

    self.in_channels = out_channels * block.expansion

    for i in range(1, blocks):
      layers.append(block(self.in_channels, out_channels))
      
    return nn.Sequential(*layers)


  
  def forward(self, x):

    x = self.conv1(x)
    x = self.bn1(x)
    x = self.relu(x)
    x = self.maxpool(x)
    x = self.layer1(x)
    x = self.layer2(x)
    x = self.layer3(x)
    x = self.layer4(x)
    x = self.adppool(x)
    x = torch.flatten(x, 1)
    
    return self.classifier(x)
```
### 4. 示例：ResNet34实例化
- 采用基础块（BasicBlock），残差块数量分布为[3,4,6,3]（对应layer1-layer4，输出通道数分别为64、128、256、512），目标类别数设为10（可根据任务调整），代码为：`resnet34 = ResNet(block=BasicBlock, layers=[3,4,6,3], num_classes=10)`。

```
resnet34 = ResNet(block=BasicBlock, layers=[3,4,6,3], num_classes=10)
```
### 5. 实现简化说明
- 未支持“空洞卷积（dilation）”和“分组卷积（group）”超参数；
- 未实现“最后一个归一化层零初始化”技巧，聚焦核心架构以简化代码。


## 四、补充信息
1. **代码获取**：完整实现代码可参考作者提供的[GitHub仓库](链接见原文)。
2. **读者反馈**：部分读者指出代码两处问题——下采样操作应作用于输入（identity）而非块输出；自适应池化后特征图展平尺寸与全连接层输入特征数不匹配（需注意形状一致性）。
3. **参考文献**：包括3篇技术博客（dhruvs.space、jarvislabs.ai、GitHub仓库）及《Deep Learning for Coders》第14章。
4. **作者背景**：Anirudh Gokulaprasad，GenAI工程师，拥有约4年大规模自主智能体平台开发经验。
