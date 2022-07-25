import { readFile, readFileSync, writeFile, writeFileSync } from 'fs'
// @ts-expect-error no type information available for module
import { parse, stringify } from 'opml'
import Parser from 'rss-parser'
import * as dotenv from 'dotenv'
import type { Feeds, Sub } from './types'
import { Type, Version } from './types'
dotenv.config()

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

const parser = new Parser()

const parseAndWrite = async (feedUrl: string, folder: string) => {
  const feed = await parser.parseURL(feedUrl)
  // eslint-disable-next-line no-console
  console.log(`Adding ${feed.title}`)
  const opmlFile = readFileSync('./feeds.opml', 'utf8')
  parse(opmlFile, (_err: any, opmlDoc: Feeds) => {
    if (
      getAllFeeds(opmlDoc.opml.body.subs).some(item => item.xmlUrl === feedUrl)
    ) {
      console.error(`${feed.title} already exists`)
      return
    }
    const newOutline: Sub = {
      text: feed.title || '',
      title: feed.title || '',
      description: feed.description || '',
      type: Type.RSS,
      version: Version.RSS,
      xmlUrl: feedUrl,
      htmlUrl: feed.link,
    }
    if (folder) {
      const folderIndex = opmlDoc.opml.body.subs.findIndex(
        item => item.text === folder && item.subs,
      )
      if (folderIndex === -1) {
        console.error(`Folder ${folder} not found`)
        return
      }
      opmlDoc.opml.body.subs[folderIndex].subs?.push(newOutline)
    }
    else {
      opmlDoc.opml.body.subs.push(newOutline)
    }
    const newOpml = stringify(opmlDoc)
    writeFileSync('./feeds.opml', newOpml)
  })
}

const newFeed = process.argv.slice(2)
if (newFeed.length !== 0) {
  // add a new feed to the opml file
  const [shortcode, feedUrl, folder] = newFeed
  // custom your own shortcode
  if (shortcode === 'b') {
    parseAndWrite(`https://rsshub.app/bilibili/user/dynamic/${feedUrl}`, '视频')
  }
  else if (shortcode === 'ab') {
    parser.parseURL(`http://rsshub.hyoban.cc:1200/bilibili/user/followings/${feedUrl}`, (_err, feed) => {
      feed.items.forEach((item) => {
        parseAndWrite(`https://rsshub.app/bilibili/user/dynamic/${item.link?.split('/').pop()}`, '视频')
      })
    })
  }
  else if (shortcode === 't') {
    parseAndWrite(`https://rsshub.app/twitter/user/${feedUrl}`, '时间线')
  }
  else if (shortcode === 'w') {
    parseAndWrite(`http://rsshub.hyoban.cc:1200/weibo/user/${feedUrl}`, '时间线')
  }
  else {
    parseAndWrite(feedUrl, folder)
  }
}
else {
  // opml to json
  readFile('./feeds.opml', (err, opmltext) => {
    if (!err) {
      parse(opmltext, (err: any, theOutline: any) => {
        // eslint-disable-next-line no-console
        console.log('total feeds:', countFeeds(theOutline.opml.body.subs))
        if (!err) {
          writeFile(
            './feeds.json',
            JSON.stringify(theOutline, undefined, 4),
            (err) => {
              if (!err)
                // eslint-disable-next-line no-console
                console.log('Successfully written to file')
            },
          )
        }
      })
    }
    else {
      console.error(err)
      process.exit(1)
    }
  })
}
