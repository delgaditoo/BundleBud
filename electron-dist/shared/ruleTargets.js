import path from 'path';
import { app } from 'electron';
export function getRuleTargets() {
    return {
        screenshots: path.join(app.getPath('pictures'), 'Screenshots'),
        pdfs: path.join(app.getPath('documents'), 'PDF'),
        archives: path.join(app.getPath('documents'), 'Archives')
    };
}
