const dayjs = require('dayjs')
const TelegramBot = require('node-telegram-bot-api')
const feed = require('./feeds.json')
const Parser = require('rss-parser')
const fs = require('fs/promises')
const axios = require('axios').default
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

const isImageUrl = async (url) => {
  // fetch the image and check the content type
  try {
    const res = await axios.head(url)
    return res.headers['content-type'].startsWith('image/')
  } catch (e) {
    return false
  }
}

const handleError = (e, item, subItem, images) => {
  console.log(
    'error(send to tg):',
    item.title,
    subItem.title,
    subItem.xmlUrl,
    images,
    e.message,
  )
  if (
    ![
      'failed to get HTTP URL content',
      'Failed to get HTTP URL content',
      'Wrong type of the web page content',
      'wrong file identifier/HTTP URL specified',
    ].some((i) => e.message.includes(i))
  ) {
    process.exit(1)
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const send = async (item, subItem) => {
  if (item.content) {
    let images = []
    for (const i of item.content.matchAll(
      /(http)?s?:?(\/\/[^"']*\.(?:png|jpg|jpeg))/g,
    )) {
      if ((await isImageUrl(i[0])) && images.length < 9) {
        images.push(i[0])
      }
    }
    if (images.length > 0) {
      const caption = {
        caption:
          `<b>${item.title}</b>` + '\n' + subItem.title + '\n\n' + item.link,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }
      if (images.length > 1) {
        try {
          await delay(5000)
          await bot.sendMediaGroup(
            chatId,
            images.map((v, i) => {
              if (i === 0) {
                return {
                  type: 'photo',
                  media: v,
                  ...caption,
                }
              } else {
                return {
                  type: 'photo',
                  media: v,
                }
              }
            }),
          )
          return
        } catch (e) {
          handleError(e, item, subItem, images)
        }
      } else {
        try {
          await delay(5000)
          await bot.sendPhoto(chatId, images[0], caption)
          return
        } catch (e) {
          handleError(e, item, subItem, images)
        }
      }
    }
  }
  try {
    await delay(5000)
    await bot.sendMessage(
      chatId,
      `<b>${item.title}</b>` + '\n' + subItem.title + '\n\n' + item.link,
      { parse_mode: 'HTML', disable_web_page_preview: true },
    )
  } catch (e) {
    handleError(e, item, subItem)
  }
}

const parseAndSend = async (subItem) => {
  try {
    const res = await parser.parseURL(subItem.xmlUrl)
    console.log('feed:', subItem.title, subItem.xmlUrl)
    if (process.env.IS_TEST) {
      await send(res.items[0], subItem)
    } else {
      for (const item of res.items) {
        const date = dayjs(item.isoDate)
        if (isDateVaild(date) && isFeedNeedToBeSent(item)) {
          if (!sent.has(JSON.stringify({ date, link: item.link }))) {
            sent.add(JSON.stringify({ date, link: item.link }))
            await send(item, subItem)
          }
        }
      }
    }
  } catch (e) {
    console.log('error:', subItem.title, subItem.xmlUrl)
  }
}

async function main() {
  if (!process.env.IS_TEST) {
    await load()
  }
  for (const group of feed.opml.body.subs) {
    if (group.subs) {
      for (const subItem of group.subs) {
        await parseAndSend(subItem)
      }
    } else {
      await parseAndSend(group)
    }
  }
  if (!process.env.IS_TEST) {
    await save()
  }
}

main()
