const dayjs = require('dayjs')
const TelegramBot = require('node-telegram-bot-api')
const feed = require('./feeds.json')
const Parser = require('rss-parser')
const fs = require('fs/promises')
require('dotenv').config()

const token = process.env.TG_TOKEN
const bot = new TelegramBot(token)
const chatId = process.env.TG_CHAT_ID

const parser = new Parser()

let sent = new Set()

async function save() {
  console.log('save sent feeds to file', sent.size)
  await fs.writeFile('./sent.json', JSON.stringify(Array.from(sent)))
}

async function load() {
  try {
    const data = await fs.readFile('./sent.json')
    const pre = Array.from(JSON.parse(data))
      .map((i) => JSON.parse(i))
      .map((i) => ({ date: dayjs(i.date), link: i.link }))
      .filter((i) => isDateVaild(i.date))
      .map((i) => JSON.stringify(i))
    sent = new Set(pre)
    console.log('load sent feeds from file', sent.size)
  } catch (e) {
    console.log('error:', e)
  }
}

const isDateVaild = (date) => date.isAfter(dayjs().subtract(1, 'day'))
const isFeedNeedToBeSent = (item) => {
  if (
    item.link.includes('https://github.com/') &&
    [
      'deleted branch',
      'pushed to',
      'created a branch',
      'closed an issue',
      'closed a pull request',
      'created a tag',
      'deleted tag',
    ].some((i) => item.title.includes(i))
  ) {
    return false
  }
  return true
}

const parseAndSend = async (subItem) => {
  try {
    const res = await parser.parseURL(subItem.xmlUrl)
    console.log('feed:', subItem.title, subItem.xmlUrl)
    for (const item of res.items) {
      const date = dayjs(item.isoDate)
      if (isDateVaild(date) && isFeedNeedToBeSent(item)) {
        if (!sent.has(JSON.stringify({ date, link: item.link }))) {
          sent.add(JSON.stringify({ date, link: item.link }))
          if (item.content) {
            const images = item.content.match(
              /(http)?s?:?(\/\/[^"']*\.(?:png|jpg|jpeg|gif|png|svg))/g,
            )
            if (images != null) {
              const caption = {
                caption:
                  `<b>${item.title}</b>` +
                  '\n' +
                  subItem.title +
                  '\n\n' +
                  item.link,
                parse_mode: 'HTML',
                disable_web_page_preview: true,
              }
              if (images.length > 1) {
                await bot.sendMediaGroup(
                  chatId,
                  images.map((v, i) => {
                    if(i === 0) {
                      return {
                        type: 'photo',
                        media: v,
                        ...caption
                      }
                    } else {
                      return {
                        type: 'photo',
                        media: v,
                      }
                    }
                  }),
                )
              } else {
                await bot.sendPhoto(chatId, images[0], caption)
              }
              continue
            }
          }
          await bot.sendMessage(
            chatId,
            `<b>${item.title}</b>` + '\n' + subItem.title + '\n\n' + item.link,
            { parse_mode: 'HTML', disable_web_page_preview: true },
          )
        }
      }
    }
  } catch (e) {
    console.log('error:', subItem.title, subItem.xmlUrl, e)
  }
}

async function main() {
  await load()
  for (const group of feed.opml.body.subs) {
    if (group.subs) {
      for (const subItem of group.subs) {
        await parseAndSend(subItem)
      }
    } else {
      await parseAndSend(group)
    }
  }
  await save()
}

main()
