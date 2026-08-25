import { getUserFromToken } from '../_lib/auth.js';

export async function onRequestGet(context) {
    const { request, env } = context;

    const auth = request.headers.get('Authorization') || '';
    const token = auth.replace('Bearer ', '');

    const user = await getUserFromToken(env, token);
    if (!user) {
        return Response.json({ error: '未登录' }, { status: 401 });
    }

    return Response.json({ username: user.username, userId: user.id });
}
