import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
// @ts-expect-error no type information available for module
import TelegramBot from 'node-telegram-bot-api'
import type { Item } from 'rss-parser'
import Parser from 'rss-parser'
import axios from 'axios'
import dotenv from 'dotenv'
import chalk from 'chalk'
import _feeds from './feeds.json'
import type { Feeds, Sub } from './types'

// eslint-disable-next-line no-console
const log = console.log
const feeds = _feeds as Feeds
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

async function load() {
  try {
    // use axios to get the content of the gist
    const res = await axios.get(`https://api.github.com/gists/${process.env.GIST_ID}`)
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
  const textTemplate = `<b>${safe_tags_replace(item.title ?? '')}</b>` + `\n${item.creator}\n${item.pubDate}\n\n${item.link}`

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
          handleError(e, item, images)
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
          handleError(e, item, images)
        }
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

const removeV2exHash = (str: string) => str.includes('https://www.v2ex.com/') ? str.replace(/#/g, '') : str

const parseAll = async (subItem: Sub) => {
  try {
    const res = await parser.parseURL(subItem.xmlUrl!)
    for (const item of res.items) {
      const date = getTzDate(item.isoDate ?? '')
      if (isDateVaild(date) && isFeedNeedToBeSent(item)) {
        if (!sent.has(JSON.stringify({ date, link: removeV2exHash(item.link ?? '') }))) {
          sent.add(JSON.stringify({ date, link: removeV2exHash(item.link ?? '') }))
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

async function main() {
  log(process.env.TIMEZONE)
  if (!process.env.IS_TEST)
    await load()
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

main()
