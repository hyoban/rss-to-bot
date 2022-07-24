const fs = require('fs')
const opml = require('opml')
require('dotenv').config()
const Parser = require('rss-parser')

const newFeeds = process.argv.slice(2)
if (newFeeds.length !== 0) {
  // add a new feed to the opml file
  newFeeds.forEach((feedUrl) => {
    const parser = new Parser()
    parser.parseURL(feedUrl, (_err, feed) => {
      console.log(`Adding ${feed.title}`)
      const opmlFile = fs.readFileSync('./feeds.opml', 'utf8')
      opml.parse(opmlFile, (_err, opmlDoc) => {
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
        const newOpml = opml.stringify(opmlDoc)
        fs.writeFileSync('./feeds.opml', newOpml)
        console.log(`${feed.title} done`)
      })
    })
  })
} else {
  // opml to json
  fs.readFile('./feeds.opml', function (err, opmltext) {
    if (!err) {
      opml.parse(opmltext, function (err, theOutline) {
        if (!err) {
          fs.writeFile(
            './feeds.json',
            JSON.stringify(theOutline, undefined, 4),
            function (err) {
              if (!err) {
                console.log('Successfully written to file')
              }
            },
          )
        }
      })
    }
  })
}
