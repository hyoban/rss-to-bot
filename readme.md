# rss to bot [![send feeds to bot](https://github.com/hyoban/rss-to-bot/actions/workflows/main.yml/badge.svg)](https://github.com/hyoban/rss-to-bot/actions/workflows/main.yml)

Use GitHub Action to send your rss feed to telegram bot.

## How to use

1. replace your rss feed in `feeds.opml`
2. add `TG_TOKEN` and `TG_CHAT_ID` in your Gtihub repo secrets

## FAQ

if you don't know how to get chat id, maybe you can use following code.

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
