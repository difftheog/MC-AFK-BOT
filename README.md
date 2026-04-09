# MC AFK Bot

A Discord-controlled Minecraft AFK bot. Send bots to any server, keep them alive automatically, and manage everything from a single Discord channel.

Supports both cracked (offline-mode) and premium (Microsoft) accounts.

---

## Features

- Join cracked or online-mode Minecraft servers via Discord commands
- Auto-jumps and rotates view to prevent AFK kicks
- Microsoft OAuth handled entirely through Discord — no client needed
- Auto-registers and logs in on servers running AuthMe, nLogin, or similar plugins
- Relays in-game chat to your Discord channel
- Auto-reconnects up to 5 times on disconnect or kick
- Rate limiting to prevent command spam
- Configurable command prefix via `config.json`
- Run multiple bots across different servers simultaneously

---

## Project Structure

```
├── bot.js              # Entry point — Discord client and command handler
├── core/
│   ├── manager.js      # Manages the lifecycle of all active bot instances
│   ├── minecraft.js    # Minecraft bot logic, anti-AFK, auth, and events
│   └── ui.js           # Discord UI helpers (components v2)
├── auth-cache/         # Auto-created — stores Microsoft OAuth tokens
├── config.json         # Bot configuration (token, guild, prefix)
├── package.json
└── README.md
```

---

## Setup

**1. Install dependencies**

```bash
npm install
```

**2. Configure the bot**

Edit `config.json`:

```json
{
  "token": "your_discord_bot_token_here",
  "guildId": "your_server_id_here",
  "prefix": "?"
}
```

| Field     | Required | Description                                                                                     |
| --------- | -------- | ----------------------------------------------------------------------------------------------- |
| `token`   | Yes      | Your Discord bot token from the [Developer Portal](https://discord.com/developers/applications) |
| `guildId` | No       | Restrict the bot to a specific Discord server. Leave empty to allow all.                        |
| `prefix`  | Yes      | Command prefix (e.g. `?`, `!`, `-`)                                                             |

**3. Enable required Discord intents**

In the Developer Portal under your bot's settings, enable:

- Server Members Intent
- Message Content Intent

**4. Start the bot**

```bash
npm start
```

---

## Commands

All commands use the prefix set in `config.json` (default: `!`).

| Command                          | Description                                      |
| -------------------------------- | ------------------------------------------------ |
| `?join <ip[:port]> [username]`   | Join a cracked server with an optional username  |
| `?premjoin <ip[:port]>`          | Join an online-mode server via Microsoft account |
| `?leave <ip> <username>`         | Disconnect a specific bot                        |
| `?say <ip> <username> <message>` | Send a chat message in-game                      |
| `?jump <ip> <username>`          | Force a bot to jump                              |
| `?bots`                          | List all active bots and their status            |
| `?help`                          | Show the command list in Discord                 |

**Examples:**

```
?join mc.hypixel.net Steve
?premjoin play.example.com
?say play.example.com Steve Hello everyone
?leave play.example.com Steve
?jump play.example.com Steve
```

---

## Microsoft (Premium) Authentication

When you run `?premjoin`, the bot will send you a Microsoft login link in Discord if no valid cached token exists. After signing in once, the token is cached in the `auth-cache/` folder and reused automatically on reconnects. Tokens typically stay valid for up to 90 days.

---

## License

**MC AFK Bot** is released under a custom source-available license.

You may view, run, and privately modify the code for personal use.  
The following are **not permitted** without written permission from the author:

- Redistribution or publishing of the source code or any derivative
- Sublicensing or transferring rights to others
- Commercial use or monetisation
- Publicly hosting this bot or any derivative
- Removing or altering copyright notices, watermarks, or this license

The `LICENSE` file is a required component of the software — deleting or modifying it violates these terms and will prevent the bot from starting.

See the [`LICENSE`](./LICENSE.md) file for the full terms.

---

## Credits

Developed by [**@BetterDiff\_**](https://github.com/difftheog) · Discord: `@diff.ly`
