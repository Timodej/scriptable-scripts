// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: brown; icon-glyph: magic;
// ===============================
// Lock Screen Widget deel 2: Volgende Events (geen reminders)
// ===============================

const DEFAULT_LIST_ITEMS = 6
const DEFAULT_FONT_SIZE = 10
const DEFAULT_DAYS_AHEAD = 7
const DEFAULT_SHOW_END_TIME = false
const DEFAULT_ALIGNMENT = "left"
const DEFAULT_DATE_FORMAT = "date"
const DEFAULT_TEXT_STYLE = "color"
const SETTINGS_FILE = "Lockscreen-upcoming-right-settings.json"
const SHOWN_FILE = "calendarWidgetShown.json"
const LANG_FILE = "timoLanguage-upcoming.json"

const params = args.widgetParameter ? JSON.parse(args.widgetParameter) : {}
const ACTION = params.action ?? "open"

let fm
try { fm = FileManager.iCloud() } catch (e) { fm = FileManager.local() }
const settingsPath = fm.joinPath(fm.documentsDirectory(), SETTINGS_FILE)
const shownPath = fm.joinPath(fm.documentsDirectory(), SHOWN_FILE)
const langPath = fm.joinPath(fm.documentsDirectory(), LANG_FILE)

const lang = loadLang()
const settings = loadSettings()

let shouldPreview = false

if (config.runsInApp) {
  if (ACTION === "open") {
    const scheme = settings.openApp ?? "weekcal"
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

let shownEventCount = 0
if (fm.fileExists(shownPath)) {
  try {
    const shownData = JSON.parse(fm.readString(shownPath))
    shownEventCount = shownData.shownEventCount ?? 0
  } catch { shownEventCount = 0 }
}

const MAX_ITEMS = settings.listItems ?? DEFAULT_LIST_ITEMS
const FONT_SIZE = settings.fontSize ?? DEFAULT_FONT_SIZE
const DAYS_AHEAD = settings.daysAhead ?? DEFAULT_DAYS_AHEAD
const SHOW_END_TIME = settings.showEndTime ?? DEFAULT_SHOW_END_TIME
const ALIGNMENT = settings.alignment ?? DEFAULT_ALIGNMENT
const DATE_FORMAT = settings.dateFormat ?? DEFAULT_DATE_FORMAT
const TEXT_STYLE = settings.textStyle ?? DEFAULT_TEXT_STYLE

const now = new Date()
const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
const startTime = now
const tomorrow = new Date(startOfToday)
tomorrow.setDate(tomorrow.getDate() + 1)
const endDate = new Date(startOfToday)
endDate.setDate(endDate.getDate() + DAYS_AHEAD)

const kalenders = settings.calendars ?? []
let calendars = (await Calendar.forEvents()).filter(c => kalenders.includes(c.title))
let calendarEvents = []

if (kalenders.length) {
  calendarEvents = (await CalendarEvent.between(startTime, endDate, calendars))
    .filter(e => e.endDate >= now)
    .map(e => ({
      title: e.title, date: e.startDate, endDate: e.endDate,
      isAllDay: e.isAllDay, type: "event"
    }))
}

let items = calendarEvents.slice(shownEventCount, shownEventCount + MAX_ITEMS)

// ===============================
// TEKSTSTIJL HELPERS
// ===============================
function getStijl(isHuidig) {
  switch (TEXT_STYLE) {
    case "bold":
      return {
        font: isHuidig ? Font.boldSystemFont(FONT_SIZE) : Font.systemFont(FONT_SIZE),
        color: Color.white()
      }
    case "size":
      return {
        font: isHuidig ? Font.systemFont(FONT_SIZE + 1) : Font.systemFont(FONT_SIZE - 1),
        color: Color.white()
      }
    case "boldcolor":
      return {
        font: isHuidig ? Font.boldSystemFont(FONT_SIZE) : Font.systemFont(FONT_SIZE),
        color: isHuidig ? Color.white() : new Color("#aaaaaa")
      }
    default: // "color"
      return {
        font: Font.systemFont(FONT_SIZE),
        color: isHuidig ? Color.white() : Color.gray()
      }
  }
}

let widget = new ListWidget()
widget.setPadding(6, 6, 6, 6)

if (!kalenders.length) {
  let t = widget.addText(lang.noCalendarsSelected)
  t.font = Font.systemFont(FONT_SIZE)
  t.textColor = Color.gray()
} else if (items.length === 0) {
  let t = widget.addText(lang.noFurtherEvents)
  t.font = Font.systemFont(FONT_SIZE)
  t.textColor = Color.gray()
} else {
  for (let item of items) {
    let isToday = isSameDay(item.date, startOfToday)
    let isTomorrow = isSameDay(item.date, tomorrow)
    let isHuidig = isToday
    let stijl = getStijl(isHuidig)

    let row = widget.addStack()
    row.spacing = 4
    if (ALIGNMENT === "right") row.addSpacer()

    let label = isToday ? lang.today : isTomorrow ? lang.tomorrow : formatDatum(item.date)
    let d = row.addText(label)
    d.font = stijl.font
    d.textColor = stijl.color

    if (!item.isAllDay && isHuidig) {
      let timeString = formatTime(item.date)
      if (SHOW_END_TIME && item.endDate) timeString += "–" + formatTime(item.endDate)
      let t = row.addText(" " + timeString)
      t.font = stijl.font
      t.textColor = stijl.color
    }

    let title = row.addText(" " + item.title)
    title.font = stijl.font
    title.textColor = stijl.color
    title.lineLimit = 1
  }
}

if (config.runsInWidget || config.runsInAccessoryWidget) {
  Script.setWidget(widget)
} else {
  await widget.presentSmall()
}
Script.complete()

function loadLang() {
  const fallback = {
    today: "Vandaag", tomorrow: "Morgen",
    noCalendarsSelected: "Geen agenda's geselecteerd",
    noFurtherEvents: "Geen verdere events",
    daysShort: ["Zo","Ma","Di","Wo","Do","Vr","Za"],
    daysFull: ["Zondag","Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag"]
  }
  if (!fm.fileExists(langPath)) return fallback
  try { return Object.assign(fallback, JSON.parse(fm.readString(langPath))) } catch { return fallback }
}

function loadSettings() {
  const defaults = {
    calendars: [], listItems: DEFAULT_LIST_ITEMS, fontSize: DEFAULT_FONT_SIZE,
    daysAhead: DEFAULT_DAYS_AHEAD, showEndTime: DEFAULT_SHOW_END_TIME,
    openApp: "weekcal", alignment: DEFAULT_ALIGNMENT,
    dateFormat: DEFAULT_DATE_FORMAT, textStyle: DEFAULT_TEXT_STYLE
  }
  if (!fm.fileExists(settingsPath)) return defaults
  try { return Object.assign(defaults, JSON.parse(fm.readString(settingsPath))) } catch { return defaults }
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function formatDatum(d) {
  if (DATE_FORMAT === "short") return lang.daysShort[d.getDay()]
  if (DATE_FORMAT === "full") return lang.daysFull[d.getDay()]
  return `${d.getDate()}-${d.getMonth() + 1}`
}

function formatTime(d) {
  let h = d.getHours()
  let m = d.getMinutes()
  return m === 0 ? `${h}:00` : `${h}:${m.toString().padStart(2, "0")}`
}