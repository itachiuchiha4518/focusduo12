export const DEFAULT_LIVE_HOURS = {
  is247: false,
  slots: [
    { start: '07:00', end: '10:00' },
    { start: '18:00', end: '22:00' }
  ]
}

export function normalizeLiveHours(input = {}) {
  const rawSlots = Array.isArray(input.slots) ? input.slots : DEFAULT_LIVE_HOURS.slots
  const slots = rawSlots.slice(0, 2).map(slot => ({
    start: typeof slot?.start === 'string' ? slot.start : '07:00',
    end: typeof slot?.end === 'string' ? slot.end : '10:00'
  }))

  while (slots.length < 2) {
    slots.push({ start: '07:00', end: '10:00' })
  }

  return {
    is247: Boolean(input.is247),
    slots
  }
}

function toMinutes(value) {
  if (typeof value !== 'string') return 0
  const [h, m] = value.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return 0
  return h * 60 + m
}

function currentISTMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date)

  const hour = Number(parts.find(p => p.type === 'hour')?.value || '0')
  const minute = Number(parts.find(p => p.type === 'minute')?.value || '0')
  return hour * 60 + minute
}

function inSlot(now, slot) {
  const start = toMinutes(slot?.start)
  const end = toMinutes(slot?.end)

  if (start === end) return true
  if (start < end) return now >= start && now < end
  return now >= start || now < end
}

function minutesToLabel(mins) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function getLiveHoursStatus(config = {}, date = new Date()) {
  const liveHours = normalizeLiveHours(config)

  if (liveHours.is247) {
    return {
      open: true,
      label: 'Open 24/7',
      message: 'Live sessions are open 24/7.',
      nextSlot: null
    }
  }

  const now = currentISTMinutes(date)
  const openNow = liveHours.slots.some(slot => inSlot(now, slot))

  if (openNow) {
    return {
      open: true,
      label: 'Open now',
      message: 'Live sessions are open right now.',
      nextSlot: null
    }
  }

  const upcoming = liveHours.slots
    .map(slot => ({
      start: toMinutes(slot.start),
      end: toMinutes(slot.end),
      label: `${slot.start}–${slot.end} IST`
    }))
    .sort((a, b) => a.start - b.start)
    .find(slot => slot.start > now) || null

  const nextSlot = upcoming || liveHours.slots[0] || null

  return {
    open: false,
    label: 'Closed now',
    message: nextSlot
      ? `Closed now. Next slot: ${nextSlot.label}.`
      : 'Closed now. No live slots set.',
    nextSlot: nextSlot ? {
      start: minutesToLabel(nextSlot.start),
      end: minutesToLabel(nextSlot.end)
    } : null
  }
}
