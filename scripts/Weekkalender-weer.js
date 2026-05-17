// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: calendar-alt;
// ===============================
// Week Kalender Widget met Weer Overlay
// ===============================

const SETTINGS_FILE = "weekCalWidget-settings.json"
const LANG_FILE = "timoLanguage-upcoming.json"
const CACHE_FILE = "weekCalWidgetCache.json"

let fm
try { fm = FileManager.iCloud() } catch (e) { fm = FileManager.local() }
const settingsPath = fm.joinPath(fm.documentsDirectory(), SETTINGS_FILE)
const langPath = fm.joinPath(fm.documentsDirectory(), LANG_FILE)
const cachePath = fm.joinPath(fm.documentsDirectory(), CACHE_FILE)

const lang = loadLang()
const settings = loadSettings()

// ===============================
// INSTELLINGEN
// ===============================
const START_UUR = settings.startUur ?? 6
const EIND_UUR = settings.eindUur ?? 24
const MIN_DAGEN = settings.minDagen ?? 3
const MAX_DAGEN = settings.maxDagen ?? 7
const BEGINDAG = settings.begindag ?? "today"
const REGEN_ALPHA = (settings.regenAlpha ?? 35) / 100
const ZON_ALPHA = (settings.zonAlpha ?? 30) / 100
const RAIN_API = settings.rainApi ?? "openmeteo"

// ===============================
// WIDGET AFMETINGEN
// Large widget op iPhone is ~338x354 punten
// ===============================
const W = 338
const H = 354
const PAD = 6
const HEADER_H = 18    // tijdas bovenaan
const DAG_LABEL_W = 26 // breedte dagnaam links
const LEGENDA_H = 14   // legenda onderaan

// ===============================
// DATUMBEREIK
// ===============================
const now = new Date()
const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

let beginDatum
if (BEGINDAG === "monday") {
  const dag = now.getDay()
  const maandag = new Date(startOfToday)
  maandag.setDate(maandag.getDate() - (dag === 0 ? 6 : dag - 1))
  beginDatum = maandag
} else {
  beginDatum = startOfToday
}

// ===============================
// KALENDERDATA OPHALEN
// ===============================
const kalenders = settings.calendars ?? []
let allCalendars = (await Calendar.forEvents()).filter(c => kalenders.includes(c.title))

const eindDatumMax = new Date(beginDatum)
eindDatumMax.setDate(eindDatumMax.getDate() + MAX_DAGEN)

let alleEvents = []
if (allCalendars.length) {
  alleEvents = (await CalendarEvent.between(beginDatum, eindDatumMax, allCalendars))
}

// ===============================
// HULPFUNCTIES
// ===============================
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function getEventsVoorDag(datum) {
  const dagStart = new Date(datum.getFullYear(), datum.getMonth(), datum.getDate())
  const dagEind = new Date(dagStart)
  dagEind.setDate(dagEind.getDate() + 1)
  return alleEvents.filter(e => {
    if (e.startDate >= dagEind || e.endDate <= dagStart) return false
    // Filter events die volledig buiten tijdas vallen (niet all-day)
    if (!e.isAllDay) {
      const startU = e.startDate.getHours() + e.startDate.getMinutes() / 60
      const eindU = e.endDate.getHours() + e.endDate.getMinutes() / 60
      if (startU >= EIND_UUR || eindU <= START_UUR) return false
    }
    return true
  })
}

// Bereken maximale gelijktijdige events per dag
function maxGelijktijdig(events) {
  if (events.length === 0) return 0
  if (events.length === 1) return 1
  let max = 1
  for (let i = 0; i < events.length; i++) {
    let count = 1
    for (let j = 0; j < events.length; j++) {
      if (i === j) continue
      const aStart = events[i].isAllDay ? 0 : events[i].startDate.getTime()
      const aEind = events[i].isAllDay ? Infinity : events[i].endDate.getTime()
      const bStart = events[j].isAllDay ? 0 : events[j].startDate.getTime()
      const bEind = events[j].isAllDay ? Infinity : events[j].endDate.getTime()
      if (aStart < bEind && aEind > bStart) count++
    }
    max = Math.max(max, count)
  }
  return max
}

// ===============================
// BEPAAL OPTIMAAL AANTAL DAGEN
// ===============================
const beschikbaarH = H - PAD * 2 - HEADER_H - LEGENDA_H - PAD
const MIN_EVENT_H = 11  // minimale eventhoogte voor leesbaarheid

let aantalDagen = MIN_DAGEN
for (let d = MIN_DAGEN; d <= MAX_DAGEN; d++) {
  const dagH = beschikbaarH / d
  let passenEr = true
  for (let i = 0; i < d; i++) {
    const datum = new Date(beginDatum)
    datum.setDate(datum.getDate() + i)
    const evs = getEventsVoorDag(datum)
    const stapel = maxGelijktijdig(evs)
    const eventH = dagH / Math.max(1, stapel)
    if (eventH < MIN_EVENT_H && stapel > 1) {
      passenEr = false
      break
    }
  }
  if (passenEr) {
    aantalDagen = d
  } else {
    break
  }
}

const dagH = beschikbaarH / aantalDagen
const tijdW = W - PAD * 2 - DAG_LABEL_W

// ===============================
// WEERDATA OPHALEN
// ===============================
let weerCache = loadCache()
const cacheLeeftijd = weerCache ? (now.getTime() - weerCache.timestamp) / 1000 / 60 : 999

if (cacheLeeftijd > 30) {
  try {
    const loc = await Location.current()
    const lat = loc.latitude.toFixed(4)
    const lon = loc.longitude.toFixed(4)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=precipitation,sunshine_duration,precipitation_probability&forecast_days=${aantalDagen + 1}&timezone=auto`
    const req = new Request(url)
    const json = await req.loadJSON()
    weerCache = {
      timestamp: now.getTime(),
      uren: json.hourly.time,
      neerslag: json.hourly.precipitation,
      zon: json.hourly.sunshine_duration,
      kansen: json.hourly.precipitation_probability
    }
    saveCache(weerCache)
  } catch (e) {
    if (!weerCache) weerCache = { uren: [], neerslag: [], zon: [], kansen: [] }
  }
}

// ===============================
// COÖRDINAAT HELPERS
// ===============================
function tijdNaarX(uur) {
  const fraction = (Math.min(Math.max(uur, START_UUR), EIND_UUR) - START_UUR) / (EIND_UUR - START_UUR)
  return PAD + DAG_LABEL_W + fraction * tijdW
}

function dagNaarY(dagIndex) {
  return PAD + HEADER_H + dagIndex * dagH
}

function urenNaarX(startU, eindU) {
  const x1 = tijdNaarX(Math.max(startU, START_UUR))
  const x2 = tijdNaarX(Math.min(eindU, EIND_UUR))
  return { x: x1, breedte: Math.max(2, x2 - x1) }
}

// ===============================
// WEER OVERLAY DATA VOOR DAG
// ===============================
function getWeerUren(datum) {
  if (!weerCache || !weerCache.uren.length) return []
  const result = []
  for (let i = 0; i < weerCache.uren.length; i++) {
    const t = new Date(weerCache.uren[i])
    if (!isSameDay(t, datum)) continue
    const uur = t.getHours()
    if (uur < START_UUR || uur >= (EIND_UUR === 24 ? 24 : EIND_UUR)) continue
    result.push({
      uur,
      mm: weerCache.neerslag[i] ?? 0,
      zon: Math.min(1, (weerCache.zon[i] ?? 0) / 3600)
    })
  }
  return result
}

// ===============================
// EVENT STAPELPOSITIES BEREKENEN
// ===============================
function berekenStapels(events) {
  const gesorteerd = [...events].sort((a, b) => {
    const aT = a.isAllDay ? 0 : a.startDate.getTime()
    const bT = b.isAllDay ? 0 : b.startDate.getTime()
    return aT - bT
  })

  const rijEinden = []
  for (const event of gesorteerd) {
    const startT = event.isAllDay ? 0 : event.startDate.getTime()
    const eindT = event.isAllDay ? Infinity : event.endDate.getTime()
    let rij = 0
    while (rijEinden[rij] !== undefined && rijEinden[rij] > startT) rij++
    rijEinden[rij] = eindT
    event._rij = rij
    event._totaalRijen = 0  // wordt later ingevuld
  }

  const maxRij = Math.max(0, ...gesorteerd.map(e => e._rij)) + 1
  for (const event of gesorteerd) {
    event._totaalRijen = maxRij
  }

  return gesorteerd
}

// ===============================
// TEKEN CONTEXT OPBOUWEN
// ===============================
const ctx = new DrawContext()
ctx.size = new Size(W, H)
ctx.opaque = true
ctx.respectScreenScale = true

// ===============================
// LAAG 0: ACHTERGROND
// ===============================
ctx.setFillColor(new Color("#16213e"))
ctx.fillRect(new Rect(0, 0, W, H))

// ===============================
// TIJDAS
// ===============================
ctx.setFont(Font.systemFont(8))
ctx.setTextColor(new Color("#ffffff", 0.4))

for (let uur = START_UUR; uur <= EIND_UUR; uur += 2) {
  const x = tijdNaarX(uur)
  const label = uur >= 24 ? "0" : `${uur}`
  ctx.drawText(label, new Point(x - 4, PAD + 1))

  // Verticale gridlijn
  ctx.setStrokeColor(new Color("#ffffff", 0.07))
  ctx.setLineWidth(0.5)
  const path = new Path()
  path.move(new Point(x, PAD + HEADER_H))
  path.addLine(new Point(x, H - PAD - LEGENDA_H))
  ctx.addPath(path)
  ctx.strokePath()
}

// ===============================
// LAAG 1: EVENT BLOKKEN (kleur, geen tekst)
// ===============================
const eventDataPerDag = []

for (let dagIdx = 0; dagIdx < aantalDagen; dagIdx++) {
  const datum = new Date(beginDatum)
  datum.setDate(datum.getDate() + dagIdx)
  const dagY = dagNaarY(dagIdx)
  const isVandaag = isSameDay(datum, startOfToday)

  // Dag achtergrond
  if (isVandaag) {
    ctx.setFillColor(new Color("#ffffff", 0.04))
    ctx.fillRect(new Rect(PAD + DAG_LABEL_W, dagY, tijdW, dagH))
  }

  // Horizontale scheidingslijn
  ctx.setStrokeColor(new Color("#ffffff", 0.1))
  ctx.setLineWidth(0.5)
  const dagLijn = new Path()
  dagLijn.move(new Point(PAD, dagY))
  dagLijn.addLine(new Point(W - PAD, dagY))
  ctx.addPath(dagLijn)
  ctx.strokePath()

  // Events berekenen
  const dagEvents = berekenStapels(getEventsVoorDag(datum))
  eventDataPerDag.push({ datum, dagY, dagEvents, isVandaag })

  for (const event of dagEvents) {
    const totaalRijen = event._totaalRijen
    const rij = event._rij
    const eventH = dagH / totaalRijen
    const eventY = dagY + rij * eventH

    let startU, eindU
    if (event.isAllDay) {
      startU = START_UUR
      eindU = EIND_UUR
    } else {
      startU = event.startDate.getHours() + event.startDate.getMinutes() / 60
      eindU = event.endDate.getHours() + event.endDate.getMinutes() / 60
    }

    const { x, breedte } = urenNaarX(startU, eindU)
    const calColor = event.calendar.color

    // Event blok
    ctx.setFillColor(new Color(calColor.hex, 0.9))
    ctx.fillRect(new Rect(x, eventY + 0.5, breedte - 0.5, eventH - 1))
  }
}

// ===============================
// LAAG 2: REGEN OVERLAY
// ===============================
for (let dagIdx = 0; dagIdx < aantalDagen; dagIdx++) {
  const { datum, dagY } = eventDataPerDag[dagIdx]
  const dagUren = getWeerUren(datum)
  if (dagUren.length < 2) continue

  const regenPad = new Path()
  const bodem = dagY + dagH

  regenPad.move(new Point(tijdNaarX(dagUren[0].uur), bodem))

  for (let i = 0; i < dagUren.length; i++) {
    const x = tijdNaarX(dagUren[i].uur)
    const intensiteit = Math.min(dagUren[i].mm / 4, 1)
    const y = bodem - intensiteit * dagH

    if (i === 0) {
      regenPad.addLine(new Point(x, y))
    } else {
      const prevX = tijdNaarX(dagUren[i-1].uur)
      const prevIntensiteit = Math.min(dagUren[i-1].mm / 4, 1)
      const prevY = bodem - prevIntensiteit * dagH
      const cpX = (prevX + x) / 2
      regenPad.addCurve(new Point(x, y), new Point(cpX, prevY), new Point(cpX, y))
    }
  }

  const eindX = Math.min(tijdNaarX(dagUren[dagUren.length - 1].uur + 1), W - PAD)
  regenPad.addLine(new Point(eindX, bodem))
  regenPad.closeSubpath()

  ctx.setFillColor(new Color("#4da6ff", REGEN_ALPHA))
  ctx.addPath(regenPad)
  ctx.fillPath()
}

// ===============================
// LAAG 3: ZON OVERLAY
// ===============================
for (let dagIdx = 0; dagIdx < aantalDagen; dagIdx++) {
  const { datum, dagY } = eventDataPerDag[dagIdx]
  const dagUren = getWeerUren(datum)
  if (dagUren.length < 2) continue

  const zonPad = new Path()
  const bodem = dagY + dagH

  zonPad.move(new Point(tijdNaarX(dagUren[0].uur), bodem))

  for (let i = 0; i < dagUren.length; i++) {
    const x = tijdNaarX(dagUren[i].uur)
    const intensiteit = dagUren[i].zon
    const y = bodem - intensiteit * dagH

    if (i === 0) {
      zonPad.addLine(new Point(x, y))
    } else {
      const prevX = tijdNaarX(dagUren[i-1].uur)
      const prevIntensiteit = dagUren[i-1].zon
      const prevY = bodem - prevIntensiteit * dagH
      const cpX = (prevX + x) / 2
      zonPad.addCurve(new Point(x, y), new Point(cpX, prevY), new Point(cpX, y))
    }
  }

  const eindX = Math.min(tijdNaarX(dagUren[dagUren.length - 1].uur + 1), W - PAD)
  zonPad.addLine(new Point(eindX, bodem))
  zonPad.closeSubpath()

  ctx.setFillColor(new Color("#ffd700", ZON_ALPHA))
  ctx.addPath(zonPad)
  ctx.fillPath()
}

// ===============================
// LAAG 4: DAGNAMEN + EVENT TEKST
// ===============================
for (const { datum, dagY, dagEvents, isVandaag } of eventDataPerDag) {
  // Dagnaam
  const dagNamen = lang.daysShort ?? ["Zo","Ma","Di","Wo","Do","Vr","Za"]
  const dagNaam = dagNamen[datum.getDay()]
  const dagLabel = isVandaag ? `▶${dagNaam}` : dagNaam

  ctx.setFont(isVandaag ? Font.boldSystemFont(8) : Font.systemFont(8))
  ctx.setTextColor(isVandaag ? Color.white() : new Color("#ffffff", 0.5))
  ctx.drawText(dagLabel, new Point(PAD, dagY + dagH / 2 - 4))

  // Event teksten
  for (const event of dagEvents) {
    const totaalRijen = event._totaalRijen
    const rij = event._rij
    const eventH = dagH / totaalRijen
    const eventY = dagY + rij * eventH

    let startU, eindU
    if (event.isAllDay) {
      startU = START_UUR
      eindU = EIND_UUR
    } else {
      startU = event.startDate.getHours() + event.startDate.getMinutes() / 60
      eindU = event.endDate.getHours() + event.endDate.getMinutes() / 60
    }

    const { x, breedte } = urenNaarX(startU, eindU)

    if (breedte > 14 && eventH > 9) {
      const fontSize = Math.min(9, Math.max(7, eventH - 3))
      ctx.setFont(Font.boldSystemFont(fontSize))
      ctx.setTextColor(Color.white())
      ctx.drawTextInRect(event.title, new Rect(x + 2, eventY + 1.5, breedte - 4, eventH - 3))
    }
  }
}

// ===============================
// LEGENDA ONDERAAN
// ===============================
const legendaY = H - PAD - LEGENDA_H + 2
ctx.setFont(Font.systemFont(8))
ctx.setTextColor(new Color("#ffffff", 0.45))

ctx.setFillColor(new Color("#4da6ff", 0.7))
ctx.fillRect(new Rect(PAD + DAG_LABEL_W, legendaY + 2, 16, 6))
ctx.drawText("regen", new Point(PAD + DAG_LABEL_W + 20, legendaY))

ctx.setFillColor(new Color("#ffd700", 0.7))
ctx.fillRect(new Rect(PAD + DAG_LABEL_W + 65, legendaY + 2, 16, 6))
ctx.drawText("zon", new Point(PAD + DAG_LABEL_W + 85, legendaY))

// ===============================
// WIDGET SAMENSTELLEN
// ===============================
let widget = new ListWidget()
widget.setPadding(0, 0, 0, 0)
widget.backgroundColor = new Color("#16213e")

const img = ctx.getImage()
const imgView = widget.addImage(img)
imgView.resizable = false
imgView.centerAlignImage()

if (config.runsInWidget) {
  Script.setWidget(widget)
} else {
  await widget.presentLarge()
}
Script.complete()

// ===============================
// FUNCTIES
// ===============================
function loadLang() {
  const fallback = {
    daysShort: ["Zo","Ma","Di","Wo","Do","Vr","Za"],
    daysFull: ["Zondag","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag"]
  }
  if (!fm.fileExists(langPath)) return fallback
  try { return Object.assign(fallback, JSON.parse(fm.readString(langPath))) } catch { return fallback }
}

function loadSettings() {
  const defaults = {
    calendars: [], startUur: 6, eindUur: 24,
    minDagen: 3, maxDagen: 7, begindag: "today",
    regenAlpha: 35, zonAlpha: 30, rainApi: "openmeteo"
  }
  if (!fm.fileExists(settingsPath)) return defaults
  try { return Object.assign(defaults, JSON.parse(fm.readString(settingsPath))) } catch { return defaults }
}

function loadCache() {
  if (!fm.fileExists(cachePath)) return null
  try { return JSON.parse(fm.readString(cachePath)) } catch { return null }
}

function saveCache(data) {
  fm.writeString(cachePath, JSON.stringify(data))
}