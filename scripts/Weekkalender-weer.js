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
const BEGINDAG = settings.begindag ?? "today"   // "today" of "monday"
const REGEN_ALPHA = (settings.regenAlpha ?? 40) / 100
const ZON_ALPHA = (settings.zonAlpha ?? 40) / 100
const RAIN_API = settings.rainApi ?? "openmeteo"
const REGEN_DREMPEL_MM = settings.regenDrempelMm ?? 0.1

// ===============================
// WIDGET AFMETINGEN (large)
// ===============================
const W = 369
const H = 369
const PAD = 8
const HEADER_H = 20     // tijdas bovenaan
const DAG_LABEL_W = 28  // breedte dagnaam links
const WEER_H = 28       // hoogte weerbalk onderaan
const GRAFIEK_H = WEER_H / 2  // hoogte per grafiek (regen + zon)

// ===============================
// DATUMBEREIK BEPALEN
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

// Haal events op voor MAX_DAGEN dagen vooruit
const eindDatumMax = new Date(beginDatum)
eindDatumMax.setDate(eindDatumMax.getDate() + MAX_DAGEN)

let alleEvents = []
if (allCalendars.length) {
  alleEvents = (await CalendarEvent.between(beginDatum, eindDatumMax, allCalendars))
    .filter(e => {
      // Filter events die buiten de tijdas vallen
      if (e.isAllDay) return true
      const startUur = e.startDate.getHours() + e.startDate.getMinutes() / 60
      const eindUur = e.endDate.getHours() + e.endDate.getMinutes() / 60
      return startUur < EIND_UUR && eindUur > START_UUR
    })
}

// ===============================
// BEPAAL OPTIMAAL AANTAL DAGEN
// op basis van max gelijktijdige events per dag
// ===============================
function getEventsVoorDag(datum) {
  const dagStart = new Date(datum.getFullYear(), datum.getMonth(), datum.getDate())
  const dagEind = new Date(dagStart)
  dagEind.setDate(dagEind.getDate() + 1)
  return alleEvents.filter(e => e.startDate < dagEind && e.endDate > dagStart)
}

function maxGelijktijdig(events) {
  if (events.length === 0) return 0
  // Bereken maximale overlap
  let maxOverlap = 1
  for (let i = 0; i < events.length; i++) {
    let overlap = 1
    for (let j = 0; j < events.length; j++) {
      if (i === j) continue
      if (events[i].startDate < events[j].endDate && events[i].endDate > events[j].startDate) {
        overlap++
      }
    }
    maxOverlap = Math.max(maxOverlap, overlap)
  }
  return maxOverlap
}

// Bepaal aantal dagen
let aantalDagen = MAX_DAGEN
for (let d = MIN_DAGEN; d <= MAX_DAGEN; d++) {
  let maxStapel = 1
  for (let i = 0; i < d; i++) {
    const datum = new Date(beginDatum)
    datum.setDate(datum.getDate() + i)
    const evs = getEventsVoorDag(datum)
    maxStapel = Math.max(maxStapel, maxGelijktijdig(evs))
  }
  // Bereken beschikbare hoogte per dag
  const beschikbaarH = H - PAD * 2 - HEADER_H - WEER_H - PAD
  const dagH = beschikbaarH / d
  const eventH = dagH / maxStapel
  // Events moeten minimaal 12px hoog zijn voor leesbaarheid
  if (eventH >= 12) {
    aantalDagen = d
    break
  }
}

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
    const dagen = aantalDagen + 1

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=precipitation,sunshine_duration,precipitation_probability&forecast_days=${dagen}&timezone=auto`
    const req = new Request(url)
    const json = await req.loadJSON()

    weerCache = {
      timestamp: now.getTime(),
      uren: json.hourly.time,
      neerslag: json.hourly.precipitation,
      zon: json.hourly.sunshine_duration,  // seconden zon per uur (max 3600)
      kansen: json.hourly.precipitation_probability
    }
    saveCache(weerCache)
  } catch (e) {
    if (!weerCache) weerCache = { uren: [], neerslag: [], zon: [], kansen: [] }
  }
}

// ===============================
// LAYOUT BEREKENINGEN
// ===============================
const beschikbaarH = H - PAD * 2 - HEADER_H - WEER_H - PAD * 2
const dagH = beschikbaarH / aantalDagen
const tijdW = W - PAD * 2 - DAG_LABEL_W
const uurBreedte = tijdW / (EIND_UUR - START_UUR)

function tijdNaarX(uur) {
  return PAD + DAG_LABEL_W + (uur - START_UUR) * uurBreedte
}

function dagNaarY(dagIndex) {
  return PAD + HEADER_H + dagIndex * dagH
}

// ===============================
// TEKEN WIDGET
// ===============================
const ctx = new DrawContext()
ctx.size = new Size(W, H)
ctx.opaque = false
ctx.respectScreenScale = true

// Achtergrond
ctx.setFillColor(new Color("#1a1a2e", 0.95))
ctx.fillRect(new Rect(0, 0, W, H))

// ===============================
// TIJDAS BOVENAAN
// ===============================
ctx.setFont(Font.systemFont(9))
ctx.setTextColor(new Color("#ffffff", 0.5))

for (let uur = START_UUR; uur <= EIND_UUR; uur += 2) {
  const x = tijdNaarX(uur)
  const label = uur === 24 ? "0" : `${uur}`
  ctx.drawText(label, new Point(x - 4, PAD + 2))

  // Verticale grid lijn
  ctx.setStrokeColor(new Color("#ffffff", 0.08))
  ctx.setLineWidth(0.5)
  const path = new Path()
  path.move(new Point(x, PAD + HEADER_H))
  path.addLine(new Point(x, H - PAD - WEER_H - PAD))
  ctx.addPath(path)
  ctx.strokePath()
}

// ===============================
// DAGEN MET EVENTS
// ===============================
for (let dagIdx = 0; dagIdx < aantalDagen; dagIdx++) {
  const datum = new Date(beginDatum)
  datum.setDate(datum.getDate() + dagIdx)

  const dagY = dagNaarY(dagIdx)
  const isVandaag = isSameDay(datum, startOfToday)

  // Dag achtergrond
  if (isVandaag) {
    ctx.setFillColor(new Color("#ffffff", 0.05))
    ctx.fillRect(new Rect(PAD, dagY, W - PAD * 2, dagH))
  }

  // Dag scheidingslijn
  ctx.setStrokeColor(new Color("#ffffff", 0.1))
  ctx.setLineWidth(0.5)
  const dagLijn = new Path()
  dagLijn.move(new Point(PAD, dagY))
  dagLijn.addLine(new Point(W - PAD, dagY))
  ctx.addPath(dagLijn)
  ctx.strokePath()

  // Dagnaam label
  const dagNamen = lang.daysShort ?? ["Zo","Ma","Di","Wo","Do","Vr","Za"]
  const dagNaam = isVandaag ? "▶" : dagNamen[datum.getDay()]
  ctx.setFont(isVandaag ? Font.boldSystemFont(9) : Font.systemFont(9))
  ctx.setTextColor(isVandaag ? new Color("#ffffff", 1.0) : new Color("#ffffff", 0.5))
  ctx.drawText(dagNaam, new Point(PAD + 2, dagY + dagH / 2 - 5))

  // ===============================
  // WEER OVERLAY PER DAG
  // ===============================
  if (weerCache.uren.length > 0) {
    const dagStart = new Date(datum.getFullYear(), datum.getMonth(), datum.getDate(), START_UUR)
    const dagEind = new Date(datum.getFullYear(), datum.getMonth(), datum.getDate(), EIND_UUR === 24 ? 23 : EIND_UUR)

    // Verzamel uurdata voor deze dag
    const dagUren = []
    for (let i = 0; i < weerCache.uren.length; i++) {
      const t = new Date(weerCache.uren[i])
      const tUur = t.getHours()
      if (isSameDay(t, datum) && tUur >= START_UUR && tUur < (EIND_UUR === 24 ? 24 : EIND_UUR)) {
        dagUren.push({
          uur: tUur,
          mm: weerCache.neerslag[i] ?? 0,
          zon: (weerCache.zon[i] ?? 0) / 3600,  // 0-1
          kans: (weerCache.kansen[i] ?? 0) / 100
        })
      }
    }

    if (dagUren.length > 1) {
      // Teken vloeiende regenoverlay (blauw)
      const regenPad = new Path()
      const regenBodem = dagY + dagH
      let regenGestart = false

      for (let i = 0; i < dagUren.length; i++) {
        const x = tijdNaarX(dagUren[i].uur)
        const maxMm = 5  // alles boven 5mm = volledig gevuld
        const intensiteit = Math.min(dagUren[i].mm / maxMm, 1)
        const y = regenBodem - intensiteit * dagH

        if (!regenGestart) {
          regenPad.move(new Point(x, regenBodem))
          regenPad.addLine(new Point(x, y))
          regenGestart = true
        } else {
          // Bezier curve voor vloeiend effect
          const prevX = tijdNaarX(dagUren[i-1].uur)
          const prevMm = dagUren[i-1].mm
          const prevIntensiteit = Math.min(prevMm / maxMm, 1)
          const prevY = regenBodem - prevIntensiteit * dagH
          const cpX = (prevX + x) / 2
          regenPad.addCurve(new Point(x, y), new Point(cpX, prevY), new Point(cpX, y))
        }
      }
      // Sluit het pad
      const regenLaatsteX = tijdNaarX(dagUren[dagUren.length - 1].uur + 1)
      regenPad.addLine(new Point(Math.min(regenLaatsteX, W - PAD), regenBodem))
      regenPad.closeSubpath()

      ctx.setFillColor(new Color("#4da6ff", REGEN_ALPHA))
      ctx.addPath(regenPad)
      ctx.fillPath()

      // Teken vloeiende zonoverlay (geel)
      const zonPad = new Path()
      const zonBodem = dagY + dagH
      let zonGestart = false

      for (let i = 0; i < dagUren.length; i++) {
        const x = tijdNaarX(dagUren[i].uur)
        const intensiteit = dagUren[i].zon
        const y = zonBodem - intensiteit * dagH

        if (!zonGestart) {
          zonPad.move(new Point(x, zonBodem))
          zonPad.addLine(new Point(x, y))
          zonGestart = true
        } else {
          const prevX = tijdNaarX(dagUren[i-1].uur)
          const prevIntensiteit = dagUren[i-1].zon
          const prevY = zonBodem - prevIntensiteit * dagH
          const cpX = (prevX + x) / 2
          zonPad.addCurve(new Point(x, y), new Point(cpX, prevY), new Point(cpX, y))
        }
      }
      const zonLaatsteX = tijdNaarX(dagUren[dagUren.length - 1].uur + 1)
      zonPad.addLine(new Point(Math.min(zonLaatsteX, W - PAD), zonBodem))
      zonPad.closeSubpath()

      ctx.setFillColor(new Color("#ffd700", ZON_ALPHA))
      ctx.addPath(zonPad)
      ctx.fillPath()
    }
  }

  // ===============================
  // EVENTS TEKENEN
  // ===============================
  const dagEvents = getEventsVoorDag(datum)

  // Bereken stapelposities
  const rijen = []
  for (const event of dagEvents) {
    let rij = 0
    while (rijen[rij] && rijen[rij].endDate > event.startDate) rij++
    rijen[rij] = event
    event._rij = rij
  }
  const maxRijen = Math.max(1, ...dagEvents.map(e => (e._rij ?? 0) + 1))
  const eventH = Math.max(10, (dagH - 2) / maxRijen)

  for (const event of dagEvents) {
    let startUur, eindUur

    if (event.isAllDay) {
      startUur = START_UUR
      eindUur = EIND_UUR
    } else {
      startUur = event.startDate.getHours() + event.startDate.getMinutes() / 60
      eindUur = event.endDate.getHours() + event.endDate.getMinutes() / 60
      startUur = Math.max(startUur, START_UUR)
      eindUur = Math.min(eindUur, EIND_UUR)
    }

    const x = tijdNaarX(startUur)
    const breedte = Math.max(2, (eindUur - startUur) * uurBreedte)
    const rij = event._rij ?? 0
    const y = dagY + 1 + rij * eventH

    // Agendakleur ophalen
    const calColor = event.calendar.color ?? new Color("#4da6ff")

    // Event blok
    ctx.setFillColor(new Color(calColor.hex, 0.85))
    const rect = new Rect(x, y, breedte - 1, eventH - 1)
    ctx.fillRect(rect)

    // Event tekst
    if (breedte > 20 && eventH > 9) {
      ctx.setFont(Font.systemFont(Math.min(9, eventH - 2)))
      ctx.setTextColor(new Color("#ffffff", 1.0))
      const tekstRect = new Rect(x + 2, y + 1, breedte - 4, eventH - 2)
      ctx.drawTextInRect(event.title, tekstRect)
    }
  }
}

// ===============================
// LEGENDA ONDERAAN
// ===============================
const legendaY = H - PAD - 12
ctx.setFont(Font.systemFont(8))

// Regen legenda
ctx.setFillColor(new Color("#4da6ff", 0.7))
ctx.fillRect(new Rect(PAD + DAG_LABEL_W, legendaY, 20, 6))
ctx.setTextColor(new Color("#ffffff", 0.5))
ctx.drawText("regen", new Point(PAD + DAG_LABEL_W + 24, legendaY - 1))

// Zon legenda
ctx.setFillColor(new Color("#ffd700", 0.7))
ctx.fillRect(new Rect(PAD + DAG_LABEL_W + 70, legendaY, 20, 6))
ctx.drawText("zon", new Point(PAD + DAG_LABEL_W + 94, legendaY - 1))

// ===============================
// WIDGET SAMENSTELLEN
// ===============================
let widget = new ListWidget()
widget.setPadding(0, 0, 0, 0)
widget.backgroundColor = new Color("#000000", 0)

const img = ctx.getImage()
const imgView = widget.addImage(img)
imgView.resizable = false

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
    regenAlpha: 40, zonAlpha: 40,
    rainApi: "openmeteo", regenDrempelMm: 0.1
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

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}