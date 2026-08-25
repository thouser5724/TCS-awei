import { getUserFromToken } from '../_lib/auth.js';

export async function onRequestGet(context) {
    const { env } = context;

    const rows = await env.DB.prepare(
        `SELECT u.username, s.score, s.created_at
         FROM scores s
         JOIN users u ON s.user_id = u.id
         ORDER BY s.score DESC
         LIMIT 10`
    ).all();

    return Response.json({ leaderboard: rows.results || [] });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    const auth = request.headers.get('Authorization') || '';
    const token = auth.replace('Bearer ', '');

    const user = await getUserFromToken(env, token);
    if (!user) {
        return Response.json({ error: '请先登录' }, { status: 401 });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: '无效的请求' }, { status: 400 });
    }

    const score = parseInt(body.score, 10);
    if (isNaN(score) || score < 0) {
        return Response.json({ error: '无效的分数' }, { status: 400 });
    }

    await env.DB.prepare(
        'INSERT INTO scores (user_id, score) VALUES (?, ?)'
    ).bind(user.id, score).run();

    const rankRow = await env.DB.prepare(
        'SELECT COUNT(*) + 1 as rank FROM scores WHERE score > ?'
    ).bind(score).first();

    return Response.json({ ok: true, rank: rankRow.rank, score });
}
