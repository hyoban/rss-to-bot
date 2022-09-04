# rss to bot

[![send feeds to bot](https://github.com/hyoban/rss-to-bot/actions/workflows/main.yml/badge.svg)](https://github.com/hyoban/rss-to-bot/actions/workflows/main.yml)

[中文](./readme-zh.md)

Use Github Action to send your RSS feeds to Telegram bots.

## USE

1. Click `Use this template` to generate your own repository
2. Creat a new gist which should includes a `feeds.opml` (your rss feed), you can export one from other readers
3. `Settings->Secrets->Actions->New repository secrets` to create:
    1. Telegram's robot token `TG_TOKEN`
    2. The id `TG_CHAT_ID` of your conversation with the bot
    3. The time zone you are in `TIMEZONE`. For example `Asia/Shanghai`
    4. `GIST_ID` used to store feeds.opml and sent records
    5. `GIST_TOKEN` is used to update the gist, [Generate](https://github.com/settings/tokens/new?scopes=gist)

Here is a [gist example](https://gist.github.com/hyoban/4be1f8948a571a2a467cb1608b5185e6).

## FAQ

### How to get `TG_CHAT_ID`

You can run the following code locally, then send `/start` to the robot.

```js
const TelegramBot = require('node-telegram-bot-api')

const token = 'xxxxx'
const bot = new TelegramBot(token, { polling: true })
let chatId = null

bot.onText(/\/start/, (msg) => {
  chatId = msg.chat.id
  console.log('chatId:', chatId)
  bot.sendMessage(chatId, chatId)
})
```

### How to modify the frequency of sending subscriptions

Edit the content of `- cron: '0 7,12,17,22 * * *'` in the `.github/workflows/main.yml` file, the default meaning is that it will be executed at 7,12,17,22 o'clock every day.
