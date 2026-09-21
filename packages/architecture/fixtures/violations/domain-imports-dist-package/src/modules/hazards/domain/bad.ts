// dist-lib's entry point lives under dist/, like most real npm packages. A plain "dist"
// exclude in the cruiser options deletes this import edge and the purity rule never sees it.
import { thing } from 'dist-lib';
export const oops = thing;
