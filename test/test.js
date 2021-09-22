import assert from 'assert'
import { fetchLetters, fetchSong, fetchSongs, url as base } from '../scraper.js'
import { describe, it } from 'mocha'
import fs from 'fs/promises'
import path from 'path'

function assertSong (t, file, url) {
  t.timeout(10000)
  return fs.readFile(path.resolve(`test/${file}`)).then(data => {
    const expectedSong = JSON.parse(data)
    return fetchSong(url).then(actualSong => {
      assert.deepStrictEqual(actualSong, expectedSong)
    })
  })
}

describe('scraper', function () {
  describe('fetchLetters', function () {
    it('should return 28 url strings', function () {
      return fetchLetters().then(letters => {
        assert.equal(letters.length, 28)
      })
    })
  })

  describe('pagination', function () {
    it('should return 123 song', function () {
      this.timeout(10000)
      const artist = {
        name: 'الشيخ امام',
        url: base + '/klmat/alaghany/a/alshy5-amam.html?arabic=%D8%A7%D9%84%D8%B4%D9%8A%D8%AE%20%D8%A7%D9%85%D8%A7%D9%85'
      }
      return fetchSongs(artist).then(songs => {
        assert.equal(songs.length, 123 + 27)
      })
    })
  })

  describe('parseSong', function () {
    it('parse multiple p', function () {
      return assertSong(this, 'ya-7odh.json', '/klmat/alaghany/b/bdryt-alsyd/ya-7odh.html?arabic=يا%20حوده')
    })

    it('parse p > strong', function () {
      return assertSong(this, 'alklmh-ala5yrh.json', '/klmat/alaghany/a/a9yl-abo-bkr/alklmh-ala5yrh.html?arabic=الكلمه%20الاخيره')
    })

    it('parse p > em', function () {
      return assertSong(this, 'ma-tghyrna-3lykm.json', '/klmat/alaghany/a/a9yl-abo-bkr/ma-tghyrna-3lykm.html?arabic=ما%20تغيرنا%20عليكم')
    })

    it('parse multiple p > strong > span', function () {
      return assertSong(this, 'allh-ya-allh--dyny-.json', '/klmat/alaghany/m/m7md-mnyr/allh-ya-allh--dyny-.html?arabic=الله%20يا%20الله%20(ديني)')
    })

    it('parse multiple p > em', function () {
      return assertSong(this, 'b7s-m3ak.json', '/klmat/alaghany/7/7madh-hlal/b7s-m3ak.html?arabic=بحس%20معاك')
    })

    it('parse p > strong > em', function () {
      return assertSong(this, 't3ala.json', '/klmat/alaghany/h-/hsham-3bas/t3ala.html?arabic=تعالى')
    })

    it('parse table > tbody > tr > td > strong', function () {
      return assertSong(this, 'a7bk-mot.json', '/klmat/alaghany/5/5ald-slym/a7bk-mot.html?arabic=احبك%20موت')
    })

    it('parse h3 > p', function () {
      return assertSong(this, 'ansanh.json', '/klmat/alaghany/f/foaz-alrjyb/ansanh.html?arabic=انسانه')
    })

    it('parse div > div', function () {
      return assertSong(this, 'an-shfykm.json', '/klmat/alaghany/m/my7d-7md/an-shfykm.html?arabic=ان%20شفيكم')
    })

    it('parse div > div > strong', function () {
      return assertSong(this, 'albom-9or.json', '/klmat/alaghany/m/m96fa-kaml/albom-9or.html?arabic=البوم%20صور')
    })
  })
})
