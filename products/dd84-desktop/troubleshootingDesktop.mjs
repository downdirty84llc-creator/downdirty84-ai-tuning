import {mountTroubleshooting} from './troubleshootingUI.mjs';
import {saveJson} from './saveFileUI.mjs';
mountTroubleshooting(document.getElementById('troubleshooting-root'),{save:saveJson});
