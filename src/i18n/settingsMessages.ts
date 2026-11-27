// English texts of the settings dialog and its server messages. Merged into the English resources in index.ts.
export const settingsEnglish: Record<string, string> = {
  Einstellungsbereiche: 'Settings sections',
  Allgemein: 'General',
  Export: 'Export',
  Leistung: 'Performance',
  Tastenkürzel: 'Keyboard shortcuts',
  Server: 'Server',
  Verbunden: 'Connected',
  'Startet …': 'Starting …',
  'Nicht verbunden': 'Not connected',
  'Externe Instanz': 'External instance',
  'Private Instanz': 'Private instance',
  'Ungespeicherte Änderungen': 'Unsaved changes',
  'Ungespeicherte Änderungen.': 'Unsaved changes.',
  'Ungespeicherte Änderungen. Speichern startet ComfyUI neu.': 'Unsaved changes. Saving restarts ComfyUI.',
  'Ungespeicherte ComfyUI-Einstellungen verwerfen?': 'Discard unsaved ComfyUI settings?',
  Verwerfen: 'Discard',
  Speichern: 'Save',
  'Speichert …': 'Saving …',
  'Speichern und neu starten': 'Save and restart',
  'Prüft …': 'Checking …',

  // General
  Session: 'Session',
  'Session automatisch speichern': 'Save session automatically',
  'Speichert den Arbeitsstand im Hintergrund. Du kannst jederzeit auch manuell speichern.':
    'Saves the workspace in the background. You can also save manually at any time.',
  'Wartezeit in Sekunden': 'Delay in seconds',
  'Zeit seit der letzten Änderung. Beim Tabwechsel kann Pixelbench früher speichern.':
    'Time since the last edit. Switching tabs can save sooner.',
  'Schalte Autosave ein, um die Wartezeit zu ändern.': 'Turn on autosave to change the delay.',
  'Maximale Sicherungsgröße': 'Backup size limit',
  'Das Limit gilt für neue Sicherungen. Bestehende Sicherungen bleiben erhalten.':
    'The limit applies to new backups. Existing backups are kept.',
  'Belegter Speicher': 'Storage used',
  'Die Speicherbelegung ist noch nicht verfügbar.': 'Storage usage is not available yet.',
  'Die gespeicherten Dateien liegen über dem eingestellten Limit.': 'Saved files exceed the current limit.',
  'Größe der komprimierten Session-Dateien auf der Platte.': 'Size of the compressed session files on disk.',
  '{{used}} von {{limit}}': '{{used}} of {{limit}}',
  'Gespeicherte Sessions': 'Saved sessions',
  'Löscht die Sicherung auf der Platte. Der offene Arbeitsstand bleibt im Editor.':
    'Deletes the backup on disk. Your open workspace stays in the editor.',
  'Alle Sessions löschen': 'Delete all sessions',
  'Alle gespeicherten Sessions löschen? Der offene Arbeitsstand bleibt im Editor.':
    'Delete all saved sessions? Your open workspace stays in the editor.',
  'Gespeicherte Sessions gelöscht.': 'Saved sessions deleted.',
  'Die gespeicherten Sessions konnten nicht vollständig gelöscht werden.':
    'Some saved session files could not be deleted.',
  'Das Speicherlimit konnte nicht gespeichert werden.': 'Could not save the storage limit.',
  Arbeitsablauf: 'Workflow',
  Uhrzeit: 'Clock',
  '24 Stunden': '24-hour',
  '12 Stunden': '12-hour',
  'Abgeschickte Prompts speichern': 'Save submitted prompts',
  'Jede gestartete Generierung legt ihren Prompt im Verlauf unter dem Prompt-Feld ab.':
    'Every generation you start adds its prompt to the history below the prompt field.',
  'Maximale Anzahl': 'Maximum entries',
  'Ist der Verlauf voll, fällt der am längsten nicht benutzte Prompt heraus.':
    'When the history is full, the prompt that was used longest ago is dropped.',
  'Gespeicherte Prompts': 'Saved prompts',
  'Prompts im Verlauf: {{count}}': 'Prompts in the history: {{count}}',
  'Alle Prompts aus dem Verlauf löschen? Das lässt sich nicht rückgängig machen.':
    'Delete all prompts from the history? This cannot be undone.',
  'Verlauf löschen': 'Clear history',
  'Nach dem Übernehmen zu Ändern wechseln': 'Switch to Edit after applying',
  'Ein übernommenes Bild aus Erstellen öffnet direkt im Modus Ändern.':
    'An image applied in Create opens straight in Edit.',
  'Prompts beim Öffnen eines Bildes behalten': 'Keep prompts when opening an image',
  'Jeder Modus behält Prompt und Negativ-Prompt, etwa für eine Bildserie mit derselben Änderung.':
    'Each mode keeps its prompt and negative prompt, for example for a series of images with the same edit.',
  'Vor dem Verwerfen nachfragen': 'Ask before discarding',
  'Fragt nach, bevor ungespeicherte Änderungen oder Varianten verloren gehen.':
    'Asks before unsaved changes or variants are lost.',
  'Konsole bei Fehlern öffnen': 'Open the console on errors',
  'Zeigt das ComfyUI-Protokoll, wenn eine Generierung fehlschlägt.': 'Shows the ComfyUI log when a generation fails.',
  'Wenn eine Generierung endet': 'When a generation ends',
  Systembenachrichtigung: 'System notification',
  'Nur wenn Pixelbench gerade im Hintergrund ist.': 'Only while Pixelbench is in the background.',
  'Der Browser blockiert Benachrichtigungen für diese Seite. Erlaube sie in den Website-Einstellungen.':
    'The browser blocks notifications for this page. Allow them in the site settings.',
  'Ton abspielen': 'Play a sound',
  'Ein kurzer Klang bei Erfolg oder Fehler.': 'A short chime on success or failure.',
  Anhören: 'Preview',
  Zurücksetzen: 'Reset',
  Fensteraufteilung: 'Window layout',
  'Stellt Panelbreiten und aufgeklappte Bereiche wieder her. Die Seite lädt neu.':
    'Restores panel widths and expanded sections. The page reloads.',
  'Alle Einstellungen in diesem Browser': 'All settings in this browser',
  'Löscht Vorgaben, Modellauswahl, LoRAs und Layout. Sprache und ComfyUI-Einrichtung bleiben.':
    'Clears defaults, model choices, LoRAs and layout. Language and the ComfyUI setup stay.',
  'Alle Einstellungen in diesem Browser zurücksetzen? Das lässt sich nicht rückgängig machen.':
    'Reset all settings in this browser? This cannot be undone.',
  'Generierung abgeschlossen': 'Generation finished',
  'Generierung fehlgeschlagen': 'Generation failed',
  'Die neue Variante ist bereit.': 'The new variant is ready.',
  'Details stehen in der Konsole.': 'See the console for details.',

  // Export
  Dateiformat: 'File format',
  'JPG-Qualität': 'JPG quality',
  'Höher heißt größere Dateien mit weniger Kompressionsspuren.': 'Higher means larger files with fewer artifacts.',
  'Generierungsdaten speichern': 'Store generation data',
  'Nur bei PNG möglich.': 'Only available for PNG.',
  'Prompt, Seed und Einstellungen im PNG, lesbar für Forge, ComfyUI-Tools und Pixelbench.':
    'Prompt, seed and settings in the PNG, readable by Forge, ComfyUI tools and Pixelbench.',
  Dateiname: 'File name',
  Muster: 'Pattern',
  Beispiel: 'Example',
  Standard: 'Default',
  'Platzhalter einfügen': 'Insert placeholder',
  'Name der geöffneten Datei': 'Name of the opened file',
  'Datum (JJJJ-MM-TT)': 'Date (YYYY-MM-DD)',
  'Uhrzeit (hhmmss)': 'Time (hhmmss)',
  'Seed der Generierung': 'Seed of the generation',
  'Modelldatei der Generierung': 'Model file of the generation',
  'Workflow der Generierung': 'Workflow of the generation',
  'Breite in Pixeln': 'Width in pixels',
  'Höhe in Pixeln': 'Height in pixels',

  // ComfyUI
  Privat: 'Private',
  Extern: 'External',
  'Verbindet sich mit einem laufenden ComfyUI. Generieren geht nur mit der privaten Instanz.':
    'Connects to a running ComfyUI. Generating needs the private instance.',
  'Pixelbench startet ComfyUI selbst, nur für sich, und räumt danach auf.':
    'Pixelbench starts its own ComfyUI and cleans up after it.',
  Adresse: 'Address',
  Installation: 'Installation',
  'ComfyUI-Ordner': 'ComfyUI folder',
  'Der Ordner mit main.py.': 'The folder that contains main.py.',
  'ComfyUI-Ordner auswählen': 'Choose the ComfyUI folder',
  Python: 'Python',
  'Das Python der Umgebung, in der ComfyUI installiert ist, meist in .venv\\Scripts (Windows) oder .venv/bin (macOS).':
    'The Python of the environment ComfyUI is installed in, usually in .venv\\Scripts (Windows) or .venv/bin (macOS).',
  'Python-Programm auswählen': 'Choose the Python executable',
  Modelle: 'Models',
  Modellordner: 'Model folders',
  'Ordner mit Unterordnern wie checkpoints, loras oder vae. Die Modelle im ComfyUI-Ordner werden immer gefunden.':
    'Folders with subfolders such as checkpoints, loras or vae. Models in the ComfyUI folder are always found.',
  'Modellordner auswählen': 'Choose a model folder',
  'Ordner hinzufügen': 'Add folder',
  'Pfad eintippen': 'Type a path',
  'Weitere Ordner je Modellart': 'More folders per model type',
  'Ordner für {{category}} auswählen': 'Choose a folder for {{category}}',
  Start: 'Startup',
  Port: 'Port',
  'Leer lassen für einen freien Port bei jedem Start.': 'Leave empty to pick a free port on every start.',
  automatisch: 'automatic',
  'Zusätzliche Startoptionen': 'Extra launch options',
  'ComfyUI-Optionen, durch Leerzeichen getrennt, z. B. --use-sage-attention oder --reserve-vram 2.':
    'ComfyUI options separated by spaces, such as --use-sage-attention or --reserve-vram 2.',
  'Ordner auswählen …': 'Choose folder …',
  'Datei auswählen …': 'Choose file …',
  'Pfad entfernen': 'Remove path',
  Gefunden: 'Found',

  // Performance
  VRAM: 'VRAM',
  Sparsam: 'Low memory',
  'Diese Einstellungen gelten nur für die private Instanz. Eine externe Instanz bestimmt sie selbst.':
    'These settings only apply to the private instance. An external instance decides them itself.',

  // Shortcuts
  'Kürzel wirken, solange kein Textfeld den Fokus hat.': 'Shortcuts work while no text field has focus.',
  Modi: 'Modes',
  'Datei und Verlauf': 'File and history',
  Leinwand: 'Canvas',
  Ansicht: 'View',
  Generieren: 'Generate',
  'Bild öffnen': 'Open image',
  Exportieren: 'Export',
  'Neues Bild': 'New image',
  Rückgängig: 'Undo',
  Wiederholen: 'Redo',
  'Maske ein- oder ausblenden': 'Show or hide the mask',
  'Vorherige oder nächste Variante': 'Previous or next variant',
  'Vorher und nachher vergleichen': 'Compare before and after',
  'Variante entfernen': 'Remove variant',
  'Variantenleiste ein- oder ausblenden': 'Show or hide the variant strip',
  'Auswahl aufheben': 'Clear selection',
  Strg: 'Ctrl',
  Eingabe: 'Enter',
  Entf: 'Del',
  Esc: 'Esc',
  oder: 'or',

  // Server
  Verbindung: 'Connection',
  Status: 'Status',
  Gerät: 'Device',
  'Neu starten': 'Restart',
  Beenden: 'Shut down',
  'Beendet ComfyUI und startet beides neu. Die Seite verbindet sich danach von selbst.':
    'Stops ComfyUI and restarts both. The page reconnects on its own.',
  'Beendet Pixelbench und ComfyUI. Neu starten geht dann nur im Terminal.':
    'Stops Pixelbench and ComfyUI. You can only start it again from the terminal.',

  // About
  'Über Pixelbench': 'About Pixelbench',
  'Lokaler Bildeditor für ComfyUI: Erstellen, Ändern, Hochskalieren und Maskieren an einem Ort.':
    'A local image editor for ComfyUI: create, edit, upscale and mask in one place.',
  Version: 'Version',
  Technik: 'Built with',
  Neuigkeiten: "What's new",
  'Was ist neu in v{{version}}': 'Changes in v{{version}}',
  'Alle Versionen': 'All releases',
  Autor: 'Author',
  Lizenz: 'License',
  Updates: 'Updates',
  'Update wird installiert …': 'Installing the update …',
  'Version {{version}} ist verfügbar': 'Version {{version}} is available',
  'Pixelbench ist aktuell': 'Pixelbench is up to date',
  'Noch nicht nach Updates gesucht': 'Not checked for updates yet',
  'Pixelbench lädt die neue Version, startet neu und lädt danach die Seite neu. Den Fortschritt zeigt das Pixelbench-Fenster.':
    'Pixelbench downloads the new version, restarts and then reloads the page. The Pixelbench window shows the progress.',
  'Release-Notes ansehen': 'View release notes',
  'Zuletzt geprüft: {{time}}': 'Last checked: {{time}}',
  'Pixelbench auf Version {{version}} aktualisieren? Der Server startet dabei neu.':
    'Update Pixelbench to version {{version}}? The server restarts during the update.',
  'Nach Updates suchen': 'Check for updates',
  'Jetzt aktualisieren': 'Update now',
  'Dieser Ordner ist ein Git-Checkout. Aktualisiere ihn mit git pull und starte danach install.cmd oder install.command.':
    'This folder is a git checkout. Update it with git pull, then run install.cmd or install.command.',
  'Beim Start nach Updates suchen': 'Check for updates on start',
  'Fragt höchstens einmal am Tag bei GitHub nach einer neuen Version. Bilder und Prompts werden dabei nicht übertragen.':
    'Asks GitHub for a new version at most once a day. No images or prompts are sent.',
  'Beta-Versionen anbieten': 'Offer beta versions',
  'Bietet auch Vorabversionen an. Sie sind neuer, aber weniger getestet.':
    'Also offers pre-releases. They are newer but less tested.',
  'Das letzte Update ist fehlgeschlagen: {{error}}': 'The last update failed: {{error}}',
  'Update verfügbar': 'Update available',
  'Einstellungen · Update verfügbar': 'Settings · Update available',
  'Pixelbench wurde auf Version {{version}} aktualisiert.': 'Pixelbench was updated to version {{version}}.',
  'Das Update wird installiert. Den Fortschritt zeigt das Pixelbench-Fenster.':
    'Installing the update. The Pixelbench window shows the progress.',
  'Der Server ist nach dem Update noch nicht erreichbar.': 'The server is not reachable yet after the update.',
  'Das Update ist fehlgeschlagen.': 'The update failed.',
  'Läuft komplett auf deinem Rechner. Bilder und Prompts verlassen ihn nicht.':
    'Runs entirely on your machine. Images and prompts never leave it.'

  // Server messages
}
