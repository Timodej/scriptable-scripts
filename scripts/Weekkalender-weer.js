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
// PARAMETERS
// ===============================
const params = args.widgetParameter ? JSON.parse(args.widgetParameter) : {}
const ACTION = params.action ?? "open"

// ===============================
// APP OPENEN
// ===============================
if (config.runsInApp) {
  if (ACTION === "open") {
    const scheme = settings.openApp ?? "weekcal"
    const appleDate = new Date("2001/01/01")
    const timestamp = (new Date().getTime() - appleDate.getTime()) / 1e3
    const callback = new CallbackURL(`${scheme}://` + timestamp)
    callback.open()
    Script.complete()
    return
  }
}

// ===============================
// INSTELLINGEN
// ===============================
const START_UUR = settings.startUur ?? 6
const EIND_UUR = settings.eindUur ?? 24
const MIN_DAGEN = settings.minDagen ?? 3
const MAX_DAGEN = settings.maxDagen ?? 7
const BEGINDAG = settings.begindag ?? "today"
const VOOR_ALPHA = (settings.voorAlpha ?? 60) / 100   // voorste (kleinste) laag
const ACHTER_ALPHA = (settings.achterAlpha ?? 35) / 100 // achterste (grootste) laag
const BG_KLEUR = settings.bgKleur ?? "#16213e"
const BG_ALPHA = (settings.bgAlpha ?? 95) / 100

// ===============================
// WIDGET AFMETINGEN
// ===============================
const W = 338
const H = 354
const PAD = 3
const HEADER_H = 16
const DAG_LABEL_W = 24
const DAG_GAP = 2

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
    if (!e.isAllDay) {
      const startU = e.startDate.getHours() + e.startDate.getMinutes() / 60
      const eindU = e.endDate.getHours() + e.endDate.getMinutes() / 60
      if (startU >= EIND_UUR || eindU <= START_UUR) return false
    }
    return true
  })
}

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
const beschikbaarH = H - PAD * 2 - HEADER_H - (MAX_DAGEN * DAG_GAP)
const MIN_EVENT_H = 11

let aantalDagen = MIN_DAGEN
for (let d = MIN_DAGEN; d <= MAX_DAGEN; d++) {
  const dagH = (beschikbaarH - d * DAG_GAP) / d
  let passenEr = true
  for (let i = 0; i < d; i++) {
    const datum = new Date(beginDatum)
    datum.setDate(datum.getDate() + i)
    const evs = getEventsVoorDag(datum)
    const stapel = maxGelijktijdig(evs)
    if (dagH / Math.max(1, stapel) < MIN_EVENT_H && stapel > 1) {
      passenEr = false
      break
    }
  }
  if (passenEr) { aantalDagen = d } else { break }
}

const dagH = (beschikbaarH - aantalDagen * DAG_GAP) / aantalDagen
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
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=precipitation,sunshine_duration,precipitation_probability&forecast_days=${MAX_DAGEN + 1}&timezone=auto`
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
  return PAD + HEADER_H + dagIndex * (dagH + DAG_GAP)
}

function urenNaarX(startU, eindU) {
  const x1 = tijdNaarX(Math.max(startU, START_UUR))
  const x2 = tijdNaarX(Math.min(eindU, EIND_UUR))
  return { x: x1, breedte: Math.max(2, x2 - x1) }
}

// ===============================
// WEER UURDATA VOOR DAG
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
// BEREKEN TOTAAL PER DAG
// Voor bepalen volgorde regen/zon
// ===============================
function totaalWaarde(dagUren, waardeFunc) {
  return dagUren.reduce((som, u) => som + waardeFunc(u), 0)
}

// ===============================
// TEKEN CURVE MET LIJN
// ===============================
function tekenCurve(ctx, dagUren, dagY, dagH, waardeFunc, drempel, vulKleur, lijnKleur) {
  if (dagUren.length < 2) return

  const bodem = dagY + dagH
  const punten = dagUren.map(u => ({
    x: tijdNaarX(u.uur),
    y: bodem - Math.min(waardeFunc(u), 1) * dagH,
    waarde: Math.min(waardeFunc(u), 1)
  }))

  // Gevuld vlak
  const vlakPad = new Path()
  vlakPad.move(new Point(punten[0].x, bodem))
  vlakPad.addLine(new Point(punten[0].x, punten[0].y))
  for (let i = 1; i < punten.length; i++) {
    const cpX = (punten[i-1].x + punten[i].x) / 2
    vlakPad.addCurve(new Point(punten[i].x, punten[i].y), new Point(cpX, punten[i-1].y), new Point(cpX, punten[i].y))
  }
  const eindX = Math.min(punten[punten.length-1].x + tijdW / (EIND_UUR - START_UUR), W - PAD)
  vlakPad.addLine(new Point(eindX, bodem))
  vlakPad.closeSubpath()
  ctx.setFillColor(vulKleur)
  ctx.addPath(vlakPad)
  ctx.fillPath()

  // Lijn met vloeiende overgang bij drempel
  ctx.setStrokeColor(lijnKleur)
  ctx.setLineWidth(1.5)

  let segment = null
  for (let i = 0; i < punten.length; i++) {
    const bovenDrempel = punten[i].waarde > drempel
    if (bovenDrempel) {
      if (!segment) {
        segment = new Path()
        if (i > 0) {
          segment.move(new Point(punten[i-1].x, punten[i-1].y))
          const cpX = (punten[i-1].x + punten[i].x) / 2
          segment.addCurve(new Point(punten[i].x, punten[i].y), new Point(cpX, punten[i-1].y), new Point(cpX, punten[i].y))
        } else {
          segment.move(new Point(punten[i].x, punten[i].y))
        }
      } else {
        const cpX = (punten[i-1].x + punten[i].x) / 2
        segment.addCurve(new Point(punten[i].x, punten[i].y), new Point(cpX, punten[i-1].y), new Point(cpX, punten[i].y))
      }
    } else {
      if (segment) {
        if (i < punten.length) {
          const cpX = (punten[i-1].x + punten[i].x) / 2
          segment.addCurve(new Point(punten[i].x, punten[i].y), new Point(cpX, punten[i-1].y), new Point(cpX, punten[i].y))
        }
        ctx.addPath(segment)
        ctx.strokePath()
        segment = null
      }
    }
  }
  if (segment) { ctx.addPath(segment); ctx.strokePath() }
}

// ===============================
// EVENT STAPELPOSITIES
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
  }
  const maxRij = Math.max(0, ...gesorteerd.map(e => e._rij)) + 1
  for (const event of gesorteerd) event._totaalRijen = maxRij
  return gesorteerd
}

// ===============================
// TEKEN CONTEXT
// ===============================
const ctx = new DrawContext()
ctx.size = new Size(W, H)
ctx.opaque = BG_ALPHA >= 1.0
ctx.respectScreenScale = true

// ACHTERGROND
ctx.setFillColor(new Color(BG_KLEUR, BG_ALPHA))
ctx.fillRect(new Rect(0, 0, W, H))

// TIJDAS
ctx.setFont(Font.systemFont(8))
ctx.setTextColor(new Color("#ffffff", 0.4))
for (let uur = START_UUR; uur <= EIND_UUR; uur += 2) {
  const x = tijdNaarX(uur)
  ctx.drawText(uur >= 24 ? "0" : `${uur}`, new Point(x - 4, PAD + 1))
  ctx.setStrokeColor(new Color("#ffffff", 0.07))
  ctx.setLineWidth(0.5)
  const path = new Path()
  path.move(new Point(x, PAD + HEADER_H))
  path.addLine(new Point(x, H - PAD))
  ctx.addPath(path)
  ctx.strokePath()
}

// ===============================
// VERZAMEL DATA PER DAG
// ===============================
const dagData = []
for (let dagIdx = 0; dagIdx < aantalDagen; dagIdx++) {
  const datum = new Date(beginDatum)
  datum.setDate(datum.getDate() + dagIdx)
  const dagY = dagNaarY(dagIdx)
  const isVandaag = isSameDay(datum, startOfToday)
  const dagEvents = berekenStapels(getEventsVoorDag(datum))
  const dagUren = getWeerUren(datum)

  // Bepaal totaal regen vs zon voor volgorde
  const totaalRegen = totaalWaarde(dagUren, p => p.mm / 4)
  const totaalZon = totaalWaarde(dagUren, p => p.zon)
  // Kleinste waarde komt bovenop (voorste laag)
  const regenIsKleinste = totaalRegen <= totaalZon

  dagData.push({ datum, dagY, isVandaag, dagEvents, dagUren, regenIsKleinste })
}

// ===============================
// LAAG 1: EVENT BLOKKEN
// ===============================
for (const { dagY, dagEvents, isVandaag } of dagData) {
  if (isVandaag) {
    ctx.setFillColor(new Color("#ffffff", 0.04))
    ctx.fillRect(new Rect(PAD + DAG_LABEL_W, dagY, tijdW, dagH))
  }
  for (const event of dagEvents) {
    const eventH = dagH / event._totaalRijen
    const eventY = dagY + event._rij * eventH
    let startU = event.isAllDay ? START_UUR : event.startDate.getHours() + event.startDate.getMinutes() / 60
    let eindU = event.isAllDay ? EIND_UUR : event.endDate.getHours() + event.endDate.getMinutes() / 60
    const { x, breedte } = urenNaarX(startU, eindU)
    ctx.setFillColor(new Color(event.calendar.color.hex, 0.9))
    ctx.fillRect(new Rect(x, eventY + 0.5, breedte - 0.5, eventH - 1))
  }
}

// ===============================
// LAAG 2 & 3: REGEN + ZON OVERLAY
// Volgorde per dag bepaald door totaal:
// kleinste waarde = voorste laag (bovenop)
// grootste waarde = achterste laag (onderop)
// ===============================
for (const { dagY, dagUren, regenIsKleinste } of dagData) {
  if (dagUren.length < 2) continue

  if (regenIsKleinste) {
    // Zon is groter → zon achteraan, regen vooraan
    tekenCurve(ctx, dagUren, dagY, dagH, p => p.zon, 0.05,
      new Color("#ffd700", ACHTER_ALPHA), new Color("#ffe566", 0.95))
    tekenCurve(ctx, dagUren, dagY, dagH, p => p.mm / 4, 0.02,
      new Color("#4da6ff", VOOR_ALPHA), new Color("#7ec8ff", 0.95))
  } else {
    // Regen is groter → regen achteraan, zon vooraan
    tekenCurve(ctx, dagUren, dagY, dagH, p => p.mm / 4, 0.02,
      new Color("#4da6ff", ACHTER_ALPHA), new Color("#7ec8ff", 0.95))
    tekenCurve(ctx, dagUren, dagY, dagH, p => p.zon, 0.05,
      new Color("#ffd700", VOOR_ALPHA), new Color("#ffe566", 0.95))
  }
}

// ===============================
// LAAG 4: TEKST
// ===============================
for (const { datum, dagY, isVandaag, dagEvents } of dagData) {
  const dagNamen = lang.daysShort ?? ["Zo","Ma","Di","Wo","Do","Vr","Za"]
  const dagNaam = dagNamen[datum.getDay()]
  const dagLabel = isVandaag ? `▶${dagNaam}` : dagNaam
  ctx.setFont(isVandaag ? Font.boldSystemFont(8) : Font.systemFont(8))
  ctx.setTextColor(isVandaag ? Color.white() : new Color("#ffffff", 0.5))
  ctx.drawText(dagLabel, new Point(PAD, dagY + dagH / 2 - 4))

  for (const event of dagEvents) {
    const eventH = dagH / event._totaalRijen
    const eventY = dagY + event._rij * eventH
    let startU = event.isAllDay ? START_UUR : event.startDate.getHours() + event.startDate.getMinutes() / 60
    let eindU = event.isAllDay ? EIND_UUR : event.endDate.getHours() + event.endDate.getMinutes() / 60
    const { x, breedte } = urenNaarX(startU, eindU)
    if (breedte > 14 && eventH > 9) {
      ctx.setFont(Font.boldSystemFont(Math.min(9, Math.max(7, eventH - 3))))
      ctx.setTextColor(Color.white())
      ctx.drawTextInRect(event.title, new Rect(x + 2, eventY + 1.5, breedte - 4, eventH - 3))
    }
  }
}

// ===============================
// WIDGET
// ===============================
let widget = new ListWidget()
widget.setPadding(0, 0, 0, 0)
widget.backgroundColor = new Color(BG_KLEUR, BG_ALPHA)

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
    voorAlpha: 60, achterAlpha: 35,
    bgKleur: "#16213e", bgAlpha: 95,
    openApp: "weekcal", rainApi: "openmeteo"
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