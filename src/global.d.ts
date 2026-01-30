export {}

declare global {
  interface Window {
    api?: {
      selectFolder: () => Promise<string | null>
      scanFiles: (folderPath: string, options?: Record<string, unknown>) => Promise<any>
      analyzeDuplicates: (files: any[], options?: Record<string, unknown>) => Promise<any>
      executePlan: (plan: any) => Promise<any>
      revealInFinder: (targetPath: string) => Promise<any>
      openExternal: (url: string) => Promise<any>
      openReportFolder: (reportPath: string) => Promise<any>
      getActivity: (limit?: number) => Promise<any[]>
      clearActivity: () => Promise<boolean>
      addTestActivity: () => Promise<any>
      canUndo: () => Promise<{ canUndo: boolean; lastTitle?: string }>
      undoLastMove: () => Promise<{ ok: boolean; error?: string | null }>
      getDashboardStats: () => Promise<any>
      getAutomationMode: () => Promise<{ mode: 'auto' | 'review' }>
      setAutomationMode: (mode: 'auto' | 'review') => Promise<{ mode: 'auto' | 'review' }>
      listReviewQueue: () => Promise<any[]>
      listRules: () => Promise<any[]>
      saveRules: (rules: any[]) => Promise<any[]>
      getSettings: () => Promise<any>
      saveSettings: (settings: any) => Promise<any>
      listArchiveItems: () => Promise<any[]>
      restoreArchiveItem: (itemId: string) => Promise<any>
      applyProposedAction: (actionId: string) => Promise<any>
      rejectProposedAction: (actionId: string) => Promise<any>
      startDesktopWatcher: () => Promise<{ running: boolean }>
      stopDesktopWatcher: () => Promise<{ running: boolean }>
      getDesktopWatcherStatus: () => Promise<{ running: boolean }>
      startDownloadsWatcher: () => Promise<{ running: boolean }>
      stopDownloadsWatcher: () => Promise<{ running: boolean }>
      getDownloadsWatcherStatus: () => Promise<{ running: boolean }>
      getSystemInfo: () => Promise<any>
      getScanConfig: () => Promise<any>
      createSandbox: () => Promise<{ ok: boolean; root?: string; error?: string | null }>
      resetSandbox: () => Promise<{ ok: boolean; root?: string; error?: string | null }>
      openSandboxFolder: () => Promise<{ ok: boolean; root?: string; error?: string | null }>
    }
  }
}
