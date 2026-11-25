import { Evented } from './evented';
const bcast = new Evented();
(window as any).__bcast = bcast;
export default bcast;
