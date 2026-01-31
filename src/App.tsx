import React, { useMemo, useState, useEffect } from 'react'
import {
  PiGauge,
  PiWrench,
  PiFolder,
  PiLightning,
  PiBroomBold,
  PiLaptop,
  PiCpu,
  PiMemory,
  PiHardDrive,
  PiDesktop,
  PiRobot,
  PiTrash
} from 'react-icons/pi'
import { buildSmartGroups } from './grouping'
import { evaluateRule, summarizeRule } from '../shared/rules'

const DEFAULT_MAX_SIZE_MB = 250
const RULE_ATTRIBUTES = [
  { value: 'name', label: 'Name' },
  { value: 'extension', label: 'Extension' },
  { value: 'kind', label: 'Kind' },
  { value: 'path', label: 'Path contains' },
  { value: 'size', label: 'Size' },
  { value: 'date-modified', label: 'Date modified' }
]
const RULE_OPERATORS = {
  name: ['contains', 'is', 'starts-with', 'ends-with', 'matches'],
  extension: ['is', 'contains', 'starts-with', 'ends-with', 'matches'],
  kind: ['is'],
  path: ['contains', 'is', 'starts-with', 'ends-with', 'matches'],
  size: ['greater-than', 'less-than'],
  'date-modified': ['before', 'after']
}
const OPERATOR_LABELS = {
  contains: 'contains',
  is: 'is',
  'starts-with': 'starts with',
  'ends-with': 'ends with',
  matches: 'matches',
  'greater-than': 'greater than',
  'less-than': 'less than',
  before: 'before',
  after: 'after'
}
const KIND_OPTIONS = [
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'pdf', label: 'PDF' },
  { value: 'document', label: 'Document' },
  { value: 'spreadsheet', label: 'Spreadsheet' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'archive', label: 'Archive' },
  { value: 'code', label: 'Code' },
  { value: 'audio', label: 'Audio' },
  { value: 'text', label: 'Text' },
  { value: 'other', label: 'Other' }
]
const SIZE_UNITS = [
  { value: 'bytes', label: 'Bytes' },
  { value: 'kb', label: 'KB' },
  { value: 'mb', label: 'MB' },
  { value: 'gb', label: 'GB' }
]

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

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      BB
    </span>
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
  const [systemInfo, setSystemInfo] = useState(null)
  const [scanConfig, setScanConfig] = useState(null)
  const [scanSets, setScanSets] = useState([])
  const [includeHidden, setIncludeHidden] = useState(false)
  const [scanScope, setScanScope] = useState('recommended')
  const [showScanDetails, setShowScanDetails] = useState(false)
  const [rules, setRules] = useState([])
  const [rulesLoading, setRulesLoading] = useState(false)
  const [rulesError, setRulesError] = useState('')
  const [selectedRuleId, setSelectedRuleId] = useState(null)
  const [rulePreview, setRulePreview] = useState({ matches: [], error: '', ran: false })
  const [archiveItems, setArchiveItems] = useState([])
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [archiveError, setArchiveError] = useState('')
  const [sandboxBusy, setSandboxBusy] = useState(false)
  const [sandboxError, setSandboxError] = useState('')
  const [settingsReady, setSettingsReady] = useState(false)
  const [createdFolders, setCreatedFolders] = useState([])
  const [createdFoldersLoading, setCreatedFoldersLoading] = useState(false)
  const [createdFoldersError, setCreatedFoldersError] = useState('')
  const [groupDetails, setGroupDetails] = useState(null)
  const [groupFiles, setGroupFiles] = useState([])
  const [groupFolderName, setGroupFolderName] = useState('')
  const [groupBasePath, setGroupBasePath] = useState('')
  const [groupResolvedPath, setGroupResolvedPath] = useState('')
  const [groupBusy, setGroupBusy] = useState(false)

  const suggestions = analysis.suggestions || []
  const smartGroups = useMemo(() => buildSmartGroups(scanResult.files || []), [scanResult.files])

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
    if (view === 'rules') {
      loadRules()
      loadAutomationMode()
    }
    if (view === 'archive') {
      loadArchive()
    }
    if (view === 'sandbox') {
      loadScanConfig()
    }
    if (view === 'settings') {
      loadScanConfig()
      loadAutomationMode()
    }
    if (view === 'folders') {
      loadCreatedFolders()
    }
    if (view === 'system') {
      loadSystemInfo()
    }
    if (view === 'organizer' && step === 'setup') {
      loadScanConfig()
    }
  }, [view])

  useEffect(() => {
    if (view === 'organizer' && step === 'setup') {
      loadScanConfig()
    }
  }, [step])

  useEffect(() => {
    if (!settingsReady || !scanConfig) return
    persistSettings().catch(() => {})
  }, [scanScope, includeHidden, maxSizeMB, scanSets, settingsReady, scanConfig])

  useEffect(() => {
    if (!groupDetails) return
    resolveGroupPath(groupBasePath, groupFolderName)
  }, [groupDetails, groupBasePath, groupFolderName])

  async function loadSystemInfo() {
    try {
      if (!api?.getSystemInfo) return
      const info = await api.getSystemInfo()
      setSystemInfo(info)
    } catch {
      setSystemInfo(null)
    }
  }

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

  async function loadRules() {
    setRulesError('')
    setRulesLoading(true)
    try {
      if (!api?.listRules) {
        throw new Error('Rules bridge unavailable. Please restart the app.')
      }
      const nextRules = await api.listRules()
      setRules(Array.isArray(nextRules) ? nextRules : [])
      if (Array.isArray(nextRules) && nextRules.length && !selectedRuleId) {
        setSelectedRuleId(nextRules[0].id)
      }
    } catch (err) {
      setRulesError(err?.message || 'Failed to load rules.')
    } finally {
      setRulesLoading(false)
    }
  }

  async function persistRules(nextRules) {
    setRules(nextRules)
    setRulesError('')
    try {
      if (!api?.saveRules) {
        throw new Error('Rules bridge unavailable. Please restart the app.')
      }
      await api.saveRules(nextRules)
    } catch (err) {
      setRulesError(err?.message || 'Failed to save rules.')
    }
  }

  async function loadScanConfig() {
    try {
      if (!api?.getScanConfig) return
      const config = await api.getScanConfig()
      setScanConfig(config)
      let settings = null
      if (api?.getSettings) {
        settings = await api.getSettings()
      }

      const defaults = (config?.sets || []).map((set) => ({
        ...set,
        enabled: set.id !== 'external' && (set.id !== 'sandbox' || config?.sandboxExists)
      }))

      let nextScope = settings?.scanScope || 'recommended'
      let nextSets = defaults

      if (nextScope === 'custom' && settings?.scanSetEnabled) {
        nextSets = defaults.map((set) => ({
          ...set,
          enabled: set.id !== 'external' && Boolean(settings.scanSetEnabled[set.id])
        }))
      }

      setScanSets(nextSets)
      setIncludeHidden(
        typeof settings?.includeHidden === 'boolean'
          ? settings.includeHidden
          : !(config?.excludeHiddenDefault ?? true)
      )
      setScanScope(nextScope)
      setMaxSizeMB(Number.isFinite(settings?.maxSizeMB) ? settings.maxSizeMB : DEFAULT_MAX_SIZE_MB)
      setShowScanDetails(false)

      if (nextScope !== 'custom') {
        applyScope(nextScope)
      }

      setSettingsReady(true)
    } catch {
      setScanConfig(null)
      setSettingsReady(false)
    }
  }

  async function persistSettings() {
    if (!api?.saveSettings || !scanConfig) return
    const scanSetEnabled = {}
    scanSets.forEach((set) => {
      scanSetEnabled[set.id] = Boolean(set.enabled)
    })
    await api.saveSettings({
      scanScope,
      includeHidden,
      maxSizeMB,
      scanSetEnabled
    })
  }

  async function loadArchive() {
    setArchiveError('')
    setArchiveLoading(true)
    try {
      if (!api?.listArchiveItems) {
        throw new Error('Archive bridge unavailable. Please restart the app.')
      }
      const items = await api.listArchiveItems()
      setArchiveItems(Array.isArray(items) ? items : [])
    } catch (err) {
      setArchiveError(err?.message || 'Failed to load archive.')
    } finally {
      setArchiveLoading(false)
    }
  }

  async function handleRestoreArchive(itemId) {
    setArchiveError('')
    try {
      if (!api?.restoreArchiveItem) {
        throw new Error('Restore bridge unavailable. Please restart the app.')
      }
      await api.restoreArchiveItem(itemId)
      await loadArchive()
      await loadActivity(50)
    } catch (err) {
      setArchiveError(err?.message || 'Failed to restore item.')
    }
  }

  async function handleCreateSandbox() {
    setSandboxError('')
    setSandboxBusy(true)
    try {
      if (!api?.createSandbox) {
        throw new Error('Sandbox bridge unavailable. Please restart the app.')
      }
      await api.createSandbox()
      await loadScanConfig()
      await loadActivity(50)
    } catch (err) {
      setSandboxError(err?.message || 'Failed to create sandbox.')
    } finally {
      setSandboxBusy(false)
    }
  }

  async function handleResetSandbox() {
    setSandboxError('')
    setSandboxBusy(true)
    try {
      if (!api?.resetSandbox) {
        throw new Error('Sandbox bridge unavailable. Please restart the app.')
      }
      await api.resetSandbox()
      await loadScanConfig()
      await loadActivity(50)
    } catch (err) {
      setSandboxError(err?.message || 'Failed to reset sandbox.')
    } finally {
      setSandboxBusy(false)
    }
  }

  async function handleOpenSandbox() {
    setSandboxError('')
    try {
      if (!api?.openSandboxFolder) {
        throw new Error('Sandbox bridge unavailable. Please restart the app.')
      }
      await api.openSandboxFolder()
    } catch (err) {
      setSandboxError(err?.message || 'Failed to open sandbox.')
    }
  }

  async function loadCreatedFolders() {
    setCreatedFoldersError('')
    setCreatedFoldersLoading(true)
    try {
      if (!api?.listCreatedFolders) {
        throw new Error('Folders bridge unavailable. Please restart the app.')
      }
      const items = await api.listCreatedFolders()
      setCreatedFolders(Array.isArray(items) ? items : [])
    } catch (err) {
      setCreatedFoldersError(err?.message || 'Failed to load folders.')
    } finally {
      setCreatedFoldersLoading(false)
    }
  }

  async function handleRenameFolder(item) {
    const nextName = window.prompt?.('Rename folder', item.displayName || '')?.trim()
    if (!nextName) return
    setCreatedFoldersError('')
    try {
      if (!api?.renameCreatedFolder) {
        throw new Error('Rename bridge unavailable. Please restart the app.')
      }
      await api.renameCreatedFolder(item.id, nextName)
      await loadCreatedFolders()
    } catch (err) {
      setCreatedFoldersError(err?.message || 'Failed to rename folder.')
    }
  }

  async function handleUpdateFolderMeta(item) {
    const nextName = window.prompt?.('Display name', item.displayName || '')?.trim()
    if (!nextName) return
    setCreatedFoldersError('')
    try {
      if (!api?.updateCreatedFolder) {
        throw new Error('Update bridge unavailable. Please restart the app.')
      }
      await api.updateCreatedFolder(item.id, { displayName: nextName, updatedAt: Date.now() })
      await loadCreatedFolders()
    } catch (err) {
      setCreatedFoldersError(err?.message || 'Failed to update metadata.')
    }
  }

  function openGroupDetails(group) {
    const defaultBase = scanConfig?.sets?.find((set) => set.id === 'documents')?.path
      || scanConfig?.sets?.find((set) => set.id === 'downloads')?.path
      || scanConfig?.sets?.[0]?.path
      || ''
    setGroupDetails(group)
    setGroupFiles(group.files || [])
    setGroupFolderName(group.title || 'Organized group')
    setGroupBasePath(defaultBase || '')
    setGroupResolvedPath('')
  }

  async function resolveGroupPath(basePath, folderName) {
    if (!api?.resolveFolderTarget || !basePath || !folderName) {
      setGroupResolvedPath('')
      return
    }
    try {
      const result = await api.resolveFolderTarget(basePath, folderName)
      setGroupResolvedPath(result?.path || '')
    } catch {
      setGroupResolvedPath('')
    }
  }

  async function handleAddFileFromDisk() {
    if (!api?.selectFile) return
    const result = await api.selectFile()
    if (result?.canceled || !result?.path) return
    const exists = groupFiles.some((file) => file.path === result.path)
    if (exists) return
    setGroupFiles((prev) => [
      ...prev,
      {
        path: result.path,
        name: result.path.split(/[/\\\\]/).pop(),
        size: 0,
        mtimeMs: Date.now()
      }
    ])
  }

  async function handlePreviewFile(file) {
    if (!api?.openPath) return
    await api.openPath(file.path)
  }

  async function handlePickGroupBase() {
    if (!api?.selectFolder) return
    const path = await api.selectFolder()
    if (!path) return
    setGroupBasePath(path)
  }

  async function handleCreateGroupPlan() {
    if (!groupDetails || !groupFiles.length) return
    let resolvedPath = groupResolvedPath
    if (!resolvedPath && api?.resolveFolderTarget) {
      const result = await api.resolveFolderTarget(groupBasePath, groupFolderName)
      resolvedPath = result?.path || ''
      setGroupResolvedPath(resolvedPath)
    }
    if (!resolvedPath) return

    setGroupBusy(true)
    try {
      const groupId = groupDetails.id || `group-${Date.now()}`
      const folderEntryId = crypto.randomUUID ? crypto.randomUUID() : `folder-${Date.now()}`
      const actions = groupFiles.map((file, index) => ({
        id: crypto.randomUUID ? crypto.randomUUID() : `action-${Date.now()}-${index}`,
        createdAt: Date.now(),
        ruleId: `smart-group:${groupId}`,
        source: 'manual',
        fromPath: file.path,
        toPath: `${resolvedPath}/${file.name || file.path.split(/[/\\\\]/).pop()}`,
        reason: `Smart group: ${groupDetails.title}`,
        sizeBytes: file.size || 0,
        status: 'queued',
        groupId,
        groupTitle: groupDetails.title,
        targetFolderPath: resolvedPath,
        createFolderEntry: index === 0,
        folderEntryId
      }))

      if (!api?.enqueueProposedActions) {
        throw new Error('Queue bridge unavailable. Please restart the app.')
      }
      await api.enqueueProposedActions(actions)

      if (automationMode === 'auto' && api?.applyProposedAction) {
        for (const action of actions) {
          await api.applyProposedAction(action.id)
        }
      }

      await loadReviewQueue()
      await loadCreatedFolders()
      setGroupDetails(null)
    } catch (err) {
      setError(err?.message || 'Failed to create group plan.')
    } finally {
      setGroupBusy(false)
    }
  }

  function createRuleId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
    return `rule-${Date.now()}-${Math.floor(Math.random() * 10000)}`
  }

  function createCondition() {
    return {
      id: createRuleId(),
      attribute: 'name',
      operator: 'contains',
      value: ''
    }
  }

  function createAction() {
    return {
      id: createRuleId(),
      type: 'move',
      targetPath: ''
    }
  }

  function createRuleTemplate() {
    return {
      id: createRuleId(),
      name: 'New rule',
      enabled: true,
      matchMode: 'all',
      conditions: [createCondition()],
      actions: [createAction()]
    }
  }

  function updateRule(ruleId, updates) {
    const nextRules = rules.map((rule) => (rule.id === ruleId ? { ...rule, ...updates } : rule))
    persistRules(nextRules)
  }

  function updateRuleCondition(ruleId, conditionId, updates) {
    const nextRules = rules.map((rule) => {
      if (rule.id !== ruleId) return rule
      return {
        ...rule,
        conditions: rule.conditions.map((condition) =>
          condition.id === conditionId ? { ...condition, ...updates } : condition
        )
      }
    })
    persistRules(nextRules)
  }

  function updateRuleAction(ruleId, actionId, updates) {
    const nextRules = rules.map((rule) => {
      if (rule.id !== ruleId) return rule
      return {
        ...rule,
        actions: rule.actions.map((action) =>
          action.id === actionId ? { ...action, ...updates } : action
        )
      }
    })
    persistRules(nextRules)
  }

  function addCondition(ruleId) {
    const nextRules = rules.map((rule) => {
      if (rule.id !== ruleId) return rule
      return {
        ...rule,
        conditions: [...rule.conditions, createCondition()]
      }
    })
    persistRules(nextRules)
  }

  function removeCondition(ruleId, conditionId) {
    const nextRules = rules.map((rule) => {
      if (rule.id !== ruleId) return rule
      const nextConditions = rule.conditions.filter((condition) => condition.id !== conditionId)
      return { ...rule, conditions: nextConditions.length ? nextConditions : [createCondition()] }
    })
    persistRules(nextRules)
  }

  function addAction(ruleId) {
    const nextRules = rules.map((rule) => {
      if (rule.id !== ruleId) return rule
      return {
        ...rule,
        actions: [...rule.actions, createAction()]
      }
    })
    persistRules(nextRules)
  }

  function removeAction(ruleId, actionId) {
    const nextRules = rules.map((rule) => {
      if (rule.id !== ruleId) return rule
      const nextActions = rule.actions.filter((action) => action.id !== actionId)
      return { ...rule, actions: nextActions.length ? nextActions : [createAction()] }
    })
    persistRules(nextRules)
  }

  function addRule() {
    const nextRule = createRuleTemplate()
    const nextRules = [nextRule, ...rules]
    setSelectedRuleId(nextRule.id)
    persistRules(nextRules)
  }

  function deleteRule(ruleId) {
    const nextRules = rules.filter((rule) => rule.id !== ruleId)
    persistRules(nextRules)
    if (selectedRuleId === ruleId) {
      setSelectedRuleId(nextRules[0]?.id || null)
    }
  }

  function reorderRules(dragId, targetId) {
    if (dragId === targetId) return
    const currentIndex = rules.findIndex((rule) => rule.id === dragId)
    const targetIndex = rules.findIndex((rule) => rule.id === targetId)
    if (currentIndex === -1 || targetIndex === -1) return
    const nextRules = [...rules]
    const [moved] = nextRules.splice(currentIndex, 1)
    nextRules.splice(targetIndex, 0, moved)
    persistRules(nextRules)
  }

  async function handlePickFolder(ruleId, actionId) {
    if (!api?.selectFolder) return
    const path = await api.selectFolder()
    if (!path) return
    updateRuleAction(ruleId, actionId, { targetPath: path })
  }

  function handlePreview(rule) {
    if (!scanResult.files.length) {
      setRulePreview({ matches: [], error: 'Run a scan first to preview this rule.', ran: true })
      return
    }
    const matches = scanResult.files
      .map((file) => {
        const result = evaluateRule({ ...rule, enabled: true }, {
          path: file.path,
          name: file.name,
          ext: file.ext,
          sizeBytes: file.size,
          mtimeMs: file.mtimeMs
        })
        return result.matches
          ? { file, reasons: result.reasons.length ? result.reasons : ['Rule matched'] }
          : null
      })
      .filter(Boolean)
    setRulePreview({ matches, error: '', ran: true })
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

  async function handleRunScanSets() {
    setError('')
    if (!api?.scanFiles) {
      setError('Bridge unavailable. Please restart the app.')
      return
    }

    const enabledSets = scanSets.filter((set) => set.enabled)
    const roots: string[] = []
    enabledSets.forEach((set) => {
      if (set.id === 'external') {
        const volumes = scanConfig?.externalVolumes || []
        volumes.forEach((volume: string) => roots.push(volume))
        return
      }
      if (set.path) roots.push(set.path)
    })

    if (!roots.length) {
      setError('Enable at least one Scan Set.')
      return
    }

    setLoading(true)
    try {
      const options = {
        excludes: scanConfig?.excludeNames || [],
        excludePaths: scanConfig?.excludePaths || [],
        excludeHidden: !includeHidden
      }
      const scans = await Promise.all(
        roots.map((root) => api.scanFiles(root, options))
      )
      const files = scans.flatMap((scan, index) =>
        (scan?.files || []).map((file: any) => ({
          ...file,
          rootPath: roots[index]
        }))
      )
      const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0)
      const truncated = scans.some((scan) => scan?.truncated)
      const maxFiles = scans.reduce((sum, scan) => sum + (scan?.maxFiles || 0), 0)
      setScanResult({ files, totalSize, truncated, maxFiles })
      setFolderPath('')
    } catch (err) {
      setError(err?.message || 'Scan failed')
    } finally {
      setLoading(false)
    }
  }

  function toggleScanSet(targetId) {
    setScanSets((prev) =>
      prev.map((set) =>
        set.id === targetId ? { ...set, enabled: !set.enabled } : set
      )
    )
  }

  function applyScope(nextScope) {
    setScanScope(nextScope)
    if (nextScope === 'desktop') {
      setScanSets((prev) =>
        prev.map((set) => ({
          ...set,
          enabled: set.id === 'desktop'
        }))
      )
      return
    }
    if (nextScope === 'all') {
      setScanSets((prev) =>
        prev.map((set) => ({
          ...set,
          enabled: set.id !== 'external' && (set.id !== 'sandbox' || scanConfig?.sandboxExists)
        }))
      )
      return
    }
    if (nextScope === 'recommended') {
      setScanSets((prev) =>
        prev.map((set) => ({
          ...set,
          enabled:
            ['desktop', 'downloads', 'pictures', 'documents'].includes(set.id) ||
            (set.id === 'sandbox' && scanConfig?.sandboxExists)
        }))
      )
      return
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
    const items = suggestions
      .filter((item) => selected[item.path] && item.action !== 'keep')
      .map((item) => ({
        ...item,
        rootPath: item.rootPath
      }))

    if (!items.length) return

    setError('')
    setLoading(true)
    try {
      const result = await api.executePlan({
        folderPath: folderPath || null,
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
  const selectedRule = useMemo(
    () => rules.find((rule) => rule.id === selectedRuleId) || null,
    [rules, selectedRuleId]
  )

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <PiGauge size={18} /> },
    { id: 'review-queue', label: 'Review Queue', icon: <PiWrench size={18} /> },
    { id: 'rules', label: 'Rules', icon: <PiLightning size={18} /> },
    { id: 'archive', label: 'Archive', icon: <PiTrash size={18} /> },
    { id: 'folders', label: 'Folders', icon: <PiFolder size={18} /> },
    { id: 'sandbox', label: 'Sandbox', icon: <PiCpu size={18} /> },
    { id: 'settings', label: 'Settings', icon: <PiDesktop size={18} /> },
    { id: 'organizer', label: 'Cleaner', icon: <PiBroomBold size={18} /> },
    { id: 'activity', label: 'Activity Ledger', icon: <PiRobot size={18} /> },
    { id: 'system', label: 'System Settings', icon: <PiLaptop size={18} /> }
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
    if (view === 'rules') {
      return {
        kicker: 'Automation',
        title: 'Rules',
        subtitle: 'Create, preview, and prioritize your rules.'
      }
    }
    if (view === 'archive') {
      return {
        kicker: 'Automation',
        title: 'Archive',
        subtitle: 'Review archived items and restore safely.'
      }
    }
    if (view === 'folders') {
      return {
        kicker: 'Automation',
        title: 'Created folders',
        subtitle: 'Folders created by BundleBud for group plans.'
      }
    }
    if (view === 'sandbox') {
      return {
        kicker: 'Automation',
        title: 'Sandbox',
        subtitle: 'Generate a safe test library for scans and rules.'
      }
    }
    if (view === 'settings') {
      return {
        kicker: 'System',
        title: 'Settings',
        subtitle: 'Scan, exclusion, automation, and advanced preferences.'
      }
    }
    if (view === 'activity') {
      return {
        kicker: 'System',
        title: 'Activity Ledger',
        subtitle: 'Local-only flight recorder for BundleBud.'
      }
    }
    if (view === 'system') {
      return {
        kicker: 'System',
        title: 'System Settings',
        subtitle: 'Hardware and storage details for this Mac.'
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
      <div className="header-text">
        <div className="app-kicker">{pageMeta.kicker}</div>
        <h1>{pageMeta.title}</h1>
        <div className="header-subrow">
          <p className="shell-subtitle">{pageMeta.subtitle}</p>
          <div className="header-actions">
            <button className="ghost small" onClick={() => api?.openExternal('https://electronjs.org')}>
              Electron Docs
            </button>
          </div>
        </div>
      </div>
    </header>
  )

  const shellNavigation = (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon">
          <BrandMark />
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

  if (view === 'rules') {
    return renderShell(
      <div className="panel">
        <div className="panel-header rules-header">
          <div>
            <h2>Rules</h2>
            <p className="muted">Create deterministic rules and preview matches before anything runs.</p>
          </div>
          <button className="secondary" onClick={addRule}>
            New rule
          </button>
        </div>

        {rulesError ? <div className="error">{rulesError}</div> : null}
        {rulesLoading ? <p className="muted">Loading rules…</p> : null}

        <div className="rules-layout">
          <div className="rules-list">
            <div className="rules-list-header">
              <span className="muted">Priority order</span>
            </div>
            {rules.length ? (
              <div className="rules-list-body">
                {rules.map((rule, index) => (
                  <div
                    key={rule.id}
                    className={`rule-row ${selectedRuleId === rule.id ? 'active' : ''}`}
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData('text/plain', rule.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault()
                      const dragId = event.dataTransfer.getData('text/plain')
                      reorderRules(dragId, rule.id)
                    }}
                  >
                    <button
                      className="rule-row-main"
                      onClick={() => {
                        setSelectedRuleId(rule.id)
                        setRulePreview({ matches: [], error: '', ran: false })
                      }}
                    >
                      <div className="rule-row-title">
                        <span>{rule.name}</span>
                        <span className="muted">#{index + 1}</span>
                      </div>
                      <div className="muted">{summarizeRule(rule)}</div>
                    </button>
                    <div className="rule-row-actions">
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={!!rule.enabled}
                          onChange={(event) => updateRule(rule.id, { enabled: event.target.checked })}
                        />
                        <span>Enabled</span>
                      </label>
                      <button className="ghost small" onClick={() => deleteRule(rule.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No rules yet. Create one to get started.</p>
            )}
          </div>

          <div className="rules-editor">
            {selectedRule ? (
              <>
                <div className="rules-editor-header">
                  <div className="rules-editor-title">Rule editor</div>
                  <div className="muted mono">{selectedRule.id}</div>
                </div>

                <section className="section">
                  <label className="label">Rule name</label>
                  <input
                    className="input"
                    value={selectedRule.name}
                    onChange={(event) => updateRule(selectedRule.id, { name: event.target.value })}
                  />
                  <label className="label">Match mode</label>
                  <select
                    value={selectedRule.matchMode}
                    onChange={(event) => updateRule(selectedRule.id, { matchMode: event.target.value })}
                  >
                    <option value="all">All conditions</option>
                    <option value="any">Any condition</option>
                    <option value="none">None of the conditions</option>
                  </select>
                </section>

                <section className="section">
                  <div className="section-header">
                    <h2>Conditions</h2>
                    <p className="muted">Attributes must match based on the selected mode.</p>
                  </div>
                  {selectedRule.conditions.map((condition) => {
                    const operatorOptions = RULE_OPERATORS[condition.attribute] || []
                    return (
                      <div className="rule-row-editor" key={condition.id}>
                        <select
                          value={condition.attribute}
                          onChange={(event) => {
                            const nextAttribute = event.target.value
                            const nextOperator = RULE_OPERATORS[nextAttribute][0]
                            const updates: any = { attribute: nextAttribute, operator: nextOperator }
                            if (nextAttribute === 'size' && !condition.unit) updates.unit = 'mb'
                            if (nextAttribute === 'kind' && !condition.value) updates.value = 'image'
                            updateRuleCondition(selectedRule.id, condition.id, updates)
                          }}
                        >
                          {RULE_ATTRIBUTES.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={condition.operator}
                          onChange={(event) =>
                            updateRuleCondition(selectedRule.id, condition.id, { operator: event.target.value })
                          }
                        >
                          {operatorOptions.map((operator) => (
                            <option key={operator} value={operator}>
                              {OPERATOR_LABELS[operator]}
                            </option>
                          ))}
                        </select>
                        {condition.attribute === 'kind' ? (
                          <select
                            value={condition.value}
                            onChange={(event) =>
                              updateRuleCondition(selectedRule.id, condition.id, { value: event.target.value })
                            }
                          >
                            {KIND_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : condition.attribute === 'date-modified' ? (
                          <input
                            type="date"
                            className="input"
                            value={condition.value}
                            onChange={(event) =>
                              updateRuleCondition(selectedRule.id, condition.id, { value: event.target.value })
                            }
                          />
                        ) : condition.attribute === 'size' ? (
                          <div className="rule-size-input">
                            <input
                              type="number"
                              min="0"
                              className="input"
                              value={condition.value}
                              onChange={(event) =>
                                updateRuleCondition(selectedRule.id, condition.id, { value: event.target.value })
                              }
                            />
                            <select
                              value={condition.unit || 'mb'}
                              onChange={(event) =>
                                updateRuleCondition(selectedRule.id, condition.id, { unit: event.target.value })
                              }
                            >
                              {SIZE_UNITS.map((unit) => (
                                <option key={unit.value} value={unit.value}>
                                  {unit.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <input
                            value={condition.value}
                            placeholder="Value"
                            className="input"
                            onChange={(event) =>
                              updateRuleCondition(selectedRule.id, condition.id, { value: event.target.value })
                            }
                          />
                        )}
                        <button className="ghost small" onClick={() => removeCondition(selectedRule.id, condition.id)}>
                          Remove
                        </button>
                      </div>
                    )
                  })}
                  <button className="ghost" onClick={() => addCondition(selectedRule.id)}>
                    Add condition
                  </button>
                </section>

                <section className="section">
                  <div className="section-header">
                    <h2>Actions</h2>
                    <p className="muted">Actions run in order. Nothing executes during preview.</p>
                  </div>
                  {selectedRule.actions.map((action) => (
                    <div className="rule-row-editor" key={action.id}>
                      <select
                        value={action.type}
                        onChange={(event) => {
                          const nextType = event.target.value
                          const updates: any = { type: nextType }
                          if (nextType === 'rename' && !action.pattern) updates.pattern = '{name}'
                          if (nextType === 'move' && !action.targetPath) updates.targetPath = ''
                          updateRuleAction(selectedRule.id, action.id, updates)
                        }}
                      >
                        <option value="move">Move to folder</option>
                        <option value="rename">Rename</option>
                        <option value="archive">Add to Archive</option>
                      </select>
                      {action.type === 'move' ? (
                        <div className="rule-action-input">
                          <input
                            value={action.targetPath}
                            placeholder="/path/to/folder"
                            className="input"
                            onChange={(event) =>
                              updateRuleAction(selectedRule.id, action.id, { targetPath: event.target.value })
                            }
                          />
                          <button className="ghost small" onClick={() => handlePickFolder(selectedRule.id, action.id)}>
                            Choose…
                          </button>
                        </div>
                      ) : null}
                      {action.type === 'rename' ? (
                        <input
                          value={action.pattern}
                          placeholder="Pattern (use {name} and {ext})"
                          className="input"
                          onChange={(event) =>
                            updateRuleAction(selectedRule.id, action.id, { pattern: event.target.value })
                          }
                        />
                      ) : null}
                      {action.type === 'archive' ? <div className="muted">Moves to your Archives folder.</div> : null}
                      <button className="ghost small" onClick={() => removeAction(selectedRule.id, action.id)}>
                        Remove
                      </button>
                    </div>
                  ))}
                  <button className="ghost" onClick={() => addAction(selectedRule.id)}>
                    Add action
                  </button>
                </section>

                <section className="section">
                  <div className="section-header">
                    <h2>Preview</h2>
                    <p className="muted">Test this rule against the latest scan results.</p>
                  </div>
                  <button className="secondary" onClick={() => handlePreview(selectedRule)}>
                    Preview rule
                  </button>
                  {rulePreview.error ? <p className="muted">{rulePreview.error}</p> : null}
                  {rulePreview.ran && !rulePreview.matches.length && !rulePreview.error ? (
                    <p className="muted">No files matched this rule.</p>
                  ) : null}
                  {rulePreview.matches.length ? (
                    <div className="preview-list">
                      {rulePreview.matches.map((match) => (
                        <div className="preview-row" key={match.file.path}>
                          <div className="mono">{match.file.relPath || match.file.name}</div>
                          <div className="muted">{match.reasons.join(' · ')}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              </>
            ) : (
              <div className="muted">Select a rule to edit, or create a new one.</div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (view === 'archive') {
    return renderShell(
      <div className="panel">
        <div className="panel-header">
          <h2>Archive</h2>
          <p className="muted">Restore safely or open archived items in Finder.</p>
        </div>

        {archiveError ? <div className="error">{archiveError}</div> : null}
        {archiveLoading ? <p className="muted">Loading archive…</p> : null}

        {archiveItems.length ? (
          <div className="archive-list">
            {archiveItems.map((item) => (
              <div className="archive-row" key={item.id}>
                <div>
                  <div className="archive-title">
                    <span className="mono">{item.fileName || 'Unknown file'}</span>
                    <span className={`status-tag ${item.status || 'archived'}`}>
                      {item.status || 'archived'}
                    </span>
                  </div>
                  <div className="archive-meta">
                    <span className="muted">From:</span>
                    <span className="mono">{shortenPath(item.fromPath)}</span>
                  </div>
                  <div className="archive-meta">
                    <span className="muted">To:</span>
                    <span className="mono">{shortenPath(item.toPath)}</span>
                  </div>
                  <div className="archive-meta">
                    <span className="muted">When:</span>
                    <span>{formatLocalTime(item.archivedAt)}</span>
                  </div>
                  <div className="archive-meta">
                    <span className="muted">Rule:</span>
                    <span className="mono">{item.ruleId || '—'}</span>
                  </div>
                </div>
                <div className="archive-actions">
                  <button className="ghost" onClick={() => api?.revealInFinder(item.toPath)}>
                    Open in Finder
                  </button>
                  <button
                    className="secondary"
                    disabled={item.status !== 'archived'}
                    onClick={() => handleRestoreArchive(item.id)}
                  >
                    Restore
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No archived items yet.</p>
        )}
      </div>
    )
  }

  if (view === 'folders') {
    return renderShell(
      <div className="panel">
        <div className="panel-header">
          <h2>Created folders</h2>
          <p className="muted">Track and manage folders created from smart group plans.</p>
        </div>

        {createdFoldersError ? <div className="error">{createdFoldersError}</div> : null}
        {createdFoldersLoading ? <p className="muted">Loading folders…</p> : null}

        {createdFolders.length ? (
          <div className="folders-list">
            {createdFolders.map((item) => (
              <div className="folder-row" key={item.id}>
                <div>
                  <div className="folder-title">{item.displayName || item.path?.split(/[/\\\\]/).pop()}</div>
                  <div className="muted mono">{shortenPath(item.path)}</div>
                  <div className="muted">{formatLocalTime(item.createdAt)}</div>
                  {item.sourceGroupTitle ? (
                    <div className="muted">Group: {item.sourceGroupTitle}</div>
                  ) : null}
                </div>
                <div className="folder-actions">
                  <button className="ghost" onClick={() => api?.revealInFinder(item.path)}>
                    Open in Finder
                  </button>
                  <button className="ghost" onClick={() => handleRenameFolder(item)}>
                    Rename
                  </button>
                  <button className="ghost" onClick={() => handleUpdateFolderMeta(item)}>
                    Edit metadata
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No folders created yet.</p>
        )}
      </div>
    )
  }

  if (view === 'sandbox') {
    const sandboxRoot = scanConfig?.sandboxRoot || '—'
    const sandboxExists = Boolean(scanConfig?.sandboxExists)

    return renderShell(
      <div className="panel">
        <div className="panel-header">
          <h2>Sandbox</h2>
          <p className="muted">Generate realistic test files without touching real folders.</p>
        </div>

        {sandboxError ? <div className="error">{sandboxError}</div> : null}

        <section className="section">
          <div className="summary">
            <div className="summary-row">
              <span>Status</span>
              <span>{sandboxExists ? 'Ready' : 'Not created'}</span>
            </div>
            <div className="summary-row">
              <span>Location</span>
              <span className="mono">{sandboxRoot}</span>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="button-row">
            <button className="secondary" onClick={handleCreateSandbox} disabled={sandboxBusy}>
              {sandboxBusy ? 'Working…' : 'Create sandbox test library'}
            </button>
            <button className="ghost" onClick={handleOpenSandbox} disabled={sandboxBusy}>
              Open sandbox folder
            </button>
            <button className="ghost" onClick={handleResetSandbox} disabled={sandboxBusy}>
              Reset / Delete sandbox
            </button>
          </div>
          <p className="muted">
            Sandbox files stay inside <span className="mono">{shortenPath(sandboxRoot)}</span>.
          </p>
        </section>
      </div>
    )
  }

  if (view === 'settings') {
    const enabledLabels = scanSets.filter((set) => set.enabled).map((set) => set.label)
    const scopeSummary = enabledLabels.length
      ? `We’ll scan ${enabledLabels.join(', ')}.`
      : 'No locations selected yet.'
    const confirmReset = () =>
      window.confirm?.('Reset settings to defaults? This will not delete data.') ?? false

    return renderShell(
      <div className="panel">
        <div className="panel-header">
          <h2>Settings</h2>
          <p className="muted">Manage scanning, exclusions, automation, and advanced options.</p>
        </div>

        <section className="section">
          <div className="panel-header">
            <h2>Scanning</h2>
            <p className="muted">Choose which folders BundleBud scans.</p>
          </div>
          <div className="scan-scope-row">
            <select value={scanScope} onChange={(event) => applyScope(event.target.value)}>
              <option value="recommended">Recommended</option>
              <option value="desktop">Desktop only</option>
              <option value="all">All standard folders</option>
              <option value="custom">Custom</option>
            </select>
            <button className="ghost" onClick={() => setShowScanDetails((prev) => !prev)}>
              {showScanDetails ? 'Hide locations' : 'Edit locations'}
            </button>
          </div>
          <div className="scan-summary">{scopeSummary}</div>
          {scanScope === 'custom' ? (
            <div className="scan-set-list">
              {scanSets.map((set) => (
                <div className="scan-set-row" key={set.id}>
                  <div>
                    <div className="scan-set-title">{set.label}</div>
                    {showScanDetails ? (
                      set.id === 'external' ? (
                        <div className="muted">
                          {(scanConfig?.externalVolumes || []).length
                            ? (scanConfig?.externalVolumes || []).join(', ')
                            : 'No external drives detected'}
                        </div>
                      ) : (
                        <div className="muted">{set.path || '—'}</div>
                      )
                    ) : null}
                  </div>
                  <button
                    className={`toggle ${set.enabled ? 'is-on' : 'is-off'}`}
                    onClick={() => toggleScanSet(set.id)}
                    disabled={loading}
                  >
                    <span className="toggle-label">{set.enabled ? 'On' : 'Off'}</span>
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="section">
          <div className="panel-header">
            <h2>Exclusions</h2>
            <p className="muted">System paths and app data are ignored.</p>
          </div>
          <div className="summary">
            <div className="summary-row">
              <span>Excluded folders</span>
              <span>System folders, hidden items, dev caches</span>
            </div>
            <div className="summary-row">
              <span>App internal data</span>
              <span>BundleBud data & reports</span>
            </div>
            {showScanDetails ? (
              <>
                <div className="summary-row">
                  <span className="muted">Excluded names</span>
                  <span className="mono">{(scanConfig?.excludeNames || []).join(', ') || '—'}</span>
                </div>
                <div className="summary-row">
                  <span className="muted">Excluded paths</span>
                  <span className="mono">{(scanConfig?.excludePaths || []).join(', ') || '—'}</span>
                </div>
              </>
            ) : null}
          </div>
        </section>

        <section className="section">
          <div className="panel-header">
            <h2>Automation</h2>
            <p className="muted">Decide how rules are applied.</p>
          </div>
          <div className="panel-row">
            <span className="muted">Current</span>
            <span className="mono">{automationMode === 'auto' ? 'Auto' : 'Review'}</span>
          </div>
          <div className="panel-row mode-row">
            <button
              className={`mode-button ${automationMode === 'auto' ? 'secondary' : 'ghost'}`}
              onClick={() => handleSetAutomationMode('auto')}
            >
              Auto
            </button>
            <button
              className={`mode-button ${automationMode === 'review' ? 'secondary' : 'ghost'}`}
              onClick={() => handleSetAutomationMode('review')}
            >
              Review
            </button>
          </div>
        </section>

        <section className="section">
          <div className="panel-header">
            <h2>Advanced</h2>
            <p className="muted">Fine-tune scanning and hashing limits.</p>
          </div>
          <div className="scan-options">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={includeHidden}
                onChange={(event) => setIncludeHidden(event.target.checked)}
              />
              Include hidden files
            </label>
          </div>
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
            className="ghost"
            onClick={async () => {
              if (!confirmReset()) return
              await api?.saveSettings?.({
                scanScope: 'recommended',
                includeHidden: !(scanConfig?.excludeHiddenDefault ?? true),
                maxSizeMB: DEFAULT_MAX_SIZE_MB,
                scanSetEnabled: {}
              })
              await loadScanConfig()
            }}
          >
            Reset to defaults
          </button>
        </section>
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
              <h2>Settings</h2>
              <p className="muted">Scan scope, exclusions, and automation.</p>
            </div>
            <div className="panel-row">
              <span>Automation</span>
              <span className="mono">{automationMode === 'auto' ? 'Auto' : 'Review'}</span>
            </div>
            <div className="panel-row">
              <span>Queued actions</span>
              <span>{reviewCount}</span>
            </div>
            <button className="ghost" onClick={() => setView('settings')}>
              Open Settings
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
            <PiLightning size={18} />
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
            className={`toggle ${watcherStatus.running ? 'is-on' : 'is-off'}`}
            onClick={handleToggleWatcher}
            disabled={watcherBusy}
          >
            <span className="toggle-label">{watcherStatus.running ? 'On' : 'Off'}</span>
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
            className={`toggle ${downloadsWatcherStatus.running ? 'is-on' : 'is-off'}`}
            onClick={handleToggleDownloadsWatcher}
            disabled={downloadsWatcherBusy}
          >
            <span className="toggle-label">{downloadsWatcherStatus.running ? 'On' : 'Off'}</span>
          </button>
        </section>

        <section className="section activity-controls">
          <div className="activity-actions-left">
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
          </div>
          <div className="activity-actions-right">
            <button className="secondary" onClick={handleClearActivity} disabled={activityLoading}>
              Clear log
            </button>
            <button className="secondary" onClick={() => loadActivity(50)} disabled={activityLoading}>
              Refresh
            </button>
          </div>
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
                    <div className="muted activity-date">{formatLocalTime(entry.ts)}</div>
                  </div>
                ))
            : null}
        </section>
      </div>
    )
  }

  if (view === 'system') {
    const systemDetails = [
      {
        icon: <PiDesktop size={20} />,
        title: 'Mac Model',
        subtitle: 'Device Information',
        items: [
          { label: 'Model', value: systemInfo?.hardware?.model || '—' },
          { label: 'Name', value: systemInfo?.hardware?.hostname || '—' }
        ]
      },
      {
        icon: <PiCpu size={20} />,
        title: 'Processor',
        subtitle: 'CPU Information',
        items: [
          { label: 'Model', value: systemInfo?.cpu?.model || '—' },
          { label: 'Cores', value: systemInfo?.cpu?.cores ? `${systemInfo.cpu.cores} cores` : '—' }
        ]
      },
      {
        icon: <PiMemory size={20} />,
        title: 'Memory',
        subtitle: 'RAM Information',
        items: [
          { label: 'Total Memory', value: systemInfo?.memory?.totalBytes ? formatBytes(systemInfo.memory.totalBytes) : '—' },
          { label: 'Type', value: 'Unified' }
        ]
      },
      {
        icon: <PiHardDrive size={20} />,
        title: 'Storage',
        subtitle: 'Disk Information',
        items: [
          { label: 'Total Space', value: systemInfo?.storage?.total ? formatBytes(systemInfo.storage.total) : '—' },
          { label: 'Available', value: systemInfo?.storage?.free ? formatBytes(systemInfo.storage.free) : '—' }
        ]
      }
    ]

    return renderShell(
      <div className="panel">
        <div className="panel-header">
          <h2>System overview</h2>
          <p className="muted">Hardware details pulled from your device.</p>
        </div>
        <div className="info-grid">
          {systemDetails.map((card) => (
            <div className="info-card" key={card.title}>
              <div className="info-card__header">
                <div className="info-icon">{card.icon}</div>
                <div>
                  <div className="info-title">{card.title}</div>
                  <div className="info-subtitle">{card.subtitle}</div>
                </div>
              </div>
              <div className="info-card__body">
                {card.items.map((item) => (
                  <div className="info-item" key={item.label}>
                    <div className="info-label">{item.label}</div>
                    <div className="info-value">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (step === 'setup') {
    const enabledLabels = scanSets.filter((set) => set.enabled).map((set) => set.label)
    const scopeSummary = enabledLabels.length
      ? `We’ll scan ${enabledLabels.join(', ')}.`
      : 'No locations selected yet.'
    const scopeLabel = {
      recommended: 'Recommended',
      desktop: 'Desktop only',
      all: 'All standard folders',
      custom: 'Custom'
    }[scanScope] || 'Recommended'

    return renderShell(
      <div className="panel">
        <div className="panel-header">
          <h2>Cleaner setup</h2>
          <p className="muted">Pick a scan scope and we’ll handle the rest.</p>
        </div>
        {error ? <div className="error">{error}</div> : null}

        <section className="section">
          <div className="summary">
            <div className="summary-row">
              <span>Scan scope</span>
              <span>{scopeLabel}</span>
            </div>
            <div className="summary-row">
              <span>Locations</span>
              <span>{enabledLabels.join(', ') || '—'}</span>
            </div>
            <div className="summary-row">
              <span>Include hidden</span>
              <span>{includeHidden ? 'Yes' : 'No'}</span>
            </div>
            <div className="summary-row">
              <span>Max hash size</span>
              <span>{maxSizeMB} MB</span>
            </div>
          </div>
          <button className="ghost" onClick={() => setView('settings')}>
            Open Settings
          </button>
        </section>

        <section className="section">
          <button className="secondary" onClick={handleRunScanSets} disabled={loading}>
            {loading ? 'Scanning…' : 'Run Scan'}
          </button>
          {scanResult.files.length ? (
            <div className="summary">
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
          <button
            className="ghost"
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

        <section className="section">
          <div className="section-header">
            <h2>Smart groups</h2>
            <p className="muted">Suggestions only — no files will be moved or renamed.</p>
          </div>
          {smartGroups.length ? (
            <div className="group-grid">
              {smartGroups.map((group) => (
                <button className="group-card" key={group.id} onClick={() => openGroupDetails(group)}>
                  <div>
                    <div className="group-title">{group.title}</div>
                    <div className="group-meta">
                      <span>{group.files.length} files</span>
                      {group.reason.map((reason) => (
                        <span key={reason}>{reason}</span>
                      ))}
                    </div>
                  </div>
                  <div className="group-body">
                    {group.files.slice(0, 3).map((file) => (
                      <div className="group-file" key={file.path}>
                        <span className="mono">{file.relPath || file.name}</span>
                        <span className="muted">
                          {formatBytes(file.size)} · {formatLocalTime(file.mtimeMs)}
                        </span>
                      </div>
                    ))}
                    {group.files.length > 3 ? (
                      <div className="group-file muted">+{group.files.length - 3} more</div>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">No smart groups suggested for this scan.</p>
          )}
        </section>

        {groupDetails ? (
          <div className="modal-scrim">
            <div className="modal-card">
              <div className="modal-header">
                <div>
                  <h2>{groupDetails.title}</h2>
                  <p className="muted">{(groupDetails.reason || []).join(' · ')}</p>
                </div>
                <button className="ghost" onClick={() => setGroupDetails(null)}>
                  Close
                </button>
              </div>

              <section className="section">
                <div className="section-header">
                  <h2>Files in group</h2>
                  <p className="muted">{groupFiles.length} files selected.</p>
                </div>
                <div className="group-file-list">
                  {groupFiles.map((file) => (
                    <div className="group-file-row" key={file.path}>
                      <div>
                        <div className="mono">{file.relPath || file.name}</div>
                        <div className="muted">{shortenPath(file.path)}</div>
                      </div>
                      <div className="group-file-actions">
                        <button className="ghost small" onClick={() => handlePreviewFile(file)}>
                          Preview
                        </button>
                        <button
                          className="ghost small"
                          onClick={() =>
                            setGroupFiles((prev) => prev.filter((entry) => entry.path !== file.path))
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="group-add-row">
                  <select
                    value=""
                    onChange={(event) => {
                      const nextPath = event.target.value
                      if (!nextPath) return
                      const nextFile = scanResult.files.find((file) => file.path === nextPath)
                      if (nextFile) {
                        setGroupFiles((prev) => [...prev, nextFile])
                      }
                      event.target.value = ''
                    }}
                  >
                    <option value="">Add from scan results…</option>
                    {scanResult.files
                      .filter((file) => !groupFiles.some((entry) => entry.path === file.path))
                      .map((file) => (
                        <option value={file.path} key={file.path}>
                          {file.relPath || file.name}
                        </option>
                      ))}
                  </select>
                  <button className="ghost" onClick={handleAddFileFromDisk}>
                    Browse file…
                  </button>
                </div>
              </section>

              <section className="section">
                <div className="section-header">
                  <h2>Destination</h2>
                  <p className="muted">Customize the folder before applying.</p>
                </div>
                <label className="label">Folder name</label>
                <input
                  className="input"
                  value={groupFolderName}
                  onChange={(event) => setGroupFolderName(event.target.value)}
                />
                <label className="label">Base location</label>
                <div className="group-destination-row">
                  <input
                    className="input"
                    value={groupBasePath}
                    onChange={(event) => setGroupBasePath(event.target.value)}
                  />
                  <button className="ghost small" onClick={handlePickGroupBase}>
                    Choose…
                  </button>
                </div>
                <div className="summary">
                  <div className="summary-row">
                    <span>Target</span>
                    <span className="mono">{groupResolvedPath || '—'}</span>
                  </div>
                  <div className="summary-row">
                    <span>Files</span>
                    <span>{groupFiles.length}</span>
                  </div>
                </div>
              </section>

              <footer className="footer">
                <button className="ghost" onClick={() => setGroupDetails(null)}>
                  Cancel
                </button>
                <button
                  className="primary"
                  onClick={handleCreateGroupPlan}
                  disabled={groupBusy || !groupFiles.length || !groupBasePath || !groupFolderName}
                >
                  {groupBusy ? 'Queuing…' : 'Create folder and move files'}
                </button>
              </footer>
            </div>
          </div>
        ) : null}

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
