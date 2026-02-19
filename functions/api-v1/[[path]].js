/**
 * Cloudflare Pages Functions: API Proxy for OTONEI
 * Handles /api-v1/* requests and forwards them to the target API.
 */

const TARGET_API_BASE = 'https://music-api.gdstudio.xyz';
const SOURCE_PATH_PREFIX = '/api-v1';
const TARGET_PATH_ACTUAL = '/api.php';

export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);

    // 1. 提取子路径和查询参数
    // 如果请求是 /api-v1/something?query=1，逻辑保持一致
    let targetUrlString;

    if (url.pathname === SOURCE_PATH_PREFIX || url.pathname === `${SOURCE_PATH_PREFIX}/`) {
        // 根路径转发：/api-v1 -> /api.php
        targetUrlString = `${TARGET_API_BASE}${TARGET_PATH_ACTUAL}${url.search}`;
    } else {
        // 带有额外路径的转发：/api-v1/other -> /something_else (通常本项目只用前者)
        const subPath = url.pathname.replace(SOURCE_PATH_PREFIX, '');
        targetUrlString = `${TARGET_API_BASE}${subPath}${url.search}`;
    }

    // 2. 准备请求头（伪装 UA 并删除不必要的头）
    const newHeaders = new Headers(request.headers);
    newHeaders.set('Host', new URL(TARGET_API_BASE).host);
    newHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    newHeaders.delete('cf-connecting-ip');
    newHeaders.delete('cf-ipcountry');
    newHeaders.delete('cf-ray');
    newHeaders.delete('x-forwarded-proto');
    newHeaders.delete('x-real-ip');

    // 3. 发起后端请求
    try {
        const response = await fetch(targetUrlString, {
            method: request.method,
            headers: newHeaders,
            body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
            redirect: 'follow'
        });

        // 4. 构建并返回响应（注入 CORS 和安全头）
        const responseHeaders = new Headers(response.headers);
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        responseHeaders.delete('X-Powered-By');
        responseHeaders.delete('Server');

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Proxy Fetch Failed', message: error.message }), {
            status: 502,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }
}
