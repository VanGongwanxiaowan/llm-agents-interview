# 如何添加自定义生命周期事件

在将智能体部署到 LangGraph Platform 时，您通常需要在服务器启动时初始化数据库连接等资源，并确保在服务器关闭时正确关闭这些资源。生命周期事件允许您挂接到服务器的启动和关闭序列中，以处理这些关键的设置和清理任务。

这与[添加自定义路由](./custom_routes.md)的工作方式相同。您只需要提供自己的 [`Starlette`](https://www.starlette.io/applications/) 应用（包括 [`FastAPI`](https://fastapi.tiangolo.com/)、[`FastHTML`](https://fastht.ml/) 和其他兼容应用）。

下面是一个使用 FastAPI 的示例。

???+ note "仅限 Python"

    我们目前仅在 `langgraph-api>=0.0.26` 的 Python 部署中支持自定义生命周期事件。

## 创建应用

从**现有的** LangGraph Platform 应用开始，将以下生命周期代码添加到您的 `webapp.py` 文件中。如果您从头开始，可以使用 CLI 从模板创建新应用。

```bash
langgraph new --template=new-langgraph-project-python my_new_project
```

一旦您有了 LangGraph 项目，添加以下应用代码：

```python
# ./src/agent/webapp.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 例如...
    engine = create_async_engine("postgresql+asyncpg://user:pass@localhost/db")
    # 创建可重用的会话工厂
    async_session = sessionmaker(engine, class_=AsyncSession)
    # 存储在应用状态中
    app.state.db_session = async_session
    yield
    # 清理连接
    await engine.dispose()

# highlight-next-line
app = FastAPI(lifespan=lifespan)

# ... 如果需要，可以添加自定义路由。
```

## 配置 `langgraph.json`

将以下内容添加到您的 `langgraph.json` 配置文件中。确保路径指向您上面创建的 `webapp.py` 文件。

```json
{
  "dependencies": ["."],
  "graphs": {
    "agent": "./src/agent/graph.py:graph"
  },
  "env": ".env",
  "http": {
    "app": "./src/agent/webapp.py:app"
  }
  // 其他配置选项，如 auth、store 等。
}
```

## 启动服务器

在本地测试服务器：

```bash
langgraph dev --no-browser
```

当服务器启动时，您应该看到启动消息打印出来，当您使用 `Ctrl+C` 停止服务器时，您应该看到清理消息。

## 部署

您可以将您的应用按原样部署到 LangGraph Platform 或您的自托管平台。

## 下一步

现在您已经向部署添加了生命周期事件，您可以使用类似的技术来添加[自定义路由](./custom_routes.md)或[自定义中间件](./custom_middleware.md)来进一步自定义服务器的行为。
