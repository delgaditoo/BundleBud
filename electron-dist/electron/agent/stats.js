import { listOperations } from './historyStore.js';
import { getQueuedReviewCount } from './automationStore.js';
const RECENT_LIMIT = 2000;
function getStartOfToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}
export async function getDashboardStats() {
    const entries = await listOperations(RECENT_LIMIT);
    const now = Date.now();
    const startOfToday = getStartOfToday();
    const startOf7Days = now - 7 * 24 * 60 * 60 * 1000;
    let todayActions = 0;
    let todayMovedFiles = 0;
    let todayMovedBytes = 0;
    let weekActions = 0;
    let weekMovedFiles = 0;
    let weekMovedBytes = 0;
    const topRulesMap = new Map();
    const recentActions = [];
    for (const entry of entries) {
        if (!entry)
            continue;
        const ts = Number(entry.ts) || 0;
        const type = entry?.type || 'operation';
        const sizeBytes = Number(entry?.meta?.sizeBytes) || 0;
        const isMove = type === 'move' || type === 'archive' || type === 'rename' || type === 'restore';
        const ruleId = entry?.meta?.ruleId || null;
        if (ts >= startOfToday) {
            todayActions += 1;
            if (isMove) {
                todayMovedFiles += 1;
                todayMovedBytes += sizeBytes;
            }
            if (ruleId) {
                topRulesMap.set(ruleId, (topRulesMap.get(ruleId) || 0) + 1);
            }
        }
        if (ts >= startOf7Days) {
            weekActions += 1;
            if (isMove) {
                weekMovedFiles += 1;
                weekMovedBytes += sizeBytes;
            }
        }
        recentActions.push({
            ts,
            title: type,
            status: 'info',
            from: entry?.beforePath,
            to: entry?.afterPath,
            ruleId: entry?.meta?.ruleId || undefined,
            sizeBytes,
            type
        });
    }
    recentActions.sort((a, b) => b.ts - a.ts);
    const topRulesToday = Array.from(topRulesMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([ruleId, count]) => ({ ruleId, count }));
    const queuedCount = await getQueuedReviewCount();
    return {
        today: {
            actions: todayActions,
            movedFiles: todayMovedFiles,
            movedBytes: todayMovedBytes
        },
        last7Days: {
            actions: weekActions,
            movedFiles: weekMovedFiles,
            movedBytes: weekMovedBytes
        },
        topRulesToday,
        recentActions: recentActions.slice(0, 10),
        reviewQueueCount: queuedCount,
        watcherStatus: {
            desktop: false,
            downloads: false
        }
    };
}
