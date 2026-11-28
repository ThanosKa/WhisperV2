import { EventEmitter } from 'node:events';

// Internal event bus connecting the features and the window manager
const internalBridge = new EventEmitter();
export default internalBridge;
