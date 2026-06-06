#!/usr/bin/env bun
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const electronVersion = Bun.env.OPENCODE_ELECTRON_VERSION ?? "40.2.0"
const electronDist = Bun.env.OPENCODE_ELECTRON_DIST ? normalizeElectronDist(Bun.env.OPENCODE_ELECTRON_DIST) : undefined
const env = {
  ...Object.fromEntries(Object.entries(Bun.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
  OPENCODE_DESKTOP_WIN7: "1",
  OPENCODE_CHANNEL: Bun.env.OPENCODE_CHANNEL ?? "prod",
  OPENCODE_ELECTRON_VERSION: electronVersion,
  ...(electronDist ? { OPENCODE_ELECTRON_DIST: electronDist } : {}),
}

if (!electronDist) {
  console.warn("OPENCODE_ELECTRON_DIST is not set; packaging with official Electron, not a Win7-patched runtime.")
}

console.log(`Packaging experimental Win7 desktop build with Electron ${electronVersion}`)
if (electronDist) console.log(`Using Electron dist: ${electronDist}`)

const exitCode = await Bun.spawn({
  cmd: [process.execPath, "x", "electron-builder", "--win", "--x64", "--dir", "--config", "electron-builder.config.ts"],
  env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
}).exited

if (exitCode !== 0) process.exit(exitCode)

await patchWin7Asar()
await verifyWin7Package()
process.exit(0)

function normalizeElectronDist(input: string) {
  const dir = path.resolve(input)
  if (!existsSync(path.join(dir, "version"))) throw new Error(`Electron dist is missing version file: ${dir}`)
  if (existsSync(path.join(dir, "electron.exe"))) return dir
  if (!existsSync(path.join(dir, "OpenCode.exe"))) {
    throw new Error(`Electron dist must contain electron.exe or OpenCode.exe: ${dir}`)
  }

  const staged = mkdtempSync(path.join(tmpdir(), "opencode-win7-electron-"))
  cpSync(dir, staged, { recursive: true })
  renameSync(path.join(staged, "OpenCode.exe"), path.join(staged, "electron.exe"))
  return staged
}

async function patchWin7Asar() {
  const resources = path.resolve("dist/win7/win-unpacked/resources")
  const archive = path.join(resources, "app.asar")
  const unpacked = path.join(resources, "app.asar.unpacked")
  if (!existsSync(archive)) throw new Error(`Packaged app.asar not found: ${archive}`)
  if (!existsSync(unpacked)) throw new Error(`Packaged app.asar.unpacked not found: ${unpacked}`)

  const work = mkdtempSync(path.join(tmpdir(), "opencode-win7-asar-"))
  const source = path.join(work, "source")
  const output = path.join(work, "output", "app.asar")
  mkdirSync(path.dirname(output), { recursive: true })

  await run(["node", asarBin(), "extract", archive, source])

  for (const item of [
    ["@lydell", "node-pty-win32-x64"],
    ["@msgpackr-extract", "msgpackr-extract-win32-x64"],
    ["@parcel", "watcher-win32-x64"],
  ]) {
    copyPackageToAsarSource(source, unpacked, item[0], item[1])
  }

  await run(["node", asarBin(), "pack", source, output, "--unpack", "**/*.{node,dll,exe}"])
  cpSync(output, archive)
  rmSync(unpacked, { recursive: true, force: true })
  cpSync(`${output}.unpacked`, unpacked, { recursive: true })
  rmSync(work, { recursive: true, force: true })
  console.log("Patched app.asar with Win32 native package entries")
}

function copyPackageToAsarSource(source: string, unpacked: string, scope: string, name: string) {
  const from = path.join(unpacked, "node_modules", scope, name)
  if (!existsSync(from)) throw new Error(`Expected Win32 package not found in app.asar.unpacked: ${from}`)

  const to = path.join(source, "node_modules", scope, name)
  rmSync(to, { recursive: true, force: true })
  mkdirSync(path.dirname(to), { recursive: true })
  cpSync(from, to, { recursive: true })
}

function asarBin() {
  return path.resolve("../../node_modules/.bun/@electron+asar@3.4.1/node_modules/@electron/asar/bin/asar.js")
}

async function run(cmd: string[]) {
  const result = await Bun.spawn({ cmd, stdin: "inherit", stdout: "inherit", stderr: "inherit" }).exited
  if (result !== 0) throw new Error(`Command failed: ${cmd.join(" ")}`)
}

async function verifyWin7Package() {
  const app = path.resolve("dist/win7/win-unpacked")
  const resources = path.join(app, "resources")
  const archive = path.join(resources, "app.asar")
  const unpacked = path.join(resources, "app.asar.unpacked")
  const exe = path.join(app, "OpenCode.exe")

  for (const file of [
    exe,
    archive,
    path.join(app, "libEGL.dll"),
    path.join(app, "libGLESv2.dll"),
    path.join(app, "ffmpeg.dll"),
    path.join(app, "version"),
  ]) {
    if (!existsSync(file)) throw new Error(`Win7 package verification failed; missing ${file}`)
  }

  const header = await readPeVersions(exe)
  if (header.os !== "5.2" || header.subsystem !== "5.2") {
    throw new Error(`Win7 package verification failed; OpenCode.exe is PE os=${header.os} subsystem=${header.subsystem}`)
  }

  const imports = await readPeImports(exe)
  for (const item of ["GetSystemTimePreciseAsFileTime", "CreateFile2", "CreatePseudoConsole"]) {
    if (imports.functions.has(item)) throw new Error(`Win7 package verification failed; OpenCode.exe imports ${item}`)
  }
  for (const item of imports.dlls) {
    if (item.toLowerCase().startsWith("api-ms-win-core-winrt-error")) {
      throw new Error(`Win7 package verification failed; OpenCode.exe imports ${item}`)
    }
  }

  const asarEntries = await asarList(archive)
  for (const item of [
    "/node_modules/@lydell/node-pty-win32-x64/package.json",
    "/node_modules/@lydell/node-pty-win32-x64/lib/index.js",
    "/node_modules/@msgpackr-extract/msgpackr-extract-win32-x64/package.json",
    "/node_modules/@parcel/watcher-win32-x64/package.json",
    "/out/main/index.js",
    "/out/main/sidecar.js",
  ]) {
    if (!asarEntries.has(item)) throw new Error(`Win7 package verification failed; app.asar is missing ${item}`)
  }

  for (const file of [
    path.join(unpacked, "node_modules/@lydell/node-pty-win32-x64/prebuilds/win32-x64/conpty.node"),
    path.join(unpacked, "node_modules/@lydell/node-pty-win32-x64/prebuilds/win32-x64/conpty_console_list.node"),
    path.join(unpacked, "node_modules/@lydell/node-pty-win32-x64/prebuilds/win32-x64/conpty/conpty.dll"),
    path.join(unpacked, "node_modules/@lydell/node-pty-win32-x64/prebuilds/win32-x64/conpty/OpenConsole.exe"),
    path.join(unpacked, "node_modules/@msgpackr-extract/msgpackr-extract-win32-x64/node.napi.node"),
    path.join(unpacked, "node_modules/@parcel/watcher-win32-x64/watcher.node"),
  ]) {
    if (!existsSync(file)) throw new Error(`Win7 package verification failed; native file is missing ${file}`)
  }

  const sidecar = await readJavaScriptFiles(path.resolve("out/main"))
  for (const item of ["node-pty-linux-x64", "node-pty-darwin"]) {
    if (sidecar.includes(item)) throw new Error(`Win7 package verification failed; sidecar references ${item}`)
  }
  if (!sidecar.includes("node-pty-win32-x64")) {
    throw new Error("Win7 package verification failed; sidecar does not reference node-pty-win32-x64")
  }

  console.log(`Verified Win7 desktop package at ${app}`)
}

async function asarList(archive: string) {
  const proc = Bun.spawn({
    cmd: ["node", asarBin(), "list", archive],
    stdout: "pipe",
    stderr: "inherit",
  })
  const output = await new Response(proc.stdout).text()
  const result = await proc.exited
  if (result !== 0) throw new Error(`Command failed: node ${asarBin()} list ${archive}`)
  return new Set(output.trim().split("\n").filter(Boolean))
}

async function readPeVersions(file: string) {
  const view = new DataView(await Bun.file(file).arrayBuffer())
  const peOffset = view.getUint32(0x3c, true)
  const optionalHeader = peOffset + 24
  return {
    os: `${view.getUint16(optionalHeader + 40, true)}.${view.getUint16(optionalHeader + 42, true)}`,
    subsystem: `${view.getUint16(optionalHeader + 48, true)}.${view.getUint16(optionalHeader + 50, true)}`,
  }
}

async function readPeImports(file: string) {
  const view = new DataView(await Bun.file(file).arrayBuffer())
  const peOffset = view.getUint32(0x3c, true)
  const sections = view.getUint16(peOffset + 6, true)
  const optionalHeader = peOffset + 24
  const optionalHeaderSize = view.getUint16(peOffset + 20, true)
  const magic = view.getUint16(optionalHeader, true)
  const dataDirectories = optionalHeader + (magic === 0x20b ? 112 : 96)
  const importRva = view.getUint32(dataDirectories + 8, true)
  const sectionTable = optionalHeader + optionalHeaderSize
  const dlls = new Set<string>()
  const functions = new Set<string>()

  if (importRva === 0) return { dlls, functions }

  const rvaToOffset = (rva: number) => {
    for (let i = 0; i < sections; i++) {
      const section = sectionTable + i * 40
      const virtualSize = view.getUint32(section + 8, true)
      const virtualAddress = view.getUint32(section + 12, true)
      const rawSize = view.getUint32(section + 16, true)
      const rawPointer = view.getUint32(section + 20, true)
      const size = Math.max(virtualSize, rawSize)
      if (rva >= virtualAddress && rva < virtualAddress + size) return rawPointer + (rva - virtualAddress)
    }
    throw new Error(`RVA 0x${rva.toString(16)} is outside PE sections`)
  }

  const readString = (offset: number) => {
    const bytes: number[] = []
    for (let i = offset; i < view.byteLength; i++) {
      const byte = view.getUint8(i)
      if (byte === 0) break
      bytes.push(byte)
    }
    return new TextDecoder("ascii").decode(new Uint8Array(bytes))
  }

  for (let descriptor = rvaToOffset(importRva); descriptor + 20 <= view.byteLength; descriptor += 20) {
    const originalFirstThunk = view.getUint32(descriptor, true)
    const nameRva = view.getUint32(descriptor + 12, true)
    const firstThunk = view.getUint32(descriptor + 16, true)
    if (originalFirstThunk === 0 && nameRva === 0 && firstThunk === 0) break

    dlls.add(readString(rvaToOffset(nameRva)))
    const thunkOffset = rvaToOffset(originalFirstThunk || firstThunk)
    for (let thunk = thunkOffset; thunk + 8 <= view.byteLength; thunk += 8) {
      const value = magic === 0x20b ? view.getBigUint64(thunk, true) : BigInt(view.getUint32(thunk, true))
      if (value === 0n) break
      const ordinalFlag = magic === 0x20b ? 0x8000000000000000n : 0x80000000n
      if ((value & ordinalFlag) !== 0n) continue
      functions.add(readString(rvaToOffset(Number(value)) + 2))
    }
  }

  return { dlls, functions }
}

async function readJavaScriptFiles(dir: string): Promise<string> {
  const chunks = await Promise.all(
    readdirSync(dir).map(async (entry) => {
      const file = path.join(dir, entry)
      if (statSync(file).isDirectory()) return readJavaScriptFiles(file)
      if (!file.endsWith(".js")) return ""
      return Bun.file(file).text()
    }),
  )
  return chunks.join("\n")
}
