import { Buffer } from 'buffer';
import 'expo-router/entry';
if (typeof global !== 'undefined' && !global.Buffer) {
  global.Buffer = Buffer;
}
