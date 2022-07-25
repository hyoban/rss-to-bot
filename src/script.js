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

const newFeeds = process.argv.slice(2)
if (newFeeds.length !== 0) {
  // add a new feed to the opml file
  newFeeds.forEach((feedUrl) => {
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
        opmlDoc.opml.body.subs.push(newOutline)
        const newOpml = stringify(opmlDoc)
        writeFileSync('./feeds.opml', newOpml)
      })
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
  })
}
