import axios from 'axios'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'

export function getTzDate(isoDateString?: string) {
  return dayjs.utc(isoDateString).tz(process.env.TIMEZONE ?? dayjs.tz.guess())
}

export function isDateVaild(date: Dayjs) {
  return date.isAfter(getTzDate().subtract(1, 'day'))
}

export async function isImageUrl(url: string) {
  // fetch the image and check the content type

  if (
    url.includes('sinaimg.cn') && url.includes('timeline_card')
  ) {
    return false
  }

  const imagePrefixToCheck = [
    // weibo
    'https://h5.sinaimg.cn/m/emoticon/icon/',
    'https://face.t.sinajs.cn/t4/appstyle/expression/ext/normal',
    // github
    'https://github.githubassets.com/images/icons/emoji/unicode',
    // bilibili
    'https://i0.hdslb.com/bfs/emote',
  ]
  if (imagePrefixToCheck.some(i => url.startsWith(i))) {
    return false
  }

  try {
    const res = await axios.head(url)
    return res.headers['content-type'].startsWith('image/')
  } catch (e) {
    return false
  }
}

export function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const tagsToReplace = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
}

function replaceTag(tag: string) {
  return tagsToReplace[tag as keyof typeof tagsToReplace] || tag
}

export function safeTagsReplace(str: string) {
  return str.replace(/[&<>]/g, replaceTag)
}

export function linkAfterTrim(str: string) {
  return str.replace(/https:\/\/www\.v2ex\.com\/t\/(\d+)#reply\d+/gm, 'https://www.v2ex.com/t/$1')
    .replace(/https:\/\/www\.coolapk\.com\/feed\/(\d+)\?shareKey=.*/gm, 'https://www.coolapk.com/feed/$1')
}
