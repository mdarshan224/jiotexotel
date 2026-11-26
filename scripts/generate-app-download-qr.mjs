import QRCode from 'qrcode';
import {APP_DOWNLOAD_URL} from '../lib/appDownloads.ts';
await QRCode.toFile('public/app-downloads/download-qr.png',APP_DOWNLOAD_URL,{width:320,margin:4,errorCorrectionLevel:'M',color:{dark:'#104235',light:'#ffffff'}});
