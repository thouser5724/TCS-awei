import { hashPassword, generateToken } from '../_lib/auth.js';

export async function onRequestPost(context) {
    const { request, env } = context;

    let body;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: '无效的请求' }, { status: 400 });
    }

    const { username, password } = body;

    if (!username || !password) {
        return Response.json({ error: '用户名和密码不能为空' }, { status: 400 });
    }
    if (username.length < 2 || username.length > 16) {
        return Response.json({ error: '用户名需 2-16 个字符' }, { status: 400 });
    }
    if (password.length < 4) {
        return Response.json({ error: '密码至少 4 位' }, { status: 400 });
    }

    const existing = await env.DB.prepare(
        'SELECT id FROM users WHERE username = ?'
    ).bind(username).first();
    if (existing) {
        return Response.json({ error: '用户名已被注册' }, { status: 409 });
    }

    const hash = await hashPassword(password);
    const result = await env.DB.prepare(
        'INSERT INTO users (username, password_hash) VALUES (?, ?)'
    ).bind(username, hash).run();

    const userId = result.meta.last_row_id;
    const token = generateToken();
    await env.DB.prepare(
        'INSERT INTO sessions (token, user_id) VALUES (?, ?)'
    ).bind(token, userId).run();

    return Response.json({ token, username, userId });
}
