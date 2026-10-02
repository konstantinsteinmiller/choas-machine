// The Chaos Machine lockup: the mech's visor head in a hex badge over the
// CHAOS / MACHINE wordmark, as ONE inline SVG of paths (no ids, no text, no
// external reference), pasted into the two places that draw it:
//
//   index.html                              the static splash, before any JS
//   src/components/atoms/FLogoProgress.vue  the Vue loader that takes over
//
// Both copies must be byte-identical (tests/ui/splashLogo.test.ts), so this
// script is the only way to change the logo:  node scripts/render-logo.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

const INK = '#1c1233'
const PINK = '#ff5fb7'
const CYAN = '#5fe3f5'
const LILAC = '#b9a6ff'
const PLUM = '#3a2a6e'

// 5 × 7 block letters.
const FONT = {
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111']
}

/** One path for a word: every lit run of a row is one rectangle. */
const word = (text, cell, top) => {
  const cols = text.length * 5 + (text.length - 1)
  const left = Math.round((300 - cols * cell) / 2)
  let d = ''
  ;[...text].forEach((ch, li) => {
    FONT[ch].forEach((row, r) => {
      let c = 0
      while (c < 5) {
        if (row[c] !== '1') { c++; continue }
        let e = c
        while (e < 5 && row[e] === '1') e++
        const x = left + (li * 6 + c) * cell
        d += `M${x} ${top + r * cell}h${(e - c) * cell}v${cell}h${-(e - c) * cell}z`
        c = e
      }
    })
  })
  return d
}

const hex = (cx, cy, r) => {
  const pts = []
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`)
  }
  return `M${pts.join('L')}z`
}

const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 256" aria-hidden="true" focusable="false">',
  `<g stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">`,
  // The badge.
  `<path d="${hex(150, 60, 54)}" fill="${PLUM}" stroke-width="7"/>`,
  `<path d="${hex(150, 60, 43)}" fill="none" stroke="${CYAN}" stroke-width="3"/>`,
  // The mech's head: antenna, ear pods, helmet, visor, two eyes.
  `<path d="M150 22v12" fill="none" stroke-width="5"/>`,
  `<circle cx="150" cy="20" r="5" fill="${PINK}" stroke-width="4"/>`,
  `<path d="M112 52h10v22h-10zM178 52h10v22h-10z" fill="${CYAN}" stroke-width="4"/>`,
  `<path d="M128 34h44l10 12v34l-10 10h-44l-10-10V46z" fill="${LILAC}" stroke-width="5"/>`,
  `<path d="M126 50h48v20h-48z" fill="${INK}" stroke-width="4"/>`,
  `<path d="M134 56h10v8h-10zM156 56h10v8h-10z" fill="${PINK}" stroke="none"/>`,
  // The wordmark.
  `<path d="${word('CHAOS', 8, 124)}" fill="${PINK}" stroke-width="5" paint-order="stroke"/>`,
  `<path d="${word('MACHINE', 6, 196)}" fill="${CYAN}" stroke-width="5" paint-order="stroke"/>`,
  '</g></svg>'
].join('')

const swap = (file, re) => {
  const path = root + file
  const src = readFileSync(path, 'utf8')
  if (!re.test(src)) throw new Error(`no lockup found in ${file}`)
  writeFileSync(path, src.replace(re, svg))
}

swap('index.html', /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 300 256"[\s\S]*?<\/svg>/)
swap('src/components/atoms/FLogoProgress.vue', /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 300 256"[\s\S]*?<\/svg>/)
console.log(`lockup written (${svg.length} bytes)`)
