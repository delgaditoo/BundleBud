import React, { useMemo, useState, useEffect } from 'react'

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

function formatLocalTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString()
}

export default function App() {
  const api = window.api
  const [view, setView] = useState('organizer')
  const [step, setStep] = useState('setup')
  const [folderPath, setFolderPath] = useState('')
  const [scanResult, setScanResult] = useState({ files: [], totalSize: 0, truncated: false, maxFiles: 0 })
  const [analysis, setAnalysis] = useState({ runId: '', suggestions: [] })
  const [selected, setSelected] = useState({})
  const [maxSizeMB, setMaxSizeMB] = useState(DEFAULT_MAX_SIZE_MB)
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [activityEntries, setActivityEntries] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState('')
  const [watcherStatus, setWatcherStatus] = useState({ running: false })
  const [downloadsWatcherStatus, setDownloadsWatcherStatus] = useState({ running: false })
  const [watcherBusy, setWatcherBusy] = useState(false)
  const [downloadsWatcherBusy, setDownloadsWatcherBusy] = useState(false)

  const suggestions = analysis.suggestions || []

  useEffect(() => {
    if (view === 'activity') {
      loadActivity(50)
      loadWatcherStatus()
      loadDownloadsWatcherStatus()
    }
  }, [view])

  async function loadActivity(limit = 50) {
    setActivityError('')
    setActivityLoading(true)
    try {
      if (!api?.getActivity) {
        throw new Error('Activity bridge unavailable. Please restart the app.')
      }
      const entries = await api.getActivity(limit)
      setActivityEntries(Array.isArray(entries) ? entries : [])
    } catch (err) {
      setActivityError(err?.message || 'Failed to load activity.')
    } finally {
      setActivityLoading(false)
    }
  }

  async function loadWatcherStatus() {
    setWatcherBusy(true)
    try {
      if (!api?.getDesktopWatcherStatus) {
        throw new Error('Desktop watcher bridge unavailable.')
      }
      const status = await api.getDesktopWatcherStatus()
      if (typeof status?.running === 'boolean') {
        setWatcherStatus(status)
      } else {
        setWatcherStatus({ running: false })
      }
    } catch (err) {
      setActivityError(err?.message || 'Failed to load watcher status.')
    } finally {
      setWatcherBusy(false)
    }
  }

  async function loadDownloadsWatcherStatus() {
    setDownloadsWatcherBusy(true)
    try {
      if (!api?.getDownloadsWatcherStatus) {
        throw new Error('Downloads watcher bridge unavailable.')
      }
      const status = await api.getDownloadsWatcherStatus()
      if (typeof status?.running === 'boolean') {
        setDownloadsWatcherStatus(status)
      } else {
        setDownloadsWatcherStatus({ running: false })
      }
    } catch (err) {
      setActivityError(err?.message || 'Failed to load downloads watcher status.')
    } finally {
      setDownloadsWatcherBusy(false)
    }
  }

  async function handleToggleWatcher() {
    setActivityError('')
    setWatcherBusy(true)
    try {
      if (!api?.startDesktopWatcher || !api?.stopDesktopWatcher) {
        throw new Error('Desktop watcher bridge unavailable.')
      }
      if (watcherStatus.running) {
        await api.stopDesktopWatcher()
      } else {
        await api.startDesktopWatcher()
      }
      await loadWatcherStatus()
    } catch (err) {
      setActivityError(err?.message || 'Failed to toggle watcher.')
    } finally {
      setWatcherBusy(false)
    }
  }

  async function handleToggleDownloadsWatcher() {
    setActivityError('')
    setDownloadsWatcherBusy(true)
    try {
      if (!api?.startDownloadsWatcher || !api?.stopDownloadsWatcher) {
        throw new Error('Downloads watcher bridge unavailable.')
      }
      if (downloadsWatcherStatus.running) {
        await api.stopDownloadsWatcher()
      } else {
        await api.startDownloadsWatcher()
      }
      await loadDownloadsWatcherStatus()
    } catch (err) {
      setActivityError(err?.message || 'Failed to toggle downloads watcher.')
    } finally {
      setDownloadsWatcherBusy(false)
    }
  }

  async function handleAddTestActivity() {
    setActivityError('')
    setActivityLoading(true)
    try {
      await api?.addTestActivity?.()
      await loadActivity(50)
    } catch (err) {
      setActivityError(err?.message || 'Failed to add test activity.')
    } finally {
      setActivityLoading(false)
    }
  }

  async function handleClearActivity() {
    setActivityError('')
    setActivityLoading(true)
    try {
      await api?.clearActivity?.()
      await loadActivity(50)
    } catch (err) {
      setActivityError(err?.message || 'Failed to clear activity.')
    } finally {
      setActivityLoading(false)
    }
  }

  async function handleSelectFolder() {
    setError('')
    if (!api?.selectFolder || !api?.scanFiles) {
      setError('Bridge unavailable. Please restart the app.')
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
      setError(err?.message || 'Scan failed')
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
      setError(err?.message || 'Analysis failed')
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
      setError(err?.message || 'Execution failed')
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

  if (view === 'activity') {
    return (
      <div className="page">
        <div className="card">
          <header className="header">
            <div>
              <h1>Activity Ledger</h1>
              <p>Local-only flight recorder for BundleBud.</p>
            </div>
            <div className="header-actions">
              <button className="ghost" onClick={() => setView('organizer')}>
                Back to Organizer
              </button>
            </div>
          </header>

          {activityError ? <div className="error">{activityError}</div> : null}

          <section className="section watcher-panel">
            <div>
              <div className="label">Desktop Watcher</div>
              <div className="muted">Status: {watcherStatus.running ? 'Running' : 'Stopped'}</div>
            </div>
            <button
              className={watcherStatus.running ? 'ghost' : 'secondary'}
              onClick={handleToggleWatcher}
              disabled={watcherBusy}
            >
              {watcherStatus.running ? 'Off' : 'On'}
            </button>
          </section>

          <section className="section watcher-panel">
            <div>
              <div className="label">Downloads Watcher</div>
              <div className="muted">
                Status: {downloadsWatcherStatus.running ? 'Running' : 'Stopped'}
              </div>
            </div>
            <button
              className={downloadsWatcherStatus.running ? 'ghost' : 'secondary'}
              onClick={handleToggleDownloadsWatcher}
              disabled={downloadsWatcherBusy}
            >
              {downloadsWatcherStatus.running ? 'Off' : 'On'}
            </button>
          </section>

          <section className="section activity-controls">
            <button className="secondary" onClick={handleAddTestActivity} disabled={activityLoading}>
              Add test event
            </button>
            <button className="ghost" onClick={handleClearActivity} disabled={activityLoading}>
              Clear log
            </button>
            <button className="ghost" onClick={() => loadActivity(50)} disabled={activityLoading}>
              Refresh
            </button>
          </section>

          <section className="section activity-list">
            {activityLoading ? <p className="muted">Loading activity…</p> : null}
            {!activityLoading && !activityEntries.length ? (
              <p className="muted">No activity yet.</p>
            ) : null}
            {!activityLoading && activityEntries.length
              ? activityEntries
                  .slice()
                  .reverse()
                  .map((entry) => (
                    <div className="activity-entry" key={entry.id}>
                      <div>
                        <div className="activity-title">
                          <span className={`badge badge-${entry.status || 'info'}`}>
                            {entry.status || 'info'}
                          </span>
                          <span>{entry.title}</span>
                        </div>
                        {entry.path ? <div className="mono muted">{entry.path}</div> : null}
                        {entry.meta ? (
                          <div className="muted">{entry.kind} · {JSON.stringify(entry.meta)}</div>
                        ) : (
                          <div className="muted">{entry.kind}</div>
                        )}
                      </div>
                      <div className="muted">{formatLocalTime(entry.ts)}</div>
                    </div>
                  ))
              : null}
          </section>
        </div>
      </div>
    )
  }

  if (step === 'setup') {
    return (
      <div className="page">
        <div className="card">
          <header className="header">
            <div>
              <h1>AI File Organizer</h1>
              <p>Duplicate finder with a safe archive.</p>
            </div>
            <div className="header-actions">
              <button className="ghost" onClick={() => setView('activity')}>
                Activity
              </button>
              <button className="ghost" onClick={() => api?.openExternal('https://electronjs.org')}>
                Electron Docs
              </button>
            </div>
          </header>

          {error ? <div className="error">{error}</div> : null}

          <section className="section">
            <button className="primary" onClick={handleSelectFolder} disabled={loading}>
              Select folder
            </button>
            {folderPath ? (
              <div className="summary">
                <div className="summary-row">
                  <span>Folder</span>
                  <span className="mono">{folderPath}</span>
                </div>
                <div className="summary-row">
                  <span>Files found</span>
                  <span>{scanResult.files.length}</span>
                </div>
                <div className="summary-row">
                  <span>Total size</span>
                  <span>{formatBytes(scanResult.totalSize)}</span>
                </div>
                {scanResult.truncated ? (
                  <div className="summary-row">
                    <span>Note</span>
                    <span>Limit {scanResult.maxFiles} reached</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="section">
            <label className="label">Max file size for hashing (MB)</label>
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
              {loading ? 'Analyzing…' : 'Analyze duplicates'}
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
              <h1>Review suggestions</h1>
              <p>Archives duplicates, trash remains optional.</p>
            </div>
            <div className="header-actions">
              <button className="ghost" onClick={() => setStep('setup')}>
                Back
              </button>
              <button className="ghost" onClick={() => setView('activity')}>
                Activity
              </button>
            </div>
          </header>

          <div className="stats">
            <div>
              <strong>{grouped['move-to-archive'].length}</strong>
              <span>Archive</span>
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
                {type === 'move-to-archive' && 'Archive'}
                {type === 'move-to-trash' && 'Move to Trash'}
                {type === 'keep' && 'Keep'}
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
                <p className="muted">No entries</p>
              )}
            </section>
          ))}

          <footer className="footer">
            <button className="ghost" onClick={() => setStep('setup')}>
              Cancel
            </button>
            <button
              className="primary"
              onClick={handleExecute}
              disabled={loading || selectedCount === 0}
            >
              {loading ? 'Executing…' : `Execute (${selectedCount})`}
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
            <h1>Done</h1>
            <p>The run has been logged.</p>
          </div>
          <div className="header-actions">
            <button className="ghost" onClick={() => setView('activity')}>
              Activity
            </button>
          </div>
        </header>

        <section className="section">
          <div className="summary">
            <div className="summary-row">
              <span>Archived</span>
              <span>{report?.summary?.archived ?? 0}</span>
            </div>
            <div className="summary-row">
              <span>Trash</span>
              <span>{report?.summary?.trashed ?? 0}</span>
            </div>
            <div className="summary-row">
              <span>Errors</span>
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
            Open report folder
          </button>
        </section>

        <footer className="footer">
          <button className="primary" onClick={() => setStep('setup')}>
            New run
          </button>
        </footer>
      </div>
    </div>
  )
}
