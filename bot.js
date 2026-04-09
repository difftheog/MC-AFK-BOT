// ╔══════════════════════════════════════════════════════════╗
// ║              MC AFK Bot  —  by BetterDiff                ║
// ║           Entry point — Discord client & commands        ║
// ║      https://github.com/difftheog  |  @BetterDiff_       ║
// ╚══════════════════════════════════════════════════════════╝

import { createRequire } from 'module';
import fs from 'fs';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import {
  msg,
  ContainerBuilder,
  MessageFlags,
  thinDivider,
  text,
} from './core/ui.js';
import { BotManager } from './core/manager.js';

// ─── ANSI colour helpers ──────────────────────────────────────────────────────
const c = {
  reset:   '\x1b[0m',
  // backgrounds
  bgBlue:  '\x1b[44m',
  bgGreen: '\x1b[42m',
  bgRed:   '\x1b[41m',
  bgYellow:'\x1b[43m',
  bgCyan:  '\x1b[46m',
  bgMagenta:'\x1b[45m',
  bgGray:  '\x1b[100m',
  // foreground (for text on coloured bg)
  white:   '\x1b[97m',
  black:   '\x1b[30m',
  bold:    '\x1b[1m',
};

function tag(bg, label) {
  return `${c.bold}${bg}${c.white} ${label} ${c.reset}`;
}

const BOOT    = tag(c.bgBlue,    'BOOT');
const READY   = tag(c.bgGreen,   'READY');
const CMD     = tag(c.bgCyan,    'CMD');
const JOIN    = tag(c.bgMagenta, 'JOIN');
const PREM    = tag(c.bgMagenta, 'PREMJOIN');
const LEAVE   = tag(c.bgYellow,  'LEAVE');
const SAY     = tag(c.bgCyan,    'SAY');
const JUMP    = tag(c.bgCyan,    'JUMP');
const BOTS    = tag(c.bgCyan,    'BOTS');
const HELP    = tag(c.bgCyan,    'HELP');
const RLIMIT  = tag(c.bgYellow,  'RATELIMIT');
const ERROR   = tag(c.bgRed,     'ERROR');
const LICENSE = tag(c.bgRed,     'LICENSE');

// ─── License check ────────────────────────────────────────────────────────────
if (!fs.existsSync('./LICENSE')) {
  console.log('');
  console.log(`${LICENSE} LICENSE file is missing.`);
  console.log(`${LICENSE} This software is protected under a custom license.`);
  console.log(`${LICENSE} Deleting the LICENSE file is a violation of its terms.`);
  console.log(`${LICENSE} The bot will not start without it.`);
  console.log('');
  process.exit(1);
}

// ─── Config ───────────────────────────────────────────────────────────────────
const require = createRequire(import.meta.url);
const config = require('./config.json');

if (!config.token) {
  console.log(`${ERROR} token is not set in config.json.`);
  process.exit(1);
}

const PREFIX   = config.prefix || '!';
const GUILD_ID = config.guildId?.trim() || null;

console.log('');
console.log(`${BOOT} MC AFK Bot — by BetterDiff`);
console.log(`${BOOT} github.com/difftheog  |  @BetterDiff_`);
console.log(`${BOOT} Prefix: "${PREFIX}"  |  Guild lock: ${GUILD_ID || 'none'}`);
console.log('');

// ─── Discord client ───────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const botManager = new BotManager();

client.on('ready', () => {
  if (GUILD_ID) {
    console.log(`${READY} Logged in as ${client.user.tag} — restricted to guild ${GUILD_ID}`);
  } else {
    console.log(`${READY} Logged in as ${client.user.tag} — active in all servers`);
  }
  console.log('');
});

// ─── Help builder ─────────────────────────────────────────────────────────────
const COMMANDS = [
  { usage: `${PREFIX}join <ip[:port]> [username]`,  desc: 'Join a cracked server.' },
  { usage: `${PREFIX}premjoin <ip[:port]>`,          desc: 'Join an online-mode server via Microsoft account.' },
  { usage: `${PREFIX}leave <ip> <username>`,         desc: 'Disconnect a bot.' },
  { usage: `${PREFIX}say <ip> <username> <message>`, desc: 'Send a chat message in-game.' },
  { usage: `${PREFIX}bots`,                          desc: 'List all active bots.' },
  { usage: `${PREFIX}jump <ip> <username>`,          desc: 'Force a bot to jump.' },
  { usage: `${PREFIX}help`,                          desc: 'Show this reference.' },
];

function buildHelp() {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(text('## MC AFK Bot Commands'));
  container.addSeparatorComponents(thinDivider());

  const commandLines = COMMANDS
    .map((cmd) => `\`${cmd.usage}\` **- ${cmd.desc}**`)
    .join('\n');

  container.addTextDisplayComponents(
    text(
      '**Send Minecraft AFK bots to any server and control them from Discord.**\n' +
      '\n' +
      '**Main Commands:**\n' +
      commandLines
    )
  );

  container.addSeparatorComponents(thinDivider());
  container.addTextDisplayComponents(text('**Made by:** BetterDiff'));
  container.addSeparatorComponents(thinDivider());
  container.addTextDisplayComponents(
    text('-# Bots auto-jump every 5s and rotate view every 30s to prevent AFK kicks.')
  );

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

// ─── Rate limiting ────────────────────────────────────────────────────────────
const COOLDOWN_MS = 3_000;
const cooldowns   = new Map();

function isRateLimited(userId) {
  const last = cooldowns.get(userId);
  const now  = Date.now();
  if (last && now - last < COOLDOWN_MS) return true;
  cooldowns.set(userId, now);
  return false;
}

// ─── Username validation ──────────────────────────────────────────────────────
const MC_USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;
function isValidUsername(name) {
  return MC_USERNAME_RE.test(name);
}

// ─── Command handler ──────────────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot)   return;
  if (!message.guild)        return;
  if (!message.content)      return;
  if (GUILD_ID && message.guild.id !== GUILD_ID) return;

  const args    = message.content.trim().split(/\s+/);
  const command = args[0].toLowerCase();

  const knownCommands = [
    `${PREFIX}help`, `${PREFIX}join`, `${PREFIX}premjoin`,
    `${PREFIX}leave`, `${PREFIX}say`, `${PREFIX}bots`, `${PREFIX}jump`,
  ];
  if (!knownCommands.includes(command)) return;

  console.log(`${CMD} ${message.author.tag} (${message.author.id}) → ${message.content}`);

  if (isRateLimited(message.author.id)) {
    console.log(`${RLIMIT} ${message.author.tag} hit rate limit`);
    return message.reply(msg('-# Please wait a moment before sending another command.'));
  }

  if (command === `${PREFIX}help`) {
    console.log(`${HELP} Sent help menu to ${message.author.tag}`);
    return message.reply(buildHelp());
  }

  if (command === `${PREFIX}join`) {
    if (!args[1]) return message.reply(msg(`usage: \`${PREFIX}join <ip[:port]> [username]\``));
    const [host, rawPort] = args[1].split(':');
    const port     = parseInt(rawPort) || 25565;
    const username = args[2] || `AFK_${Math.floor(Math.random() * 9999)}`;

    if (!isValidUsername(username)) {
      console.log(`${JOIN} Invalid username rejected: "${username}"`);
      return message.reply(msg(`invalid username **${username}**\n-# Must be 3-16 characters, letters/numbers/underscores only.`));
    }

    console.log(`${JOIN} Cracked → ${username}@${host}:${port}`);
    botManager.joinCracked({ host, port, username }, message.channel);
    return;
  }

  if (command === `${PREFIX}premjoin`) {
    if (!args[1]) return message.reply(msg(`usage: \`${PREFIX}premjoin <ip[:port]>\``));
    const [host, rawPort] = args[1].split(':');
    const port = parseInt(rawPort) || 25565;
    console.log(`${PREM} ${message.author.tag} → ${host}:${port}`);
    botManager.joinPremium(message.author.id, { host, port }, message.channel);
    return;
  }

  if (command === `${PREFIX}leave`) {
    if (!args[1] || !args[2]) return message.reply(msg(`usage: \`${PREFIX}leave <ip> <username>\``));
    const [host] = args[1].split(':');
    console.log(`${LEAVE} Removing ${args[2]}@${host}`);
    botManager.removeBot(args[2], host, message.channel);
    return;
  }

  if (command === `${PREFIX}say`) {
    if (!args[1] || !args[2] || !args[3]) {
      return message.reply(msg(`usage: \`${PREFIX}say <ip> <username> <message>\``));
    }
    const [host]   = args[1].split(':');
    const username = args[2];
    const chatText = args.slice(3).join(' ');
    console.log(`${SAY} ${username}@${host}: "${chatText}"`);
    botManager.say(username, host, chatText, message.channel);
    return;
  }

  if (command === `${PREFIX}bots`) {
    console.log(`${BOTS} Status requested by ${message.author.tag}`);
    return message.reply(botManager.getStatus());
  }

  if (command === `${PREFIX}jump`) {
    if (!args[1] || !args[2]) return message.reply(msg(`usage: \`${PREFIX}jump <ip> <username>\``));
    const [host] = args[1].split(':');
    console.log(`${JUMP} ${args[2]}@${host}`);
    botManager.jump(args[2], host, message.channel);
    return;
  }
});

client.login(config.token);
