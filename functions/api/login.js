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

    const hash = await hashPassword(password);
    const user = await env.DB.prepare(
        'SELECT id, username FROM users WHERE username = ? AND password_hash = ?'
    ).bind(username, hash).first();

    if (!user) {
        return Response.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    const token = generateToken();
    await env.DB.prepare(
        'INSERT INTO sessions (token, user_id) VALUES (?, ?)'
    ).bind(token, user.id).run();

    return Response.json({ token, username: user.username, userId: user.id });
}
