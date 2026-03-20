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
  'chutiya',
  'chutia',
  'chutiye',
  'madarchod',
  'behenchod',
  'bhenchod',
  'gaand',
  'gandu',
  'gaandu',
  'bhosdi',
  'bhosdike',
  'lavda',
  'lavde',
  'randi',
  'bhadwa',
  'bhadwe',
  'bakchod'
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
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/!/g, 'i')
    .replace(/[^a-z\u0900-\u097f0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildLoosePattern(word) {
  const escaped = escapeRegex(word)
  return new RegExp(escaped.split('').join('[^a-z0-9\\u0900-\\u097f]*'), 'i')
}

const PATTERNS = BAD_WORDS.map(buildLoosePattern)

export function censorMessage(input) {
  const original = String(input || '')
  const normalized = normalizeText(original)

  let masked = original

  for (const pattern of PATTERNS) {
    if (pattern.test(normalized)) {
      masked = masked.replace(/./g, '*')
      return {
        text: masked,
        blocked: true
      }
    }
  }

  return {
    text: original,
    blocked: false
  }
}
