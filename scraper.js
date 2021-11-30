import fetch from 'node-fetch'
import cheerio from 'cheerio'
import he from 'he'

export const url = 'https://fnanen.com'

export async function fetchLetters () {
  return fetch(url)
    .then(res => res.text())
    .then(async html => {
      const $ = cheerio.load(html)
      const items = $('nav.letters > ul').first()
      return items.children().map((_, li) => {
        const a = li.children[0]
        const letter = a.attribs.href
        return (letter || '').toString()
      }).toArray()
    })
}

export async function fetchArtists (letter) {
  return fetch(url + letter)
    .then(res => res.text())
    .then(async html => {
      const $ = cheerio.load(html)
      const items = $('#fnanenList .catList .catRow .cat a')
      return items.map((_, a) => {
        const artist = (a.children[0].data || '').trim()
        const artistUrl = url + a.attribs.href
        return {
          name: artist,
          url: artistUrl
        }
      }).toArray()
    })
}

function parseSongs (html) {
  const songs = []
  const $ = cheerio.load(html)
  const items = $('#fnanenList .catList #songsList tbody tr')
  items.each((_, tr) => {
    const tds = tr.children.filter(n => n.name === 'td')
    const a = tds?.[0]?.children?.filter(n => n.name === 'a')?.[0]
    const name = a?.children?.[0]?.data
    const songUrl = a?.attribs?.href
    if (!name) {
      return
    }
    songs.push({
      name: name?.trim(),
      url: songUrl
    })
  })
  return songs
}

export async function fetchSongs (artist) {
  const artistUrl = artist.url
  const artistName = artist.name
  return fetch(artistUrl)
    .then(res => res.text())
    .then(async html => {
      const $ = cheerio.load(html)
      const items = $('#fnanenList .catList #paging ul.pagination li')
      // pagination
      let maxPage = 1
      items.each((_, li) => {
        const a = li.children[0]
        const num = parseInt(a?.children?.[0]?.data)
        if (num) {
          maxPage = Math.max(maxPage, num)
        }
      })
      // songs
      return Promise.all([...Array(maxPage).keys()].map(async (i) => {
        async function getSongs () {
          if (i === 0) {
            return Promise.resolve(parseSongs(html))
          } else {
            const pageUrl = artistUrl + '&page=' + (i + 1)
            return fetch(pageUrl).then(res => res.text()).then(html => parseSongs(html))
          }
        }
        return getSongs().then(songs => (songs || []).map(s => ({ ...s, artist: artistName })))
      })).then(songs => songs.flat())
    })
}

function parseSong (html) {
  const $ = cheerio.load((html || '').replace(/[\n]/g, ''))
  const titleEl = $('#fnanenList .lyricsPage .itemTitle')
  const ldiv = $('#fnanenList .lyricsPage .lyrics')
  const lddiv = $('#fnanenList .lyricsPage .lyrics .lrxData')
  const title = (titleEl.first().text() || '').trim()
  const data = {}
  let lyrics = ''
  let author
  let composer
  let date
  function appendLyrics (el) {
    if (el?.type === 'text' && el?.data) {
      lyrics += he.decode(el.data || '').trim()
    } else if (el?.name === 'br') {
      lyrics += '\n'
    } else if (['strong', 'span', 'em'].includes(el?.name)) {
      el?.children?.forEach(appendLyrics)
      if (el?.name === 'em') {
        lyrics += '\n'
      }
    } else if (el?.name === 'tbody') {
      el?.children?.forEach(tr => {
        if (tr?.name === 'tr') {
          tr?.children?.forEach(td => {
            if (td?.name === 'td') {
              td?.children?.forEach(appendLyrics)
            }
          })
        }
      })
    } else if (el?.name === 'p') {
      el?.children?.forEach(appendLyrics)
    } else if (el?.name === 'div') {
      el?.children?.forEach(appendLyrics)
    }
  }
  ldiv.children('p, div, h3, table').each((nidx, node) => {
    if (node.name === 'p') {
      node.children?.forEach(appendLyrics)
      if (node?.children?.length > 1 || (node?.children?.length === 1 && ['strong', 'span', 'em', 'text'].includes((node?.children?.[0]?.name || node?.children?.[0]?.type)))) {
        lyrics += '\n'
      }
    } else if (node.name === 'div' && (nidx === 0 || !['lrxData', 'collapse'].includes(node.attribs?.class))) {
      node.children?.forEach(appendLyrics)
      if (node.children.length === 1) {
        lyrics += '\n'
      }
    } else if (node.name === 'h3' && nidx === 0) {
      node.children?.forEach(appendLyrics)
    } else if (node.name === 'table') {
      node.children?.forEach(appendLyrics)
    }
  })
  lyrics = he.decode(lyrics).trim()
  const keys = lddiv.children('span.extLbl')
  const values = lddiv.children('span.extTxt')
  function get (text) {
    for (let i = 0; i < keys.length; i++) {
      const span = keys[i]
      if (span.children?.[0]?.name === 'i' && span.children?.[1]?.data.includes(text)) {
        const value = values[i]?.children?.find(n => n.name === 'a')?.children?.[0]?.data
        return value
      }
    }
  }
  if (!author) {
    author = get('كلمات')
  }
  if (!composer) {
    composer = get('ألحان')
  }
  if (!date) {
    date = get('تاريخ')
  }
  if (title) {
    data.title = title
  }
  if (author) {
    data.author = author
  }
  if (composer) {
    data.composer = composer
  }
  if (date) {
    data.date = date
  }
  if (lyrics) {
    data.lyrics = lyrics
  }
  return data
}

export async function fetchSong (song) {
  const songUrl = url + song
  return fetch(songUrl)
    .then(res => res.text())
    .then(async html => ({
      ...parseSong(html),
      url: encodeURI(songUrl)
    }))
}
