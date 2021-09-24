import { fetchLetters, fetchArtists, fetchSongs, fetchSong } from './scraper.js'
import process from 'process'
import * as fs from 'fs'
import { promises as fsp } from 'fs'
import * as path from 'path'

const artistSongs = {}
const output = process.env.OUTPUT
const dump = process.env.DUMP
const debug = process.env.DEBUG

// main function
async function main () {
  const artists = []
  const allSongs = []
  // letters
  await fetchLetters().then(letters => {
    return Promise.all(letters.map(letter => {
      // artists
      return fetchArtists(letter).then(as => {
        as.forEach(artist => {
          const artistName = (artist.name || '').trim()
          artists.push({
            name: artistName,
            url: artist.url
          })
          if (debug) {
            console.log(`Reading ${letter}`)
          }
          if (dump) {
            artistSongs[artistName] = []
          }
          if (output) {
            const dir = path.join(output, artistName)
            return !fs.existsSync(dir) ? fsp.mkdir(dir, { recursive: true }) : Promise.resolve()
          } else {
            return Promise.resolve()
          }
        })
      })
    })
    )
  })

  // allSongs
  const chunks = 100
  for (let i = 0; i < artists.length; i += chunks) {
    const chunk = artists.slice(i, i + chunks)
    await Promise.all(chunk.map(async artist => {
      const artistName = artist.name
      if (debug) {
        console.log(`Reading artist ${artistName}`)
      }
      return fetchSongs(artist).then(songs => {
        allSongs.push(...songs)
        if (debug) {
          console.log(`Done scraping artist ${artistName}`)
        }
      })
    }))
  }

  // parseSongs
  const songChunks = 200
  for (let i = 0; i < allSongs.length; i += songChunks) {
    const chunk = allSongs.slice(i, i + songChunks)
    await Promise.all(chunk.map(async song => {
      const artist = song.artist
      const songName = song.name
      const songUrl = song.url
      if (debug) {
        console.log(`Scraping ${songUrl}...`)
      }
      return fetchSong(songUrl).then(data => {
        if (dump) {
          artistSongs[artist].push(data)
        }
        if (output) {
          let file = path.join(output, artist, songName)
          // FIXME titles with duplicate names
          // if (artistSongs[artist]?.map(s => s.title === title)?.length > 1) {
          //  file += '_';
          // }
          file += '.json'
          return fsp.writeFile(file, JSON.stringify(data))
        } else {
          return Promise.resolve()
        }
      }).then(() => {
        if (debug) {
          console.log(`Scraped ${songUrl}`)
        }
      })
    })
    )
  }
  if (dump) {
    fs.writeFileSync(dump, JSON.stringify(artistSongs))
  }
}

main()
