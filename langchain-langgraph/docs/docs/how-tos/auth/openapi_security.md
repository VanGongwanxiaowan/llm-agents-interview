# 在 OpenAPI 中记录 API 身份验证

本指南展示了如何为您的 LangGraph Platform API 文档自定义 OpenAPI 安全架构。一个文档完善的安全架构有助于 API 使用者了解如何与您的 API 进行身份验证，甚至可以实现自动客户端生成。有关 LangGraph 身份验证系统的更多详细信息，请参阅[身份验证和访问控制概念指南](../../concepts/auth.md)。

!!! note "实现与文档"

    本指南仅涵盖如何在 OpenAPI 中记录您的安全要求。要实现实际的身份验证逻辑，请参阅[如何添加自定义身份验证](./custom_auth.md)。

本指南适用于所有 LangGraph Platform 部署（云和自托管）。如果您不使用 LangGraph Platform，则不适用于 LangGraph 开源库的使用。

## 默认架构

默认安全架构因部署类型而异：

=== "LangGraph Platform"

默认情况下，LangGraph Platform 需要在 `x-api-key` 标头中使用 LangSmith API 密钥：

```yaml
components:
  securitySchemes:
    apiKeyAuth:
      type: apiKey
      in: header
      name: x-api-key
security:
  - apiKeyAuth: []
```

使用 LangGraph SDK 之一时，可以从环境变量推断这一点。

=== "自托管"

默认情况下，自托管部署没有安全架构。这意味着它们只能在安全网络上部署或进行身份验证。要添加自定义身份验证，请参阅[如何添加自定义身份验证](./custom_auth.md)。

## 自定义安全架构

要自定义 OpenAPI 文档中的安全架构，请在 `langgraph.json` 中的 `auth` 配置中添加 `openapi` 字段。请记住，这只会更新 API 文档 - 您还必须实现相应的身份验证逻辑，如[如何添加自定义身份验证](./custom_auth.md)中所示。

请注意，LangGraph Platform 不提供身份验证端点 - 您需要在客户端应用程序中处理用户身份验证，并将生成的凭据传递给 LangGraph API。

:::python
=== "OAuth2 与 Bearer 令牌"

    ```json
    {
      "auth": {
        "path": "./auth.py:my_auth",  // 在此处实现身份验证逻辑
        "openapi": {
          "securitySchemes": {
            "OAuth2": {
              "type": "oauth2",
              "flows": {
                "implicit": {
                  "authorizationUrl": "https://your-auth-server.com/oauth/authorize",
                  "scopes": {
                    "me": "Read information about the current user",
                    "threads": "Access to create and manage threads"
                  }
                }
              }
            }
          },
          "security": [
            {"OAuth2": ["me", "threads"]}
          ]
        }
      }
    }
    ```

=== "API 密钥"

    ```json
    {
      "auth": {
        "path": "./auth.py:my_auth",  // 在此处实现身份验证逻辑
        "openapi": {
          "securitySchemes": {
            "apiKeyAuth": {
              "type": "apiKey",
              "in": "header",
              "name": "X-API-Key"
            }
          },
          "security": [
            {"apiKeyAuth": []}
          ]
        }
      }
    }
    ```

:::

:::js
=== "OAuth2 与 Bearer 令牌"

    ```json
    {
      "auth": {
        "path": "./auth.ts:my_auth",  // 在此处实现身份验证逻辑
        "openapi": {
          "securitySchemes": {
            "OAuth2": {
              "type": "oauth2",
              "flows": {
                "implicit": {
                  "authorizationUrl": "https://your-auth-server.com/oauth/authorize",
                  "scopes": {
                    "me": "Read information about the current user",
                    "threads": "Access to create and manage threads"
                  }
                }
              }
            }
          },
          "security": [
            {"OAuth2": ["me", "threads"]}
          ]
        }
      }
    }
    ```

=== "API 密钥"

    ```json
    {
      "auth": {
        "path": "./auth.ts:my_auth",  // 在此处实现身份验证逻辑
        "openapi": {
          "securitySchemes": {
            "apiKeyAuth": {
              "type": "apiKey",
              "in": "header",
              "name": "X-API-Key"
            }
          },
          "security": [
            {"apiKeyAuth": []}
          ]
        }
      }
    }
    ```

:::

## 测试

更新配置后：

1. 部署您的应用程序
2. 访问 `/docs` 查看更新的 OpenAPI 文档
3. 使用身份验证服务器的凭据尝试端点（确保您首先实现了身份验证逻辑）
