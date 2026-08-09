// ============================================================
// بازی حکم آنلاین 1989 — منطق بازی
// فایل: server/game.js
// ============================================================

export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // 11=J, 12=Q, 13=K, 14=A
export const RANK_LABELS = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A' };
export const SUIT_SYMBOLS = { spades:'♠', hearts:'♥', diamonds:'♦', clubs:'♣' };

const TEAM_OF = [0, 1, 0, 1]; // صفر و دو تیم آبی، یک و سه تیم قرمز

export function buildDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push({ suit: s, rank: r, id: `${s}-${r}` });
    }
  }
  return deck;
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// قدرت کارت: ترامپ همیشه برنده، بعدش خال دمه، بعدش رتبه
export function cardPower(card, trumpSuit, leadSuit) {
  if (trumpSuit && card.suit === trumpSuit) return 200 + card.rank;
  if (leadSuit && card.suit === leadSuit) return 100 + card.rank;
  return card.rank;
}

// پیدا کردن برنده دست (تریک)
export function trickWinner(trick, trumpSuit, leadSuit) {
  let bestIdx = 0;
  let bestPower = cardPower(trick[0].card, trumpSuit, leadSuit);
  for (let i = 1; i < trick.length; i++) {
    const p = cardPower(trick[i].card, trumpSuit, leadSuit);
    if (p > bestPower) {
      bestPower = p;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// ============================================================
// کلاس اتاق بازی
// ============================================================
export class GameRoom {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = [null, null, null, null]; // socket id
    this.names = ['—', '—', '—', '—'];
    this.isBot = [false, false, false, false];
    this.playerCount = 0;
    this.state = 'waiting'; // waiting, choosing, playing, roundend, finished
    this.hands = [[], [], [], []];
    this.hakem = 0;
    this.trumpSuit = null;
    this.leadSuit = null;
    this.trick = [];
    this.currentPlayer = 0;
    this.tricksWon = [0, 0];
    this.scores = [0, 0];
    this.gameHistory = [];
    this.lastTrick = [];
    this.createdAt = Date.now();
  }

  isFull() { return this.playerCount >= 4; }
  isEmpty() { return this.playerCount === 0; }

  addPlayer(socketId, name) {
    for (let i = 0; i < 4; i++) {
      if (this.players[i] === null) {
        this.players[i] = socketId;
        this.names[i] = name;
        this.isBot[i] = false;
        this.playerCount++;
        return i;
      }
    }
    return -1;
  }

  removePlayer(socketId) {
    for (let i = 0; i < 4; i++) {
      if (this.players[i] === socketId) {
        this.players[i] = null;
        this.names[i] = '—';
        this.isBot[i] = false;
        this.playerCount--;
        return i;
      }
    }
    return -1;
  }

  replaceWithBot(seatIdx) {
    this.players[seatIdx] = null;
    this.isBot[seatIdx] = true;
    this.names[seatIdx] = 'ربات ' + (seatIdx + 1);
  }

  getSeatBySocket(socketId) {
    for (let i = 0; i < 4; i++) {
      if (this.players[i] === socketId) return i;
    }
    return -1;
  }

  startGame() {
    if (this.playerCount === 0) return false;
    for (let i = 0; i < 4; i++) {
      if (this.players[i] === null && !this.isBot[i]) {
        this.isBot[i] = true;
        this.names[i] = 'ربات ' + (i + 1);
      }
    }
    this.scores = [0, 0];
    this.startRound(0);
    return true;
  }

  startRound(hakemIdx) {
    this.hakem = hakemIdx;
    this.state = 'choosing';
    this.trumpSuit = null;
    this.leadSuit = null;
    this.trick = [];
    this.lastTrick = [];
    this.tricksWon = [0, 0];
    this.currentPlayer = (hakemIdx + 1) % 4;

    const deck = shuffle(buildDeck());
    for (let i = 0; i < 4; i++) {
      this.hands[i] = deck.slice(i * 13, (i + 1) * 13);
    }
  }

  setTrump(suit) {
    this.trumpSuit = suit;
    this.state = 'playing';
    this.currentPlayer = (this.hakem + 1) % 4;
  }

  isCardLegal(card, playerIdx) {
    if (this.trick.length === 0) return true;
    const leadSuit = this.trick[0].card.suit;
    const hasLead = this.hands[playerIdx].some(c => c.suit === leadSuit);
    if (hasLead) return card.suit === leadSuit;
    return true;
  }

  playCard(playerIdx, cardId) {
    if (this.state !== 'playing') return { error: 'بازی در حال انجام نیست' };
    if (playerIdx !== this.currentPlayer) return { error: 'نوبت شما نیست' };

    const cardIdx = this.hands[playerIdx].findIndex(c => c.id === cardId);
    if (cardIdx === -1) return { error: 'کارت پیدا نشد' };

    const card = this.hands[playerIdx][cardIdx];
    if (!this.isCardLegal(card, playerIdx)) return { error: 'باید خال دمه رو بازی کنید' };

    this.hands[playerIdx].splice(cardIdx, 1);
    this.trick.push({ playerIdx, card });

    if (this.trick.length === 1) {
      this.leadSuit = card.suit;
    }

    if (this.trick.length === 4) {
      return this.endTrick();
    }

    this.currentPlayer = (this.currentPlayer + 1) % 4;
    return { ok: true };
  }

  endTrick() {
    const leadSuit = this.trick[0].card.suit;
    const wIdx = trickWinner(this.trick, this.trumpSuit, leadSuit);
    const winnerIdx = this.trick[wIdx].playerIdx;
    const winnerTeam = TEAM_OF[winnerIdx];
    this.tricksWon[winnerTeam]++;
    this.lastTrick = [...this.trick];
    this.trick = [];
    this.leadSuit = null;
    this.currentPlayer = winnerIdx;

    if (this.tricksWon[0] + this.tricksWon[1] === 13) {
      this.endRound();
      return { ok: true, roundEnd: true };
    }

    return { ok: true, trickEnd: true, winnerIdx };
  }

  endRound() {
    let winnerTeam;
    if (this.tricksWon[0] >= 7) winnerTeam = 0;
    else if (this.tricksWon[1] >= 7) winnerTeam = 1;
    else winnerTeam = this.tricksWon[0] > this.tricksWon[1] ? 0 : 1;

    this.scores[winnerTeam]++;

    this.gameHistory.push({
      round: this.gameHistory.length + 1,
      tricks: [...this.tricksWon],
      winner: winnerTeam,
      hakem: this.hakem,
      trump: this.trumpSuit
    });

    if (this.scores[0] >= 7 || this.scores[1] >= 7) {
      this.state = 'finished';
    } else {
      this.state = 'roundend';
    }
  }

  nextRound() {
    if (this.state !== 'roundend') return false;
    const lastRound = this.gameHistory[this.gameHistory.length - 1];
    const winnerTeam = lastRound.winner;
    let newHakem = -1;
    for (let i = 0; i < 4; i++) {
      if (TEAM_OF[i] === winnerTeam) {
        newHakem = i;
        break;
      }
    }
    this.startRound(newHakem);
    return true;
  }

  newGame() {
    this.scores = [0, 0];
    this.gameHistory = [];
    this.startRound(0);
  }

  botChooseTrump(botIdx) {
    const hand = this.hands[botIdx];
    const suitCount = { spades: 0, hearts: 0, diamonds: 0, clubs: 0 };
    for (const c of hand) suitCount[c.suit]++;
    let bestSuit = 'spades';
    let bestScore = -1;
    for (const s of SUITS) {
      let score = suitCount[s] * 2;
      for (const c of hand) {
        if (c.suit === s && c.rank >= 12) score += c.rank - 10;
      }
      if (score > bestScore) {
        bestScore = score;
        bestSuit = s;
      }
    }
    return bestSuit;
  }

  aiChooseCard(botIdx) {
    const hand = this.hands[botIdx];
    if (hand.length === 0) return null;

    const myTeam = TEAM_OF[botIdx];

    if (this.trick.length === 0) {
      const nonTrump = hand.filter(c => c.suit !== this.trumpSuit);
      if (nonTrump.length > 0) {
        nonTrump.sort((a, b) => b.rank - a.rank);
        return nonTrump[0];
      }
      hand.sort((a, b) => b.rank - a.rank);
      return hand[0];
    }

    const leadSuit = this.trick[0].card.suit;
    const leadCards = hand.filter(c => c.suit === leadSuit);
    const trumpCards = hand.filter(c => c.suit === this.trumpSuit);

    const wIdx = trickWinner(this.trick, this.trumpSuit, leadSuit);
    const winningPlayer = this.trick[wIdx].playerIdx;
    const winningCard = this.trick[wIdx].card;
    const winningIsTeammate = TEAM_OF[winningPlayer] === myTeam;

    if (winningIsTeammate) {
      const playable = leadCards.length > 0 ? leadCards : hand;
      playable.sort((a, b) => a.rank - b.rank);
      return playable[0];
    }

    if (leadCards.length > 0) {
      if (winningCard.suit !== this.trumpSuit) {
        const higher = leadCards.filter(c => c.rank > winningCard.rank);
        if (higher.length > 0) {
          higher.sort((a, b) => a.rank - b.rank);
          return higher[0];
        }
      }
      leadCards.sort((a, b) => a.rank - b.rank);
      return leadCards[0];
    }

    if (trumpCards.length > 0) {
      if (winningCard.suit !== this.trumpSuit) {
        trumpCards.sort((a, b) => a.rank - b.rank);
        return trumpCards[0];
      }
