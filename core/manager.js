// ╔══════════════════════════════════════════════════════════╗
// ║              MC AFK Bot  —  by BetterDiff                ║
// ║         Manages the lifecycle of all bot instances       ║
// ║      https://github.com/difftheog  |  @BetterDiff_       ║
// ╚══════════════════════════════════════════════════════════╝

import { MinecraftBot } from './minecraft.js';
import { msg, msgList } from './ui.js';

// ─── ANSI colour helpers ──────────────────────────────────────────────────────
const a = {
  reset: '\x1b[0m', bold: '\x1b[1m', white: '\x1b[97m',
  bgGreen: '\x1b[42m', bgRed: '\x1b[41m', bgGray: '\x1b[100m',
};
function tag(bg, label) { return `${a.bold}${bg}${a.white} ${label} ${a.reset}`; }
const MGR_ADD = tag(a.bgGreen, 'MGR ADD');
const MGR_DEL = tag(a.bgRed,   'MGR DEL');
const MGR_INFO = tag(a.bgGray, 'MGR INFO');

// ─── BotManager ───────────────────────────────────────────────────────────────
export class BotManager {
  constructor() {
    this.bots           = new Map();
    this._authPasswords = new Map();
  }

  _getAuthPassword(username, host) {
    const key = `${username}@${host}`;
    if (!this._authPasswords.has(key)) {
      this._authPasswords.set(key, Math.random().toString(36).slice(2, 12) + 'Aa1!');
    }
    return this._authPasswords.get(key);
  }

  joinCracked(options, channel) {
    const key = `${options.username}@${options.host}`;
    if (this.bots.has(key)) {
      console.log(`${MGR_INFO} Bot already active: ${key}`);
      return channel.send(msg(`**${options.username}** is already active on **${options.host}**`));
    }

    const authPassword = this._getAuthPassword(options.username, options.host);
    const bot = new MinecraftBot(
      { ...options, auth: 'offline' },
      channel,
      () => { console.log(`${MGR_DEL} Fatal — removing ${key}`); this.bots.delete(key); },
      null,
      authPassword
    );
    this.bots.set(key, bot);
    console.log(`${MGR_ADD} Cracked bot added: ${key} (total: ${this.bots.size})`);
    bot.connect().catch((err) => console.error(`[manager] joinCracked error:`, err));
  }

  joinPremium(discordUserId, options, channel) {
    const alreadyRunning = [...this.bots.values()].some(
      (b) => b.options.host === options.host &&
        (b.options.username === discordUserId || b.discordUserId === discordUserId)
    );
    if (alreadyRunning) {
      console.log(`${MGR_INFO} Premium bot already active for ${discordUserId} on ${options.host}`);
      return channel.send(msg(`You already have a premium bot on **${options.host}**`));
    }

    let currentKey = `msa:${discordUserId}@${options.host}`;
    const bot = new MinecraftBot(
      { ...options, username: discordUserId, auth: 'microsoft' },
      channel,
      () => { console.log(`${MGR_DEL} Fatal — removing ${currentKey}`); this.bots.delete(currentKey); },
      (realUsername) => {
        this.bots.delete(currentKey);
        currentKey = `${realUsername}@${options.host}`;
        this.bots.set(currentKey, bot);
        console.log(`${MGR_INFO} Premium bot re-keyed to ${currentKey}`);
      }
    );

    bot.discordUserId = discordUserId;
    this.bots.set(currentKey, bot);
    console.log(`${MGR_ADD} Premium bot added: ${currentKey} (total: ${this.bots.size})`);
    bot.connect().catch((err) => console.error(`[manager] joinPremium error:`, err));
  }

  removeBot(username, host, channel) {
    const exactKey = `${username}@${host}`;
    if (this.bots.has(exactKey)) {
      this.bots.get(exactKey).stop();
      this.bots.delete(exactKey);
      console.log(`${MGR_DEL} Removed ${exactKey} (total: ${this.bots.size})`);
      return channel.send(msg(`**${username}** disconnected from **${host}**`));
    }

    for (const [key, bot] of this.bots.entries()) {
      if (bot.options.host === host &&
          (bot.realUsername === username || bot.options.username === username)) {
        bot.stop();
        this.bots.delete(key);
        console.log(`${MGR_DEL} Removed ${key} (total: ${this.bots.size})`);
        return channel.send(msg(`**${username}** disconnected from **${host}**`));
      }
    }

    console.log(`${MGR_INFO} removeBot: no bot found for ${username}@${host}`);
    return channel.send(msg(`no bot named **${username}** on **${host}**`));
  }

  jump(username, host, channel) {
    const exactKey = `${username}@${host}`;
    if (this.bots.has(exactKey)) { this.bots.get(exactKey).jump(); return; }
    for (const bot of this.bots.values()) {
      if (bot.options.host === host &&
          (bot.realUsername === username || bot.options.username === username)) {
        bot.jump(); return;
      }
    }
    channel.send(msg(`no bot named **${username}** on **${host}**`));
  }

  say(username, host, text, channel) {
    const exactKey = `${username}@${host}`;
    if (this.bots.has(exactKey)) { this.bots.get(exactKey).say(text); return; }
    for (const bot of this.bots.values()) {
      if (bot.options.host === host &&
          (bot.realUsername === username || bot.options.username === username)) {
        bot.say(text); return;
      }
    }
    channel.send(msg(`no bot named **${username}** on **${host}**`));
  }

  getStatus() {
    if (this.bots.size === 0) return msg('no active bots');
    const rows = [...this.bots.values()].map((bot) => {
      const name  = bot.realUsername || bot.options.username;
      const state = bot.bot?.entity ? 'online' : 'connecting';
      return `**${name}** — ${bot.options.host}:${bot.options.port} — ${state}`;
    });
    const count = rows.length;
    return msgList('**Active Bots**', rows, `-# ${count} bot${count === 1 ? '' : 's'} running`);
  }
}
