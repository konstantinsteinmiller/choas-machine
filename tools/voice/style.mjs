// The delivery a line is spoken with, for engines that take a written
// direction (Gemini's turn style, VoxCPM's prefix): the catalogue's stage
// direction in the line's language, the tone word, what is happening, and
// the words the script shouts in capitals, and how long it may take (a
// game line is short: the bubble waits for it).

export const styleFor = (job) => {
  const de = job.lang === 'de'
  const parts = [job.direction.replace(/\s+$/, ''), `${de ? 'Ton' : 'Tone'}: ${job.tone}.`, `${de ? 'Situation' : 'Situation'}: ${job.situation}.`]
  if (job.emphasis?.length) parts.push(`${de ? 'Betont' : 'Stress'}: ${job.emphasis.join(', ')}.`)
  if (job.max) parts.push(de ? `Zügig, höchstens ${job.max} Sekunden.` : `Brisk, ${job.max} seconds at most.`)
  return parts.join(' ')
}
