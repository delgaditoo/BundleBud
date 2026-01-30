import * as screenshots from './screenshots.js';
import * as pdfs from './pdfs.js';
import * as archives from './archives.js';
import { listRules } from '../agent/automationStore.js';
import { applyUserRule } from './userRules.js';
const allRules = [screenshots, pdfs, archives];
export function getEnabledRules() {
    return allRules
        .filter((rule) => rule.enabled)
        .sort((a, b) => (a.priority || 0) - (b.priority || 0));
}
export async function applyRules(fileInfo) {
    const userRules = await listRules();
    for (const rule of userRules) {
        const match = applyUserRule(rule, fileInfo);
        if (match)
            return match;
    }
    const rules = getEnabledRules();
    for (const rule of rules) {
        if (rule.match(fileInfo)) {
            return { rule, plan: rule.plan(fileInfo) };
        }
    }
    return null;
}
