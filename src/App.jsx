import React, { useMemo, useState } from 'react'

const DEFAULT_MAX_SIZE_MB = 250

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`
}

export default function App() {
  const api = window.api
  const [step, setStep] = useState('setup')
  const [folderPath, setFolderPath] = useState('')
  const [scanResult, setScanResult] = useState({ files: [], totalSize: 0, truncated: false, maxFiles: 0 })
  const [analysis, setAnalysis] = useState({ runId: '', suggestions: [] })
  const [selected, setSelected] = useState({})
  const [maxSizeMB, setMaxSizeMB] = useState(DEFAULT_MAX_SIZE_MB)
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')

  const suggestions = analysis.suggestions || []

  async function handleSelectFolder() {
    setError('')
    if (!api?.selectFolder || !api?.scanFiles) {
      setError('Bridge nicht verfügbar. Bitte App neu starten.')
      return
    }

    const path = await api.selectFolder()
    if (!path) return

    setFolderPath(path)
    setLoading(true)
    try {
      const result = await api.scanFiles(path)
      setScanResult(result || { files: [], totalSize: 0, truncated: false, maxFiles: 0 })
    } catch (err) {
      setError(err?.message || 'Scan fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  async function handleAnalyze() {
    if (!scanResult.files.length) return
    setError('')
    setLoading(true)
    try {
      const result = await api.analyzeDuplicates(scanResult.files, { maxSizeMB })
      const nextSuggestions = result?.suggestions || []
      setAnalysis({ runId: result?.runId || '', suggestions: nextSuggestions })

      const nextSelected = {}
      nextSuggestions.forEach((item) => {
        if (item.action !== 'keep') nextSelected[item.path] = true
      })
      setSelected(nextSelected)
      setStep('review')
    } catch (err) {
      setError(err?.message || 'Analyse fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  function updateAction(targetPath, action) {
    setAnalysis((prev) => ({
      ...prev,
      suggestions: prev.suggestions.map((item) => {
        if (item.path !== targetPath) return item
        return { ...item, action }
      })
    }))

    if (action === 'keep') {
      setSelected((prev) => ({ ...prev, [targetPath]: false }))
    } else {
      setSelected((prev) => ({ ...prev, [targetPath]: true }))
    }
  }

  async function handleExecute() {
    const items = suggestions.filter((item) => selected[item.path] && item.action !== 'keep')

    if (!items.length) return

    setError('')
    setLoading(true)
    try {
      const result = await api.executePlan({
        folderPath,
        runId: analysis.runId,
        items
      })
      setReport(result)
      setStep('done')
    } catch (err) {
      setError(err?.message || 'Ausführen fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  const grouped = useMemo(() => {
    const groups = { 'move-to-archive': [], 'move-to-trash': [], keep: [] }
    suggestions.forEach((item) => {
      if (groups[item.action]) groups[item.action].push(item)
    })
    return groups
  }, [suggestions])

  const selectedCount = useMemo(
    () => Object.values(selected).filter(Boolean).length,
    [selected]
  )

  if (step === 'setup') {
    return (
      <div className="page">
        <div className="card">
          <header className="header">
            <div>
              <h1>AI File Organizer</h1>
              <p>Duplicate Finder mit sicherem Archiv</p>
            </div>
            <button className="ghost" onClick={() => api?.openExternal('https://electronjs.org')}>
              Electron Docs
            </button>
          </header>

          {error ? <div className="error">{error}</div> : null}

          <section className="section">
            <button className="primary" onClick={handleSelectFolder} disabled={loading}>
              Ordner auswählen
            </button>
            {folderPath ? (
              <div className="summary">
                <div className="summary-row">
                  <span>Ordner</span>
                  <span className="mono">{folderPath}</span>
                </div>
                <div className="summary-row">
                  <span>Gefundene Dateien</span>
                  <span>{scanResult.files.length}</span>
                </div>
                <div className="summary-row">
                  <span>Gesamtgröße</span>
                  <span>{formatBytes(scanResult.totalSize)}</span>
                </div>
                {scanResult.truncated ? (
                  <div className="summary-row">
                    <span>Hinweis</span>
                    <span>Limit {scanResult.maxFiles} erreicht</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="section">
            <label className="label">Max. Dateigröße fürs Hashing (MB)</label>
            <input
              type="number"
              min="1"
              max="2048"
              value={maxSizeMB}
              onChange={(event) => setMaxSizeMB(Number(event.target.value || DEFAULT_MAX_SIZE_MB))}
              className="input"
            />
          </section>

          <section className="section">
            <button
              className="secondary"
              onClick={handleAnalyze}
              disabled={loading || !scanResult.files.length}
            >
              {loading ? 'Analysiere…' : 'Duplikate analysieren'}
            </button>
          </section>
        </div>
      </div>
    )
  }

  if (step === 'review') {
    return (
      <div className="page">
        <div className="card">
          <header className="header">
            <div>
              <h1>Vorschläge prüfen</h1>
              <p>Archiviert Duplikate, Trash bleibt optional</p>
            </div>
            <button className="ghost" onClick={() => setStep('setup')}>
              Zurück
            </button>
          </header>

          <div className="stats">
            <div>
              <strong>{grouped['move-to-archive'].length}</strong>
              <span>Archiv</span>
            </div>
            <div>
              <strong>{grouped['move-to-trash'].length}</strong>
              <span>Trash</span>
            </div>
            <div>
              <strong>{grouped.keep.length}</strong>
              <span>Keep</span>
            </div>
          </div>

          {['move-to-archive', 'move-to-trash', 'keep'].map((type) => (
            <section className="section" key={type}>
              <h2>
                {type === 'move-to-archive' && 'Archivieren'}
                {type === 'move-to-trash' && 'In den Papierkorb'}
                {type === 'keep' && 'Behalten'}
              </h2>
              {grouped[type].length ? (
                grouped[type].map((item) => (
                  <div className="item" key={item.path}>
                    <div className="item-left">
                      {item.action !== 'keep' ? (
                        <input
                          type="checkbox"
                          checked={!!selected[item.path]}
                          onChange={(event) =>
                            setSelected((prev) => ({
                              ...prev,
                              [item.path]: event.target.checked
                            }))
                          }
                        />
                      ) : (
                        <span className="pill">Keep</span>
                      )}
                      <div>
                        <div className="mono">{item.relPath || item.file}</div>
                        <div className="muted">{item.reason}</div>
                      </div>
                    </div>
                    <div className="item-actions">
                      <button
                        className="ghost"
                        onClick={() => api?.revealInFinder(item.path)}
                      >
                        Reveal
                      </button>
                      {item.action !== 'keep' ? (
                        <select
                          value={item.action}
                          onChange={(event) => updateAction(item.path, event.target.value)}
                        >
                          <option value="move-to-archive">Archive</option>
                          <option value="move-to-trash">Trash</option>
                          <option value="keep">Keep</option>
                        </select>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <p className="muted">Keine Einträge</p>
              )}
            </section>
          ))}

          <footer className="footer">
            <button className="ghost" onClick={() => setStep('setup')}>
              Abbrechen
            </button>
            <button
              className="primary"
              onClick={handleExecute}
              disabled={loading || selectedCount === 0}
            >
              {loading ? 'Ausführen…' : `Ausführen (${selectedCount})`}
            </button>
          </footer>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="card">
        <header className="header">
          <div>
            <h1>Fertig</h1>
            <p>Der Lauf wurde dokumentiert</p>
          </div>
        </header>

        <section className="section">
          <div className="summary">
            <div className="summary-row">
              <span>Archiviert</span>
              <span>{report?.summary?.archived ?? 0}</span>
            </div>
            <div className="summary-row">
              <span>Trash</span>
              <span>{report?.summary?.trashed ?? 0}</span>
            </div>
            <div className="summary-row">
              <span>Fehler</span>
              <span>{report?.summary?.failed ?? 0}</span>
            </div>
          </div>
        </section>

        <section className="section">
          <button
            className="secondary"
            onClick={() => api?.openReportFolder(report?.reportPath)}
            disabled={!report?.reportPath}
          >
            Report-Ordner öffnen
          </button>
        </section>

        <footer className="footer">
          <button className="primary" onClick={() => setStep('setup')}>
            Neuer Lauf
          </button>
        </footer>
      </div>
    </div>
  )
}
