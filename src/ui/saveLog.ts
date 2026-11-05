import { buildLogFile, logEvent, logFileName } from '../lib/activityLog';
import { logHeader } from '../logHooks';
import { downloadFile } from './download';

/** Save the activity log as a JSON file (the browser's download) */
export function saveLog(hidePositions = false): void {
    logEvent('log', `Activity log saved${hidePositions ? ' (positions hidden)' : ''}`);
    downloadFile(buildLogFile(logHeader(), { hidePositions }), 'application/json', logFileName());
}
