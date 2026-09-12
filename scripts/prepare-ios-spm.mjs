import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const source = 'node_modules/@capacitor-firebase/app-check';
const target = 'ios/Vendor/CapacitorFirebaseAppCheck';
const manifest = 'ios/App/CapApp-SPM/Package.swift';

rmSync(target, { recursive: true, force: true });
mkdirSync('ios/Vendor', { recursive: true });
cpSync(source, target, { recursive: true });

const current = readFileSync(manifest, 'utf8');
const original = '.package(name: "CapacitorFirebaseAppCheck", path: "../../../node_modules/@capacitor-firebase/app-check")';
const replacement = '.package(name: "CapacitorFirebaseAppCheck", path: "../../Vendor/CapacitorFirebaseAppCheck")';
if (!current.includes(original) && !current.includes(replacement)) {
  throw new Error('Unable to locate the generated Capacitor App Check package path');
}
writeFileSync(manifest, current.replace(original, replacement));
console.log('Prepared the iOS App Check package under a collision-free SwiftPM identity.');

