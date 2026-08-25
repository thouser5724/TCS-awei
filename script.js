(function () {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    const GRID_SIZE = 20;
    const COLS = canvas.width / GRID_SIZE;
    const ROWS = canvas.height / GRID_SIZE;
    const API_BASE = '/api';

    let snake = [];
    let direction = { x: 1, y: 0 };
    let nextDirection = { x: 1, y: 0 };
    let food = { x: 10, y: 10 };
    let score = 0;
    let bestScore = parseInt(localStorage.getItem('foodieBestScore') || '0', 10);
    let gameSpeed = 150;
    let gameLoop = null;
    let isPlaying = false;
    let isPaused = false;

    let authToken = localStorage.getItem('foodieToken') || '';
    let currentUsername = localStorage.getItem('foodieUsername') || '';

    const currentScoreEl = document.getElementById('currentScore');
    const bestScoreEl = document.getElementById('bestScore');
    const overlay = document.getElementById('overlay');
    const overlayTitle = document.getElementById('overlayTitle');
    const overlayMessage = document.getElementById('overlayMessage');
    const startBtn = document.getElementById('startBtn');
    const difficultyBtns = document.querySelectorAll('.btn-difficulty');

    const userArea = document.getElementById('userArea');
    const authModal = document.getElementById('authModal');
    const authModalTitle = document.getElementById('authModalTitle');
    const authForm = document.getElementById('authForm');
    const authUsernameInput = document.getElementById('authUsername');
    const authPasswordInput = document.getElementById('authPassword');
    const authError = document.getElementById('authError');
    const authSubmitBtn = document.getElementById('authSubmit');
    const authCancelBtn = document.getElementById('authCancel');
    const leaderboardList = document.getElementById('leaderboardList');

    let authMode = 'login';

    bestScoreEl.textContent = bestScore;

    // ===== 认证逻辑 =====
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    function updateUserArea() {
        if (authToken && currentUsername) {
            userArea.innerHTML = `
                <span class="user-name">${escapeHtml(currentUsername)}</span>
                <button class="btn-logout" id="logoutBtn">登出</button>
            `;
            document.getElementById('logoutBtn').addEventListener('click', logout);
        } else {
            userArea.innerHTML = `
                <button class="btn-auth" id="loginBtn">登录</button>
                <button class="btn-auth btn-register" id="registerBtn">注册</button>
            `;
            document.getElementById('loginBtn').addEventListener('click', () => openAuthModal('login'));
            document.getElementById('registerBtn').addEventListener('click', () => openAuthModal('register'));
        }
    }

    function openAuthModal(mode) {
        authMode = mode;
        authModalTitle.textContent = mode === 'login' ? '登录' : '注册';
        authSubmitBtn.textContent = mode === 'login' ? '登录' : '注册';
        authError.textContent = '';
        authUsernameInput.value = '';
        authPasswordInput.value = '';
        authModal.classList.remove('hidden');
        authUsernameInput.focus();
    }

    function closeAuthModal() {
        authModal.classList.add('hidden');
    }

    async function handleAuthSubmit(e) {
        e.preventDefault();
        const username = authUsernameInput.value.trim();
        const password = authPasswordInput.value;
        authError.textContent = '';

        try {
            const res = await fetch(`${API_BASE}/${authMode}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (!res.ok) {
                authError.textContent = data.error || '操作失败';
                return;
            }

            authToken = data.token;
            currentUsername = data.username;
            localStorage.setItem('foodieToken', authToken);
            localStorage.setItem('foodieUsername', currentUsername);
            closeAuthModal();
            updateUserArea();
            loadLeaderboard();
        } catch (err) {
            authError.textContent = '网络错误，请稍后重试';
        }
    }

    function logout() {
        authToken = '';
        currentUsername = '';
        localStorage.removeItem('foodieToken');
        localStorage.removeItem('foodieUsername');
        updateUserArea();
    }

    // ===== 排行榜逻辑 =====
    async function loadLeaderboard() {
        try {
            const res = await fetch(`${API_BASE}/scores`);
            const data = await res.json();
            renderLeaderboard(data.leaderboard || []);
        } catch (err) {
            leaderboardList.innerHTML = '<p class="leaderboard-empty">排行榜加载失败</p>';
        }
    }

    function renderLeaderboard(entries) {
        if (entries.length === 0) {
            leaderboardList.innerHTML = '<p class="leaderboard-empty">暂无记录，快来争第一！</p>';
            return;
        }
        leaderboardList.innerHTML = entries.map((entry, i) => {
            const rankClass = i < 3 ? `rank-${i + 1}` : '';
            return `
                <div class="leaderboard-row ${rankClass}">
                    <span class="lb-rank">${i + 1}</span>
                    <span class="lb-name">${escapeHtml(entry.username)}</span>
                    <span class="lb-score">${entry.score}</span>
                </div>
            `;
        }).join('');
    }

    async function submitScore(finalScore) {
        if (!authToken || finalScore <= 0) return;
        try {
            await fetch(`${API_BASE}/scores`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ score: finalScore })
            });
            loadLeaderboard();
        } catch (err) {
            // 静默失败
        }
    }

    // ===== 游戏逻辑 =====
    function initGame() {
        snake = [
            { x: 5, y: 10 },
            { x: 4, y: 10 },
            { x: 3, y: 10 }
        ];
        direction = { x: 1, y: 0 };
        nextDirection = { x: 1, y: 0 };
        score = 0;
        currentScoreEl.textContent = score;
        spawnFood();
        draw();
    }

    function spawnFood() {
        let valid = false;
        while (!valid) {
            food = {
                x: Math.floor(Math.random() * COLS),
                y: Math.floor(Math.random() * ROWS)
            };
            valid = !snake.some(s => s.x === food.x && s.y === food.y);
        }
    }

    function update() {
        if (isPaused) return;

        direction = { ...nextDirection };

        const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

        if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
            gameOver();
            return;
        }

        if (snake.some(s => s.x === head.x && s.y === head.y)) {
            gameOver();
            return;
        }

        snake.unshift(head);

        if (head.x === food.x && head.y === food.y) {
            score += 10;
            currentScoreEl.textContent = score;
            if (score > bestScore) {
                bestScore = score;
                bestScoreEl.textContent = bestScore;
                localStorage.setItem('foodieBestScore', String(bestScore));
            }
            spawnFood();
        } else {
            snake.pop();
        }

        draw();
    }

    function draw() {
        ctx.fillStyle = '#1a0f08';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        drawGrid();
        drawFood();
        drawCharacter();
    }

    function drawGrid() {
        ctx.strokeStyle = 'rgba(74, 48, 32, 0.4)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= COLS; i++) {
            ctx.beginPath();
            ctx.moveTo(i * GRID_SIZE, 0);
            ctx.lineTo(i * GRID_SIZE, canvas.height);
            ctx.stroke();
        }
        for (let i = 0; i <= ROWS; i++) {
            ctx.beginPath();
            ctx.moveTo(0, i * GRID_SIZE);
            ctx.lineTo(canvas.width, i * GRID_SIZE);
            ctx.stroke();
        }
    }

    function drawCharacter() {
        for (let i = snake.length - 1; i >= 0; i--) {
            const segment = snake[i];
            const x = segment.x * GRID_SIZE;
            const y = segment.y * GRID_SIZE;
            const cx = x + GRID_SIZE / 2;
            const cy = y + GRID_SIZE / 2;

            if (i === 0) {
                drawHead(cx, cy);
            } else {
                drawBody(cx, cy, i, snake.length);
            }
        }
        ctx.shadowBlur = 0;
    }

    function drawHead(cx, cy) {
        const r = GRID_SIZE / 2 - 1;

        ctx.shadowColor = '#fcd34d';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#fde68a';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#3b2412';
        ctx.beginPath();
        ctx.arc(cx, cy - r + 3, 4.5, Math.PI, 0);
        ctx.fill();

        ctx.fillStyle = '#1a1a1a';
        let e1x, e1y, e2x, e2y;
        if (direction.x === 1) {
            e1x = cx + 2; e1y = cy - 2;
            e2x = cx + 2; e2y = cy + 3;
        } else if (direction.x === -1) {
            e1x = cx - 4; e1y = cy - 2;
            e2x = cx - 4; e2y = cy + 3;
        } else if (direction.y === -1) {
            e1x = cx - 4; e1y = cy - 3;
            e2x = cx + 2; e2y = cy - 3;
        } else {
            e1x = cx - 4; e1y = cy + 1;
            e2x = cx + 2; e2y = cy + 1;
        }
        ctx.beginPath();
        ctx.arc(e1x, e1y, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(e2x, e2y, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#7c2d12';
        if (direction.x === 1) {
            ctx.beginPath();
            ctx.ellipse(cx + 5, cy + 1, 2, 3, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (direction.x === -1) {
            ctx.beginPath();
            ctx.ellipse(cx - 5, cy + 1, 2, 3, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (direction.y === -1) {
            ctx.beginPath();
            ctx.ellipse(cx, cy - 5, 3, 2, 0, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.ellipse(cx, cy + 6, 3, 2, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawBody(cx, cy, index, total) {
        const ratio = index / total;
        const alpha = 1 - ratio * 0.3;
        const r = GRID_SIZE / 2 - 2;

        ctx.fillStyle = `rgba(251, 146, 60, ${alpha})`;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.6})`;
        ctx.beginPath();
        ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fde68a';
        ctx.beginPath();
        ctx.arc(cx - r + 1, cy, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + r - 1, cy, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawFood() {
        const x = food.x * GRID_SIZE;
        const y = food.y * GRID_SIZE;
        const cx = x + GRID_SIZE / 2;
        const cy = y + GRID_SIZE / 2;
        const r = GRID_SIZE / 2 - 1;

        ctx.shadowColor = '#fde68a';
        ctx.shadowBlur = 12;

        ctx.fillStyle = '#fef9c3';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;

        ctx.strokeStyle = '#d4a574';
        ctx.lineWidth = 1;
        for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(cx + i * 3 - 1.5, cy - r + 3);
            ctx.lineTo(cx + i * 3 + 1.5, cy - r + 6);
            ctx.stroke();
        }

        ctx.fillStyle = 'rgba(248, 113, 113, 0.45)';
        ctx.beginPath();
        ctx.arc(cx - 4, cy + 2, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + 4, cy + 2, 1.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(cx - 2.5, cy, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + 2.5, cy, 1, 0, Math.PI * 2);
        ctx.fill();
    }

    function startGame() {
        initGame();
        isPlaying = true;
        isPaused = false;
        overlay.classList.add('hidden');
        if (gameLoop) clearInterval(gameLoop);
        gameLoop = setInterval(update, gameSpeed);
    }

    function gameOver() {
        clearInterval(gameLoop);
        gameLoop = null;
        isPlaying = false;
        overlayTitle.textContent = '阿伟吃饱了';
        const isNewRecord = score >= bestScore && score > 0;
        overlayMessage.textContent = `得分：${score}${isNewRecord ? ' — 新纪录！' : ''}`;
        startBtn.textContent = '再来一局';
        overlay.classList.remove('hidden');
        submitScore(score);
    }

    function togglePause() {
        if (!isPlaying) return;
        isPaused = !isPaused;
        if (isPaused) {
            overlayTitle.textContent = '已暂停';
            overlayMessage.textContent = '按空格或点击继续';
            startBtn.textContent = '继续';
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    }

    function setDirection(dx, dy) {
        if (direction.x === -dx && direction.y === -dy) return;
        if (direction.x === dx && direction.y === dy) return;
        nextDirection = { x: dx, y: dy };
    }

    // ===== 事件监听 =====
    document.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();

        if (key === ' ') {
            e.preventDefault();
            if (!isPlaying) {
                startGame();
            } else {
                togglePause();
            }
            return;
        }

        if (!isPlaying || isPaused) return;

        switch (key) {
            case 'arrowup': case 'w':
                setDirection(0, -1); break;
            case 'arrowdown': case 's':
                setDirection(0, 1); break;
            case 'arrowleft': case 'a':
                setDirection(-1, 0); break;
            case 'arrowright': case 'd':
                setDirection(1, 0); break;
        }
    });

    let touchStartX = 0, touchStartY = 0;
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (!isPlaying || isPaused) return;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;

        if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;

        if (Math.abs(dx) > Math.abs(dy)) {
            setDirection(dx > 0 ? 1 : -1, 0);
        } else {
            setDirection(0, dy > 0 ? 1 : -1);
        }
    }, { passive: false });

    document.querySelectorAll('.btn-mobile').forEach(btn => {
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (!isPlaying || isPaused) return;
            const dir = btn.dataset.dir;
            if (dir === 'up') setDirection(0, -1);
            else if (dir === 'down') setDirection(0, 1);
            else if (dir === 'left') setDirection(-1, 0);
            else if (dir === 'right') setDirection(1, 0);
        }, { passive: false });

        btn.addEventListener('click', (e) => {
            if (!isPlaying || isPaused) return;
            const dir = btn.dataset.dir;
            if (dir === 'up') setDirection(0, -1);
            else if (dir === 'down') setDirection(0, 1);
            else if (dir === 'left') setDirection(-1, 0);
            else if (dir === 'right') setDirection(1, 0);
        });
    });

    startBtn.addEventListener('click', () => {
        if (isPaused) {
            isPaused = false;
            overlay.classList.add('hidden');
        } else {
            startGame();
        }
    });

    difficultyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            difficultyBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            gameSpeed = parseInt(btn.dataset.speed, 10);
            if (isPlaying && !isPaused) {
                clearInterval(gameLoop);
                gameLoop = setInterval(update, gameSpeed);
            }
        });
    });

    authForm.addEventListener('submit', handleAuthSubmit);
    authCancelBtn.addEventListener('click', closeAuthModal);
    authModal.addEventListener('click', (e) => {
        if (e.target === authModal) closeAuthModal();
    });

    // ===== 初始化 =====
    updateUserArea();
    loadLeaderboard();
    initGame();
})();
