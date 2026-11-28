// src/bridge/internalBridge.js
import { EventEmitter } from 'events';

// Internal event bus connecting FeatureCore and WindowCore
const internalBridge = new EventEmitter();
export default internalBridge;

// Example event
// internalBridge.on('content-protection-changed', (enabled) => {
//   // Handle in windowManager
// });
