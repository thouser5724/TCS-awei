import { hashPassword, generateToken, getUserFromToken } from './auth.js';

const JSON_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: JSON_HEADERS });
        }

        const url = new URL(request.url);
        const { pathname } = url;

        try {
            if (pathname === '/api/register' && request.method === 'POST') {
                return await handleRegister(request, env);
            }
            if (pathname === '/api/login' && request.method === 'POST') {
                return await handleLogin(request, env);
            }
            if (pathname === '/api/scores' && request.method === 'GET') {
                return await handleGetScores(env);
            }
            if (pathname === '/api/scores' && request.method === 'POST') {
                return await handlePostScore(request, env);
            }
            if (pathname === '/api/me' && request.method === 'GET') {
                return await handleMe(request, env);
            }

            return env.ASSETS.fetch(request);
        } catch (err) {
            return Response.json({ error: '服务器错误' }, { status: 500, headers: JSON_HEADERS });
        }
    }
};

async function handleRegister(request, env) {
    const { username, password } = await request.json();

    if (!username || !password) {
        return Response.json({ error: '用户名和密码不能为空' }, { status: 400, headers: JSON_HEADERS });
    }
    if (username.length < 2 || username.length > 16) {
        return Response.json({ error: '用户名需 2-16 个字符' }, { status: 400, headers: JSON_HEADERS });
    }
    if (password.length < 4) {
        return Response.json({ error: '密码至少 4 位' }, { status: 400, headers: JSON_HEADERS });
    }

    const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
    if (existing) {
        return Response.json({ error: '用户名已被注册' }, { status: 409, headers: JSON_HEADERS });
    }

    const hash = await hashPassword(password);
    const result = await env.DB.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').bind(username, hash).run();
    const userId = result.meta.last_row_id;

    const token = generateToken();
    await env.DB.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').bind(token, userId).run();

    return Response.json({ token, username, userId }, { headers: JSON_HEADERS });
}

async function handleLogin(request, env) {
    const { username, password } = await request.json();

    if (!username || !password) {
        return Response.json({ error: '用户名和密码不能为空' }, { status: 400, headers: JSON_HEADERS });
    }

    const hash = await hashPassword(password);
    const user = await env.DB.prepare('SELECT id, username FROM users WHERE username = ? AND password_hash = ?').bind(username, hash).first();

    if (!user) {
        return Response.json({ error: '用户名或密码错误' }, { status: 401, headers: JSON_HEADERS });
    }

    const token = generateToken();
    await env.DB.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').bind(token, user.id).run();

    return Response.json({ token, username: user.username, userId: user.id }, { headers: JSON_HEADERS });
}

async function handleGetScores(env) {
    const rows = await env.DB.prepare(
        `SELECT u.username, s.score, s.created_at
         FROM scores s
         JOIN users u ON s.user_id = u.id
         ORDER BY s.score DESC
         LIMIT 10`
    ).all();

    return Response.json({ leaderboard: rows.results || [] }, { headers: JSON_HEADERS });
}

async function handlePostScore(request, env) {
    const auth = request.headers.get('Authorization') || '';
    const token = auth.replace('Bearer ', '');

    const user = await getUserFromToken(env, token);
    if (!user) {
        return Response.json({ error: '请先登录' }, { status: 401, headers: JSON_HEADERS });
    }

    const { score } = await request.json();
    const scoreNum = parseInt(score, 10);
    if (isNaN(scoreNum) || scoreNum < 0) {
        return Response.json({ error: '无效的分数' }, { status: 400, headers: JSON_HEADERS });
    }

    await env.DB.prepare('INSERT INTO scores (user_id, score) VALUES (?, ?)').bind(user.id, scoreNum).run();

    const rankRow = await env.DB.prepare('SELECT COUNT(*) + 1 as rank FROM scores WHERE score > ?').bind(scoreNum).first();

    return Response.json({ ok: true, rank: rankRow.rank, score: scoreNum }, { headers: JSON_HEADERS });
}

async function handleMe(request, env) {
    const auth = request.headers.get('Authorization') || '';
    const token = auth.replace('Bearer ', '');

    const user = await getUserFromToken(env, token);
    if (!user) {
        return Response.json({ error: '未登录' }, { status: 401, headers: JSON_HEADERS });
    }

    return Response.json({ username: user.username, userId: user.id }, { headers: JSON_HEADERS });
}
