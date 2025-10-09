https://deepwiki.com/akira-cn/frontend-dev-large-model-era

# DeepWiki Q&A with Code Context for Repository: akira-cn/frontend-dev-large-model-era


## Q1

这个系统是怎么实现流式传输的


### Answer

# 系统流式传输实现方式

这个系统实现了**两种主要的流式传输模式**:Server-Sent Events (SSE) 和 Chunked HTTP,用于实时传输 AI 生成的内容。<cite />

## 核心实现方式

### 1. SSE (Server-Sent Events) 流式传输

系统使用 Express 服务器实现 SSE 端点,这是主要的流式传输方式。 frontend-dev-large-model-era:33-38 

**服务端实现流程:**

1. **设置 SSE 响应头** - 服务器配置 `text/event-stream` 内容类型和保持连接 frontend-dev-large-model-era:35-38 

2. **从 LLM API 获取流** - 调用 AI API 并开启流式响应 frontend-dev-large-model-era:42-59 

3. **读取和转发数据块** - 使用 `ReadableStream` reader 逐块读取并解码 frontend-dev-large-model-era:65-66 

4. **缓冲区管理** - 处理不完整的 JSON 数据 frontend-dev-large-model-era:92-99 

5. **解析并转发** - 解析每行数据并通过 SSE 发送给客户端 frontend-dev-large-model-era:102-117 

6. **结束流** - 发送结束事件并关闭连接 frontend-dev-large-model-era:122-124 

**客户端消费:**

在 `get_offer_ai` 系统中,客户端使用 `EventSource` API 接收流式数据: frontend-dev-large-model-era:63-63 

客户端监听 `message` 事件并逐步更新 UI: frontend-dev-large-model-era:70-79 

### 2. Chunked HTTP 流式传输

另一种实现方式是直接使用 `fetch` API 读取 HTTP chunked 响应流。<cite />

**客户端实现:**

1. **发起流式请求** - 设置 `stream: true` 参数 frontend-dev-large-model-era:36-47 

2. **获取 reader** - 从响应体获取 `ReadableStream` reader frontend-dev-large-model-era:49-51 

3. **循环读取数据块** - 使用 while 循环持续读取 frontend-dev-large-model-era:63-68 

4. **解析数据** - 按行分割并解析 JSON frontend-dev-large-model-era:69-87 

### 3. 增量 JSON 解析

系统使用 `JSONParser` 类实现流式 JSON 的增量解析,这是一个关键特性。 frontend-dev-large-model-era:67-72 

`JSONParser` 监听数据事件并发出路径化的更新: frontend-dev-large-model-era:76-78 

客户端使用 `jsonuri` 库根据路径更新嵌套对象: frontend-dev-large-model-era:53-57 

## 面试系统的特殊实现

在 `get_offer_ai` 系统中,服务端使用 `@bearbobo/ling` 库配置 SSE 模式: frontend-dev-large-model-era:34-39 

创建 bot 并通过 `ling.stream` 获取流: frontend-dev-large-model-era:58-60 

最后通过 `createEventChannel` 创建 SSE 通道返回给客户端: frontend-dev-large-model-era:103-103 

## Notes

系统实现了两种流式传输模式以适应不同场景:SSE 用于需要事件驱动和自动重连的场景(如面试系统),Chunked HTTP 用于简单的直接 LLM 调用。关键技术点包括缓冲区管理(处理不完整数据)、增量 JSON 解析(JSONParser)、以及路径化更新(jsonuri)。所有实现都遵循相同的核心模式:获取 reader → 循环读取 → 解码 → 解析 → 更新 UI。<cite />

Wiki pages you might want to explore:
- [Architecture Overview (akira-cn/frontend-dev-large-model-era)](/wiki/akira-cn/frontend-dev-large-model-era#3.1)
- [Streaming Response Patterns (akira-cn/frontend-dev-large-model-era)](/wiki/akira-cn/frontend-dev-large-model-era#5)


### Citations


**File:** json_streaming_sse/server.js (L33-38)

```javascript
app.get('/stream', async (req, res) => {
    // 设置响应头部
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // 发送初始响应头
```

**File:** json_streaming_sse/server.js (L42-59)

```javascript
        const response = await fetch(
            endpoint,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openaiApiKey}`,
                },
                body: JSON.stringify({
                    model: 'moonshot-v1-8k', // 选择你使用的模型
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: req.query.question }
                    ],
                    response_format: { type: "json_object" },
                    stream: true, // 开启流式响应
                })
            }
        );
```

**File:** json_streaming_sse/server.js (L65-66)

```javascript
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
```

**File:** json_streaming_sse/server.js (L67-72)

```javascript
        const jsonParser = new JSONParser({
            autoFix: true,
            onError: (error) => {
                console.error('JSON Parser Error:', error);
            }
        });
```

**File:** json_streaming_sse/server.js (L76-78)

```javascript
        jsonParser.on('data', (data) => {
            if (data.uri) res.write(`data: ${JSON.stringify(data)}\n\n`); // 发送数据到客户端
        });
```

**File:** json_streaming_sse/server.js (L92-99)

```javascript
        let buffer = '';

        // 读取流数据并转发到客户端
        while (!done) {
            const { value, done: doneReading } = await reader.read();
            done = doneReading;
            const chunkValue = buffer + decoder.decode(value, { stream: true });
            buffer = '';
```

**File:** json_streaming_sse/server.js (L102-117)

```javascript
            const lines = chunkValue.split('\n').filter(line => line.trim() && line.startsWith('data: '));
            for (const line of lines) {
                const incoming = line.slice(6);
                if (incoming === '[DONE]') {
                    done = true;
                    break;
                }
                try {
                    const data = JSON.parse(incoming);
                    const delta = data.choices[0].delta.content;
                    jsonParser.trace(delta);
                    // if (delta) res.write(`data: ${delta}\n\n`); // 发送数据到客户端
                } catch (ex) {
                    buffer += `data: ${incoming}`;
                }
            }
```

**File:** json_streaming_sse/server.js (L122-124)

```javascript
        res.write('event: end\n'); // 发送结束事件
        res.write('data: [DONE]\n\n'); // 通知客户端数据流结束
        res.end(); // 关闭连接
```

**File:** get_offer_ai/src/App.vue (L63-63)

```vue
  const eventSource = new EventSource(`/api/event?channel=${channel}`);
```

**File:** get_offer_ai/src/App.vue (L70-79)

```vue
  eventSource.addEventListener("message", function (e: any) {
    let { uri, delta } = JSON.parse(e.data);
    if (aiResponse.content === '') {
      aiResponse.content = delta;
      messages.value.push(aiResponse);
    } else {
      aiResponse.content += delta;
      messages.value = [...messages.value]; // 强制更新
    }
    console.log(uri, delta);
```

**File:** json_streaming/src/App.vue (L36-47)

```vue
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      model: 'moonshot-v1-8k',
      messages: [
        { role:'system', content: systemPrompt},
        { role: 'user', content: question.value }
      ],
      stream: true,
    })
  });
```

**File:** json_streaming/src/App.vue (L49-51)

```vue
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  const jsonParser = new JSONParser();
```

**File:** json_streaming/src/App.vue (L53-57)

```vue
  jsonParser.on('data', ({uri, delta}) => {
    console.log(uri, delta);
    const content = get(contentParsed.value, uri);
    set(contentParsed.value, uri, (content || '') + delta);
  });
```

**File:** json_streaming/src/App.vue (L63-68)

```vue
  while (!done) {
    const { value, done: doneReading } = await (reader?.read() as Promise<{ value: any; done: boolean }>);
    done = doneReading;
    const chunkValue = buffer + decoder.decode(value);
    buffer = '';

```

**File:** json_streaming/src/App.vue (L69-87)

```vue
    const lines = chunkValue.split('\n').filter((line) => line.startsWith('data: '));

    for (const line of lines) {
      const incoming = line.slice(6);
      if (incoming === '[DONE]') {
        done = true;
        break;
      }
      try {
        const data = JSON.parse(incoming);
        const delta = data.choices[0].delta.content;
        if (delta) {
          content.value += delta;
          jsonParser.trace(delta);
        }
      } catch (ex) {
        buffer += `data: ${incoming}`;
      }
    }
```

**File:** get_offer_ai/server.ts (L34-39)

```typescript
    const config = {
        model_name: modelName,
        api_key: apiKey,
        endpoint: endpoint,
        sse: true,
    };
```

**File:** get_offer_ai/server.ts (L58-60)

```typescript
    const bot = ling.createBot('reply', {}, {
        response_format: { type: "text" },
    });
```

**File:** get_offer_ai/server.ts (L103-103)

```typescript
    res.send(createEventChannel(ling));
```

## Q2

详细说怎么实现传输ai生成内容的


### Answer

# AI 生成内容传输的详细实现

系统通过**流式读取 LLM API 响应**并**逐块转发给客户端**来实现 AI 内容传输。 frontend-dev-large-model-era:42-59 核心流程包括三个关键环节:从 LLM 获取流、服务端处理转发、客户端接收渲染。<cite/>

## 服务端实现:从 LLM 获取流式响应

### 1. 调用 LLM API 并开启流式模式

服务端向 LLM API 发送请求时,必须在请求体中设置 `stream: true` 来启用流式响应。 frontend-dev-large-model-era:42-59 这会让 LLM 以 chunked transfer encoding 方式返回数据,而不是等待完整响应。<cite/>

### 2. 获取 ReadableStream Reader

从 LLM API 的响应中获取 `ReadableStream` reader,这是读取流式数据的关键接口。 frontend-dev-large-model-era:65-66 同时创建 `TextDecoder` 用于将字节流解码为文本。<cite/>

### 3. 循环读取数据块

使用 while 循环持续调用 `reader.read()` 读取数据块,直到 `done` 标志为 true。 frontend-dev-large-model-era:95-98 每次读取的 `value` 是 Uint8Array,需要通过 decoder 解码为字符串。<cite/>

### 4. 缓冲区管理处理不完整数据

由于网络传输的数据块可能在任意位置截断,必须使用缓冲区来处理不完整的 JSON 行。 frontend-dev-large-model-era:92-99 关键模式是:**先将 buffer 与新数据拼接,再进行分割和解析**。<cite/>

如果某行 JSON 解析失败,将其保存到 buffer 中,等待下一次循环与新数据合并后再解析。 frontend-dev-large-model-era:109-116 

### 5. 解析并提取内容

LLM API 返回的每行数据格式为 `data: {JSON对象}`,需要:
- 按行分割并过滤出以 `data:` 开头的行 frontend-dev-large-model-era:102-102 
- 去除 `data: ` 前缀(slice(6)) frontend-dev-large-model-era:104-104 
- 检测 `[DONE]` 终止标记 frontend-dev-large-model-era:105-108 
- 解析 JSON 并提取 `data.choices[0].delta.content` frontend-dev-large-model-era:110-112 

## 服务端转发:SSE 协议实现

### 1. 设置 SSE 响应头

在 Express 路由中,必须设置特定的响应头来启用 SSE 协议。 frontend-dev-large-model-era:35-38 这些头部告诉浏览器这是一个持久连接的事件流。<cite/>

### 2. 转发数据到客户端

使用 `res.write()` 将处理后的数据以 SSE 格式发送给客户端。 frontend-dev-large-model-era:77-77 SSE 消息格式必须是 `data: {内容}\n\n`(两个换行符)。<cite/>

### 3. 发送结束事件

流传输完成后,发送 `event: end` 和 `data: [DONE]` 通知客户端,然后调用 `res.end()` 关闭连接。 frontend-dev-large-model-era:122-124 

## 客户端实现:接收和渲染

### SSE 方式(EventSource)

客户端使用 `EventSource` API 建立 SSE 连接。 frontend-dev-large-model-era:63-63 监听 `message` 事件接收数据,每次收到数据后解析 JSON 并累加到 UI。 frontend-dev-large-model-era:70-78 

监听 `finished` 事件来关闭连接。 frontend-dev-large-model-era:84-87 

### Chunked HTTP 方式(fetch)

客户端也可以直接使用 `fetch` API 读取 chunked 响应。 frontend-dev-large-model-era:36-50 获取 reader 后,使用与服务端相同的循环读取模式。 frontend-dev-large-model-era:63-67 

同样需要缓冲区管理来处理不完整的数据行。 frontend-dev-large-model-era:60-66 解析逻辑与服务端一致:分割行、去除前缀、解析 JSON、提取 delta。 frontend-dev-large-model-era:69-86 

## 增量 JSON 解析(高级特性)

对于结构化 JSON 响应,系统使用 `JSONParser` 实现增量解析。 frontend-dev-large-model-era:67-72 

`JSONParser` 监听 `data` 事件,每当 JSON 的某个路径有新数据时就触发回调。 frontend-dev-large-model-era:76-78 服务端将路径化的更新通过 SSE 发送给客户端。<cite/>

客户端使用 `jsonuri` 库的 `set()` 方法根据路径更新嵌套对象。 frontend-dev-large-model-era:53-57 这样可以在 JSON 未完全生成时就开始渲染部分内容。<cite/>

## 面试系统的特殊实现

在 `get_offer_ai` 系统中,使用 `@bearbobo/ling` 库简化了流式传输。 frontend-dev-large-model-era:12-12 

服务端配置 Ling 实例时设置 `sse: true` 启用 SSE 模式。 frontend-dev-large-model-era:106-123 通过 `EventChannel` 服务管理 SSE 连接,支持断线重连(通过 `Last-Event-ID` 头)。<cite/>

## Notes

所有流式传输实现的核心都是:**获取 ReadableStream reader → while 循环读取 → 解码字节流 → 缓冲区管理 → 解析数据 → 转发/渲染**。<cite/>SSE 和 Chunked HTTP 的主要区别在于协议层:SSE 提供了标准化的事件格式和自动重连,而 Chunked HTTP 更底层但更灵活。<cite/>缓冲区管理是关键难点,必须在拼接后再分割,否则会丢失跨块的不完整数据。<cite/>

Wiki pages you might want to explore:
- [Architecture Overview (akira-cn/frontend-dev-large-model-era)](/wiki/akira-cn/frontend-dev-large-model-era#3.1)
- [Streaming Response Patterns (akira-cn/frontend-dev-large-model-era)](/wiki/akira-cn/frontend-dev-large-model-era#5)


### Citations


**File:** json_streaming_sse/server.js (L35-38)

```javascript
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // 发送初始响应头
```

**File:** json_streaming_sse/server.js (L42-59)

```javascript
        const response = await fetch(
            endpoint,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openaiApiKey}`,
                },
                body: JSON.stringify({
                    model: 'moonshot-v1-8k', // 选择你使用的模型
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: req.query.question }
                    ],
                    response_format: { type: "json_object" },
                    stream: true, // 开启流式响应
                })
            }
        );
```

**File:** json_streaming_sse/server.js (L65-66)

```javascript
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
```

**File:** json_streaming_sse/server.js (L67-72)

```javascript
        const jsonParser = new JSONParser({
            autoFix: true,
            onError: (error) => {
                console.error('JSON Parser Error:', error);
            }
        });
```

**File:** json_streaming_sse/server.js (L76-78)

```javascript
        jsonParser.on('data', (data) => {
            if (data.uri) res.write(`data: ${JSON.stringify(data)}\n\n`); // 发送数据到客户端
        });
```

**File:** json_streaming_sse/server.js (L92-99)

```javascript
        let buffer = '';

        // 读取流数据并转发到客户端
        while (!done) {
            const { value, done: doneReading } = await reader.read();
            done = doneReading;
            const chunkValue = buffer + decoder.decode(value, { stream: true });
            buffer = '';
```

**File:** json_streaming_sse/server.js (L102-102)

```javascript
            const lines = chunkValue.split('\n').filter(line => line.trim() && line.startsWith('data: '));
```

**File:** json_streaming_sse/server.js (L104-104)

```javascript
                const incoming = line.slice(6);
```

**File:** json_streaming_sse/server.js (L105-108)

```javascript
                if (incoming === '[DONE]') {
                    done = true;
                    break;
                }
```

**File:** json_streaming_sse/server.js (L109-116)

```javascript
                try {
                    const data = JSON.parse(incoming);
                    const delta = data.choices[0].delta.content;
                    jsonParser.trace(delta);
                    // if (delta) res.write(`data: ${delta}\n\n`); // 发送数据到客户端
                } catch (ex) {
                    buffer += `data: ${incoming}`;
                }
```

**File:** json_streaming_sse/server.js (L122-124)

```javascript
        res.write('event: end\n'); // 发送结束事件
        res.write('data: [DONE]\n\n'); // 通知客户端数据流结束
        res.end(); // 关闭连接
```

**File:** get_offer_ai/src/App.vue (L63-63)

```vue
  const eventSource = new EventSource(`/api/event?channel=${channel}`);
```

**File:** get_offer_ai/src/App.vue (L70-78)

```vue
  eventSource.addEventListener("message", function (e: any) {
    let { uri, delta } = JSON.parse(e.data);
    if (aiResponse.content === '') {
      aiResponse.content = delta;
      messages.value.push(aiResponse);
    } else {
      aiResponse.content += delta;
      messages.value = [...messages.value]; // 强制更新
    }
```

**File:** get_offer_ai/src/App.vue (L84-87)

```vue
  eventSource.addEventListener('finished', () => {
    console.log('传输完成');
    eventSource.close();
  });
```

**File:** json_streaming/src/App.vue (L36-50)

```vue
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      model: 'moonshot-v1-8k',
      messages: [
        { role:'system', content: systemPrompt},
        { role: 'user', content: question.value }
      ],
      stream: true,
    })
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
```

**File:** json_streaming/src/App.vue (L53-57)

```vue
  jsonParser.on('data', ({uri, delta}) => {
    console.log(uri, delta);
    const content = get(contentParsed.value, uri);
    set(contentParsed.value, uri, (content || '') + delta);
  });
```

**File:** json_streaming/src/App.vue (L60-67)

```vue
  let buffer = '';
  content.value = '';

  while (!done) {
    const { value, done: doneReading } = await (reader?.read() as Promise<{ value: any; done: boolean }>);
    done = doneReading;
    const chunkValue = buffer + decoder.decode(value);
    buffer = '';
```

**File:** json_streaming/src/App.vue (L69-86)

```vue
    const lines = chunkValue.split('\n').filter((line) => line.startsWith('data: '));

    for (const line of lines) {
      const incoming = line.slice(6);
      if (incoming === '[DONE]') {
        done = true;
        break;
      }
      try {
        const data = JSON.parse(incoming);
        const delta = data.choices[0].delta.content;
        if (delta) {
          content.value += delta;
          jsonParser.trace(delta);
        }
      } catch (ex) {
        buffer += `data: ${incoming}`;
      }
```

**File:** get_offer_ai/package.json (L12-12)

```json
    "@bearbobo/ling": "^0.8.0",
```

**File:** get_offer_ai/server.ts (L106-123)

```typescript
app.get('/event',  (req, res) => {
    const lastEventId = req.headers['last-event-id'] as string | undefined;
    const eventChannel = getEventChannel(req.query.channel as string);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    const { stream, controller } = eventChannel.getStream(lastEventId);
    try {
        pipeline(stream as any, res);
    } catch (ex) {
        console.log(ex);
        controller?.close();
    }
});
```

# AI 生成内容传输的详细实现

系统通过**流式读取 LLM API 响应**并**逐块转发给客户端**来实现 AI 内容传输。 [1](#1-0) 核心流程包括三个关键环节:从 LLM 获取流、服务端处理转发、客户端接收渲染。<cite/>

## 服务端实现:从 LLM 获取流式响应

### 1. 调用 LLM API 并开启流式模式

服务端向 LLM API 发送请求时,必须在请求体中设置 `stream: true` 来启用流式响应。 [1](#1-0) 这会让 LLM 以 chunked transfer encoding 方式返回数据,而不是等待完整响应。<cite/>

### 2. 获取 ReadableStream Reader

从 LLM API 的响应中获取 `ReadableStream` reader,这是读取流式数据的关键接口。 [2](#1-1) 同时创建 `TextDecoder` 用于将字节流解码为文本。<cite/>

### 3. 循环读取数据块

使用 while 循环持续调用 `reader.read()` 读取数据块,直到 `done` 标志为 true。 [3](#1-2) 每次读取的 `value` 是 Uint8Array,需要通过 decoder 解码为字符串。<cite/>

### 4. 缓冲区管理处理不完整数据

由于网络传输的数据块可能在任意位置截断,必须使用缓冲区来处理不完整的 JSON 行。 [4](#1-3) 关键模式是:**先将 buffer 与新数据拼接,再进行分割和解析**。<cite/>

如果某行 JSON 解析失败,将其保存到 buffer 中,等待下一次循环与新数据合并后再解析。 [5](#1-4) 

### 5. 解析并提取内容

LLM API 返回的每行数据格式为 `data: {JSON对象}`,需要:
- 按行分割并过滤出以 `data:` 开头的行 [6](#1-5) 
- 去除 `data: ` 前缀(slice(6)) [7](#1-6) 
- 检测 `[DONE]` 终止标记 [8](#1-7) 
- 解析 JSON 并提取 `data.choices[0].delta.content` [9](#1-8) 

## 服务端转发:SSE 协议实现

### 1. 设置 SSE 响应头

在 Express 路由中,必须设置特定的响应头来启用 SSE 协议。 [10](#1-9) 这些头部告诉浏览器这是一个持久连接的事件流。<cite/>

### 2. 转发数据到客户端

使用 `res.write()` 将处理后的数据以 SSE 格式发送给客户端。 [11](#1-10) SSE 消息格式必须是 `data: {内容}\n\n`(两个换行符)。<cite/>

### 3. 发送结束事件

流传输完成后,发送 `event: end` 和 `data: [DONE]` 通知客户端,然后调用 `res.end()` 关闭连接。 [12](#1-11) 

## 客户端实现:接收和渲染

### SSE 方式(EventSource)

客户端使用 `EventSource` API 建立 SSE 连接。 [13](#1-12) 监听 `message` 事件接收数据,每次收到数据后解析 JSON 并累加到 UI。 [14](#1-13) 

监听 `finished` 事件来关闭连接。 [15](#1-14) 

### Chunked HTTP 方式(fetch)

客户端也可以直接使用 `fetch` API 读取 chunked 响应。 [16](#1-15) 获取 reader 后,使用与服务端相同的循环读取模式。 [17](#1-16) 

同样需要缓冲区管理来处理不完整的数据行。 [18](#1-17) 解析逻辑与服务端一致:分割行、去除前缀、解析 JSON、提取 delta。 [19](#1-18) 

## 增量 JSON 解析(高级特性)

对于结构化 JSON 响应,系统使用 `JSONParser` 实现增量解析。 [20](#1-19) 

`JSONParser` 监听 `data` 事件,每当 JSON 的某个路径有新数据时就触发回调。 [21](#1-20) 服务端将路径化的更新通过 SSE 发送给客户端。<cite/>

客户端使用 `jsonuri` 库的 `set()` 方法根据路径更新嵌套对象。 [22](#1-21) 这样可以在 JSON 未完全生成时就开始渲染部分内容。<cite/>

## 面试系统的特殊实现

在 `get_offer_ai` 系统中,使用 `@bearbobo/ling` 库简化了流式传输。 [23](#1-22) 

服务端配置 Ling 实例时设置 `sse: true` 启用 SSE 模式。 [24](#1-23) 通过 `EventChannel` 服务管理 SSE 连接,支持断线重连(通过 `Last-Event-ID` 头)。<cite/>

## Notes

所有流式传输实现的核心都是:**获取 ReadableStream reader → while 循环读取 → 解码字节流 → 缓冲区管理 → 解析数据 → 转发/渲染**。<cite/>SSE 和 Chunked HTTP 的主要区别在于协议层:SSE 提供了标准化的事件格式和自动重连,而 Chunked HTTP 更底层但更灵活。<cite/>缓冲区管理是关键难点,必须在拼接后再分割,否则会丢失跨块的不完整数据。<cite/>

Wiki pages you might want to explore:
- [Architecture Overview (akira-cn/frontend-dev-large-model-era)](/wiki/akira-cn/frontend-dev-large-model-era#3.1)
- [Streaming Response Patterns (akira-cn/frontend-dev-large-model-era)](/wiki/akira-cn/frontend-dev-large-model-era#5)

### Citations

**File:** json_streaming_sse/server.js (L35-38)
```javascript
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // 发送初始响应头
```

**File:** json_streaming_sse/server.js (L42-59)
```javascript
        const response = await fetch(
            endpoint,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openaiApiKey}`,
                },
                body: JSON.stringify({
                    model: 'moonshot-v1-8k', // 选择你使用的模型
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: req.query.question }
                    ],
                    response_format: { type: "json_object" },
                    stream: true, // 开启流式响应
                })
            }
        );
```

**File:** json_streaming_sse/server.js (L65-66)
```javascript
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
```

**File:** json_streaming_sse/server.js (L67-72)
```javascript
        const jsonParser = new JSONParser({
            autoFix: true,
            onError: (error) => {
                console.error('JSON Parser Error:', error);
            }
        });
```

**File:** json_streaming_sse/server.js (L76-78)
```javascript
        jsonParser.on('data', (data) => {
            if (data.uri) res.write(`data: ${JSON.stringify(data)}\n\n`); // 发送数据到客户端
        });
```

**File:** json_streaming_sse/server.js (L92-99)
```javascript
        let buffer = '';

        // 读取流数据并转发到客户端
        while (!done) {
            const { value, done: doneReading } = await reader.read();
            done = doneReading;
            const chunkValue = buffer + decoder.decode(value, { stream: true });
            buffer = '';
```

**File:** json_streaming_sse/server.js (L102-102)
```javascript
            const lines = chunkValue.split('\n').filter(line => line.trim() && line.startsWith('data: '));
```

**File:** json_streaming_sse/server.js (L104-104)
```javascript
                const incoming = line.slice(6);
```

**File:** json_streaming_sse/server.js (L105-108)
```javascript
                if (incoming === '[DONE]') {
                    done = true;
                    break;
                }
```

**File:** json_streaming_sse/server.js (L109-116)
```javascript
                try {
                    const data = JSON.parse(incoming);
                    const delta = data.choices[0].delta.content;
                    jsonParser.trace(delta);
                    // if (delta) res.write(`data: ${delta}\n\n`); // 发送数据到客户端
                } catch (ex) {
                    buffer += `data: ${incoming}`;
                }
```

**File:** json_streaming_sse/server.js (L122-124)
```javascript
        res.write('event: end\n'); // 发送结束事件
        res.write('data: [DONE]\n\n'); // 通知客户端数据流结束
        res.end(); // 关闭连接
```

**File:** get_offer_ai/src/App.vue (L63-63)
```vue
  const eventSource = new EventSource(`/api/event?channel=${channel}`);
```

**File:** get_offer_ai/src/App.vue (L70-78)
```vue
  eventSource.addEventListener("message", function (e: any) {
    let { uri, delta } = JSON.parse(e.data);
    if (aiResponse.content === '') {
      aiResponse.content = delta;
      messages.value.push(aiResponse);
    } else {
      aiResponse.content += delta;
      messages.value = [...messages.value]; // 强制更新
    }
```

**File:** get_offer_ai/src/App.vue (L84-87)
```vue
  eventSource.addEventListener('finished', () => {
    console.log('传输完成');
    eventSource.close();
  });
```

**File:** json_streaming/src/App.vue (L36-50)
```vue
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      model: 'moonshot-v1-8k',
      messages: [
        { role:'system', content: systemPrompt},
        { role: 'user', content: question.value }
      ],
      stream: true,
    })
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
```

**File:** json_streaming/src/App.vue (L53-57)
```vue
  jsonParser.on('data', ({uri, delta}) => {
    console.log(uri, delta);
    const content = get(contentParsed.value, uri);
    set(contentParsed.value, uri, (content || '') + delta);
  });
```

**File:** json_streaming/src/App.vue (L60-67)
```vue
  let buffer = '';
  content.value = '';

  while (!done) {
    const { value, done: doneReading } = await (reader?.read() as Promise<{ value: any; done: boolean }>);
    done = doneReading;
    const chunkValue = buffer + decoder.decode(value);
    buffer = '';
```

**File:** json_streaming/src/App.vue (L69-86)
```vue
    const lines = chunkValue.split('\n').filter((line) => line.startsWith('data: '));

    for (const line of lines) {
      const incoming = line.slice(6);
      if (incoming === '[DONE]') {
        done = true;
        break;
      }
      try {
        const data = JSON.parse(incoming);
        const delta = data.choices[0].delta.content;
        if (delta) {
          content.value += delta;
          jsonParser.trace(delta);
        }
      } catch (ex) {
        buffer += `data: ${incoming}`;
      }
```

**File:** get_offer_ai/package.json (L12-12)
```json
    "@bearbobo/ling": "^0.8.0",
```

**File:** get_offer_ai/server.ts (L106-123)
```typescript
app.get('/event',  (req, res) => {
    const lastEventId = req.headers['last-event-id'] as string | undefined;
    const eventChannel = getEventChannel(req.query.channel as string);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    const { stream, controller } = eventChannel.getStream(lastEventId);
    try {
        pipeline(stream as any, res);
    } catch (ex) {
        console.log(ex);
        controller?.close();
    }
});
```
