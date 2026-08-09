// ============================================================
// حکم آنلاین 1989 — منطق سمت کلاینت
// فایل: client/app.js
// ============================================================

(function () {
  'use strict';

  // ---------- اتصال Socket.IO ----------
  const socket = io();

  // ---------- متغیرهای وضعیت ----------
  let state = null;       // وضعیت بازی از سرور
  let mySeat = -1;        // صندلی من (0-3)
  let myName = localStorage.getItem('hokm_name') || '';
  let roomId = null;
  let isCreator = false;
  let soundOn = localStorage.getItem('hokm_sound') !== 'off';
  let gameSpeed = localStorage.getItem('hokm_speed') || 'normal';
  let currentTheme = localStorage.getItem('hokm_theme') || 'gold';
  let spinning = false;

  // ---------- نمادها و برچسب‌ها ----------
  const SUIT_SYMBOLS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
  const SUIT_LABELS = { spades: 'پیک', hearts: 'دل', diamonds: 'خشت', clubs: 'گشنیز' };
  const RANK_LABELS = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const RED_SUITS = ['hearts', 'diamonds'];

  // ---------- ابزار کمکی ----------
  function $(id) { return document.getElementById(id); }
  function $$(sel) { return document.querySelectorAll(sel); }

  function showScreen(name) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    const el = $('screen-' + name);
    if (el) el.classList.add('active');
  }

  function toast(msg, type) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (type ? ' ' + type : '');
    // ری‌استارت انیمیشن
    t.style.animation = 'none';
    t.offsetHeight;
    t.style.animation = '';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add('hidden'), 3000);
  }

  function playSound(type) {
    if (!soundOn) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === 'card') {
        osc.frequency.value = 600;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start(); osc.stop(ctx.currentTime + 0.1);
      } else if (type === 'win') {
        osc.frequency.setValueAtTime(523, ctx.currentTime);
        osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
        osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(); osc.stop(ctx.currentTime + 0.3);
      } else if (type === 'lose') {
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.setValueAtTime(300, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(); osc.stop(ctx.currentTime + 0.3);
      }
    } catch (e) { /* صدا در دسترس نیست */ }
  }

  // ---------- ساخت کارت HTML ----------
  function cardHTML(card, opts) {
    opts = opts || {};
    const sym = SUIT_SYMBOLS[card.suit];
    const rank = RANK_LABELS[card.rank];
    const colorClass = RED_SUITS.includes(card.suit) ? 'red' : 'black';
    const legal = opts.legal ? ' legal' : '';
    const illegal = opts.illegal ? ' illegal' : '';
    return `<div class="playing-card ${colorClass}${legal}${illegal}" data-card-id="${card.id}">
      <div class="corner top"><span class="rank">${rank}</span><span class="suit">${sym}</span></div>
      <div class="center-suit">${sym}</div>
      <div class="corner bottom"><span class="rank">${rank}</span><span class="suit">${sym}</span></div>
    </div>`;
  }

  function cardBackHTML() {
    return '<div class="card-back"></div>';
  }

  // ---------- اعمال تم ----------
  function applyTheme(theme) {
    document.body.className = '';
    if (theme !== 'gold') document.body.classList.add('theme-' + theme);
    currentTheme = theme;
    localStorage.setItem('hokm_theme', theme);
    $$('.theme-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === theme);
    });
  }

  // ============================================================
  // مدیریت رویدادهای UI — لابی
  // ============================================================
  function initLobby() {
    // پر کردن نام ذخیره‌شده
    if (myName) $('input-name').value = myName;

    $('btn-find-match').addEventListener('click', () => {
      const name = $('input-name').value.trim() || 'بازیکن';
      myName = name;
      localStorage.setItem('hokm_name', name);
      socket.emit('setName', name);
      socket.emit('findMatch', name);
      toast('در حال پیدا کردن بازی...');
    });

    $('btn-create-room').addEventListener('click', () => {
      const name = $('input-name').value.trim() || 'بازیکن';
      myName = name;
      localStorage.setItem('hokm_name', name);
      socket.emit('setName', name);
      socket.emit('createRoom', name);
    });

    $('btn-join-room').addEventListener('click', () => {
      const code = $('input-room-code').value.trim().toUpperCase();
      if (!code) { toast('کد اتاق را وارد کنید', 'error'); return; }
      const name = $('input-name').value.trim() || 'بازیکن';
      myName = name;
      localStorage.setItem('hokm_name', name);
      socket.emit('setName', name);
      socket.emit('joinRoom', { roomId: code, name });
    });

    $('btn-wheel').addEventListener('click', () => {
      showScreen('wheel');
    });

    $('btn-league').addEventListener('click', () => {
      showScreen('league');
    });

    $('btn-settings').addEventListener('click', () => {
      showScreen('settings');
      $('settings-name').value = myName;
      $('settings-sound').checked = soundOn;
    });
  }

  // ============================================================
  // مدیریت رویدادهای UI — اتاق
  // ============================================================
  function initRoom() {
    $('btn-leave-room').addEventListener('click', () => {
      if (confirm('از اتاق خارج می‌شوید؟')) {
        socket.emit('leaveRoom');
        showScreen('lobby');
      }
    });

    $('btn-copy-code').addEventListener('click', () => {
      const code = $('room-code-display').textContent;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(() => toast('کد کپی شد!', 'success'));
      } else {
        toast('کد: ' + code);
      }
    });

    $('btn-start-game').addEventListener('click', () => {
      socket.emit('startGame');
    });
  }

  function renderRoom() {
    if (!state) return;
    $('room-code-display').textContent = state.roomId;

    const grid = $('seats-grid');
    let html = '';
    for (let i = 0; i < 4; i++) {
      const occupied = state.names[i] !== null && state.names[i] !== undefined;
      const isMe = i === mySeat;
      const isBot = state.isBot[i];
      let classes = 'seat';
      if (occupied) classes += ' occupied';
      if (isMe) classes += ' me';
      if (state.hakem === i && state.state !== 'waiting') classes += ' is-hakem';
      if (isBot) classes += ' is-bot';

      html += `<div class="${classes}">
        <div class="seat-icon">${isBot ? '🤖' : (occupied ? '🧑' : '🚫')}</div>
        <div class="seat-name">${occupied ? escapeHtml(state.names[i]) : 'خالی'}</div>
        <div class="seat-status">${isMe ? 'شما' : (isBot ? 'ربات' : (occupied ? 'آماده' : 'منتظر...'))}</div>
      </div>`;
    }
    grid.innerHTML = html;

    // وضعیت
    const count = state.names.filter(n => n !== null && n !== undefined).length;
    if (state.state === 'waiting') {
      $('room-status').textContent = count + ' بازیکن آماده — ' + (4 - count) + ' صندلی خالی';
      $('btn-start-game').disabled = false;
      $('btn-start-game').textContent = count >= 2 ? 'شروع بازی (با ربات‌ها)' : 'شروع بازی';
    } else {
      $('room-status').textContent = 'بازی در حال انجام است';
      $('btn-start-game').disabled = true;
    }
  }

  // ============================================================
  // مدیریت رویدادهای UI — بازی
  // ============================================================
  function initGame() {
    // انتخاب ترامپ
    $$('.trump-choice').forEach(choice => {
      choice.addEventListener('click', () => {
        const suit = choice.dataset.suit;
        socket.emit('chooseTrump', suit);
        $('choose-trump-panel').classList.add('hidden');
      });
    });

    // راند بعدی
    $('btn-next-round').addEventListener('click', () => {
      socket.emit('nextRound');
      $('round-end-panel').classList.add('hidden');
    });

    // بازی جدید
    $('btn-new-game').addEventListener('click', () => {
      socket.emit('newGame');
      $('game-end-panel').classList.add('hidden');
    });

    // بازگشت به لابی
    $('btn-back-lobby').addEventListener('click', () => {
      socket.emit('leaveRoom');
      $('game-end-panel').classList.add('hidden');
      showScreen('lobby');
    });

    // چت
    $('chat-toggle').addEventListener('click', () => {
      $('chat-panel').classList.toggle('hidden');
    });
    $('btn-close-chat').addEventListener('click', () => {
      $('chat-panel').classList.add('hidden');
    });
    $('btn-send-chat').addEventListener('click', sendChat);
    $('chat-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendChat();
    });
  }

  function sendChat() {
    const msg = $('chat-input').value.trim();
    if (!msg) return;
    socket.emit('chat', msg);
    $('chat-input').value = '';
  }

  // ---------- نمایش وضعیت بازی ----------
  function renderGame() {
    if (!state) return;

    // امتیازها
    $('score-team-0').textContent = state.scores[0];
    $('score-team-1').textContent = state.scores[1];
    $('tricks-team-0').textContent = state.tricksWon[0];
    $('tricks-team-1').textContent = state.tricksWon[1];
    $('trick-number').textContent = state.tricksWon[0] + state.tricksWon[1] + (state.trick ? state.trick.length : 0);

    // حاکم و ترامپ
    if (state.hakem !== null && state.hakem !== undefined && state.names[state.hakem]) {
      $('hakem-name').textContent = state.names[state.hakem];
    }
    if (state.trumpSuit) {
      const sym = SUIT_SYMBOLS[state.trumpSuit];
      const display = $('trump-suit-display');
      display.textContent = sym + ' ' + SUIT_LABELS[state.trumpSuit];
      display.className = 'trump-suit ' + (RED_SUITS.includes(state.trumpSuit) ? 'suit-red' : 'suit-black');
      $('trump-display').classList.remove('hidden');
    } else {
      $('trump-suit-display').textContent = '—';
      $('trump-suit-display').className = 'trump-suit';
    }

    // نمایش دست بازیکنان دیگر (پشت برگ)
    // صندلی 0 = پایین (من)، 1 = چپ، 2 = بالا، 3 = راست
    const seatPositions = { 0: 'bottom', 1: 'left', 2: 'top', 3: 'right' };
    
    // تعداد برگ هر بازیکن = 13 - تعداد بازی‌شده‌اش
    const myCardsLeft = state.myHand ? state.myHand.length : 0;
    const totalPlayed = state.tricksWon[0] + state.tricksWon[1];
    const cardsInTrick = state.trick ? state.trick.length : 0;
    const totalCardsPlayed = totalPlayed * 4 + cardsInTrick;

    // نمایش پشت‌برگ برای بازیکنان دیگر
    for (let seat = 0; seat < 4; seat++) {
      if (seat === mySeat) continue;
      const pos = seatPositions[seat];
      const handEl = $('hand-' + pos);
      const infoEl = $('info-' + pos);
      if (!handEl) continue;

      // محاسبه تقریبی تعداد برگ باقی‌مانده
      let cardsLeft = 13 - totalPlayed;
      if (state.trick) {
        const myTrickCards = state.trick.filter(t => t.playerIdx === seat).length;
        const myPlayed = totalPlayed;
        cardsLeft = 13 - myPlayed - myTrickCards;
      }
      if (cardsLeft < 0) cardsLeft = 0;

      let backHtml = '';
      const showCount = Math.min(cardsLeft, 13);
      for (let c = 0; c < showCount; c++) backHtml += cardBackHTML();
      handEl.innerHTML = backHtml;

      // نام بازیکن و نشان نوبت
      const name = state.names[seat] || 'بازیکن';
      const isBot = state.isBot[seat];
      const isTurn = state.currentPlayer === seat && state.state === 'playing';
      const isHakem = state.hakem === seat;
      let infoHtml = `<span class="p-name">${escapeHtml(name)}</span>`;
      if (isBot) infoHtml += ' 🤖';
      if (isHakem) infoHtml += ' 👑';
      infoEl.innerHTML = infoHtml;
      infoEl.classList.toggle('is-turn', isTurn);
    }

    // اطلاعات پایین (من)
    const myNameDisplay = state.names[mySeat] || 'شما';
    const myIsTurn = state.currentPlayer === mySeat && state.state === 'playing';
    const myIsHakem = state.hakem === mySeat;
    let myInfoHtml = `<span class="p-name">${escapeHtml(myNameDisplay)}</span>`;
    if (myIsHakem) myInfoHtml += ' 👑';
    $('info-bottom').innerHTML = myInfoHtml;
    $('info-bottom').classList.toggle('is-turn', myIsTurn);

    // برگ‌های بازی‌شده در وسط
    renderTrickCards();

    // دست خودم
    renderMyHand();

    // مودال‌ها
    if (state.state === 'choosing') {
      if (state.hakem === mySeat) {
        $('choose-trump-panel').classList.remove('hidden');
      } else {
        $('choose-trump-panel').classList.add('hidden');
      }
    } else {
      $('choose-trump-panel').classList.add('hidden');
    }

    if (state.state === 'roundend') {
      showRoundEnd();
    } else {
      $('round-end-panel').classList.add('hidden');
    }

    if (state.state === 'finished') {
      showGameEnd();
    } else {
      $('game-end-panel').classList.add('hidden');
    }
  }

  function renderTrickCards() {
    // پاک کردن همه
    for (let i = 0; i < 4; i++) {
      $('played-' + i).innerHTML = '';
      $('played-' + i).classList.remove('shown');
    }

    if (!state.trick || state.trick.length === 0) return;

    // موقعیت هر بازیکن روی میز
    // seat 0 = bottom (played-2), 1 = left (played-3), 2 = top (played-0), 3 = right (played-1)
    const seatToPlayed = { 0: 2, 1: 3, 2: 0, 3: 1 };
    const playedSlots = ['played-top', 'played-right', 'played-bottom', 'played-left'];

    state.trick.forEach((entry) => {
      const slotIdx = seatToPlayed[entry.playerIdx];
      const el = $('played-' + slotIdx);
      el.innerHTML = cardHTML(entry.card);
      el.classList.add('shown');
    });
  }

  function renderMyHand() {
    const handEl = $('my-hand');
    if (!state.myHand || state.myHand.length === 0) {
      handEl.innerHTML = '';
      return;
    }

    // مرتب‌سازی دست بر اساس خال و رتبه
    const suitOrder = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };
    const sorted = [...state.myHand].sort((a, b) => {
      if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
      return a.rank - b.rank;
    });

    const isMyTurn = state.currentPlayer === mySeat && state.state === 'playing';
    const leadSuit = state.leadSuit;
    const hasLead = leadSuit ? sorted.some(c => c.suit === leadSuit) : false;

    let html = '';
    sorted.forEach((card) => {
      let legal = isMyTurn;
      let illegal = false;
      if (isMyTurn && leadSuit && hasLead) {
        legal = card.suit === leadSuit;
        illegal = !legal;
      }
      html += cardHTML(card, { legal: legal && !illegal, illegal });
    });
    handEl.innerHTML = html;

    // کلیک روی کارت
    handEl.querySelectorAll('.playing-card').forEach((cardEl) => {
      cardEl.addEventListener('click', () => {
        if (state.state !== 'playing') return;
        if (state.currentPlayer !== mySeat) {
          toast('نوبت شما نیست', 'error');
          return;
        }
        if (cardEl.classList.contains('illegal')) {
          toast('باید خال دمه رو بازی کنید', 'error');
          return;
        }
        const cardId = cardEl.dataset.cardId;
        socket.emit('playCard', cardId);
        playSound('card');
      });
    });
  }

  function showRoundEnd() {
    const panel = $('round-end-panel');
    const team0Won = state.tricksWon[0] > state.tricksWon[1];
    const myTeam = state.teams ? state.teams[mySeat] : 0;
    const myTeamWon = (myTeam === 0 && team0Won) || (myTeam === 1 && !team0Won);

    $('round-end-title').textContent = 'راند تمام شد';
    let text = `تیم آبی: ${state.tricksWon[0]} تریک — تیم قرمز: ${state.tricksWon[1]} تریک\n`;
    text += `امتیاز کل: ${state.scores[0]} - ${state.scores[1]}`;
    if (state.scores[0] >= 7 || state.scores[1] >= 7) {
      text += '\nبازی به پایان رسید!';
    }
    $('round-end-text').textContent = text;
    panel.classList.remove('hidden');
    playSound(myTeamWon ? 'win' : 'lose');
  }

  function showGameEnd() {
    const panel = $('game-end-panel');
    const team0Won = state.scores[0] >= 7;
    const myTeam = state.teams ? state.teams[mySeat] : 0;
    const myTeamWon = (myTeam === 0 && team0Won) || (myTeam === 1 && !team0Won);

    if (myTeamWon) {
      $('game-end-title').textContent = '🎉 تبریک! شما بردید!';
      playSound('win');
    } else {
      $('game-end-title').textContent = '😞 باختید!';
      playSound('lose');
    }
    $('game-end-text').textContent = `نتیجه نهایی: تیم آبی ${state.scores[0]} - تیم قرمز ${state.scores[1]}`;
    panel.classList.remove('hidden');
  }

  // ============================================================
  // گردونه شانس
  // ============================================================
  function initWheel() {
    $('btn-wheel-back').addEventListener('click', () => showScreen('lobby'));

    $('btn-spin-wheel').addEventListener('click', () => {
      if (spinning) return;
      spinning = true;
      $('btn-spin-wheel').disabled = true;
      $('wheel-result').classList.add('hidden');
      socket.emit('spinWheel');
    });
  }

  function handleWheelResult(data) {
    spinning = false;
    $('btn-spin-wheel').disabled = false;

    if (data.error) {
      toast(data.error, 'error');
      $('wheel-result').classList.remove('hidden');
      $('wheel-result').textContent = data.error;
      return;
    }

    if (data.success && data.prizeIdx !== undefined) {
      // چرخاندن گردونه
      const wheel = $('wheel');
      const segmentAngle = 360 / 8; // 45 درجه
      // هدف: قرار دادن جایزه زیر نشانگر (بالا)
      const targetAngle = 360 * 5 + (360 - data.prizeIdx * segmentAngle - segmentAngle / 2);
      wheel.style.transform = 'rotate(' + targetAngle + 'deg)';

      setTimeout(() => {
        const prize = data.prize;
        const resultEl = $('wheel-result');
        resultEl.classList.remove('hidden');
        resultEl.textContent = prize.icon + ' ' + prize.label;
        toast(prize.icon + ' ' + prize.label, 'success');
      }, 4200);
    }
  }

  // ============================================================
  // لیگ / اشتراک
  // ============================================================
  function initLeague() {
    $('btn-league-back').addEventListener('click', () => showScreen('lobby'));

    // دکمه‌های خرید اشتراک
    $$('[data-plan]').forEach(btn => {
      if (btn.id === 'btn-gift-sub') return;
      btn.addEventListener('click', () => {
        const plan = btn.dataset.plan;
        socket.emit('buySubscription', { plan });
        toast('در حال پردازش خرید...', 'success');
      });
    });

    // هدیه اشتراک
    $('btn-gift-sub').addEventListener('click', () => {
      const recipient = $('gift-recipient').value.trim();
      const plan = $('gift-plan').value;
      if (!recipient) {
        toast('نام دوست خود را وارد کنید', 'error');
        return;
      }
      socket.emit('giftSubscription', { recipient, plan });
      toast('در حال ارسال هدیه...', 'success');
    });
  }

  function handleSubscriptionResult(data) {
    if (data.success) {
      toast(data.message, 'success');
      if (!data.gift) {
        // باز کردن لیگ
        $('league-locked').classList.add('hidden');
        $('league-unlocked').classList.remove('hidden');
        renderLeaderboard();
      }
    } else {
      toast(data.message || 'خطا در خرید', 'error');
    }
  }

  function renderLeaderboard() {
    // داده نمایشی
    const players = [
      { name: 'استاد حکم', score: 1250 },
      { name: myName || 'شما', score: 420 },
      { name: 'پهلوان', score: 980 },
      { name: 'شاه‌بازی', score: 750 },
      { name: 'تازه‌کار', score: 180 }
    ];
    players.sort((a, b) => b.score - a.score);

    let html = '';
    players.forEach((p, i) => {
      const isMe = p.name === (myName || 'شما');
      html += `<div class="lb-row${isMe ? ' me' : ''}">
        <span class="lb-rank">${i + 1}</span>
        <span class="lb-name">${escapeHtml(p.name)}</span>
        <span class="lb-score">${p.score} امتیاز</span>
      </div>`;
    });
    $('leaderboard').innerHTML = html;

    const myRank = players.findIndex(p => p.name === (myName || 'شما')) + 1;
    $('league-rank').textContent = 'رتبه: ' + myRank + ' از ' + players.length;
  }

  // ============================================================
  // تنظیمات
  // ============================================================
  function initSettings() {
    $('btn-settings-back').addEventListener('click', () => showScreen('lobby'));

    $('settings-name').addEventListener('input', (e) => {
      myName = e.target.value;
      localStorage.setItem('hokm_name', myName);
    });

    $('settings-sound').addEventListener('change', (e) => {
      soundOn = e.target.checked;
      localStorage.setItem('hokm_sound', soundOn ? 'on' : 'off');
      if (soundOn) playSound('card');
    });

    $$('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        gameSpeed = btn.dataset.speed;
        localStorage.setItem('hokm_speed', gameSpeed);
        toast('سرعت: ' + btn.textContent);
      });
    });

    $$('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        applyTheme(btn.dataset.theme);
        toast('تم: ' + btn.textContent);
      });
    });
  }

  // ============================================================
  // چت
  // ============================================================
  function addChatMessage(data) {
    const msgs = $('chat-messages');
    const div = document.createElement('div');
    if (data.me) {
      div.className = 'chat-msg me';
      div.innerHTML = `<span class="chat-author">${escapeHtml(data.name)}</span>${escapeHtml(data.message)}`;
    } else if (data.system) {
      div.className = 'chat-msg system';
      div.textContent = data.message;
    } else {
      div.className = 'chat-msg other';
      div.innerHTML = `<span class="chat-author">${escapeHtml(data.name)}</span>${escapeHtml(data.message)}`;
    }
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  // ---------- فرار از HTML ----------
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ============================================================
  // رویدادهای Socket.IO
  // ============================================================
  socket.on('connect', () => {
    console.log('متصل به سرور');
  });

  socket.on('disconnect', () => {
    toast('ارتباط با سرور قطع شد', 'error');
  });

  socket.on('connect_error', () => {
    toast('خطا در اتصال به سرور', 'error');
  });

  socket.on('roomJoined', (data) => {
    roomId = data.roomId;
    mySeat = data.seat;
    isCreator = data.isCreator;
    showScreen('room');
  });

  socket.on('gameState', (data) => {
    state = data;
    mySeat = data.mySeat;
    if (data.state === 'waiting') {
      showScreen('room');
      renderRoom();
    } else {
      showScreen('game');
      renderGame();
    }
  });

  socket.on('error', (data) => {
    toast(data.message || 'خطا', 'error');
  });

  socket.on('chat', (data) => {
    addChatMessage(data);
  });

  socket.on('wheelResult', (data) => {
    handleWheelResult(data);
  });

  socket.on('subscriptionResult', (data) => {
    handleSubscriptionResult(data);
  });

  // ============================================================
  // شروع
  // ============================================================
  function init() {
    applyTheme(currentTheme);
    initLobby();
    initRoom();
    initGame();
    initWheel();
    initLeague();
    initSettings();
    showScreen('lobby');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
