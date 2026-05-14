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
const ACTION = params.action ?? "default"

// ===============================
// INSTELLINGEN
// ===============================
const FONT_SIZE = 10
const CACHE_FILE = "weerWidgetCache.json"
const LANG_FILE = "timoLanguage.json"
const REGEN_DREMPEL_KANS = 70
const REGEN_DREMPEL_MM = 0.2
const REGEN_MINIMUM_MM = 0.5
const DICHTBIJ_UREN = 3

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

// ===============================
// TAAL LADEN
// ===============================
const lang = loadLang()

// ===============================
// APP OPEN / PREVIEW
// ===============================
let shouldPreview = false

if (config.runsInApp) {
  if (ACTION === "open") {
    const appleDate = new Date("2001/01/01")
    const timestamp = (new Date().getTime() - appleDate.getTime()) / 1e3
    const callback = new CallbackURL("weeronline://" + timestamp)
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
// MAAND (uit taalbestand)
// ===============================
const now = new Date()
const maandNaam = lang.months[now.getMonth()]

// ===============================
// HULPFUNCTIE: lokaal uur-prefix
// ===============================
function lokaalUurPrefix(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}`
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

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,weathercode&hourly=temperature_2m,precipitation_probability,precipitation&forecast_days=2&timezone=auto`

    const req = new Request(url)
    const json = await req.loadJSON()

    const tempNu = Math.round(json.current.temperature_2m)
    const regenNu = json.current.precipitation >= REGEN_DREMPEL_MM
    const weatherCode = json.current.weathercode
    const emoji = weerEmoji(weatherCode)

    const uren = json.hourly.time
    const temps = json.hourly.temperature_2m
    const neerslag = json.hourly.precipitation
    const kansen = json.hourly.precipitation_probability

    const huidigUur = lokaalUurPrefix(now)
    let startIndex = uren.findIndex(t => t.startsWith(huidigUur))
    if (startIndex < 0) startIndex = 0

    const eindVandaag = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
    let maxTemp = tempNu
    let minTemp = tempNu
    for (let i = startIndex; i < uren.length; i++) {
      const t = new Date(uren[i])
      if (t > eindVandaag) break
      maxTemp = Math.max(maxTemp, Math.round(temps[i]))
      minTemp = Math.min(minTemp, Math.round(temps[i]))
    }

    const beginVandaag = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    let maxUurIndex = -1
    let hoogsteTemp = -999
    for (let i = 0; i < uren.length; i++) {
      const t = new Date(uren[i])
      if (t < beginVandaag || t > eindVandaag) continue
      if (temps[i] > hoogsteTemp) {
        hoogsteTemp = temps[i]
        maxUurIndex = i
      }
    }
    const maxAlBereikt = maxUurIndex >= 0 && new Date(uren[maxUurIndex]) <= now

    // ===============================
    // REGEN ANALYSE
    // ===============================
    let regenBericht = ""

    if (regenNu) {
      let droogIndex = -1
      for (let i = startIndex + 1; i < uren.length; i++) {
        const t = new Date(uren[i])
        if (t > eindVandaag) break
        if (neerslag[i] < REGEN_DREMPEL_MM && kansen[i] < REGEN_DREMPEL_KANS) {
          droogIndex = i
          break
        }
      }

      if (droogIndex < 0) {
        const dagsom = berekenSom(neerslag, uren, startIndex, eindVandaag)
        regenBericht = `${lang.rainAllDay} ${dagsom}mm`
      } else {
        const droogTijd = formatUur(new Date(uren[droogIndex]))
        const mmTotDroog = berekenSom(neerslag, uren, startIndex, new Date(uren[droogIndex]))
        regenBericht = `${mmTotDroog}mm ${lang.until} ${droogTijd}`
      }

    } else {
      let regenStartIndex = -1
      for (let i = startIndex; i < uren.length; i++) {
        const t = new Date(uren[i])
        if (t > eindVandaag) break
        if (kansen[i] >= REGEN_DREMPEL_KANS) {
          regenStartIndex = i
          break
        }
      }

      if (regenStartIndex < 0) {
        regenBericht = lang.noRainExpected
      } else {
        let regenEindIndex = -1
        for (let i = regenStartIndex + 1; i < uren.length; i++) {
          const t = new Date(uren[i])
          if (t > eindVandaag) break
          if (kansen[i] < REGEN_DREMPEL_KANS && neerslag[i] < REGEN_DREMPEL_MM) {
            regenEindIndex = i
            break
          }
        }

        const mmBui = berekenSom(neerslag, uren, regenStartIndex,
          regenEindIndex >= 0 ? new Date(uren[regenEindIndex]) : eindVandaag)

        if (mmBui < REGEN_MINIMUM_MM) {
          regenBericht = lang.noRainExpected
        } else {
          const urenTotRegen = (new Date(uren[regenStartIndex]) - now) / 1000 / 3600
          const startTijd = formatUur(new Date(uren[regenStartIndex]))

          if (urenTotRegen <= DICHTBIJ_UREN) {
            if (regenEindIndex < 0) {
              regenBericht = `${lang.rainFrom}${startTijd}+ ${mmBui}mm`
            } else {
              const eindTijd = formatUur(new Date(uren[regenEindIndex]))
              regenBericht = `${lang.rainFrom}${startTijd}-${eindTijd} ${mmBui}mm`
            }
          } else {
            regenBericht = `${lang.rainFrom}${startTijd}`
          }
        }
      }
    }

    weerData = {
      timestamp: now.getTime(),
      tempNu, maxTemp, minTemp, maxAlBereikt,
      regenNu, emoji, regenBericht
    }

    saveCache(weerData)

    // Debug
    const debugInfo = {
      tijdstip: now.toISOString(),
      lokaalUur: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
      huidigUur, startIndex, tempNu, maxTemp, minTemp, maxAlBereikt,
      weatherCode, regenNu,
      precipitationHuidig: json.current.precipitation,
      regenBericht,
      eersteUren: uren.slice(startIndex, startIndex + 6).map((u, i) => ({
        uur: u, kans: kansen[startIndex + i], mm: neerslag[startIndex + i]
      }))
    }
    const debugPath = fm.joinPath(fm.documentsDirectory(), "weerDebug.txt")
    fm.writeString(debugPath, JSON.stringify(debugInfo, null, 2))

  } catch (e) {
    if (!weerData) {
      weerData = {
        tempNu: "--", maxTemp: "--", minTemp: "--",
        maxAlBereikt: false, regenNu: false,
        emoji: "🌥️", regenBericht: "geen data"
      }
    }
    const debugPath = fm.joinPath(fm.documentsDirectory(), "weerDebug.txt")
    fm.writeString(debugPath, JSON.stringify({ fout: e.message, tijdstip: now.toISOString() }, null, 2))
  }
}

// ===============================
// TEKSTREGEL OPBOUWEN
// ===============================
let tempString
const regenDichtbij = weerData.regenBericht.startsWith(lang.rainFrom) &&
  !weerData.regenBericht.includes("+")

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
// TAAL FUNCTIES
// ===============================
function loadLang() {
  const fallback = {
    months: ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"],
    days: ["Zo","Ma","Di","Wo","Do","Vr","Za"],
    noRainExpected: "droog",
    rainAllDay: "🌧️🌧️",
    rainFrom: "☔️",
    dryFrom: "🌂",
    until: "tot"
  }
  if (!fm.fileExists(langPath)) return fallback
  try {
    return Object.assign(fallback, JSON.parse(fm.readString(langPath)))
  } catch {
    return fallback
  }
}

// ===============================
// CACHE FUNCTIES
// ===============================
function loadCache() {
  if (!fm.fileExists(cachePath)) return null
  try {
    return JSON.parse(fm.readString(cachePath))
  } catch {
    return null
  }
}

function saveCache(data) {
  fm.writeString(cachePath, JSON.stringify(data))
}

// ===============================
// NEERSLAG OPTELLEN
// ===============================
function berekenSom(neerslag, uren, vanIndex, totTijd) {
  let som = 0
  for (let i = vanIndex; i < uren.length; i++) {
    if (new Date(uren[i]) >= totTijd) break
    som += neerslag[i]
  }
  return Math.round(som * 10) / 10
}

// ===============================
// WEER EMOJI op basis van WMO weathercode
// ===============================
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

// ===============================
// UTILITIES
// ===============================
function formatUur(d) {
  const h = d.getHours()
  const m = d.getMinutes()
  return m === 0 ? `${h}u` : `${h}:${m.toString().padStart(2, "0")}`
}