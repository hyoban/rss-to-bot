import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
// @ts-expect-error no type information available for module
import TelegramBot from 'node-telegram-bot-api'
import Parser from 'rss-parser'
import axios from 'axios'
import dotenv from 'dotenv'
import chalk from 'chalk'
// @ts-expect-error no type information available for module
import { parse } from 'opml'

import type { Item } from 'rss-parser'
import type { Dayjs } from 'dayjs'
import type { AxiosResponse } from 'axios'
import type { Feeds, Sub } from './types'

// eslint-disable-next-line no-console
const log = console.log
dotenv.config()

dayjs.extend(utc)
dayjs.extend(timezone)

const token = process.env.TG_TOKEN
const bot = new TelegramBot(token)
const chatId = process.env.TG_CHAT_ID

const parser = new Parser()

const getTzDate = (isoDateString?: string) => dayjs.utc(isoDateString).tz(process.env.TIMEZONE ?? dayjs.tz.guess())
const isDateVaild = (date: Dayjs) => date.isAfter(getTzDate().subtract(1, 'day'))

const isFeedNeedToBeSent = (item: Item) => {
  // ignore some types of github notifications
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

  // ignore easy's weibo
  if (
    /「GitHub多星项目 ✨」.+/.test(item.title!)
    || /每天一个Linux上会用到的命令：今天是.+你用过吗/.test(item.title!)
  )
    return false

  if (item.title?.includes('拼多多'))
    return false

  return true
}

let sent = new Set<string>()

async function save() {
  if (process.env.GIST_TOKEN && process.env.GIST_ID) {
    // eslint-disable-next-line no-console
    console.log('save sent feeds to gist', sent.size)
    axios.patch(`https://api.github.com/gists/${process.env.GIST_ID}`, {
      files: {
        'sent.json': {
          content: JSON.stringify(
            Array.from(sent)
              .map(i => JSON.parse(i))
              .filter(i => isDateVaild(getTzDate(i.date)))
              .map(i => (JSON.stringify(i))),
          ),
        },
      },
    }, {
      headers: {
        Authorization: `token ${process.env.GIST_TOKEN}`,
      },
    })
  }
}

async function load(res: AxiosResponse) {
  try {
    const pre = Array.from(JSON.parse(res.data.files['sent.json'].content) as string[])
    sent = new Set(pre)
    // eslint-disable-next-line no-console
    console.log('load sent feeds from gist', sent.size)
  }
  catch (e) {
    console.error('error:', e)
  }
}

const isImageUrl = async (url: string) => {
  // fetch the image and check the content type

  if (
    url.includes('sinaimg.cn') && url.includes('timeline_card')
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

const handleError = (e: any, item: Item, images?: string[]) => {
  log(
    'error(send to tg):',
    item,
    images,
    chalk.red(e.message),
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

const send = async (item: Item) => {
  const textTemplate = `<b>${safe_tags_replace(item.title?.trim() ?? '')}</b>` + `\n${item.creator?.trim()}\n${item.pubDate?.trim()}\n\n${item.link?.trim()}`

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
        caption: textTemplate,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }
      try {
        await delay(500)
        await bot.sendPhoto(chatId, images[0], caption)
        success++
        return
      }
      catch (e) {
        handleError(e, item, images)
      }
    }
  }
  try {
    await delay(500)
    await bot.sendMessage(
      chatId,
      textTemplate,
      { parse_mode: 'HTML', disable_web_page_preview: true },
    )
    success++
  }
  catch (e) {
    handleError(e, item)
  }
}

const itemsToBeSent = [] as Item[]

const addItem = (item: { [key: string]: string } & Item, date: Dayjs, subItem: Sub) => {
  itemsToBeSent.push({
    ...item,
    pubDate: date.format('YYYY-MM-DD HH:mm:ss'),
    creator: item.creator ?? item.author ?? subItem.title,
  })
}

const linkAfterTrim = (str: string) =>
  str.replace(/https:\/\/www\.v2ex\.com\/t\/(\d+)#reply\d+/gm, 'https://www.v2ex.com/t/$1')
    .replace(/https:\/\/www\.coolapk\.com\/feed\/(\d+)\?shareKey=.*/gm, 'https://www.coolapk.com/feed/$1')

const parseAll = async (subItem: Sub) => {
  try {
    const res = await parser.parseURL(subItem.xmlUrl!)
    for (const item of res.items) {
      const date = getTzDate(item.isoDate ?? '')
      if (isDateVaild(date) && isFeedNeedToBeSent(item)) {
        if (!Array.from(sent).some(i => JSON.parse(i).link === linkAfterTrim(item.link ?? ''))) {
          sent.add(JSON.stringify({ date, link: linkAfterTrim(item.link ?? '') }))
          addItem(item, date, subItem)
        }
      }
    }
  }
  catch (e) {
    console.error('error:', subItem.title, subItem.xmlUrl)
  }
}

// Get all feeds info
const getAllFeeds = (subs: Sub[] | undefined) => {
  let feeds: Sub[] = []
  subs?.forEach((sub) => {
    if (sub.type === 'rss')
      feeds.push(sub)
    else
      feeds = feeds.concat(getAllFeeds(sub.subs))
  })
  return feeds
}

const countFeeds = (subs: Sub[] | undefined) => {
  let count = 0
  subs?.forEach((sub) => {
    if (sub.type === 'rss')
      count++
    else
      count += countFeeds(sub.subs)
  })
  return count
}

async function opmlToJson(opmltext: string): Promise<Feeds> {
  return new Promise((resolve, reject) => {
    try {
      parse(opmltext, async (err: any, theOutline: any) => {
        // eslint-disable-next-line no-console
        console.log('Total feeds:', countFeeds(theOutline.opml.body.subs))
        if (!err) {
          resolve(theOutline)
        }
        else {
          console.error('Parse opml file error', err)
          reject(err)
        }
      })
    }
    catch (err) {
      console.error('Load opml file error', err)
      reject(err)
    }
  })
}

async function main() {
  log(process.env.TIMEZONE)
  const res = await axios.get(`https://api.github.com/gists/${process.env.GIST_ID}`)
  if (!process.env.IS_TEST)
    await load(res)

  try {
    const feeds = await opmlToJson(res.data.files['feeds.opml'].content)
    const allFeeds = getAllFeeds(feeds.opml.body.subs)
    log(chalk.blue(`Found ${allFeeds.length} feeds, fetching...`))
    await Promise.all(allFeeds.map(parseAll))

    log(chalk.blue(`\nFound ${itemsToBeSent.length} items, sending...`))
    for (const item of itemsToBeSent.sort((a, b) => a.pubDate!.localeCompare(b.pubDate!)))
      await send(item)

    if (!process.env.IS_TEST)
      await save()
    log(chalk.green(`Success: ${success}`))
  }
  catch (e) {
    console.error(e)
  }
}

main()
