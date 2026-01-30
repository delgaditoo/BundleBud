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

function shortenPath(value, maxLength = 64) {
  if (!value || value.length <= maxLength) return value || '—'
  const head = value.slice(0, Math.floor(maxLength * 0.6))
  const tail = value.slice(-Math.floor(maxLength * 0.3))
  return `${head}…${tail}`
}

function IconSparkle() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 3l1.8 4.3L18 9l-4.2 1.7L12 15l-1.8-4.3L6 9l4.2-1.7L12 3z" />
    </svg>
  )
}

function IconGauge() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 13a8 8 0 1 1 16 0" />
      <path d="M12 13l4-4" />
    </svg>
  )
}

function IconWrench() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M21 7a6 6 0 0 1-7.5 5.8L6 20l-2-2 7.2-7.5A6 6 0 0 1 17 3l-3 3 4 4 3-3z" />
    </svg>
  )
}

function IconBroom() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 19l6-6" />
      <path d="M14 3l7 7" />
      <path d="M8 15l6 6" />
    </svg>
  )
}

function IconCleaner() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 14l6-6 4 4-6 6H4z" />
      <path d="M13 7l2-2 4 4-2 2" />
      <path d="M6 20h6" />
    </svg>
  )
}

function IconFolder() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 7h6l2 2h10v10H3z" />
    </svg>
  )
}

function IconBolt() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M13 2l-9 12h7l-1 8 9-12h-7l1-8z" />
    </svg>
  )
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
  const [undoState, setUndoState] = useState({ canUndo: false, lastTitle: '' })
  const [undoBusy, setUndoBusy] = useState(false)
  const [watcherStatus, setWatcherStatus] = useState({ running: false })
  const [downloadsWatcherStatus, setDownloadsWatcherStatus] = useState({ running: false })
  const [watcherBusy, setWatcherBusy] = useState(false)
  const [downloadsWatcherBusy, setDownloadsWatcherBusy] = useState(false)
  const [dashboardStats, setDashboardStats] = useState(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [automationMode, setAutomationMode] = useState('review')
  const [reviewQueue, setReviewQueue] = useState([])
  const [reviewLoading, setReviewLoading] = useState(false)

  const suggestions = analysis.suggestions || []

  useEffect(() => {
    if (view === 'activity') {
      loadActivity(50)
      loadUndoState()
      loadWatcherStatus()
      loadDownloadsWatcherStatus()
    }
    if (view === 'dashboard') {
      loadDashboard()
      loadUndoState()
      loadAutomationMode()
    }
    if (view === 'review-queue') {
      loadReviewQueue()
      loadAutomationMode()
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

  async function loadUndoState() {
    try {
      if (!api?.canUndo) {
        setUndoState({ canUndo: false, lastTitle: '' })
        return
      }
      const result = await api.canUndo()
      setUndoState({
        canUndo: Boolean(result?.canUndo),
        lastTitle: result?.lastTitle || ''
      })
    } catch (err) {
      setUndoState({ canUndo: false, lastTitle: '' })
    }
  }

  async function loadDashboard() {
    setDashboardLoading(true)
    try {
      if (!api?.getDashboardStats) {
        throw new Error('Dashboard bridge unavailable.')
      }
      const stats = await api.getDashboardStats()
      setDashboardStats(stats)
    } catch (err) {
      setActivityError(err?.message || 'Failed to load dashboard.')
    } finally {
      setDashboardLoading(false)
    }
  }

  async function loadAutomationMode() {
    try {
      if (!api?.getAutomationMode) return
      const result = await api.getAutomationMode()
      setAutomationMode(result?.mode === 'auto' ? 'auto' : 'review')
    } catch {
      setAutomationMode('review')
    }
  }

  async function handleSetAutomationMode(mode) {
    const nextMode = mode === 'auto' ? 'auto' : 'review'
    const previousMode = automationMode
    setAutomationMode(nextMode)
    try {
      if (!api?.setAutomationMode) {
        throw new Error('Automation bridge unavailable. Please restart the app.')
      }
      const result = await api.setAutomationMode(mode)
      setAutomationMode(result?.mode === 'auto' ? 'auto' : 'review')
      await loadDashboard()
      await loadReviewQueue()
    } catch (err) {
      setAutomationMode(previousMode)
      setActivityError(err?.message || 'Failed to update automation mode.')
    }
  }

  async function loadReviewQueue() {
    setReviewLoading(true)
    try {
      if (!api?.listReviewQueue) {
        throw new Error('Review queue bridge unavailable.')
      }
      const items = await api.listReviewQueue()
      setReviewQueue(Array.isArray(items) ? items : [])
    } catch (err) {
      setActivityError(err?.message || 'Failed to load review queue.')
    } finally {
      setReviewLoading(false)
    }
  }

  async function handleApplyAction(actionId) {
    try {
      await api?.applyProposedAction?.(actionId)
      await loadReviewQueue()
      await loadDashboard()
    } catch (err) {
      setActivityError(err?.message || 'Failed to apply action.')
    }
  }

  async function handleRejectAction(actionId) {
    try {
      await api?.rejectProposedAction?.(actionId)
      await loadReviewQueue()
      await loadDashboard()
    } catch (err) {
      setActivityError(err?.message || 'Failed to reject action.')
    }
  }

  async function handleUndo() {
    setActivityError('')
    setUndoBusy(true)
    try {
      if (!api?.undoLastMove) {
        throw new Error('Undo bridge unavailable.')
      }
      await api.undoLastMove()
      await loadActivity(50)
      await loadUndoState()
      await loadDashboard()
    } catch (err) {
      setActivityError(err?.message || 'Failed to undo last move.')
    } finally {
      setUndoBusy(false)
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

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <IconGauge /> },
    { id: 'review-queue', label: 'Review Queue', icon: <IconWrench /> },
    { id: 'organizer', label: 'Cleaner', icon: <IconCleaner /> },
    { id: 'activity', label: 'Activity Ledger', icon: <IconFolder /> }
  ]

  const pageMeta = (() => {
    if (view === 'dashboard') {
      return {
        kicker: 'BundleBud',
        title: (
          <>
            Good to see you, <span>BundleBud</span>
          </>
        ),
        subtitle: 'Quick insights from your recent activity and automations.'
      }
    }
    if (view === 'review-queue') {
      return {
        kicker: 'Automation',
        title: 'Review Queue',
        subtitle: 'Proposed actions waiting for approval.'
      }
    }
    if (view === 'activity') {
      return {
        kicker: 'System',
        title: 'Activity Ledger',
        subtitle: 'Local-only flight recorder for BundleBud.'
      }
    }
    if (step === 'review') {
      return {
        kicker: 'Cleaner',
        title: 'Review suggestions',
        subtitle: 'Archive duplicates, trash remains optional.'
      }
    }
    if (step === 'done') {
      return {
        kicker: 'Cleaner',
        title: 'Run summary',
        subtitle: 'Review the results and open the report folder.'
      }
    }
    return {
      kicker: 'Cleaner',
      title: 'Cleaner',
      subtitle: 'Duplicate finder with a safe archive.'
    }
  })()

  const shellHeader = (
    <header className="shell-header">
      <div>
        <div className="app-kicker">{pageMeta.kicker}</div>
        <h1>{pageMeta.title}</h1>
        <p className="shell-subtitle">{pageMeta.subtitle}</p>
      </div>
      <div className="header-actions">
        <button className="ghost" onClick={() => api?.openExternal('https://electronjs.org')}>
          Electron Docs
        </button>
      </div>
    </header>
  )

  const shellNavigation = (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon">
          <IconSparkle />
        </div>
        <div className="brand-title">BundleBud</div>
        <span className="brand-badge">Beta</span>
      </div>
      <nav className="nav-list">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-button ${view === item.id ? 'active' : ''}`}
            onClick={() => setView(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="status-pill">Local-only</div>
        <div className="status-muted">v2.9.0</div>
      </div>
    </aside>
  )

  const renderShell = (content) => (
    <div className="app-frame">
      <div className="app-shell">
        {shellNavigation}
        <main className="shell-main">
          {shellHeader}
          <div className="main-content">{content}</div>
        </main>
      </div>
    </div>
  )

  if (view === 'review-queue') {
    return renderShell(
      <div className="panel">
        <div className="panel-header">
          <h2>Pending approvals</h2>
          <p className="muted">Approve, reject, or review queued actions.</p>
        </div>

        {activityError ? <div className="error">{activityError}</div> : null}

        {reviewLoading ? <p className="muted">Loading review queue…</p> : null}

        {reviewQueue.length ? (
          <div className="review-list">
            {reviewQueue
              .filter((item) => item.status === 'queued')
              .map((item) => (
                <div className="review-row" key={item.id}>
                  <div>
                    <div className="review-title">
                      <span className="mono">{item.ruleId}</span>
                      <span className="muted">{formatLocalTime(item.createdAt)}</span>
                    </div>
                    <div className="mono">{shortenPath(item.fromPath)} → {shortenPath(item.toPath)}</div>
                    <div className="muted">{item.reason}</div>
                  </div>
                  <div className="review-actions">
                    <button className="secondary" onClick={() => handleApplyAction(item.id)}>
                      Apply
                    </button>
                    <button className="ghost" onClick={() => handleRejectAction(item.id)}>
                      Reject
                    </button>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p className="muted">No queued actions.</p>
        )}
      </div>
    )
  }

  if (view === 'dashboard') {
    const today = dashboardStats?.today || { actions: 0, movedFiles: 0, movedBytes: 0 }
    const last7Days = dashboardStats?.last7Days || { actions: 0, movedFiles: 0, movedBytes: 0 }
    const topRules = dashboardStats?.topRulesToday || []
    const recentActions = dashboardStats?.recentActions || []
    const watcher = dashboardStats?.watcherStatus || { desktop: false, downloads: false }
    const reviewCount = dashboardStats?.reviewQueueCount || 0

    return renderShell(
      <>
        {activityError ? <div className="error">{activityError}</div> : null}

        {dashboardLoading ? <p className="muted">Loading dashboard…</p> : null}

        <section className="stat-grid">
          <div className="stat-card">
            <div className="stat-title">Today</div>
            <div className="stat-label">Actions</div>
            <div className="stat-value">{today.actions}</div>
          </div>
          <div className="stat-card">
            <div className="stat-title">Today</div>
            <div className="stat-label">Files moved</div>
            <div className="stat-value">{today.movedFiles}</div>
          </div>
          <div className="stat-card">
            <div className="stat-title">Today</div>
            <div className="stat-label">Space organized</div>
            <div className="stat-value">{formatBytes(today.movedBytes)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-title">Last 7 days</div>
            <div className="stat-label">Actions</div>
            <div className="stat-value">{last7Days.actions}</div>
          </div>
          <div className="stat-card">
            <div className="stat-title">Last 7 days</div>
            <div className="stat-label">Files moved</div>
            <div className="stat-value">{last7Days.movedFiles}</div>
          </div>
          <div className="stat-card">
            <div className="stat-title">Last 7 days</div>
            <div className="stat-label">Space organized</div>
            <div className="stat-value">{formatBytes(last7Days.movedBytes)}</div>
          </div>
        </section>

        <section className="panel-grid">
          <div className="panel">
            <div className="panel-header">
              <h2>Automation mode</h2>
              <p className="muted">Decide how rules are applied.</p>
            </div>
            <div className="panel-row">
              <span className="muted">Current</span>
              <span className="mono">{automationMode === 'auto' ? 'Auto' : 'Review'}</span>
            </div>
            <div className="panel-row">
              <button
                className={automationMode === 'auto' ? 'secondary' : 'ghost'}
                onClick={() => handleSetAutomationMode('auto')}
              >
                Auto
              </button>
              <button
                className={automationMode === 'review' ? 'secondary' : 'ghost'}
                onClick={() => handleSetAutomationMode('review')}
              >
                Review
              </button>
            </div>
            <div className="panel-row">
              <span>Queued actions</span>
              <span>{reviewCount}</span>
            </div>
            <button className="ghost" onClick={() => setView('review-queue')}>
              Open Review Queue
            </button>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Watchers</h2>
              <p className="muted">Background folders monitored.</p>
            </div>
            <div className="panel-list">
              <div className="panel-row">
                <span>Desktop</span>
                <span className={watcher.desktop ? 'status-on' : 'status-off'}>
                  {watcher.desktop ? 'ON' : 'OFF'}
                </span>
              </div>
              <div className="panel-row">
                <span>Downloads</span>
                <span className={watcher.downloads ? 'status-on' : 'status-off'}>
                  {watcher.downloads ? 'ON' : 'OFF'}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Top rules today</h2>
            <p className="muted">Most active automation rules.</p>
          </div>
          {topRules.length ? (
            <div className="panel-list">
              {topRules.map((item) => (
                <div className="panel-row" key={item.ruleId}>
                  <span className="mono">{item.ruleId}</span>
                  <span>{item.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No rules triggered yet.</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Recent activity</h2>
            <p className="muted">Latest actions taken by BundleBud.</p>
          </div>
          {recentActions.length ? (
            <div className="panel-list">
              {recentActions.map((entry) => (
                <div className="panel-row panel-row-stacked" key={`${entry.ts}-${entry.from || ''}`}>
                  <div className="row-top">
                    <span className={`badge badge-${entry.status || 'info'}`}>
                      {entry.status || 'info'}
                    </span>
                    <span className="mono">{entry.ruleId || '—'}</span>
                    <span className="muted">{formatLocalTime(entry.ts)}</span>
                  </div>
                  <div className="row-bottom mono">
                    {entry.from
                      ? `${shortenPath(entry.from)} → ${shortenPath(entry.to)}`
                      : entry.title}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No recent actions.</p>
          )}
        </section>

        <div className="callout">
          <div className="callout-icon">
            <IconBolt />
          </div>
          <div>
            <div className="callout-title">Queued actions ready</div>
            <div className="callout-sub">
              {reviewCount} items waiting for review and approval.
            </div>
          </div>
          <button className="ghost" onClick={() => setView('review-queue')}>
            Review queue
          </button>
        </div>

        <footer className="footer">
          <button className="ghost" onClick={() => setView('activity')}>
            Open Activity Ledger
          </button>
          <button
            className="secondary"
            onClick={handleUndo}
            disabled={undoBusy || !undoState.canUndo}
          >
            Undo last move
          </button>
        </footer>
      </>
    )
  }

  if (view === 'activity') {
    return renderShell(
      <div className="panel">
        <div className="panel-header">
          <h2>Watcher status</h2>
          <p className="muted">Toggle background monitoring and review logs.</p>
        </div>
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
          <button
            className="secondary"
            onClick={handleUndo}
            disabled={undoBusy || !undoState.canUndo}
          >
            Undo last move
          </button>
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
    )
  }

  if (step === 'setup') {
    return renderShell(
      <div className="panel">
        <div className="panel-header">
          <h2>Cleaner setup</h2>
          <p className="muted">Choose a folder to scan for duplicates.</p>
        </div>
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
    )
  }

  if (step === 'review') {
    return renderShell(
      <div className="panel">
        <div className="panel-header">
          <h2>Review suggestions</h2>
          <p className="muted">Archive duplicates, trash remains optional.</p>
        </div>
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
    )
  }

  return renderShell(
    <div className="panel">
      <div className="panel-header">
        <h2>Run summary</h2>
        <p className="muted">The run has been logged for future reference.</p>
      </div>
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
  )
}
