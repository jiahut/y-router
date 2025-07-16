import { Env } from "./env";
import { formatAnthropicToOpenAI } from "./formatRequest";
import { streamOpenAIToAnthropic } from "./streamResponse";
import { formatOpenAIToAnthropic } from "./formatResponse";
import { indexHtml } from "./indexHtml";
import { termsHtml } from "./termsHtml";
import { privacyHtml } from "./privacyHtml";
import { installSh } from "./installSh";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return new Response(indexHtml, {
        headers: { "Content-Type": "text/html" },
      });
    }

    if (url.pathname === "/terms" && request.method === "GET") {
      return new Response(termsHtml, {
        headers: { "Content-Type": "text/html" },
      });
    }

    if (url.pathname === "/privacy" && request.method === "GET") {
      return new Response(privacyHtml, {
        headers: { "Content-Type": "text/html" },
      });
    }

    if (url.pathname === "/install.sh" && request.method === "GET") {
      return new Response(installSh, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/v1/messages" && request.method === "POST") {
      const anthropicRequest = await request.json();
      const openaiRequest = formatAnthropicToOpenAI(anthropicRequest);
      // 优先级：x-api-key header > Authorization header > 环境变量 DEFAULT_BEARER_TOKEN
      let bearerToken = request.headers.get("x-api-key");
      
      // 如果没有 x-api-key，尝试从 Authorization header 中提取
      if (!bearerToken) {
        const authHeader = request.headers.get("Authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
          bearerToken = authHeader.substring(7); // 移除 "Bearer " 前缀
        }
      }
      
      // 如果仍然没有 token，使用环境变量
      if (!bearerToken) {
        bearerToken = env.DEFAULT_BEARER_TOKEN;
      }

      if (!bearerToken) {
        return new Response(
          "Bearer token is required. Please provide x-api-key header, Authorization header, or set DEFAULT_BEARER_TOKEN environment variable.",
          {
            status: 401,
            headers: { "Content-Type": "text/plain" },
          },
        );
      }

      const baseUrl = env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
      const openaiResponse = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify(openaiRequest),
      });

      if (!openaiResponse.ok) {
        return new Response(await openaiResponse.text(), {
          status: openaiResponse.status,
        });
      }

      if (openaiRequest.stream) {
        const anthropicStream = streamOpenAIToAnthropic(
          openaiResponse.body as ReadableStream,
          openaiRequest.model,
        );
        return new Response(anthropicStream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      } else {
        const openaiData = await openaiResponse.json();
        const anthropicResponse = formatOpenAIToAnthropic(
          openaiData,
          openaiRequest.model,
        );
        return new Response(JSON.stringify(anthropicResponse), {
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};
