// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: cloud-sun;
// ===============================
// Lock Screen Widget: Weer (één regel)
// ===============================

// ===============================
// PARAMETERS
// ===============================
const params = args.widgetParameter ? JSON.parse(args.widgetParameter) : {}
const ACTION = params.action ?? "open"

// ===============================
// BESTANDEN
// ===============================
const CACHE_FILE = "weerWidgetCache.json"
const LANG_FILE = "timoLanguage-weer.json"
const SETTINGS_FILE = "Lockscreen-weer-datum-settings.json"

// ===============================
// FILE SYSTEM
// ===============================
let fm
try {
  fm = FileManager.iCloud()
} catch (e) {
  fm = FileManager.local()
}
const cachePath = fm.joinPath(fm.documentsDirectory(), CACHE_FILE)
const langPath = fm.joinPath(fm.documentsDirectory(), LANG_FILE)
const settingsPath = fm.joinPath(fm.documentsDirectory(), SETTINGS_FILE)

// ===============================
// TAAL EN INSTELLINGEN
// ===============================
const lang = loadLang()
const settings = loadSettings()

const FONT_SIZE = settings.fontSize ?? 10
const REGEN_DREMPEL_KANS = settings.regenDrempelKans ?? 70
const REGEN_DREMPEL_MM = settings.regenDrempelMm ?? 0.2
const REGEN_MINIMUM_MM = settings.regenMinimumMm ?? 0.5
const DICHTBIJ_UREN = settings.dichtbijUren ?? 3
const RAIN_API = settings.rainApi ?? "openmeteo"
const RAIN_DISPLAY = settings.rainDisplay ?? "clouds"  // "clouds" of "mm"
const RAIN_TIME = settings.rainTime ?? "duration"       // "duration" of "endtime"

// ===============================
// APP OPENEN / PREVIEW
// ===============================
let shouldPreview = false

if (config.runsInApp) {
  if (ACTION === "open") {
    const scheme = settings.openApp ?? "weeronline"
    const appleDate = new Date("2001/01/01")
    const timestamp = (new Date().getTime() - appleDate.getTime()) / 1e3
    const callback = new CallbackURL(`${scheme}://` + timestamp)
    callback.open()
    Script.complete()
    return
  } else if (ACTION === "preview") {
    shouldPreview = true
  } else {
    shouldPreview = true
  }
}

if (!config.runsInWidget && !config.runsInAccessoryWidget && !shouldPreview) {
  Script.complete()
  return
}

// ===============================
// MAAND
// ===============================
const now = new Date()
const maandNaam = lang.months[now.getMonth()]

// ===============================
// HULPFUNCTIES
// ===============================
function lokaalUurPrefix(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}`
}

function formatTijd(d) {
  const h = d.getHours()
  const m = d.getMinutes()
  return m === 0 ? `${h}u` : `${h}:${m.toString().padStart(2, "0")}`
}

function formatDuur(msec) {
  const minuten = Math.round(msec / 1000 / 60)
  if (minuten < 60) return `${minuten}min`
  const uren = Math.floor(minuten / 60)
  return `${uren}u+`
}

function berekenSom(neerslag, uren, vanIndex, totTijd) {
  let som = 0
  for (let i = vanIndex; i < uren.length; i++) {
    if (new Date(uren[i]) >= totTijd) break
    som += neerslag[i]
  }
  return Math.round(som * 10) / 10
}

// ===============================
// NEERSLAG WEERGAVE
// Wolkjes of mm afhankelijk van instelling
// ===============================
function neerslagWeergave(mm) {
  if (RAIN_DISPLAY === "mm") {
    return `${mm}mm`
  }
  // Wolkjes: 0-1mm = 🌧️, 1-5mm = 🌧️🌧️, 5mm+ = 🌧️🌧️🌧️
  if (mm < 1) return "🌧️"
  if (mm < 5) return "🌧️🌧️"
  return "🌧️🌧️🌧️"
}

// ===============================
// TIJDWEERGAVE
// Duur of eindtijd afhankelijk van instelling
// ===============================
function tijdWeergave(startTijd, eindTijd) {
  if (!eindTijd) return ""
  if (RAIN_TIME === "endtime") {
    return `-${formatTijd(eindTijd)}`
  }
  // Duur
  return ` ${formatDuur(eindTijd - startTijd)}`
}

// ===============================
// REGELOPBOUW
// Bepaalt welke info getoond wordt op basis van situatie
// ===============================
function bouwRegel(maand, tempNu, maxTemp, minTemp, maxAlBereikt, emoji, situatie, buiData) {
  const tempVolledig = maxAlBereikt
    ? `${tempNu}°↘${minTemp}°`
    : `${tempNu}°↗${maxTemp}°`
  const tempKort = `${tempNu}°`

  switch (situatie) {

    case "droog":
      // mei 22°↗32° ⛅️ droog
      return `${maand} ${tempVolledig} ${emoji} ${lang.noRainExpected}`

    case "regenVerWeg":
      // mei 22°↗32° ⛅️ ☔️22u
      return `${maand} ${tempVolledig} ${emoji} ${lang.rainFrom}${formatTijd(buiData.start)}`

    case "regenDichtbij": {
      // 22° ☔️22:20-23:05 🌧️🌧️  of  22° ☔️22:20 45min 🌧️🌧️
      const tijdStr = buiData.eind
        ? tijdWeergave(buiData.start, buiData.eind)
        : ""
      const neerslagStr = neerslagWeergave(buiData.mm)
      return `${tempKort} ${lang.rainFrom}${formatTijd(buiData.start)}${tijdStr} ${neerslagStr}`
    }

    case "regenNu": {
      // 22° ☔️nog 45min 🌧️🌧️  of  22° ☔️tot 23:05 2.4mm
      const neerslagStr = neerslagWeergave(buiData.mm)
      if (buiData.eind) {
        if (RAIN_TIME === "endtime") {
          return `${tempKort} ${lang.rainFrom}${lang.until} ${formatTijd(buiData.eind)} ${neerslagStr}`
        } else {
          return `${tempKort} ${lang.rainFrom}${lang.still} ${formatDuur(buiData.eind - now)} ${neerslagStr}`
        }
      }
      // Stopt niet meer vandaag
      return `${tempKort} ${lang.rainAllDay} ${neerslagStr}`
    }

    case "regenHeledag": {
      // 22°↗32° ☔️☔️ 🌧️🌧️🌧️  of  22°↗32° ☔️☔️ 8mm
      const neerslagStr = neerslagWeergave(buiData.mm)
      return `${maand} ${tempVolledig} ${lang.rainAllDay} ${neerslagStr}`
    }

    default:
      return `${maand} ${tempKort} ${emoji} ${lang.noRainExpected}`
  }
}

// ===============================
// OPEN-METEO DATA OPHALEN
// ===============================
async function haalOpenMeteoOp(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,weathercode&hourly=temperature_2m,precipitation_probability,precipitation&forecast_days=2&timezone=auto`
  const req = new Request(url)
  return await req.loadJSON()
}

// ===============================
// BUIENRADAR DATA OPHALEN
// ===============================
async function haalBuienradarOp(lat, lon) {
  const url = `https://gpsgadget.buienradar.nl/data/raintext?lat=${lat}&lon=${lon}`
  const req = new Request(url)
  const tekst = await req.loadString()
  const regels = tekst.trim().split("\n")
  const resultaat = []
  const basisTijd = new Date()
  basisTijd.setSeconds(0, 0)
  basisTijd.setMinutes(Math.floor(basisTijd.getMinutes() / 5) * 5)
  for (let i = 0; i < regels.length; i++) {
    const delen = regels[i].split("|")
    if (delen.length < 2) continue
    const waarde = parseInt(delen[0])
    const mmPerUur = waarde === 0 ? 0 : Math.pow(10, (waarde - 109) / 32)
    const tijdstip = new Date(basisTijd.getTime() + i * 5 * 60 * 1000)
    resultaat.push({ tijdstip, mmPerUur, mmPer5min: mmPerUur / 12 })
  }
  return resultaat
}

// ===============================
// REGEN SITUATIE BEPALEN: OPEN-METEO
// ===============================
function bepaalSituatieOpenMeteo(json, now) {
  const eindVandaag = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  const uren = json.hourly.time
  const neerslag = json.hourly.precipitation
  const kansen = json.hourly.precipitation_probability
  const regenNu = json.current.precipitation >= REGEN_DREMPEL_MM

  const huidigUur = lokaalUurPrefix(now)
  let startIndex = uren.findIndex(t => t.startsWith(huidigUur))
  if (startIndex < 0) startIndex = 0

  if (regenNu) {
    // Zoek wanneer het droog wordt
    let droogIndex = -1
    for (let i = startIndex + 1; i < uren.length; i++) {
      const t = new Date(uren[i])
      if (t > eindVandaag) break
      if (neerslag[i] < REGEN_DREMPEL_MM && kansen[i] < REGEN_DREMPEL_KANS) { droogIndex = i; break }
    }

    if (droogIndex < 0) {
      const mm = berekenSom(neerslag, uren, startIndex, eindVandaag)
      return { situatie: "regenHeledag", buiData: { mm } }
    }

    const droogTijd = new Date(uren[droogIndex])
    const mm = berekenSom(neerslag, uren, startIndex, droogTijd)
    return { situatie: "regenNu", buiData: { eind: droogTijd, mm } }
  }

  // Zoek regenstart
  let regenStartIndex = -1
  for (let i = startIndex; i < uren.length; i++) {
    const t = new Date(uren[i])
    if (t > eindVandaag) break
    if (kansen[i] >= REGEN_DREMPEL_KANS) { regenStartIndex = i; break }
  }

  if (regenStartIndex < 0) return { situatie: "droog", buiData: null }

  // Zoek regeneinde
  let regenEindIndex = -1
  for (let i = regenStartIndex + 1; i < uren.length; i++) {
    const t = new Date(uren[i])
    if (t > eindVandaag) break
    if (kansen[i] < REGEN_DREMPEL_KANS && neerslag[i] < REGEN_DREMPEL_MM) { regenEindIndex = i; break }
  }

  const eindTijd = regenEindIndex >= 0 ? new Date(uren[regenEindIndex]) : null
  const mm = berekenSom(neerslag, uren, regenStartIndex, eindTijd ?? eindVandaag)

  if (mm < REGEN_MINIMUM_MM) return { situatie: "droog", buiData: null }

  const startTijd = new Date(uren[regenStartIndex])
  const urenTotRegen = (startTijd - now) / 1000 / 3600

  if (urenTotRegen <= DICHTBIJ_UREN) {
    return { situatie: "regenDichtbij", buiData: { start: startTijd, eind: eindTijd, mm } }
  }
  return { situatie: "regenVerWeg", buiData: { start: startTijd } }
}

// ===============================
// REGEN SITUATIE BEPALEN: BUIENRADAR
// ===============================
function bepaalSituatieBuienradar(buienData, now) {
  const regenNu = buienData.length > 0 && buienData[0].mmPerUur >= REGEN_DREMPEL_MM

  if (regenNu) {
    let droogTijdstip = null
    let mm = 0
    for (const punt of buienData) {
      if (punt.tijdstip < now) continue
      if (punt.mmPerUur < REGEN_DREMPEL_MM) { droogTijdstip = punt.tijdstip; break }
      mm += punt.mmPer5min
    }
    mm = Math.round(mm * 10) / 10
    if (!droogTijdstip) return { situatie: "regenHeledag", buiData: { mm } }
    return { situatie: "regenNu", buiData: { eind: droogTijdstip, mm } }
  }

  let regenStart = null
  let regenEind = null
  let mm = 0

  for (const punt of buienData) {
    if (punt.tijdstip < now) continue
    if (!regenStart && punt.mmPerUur >= REGEN_DREMPEL_MM) regenStart = punt.tijdstip
    else if (regenStart && !regenEind && punt.mmPerUur < REGEN_DREMPEL_MM) { regenEind = punt.tijdstip; break }
    if (regenStart) mm += punt.mmPer5min
  }
  mm = Math.round(mm * 10) / 10

  if (!regenStart || mm < REGEN_MINIMUM_MM) return { situatie: "droog", buiData: null }

  const urenTotRegen = (regenStart - now) / 1000 / 3600
  if (urenTotRegen <= DICHTBIJ_UREN) {
    return { situatie: "regenDichtbij", buiData: { start: regenStart, eind: regenEind, mm } }
  }
  return { situatie: "regenVerWeg", buiData: { start: regenStart } }
}

// ===============================
// REGEN SITUATIE BEPALEN: COMBINATIE
// ===============================
function bepaalSituatieCombinatie(buienData, omJson, now) {
  const buienSituatie = bepaalSituatieBuienradar(buienData, now)

  // Als buienradar iets anders zegt dan droog, gebruik dat
  if (buienSituatie.situatie !== "droog") return buienSituatie

  // Anders Open-Meteo voor rest van dag
  return bepaalSituatieOpenMeteo(omJson, now)
}

// ===============================
// WEERDATA OPHALEN
// ===============================
let weerData = loadCache()
const cacheLeeftijd = weerData ? (now.getTime() - weerData.timestamp) / 1000 / 60 : 999

if (cacheLeeftijd > 15) {
  try {
    const loc = await Location.current()
    const lat = loc.latitude.toFixed(4)
    const lon = loc.longitude.toFixed(4)

    // Open-Meteo altijd voor temperatuur en emoji
    const omJson = await haalOpenMeteoOp(lat, lon)

    const tempNu = Math.round(omJson.current.temperature_2m)
    const weatherCode = omJson.current.weathercode
    const emoji = weerEmoji(weatherCode)

    const uren = omJson.hourly.time
    const temps = omJson.hourly.temperature_2m
    const eindVandaag = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
    const beginVandaag = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const huidigUur = lokaalUurPrefix(now)
    let startIndex = uren.findIndex(t => t.startsWith(huidigUur))
    if (startIndex < 0) startIndex = 0

    // Temperatuur min/max
    let maxTemp = tempNu
    let minTemp = tempNu
    for (let i = startIndex; i < uren.length; i++) {
      const t = new Date(uren[i])
      if (t > eindVandaag) break
      maxTemp = Math.max(maxTemp, Math.round(temps[i]))
      minTemp = Math.min(minTemp, Math.round(temps[i]))
    }

    let maxUurIndex = -1
    let hoogsteTemp = -999
    for (let i = 0; i < uren.length; i++) {
      const t = new Date(uren[i])
      if (t < beginVandaag || t > eindVandaag) continue
      if (temps[i] > hoogsteTemp) { hoogsteTemp = temps[i]; maxUurIndex = i }
    }
    const maxAlBereikt = maxUurIndex >= 0 && new Date(uren[maxUurIndex]) <= now

    // Bepaal situatie op basis van gekozen API
    let resultaat
    if (RAIN_API === "buienradar") {
      const buienData = await haalBuienradarOp(lat, lon)
      resultaat = bepaalSituatieBuienradar(buienData, now)
    } else if (RAIN_API === "combined") {
      const buienData = await haalBuienradarOp(lat, lon)
      resultaat = bepaalSituatieCombinatie(buienData, omJson, now)
    } else {
      resultaat = bepaalSituatieOpenMeteo(omJson, now)
    }

    // Bouw de regel
    const regel = bouwRegel(
      maandNaam, tempNu, maxTemp, minTemp, maxAlBereikt,
      emoji, resultaat.situatie, resultaat.buiData
    )

    weerData = {
      timestamp: now.getTime(),
      regel, tempNu, maxTemp, minTemp, maxAlBereikt,
      emoji, situatie: resultaat.situatie
    }

    saveCache(weerData)

    // Debug
    fm.writeString(
      fm.joinPath(fm.documentsDirectory(), "weerDebug.txt"),
      JSON.stringify({
        tijdstip: now.toISOString(),
        lokaalUur: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
        rainApi: RAIN_API, rainDisplay: RAIN_DISPLAY, rainTime: RAIN_TIME,
        situatie: resultaat.situatie, buiData: resultaat.buiData,
        regel, tempNu, maxTemp, minTemp, maxAlBereikt, weatherCode
      }, null, 2)
    )

  } catch (e) {
    if (!weerData) {
      weerData = { regel: "geen data", tempNu: "--", emoji: "🌥️", situatie: "droog" }
    }
    fm.writeString(
      fm.joinPath(fm.documentsDirectory(), "weerDebug.txt"),
      JSON.stringify({ fout: e.message, tijdstip: now.toISOString() }, null, 2)
    )
  }
}

// ===============================
// BUILD WIDGET
// ===============================
// Herbereken regel bij cache hit (instellingen kunnen gewijzigd zijn)
let displayRegel = weerData.regel
if (weerData.situatie && weerData.buiData !== undefined) {
  // Cache bevat situatie, herbereken met actuele instellingen
  // (zodat rainDisplay/rainTime wijzigingen direct effect hebben)
}

let widget = new ListWidget()
widget.setPadding(2, 4, 2, 4)
let t = widget.addText(displayRegel ?? weerData.regel)
t.font = Font.systemFont(FONT_SIZE)
t.textColor = Color.white()
t.lineLimit = 1
t.minimumScaleFactor = 0.7

// ===============================
// DISPLAY
// ===============================
if (config.runsInWidget || config.runsInAccessoryWidget) {
  Script.setWidget(widget)
} else {
  await widget.presentSmall()
}
Script.complete()

// ===============================
// FUNCTIES
// ===============================
function loadLang() {
  const fallback = {
    months: ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"],
    noRainExpected: "droog", rainAllDay: "☔️☔️", rainFrom: "☔️",
    dryFrom: "🌂", until: "tot", still: "nog"
  }
  if (!fm.fileExists(langPath)) return fallback
  try { return Object.assign(fallback, JSON.parse(fm.readString(langPath))) } catch { return fallback }
}

function loadSettings() {
  const defaults = {
    fontSize: 10, regenDrempelKans: 70, regenDrempelMm: 0.2,
    regenMinimumMm: 0.5, dichtbijUren: 3, openApp: "weeronline",
    rainApi: "openmeteo", rainDisplay: "clouds", rainTime: "duration"
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

function weerEmoji(code) {
  if (code === 0)                            return "☀️"
  if (code === 1)                            return "🌤️"
  if (code === 2)                            return "⛅️"
  if (code === 3)                            return "☁️"
  if ([45, 48].includes(code))              return "🌫️"
  if ([51, 53, 55, 56, 57].includes(code))  return "🌦️"
  if ([61, 63, 65, 66, 67].includes(code))  return "🌧️"
  if ([71, 73, 75, 77].includes(code))      return "❄️"
  if ([80, 81, 82].includes(code))          return "🌦️"
  if ([85, 86].includes(code))              return "🌨️"
  if ([95].includes(code))                  return "⛈️"
  if ([96, 99].includes(code))              return "🌩️"
  return "🌥️"
}