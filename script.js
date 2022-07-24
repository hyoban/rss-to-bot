const fs = require('fs')
const opml = require('opml')
require('dotenv').config()

fs.readFile('./feeds.opml', function (err, opmltext) {
  if (!err) {
    opml.parse(opmltext, function (err, theOutline) {
      if (!err) {
        // write to json file
        fs.writeFile(
          "./feeds.json",
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
