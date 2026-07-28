import EventEmitter from 'node:events';

class Vent extends EventEmitter {}
const vent = new Vent();
export default vent;
