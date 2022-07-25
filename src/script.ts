import { readFile, writeFile } from 'fs/promises'
// @ts-expect-error no type information available for module
import { parse, stringify } from 'opml'
import Parser from 'rss-parser'
import { cac } from 'cac'
import type { Feeds, Sub } from './types'
import { Type, Version } from './types'

// Get the current number of feeds
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

const parser = new Parser()

const parseAndWrite = async (feedUrl: string, folder?: string, name?: string) => {
  const feed = await parser.parseURL(feedUrl)
  // eslint-disable-next-line no-console
  console.log(`Adding ${feed.title}`)
  const opmlFile = await readFile('./feeds.opml', { encoding: 'utf8' })
  parse(opmlFile, async (err: any, theOutline: Feeds) => {
    if (!err) {
      if (
        getAllFeeds(theOutline.opml.body.subs).some(item => item.xmlUrl === feedUrl)
      ) {
        console.error(`${feed.title} already exists`)
        return
      }
      const newOutline: Sub = {
        text: name ?? feed.title ?? '',
        title: name ?? feed.title ?? '',
        description: feed.description ?? '',
        type: Type.RSS,
        version: Version.RSS,
        xmlUrl: feedUrl,
        htmlUrl: feed.link,
      }
      if (folder) {
        const folderIndex = theOutline.opml.body.subs.findIndex(
          item => item.text === folder && item.subs,
        )
        if (folderIndex === -1) {
          console.error(`Folder ${folder} not found`)
          return
        }
        theOutline.opml.body.subs[folderIndex].subs?.push(newOutline)
      }
      else {
        theOutline.opml.body.subs.push(newOutline)
      }
      const newOpml = stringify(theOutline)
      await writeFile('./feeds.opml', newOpml)
    }
    else {
      console.error('Parse opml file error', err)
    }
  })
}

// opml to json
async function writeOpmlToJson() {
  try {
    const opmltext = await readFile('./feeds.opml', { encoding: 'utf8' })
    parse(opmltext, async (err: any, theOutline: any) => {
      // eslint-disable-next-line no-console
      console.log('Total feeds:', countFeeds(theOutline.opml.body.subs))
      if (!err) {
        await writeFile(
          './feeds.json',
          JSON.stringify(theOutline, undefined, 4),
        )
      }
      else {
        console.error('Parse opml file error', err)
      }
    })
  }
  catch (err) {
    console.error('Load opml file error', err)
  }
}

// custom your own shortcode here
async function handleShortCode(shortcode: string, feedUrl: string, folder: string, name: string) {
  if (shortcode === 'b') {
    await parseAndWrite(`https://rsshub.app/bilibili/user/dynamic/${feedUrl}`, '视频')
  }
  else if (shortcode === 'ab') {
    parser.parseURL(`http://rsshub.hyoban.cc:1200/bilibili/user/followings/${feedUrl}`, (_err, feed) => {
      feed.items.forEach(async (item) => {
        await parseAndWrite(`https://rsshub.app/bilibili/user/dynamic/${item.link?.split('/').pop()}`, '视频')
      })
    })
  }
  else if (shortcode === 't') {
    await parseAndWrite(`https://rsshub.app/twitter/user/${feedUrl}`, '时间线')
  }
  else if (shortcode === 'w') {
    await parseAndWrite(`http://rsshub.hyoban.cc:1200/weibo/user/${feedUrl}`, '时间线')
  }
  else if (shortcode === 'g') {
    await parseAndWrite(`https://github.com/${feedUrl}.atom`, 'GitHub', feedUrl)
  }
  else if (shortcode === 'default') {
    await parseAndWrite(feedUrl, folder === 'default' ? undefined : folder, name === 'default' ? undefined : name)
  }
}

const cli = cac()

cli
  .command('add <...url>', 'Add a new feed', {})
  .option('-s, --short <code>', 'Shortcode for the feed', {
    default: 'default',
  })
  .option('-f, --folder <foler>', 'Provide a folder for feed', {
    default: 'default',
  })
  .option('-n, --name <name>', 'Provide a name for feed', {
    default: 'default',
  })
  .action(async (urls, options) => {
    const shortcode = options.short as string
    const folder = options.folder as string
    const name = options.name as string
    const feedUrls = urls as string[]

    feedUrls.forEach(async (feedUrl) => {
      await handleShortCode(shortcode, feedUrl, folder, name)
    })
  })

cli
  .command('wirte', 'Write opml to json', {})
  .action(async () => {
    await writeOpmlToJson()
  })

cli.help()

cli.parse()
