import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';
import cheerio from 'cheerio';

const url = 'https://fnanen.com';
const artistSongs = {};
const output = process.env.OUTPUT;
const dump = process.env.DUMP;
const debug = process.env.DEBUG;

// main function
(async function () {
	// letters
	return fetch(url)
		.then(res => res.text())
		.then(async html => {
			const $ = cheerio.load(html);
			const items = $('nav.letters > ul').first();
			return Promise.all(items.children().map((_, li) => {
				const a = li.children[0];
				const letter = a.attribs.href;
				// artists
				return fetch(url + letter)
					.then(res => res.text())
					.then(async html => {
						const $ = cheerio.load(html);
						const items = $('#fnanenList .catList .catRow .cat a');
						return Promise.all(items.map(async (_, a) => {
							const artist = a.children[0].data;
							const artistUrl = url + a.attribs.href;
							if (dump) {
								artistSongs[artist] = [];
							}
							if (output) {
								const dir = path.join(output, artist);
								if (!fs.existsSync(dir)) {
									fs.mkdirSync(dir, { recursive: true });
								}
							}
							return fetch(artistUrl).then(res => res.text()).then(async html => {
								const $ = cheerio.load(html);
								const items = $('#fnanenList .catList #paging ul.pagination li');
								// pagination
								let maxPage = 1;
								items.each((_, li) => {
									const a = li.children[0];
									const num = parseInt(a?.children?.[0]?.data);
									if (num) {
										maxPage = Math.max(maxPage, num);
									}
								})
								function parseSongs(html) {
									const songs = [];
									const $ = cheerio.load(html);
									const items = $('#fnanenList .catList #songsList tbody tr');
									items.each((_, tr) => {
										const tds = tr.children.filter(n => n.name === 'td')
										const a = tds?.[0]?.children?.filter(n => n.name === 'a')?.[0]
										const name = a?.children?.[0]?.data
										const url = a?.attribs?.href
										if (!name) {
											return;
										}
										songs.push({
											name: name?.trim(),
											url
										})
									})
									return songs
								}
								// songs
								return Promise.all([...Array(maxPage).keys()].map((i) => {
									function getSongs() {
										if (i === 0) {
											return Promise.resolve(parseSongs(html))
										} else {
											const pageUrl = artistUrl + '?page=' + (i + 1);
											return fetch(pageUrl).then(res => res.text()).then(html => parseSongs(html)).catch(console.error);
										}
									}
									return getSongs().then(songs => {
										return Promise.all((songs || []).map(song => {
											const songUrl = url + song.url;
											if (debug) {
												console.log(`Scraping ${songUrl}...`)
											}
											return fetch(songUrl).then(res => res.text()).then(async html => {
												const $ = cheerio.load(html);
												const titleEl = $('#fnanenList .lyricsPage .itemTitle');
												const ldiv = $('#fnanenList .lyricsPage .lyrics');
												const lddiv = $('#fnanenList .lyricsPage .lyrics .lrxData');
												const title = titleEl.first().text() || song.name;
												let lyrics = '';
												let author;
												let composer;
												let date;
												ldiv.children('p, div').each((_, node) => {
													node.children.forEach(n => {
														if (n.type === 'text') {
															lyrics += n.data + '\n';
														}
													})
												})
												lyrics = lyrics.trim();
												const keys = lddiv.children('span.extLbl')
												const values = lddiv.children('span.extTxt')
												function get(text) {
													for (let i = 0; i < keys.length; i++) {
														const span = keys[i];
														if (span.children?.[0]?.name === 'i' && span.children?.[1]?.data.includes(text)) {
															const value = values[i]?.children?.find(n => n.name === 'a')?.children?.[0]?.data;
															return value;
														}
													}
												}
												if (!author) {
													author = get('كلمات');
												}
												if (!composer) {
													composer = get('ألحان');
												}
												if (!date) {
													date = get('تاريخ');
												}
												const data = {
													title,
													lyrics,
													author,
													composer,
													date,
													url: songUrl
												}
												if (dump) {
													artistSongs[artist].push(data);
												}
												if (output) {
													let file = path.join(output, artist, title);
													if (fs.existsSync(file)) {
														file += '_';
													}
													file += '.json';
													fs.writeFileSync(file, JSON.stringify(data));
												}
											}).then(() => {
												if (debug) {
													console.log(`Scraped ${songUrl}`)
												}
											})
										})).catch(console.error);
									})
								})).catch(console.error);
							}).catch(console.error);
						}))
					})
			}))
		}).then(() => {
			if (dump) {
				console.log(JSON.stringify(artistSongs));
			}
		})
})();