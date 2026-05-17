// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: download;
// ===============================
// Timo's Scripts — Script Manager
// ===============================

const GITHUB_USER = "Timodej"
const GITHUB_REPO = "scriptable-scripts"
const BRANCH = "main"
const BASE_URL = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${BRANCH}`
const CACHE_BUST = `?t=${Date.now()}`
const INDEX_URL = `${BASE_URL}/index.json${CACHE_BUST}`

// ===============================
// FILE SYSTEM
// ===============================
let fm
try {
  fm = FileManager.iCloud()
} catch (e) {
  fm = FileManager.local()
}
const docsDir = fm.documentsDirectory()

// ===============================
// TAAL
// ===============================
function loadManagerLang() {
  const locale = Device.locale()
  const isNl = locale.startsWith("nl")
  const langFile = isNl ? "timoNederlands.json" : "timoEnglish.json"
  const langPath = fm.joinPath(docsDir, langFile)
  const fallback = defaultLang()
  if (!fm.fileExists(langPath)) return fallback
  try { return Object.assign(fallback, JSON.parse(fm.readString(langPath))) } catch { return fallback }
}

function defaultLang() {
  return {
    updatesAvailable: "Updates beschikbaar", installed: "Geïnstalleerd",
    available: "Beschikbaar", install: "Installeer", update: "Update",
    updateAll: "Alles updaten", loading: "Laden...",
    loadingMessage: "Scripts worden opgehaald van GitHub.", updating: "Updaten...",
    error: "Fout", errorNetwork: "Kon index niet ophalen.",
    errorDownload: "Kon script niet downloaden.", close: "Sluiten", cancel: "Annuleer",
    installTitle: "Script installeren?", updateTitle: "Update installeren?",
    installMessage: "wordt gedownload van GitHub.", updateMessage: "wordt bijgewerkt van GitHub.",
    installSuccess: "is geïnstalleerd.", updateSuccess: "is bijgewerkt.",
    updateAllSuccess: "Alle scripts zijn bijgewerkt.", done: "Klaar!",
    info: "Info", refresh: "Verversen...", scriptsAvailable: "scripts beschikbaar",
    settings: "Instellingen", save: "Opslaan", notSet: "Niet ingesteld",
    custom: "Overig", enterAppScheme: "Voer de app URL scheme in (bijv. myapp)",
    language: "Taal", languageName: "Nederlands", on: "Aan", off: "Uit",
    andMore: "meer",
    sectionTaal: "Taal", sectionGedrag: "Gedrag", sectionAgenda: "Agenda",
    sectionWeergave: "Weergave", sectionRegen: "Regen", sectionOverig: "Overig",
    labelOpenApp: "App bij tikken", labelCalendars: "Kalenders",
    labelDaysAhead: "Dagen vooruit", labelListItems: "Max. items",
    labelFontSize: "Lettergrootte", labelShowEndTime: "Eindtijd tonen",
    labelRegenDrempelKans: "Regendrempel kans (%)", labelRegenDrempelMm: "Regendrempel (mm/uur)",
    labelRegenMinimumMm: "Minimum bui (mm totaal)", labelDichtbijUren: "Dichtbij (uren)",
    labelRainApi: "Regen API", labelRainDisplay: "Neerslagweergave",
    labelRainTime: "Tijdweergave",
    cacheWissen: "Cache wissen", cacheWissenOmschrijving: "Wist alle gecachte data",
    cacheWissenBevestig: "Alle gecachte data wordt verwijderd.", cacheGewist: "Cache gewist.",
    unsavedChanges: "Je hebt onopgeslagen wijzigingen.",
    saveChanges: "Opslaan", discardChanges: "Niet opslaan",
    managerUpdate: "Manager update beschikbaar",
    restartManager: "Herstart Timo's Scripts om de update te activeren."
  }
}

const lang = loadManagerLang()

// ===============================
// SECTIE EN LABEL VERTALING
// ===============================
function vertaalSectie(sectie) {
  const map = {
    "Taal": lang.sectionTaal, "Gedrag": lang.sectionGedrag,
    "Agenda": lang.sectionAgenda, "Weergave": lang.sectionWeergave,
    "Regen": lang.sectionRegen, "Overig": lang.sectionOverig,
    "Weer": lang.sectionWeer ?? "Weer", "Tijdas": lang.sectionTijdas ?? "Tijdas"
  }
  return map[sectie] ?? sectie
}

function vertaalLabel(key) {
  const map = {
    "openApp": lang.labelOpenApp, "calendars": lang.labelCalendars,
    "daysAhead": lang.labelDaysAhead, "listItems": lang.labelListItems,
    "fontSize": lang.labelFontSize, "showEndTime": lang.labelShowEndTime,
    "regenDrempelKans": lang.labelRegenDrempelKans, "regenDrempelMm": lang.labelRegenDrempelMm,
    "regenMinimumMm": lang.labelRegenMinimumMm, "dichtbijUren": lang.labelDichtbijUren,
    "language": lang.language, "rainApi": lang.labelRainApi,
    "rainDisplay": lang.labelRainDisplay, "rainTime": lang.labelRainTime,
    "begindag": lang.labelBegindag ?? "Begindag",
    "minDagen": lang.labelMinDagen ?? "Min. dagen",
    "maxDagen": lang.labelMaxDagen ?? "Max. dagen",
    "startUur": lang.labelStartUur ?? "Begintijd",
    "eindUur": lang.labelEindUur ?? "Eindtijd",
    "regenAlpha": lang.labelRegenAlpha ?? "Regen transparantie (%)",
    "zonAlpha": lang.labelZonAlpha ?? "Zon transparantie (%)",
    "textStyle": lang.labelTextStyle, "dateFormat": lang.labelDateFormat,
    "alignment": lang.labelAlignment
  }
  return map[key] ?? key
}

// ===============================
// HULPFUNCTIES INSTELLINGEN
// ===============================
function laadScriptInstellingen(script) {
  if (!script.settingsFile) return {}
  const pad = fm.joinPath(docsDir, script.settingsFile)
  if (!fm.fileExists(pad)) return {}
  try { return JSON.parse(fm.readString(pad)) } catch { return {} }
}

function slaScriptInstellingenOp(script, instellingen) {
  if (!script.settingsFile) return
  fm.writeString(fm.joinPath(docsDir, script.settingsFile), JSON.stringify(instellingen))
}

function laadScriptLang(script) {
  const fallback = defaultLang()
  if (!script.langFile) return fallback
  const langPath = fm.joinPath(docsDir, script.langFile)
  if (!fm.fileExists(langPath)) return fallback
  try { return Object.assign(fallback, JSON.parse(fm.readString(langPath))) } catch { return fallback }
}

function huidigeTaalVoorScript(script) {
  if (!script.langFile) return "nl"
  const langPath = fm.joinPath(docsDir, script.langFile)
  if (!fm.fileExists(langPath)) return "nl"
  try { return JSON.parse(fm.readString(langPath))._lang ?? "nl" } catch { return "nl" }
}

async function slaScriptTaalOp(script, taalCode) {
  if (!script.langFile) return
  const bronBestand = taalCode === "nl" ? "timoNederlands.json" : "timoEnglish.json"
  try {
    const req = new Request(`${BASE_URL}/languages/${bronBestand}${CACHE_BUST}`)
    const data = await req.loadJSON()
    data._lang = taalCode
    fm.writeString(fm.joinPath(docsDir, script.langFile), JSON.stringify(data))
  } catch (e) { await toonFout(lang.errorDownload) }
}

async function toonFout(bericht) {
  const alert = new Alert()
  alert.title = lang.error
  alert.message = bericht
  alert.addCancelAction("OK")
  await alert.presentAlert()
}

function kortKalenderLijst(kalenders) {
  if (!kalenders || kalenders.length === 0) return lang.notSet
  if (kalenders.length <= 2) return kalenders.join(", ")
  return `${kalenders.slice(0, 2).join(", ")} +${kalenders.length - 2} ${lang.andMore}`
}

// ===============================
// MANAGER CLASS
// ===============================
class ScriptManager {

  constructor() {
    this.table = new UITable()
    this.table.showSeparators = true
    this.index = null
    this.scriptStates = []
  }

  async run() {
    this.showLoading(lang.loading, lang.loadingMessage)
    try {
      const req = new Request(INDEX_URL)
      this.index = await req.loadJSON()
    } catch (e) {
      await toonFout(lang.errorNetwork)
      return
    }
    await this.laadScriptStaten()
    this.renderLijst()
    await this.table.present(true)
  }

  async laadScriptStaten() {
    this.scriptStates = await Promise.all(this.index.scripts.map(async (script) => {
      const url = `${BASE_URL}/scripts/${script.file}${CACHE_BUST}`
      let remoteCode = ""
      let updateBeschikbaar = false
      let geinstalleerd = false
      try {
        const req = new Request(url)
        remoteCode = await req.loadString()
      } catch (e) { remoteCode = "" }
      const lokaalPad = fm.joinPath(docsDir, script.file)
      if (fm.fileExists(lokaalPad)) {
        geinstalleerd = true
        updateBeschikbaar = this.hash(remoteCode) !== this.hash(fm.readString(lokaalPad))
      }
      return { ...script, url, remoteCode, geinstalleerd, updateBeschikbaar }
    }))
  }

  // ===============================
  // HOOFDLIJST
  // ===============================
  renderLijst() {
    this.table.removeAllRows()

    // Header
    const headerRij = new UITableRow()
    headerRij.isHeader = true
    headerRij.height = 60
    const headerTekst = headerRij.addText(
      "Timo's Scripts",
      `${this.index.scripts.length} ${lang.scriptsAvailable}`
    )
    headerTekst.titleFont = Font.boldSystemFont(16)
    headerTekst.subtitleFont = Font.systemFont(12)
    this.table.addRow(headerRij)

    // Timo's Scripts zelf altijd bovenaan
    const zelf = this.scriptStates.find(s => s.isSelf)
    if (zelf) {
      this.voegSectieHeaderToe("Timo's Scripts")
      this.voegScriptRijToe(zelf)
    }

    // Actieknoppen: cache wissen + update alle
    const actieRij = new UITableRow()
    actieRij.height = 44
    actieRij.dismissOnSelect = false

    const cacheKnop = actieRij.addButton(`🗑️ ${lang.cacheWissen}`)
    cacheKnop.widthWeight = 50
    cacheKnop.onTap = async () => {
      const bevestig = new Alert()
      bevestig.title = lang.cacheWissen
      bevestig.message = lang.cacheWissenBevestig
      bevestig.addAction(lang.cacheWissen)
      bevestig.addCancelAction(lang.cancel)
      if ((await bevestig.presentAlert()) === 0) {
        for (const bestand of ["weerWidgetCache.json", "calendarWidgetShown.json", "weerDebug.txt"]) {
          const pad = fm.joinPath(docsDir, bestand)
          if (fm.fileExists(pad)) fm.remove(pad)
        }
        const succes = new Alert()
        succes.title = lang.done
        succes.message = lang.cacheGewist
        succes.addCancelAction("OK")
        await succes.presentAlert()
      }
    }

    const metUpdateZonderZelf = this.scriptStates.filter(s => s.updateBeschikbaar && !s.isSelf)
    const updateAlKnop = actieRij.addButton(`⬆️ ${lang.updateAll}`)
    updateAlKnop.widthWeight = 50
    updateAlKnop.titleColor = metUpdateZonderZelf.length > 0 ? Color.red() : new Color("#8e8e93")
    updateAlKnop.onTap = async () => {
      if (metUpdateZonderZelf.length === 0) return
      const bevestig = new Alert()
      bevestig.title = lang.updateAll
      bevestig.message = `${metUpdateZonderZelf.length} ${lang.updatesAvailable}`
      bevestig.addAction(lang.updateAll)
      bevestig.addCancelAction(lang.cancel)
      if ((await bevestig.presentAlert()) !== 0) return
      this.showLoading(lang.updating, "")
      for (const script of metUpdateZonderZelf) {
        if (script.remoteCode) fm.writeString(fm.joinPath(docsDir, script.file), script.remoteCode)
      }
      const succes = new Alert()
      succes.title = lang.done
      succes.message = lang.updateAllSuccess
      succes.addCancelAction("OK")
      await succes.presentAlert()
      this.showLoading(lang.refresh, "")
      await this.laadScriptStaten()
      this.renderLijst()
    }
    this.table.addRow(actieRij)

    // Refresh knop
    const refreshRij = new UITableRow()
    refreshRij.height = 44
    refreshRij.dismissOnSelect = false
    const refreshKnop = refreshRij.addButton(`🔄 ${lang.refresh}`)
    refreshKnop.widthWeight = 100
    refreshKnop.onTap = async () => {
      this.showLoading(lang.loading, lang.loadingMessage)
      await this.laadScriptStaten()
      this.renderLijst()
    }
    this.table.addRow(refreshRij)

    // Updates sectie (zonder zelf)
    const metUpdate = this.scriptStates.filter(s => s.updateBeschikbaar && !s.isSelf)
    if (metUpdate.length) {
      this.voegSectieHeaderToe(`${lang.updatesAvailable} (${metUpdate.length})`)
      metUpdate.forEach(s => this.voegScriptRijToe(s))
    }

    // Geinstalleerd sectie (zonder zelf)
    const geinstalleerd = this.scriptStates.filter(s => s.geinstalleerd && !s.updateBeschikbaar && !s.isSelf)
    if (geinstalleerd.length) {
      this.voegSectieHeaderToe(lang.installed)
      geinstalleerd.forEach(s => this.voegScriptRijToe(s))
    }

    // Beschikbaar sectie (zonder zelf)
    const beschikbaar = this.scriptStates.filter(s => !s.geinstalleerd && !s.isSelf)
    if (beschikbaar.length) {
      this.voegSectieHeaderToe(lang.available)
      beschikbaar.forEach(s => this.voegScriptRijToe(s))
    }

    this.table.reload()
  }

  voegSectieHeaderToe(titel) {
    const rij = new UITableRow()
    rij.height = 36
    rij.backgroundColor = new Color("#f2f2f7")
    const tekst = rij.addText(titel.toUpperCase())
    tekst.titleFont = Font.boldSystemFont(11)
    tekst.titleColor = new Color("#6c6c70")
    this.table.addRow(rij)
  }

  voegScriptRijToe(script) {
    const rij = new UITableRow()
    rij.height = 80
    rij.dismissOnSelect = false
    const tekst = rij.addText(script.name, script.description)
    tekst.titleFont = Font.boldSystemFont(14)
    tekst.subtitleFont = Font.systemFont(12)
    tekst.widthWeight = 55

    if (script.updateBeschikbaar) {
      const knop = rij.addButton(lang.update)
      knop.titleColor = Color.red()
      knop.widthWeight = 25
      knop.onTap = async () => {
        await this.installeerScript(script, true)
        // Als het de manager zelf is, toon herstart melding
        if (script.isSelf) {
          const alert = new Alert()
          alert.title = lang.done
          alert.message = lang.restartManager
          alert.addCancelAction("OK")
          await alert.presentAlert()
        }
      }
    } else if (script.geinstalleerd) {
      const knop = rij.addButton("✓")
      knop.titleColor = new Color("#34c759")
      knop.widthWeight = 25
      knop.onTap = async () => { await this.toonInfo(script) }
    } else {
      const knop = rij.addButton(lang.install)
      knop.titleColor = new Color("#007aff")
      knop.widthWeight = 25
      knop.onTap = async () => { await this.installeerScript(script, false) }
    }

    // Instellingen knop alleen voor niet-self scripts met settings
    if (script.geinstalleerd && !script.isSelf && script.settings && script.settings.length > 0) {
      const settingsKnop = rij.addButton("⚙️")
      settingsKnop.widthWeight = 20
      settingsKnop.onTap = async () => { await this.toonInstellingenPagina(script) }
    }

    rij.onSelect = async () => { await this.toonInfo(script) }
    this.table.addRow(rij)
  }

  // ===============================
  // INSTELLINGEN PAGINA
  // ===============================
  async toonInstellingenPagina(script) {
    const instellingenTable = new UITable()
    instellingenTable.showSeparators = true

    const opgeslagen = laadScriptInstellingen(script)
    let tijdelijk = JSON.parse(JSON.stringify(opgeslagen))
    let gewijzigd = false

    const herlaad = () => {
      instellingenTable.removeAllRows()

      // Header met opslaan knop
      const header = new UITableRow()
      header.isHeader = true
      header.height = 50
      const headerTekst = header.addText(`⚙️ ${script.name}`)
      headerTekst.titleFont = Font.boldSystemFont(14)
      headerTekst.widthWeight = 70
      const opslaanKnop = header.addButton(lang.save)
      opslaanKnop.titleColor = gewijzigd ? new Color("#007aff") : new Color("#8e8e93")
      opslaanKnop.widthWeight = 30
      opslaanKnop.onTap = async () => {
        slaScriptInstellingenOp(script, tijdelijk)
        gewijzigd = false
        herlaad()
        const succes = new Alert()
        succes.title = lang.done
        succes.message = `${script.name} ${lang.updateSuccess}`
        succes.addCancelAction("OK")
        await succes.presentAlert()
      }
      instellingenTable.addRow(header)

      // Groepeer per sectie
      const secties = {}
      for (const setting of script.settings) {
        const sectie = setting.section ?? "Overig"
        if (!secties[sectie]) secties[sectie] = []
        secties[sectie].push(setting)
      }

      for (const [sectieNaam, instellingen] of Object.entries(secties)) {
        const sectieRij = new UITableRow()
        sectieRij.height = 36
        sectieRij.backgroundColor = new Color("#f2f2f7")
        const sectieTekst = sectieRij.addText(vertaalSectie(sectieNaam).toUpperCase())
        sectieTekst.titleFont = Font.boldSystemFont(11)
        sectieTekst.titleColor = new Color("#6c6c70")
        instellingenTable.addRow(sectieRij)

        for (const setting of instellingen) {
          const rij = new UITableRow()
          rij.height = 54
          rij.dismissOnSelect = false

          const label = vertaalLabel(setting.key)
          const waarde = tijdelijk[setting.key] ?? setting.default

          if (setting.type === "boolean") {
            const labelCell = rij.addText(label)
            labelCell.titleFont = Font.systemFont(14)
            labelCell.widthWeight = 70
            const toggleKnop = rij.addButton(waarde ? lang.on : lang.off)
            toggleKnop.widthWeight = 30
            toggleKnop.titleColor = new Color("#007aff")
            toggleKnop.onTap = async () => {
              tijdelijk[setting.key] = !waarde
              gewijzigd = true
              herlaad()
            }

          } else if (setting.type === "language") {
            const taalCode = huidigeTaalVoorScript(script)
            const taalNaam = taalCode === "nl" ? "Nederlands" : "English"
            const labelCell = rij.addText(lang.language, taalNaam)
            labelCell.titleFont = Font.systemFont(14)
            labelCell.subtitleFont = Font.systemFont(12)
            labelCell.subtitleColor = new Color("#6c6c70")
            labelCell.widthWeight = 100
            rij.onSelect = async () => {
              await this.toonTaalKeuze(script)
              herlaad()
            }

          } else if (setting.type === "calendars") {
            const geselecteerd = tijdelijk[setting.key] ?? []
            const labelCell = rij.addText(label, kortKalenderLijst(geselecteerd))
            labelCell.titleFont = Font.systemFont(14)
            labelCell.subtitleFont = Font.systemFont(12)
            labelCell.subtitleColor = new Color("#6c6c70")
            labelCell.widthWeight = 100
            rij.onSelect = async () => {
              const picked = await Calendar.presentPicker(true)
              if (picked && picked.length > 0) {
                tijdelijk[setting.key] = picked.map(c => c.title)
                gewijzigd = true
                herlaad()
              }
            }

          } else if (setting.type === "app") {
            const huidigScheme = tijdelijk[setting.key] ?? setting.default ?? ""
            const huidigApp = setting.apps?.find(a => a.scheme === huidigScheme)
            const appNaam = huidigApp ? huidigApp.label : (huidigScheme || lang.notSet)
            const labelCell = rij.addText(label, appNaam)
            labelCell.titleFont = Font.systemFont(14)
            labelCell.subtitleFont = Font.systemFont(12)
            labelCell.subtitleColor = new Color("#6c6c70")
            labelCell.widthWeight = 100
            rij.onSelect = async () => {
              await this.toonAppKeuze(script, setting, tijdelijk)
              gewijzigd = true
              herlaad()
            }

          } else if (setting.type === "choice") {
            const huidigeKeuze = setting.choices?.find(c => c.value === waarde)
            const keuzeLabel = huidigeKeuze ? huidigeKeuze.label : (waarde || lang.notSet)
            const labelCell = rij.addText(label, keuzeLabel)
            labelCell.titleFont = Font.systemFont(14)
            labelCell.subtitleFont = Font.systemFont(12)
            labelCell.subtitleColor = new Color("#6c6c70")
            labelCell.widthWeight = 100
            rij.onSelect = async () => {
              const alert = new Alert()
              alert.title = label
              for (const keuze of setting.choices ?? []) { alert.addAction(keuze.label) }
              alert.addCancelAction(lang.cancel)
              const keuzeIndex = await alert.presentAlert()
              if (keuzeIndex >= 0 && keuzeIndex < (setting.choices?.length ?? 0)) {
                tijdelijk[setting.key] = setting.choices[keuzeIndex].value
                gewijzigd = true
                herlaad()
              }
            }

          } else if (setting.type === "number" || setting.type === "decimal") {
            const labelCell = rij.addText(label, `${waarde}`)
            labelCell.titleFont = Font.systemFont(14)
            labelCell.subtitleFont = Font.systemFont(12)
            labelCell.subtitleColor = new Color("#6c6c70")
            labelCell.widthWeight = 100
            rij.onSelect = async () => {
              const alert = new Alert()
              alert.title = label
              alert.addTextField(`${waarde}`, `${waarde}`)
              alert.addAction(lang.save)
              alert.addCancelAction(lang.cancel)
              if ((await alert.presentAlert()) === 0) {
                const invoer = alert.textFieldValue(0)
                const nieuw = setting.type === "decimal" ? parseFloat(invoer) : parseInt(invoer)
                if (!isNaN(nieuw)) {
                  let val = nieuw
                  if (setting.min !== undefined) val = Math.max(setting.min, val)
                  if (setting.max !== undefined) val = Math.min(setting.max, val)
                  tijdelijk[setting.key] = val
                  gewijzigd = true
                  herlaad()
                }
              }
            }
          }

          instellingenTable.addRow(rij)
        }
      }

      instellingenTable.reload()
    }

    herlaad()
    await instellingenTable.present(true)

    // Onopgeslagen wijzigingen check
    if (gewijzigd) {
      const alert = new Alert()
      alert.title = lang.unsavedChanges
      alert.addAction(lang.saveChanges)
      alert.addDestructiveAction(lang.discardChanges)
      alert.addCancelAction(lang.cancel)
      if ((await alert.presentAlert()) === 0) {
        slaScriptInstellingenOp(script, tijdelijk)
      }
    }
  }

  async toonTaalKeuze(script) {
    const alert = new Alert()
    alert.title = lang.language
    alert.addAction("Nederlands")
    alert.addAction("English")
    alert.addCancelAction(lang.cancel)
    const keuze = await alert.presentAlert()
    if (keuze === 0 || keuze === 1) await slaScriptTaalOp(script, keuze === 0 ? "nl" : "en")
  }

  async toonAppKeuze(script, setting, tijdelijk) {
    const alert = new Alert()
    alert.title = lang.labelOpenApp
    for (const app of setting.apps ?? []) { alert.addAction(app.label) }
    alert.addCancelAction(lang.cancel)
    const keuze = await alert.presentAlert()
    if (keuze >= 0 && keuze < (setting.apps?.length ?? 0)) {
      const gekozen = setting.apps[keuze]
      if (gekozen.scheme === "custom") {
        const invoer = new Alert()
        invoer.title = lang.custom
        invoer.message = lang.enterAppScheme
        invoer.addTextField("bijv. myapp", tijdelijk[setting.key] ?? "")
        invoer.addAction(lang.save)
        invoer.addCancelAction(lang.cancel)
        if ((await invoer.presentAlert()) === 0) {
          const scheme = invoer.textFieldValue(0).trim()
          if (scheme) tijdelijk[setting.key] = scheme
        }
      } else {
        tijdelijk[setting.key] = gekozen.scheme
      }
    }
  }

  async toonInfo(script) {
    const alert = new Alert()
    alert.title = script.name
    alert.message = script.description
    if (script.updateBeschikbaar) alert.addAction(lang.update)
    else if (!script.geinstalleerd) alert.addAction(lang.install)
    alert.addCancelAction(lang.close)
    const keuze = await alert.presentAlert()
    if (keuze === 0) await this.installeerScript(script, script.geinstalleerd)
  }

  async installeerScript(script, isUpdate) {
    if (!script.remoteCode) { await toonFout(lang.errorDownload); return }
    const bevestig = new Alert()
    bevestig.title = isUpdate ? lang.updateTitle : lang.installTitle
    bevestig.message = `${script.name} ${isUpdate ? lang.updateMessage : lang.installMessage}`
    bevestig.addAction(isUpdate ? lang.update : lang.install)
    bevestig.addCancelAction(lang.cancel)
    if ((await bevestig.presentAlert()) !== 0) return
    fm.writeString(fm.joinPath(docsDir, script.file), script.remoteCode)
    const succes = new Alert()
    succes.title = lang.done
    succes.message = `${script.name} ${isUpdate ? lang.updateSuccess : lang.installSuccess}`
    succes.addCancelAction("OK")
    await succes.presentAlert()
    this.showLoading(lang.refresh, "")
    await this.laadScriptStaten()
    this.renderLijst()
  }

  showLoading(titel, bericht) {
    this.table.removeAllRows()
    const rij = new UITableRow()
    rij.height = 100
    const tekst = rij.addText(titel, bericht)
    tekst.titleFont = Font.boldSystemFont(14)
    this.table.addRow(rij)
    this.table.reload()
  }

  hash(str) {
    return Array.from(str).reduce((acc, c) => Math.imul(31, acc) + c.charCodeAt(0), 0)
  }
}

// ===============================
// START (altijd onderaan!)
// ===============================
await new ScriptManager().run()
Script.complete()