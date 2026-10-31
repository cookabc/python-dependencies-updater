/** Shared source is authored in the Python extension and vendored for independent builds. */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const python=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8")).name==="python-dependencies-updater";
const option=process.argv.indexOf("--peer");
const candidates=python?["042_npm-dependencies-updater","npm-dependencies-updater"]:["041_python-dependencies-updater","python-dependencies-updater"];
const peer=option>=0?path.resolve(process.argv[option+1]):candidates.map(name=>path.resolve(root,"..",name)).find(dir=>fs.existsSync(path.join(dir,"src/shared")));
if(!peer) {console.log("Shared-source check skipped: no sibling checkout. This extension builds independently.");process.exit(0);}
const source=path.join(python?root:peer,"src/shared");
const target=path.join(python?peer:root,"src/shared");
for(const file of fs.readdirSync(source).filter(file=>file.endsWith(".ts"))) {
 const expected=fs.readFileSync(path.join(source,file));
 if(process.argv.includes("--write")) {fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,file),expected);}
 else if(!fs.existsSync(path.join(target,file)) || !expected.equals(fs.readFileSync(path.join(target,file)))) throw new Error(`Shared source differs: ${file}. Run this script with --write from the Python checkout, then review both projects.`);
}
console.log("Shared sources match across both extensions.");
