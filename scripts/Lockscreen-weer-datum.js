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

function formatUur(d) {
  const h = d.getHours()
  const m = d.getMinutes()
  return m === 0 ? `${h}u` : `${h}:${m.toString().padStart(2, "0")}`
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
// OPEN-METEO DATA OPHALEN
// Temperatuur + weathercode + uur-voor-uur regen
// ===============================
async function haalOpenMeteoOp(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,weathercode&hourly=temperature_2m,precipitation_probability,precipitation&forecast_days=2&timezone=auto`
  const req = new Request(url)
  return await req.loadJSON()
}

// ===============================
// BUIENRADAR DATA OPHALEN
// Geeft array van { tijd, mmPerUur } voor komende ~2 uur
// per 5 minuten
// ===============================
async function haalBuienradarOp(lat, lon) {
  const url = `https://gpsgadget.buienradar.nl/data/raintext?lat=${lat}&lon=${lon}`
  const req = new Request(url)
  const tekst = await req.loadString()

  const regels = tekst.trim().split("\n")
  const resultaat = []
  const basisTijd = new Date()
  basisTijd.setSeconds(0, 0)
  // Rond af naar dichtstbijzijnde 5 minuten
  basisTijd.setMinutes(Math.floor(basisTijd.getMinutes() / 5) * 5)

  for (let i = 0; i < regels.length; i++) {
    const delen = regels[i].split("|")
    if (delen.length < 2) continue
    const waarde = parseInt(delen[0])
    // Buienradar formule: mm/uur = 10^((waarde-109)/32)
    const mmPerUur = waarde === 0 ? 0 : Math.pow(10, (waarde - 109) / 32)
    const tijdstip = new Date(basisTijd.getTime() + i * 5 * 60 * 1000)
    resultaat.push({ tijdstip, mmPerUur, mmPer5min: mmPerUur / 12 })
  }
  return resultaat
}

// ===============================
// REGEN ANALYSE: OPEN-METEO
// ===============================
function analyseOpenMeteo(json, now) {
  const eindVandaag = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  const uren = json.hourly.time
  const neerslag = json.hourly.precipitation
  const kansen = json.hourly.precipitation_probability
  const regenNu = json.current.precipitation >= REGEN_DREMPEL_MM

  const huidigUur = lokaalUurPrefix(now)
  let startIndex = uren.findIndex(t => t.startsWith(huidigUur))
  if (startIndex < 0) startIndex = 0

  return berekenRegenBericht(regenNu, uren, neerslag, kansen, startIndex, eindVandaag, now)
}

// ===============================
// REGEN ANALYSE: BUIENRADAR
// Alleen komende ~2 uur, per 5 minuten
// ===============================
function analyseBuienradar(buienData, now) {
  const regenNu = buienData.length > 0 && buienData[0].mmPerUur >= REGEN_DREMPEL_MM

  if (regenNu) {
    // Zoek wanneer het droog wordt
    let droogTijdstip = null
    let mmTotDroog = 0
    for (const punt of buienData) {
      if (punt.tijdstip < now) continue
      if (punt.mmPerUur < REGEN_DREMPEL_MM) { droogTijdstip = punt.tijdstip; break }
      mmTotDroog += punt.mmPer5min
    }
    mmTotDroog = Math.round(mmTotDroog * 10) / 10

    if (!droogTijdstip) {
      return `${lang.rainAllDay} ${mmTotDroog}mm`
    }
    return `${mmTotDroog}mm ${lang.until} ${formatUur(droogTijdstip)}`

  } else {
    // Zoek wanneer regen begint
    let regenStart = null
    let regenEind = null
    let mmBui = 0

    for (const punt of buienData) {
      if (punt.tijdstip < now) continue
      if (!regenStart && punt.mmPerUur >= REGEN_DREMPEL_MM) {
        regenStart = punt.tijdstip
      } else if (regenStart && !regenEind && punt.mmPerUur < REGEN_DREMPEL_MM) {
        regenEind = punt.tijdstip
        break
      }
      if (regenStart) mmBui += punt.mmPer5min
    }
    mmBui = Math.round(mmBui * 10) / 10

    if (!regenStart) return lang.noRainExpected
    if (mmBui < REGEN_MINIMUM_MM) return lang.noRainExpected

    const urenTotRegen = (regenStart - now) / 1000 / 3600
    const startTijd = formatUur(regenStart)

    if (urenTotRegen <= DICHTBIJ_UREN) {
      if (!regenEind) return `${lang.rainFrom}${startTijd}+ ${mmBui}mm`
      return `${lang.rainFrom}${startTijd}-${formatUur(regenEind)} ${mmBui}mm`
    }
    return `${lang.rainFrom}${startTijd}`
  }
}

// ===============================
// REGEN ANALYSE: COMBINATIE
// Buienradar voor komende 2 uur, daarna Open-Meteo
// ===============================
function analyseCombinatie(buienData, json, now) {
  const buienHorizon = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  const regenNuBuien = buienData.length > 0 && buienData[0].mmPerUur >= REGEN_DREMPEL_MM

  // Check eerst buienradar voor kortetermijn
  const buienBericht = analyseBuienradar(buienData, now)

  // Als buienradar iets interessants zegt (niet gewoon "droog"), gebruik dat
  if (buienBericht !== lang.noRainExpected) return buienBericht

  // Anders val terug op Open-Meteo voor de rest van de dag
  const eindVandaag = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  const uren = json.hourly.time
  const neerslag = json.hourly.precipitation
  const kansen = json.hourly.precipitation_probability

  const huidigUur = lokaalUurPrefix(now)
  let startIndex = uren.findIndex(t => t.startsWith(huidigUur))
  if (startIndex < 0) startIndex = 0

  // Zoek regen na de buienradar horizon
  let regenStartIndex = -1
  for (let i = startIndex; i < uren.length; i++) {
    const t = new Date(uren[i])
    if (t > eindVandaag) break
    if (t < buienHorizon) continue // Skip wat buienradar al dekt
    if (kansen[i] >= REGEN_DREMPEL_KANS) { regenStartIndex = i; break }
  }

  if (regenStartIndex < 0) return lang.noRainExpected

  let regenEindIndex = -1
  for (let i = regenStartIndex + 1; i < uren.length; i++) {
    const t = new Date(uren[i])
    if (t > eindVandaag) break
    if (kansen[i] < REGEN_DREMPEL_KANS && neerslag[i] < REGEN_DREMPEL_MM) { regenEindIndex = i; break }
  }

  const mmBui = berekenSom(neerslag, uren, regenStartIndex,
    regenEindIndex >= 0 ? new Date(uren[regenEindIndex]) : eindVandaag)
  if (mmBui < REGEN_MINIMUM_MM) return lang.noRainExpected

  const urenTotRegen = (new Date(uren[regenStartIndex]) - now) / 1000 / 3600
  const startTijd = formatUur(new Date(uren[regenStartIndex]))

  if (urenTotRegen <= DICHTBIJ_UREN) {
    if (regenEindIndex < 0) return `${lang.rainFrom}${startTijd}+ ${mmBui}mm`
    return `${lang.rainFrom}${startTijd}-${formatUur(new Date(uren[regenEindIndex]))} ${mmBui}mm`
  }
  return `${lang.rainFrom}${startTijd}`
}

// ===============================
// GEDEELDE REGEN BERICHTFUNCTIE VOOR OPEN-METEO
// ===============================
function berekenRegenBericht(regenNu, uren, neerslag, kansen, startIndex, eindVandaag, now) {
  if (regenNu) {
    let droogIndex = -1
    for (let i = startIndex + 1; i < uren.length; i++) {
      const t = new Date(uren[i])
      if (t > eindVandaag) break
      if (neerslag[i] < REGEN_DREMPEL_MM && kansen[i] < REGEN_DREMPEL_KANS) { droogIndex = i; break }
    }
    if (droogIndex < 0) {
      const dagsom = berekenSom(neerslag, uren, startIndex, eindVandaag)
      return `${lang.rainAllDay} ${dagsom}mm`
    }
    const droogTijd = formatUur(new Date(uren[droogIndex]))
    const mmTotDroog = berekenSom(neerslag, uren, startIndex, new Date(uren[droogIndex]))
    return `${mmTotDroog}mm ${lang.until} ${droogTijd}`
  } else {
    let regenStartIndex = -1
    for (let i = startIndex; i < uren.length; i++) {
      const t = new Date(uren[i])
      if (t > eindVandaag) break
      if (kansen[i] >= REGEN_DREMPEL_KANS) { regenStartIndex = i; break }
    }
    if (regenStartIndex < 0) return lang.noRainExpected

    let regenEindIndex = -1
    for (let i = regenStartIndex + 1; i < uren.length; i++) {
      const t = new Date(uren[i])
      if (t > eindVandaag) break
      if (kansen[i] < REGEN_DREMPEL_KANS && neerslag[i] < REGEN_DREMPEL_MM) { regenEindIndex = i; break }
    }

    const mmBui = berekenSom(neerslag, uren, regenStartIndex,
      regenEindIndex >= 0 ? new Date(uren[regenEindIndex]) : eindVandaag)
    if (mmBui < REGEN_MINIMUM_MM) return lang.noRainExpected

    const urenTotRegen = (new Date(uren[regenStartIndex]) - now) / 1000 / 3600
    const startTijd = formatUur(new Date(uren[regenStartIndex]))

    if (urenTotRegen <= DICHTBIJ_UREN) {
      if (regenEindIndex < 0) return `${lang.rainFrom}${startTijd}+ ${mmBui}mm`
      return `${lang.rainFrom}${startTijd}-${formatUur(new Date(uren[regenEindIndex]))} ${mmBui}mm`
    }
    return `${lang.rainFrom}${startTijd}`
  }
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

    // Open-Meteo altijd ophalen voor temperatuur en emoji
    const omJson = await haalOpenMeteoOp(lat, lon)

    const tempNu = Math.round(omJson.current.temperature_2m)
    const regenNuOM = omJson.current.precipitation >= REGEN_DREMPEL_MM
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

    // Regen bericht op basis van gekozen API
    let regenBericht = ""

    if (RAIN_API === "buienradar") {
      const buienData = await haalBuienradarOp(lat, lon)
      regenBericht = analyseBuienradar(buienData, now)
    } else if (RAIN_API === "combined") {
      const buienData = await haalBuienradarOp(lat, lon)
      regenBericht = analyseCombinatie(buienData, omJson, now)
    } else {
      // Open-Meteo (default)
      regenBericht = analyseOpenMeteo(omJson, now)
    }

    weerData = {
      timestamp: now.getTime(),
      tempNu, maxTemp, minTemp, maxAlBereikt,
      regenNu: regenNuOM, emoji, regenBericht
    }

    saveCache(weerData)

    // Debug
    const debugInfo = {
      tijdstip: now.toISOString(),
      lokaalUur: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
      rainApi: RAIN_API, huidigUur, startIndex, tempNu, maxTemp, minTemp,
      maxAlBereikt, weatherCode, regenNuOM,
      precipitationHuidig: omJson.current.precipitation, regenBericht,
      eersteUren: uren.slice(startIndex, startIndex + 6).map((u, i) => ({
        uur: u, kans: omJson.hourly.precipitation_probability[startIndex + i],
        mm: omJson.hourly.precipitation[startIndex + i]
      }))
    }
    fm.writeString(fm.joinPath(fm.documentsDirectory(), "weerDebug.txt"), JSON.stringify(debugInfo, null, 2))

  } catch (e) {
    if (!weerData) {
      weerData = { tempNu: "--", maxTemp: "--", minTemp: "--", maxAlBereikt: false, regenNu: false, emoji: "🌥️", regenBericht: "geen data" }
    }
    fm.writeString(fm.joinPath(fm.documentsDirectory(), "weerDebug.txt"), JSON.stringify({ fout: e.message, tijdstip: now.toISOString() }, null, 2))
  }
}

// ===============================
// TEKSTREGEL OPBOUWEN
// ===============================
let tempString
const regenDichtbij = weerData.regenBericht.startsWith(lang.rainFrom) && !weerData.regenBericht.includes("+")

if (weerData.regenNu || regenDichtbij) {
  tempString = `${weerData.tempNu}°`
} else if (weerData.maxAlBereikt) {
  tempString = `${weerData.tempNu}°↘${weerData.minTemp}°`
} else {
  tempString = `${weerData.tempNu}°↗${weerData.maxTemp}°`
}

const regel = `${maandNaam} ${tempString} ${weerData.emoji} ${weerData.regenBericht}`

// ===============================
// BUILD WIDGET
// ===============================
let widget = new ListWidget()
widget.setPadding(2, 4, 2, 4)
let t = widget.addText(regel)
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
    noRainExpected: "droog", rainAllDay: "🌧️🌧️", rainFrom: "☔️", dryFrom: "🌂", until: "tot"
  }
  if (!fm.fileExists(langPath)) return fallback
  try { return Object.assign(fallback, JSON.parse(fm.readString(langPath))) } catch { return fallback }
}

function loadSettings() {
  const defaults = {
    fontSize: 10, regenDrempelKans: 70, regenDrempelMm: 0.2,
    regenMinimumMm: 0.5, dichtbijUren: 3, openApp: "weeronline", rainApi: "openmeteo"
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