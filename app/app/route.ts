import {appDownloadRedirect} from '@/lib/appDownloadRedirect';
export function GET(request:Request){return appDownloadRedirect(request)!;}
export const HEAD=GET;
