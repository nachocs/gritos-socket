import EventEmitter from 'events';

class Vent extends EventEmitter {};
const vent = new Vent();
export default vent;
