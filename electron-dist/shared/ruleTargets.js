import path from 'path';
import * as electron from 'electron';
const electronModule = electron.default ?? electron;
const { app } = electronModule;
export function getRuleTargets() {
    return {
        screenshots: path.join(app.getPath('pictures'), 'Screenshots'),
        pdfs: path.join(app.getPath('documents'), 'PDF'),
        archives: path.join(app.getPath('documents'), 'Archives')
    };
}
