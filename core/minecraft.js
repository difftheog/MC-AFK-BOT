// ╔══════════════════════════════════════════════════════════╗
// ║              MC AFK Bot  —  by BetterDiff                ║
// ║        Minecraft bot logic, anti-AFK, auth, events       ║
// ║      https://github.com/difftheog  |  @BetterDiff_       ║
// ╚══════════════════════════════════════════════════════════╝

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import mineflayer from 'mineflayer';
import { pathfinder, Movements } from 'mineflayer-pathfinder';
import { msg, msgSections } from './ui.js';

// ─── ANSI colour helpers ──────────────────────────────────────────────────────
const a = {
  reset:    '\x1b[0m',
  bold:     '\x1b[1m',
  white:    '\x1b[97m',
  bgGreen:  '\x1b[42m',
  bgRed:    '\x1b[41m',
  bgYellow: '\x1b[43m',
  bgBlue:   '\x1b[44m',
  bgGray:   '\x1b[100m',
};

function tag(bg, label) {
  return `${a.bold}${bg}${a.white} ${label} ${a.reset}`;
}

const MC_SPAWN  = tag(a.bgGreen,  'MC SPAWN');
const MC_KICK   = tag(a.bgYellow, 'MC KICK');
const MC_RECONN = tag(a.bgBlue,   'MC RECONNECT');
const MC_FATAL  = tag(a.bgRed,    'MC FATAL');
const MC_STOP   = tag(a.bgGray,   'MC STOP');
const MC_AUTH   = tag(a.bgBlue,   'MC AUTH');

// ─── Constants ────────────────────────────────────────────────────────────────
const FATAL_CODES        = new Set(['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET']);
const MAX_RECONNECTS     = 5;
const RECONNECT_DELAY_MS = 15_000;
const ANTI_AFK_INTERVAL  = 5_000;
const MC_CHAT_LIMIT      = 256;

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const MS_CACHE_DIR = path.join(__dirname, '..', 'auth-cache');
fs.mkdirSync(MS_CACHE_DIR, { recursive: true });

// ─── Auth plugin patterns ─────────────────────────────────────────────────────
const REGISTER_PATTERNS = [
  /\/register/i, /please register/i, /you must register/i,
  /register to (play|continue)/i, /use \/reg/i,
];
const LOGIN_PATTERNS = [
  /\/(login|l) /i, /please (log\s?in|authenticate)/i,
  /you must (log\s?in|authenticate)/i, /use \/log/i,
];

function extractText(node) {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  let t = node.text || node.translate || '';
  if (Array.isArray(node.extra)) t += node.extra.map(extractText).join('');
  if (Array.isArray(node.with))  t += node.with.map(extractText).join('');
  return t;
}

function parseKickReason(reason) {
  try { return extractText(JSON.parse(reason)).trim() || reason; }
  catch { return reason; }
}

// ─── MinecraftBot ─────────────────────────────────────────────────────────────
export class MinecraftBot {
  constructor(options, discordChannel, onFatal, onRealUsername, authPassword) {
    this.options          = options;
    this.discordChannel   = discordChannel;
    this.onFatal          = onFatal;
    this.onRealUsername   = onRealUsername;
    this.bot              = null;
    this.jumpInterval     = null;
    this.lookInterval     = null;
    this.reconnectTimeout = null;
    this.isStopping       = false;
    this.isFatal          = false;
    this.isDisconnecting  = false;
    this.reconnectAttempts = 0;
    this.spawnedOnce      = false;
    this.realUsername     = null;
    this.authPassword     = authPassword || (Math.random().toString(36).slice(2, 12) + 'Aa1!');
  }

  send(content) {
    this.discordChannel.send(content).catch(() => {});
  }

  async _preAuth() {
    try {
      console.log(`${MC_AUTH} Starting Microsoft OAuth for ${this.options.host}`);
      const { default: prismarineAuth } = await import('prismarine-auth');
      const { Authflow, Titles } = prismarineAuth;

      const flow = new Authflow(
        this.options.username,
        MS_CACHE_DIR,
        { authTitle: Titles.MinecraftNintendoSwitch, deviceType: 'Nintendo', flow: 'live' },
        (data) => {
          const mins = Math.floor((data.expires_in || 900) / 60);
          console.log(`${MC_AUTH} OAuth code sent to Discord for ${this.options.host}`);
          this.send(
            msgSections(
              `Microsoft login required — **${this.options.host}**`,
              `Open: <${data.verification_uri}>\n\nCode: \`${data.user_code}\``,
              `-# Expires in ${mins} min. Bot joins automatically after sign-in.`
            )
          );
        }
      );

      await flow.getMinecraftJavaToken({ fetchProfile: false });
      console.log(`${MC_AUTH} OAuth completed for ${this.options.host}`);
      return true;

    } catch (err) {
      if (!this.isFatal && !this.isStopping) {
        this.isFatal = true;
        console.log(`${MC_FATAL} Microsoft auth failed for ${this.options.host} — ${err.message || err}`);
        this.send(msg(`Microsoft authentication failed\n-# ${err.message || String(err)} · bot removed`));
        if (this.onFatal) this.onFatal();
      }
      return false;
    }
  }

  async connect() {
    if (this.isStopping || this.isFatal) return;
    this.isDisconnecting = false;

    if (this.bot) {
      this.bot.removeAllListeners();
      try { this.bot.quit(); } catch {}
      this.bot = null;
    }

    if (this.options.auth === 'microsoft') {
      const ok = await this._preAuth();
      if (!ok) return;
    }

    if (this.isStopping || this.isFatal) return;

    const botOptions = {
      host:       this.options.host,
      port:       this.options.port || 25565,
      username:   this.options.username,
      auth:       this.options.auth || 'offline',
      version:    this.options.version || false,
      hideErrors: true,
    };

    this.bot = mineflayer.createBot(botOptions);
    this.bot.loadPlugin(pathfinder);

    this.bot.on('spawn', () => {
      if (this.isStopping || this.isFatal) return;
      this.reconnectAttempts = 0;
      this.isDisconnecting   = false;
      const name = this.bot.username;
      this.realUsername = name;

      if (!this.spawnedOnce && this.onRealUsername) {
        this.spawnedOnce = true;
        this.onRealUsername(name);
      }

      console.log(`${MC_SPAWN} ${name} spawned on ${this.options.host}:${this.options.port}`);
      this.send(msg(`**${name}** connected to **${this.options.host}**`));
      this.startAntiAfk();

      const defaultMove = new Movements(this.bot);
      this.bot.pathfinder.setMovements(defaultMove);
    });

    this.bot.on('messagestr', (raw) => {
      if (!this.bot || this.isStopping) return;
      const t = raw.toLowerCase();
      if (REGISTER_PATTERNS.some((p) => p.test(t))) {
        setTimeout(() => {
          if (this.bot && !this.isStopping)
            this.bot.chat(`/register ${this.authPassword} ${this.authPassword}`);
        }, 800);
        return;
      }
      if (LOGIN_PATTERNS.some((p) => p.test(t))) {
        setTimeout(() => {
          if (this.bot && !this.isStopping)
            this.bot.chat(`/login ${this.authPassword}`);
        }, 800);
      }
    });

    this.bot.on('chat', (username, chatMessage) => {
      if (!this.bot || username === this.bot.username) return;
      this.discordChannel
        .send(`\`${this.bot.username}\` **${username}:** ${chatMessage}`)
        .catch(() => {});
    });

    this.bot.on('error', (err) => {
      if (this.isStopping || this.isFatal) return;
      if (FATAL_CODES.has(err.code)) {
        this.isFatal = true;
        const name = this.realUsername || this.options.username;
        console.log(`${MC_FATAL} ${name}@${this.options.host} — ${err.code}`);
        this.send(msg(`**${name}** — cannot reach **${this.options.host}**\n-# ${err.code} · bot removed`));
        this.stop();
        if (this.onFatal) this.onFatal();
      }
    });

    this.bot.on('kicked', (reason) => {
      if (this.isStopping || this.isFatal || this.isDisconnecting) return;
      this.isDisconnecting = true;
      const name     = this.bot?.username || this.realUsername || this.options.username;
      const readable = parseKickReason(reason);
      console.log(`${MC_KICK} ${name} kicked from ${this.options.host} — ${readable}`);
      this.send(msgSections(
        `**${name}** kicked from **${this.options.host}**`,
        `-# ${readable}`
      ));
      this.handleDisconnect();
    });

    this.bot.on('end', () => {
      if (this.isStopping || this.isFatal || this.isDisconnecting) return;
      this.isDisconnecting = true;
      this.handleDisconnect();
    });
  }

  handleDisconnect() {
    if (this.isStopping || this.isFatal) return;
    this.stopAntiAfk();
    const name = this.realUsername || this.options.username;

    if (this.reconnectAttempts >= MAX_RECONNECTS) {
      console.log(`${MC_FATAL} ${name}@${this.options.host} — max reconnects reached`);
      this.send(msg(`**${name}** — max reconnects reached\n-# removed after ${MAX_RECONNECTS} failed attempts`));
      this.stop();
      if (this.onFatal) this.onFatal();
      return;
    }

    this.reconnectAttempts++;
    const delaySec = RECONNECT_DELAY_MS / 1000;
    console.log(`${MC_RECONN} ${name} → ${this.options.host} (attempt ${this.reconnectAttempts}/${MAX_RECONNECTS} in ${delaySec}s)`);
    this.send(msg(`**${name}** — reconnecting to **${this.options.host}**\n-# attempt ${this.reconnectAttempts}/${MAX_RECONNECTS} · in ${delaySec}s`));

    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => this.connect().catch(() => {}), RECONNECT_DELAY_MS);
  }

  startAntiAfk() {
    this.stopAntiAfk();
    this.jumpInterval = setInterval(() => {
      if (this.bot?.entity) {
        this.bot.setControlState('jump', true);
        setTimeout(() => { if (this.bot) this.bot.setControlState('jump', false); }, 400);
      }
    }, ANTI_AFK_INTERVAL);

    this.lookInterval = setInterval(() => {
      if (this.bot?.entity) {
        const yaw   = Math.random() * Math.PI * 2 - Math.PI;
        const pitch = (Math.random() - 0.5) * 1.0;
        this.bot.look(yaw, pitch, false);
      }
    }, 30_000);
  }

  stopAntiAfk() {
    if (this.jumpInterval) { clearInterval(this.jumpInterval); this.jumpInterval = null; }
    if (this.lookInterval) { clearInterval(this.lookInterval); this.lookInterval = null; }
  }

  jump() {
    const name = this.realUsername || this.options.username;
    if (!this.bot?.entity) {
      this.send(msg(`**${name}** — not in-game, cannot jump`));
      return;
    }
    this.bot.setControlState('jump', true);
    setTimeout(() => { if (this.bot) this.bot.setControlState('jump', false); }, 400);
    this.send(msg(`**${name}** jumped`));
  }

  say(text) {
    const name = this.realUsername || this.options.username;
    if (!this.bot?.entity) {
      this.send(msg(`**${name}** — not in-game, cannot send message`));
      return;
    }
    const truncated = text.length > MC_CHAT_LIMIT ? text.slice(0, MC_CHAT_LIMIT) : text;
    this.bot.chat(truncated);
    this.send(msg(`**${name}** said: ${truncated}`));
  }

  stop() {
    const name = this.realUsername || this.options.username;
    console.log(`${MC_STOP} Stopping ${name}@${this.options.host}`);
    this.isStopping = true;
    this.stopAntiAfk();
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.bot) {
      this.bot.removeAllListeners();
      try { this.bot.quit(); } catch {}
      this.bot = null;
    }
  }
}
