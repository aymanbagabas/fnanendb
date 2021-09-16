import * as fs from 'fs';
import { promises as fsp } from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';
import cheerio from 'cheerio';
import he from 'he';

const url = 'https://fnanen.com';
const artistSongs = {};
const output = process.env.OUTPUT;
const dump = process.env.DUMP;
const debug = process.env.DEBUG;

// main function
(async function () {
	const artists = [];
	const allSongs = [];
	// letters
	await fetch(url)
		.then(res => res.text())
		.then(async html => {
			const $ = cheerio.load(html);
			const items = $('nav.letters > ul').first();
			return Promise.all(items.children().map((_, li) => {
				const a = li.children[0];
				const letter = a.attribs.href;
				if (debug) {
					console.log(`letter: ${letter}`);
				}
				// artists
				return fetch(url + letter)
					.then(res => res.text())
					.then(async html => {
						const $ = cheerio.load(html);
						const items = $('#fnanenList .catList .catRow .cat a');
						return await Promise.all(items.map(async (_, a) => {
							const artist = a.children[0].data;
							const artistUrl = url + a.attribs.href;
							artists.push({
								artist,
								url: artistUrl
							})
							if (dump) {
								artistSongs[artist] = [];
							}
							if (output) {
								const dir = path.join(output, artist);
								return !fs.existsSync(dir) ? fsp.mkdir(dir, { recursive: true }) : Promise.resolve();
							}
							return Promise.resolve();
						}));
					})
			}))
		})
	const chunks = 100;
	// artists
	for (let i = 0; i < artists.length; i += chunks) {
		const chunk = artists.slice(i, i + chunks);
		await Promise.all(chunk.map(async artist => {
			const artistUrl = artist.url;
			const artistName = artist.artist;
			if (debug) {
				console.log(`Reading artist ${artistName}`)
			}
			return fetch(artistUrl)
				.then(res => res.text())
				.then(async html => {
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
					[...Array(maxPage).keys()].forEach(async (i) => {
						async function getSongs() {
							if (i === 0) {
								return Promise.resolve(parseSongs(html))
							} else {
								const pageUrl = artistUrl + '?page=' + (i + 1);
								return fetch(pageUrl).then(res => res.text()).then(html => parseSongs(html)).catch(console.error);
							}
						}
						await getSongs().then(songs => {
							allSongs.push(...(songs || []).map(s => ({ ...s, artist: artistName })));
						})
					})
				}).then(() => {
					if (dump) {
						console.log(`Done scraping artist ${artistName}`)
					}
				})
		}))
	}
	const songChunks = 200;
	for (let i = 0; i < allSongs.length; i += songChunks) {
		const chunk = allSongs.slice(i, i + songChunks);
		await Promise.all(chunk.map(async song => {
			const artist = song.artist;
			const songName = song.name;
			const songUrl = url + song.url;
			if (debug) {
				console.log(`Scraping ${songUrl}...`)
			}
			return fetch(songUrl)
				.then(res => res.text())
				.then(async html => {
					const $ = cheerio.load(html);
					const titleEl = $('#fnanenList .lyricsPage .itemTitle');
					const ldiv = $('#fnanenList .lyricsPage .lyrics');
					const lddiv = $('#fnanenList .lyricsPage .lyrics .lrxData');
					const title = titleEl.first().text() || songName;
					let lyrics = '';
					let author;
					let composer;
					let date;
					ldiv.children('p, div, h3, table').each((nidx, node) => {
						node.children?.forEach((n, cidx) => {
							if (n.type === 'text' && n.data !== '\n') {
								lyrics += n.data + '\n';
							} else if (!node.attribs?.class?.includes('lrxData') && node.name !== 'h3' && (n?.name === 'strong' || n?.name === 'span')) {
								n?.children?.forEach(c => {
									if (c?.type === 'text' && c.data !== '\n') {
										lyrics += c.data + '\n';
									} else if (c?.name === 'strong' || c?.name === 'span') {
										c?.children?.forEach(s => {
											if (s?.type === 'text' && s.data !== '\n') {
												lyrics += s.data + '\n';
											}
										})
									}
								})
							} else if (n?.name === 'div' && cidx === 0) {
								n?.children?.forEach(d => {
									if (d?.name === 'strong') {
										d?.children?.forEach(c => {
											if (c?.type === 'text' && c.data !== '\n') {
												lyrics += c.data + '\n';
											}
										})
									}
								})
							} else if (node.name === 'h3' && nidx === 0) {
								n?.children?.forEach(p => {
									if (p?.type === 'text' && p.data !== '\n') {
										lyrics += p.data + '\n';
									}
								})
							} else if (n?.name === 'tbody' && nidx === 0) {
								n?.children?.forEach(tr => {
									if (tr?.name === 'tr') {
										tr?.children?.forEach(td => {
											if (td?.name === 'td') {
												td?.children?.forEach(txt => {
													if (txt?.type === 'text' && txt.data !== '\n') {
														lyrics += txt.data + '\n';
													} else if (txt?.name === 'strong' || txt.name === 'span') {
														txt?.children?.forEach(t => {
															if (t?.type === 'text' && t.data !== '\n') {
																lyrics += t.data + '\n';
															}
														})
													}
												})
											}
										})
									}
								})
							}
						})
					})
					lyrics = he.decode(lyrics).trim();
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
						// FIXME titles with duplicate names
						// if (artistSongs[artist]?.map(s => s.title === title)?.length > 1) {
						// 	file += '_';
						// }
						file += '.json';
						return fsp.writeFile(file, JSON.stringify(data))
					} else {
						return Promise.resolve();
					}
				}).then(() => {
					if (debug) {
						console.log(`Scraped ${songUrl}`)
					}
				})
		}))
	}
	/*
return await fetch(artistUrl).then(res => res.text()).then(async html => {
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
	return await Promise.all([...Array(maxPage).keys()].map(async (i) => {
		async function getSongs() {
			if (i === 0) {
				return Promise.resolve(parseSongs(html))
			} else {
				const pageUrl = artistUrl + '?page=' + (i + 1);
				return fetch(pageUrl).then(res => res.text()).then(html => parseSongs(html)).catch(console.error);
			}
		}
		return await getSongs().then(async songs => {
			return await Promise.all((songs || []).map(async song => {
				const songUrl = url + song.url;
				if (debug) {
					console.log(`Scraping ${songUrl}...`)
				}
				return await fetch(songUrl).then(res => res.text()).then(async html => {
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

*/
	if (dump) {
		fs.writeFileSync(dump, JSON.stringify(artistSongs));
	}
})();