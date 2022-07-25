import { readFile, readFileSync, writeFile, writeFileSync } from 'fs'
import { parse, stringify } from 'opml'
import Parser from 'rss-parser'
import * as dotenv from 'dotenv'
dotenv.config()

const countFeeds = (subs) => {
  let count = 0
  subs.forEach((sub) => {
    if (sub.type === 'rss')
      count++
    else
      count += countFeeds(sub.subs)
  })
  return count
}

const newFeed = process.argv.slice(2)
if (newFeed.length !== 0) {
  // add a new feed to the opml file
  // eslint-disable-next-line prefer-const
  let [shortcode, feedUrl, folder] = newFeed
  // custom your own shortcode
  if (shortcode === 'b') {
    feedUrl = `https://rsshub.app/bilibili/user/dynamic/${feedUrl}`
    folder = '视频'
  }
  const parser = new Parser()
  parser.parseURL(feedUrl, (_err, feed) => {
    console.log(`Adding ${feed.title}`)
    const opmlFile = readFileSync('./feeds.opml', 'utf8')
    parse(opmlFile, (_err, opmlDoc) => {
      if (
        opmlDoc.opml.body.subs.flat().some(item => item.xmlUrl === feedUrl)
      ) {
        console.log(`${feed.title} already exists`)
        return
      }
      const newOutline = {
        text: feed.title,
        title: feed.title,
        description: feed.description || '',
        type: 'rss',
        version: 'RSS',
        xmlUrl: feed.feedUrl,
        htmlUrl: feed.link,
      }
      if (folder) {
        const folderIndex = opmlDoc.opml.body.subs.findIndex(
          item => item.text === folder && item.subs,
        )
        if (folderIndex === -1) {
          console.log(`Folder ${folder} not found`)
          return
        }
        opmlDoc.opml.body.subs[folderIndex].subs.push(newOutline)
      }
      else {
        opmlDoc.opml.body.subs.push(newOutline)
      }
      const newOpml = stringify(opmlDoc)
      writeFileSync('./feeds.opml', newOpml)
    })
  })
}
else {
  // opml to json
  readFile('./feeds.opml', (err, opmltext) => {
    if (!err) {
      parse(opmltext, (err, theOutline) => {
        console.log('total feeds:', countFeeds(theOutline.opml.body.subs))
        if (!err) {
          writeFile(
            './feeds.json',
            JSON.stringify(theOutline, undefined, 4),
            (err) => {
              if (!err)
                console.log('Successfully written to file')
            },
          )
        }
      })
    }
    else {
      console.log(err)
      process.exit(1)
    }
  })
}
