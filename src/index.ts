import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
// @ts-expect-error no type information available for module
import TelegramBot from 'node-telegram-bot-api'
import Parser from 'rss-parser'
import axios from 'axios'
import dotenv from 'dotenv'
import chalk from 'chalk'

import type { Item } from 'rss-parser'
import type { Dayjs } from 'dayjs'
import type { AxiosResponse } from 'axios'
import { isFeedNeedToBeSent } from './custom'
import type { Sub } from './types'
import { delay, getTzDate, isDateVaild, isImageUrl, linkAfterTrim, safeTagsReplace } from './util'

// eslint-disable-next-line no-console
const log = console.log
dotenv.config()

dayjs.extend(utc)
dayjs.extend(timezone)

const token = process.env.TG_TOKEN
const bot = new TelegramBot(token)
const chatId = process.env.TG_CHAT_ID

const parser = new Parser()

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
  } catch (e) {
    console.error('error:', e)
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
      'wrong type of the web page content',
      'failed to get HTTP URL content',
      'Failed to get HTTP URL content',
      'Wrong type of the web page content',
      'wrong file identifier/HTTP URL specified',
    ].some(i => e.message.includes(i))
  ) {
    process.exit(1)
  }
}

let success = 0

const send = async (item: Item) => {
  const textTemplate = `<b>${safeTagsReplace(item.title?.trim() ?? '')}</b>` + `\n${item.creator?.trim()}\n${item.pubDate?.trim()}\n\n${item.link?.trim()}`

  if (item.content) {
    const images = []
    for (const i of item.content.matchAll(
      /(http)?s?:?(\/\/[^"']*\.(?:png|jpg|jpeg))/g,
    )) {
      if ((await isImageUrl(i[0])) && images.length < 9) {
        images.push(i[0])
      }
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
      } catch (e) {
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
  } catch (e) {
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

const parseAll = async (subItem: Sub) => {
  try {
    const res = await parser.parseURL(subItem.xmlUrl!)
    for (const item of res.items) {
      if (process.env.IS_TEST) {
        addItem(item, getTzDate(item.pubDate), subItem)
        break
      }
      const date = getTzDate(item.isoDate ?? '')
      if (isDateVaild(date) && isFeedNeedToBeSent(item)) {
        if (!Array.from(sent).some(i => JSON.parse(i).link === linkAfterTrim(item.link ?? ''))) {
          sent.add(JSON.stringify({ date, link: linkAfterTrim(item.link ?? '') }))
          addItem(item, date, subItem)
        }
      }
    }
  } catch (e) {
    console.error('error:', subItem.title, subItem.xmlUrl)
  }
}

const parseFeedUrlInfo = async (link: string) => {
  try {
    const res = await parser.parseURL(link)
    return res
  } catch (e) {
    console.error('error:', link)
  }
}

async function main() {
  log(process.env.TIMEZONE)
  const res = await axios.get(`https://api.github.com/gists/${process.env.GIST_ID}`)
  if (!process.env.IS_TEST) {
    await load(res)
  }

  try {
    const feedUrls = (res.data.files['feeds.txt'].content as string)
      .split('\n')
      .map(i => i.trim())
      .filter(i => i.startsWith('http') || i.startsWith('https'))
      .filter(i => !(process.env.IS_TEST && i.includes('v2ex.com')))
    const allFeeds = await Promise.all(feedUrls.map(i => parseFeedUrlInfo(i)))
    log(chalk.blue(`Found ${allFeeds.length} feeds, fetching...`))

    const allFeedsSub = allFeeds.map((feed, index): Sub => ({
      text: feed?.title ?? '',
      title: feed?.title ?? '',
      xmlUrl: feedUrls[index],
    }))
    await Promise.all(allFeedsSub.map(i => parseAll(i)))

    log(chalk.blue(`\nFound ${itemsToBeSent.length} items, sending...`))
    for (const item of itemsToBeSent.sort((a, b) => a.pubDate!.localeCompare(b.pubDate!))) {
      await send(item)
    }

    if (!process.env.IS_TEST) {
      await save()
    }

    log(chalk.green(`Success: ${success}`))
  } catch (e) {
    console.error(e)
  }
}

main()
