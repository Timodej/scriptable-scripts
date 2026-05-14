// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: brown; icon-glyph: magic;
// ===============================
// Lock Screen Widget deel 2: Volgende Events (geen reminders)
// ===============================

// ===============================
// DEFAULTS
// ===============================
const DEFAULT_LIST_ITEMS = 6
const DEFAULT_FONT_SIZE = 10
const DEFAULT_DAYS_AHEAD = 7
const DEFAULT_SHOW_END_TIME = false
const SETTINGS_FILE = "calendarWidgetSettings.json"
const SHOWN_FILE = "calendarWidgetShown.json"
const LANG_FILE = "timoLanguage.json"

// ===============================
// PARAMETERS
// ===============================
const params = args.widgetParameter ? JSON.parse(args.widgetParameter) : {}
const ACTION = params.action ?? "default"

// ===============================
// FILE SYSTEM
// ===============================
let fm
try {
  fm = FileManager.iCloud()
} catch (e) {
  fm = FileManager.local()
}
const settingsPath = fm.joinPath(fm.documentsDirectory(), SETTINGS_FILE)
const shownPath = fm.joinPath(fm.documentsDirectory(), SHOWN_FILE)
const langPath = fm.joinPath(fm.documentsDirectory(), LANG_FILE)

// ===============================
// TAAL LADEN
// ===============================
let lang = loadLang()

// ===============================
// LOAD SETTINGS
// ===============================
let settings = loadSettings()
let shouldPreview = false

// ===============================
// SETTINGS MENU
// ===============================
if (config.runsInApp) {
  if (ACTION === "open") {
    const appleDate = new Date("2001/01/01")
    const timestamp = (new Date().getTime() - appleDate.getTime()) / 1e3
    const callback = new CallbackURL("weekcal://" + timestamp)
    callback.open()
    Script.complete()
    return
  } else if (ACTION === "preview") {
    shouldPreview = true
  } else {
    let menu = new Alert()
    menu.title = "Settings"
    menu.addAction("Preview List")
    menu.addAction("Reset Calendars")
    menu.addAction("Display Settings")
    menu.addCancelAction("Close")

    let choice = await menu.presentAlert()

    if (choice === -1) {
      Script.complete()
      return
    }

    if (choice === 0) {
      shouldPreview = true
    }

    if (choice === 1) {
      settings.calendars = await pickCalendars()
      saveSettings(settings)
      Script.complete()
      return
    }

    if (choice === 2) {
      let a = new Alert()
      a.title = "Eindtijd tonen?"
      a.addAction("Toggle")
      a.addCancelAction(lang.cancel)

      if ((await a.presentAlert()) === 0) {
        settings.showEndTime = !settings.showEndTime
        saveSettings(settings)
        shouldPreview = true
      } else {
        Script.complete()
        return
      }
    }
  }
}

// ===============================
// STOP IF NOT WIDGET + NO PREVIEW
// ===============================
if (!config.runsInWidget && !config.runsInAccessoryWidget && !shouldPreview) {
  Script.complete()
  return
}

// ===============================
// CAL SAVE
// ===============================
if (!settings.calendars.length && config.runsInApp) {
  settings.calendars = await pickCalendars()
  saveSettings(settings)
}

// ===============================
// DISPLAY VALUES
// ===============================
const MAX_ITEMS = settings.listItems ?? DEFAULT_LIST_ITEMS
const FONT_SIZE = settings.linkFontToList
  ? (MAX_ITEMS === 6 ? 10 : 11)
  : (settings.fontSize ?? DEFAULT_FONT_SIZE)

const DAYS_AHEAD = settings.daysAhead ?? DEFAULT_DAYS_AHEAD
const SHOW_END_TIME = settings.showEndTime ?? DEFAULT_SHOW_END_TIME

// ===============================
// LEES HOEVEEL EVENTS DEEL 1 HEEFT GETOOND
// ===============================
let shownEventCount = 0
if (fm.fileExists(shownPath)) {
  try {
    const shownData = JSON.parse(fm.readString(shownPath))
    shownEventCount = shownData.shownEventCount ?? 0
  } catch {
    shownEventCount = 0
  }
}

// ===============================
// DATE RANGE
// ===============================
const now = new Date()
const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
const startTime = now
const tomorrow = new Date(startOfToday)
tomorrow.setDate(tomorrow.getDate() + 1)

const endDate = new Date(startOfToday)
endDate.setDate(endDate.getDate() + DAYS_AHEAD)

// ===============================
// CALENDAR EVENTS
// ===============================
let calendars = (await Calendar.forEvents())
  .filter(c => settings.calendars.includes(c.title))

let calendarEvents = []

if (settings.calendars.length) {
  calendarEvents = (await CalendarEvent.between(startTime, endDate, calendars))
    .filter(e => e.endDate >= now)
    .map(e => ({
      title: e.title,
      date: e.startDate,
      endDate: e.endDate,
      isAllDay: e.isAllDay,
      type: "event"
    }))
}

// ===============================
// SLA EVENTS OVER DIE DEEL 1 AL TOONT
// ===============================
let items = calendarEvents.slice(shownEventCount, shownEventCount + MAX_ITEMS)

// ===============================
// BUILD WIDGET
// ===============================
let widget = new ListWidget()
widget.setPadding(6, 6, 6, 6)

if (!settings.calendars.length) {

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
    let color = isToday ? Color.white() : Color.gray()

    let row = widget.addStack()
    row.spacing = 6

    let label =
      isToday ? lang.today :
      isTomorrow ? lang.tomorrow :
      formatDate(item.date)

    let d = row.addText(label)
    d.font = Font.systemFont(FONT_SIZE)
    d.textColor = color

    if (!item.isAllDay && (isToday || isTomorrow)) {
      let timeString = formatTime(item.date)
      if (SHOW_END_TIME && item.endDate) {
        timeString += "–" + formatTime(item.endDate)
      }
      let t = row.addText(" " + timeString)
      t.font = Font.systemFont(FONT_SIZE)
      t.textColor = color
    }

    let title = row.addText(" " + item.title)
    title.font = Font.systemFont(FONT_SIZE)
    title.textColor = color
    title.lineLimit = 1
  }
}

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
    today: "Vandaag", tomorrow: "Morgen",
    noCalendarsSelected: "Geen agenda's geselecteerd",
    noFurtherEvents: "Geen verdere events",
    cancel: "Annuleer",
    months: ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"],
    days: ["Zo","Ma","Di","Wo","Do","Vr","Za"]
  }
  if (!fm.fileExists(langPath)) return fallback
  try {
    return Object.assign(fallback, JSON.parse(fm.readString(langPath)))
  } catch {
    return fallback
  }
}

// ===============================
// SETTINGS FUNCTIONS
// ===============================
function defaultSettings() {
  return {
    calendars: [],
    listItems: DEFAULT_LIST_ITEMS,
    linkFontToList: true,
    fontSize: DEFAULT_FONT_SIZE,
    daysAhead: DEFAULT_DAYS_AHEAD,
    showEndTime: DEFAULT_SHOW_END_TIME
  }
}

function loadSettings() {
  if (!fm.fileExists(settingsPath)) return defaultSettings()
  try {
    return Object.assign(defaultSettings(), JSON.parse(fm.readString(settingsPath)))
  } catch {
    return defaultSettings()
  }
}

function saveSettings(s) {
  fm.writeString(settingsPath, JSON.stringify(s))
}

async function pickCalendars() {
  if (!config.runsInApp) return settings.calendars ?? []
  let picked = await Calendar.presentPicker(true)
  return picked.map(c => c.title)
}

// ===============================
// UTILITIES
// ===============================
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function formatDate(d) {
  return `${d.getDate()}-${d.getMonth() + 1}`
}

function formatTime(d) {
  let h = d.getHours()
  let m = d.getMinutes()
  return m === 0 ? `${h}:00` : `${h}:${m.toString().padStart(2, "0")}`
}
