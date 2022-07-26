import { writeFile } from 'fs/promises'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
// @ts-expect-error no type information available for module
import TelegramBot from 'node-telegram-bot-api'
import type { Item } from 'rss-parser'
import Parser from 'rss-parser'
import axios from 'axios'
import dotenv from 'dotenv'
import _feeds from './feeds.json'
import data from './sent.json'
import type { Feeds, Sub } from './types'
const feeds = _feeds as Feeds
dotenv.config()

const token = process.env.TG_TOKEN
const bot = new TelegramBot(token)
const chatId = process.env.TG_CHAT_ID

const parser = new Parser()

const isDateVaild = (date: Dayjs) => date.isAfter(dayjs().subtract(1, 'day'))
const isFeedNeedToBeSent = (item: Item) => {
  if (
    item.link?.includes('https://github.com/')
    && [
      'deleted branch',
      'pushed to',
      'created a branch',
      'closed an issue',
      'closed a pull request',
      'created a tag',
      'deleted tag',
    ].some(i => item.title?.includes(i))
  ) return false

  return true
}

let sent = new Set()

async function save() {
  // eslint-disable-next-line no-console
  console.log('save sent feeds to file', sent.size)
  await writeFile('./sent.json', JSON.stringify(Array.from(sent)))
}

async function load() {
  try {
    const pre = Array.from(data)
      .map(i => JSON.parse(i))
      .map(i => ({ date: dayjs(i.date), link: i.link }))
      .filter(i => isDateVaild(i.date))
      .map(i => JSON.stringify(i))
    sent = new Set(pre)
    // eslint-disable-next-line no-console
    console.log('load sent feeds from file', sent.size)
  }
  catch (e) {
    console.error('error:', e)
  }
}

const isImageUrl = async (url: string) => {
  // fetch the image and check the content type

  if (
    url.includes('h5.sinaimg.cn/upload') && url.includes('timeline_card')
  ) return false

  const imagePrefixToCheck = [
    // weibo
    'https://h5.sinaimg.cn/m/emoticon/icon/',
    'https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal',
    // github
    'https://github.githubassets.com/images/icons/emoji/unicode',
    // bilibili
    'https://i0.hdslb.com/bfs/emote',
  ]
  if (imagePrefixToCheck.some(i => url.startsWith(i)))
    return false

  try {
    const res = await axios.head(url)
    return res.headers['content-type'].startsWith('image/')
  }
  catch (e) {
    return false
  }
}

const handleError = (e: any, item: Item, subItem: Sub, images?: string[]) => {
  console.error(
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
    ].some(i => e.message.includes(i))
  ) process.exit(1)
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

let success = 0

const tagsToReplace = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
}

function replaceTag(tag: string) {
  return tagsToReplace[tag as keyof typeof tagsToReplace] || tag
}

function safe_tags_replace(str: string) {
  return str.replace(/[&<>]/g, replaceTag)
}

const send = async (item: Item, subItem: Sub) => {
  if (item.content) {
    const images = []
    for (const i of item.content.matchAll(
      /(http)?s?:?(\/\/[^"']*\.(?:png|jpg|jpeg))/g,
    )) {
      if ((await isImageUrl(i[0])) && images.length < 9)
        images.push(i[0])
    }

    if (images.length > 0) {
      const caption = {
        caption:
          `<b>${safe_tags_replace(item.title ?? '')}</b>` + `\n${subItem.title}\n\n${item.link}`,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }
      if (images.length > 1) {
        try {
          await delay(500)
          await bot.sendMediaGroup(
            chatId,
            images.map((v, i) => {
              if (i === 0) {
                return {
                  type: 'photo',
                  media: v,
                  ...caption,
                }
              }
              else {
                return {
                  type: 'photo',
                  media: v,
                }
              }
            }),
          )
          success++
          return
        }
        catch (e) {
          handleError(e, item, subItem, images)
        }
      }
      else {
        try {
          await delay(500)
          await bot.sendPhoto(chatId, images[0], caption)
          success++
          return
        }
        catch (e) {
          handleError(e, item, subItem, images)
        }
      }
    }
  }
  try {
    await delay(500)
    await bot.sendMessage(
      chatId,
      `<b>${safe_tags_replace(item.title ?? '')}</b>` + `\n${subItem.title}\n\n${item.link}`,
      { parse_mode: 'HTML', disable_web_page_preview: true },
    )
    success++
  }
  catch (e) {
    handleError(e, item, subItem)
  }
}

const parseAndSend = async (subItem: Sub) => {
  try {
    const res = await parser.parseURL(subItem.xmlUrl!)
    // eslint-disable-next-line no-console
    console.log('feed:', subItem.title, subItem.xmlUrl)
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
  catch (e) {
    console.error('error:', subItem.title, subItem.xmlUrl)
  }
}

async function main() {
  if (!process.env.IS_TEST)
    await load()
  for (const group of feeds.opml.body.subs) {
    if (group.subs)
      for (const subItem of group.subs) await parseAndSend(subItem as Sub)
    else
      await parseAndSend(group as Sub)
  }
  // eslint-disable-next-line no-console
  console.log('success:', success)
  if (!process.env.IS_TEST)
    await save()
}

main()
