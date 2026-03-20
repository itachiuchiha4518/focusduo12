const BAD_WORDS = [
  'fuck',
  'shit',
  'bitch',
  'bastard',
  'asshole',
  'dick',
  'pussy',
  'cunt',
  'slut',
  'whore',
  'prick',
  'motherfucker',
  'fucker',
  'chutiya',
  'chutia',
  'chutiye',
  'chutiyA',
  'madarchod',
  'maadarchod',
  'behenchod',
  'bhenchod',
  'behanchod',
  'gaand',
  'gand',
  'gandu',
  'gaandu',
  'bhosdi',
  'bhosdike',
  'lavda',
  'lauda',
  'lavde',
  'randi',
  'bhadwa',
  'bhadwe',
  'bakchod',
  'lund',
  'land',
  'harami',
  'haramkhor',
  'chupa',
  'kutta',
  'kutti',
  'saala',
  'saali',
  'futiyA',
  'idiot',
  'moron'
]

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeText(input) {
  return String(input || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/!/g, 'i')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .replace(/(.)\1+/gu, '$1')
    .trim()
}

function buildLoosePattern(word) {
  const escaped = escapeRegex(word)
  return new RegExp(escaped.split('').join('[^\\p{L}\\p{N}]*'), 'iu')
}

const PATTERNS = BAD_WORDS.map(buildLoosePattern)
const NORMALIZED_WORDS = BAD_WORDS.map(word => normalizeText(word))

export function censorMessage(input) {
  const original = String(input || '')
  const normalized = normalizeText(original)

  for (let i = 0; i < PATTERNS.length; i += 1) {
    if (PATTERNS[i].test(original) || normalized.includes(NORMALIZED_WORDS[i])) {
      return {
        text: '*'.repeat(Math.max(8, original.length)),
        blocked: true
      }
    }
  }

  return {
    text: original,
    blocked: false
  }
}
